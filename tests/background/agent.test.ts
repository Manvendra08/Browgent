import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentController, downscaleScreenshot } from '../../src/background/agent';
import { markModelAsTextOnly, clearKnownTextOnlyModels } from '../../src/background/llm/openai';

vi.mock('../../src/background/llm/client', () => ({
  queryLLM: vi.fn(),
  queryLLMRaw: vi.fn(),
}));

import { queryLLM, queryLLMRaw } from '../../src/background/llm/client';
const mockedQueryLLM = vi.mocked(queryLLM);
const mockedQueryLLMRaw = vi.mocked(queryLLMRaw);

describe('Agent Controller', () => {
  beforeEach(() => {
    clearKnownTextOnlyModels();
  });
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

  it('includes prior conversation inside the nonce-tagged block when provided', async () => {
    let capturedPrompt: string = '';
    mockedQueryLLM.mockImplementationOnce((_config, messages) => {
      capturedPrompt = messages[1].content;
      return Promise.resolve({
        thought: 'Done',
        action: { action: 'finish', summary: 'Follow-up processed' },
      });
    });

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 1,
      conversation: [
        { prompt: 'Find flights from Pune to Lucknow', result: 'Found 3 flights starting at ₹16,428' },
        { prompt: 'Which is fastest?', result: 'IndiGo nonstop 1h 50m' },
      ],
    });

    await controller.run(1, 'Book the fastest one', () => {});

    expect(capturedPrompt).toContain('USER GOAL: "Book the fastest one"');
    expect(capturedPrompt).toContain('<prior_conversation nonce=');
    expect(capturedPrompt).toContain('Find flights from Pune to Lucknow');
    expect(capturedPrompt).toContain('Found 3 flights starting at ₹16,428');
    expect(capturedPrompt).toContain('Which is fastest?');
    expect(capturedPrompt).toContain('IndiGo nonstop 1h 50m');
    expect(capturedPrompt).toContain('</prior_conversation nonce=');
  });

  it('omits the prior conversation block when conversation is empty', async () => {
    let capturedPrompt: string = '';
    mockedQueryLLM.mockImplementationOnce((_config, messages) => {
      capturedPrompt = messages[1].content;
      return Promise.resolve({
        thought: 'Done',
        action: { action: 'finish', summary: 'Clean run' },
      });
    });

    const controller = new AgentController({
      llmConfig: { provider: 'omniroute', model: 'free' },
      maxSteps: 1,
      conversation: [],
    });

    await controller.run(1, 'Initial query', () => {});

    expect(capturedPrompt).toContain('USER GOAL: "Initial query"');
    expect(capturedPrompt).not.toContain('<prior_conversation');
  });

  describe('answer (Ask mode)', () => {
    it('makes exactly one LLM call and returns markdown summary without action loops', async () => {
      mockedQueryLLMRaw.mockClear();
      mockedQueryLLM.mockClear();
      mockedQueryLLMRaw.mockResolvedValueOnce('# Page Summary\n\n- Key point 1\n- Key point 2');

      const events: Array<{ type: string; data?: unknown }> = [];
      const controller = new AgentController({
        llmConfig: { provider: 'omniroute', model: 'free' },
      });

      const result = await controller.answer(1, 'Summarize this page', (e) => events.push(e));

      expect(result.success).toBe(true);
      expect(result.summary).toBe('# Page Summary\n\n- Key point 1\n- Key point 2');
      expect(mockedQueryLLMRaw).toHaveBeenCalledTimes(1);
      expect(mockedQueryLLM).not.toHaveBeenCalled();

      const doneEvents = events.filter((e) => e.type === 'done');
      expect(doneEvents).toHaveLength(1);
      expect((doneEvents[0].data as { summary: string }).summary).toContain('Key point 1');
      expect(controller.getStatus()).toBe('completed');
    });

    it('rejects internal restricted browser pages with descriptive error', async () => {
      vi.stubGlobal('chrome', {
        runtime: { lastError: undefined },
        tabs: {
          get: vi.fn().mockResolvedValue({ id: 1, url: 'chrome://settings' }),
        },
      });

      const controller = new AgentController({
        llmConfig: { provider: 'omniroute', model: 'free' },
      });

      const events: Array<{ type: string; data?: unknown }> = [];
      const result = await controller.answer(1, 'What is in settings?', (e) => events.push(e));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot inspect internal browser page');
      expect(controller.getStatus()).toBe('failed');

      vi.unstubAllGlobals();
    });

    it('cleans up visual badges via cleanup() even when answer completes or fails', async () => {
      mockedQueryLLMRaw.mockClear();
      mockedQueryLLMRaw.mockResolvedValueOnce('Answer text');

      const sendMessageMock = vi.fn((_tid, _msg, _optsOrCb, cb) => {
        const callback = typeof _optsOrCb === 'function' ? _optsOrCb : cb;
        if (callback) {
          callback({
            success: true,
            data: {
              url: 'https://example.com',
              title: 'Example',
              elements: [],
              formattedPrompt: '',
              textExcerpt: '',
              viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
            },
          });
        }
      });

      vi.stubGlobal('chrome', {
        runtime: { lastError: undefined },
        tabs: {
          get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
          sendMessage: sendMessageMock,
        },
      });

      const controller = new AgentController({
        llmConfig: { provider: 'omniroute', model: 'free' },
        showOverlay: true,
      });

      await controller.answer(1, 'What is on this page?', () => {});

      // Verify CLEAR_ALL_VISUALS was sent to clean up badges
      expect(sendMessageMock).toHaveBeenCalledWith(1, { type: 'CLEAR_ALL_VISUALS' });

      vi.unstubAllGlobals();
    });

    it('skips screenshot capture for known text-only models', async () => {
      markModelAsTextOnly('openai-compat', 'nvidia/nemotron-3-ultra-550b-a55b:free');

      const captureScreenshotMock = vi.fn();
      vi.stubGlobal('chrome', {
        runtime: { lastError: undefined },
        tabs: {
          get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
          sendMessage: vi.fn().mockImplementation((_tabId, msg, cb) => {
            if (msg.type === 'GET_DOM_STATE') {
              cb({
                success: true,
                data: {
                  url: 'https://example.com',
                  title: 'Text Only Page',
                  elements: [],
                  formattedPrompt: 'No elements',
                  viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
                },
              });
            } else {
              cb({ success: true });
            }
          }),
          captureVisibleTab: captureScreenshotMock,
        },
      });

      const controller = new AgentController({
        llmConfig: {
          provider: 'openai-compat',
          model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        },
      });

      await controller.answer(1, 'What is this?', () => {});
      expect(captureScreenshotMock).not.toHaveBeenCalled();

      clearKnownTextOnlyModels();
      vi.unstubAllGlobals();
    });

    describe('downscaleScreenshot', () => {
      it('returns dataUrl untouched when OffscreenCanvas is undefined in environment', async () => {
        const data = 'data:image/jpeg;base64,sample123';
        const result = await downscaleScreenshot(data, 1280);
        expect(result).toBe(data);
      });

      it('returns dataUrl untouched when dimensions are within maxDimension', async () => {
        const mockBitmap = {
          width: 1000,
          height: 600,
          close: vi.fn(),
        };
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(mockBitmap));
        vi.stubGlobal('OffscreenCanvas', class {
          constructor() {}
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          blob: vi.fn().mockResolvedValue(new Blob(['fake'])),
        }));

        const data = 'data:image/jpeg;base64,smallimage';
        const result = await downscaleScreenshot(data, 1280);
        expect(result).toBe(data);
        expect(mockBitmap.close).toHaveBeenCalled();

        vi.unstubAllGlobals();
      });

      it('scales image down to maxDimension when width or height exceeds threshold', async () => {
        const mockBitmap = {
          width: 2560,
          height: 1440,
          close: vi.fn(),
        };
        const mockDrawImage = vi.fn();
        const mockConvertToBlob = vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
        });

        class MockOffscreenCanvas {
          width: number;
          height: number;
          constructor(w: number, h: number) {
            this.width = w;
            this.height = h;
          }
          getContext() {
            return { drawImage: mockDrawImage };
          }
          convertToBlob(opts: unknown) {
            return mockConvertToBlob(opts);
          }
        }

        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(mockBitmap));
        vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          blob: vi.fn().mockResolvedValue(new Blob(['fake'])),
        }));

        const data = 'data:image/jpeg;base64,bigimage';
        const result = await downscaleScreenshot(data, 1280);

        expect(mockDrawImage).toHaveBeenCalledWith(mockBitmap, 0, 0, 1280, 720);
        expect(mockBitmap.close).toHaveBeenCalled();
        expect(result).toContain('data:image/jpeg;base64,');

        vi.unstubAllGlobals();
      });
    });
  });
});
