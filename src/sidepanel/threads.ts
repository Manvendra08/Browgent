import { AgentAction } from '../background/types';
import { FeedItem } from './components/StepFeed';

export type TurnMode = 'ask' | 'agent';

export interface Turn {
  id: string;
  mode: TurnMode;
  prompt: string;
  tab?: {
    title?: string;
    url?: string;
  };
  steps: FeedItem[];
  result?: string;
  error?: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  createdAt: number;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: Turn[];
}

export interface ConversationTurn {
  prompt: string;
  result: string;
}

export const THREADS_STORAGE_KEY = 'browgent_threads';
export const MAX_THREADS = 20;
export const MAX_TURNS_PER_THREAD = 30;

export function redactAction(action?: AgentAction): AgentAction | undefined {
  if (!action) return undefined;
  if (action.action === 'type' && typeof action.text === 'string') {
    return {
      ...action,
      text: `[${action.text.length} chars redacted]`,
    };
  }
  return action;
}

export function sanitizeThreadForPersistence(thread: Thread): Thread {
  const turns = thread.turns.slice(-MAX_TURNS_PER_THREAD).map((turn) => ({
    ...turn,
    steps: turn.steps.map((step) => ({
      ...step,
      action: redactAction(step.action),
    })),
  }));

  return {
    ...thread,
    turns,
  };
}

export async function loadThreads(): Promise<Thread[]> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return [];
  }
  try {
    const result = await chrome.storage.local.get([THREADS_STORAGE_KEY]);
    const stored = result[THREADS_STORAGE_KEY];
    if (Array.isArray(stored)) {
      return stored as Thread[];
    }
    return [];
  } catch (err: unknown) {
    console.warn('[Browgent Threads] Failed to load threads from storage:', err);
    return [];
  }
}

export async function saveThreads(threads: Thread[]): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return;
  }
  try {
    // Sort descending by updatedAt, keep newest MAX_THREADS
    const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
    const capped = sorted.slice(0, MAX_THREADS).map(sanitizeThreadForPersistence);
    await chrome.storage.local.set({ [THREADS_STORAGE_KEY]: capped });
  } catch (err: unknown) {
    console.warn('[Browgent Threads] Failed to save threads to storage:', err);
  }
}

export interface AgentEventPayload {
  type: 'step' | 'thought' | 'action' | 'action_result' | 'done' | 'error';
  data?: unknown;
}

export function applyAgentEvent(turn: Turn, event: AgentEventPayload): Turn {
  const nextSteps = [...turn.steps];

  switch (event.type) {
    case 'step': {
      const stepData = event.data as { step: number; maxSteps?: number };
      const stepNum = stepData?.step ?? nextSteps.length + 1;
      nextSteps.push({
        id: `step-${stepNum}-${Date.now()}`,
        step: stepNum,
        status: 'running',
        timestamp: Date.now(),
      });
      return {
        ...turn,
        status: 'running',
        steps: nextSteps,
      };
    }

    case 'thought': {
      const thoughtData = event.data as { thought: string };
      if (nextSteps.length > 0) {
        const last = nextSteps[nextSteps.length - 1];
        nextSteps[nextSteps.length - 1] = {
          ...last,
          thought: thoughtData?.thought,
        };
      }
      return {
        ...turn,
        steps: nextSteps,
      };
    }

    case 'action': {
      const actionData = event.data as {
        step: number;
        action: AgentAction;
        subIndex?: number;
        total?: number;
      };
      const { action, subIndex, total, step } = actionData || {};

      if (typeof subIndex === 'number' && subIndex > 0) {
        nextSteps.push({
          id: `step-${step}-sub-${subIndex}-${Date.now()}`,
          step,
          thought: `Chained action ${subIndex + 1}/${total || subIndex + 1}`,
          action,
          status: 'running',
          timestamp: Date.now(),
        });
      } else if (nextSteps.length > 0) {
        const last = nextSteps[nextSteps.length - 1];
        nextSteps[nextSteps.length - 1] = {
          ...last,
          action,
          status: 'running',
        };
      }
      return {
        ...turn,
        steps: nextSteps,
      };
    }

    case 'action_result': {
      const resData = event.data as { success: boolean; result?: string; error?: string };
      if (nextSteps.length > 0) {
        const last = nextSteps[nextSteps.length - 1];
        nextSteps[nextSteps.length - 1] = {
          ...last,
          status: resData?.success ? 'success' : 'error',
          error: resData?.error,
        };
      }
      return {
        ...turn,
        steps: nextSteps,
      };
    }

    case 'done': {
      const doneData = event.data as { summary: string };
      return {
        ...turn,
        status: 'completed',
        result: doneData?.summary,
      };
    }

    case 'error': {
      const errData = event.data as { error: string };
      return {
        ...turn,
        status: 'failed',
        error: errData?.error,
      };
    }

    default:
      return turn;
  }
}

export function toConversation(
  thread?: Thread | null,
  maxTurns: number = 6,
  maxChars: number = 4000,
): ConversationTurn[] {
  if (!thread || !thread.turns || thread.turns.length === 0) {
    return [];
  }

  // Filter completed/failed/stopped turns that produced a result or error
  const eligible = thread.turns
    .filter((t) => t.status !== 'running' && (Boolean(t.result) || Boolean(t.error)))
    .slice(-maxTurns);

  const mapped: ConversationTurn[] = eligible.map((t) => ({
    prompt: t.prompt,
    result: t.result || `Error: ${t.error}`,
  }));

  // Budget chars from newest to oldest
  let totalChars = 0;
  const result: ConversationTurn[] = [];

  for (let i = mapped.length - 1; i >= 0; i--) {
    const item = mapped[i];
    const len = item.prompt.length + item.result.length;
    if (totalChars + len > maxChars && result.length > 0) {
      break;
    }
    result.unshift(item);
    totalChars += len;
  }

  return result;
}
