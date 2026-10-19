import { LLMConfig, LLMMessage } from './types';
import { fetchLLM } from './net';

export async function queryOpenAI(config: LLMConfig, messages: LLMMessage[]): Promise<string> {
  const endpoint = config.baseUrl && config.baseUrl.trim() !== ''
    ? config.baseUrl
    : 'https://api.openai.com/v1/chat/completions';

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

  const payload = {
    model: config.model || 'gpt-4o',
    messages: formattedMessages,
    temperature: config.temperature ?? 0.2,
    max_tokens: config.maxTokens ?? 1024,
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
  }, 'OpenAI-compatible endpoint');

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API Error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('OpenAI returned an empty completion');
  }

  return choice.message.content;
}
