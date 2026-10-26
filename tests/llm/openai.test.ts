import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  queryOpenAI,
  normalizeOpenAIEndpoint,
  clearKnownTextOnlyModels,
  isModelTextOnly,
  isImageUnsupportedError,
} from '../../src/background/llm/openai';

beforeEach(() => {
  clearKnownTextOnlyModels();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearKnownTextOnlyModels();
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
    expect(payload.max_tokens).toBe(4096);
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

  it('detects image unsupported errors accurately', () => {
    expect(
      isImageUnsupportedError(
        '{"error":{"message":"No endpoints found that support image input","code":404,"metadata":{"routing_funnel":[{"step":"Initial Endpoints","endpoint_count":1}],"failed_routing_step":"Filter by Image Support"}}}',
      ),
    ).toBe(true);
    expect(isImageUnsupportedError('Model does not support vision inputs')).toBe(true);
    expect(isImageUnsupportedError('Rate limit exceeded')).toBe(false);
  });

  it('automatically falls back to text-only mode when provider rejects image input (Kilo / Nemotron error)', async () => {
    const errorBody = JSON.stringify({
      error: {
        message: 'No endpoints found that support image input',
        code: 404,
        metadata: {
          routing_funnel: [{ step: 'Initial Endpoints', endpoint_count: 1 }],
          failed_routing_step: 'Filter by Image Support',
        },
      },
    });

    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      callCount++;
      const body = JSON.parse(init.body as string);
      if (callCount === 1) {
        // First call includes images and fails with 404
        expect(Array.isArray(body.messages[0].content)).toBe(true);
        return Promise.resolve(new Response(errorBody, { status: 404 }));
      }
      if (callCount === 2) {
        // Second call retries without images as text-only
        expect(typeof body.messages[0].content).toBe('string');
        expect(body.messages[0].content).toBe('look at this page');
        return Promise.resolve(okResponse('{"action":"click","elementId":5}'));
      }
      // Third call (subsequent request) uses text-only directly
      expect(typeof body.messages[0].content).toBe('string');
      expect(body.messages[0].content).toBe('step 2');
      return Promise.resolve(okResponse('{"action":"finish","summary":"Done"}'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const config = {
      provider: 'openai-compat' as const,
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      baseUrl: 'https://ai-gateway.kilo.ai/api/v1',
      apiKey: 'kilo-key',
    };

    const result = await queryOpenAI(config, [
      { role: 'user', content: 'look at this page', images: ['data:image/png;base64,1234'] },
    ]);

    expect(result).toBe('{"action":"click","elementId":5}');
    expect(callCount).toBe(2);
    // Model is now recorded as text-only
    expect(isModelTextOnly(config.provider, config.model)).toBe(true);

    // On subsequent call with this model, it sends text-only directly on first try
    const secondResult = await queryOpenAI(config, [
      { role: 'user', content: 'step 2', images: ['data:image/png;base64,5678'] },
    ]);
    expect(secondResult).toBe('{"action":"finish","summary":"Done"}');
    expect(callCount).toBe(3);
  });
});
