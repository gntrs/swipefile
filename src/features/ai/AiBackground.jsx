import { useEffect } from 'react';
import { aiStatus, classifyInBackground } from '@/lib/ai';

// Mounted once in Layout. Renders nothing. After any save (the sf:ads-saved
// event) it tags the new ads' angles in the background, within the caps the
// AI client enforces. The status is only read when a save happens, so a page
// load alone never calls the ai function.
export default function AiBackground() {
  useEffect(() => {
    const onSaved = async (event) => {
      const ids = event?.detail?.ids;
      if (!Array.isArray(ids) || !ids.length) return;
      try {
        await aiStatus();
        classifyInBackground(ids);
      } catch (err) {
        console.debug('[ai] background tagging skipped:', err);
      }
    };
    window.addEventListener('sf:ads-saved', onSaved);
    return () => window.removeEventListener('sf:ads-saved', onSaved);
  }, []);
  return null;
}
