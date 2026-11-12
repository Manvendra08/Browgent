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

let activeAgents = new Map<number, AgentController>();
let sidepanelPorts = new Map<number, chrome.runtime.Port>();
let allConnectedPorts = new Set<chrome.runtime.Port>();
const activePanelTabs = new Set<number>();

const syncActivePanelTabs = () => {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session && typeof chrome.storage.session.set === 'function') {
    chrome.storage.session.set({ browgent_active_panel_tabs: Array.from(activePanelTabs) }).catch(() => {});
  }
};

// Restore active panel tabs on worker startup
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session && typeof chrome.storage.session.get === 'function') {
  chrome.storage.session.get(['browgent_active_panel_tabs']).then((res) => {
    const saved = res?.browgent_active_panel_tabs;
    if (Array.isArray(saved)) {
      for (const id of saved) {
        if (typeof id === 'number') activePanelTabs.add(id);
      }
    }
  }).catch(() => {});
}

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
  for (const port of Array.from(allConnectedPorts)) {
    try {
      port.postMessage({ type: 'HEARTBEAT', timestamp: Date.now() });
    } catch {
      allConnectedPorts.delete(port);
      for (const [tabId, p] of sidepanelPorts.entries()) {
        if (p === port) sidepanelPorts.delete(tabId);
      }
    }
  }
}, 20000);

// Initialize per-tab scoping: disable global automatic open on action click
if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Browgent] Extension installed.');
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
  }
  if (chrome.contextMenus && typeof chrome.contextMenus.create === 'function') {
    chrome.contextMenus.create({
      id: 'browgent-ask-selection',
      title: 'Ask Browgent about "%s"',
      contexts: ['selection'],
    });
  }
});

// Explicit action click opens/toggles sidebar exclusively for that tab
if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener((tab) => {
    const tabId = tab?.id;
    if (typeof tabId !== 'number') return;

    if (activePanelTabs.has(tabId)) {
      // Toggle closed for this tab
      activePanelTabs.delete(tabId);
      syncActivePanelTabs();
      if (chrome.sidePanel && typeof chrome.sidePanel.setOptions === 'function') {
        chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
      }
      return;
    }

    activePanelTabs.add(tabId);
    syncActivePanelTabs();

    if (chrome.sidePanel) {
      if (typeof chrome.sidePanel.setOptions === 'function') {
        chrome.sidePanel.setOptions({
          tabId,
          path: `src/sidepanel/index.html?tabId=${tabId}`,
          enabled: true,
        }).catch((err) => {
          console.warn('[Browgent] Failed to set sidePanel options for tab:', tabId, err);
        });
      }
      if (typeof chrome.sidePanel.open === 'function') {
        // Called synchronously in user gesture handler tick
        chrome.sidePanel.open({ tabId }).catch((err) => {
          console.warn('[Browgent] Failed to open side panel for tab:', tabId, err);
          if (typeof tab.windowId === 'number') {
            chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
          }
        });
      }
    }
  });
}

// Isolate sidebar on tab switch: hide if not open on new tab, restore if open
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    const tabId = activeInfo?.tabId;
    if (typeof tabId !== 'number' || !chrome.sidePanel || typeof chrome.sidePanel.setOptions !== 'function') return;

    if (activePanelTabs.has(tabId)) {
      chrome.sidePanel.setOptions({
        tabId,
        path: `src/sidepanel/index.html?tabId=${tabId}`,
        enabled: true,
      }).catch(() => {});
    } else {
      chrome.sidePanel.setOptions({
        tabId,
        enabled: false,
      }).catch(() => {});
    }
  });
}

// New tabs default to sidebar closed
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onCreated) {
  chrome.tabs.onCreated.addListener((tab) => {
    const tabId = tab?.id;
    if (typeof tabId !== 'number' || !chrome.sidePanel || typeof chrome.sidePanel.setOptions !== 'function') return;
    chrome.sidePanel.setOptions({
      tabId,
      enabled: false,
    }).catch(() => {});
  });
}

