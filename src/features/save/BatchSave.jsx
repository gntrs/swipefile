import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, CircleNotch, WarningCircle, X } from '@phosphor-icons/react';

const LABEL = { waiting: 'waiting', saving: 'saving', saved: 'saved', failed: 'failed' };

// The files of a multi file save, one row each, with where each one is:
// waiting, saving, saved (link to the ad) or failed (the reason and Retry).
export default function BatchSave({ items, status = {}, onRemove, onRetry, running = false }) {
  return (
    <ul className="grid gap-2" aria-live="polite">
      {items.map((item) => {
        const s = status[item.key] || { state: 'waiting' };
        const video = String(item.file.type || '').startsWith('video/');
        return (
          <li key={item.key} className="flex items-center gap-3 bg-canvas rounded-xl p-2 pr-1 min-w-0">
            <span className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-card flex items-center justify-center">
              {video ? (
                <video src={item.url} muted playsInline className="w-full h-full object-cover" />
              ) : (
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              )}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] text-ink truncate">{item.file.name || 'Pasted image'}</span>
              <span className={`flex items-center gap-1.5 font-mono text-[12px] ${s.state === 'failed' ? 'text-red-600' : s.state === 'saved' ? 'text-emerald-600' : 'text-ink-soft'}`}>
                {s.state === 'saving' && <CircleNotch size={12} weight="bold" className="animate-spin" />}
                {s.state === 'saved' && <CheckCircle size={12} weight="fill" />}
                {s.state === 'failed' && <WarningCircle size={12} weight="fill" />}
                {LABEL[s.state]}
              </span>
              {s.state === 'failed' && s.message && <span className="block text-[14px] text-ink-soft break-words">{s.message}</span>}
            </span>
            {s.state === 'saved' && s.adId && (
              <Link to={`/ad/${s.adId}`} className="press inline-flex items-center min-h-[44px] px-3 rounded-xl text-[14px] font-semibold text-ink hover:bg-white/[0.06]">
                Open
              </Link>
            )}
            {s.state === 'failed' && (
              <button type="button" onClick={() => onRetry?.(item)} disabled={running} className="press inline-flex items-center min-h-[44px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[14px] font-semibold disabled:opacity-40">
                Retry
              </button>
            )}
            {s.state === 'waiting' && !running && (
              <button
                type="button"
                onClick={() => onRemove?.(item)}
                aria-label={`Remove ${item.file.name || 'file'}`}
                className="press w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center text-ink-soft hover:text-ink"
              >
                <X size={16} weight="bold" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
