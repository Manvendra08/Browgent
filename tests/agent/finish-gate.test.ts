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

describe('AgentController finish verification gate', () => {
  it('accepts finish when the auditor confirms on-page completion', async () => {
    mockedQueryLLM.mockResolvedValue({
      thought: 'All efforts done',
      action: { action: 'finish', summary: 'Course completed with score shown' },
    });
    mockedQueryLLMRaw.mockResolvedValue(
      '```json\n{"confirmed": true, "evidence": "Completion banner and score screen visible"}\n```'
    );

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
    });

    const result = await controller.run(1, 'complete the course', () => {});

    expect(result.success).toBe(true);
    expect(result.summary).toBe('Course completed with score shown');
    expect(mockedQueryLLM).toHaveBeenCalledTimes(1);
    expect(mockedQueryLLMRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects premature finish, feeds evidence back, and accepts only after verified completion', async () => {
    mockedQueryLLM.mockResolvedValue({
      thought: 'I think I finished',
      action: { action: 'finish', summary: 'All quiz responses entered and submitted' },
    });
    mockedQueryLLMRaw
      .mockResolvedValueOnce('```json\n{"confirmed": false, "evidence": "6 pagination dots (3,5,7,8,9,10) are unanswered and the question form is still open"}\n```')
      .mockResolvedValueOnce('```json\n{"confirmed": false, "evidence": "Question 1 form is still visible with unanswered options"}\n```')
      .mockResolvedValueOnce('```json\n{"confirmed": true, "evidence": "All 10 dots green, quiz result screen shown"}\n```');

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
    });

    const events: Array<{ type: string; data?: unknown }> = [];
    const result = await controller.run(1, 'complete the course', (event) => events.push(event));

    expect(result.success).toBe(true);
    expect(mockedQueryLLM).toHaveBeenCalledTimes(3);
    expect(mockedQueryLLMRaw).toHaveBeenCalledTimes(3);

    const blockedResults = events.filter(
      (e) => e.type === 'action_result' &&
        (e.data as { error?: string }).error?.includes('Premature finish blocked')
    );
    expect(blockedResults).toHaveLength(2);

    const rejectionLogs = controller.getHistory().filter((h) => (h.error || '').includes('Finish rejected by completion verifier'));
    expect(rejectionLogs).toHaveLength(2);
  });

  it('accepts an unverified finish with a warning once the rejection budget is exhausted', async () => {
    mockedQueryLLM.mockResolvedValue({
      thought: 'Declaring done',
      action: { action: 'finish', summary: 'Quiz done' },
    });
    mockedQueryLLMRaw.mockResolvedValue(
      '```json\n{"confirmed": false, "evidence": "Still can not confirm completion"}\n```'
    );

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
    });

    const result = await controller.run(1, 'complete the course', () => {});

    expect(result.success).toBe(true);
    expect(result.summary).toContain('accepted without verified on-page confirmation');
    expect(mockedQueryLLM).toHaveBeenCalledTimes(3);
    expect(mockedQueryLLMRaw).toHaveBeenCalledTimes(3);
  });
});
