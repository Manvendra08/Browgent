import { captureDOMState } from './extractor';
import { drawElementBadges, clearElementBadges } from './overlay';

console.log('[Browgent] Content script active.');

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

  return false;
});
