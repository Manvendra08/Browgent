import { LLMConfig, LLMMessage } from './types';
import { fetchLLM, redactSecrets, truncateErrorBody } from './net';

export const OMNIROUTE_DEFAULT_BASE_URL = 'http://localhost:20128/v1/chat/completions';

export function normalizeOmniRouteEndpoint(baseUrl?: string): string {
  if (!baseUrl || baseUrl.trim() === '') {
    return OMNIROUTE_DEFAULT_BASE_URL;
  }
  let clean = baseUrl.trim().replace(/\/+$/, '');
  // Strip trailing /models if user accidentally pasted the models URL
  clean = clean.replace(/\/models$/, '');
  // If it already ends with /chat/completions, return it
  if (clean.endsWith('/chat/completions')) {
    return clean;
  }
  // If it ends with /v1, append /chat/completions
  if (clean.endsWith('/v1')) {
    return `${clean}/chat/completions`;
  }
  // If it's a bare origin or root (e.g. http://localhost:20128), append /v1/chat/completions
  return `${clean}/v1/chat/completions`;
}

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
  const clean = aliasOrModel.trim().toLowerCase().replace(/^\//, '');
  return OMNIROUTE_ALIASES[clean] || aliasOrModel;
}

export async function queryOmniRoute(config: LLMConfig, messages: LLMMessage[], signal?: AbortSignal): Promise<string> {
  const endpoint = normalizeOmniRouteEndpoint(config.baseUrl);
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

  const payload: Record<string, unknown> = {
    model: resolvedModel,
    messages: formattedMessages,
    temperature: config.temperature ?? 0.2,
    max_tokens: config.maxTokens ?? 1024,
    tool_choice: 'none',
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
  }, 'OmniRoute', signal);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OmniRoute API Error (${response.status}): ${redactSecrets(truncateErrorBody(errorBody), [config.apiKey])}`);
  }

  const data = await response.json();
  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) {
    throw new Error('OmniRoute returned an empty or invalid completion format');
  }

  let content = choice.message.content;
  if (!content && Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length > 0) {
    const firstCall = choice.message.tool_calls[0];
    const funcArgs = firstCall.function?.arguments || '{}';
    content = `\`\`\`json\n{\n  "thought": "Invoking ${firstCall.function?.name || 'tool'}",\n  "action": ${funcArgs}\n}\n\`\`\``;
  }

  if (!content) {
    throw new Error('OmniRoute returned an empty or invalid completion format');
  }

  return content;
}
