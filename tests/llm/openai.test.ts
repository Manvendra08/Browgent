import { describe, it, expect, vi, afterEach } from 'vitest';
import { queryOpenAI, normalizeOpenAIEndpoint } from '../../src/background/llm/openai';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function okResponse(content = 'ok'): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('OpenAI-compatible provider', () => {
  it('defaults to the public OpenAI endpoint when no baseUrl is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await queryOpenAI({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' }, [
      { role: 'user', content: 'hi' },
    ]);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('uses a custom baseUrl (for self-hosted and proxy endpoints)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await queryOpenAI(
      { provider: 'openai-compat', model: 'local', baseUrl: 'http://localhost:8080/v1/chat/completions' },
      [{ role: 'user', content: 'hi' }]
    );

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/v1/chat/completions');
  });

  it('sends a bearer token only when an API key is present', async () => {
    const withKey = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', withKey);
    await queryOpenAI({ provider: 'openai', model: 'gpt-4o', apiKey: '  sk-padded  ' }, [
      { role: 'user', content: 'hi' },
    ]);
    const authedHeaders = withKey.mock.calls[0][1].headers as Record<string, string>;
    expect(authedHeaders.Authorization).toBe('Bearer sk-padded');

    const withoutKey = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', withoutKey);
    await queryOpenAI({ provider: 'openai-compat', model: 'local' }, [{ role: 'user', content: 'hi' }]);
    const anonHeaders = withoutKey.mock.calls[0][1].headers as Record<string, string>;
    expect(anonHeaders.Authorization).toBeUndefined();
  });

  it('encodes image attachments as image_url content parts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await queryOpenAI({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' }, [
      { role: 'user', content: 'what is this', images: ['data:image/png;base64,AAA'] },
    ]);

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const parts = payload.messages[0].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts[0]).toEqual({ type: 'text', text: 'what is this' });
    expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } });
  });

  it('keeps plain string content when there are no attachments', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await queryOpenAI({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' }, [
      { role: 'user', content: 'plain' },
    ]);

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.messages[0].content).toBe('plain');
  });

  it('applies model, temperature and max_tokens defaults', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await queryOpenAI({ provider: 'openai' }, [{ role: 'user', content: 'hi' }]);

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.model).toBe('gpt-4o');
    expect(payload.temperature).toBe(0.2);
    expect(payload.max_tokens).toBe(1024);
  });

  it('honours explicit temperature and maxTokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await queryOpenAI(
      { provider: 'openai', model: 'gpt-4o-mini', temperature: 0, maxTokens: 7 },
      [{ role: 'user', content: 'hi' }]
    );

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.temperature).toBe(0);
    expect(payload.max_tokens).toBe(7);
  });

  it('never leaks the API key into an error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Incorrect API key provided: sk-secret-key-123' } }),
      { status: 401 }
    )));

    await expect(
      queryOpenAI({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-secret-key-123' }, [
        { role: 'user', content: 'hi' },
      ])
    ).rejects.toThrow(/REDACTED/);
  });

  it('reports the HTTP status on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 503 })));

    await expect(
      queryOpenAI({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' }, [
        { role: 'user', content: 'hi' },
      ])
    ).rejects.toThrow(/503/);
  });

  it('rejects an empty completion instead of returning undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [] }), { status: 200 }
    )));

    await expect(
      queryOpenAI({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' }, [
        { role: 'user', content: 'hi' },
      ])
    ).rejects.toThrow(/empty completion/);
  });

  it('forwards an abort signal so stop() can cancel the request', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      expect(init.signal).toBeDefined();
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = queryOpenAI(
      { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' },
      [{ role: 'user', content: 'hi' }],
      controller.signal
    );
    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('normalizes OpenAI-compatible base URLs', () => {
    expect(normalizeOpenAIEndpoint('')).toBe('https://api.openai.com/v1/chat/completions');
    expect(normalizeOpenAIEndpoint('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(normalizeOpenAIEndpoint('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1/chat/completions');
    expect(normalizeOpenAIEndpoint('http://localhost:11434/v1/models')).toBe('http://localhost:11434/v1/chat/completions');
    expect(normalizeOpenAIEndpoint('http://localhost:11434/v1/chat/completions')).toBe('http://localhost:11434/v1/chat/completions');
  });
});
