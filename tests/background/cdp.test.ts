import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DialogInfo } from '../../src/background/cdp';

type CdpModule = typeof import('../../src/background/cdp');

let cdp: CdpModule;

let debuggerAttach: ReturnType<typeof vi.fn>;
let debuggerDetach: ReturnType<typeof vi.fn>;
let debuggerSendCommand: ReturnType<typeof vi.fn>;
let onEventListener: ((source: chrome.debugger.Debuggee, method: string, params?: unknown) => void) | null = null;
let addEventListenerMock: ReturnType<typeof vi.fn>;
let removeEventListenerMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();

  debuggerAttach = vi.fn().mockResolvedValue(undefined);
  debuggerDetach = vi.fn().mockResolvedValue(undefined);
  debuggerSendCommand = vi.fn((_target, _method, _params, cb) => {
    if (cb) cb({});
  });
  onEventListener = null;
  addEventListenerMock = vi.fn((listener) => {
    onEventListener = listener;
  });
  removeEventListenerMock = vi.fn((listener) => {
    if (onEventListener === listener) {
      onEventListener = null;
    }
  });

  vi.stubGlobal('chrome', {
    debugger: {
      attach: debuggerAttach,
      detach: debuggerDetach,
      sendCommand: debuggerSendCommand,
      onDetach: { addListener: vi.fn(), removeListener: vi.fn() },
      onEvent: { addListener: addEventListenerMock, removeListener: removeEventListenerMock },
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

describe('CDP enableDialogHandling', () => {
  it('enables Page domain and handles alert and beforeunload dialogs by accepting', async () => {
    const dialogs: DialogInfo[] = [];
    const disposer = await cdp.enableDialogHandling(5, (d) => dialogs.push(d));

    expect(debuggerAttach).toHaveBeenCalledWith({ tabId: 5 }, '1.3');
    expect(debuggerSendCommand).toHaveBeenCalledWith({ tabId: 5 }, 'Page.enable', {}, expect.any(Function));
    expect(addEventListenerMock).toHaveBeenCalled();
    expect(onEventListener).toBeDefined();

    // Trigger alert
    onEventListener!({ tabId: 5 }, 'Page.javascriptDialogOpening', {
      type: 'alert',
      message: 'Notice to user',
    });

    expect(debuggerSendCommand).toHaveBeenCalledWith(
      { tabId: 5 },
      'Page.handleJavaScriptDialog',
      { accept: true },
      expect.any(Function)
    );
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toEqual({ type: 'alert', message: 'Notice to user' });

    // Trigger beforeunload
    onEventListener!({ tabId: 5 }, 'Page.javascriptDialogOpening', {
      type: 'beforeunload',
      message: 'Changes may not be saved',
    });

    expect(debuggerSendCommand).toHaveBeenCalledWith(
      { tabId: 5 },
      'Page.handleJavaScriptDialog',
      { accept: true },
      expect.any(Function)
    );
    expect(dialogs[1]).toEqual({ type: 'beforeunload', message: 'Changes may not be saved' });

    disposer();
    expect(removeEventListenerMock).toHaveBeenCalled();
  });

  it('handles confirm and prompt dialogs by dismissing (accept: false)', async () => {
    const dialogs: DialogInfo[] = [];
    const disposer = await cdp.enableDialogHandling(7, (d) => dialogs.push(d));

    // Trigger confirm
    onEventListener!({ tabId: 7 }, 'Page.javascriptDialogOpening', {
      type: 'confirm',
      message: 'Are you sure you want to delete?',
    });

    expect(debuggerSendCommand).toHaveBeenCalledWith(
      { tabId: 7 },
      'Page.handleJavaScriptDialog',
      { accept: false },
      expect.any(Function)
    );
    expect(dialogs[0]).toEqual({ type: 'confirm', message: 'Are you sure you want to delete?' });

    // Trigger prompt
    onEventListener!({ tabId: 7 }, 'Page.javascriptDialogOpening', {
      type: 'prompt',
      message: 'Enter your name:',
    });

    expect(debuggerSendCommand).toHaveBeenCalledWith(
      { tabId: 7 },
      'Page.handleJavaScriptDialog',
      { accept: false },
      expect.any(Function)
    );
    expect(dialogs[1]).toEqual({ type: 'prompt', message: 'Enter your name:' });

    disposer();
  });

  it('ignores dialog events from different tabs', async () => {
    const dialogs: DialogInfo[] = [];
    const disposer = await cdp.enableDialogHandling(5, (d) => dialogs.push(d));

    debuggerSendCommand.mockClear();

    // Event from tab 99
    onEventListener!({ tabId: 99 }, 'Page.javascriptDialogOpening', {
      type: 'alert',
      message: 'Different tab',
    });

    expect(debuggerSendCommand).not.toHaveBeenCalledWith(
      expect.anything(),
      'Page.handleJavaScriptDialog',
      expect.anything(),
      expect.anything()
    );
    expect(dialogs).toHaveLength(0);

    disposer();
  });
});
