import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAgentAction, executeAgentAction } from '../../src/background/actions';
import type { PerceivedElement } from '../../src/content/types';

vi.mock('../../src/background/cdp', () => ({
  attachDebugger: vi.fn(),
  detachDebugger: vi.fn(),
  dispatchClick: vi.fn(),
  dispatchType: vi.fn(),
  dispatchScroll: vi.fn(),
  sendCdpCommand: vi.fn(),
  navigateToUrl: vi.fn(),
}));

import {
  attachDebugger,
  dispatchClick,
  dispatchType,
  dispatchScroll,
  navigateToUrl,
} from '../../src/background/cdp';

const mockedAttachDebugger = vi.mocked(attachDebugger);
const mockedDispatchClick = vi.mocked(dispatchClick);
const mockedDispatchType = vi.mocked(dispatchType);
const mockedDispatchScroll = vi.mocked(dispatchScroll);
const mockedNavigateToUrl = vi.mocked(navigateToUrl);

interface DomRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DomResponse {
  success: boolean;
  error?: string;
  rect?: DomRect;
}

type DomResponder = (payload: Record<string, unknown>) => DomResponse;

const TAB_ID = 7;

const ELEMENTS: PerceivedElement[] = [
  { id: 1, tagName: 'BUTTON', text: 'Buy now', rect: { x: 10, y: 20, width: 40, height: 20 } },
  { id: 2, tagName: 'INPUT', text: '', type: 'text', rect: { x: 0, y: 0, width: 0, height: 0 } },
];

let domResponder: DomResponder;
let sendMessage: ReturnType<typeof vi.fn>;
let debuggerAttach: ReturnType<typeof vi.fn>;

beforeEach(() => {
  domResponder = () => ({ success: false, error: 'unsupported message' });

  sendMessage = vi.fn(
    (_tabId: number, payload: Record<string, unknown>, callback: (response: DomResponse) => void) => {
      callback(domResponder(payload));
    }
  );

  debuggerAttach = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal('chrome', {
    tabs: {
      sendMessage,
      update: vi.fn(),
    },
    runtime: { lastError: undefined },
    debugger: {
      attach: debuggerAttach,
      detach: vi.fn(),
      sendCommand: vi.fn(),
      onDetach: { addListener: vi.fn() },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Action Parser', () => {
  it('parses valid click action JSON', () => {
    const raw = JSON.stringify({ action: 'click', elementId: 3 });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'click', elementId: 3 });
  });

  it('parses type action with enter flag', () => {
    const raw = JSON.stringify({ action: 'type', elementId: 1, text: 'headphones', pressEnter: true });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'type', elementId: 1, text: 'headphones', pressEnter: true });
  });

  it('parses scroll action with defaults', () => {
    const raw = JSON.stringify({ action: 'scroll', direction: 'down' });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'scroll', direction: 'down', amount: 500 });
  });

  it('parses navigate action', () => {
    const raw = JSON.stringify({ action: 'navigate', url: 'https://example.com' });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'navigate', url: 'https://example.com' });
  });

  it('parses terminal finish action', () => {
    const raw = JSON.stringify({ action: 'finish', summary: 'Found the product price: $99' });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'finish', summary: 'Found the product price: $99' });
  });

  it('extracts embedded JSON from markdown code fences', () => {
    const raw = `Here is my thought.
\`\`\`json
{
  "action": "click",
  "elementId": 7
}
\`\`\``;
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({ action: 'click', elementId: 7 });
  });

  it('rejects invalid action schemas gracefully', () => {
    expect(() => parseAgentAction('invalid json')).toThrow();
    expect(() => parseAgentAction(JSON.stringify({ action: 'unknown_action' }))).toThrow();
  });

  it('parses mcp_call action with tool and args', () => {
    const raw = JSON.stringify({
      action: 'mcp_call',
      tool: 'weather.lookup',
      args: { city: 'Tokyo' },
    });
    const parsed = parseAgentAction(raw);
    expect(parsed).toEqual({
      action: 'mcp_call',
      tool: 'weather.lookup',
      args: { city: 'Tokyo' },
    });
  });

  it('defaults mcp_call args to empty object and rejects invalid shapes', () => {
    expect(parseAgentAction(JSON.stringify({ action: 'mcp_call', tool: 'search' }))).toEqual({
      action: 'mcp_call',
      tool: 'search',
      args: {},
    });
    expect(() => parseAgentAction(JSON.stringify({ action: 'mcp_call' }))).toThrow();
    expect(() => parseAgentAction(JSON.stringify({ action: 'mcp_call', tool: 'x', args: [1] }))).toThrow();
  });
});

