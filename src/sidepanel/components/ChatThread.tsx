import React, { useRef, useEffect, useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  Copy,
  CheckCheck,
  AlertCircle,
  ArrowDown,
  Loader2,
  Globe,
  Bot,
  User,
  FileText,
  Table,
  CheckSquare,
  Search,
  Pencil,
  RotateCcw,
  Compass,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { Turn } from '../threads';
import { StepList } from './StepList';
import { Markdown } from './Markdown';
import { ContextualStarter } from '../starters';

interface ChatThreadProps {
  turns: Turn[];
  isRunning: boolean;
  suggestions?: Array<string | ContextualStarter>;
  isGeneratingSuggestions?: boolean;
  onRefreshSuggestions?: () => void;
  onSuggestionClick?: (prompt: string) => void;
  onEditPrompt?: (prompt: string) => void;
  onRetryPrompt?: (prompt: string, mode: Turn['mode']) => void;
}

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return 'now';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function hasMarkdownTable(text?: string | null): boolean {
  if (!text) return false;
  const tableLines = text.split('\n').filter((l) => l.trim().startsWith('|') && l.trim().endsWith('|'));
  return tableLines.length >= 2;
}

const getStarterMeta = (
  starter: string | ContextualStarter,
): { label: string; icon: React.ReactNode; color: string; borderHover: string } => {
  if (typeof starter === 'object' && starter !== null) {
    switch (starter.category) {
      case 'summarize':
        return {
          label: starter.label || 'Summarize',
          icon: <FileText className="w-3 h-3 text-[#4285F4] shrink-0" />,
          color: 'text-[#4285F4]',
          borderHover: 'hover:border-[#4285F4]/60 hover:bg-[#4285F4]/5',
        };
      case 'extract':
        return {
          label: starter.label || 'Extract',
          icon: <Table className="w-3 h-3 text-[#34A853] shrink-0" />,
          color: 'text-[#34A853]',
          borderHover: 'hover:border-[#34A853]/60 hover:bg-[#34A853]/5',
        };
      case 'automate':
        return {
          label: starter.label || 'Automate',
          icon: <CheckSquare className="w-3 h-3 text-[#FBBC05] shrink-0" />,
          color: 'text-[#FBBC05]',
          borderHover: 'hover:border-[#FBBC05]/60 hover:bg-[#FBBC05]/5',
        };
      case 'audit':
        return {
          label: starter.label || 'Audit',
          icon: <Search className="w-3 h-3 text-[#EA4335] shrink-0" />,
          color: 'text-[#EA4335]',
          borderHover: 'hover:border-[#EA4335]/60 hover:bg-[#EA4335]/5',
        };
      case 'compare':
        return {
          label: starter.label || 'Compare',
          icon: <Table className="w-3 h-3 text-[#34A853] shrink-0" />,
          color: 'text-[#34A853]',
          borderHover: 'hover:border-[#34A853]/60 hover:bg-[#34A853]/5',
        };
      case 'navigate':
        return {
          label: starter.label || 'Explore',
          icon: <Compass className="w-3 h-3 text-[#4285F4] shrink-0" />,
          color: 'text-[#4285F4]',
          borderHover: 'hover:border-[#4285F4]/60 hover:bg-[#4285F4]/5',
        };
      default:
        return {
          label: 'Task',
          icon: <Sparkles className="w-3 h-3 text-[#4285F4] shrink-0" />,
          color: 'text-[#4285F4]',
          borderHover: 'hover:border-[#4285F4]/60 hover:bg-[#4285F4]/5',
        };
    }
  }

  const p = starter.toLowerCase();
  if (p.includes('summarize')) {
    return {
      label: 'Summarize',
      icon: <FileText className="w-3 h-3 text-[#4285F4] shrink-0" />,
      color: 'text-[#4285F4]',
      borderHover: 'hover:border-[#4285F4]/60 hover:bg-[#4285F4]/5',
    };
  }
  if (p.includes('extract') || p.includes('table') || p.includes('price')) {
    return {
      label: 'Extract',
      icon: <Table className="w-3 h-3 text-[#34A853] shrink-0" />,
      color: 'text-[#34A853]',
      borderHover: 'hover:border-[#34A853]/60 hover:bg-[#34A853]/5',
    };
  }
  if (p.includes('form') || p.includes('fill')) {
    return {
      label: 'Automate',
      icon: <CheckSquare className="w-3 h-3 text-[#FBBC05] shrink-0" />,
      color: 'text-[#FBBC05]',
      borderHover: 'hover:border-[#FBBC05]/60 hover:bg-[#FBBC05]/5',
    };
  }
  if (p.includes('check') || p.includes('broken') || p.includes('audit') || p.includes('layout')) {
    return {
      label: 'Audit',
      icon: <Search className="w-3 h-3 text-[#EA4335] shrink-0" />,
      color: 'text-[#EA4335]',
      borderHover: 'hover:border-[#EA4335]/60 hover:bg-[#EA4335]/5',
    };
  }
  return {
    label: 'Task',
    icon: <Sparkles className="w-3 h-3 text-[#4285F4] shrink-0" />,
    color: 'text-[#4285F4]',
    borderHover: 'hover:border-[#4285F4]/60 hover:bg-[#4285F4]/5',
  };
};

export const ChatThread: React.FC<ChatThreadProps> = ({
  turns,
  isRunning,
  suggestions,
  isGeneratingSuggestions = false,
  onRefreshSuggestions,
  onSuggestionClick,
  onEditPrompt,
  onRetryPrompt,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState<boolean>(false);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isUp = scrollHeight - scrollTop - clientHeight > 120;
    setShowScrollBottom(isUp);
  };

  useEffect(() => {
    if (
      !showScrollBottom &&
      bottomRef.current &&
      typeof bottomRef.current.scrollIntoView === 'function'
    ) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns, isRunning, showScrollBottom]);

  const toggleSteps = (turnId: string) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [turnId]: !(prev[turnId] ?? true),
    }));
  };

  const handleCopy = async (turnId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTurnId(turnId);
      setTimeout(() => setCopiedTurnId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyPrompt = async (turnId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPromptId(turnId);
      setTimeout(() => setCopiedPromptId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const downloadTextFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = (turnId: string, text: string) => {
    downloadTextFile(`browgent-summary-${turnId.slice(0, 8)}.md`, text, 'text/markdown');
  };

  const handleExportCSV = (turnId: string, text: string) => {
    const tableLines = text.split('\n').filter((l) => l.trim().startsWith('|') && l.trim().endsWith('|'));
    if (tableLines.length >= 2) {
      const csvRows = tableLines
        .filter((l) => !/^\|[\s\-:|]+\|$/.test(l.trim()))
        .map((l) =>
          l
            .slice(1, -1)
            .split('|')
            .map((cell) => `"${cell.trim().replace(/"/g, '""')}"`)
            .join(','),
        );
      downloadTextFile(`browgent-data-${turnId.slice(0, 8)}.csv`, csvRows.join('\n'), 'text/csv');
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-3 space-y-4 relative"
    >
      {/* Empty State */}
      {turns.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#4285F4]/20 via-[#EA4335]/15 via-[#FBBC05]/15 to-[#34A853]/20 border border-slate-700/60 flex items-center justify-center mb-2.5 shadow-xs">
            <Sparkles className="w-5 h-5 text-[#4285F4]" />
          </div>
          <p className="text-xs font-semibold text-slate-300 tracking-tight">Ready for instructions</p>
          <p className="text-[11px] mt-0.5 max-w-[240px] text-slate-400">
            Enter a prompt below or pick a starter:
          </p>
          <div className="flex items-center justify-between w-full max-w-[340px] mt-3.5 mb-1.5 px-0.5">
            <span className="text-[11px] text-slate-400 font-medium">Suggested for this page:</span>
            {onRefreshSuggestions && (
              <button
                type="button"
                onClick={onRefreshSuggestions}
                disabled={isGeneratingSuggestions || isRunning}
                className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition cursor-pointer disabled:opacity-50"
                title="Use AI to generate tailored questions from this page's content"
              >
                {isGeneratingSuggestions ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                    <span>Analyzing page...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-[#4285F4]" />
                    <span>AI Suggestions</span>
                  </>
                )}
              </button>
            )}
          </div>
          {suggestions && suggestions.length > 0 && (
            <div className="w-full max-w-[340px] grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {suggestions.map((item, idx) => {
                const promptText = typeof item === 'string' ? item : item.prompt;
                const cat = getStarterMeta(item);
                return (
                  <button
                    key={typeof item === 'string' ? item : `${item.label}-${idx}`}
                    type="button"
                    onClick={() => onSuggestionClick?.(promptText)}
                    className={`group relative flex flex-col justify-between p-2.5 rounded-lg text-slate-300 bg-slate-900/80 border border-slate-800 ${cat.borderHover} hover:shadow-sm transition cursor-pointer`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {cat.icon}
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${cat.color}`}>
                        {cat.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-300 group-hover:text-slate-100 transition line-clamp-2 leading-snug">
                      {promptText}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Render Turns */}
      {turns.map((turn) => {
        const isStepsOpen = expandedSteps[turn.id] ?? turn.status === 'running';

        return (
          <div key={turn.id} className="space-y-2.5">
            {/* User Prompt Bubble */}
            <div className="flex flex-col items-end group/turn">
              <div className="max-w-[90%] bg-blue-600/15 border border-blue-500/30 rounded-xl px-3 py-2 text-xs text-slate-100 shadow-sm space-y-1">
                <div className="flex items-center justify-between gap-3 text-[10px] text-blue-300/80 border-b border-blue-500/20 pb-1 mb-1">
                  <span className="flex items-center gap-1 font-medium">
                    <User className="w-3 h-3 text-[#4285F4]" />
                    You
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="uppercase text-[9px] font-semibold tracking-wider px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300">
                      {turn.mode}
                    </span>
                    <span className="text-[10px] text-blue-300/60 lowercase">
                      {formatRelativeTime(turn.createdAt)}
                    </span>
                    <div className="flex items-center gap-1 opacity-70 group-hover/turn:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleCopyPrompt(turn.id, turn.prompt)}
                        title="Copy prompt"
                        aria-label="Copy prompt"
                        className="p-0.5 rounded text-blue-300/70 hover:text-blue-100 hover:bg-blue-500/20 transition cursor-pointer"
                      >
                        {copiedPromptId === turn.id ? (
                          <CheckCheck className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      {onEditPrompt && (
                        <button
                          type="button"
                          onClick={() => onEditPrompt(turn.prompt)}
                          title="Edit prompt"
                          aria-label="Edit prompt"
                          className="p-0.5 rounded text-blue-300/70 hover:text-blue-100 hover:bg-blue-500/20 transition cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      {onRetryPrompt && (
                        <button
                          type="button"
                          onClick={() => onRetryPrompt(turn.prompt, turn.mode)}
                          disabled={isRunning}
                          title="Retry prompt"
                          aria-label="Retry prompt"
                          className="p-0.5 rounded text-blue-300/70 hover:text-blue-100 hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <p className="whitespace-pre-wrap leading-relaxed text-[11px] text-slate-200">
                  {turn.prompt}
                </p>

                {turn.tab && (turn.tab.title || turn.tab.url) && (
                  <div className="pt-1 flex items-center gap-1 text-[10px] text-blue-300/80 truncate">
                    <Globe className="w-2.5 h-2.5 shrink-0 opacity-70" />
                    <span className="truncate max-w-[220px]">
                      {turn.tab.title || turn.tab.url}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Agent Work Steps (collapsible) */}
            {turn.mode === 'agent' && turn.steps.length > 0 && (
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-2 text-xs">
                <button
                  type="button"
                  onClick={() => toggleSteps(turn.id)}
                  className="w-full flex items-center justify-between gap-1 text-slate-400 hover:text-slate-200 transition py-0.5 cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 font-medium text-[11px]">
                    {isStepsOpen ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    <span>
                      Worked for {turn.steps.length} {turn.steps.length === 1 ? 'step' : 'steps'}
                    </span>
                    {turn.status === 'running' && (
                      <Loader2 className="w-3 h-3 text-[#4285F4] animate-spin ml-1" />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {isStepsOpen ? 'Hide' : 'Show details'}
                  </span>
                </button>

                {isStepsOpen && (
                  <div className="mt-2 pt-2 border-t border-slate-800/60">
                    <StepList items={turn.steps} />
                  </div>
                )}
              </div>
            )}

            {/* Running Indicator (when no steps yet or actively thinking) */}
            {turn.status === 'running' && turn.steps.length === 0 && (
              <div className="flex items-center gap-2 py-1.5 px-2 text-slate-400 text-xs animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4285F4]" />
                <span className="text-[11px]">
                  {turn.mode === 'ask'
                    ? 'Browgent is reading this page...'
                    : 'Browgent is analyzing the browser...'}
                </span>
              </div>
            )}

            {/* Completed Summary / Result Card */}
            {turn.result && (
              <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 text-xs shadow-sm space-y-1.5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-700/50">
                  <div className="flex items-center gap-1.5 font-semibold text-blue-300 text-[11px]">
                    <Bot className="w-3.5 h-3.5 text-[#4285F4]" />
                    <span>Browgent</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {hasMarkdownTable(turn.result) && (
                      <button
                        type="button"
                        onClick={() => handleExportCSV(turn.id, turn.result!)}
                        title="Export table as CSV"
                        aria-label="Export table as CSV"
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 transition cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                        <span>CSV</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleExportMarkdown(turn.id, turn.result!)}
                      title="Download as Markdown"
                      aria-label="Download as Markdown"
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-900 border border-slate-700/60 transition cursor-pointer"
                    >
                      <Download className="w-3 h-3 text-slate-400" />
                      <span>MD</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(turn.id, turn.result!)}
                      title="Copy response"
                      aria-label="Copy response"
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-900 border border-slate-700/60 transition cursor-pointer"
                    >
                      {copiedTurnId === turn.id ? (
                        <CheckCheck className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-400" />
                      )}
                      <span>{copiedTurnId === turn.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
                <Markdown content={turn.result} className="text-slate-200 text-[11px] leading-relaxed" />
              </div>
            )}

            {/* Error Banner */}
            {turn.error && (
              <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-3 text-xs shadow-sm">
                <div className="flex items-center gap-1.5 font-semibold text-rose-300 text-[11px] mb-1">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>{turn.status === 'stopped' ? 'Execution Stopped' : 'Execution Halted'}</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">{turn.error}</p>
              </div>
            )}
          </div>
        );
      })}

      {/* Floating Jump to Latest Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Jump to latest"
          className="sticky bottom-2 ml-auto z-20 flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-[#4285F4] to-[#2563eb] hover:from-[#3b78e7] hover:to-[#1d4ed8] hover:scale-105 text-white text-[10px] font-semibold rounded-full shadow-lg border border-blue-400/40 transition-all cursor-pointer"
        >
          <ArrowDown className="w-3 h-3" />
          Latest
        </button>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
