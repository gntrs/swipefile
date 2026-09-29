import React from 'react';
import DemoBanner from '@/components/DemoBanner';

// Where a captured ad lands, in its own tab and outside the app shell, so it
// is its own scroller. A placeholder until capture is built.
export default function CapturePage() {
  return (
    <div data-page="capture" className="h-full overflow-y-auto overscroll-contain bg-canvas text-ink">
      <DemoBanner />
      <div className="max-w-[720px] mx-auto px-5 sm:px-8 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        <h1 className="text-[26px] font-semibold tracking-tight">Capture an ad</h1>
        <p className="text-[16px] text-ink-soft leading-relaxed mt-2">Not part of this build yet.</p>
      </div>
    </div>
  );
}
