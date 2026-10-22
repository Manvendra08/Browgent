import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type CdpModule = typeof import('../../src/background/cdp');

let cdp: CdpModule;

let debuggerAttach: ReturnType<typeof vi.fn>;
let debuggerDetach: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();

  debuggerAttach = vi.fn().mockResolvedValue(undefined);
  debuggerDetach = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal('chrome', {
    debugger: {
      attach: debuggerAttach,
      detach: debuggerDetach,
      sendCommand: vi.fn(),
      onDetach: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { lastError: undefined },
    tabs: { sendMessage: vi.fn(), update: vi.fn() },
  });

  cdp = await import('../../src/background/cdp');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('CDP attach / detach', () => {
  it('attaches only once when attachDebugger is called twice for the same tab', async () => {
    await cdp.attachDebugger(5);
    await cdp.attachDebugger(5);

    expect(debuggerAttach).toHaveBeenCalledTimes(1);
    expect(debuggerAttach).toHaveBeenCalledWith({ tabId: 5 }, '1.3');
  });

  it('attaches again for a different tab', async () => {
    await cdp.attachDebugger(5);
    await cdp.attachDebugger(6);

    expect(debuggerAttach).toHaveBeenCalledTimes(2);
  });

  it('treats an "Already attached" rejection as success', async () => {
    debuggerAttach.mockRejectedValue(new Error('Already attached to this tab'));

    await expect(cdp.attachDebugger(5)).resolves.toBeUndefined();
  });

  // Chrome's real error message is "Another debugger is already attached to the tab with id N."
  // (lowercase 'a'), so the check in src/background/cdp.ts must be case-insensitive.
  it('treats Chrome\'s real lowercase "already attached" rejection as success', async () => {
    debuggerAttach.mockRejectedValue(
      new Error('Another debugger is already attached to the tab with id 5.')
    );

    await expect(cdp.attachDebugger(5)).resolves.toBeUndefined();
  });

  it('throws an error mentioning the tab id for any other attach rejection', async () => {
    debuggerAttach.mockRejectedValue(new Error('permission denied'));

    await expect(cdp.attachDebugger(9)).rejects.toThrow(/9/);
    await expect(cdp.attachDebugger(9)).rejects.toThrow(/permission denied/);
  });

  it('does not detach a tab that was never attached', async () => {
    await cdp.detachDebugger(42);

    expect(debuggerDetach).not.toHaveBeenCalled();
  });

  it('detaches a tab that was attached', async () => {
    await cdp.attachDebugger(11);
    await cdp.detachDebugger(11);

    expect(debuggerDetach).toHaveBeenCalledTimes(1);
    expect(debuggerDetach).toHaveBeenCalledWith({ tabId: 11 });
  });
});
