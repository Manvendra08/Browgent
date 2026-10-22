const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'chrome-untrusted://',
  'chrome-search://',
  'chrome-error://',
  'chrome-devtools://',
  'devtools://',
  'edge://',
  'about:',
  'view-source:',
  'file://',
  'blob:',
  'data:',
  'ftp://',
];

const RESTRICTED_HOSTS = ['chromewebstore.google.com'];

const RESTRICTED_HOST_SUFFIXES = ['.localhost'];

const BLOCKED_IPV4_HOSTS = [
  '169.254.169.254',
  '169.254.170.2',
  'metadata.google.internal',
  'metadata.goog',
];

function isBlockedIpLiteral(hostname: string): boolean {
  if (BLOCKED_IPV4_HOSTS.includes(hostname.toLowerCase())) {
    return true;
  }
  return /^169\.254\.\d+\.\d+$/.test(hostname);
}

export function isRestrictedUrl(url: string | undefined | null): boolean {
  if (!url || url.trim() === '') {
    return true;
  }

  const normalized = url.trim().toLowerCase();

  if (RESTRICTED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  if (RESTRICTED_HOSTS.some((host) => normalized.includes(host))) {
    return true;
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(normalized);
  } catch {
    parsed = null;
  }

  if (parsed) {
    const hostname = parsed.hostname.toLowerCase();
    if (isBlockedIpLiteral(hostname)) {
      return true;
    }
    if (RESTRICTED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
      return true;
    }
  }

  return false;
}

export function isNewTabPage(url: string | undefined | null): boolean {
  if (!url || url.trim() === '') {
    return true;
  }
  const normalized = url.trim().toLowerCase();
  return (
    normalized === 'about:blank' ||
    normalized.startsWith('chrome://newtab') ||
    normalized.startsWith('chrome://new-tab-page') ||
    normalized.startsWith('edge://newtab')
  );
}

const COMMON_TLDS =
  'com|org|net|edu|gov|io|co|in|ai|app|dev|me|info|biz|tv|uk|ca|au|de|fr|jp|cn|br|ru|nl|es|it|eu|xyz|online|tech|site';

const TARGET_URL_REGEX = new RegExp(
  `(?:(?:go\\s+to|open|visit|navigate\\s+to|browse\\s+to)\\s+|\\b(?:on|at)\\s+)?((?:https?:\\/\\/)?(?:[a-zA-Z0-9-]+\\.)+(?:${COMMON_TLDS})(?::\\d+)?(?:\\/[^\\s'"]*)?)`,
  'i'
);

const EXPLICIT_HTTP_REGEX = /https?:\/\/[^\s'"]+/i;

export function extractTargetUrlFromGoal(goal: string): string | null {
  if (!goal || typeof goal !== 'string') {
    return null;
  }
  const text = goal.trim();

  // 1. Explicit http/https URL anywhere in the prompt
  const explicitMatch = text.match(EXPLICIT_HTTP_REGEX);
  if (explicitMatch) {
    const candidate = explicitMatch[0].replace(/[.,;:!?)]+$/, '');
    if (!isRestrictedUrl(candidate)) {
      return candidate;
    }
  }

  // 2. Action or domain pattern: "go to google.com", "open flights.google.com/search", "search ... on amazon.in"
  const domainMatch = text.match(TARGET_URL_REGEX);
  if (domainMatch && domainMatch[1]) {
    let candidate = domainMatch[1].replace(/[.,;:!?)]+$/, '').trim();
    if (!/^https?:\/\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    }
    if (!isRestrictedUrl(candidate)) {
      return candidate;
    }
  }

  return null;
}

export const RESTRICTED_URL_HINT =
  'Chrome restricts extensions on internal and Web Store pages. Please navigate to a standard public website (e.g. https://wikipedia.org or https://news.ycombinator.com).';
