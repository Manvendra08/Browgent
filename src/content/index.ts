import { captureDOMState, isKnownElement } from './extractor';
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
    window.scrollBy({
      top: message.deltaY || 0,
      left: message.deltaX || 0,
      behavior: 'smooth',
    });
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
      el.focus();
      el.click();

      // If clicking a label or radio/checkbox, explicitly trigger checked and change events
      if (el instanceof HTMLInputElement && el.type === 'radio') {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (el.tagName === 'LABEL') {
        const input = el.querySelector('input');
        if (input && input.type === 'radio') {
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (input && input.type === 'checkbox') {
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
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

  if (message.type === 'TYPE_ELEMENT') {
    const el = resolveOwnedElement(message.elementId) as HTMLElement;
    if (el) {
      try {
        el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      } catch {
        // ignore
      }
      el.focus();

      const isEditable = el.isContentEditable || el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true';
      if (isEditable) {
        el.textContent = message.text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const proto = el instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(el, message.text);
        } else {
          el.value = message.text;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        (el as unknown as { value?: string }).value = message.text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (message.pressEnter) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        if (el instanceof HTMLInputElement && el.form && typeof el.form.requestSubmit === 'function') {
          try {
            el.form.requestSubmit();
          } catch {
            // ignore validation errors
          }
        }
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
