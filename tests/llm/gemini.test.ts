import { describe, it, expect, vi, afterEach } from 'vitest';
import { queryGemini } from '../../src/background/llm/gemini';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Gemini provider', () => {
  it('sends the API key in a header and never in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await queryGemini(
      { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'AIza-test-key-123456' },
      [{ role: 'user', content: 'hello' }]
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('AIza-test-key-123456');
    expect(url).not.toContain('key=');
    expect(url).toContain('gemini-2.5-flash:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test-key-123456');
  });

  it('lifts the system message out of contents and maps assistant turns to model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await queryGemini(
      { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'AIza-test-key-123456' },
      [
        { role: 'system', content: 'be terse' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ]
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(init.body as string);

    expect(payload.systemInstruction.parts[0].text).toBe('be terse');
    expect(payload.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model']);
  });

  it('never leaks the API key into an error message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Bad key AIza-test-key-123456 supplied' } }),
      { status: 400 }
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      queryGemini(
        { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'AIza-test-key-123456' },
        [{ role: 'user', content: 'hello' }]
      )
    ).rejects.toThrow(/REDACTED/);
  });

  it('requires an API key', async () => {
    await expect(
      queryGemini({ provider: 'gemini', model: 'gemini-2.5-flash' }, [{ role: 'user', content: 'hello' }])
    ).rejects.toThrow(/API key is required/);
  });
});
