import { AgentAction, ClickAction, TypeAction, ScrollAction, NavigateAction, FinishAction, FailAction, WaitAction } from './types';
import { PerceivedElement } from '../content/types';
import { attachDebugger, dispatchClick, dispatchType, dispatchScroll, navigateToUrl } from './cdp';

export function parseAgentAction(raw: string): AgentAction {
  let cleaned = raw.trim();

  // Extract from markdown code fences if present
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse agent action as JSON: "${raw.substring(0, 100)}"`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Action payload must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  const action = obj.action;

  if (typeof action !== 'string') {
    throw new Error('Missing "action" field in payload');
  }

  switch (action) {
    case 'click': {
      if (typeof obj.elementId !== 'number') {
        throw new Error('Click action requires numeric "elementId"');
      }
      return {
        action: 'click',
        elementId: obj.elementId,
      } as ClickAction;
    }

    case 'type': {
      if (typeof obj.elementId !== 'number') {
        throw new Error('Type action requires numeric "elementId"');
      }
      if (typeof obj.text !== 'string') {
        throw new Error('Type action requires string "text"');
      }
      return {
        action: 'type',
        elementId: obj.elementId,
        text: obj.text,
        pressEnter: Boolean(obj.pressEnter),
      } as TypeAction;
    }

    case 'scroll': {
      const direction = obj.direction === 'up' ? 'up' : 'down';
      const amount = typeof obj.amount === 'number' ? obj.amount : 500;
      return {
        action: 'scroll',
        direction,
        amount,
      } as ScrollAction;
    }

    case 'navigate': {
      if (typeof obj.url !== 'string' || !obj.url.startsWith('http')) {
        throw new Error('Navigate action requires a valid HTTP/HTTPS "url"');
      }
      return {
        action: 'navigate',
        url: obj.url,
      } as NavigateAction;
    }

    case 'wait': {
      const seconds = typeof obj.seconds === 'number' ? obj.seconds : 2;
      return {
        action: 'wait',
        seconds,
      } as WaitAction;
    }

    case 'finish': {
      if (typeof obj.summary !== 'string') {
        throw new Error('Finish action requires string "summary"');
      }
      return {
        action: 'finish',
        summary: obj.summary,
      } as FinishAction;
    }

    case 'fail': {
      const reason = typeof obj.reason === 'string' ? obj.reason : 'Action failed';
      return {
        action: 'fail',
        reason,
      } as FailAction;
    }

    default:
      throw new Error(`Unsupported action type: "${action}"`);
  }
}

export async function executeAgentAction(
  tabId: number,
  action: AgentAction,
  elements: PerceivedElement[]
): Promise<{ success: boolean; error?: string; isTerminal?: boolean; summary?: string }> {
  try {
    switch (action.action) {
      case 'click': {
        const target = elements.find((el) => el.id === action.elementId);
        if (!target) {
          throw new Error(`Element with id [${action.elementId}] not found in perception tree`);
        }
        await attachDebugger(tabId);
        // Click at center of element bounding rect
        const centerX = target.rect.x + (target.rect.width > 0 ? target.rect.width / 2 : 10);
        const centerY = target.rect.y + (target.rect.height > 0 ? target.rect.height / 2 : 10);
        await dispatchClick(tabId, centerX, centerY);
        return { success: true };
      }

      case 'type': {
        const target = elements.find((el) => el.id === action.elementId);
        if (!target) {
          throw new Error(`Element with id [${action.elementId}] not found in perception tree`);
        }
        await attachDebugger(tabId);
        // Focus element first
        const centerX = target.rect.x + (target.rect.width > 0 ? target.rect.width / 2 : 10);
        const centerY = target.rect.y + (target.rect.height > 0 ? target.rect.height / 2 : 10);
        await dispatchClick(tabId, centerX, centerY);
        await new Promise((r) => setTimeout(r, 100));
        await dispatchType(tabId, action.text, action.pressEnter);
        return { success: true };
      }

      case 'scroll': {
        const delta = action.direction === 'up' ? -(action.amount || 500) : action.amount || 500;
        await dispatchScroll(tabId, delta);
        return { success: true };
      }

      case 'navigate': {
        await navigateToUrl(tabId, action.url);
        return { success: true };
      }

      case 'wait': {
        const ms = (action.seconds || 2) * 1000;
        await new Promise((r) => setTimeout(r, ms));
        return { success: true };
      }

      case 'finish': {
        return { success: true, isTerminal: true, summary: action.summary };
      }

      case 'fail': {
        return { success: false, isTerminal: true, error: action.reason };
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}
