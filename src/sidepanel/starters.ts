export interface ContextualStarter {
  label: string;
  category: 'summarize' | 'extract' | 'automate' | 'audit' | 'compare' | 'navigate';
  prompt: string;
  description?: string;
}

export const BLANK_PAGE_STARTERS: ContextualStarter[] = [
  {
    label: 'Browse & Research',
    category: 'navigate',
    prompt: 'Search the web for top trending AI tools and compile their pricing and features',
  },
  {
    label: 'Automate Form',
    category: 'automate',
    prompt: 'Open a site of my choice, fill out the registration or contact form, and review before submitting',
  },
  {
    label: 'Extract Data',
    category: 'extract',
    prompt: 'Navigate to an online store or directory and extract items into a clean markdown table',
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
    // If not a parseable URL, return generic fallback
  }

  const pageTitle = (title || '').trim();
  const lowerTitle = pageTitle.toLowerCase();

  // 1. E-Commerce & Retail (Amazon, eBay, Walmart, Flipkart, Shopify, product pages)
  if (
    hostname.includes('amazon') ||
    hostname.includes('ebay') ||
    hostname.includes('walmart') ||
    hostname.includes('flipkart') ||
    hostname.includes('target') ||
    hostname.includes('etsy') ||
    pathname.includes('/product') ||
    pathname.includes('/item') ||
    pathname.includes('/dp/') ||
    lowerTitle.includes('shop') ||
    lowerTitle.includes('store') ||
    lowerTitle.includes('price')
  ) {
    return [
      {
        label: 'Compare Prices',
        category: 'compare',
        prompt: 'Extract all products, variants, and prices on this page into a comparison markdown table',
      },
      {
        label: 'Review Intel',
        category: 'audit',
        prompt: 'Summarize user reviews, pros, cons, and common buyer complaints for this item',
      },
      {
        label: 'Find Deals',
        category: 'extract',
        prompt: 'Check for available coupons, discount codes, or cheaper alternate sellers on this page',
      },
    ];
  }

  // 2. Travel & Hospitality (Expedia, Booking, Airbnb, Agoda, TripAdvisor, Skyscanner)
  if (
    hostname.includes('expedia') ||
    hostname.includes('booking') ||
    hostname.includes('airbnb') ||
    hostname.includes('tripadvisor') ||
    hostname.includes('agoda') ||
    hostname.includes('kayak') ||
    hostname.includes('hotels') ||
    lowerTitle.includes('hotel') ||
    lowerTitle.includes('flight') ||
    lowerTitle.includes('stay')
  ) {
    return [
      {
        label: 'Find Best Price',
        category: 'extract',
        prompt: 'Extract top 5 options with name, rating, total price including taxes, and key amenities',
      },
      {
        label: 'Compare Stays',
        category: 'compare',
        prompt: 'Compare the top 3 highest-rated listings by location, cancellation policy, and total cost',
      },
      {
        label: 'Audit Reviews',
        category: 'audit',
        prompt: 'Scan recent traveler reviews for complaints about cleanliness, wifi speed, and hidden fees',
      },
    ];
  }

  // 3. Social & Professional Networks (LinkedIn, Twitter / X, Reddit, GitHub)
  if (
    hostname.includes('linkedin') ||
    hostname.includes('twitter') ||
    hostname.includes('x.com') ||
    hostname.includes('reddit')
  ) {
    return [
      {
        label: 'Profile Intel',
        category: 'extract',
        prompt: 'Extract key professional background, current role, tenure, and recent activity into a dossier',
      },
      {
        label: 'Draft Response',
        category: 'automate',
        prompt: 'Draft an authentic, high-context reply or connection note tailored to this post or profile',
      },
      {
        label: 'Summarize Thread',
        category: 'summarize',
        prompt: 'Summarize the core debate and top insightful comments in this thread in 5 concise bullets',
      },
    ];
  }

  // 4. Developer & Technical (GitHub, GitLab, StackOverflow, Documentation)
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
        label: 'Explain Code',
        category: 'summarize',
        prompt: 'Explain the architecture and key functions of this codebase or document in plain English',
      },
      {
        label: 'Extract APIs',
        category: 'extract',
        prompt: 'Extract all API endpoints, parameters, and return types into a structured reference table',
      },
      {
        label: 'Find Issues',
        category: 'audit',
        prompt: 'Analyze this page for open issues, breaking changes, or deprecation warnings',
      },
    ];
  }

  // 5. News, Articles, Blogs, & Media (Substack, Medium, NYT, TechCrunch, Wikipedia, Docs)
  if (
    hostname.includes('wikipedia') ||
    hostname.includes('medium') ||
    hostname.includes('substack') ||
    hostname.includes('news') ||
    hostname.includes('techcrunch') ||
    hostname.includes('bloomberg') ||
    pathname.includes('/blog') ||
    pathname.includes('/article') ||
    pathname.includes('/news')
  ) {
    return [
      {
        label: 'Key Takeaways',
        category: 'summarize',
        prompt: 'Summarize the core thesis and key supporting evidence of this article in 5 executive bullets',
      },
      {
        label: 'Fact Check & Bias',
        category: 'audit',
        prompt: 'Identify the main claims made on this page, cited sources, and any unverified assumptions',
      },
      {
        label: 'Action Items',
        category: 'extract',
        prompt: 'Extract actionable insights, recommendations, or referenced tools mentioned in this piece',
      },
    ];
  }

  // 6. Generic Live Web Page (Default for any standard active website)
  const shortTitle = pageTitle ? `"${pageTitle.slice(0, 30)}..."` : 'this page';
  return [
    {
      label: 'Summarize Page',
      category: 'summarize',
      prompt: `Summarize the essential content and purpose of ${shortTitle} in 5 structured bullets`,
    },
    {
      label: 'Extract Data',
      category: 'extract',
      prompt: 'Extract all key facts, tables, lists, or contact info on this page into a markdown table',
    },
    {
      label: 'Automate & Review',
      category: 'automate',
      prompt: 'Inspect interactive forms or elements on this page, enter required inputs, and review before submit',
    },
  ];
}
