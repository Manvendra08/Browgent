import { LLMConfig } from '../background/llm/types';
import { fetchLLM } from '../background/llm/net';

export interface ModelFetchResult {
  models: string[];
  error?: string;
}

const OMNIROUTE_DEFAULT_BASE_URL = 'http://localhost:20128/v1/chat/completions';

/**
 * Derive the API root (…/v1) from a chat-completions style endpoint URL.
 * Handles both /v1/chat/completions and any custom suffix.
 */
function apiRootFromChatUrl(baseUrl: string): string {
  return baseUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
}

function isConfigurableErrorText(text: string): boolean {
  return /required|url/i.test(text);
}

export async function fetchAvailableModels(config: LLMConfig): Promise<ModelFetchResult> {
  const apiKey = (config.apiKey || '').trim();

  try {
    switch (config.provider) {
      case 'omniroute': {
        const base = config.baseUrl?.trim() || OMNIROUTE_DEFAULT_BASE_URL;
        const root = apiRootFromChatUrl(base);
        const headers: Record<string, string> = {};
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        const res = await fetchLLM(`${root}/models`, { headers }, 'OmniRoute');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { models: (data.data || []).map((m: { id: string }) => m.id).filter(Boolean) };
      }

      case 'openai':
      case 'openai-compat': {
        const base =
          config.baseUrl?.trim() ||
          (config.provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : '');
        if (!base) throw new Error('Endpoint Base URL is required for OpenAI Compatible providers');
        const root = apiRootFromChatUrl(base);
        if (!apiKey) throw new Error('API Key is required to list models');
        const res = await fetchLLM(
          `${root}/models`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          },
          'OpenAI-compatible endpoint',
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { models: (data.data || []).map((m: { id: string }) => m.id).filter(Boolean) };
      }

      case 'gemini': {
        if (!apiKey) throw new Error('Gemini API key is required to list models');
        const res = await fetchLLM(
          `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100`,
          { headers: { 'x-goog-api-key': apiKey } },
          'Gemini',
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const models = (data.models || [])
          .filter(
            (m: { supportedGenerationMethods?: string[] }) =>
              !m.supportedGenerationMethods ||
              m.supportedGenerationMethods.includes('generateContent'),
          )
          .map((m: { name: string }) => (m.name || '').replace(/^models\//, ''))
          .filter(Boolean);
        return { models };
      }

      case 'anthropic': {
        if (!apiKey) throw new Error('Anthropic API key is required to list models');
        const base = config.baseUrl?.trim() || 'https://api.anthropic.com/v1/messages';
        const root = base.replace(/\/v1\/messages\/?$/, '').replace(/\/$/, '');
        const res = await fetchLLM(
          `${root}/v1/models?limit=100`,
          {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
          },
          'Anthropic',
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { models: (data.data || []).map((m: { id: string }) => m.id).filter(Boolean) };
      }

      default:
        return {
          models: [],
          error: `Model listing not supported for provider "${config.provider}"`,
        };
    }
  } catch (err: unknown) {
    return {
      models: [],
      error: isConfigurableErrorText(err instanceof Error ? err.message : String(err))
        ? err instanceof Error
          ? err.message
          : String(err)
        : `Could not fetch models: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs?: number;
  message: string;
}

export async function testConnection(config: LLMConfig): Promise<ConnectionTestResult> {
  const start = performance.now();
  try {
    const res = await fetchAvailableModels(config);
    const latency = Math.round(performance.now() - start);
    if (res.error) {
      return { success: false, latencyMs: latency, message: res.error };
    }
    const count = res.models.length;
    return {
      success: true,
      latencyMs: latency,
      message:
        count > 0 ? `Connected (${latency}ms) • ${count} models found` : `Connected (${latency}ms)`,
    };
  } catch (err: unknown) {
    const latency = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, latencyMs: latency, message: `Connection failed: ${msg}` };
  }
}

export async function testMcpEndpoint(url: string): Promise<ConnectionTestResult> {
  const trimmed = url.trim();
  if (!trimmed) {
    return { success: false, message: 'MCP endpoint URL is required' };
  }
  const start = performance.now();
  try {
    const { McpClient } = await import('../background/mcp/client');
    const client = new McpClient(trimmed);
    const tools = await client.listTools();
    const latency = Math.round(performance.now() - start);
    return {
      success: true,
      latencyMs: latency,
      message: `Connected (${latency}ms) • ${tools.length} tools available`,
    };
  } catch (err: unknown) {
    const latency = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, latencyMs: latency, message: `MCP connection failed: ${msg}` };
  }
}
