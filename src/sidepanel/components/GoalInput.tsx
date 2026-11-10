import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Sparkles, X, MessageSquare, Bot, Cpu, Plus, Camera, Mic, MicOff } from 'lucide-react';
import { TurnMode } from '../threads';

interface GoalInputProps {
  goal: string;
  setGoal: (goal: string) => void;
  mode: TurnMode;
  setMode: (mode: TurnMode) => void;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  modelName?: string;
  onOpenSettings?: () => void;
  onAttachFile?: () => void;
  onCaptureScreenshot?: () => void;
  tabComponent?: React.ReactNode;
  filesComponent?: React.ReactNode;
}

export const GoalInput: React.FC<GoalInputProps> = ({
  goal,
  setGoal,
  mode,
  setMode,
  isRunning,
  onRun,
  onStop,
  modelName,
  onOpenSettings,
  onAttachFile,
  onCaptureScreenshot,
  tabComponent,
  filesComponent,
}) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    if (isRunning) return;

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser version.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setGoal(goal ? `${goal.trim()} ${transcript.trim()}` : transcript.trim());
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        return;
      }
      if (!isRunning && goal.trim()) {
        e.preventDefault();
        onRun();
      }
    }
  };

  const placeholder =
    mode === 'ask'
      ? 'Ask a question about this page... (Enter to send, Shift+Enter for newline)'
      : 'Enter your automation goal... (e.g. Find top 3 products on this page and summarize prices)';

  return (
    <div className="p-2.5 bg-slate-950/90 border-t border-slate-800/80 flex flex-col gap-1.5 relative">
      {/* Subtle Google Multi-color Hairline Accent */}
      <div className="h-[1.5px] -mt-2.5 -mx-2.5 mb-1 bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853] opacity-60" />

      {/* Optional Embedded Tab Context Bar */}
      {tabComponent}

      {/* Optional Embedded File Attachments */}
      {filesComponent}

      {/* Main Unified Composer Card */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-2.5 flex flex-col gap-2 shadow-lg focus-within:border-blue-500/60 focus-within:ring-1 focus-within:ring-blue-500/20 transition">
        {/* Top Segmented Mode Bar */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-slate-800/80 text-xs">
            <button
              type="button"
              onClick={() => setMode('ask')}
              aria-pressed={mode === 'ask'}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                mode === 'ask'
                  ? 'bg-[#34A853] text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Ask</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('agent')}
              aria-pressed={mode === 'agent'}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                mode === 'agent'
                  ? 'bg-[#4285F4] text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bot className="w-3 h-3" />
              <span>Agent</span>
            </button>
          </div>

          <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
            <kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-400 text-[9px] border border-slate-700/60">Enter</kbd> to send
          </span>
        </div>

        {/* Textarea Area */}
        <div className="relative">
          <textarea
            className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-xs p-1 pr-12 focus:outline-none resize-none h-18 transition font-sans"
            placeholder={placeholder}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {goal && !isRunning && (
            <button
              type="button"
              onClick={() => setGoal('')}
              aria-label="Clear goal input"
              title="Clear input"
              className="absolute right-6 top-1 text-slate-500 hover:text-slate-300 p-1 rounded transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <Sparkles className="w-3.5 h-3.5 text-[#4285F4]/60 absolute right-1 top-1 pointer-events-none" />
        </div>

        {/* Bottom Shelf Toolbar */}
        <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/60 gap-1.5">
          <div className="flex items-center gap-1 min-w-0">
            {/* '+' button to attach files/images */}
            {onAttachFile && (
              <button
                type="button"
                onClick={onAttachFile}
                disabled={isRunning}
                title="Attach files or images"
                aria-label="Attach files or images"
                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60 transition cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Screen capture button */}
            {onCaptureScreenshot && (
              <button
                type="button"
                onClick={onCaptureScreenshot}
                disabled={isRunning}
                title="Attach screenshot of active page"
                aria-label="Attach screenshot of active page"
                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60 transition cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Voice input button */}
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={isRunning}
              title={isListening ? 'Listening... click to stop' : 'Voice input (Speech to text)'}
              aria-label={isListening ? 'Stop listening' : 'Voice input'}
              className={`p-1 rounded-md transition cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed border ${
                isListening
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 border-slate-700/60'
              }`}
            >
              {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>

            {/* Model Pill */}
            {modelName && (
              <button
                type="button"
                onClick={onOpenSettings}
                title={`Configured Model: ${modelName} (Click to open settings)`}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-[10px] text-slate-300 font-mono transition cursor-pointer truncate max-w-[130px]"
              >
                <Cpu className="w-2.5 h-2.5 text-[#4285F4] shrink-0" />
                <span className="truncate">{modelName}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] text-slate-500 font-mono hidden sm:inline">Shift+Enter for newline</span>

            {isRunning ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1 bg-[#EA4335] hover:bg-[#d93025] text-white rounded-md text-xs font-medium transition shadow-xs animate-pulse cursor-pointer"
                title="Stop Agent"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={onRun}
                disabled={!goal.trim()}
                className="flex items-center gap-1.5 px-3.5 py-1 bg-gradient-to-r from-[#4285F4] to-[#2563eb] hover:from-[#3b78e7] hover:to-[#1d4ed8] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium transition shadow-sm cursor-pointer"
                title={mode === 'ask' ? 'Ask Browgent' : 'Run Agent'}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {mode === 'ask' ? 'Ask' : 'Run Agent'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
