import React, { useRef, useState } from 'react';
import { UploadSimple } from '@phosphor-icons/react';

// Click to pick, or drop, one or more images and videos. Pasting an image
// anywhere on the Add page lands here too (the page handles that event).
export default function DropZone({ onFiles, children, compact = false }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  const take = (list) => {
    const files = [...(list || [])];
    if (files.length) onFiles(files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer?.files);
      }}
      className={`bg-card border border-dashed rounded-xl3 transition-colors ${over ? 'border-accent bg-card-hi' : 'border-ink-soft/40 hover:border-ink-soft'}`}
    >
      {children}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={`press w-full flex flex-col items-center justify-center text-center text-ink-soft min-h-[44px] rounded-xl3 ${compact ? 'py-3' : 'py-10'} px-5`}
      >
        <UploadSimple size={compact ? 20 : 28} weight="bold" className="mb-3" />
        <span className="font-medium text-[16px] text-ink">
          {compact ? 'Add more files' : 'Drop the ad image or video here, or tap to pick'}
        </span>
        {!compact && <span className="text-[14px] leading-relaxed mt-1.5">PNG, JPG, MP4... up to 50 MB each. Several files save as several ads.</span>}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
    </div>
  );
}
