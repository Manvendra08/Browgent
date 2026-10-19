// Browgent Background Service Worker
console.log('[Browgent] Background Service Worker initialized.');

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Browgent] Extension installed.');
  // Open side panel on action click if supported
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  }
});
