import React, { useState } from 'react';
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
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { AgentAction, StepTimings } from '../../background/types';

export type { StepTimings };

export interface FeedItem {
  id: string;
  step: number;
  thought?: string;
  action?: AgentAction;
  status: 'running' | 'success' | 'error';
  error?: string;
  timestamp: number;
  timings?: StepTimings;
}

interface StepListProps {
  items: FeedItem[];
}

export const StepList: React.FC<StepListProps> = ({ items }) => {
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  const toggleThought = (id: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [id]: !prev[id] }));
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
    <div className="space-y-2">
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
                {item.timings && (
                  <span
                    className="text-[10px] text-slate-400 font-mono bg-slate-900/80 px-1.5 py-0.2 rounded border border-slate-700/60 cursor-help"
                    title={`DOM: ${item.timings.domMs}ms | Shot: ${item.timings.screenshotMs}ms | LLM: ${item.timings.llmMs}ms | Action: ${item.timings.actionMs}ms | Settle: ${item.timings.settleMs}ms`}
                  >
                    {(item.timings.totalMs / 1000).toFixed(1)}s (LLM {(item.timings.llmMs / 1000).toFixed(1)}s)
                  </span>
                )}
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
                    type="button"
                    onClick={() => toggleThought(item.id)}
                    className="flex items-center gap-1 text-[11px] text-indigo-300 font-medium hover:text-indigo-200 transition shrink-0 cursor-pointer"
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
    </div>
  );
};
