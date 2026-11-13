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
let actionClickListener: ((tab: { id: number }) => Promise<void>) | null = null;
let tabRemovedListener: ((tabId: number) => void) | null = null;
let tabActivatedListener: ((activeInfo: { tabId: number }) => void) | null = null;
let tabCreatedListener: ((tab: { id: number }) => void) | null = null;
let tabUpdatedListener: ((tabId: number, changeInfo: { status?: string; url?: string }) => void) | null = null;
let contextMenuClickListener: ((info: { menuItemId: string; selectionText?: string }, tab?: { id?: number; windowId?: number }) => void) | null = null;
let queryMock: ReturnType<typeof vi.fn>;
let updateMock: ReturnType<typeof vi.fn>;
let getMock: ReturnType<typeof vi.fn>;
let setPanelBehavior: ReturnType<typeof vi.fn>;
let setOptions: ReturnType<typeof vi.fn>;
let sidePanelOpen: ReturnType<typeof vi.fn>;
let contextMenusCreate: ReturnType<typeof vi.fn>;
let sessionStorageGet: ReturnType<typeof vi.fn>;
let sessionStorageSet: ReturnType<typeof vi.fn>;
let sessionStorageRemove: ReturnType<typeof vi.fn>;

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
  updateMock = vi.fn().mockImplementation(async (id: number, opts: { url: string }) => ({
    id,
    url: opts.url,
    title: 'Navigated Page',
    status: 'complete',
  }));
  getMock = vi.fn().mockImplementation(async (id: number) => ({
    id,
    url: 'https://www.google.com',
    title: 'Google',
    status: 'complete',
  }));
  setPanelBehavior = vi.fn().mockResolvedValue(undefined);
  setOptions = vi.fn().mockResolvedValue(undefined);
  sidePanelOpen = vi.fn().mockResolvedValue(undefined);
  contextMenusCreate = vi.fn();
  sessionStorageGet = vi.fn().mockResolvedValue({});
  sessionStorageSet = vi.fn().mockResolvedValue(undefined);
  sessionStorageRemove = vi.fn().mockResolvedValue(undefined);
  actionClickListener = null;
  tabRemovedListener = null;
  tabActivatedListener = null;
  tabCreatedListener = null;
  tabUpdatedListener = null;
  contextMenuClickListener = null;

  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      onInstalled: { addListener: (cb: () => void) => { installedListener = cb; } },
      onConnect: { addListener: (cb: (port: FakePort) => void) => { connectListener = cb; } },
    },
    action: {
      onClicked: {
        addListener: (cb: (tab: { id: number }) => Promise<void>) => {
          actionClickListener = cb;
        },
      },
    },
    tabs: {
      query: queryMock,
      update: updateMock,
      get: getMock,
      onRemoved: {
        addListener: (cb: (tabId: number) => void) => {
          tabRemovedListener = cb;
        },
      },
      onActivated: {
        addListener: (cb: (activeInfo: { tabId: number }) => void) => {
          tabActivatedListener = cb;
        },
      },
      onCreated: {
        addListener: (cb: (tab: { id: number }) => void) => {
          tabCreatedListener = cb;
        },
      },
      onUpdated: {
        addListener: (cb: (tabId: number, changeInfo: { status?: string; url?: string }) => void) => {
          tabUpdatedListener = cb;
        },
      },
    },
    sidePanel: { setPanelBehavior, setOptions, open: sidePanelOpen },
    contextMenus: {
      create: contextMenusCreate,
      onClicked: {
        addListener: (cb: (info: { menuItemId: string; selectionText?: string }, tab?: { id?: number; windowId?: number }) => void) => {
          contextMenuClickListener = cb;
        },
      },
    },
    storage: {
      session: {
        get: sessionStorageGet,
        set: sessionStorageSet,
        remove: sessionStorageRemove,
      },
    },
  };

  await loadModule();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('background service worker', () => {
  it('configures per-tab side panel behavior and creates context menu when installed', () => {
    installedListener();
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
    expect(contextMenusCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'browgent-ask-selection',
        title: 'Ask Browgent about "%s"',
        contexts: ['selection'],
      }),
    );
  });

  it('enables and opens side panel specifically for the clicked tab on action click and toggles closed on second click', async () => {
    expect(actionClickListener).toBeDefined();
    actionClickListener?.({ id: 99 });

    expect(setOptions).toHaveBeenCalledWith({
      tabId: 99,
      path: 'src/sidepanel/index.html?tabId=99',
      enabled: true,
    });
    expect(sidePanelOpen).toHaveBeenCalledWith({ tabId: 99 });

    // Second click on the same tab toggles it closed
    setOptions.mockClear();
    actionClickListener?.({ id: 99 });
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 99,
      enabled: false,
    });
  });

  it('disables side panel on newly created tabs', () => {
    expect(tabCreatedListener).toBeDefined();
    tabCreatedListener?.({ id: 101 });
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 101,
      enabled: false,
    });
  });

  it('isolates side panel on tab switch: enables active panel tab and disables inactive tab', () => {
    expect(tabActivatedListener).toBeDefined();

    // Tab 55 has not had its panel opened -> disable on switch
    tabActivatedListener?.({ tabId: 55 });
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 55,
      enabled: false,
    });

    // Open side panel on tab 77
    actionClickListener?.({ id: 77 });
    setOptions.mockClear();

    // Switching to tab 77 re-enables it
    tabActivatedListener?.({ tabId: 77 });
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 77,
      path: 'src/sidepanel/index.html?tabId=77',
      enabled: true,
    });
  });

  it('maintains per-tab side panel options on tab update (navigation/reload)', () => {
    expect(tabUpdatedListener).toBeDefined();

    // Tab 105 has not been opened -> enforces disabled on navigation
    tabUpdatedListener?.(105, { status: 'loading' });
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 105,
      enabled: false,
    });

    // Tab 77 was opened -> maintains enabled on navigation
    actionClickListener?.({ id: 77 });
    setOptions.mockClear();

    tabUpdatedListener?.(77, { status: 'loading' });
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 77,
      path: 'src/sidepanel/index.html?tabId=77',
      enabled: true,
    });
  });

  it('keeps tab in activePanelTabs on port disconnect if tab is not active (tab switch), but removes it if active tab closes panel', async () => {
    // Open panel on tab 42
    actionClickListener?.({ id: 42 });
    expect(setOptions).toHaveBeenCalledWith(expect.objectContaining({ tabId: 42, enabled: true }));

    // Connect port for tab 42
    const port42 = makePort('browgent-sidepanel-42');
    connectListener(port42);

    // Simulate tab switch: user opens tab 999 which is now the active tab
    queryMock.mockResolvedValue([{ id: 999, active: true }]);

    // Port 42 disconnects because tab 42 was hidden
    const disconnectCb = port42.onDisconnect.addListener.mock.calls[0][0] as () => void;
    disconnectCb();
    await vi.waitFor(() => {});

    // Now switch back to tab 42
    setOptions.mockClear();
    tabActivatedListener?.({ tabId: 42 });
    // Panel should still be restored because tab 42 remained open!
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 42,
      path: 'src/sidepanel/index.html?tabId=42',
      enabled: true,
    });

    // Now, if active tab is 42 and port disconnects (e.g. user clicked panel close button)
    queryMock.mockResolvedValue([{ id: 42, active: true }]);
    disconnectCb();
    await vi.waitFor(() => {});

    // Now switching to 42 would result in disabled because it was explicitly closed
    setOptions.mockClear();
    tabActivatedListener?.({ tabId: 42 });
    expect(setOptions).toHaveBeenCalledWith({
      tabId: 42,
      enabled: false,
    });
  });

  it('handles context menu click by opening tab-specific side panel and writing tab-scoped pending prompt', async () => {
    expect(contextMenuClickListener).toBeDefined();
    await contextMenuClickListener?.(
      { menuItemId: 'browgent-ask-selection', selectionText: 'Selected paragraph text' },
      { id: 42, windowId: 100 },
    );

    expect(setOptions).toHaveBeenCalledWith({
      tabId: 42,
      path: 'src/sidepanel/index.html?tabId=42',
      enabled: true,
    });
    expect(sidePanelOpen).toHaveBeenCalledWith({ tabId: 42 });
    expect(sessionStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        browgent_pending_prompt_42: {
          text: 'Selected paragraph text',
          mode: 'ask',
        },
        browgent_pending_prompt: {
          text: 'Selected paragraph text',
          mode: 'ask',
        },
      }),
    );
  });

  it('cleans up tab resources, storage, and active agents when a tab is closed', async () => {
    runMock.mockReturnValue(new Promise(() => {}));
    const port = makePort('browgent-sidepanel-42');
    connectListener(port);

    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;
    void handler({
      type: 'START_AGENT',
      payload: { tabId: 42, goal: 'long running', llmConfig: { provider: 'omniroute' } },
    });

    await vi.waitFor(() => expect(runMock).toHaveBeenCalled());

    expect(tabRemovedListener).toBeDefined();
    tabRemovedListener?.(42);

    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: false });
    expect(sessionStorageRemove).toHaveBeenCalledWith([
      'browgent_tab_thread_42',
      'browgent_pending_prompt_42',
    ]);
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

  it('auto-navigates when launched from chrome://newtab/ with a goal containing a target website', async () => {
    queryMock.mockResolvedValue([{ id: 10, title: 'New Tab', url: 'chrome://newtab/' }]);
    runMock.mockResolvedValue({ success: true, summary: 'Found flight results' });

    const port = makePort();
    connectListener(port);
    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;

    await handler({
      type: 'START_AGENT',
      payload: {
        goal: 'go to google.com and Search cheapest from pune to lucknow on 5th november',
        llmConfig: { provider: 'omniroute' },
      },
    });

    expect(updateMock).toHaveBeenCalledWith(10, { url: 'https://google.com' });
    expect(runMock).toHaveBeenCalledWith(
      10,
      'go to google.com and Search cheapest from pune to lucknow on 5th november',
      expect.any(Function)
    );
  });

  it('auto-navigates to google.com when launched from a blank tab without an explicit website', async () => {
    queryMock.mockResolvedValue([{ id: 12, title: 'New Tab', url: 'about:blank' }]);
    runMock.mockResolvedValue({ success: true, summary: 'Search complete' });

    const port = makePort();
    connectListener(port);
    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;

    await handler({
      type: 'START_AGENT',
      payload: {
        goal: 'Search cheapest flight from pune to lucknow',
        llmConfig: { provider: 'omniroute' },
      },
    });

    expect(updateMock).toHaveBeenCalledWith(12, { url: 'https://www.google.com' });
    expect(runMock).toHaveBeenCalledWith(12, 'Search cheapest flight from pune to lucknow', expect.any(Function));
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

  it('isolates agents and ports across tabs so stopping one does not stop another', async () => {
    let resolveRun1: (val: unknown) => void = () => {};
    let resolveRun2: (val: unknown) => void = () => {};
    runMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRun1 = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRun2 = resolve; }));

    getMock.mockImplementation(async (id: number) => ({
      id,
      url: `https://example.com/tab${id}`,
      title: `Tab ${id}`,
      status: 'complete',
    }));

    const port1 = makePort('browgent-sidepanel-10');
    const port2 = makePort('browgent-sidepanel-20');
    connectListener(port1);
    connectListener(port2);

    const handler1 = port1.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;
    const handler2 = port2.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;

    void handler1({ type: 'START_AGENT', payload: { tabId: 10, goal: 'Goal 10', llmConfig: { provider: 'omniroute' } } });
    void handler2({ type: 'START_AGENT', payload: { tabId: 20, goal: 'Goal 20', llmConfig: { provider: 'omniroute' } } });

    await vi.waitFor(() => expect(runMock).toHaveBeenCalledTimes(2));

    // Stop only tab 10
    await handler1({ type: 'STOP_AGENT', payload: { tabId: 10 } });
    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(lastPortStatus(port1, 'STATUS_UPDATE').at(-1)).toMatchObject({ status: 'stopped' });

    // Port 2 received no stopped update
    const port2Statuses = lastPortStatus(port2, 'STATUS_UPDATE');
    expect(port2Statuses.some((s: unknown) => (s as { status: string }).status === 'stopped')).toBe(false);

    resolveRun1({ success: false });
    resolveRun2({ success: true, summary: 'Tab 2 finished' });
  });

  it('tracks background missions across tabs and broadcasts MISSIONS_UPDATE', async () => {
    let resolveRun: (val: unknown) => void = () => {};
    runMock.mockImplementationOnce(() => new Promise((resolve) => { resolveRun = resolve; }));

    getMock.mockImplementation(async (id: number) => ({
      id,
      url: `https://example.com/test-tab`,
      title: 'Mission Tab',
      status: 'complete',
    }));

    const port = makePort('browgent-sidepanel-30');
    connectListener(port);
    const handler = port.onMessage.addListener.mock.calls[0][0] as (m: unknown) => Promise<void>;

    void handler({
      type: 'START_AGENT',
      payload: { tabId: 30, goal: 'Investigate quarterly filings', llmConfig: { provider: 'omniroute' } },
    });

    await vi.waitFor(() => expect(runMock).toHaveBeenCalledTimes(1));

    // Check MISSIONS_UPDATE was received
    const missionUpdates = lastPortStatus(port, 'MISSIONS_UPDATE') as unknown as Array<{
      type: string;
      missions: Array<{ tabId: number; status: string; goal: string; title: string }>;
    }>;
    expect(missionUpdates.length).toBeGreaterThan(0);
    const latest = missionUpdates[missionUpdates.length - 1];
    expect(latest.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tabId: 30,
          status: 'running',
          goal: 'Investigate quarterly filings',
          title: 'Mission Tab',
        }),
      ]),
    );

    // Test GET_MISSIONS explicitly
    await handler({ type: 'GET_MISSIONS' });
    const getMissionsCall = (lastPortStatus(port, 'MISSIONS_UPDATE') as unknown as Array<{
      type: string;
      missions: Array<{ tabId: number }>;
    }>).at(-1);
    expect(getMissionsCall?.missions.some((m) => m.tabId === 30)).toBe(true);

    // Resolve run to complete
    resolveRun({ success: true, summary: 'Investigation complete' });
    await vi.waitFor(() => {
      const completedUpdates = lastPortStatus(port, 'MISSIONS_UPDATE') as unknown as Array<{
        missions: Array<{ tabId: number; status: string }>;
      }>;
      const found = completedUpdates.find((u) => u.missions.some((m) => m.tabId === 30 && m.status === 'completed'));
      expect(found).toBeDefined();
    });

    // Test DISMISS_MISSION
    await handler({ type: 'DISMISS_MISSION', payload: { tabId: 30 } });
    const afterDismiss = (lastPortStatus(port, 'MISSIONS_UPDATE') as unknown as Array<{
      missions: Array<{ tabId: number }>;
    }>).at(-1);
    expect(afterDismiss?.missions.some((m) => m.tabId === 30)).toBe(false);
  });
});
