import React, { useState, useEffect, useRef } from 'react';
import { Settings, Bot, Sun, Moon, Plus, Clock } from 'lucide-react';
import { LLMConfig } from '../background/llm/types';
import { Skill } from '../background/skills/types';
import { BUILTIN_SKILLS, loadStoredSkills, saveStoredSkills } from '../background/skills/manager';
import { AttachedFile } from '../background/files/parser';
import { GoalInput } from './components/GoalInput';
import { ChatThread } from './components/ChatThread';
import { ThreadList } from './components/ThreadList';
import { SkillSelector } from './components/SkillSelector';
import { FileAttachment } from './components/FileAttachment';
import { ActiveTabBar, type ActiveTabInfo } from './components/ActiveTabBar';
import { SettingsModal } from './components/SettingsModal';
import {
  Thread,
  Turn,
  TurnMode,
  loadThreads,
  saveThreads,
  applyAgentEvent,
  toConversation,
} from './threads';
import { scrubUrl } from '../content/extractor';
import {
  DEFAULT_LLM_CONFIG,
  seedProviderConfigs,
  stashProviderConfig,
  type ProviderConfigMap,
} from './providerConfigs';
import {
  getContextualStarters,
  generateSmartStartersWithLLM,
  BLANK_PAGE_STARTERS,
  ContextualStarter,
  isBlankOrInternalPage,
} from './starters';

const DEFAULT_CONFIG: LLMConfig = DEFAULT_LLM_CONFIG;

export const DEFAULT_PROMPTS: string[] = BLANK_PAGE_STARTERS.map((s) => s.prompt);

const PROVIDER_LABELS: Record<string, string> = {
  omniroute: 'OmniRoute',
  openai: 'OpenAI',
  'openai-compat': 'OpenAI Compatible',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
};

