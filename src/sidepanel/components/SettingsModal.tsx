import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Plus, Globe, Key, Cpu, Zap, Sliders, Database, RefreshCw, ListChecks, AlertCircle } from 'lucide-react';
import { LLMConfig, ProviderType } from '../../background/llm/types';
import { Skill } from '../../background/skills/types';
import { parseSkillMarkdown } from '../../background/skills/manager';
import { fetchAvailableModels } from '../modelFetch';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: LLMConfig;
  onSaveConfig: (config: LLMConfig) => void;
  maxSteps: number;
  onSaveMaxSteps: (max: number) => void;
  mcpEndpoint: string;
  onSaveMcpEndpoint: (endpoint: string) => void;
  onAddCustomSkill: (skill: Skill) => void;
}

const PROVIDERS: { id: ProviderType; label: string }[] = [
  { id: 'omniroute', label: 'OmniRoute' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'openai-compat', label: 'OpenAI Compatible' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'anthropic', label: 'Anthropic' },
];

const OMNIROUTE_DEFAULT_BASE_URL = 'http://localhost:20128/v1/chat/completions';

const PROVIDER_DEFAULTS: Record<ProviderType, { baseUrl: string; model: string }> = {
  omniroute: { baseUrl: OMNIROUTE_DEFAULT_BASE_URL, model: 'anti' },
  openai: { baseUrl: '', model: '' },
  'openai-compat': { baseUrl: '', model: '' },
  gemini: { baseUrl: '', model: '' },
  anthropic: { baseUrl: '', model: '' },
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  maxSteps,
  onSaveMaxSteps,
  mcpEndpoint,
  onSaveMcpEndpoint,
  onAddCustomSkill,
}) => {
  const [localConfig, setLocalConfig] = useState<LLMConfig>({ ...config });
  const [localMaxSteps, setLocalMaxSteps] = useState<number>(maxSteps);
  const [localMcpEndpoint, setLocalMcpEndpoint] = useState<string>(mcpEndpoint);
  const [customSkillMarkdown, setCustomSkillMarkdown] = useState<string>('');
  const [skillAddedMessage, setSkillAddedMessage] = useState<string>('');

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState<string>('');

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Re-sync local edits when the modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalConfig({ ...config });
      setLocalMaxSteps(maxSteps);
      setLocalMcpEndpoint(mcpEndpoint);
      setAvailableModels([]);
      setModelStatus('');
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
  const canListModels = localConfig.provider !== 'omniroute';

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
    const keyPresent = Boolean((localConfig.apiKey || '').trim());
    const baseUrlPresent = localConfig.provider !== 'openai-compat' || Boolean((localConfig.baseUrl || '').trim());
    if (keyPresent && baseUrlPresent) {
      loadModels();
    } else {
      setModelStatus('');
      setAvailableModels([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localConfig.provider, localConfig.apiKey, localConfig.baseUrl, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig(localConfig);
    onSaveMaxSteps(localMaxSteps);
    onSaveMcpEndpoint(localMcpEndpoint);
    onClose();
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

  const apiKeyLabel = localConfig.provider === 'omniroute'
    ? 'API Key (Optional for local OmniRoute/Ollama)'
    : 'API Key (Required)';

  const baseUrlPlaceholder = localConfig.provider === 'omniroute'
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
            <h2 id="browgent-settings-title" className="text-xs font-bold text-slate-200">Browgent Settings</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            title="Close settings"
            className="text-slate-400 hover:text-slate-200 transition p-1 -m-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
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
                  onClick={() =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      provider: p.id,
                      baseUrl: PROVIDER_DEFAULTS[p.id].baseUrl,
                      model: PROVIDER_DEFAULTS[p.id].model,
                    }))
                  }
                  className={`p-2 rounded-lg text-left font-medium text-[11px] border transition ${
                    localConfig.provider === p.id
                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* OmniRoute Aliases */}
          {showAliases && (
            <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 space-y-2">
              <span className="text-[10px] text-slate-400 font-medium">Quick OmniRoute Aliases:</span>
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

          {/* API Key (hidden for OmniRoute unless user wants it; shown for all others) */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              {apiKeyLabel}
            </label>
            <input
              type="password"
              placeholder="sk-..."
              value={localConfig.apiKey || ''}
              onChange={(e) => setLocalConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Base URL — hidden for Gemini (fixed endpoint), optional elsewhere */}
          {showBaseUrl && (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                Endpoint Base URL{localConfig.provider === 'openai' || localConfig.provider === 'anthropic' ? ' (Optional)' : ''}
              </label>
              <input
                type="text"
                placeholder={baseUrlPlaceholder}
                value={localConfig.baseUrl || ''}
                onChange={(e) => setLocalConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs text-slate-100 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* Model Name — with auto-fetch for non-OmniRoute providers */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300">
                Model Name / Alias
              </label>
              {canListModels && (
                <button
                  type="button"
                  onClick={loadModels}
                  title="Load available models from the endpoint"
                  aria-label="Load available models from the endpoint"
                  className="flex items-center gap-1 min-h-[24px] px-1.5 -my-1 text-[10px] text-indigo-400 hover:text-indigo-300 rounded transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  <RefreshCw className="w-3 h-3" />
                  Fetch
                </button>
              )}
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

          {/* MCP Server Endpoint */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              Remote MCP Endpoint (Streamable HTTP)
            </label>
            <input
              type="text"
              placeholder="http://localhost:3000/mcp"
              value={localMcpEndpoint}
              onChange={(e) => setLocalMcpEndpoint(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs text-slate-100 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Max Step Budget */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-semibold text-slate-300">Max Step Safety Limit</label>
              <span className="font-mono text-indigo-400 font-bold">{localMaxSteps}</span>
            </div>
            <input
              type="range"
              min="3"
              max="30"
              value={localMaxSteps}
              onChange={(e) => setLocalMaxSteps(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          {/* Custom Skill Creator */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Import Custom Skill (Markdown)
            </label>
            <textarea
              rows={4}
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
                <span className="text-[10px] text-emerald-400">{skillAddedMessage}</span>
              ) : <span />}
              <button
                type="button"
                onClick={handleAddSkill}
                disabled={!customSkillMarkdown.trim()}
                className="flex items-center gap-1 px-2.5 py-1 bg-amber-600/30 text-amber-300 border border-amber-500/40 hover:bg-amber-600/40 rounded text-[11px] font-medium transition disabled:opacity-40"
              >
                <Plus className="w-3 h-3" />
                Add Skill
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
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
