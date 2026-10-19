import { describe, it, expect, vi, afterEach } from 'vitest';
import { queryOmniRoute } from '../../src/background/llm/omniroute';
import { queryAnthropic } from '../../src/background/llm/anthropic';

const IMG = 'data:image/png;base64,AAAA';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Provider image parity', () => {
  it('OmniRoute sends images as OpenAI-style image_url content parts', async () => {
    let sentBody: { messages: Array<{ content: unknown }> } | undefined;
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      sentBody = JSON.parse((init as RequestInit).body as string);
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
      }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await queryOmniRoute(
      { provider: 'omniroute', model: 'anti' },
      [{ role: 'user', content: 'verify this', images: [IMG] }]
    );

    const content = sentBody?.messages[0].content as Array<{ type: string }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: 'text', text: 'verify this' });
    expect(content[1]).toEqual({ type: 'image_url', image_url: { url: IMG } });
  });

  it('Anthropic sends images as base64 source content blocks', async () => {
    let sentBody: { messages: Array<{ content: unknown }> } | undefined;
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      sentBody = JSON.parse((init as RequestInit).body as string);
      return Promise.resolve(new Response(JSON.stringify({
        content: [{ type: 'text', text: 'ok' }],
      }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await queryAnthropic(
      { provider: 'anthropic', apiKey: 'sk-test' },
      [{ role: 'user', content: 'verify this', images: [IMG] }]
    );

    const content = sentBody?.messages[0].content as Array<{ type: string; source?: { media_type: string; data: string } }>;
    expect(content[0].type).toBe('image');
    expect(content[0].source?.media_type).toBe('image/png');
    expect(content[0].source?.data).toBe('AAAA');
    expect(content[1]).toEqual({ type: 'text', text: 'verify this' });
  });
});
