import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentController } from '../../src/background/agent';

vi.mock('../../src/background/llm/client', () => ({
  queryLLM: vi.fn(),
  queryLLMRaw: vi.fn(),
}));

import { queryLLM, queryLLMRaw } from '../../src/background/llm/client';

const mockedQueryLLM = vi.mocked(queryLLM);
const mockedQueryLLMRaw = vi.mocked(queryLLMRaw);

afterEach(() => {
  vi.clearAllMocks();
});

describe('AgentController loop detector', () => {
  it('issues a per-action warning when an action repeats 3 times, and permits another distinct action loop warning', async () => {
    // 3 repetitions of click element 1 -> triggers warning for action 1
    // followed by click element 2 repeated 3 times -> triggers warning for action 2 (not instant abort)
    // followed by finish -> success
    mockedQueryLLM
      .mockResolvedValueOnce({
        thought: 'Clicking 1 first time',
        action: { action: 'click', elementId: 1 },
      })
      .mockResolvedValueOnce({
        thought: 'Clicking 1 second time',
        action: { action: 'click', elementId: 1 },
      })
      .mockResolvedValueOnce({
        thought: 'Clicking 1 third time',
        action: { action: 'click', elementId: 1 },
      })
      // At this point, action 1 loop warning is issued. Agent continues.
      .mockResolvedValueOnce({
        thought: 'Switching to element 2 first time',
        action: { action: 'click', elementId: 2 },
      })
      .mockResolvedValueOnce({
        thought: 'Clicking 2 second time',
        action: { action: 'click', elementId: 2 },
      })
      .mockResolvedValueOnce({
        thought: 'Clicking 2 third time',
        action: { action: 'click', elementId: 2 },
      })
      // At this point, action 2 loop warning is issued. Agent continues.
      .mockResolvedValueOnce({
        thought: 'Now finishing',
        action: { action: 'finish', summary: 'Goal achieved' },
      });

    mockedQueryLLMRaw.mockResolvedValue(
      '```json\n{"confirmed": true, "evidence": "Completed successfully"}\n```',
    );

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 10,
    });

    const events: Array<{ type: string; data?: unknown }> = [];
    const result = await controller.run(1, 'loop test goal', (event) => events.push(event));

    expect(result.success).toBe(true);
    expect(result.summary).toBe('Goal achieved');

    const warnings = events.filter(
      (e) =>
        e.type === 'action_result' &&
        (e.data as { error?: string }).error?.includes('Loop warning'),
    );
    expect(warnings.length).toBe(2);

    const historyWarnings = controller
      .getHistory()
      .filter((h) => (h.error || '').includes('Loop warning'));
    expect(historyWarnings.length).toBe(2);
  });

  it('aborts the run when the same action repeats again after its warning has already been issued', async () => {
    mockedQueryLLM
      .mockResolvedValueOnce({
        thought: 'Click 1 (1)',
        action: { action: 'click', elementId: 1 },
      })
      .mockResolvedValueOnce({
        thought: 'Click 1 (2)',
        action: { action: 'click', elementId: 1 },
      })
      .mockResolvedValueOnce({
        thought: 'Click 1 (3)',
        action: { action: 'click', elementId: 1 },
      })
      // Warning issued. Next turn repeats the same action again:
      .mockResolvedValueOnce({
        thought: 'Click 1 again (4)',
        action: { action: 'click', elementId: 1 },
      });

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 6,
    });

    const events: Array<{ type: string; data?: unknown }> = [];
    const result = await controller.run(1, 'loop abort test', (event) => events.push(event));

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'Loop detected: Agent repeated the exact action 3 times consecutively',
    );
    expect(controller.getStatus()).toBe('failed');
  });

  it('detects multi-action batch cycles (e.g. sequence of 3 actions repeated 3 times)', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
    });

    // Sequence: A, B, C repeated 3 times
    const a = { action: 'click' as const, elementId: 10 };
    const b = { action: 'click' as const, elementId: 20 };
    const c = { action: 'click' as const, elementId: 30 };

    expect(controller.checkLoop(a)).toBe(false);
    expect(controller.checkLoop(b)).toBe(false);
    expect(controller.checkLoop(c)).toBe(false);

    expect(controller.checkLoop(a)).toBe(false);
    expect(controller.checkLoop(b)).toBe(false);
    expect(controller.checkLoop(c)).toBe(false);

    expect(controller.checkLoop(a)).toBe(false);
    expect(controller.checkLoop(b)).toBe(false);
    expect(controller.checkLoop(c)).toBe(true); // Loop detected on 3rd cycle completion
  });

  it('detects excessive consecutive scrolling in the same direction after 5 passes', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
    });

    const scrollDown = { action: 'scroll' as const, direction: 'down' as const, amount: 500 };
    for (let i = 0; i < 5; i++) {
      expect(controller.checkLoop(scrollDown)).toBe(false);
    }
    expect(controller.checkLoop(scrollDown)).toBe(true); // 6th consecutive scroll down
  });

  it('issues a specialized warning for repeating type actions advising to look for Send button', async () => {
    mockedQueryLLM
      .mockResolvedValueOnce({
        thought: 'Type 1',
        action: { action: 'type', elementId: 1, text: 'hello', pressEnter: true },
      })
      .mockResolvedValueOnce({
        thought: 'Type 2',
        action: { action: 'type', elementId: 1, text: 'hello', pressEnter: true },
      })
      .mockResolvedValueOnce({
        thought: 'Type 3',
        action: { action: 'type', elementId: 1, text: 'hello', pressEnter: true },
      })
      .mockResolvedValueOnce({
        thought: 'Finish',
        action: { action: 'finish', summary: 'Done' },
      });

    mockedQueryLLMRaw.mockResolvedValue(
      '```json\n{"confirmed": true, "evidence": "Done"}\n```',
    );

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 5,
    });

    const events: Array<{ type: string; data?: unknown }> = [];
    await controller.run(1, 'type loop test', (event) => events.push(event));

    const warning = events.find(
      (e) =>
        e.type === 'action_result' &&
        (e.data as { error?: string }).error?.includes('Send'),
    );
    expect(warning).toBeDefined();
    expect((warning?.data as { error: string }).error).toContain('Enter key was not accepted');
  });
});
