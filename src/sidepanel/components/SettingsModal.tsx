import React, { useState } from 'react';
import { X, Save, Plus, Globe, Key, Cpu, Zap, Sliders, Database } from 'lucide-react';
import { LLMConfig, ProviderType } from '../../background/llm/types';
import { Skill } from '../../background/skills/types';
import { parseSkillMarkdown } from '../../background/skills/manager';

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
      baseUrl: prev.baseUrl || 'http://localhost:20128/v1/chat/completions',
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h2 className="text-xs font-bold text-slate-200">Browgent Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition"
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
              {(['omniroute', 'openai', 'gemini', 'anthropic'] as ProviderType[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      provider: p,
                      baseUrl: p === 'omniroute' ? 'http://localhost:20128/v1/chat/completions' : prev.baseUrl,
                    }))
                  }
                  className={`p-2 rounded-lg text-left capitalize font-medium text-[11px] border transition ${
                    localConfig.provider === p
                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* OmniRoute Aliases */}
          {localConfig.provider === 'omniroute' && (
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

          {/* API Key */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              API Key (Optional for local OmniRoute/Ollama)
            </label>
            <input
              type="password"
              placeholder="sk-..."
              value={localConfig.apiKey || ''}
              onChange={(e) => setLocalConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Base URL */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              Endpoint Base URL
            </label>
            <input
              type="text"
              placeholder={
                localConfig.provider === 'omniroute'
                  ? 'http://localhost:20128/v1/chat/completions'
                  : 'https://api.openai.com/v1/chat/completions'
              }
              value={localConfig.baseUrl || ''}
              onChange={(e) => setLocalConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs text-slate-100 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Model Name */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300">
              Model Name / Alias
            </label>
            <input
              type="text"
              placeholder="e.g. Claude/Antigravity, gpt-4o, gemini-2.5-flash"
              value={localConfig.model || ''}
              onChange={(e) => setLocalConfig((prev) => ({ ...prev, model: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* MCP Server Endpoint */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              Remote MCP Endpoint (HTTP / SSE)
            </label>
            <input
              type="text"
              placeholder="http://localhost:3000/sse"
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
