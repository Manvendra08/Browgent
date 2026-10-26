import React from 'react';
import { X, MessageSquare, Plus, Trash2, Clock, Check } from 'lucide-react';
import { Thread } from '../threads';

interface ThreadListProps {
  isOpen: boolean;
  onClose: () => void;
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onClearAll: () => void;
  onNewThread: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const ThreadList: React.FC<ThreadListProps> = ({
  isOpen,
  onClose,
  threads,
  activeThreadId,
  onSelectThread,
  onDeleteThread,
  onClearAll,
  onNewThread,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl w-full max-w-sm max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-400" />
            <h2 className="text-xs font-semibold text-slate-200">Chat History</h2>
            <span className="text-[10px] text-slate-500 font-mono">({threads.length})</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onNewThread();
                onClose();
              }}
              title="New Chat"
              aria-label="New Chat"
              className="flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-medium transition cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>New</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close history"
              aria-label="Close history"
              className="p-1 text-slate-400 hover:text-slate-200 rounded transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {threads.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-40 text-slate-400" />
              <p>No chat history yet</p>
            </div>
          ) : (
            threads.map((thread) => {
              const isActive = thread.id === activeThreadId;

              return (
                <div
                  key={thread.id}
                  onClick={() => {
                    onSelectThread(thread.id);
                    onClose();
                  }}
                  className={`group flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                    isActive
                      ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200 shadow-xs'
                      : 'bg-slate-800/50 hover:bg-slate-800 border-slate-800/80 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      {isActive && <Check className="w-3 h-3 text-indigo-400 shrink-0" />}
                      <span className="font-medium truncate text-[11px] leading-tight">
                        {thread.title || 'Untitled Chat'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                      <span>{formatRelativeTime(thread.updatedAt)}</span>
                      <span>•</span>
                      <span>
                        {thread.turns.length} {thread.turns.length === 1 ? 'turn' : 'turns'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteThread(thread.id);
                    }}
                    title="Delete chat"
                    aria-label="Delete chat"
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 rounded transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {threads.length > 0 && (
          <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear all chats</span>
            </button>
            <span className="text-[10px] text-slate-500">Saved locally</span>
          </div>
        )}
      </div>
    </div>
  );
};
