import { describe, it, expect, vi } from 'vitest';
import {
  getContextualStarters,
  isBlankOrInternalPage,
  BLANK_PAGE_STARTERS,
  generateSmartStartersWithLLM,
} from '../../src/sidepanel/starters';
import * as client from '../../src/background/llm/client';

describe('Contextual Starters Engine', () => {
  it('detects blank and internal browser URLs', () => {
    expect(isBlankOrInternalPage(undefined)).toBe(true);
    expect(isBlankOrInternalPage(null)).toBe(true);
    expect(isBlankOrInternalPage('')).toBe(true);
    expect(isBlankOrInternalPage('about:blank')).toBe(true);
    expect(isBlankOrInternalPage('chrome://newtab')).toBe(true);
    expect(isBlankOrInternalPage('chrome-extension://xyz/options.html')).toBe(true);
    expect(isBlankOrInternalPage('edge://settings')).toBe(true);
    expect(isBlankOrInternalPage('brave://flags')).toBe(true);
    expect(isBlankOrInternalPage('https://google.com')).toBe(false);
  });

  it('returns exactly 3 standard blank page starters on blank/internal tabs', () => {
    const blank1 = getContextualStarters(null);
    expect(blank1).toHaveLength(3);
    expect(blank1).toEqual(BLANK_PAGE_STARTERS);
    expect(blank1[0].label).toBe('Explore & Research');
    expect(blank1[1].label).toBe('Help Me Fill Form');
    expect(blank1[2].label).toBe('Find & Compare');
  });

  it('returns tailored consumer finance/market prompts on financial portals like Moneycontrol', () => {
    const moneycontrol = getContextualStarters(
      'https://www.moneycontrol.com/news/business/markets/',
      'Business News: Stock and Share Market News, Economy...',
    );
    expect(moneycontrol).toHaveLength(3);
    expect(moneycontrol[0].label).toBe('Market Highlights');
    expect(moneycontrol[1].label).toBe('Top Stock Movers');
    expect(moneycontrol[2].label).toBe('Analyst Sentiment');

    // Asserts no developer jargon
    for (const starter of moneycontrol) {
      expect(starter.prompt.toLowerCase()).not.toContain('markdown table');
      expect(starter.prompt.toLowerCase()).not.toContain('inspect interactive');
      expect(starter.prompt.toLowerCase()).not.toContain('dom');
    }
  });

  it('returns end-user shopping prompts on e-commerce sites', () => {
    const amazon = getContextualStarters('https://www.amazon.com/dp/B08N5WRWNW', 'Wireless Noise Cancelling Headphones');
    expect(amazon).toHaveLength(3);
    expect(amazon[0].label).toBe('Buyer Advice');
    expect(amazon[1].label).toBe('Compare Options');
    expect(amazon[2].label).toBe('Deals & Discounts');
  });

  it('returns end-user travel prompts on booking sites', () => {
    const expedia = getContextualStarters('https://www.expedia.com/Hotel-Search?destination=Pune', 'Hotels in Pune');
    expect(expedia).toHaveLength(3);
    expect(expedia[0].label).toBe('Best Value Stays');
    expect(expedia[1].label).toBe('Check Hidden Catches');
    expect(expedia[2].label).toBe('Booking Assistance');
  });

  it('returns end-user friendly prompts on generic sites without developer jargon', () => {
    const generic = getContextualStarters('https://randomservice.io/pricing', 'Awesome Service Pricing');
    expect(generic).toHaveLength(3);
    expect(generic[0].label).toBe('Explain This Page');
    expect(generic[1].label).toBe('Find Key Info');
    expect(generic[2].label).toBe('Help Me Navigate');

    for (const starter of generic) {
      expect(starter.prompt.toLowerCase()).not.toContain('markdown table');
      expect(starter.prompt.toLowerCase()).not.toContain('inspect interactive');
    }
  });

  it('generateSmartStartersWithLLM calls queryLLMRaw and parses JSON questions cleanly', async () => {
    vi.spyOn(client, 'queryLLMRaw').mockResolvedValue(
      JSON.stringify([
        { label: 'Top Highlights', category: 'summarize', prompt: 'What are the main headlines?' },
        { label: 'Check Prices', category: 'compare', prompt: 'Which plans give best value?' },
        { label: 'Next Steps', category: 'automate', prompt: 'How do I sign up?' },
      ]),
    );

    const results = await generateSmartStartersWithLLM(
      { provider: 'omniroute', model: 'test' },
      'https://example.com',
      'Example Page',
      'Snippet of page content',
    );

    expect(results).toHaveLength(3);
    expect(results[0].label).toBe('Top Highlights');
    expect(results[1].category).toBe('compare');
    expect(results[2].prompt).toBe('How do I sign up?');
  });
});