// Maintain per-tab isolation when pages navigate or refresh
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (typeof tabId !== 'number' || !chrome.sidePanel || typeof chrome.sidePanel.setOptions !== 'function') return;
    if (changeInfo.status === 'loading' || changeInfo.url) {
      if (activePanelTabs.has(tabId)) {
        chrome.sidePanel.setOptions({
          tabId,
          path: `src/sidepanel/index.html?tabId=${tabId}`,
          enabled: true,
        }).catch(() => {});
      } else {
        chrome.sidePanel.setOptions({
          tabId,
          enabled: false,
        }).catch(() => {});
      }
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'browgent-ask-selection' && info.selectionText) {
      const tabId = tab?.id;
      if (typeof tabId === 'number') {
        activePanelTabs.add(tabId);
        syncActivePanelTabs();
        if (chrome.sidePanel) {
          try {
            if (typeof chrome.sidePanel.setOptions === 'function') {
              chrome.sidePanel.setOptions({
                tabId,
                path: `src/sidepanel/index.html?tabId=${tabId}`,
                enabled: true,
              }).catch(() => {});
            }
            if (typeof chrome.sidePanel.open === 'function') {
              chrome.sidePanel.open({ tabId }).catch((err) => {
                console.warn('[Browgent] Failed to open side panel for tab:', tabId, err);
                if (tab && typeof tab.windowId === 'number') {
                  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
                }
              });
            }
          } catch (err) {
            console.warn('[Browgent] Failed to open side panel for tab:', tabId, err);
          }
        }
        if (chrome.storage && chrome.storage.session) {
          chrome.storage.session.set({
            [`browgent_pending_prompt_${tabId}`]: {
              text: info.selectionText,
              mode: 'ask',
            },
            browgent_pending_prompt: {
              text: info.selectionText,
              mode: 'ask',
            },
          }).catch(() => {});
        }
      }
    }
  });
}

// Clean up tab resources when tab is closed
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    activePanelTabs.delete(tabId);
    syncActivePanelTabs();
    const agent = activeAgents.get(tabId);
    if (agent) {
      agent.stop();
      activeAgents.delete(tabId);
    }
    sidepanelPorts.delete(tabId);
    if (chrome.sidePanel && typeof chrome.sidePanel.setOptions === 'function') {
      chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
    }
    if (chrome.storage && chrome.storage.session) {
      chrome.storage.session.remove([
        `browgent_tab_thread_${tabId}`,
        `browgent_pending_prompt_${tabId}`,
      ]).catch(() => {});
    }
  });
}

