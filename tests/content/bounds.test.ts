import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractInteractiveElements,
  formatElementsForPrompt,
  captureDOMState,
  scrubUrl,
  MAX_PERCEIVED_ELEMENTS,
} from '../../src/content/extractor';
import { redactSecrets, truncateErrorBody } from '../../src/background/llm/net';

describe('Context budget bounds', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders at most the element cap but still assigns ids to every element', () => {
    const buttons = Array.from({ length: MAX_PERCEIVED_ELEMENTS + 25 }, (_, i) =>
      `<button id="b${i}">Button ${i}</button>`
    ).join('');
    document.body.innerHTML = `<div>${buttons}</div>`;

    const elements = extractInteractiveElements(document);
    const formatted = formatElementsForPrompt(elements);
    const listed = formatted.split('\n').filter((l) => /^\[\d+\]/.test(l));

    expect(listed.length).toBe(MAX_PERCEIVED_ELEMENTS);
    expect(formatted).toContain('further interactive elements exist on this page');

    // Every element must still be addressable by id so nothing becomes unclickable.
    expect(elements.length).toBe(MAX_PERCEIVED_ELEMENTS + 25);
    const ids = new Set(elements.map((e) => e.id));
    expect(ids.size).toBe(elements.length);
  });

  it('caps the formatted prompt length', () => {
    const rows = Array.from({ length: 400 }, (_, i) =>
      `<button id="b${i}">${'Long label '.repeat(20)}${i}</button>`
    ).join('');
    document.body.innerHTML = `<div>${rows}</div>`;

    const formatted = formatElementsForPrompt(extractInteractiveElements(document));
    expect(formatted.length).toBeLessThanOrEqual(41000);
    expect(formatted).toContain('[NOTE]');
  });

  it('redacts only sensitive query parameters and keeps task-relevant ones', () => {
    expect(scrubUrl('https://example.com/a/b?token=secret&q=cats')).toBe('https://example.com/a/b?token=redacted&q=cats');
    expect(scrubUrl('https://example.com/plain')).toBe('https://example.com/plain');
  });

  it('scrubs the captured page URL', () => {
    document.body.innerHTML = '<button>Go</button>';
    const state = captureDOMState(document);
    expect(state.url).not.toContain('token=');
  });
});

describe('Secret redaction in provider errors', () => {
  it('removes a leaked api key from an error body', () => {
    const body = 'Invalid Authorization: Bearer sk-supersecretkeyvalue';
    const redacted = redactSecrets(body, ['sk-supersecretkeyvalue']);
    expect(redacted).not.toContain('sk-supersecretkeyvalue');
    expect(redacted).toContain('[REDACTED]');
  });

  it('ignores trivially short secrets so real text is not mangled', () => {
    expect(redactSecrets('the cat sat', ['cat'])).toBe('the cat sat');
  });

  it('truncates very long error bodies', () => {
    const long = 'x'.repeat(5000);
    const out = truncateErrorBody(long, 100);
    expect(out.length).toBeLessThan(200);
    expect(out).toContain('truncated');
  });
});
