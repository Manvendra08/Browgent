import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Save,
  Plus,
  Globe,
  Key,
  Cpu,
  Zap,
  Sliders,
  Database,
  RefreshCw,
  ListChecks,
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
  Sparkles,
  User,
  Trash2,
} from 'lucide-react';
import { LLMConfig, ProviderType } from '../../background/llm/types';
import { Skill } from '../../background/skills/types';
import { parseSkillMarkdown } from '../../background/skills/manager';
import { fetchAvailableModels, testConnection, testMcpEndpoint } from '../modelFetch';
import {
  OMNIROUTE_DEFAULT_BASE_URL,
  configForProvider,
  hasSavedConfig,
  stashProviderConfig,
  getProviderAccounts,
  getActiveAccountId,
  addProviderAccount,
  deleteProviderAccount,
  switchProviderAccount,
  type ProviderConfigMap,
} from '../providerConfigs';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: LLMConfig;
  onSaveConfig: (config: LLMConfig, providerConfigs: ProviderConfigMap) => void;
  providerConfigs: ProviderConfigMap;
  maxSteps: number;
  onSaveMaxSteps: (max: number) => void;
  mcpEndpoint: string;
  onSaveMcpEndpoint: (endpoint: string) => void;
  onAddCustomSkill: (skill: Skill) => void;
  showOverlay?: boolean;
  onSaveShowOverlay?: (show: boolean) => void;
}

type SettingsTab = 'providers' | 'bounds' | 'mcp' | 'skills';

const TABS: { id: SettingsTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'providers', label: 'Models', icon: Cpu },
  { id: 'bounds', label: 'Agent', icon: Sliders },
  { id: 'mcp', label: 'MCP', icon: Database },
  { id: 'skills', label: 'Skills', icon: Zap },
];

