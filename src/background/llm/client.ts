import { LLMConfig, LLMMessage, AgentDecision } from './types';
import { parseAgentAction } from '../actions';
import { queryOmniRoute, resolveOmniRouteModel } from './omniroute';
import { queryOpenAI } from './openai';
import { queryGemini } from './gemini';
import { queryAnthropic } from './anthropic';

export { resolveOmniRouteModel };

export function parseModelResponse(rawContent: string): AgentDecision {
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

  // Parse action: could be nested inside `action: { action: ... }` or flat `{ action: 'click', ... }`
  let actionPayload: string;
  if (obj.action && typeof obj.action === 'object') {
    actionPayload = JSON.stringify(obj.action);
  } else {
    actionPayload = JSON.stringify(obj);
  }

  const action = parseAgentAction(actionPayload);

  return {
    thought: thought || 'Executing browser action',
    action,
    rawResponse: rawContent,
  };
}

export async function queryLLM(config: LLMConfig, messages: LLMMessage[]): Promise<AgentDecision> {
  let responseText: string;

  switch (config.provider) {
    case 'omniroute':
      responseText = await queryOmniRoute(config, messages);
      break;

    case 'openai':
      responseText = await queryOpenAI(config, messages);
      break;

    case 'gemini':
      responseText = await queryGemini(config, messages);
      break;

    case 'anthropic':
      responseText = await queryAnthropic(config, messages);
      break;

    default:
      throw new Error(`Unsupported LLM provider: "${config.provider}"`);
  }

  return parseModelResponse(responseText);
}
