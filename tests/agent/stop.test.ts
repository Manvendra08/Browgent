import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentController } from '../../src/background/agent';

vi.mock('../../src/background/llm/client', () => ({
  queryLLM: vi.fn(),
  queryLLMRaw: vi.fn(),
}));

import { queryLLM } from '../../src/background/llm/client';

const mockedQueryLLM = vi.mocked(queryLLM);

afterEach(() => {
  vi.clearAllMocks();
});

describe('Agent stop semantics', () => {
  it('aborts an in-flight LLM call and returns a stopped result', async () => {
    let observedSignal: AbortSignal | undefined;

    mockedQueryLLM.mockImplementation((_config, _messages, signal) => {
      observedSignal = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const err = new Error('Request was cancelled');
          err.name = 'AbortError';
          reject(err);
        });
      }) as never;
    });

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 5,
    });

    const runPromise = controller.run(1, 'do something', () => {});
    await new Promise((r) => setTimeout(r, 30));

    controller.stop();
    const result = await runPromise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('stopped by user');
    expect(observedSignal).toBeDefined();
    expect(observedSignal?.aborted).toBe(true);
    expect(controller.getStatus()).toBe('stopped');
  });
});
