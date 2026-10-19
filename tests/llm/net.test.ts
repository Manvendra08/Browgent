import { describe, it, expect, vi, afterEach } from 'vitest';
import { NetworkError, fetchLLM } from '../../src/background/llm/net';
import { queryOmniRoute } from '../../src/background/llm/omniroute';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchLLM network failures', () => {
  it('maps TypeError failed-fetch to a clearer message naming the endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(
      fetchLLM('http://localhost:20128/v1/chat/completions', { method: 'POST' }, 'OmniRoute')
    ).rejects.toThrow('Cannot reach OmniRoute at http://localhost:20128/v1/chat/completions — is the server running?');
  });

  it('is an instance of NetworkError so callers can special-case it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    let caught: unknown;
    await fetchLLM('http://localhost:9999/', {}, 'Test').catch((e) => { caught = e; });
    expect(caught).toBeInstanceOf(NetworkError);
  });

  it('passes non-network errors through unchanged', async () => {
    const boom = new Error('boom');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(boom));

    await expect(fetchLLM('http://x/', {}, 'Test')).rejects.toBe(boom);
  });

  it('queryOmniRoute surfaces the friendly message when the server is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(
      queryOmniRoute({ provider: 'omniroute', model: 'anti' }, [{ role: 'user', content: 'hi' }])
    ).rejects.toThrow('Cannot reach OmniRoute at http://localhost:20128/v1/chat/completions — is the server running?');
  });
});
