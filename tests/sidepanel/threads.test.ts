import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Turn,
  Thread,
  applyAgentEvent,
  redactAction,
  sanitizeThreadForPersistence,
  loadThreads,
  saveThreads,
  toConversation,
  MAX_THREADS,
  MAX_TURNS_PER_THREAD,
} from '../../src/sidepanel/threads';

describe('threads model and persistence', () => {
  let localStorageData: Record<string, unknown> = {};

  beforeEach(() => {
    localStorageData = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (keys: string[]) => {
            const res: Record<string, unknown> = {};
            for (const k of keys) {
              res[k] = localStorageData[k];
            }
            return res;
          }),
          set: vi.fn(async (obj: Record<string, unknown>) => {
            Object.assign(localStorageData, obj);
          }),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('applyAgentEvent', () => {
    const baseTurn: Turn = {
      id: 'turn-1',
      mode: 'agent',
      prompt: 'Search flights',
      steps: [],
      status: 'running',
      createdAt: Date.now(),
    };

    it('adds a step item on step event', () => {
      const turn = applyAgentEvent(baseTurn, {
        type: 'step',
        data: { step: 1, maxSteps: 10 },
      });
      expect(turn.steps).toHaveLength(1);
      expect(turn.steps[0].step).toBe(1);
      expect(turn.steps[0].status).toBe('running');
    });

    it('attaches thought to the latest step item', () => {
      let turn = applyAgentEvent(baseTurn, {
        type: 'step',
        data: { step: 1, maxSteps: 10 },
      });
      turn = applyAgentEvent(turn, {
        type: 'thought',
        data: { thought: 'Need to click search' },
      });
      expect(turn.steps[0].thought).toBe('Need to click search');
    });

    it('attaches action to latest step or creates sub-step for chained action', () => {
      let turn = applyAgentEvent(baseTurn, {
        type: 'step',
        data: { step: 1, maxSteps: 10 },
      });
      turn = applyAgentEvent(turn, {
        type: 'action',
        data: { step: 1, action: { action: 'click', elementId: 3 } },
      });
      expect(turn.steps).toHaveLength(1);
      expect(turn.steps[0].action).toEqual({ action: 'click', elementId: 3 });

      // Chained sub-action
      turn = applyAgentEvent(turn, {
        type: 'action',
        data: { step: 1, action: { action: 'click', elementId: 7 }, subIndex: 1, total: 2 },
      });
      expect(turn.steps).toHaveLength(2);
      expect(turn.steps[1].thought).toContain('Chained action 2/2');
      expect(turn.steps[1].action).toEqual({ action: 'click', elementId: 7 });
    });

    it('updates latest step on action_result', () => {
      let turn = applyAgentEvent(baseTurn, {
        type: 'step',
        data: { step: 1, maxSteps: 10 },
      });
      turn = applyAgentEvent(turn, {
        type: 'action_result',
        data: { step: 1, success: true, result: 'Clicked successfully' },
      });
      expect(turn.steps[0].status).toBe('success');

      turn = applyAgentEvent(turn, {
        type: 'action_result',
        data: { step: 1, success: false, error: 'Element missing' },
      });
      expect(turn.steps[0].status).toBe('error');
      expect(turn.steps[0].error).toBe('Element missing');
    });

    it('attaches step telemetry timings to the corresponding step on step_telemetry event', () => {
      let turn = applyAgentEvent(baseTurn, {
        type: 'step',
        data: { step: 1, maxSteps: 10 },
      });
      const timings = {
        totalMs: 2450,
        domMs: 120,
        screenshotMs: 180,
        llmMs: 1500,
        actionMs: 250,
        settleMs: 400,
      };
      turn = applyAgentEvent(turn, {
        type: 'step_telemetry',
        data: { step: 1, timings },
      });
      expect(turn.steps[0].timings).toEqual(timings);
    });

    it('updates turn status to completed with summary on done event', () => {
      const turn = applyAgentEvent(baseTurn, {
        type: 'done',
        data: { summary: 'Flights found for ₹16,428' },
      });
      expect(turn.status).toBe('completed');
      expect(turn.result).toBe('Flights found for ₹16,428');
    });

    it('updates turn status to failed on error event', () => {
      const turn = applyAgentEvent(baseTurn, {
        type: 'error',
        data: { error: 'Quota limit exceeded' },
      });
      expect(turn.status).toBe('failed');
      expect(turn.error).toBe('Quota limit exceeded');
    });
  });

  describe('redaction and sanitization', () => {
    it('redacts typed text in type action', () => {
      expect(redactAction({ action: 'type', elementId: 5, text: 'secret password' })).toEqual({
        action: 'type',
        elementId: 5,
        text: '[15 chars redacted]',
      });

      expect(redactAction({ action: 'click', elementId: 2 })).toEqual({
        action: 'click',
        elementId: 2,
      });
    });

    it('sanitizes all steps across turns in thread, redacts actions, scrubs URLs, and drops thought text', () => {
      const thread: Thread = {
        id: 't-1',
        title: 'Form fill',
        createdAt: 100,
        updatedAt: 200,
        turns: [
          {
            id: 'turn-1',
            mode: 'agent',
            prompt: 'Fill login',
            tab: {
              title: 'Login Page',
              url: 'https://example.com/oauth/callback?code=super_secret_code&state=xyz123&client_id=123',
            },
            steps: [
              {
                id: 's-1',
                step: 1,
                thought: 'Typing the password into the login input',
                action: { action: 'type', elementId: 1, text: 'mySecret123' },
                status: 'success',
                timestamp: 150,
              },
            ],
            status: 'completed',
            createdAt: 100,
          },
        ],
      };

      const sanitized = sanitizeThreadForPersistence(thread);
      expect(sanitized.turns[0].steps[0].action).toEqual({
        action: 'type',
        elementId: 1,
        text: '[11 chars redacted]',
      });
      // Thought text must not persist to disk
      expect(sanitized.turns[0].steps[0].thought).toBeUndefined();
      // URL query params must be scrubbed of code and state
      expect(sanitized.turns[0].tab?.url).toBe(
        'https://example.com/oauth/callback?code=redacted&state=redacted&client_id=123',
      );
    });
  });

  describe('saveThreads and loadThreads caps', () => {
    it('caps stored threads at MAX_THREADS (20) and drops oldest by updatedAt', async () => {
      const threads: Thread[] = [];
      for (let i = 0; i < 25; i++) {
        threads.push({
          id: `thread-${i}`,
          title: `Thread ${i}`,
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
          turns: [],
        });
      }

      await saveThreads(threads);
      const loaded = await loadThreads();

      expect(loaded).toHaveLength(MAX_THREADS);
      // Newest threads (updatedAt 1024 down to 1005) should be kept
      expect(loaded[0].id).toBe('thread-24');
      expect(loaded[loaded.length - 1].id).toBe('thread-5');
      // Oldest (threads 0-4) dropped
      expect(loaded.some((t) => t.id === 'thread-0')).toBe(false);
    });

    it('caps turns per thread at MAX_TURNS_PER_THREAD (30)', async () => {
      const turns: Turn[] = [];
      for (let i = 0; i < 40; i++) {
        turns.push({
          id: `turn-${i}`,
          mode: 'ask',
          prompt: `Question ${i}`,
          steps: [],
          status: 'completed',
          result: `Answer ${i}`,
          createdAt: 100 + i,
        });
      }

      const thread: Thread = {
        id: 'long-thread',
        title: 'Long Thread',
        createdAt: 100,
        updatedAt: 500,
        turns,
      };

      await saveThreads([thread]);
      const loaded = await loadThreads();

      expect(loaded[0].turns).toHaveLength(MAX_TURNS_PER_THREAD);
      expect(loaded[0].turns[0].id).toBe('turn-10');
      expect(loaded[0].turns[loaded[0].turns.length - 1].id).toBe('turn-39');
    });

    it('normalizes turns stuck in running status to stopped and running steps to error', async () => {
      const thread: Thread = {
        id: 'interrupted-thread',
        title: 'Interrupted Run',
        createdAt: 100,
        updatedAt: 500,
        turns: [
          {
            id: 'turn-running',
            mode: 'agent',
            prompt: 'Book flight',
            tab: {
              title: 'Flights',
              url: 'https://example.com/checkout?token=secret_checkout_token',
            },
            steps: [
              {
                id: 's-1',
                step: 1,
                action: { action: 'click', elementId: 10 },
                status: 'success',
                timestamp: 100,
              },
              {
                id: 's-2',
                step: 2,
                action: { action: 'click', elementId: 12 },
                status: 'running',
                timestamp: 101,
              },
            ],
            status: 'running',
            createdAt: 100,
          },
        ],
      };

      localStorageData['browgent_threads'] = [thread];

      const loaded = await loadThreads();
      const turn = loaded[0].turns[0];

      expect(turn.status).toBe('stopped');
      expect(turn.error).toBe('Execution stopped (panel closed mid-run)');
      expect(turn.steps[1].status).toBe('error');
      expect(turn.steps[1].error).toBe('Interrupted');
      expect(turn.tab?.url).toBe('https://example.com/checkout?token=redacted');
    });
  });

  describe('toConversation', () => {
    it('extracts compact prompt/result pairs for finished turns', () => {
      const thread: Thread = {
        id: 't-conv',
        title: 'Conversation',
        createdAt: 100,
        updatedAt: 200,
        turns: [
          {
            id: 't-1',
            mode: 'agent',
            prompt: 'Find tickets from Pune to Lucknow',
            steps: [],
            status: 'completed',
            result: 'Found 3 flights starting at ₹16,428',
            createdAt: 100,
          },
          {
            id: 't-2',
            mode: 'ask',
            prompt: 'Which is fastest?',
            steps: [],
            status: 'completed',
            result: 'IndiGo nonstop 1h 50m',
            createdAt: 150,
          },
          {
            id: 't-3',
            mode: 'agent',
            prompt: 'Still running turn',
            steps: [],
            status: 'running',
            createdAt: 200,
          },
        ],
      };

      const conv = toConversation(thread);
      expect(conv).toHaveLength(2);
      expect(conv[0]).toEqual({
        prompt: 'Find tickets from Pune to Lucknow',
        result: 'Found 3 flights starting at ₹16,428',
      });
      expect(conv[1]).toEqual({
        prompt: 'Which is fastest?',
        result: 'IndiGo nonstop 1h 50m',
      });
    });

    it('respects maxTurns and maxChars limits', () => {
      const turns: Turn[] = [];
      for (let i = 0; i < 10; i++) {
        turns.push({
          id: `t-${i}`,
          mode: 'ask',
          prompt: `Short prompt ${i}`,
          steps: [],
          status: 'completed',
          result: `Short result ${i}`,
          createdAt: 100 + i,
        });
      }

      const thread: Thread = {
        id: 't-limit',
        title: 'Limits',
        createdAt: 100,
        updatedAt: 200,
        turns,
      };

      // Default maxTurns is 6
      const conv = toConversation(thread, 4);
      expect(conv).toHaveLength(4);
      expect(conv[3].prompt).toBe('Short prompt 9');

      // Tight char limit
      const tight = toConversation(thread, 10, 50);
      expect(tight.length).toBeLessThan(4);
    });
  });
});
