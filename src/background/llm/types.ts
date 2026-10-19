import { AgentAction } from '../types';

export type ProviderType = 'omniroute' | 'openai' | 'openai-compat' | 'gemini' | 'anthropic';

export interface LLMConfig {
  provider: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 encoded data URLs
}

export interface AgentDecision {
  thought: string;
  action: AgentAction;
  actions?: AgentAction[];
  rawResponse?: string;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
}
