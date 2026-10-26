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

const KNOWN_TEXT_ONLY_MODELS = new Set<string>();

export function isImageUnsupportedError(errorBody: string): boolean {
  return (
    /image input/i.test(errorBody) ||
    /Filter by Image Support/i.test(errorBody) ||
    /does not support image/i.test(errorBody) ||
    /image_url is only supported/i.test(errorBody) ||
    /modality:?\s*image/i.test(errorBody) ||
    /does not support vision/i.test(errorBody) ||
    /unsupported.*image/i.test(errorBody) ||
    /unsupported parameter.*image_url/i.test(errorBody)
  );
}

export function markModelAsTextOnly(provider?: string, model?: string): void {
  if (model) {
    KNOWN_TEXT_ONLY_MODELS.add(`${provider || 'openai'}:${model.trim().toLowerCase()}`);
  }
}

export function isModelTextOnly(provider?: string, model?: string): boolean {
  if (!model) return false;
  return KNOWN_TEXT_ONLY_MODELS.has(`${provider || 'openai'}:${model.trim().toLowerCase()}`);
}

export function clearKnownTextOnlyModels(): void {
  KNOWN_TEXT_ONLY_MODELS.clear();
}

export async function queryOpenAI(config: LLMConfig, messages: LLMMessage[], signal?: AbortSignal): Promise<string> {
  const endpoint = normalizeOpenAIEndpoint(config.baseUrl);
  const model = config.model || 'gpt-4o';
  const textOnly = isModelTextOnly(config.provider, model);

  const formatMessages = (msgs: LLMMessage[], includeImages: boolean) => {
    return msgs.map((m) => {
      if (includeImages && m.images && m.images.length > 0) {
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
  };

  const hasImages = !textOnly && messages.some((m) => m.images && m.images.length > 0);
  let formattedMessages = formatMessages(messages, hasImages);

  const payload: Record<string, unknown> = {
    model,
    messages: formattedMessages,
    temperature: config.temperature ?? 0.2,
    max_tokens: config.maxTokens ?? 4096,
    tool_choice: 'none',
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  }

  let response = await fetchLLM(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  }, 'OpenAI-compatible endpoint', signal);

  if (!response.ok) {
    const errorBody = await response.text();
    if (hasImages && isImageUnsupportedError(errorBody)) {
      console.warn(`[Browgent LLM] Model "${model}" does not support image input. Retrying in text-only DOM mode...`);
      markModelAsTextOnly(config.provider, model);

      formattedMessages = formatMessages(messages, false);
      payload.messages = formattedMessages;

      response = await fetchLLM(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }, 'OpenAI-compatible endpoint', signal);

      if (!response.ok) {
        const retryErrorBody = await response.text();
        throw new Error(`OpenAI API Error (${response.status}): ${redactSecrets(truncateErrorBody(retryErrorBody), [config.apiKey])}`);
      }
    } else {
      throw new Error(`OpenAI API Error (${response.status}): ${redactSecrets(truncateErrorBody(errorBody), [config.apiKey])}`);
    }
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
