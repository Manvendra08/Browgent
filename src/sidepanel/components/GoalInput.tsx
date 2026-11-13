import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Square,
  Sparkles,
  X,
  MessageSquare,
  Bot,
  Cpu,
  Plus,
  Camera,
  Mic,
  MicOff,
  AlertCircle,
} from 'lucide-react';
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
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const baseGoalRef = useRef<string>('');

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

  // Stop voice recognition when agent starts running
  useEffect(() => {
    if (isRunning && isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    }
  }, [isRunning, isListening]);

  const openMicPermissionPage = () => {
    const url =
      typeof chrome !== 'undefined' && chrome.runtime?.getURL
        ? chrome.runtime.getURL('src/sidepanel/mic-permission.html')
        : '/src/sidepanel/mic-permission.html';

    if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function') {
      chrome.tabs.create({ url });
    } else if (typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank');
    }
  };

  const startRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError('Speech recognition is not supported in this browser version.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      baseGoalRef.current = goal.trim();

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceError(null);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            finalTranscript += res[0].transcript;
          } else {
            interimTranscript += res[0].transcript;
          }
        }

        const speechChunk = (finalTranscript || interimTranscript).trim();
        if (speechChunk) {
          const base = baseGoalRef.current;
          setGoal(base ? `${base} ${speechChunk}` : speechChunk);
        }

        if (finalTranscript) {
          const base = baseGoalRef.current;
          baseGoalRef.current = base ? `${base} ${finalTranscript.trim()}` : finalTranscript.trim();
        }
      };

      recognition.onerror = (event: any) => {
        const errType = event?.error;
        console.warn('[Browgent Voice Input Error]', errType);
        setIsListening(false);

        if (errType === 'not-allowed' || errType === 'service-not-allowed') {
          setVoiceError('Microphone permission required. Click "Enable Mic" to grant permission.');
        } else if (errType === 'no-speech') {
          // No speech detected, quietly stop
        } else if (errType === 'network') {
          setVoiceError('Speech recognition requires an internet connection (Google Speech API).');
        } else if (errType === 'audio-capture') {
          setVoiceError('No microphone detected. Please connect an audio input device.');
        } else {
          setVoiceError(`Voice input error: ${errType || 'Unknown'}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: unknown) {
      console.warn('[Browgent Voice Start Exception]', err);
      setIsListening(false);
      setVoiceError('Failed to initialize speech recognition. Please check your browser settings.');
    }
  };

  const toggleVoiceInput = async () => {
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

    setVoiceError(null);

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError('Speech recognition is not supported in this browser version.');
      return;
    }

    // Try pre-requesting microphone permission via getUserMedia
    if (
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (err: unknown) {
        const errName = (err as { name?: string })?.name;
        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errName === 'PermissionDismissedError'
        ) {
          setVoiceError('Microphone permission required. Click "Enable Mic" to grant permission.');
          openMicPermissionPage();
          return;
        }
      }
    }

    startRecognition();
  };

  // Listen for background broadcast when user grants mic permission on mic-permission.html
  useEffect(() => {
    if (
      typeof chrome === 'undefined' ||
      !chrome.runtime ||
      !chrome.runtime.onMessage ||
      typeof chrome.runtime.onMessage.addListener !== 'function'
    ) {
      return;
    }

    const handleMessage = (msg: { type?: string }) => {
      if (msg?.type === 'MIC_PERMISSION_GRANTED') {
        setVoiceError(null);
        startRecognition();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      if (typeof chrome.runtime?.onMessage?.removeListener === 'function') {
        chrome.runtime.onMessage.removeListener(handleMessage);
      }
    };
  }, [goal]);

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

  const placeholder = isListening
    ? '🎙️ Listening... Speak into your microphone now (click mic to stop)'
    : mode === 'ask'
    ? 'Ask a question about this page... (Enter to send, Shift+Enter for newline)'
    : 'Enter your automation goal... (e.g. Find top 3 products on this page and summarize prices)';

  return (
    <div className="p-2.5 bg-slate-100/90 dark:bg-slate-950/90 border-t border-slate-200 dark:border-slate-800/80 flex flex-col gap-1.5 relative backdrop-blur-md">
      {/* Subtle Google Multi-color Hairline Accent */}
      <div className="h-[1.5px] -mt-2.5 -mx-2.5 mb-1 bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853] opacity-60" />

      {/* Voice Error / Permission Alert Banner */}
      {voiceError && (
        <div
          data-testid="voice-error-banner"
          className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800/80 rounded-lg text-[11px] text-rose-800 dark:text-rose-200 shadow-xs animate-fade-in"
        >
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="truncate">{voiceError}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {voiceError.includes('permission') && (
              <button
                type="button"
                onClick={openMicPermissionPage}
                className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-medium transition cursor-pointer shadow-xs"
              >
                Enable Mic
              </button>
            )}
            <button
              type="button"
              onClick={() => setVoiceError(null)}
              className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-200 p-0.5 rounded transition cursor-pointer"
              aria-label="Dismiss voice error"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Optional Embedded Tab Context Bar */}
      {tabComponent}

      {/* Optional Embedded File Attachments */}
      {filesComponent}

      {/* Main Unified Composer Card */}
      <div
        className={`bg-white/95 dark:bg-slate-900/90 border rounded-xl p-2.5 flex flex-col gap-2 shadow-xs dark:shadow-lg transition ${
          isListening
            ? 'border-rose-500/80 ring-1 ring-rose-500/30'
            : 'border-slate-300 dark:border-slate-800/90 focus-within:border-blue-500/80 focus-within:ring-2 focus-within:ring-blue-500/20'
        }`}
      >
        {/* Top Segmented Mode Bar */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-950/80 p-0.5 rounded-lg border border-slate-300 dark:border-slate-800/80 text-xs shadow-xs">
            <button
              type="button"
              onClick={() => setMode('ask')}
              aria-pressed={mode === 'ask'}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                mode === 'ask'
                  ? 'bg-[#137333] dark:bg-[#34A853] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Ask</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('agent')}
              aria-pressed={mode === 'agent'}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                mode === 'agent'
                  ? 'bg-[#1a73e8] dark:bg-[#4285F4] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Bot className="w-3 h-3" />
              <span>Agent</span>
            </button>
          </div>

          {isListening ? (
            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 dark:bg-rose-500" />
              Listening...
            </span>
          ) : (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1">
              <kbd className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-600 dark:text-slate-400 text-[9px] border border-slate-300 dark:border-slate-700/60 font-medium">
                Enter
              </kbd>{' '}
              to send
            </span>
          )}
        </div>

        {/* Textarea Area */}
        <div className="relative">
          <textarea
            className={`w-full bg-transparent text-xs p-1 pr-12 focus:outline-none resize-none h-18 transition font-sans ${
              isListening
                ? 'text-rose-900 dark:text-rose-100 placeholder-rose-600/70 dark:placeholder-rose-400/70'
                : 'text-slate-900 dark:text-slate-100 placeholder-slate-500'
            }`}
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
              className="absolute right-6 top-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <Sparkles className="w-3.5 h-3.5 text-[#1a73e8]/70 dark:text-[#4285F4]/60 absolute right-1 top-1 pointer-events-none" />
        </div>

        {/* Bottom Shelf Toolbar */}
        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 dark:border-slate-800/60 gap-1.5">
          <div className="flex items-center gap-1 min-w-0">
            {/* '+' button to attach files/images */}
            {onAttachFile && (
              <button
                type="button"
                onClick={onAttachFile}
                disabled={isRunning}
                title="Attach files or images"
                aria-label="Attach files or images"
                className="p-1 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/60 transition cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="p-1 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/60 transition cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
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
                  ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-500/40 animate-pulse'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-300 dark:border-slate-700/60'
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
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-300 dark:border-slate-700/60 text-[10px] text-slate-700 dark:text-slate-300 font-mono transition cursor-pointer truncate max-w-[130px]"
              >
                <Cpu className="w-2.5 h-2.5 text-[#1a73e8] dark:text-[#4285F4] shrink-0" />
                <span className="truncate">{modelName}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono hidden sm:inline">
              Shift+Enter for newline
            </span>

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
