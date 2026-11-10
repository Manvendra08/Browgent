export interface ContextualStarter {
  label: string;
  category: 'summarize' | 'extract' | 'automate' | 'audit' | 'compare' | 'navigate';
  prompt: string;
  description?: string;
}

export const BLANK_PAGE_STARTERS: ContextualStarter[] = [
  {
    label: 'Explore & Research',
    category: 'navigate',
    prompt: 'Search the web for top trending AI tools and compile their pricing and features',
  },
  {
    label: 'Help Me Fill Form',
    category: 'automate',
    prompt: 'Open a site of my choice, fill out the form with sensible details, and let me review before submitting',
  },
  {
    label: 'Find & Compare',
    category: 'extract',
    prompt: 'Find top-rated products or services in a category of my choice and compare their prices and reviews',
  },
];

export function isBlankOrInternalPage(url?: string | null): boolean {
  if (!url) return true;
  const lower = url.trim().toLowerCase();
  return (
    lower === '' ||
    lower === 'about:blank' ||
    lower === 'about:newtab' ||
    lower.startsWith('chrome://') ||
    lower.startsWith('chrome-extension://') ||
    lower.startsWith('edge://') ||
    lower.startsWith('brave://')
  );
}

export function getContextualStarters(url?: string | null, title?: string | null): ContextualStarter[] {
  if (isBlankOrInternalPage(url)) {
    return BLANK_PAGE_STARTERS;
  }

  let hostname = '';
  let pathname = '';
  try {
    const parsed = new URL(url!);
    hostname = parsed.hostname.toLowerCase();
    pathname = parsed.pathname.toLowerCase();
  } catch {
    // If not a parseable URL, fallback below
  }

  const pageTitle = (title || '').trim();
  const lowerTitle = pageTitle.toLowerCase();
  const lowerCombined = `${hostname} ${pathname} ${lowerTitle}`;

  // 1. Finance, Markets, Stocks & Crypto (Moneycontrol, Bloomberg, Yahoo Finance, Mint, TradingView, CNBC, Investing)
  if (
    hostname.includes('moneycontrol') ||
    hostname.includes('bloomberg') ||
    hostname.includes('finance.yahoo') ||
    hostname.includes('livemint') ||
    hostname.includes('tradingview') ||
    hostname.includes('cnbc') ||
    hostname.includes('investing.com') ||
    hostname.includes('reuters') ||
    hostname.includes('nseindia') ||
    hostname.includes('bseindia') ||
    hostname.includes('marketwatch') ||
    lowerCombined.includes('stock') ||
    lowerCombined.includes('market') ||
    lowerCombined.includes('share price') ||
    lowerCombined.includes('crypto') ||
    lowerCombined.includes('nifty') ||
    lowerCombined.includes('sensex')
  ) {
    return [
      {
        label: 'Market Highlights',
        category: 'summarize',
        prompt: 'What are the top market headlines, key indices movements, and why is the market moving today?',
      },
      {
        label: 'Top Stock Movers',
        category: 'extract',
        prompt: 'Which stocks or sectors are the biggest gainers and losers on this page, and what are their catalysts?',
      },
      {
        label: 'Analyst Sentiment',
        category: 'audit',
        prompt: 'Summarize the expert consensus, target prices, and major risks mentioned for the highlighted companies',
      },
    ];
  }

  // 2. E-Commerce & Retail (Amazon, eBay, Walmart, Flipkart, Shopify, product pages)
  if (
    hostname.includes('amazon') ||
    hostname.includes('ebay') ||
    hostname.includes('walmart') ||
    hostname.includes('flipkart') ||
    hostname.includes('target') ||
    hostname.includes('etsy') ||
    hostname.includes('myntra') ||
    pathname.includes('/product') ||
    pathname.includes('/item') ||
    pathname.includes('/dp/') ||
    lowerCombined.includes('shop') ||
    lowerCombined.includes('store') ||
    lowerCombined.includes('cart')
  ) {
    return [
      {
        label: 'Buyer Advice',
        category: 'audit',
        prompt: 'Is this worth buying? Summarize real customer reviews, pros, cons, and common buyer complaints',
      },
      {
        label: 'Compare Options',
        category: 'compare',
        prompt: 'Compare the different models, sizes, or variants on this page by price, features, and value',
      },
      {
        label: 'Deals & Discounts',
        category: 'extract',
        prompt: 'Find any active coupons, bank discount offers, or cheaper alternate sellers for this item',
      },
    ];
  }

  // 3. Travel & Hospitality (Expedia, Booking, Airbnb, Agoda, TripAdvisor, Skyscanner, MakeMyTrip)
  if (
    hostname.includes('expedia') ||
    hostname.includes('booking') ||
    hostname.includes('airbnb') ||
    hostname.includes('tripadvisor') ||
    hostname.includes('agoda') ||
    hostname.includes('kayak') ||
    hostname.includes('makemytrip') ||
    hostname.includes('hotels') ||
    lowerCombined.includes('hotel') ||
    lowerCombined.includes('flight') ||
    lowerCombined.includes('stay') ||
    lowerCombined.includes('resort')
  ) {
    return [
      {
        label: 'Best Value Stays',
        category: 'compare',
        prompt: 'Compare the top 3 highest-rated options on this page by total price (with taxes), location, and amenities',
      },
      {
        label: 'Check Hidden Catches',
        category: 'audit',
        prompt: 'Scan guest reviews for complaints about cleanliness, noise, wifi reliability, or hidden fees',
      },
      {
        label: 'Booking Assistance',
        category: 'automate',
        prompt: 'Select the best available room or flight option and proceed to the review screen before payment',
      },
    ];
  }

  // 4. Social & Professional Networks (LinkedIn, Twitter / X, Reddit)
  if (
    hostname.includes('linkedin') ||
    hostname.includes('twitter') ||
    hostname.includes('x.com') ||
    hostname.includes('reddit')
  ) {
    return [
      {
        label: 'Executive Bio',
        category: 'extract',
        prompt: 'Give me a quick 3-bullet executive summary of this person’s background, career highlights, and current focus',
      },
      {
        label: 'Draft Friendly Reply',
        category: 'automate',
        prompt: 'Draft an authentic, engaging response or connection request tailored to this conversation',
      },
      {
        label: 'Key Takeaways',
        category: 'summarize',
        prompt: 'What are the main viewpoints, debate arguments, and top insightful takeaways in this discussion?',
      },
    ];
  }

  // 5. Developer & Technical (GitHub, GitLab, StackOverflow, Documentation)
  if (
    hostname.includes('github') ||
    hostname.includes('gitlab') ||
    hostname.includes('stackoverflow') ||
    hostname.includes('docs.') ||
    pathname.includes('/docs') ||
    pathname.includes('/documentation') ||
    pathname.includes('/api')
  ) {
    return [
      {
        label: 'Plain English Summary',
        category: 'summarize',
        prompt: 'Explain what this project or tool does and how it works in plain, simple English',
      },
      {
        label: 'How Do I Use This?',
        category: 'extract',
        prompt: 'What are the quickest setup steps, requirements, and basic usage examples for this library?',
      },
      {
        label: 'Troubleshoot / Gotchas',
        category: 'audit',
        prompt: 'Are there any known bugs, limitations, or common pitfalls I should watch out for on this page?',
      },
    ];
  }

  // 6. News, Articles, Blogs, Research & Education (Substack, Medium, NYT, Wikipedia, etc.)
  if (
    hostname.includes('wikipedia') ||
    hostname.includes('medium') ||
    hostname.includes('substack') ||
    hostname.includes('news') ||
    hostname.includes('techcrunch') ||
    hostname.includes('bbc') ||
    hostname.includes('cnn') ||
    pathname.includes('/blog') ||
    pathname.includes('/article') ||
    pathname.includes('/news')
  ) {
    return [
      {
        label: 'Quick Breakdown',
        category: 'summarize',
        prompt: 'What is this article about? Give me the 3 most important takeaways in under 30 seconds',
      },
      {
        label: 'Fact Check & Sources',
        category: 'audit',
        prompt: 'What are the key claims made here, and what evidence or sources back them up?',
      },
      {
        label: 'Key Takeaways',
        category: 'extract',
        prompt: 'Extract the most interesting facts, stats, quotes, or practical lessons from this piece',
      },
    ];
  }

  // 7. Generic Live Web Page (Default for any standard active website)
  const shortTitle = pageTitle ? `"${pageTitle.slice(0, 32)}..."` : 'this page';
  return [
    {
      label: 'Explain This Page',
      category: 'summarize',
      prompt: `What is ${shortTitle} offering or explaining? Give me a concise summary`,
    },
    {
      label: 'Find Key Info',
      category: 'extract',
      prompt: 'What are the main options, pricing, contact details, or important facts on this page?',
    },
    {
      label: 'Help Me Navigate',
      category: 'automate',
      prompt: 'Help me find where to go next or guide me through the main action on this site',
    },
  ];
}

