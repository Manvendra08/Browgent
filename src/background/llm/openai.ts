import { LLMConfig, LLMMessage } from './types';
import { fetchLLM, redactSecrets, truncateErrorBody } from './net';

export function normalizeOpenAIEndpoint(baseUrl?: string): string {
  if (!baseUrl || baseUrl.trim() === '') {
    return 'https://api.openai.com/v1/chat/completions';
  }
  let clean = baseUrl.trim().replace(/\/+$/, '');
  clean = clean.replace(/\/models$/, '');
  if (clean.endsWith('/chat/completions')) {
    return clean;
  }
  if (clean.endsWith('/v1')) {
    return `${clean}/chat/completions`;
  }
  return `${clean}/v1/chat/completions`;
}

export async function queryOpenAI(config: LLMConfig, messages: LLMMessage[], signal?: AbortSignal): Promise<string> {
  const endpoint = normalizeOpenAIEndpoint(config.baseUrl);

  const formattedMessages = messages.map((m) => {
    if (m.images && m.images.length > 0) {
      const parts: unknown[] = [{ type: 'text', text: m.content }];
      for (const img of m.images) {
        parts.push({
          type: 'image_url',
          image_url: { url: img },
        });
      }
      return { role: m.role, content: parts };
    }
    return { role: m.role, content: m.content };
  });

  const payload: Record<string, unknown> = {
    model: config.model || 'gpt-4o',
    messages: formattedMessages,
    temperature: config.temperature ?? 0.2,
    max_tokens: config.maxTokens ?? 1024,
    tool_choice: 'none',
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  }

  const response = await fetchLLM(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  }, 'OpenAI-compatible endpoint', signal);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API Error (${response.status}): ${redactSecrets(truncateErrorBody(errorBody), [config.apiKey])}`);
  }

  const data = await response.json();
  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) {
    throw new Error('OpenAI returned an empty completion');
  }

  let content = choice.message.content;
  if (!content && Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length > 0) {
    const firstCall = choice.message.tool_calls[0];
    const funcArgs = firstCall.function?.arguments || '{}';
    content = `\`\`\`json\n{\n  "thought": "Invoking ${firstCall.function?.name || 'tool'}",\n  "action": ${funcArgs}\n}\n\`\`\``;
  }

  if (!content) {
    throw new Error('OpenAI returned an empty completion');
  }

  return content;
}
