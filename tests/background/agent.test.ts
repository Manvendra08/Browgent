import { describe, it, expect, vi } from 'vitest';
import { AgentController } from '../../src/background/agent';

vi.mock('../../src/background/llm/client', () => ({
  queryLLM: vi.fn(),
  queryLLMRaw: vi.fn(),
}));

import { queryLLM } from '../../src/background/llm/client';
const mockedQueryLLM = vi.mocked(queryLLM);

describe('Agent Controller', () => {
  it('initializes in idle status', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 5,
    });
    expect(controller.getStatus()).toBe('idle');
  });

  it('stops execution when stop() is called', async () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 5,
    });

    controller.stop();
    expect(controller.getStatus()).toBe('stopped');
  });

  it('detects repeating loops and halts execution', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 10,
    });

    const isLoop1 = controller.checkLoop({ action: 'click', elementId: 4 });
    const isLoop2 = controller.checkLoop({ action: 'click', elementId: 4 });
    const isLoop3 = controller.checkLoop({ action: 'click', elementId: 4 });

    expect(isLoop1).toBe(false);
    expect(isLoop2).toBe(false);
    expect(isLoop3).toBe(true);
  });

  it('does not flag consecutive scroll actions as loops', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 10,
    });

    for (let i = 0; i < 5; i++) {
      expect(controller.checkLoop({ action: 'scroll', direction: 'down', amount: 500 })).toBe(
        false,
      );
    }
  });

  it('does not flag consecutive wait actions as loops', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 10,
    });

    for (let i = 0; i < 5; i++) {
      expect(controller.checkLoop({ action: 'wait', seconds: 2 })).toBe(false);
    }
  });

  it('detects trackable action loops even when non-trackable wait actions are interleaved', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 10,
    });

    expect(controller.checkLoop({ action: 'click', elementId: 4 })).toBe(false);
    expect(controller.checkLoop({ action: 'wait', seconds: 2 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 4 })).toBe(false);
    expect(controller.checkLoop({ action: 'wait', seconds: 2 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 4 })).toBe(true);
  });

  it('detects alternating 2-action loops', () => {
    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 10,
    });

    expect(controller.checkLoop({ action: 'click', elementId: 1 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 2 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 1 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 2 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 1 })).toBe(false);
    expect(controller.checkLoop({ action: 'click', elementId: 2 })).toBe(true);
  });

  it('captures DOM with showOverlay: false by default for clean background mode and targets frameId 0', async () => {
    let domStateMessage: { type: string; showOverlay?: boolean } | null = null;
    let capturedOptions: unknown = null;
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      tabs: {
        get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        sendMessage: vi.fn((_id, msg, optionsOrCb, maybeCb) => {
          const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
          if (msg.type === 'GET_DOM_STATE') {
            domStateMessage = msg;
            capturedOptions = optionsOrCb;
          }
          cb({
            success: true,
            data: {
              url: 'https://example.com',
              title: 'Example',
              elements: [],
              formattedPrompt: 'No elements.',
              textExcerpt: '',
              viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
            },
          });
        }),
      },
    });

    mockedQueryLLM.mockResolvedValueOnce({
      thought: 'All done',
      action: { action: 'finish', summary: 'Clean inspection verified' },
    });

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 1,
    });

    await controller.run(1, 'read this page', () => {});

    expect(domStateMessage).toBeDefined();
    expect(domStateMessage!.type).toBe('GET_DOM_STATE');
    expect(domStateMessage!.showOverlay).toBe(false);
    expect(capturedOptions).toEqual({ frameId: 0 });

    vi.unstubAllGlobals();
  });

  it('captures DOM with showOverlay: true when explicitly enabled', async () => {
    let domStateMessage: { type: string; showOverlay?: boolean } | null = null;
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      tabs: {
        get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        sendMessage: vi.fn((_id, msg, optionsOrCb, maybeCb) => {
          const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
          if (msg.type === 'GET_DOM_STATE') {
            domStateMessage = msg;
          }
          cb({
            success: true,
            data: {
              url: 'https://example.com',
              title: 'Example',
              elements: [],
              formattedPrompt: 'No elements.',
              textExcerpt: '',
              viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
            },
          });
        }),
      },
    });

    mockedQueryLLM.mockResolvedValueOnce({
      thought: 'Done',
      action: { action: 'finish', summary: 'Overlay mode verified' },
    });

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 1,
      showOverlay: true,
    });

    await controller.run(1, 'read this page', () => {});

    expect(domStateMessage).toBeDefined();
    expect(domStateMessage!.type).toBe('GET_DOM_STATE');
    expect(domStateMessage!.showOverlay).toBe(true);

    vi.unstubAllGlobals();
  });
});
