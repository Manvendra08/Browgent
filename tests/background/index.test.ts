import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface FakePort {
  name: string;
  postMessage: ReturnType<typeof vi.fn>;
  onDisconnect: { addListener: ReturnType<typeof vi.fn> };
  onMessage: { addListener: ReturnType<typeof vi.fn> };
}

const runMock = vi.fn();
const stopMock = vi.fn();
const constructorArgs: unknown[] = [];

vi.mock('../../src/background/agent', () => ({
  AgentController: class {
    constructor(args: unknown) {
      constructorArgs.push(args);
    }
    run = runMock;
    stop = stopMock;
  },
}));

let connectListener: (port: FakePort) => void;
let installedListener: () => void;
let queryMock: ReturnType<typeof vi.fn>;
let setPanelBehavior: ReturnType<typeof vi.fn>;

function makePort(name = 'browgent-sidepanel'): FakePort {
  const port = {
    name,
    postMessage: vi.fn(),
    onDisconnect: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
  };
  return port as unknown as FakePort;
}

async function loadModule() {
  vi.resetModules();
  await import('../../src/background/index');
}

function lastPortStatus(port: FakePort, type: string) {
  return port.postMessage.mock.calls
    .map((c) => c[0] as { type: string })
    .filter((m) => m.type === type);
}

