import { AgentController } from './agent';
import { LLMConfig } from './llm/types';
import { Skill } from './skills/types';
import { AttachedFile } from './files/parser';
import {
  isRestrictedUrl,
  isNewTabPage,
  extractTargetUrlFromGoal,
  RESTRICTED_URL_HINT,
} from './restricted';

console.log('[Browgent] Background Service Worker active.');

let activeAgent: AgentController | null = null;
let sidepanelPort: chrome.runtime.Port | null = null;

async function waitForTabLoaded(tabId: number, timeoutMs = 15000): Promise<chrome.tabs.Tab | null> {
  const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  if (isTest) {
    if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.get === 'function') {
      try {
        return await chrome.tabs.get(tabId);
      } catch {
        return null;
      }
    }
    return null;
  }

  const start = Date.now();
  await new Promise((r) => setTimeout(r, 200));

  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.status === 'complete' && tab.url && !isNewTabPage(tab.url)) {
        return tab;
      }
    } catch {
      // Tab may be navigating or transitioning
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

// Keep-alive heartbeat interval to prevent service worker termination
setInterval(() => {
  if (sidepanelPort) {
    try {
      sidepanelPort.postMessage({ type: 'HEARTBEAT', timestamp: Date.now() });
    } catch {
      sidepanelPort = null;
    }
  }
}, 20000);

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Browgent] Extension installed.');
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'browgent-sidepanel') {
    sidepanelPort = port;
    console.log('[Browgent] Sidepanel connected.');

    port.onDisconnect.addListener(() => {
      console.log('[Browgent] Sidepanel disconnected.');
      sidepanelPort = null;
    });

    port.onMessage.addListener(async (msg) => {
      if (msg.type === 'START_AGENT') {
        const { goal, llmConfig, maxSteps, skills, files, mcpEndpoint } = msg.payload as {
          goal: string;
          llmConfig: LLMConfig;
          maxSteps?: number;
          skills?: Skill[];
          files?: AttachedFile[];
          mcpEndpoint?: string;
        };

        // Find the active tab: prefer the last focused window (the one the
        // side panel is attached to), fall back to the current window.
        let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        }
        const activeTab = tabs[0];
        if (!activeTab || typeof activeTab.id !== 'number') {
          port.postMessage({ type: 'ERROR', error: 'No active tab found to operate on.' });
          return;
        }
        const tabId = activeTab.id;

        let currentUrl = activeTab.url || '';
        let tabTitle = activeTab.title;
        let tabFavIconUrl = activeTab.favIconUrl;
        const onNewTab = isNewTabPage(currentUrl);
        const explicitTarget = extractTargetUrlFromGoal(goal);

        // If the user starts from a new tab or requests a target site, auto-navigate
        if (onNewTab || explicitTarget) {
          const destinationUrl = explicitTarget || 'https://www.google.com';

          if (isRestrictedUrl(destinationUrl)) {
            port.postMessage({
              type: 'ERROR',
              error: `Cannot automate internal browser page (${destinationUrl}). ${RESTRICTED_URL_HINT}`,
            });
            return;
          }

          if (
            typeof chrome !== 'undefined' &&
            chrome.tabs &&
            typeof chrome.tabs.update === 'function'
          ) {
            try {
              await chrome.tabs.update(tabId, { url: destinationUrl });
              const loadedTab = await waitForTabLoaded(tabId);
              if (loadedTab) {
                currentUrl = loadedTab.url || destinationUrl;
                tabTitle = loadedTab.title;
                tabFavIconUrl = loadedTab.favIconUrl;
              } else {
                currentUrl = destinationUrl;
              }
            } catch (navErr) {
              console.warn('[Browgent] Auto-navigation error:', navErr);
            }
          }
        }

        if (isRestrictedUrl(currentUrl)) {
          port.postMessage({
            type: 'ERROR',
            error: `Cannot automate internal browser page (${currentUrl || 'new tab'}). ${RESTRICTED_URL_HINT}`,
          });
          return;
        }

        activeAgent = new AgentController({
          llmConfig,
          maxSteps: maxSteps || 25,
          skills: skills || [],
          files: files || [],
          mcpEndpoint,
        });

        port.postMessage({
          type: 'STATUS_UPDATE',
          status: 'running',
          tab: {
            id: tabId,
            title: tabTitle,
            url: currentUrl,
            favIconUrl: tabFavIconUrl,
          },
        });

        try {
          const result = await activeAgent.run(tabId, goal, (event) => {
            if (sidepanelPort) {
              sidepanelPort.postMessage({ type: 'AGENT_EVENT', event });
            }
          });

          port.postMessage({
            type: 'FINISHED',
            success: result.success,
            summary: result.summary,
            error: result.error,
          });
        } catch (err: unknown) {
          const msgStr = err instanceof Error ? err.message : String(err);
          port.postMessage({ type: 'ERROR', error: msgStr });
        } finally {
          activeAgent = null;
        }
      }

      if (msg.type === 'STOP_AGENT') {
        if (activeAgent) {
          activeAgent.stop();
          port.postMessage({ type: 'STATUS_UPDATE', status: 'stopped' });
        }
      }
    });
  }
});
