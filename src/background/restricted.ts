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

export const RESTRICTED_URL_HINT =
  'Chrome restricts extensions on internal and Web Store pages. Please navigate to a standard public website (e.g. https://wikipedia.org or https://news.ycombinator.com).';
