export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.trim().length >= 8) {
      out = out.split(secret.trim()).join('[REDACTED]');
    }
  }
  return out;
}

export function truncateErrorBody(body: string, limit: number = 500): string {
  const trimmed = body.length > limit ? `${body.substring(0, limit)}... [truncated]` : body;
  return trimmed;
}

export class NetworkError extends Error {}

export const LLM_REQUEST_TIMEOUT_MS = 120000;

interface CombinedSignal {
  signal: AbortSignal;
  timedOut: () => boolean;
  cleanup: () => void;
}

function combineSignals(external: AbortSignal | undefined, timeoutMs: number): CombinedSignal {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

export async function fetchLLM(
  endpoint: string,
  init: RequestInit,
  label: string,
  externalSignal?: AbortSignal,
  timeoutMs: number = LLM_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const combined = combineSignals(externalSignal, timeoutMs);
  try {
    return await fetch(endpoint, { ...init, signal: combined.signal });
  } catch (err: unknown) {
    if (combined.timedOut()) {
      throw new NetworkError(`Request to ${label} timed out after ${Math.round(timeoutMs / 1000)}s (${endpoint})`);
    }
    if (externalSignal?.aborted) {
      throw new NetworkError(`Request to ${label} was cancelled (${endpoint})`);
    }
    if (err instanceof TypeError && /fetch/i.test(err.message)) {
      throw new NetworkError(`Cannot reach ${label} at ${endpoint} — is the server running?`);
    }
    throw err;
  } finally {
    combined.cleanup();
  }
}
