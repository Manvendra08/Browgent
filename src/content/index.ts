import { captureDOMState, isKnownElement, findActiveModal } from './extractor';
import { drawElementBadges, clearElementBadges } from './overlay';

console.log('[Browgent] Content script active.');

function resolveOwnedElement(elementId: number): HTMLElement | null {
  const candidates = document.querySelectorAll(`[data-browgent-id="${elementId}"]`);
  for (const candidate of Array.from(candidates)) {
    if (isKnownElement(document, candidate, elementId)) {
      return candidate as HTMLElement;
    }
  }
  return null;
}

function elementRect(el: Element): { x: number; y: number; width: number; height: number } {
  const domRect = el.getBoundingClientRect();
  return {
    x: Math.round(domRect.x || domRect.left || 0),
    y: Math.round(domRect.y || domRect.top || 0),
    width: Math.round(domRect.width || 0),
    height: Math.round(domRect.height || 0),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_DOM_STATE') {
    try {
      const state = captureDOMState(document);
      if (message.showOverlay) {
        drawElementBadges(state.elements);
      }
      sendResponse({ success: true, data: state });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendResponse({ success: false, error: msg });
    }
    return true; // Keep message channel open for async response
  }

  if (message.type === 'CLEAR_OVERLAYS') {
    clearElementBadges();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'SCROLL_WINDOW') {
    const activeModal = findActiveModal(document);
    let scrolledModal = false;
    if (activeModal) {
      const scrollable = (activeModal.querySelector('[class*="content" i], [class*="body" i], [class*="scroll" i], form') || activeModal) as HTMLElement;
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
        scrollable.scrollBy({
          top: message.deltaY || 0,
          left: message.deltaX || 0,
          behavior: 'instant',
        });
        scrolledModal = true;
      }
    }
    if (!scrolledModal) {
      window.scrollBy({
        top: message.deltaY || 0,
        left: message.deltaX || 0,
        behavior: 'instant',
      });
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'CLICK_ELEMENT') {
    const el = resolveOwnedElement(message.elementId);
    if (el) {
      try {
        el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      } catch {
        // ignore
      }

      // Dispatch full authentic pointer/mouse lifecycle events
      try {
        const rect = el.getBoundingClientRect();
        const clientX = Math.round(rect.left + rect.width / 2);
        const clientY = Math.round(rect.top + rect.height / 2);
        const mouseOpts = { bubbles: true, cancelable: true, view: window, clientX, clientY };
        if (typeof PointerEvent !== 'undefined') {
          el.dispatchEvent(new PointerEvent('pointerdown', mouseOpts));
        }
        el.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
      } catch {
        // ignore
      }

      el.focus();

      try {
        const rect = el.getBoundingClientRect();
        const clientX = Math.round(rect.left + rect.width / 2);
        const clientY = Math.round(rect.top + rect.height / 2);
        const mouseOpts = { bubbles: true, cancelable: true, view: window, clientX, clientY };
        if (typeof PointerEvent !== 'undefined') {
          el.dispatchEvent(new PointerEvent('pointerup', mouseOpts));
        }
        el.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
      } catch {
        // ignore
      }

      el.click();

      // Find any linked or child input (for radio / checkbox)
      let associatedInput: HTMLInputElement | null = null;
      if (el instanceof HTMLInputElement) {
        associatedInput = el;
      } else if (el.tagName === 'LABEL') {
        associatedInput = el.querySelector('input');
        if (!associatedInput && el.getAttribute('for')) {
          try {
            const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.getAttribute('for')!) : el.getAttribute('for')!;
            associatedInput = document.querySelector(`input#${escaped}`) as HTMLInputElement | null;
          } catch {
            // ignore
          }
        }
      }

      if (associatedInput && associatedInput.type === 'radio') {
        associatedInput.checked = true;
        associatedInput.dispatchEvent(new Event('input', { bubbles: true }));
        associatedInput.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (associatedInput && associatedInput.type === 'checkbox') {
        associatedInput.dispatchEvent(new Event('input', { bubbles: true }));
        associatedInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Report the fresh post-scroll rect so CDP fallback clicks the right spot
      const domRect = el.getBoundingClientRect();
      sendResponse({
        success: true,
        rect: {
          x: Math.round(domRect.x || domRect.left || 0),
          y: Math.round(domRect.y || domRect.top || 0),
          width: Math.round(domRect.width || 0),
          height: Math.round(domRect.height || 0),
        },
      });
    } else {
      sendResponse({ success: false, error: `Element with id ${message.elementId} not found in DOM` });
    }
    return true;
  }

  if (message.type === 'SELECT_OPTION') {
    const el = resolveOwnedElement(message.elementId);
    if (!el) {
      sendResponse({ success: false, error: `Element with id ${message.elementId} not found in DOM` });
      return true;
    }
    const selectEl = (el instanceof HTMLSelectElement ? el : el.querySelector('select')) as HTMLSelectElement | null;
    if (!selectEl) {
      sendResponse({ success: false, error: `Element [${message.elementId}] is not a <select> element` });
      return true;
    }
    const val = String(message.value || '').trim().toLowerCase();
    const options = Array.from(selectEl.options);
    let matchedOption = options.find((opt) => opt.value.trim().toLowerCase() === val);
    if (!matchedOption) {
      matchedOption = options.find((opt) => (opt.text || opt.textContent || '').trim().toLowerCase().includes(val));
    }
    if (matchedOption) {
      selectEl.value = matchedOption.value;
      matchedOption.selected = true;
      selectEl.dispatchEvent(new Event('input', { bubbles: true }));
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      sendResponse({ success: true });
    } else {
      sendResponse({
        success: false,
        error: `Option "${message.value}" not found in <select> options: [${options.map((o) => o.value || o.text).join(', ')}]`,
      });
    }
    return true;
  }

  if (message.type === 'HOVER_ELEMENT') {
    const el = resolveOwnedElement(message.elementId);
    if (!el) {
      sendResponse({ success: false, error: `Element with id ${message.elementId} not found in DOM` });
      return true;
    }
    try {
      el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    } catch {
      // ignore
    }
    try {
      const rect = el.getBoundingClientRect();
      const clientX = Math.round(rect.left + rect.width / 2);
      const clientY = Math.round(rect.top + rect.height / 2);
      const mouseOpts = { bubbles: true, cancelable: true, view: window, clientX, clientY };
      if (typeof PointerEvent !== 'undefined') {
        el.dispatchEvent(new PointerEvent('pointerover', mouseOpts));
        el.dispatchEvent(new PointerEvent('pointerenter', mouseOpts));
      }
      el.dispatchEvent(new MouseEvent('mouseover', mouseOpts));
      el.dispatchEvent(new MouseEvent('mouseenter', mouseOpts));
      el.dispatchEvent(new MouseEvent('mousemove', mouseOpts));
    } catch {
      // ignore
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'PRESS_KEY') {
    const key = String(message.key || 'Enter');
    const target = (document.activeElement || document.body) as HTMLElement;
    const keyOpts = { key, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
    target.dispatchEvent(new KeyboardEvent('keypress', keyOpts));
    target.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TYPE_ELEMENT') {
    const el = resolveOwnedElement(message.elementId) as HTMLElement;
    if (el) {
      try {
        el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      } catch {
        // ignore
      }

      // If el is a container or label wrapping an input, resolve the actual input target
      let targetInput: HTMLElement = el;
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement) && !el.isContentEditable) {
        const nestedInput = el.querySelector('input:not([type="hidden"]), textarea, [contenteditable="true"]') as HTMLElement | null;
        if (nestedInput) {
          targetInput = nestedInput;
        } else if (el.tagName === 'LABEL' && el.getAttribute('for')) {
          try {
            const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.getAttribute('for')!) : el.getAttribute('for')!;
            const linked = document.querySelector(`input#${escaped}, textarea#${escaped}`) as HTMLElement | null;
            if (linked) targetInput = linked;
          } catch {
            // ignore
          }
        }
      }

      targetInput.focus();

      const isEditable = targetInput.isContentEditable ||
        targetInput.contentEditable === 'true' ||
        targetInput.getAttribute('contenteditable') === 'true' ||
        targetInput.getAttribute('role') === 'textbox';
      if (isEditable) {
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(targetInput);
          selection?.removeAllRanges();
          selection?.addRange(range);
          const execOk = document.execCommand('insertText', false, message.text);
          if (!execOk) {
            targetInput.textContent = message.text;
          }
        } catch {
          targetInput.textContent = message.text;
        }

        try {
          targetInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: message.text }));
        } catch {
          // ignore if InputEvent constructor is not available
        }
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        targetInput.dispatchEvent(new Event('blur', { bubbles: true }));
      } else if (targetInput instanceof HTMLInputElement || targetInput instanceof HTMLTextAreaElement) {
        const proto = targetInput instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(targetInput, '');
          nativeSetter.call(targetInput, message.text);
        } else {
          targetInput.value = message.text;
        }

        // Reset React's internal value tracker so React synthetic event system triggers onChange
        const tracker = (targetInput as unknown as { _valueTracker?: { setValue: (v: string) => void } })._valueTracker;
        if (tracker) {
          tracker.setValue('');
        }

        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        targetInput.dispatchEvent(new Event('blur', { bubbles: true }));
      } else {
        (targetInput as unknown as { value?: string }).value = message.text;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        targetInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }

      if (message.pressEnter) {
        targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        targetInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        targetInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        if (targetInput instanceof HTMLInputElement && targetInput.form && typeof targetInput.form.requestSubmit === 'function') {
          try {
            targetInput.form.requestSubmit();
          } catch {
            // ignore validation errors
          }
        }
      }

      // Report the fresh post-scroll rect so CDP fallback clicks the right spot
      const domRect = targetInput.getBoundingClientRect();
      sendResponse({
        success: true,
        rect: {
          x: Math.round(domRect.x || domRect.left || 0),
          y: Math.round(domRect.y || domRect.top || 0),
          width: Math.round(domRect.width || 0),
          height: Math.round(domRect.height || 0),
        },
      });
    } else {
      sendResponse({ success: false, error: `Element with id ${message.elementId} not found in DOM` });
    }
    return true;
  }

  if (message.type === 'GET_ELEMENT_RECT') {
    const el = resolveOwnedElement(message.elementId);
    if (el) {
      sendResponse({ success: true, rect: elementRect(el) });
    } else {
      sendResponse({ success: false, error: `Element with id ${message.elementId} not found in DOM` });
    }
    return true;
  }

  return false;
});
