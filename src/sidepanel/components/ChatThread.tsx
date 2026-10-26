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
} from 'lucide-react';
import { Turn } from '../threads';
import { StepList } from './StepList';
import { Markdown } from './Markdown';

interface ChatThreadProps {
  turns: Turn[];
  isRunning: boolean;
  suggestions?: string[];
  onSuggestionClick?: (prompt: string) => void;
}

export const ChatThread: React.FC<ChatThreadProps> = ({
  turns,
  isRunning,
  suggestions,
  onSuggestionClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
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

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-3 space-y-4 relative"
    >
      {/* Empty State */}
      {turns.length === 0 && (
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
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-[11px] text-slate-300 bg-slate-800/60 border border-slate-700/60 hover:border-indigo-500/60 hover:text-indigo-300 transition leading-snug cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
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
            <div className="flex flex-col items-end">
              <div className="max-w-[90%] bg-indigo-600/20 border border-indigo-500/30 rounded-xl px-3 py-2 text-xs text-slate-100 shadow-sm space-y-1">
                <div className="flex items-center justify-between gap-3 text-[10px] text-indigo-300/70 border-b border-indigo-500/20 pb-1 mb-1">
                  <span className="flex items-center gap-1 font-medium">
                    <User className="w-3 h-3 text-indigo-400" />
                    You
                  </span>
                  <span className="uppercase text-[9px] font-semibold tracking-wider px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                    {turn.mode}
                  </span>
                </div>

                <p className="whitespace-pre-wrap leading-relaxed text-[11px] text-slate-200">
                  {turn.prompt}
                </p>

                {turn.tab && (turn.tab.title || turn.tab.url) && (
                  <div className="pt-1 flex items-center gap-1 text-[10px] text-indigo-300/80 truncate">
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
                      <Loader2 className="w-3 h-3 text-indigo-400 animate-spin ml-1" />
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
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
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
                  <div className="flex items-center gap-1.5 font-semibold text-indigo-300 text-[11px]">
                    <Bot className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Browgent</span>
                  </div>
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
