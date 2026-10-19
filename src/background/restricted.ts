const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'view-source:',
];

const RESTRICTED_HOSTS = ['chromewebstore.google.com'];

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

  return false;
}

export const RESTRICTED_URL_HINT =
  'Chrome restricts extensions on internal and Web Store pages. Please navigate to a standard public website (e.g. https://wikipedia.org or https://news.ycombinator.com).';
