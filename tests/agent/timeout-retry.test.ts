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

describe('AgentController transient error resilience', () => {
  it('retries when an LLM call times out and succeeds on retry', async () => {
    mockedQueryLLM
      .mockRejectedValueOnce(new Error('Request to OmniRoute timed out after 90s'))
      .mockResolvedValueOnce({
        thought: 'Retried after timeout',
        action: { action: 'finish', summary: 'Successfully completed on retry' },
      });

    mockedQueryLLMRaw.mockResolvedValue(
      '```json\n{"confirmed": true, "evidence": "Completion confirmed"}\n```'
    );

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'anti' },
      maxSteps: 3,
    });

    const events: Array<{ type: string; data?: unknown }> = [];
    const result = await controller.run(1, 'fill form', (e) => events.push(e));

    expect(result.success).toBe(true);
    expect(result.summary).toBe('Successfully completed on retry');
    expect(mockedQueryLLM).toHaveBeenCalledTimes(2);

    const thoughtEvents = events.filter((e) => e.type === 'thought');
    expect(thoughtEvents.some((t) => (t.data as { thought: string }).thought.includes('transient network delay'))).toBe(true);
  });
});