const PROVIDERS: { id: ProviderType; label: string }[] = [
  { id: 'omniroute', label: 'OmniRoute' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'openai-compat', label: 'OpenAI Compatible' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'anthropic', label: 'Anthropic' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  providerConfigs,
  maxSteps,
  onSaveMaxSteps,
  mcpEndpoint,
  onSaveMcpEndpoint,
  onAddCustomSkill,
  showOverlay,
  onSaveShowOverlay,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');
  const [localConfig, setLocalConfig] = useState<LLMConfig>({ ...config });
  const [localProviderConfigs, setLocalProviderConfigs] = useState<ProviderConfigMap>({
    ...providerConfigs,
  });
  const [localMaxSteps, setLocalMaxSteps] = useState<number>(maxSteps);
  const [localMcpEndpoint, setLocalMcpEndpoint] = useState<string>(mcpEndpoint);
  const [localShowOverlay, setLocalShowOverlay] = useState<boolean>(showOverlay ?? false);
  const [customSkillMarkdown, setCustomSkillMarkdown] = useState<string>('');
  const [skillAddedMessage, setSkillAddedMessage] = useState<string>('');

  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState<string>('');
  const [testResult, setTestResult] = useState<{
    testing: boolean;
    success?: boolean;
    message?: string;
  } | null>(null);
  const [mcpTestResult, setMcpTestResult] = useState<{
    testing: boolean;
    success?: boolean;
    message?: string;
  } | null>(null);

  const currentAccounts = getProviderAccounts(localProviderConfigs, localConfig.provider);
  const currentActiveAccountId = getActiveAccountId(localProviderConfigs, localConfig.provider);
  const activeAccount =
    currentAccounts.find((a) => a.id === currentActiveAccountId) || currentAccounts[0];
  const [currentAccountName, setCurrentAccountName] = useState<string>(
    activeAccount?.name || 'Default',
  );

  useEffect(() => {
    if (activeAccount) {
      setCurrentAccountName(activeAccount.name);
    }
  }, [activeAccount?.id, activeAccount?.name]);

  const handleSwitchAccount = (accountId: string) => {
    if (accountId === currentActiveAccountId) return;
    const stashedMap = stashProviderConfig(localProviderConfigs, localConfig, currentAccountName);
    const nextMap = switchProviderAccount(stashedMap, localConfig.provider, accountId);
    setLocalProviderConfigs(nextMap);
    setLocalConfig(configForProvider(nextMap, localConfig.provider));
    setTestResult(null);
  };

  const handleAddNewAccount = () => {
    const stashedMap = stashProviderConfig(localProviderConfigs, localConfig, currentAccountName);
    const { nextMap, newAccount } = addProviderAccount(stashedMap, localConfig.provider);
    setLocalProviderConfigs(nextMap);
    setLocalConfig(configForProvider(nextMap, localConfig.provider));
    setCurrentAccountName(newAccount.name);
    setTestResult(null);
  };

  const handleDeleteAccount = (accountId: string) => {
    const nextMap = deleteProviderAccount(localProviderConfigs, localConfig.provider, accountId);
    setLocalProviderConfigs(nextMap);
    setLocalConfig(configForProvider(nextMap, localConfig.provider));
    setTestResult(null);
  };

  const handleRenameAccount = (newName: string) => {
    setCurrentAccountName(newName);
    const nextMap = stashProviderConfig(localProviderConfigs, localConfig, newName);
    setLocalProviderConfigs(nextMap);
  };

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Re-sync local edits when the modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalConfig({ ...config });
      setLocalProviderConfigs({ ...providerConfigs });
      setLocalMaxSteps(maxSteps);
      setLocalMcpEndpoint(mcpEndpoint);
      setAvailableModels([]);
      setModelStatus('');
      setTestResult(null);
      setMcpTestResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Dialog behavior: focus the dialog on open, restore focus on close
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const timer = setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);
    return () => {
      clearTimeout(timer);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen]);

  // Escape closes; Tab cycles within the dialog (focus trap)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || active === dialogRef.current) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  const showBaseUrl = localConfig.provider !== 'gemini';
  const showAliases = localConfig.provider === 'omniroute';
  const canListModels = true;

  const loadModels = async () => {
    setModelStatus('Loading models...');
    const result = await fetchAvailableModels(localConfig);
    if (result.error) {
      setAvailableModels([]);
      setModelStatus(result.error);
    } else if (result.models.length === 0) {
      setModelStatus('Endpoint returned no models — enter the model manually.');
    } else {
      setAvailableModels(result.models);
      setModelStatus(`${result.models.length} models found`);
    }
  };

  // Auto-load models when requirements are met
  useEffect(() => {
    if (!isOpen || !canListModels) return;
    const keyPresent =
      localConfig.provider === 'omniroute' || Boolean((localConfig.apiKey || '').trim());
    const baseUrlPresent =
      localConfig.provider !== 'openai-compat' || Boolean((localConfig.baseUrl || '').trim());
    if (keyPresent && baseUrlPresent) {
      loadModels();
    } else {
      setModelStatus('');
      setAvailableModels([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localConfig.provider, localConfig.apiKey, localConfig.baseUrl, isOpen]);

  const handleTestConnection = async () => {
    setTestResult({ testing: true });
    try {
      const res = await testConnection(localConfig);
      setTestResult({ testing: false, success: res.success, message: res.message });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ testing: false, success: false, message: msg });
    }
  };

  const handleTestMcp = async () => {
    setMcpTestResult({ testing: true });
    try {
      const res = await testMcpEndpoint(localMcpEndpoint);
      setMcpTestResult({ testing: false, success: res.success, message: res.message });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMcpTestResult({ testing: false, success: false, message: msg });
    }
  };

  useEffect(() => {
    setLocalShowOverlay(showOverlay ?? false);
  }, [showOverlay, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const mergedConfigs = stashProviderConfig(
      localProviderConfigs,
      localConfig,
      currentAccountName,
    );
    setLocalProviderConfigs(mergedConfigs);
    onSaveConfig(localConfig, mergedConfigs);
    onSaveMaxSteps(localMaxSteps);
    onSaveMcpEndpoint(localMcpEndpoint);
    onSaveShowOverlay?.(localShowOverlay);
    onClose();
  };

  const switchProvider = (provider: ProviderType) => {
    if (provider === localConfig.provider) return;
    const mergedConfigs = stashProviderConfig(
      localProviderConfigs,
      localConfig,
      currentAccountName,
    );
    setLocalProviderConfigs(mergedConfigs);
    setLocalConfig(configForProvider(mergedConfigs, provider));
    setTestResult(null);
  };

  const handleAddSkill = () => {
    if (!customSkillMarkdown.trim()) return;
    try {
      const skill = parseSkillMarkdown(customSkillMarkdown);
      onAddCustomSkill(skill);
      setCustomSkillMarkdown('');
      setSkillAddedMessage(`Skill "${skill.name}" added successfully!`);
      setTimeout(() => setSkillAddedMessage(''), 3000);
    } catch (err: unknown) {
      alert(`Invalid Skill format: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const setOmniRouteAlias = (alias: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      provider: 'omniroute',
      model: alias,
      baseUrl: prev.baseUrl || OMNIROUTE_DEFAULT_BASE_URL,
    }));
  };

  const apiKeyLabel =
    localConfig.provider === 'omniroute'
      ? 'API Key (Optional for local OmniRoute/Ollama)'
      : 'API Key (Required)';

  const baseUrlPlaceholder =
    localConfig.provider === 'omniroute'
      ? OMNIROUTE_DEFAULT_BASE_URL
      : localConfig.provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : localConfig.provider === 'anthropic'
          ? 'https://api.anthropic.com/v1/messages'
          : 'http://localhost:1234/v1/chat/completions';

  const modelPlaceholder = showAliases
    ? 'e.g. Claude/Antigravity, or pick an alias above'
    : availableModels.length > 0
      ? 'Search or pick a model...'
      : 'e.g. gpt-4o-mini, gemini-2.5-flash, claude-sonnet-4-5';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="browgent-settings-title"
        tabIndex={-1}
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm max-h-[90vh] flex flex-col shadow-2xl overflow-hidden focus:outline-none"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h2 id="browgent-settings-title" className="text-xs font-bold text-slate-200">
              Browgent Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            title="Close settings"
            className="text-slate-400 hover:text-slate-200 transition p-1 -m-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation Header */}
        <nav
          aria-label="Settings categories"
          className="flex border-b border-slate-800 bg-slate-950/30 px-2 pt-1.5 gap-1 shrink-0"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-t-lg transition border-b-2 -mb-px ${
                  isActive
                    ? 'border-indigo-500 text-indigo-300 bg-slate-800/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`}
                />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Modal Body with Tab Views */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
          {activeTab === 'providers' && (
            <>
              {/* Provider Selection */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  LLM Provider
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => switchProvider(p.id)}
                      aria-label={`${p.label}${hasSavedConfig(localProviderConfigs, p.id) ? ' (saved settings)' : ''}`}
                      title={
                        hasSavedConfig(localProviderConfigs, p.id)
                          ? 'Saved settings will be restored'
                          : undefined
                      }
                      className={`p-2 rounded-lg text-left font-medium text-[11px] border transition ${
                        localConfig.provider === p.id
                          ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500'
                          : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span>{p.label}</span>
                        {hasSavedConfig(localProviderConfigs, p.id) && (
                          <Check
                            className="w-3 h-3 text-emerald-400 flex-shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Account Profiles */}
              <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                    <User className="w-3 h-3 text-indigo-400" />
                    Accounts / Profiles ({currentAccounts.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddNewAccount}
                    className="flex items-center gap-1 text-[10px] font-medium text-indigo-400 hover:text-indigo-300 transition"
                  >
                    <Plus className="w-3 h-3" />
                    Add Account
                  </button>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {currentAccounts.map((acc) => {
                    const isSelected = acc.id === currentActiveAccountId;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => handleSwitchAccount(acc.id)}
                        aria-label={`Select ${acc.name}`}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium shrink-0 border transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700/60'
                        }`}
                      >
                        <span>{acc.name}</span>
                        {isSelected && currentAccounts.length > 1 && (
                          <span
                            role="button"
                            aria-label={`Delete ${acc.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAccount(acc.id);
                            }}
                            className="text-slate-400 hover:text-rose-400 p-0.5 -mr-1 rounded cursor-pointer"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1 flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 shrink-0">Account Name:</span>
                  <input
                    type="text"
                    placeholder="e.g. Kilo AI Gateway, Work, DeepSeek"
                    value={currentAccountName}
                    onChange={(e) => handleRenameAccount(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded px-2 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* OmniRoute Aliases */}
              {showAliases && (
                <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 space-y-2">
                  <span className="text-[10px] text-slate-400 font-medium">
                    Quick OmniRoute Aliases:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {['anti', 'free', 'kilo', 'gp', 'glm', 'bigp'].map((alias) => (
                      <button
                        key={alias}
                        type="button"
                        onClick={() => setOmniRouteAlias(alias)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                          localConfig.model === alias
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        /{alias}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* API Key with reveal toggle */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  {apiKeyLabel}
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={localConfig.apiKey || ''}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({ ...prev, apiKey: e.target.value }))
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 pr-8 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    title={showApiKey ? 'Hide API key' : 'Show API key'}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-200 transition"
                  >
                    {showApiKey ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Base URL */}
              {showBaseUrl && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-sky-400" />
                    Endpoint Base URL
                    {localConfig.provider === 'openai' || localConfig.provider === 'anthropic'
                      ? ' (Optional)'
                      : ''}
                  </label>
                  <input
                    type="text"
                    placeholder={baseUrlPlaceholder}
                    value={localConfig.baseUrl || ''}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({ ...prev, baseUrl: e.target.value }))
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs text-slate-100 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Model Name & Connection Testing */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Model Name / Alias
                  </label>
                  <div className="flex items-center gap-2">
                    {canListModels && (
                      <button
                        type="button"
                        onClick={loadModels}
                        title="Load available models from the endpoint"
                        aria-label="Load available models from the endpoint"
                        className="flex items-center gap-1 min-h-[22px] px-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 rounded transition focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        Fetch
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testResult?.testing}
                      title="Test connection to this provider"
                      aria-label="Test connection to this provider"
                      className="flex items-center gap-1 min-h-[22px] px-2 py-0.5 text-[10px] font-medium bg-slate-800 text-indigo-300 border border-indigo-500/30 hover:border-indigo-500 hover:bg-slate-700 rounded transition disabled:opacity-40"
                    >
                      {testResult?.testing ? (
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                      )}
                      Test
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder={modelPlaceholder}
                  value={localConfig.model || ''}
                  onChange={(e) => setLocalConfig((prev) => ({ ...prev, model: e.target.value }))}
                  list="browgent-model-list"
                  className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <datalist id="browgent-model-list">
                  {availableModels.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>

                {/* Test Result Message */}
                {testResult && !testResult.testing && (
                  <div
                    className={`p-2 rounded-md text-[11px] flex items-start gap-1.5 border ${
                      testResult.success
                        ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                        : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span className="leading-tight">{testResult.message}</span>
                  </div>
                )}

                {canListModels && modelStatus && (
                  <p className="text-[10px] flex items-start gap-1 text-slate-500">
                    {modelStatus.startsWith('Could not') || modelStatus.includes('required') ? (
                      <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-px" />
                    ) : (
                      <ListChecks className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-px" />
                    )}
                    <span>{modelStatus}</span>
                  </p>
                )}
              </div>
            </>
          )}

          {activeTab === 'bounds' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Max Step Safety Budget
                  </label>
                  <span className="font-mono text-indigo-400 font-bold px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                    {localMaxSteps} steps
                  </span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="30"
                  value={localMaxSteps}
                  onChange={(e) => setLocalMaxSteps(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Controls the maximum number of automated browser actions the agent can perform for
                  a single goal before halting to prevent runaway loops or budget exhaustion.
                </p>
              </div>

              <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-[11px] font-semibold text-slate-300">
                      Show Element Overlay Badges
                    </label>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Paint yellow Set-of-Marks numbered badges on elements during execution.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Show Element Overlay Badges"
                    aria-checked={localShowOverlay}
                    onClick={() => setLocalShowOverlay(!localShowOverlay)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      localShowOverlay ? 'bg-indigo-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        localShowOverlay ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <div className="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/80">
                  <span className="font-semibold text-slate-300">
                    {localShowOverlay
                      ? 'Visual Grounding Mode:'
                      : 'Clean Background Mode (Default):'}
                  </span>{' '}
                  {localShowOverlay
                    ? 'Visual markers are stamped on the page for vision LLMs. Page content will show yellow numbered tags.'
                    : 'Browgent navigates and inspects elements invisibly in memory without injecting visual tags into the page.'}
                </div>
              </div>

              <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-300">Perception Quality</span>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Captures 65% quality JPEG viewport screenshots with masked sensitive fields
                  (passwords, card numbers, OTPs) to protect personal credentials.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'mcp' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-emerald-400" />
                    Remote MCP Endpoint (Streamable HTTP)
                  </label>
                  <button
                    type="button"
                    onClick={handleTestMcp}
                    disabled={mcpTestResult?.testing || !localMcpEndpoint.trim()}
                    title="Ping and inspect tools on this MCP endpoint"
                    className="flex items-center gap-1 min-h-[22px] px-2 py-0.5 text-[10px] font-medium bg-slate-800 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500 hover:bg-slate-700 rounded transition disabled:opacity-40"
                  >
                    {mcpTestResult?.testing ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-2.5 h-2.5 text-emerald-400" />
                    )}
                    Ping MCP
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="http://localhost:3000/mcp"
                  value={localMcpEndpoint}
                  onChange={(e) => setLocalMcpEndpoint(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs text-slate-100 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
                />
              </div>

              {mcpTestResult && !mcpTestResult.testing && (
                <div
                  className={`p-2.5 rounded-md text-[11px] flex items-start gap-1.5 border ${
                    mcpTestResult.success
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                      : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                  }`}
                >
                  {mcpTestResult.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-tight">{mcpTestResult.message}</span>
                </div>
              )}

              <p className="text-[10px] text-slate-500 leading-relaxed">
                Connects Browgent to local Model Context Protocol servers over streamable HTTP.
                Discovered tools are dynamically exposed to the agent as callable actions.
              </p>
            </div>
          )}

          {activeTab === 'skills' && (
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Import Custom Skill (Markdown)
              </label>
              <textarea
                rows={6}
                placeholder={`---
name: my-custom-skill
description: Custom instructions
---
You are an expert in...`}
                value={customSkillMarkdown}
                onChange={(e) => setCustomSkillMarkdown(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-[11px] font-mono text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
              />
              <div className="flex items-center justify-between">
                {skillAddedMessage ? (
                  <span className="text-[10px] text-emerald-400 font-medium">
                    {skillAddedMessage}
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={handleAddSkill}
                  disabled={!customSkillMarkdown.trim()}
                  className="flex items-center gap-1 px-3 py-1 bg-amber-600/30 text-amber-300 border border-amber-500/40 hover:bg-amber-600/40 rounded text-[11px] font-medium transition disabled:opacity-40"
                >
                  <Plus className="w-3 h-3" />
                  Add Skill
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-medium transition shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