const getInitialTabId = (): number | null => {
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    const param = new URLSearchParams(window.location.search).get('tabId');
    if (param) {
      const parsed = parseInt(param, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
};

export const App: React.FC = () => {
  const [boundTabId, setBoundTabId] = useState<number | null>(getInitialTabId);
  const [goal, setGoal] = useState<string>('');
  const [mode, setMode] = useState<TurnMode>('agent');
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed' | 'stopped'>(
    'idle',
  );

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const activeTurnIdRef = useRef<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  const [skills, setSkills] = useState<Skill[]>(BUILTIN_SKILLS);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [config, setConfig] = useState<LLMConfig>(DEFAULT_CONFIG);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfigMap>({});
  const [maxSteps, setMaxSteps] = useState<number>(25);
  const [mcpEndpoint, setMcpEndpoint] = useState<string>('');
  const [showOverlay, setShowOverlay] = useState<boolean>(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Live active tab (for display) + the tab the agent is operating on (while running)
  const [activeTab, setActiveTab] = useState<ActiveTabInfo | null>(null);
  const [agentTab, setAgentTab] = useState<ActiveTabInfo | null>(null);
  const [customStarters, setCustomStarters] = useState<Record<string, ContextualStarter[]>>({});
  const [isGeneratingStarters, setIsGeneratingStarters] = useState<boolean>(false);

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounced save for threads
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveThreads(threads);
    }, 300);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [threads]);

  // Load theme preference
  useEffect(() => {
    const load = (stored: unknown) => {
      if (stored === 'light' || stored === 'dark') setTheme(stored);
    };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['browgent_theme'], (res) => load(res.browgent_theme));
    } else if (typeof localStorage !== 'undefined') {
      load(localStorage.getItem('browgent_theme'));
    }
  }, []);

  // Apply theme class to the document root
  useEffect(() => {
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    if (root) root.classList.toggle('theme-light', theme === 'light');
  }, [theme]);

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ browgent_theme: next });
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('browgent_theme', next);
    }
  };

  // Ensure boundTabId is resolved for this panel instance
  useEffect(() => {
    if (boundTabId !== null) return;
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs && tabs[0]?.id) {
          setBoundTabId(tabs[0].id);
        }
      }).catch(() => {});
    }
  }, [boundTabId]);

  const updateTabActiveThread = React.useCallback(
    (threadId: string | null, explicitTabId?: number | null) => {
      setActiveThreadId(threadId);
      const targetTab = explicitTabId ?? boundTabId;
      if (targetTab !== null && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
        if (threadId) {
          chrome.storage.session.set({ [`browgent_tab_thread_${targetTab}`]: threadId }).catch(() => {});
        } else {
          chrome.storage.session.remove([`browgent_tab_thread_${targetTab}`]).catch(() => {});
        }
      }
    },
    [boundTabId],
  );

  // Track the currently active tab (live) for the tab bar above the prompt box
  const refreshActiveTab = React.useCallback(async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) return;
    try {
      let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      }
      const t = tabs[0];
      if (!t) return;
      setActiveTab({
        id: t.id,
        title: t.title,
        url: scrubUrl(t.url),
        favIconUrl: t.favIconUrl,
      });
    } catch {
      // Ignore transient query failures
    }
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) return;

    refreshActiveTab();

    const onActivated = () => {
      refreshActiveTab();
    };
    const onUpdated = (
      _tabId: number,
      _changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (tab.active) refreshActiveTab();
    };
    const onRemoved = () => {
      refreshActiveTab();
    };
    const onFocused = (windowId: number) => {
      if (windowId !== chrome.windows.WINDOW_ID_NONE) refreshActiveTab();
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    if (chrome.windows && chrome.windows.onFocusChanged) {
      chrome.windows.onFocusChanged.addListener(onFocused);
    }

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (chrome.windows && chrome.windows.onFocusChanged) {
        chrome.windows.onFocusChanged.removeListener(onFocused);
      }
    };
  }, [refreshActiveTab]);

  // Connect port to background service worker with auto-reconnection
  const getOrCreatePort = React.useCallback((): chrome.runtime.Port | null => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) {
      return null;
    }
    if (portRef.current) {
      return portRef.current;
    }

    try {
      const portName = boundTabId !== null ? `browgent-sidepanel-${boundTabId}` : 'browgent-sidepanel';
      const port = chrome.runtime.connect({ name: portName });
      portRef.current = port;

      port.onMessage.addListener((msg) => {
        if (msg.type === 'STATUS_UPDATE') {
          setStatus(msg.status);
          if (msg.status === 'running' && msg.tab) {
            setAgentTab({
              id: msg.tab.id,
              title: msg.tab.title,
              url: msg.tab.url,
              favIconUrl: msg.tab.favIconUrl,
            });
          } else {
            setAgentTab(null);
          }
        }

        if (msg.type === 'AGENT_EVENT') {
          const event = msg.event;
          const currentTurnId = activeTurnIdRef.current;
          if (currentTurnId) {
            setThreads((prevThreads) =>
              prevThreads.map((thread) => {
                const turnIdx = thread.turns.findIndex((turn) => turn.id === currentTurnId);
                if (turnIdx === -1) return thread;

                const updatedTurn = applyAgentEvent(thread.turns[turnIdx], event);
                const updatedTurns = [...thread.turns];
                updatedTurns[turnIdx] = updatedTurn;

                return {
                  ...thread,
                  updatedAt: Date.now(),
                  turns: updatedTurns,
                };
              }),
            );
          }

          if (event.type === 'done') {
            setStatus('completed');
          } else if (event.type === 'error') {
            setStatus('failed');
          }
        }

        if (msg.type === 'FINISHED') {
          setAgentTab(null);
          setStatus(msg.success ? 'completed' : 'failed');
          const currentTurnId = activeTurnIdRef.current;
          if (currentTurnId) {
            setThreads((prev) =>
              prev.map((thread) => {
                const turnIdx = thread.turns.findIndex((t) => t.id === currentTurnId);
                if (turnIdx === -1) return thread;
                const turn = thread.turns[turnIdx];
                const updatedTurns = [...thread.turns];
                updatedTurns[turnIdx] = {
                  ...turn,
                  status: msg.success ? 'completed' : 'failed',
                  result: msg.summary ?? turn.result,
                  error: msg.error ?? turn.error,
                };
                return {
                  ...thread,
                  updatedAt: Date.now(),
                  turns: updatedTurns,
                };
              }),
            );
            activeTurnIdRef.current = null;
          }
        }

        if (msg.type === 'ERROR') {
          setStatus('failed');
          setAgentTab(null);
          const currentTurnId = activeTurnIdRef.current;
          if (currentTurnId) {
            setThreads((prev) =>
              prev.map((thread) => {
                const turnIdx = thread.turns.findIndex((t) => t.id === currentTurnId);
                if (turnIdx === -1) return thread;
                const turn = thread.turns[turnIdx];
                const updatedTurns = [...thread.turns];
                updatedTurns[turnIdx] = {
                  ...turn,
                  status: 'failed',
                  error: msg.error ?? 'Execution error',
                };
                return {
                  ...thread,
                  updatedAt: Date.now(),
                  turns: updatedTurns,
                };
              }),
            );
            activeTurnIdRef.current = null;
          }
        }
      });

      port.onDisconnect.addListener(() => {
        console.log('[Sidepanel] Port disconnected.');
        portRef.current = null;
      });

      return port;
    } catch (err: unknown) {
      console.warn('[Sidepanel] Failed to connect port:', err);
      return null;
    }
  }, [boundTabId]);

  useEffect(() => {
    const port = getOrCreatePort();
    return () => {
      if (port && typeof port.disconnect === 'function') {
        port.disconnect();
      }
    };
  }, [getOrCreatePort]);

  // Check and consume any pending prompt from context menu (session storage)
  const checkPendingPrompt = React.useCallback(async () => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) {
      return;
    }
    try {
      const tabKey = boundTabId !== null ? `browgent_pending_prompt_${boundTabId}` : null;
      const keysToQuery = tabKey ? [tabKey, 'browgent_pending_prompt'] : ['browgent_pending_prompt'];
      const res = await chrome.storage.session.get(keysToQuery);
      const pending = (tabKey && res?.[tabKey] ? res[tabKey] : res?.browgent_pending_prompt) as
        | { text: string; mode?: TurnMode }
        | undefined;
      if (pending && pending.text) {
        if (tabKey) {
          await chrome.storage.session.remove([tabKey, 'browgent_pending_prompt']);
        } else {
          await chrome.storage.session.remove(['browgent_pending_prompt']);
        }
        updateTabActiveThread(null);
        activeTurnIdRef.current = null;
        setStatus('idle');
        setMode(pending.mode || 'ask');
        setGoal(`Explain: "${pending.text}"`);
      }
    } catch {
      // Session storage not available or error
    }
  }, [boundTabId, updateTabActiveThread]);

  useEffect(() => {
    checkPendingPrompt();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const listener = (
        changes: { [key: string]: chrome.storage.StorageChange },
        areaName: string,
      ) => {
        const tabKey = boundTabId !== null ? `browgent_pending_prompt_${boundTabId}` : null;
        if (
          areaName === 'session' &&
          (changes['browgent_pending_prompt']?.newValue || (tabKey && changes[tabKey]?.newValue))
        ) {
          checkPendingPrompt();
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => {
        chrome.storage.onChanged.removeListener(listener);
      };
    }
  }, [checkPendingPrompt, boundTabId]);

  // Restore active thread for this tab once boundTabId is resolved
  useEffect(() => {
    if (boundTabId === null) return;
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) return;

    chrome.storage.session
      .get([`browgent_tab_thread_${boundTabId}`])
      .then((res) => {
        const candidate = res?.[`browgent_tab_thread_${boundTabId}`];
        if (typeof candidate === 'string') {
          setActiveThreadId((prev) => (prev !== null ? prev : candidate));
        }
      })
      .catch(() => {});
  }, [boundTabId]);

  // Load saved configuration, skills, mode, and threads on mount
  useEffect(() => {
    loadStoredSkills().then(setSkills);

    loadThreads().then((loaded) => {
      if (loaded && loaded.length > 0) {
        setThreads(loaded);
      }
    });

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(
        [
          'browgent_config',
          'browgent_max_steps',
          'browgent_mcp_endpoint',
          'browgent_provider_configs',
          'browgent_show_overlay',
          'browgent_mode',
        ],
        (res) => {
          const activeConfig: LLMConfig = res.browgent_config || DEFAULT_CONFIG;
          if (res.browgent_config) setConfig(res.browgent_config);
          if (res.browgent_max_steps) setMaxSteps(res.browgent_max_steps);
          if (res.browgent_mcp_endpoint) setMcpEndpoint(res.browgent_mcp_endpoint);
          if (typeof res.browgent_show_overlay === 'boolean') {
            setShowOverlay(res.browgent_show_overlay);
          }
          if (res.browgent_mode === 'ask' || res.browgent_mode === 'agent') {
            setMode(res.browgent_mode);
          }

          const storedMap = (res.browgent_provider_configs || {}) as ProviderConfigMap;
          setProviderConfigs(seedProviderConfigs(storedMap, activeConfig));
        },
      );
    }
  }, []);

  const handleSetMode = (nextMode: TurnMode) => {
    setMode(nextMode);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ browgent_mode: nextMode });
    }
  };

  const persistProviderConfigs = (map: ProviderConfigMap) => {
    setProviderConfigs(map);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ browgent_provider_configs: map });
    }
  };

  const handleToggleSkill = (skillId: string) => {
    const updated = skills.map((s) => (s.id === skillId ? { ...s, isActive: !s.isActive } : s));
    setSkills(updated);
    saveStoredSkills(updated);
  };

  const handleAddCustomSkill = (skill: Skill) => {
    const updated = [...skills, skill];
    setSkills(updated);
    saveStoredSkills(updated);
  };

  const handleSaveConfig = (newConfig: LLMConfig, nextProviderConfigs?: ProviderConfigMap) => {
    setConfig(newConfig);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ browgent_config: newConfig });
    }
    const map = nextProviderConfigs ?? stashProviderConfig(providerConfigs, newConfig);
    persistProviderConfigs(map);
  };

  const handleSaveMaxSteps = (newMax: number) => {
    setMaxSteps(newMax);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ browgent_max_steps: newMax });
    }
  };

  const handleSaveMcpEndpoint = (endpoint: string) => {
    setMcpEndpoint(endpoint);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ browgent_mcp_endpoint: endpoint });
    }
  };

  const handleSaveShowOverlay = (show: boolean) => {
    setShowOverlay(show);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ browgent_show_overlay: show });
    }
  };

  const handleAttachFiles = () => {
    fileInputRef.current?.click();
  };

  const handleCaptureScreenshot = async () => {
    if (status === 'running') return;
    try {
      const targetTab = status === 'running' && agentTab ? agentTab : activeTab;
      const targetTabId = boundTabId ?? targetTab?.id;
      let windowId: number | undefined = targetTab?.windowId;

      if (typeof windowId !== 'number' && typeof targetTabId === 'number' && typeof chrome !== 'undefined' && chrome.tabs?.get) {
        try {
          const tab = await chrome.tabs.get(targetTabId);
          windowId = tab?.windowId;
        } catch {
          // ignore
        }
      }

      let dataUrl: string | null = null;
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.captureVisibleTab) {
        dataUrl = await new Promise<string | null>((resolve) => {
          try {
            const callback = (res?: string) => {
              if (chrome.runtime?.lastError || !res) {
                resolve(null);
              } else {
                resolve(res);
              }
            };
            if (typeof windowId === 'number') {
              chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 75 }, callback);
            } else {
              chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 75 }, callback);
            }
          } catch {
            resolve(null);
          }
        });
      }

      if (dataUrl) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/:/g, '');
        const pageTitle = (targetTab?.title || 'page').slice(0, 15).replace(/[^a-zA-Z0-9_-]/g, '_');
        const screenshotFile: AttachedFile = {
          name: `Screenshot-${pageTitle}-${timeStr}.jpg`,
          type: 'image/jpeg',
          size: Math.round(dataUrl.length * 0.75),
          content: dataUrl,
          isImage: true,
        };
        setFiles((prev) => [...prev, screenshotFile]);
      } else {
        console.warn('[Browgent] Could not capture screenshot of active page');
      }
    } catch (err) {
      console.warn('[Browgent] Failed to capture page screenshot:', err);
    }
  };

  const handleGenerateSmartStarters = async () => {
    if (isGeneratingStarters || status === 'running') return;
    const currentTab = status === 'running' && agentTab ? agentTab : activeTab;
    const targetUrl = currentTab?.url;
    if (!targetUrl || isBlankOrInternalPage(targetUrl)) return;

    setIsGeneratingStarters(true);
    try {
      let pageText = '';
      const targetTabId = boundTabId ?? currentTab?.id;

      if (typeof targetTabId === 'number' && typeof chrome !== 'undefined') {
        if (chrome.scripting?.executeScript) {
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: targetTabId },
              func: () => document.body ? document.body.innerText.slice(0, 3000) : '',
            });
            if (results && results[0]?.result) {
              pageText = String(results[0].result);
            }
          } catch {
            // Scripting fallback
          }
        }
        if (!pageText && chrome.tabs?.sendMessage) {
          try {
            const res = await chrome.tabs.sendMessage(targetTabId, { type: 'GET_DOM_STATE' });
            if (res?.success && res.data?.rawText) {
              pageText = String(res.data.rawText).slice(0, 3000);
            }
          } catch {
            // Ignore
          }
        }
      }

      const generated = await generateSmartStartersWithLLM(
        config,
        targetUrl,
        currentTab?.title || '',
        pageText || currentTab?.title || '',
      );

      if (generated && generated.length > 0) {
        setCustomStarters((prev) => ({
          ...prev,
          [targetUrl]: generated,
        }));
      }
    } catch (err) {
      console.warn('[Browgent] Could not generate AI starters:', err);
    } finally {
      setIsGeneratingStarters(false);
    }
  };

  const handleRun = (overrideGoal?: unknown, overrideMode?: TurnMode) => {
    const rawGoal = typeof overrideGoal === 'string' ? overrideGoal : goal;
    const runMode = overrideMode !== undefined ? overrideMode : mode;
    if (!rawGoal.trim()) return;

    const trimmedGoal = rawGoal.trim();
    const port = getOrCreatePort();
    if (!port) {
      setStatus('failed');
      return;
    }

    const currentThread = threads.find((t) => t.id === activeThreadId);
    const conversation = toConversation(currentThread);

    const newTurnId = `turn-${Date.now()}`;
    const newTurn: Turn = {
      id: newTurnId,
      mode: runMode,
      prompt: trimmedGoal,
      tab: activeTab ? { title: activeTab.title, url: scrubUrl(activeTab.url) } : undefined,
      steps: [],
      status: 'running',
      createdAt: Date.now(),
    };

    activeTurnIdRef.current = newTurnId;
    setStatus('running');
    if (typeof overrideGoal !== 'string') {
      setGoal('');
    }

    const targetTabId = boundTabId ?? activeTab?.id;
    if (currentThread) {
      updateTabActiveThread(currentThread.id, targetTabId);
      setThreads((prev) =>
        prev.map((t) =>
          t.id === currentThread.id
            ? {
                ...t,
                updatedAt: Date.now(),
                turns: [...t.turns, newTurn],
              }
            : t,
        ),
      );
    } else {
      const newThreadId = `thread-${Date.now()}`;
      const newThread: Thread = {
        id: newThreadId,
        title: trimmedGoal.slice(0, 60),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        turns: [newTurn],
      };
      updateTabActiveThread(newThreadId, targetTabId);
      setThreads((prev) => [newThread, ...prev]);
    }

    port.postMessage({
      type: 'START_AGENT',
      payload: {
        tabId: targetTabId,
        goal: trimmedGoal,
        mode: runMode,
        conversation,
        llmConfig: config,
        maxSteps,
        skills,
        files,
        mcpEndpoint,
        showOverlay,
      },
    });
  };

  const handleStop = () => {
    const port = getOrCreatePort();
    if (port) {
      port.postMessage({
        type: 'STOP_AGENT',
        payload: {
          tabId: boundTabId ?? activeTab?.id,
        },
      });
    }
    setStatus('stopped');
    const currentTurnId = activeTurnIdRef.current;
    if (currentTurnId) {
      setThreads((prev) =>
        prev.map((thread) => {
          const turnIdx = thread.turns.findIndex((t) => t.id === currentTurnId);
          if (turnIdx === -1) return thread;
          const turn = thread.turns[turnIdx];
          const updatedTurns = [...thread.turns];
          updatedTurns[turnIdx] = {
            ...turn,
            status: 'stopped',
          };
          return {
            ...thread,
            updatedAt: Date.now(),
            turns: updatedTurns,
          };
        }),
      );
      activeTurnIdRef.current = null;
    }
  };

  const handleNewChat = () => {
    updateTabActiveThread(null);
    activeTurnIdRef.current = null;
    setStatus('idle');
    setGoal('');
  };

  const currentThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 antialiased font-sans overflow-hidden">
      {/* Google Multi-Color Brand Header Accent with Dynamic Laser Scan */}
      <div
        className={`w-full transition-all duration-300 ${
          status === 'running'
            ? 'h-[3.5px] google-laser-active'
            : 'h-[2.5px] bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]'
        }`}
      />

      {/* Top Header */}
      <header className="flex items-center justify-between px-3.5 py-2 min-h-[40px] bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-[#4285F4] via-[#EA4335] to-[#FBBC05] flex items-center justify-center shadow-md">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs tracking-tight text-slate-200">Browgent</span>
            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
              v0.5.0
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                status === 'running'
                  ? 'bg-[#4285F4] animate-pulse'
                  : status === 'failed'
                  ? 'bg-[#EA4335]'
                  : 'bg-[#34A853]'
              }`}
              title={`Status: ${status}`}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleNewChat}
            title="New chat"
            aria-label="New chat"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            title="Chat history"
            aria-label="Chat history"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleToggleTheme}
            title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
            aria-label={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
            aria-pressed={theme === 'light'}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
            aria-label="Open settings"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Skills Bar */}
      <SkillSelector skills={skills} onToggleSkill={handleToggleSkill} />

      {/* Main Chat Thread */}
      <ChatThread
        turns={currentThread?.turns || []}
        isRunning={status === 'running'}
        suggestions={
          (activeTab?.url && customStarters[activeTab.url]) ||
          getContextualStarters(activeTab?.url, activeTab?.title)
        }
        isGeneratingSuggestions={isGeneratingStarters}
        onRefreshSuggestions={
          activeTab?.url && !isBlankOrInternalPage(activeTab.url)
            ? handleGenerateSmartStarters
            : undefined
        }
        onSuggestionClick={(prompt) => {
          setGoal(prompt);
        }}
        onEditPrompt={(prompt) => {
          setGoal(prompt);
        }}
        onRetryPrompt={(prompt, turnMode) => {
          handleRun(prompt, turnMode);
        }}
      />

      {/* Goal Input Dock */}
      <GoalInput
        goal={goal}
        setGoal={setGoal}
        mode={mode}
        setMode={handleSetMode}
        isRunning={status === 'running'}
        onRun={handleRun}
        onStop={handleStop}
        modelName={config.model || PROVIDER_LABELS[config.provider] || config.provider}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onAttachFile={handleAttachFiles}
        onCaptureScreenshot={handleCaptureScreenshot}
        tabComponent={
          <ActiveTabBar
            tab={status === 'running' && agentTab ? agentTab : activeTab}
            isAgentTarget={status === 'running' && agentTab !== null}
          />
        }
        filesComponent={
          <FileAttachment
            files={files}
            onAddFiles={(newFiles) => setFiles((prev) => [...prev, ...newFiles])}
            onRemoveFile={(idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))}
            onError={(err) => console.warn('[Browgent File Attachment]', err)}
            disabled={status === 'running'}
            fileInputRef={fileInputRef}
          />
        }
      />

      {/* History Modal */}
      <ThreadList
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={(id) => {
          updateTabActiveThread(id);
          setStatus('idle');
        }}
        onDeleteThread={(id) => {
          setThreads((prev) => {
            const next = prev.filter((t) => t.id !== id);
            if (activeThreadId === id) {
              updateTabActiveThread(next[0]?.id || null);
            }
            return next;
          });
        }}
        onClearAll={() => {
          setThreads([]);
          updateTabActiveThread(null);
          activeTurnIdRef.current = null;
          setStatus('idle');
          saveThreads([]);
          setIsHistoryOpen(false);
        }}
        onNewThread={handleNewChat}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={handleSaveConfig}
        providerConfigs={providerConfigs}
        maxSteps={maxSteps}
        onSaveMaxSteps={handleSaveMaxSteps}
        mcpEndpoint={mcpEndpoint}
        onSaveMcpEndpoint={handleSaveMcpEndpoint}
        onAddCustomSkill={handleAddCustomSkill}
        showOverlay={showOverlay}
        onSaveShowOverlay={handleSaveShowOverlay}
      />
    </div>
  );
};
