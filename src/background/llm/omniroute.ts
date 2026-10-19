import { LLMConfig, LLMMessage } from './types';
import { fetchLLM } from './net';

export const OMNIROUTE_DEFAULT_BASE_URL = 'http://localhost:20128/v1/chat/completions';

export const OMNIROUTE_ALIASES: Record<string, string> = {
  free: 'Claude/Free',
  kilo: 'Claude/Kilo-Models',
  anti: 'Claude/Antigravity',
  gp: 'Claude/GP-Models',
  bigp: 'oc/big-pickle',
  glm: 'Claude/GL-Deep-Kim',
};

export function resolveOmniRouteModel(aliasOrModel?: string): string {
  if (!aliasOrModel || aliasOrModel.trim() === '') {
    return 'Claude/Antigravity';
  }
  const clean = aliasOrModel.trim().toLowerCase();
  return OMNIROUTE_ALIASES[clean] || aliasOrModel;
}

export async function queryOmniRoute(config: LLMConfig, messages: LLMMessage[]): Promise<string> {
  const endpoint = config.baseUrl && config.baseUrl.trim() !== '' ? config.baseUrl : OMNIROUTE_DEFAULT_BASE_URL;
  const resolvedModel = resolveOmniRouteModel(config.model);

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
    model: resolvedModel,
    messages: formattedMessages,
    temperature: config.temperature ?? 0.2,
    max_tokens: config.maxTokens ?? 1024,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey && config.apiKey.trim() !== '') {
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  }

  const response = await fetchLLM(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  }, 'OmniRoute');

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OmniRoute API Error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('OmniRoute returned an empty or invalid completion format');
  }

  return choice.message.content;
}
