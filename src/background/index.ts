import { AgentController } from './agent';
import { LLMConfig } from './llm/types';
import { Skill } from './skills/types';
import { AttachedFile } from './files/parser';

console.log('[Browgent] Background Service Worker active.');

let activeAgent: AgentController | null = null;
let sidepanelPort: chrome.runtime.Port | null = null;

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

        // Find active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
          port.postMessage({ type: 'ERROR', error: 'No active tab found to operate on.' });
          return;
        }

        activeAgent = new AgentController({
          llmConfig,
          maxSteps: maxSteps || 15,
          skills: skills || [],
          files: files || [],
          mcpEndpoint,
        });

        port.postMessage({ type: 'STATUS_UPDATE', status: 'running' });

        try {
          const result = await activeAgent.run(activeTab.id, goal, (event) => {
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
