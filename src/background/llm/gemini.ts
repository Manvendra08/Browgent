import { LLMConfig, LLMMessage } from './types';

export async function queryGemini(config: LLMConfig, messages: LLMMessage[]): Promise<string> {
  const model = config.model || 'gemini-2.5-flash';
  const apiKey = config.apiKey ? config.apiKey.trim() : '';

  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let systemInstruction: string | undefined;
  const contents: unknown[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemInstruction = m.content;
      continue;
    }

    const parts: unknown[] = [{ text: m.content }];

    if (m.images && m.images.length > 0) {
      for (const img of m.images) {
        // img can be data:image/png;base64,...
        const match = img.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }
    }

    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    });
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: config.temperature ?? 0.2,
      maxOutputTokens: config.maxTokens ?? 1024,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const candidate = data.candidates && data.candidates[0];
  const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];

  if (!part || !part.text) {
    throw new Error('Gemini returned an empty completion response');
  }

  return part.text;
}
