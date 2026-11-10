import { describe, it, expect } from 'vitest';
import {
  getContextualStarters,
  isBlankOrInternalPage,
  BLANK_PAGE_STARTERS,
} from '../../src/sidepanel/starters';

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

    const blank2 = getContextualStarters('about:blank');
    expect(blank2).toHaveLength(3);

    const blank3 = getContextualStarters('chrome://newtab');
    expect(blank3).toHaveLength(3);
  });

  it('returns tailored e-commerce prompts on retail domains or product pages', () => {
    const amazon = getContextualStarters('https://www.amazon.com/dp/B08N5WRWNW', 'Wireless Noise Cancelling Headphones');
    expect(amazon).toHaveLength(3);
    expect(amazon.some((s) => s.category === 'compare')).toBe(true);
    expect(amazon.some((s) => s.prompt.toLowerCase().includes('coupon') || s.prompt.toLowerCase().includes('review'))).toBe(true);

    const flipkart = getContextualStarters('https://www.flipkart.com/item/123', 'Smartphone');
    expect(flipkart).toHaveLength(3);
    expect(flipkart.some((s) => s.category === 'compare')).toBe(true);
  });

  it('returns travel and booking prompts on travel domains', () => {
    const expedia = getContextualStarters('https://www.expedia.com/Hotel-Search?destination=Pune', 'Hotels in Pune');
    expect(expedia).toHaveLength(3);
    expect(expedia.some((s) => s.prompt.toLowerCase().includes('amenities') || s.prompt.toLowerCase().includes('rating'))).toBe(true);
    expect(expedia.some((s) => s.category === 'compare')).toBe(true);
  });

  it('returns social & network prompts on LinkedIn or Twitter', () => {
    const linkedin = getContextualStarters('https://www.linkedin.com/in/manvendra-anjan', 'Manvendra Anjan | LinkedIn');
    expect(linkedin).toHaveLength(3);
    expect(linkedin.some((s) => s.label === 'Profile Intel')).toBe(true);
    expect(linkedin.some((s) => s.label === 'Draft Response')).toBe(true);
  });

  it('returns code intelligence prompts on GitHub and developer docs', () => {
    const github = getContextualStarters('https://github.com/Manvendra08/Browgent', 'Manvendra08/Browgent');
    expect(github).toHaveLength(3);
    expect(github.some((s) => s.label === 'Explain Code')).toBe(true);
    expect(github.some((s) => s.label === 'Extract APIs')).toBe(true);
  });

  it('returns research/takeaways prompts on news and article pages', () => {
    const wiki = getContextualStarters('https://en.wikipedia.org/wiki/Artificial_intelligence', 'Artificial intelligence - Wikipedia');
    expect(wiki).toHaveLength(3);
    expect(wiki.some((s) => s.label === 'Key Takeaways')).toBe(true);
    expect(wiki.some((s) => s.label === 'Fact Check & Bias')).toBe(true);
  });

  it('returns tailored 3 starters for generic live web pages', () => {
    const generic = getContextualStarters('https://randomservice.io/dashboard', 'Service Dashboard');
    expect(generic).toHaveLength(3);
    expect(generic[0].prompt).toContain('Service Dashboard');
  });
});
