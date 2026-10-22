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

  it('reports failure instead of success when completion can never be verified', async () => {
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

    expect(result.success).toBe(false);
    expect(result.error).toContain('Completion could not be verified');
    expect(result.summary).toBeUndefined();
    expect(mockedQueryLLM).toHaveBeenCalledTimes(3);
    expect(mockedQueryLLMRaw).toHaveBeenCalledTimes(3);
  });

  it('still refuses a finish at the last step of the budget instead of accepting it unverified', async () => {
    mockedQueryLLM.mockResolvedValue({
      thought: 'Declaring done on the final step',
      action: { action: 'finish', summary: 'Quiz done' },
    });
    mockedQueryLLMRaw.mockResolvedValue(
      '```json\n{"confirmed": false, "evidence": "questions 3 and 5 are still unanswered"}\n```'
    );

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 1,
    });

    const result = await controller.run(1, 'complete the course', () => {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Completion could not be verified');
    expect(result.error).toContain('still unanswered');
  });
});
describe('AgentController question-goal verification', () => {
  it('accepts a grounded answer for a question goal without requiring a page state change', async () => {
    mockedQueryLLM.mockResolvedValue({
      thought: 'The listing details answer the question',
      action: {
        action: 'finish',
        summary:
          'LinkedIn shows legal roles because your profile keywords are CLM and legal, not project delivery; the matched listing requires legal risk and governance experience.',
      },
    });
    mockedQueryLLMRaw.mockResolvedValue(
      '```json\n{"goalKind": "question", "confirmed": true, "evidence": "The job detail pane shows legal risk and governance requirements matching the user profile, and the answer cites them"}\n```'
    );

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
    });

    const result = await controller.run(1, 'why is linkedin showing me legal jobs', () => {});

    expect(result.success).toBe(true);
    expect(result.summary).toContain('legal roles');
    expect(mockedQueryLLMRaw).toHaveBeenCalledTimes(1);
  });

  it('still rejects a question answer the page does not support', async () => {
    mockedQueryLLM.mockResolvedValue({
      thought: 'Generic answer',
      action: { action: 'finish', summary: 'LinkedIn is broken.' },
    });
    mockedQueryLLMRaw.mockResolvedValue(
      '```json\n{"goalKind": "question", "confirmed": false, "evidence": "The answer is generic filler and no job requirements are visible on the captured page"}\n```'
    );

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
    });

    const result = await controller.run(1, 'why is linkedin showing me legal jobs', () => {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Completion could not be verified');
    expect(result.error).toContain('generic filler');
  });

  it('sends the proposed answer and page text to the auditor', async () => {
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      tabs: {
        get: vi.fn().mockResolvedValue({ id: 1, url: 'https://www.linkedin.com/jobs/' }),
        sendMessage: vi.fn((_id, _msg, cb) =>
          cb({
            success: true,
            data: {
              url: 'https://www.linkedin.com/jobs/',
              title: 'Head of Legal Affairs | LinkedIn',
              elements: [],
              formattedPrompt: 'No elements detected.',
              textExcerpt: 'Business leadership role. Identify legal and regulatory risks early.',
              viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
            },
          })
        ),
      },
    });

    mockedQueryLLM.mockResolvedValue({
      thought: 'Done',
      action: { action: 'finish', summary: 'Unique answer marker ABC123' },
    });
    mockedQueryLLMRaw.mockResolvedValue(
      '```json\n{"goalKind": "question", "confirmed": false, "evidence": "not yet"}\n```'
    );

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 1,
    });

    await controller.run(1, 'summarize this page', () => {});

    const auditMessages = mockedQueryLLMRaw.mock.calls[0][1];
    const auditPrompt = JSON.stringify(auditMessages);
    expect(auditPrompt).toContain('Unique answer marker ABC123');
    expect(auditPrompt).toContain('PAGE TEXT (excerpt)');
    expect(auditPrompt).toContain('Identify legal and regulatory risks');

    vi.unstubAllGlobals();
  });
});