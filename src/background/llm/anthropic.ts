import { LLMConfig, LLMMessage } from './types';
import { fetchLLM } from './net';

export async function queryAnthropic(config: LLMConfig, messages: LLMMessage[]): Promise<string> {
  const model = config.model || 'claude-3-7-sonnet-20250219';
  const apiKey = config.apiKey ? config.apiKey.trim() : '';

  if (!apiKey) {
    throw new Error('Anthropic API key is required');
  }

  const endpoint = config.baseUrl && config.baseUrl.trim() !== ''
    ? config.baseUrl
    : 'https://api.anthropic.com/v1/messages';

  let systemPrompt: string | undefined;
  const formattedMessages: unknown[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemPrompt = m.content;
      continue;
    }

    if (m.images && m.images.length > 0) {
      const contentBlocks: unknown[] = [];
      for (const img of m.images) {
        // img is a data URL: data:image/png;base64,...
        const match = img.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: match[1],
              data: match[2],
            },
          });
        }
      }
      contentBlocks.push({ type: 'text', text: m.content });
      formattedMessages.push({ role: m.role, content: contentBlocks });
      continue;
    }

    formattedMessages.push({
      role: m.role,
      content: m.content,
    });
  }

  const payload: Record<string, unknown> = {
    model,
    messages: formattedMessages,
    max_tokens: config.maxTokens ?? 1024,
    temperature: config.temperature ?? 0.2,
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

  const response = await fetchLLM(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(payload),
  }, 'Anthropic');

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API Error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const textContent = data.content && data.content.find((c: { type: string; text?: string }) => c.type === 'text');
  if (!textContent || !textContent.text) {
    throw new Error('Anthropic returned an empty completion response');
  }

  return textContent.text;
}
