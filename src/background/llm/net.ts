export class NetworkError extends Error {}

export async function fetchLLM(endpoint: string, init: RequestInit, label: string): Promise<Response> {
  try {
    return await fetch(endpoint, init);
  } catch (err) {
    if (err instanceof TypeError && /fetch/i.test(err.message)) {
      throw new NetworkError(`Cannot reach ${label} at ${endpoint} — is the server running?`);
    }
    throw err;
  }
}
