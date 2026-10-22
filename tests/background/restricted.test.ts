import { describe, it, expect } from 'vitest';
import {
  isRestrictedUrl,
  isNewTabPage,
  extractTargetUrlFromGoal,
} from '../../src/background/restricted';
import { parseAgentAction, MAX_WAIT_SECONDS } from '../../src/background/actions';

describe('Restricted URL policy', () => {
  it('blocks internal browser pages', () => {
    expect(isRestrictedUrl('chrome://settings')).toBe(true);
    expect(isRestrictedUrl('chrome-extension://abc/page.html')).toBe(true);
    expect(isRestrictedUrl('devtools://devtools/bundled/inspector.html')).toBe(true);
    expect(isRestrictedUrl('about:blank')).toBe(true);
    expect(isRestrictedUrl('edge://extensions')).toBe(true);
    expect(isRestrictedUrl('view-source:https://example.com')).toBe(true);
  });

  it('blocks local files, blob and data URLs', () => {
    expect(isRestrictedUrl('file:///C:/Users/test/.ssh/id_rsa')).toBe(true);
    expect(isRestrictedUrl('blob:https://example.com/abc')).toBe(true);
    expect(isRestrictedUrl('data:text/html,<script>alert(1)</script>')).toBe(true);
  });

  it('blocks cloud metadata endpoints', () => {
    expect(isRestrictedUrl('http://169.254.169.254/latest/meta-data/iam/security-credentials/')).toBe(true);
    expect(isRestrictedUrl('http://metadata.google.internal/computeMetadata/v1/')).toBe(true);
  });

  it('blocks the Chrome Web Store', () => {
    expect(isRestrictedUrl('https://chromewebstore.google.com/detail/x')).toBe(true);
  });

  it('allows ordinary web pages and loopback API hosts', () => {
    expect(isRestrictedUrl('https://example.com')).toBe(false);
    expect(isRestrictedUrl('https://quiz.example.com/assessment')).toBe(false);
    expect(isRestrictedUrl('http://localhost:20128/v1/chat/completions')).toBe(false);
  });

  it('treats an empty or missing url as restricted', () => {
    expect(isRestrictedUrl('')).toBe(true);
    expect(isRestrictedUrl(undefined)).toBe(true);
    expect(isRestrictedUrl(null)).toBe(true);
  });
});

describe('New tab detection', () => {
  it('recognizes blank and new tab URLs', () => {
    expect(isNewTabPage('chrome://newtab')).toBe(true);
    expect(isNewTabPage('chrome://newtab/')).toBe(true);
    expect(isNewTabPage('chrome://new-tab-page')).toBe(true);
    expect(isNewTabPage('chrome://new-tab-page/')).toBe(true);
    expect(isNewTabPage('about:blank')).toBe(true);
    expect(isNewTabPage('edge://newtab')).toBe(true);
    expect(isNewTabPage('')).toBe(true);
    expect(isNewTabPage(undefined)).toBe(true);
    expect(isNewTabPage(null)).toBe(true);
  });

  it('does not classify standard websites or non-newtab internal pages as new tab', () => {
    expect(isNewTabPage('https://www.google.com')).toBe(false);
    expect(isNewTabPage('https://example.com')).toBe(false);
    expect(isNewTabPage('chrome://settings')).toBe(false);
    expect(isNewTabPage('chrome://extensions')).toBe(false);
  });
});

describe('Target URL extraction from goal', () => {
  it('extracts explicit http/https URLs', () => {
    expect(extractTargetUrlFromGoal('go to https://flights.google.com and search')).toBe('https://flights.google.com');
    expect(extractTargetUrlFromGoal('open http://example.com/test')).toBe('http://example.com/test');
  });

  it('extracts domain names preceded by action verbs', () => {
    expect(
      extractTargetUrlFromGoal('go to google.com and Search cheapest from pune to lucknow on 5th november')
    ).toBe('https://google.com');
    expect(extractTargetUrlFromGoal('open amazon.in and search for shoes')).toBe('https://amazon.in');
    expect(extractTargetUrlFromGoal('navigate to wikipedia.org/wiki/SpaceX')).toBe('https://wikipedia.org/wiki/SpaceX');
    expect(extractTargetUrlFromGoal('visit flights.google.com')).toBe('https://flights.google.com');
  });

  it('extracts domain names preceded by prepositions', () => {
    expect(extractTargetUrlFromGoal('search cheapest flights on google.com')).toBe('https://google.com');
  });

  it('rejects restricted destinations', () => {
    expect(extractTargetUrlFromGoal('go to chrome://settings')).toBe(null);
    expect(extractTargetUrlFromGoal('open http://169.254.169.254/latest')).toBe(null);
    expect(extractTargetUrlFromGoal('navigate to file:///C:/passwords.txt')).toBe(null);
  });

  it('returns null when no domain or target URL is specified', () => {
    expect(extractTargetUrlFromGoal('Search cheapest from pune to lucknow on 5th november')).toBe(null);
    expect(extractTargetUrlFromGoal('click the next button')).toBe(null);
    expect(extractTargetUrlFromGoal('')).toBe(null);
  });
});

describe('Navigate action policy', () => {
  it('refuses to parse a navigate action to an internal or metadata address', () => {
    expect(() => parseAgentAction(JSON.stringify({ action: 'navigate', url: 'file:///C:/secret.txt' })))
      .toThrow(/blocked/i);
    expect(() => parseAgentAction(JSON.stringify({ action: 'navigate', url: 'http://169.254.169.254/' })))
      .toThrow(/blocked/i);
    expect(() => parseAgentAction(JSON.stringify({ action: 'navigate', url: 'chrome://settings' })))
      .toThrow(/blocked/i);
  });

  it('refuses non-http schemes', () => {
    expect(() => parseAgentAction(JSON.stringify({ action: 'navigate', url: 'javascript:alert(1)' })))
      .toThrow(/HTTP\/HTTPS/);
  });

  it('allows a normal https navigation', () => {
    const action = parseAgentAction(JSON.stringify({ action: 'navigate', url: 'https://example.com' }));
    expect(action).toEqual({ action: 'navigate', url: 'https://example.com' });
  });
});

describe('Wait action bounds', () => {
  it('clamps an absurd wait to the maximum allowed duration', () => {
    const action = parseAgentAction(JSON.stringify({ action: 'wait', seconds: 100000 }));
    expect(action).toEqual({ action: 'wait', seconds: MAX_WAIT_SECONDS });
  });

  it('clamps a negative wait to zero', () => {
    const action = parseAgentAction(JSON.stringify({ action: 'wait', seconds: -50 }));
    expect(action).toEqual({ action: 'wait', seconds: 0 });
  });
});
