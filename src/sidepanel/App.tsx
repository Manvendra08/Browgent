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
import {
  DEFAULT_LLM_CONFIG,
  seedProviderConfigs,
  stashProviderConfig,
  type ProviderConfigMap,
} from './providerConfigs';

const DEFAULT_CONFIG: LLMConfig = DEFAULT_LLM_CONFIG;

export const DEFAULT_PROMPTS: string[] = [
  'Summarize the key points of this page in 5 bullets',
  'Extract all products with names and prices into a markdown table',
  'Fill out the form on this page with sensible test data, then review before submitting',
  'Check this page for broken links and layout issues',
];

const PROVIDER_LABELS: Record<string, string> = {
  omniroute: 'OmniRoute',
  openai: 'OpenAI',
  'openai-compat': 'OpenAI Compatible',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
};

export const App: React.FC = () => {
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

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        url: t.url,
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
      const port = chrome.runtime.connect({ name: 'browgent-sidepanel' });
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
  }, []);

  useEffect(() => {
    const port = getOrCreatePort();
    return () => {
      if (port && typeof port.disconnect === 'function') {
        port.disconnect();
      }
    };
  }, [getOrCreatePort]);

  // Load saved configuration, skills, mode, and threads on mount
  useEffect(() => {
    loadStoredSkills().then(setSkills);

    loadThreads().then((loaded) => {
      if (loaded && loaded.length > 0) {
        setThreads(loaded);
        setActiveThreadId(loaded[0].id);
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

  const handleRun = () => {
    if (!goal.trim()) return;

    const trimmedGoal = goal.trim();
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
      mode,
      prompt: trimmedGoal,
      tab: activeTab ? { title: activeTab.title, url: activeTab.url } : undefined,
      steps: [],
      status: 'running',
      createdAt: Date.now(),
    };

    activeTurnIdRef.current = newTurnId;
    setStatus('running');
    setGoal('');

    if (currentThread) {
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
      setActiveThreadId(newThreadId);
      setThreads((prev) => [newThread, ...prev]);
    }

    port.postMessage({
      type: 'START_AGENT',
      payload: {
        goal: trimmedGoal,
        mode,
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
      port.postMessage({ type: 'STOP_AGENT' });
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
    setActiveThreadId(null);
    activeTurnIdRef.current = null;
    setStatus('idle');
    setGoal('');
  };

  const currentThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 antialiased font-sans overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs tracking-tight text-slate-200">Browgent</span>
              <span className="text-[9px] font-semibold uppercase px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                v0.4.0
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {PROVIDER_LABELS[config.provider] || config.provider}: {config.model || 'default'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleNewChat}
            title="New chat"
            aria-label="New chat"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            title="Chat history"
            aria-label="Chat history"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleToggleTheme}
            title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
            aria-label={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
            aria-pressed={theme === 'light'}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
            aria-label="Open settings"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
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
        suggestions={DEFAULT_PROMPTS}
        onSuggestionClick={(prompt) => {
          setGoal(prompt);
        }}
      />

      {/* File Attachment & Context Controls */}
      <div className="px-3 py-1.5 bg-slate-950/40 border-t border-slate-800/60">
        <FileAttachment
          files={files}
          onAddFiles={(newFiles) => setFiles((prev) => [...prev, ...newFiles])}
          onRemoveFile={(idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))}
          onError={(err) => console.warn('[Browgent File Attachment]', err)}
          disabled={status === 'running'}
        />
      </div>

      {/* Active Tab Bar (directly above the prompt box) */}
      <ActiveTabBar
        tab={status === 'running' && agentTab ? agentTab : activeTab}
        isAgentTarget={status === 'running' && agentTab !== null}
      />

      {/* Goal Input Footer */}
      <GoalInput
        goal={goal}
        setGoal={setGoal}
        mode={mode}
        setMode={handleSetMode}
        isRunning={status === 'running'}
        onRun={handleRun}
        onStop={handleStop}
      />

      {/* History Modal */}
      <ThreadList
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={(id) => {
          setActiveThreadId(id);
          setStatus('idle');
        }}
        onDeleteThread={(id) => {
          setThreads((prev) => {
            const next = prev.filter((t) => t.id !== id);
            if (activeThreadId === id) {
              setActiveThreadId(next[0]?.id || null);
            }
            return next;
          });
        }}
        onClearAll={() => {
          setThreads([]);
          setActiveThreadId(null);
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
