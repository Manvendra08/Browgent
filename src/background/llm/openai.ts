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
    /images are not supported/i.test(errorBody) ||
    /image_url is only supported/i.test(errorBody) ||
    /unsupported parameter:?\s*['"]?image/i.test(errorBody) ||
    /unsupported.*image/i.test(errorBody) ||
    /modality:?\s*image/i.test(errorBody) ||
    /does not support vision/i.test(errorBody) ||
    /vision.*not supported/i.test(errorBody) ||
    /multimodal.*not supported/i.test(errorBody) ||
    /model.*only.*supports? text/i.test(errorBody) ||
    /no endpoint.*support.*image/i.test(errorBody) ||
    /invalid_request_error.*image/i.test(errorBody) ||
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

export function extractChoiceContent(choice?: {
  finish_reason?: string | null;
  message?: {
    content?: string | null | Array<{ type?: string; text?: string }>;
    reasoning?: string | null;
    reasoning_content?: string | null;
    thought?: string | null;
    tool_calls?: Array<{
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
}): string | null {
  if (!choice || !choice.message) return null;
  const msg = choice.message;

  // 1. Direct string content
  if (typeof msg.content === 'string' && msg.content.trim()) {
    return msg.content.trim();
  }

  // 2. Array of content parts (e.g. [{ type: 'text', text: '...' }])
  if (Array.isArray(msg.content)) {
    const textPart = msg.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
    if (textPart) return textPart;
  }

  // 3. Tool calls / function calling fallback
  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    const firstCall = msg.tool_calls[0];
    const funcArgs = firstCall.function?.arguments || '{}';
    return `\`\`\`json\n{\n  "thought": "Invoking ${firstCall.function?.name || 'tool'}",\n  "action": ${funcArgs}\n}\n\`\`\``;
  }

  // 4. Reasoning / Thinking models fallback (DeepSeek-R1, Qwen-Thinking, Nemotron)
  if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()) {
    return msg.reasoning_content.trim();
  }
  if (typeof msg.reasoning === 'string' && msg.reasoning.trim()) {
    return msg.reasoning.trim();
  }
  if (typeof msg.thought === 'string' && msg.thought.trim()) {
    return msg.thought.trim();
  }

  return null;
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
  let content = extractChoiceContent(choice);

  // If response was 200 OK but content is empty, AND images were included:
  // Many free or weaker models (e.g., kilo-auto/free, Nemotron, local endpoints) accept images with 200 OK
  // but silently fail to produce any output tokens. Retry once in text-only DOM mode.
  if (!content && hasImages) {
    console.warn(`[Browgent LLM] Model "${model}" returned empty completion with vision input. Retrying in text-only DOM mode...`);
    markModelAsTextOnly(config.provider, model);

    formattedMessages = formatMessages(messages, false);
    payload.messages = formattedMessages;

    response = await fetchLLM(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }, 'OpenAI-compatible endpoint', signal);

    if (response.ok) {
      const retryData = await response.json();
      const retryChoice = retryData.choices && retryData.choices[0];
      content = extractChoiceContent(retryChoice);
    }
  }

  if (!content) {
    const finishReason = choice?.finish_reason ? ` (finish_reason: "${choice.finish_reason}")` : '';
    throw new Error(
      `OpenAI returned an empty completion for model "${model}"${finishReason}. Upstream model generated 0 content tokens or exhausted budget in reasoning.`
    );
  }

  return content;
}
