import {
  AgentAction,
  ClickAction,
  TypeAction,
  SelectOptionAction,
  PressKeyAction,
  HoverAction,
  ScrollAction,
  NavigateAction,
  FinishAction,
  FailAction,
  WaitAction,
  McpCallAction,
} from './types';
import { PerceivedElement } from '../content/types';
import {
  attachDebugger,
  dispatchClick,
  dispatchType,
  dispatchScroll,
  dispatchHover,
  dispatchKeyPress,
  navigateToUrl,
} from './cdp';
import { isRestrictedUrl } from './restricted';

export const MAX_WAIT_SECONDS = 10;

export interface ElementRectPayload {
  x: number;
  y: number;
  width: number;
  height: number;
}

function resolveElementId(obj: Record<string, unknown>, actionName: string): number {
  const candidate = typeof obj.elementId === 'number' ? obj.elementId : obj.index;
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new Error(`${actionName} action requires numeric "elementId"`);
  }
  return candidate;
}

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
      return {
        action: 'click',
        elementId: resolveElementId(obj, 'Click'),
      } as ClickAction;
    }

    case 'type': {
      const elementId = resolveElementId(obj, 'Type');
      if (typeof obj.text !== 'string') {
        throw new Error('Type action requires string "text"');
      }
      return {
        action: 'type',
        elementId,
        text: obj.text,
        pressEnter: Boolean(obj.pressEnter),
      } as TypeAction;
    }

    case 'select_option': {
      const elementId = resolveElementId(obj, 'SelectOption');
      if (typeof obj.value !== 'string') {
        throw new Error('SelectOption action requires string "value"');
      }
      return {
        action: 'select_option',
        elementId,
        value: obj.value,
      } as SelectOptionAction;
    }

    case 'press_key': {
      if (typeof obj.key !== 'string' || !obj.key.trim()) {
        throw new Error('PressKey action requires string "key"');
      }
      return {
        action: 'press_key',
        key: obj.key.trim(),
      } as PressKeyAction;
    }

    case 'hover': {
      return {
        action: 'hover',
        elementId: resolveElementId(obj, 'Hover'),
      } as HoverAction;
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
      const url = typeof obj.url === 'string' ? obj.url.trim() : '';
      if (isRestrictedUrl(url)) {
        throw new Error(
          `Navigate action blocked: "${url}" targets an internal, local-file or metadata address that the agent must not open`
        );
      }
      if (!/^https?:\/\//i.test(url)) {
        throw new Error('Navigate action requires a valid HTTP/HTTPS "url"');
      }
      return {
        action: 'navigate',
        url,
      } as NavigateAction;
    }

    case 'wait': {
      const rawSeconds = typeof obj.seconds === 'number' ? obj.seconds : 2;
      const seconds = Math.min(Math.max(rawSeconds, 0), MAX_WAIT_SECONDS);
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

    case 'mcp_call': {
      if (typeof obj.tool !== 'string' || obj.tool.trim() === '') {
        throw new Error('MCP tool call requires a non-empty "tool" name');
      }
      let args: Record<string, unknown> = {};
      if (obj.args !== undefined) {
        if (!obj.args || typeof obj.args !== 'object' || Array.isArray(obj.args)) {
          throw new Error('MCP tool call "args" must be a JSON object');
        }
        args = obj.args as Record<string, unknown>;
      }
      return {
        action: 'mcp_call',
        tool: obj.tool,
        args,
      } as McpCallAction;
    }

    default:
      throw new Error(`Unsupported action type: "${action}"`);
  }
}

function sendDomAction(
  tabId: number,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string; rect?: ElementRectPayload }> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.sendMessage) {
      resolve({ success: false, error: 'chrome.tabs unavailable' });
      return;
    }
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError || !response) {
        resolve({ success: false, error: chrome.runtime.lastError?.message || 'no response' });
        return;
      }
      if (!response.success) {
        resolve({ success: false, error: response.error || 'DOM action failed' });
        return;
      }
      resolve({
        success: true,
        rect: response.rect,
      });
    });
  });
}

function elementCenter(rect: ElementRectPayload): { x: number; y: number } {
  return {
    x: rect.x + (rect.width > 0 ? rect.width / 2 : 10),
    y: rect.y + (rect.height > 0 ? rect.height / 2 : 10),
  };
}

