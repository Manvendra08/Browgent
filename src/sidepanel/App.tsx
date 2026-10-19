import React, { useState, useEffect, useRef } from 'react';
import { Settings, Bot, Trash2, Sun, Moon } from 'lucide-react';
import { LLMConfig } from '../background/llm/types';
import { Skill } from '../background/skills/types';
import { BUILTIN_SKILLS, loadStoredSkills, saveStoredSkills } from '../background/skills/manager';
import { AttachedFile } from '../background/files/parser';
import { GoalInput } from './components/GoalInput';
import { StepFeed, FeedItem } from './components/StepFeed';
import { SkillSelector } from './components/SkillSelector';
import { FileAttachment } from './components/FileAttachment';
import { ActiveTabBar, type ActiveTabInfo } from './components/ActiveTabBar';
import { SettingsModal } from './components/SettingsModal';

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'omniroute',
  baseUrl: 'http://localhost:20128/v1/chat/completions',
  model: 'anti',
};

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
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed' | 'stopped'>('idle');
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [finalSummary, setFinalSummary] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [skills, setSkills] = useState<Skill[]>(BUILTIN_SKILLS);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [config, setConfig] = useState<LLMConfig>(DEFAULT_CONFIG);
  const [maxSteps, setMaxSteps] = useState<number>(15);
  const [mcpEndpoint, setMcpEndpoint] = useState<string>('');

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Live active tab (for display) + the tab the agent is operating on (while running)
  const [activeTab, setActiveTab] = useState<ActiveTabInfo | null>(null);
  const [agentTab, setAgentTab] = useState<ActiveTabInfo | null>(null);

  const portRef = useRef<chrome.runtime.Port | null>(null);

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
      // Ignore transient query failures (e.g. window closing)
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

  // Connect port to background service worker
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) {
      return;
    }

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
        if (event.type === 'step') {
          // create new feed item if not present
          const stepNum = event.data.step;
          setFeedItems((prev) => [
            ...prev,
            {
              id: `step-${stepNum}-${Date.now()}`,
              step: stepNum,
              status: 'running',
              timestamp: Date.now(),
            },
          ]);
        } else if (event.type === 'thought') {
          setFeedItems((prev) => {
            const last = prev[prev.length - 1];
            if (!last) return prev;
            return [...prev.slice(0, -1), { ...last, thought: event.data.thought }];
          });
        } else if (event.type === 'action') {
          setFeedItems((prev) => {
            const last = prev[prev.length - 1];
            if (!last) return prev;
            return [...prev.slice(0, -1), { ...last, action: event.data.action, status: 'success' }];
          });
        } else if (event.type === 'action_result') {
          setFeedItems((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.step !== event.data.step) return prev;
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                status: event.data.success ? 'success' : 'error',
                error: event.data.error,
              },
            ];
          });
        } else if (event.type === 'done') {
          setStatus('completed');
          setFinalSummary(event.data.summary);
        } else if (event.type === 'error') {
          setStatus('failed');
          setErrorMessage(event.data.error);
        }
      }

      if (msg.type === 'FINISHED') {
        setAgentTab(null);
        if (msg.success) {
          setStatus('completed');
          if (msg.summary) setFinalSummary(msg.summary);
        } else {
          setStatus('failed');
          if (msg.error) setErrorMessage(msg.error);
        }
      }

      if (msg.type === 'ERROR') {
        setStatus('failed');
        setAgentTab(null);
        setErrorMessage(msg.error);
      }
    });

    port.onDisconnect.addListener(() => {
      console.log('[Sidepanel] Port disconnected.');
      portRef.current = null;
    });

    return () => {
      if (port && typeof port.disconnect === 'function') {
        port.disconnect();
      }
    };
  }, []);

  // Load saved configuration and skills on mount
  useEffect(() => {
    loadStoredSkills().then(setSkills);

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['browgent_config', 'browgent_max_steps', 'browgent_mcp_endpoint'], (res) => {
        if (res.browgent_config) setConfig(res.browgent_config);
        if (res.browgent_max_steps) setMaxSteps(res.browgent_max_steps);
        if (res.browgent_mcp_endpoint) setMcpEndpoint(res.browgent_mcp_endpoint);
      });
    }
  }, []);

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

  const handleSaveConfig = (newConfig: LLMConfig) => {
    setConfig(newConfig);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ browgent_config: newConfig });
    }
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

  const handleRun = () => {
    if (!goal.trim()) return;

    setStatus('running');
    setFeedItems([]);
    setFinalSummary('');
    setErrorMessage('');

    if (portRef.current) {
      portRef.current.postMessage({
        type: 'START_AGENT',
        payload: {
          goal,
          llmConfig: config,
          maxSteps,
          skills,
          files,
          mcpEndpoint,
        },
      });
    }
  };

  const handleStop = () => {
    if (portRef.current) {
      portRef.current.postMessage({ type: 'STOP_AGENT' });
    }
    setStatus('stopped');
  };

  const handleClearHistory = () => {
    setFeedItems([]);
    setFinalSummary('');
    setErrorMessage('');
    setStatus('idle');
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 antialiased font-sans select-none overflow-hidden">
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
                v0.1
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {PROVIDER_LABELS[config.provider] || config.provider}: {config.model || 'default'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {feedItems.length > 0 && (
            <button
              onClick={handleClearHistory}
              title="Clear timeline"
              aria-label="Clear timeline"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={handleToggleTheme}
            title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
            aria-label={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
            aria-pressed={theme === 'light'}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
            aria-label="Open settings"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Skills Bar */}
      <SkillSelector skills={skills} onToggleSkill={handleToggleSkill} />

      {/* Main Step Feed */}
      <StepFeed
        items={feedItems}
        finalSummary={finalSummary}
        errorMessage={errorMessage}
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
        isRunning={status === 'running'}
        onRun={handleRun}
        onStop={handleStop}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={handleSaveConfig}
        maxSteps={maxSteps}
        onSaveMaxSteps={handleSaveMaxSteps}
        mcpEndpoint={mcpEndpoint}
        onSaveMcpEndpoint={handleSaveMcpEndpoint}
        onAddCustomSkill={handleAddCustomSkill}
      />
    </div>
  );
};
