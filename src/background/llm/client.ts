import { LLMConfig, LLMMessage, AgentDecision } from './types';
import { parseAgentAction } from '../actions';
import { queryOmniRoute, resolveOmniRouteModel } from './omniroute';
import { queryOpenAI, isModelTextOnly, markModelAsTextOnly, clearKnownTextOnlyModels } from './openai';
import { queryGemini } from './gemini';
import { queryAnthropic } from './anthropic';

export { resolveOmniRouteModel, isModelTextOnly, markModelAsTextOnly, clearKnownTextOnlyModels };

export class ActionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionParseError';
  }
}

export function parseModelResponse(rawContent: string): AgentDecision {
  try {
    return parseModelResponseUnsafe(rawContent);
  } catch (err: unknown) {
    if (err instanceof ActionParseError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ActionParseError(msg);
  }
}

function parseModelResponseUnsafe(rawContent: string): AgentDecision {
  const trimmed = rawContent.trim();
  let thought = '';
  let actionJson = '';

  // 1. Look for ```json ... ``` code fence
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    actionJson = codeBlockMatch[1].trim();
    // Preceding text before code fence can be thought if not in json
    thought = trimmed.substring(0, codeBlockMatch.index).trim();
  } else {
    // 2. Look for raw JSON object { ... }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      actionJson = trimmed.substring(firstBrace, lastBrace + 1);
      thought = trimmed.substring(0, firstBrace).trim();
    } else {
      throw new Error(`Could not locate valid JSON action in model response: "${rawContent.substring(0, 100)}"`);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(actionJson);
  } catch {
    throw new Error(`Failed to parse extracted JSON block: "${actionJson.substring(0, 100)}"`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Extracted action block is not a valid JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  // If thought is explicitly specified inside JSON, prioritize it
  if (typeof obj.thought === 'string' && obj.thought.trim() !== '') {
    thought = obj.thought.trim();
  }

  // Check if multiple actions are returned in an array
  let actions: import('../types').AgentAction[] | undefined;
  if (Array.isArray(obj.actions)) {
    actions = (obj.actions as unknown[]).map((act) => parseAgentAction(JSON.stringify(act)));
  } else if (Array.isArray(obj.action)) {
    actions = (obj.action as unknown[]).map((act) => parseAgentAction(JSON.stringify(act)));
  }

  // Parse single action fallback
  let action: import('../types').AgentAction;
  if (actions && actions.length > 0) {
    action = actions[0];
  } else {
    let actionPayload: string;
    if (obj.action && typeof obj.action === 'object') {
      actionPayload = JSON.stringify(obj.action);
    } else {
      actionPayload = JSON.stringify(obj);
    }
    action = parseAgentAction(actionPayload);
    actions = [action];
  }

  return {
    thought: thought || 'Executing browser action',
    action,
    actions,
    rawResponse: rawContent,
  };
}

export async function queryLLMRaw(
  config: LLMConfig,
  messages: LLMMessage[],
  signal?: AbortSignal
): Promise<string> {
  switch (config.provider) {
    case 'omniroute':
      return queryOmniRoute(config, messages, signal);

    case 'openai':
    case 'openai-compat':
      return queryOpenAI(config, messages, signal);

    case 'gemini':
      return queryGemini(config, messages, signal);

    case 'anthropic':
      return queryAnthropic(config, messages, signal);

    default:
      throw new Error(`Unsupported LLM provider: "${config.provider}"`);
  }
}

export async function queryLLM(
  config: LLMConfig,
  messages: LLMMessage[],
  signal?: AbortSignal
): Promise<AgentDecision> {
  const responseText = await queryLLMRaw(config, messages, signal);
  return parseModelResponse(responseText);
}
