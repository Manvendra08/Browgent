// Chrome DevTools Protocol (CDP) Dispatcher via chrome.debugger

const attachedTabs = new Set<number>();

if (typeof chrome !== 'undefined' && chrome.debugger) {
  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId) {
      attachedTabs.delete(source.tabId);
      console.log(`[Browgent CDP] Debugger detached from tab ${source.tabId}`);
    }
  });
}

export async function attachDebugger(tabId: number): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.debugger) {
    return; // In testing environment
  }

  if (attachedTabs.has(tabId)) {
    return;
  }

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attachedTabs.add(tabId);
    console.log(`[Browgent CDP] Debugger attached to tab ${tabId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already attached/i.test(msg)) {
      attachedTabs.add(tabId);
    } else {
      throw new Error(`Failed to attach debugger to tab ${tabId}: ${msg}`);
    }
  }
}

export async function detachDebugger(tabId: number): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.debugger) {
    return;
  }

  if (!attachedTabs.has(tabId)) {
    return;
  }

  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // Ignore error if already detached
  } finally {
    attachedTabs.delete(tabId);
  }
}

export async function sendCdpCommand(tabId: number, method: string, params: object = {}): Promise<unknown> {
  if (typeof chrome === 'undefined' || !chrome.debugger) {
    return {};
  }
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(result);
    });
  });
}

export async function dispatchClick(tabId: number, x: number, y: number): Promise<void> {
  await attachDebugger(tabId);

  // 1. Move mouse to target
  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
  });

  // 2. Mouse Press
  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });

  // 3. Mouse Release
  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}

export async function dispatchType(tabId: number, text: string, pressEnter: boolean = false): Promise<void> {
  await attachDebugger(tabId);

  for (const char of text) {
    // Send keyDown and char events
    await sendCdpCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
      unmodifiedText: char,
    });
    await sendCdpCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
    });
  }

  if (pressEnter) {
    await sendCdpCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await sendCdpCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
  }
}

export async function dispatchScroll(tabId: number, deltaY: number, deltaX: number = 0): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.sendMessage) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'SCROLL_WINDOW',
        deltaY,
        deltaX,
      });
      return;
    } catch {
      // Fallback to CDP wheel event if content script isn't reachable
    }
  }

  await attachDebugger(tabId);
  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: 100,
    y: 100,
    deltaX,
    deltaY,
  });
}

export async function dispatchHover(tabId: number, x: number, y: number): Promise<void> {
  await attachDebugger(tabId);
  await sendCdpCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
  });
}

export async function dispatchKeyPress(tabId: number, key: string): Promise<void> {
  await attachDebugger(tabId);

  const keyMap: Record<string, { code: string; keyCode: number }> = {
    Enter: { code: 'Enter', keyCode: 13 },
    Tab: { code: 'Tab', keyCode: 9 },
    Escape: { code: 'Escape', keyCode: 27 },
    Backspace: { code: 'Backspace', keyCode: 8 },
    Space: { code: 'Space', keyCode: 32 },
    ArrowDown: { code: 'ArrowDown', keyCode: 40 },
    ArrowUp: { code: 'ArrowUp', keyCode: 38 },
    ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
    ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  };

  const info = keyMap[key] || { code: key, keyCode: 0 };

  await sendCdpCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key,
    code: info.code,
    windowsVirtualKeyCode: info.keyCode,
    nativeVirtualKeyCode: info.keyCode,
  });
  await sendCdpCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code: info.code,
    windowsVirtualKeyCode: info.keyCode,
    nativeVirtualKeyCode: info.keyCode,
  });
}

export async function navigateToUrl(tabId: number, url: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.update) {
    await chrome.tabs.update(tabId, { url });
  }
}
