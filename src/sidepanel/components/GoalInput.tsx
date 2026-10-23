import React from 'react';
import { Play, Square, Sparkles, X } from 'lucide-react';

interface GoalInputProps {
  goal: string;
  setGoal: (goal: string) => void;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
}

export const GoalInput: React.FC<GoalInputProps> = ({
  goal,
  setGoal,
  isRunning,
  onRun,
  onStop,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isRunning && goal.trim()) {
      e.preventDefault();
      onRun();
    }
  };

  return (
    <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-col gap-2">
      <div className="relative">
        <textarea
          className="w-full bg-slate-800/90 text-slate-100 placeholder-slate-500 text-xs rounded-lg p-2.5 pr-14 border border-slate-700/80 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-none h-20 transition"
          placeholder="Enter your automation goal... (e.g. Find top 3 products on this page and summarize prices)"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
        />
        {goal && !isRunning && (
          <button
            type="button"
            onClick={() => setGoal('')}
            aria-label="Clear goal input"
            title="Clear input"
            className="absolute right-7 top-2 text-slate-500 hover:text-slate-300 p-1 rounded transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <Sparkles className="w-3.5 h-3.5 text-indigo-400 absolute right-2.5 top-2.5 pointer-events-none opacity-60" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-500">
          Press <kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-400">Ctrl+Enter</kbd> to
          run
        </span>

        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-xs font-medium transition shadow-sm animate-pulse"
              title="Stop Agent"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          ) : (
            <button
              onClick={onRun}
              disabled={!goal.trim()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-md text-xs font-medium transition shadow-sm"
              title="Run Agent"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Run Agent
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
