import React, { useRef, useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  MousePointer,
  Type,
  ArrowDownUp,
  Navigation,
  Clock,
  Check,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Copy,
  CheckCheck,
  ArrowDown,
} from 'lucide-react';
import { AgentAction } from '../../background/types';
import { Markdown } from './Markdown';

export interface FeedItem {
  id: string;
  step: number;
  thought?: string;
  action?: AgentAction;
  status: 'running' | 'success' | 'error';
  error?: string;
  timestamp: number;
}

interface StepFeedProps {
  items: FeedItem[];
  finalSummary?: string;
  errorMessage?: string;
  isRunning: boolean;
  suggestions?: string[];
  onSuggestionClick?: (prompt: string) => void;
}

export const StepFeed: React.FC<StepFeedProps> = ({
  items,
  finalSummary,
  errorMessage,
  isRunning,
  suggestions,
  onSuggestionClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<boolean>(false);
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
  }, [items, finalSummary, errorMessage, showScrollBottom]);

  const toggleThought = (id: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopySummary = async () => {
    if (!finalSummary) return;
    try {
      await navigator.clipboard.writeText(finalSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const getActionBadge = (action?: AgentAction) => {
    if (!action) return null;

    switch (action.action) {
      case 'click':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <MousePointer className="w-3 h-3" />
            Click [{action.elementId}]
          </span>
        );
      case 'type':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Type className="w-3 h-3" />
            Type into [{action.elementId}]: "
            {action.text.length > 20 ? action.text.slice(0, 20) + '...' : action.text}"
          </span>
        );
      case 'scroll':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <ArrowDownUp className="w-3 h-3" />
            Scroll {action.direction}
          </span>
        );
      case 'navigate':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Navigation className="w-3 h-3" />
            Navigate: {action.url.length > 30 ? action.url.slice(0, 30) + '...' : action.url}
          </span>
        );
      case 'wait':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-700 text-slate-300">
            <Clock className="w-3 h-3" />
            Wait {action.seconds || 2}s
          </span>
        );
      case 'finish':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <Check className="w-3 h-3" />
            Finish
          </span>
        );
      case 'fail':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" />
            Fail
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-3 space-y-2.5 relative"
    >
      {items.length === 0 && !finalSummary && !errorMessage && (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
          <Sparkles className="w-8 h-8 text-indigo-400/40 mb-2" />
          <p className="text-xs font-medium text-slate-400">Ready for instructions</p>
          <p className="text-[11px] mt-1 max-w-[220px] text-slate-400">
            Enter a prompt below or pick a starter:
          </p>
          {suggestions && suggestions.length > 0 && (
            <div className="mt-3 w-full max-w-[260px] flex flex-col gap-1.5">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSuggestionClick?.(prompt)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-[11px] text-slate-300 bg-slate-800/60 border border-slate-700/60 hover:border-indigo-500/60 hover:text-indigo-300 transition leading-snug"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {items.map((item) => {
        const isExpanded = expandedThoughts[item.id] ?? item.status === 'running';

        return (
          <div
            key={item.id}
            className="bg-slate-800/70 border border-slate-700/60 rounded-lg p-2.5 text-xs shadow-sm hover:border-slate-600/80 transition"
          >
            {/* Step Header */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-300 text-[11px]">Step {item.step}</span>
                {item.status === 'running' && (
                  <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                )}
                {item.status === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                {item.status === 'error' && <AlertCircle className="w-3 h-3 text-rose-400" />}
              </div>
              <span className="text-[10px] text-slate-400">
                {new Date(item.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>

            {/* Collapsible Thought */}
            {item.thought && (
              <div className="mb-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => toggleThought(item.id)}
                    className="flex items-center gap-1 text-[11px] text-indigo-300 font-medium hover:text-indigo-200 transition shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    Thinking
                  </button>
                  {!isExpanded && (
                    <span className="text-[10px] text-slate-400 italic truncate max-w-[200px] select-none">
                      {item.thought}
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <p className="mt-1 text-[11px] text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800/80 leading-relaxed font-mono whitespace-pre-wrap">
                    {item.thought}
                  </p>
                )}
              </div>
            )}

            {/* Action Badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="shrink-0">{getActionBadge(item.action)}</div>
              {item.error && (
                <span
                  className="text-[10px] text-rose-400 leading-relaxed text-right break-words whitespace-pre-wrap min-w-0"
                  title={item.error}
                >
                  {item.error}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Completed Summary Banner */}
      {finalSummary && (
        <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-lg p-3 text-xs shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-300 text-[12px]">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Goal Completed
            </div>
            <button
              type="button"
              onClick={handleCopySummary}
              title="Copy summary"
              aria-label="Copy summary"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-emerald-300 bg-emerald-900/50 hover:bg-emerald-800/60 border border-emerald-700/50 transition cursor-pointer"
            >
              {copied ? (
                <CheckCheck className="w-3 h-3 text-emerald-300" />
              ) : (
                <Copy className="w-3 h-3 text-emerald-400" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <Markdown content={finalSummary} className="text-slate-200 text-[11px] leading-relaxed" />
        </div>
      )}

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-lg p-3 text-xs shadow-sm">
          <div className="flex items-center gap-1.5 font-semibold text-rose-300 text-[12px] mb-1">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            Execution Halted
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">{errorMessage}</p>
        </div>
      )}

      {isRunning && (
        <div className="flex items-center justify-center gap-2 py-2 text-slate-400 text-xs animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
          <span>Browgent is analyzing the browser...</span>
        </div>
      )}

      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Jump to latest"
          className="sticky bottom-2 ml-auto z-20 flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold rounded-full shadow-lg border border-indigo-400/40 transition cursor-pointer"
        >
          <ArrowDown className="w-3 h-3" />
          Latest
        </button>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
