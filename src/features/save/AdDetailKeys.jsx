import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DETAIL_KEYS, DETAIL_HELP } from '@/lib/library/keys';
import { neighbours, readListContext } from '@/lib/library/listContext';
import KeyHelp from '@/features/save/KeyHelp';
import useLibraryKeys from '@/features/save/useLibraryKeys';

// Keyboard shortcuts on the ad page. W and L set the verdict, S stars, J and K
// walk the library page this ad was opened from, Escape goes back to it, #
// deletes. The ad page passes the actions; this only listens and shows one
// hint line from sm up.
export default function AdDetailKeys({ ad, onVerdict, onStar, onDelete }) {
  const navigate = useNavigate();
  const [help, setHelp] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(() => setNote(''), 2500);
    return () => clearTimeout(t);
  }, [note]);

  useLibraryKeys(
    (action) => {
      if (action === 'help') {
        setHelp(true);
        return undefined;
      }
      if (action === 'back') {
        navigate(`/ads${readListContext()?.search || ''}`);
        return undefined;
      }
      if (!ad) return false;
      if (action === 'next' || action === 'prev') {
        const n = neighbours(ad.id);
        const target = action === 'next' ? n.next : n.prev;
        if (target) navigate(`/ad/${target}`);
        else setNote('End of this page.');
      } else if (action === 'winner' || action === 'loser') onVerdict?.(action);
      else if (action === 'star') onStar?.();
      else if (action === 'delete') onDelete?.();
      return undefined;
    },
    { map: DETAIL_KEYS }
  );

  return (
    <>
      <p className="hidden sm:block font-mono text-[12px] text-ink-soft mt-3" aria-live="polite">
        {note || 'J K next and previous. W L verdict. S star. Esc back.'}
      </p>
      <KeyHelp open={help} onClose={() => setHelp(false)} keys={DETAIL_HELP} title="Keys on this ad" />
    </>
  );
}