import { LLMConfig } from '../types';
import { queryLLMRaw } from '../background/llm/client';

export async function generateSmartStartersWithLLM(
  config: LLMConfig,
  pageUrl: string,
  pageTitle: string,
  pageSnippet: string,
  signal?: AbortSignal,
): Promise<ContextualStarter[]> {
  const systemPrompt = `You are an AI assistant in a browser sidebar helping everyday end-users (non-developers).
Given a webpage's title, URL, and a text snippet, generate exactly 3 short, curiosity-driven questions or actions the user would want to ask about this specific page.

RULES:
1. Speak in plain human language from the USER's perspective (e.g. "What are the main...", "How do I...", "Is this...").
2. NEVER use developer jargon like "DOM", "markdown table", "regex", "form elements", "inspect", "JSON", or "audit".
3. Return STRICTLY a JSON array of 3 objects with keys: "label" (2-3 words), "category" (one of: "summarize", "extract", "automate", "audit", "compare"), and "prompt" (the full question/instruction).
4. No markdown fences, no explanatory text, just the raw JSON array.`;

  const userContent = `Page Title: ${pageTitle || 'Untitled'}
Page URL: ${pageUrl}
Page Content Preview:
${pageSnippet.slice(0, 1500)}`;

  const responseText = await queryLLMRaw(
    config,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    signal,
  );

  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.slice(0, 3).map((item) => ({
        label: String(item.label || 'Question').slice(0, 24),
        category: (['summarize', 'extract', 'automate', 'audit', 'compare'].includes(item.category)
          ? item.category
          : 'summarize') as ContextualStarter['category'],
        prompt: String(item.prompt || '').trim(),
      }));
    }
  } catch (err) {
    console.warn('[Browgent Starters] Failed to parse LLM starters response:', err, responseText);
  }

  // Fallback to rules if JSON parsing fails
  return getContextualStarters(pageUrl, pageTitle);
}
