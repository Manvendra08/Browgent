import { describe, it, expect, vi, afterEach } from 'vitest';
import { queryAnthropic } from '../../src/background/llm/anthropic';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function anthropicOk(text = 'response text'): Response {
  return new Response(
    JSON.stringify({
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('Anthropic Provider & Prompt Caching', () => {
  it('formats system prompt with cache_control ephemeral and sends beta header', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    let capturedHeaders: Record<string, string> | undefined;

    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve(anthropicOk('Hello Claude!'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await queryAnthropic(
      { provider: 'anthropic', apiKey: 'sk-ant-test' },
      [
        { role: 'system', content: 'You are Browgent autonomous assistant.' },
        { role: 'user', content: 'Navigate to google' },
      ],
    );

    expect(result).toBe('Hello Claude!');
    expect(capturedHeaders?.['anthropic-beta']).toBe('prompt-caching-2024-07-31');
    expect(capturedHeaders?.['x-api-key']).toBe('sk-ant-test');

    expect(Array.isArray(capturedBody?.system)).toBe(true);
    const systemBlocks = capturedBody?.system as Array<{ type: string; text: string; cache_control?: { type: string } }>;
    expect(systemBlocks[0]).toEqual({
      type: 'text',
      text: 'You are Browgent autonomous assistant.',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('falls back to string system prompt if a proxy rejects array system format', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      callCount++;
      const body = JSON.parse(init.body as string);
      if (callCount === 1) {
        expect(Array.isArray(body.system)).toBe(true);
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { message: 'expected string, got array for system' } }),
            { status: 400 },
          ),
        );
      }
      expect(typeof body.system).toBe('string');
      expect(body.system).toBe('System instructions');
      return Promise.resolve(anthropicOk('Recovered from proxy'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await queryAnthropic(
      { provider: 'anthropic', apiKey: 'sk-ant-test' },
      [
        { role: 'system', content: 'System instructions' },
        { role: 'user', content: 'Hello' },
      ],
    );

    expect(result).toBe('Recovered from proxy');
    expect(callCount).toBe(2);
  });

  it('throws an error when apiKey is missing', async () => {
    await expect(
      queryAnthropic({ provider: 'anthropic', apiKey: '' }, [{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/Anthropic API key is required/);
  });
});
