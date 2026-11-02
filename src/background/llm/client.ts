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

export function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim();

  // 1. Fast path: native JSON.parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue to repair heuristics
  }

  // 2. Clean single-line (//...) and multi-line (/*...*/) comments and trailing commas
  let cleaned = trimmed
    .replace(/\/\/[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // continue
  }

  // 3. Handle unescaped double quotes inside "thought" value:
  // e.g. {"thought": "The Start button was clicked. The page now says "Select Language" ...", "action": { ... }}
  const actionKeyMatch = cleaned.match(/,\s*"(actions?)"\s*:\s*([\s\S]+)$/i);
  if (actionKeyMatch && actionKeyMatch.index !== undefined) {
    const thoughtPart = cleaned.substring(0, actionKeyMatch.index);
    const actionKey = actionKeyMatch[1];
    let actionPart = actionKeyMatch[2].trim();

    // If actionPart ends with the outer closing brace '}', strip it
    if (actionPart.endsWith('}')) {
      actionPart = actionPart.slice(0, -1).trim();
    }

    try {
      const parsedActionValue = JSON.parse(actionPart.replace(/,\s*([}\]])/g, '$1'));
      let extractedThought = '';
      const thoughtValMatch = thoughtPart.match(/"thought"\s*:\s*"([\s\S]*)/i);
      if (thoughtValMatch) {
        extractedThought = thoughtValMatch[1].replace(/"\s*$/, '').trim();
      }
      return {
        thought: extractedThought || 'Executing recovered action',
        [actionKey]: parsedActionValue,
      };
    } catch {
      // continue
    }
  }

  // 4. Handle raw control characters / newlines inside string values
  const escapedNewlines = cleaned.replace(/(?<=:\s*"[^"]*)\r?\n(?=[^"]*")/g, '\\n');
  try {
    return JSON.parse(escapedNewlines.replace(/,\s*([}\]])/g, '$1'));
  } catch {
    // continue
  }

  // 5. Balance missing closing quotes / braces / brackets from truncated outputs
  let balanced = cleaned;
  const quoteCount = (balanced.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    balanced += '"';
  }
  const openB = (balanced.match(/\{/g) || []).length;
  const closeB = (balanced.match(/\}/g) || []).length;
  for (let i = 0; i < openB - closeB; i++) {
    balanced += '}';
  }
  const openBrackets = (balanced.match(/\[/g) || []).length;
  const closeBrackets = (balanced.match(/\]/g) || []).length;
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    balanced += ']';
  }
  try {
    return JSON.parse(balanced.replace(/,\s*([}\]])/g, '$1'));
  } catch {
    // continue
  }

  // 6. Direct action/actions recovery regex
  const directActionMatch = cleaned.match(/"action"\s*:\s*(\{\s*"action"\s*:\s*"[^"]+"[\s\S]*?\})/i);
  if (directActionMatch) {
    try {
      const actObj = JSON.parse(directActionMatch[1].replace(/,\s*([}\]])/g, '$1'));
      return { thought: 'Executing recovered action', action: actObj };
    } catch {
      // continue
    }
  }

  const directActionsMatch = cleaned.match(/"actions"\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/i);
  if (directActionsMatch) {
    try {
      const actsArr = JSON.parse(directActionsMatch[1].replace(/,\s*([}\]])/g, '$1'));
      return { thought: 'Executing recovered actions', actions: actsArr };
    } catch {
      // continue
    }
  }

  return null;
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
    } else if (firstBrace !== -1) {
      actionJson = trimmed.substring(firstBrace);
      thought = trimmed.substring(0, firstBrace).trim();
    } else {
      throw new Error(`Could not locate valid JSON action in model response: "${rawContent.substring(0, 100)}"`);
    }
  }

  const parsed = tryParseJson(actionJson);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Failed to parse extracted JSON block: "${actionJson.substring(0, 100)}"`);
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
