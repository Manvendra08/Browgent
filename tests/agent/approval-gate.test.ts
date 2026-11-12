import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentController } from '../../src/background/agent';
import { LLMConfig } from '../../src/background/llm/types';

vi.mock('../../src/background/llm/client', () => ({
  queryLLM: vi.fn(),
  queryLLMRaw: vi.fn(),
}));

vi.mock('../../src/background/cdp', () => ({
  attachDebugger: vi.fn().mockResolvedValue(undefined),
  detachDebugger: vi.fn().mockResolvedValue(undefined),
  sendCdpCommand: vi.fn().mockResolvedValue({}),
  dispatchClick: vi.fn().mockResolvedValue(undefined),
  dispatchType: vi.fn().mockResolvedValue(undefined),
  dispatchScroll: vi.fn().mockResolvedValue({ scrollX: 0, scrollY: 0, atBottom: false }),
  dispatchHover: vi.fn().mockResolvedValue(undefined),
  dispatchKeyPress: vi.fn().mockResolvedValue(undefined),
  navigateToUrl: vi.fn().mockResolvedValue(undefined),
  enableDialogHandling: vi.fn().mockResolvedValue(() => {}),
  captureScreenshotCdp: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

import { queryLLM } from '../../src/background/llm/client';
const mockedQueryLLM = vi.mocked(queryLLM);

describe('AgentController Approval Gate', () => {
  const mockConfig: LLMConfig = {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: 'mock-key',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).chrome = {
      tabs: {
        sendMessage: vi.fn((_id, _msg, cb) => {
          if (typeof cb === 'function') cb({ success: true });
        }),
        get: vi.fn().mockResolvedValue({ status: 'complete' }),
        captureVisibleTab: vi.fn((_wId, _opts, cb) => cb('data:image/jpeg;base64,mock')),
        onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
        onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      runtime: {
        lastError: null,
      },
    };
  });

  it('pauses on destructive action, emits approval_requested, and proceeds when approved', async () => {
    const agent = new AgentController({
      llmConfig: mockConfig,
      maxSteps: 3,
    });

    const events: Array<{ type: string; data?: unknown }> = [];
    const onProgress = (event: { type: string; data?: unknown }) => {
      events.push(event);
      if (event.type === 'approval_requested') {
        setTimeout(() => agent.resolveApproval(true), 10);
      }
    };

    (agent as any).capturePageDOM = vi.fn().mockResolvedValue({
      url: 'https://example.com/settings',
      title: 'Settings',
      elements: [
        {
          id: 10,
          tagName: 'BUTTON',
          text: 'Delete Account',
          rect: { x: 0, y: 0, width: 100, height: 40 },
        },
      ],
      formattedPrompt: '[10] button "Delete Account"',
      textExcerpt: 'Account deletion is permanent.',
      viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
    });

    let step = 0;
    mockedQueryLLM.mockImplementation(async () => {
      step++;
      if (step === 1) {
        return {
          thought: 'Deleting the account as requested',
          action: { action: 'click', elementId: 10 },
        };
      }
      return {
        thought: 'Done',
        action: { action: 'finish', summary: 'Account deleted' },
      };
    });

    (agent as any).dispatchAction = vi.fn().mockResolvedValue({ success: true });
    (agent as any).verifyCompletion = vi.fn().mockResolvedValue({ confirmed: true });

    const result = await agent.run(1, 'delete my account', onProgress);

    expect(events.some((e) => e.type === 'approval_requested')).toBe(true);
    expect(result.success).toBe(true);
    expect((agent as any).dispatchAction).toHaveBeenCalled();
  });

  it('aborts the destructive action when rejected by user', async () => {
    const agent = new AgentController({
      llmConfig: mockConfig,
      maxSteps: 2,
    });

    const events: Array<{ type: string; data?: unknown }> = [];
    const onProgress = (event: { type: string; data?: unknown }) => {
      events.push(event);
      if (event.type === 'approval_requested') {
        setTimeout(() => agent.resolveApproval(false), 10);
      }
    };

    (agent as any).capturePageDOM = vi.fn().mockResolvedValue({
      url: 'https://example.com/checkout',
      title: 'Checkout',
      elements: [
        {
          id: 5,
          tagName: 'BUTTON',
          text: 'Pay Now $500',
          rect: { x: 0, y: 0, width: 100, height: 40 },
        },
      ],
      formattedPrompt: '[5] button "Pay Now $500"',
      textExcerpt: 'Total: $500',
      viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
    });

    let step = 0;
    mockedQueryLLM.mockImplementation(async () => {
      step++;
      if (step === 1) {
        return {
          thought: 'Submitting payment',
          action: { action: 'click', elementId: 5 },
        };
      }
      return {
        thought: 'Payment was rejected, stopping',
        action: { action: 'finish', summary: 'Halted due to rejection' },
      };
    });

    (agent as any).dispatchAction = vi.fn().mockResolvedValue({ success: true });
    (agent as any).verifyCompletion = vi.fn().mockResolvedValue({ confirmed: true });

    await agent.run(1, 'buy the item', onProgress);

    expect(events.some((e) => e.type === 'approval_requested')).toBe(true);
    expect((agent as any).dispatchAction).not.toHaveBeenCalled();
    const resultEvents = events.filter((e) => e.type === 'action_result');
    expect(resultEvents.some((e: any) => e.data?.error?.includes('rejected by user'))).toBe(true);
  });
});
