import { LLMConfig, LLMMessage } from './types';
import { fetchLLM, redactSecrets, truncateErrorBody } from './net';

export async function queryAnthropic(config: LLMConfig, messages: LLMMessage[], signal?: AbortSignal): Promise<string> {
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
    max_tokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.2,
  };

  if (systemPrompt) {
    payload.system = [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ];
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'prompt-caching-2024-07-31',
    'anthropic-dangerous-direct-browser-access': 'true',
  };

  const response = await fetchLLM(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  }, 'Anthropic', signal);

  if (!response.ok) {
    const errorBody = await response.text();
    // Resilient fallback for third-party proxies that only accept a plain string system prompt
    if (Array.isArray(payload.system) && /system/i.test(errorBody) && /string|array/i.test(errorBody)) {
      payload.system = systemPrompt;
      const cleanHeaders = { ...headers };
      delete cleanHeaders['anthropic-beta'];
      const retryResponse = await fetchLLM(endpoint, {
        method: 'POST',
        headers: cleanHeaders,
        body: JSON.stringify(payload),
      }, 'Anthropic', signal);

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        const retryText = retryData.content && retryData.content.find((c: { type: string; text?: string }) => c.type === 'text');
        if (retryText && retryText.text) {
          return retryText.text;
        }
      }
    }
    throw new Error(`Anthropic API Error (${response.status}): ${redactSecrets(truncateErrorBody(errorBody), [config.apiKey])}`);
  }

  const data = await response.json();
  const textContent = data.content && data.content.find((c: { type: string; text?: string }) => c.type === 'text');
  if (!textContent || !textContent.text) {
    throw new Error('Anthropic returned an empty completion response');
  }

  return textContent.text;
}