describe('executeAgentAction', () => {
  it('clicks via the DOM path without ever touching the debugger', async () => {
    domResponder = (payload) => {
      if (payload.type === 'CLICK_ELEMENT') {
        return { success: true };
      }
      return { success: false, error: 'unexpected message type' };
    };

    const result = await executeAgentAction(TAB_ID, { action: 'click', elementId: 1 }, ELEMENTS);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockedAttachDebugger).not.toHaveBeenCalled();
    expect(debuggerAttach).not.toHaveBeenCalled();
    expect(mockedDispatchClick).not.toHaveBeenCalled();

    // Exactly one click is dispatched — no double-fire through the CDP fallback.
    const messageTypes = sendMessage.mock.calls.map((call) => (call[1] as Record<string, unknown>).type);
    expect(messageTypes).toEqual(['CLICK_ELEMENT']);
  });

  it('falls back to a single CDP click using the rect returned by GET_ELEMENT_RECT', async () => {
    domResponder = (payload) => {
      if (payload.type === 'GET_ELEMENT_RECT') {
        return { success: true, rect: { x: 100, y: 200, width: 40, height: 20 } };
      }
      return { success: false, error: 'no such node' };
    };

    const result = await executeAgentAction(TAB_ID, { action: 'click', elementId: 1 }, ELEMENTS);

    expect(result.success).toBe(true);
    expect(mockedAttachDebugger).toHaveBeenCalledTimes(1);
    expect(mockedAttachDebugger).toHaveBeenCalledWith(TAB_ID);
    // Centre of the fresh rect: x = 100 + 40/2, y = 200 + 20/2
    expect(mockedDispatchClick).toHaveBeenCalledTimes(1);
    expect(mockedDispatchClick).toHaveBeenCalledWith(TAB_ID, 120, 210);
    expect(debuggerAttach).not.toHaveBeenCalled();
  });

  it('refuses to click stale coordinates when the DOM path and GET_ELEMENT_RECT both fail', async () => {
    domResponder = () => ({ success: false, error: 'no such node' });

    const result = await executeAgentAction(TAB_ID, { action: 'click', elementId: 1 }, ELEMENTS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('stale element');
    expect(mockedAttachDebugger).not.toHaveBeenCalled();
    expect(mockedDispatchClick).not.toHaveBeenCalled();
  });

  it('fails a click whose elementId is missing from the perception tree', async () => {
    const result = await executeAgentAction(TAB_ID, { action: 'click', elementId: 99 }, ELEMENTS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found in perception tree');
    expect(sendMessage).not.toHaveBeenCalled();
    expect(mockedDispatchClick).not.toHaveBeenCalled();
  });

  it('falls back to a CDP click followed by typing when the DOM type path fails', async () => {
    domResponder = (payload) => {
      if (payload.type === 'GET_ELEMENT_RECT') {
        return { success: true, rect: { x: 0, y: 0, width: 100, height: 40 } };
      }
      return { success: false, error: 'no such node' };
    };

    const result = await executeAgentAction(
      TAB_ID,
      { action: 'type', elementId: 2, text: 'headphones', pressEnter: false },
      ELEMENTS
    );

    expect(result.success).toBe(true);
    expect(mockedAttachDebugger).toHaveBeenCalledWith(TAB_ID);
    expect(mockedDispatchClick).toHaveBeenCalledWith(TAB_ID, 50, 20);
    expect(mockedDispatchType).toHaveBeenCalledTimes(1);
    expect(mockedDispatchType).toHaveBeenCalledWith(TAB_ID, 'headphones', false);
    // The fallback must focus the field (click) before typing.
    expect(mockedDispatchClick.mock.invocationCallOrder[0]).toBeLessThan(
      mockedDispatchType.mock.invocationCallOrder[0]
    );
  });

  it('passes a negative delta to dispatchScroll when scrolling up', async () => {
    const result = await executeAgentAction(
      TAB_ID,
      { action: 'scroll', direction: 'up', amount: 300 },
      ELEMENTS
    );

    expect(result.success).toBe(true);
    expect(mockedDispatchScroll).toHaveBeenCalledTimes(1);
    expect(mockedDispatchScroll).toHaveBeenCalledWith(TAB_ID, -300);
  });

  it('passes a positive delta to dispatchScroll when scrolling down', async () => {
    const result = await executeAgentAction(
      TAB_ID,
      { action: 'scroll', direction: 'down', amount: 300 },
      ELEMENTS
    );

    expect(result.success).toBe(true);
    expect(mockedDispatchScroll).toHaveBeenCalledTimes(1);
    expect(mockedDispatchScroll).toHaveBeenCalledWith(TAB_ID, 300);
  });

  it('blocks navigation to a restricted local-file URL', async () => {
    const result = await executeAgentAction(
      TAB_ID,
      { action: 'navigate', url: 'file:///C:/secret.txt' },
      ELEMENTS
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked');
    expect(mockedNavigateToUrl).not.toHaveBeenCalled();
  });

  it('navigates to an allowed URL', async () => {
    const result = await executeAgentAction(
      TAB_ID,
      { action: 'navigate', url: 'https://example.com' },
      ELEMENTS
    );

    expect(result.success).toBe(true);
    expect(mockedNavigateToUrl).toHaveBeenCalledWith(TAB_ID, 'https://example.com');
  });

  it('completes a wait action successfully', async () => {
    const result = await executeAgentAction(TAB_ID, { action: 'wait', seconds: 0.01 }, ELEMENTS);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