beforeEach(async () => {
  vi.useFakeTimers();
  runMock.mockReset();
  stopMock.mockReset();
  constructorArgs.length = 0;

  vi.spyOn(console, 'log').mockImplementation(() => {});

  queryMock = vi.fn().mockResolvedValue([
    { id: 42, title: 'Quiz', url: 'https://example.com/quiz', favIconUrl: 'icon.png' },
  ]);
  setPanelBehavior = vi.fn().mockResolvedValue(undefined);

  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      onInstalled: { addListener: (cb: () => void) => { installedListener = cb; } },
      onConnect: { addListener: (cb: (port: FakePort) => void) => { connectListener = cb; } },
    },
    tabs: { query: queryMock },
    sidePanel: { setPanelBehavior },
  };

  await loadModule();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('background service worker', () => {
  it('opens the side panel on action click when installed', () => {
    installedListener();
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });

  it('ignores ports that are not the Browgent side panel', () => {
    const foreign = makePort('some-other-extension');
    connectListener(foreign);
    expect(foreign.onMessage.addListener).not.toHaveBeenCalled();
  });

  it('reports an error when the active tab cannot be found', async () => {
    queryMock.mockResolvedValue([]);
    const port = makePort();
    connectListener(port);

    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;
    await handler({ type: 'START_AGENT', payload: { goal: 'x', llmConfig: { provider: 'omniroute' } } });

    expect(lastPortStatus(port, 'ERROR')[0]).toMatchObject({
      error: expect.stringContaining('No active tab'),
    });
    expect(runMock).not.toHaveBeenCalled();
  });

  it('falls back to the current window when the last focused window returns nothing', async () => {
    queryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 7, title: 'Fallback', url: 'https://example.com/f' }]);
    runMock.mockResolvedValue({ success: true, summary: 'done' });

    const port = makePort();
    connectListener(port);
    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;
    await handler({ type: 'START_AGENT', payload: { goal: 'x', llmConfig: { provider: 'omniroute' } } });

    expect(queryMock).toHaveBeenNthCalledWith(1, { active: true, lastFocusedWindow: true });
    expect(queryMock).toHaveBeenNthCalledWith(2, { active: true, currentWindow: true });
    expect(runMock).toHaveBeenCalledWith(7, 'x', expect.any(Function));
  });

  it('refuses to run on a restricted browser page', async () => {
    queryMock.mockResolvedValue([{ id: 3, title: 'Settings', url: 'chrome://settings' }]);
    const port = makePort();
    connectListener(port);

    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;
    await handler({ type: 'START_AGENT', payload: { goal: 'x', llmConfig: { provider: 'omniroute' } } });

    expect(lastPortStatus(port, 'ERROR')[0]).toMatchObject({
      error: expect.stringContaining('Cannot automate internal browser page'),
    });
    expect(runMock).not.toHaveBeenCalled();
  });

  it('announces the target tab, forwards agent events and reports the result', async () => {
    runMock.mockImplementation(async (_tabId: number, _goal: string, onEvent: (e: unknown) => void) => {
      onEvent({ type: 'STEP', step: 1 });
      return { success: true, summary: 'Completed the quiz' };
    });

    const port = makePort();
    connectListener(port);
    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;
    await handler({ type: 'START_AGENT', payload: { goal: 'do it', llmConfig: { provider: 'omniroute' } } });

    expect(lastPortStatus(port, 'STATUS_UPDATE')[0]).toMatchObject({
      status: 'running',
      tab: { id: 42, title: 'Quiz', url: 'https://example.com/quiz' },
    });
    expect(lastPortStatus(port, 'AGENT_EVENT')[0]).toMatchObject({ event: { type: 'STEP', step: 1 } });
    expect(lastPortStatus(port, 'FINISHED')[0]).toMatchObject({
      success: true,
      summary: 'Completed the quiz',
    });
  });

  it('defaults maxSteps to 25 and passes skills, files and the MCP endpoint through', async () => {
    runMock.mockResolvedValue({ success: true, summary: 'ok' });
    const port = makePort();
    connectListener(port);
    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;
    const skills = [{ id: 's1' }];
    const files = [{ name: 'a.txt' }];

    await handler({
      type: 'START_AGENT',
      payload: {
        goal: 'x',
        llmConfig: { provider: 'omniroute', model: 'anti' },
        skills,
        files,
        mcpEndpoint: 'http://localhost:3000/mcp',
      },
    });

    expect(constructorArgs[0]).toMatchObject({
      maxSteps: 25,
      skills,
      files,
      mcpEndpoint: 'http://localhost:3000/mcp',
    });
  });

  it('surfaces a thrown run error as an ERROR message', async () => {
    runMock.mockRejectedValue(new Error('LLM exploded'));
    const port = makePort();
    connectListener(port);
    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;
    await handler({ type: 'START_AGENT', payload: { goal: 'x', llmConfig: { provider: 'omniroute' } } });

    expect(lastPortStatus(port, 'ERROR')[0]).toMatchObject({ error: 'LLM exploded' });
    expect(lastPortStatus(port, 'FINISHED')).toHaveLength(0);
  });

  it('stops a running agent and acknowledges with a stopped status', async () => {
    runMock.mockReturnValue(new Promise(() => {}));
    const port = makePort();
    connectListener(port);
    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;

    void handler({ type: 'START_AGENT', payload: { goal: 'x', llmConfig: { provider: 'omniroute' } } });
    await vi.waitFor(() => expect(runMock).toHaveBeenCalled());
    await handler({ type: 'STOP_AGENT' });

    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(lastPortStatus(port, 'STATUS_UPDATE').at(-1)).toMatchObject({ status: 'stopped' });
  });

  it('does not error when STOP_AGENT arrives with no run in progress', async () => {
    const port = makePort();
    connectListener(port);
    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;

    await handler({ type: 'STOP_AGENT' });

    expect(stopMock).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('keeps the service worker alive with a heartbeat while the panel is connected', async () => {
    const port = makePort();
    connectListener(port);

    vi.advanceTimersByTime(20000);

    expect(port.postMessage).toHaveBeenCalledWith({ type: 'HEARTBEAT', timestamp: expect.any(Number) });
  });

  it('drops a dead port instead of throwing on heartbeat', () => {
    const port = makePort();
    connectListener(port);
    port.postMessage.mockImplementation(() => { throw new Error('port closed'); });

    expect(() => vi.advanceTimersByTime(20000)).not.toThrow();
    // A second tick must be a no-op now that the port was cleared.
    vi.advanceTimersByTime(20000);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });
});
