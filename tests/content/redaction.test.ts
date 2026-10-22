import { describe, it, expect, beforeEach } from 'vitest';
import { extractInteractiveElements, formatElementsForPrompt } from '../../src/content/extractor';

describe('Sensitive field redaction', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <input type="text" name="card_number" value="4111 1111 1111 1111" aria-label="Card number" />
        <input type="password" value="hunter2-secret" aria-label="Password" />
        <input type="text" autocomplete="one-time-code" value="123456" aria-label="OTP" />
        <input type="search" value="running shoes" aria-label="Search" />
      </div>
    `;
  });

  it('never exposes a password field value', () => {
    const elements = extractInteractiveElements(document);
    const prompt = formatElementsForPrompt(elements);
    expect(prompt).not.toContain('hunter2-secret');
  });

  it('redacts values of sensitive fields', () => {
    const elements = extractInteractiveElements(document);
    const prompt = formatElementsForPrompt(elements);
    expect(prompt).not.toContain('4111 1111 1111 1111');
    expect(prompt).not.toContain('123456');
    expect(prompt).toContain('[REDACTED]');
  });

  it('keeps non-sensitive values so the agent can read the page normally', () => {
    const elements = extractInteractiveElements(document);
    const prompt = formatElementsForPrompt(elements);
    expect(prompt).toContain('running shoes');
  });
});
