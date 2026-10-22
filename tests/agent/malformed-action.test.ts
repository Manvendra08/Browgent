import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentController } from '../../src/background/agent';

vi.mock('../../src/background/llm/client', () => ({
  queryLLM: vi.fn(),
  queryLLMRaw: vi.fn(),
}));

import { queryLLM, queryLLMRaw } from '../../src/background/llm/client';

const mockedQueryLLM = vi.mocked(queryLLM);
const mockedQueryLLMRaw = vi.mocked(queryLLMRaw);

function parseError(message: string): Error {
  const err = new Error(message);
  err.name = 'ActionParseError';
  return err;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AgentController malformed action recovery', () => {
  it('recovers from an invalid action payload instead of aborting the run', async () => {
    mockedQueryLLM
      .mockRejectedValueOnce(parseError('Click action requires numeric "elementId"'))
      .mockResolvedValueOnce({
        thought: 'Recovered and finishing',
        action: { action: 'finish', summary: 'Completed' },
      });

    mockedQueryLLMRaw.mockResolvedValue(
      '```json\n{"confirmed": true, "evidence": "Completion banner visible"}\n```'
    );

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 4,
    });

    const events: Array<{ type: string; data?: unknown }> = [];
    const result = await controller.run(1, 'do the thing', (event) => events.push(event));

    expect(result.success).toBe(true);
    expect(result.summary).toBe('Completed');
    expect(mockedQueryLLM).toHaveBeenCalledTimes(2);

    const rejected = events.filter(
      (e) => e.type === 'action_result' &&
        (e.data as { error?: string }).error?.includes('Invalid action rejected')
    );
    expect(rejected).toHaveLength(1);

    const history = controller.getHistory();
    expect(history.some((h) => (h.error || '').includes('Invalid action rejected'))).toBe(true);
  });
});
