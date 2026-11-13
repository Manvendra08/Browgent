import React, { useEffect, useState } from 'react';
import {
  Globe,
  Crosshair,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Square,
  X,
  Layers,
} from 'lucide-react';
import { isRestrictedUrl } from '../../background/restricted';
import { TabAgentMission } from '../../background/types';

export interface ActiveTabInfo {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  windowId?: number;
}

interface ActiveTabBarProps {
  tab: ActiveTabInfo | null;
  isAgentTarget?: boolean;
  missions?: TabAgentMission[];
  currentTabId?: number;
  onSelectTab?: (tabId: number) => void;
  onDismissMission?: (tabId: number) => void;
}

function domainOf(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export const ActiveTabBar: React.FC<ActiveTabBarProps> = ({
  tab,
  isAgentTarget = false,
  missions = [],
  currentTabId,
  onSelectTab,
  onDismissMission,
}) => {
  const [favFailed, setFavFailed] = useState(false);
  const favIconUrl = tab?.favIconUrl;
  const secureFav = favIconUrl && /^https?:/i.test(favIconUrl) ? favIconUrl : null;

  useEffect(() => {
    setFavFailed(false);
  }, [secureFav]);

  const restricted = isRestrictedUrl(tab?.url);
  const domain = domainOf(tab?.url);
  const title = tab?.title || tab?.url || 'Untitled page';

  return (
    <div className="flex flex-col w-full">
      {/* Tab Mission Control Bar: displayed when background missions exist */}
      {missions && missions.length > 0 && (
        <div
          data-testid="mission-control-bar"
          className="flex items-center gap-1.5 px-2.5 py-1 overflow-x-auto bg-slate-950/90 border-t border-slate-800/80 text-[10px] scrollbar-thin"
        >
          <div className="flex items-center gap-1 text-[9px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            <Layers className="w-2.5 h-2.5 text-blue-400" />
            <span>Missions</span>
          </div>

          {missions.map((m) => {
            const isCurrent = m.tabId === currentTabId;
            const tabDomain = domainOf(m.url);
            const pillTitle = m.title || tabDomain || `Tab ${m.tabId}`;

            return (
              <div
                key={m.tabId}
                role="button"
                tabIndex={0}
                onClick={() => onSelectTab?.(m.tabId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelectTab?.(m.tabId);
                  }
                }}
                className={`group flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] shrink-0 transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-blue-950/60 border-blue-500/80 text-blue-200 shadow-xs ring-1 ring-blue-500/30'
                    : 'bg-slate-900/80 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                }`}
                title={`[${m.status.toUpperCase()}] ${pillTitle} - Goal: ${m.goal}`}
              >
                {/* Status Indicator Icon */}
                {m.status === 'running' && (
                  <Loader2 className="w-2.5 h-2.5 text-blue-400 animate-spin shrink-0" />
                )}
                {m.status === 'waiting_approval' && (
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-400 animate-pulse shrink-0" />
                )}
                {m.status === 'completed' && (
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                )}
                {m.status === 'failed' && (
                  <XCircle className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                )}
                {m.status === 'stopped' && (
                  <Square className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                )}

                {/* Status label / step counter */}
                {m.status === 'running' && (
                  <span className="font-semibold text-blue-300 text-[9px] shrink-0">
                    {m.step}/{m.maxSteps}
                  </span>
                )}
                {m.status === 'waiting_approval' && (
                  <span className="font-semibold text-amber-300 text-[9px] shrink-0">
                    Approval
                  </span>
                )}

                {/* Tab title / domain */}
                <span className="max-w-[110px] truncate text-slate-200">{pillTitle}</span>

                {/* Dismiss button for non-running missions */}
                {m.status !== 'running' && onDismissMission && (
                  <button
                    type="button"
                    aria-label={`Dismiss mission for tab ${m.tabId}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismissMission(m.tabId);
                    }}
                    className="ml-0.5 text-slate-500 hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Active Tab Row */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1 border-t text-[10px] min-h-[26px] transition-colors ${
          isAgentTarget
            ? 'bg-blue-950/30 border-blue-500/40'
            : 'bg-slate-950/40 border-slate-800/60'
        }`}
        title={
          restricted
            ? `${title} — not automatable (Chrome internal page)`
            : `${title}${domain ? ` — ${domain}` : ''}`
        }
      >
        {isAgentTarget ? (
          <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4285F4] opacity-75" />
            <Crosshair className="relative w-3 h-3 text-[#4285F4]" />
          </span>
        ) : restricted ? (
          <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />
        ) : secureFav && !favFailed ? (
          <img
            src={secureFav}
            alt=""
            className="w-3 h-3 rounded-sm shrink-0"
            onError={() => setFavFailed(true)}
          />
        ) : (
          <Globe className="w-3 h-3 text-slate-400 shrink-0" />
        )}

        <span
          className={`truncate flex-1 ${
            restricted && !isAgentTarget ? 'text-amber-400/90' : 'text-slate-300'
          }`}
        >
          {title}
        </span>

        {isAgentTarget && (
          <span className="shrink-0 px-1 py-px rounded bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[9px] font-medium uppercase tracking-wide">
            Target
          </span>
        )}

        {domain && (
          <span className="shrink-0 max-w-[100px] truncate text-slate-400 font-mono">
            {domain}
          </span>
        )}
      </div>
    </div>
  );
};