async function getFreshElementRect(tabId: number, elementId: number): Promise<ElementRectPayload | null> {
  const result = await sendDomAction(tabId, { type: 'GET_ELEMENT_RECT', elementId });
  return result.success && result.rect ? result.rect : null;
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

        let initialUrl: string | undefined;
        if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.get === 'function') {
          try {
            const initialTab = await chrome.tabs.get(tabId);
            initialUrl = initialTab?.url;
          } catch {
            // ignore
          }
        }

        // 1. Primary: in-tab DOM click (handles React/SPA synthetic events, visual cursor/ripple, radio/checkbox)
        const domResult = await sendDomAction(tabId, {
          type: 'CLICK_ELEMENT',
          elementId: action.elementId,
        });

        // If the message channel closed or reported bfcache because the click initiated page navigation:
        if (!domResult.success && typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.get === 'function') {
          try {
            const currentTab = await chrome.tabs.get(tabId);
            const urlChanged = Boolean(initialUrl && currentTab?.url && currentTab.url !== initialUrl);
            const isLoading = currentTab?.status === 'loading';
            const isBfCacheError = Boolean(
              domResult.error && (
                domResult.error.includes('back/forward cache') ||
                domResult.error.includes('message channel closed')
              )
            );
            if (urlChanged || isLoading || isBfCacheError) {
              return { success: true };
            }
          } catch {
            // ignore
          }
        }

        if (domResult.success) {
          return { success: true };
        }

        // 2. Fallback: single CDP hardware click (never both — avoids double events)
        const freshRect = await getFreshElementRect(tabId, action.elementId);
        if (!freshRect) {
          if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.get === 'function') {
            try {
              const currentTab = await chrome.tabs.get(tabId);
              if (currentTab?.status === 'loading' || (initialUrl && currentTab?.url && currentTab.url !== initialUrl)) {
                return { success: true };
              }
            } catch {
              // ignore
            }
          }
          return {
            success: false,
            error: `Element with id [${action.elementId}] is no longer clickable (stale element, refusing to click stale coordinates)`,
          };
        }
        await attachDebugger(tabId);
        const center = elementCenter(freshRect);
        await dispatchClick(tabId, center.x, center.y);

        return { success: true };
      }

      case 'type': {
        const target = elements.find((el) => el.id === action.elementId);
        if (!target) {
          throw new Error(`Element with id [${action.elementId}] not found in perception tree`);
        }

        let initialUrl: string | undefined;
        if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.get === 'function') {
          try {
            const initialTab = await chrome.tabs.get(tabId);
            initialUrl = initialTab?.url;
          } catch {
            // ignore
          }
        }

        // 1. Primary: in-tab DOM set value + input/change events (no re-typing)
        const domResult = await sendDomAction(tabId, {
          type: 'TYPE_ELEMENT',
          elementId: action.elementId,
          text: action.text,
          pressEnter: action.pressEnter,
        });

        // If typing + Enter initiated page navigation / form submit, handle transition cleanly:
        if (!domResult.success && typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.get === 'function') {
          try {
            const currentTab = await chrome.tabs.get(tabId);
            const urlChanged = Boolean(initialUrl && currentTab?.url && currentTab.url !== initialUrl);
            const isLoading = currentTab?.status === 'loading';
            const isBfCacheError = Boolean(
              domResult.error && (
                domResult.error.includes('back/forward cache') ||
                domResult.error.includes('message channel closed')
              )
            );
            if (urlChanged || isLoading || isBfCacheError) {
              return { success: true };
            }
          } catch {
            // ignore
          }
        }

        if (domResult.success) {
          return { success: true };
        }

        // 2. Fallback: CDP focus click + hardware typing
        const freshRect = await getFreshElementRect(tabId, action.elementId);
        if (!freshRect) {
          return {
            success: false,
            error: `Element with id [${action.elementId}] is no longer typeable (stale element, refusing to act on stale coordinates)`,
          };
        }
        await attachDebugger(tabId);
        const center = elementCenter(freshRect);
        await dispatchClick(tabId, center.x, center.y);
        await new Promise((r) => setTimeout(r, 100));
        await dispatchType(tabId, action.text, action.pressEnter);

        return { success: true };
      }

      case 'select_option': {
        const target = elements.find((el) => el.id === action.elementId);
        if (!target) {
          throw new Error(`Element with id [${action.elementId}] not found in perception tree`);
        }
        const domResult = await sendDomAction(tabId, {
          type: 'SELECT_OPTION',
          elementId: action.elementId,
          value: action.value,
        });
        if (domResult.success) {
          return { success: true };
        }
        return { success: false, error: domResult.error || `Failed to select option on element [${action.elementId}]` };
      }

      case 'press_key': {
        try {
          await dispatchKeyPress(tabId, action.key);
          return { success: true };
        } catch {
          // Fallback to in-tab keyboard event if CDP is unavailable
          const domResult = await sendDomAction(tabId, {
            type: 'PRESS_KEY',
            key: action.key,
          });
          return domResult.success
            ? { success: true }
            : { success: false, error: domResult.error || `Failed to press key "${action.key}"` };
        }
      }

      case 'hover': {
        const target = elements.find((el) => el.id === action.elementId);
        if (!target) {
          throw new Error(`Element with id [${action.elementId}] not found in perception tree`);
        }
        const domResult = await sendDomAction(tabId, {
          type: 'HOVER_ELEMENT',
          elementId: action.elementId,
        });
        const freshRect = await getFreshElementRect(tabId, action.elementId);
        if (freshRect) {
          try {
            const center = elementCenter(freshRect);
            await dispatchHover(tabId, center.x, center.y);
          } catch {
            // Ignore CDP hover failure
          }
        }
        return domResult.success
          ? { success: true }
          : { success: false, error: domResult.error || `Failed to hover element [${action.elementId}]` };
      }

      case 'scroll': {
        const delta = action.direction === 'up' ? -(action.amount || 500) : action.amount || 500;
        await dispatchScroll(tabId, delta);
        return { success: true };
      }

      case 'navigate': {
        if (isRestrictedUrl(action.url)) {
          return {
            success: false,
            error: `Navigation blocked: "${action.url}" targets an internal, local-file or metadata address`,
          };
        }
        await navigateToUrl(tabId, action.url);
        return { success: true };
      }

      case 'wait': {
        const ms = (action.seconds ?? 2) * 1000;
        await new Promise((r) => setTimeout(r, ms));
        return { success: true };
      }

      case 'finish': {
        return { success: true, isTerminal: true, summary: action.summary };
      }

      case 'fail': {
        return { success: false, isTerminal: true, error: action.reason };
      }

      case 'mcp_call': {
        // Handled by AgentController (needs the McpClient instance)
        return { success: false, error: 'MCP tool calls are dispatched by the agent controller' };
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}
