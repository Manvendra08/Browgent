import React, { useEffect, useState } from 'react';
import { Globe, Crosshair, ShieldAlert } from 'lucide-react';
import { isRestrictedUrl } from '../../background/restricted';

export interface ActiveTabInfo {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
}

interface ActiveTabBarProps {
  tab: ActiveTabInfo | null;
  isAgentTarget?: boolean;
}

function domainOf(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export const ActiveTabBar: React.FC<ActiveTabBarProps> = ({ tab, isAgentTarget = false }) => {
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
    <div
      className="flex items-center gap-1.5 px-3 py-1 bg-slate-950/40 border-t border-slate-800/60 text-[10px] min-h-[26px]"
      title={restricted ? `${title} — not automatable (Chrome internal page)` : `${title}${domain ? ` — ${domain}` : ''}`}
    >
      {isAgentTarget ? (
        <Crosshair className="w-3 h-3 text-indigo-400 shrink-0" />
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

      <span className={`truncate flex-1 ${restricted && !isAgentTarget ? 'text-amber-400/90' : 'text-slate-300'}`}>
        {title}
      </span>

      {isAgentTarget && (
        <span className="shrink-0 px-1 py-px rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-[9px] font-medium uppercase tracking-wide">
          Target
        </span>
      )}

      {domain && (
        <span className="shrink-0 max-w-[100px] truncate text-slate-400 font-mono">{domain}</span>
      )}
    </div>
  );
};
