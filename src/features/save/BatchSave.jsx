import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, CircleNotch, WarningCircle, X } from '@phosphor-icons/react';
import { Button, IconButton } from '@/components/ui';

const LABEL = { waiting: 'Waiting', saving: 'Saving', saved: 'Saved', failed: 'Failed' };

// The files of a multi file save, one row each, with where each one is:
// waiting, saving, saved (link to the ad) or failed (the reason and Retry).
export default function BatchSave({ items, status = {}, onRemove, onRetry, running = false }) {
  return (
    <ul className="divide-y divide-line" aria-live="polite">
      {items.map((item) => {
        const s = status[item.key] || { state: 'waiting' };
        const video = String(item.file.type || '').startsWith('video/');
        return (
          <li key={item.key} className="flex items-center gap-3 py-2 min-w-0">
            <span className="w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-canvas flex items-center justify-center">
              {video ? (
                <video src={item.url} muted playsInline className="w-full h-full object-cover" />
              ) : (
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              )}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-ui text-ink truncate">{item.file.name || 'Pasted image'}</span>
              <span className={`flex items-center gap-1.5 text-small ${s.state === 'failed' ? 'text-red-300' : s.state === 'saved' ? 'text-emerald-300' : 'text-ink-soft'}`}>
                {s.state === 'saving' && <CircleNotch size={12} weight="bold" className="animate-spin" />}
                {s.state === 'saved' && <CheckCircle size={12} weight="fill" />}
                {s.state === 'failed' && <WarningCircle size={12} weight="fill" />}
                {LABEL[s.state]}
              </span>
              {s.state === 'failed' && s.message && <span className="block text-small text-ink-soft break-words">{s.message}</span>}
            </span>
            {s.state === 'saved' && s.adId && (
              <Button variant="ghost" to={`/ad/${s.adId}`}>
                Open
              </Button>
            )}
            {s.state === 'failed' && (
              <Button onClick={() => onRetry?.(item)} disabled={running}>
                Retry
              </Button>
            )}
            {s.state === 'waiting' && !running && (
              <IconButton label={`Remove ${item.file.name || 'file'}`} icon={X} onClick={() => onRemove?.(item)} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
