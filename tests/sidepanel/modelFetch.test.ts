import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAvailableModels } from '../../src/sidepanel/modelFetch';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function lastRequest(fetchMock: ReturnType<typeof vi.fn>): {
  url: string;
  init: RequestInit;
} {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: call[0] as string, init: (call[1] ?? {}) as RequestInit };
}

function headersOf(init: RequestInit): Record<string, string> {
  return (init.headers ?? {}) as Record<string, string>;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('fetchAvailableModels', () => {
  it('requests ${root}/models for omniroute', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'local-model' }] }));

    const result = await fetchAvailableModels({
      provider: 'omniroute',
      model: 'free',
      apiKey: 'omni-key',
    });

    expect(result.error).toBeUndefined();
    expect(result.models).toEqual(['local-model']);
    const { url } = lastRequest(fetchMock);
    expect(url).toBe('http://localhost:20128/v1/models');
  });

  it('uses the configured omniroute base url and sends a bearer token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'local-model' }] }));

    const result = await fetchAvailableModels({
      provider: 'omniroute',
      model: 'free',
      apiKey: 'omni-key',
      baseUrl: 'https://omni.example.com/v1/chat/completions',
    });

    expect(result.error).toBeUndefined();
    const { url, init } = lastRequest(fetchMock);
    expect(url).toBe('https://omni.example.com/v1/models');
    expect(headersOf(init).Authorization).toBe('Bearer omni-key');
  });

  it('requests ${root}/models for openai with an Authorization header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }));

    const result = await fetchAvailableModels({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
    });

    expect(result.error).toBeUndefined();
    expect(result.models).toEqual(['gpt-4o', 'gpt-4o-mini']);
    const { url, init } = lastRequest(fetchMock);
    expect(url).toBe('https://api.openai.com/v1/models');
    expect(headersOf(init).Authorization).toBe('Bearer sk-test');
  });

  it('requires a base URL for openai-compat providers', async () => {
    const result = await fetchAvailableModels({
      provider: 'openai-compat',
      model: 'local',
      apiKey: 'key',
    });

    expect(result.models).toEqual([]);
    expect(result.error).toContain('Base URL is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests the gemini models endpoint with key and pageSize and filters non-generate models', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        models: [
          { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-1.5-pro' },
        ],
      })
    );

    const result = await fetchAvailableModels({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      apiKey: 'gem-key',
    });

    expect(result.error).toBeUndefined();
    expect(result.models).toEqual(['gemini-2.0-flash', 'gemini-1.5-pro']);
    const { url, init } = lastRequest(fetchMock);
    expect(url).toContain('pageSize=100');
    expect(url).not.toContain('gem-key');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('gem-key');
  });

  it('requests ${root}/v1/models?limit=100 for anthropic with an x-api-key header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'claude-sonnet-4' }] }));

    const result = await fetchAvailableModels({
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      apiKey: 'ant-key',
    });

    expect(result.error).toBeUndefined();
    expect(result.models).toEqual(['claude-sonnet-4']);
    const { url, init } = lastRequest(fetchMock);
    expect(url).toBe('https://api.anthropic.com/v1/models?limit=100');
    expect(headersOf(init)['x-api-key']).toBe('ant-key');
  });

  it('requires an API key for openai', async () => {
    const result = await fetchAvailableModels({
      provider: 'openai',
      model: 'gpt-4o',
    });

    expect(result.models).toEqual([]);
    expect(result.error).toContain('API Key is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires an API key for gemini and anthropic', async () => {
    const gemini = await fetchAvailableModels({ provider: 'gemini', model: 'gemini-2.0-flash' });
    expect(gemini.models).toEqual([]);
    expect(gemini.error).toMatch(/api key is required/i);

    const anthropic = await fetchAvailableModels({ provider: 'anthropic', model: 'claude-sonnet-4' });
    expect(anthropic.models).toEqual([]);
    expect(anthropic.error).toMatch(/api key is required/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
