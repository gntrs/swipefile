import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Media access for a PRIVATE `ad-media` bucket. Files are never publicly
// reachable; a signed URL is minted per path for the logged-in user (storage
// RLS: authenticated only) and cached for the session. Anyone without a team
// login gets nothing.
const TTL_SECONDS = 60 * 60; // 1h - longer than any browsing session needs
const cache = new Map();

export function useMediaUrl(path) {
  const [url, setUrl] = useState(() => (path && cache.get(path)) || null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    if (cache.has(path)) {
      setUrl(cache.get(path));
      return;
    }
    let alive = true;
    supabase.storage
      .from('ad-media')
      .createSignedUrl(path, TTL_SECONDS)
      .then(({ data }) => {
        if (!alive) return;
        const signed = data?.signedUrl || null;
        if (signed) cache.set(path, signed);
        setUrl(signed);
      })
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [path]);

  return url;
}
