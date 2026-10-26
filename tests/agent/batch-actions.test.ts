import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentController } from '../../src/background/agent';

vi.mock('../../src/background/llm/client', () => ({
  queryLLM: vi.fn(),
  queryLLMRaw: vi.fn(),
}));

import { queryLLM, queryLLMRaw } from '../../src/background/llm/client';

const mockedQueryLLM = vi.mocked(queryLLM);
const mockedQueryLLMRaw = vi.mocked(queryLLMRaw);

const DOM_STATE = {
  url: 'https://quiz.example.com/assessment',
  title: 'Assessment',
  elements: [
    { id: 3, tagName: 'input', type: 'radio', text: 'Option A', rect: { x: 10, y: 20, width: 100, height: 20 } },
    { id: 8, tagName: 'button', text: 'Submit', rect: { x: 10, y: 60, width: 80, height: 30 } },
  ],
  formattedPrompt: '[3] input radio "Option A"\n[8] button "Submit"',
  viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
};

function stubChrome() {
  const sendMessage = vi.fn(
    (
      _tabId: number,
      payload: Record<string, unknown>,
      optionsOrCb: unknown,
      maybeCb?: (r: unknown) => void
    ) => {
      const cb = typeof optionsOrCb === 'function' ? (optionsOrCb as (r: unknown) => void) : maybeCb;
      if (payload.type === 'GET_DOM_STATE') {
        cb?.({ success: true, data: DOM_STATE });
        return;
      }
      cb?.({ success: true, rect: { x: 10, y: 20, width: 100, height: 20 } });
    }
  );

  vi.stubGlobal('chrome', {
    runtime: { lastError: undefined },
    tabs: {
      get: vi.fn(async () => ({ id: 1, url: DOM_STATE.url })),
      sendMessage,
    },
    scripting: { executeScript: vi.fn(async () => []) },
    debugger: {
      attach: vi.fn(),
      detach: vi.fn(),
      sendCommand: vi.fn((_target, _method, _params, cb) => {
        if (typeof cb === 'function') cb({});
      }),
      onDetach: { addListener: vi.fn() },
      onEvent: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });

  return sendMessage;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('AgentController batch action execution', () => {
  it('executes chained actions in a single turn and both clicks actually succeed', async () => {
    const sendMessage = stubChrome();

    mockedQueryLLM.mockResolvedValueOnce({
      thought: 'Selecting answer and submitting immediately',
      action: { action: 'click', elementId: 3 },
      actions: [
        { action: 'click', elementId: 3 },
        { action: 'click', elementId: 8 },
      ],
    }).mockResolvedValueOnce({
      thought: 'Task is complete',
      action: { action: 'finish', summary: 'Quiz submitted and passed' },
    });

    mockedQueryLLMRaw.mockResolvedValue(
      '```json\n{"confirmed": true, "evidence": "Score screen visible"}\n```'
    );

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 5,
    });

    const events: Array<{ type: string; data?: unknown }> = [];
    const result = await controller.run(1, 'solve quiz', (event) => events.push(event));

    expect(result.success).toBe(true);
    expect(result.summary).toBe('Quiz submitted and passed');

    expect(mockedQueryLLM).toHaveBeenCalledTimes(2);

    const actionEvents = events.filter((e) => e.type === 'action');
    expect(actionEvents.length).toBe(3);

    const firstSubAction = actionEvents[0].data as { action: { action: string; elementId: number }; subIndex: number; total: number };
    expect(firstSubAction.action.action).toBe('click');
    expect(firstSubAction.action.elementId).toBe(3);
    expect(firstSubAction.subIndex).toBe(0);
    expect(firstSubAction.total).toBe(2);

    const secondSubAction = actionEvents[1].data as { action: { action: string; elementId: number }; subIndex: number; total: number };
    expect(secondSubAction.action.action).toBe('click');
    expect(secondSubAction.action.elementId).toBe(8);
    expect(secondSubAction.subIndex).toBe(1);
    expect(secondSubAction.total).toBe(2);

    const resultEvents = events.filter((e) => e.type === 'action_result');
    expect(resultEvents.length).toBe(2);
    for (const event of resultEvents) {
      expect((event.data as { success: boolean }).success).toBe(true);
    }

    const clickMessages = sendMessage.mock.calls.filter(
      ([, payload]) => (payload as { type: string }).type === 'CLICK_ELEMENT'
    );
    expect(clickMessages.length).toBe(2);
    expect((clickMessages[0][1] as { elementId: number }).elementId).toBe(3);
    expect((clickMessages[1][1] as { elementId: number }).elementId).toBe(8);
  });
});
