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

describe('AgentController batch action execution', () => {
  it('executes chained actions in a single turn without querying LLM repeatedly', async () => {
    mockedQueryLLM.mockResolvedValueOnce({
      thought: 'Selecting answer and submitting immediately',
      action: { action: 'click', index: 3 },
      actions: [
        { action: 'click', index: 3 },
        { action: 'click', index: 8 },
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

    // LLM should only have been queried twice (turn 1 for batch actions, turn 2 for finish)
    expect(mockedQueryLLM).toHaveBeenCalledTimes(2);

    // Verify sub-action events emitted with subIndex & total
    const actionEvents = events.filter((e) => e.type === 'action');
    expect(actionEvents.length).toBe(3); // 2 from step 1 batch, 1 from step 2 finish

    const firstSubAction = actionEvents[0].data as { action: { action: string; index: number }; subIndex: number; total: number };
    expect(firstSubAction.action.action).toBe('click');
    expect(firstSubAction.action.index).toBe(3);
    expect(firstSubAction.subIndex).toBe(0);
    expect(firstSubAction.total).toBe(2);

    const secondSubAction = actionEvents[1].data as { action: { action: string; index: number }; subIndex: number; total: number };
    expect(secondSubAction.action.action).toBe('click');
    expect(secondSubAction.action.index).toBe(8);
    expect(secondSubAction.subIndex).toBe(1);
    expect(secondSubAction.total).toBe(2);
  });
});