chrome.runtime.onConnect.addListener((port) => {
  const match = port.name.match(/^browgent-sidepanel(?:-(\d+))?$/);
  if (match) {
    allConnectedPorts.add(port);
    let boundTabId: number | null = match[1] ? parseInt(match[1], 10) : (port.sender?.tab?.id ?? null);
    if (typeof boundTabId === 'number' && !Number.isNaN(boundTabId)) {
      sidepanelPorts.set(boundTabId, port);
      activePanelTabs.add(boundTabId);
      syncActivePanelTabs();
    }

    console.log(`[Browgent] Sidepanel connected (tab: ${boundTabId ?? 'unbound'}).`);

    port.onDisconnect.addListener(() => {
      console.log(`[Browgent] Sidepanel disconnected (tab: ${boundTabId ?? 'unbound'}).`);
      allConnectedPorts.delete(port);
      if (typeof boundTabId === 'number') {
        if (sidepanelPorts.get(boundTabId) === port) {
          sidepanelPorts.delete(boundTabId);
        }
        // Only mark tab panel as closed if this tab was the active tab at disconnect time
        // (i.e. user explicitly clicked Chrome's panel close button). If the user switched
        // away to a new or different tab, boundTabId is not active, so keep its state so it
        // automatically restores when switching back.
        if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.query === 'function') {
          chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            if (tabs && tabs[0]?.id === boundTabId) {
              activePanelTabs.delete(boundTabId);
              syncActivePanelTabs();
            }
          }).catch(() => {});
        }
      }
    });

    port.onMessage.addListener(async (msg) => {
      if (msg.type === 'START_AGENT') {
        const {
          tabId: explicitTabId,
          goal,
          llmConfig,
          maxSteps,
          skills,
          files,
          mcpEndpoint,
          showOverlay,
          conversation,
          mode,
        } = msg.payload as {
          tabId?: number;
          goal: string;
          llmConfig: LLMConfig;
          maxSteps?: number;
          skills?: Skill[];
          files?: AttachedFile[];
          mcpEndpoint?: string;
          showOverlay?: boolean;
          conversation?: { prompt: string; result: string }[];
          mode?: 'ask' | 'agent';
        };

        let targetTabId = explicitTabId ?? boundTabId;
        let activeTab: chrome.tabs.Tab | undefined;

        if (typeof targetTabId === 'number' && typeof chrome !== 'undefined' && chrome.tabs?.get) {
          try {
            const fetched = await chrome.tabs.get(targetTabId);
            if (fetched && typeof fetched.id === 'number') {
              activeTab = fetched;
            }
          } catch {
            // Tab might be in background or transient
          }
        }

        if (!activeTab || typeof activeTab.id !== 'number') {
          // Find the active tab: prefer the last focused window (the one the
          // side panel is attached to), fall back to the current window.
          let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (!tabs || tabs.length === 0) {
            tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          }
          activeTab = tabs[0];
        }

        if (!activeTab || typeof activeTab.id !== 'number') {
          port.postMessage({ type: 'ERROR', error: 'No active tab found to operate on.' });
          return;
        }

        const tabId = activeTab.id;
        boundTabId = tabId;
        sidepanelPorts.set(tabId, port);

        let currentUrl = activeTab.url || '';
        let tabTitle = activeTab.title;
        let tabFavIconUrl = activeTab.favIconUrl;
        const onNewTab = isNewTabPage(currentUrl);
        const explicitTarget = extractTargetUrlFromGoal(goal);

        // If the user starts from a new tab or requests a target site, auto-navigate (Agent mode only)
        if (mode !== 'ask' && (onNewTab || explicitTarget)) {
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
            error: `Cannot ${mode === 'ask' ? 'inspect' : 'automate'} internal browser page (${currentUrl || 'new tab'}). ${RESTRICTED_URL_HINT}`,
          });
          return;
        }

        const agent = new AgentController({
          llmConfig,
          maxSteps: maxSteps || 25,
          skills: skills || [],
          files: files || [],
          mcpEndpoint,
          showOverlay: showOverlay ?? false,
          conversation: conversation || [],
        });
        activeAgents.set(tabId, agent);

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
          const onProgressCb = (event: {
            type:
              | 'step'
              | 'thought'
              | 'action'
              | 'action_result'
              | 'step_telemetry'
              | 'done'
              | 'error'
              | 'approval_requested';
            data?: unknown;
          }) => {
            port.postMessage({ type: 'AGENT_EVENT', event });
          };

          const result =
            mode === 'ask'
              ? await agent.answer(tabId, goal, onProgressCb)
              : await agent.run(tabId, goal, onProgressCb);

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
          activeAgents.delete(tabId);
        }
      }

      if (msg.type === 'APPROVE_ACTION') {
        const targetTabId = (msg.payload as { tabId?: number } | undefined)?.tabId ?? boundTabId;
        const agent =
          typeof targetTabId === 'number'
            ? activeAgents.get(targetTabId)
            : activeAgents.values().next().value;
        if (agent) {
          agent.resolveApproval(true);
        }
      }

      if (msg.type === 'REJECT_ACTION') {
        const targetTabId = (msg.payload as { tabId?: number } | undefined)?.tabId ?? boundTabId;
        const agent =
          typeof targetTabId === 'number'
            ? activeAgents.get(targetTabId)
            : activeAgents.values().next().value;
        if (agent) {
          agent.resolveApproval(false);
        }
      }

      if (msg.type === 'STOP_AGENT') {
        const targetTabId = (msg.payload as { tabId?: number } | undefined)?.tabId ?? boundTabId;
        if (typeof targetTabId === 'number') {
          const agent = activeAgents.get(targetTabId);
          if (agent) {
            agent.stop();
            activeAgents.delete(targetTabId);
            port.postMessage({ type: 'STATUS_UPDATE', status: 'stopped' });
          }
        } else {
          // If no specific tab identified, stop any active agent
          let stoppedAny = false;
          for (const [id, agent] of Array.from(activeAgents.entries())) {
            agent.stop();
            activeAgents.delete(id);
            stoppedAny = true;
          }
          if (stoppedAny) {
            port.postMessage({ type: 'STATUS_UPDATE', status: 'stopped' });
          }
        }
      }
    });
  }
});
