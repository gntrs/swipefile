import React, { useEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';

// Optional "party mode" overlay (see src/lib/celebration.js). Mounted once in
// Layout. Listens for the 'sale-celebrate' event, then plays a meme fullscreen.
// Two shapes of meme:
//   - chroma + loops: a green-screen short, keyed to transparency on a canvas,
//     played a fixed number of times, optionally with an overlay music track.
//   - clip: a random N-second slice of a longer clip, shown as a plain video
//     with its own audio.
export default function SaleCelebration() {
  const [meme, setMeme] = useState(null);
  const overlayRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const loopsRef = useRef(0);

  useEffect(() => {
    const onFire = (e) => setMeme(e.detail.meme);
    window.addEventListener('sale-celebrate', onFire);
    return () => window.removeEventListener('sale-celebrate', onFire);
  }, []);

  useEffect(() => {
    if (!meme) return undefined;
    const video = videoRef.current;
    const audio = audioRef.current;
    const canvas = canvasRef.current; // null unless meme.chroma
    const ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;
    loopsRef.current = 0;
    let clipEnd = null; // set in clip mode once we know the duration

    const finish = () => setMeme(null); // cleanup below does the teardown

    // Per-frame green-screen key: draw the video, zero the alpha of any pixel
    // where green clearly dominates red and blue.
    const draw = () => {
      if (ctx && video.readyState >= 2 && video.videoWidth) {
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const f = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = f.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            if (g > 90 && g > r * 1.35 && g > b * 1.35) d[i + 3] = 0;
          }
          ctx.putImageData(f, 0, 0);
        } catch {
          /* blocked - skip keying this frame */
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    // Clip mode: jump to a random start once the duration is known.
    const pickClipStart = () => {
      if (clipEnd != null || !meme.clip) return;
      const dur = video.duration || 0;
      if (dur > meme.clip) {
        const startAt = Math.random() * (dur - meme.clip);
        video.currentTime = startAt;
        clipEnd = startAt + meme.clip;
      }
    };

    const onTime = () => {
      if (clipEnd != null && video.currentTime >= clipEnd) finish();
    };

    const onEnded = () => {
      if (meme.clip) {
        finish();
        return;
      }
      loopsRef.current += 1;
      if (loopsRef.current >= (meme.loops || 1)) {
        finish();
        return;
      }
      video.currentTime = 0;
      video.play().catch(() => {});
    };

    const start = async () => {
      // Play the video FIRST, before any await. Awaiting fullscreen or music
      // first burns the Test click's user-activation, which gets an unmuted
      // clip blocked -> black screen. A chroma meme is driven by a separate
      // music track so its video is muted; plain clips play unmuted.
      video.volume = 1;
      video.muted = Boolean(meme.music);
      if (meme.clip) pickClipStart();
      else video.currentTime = 0;
      try {
        await video.play();
      } catch {
        // Unmuted autoplay blocked (e.g. a real sale with no prior gesture):
        // show it muted rather than a black nothing.
        try {
          video.muted = true;
          await video.play();
        } catch {
          /* still blocked - nothing we can do without a gesture */
        }
      }
      if (meme.chroma) draw();

      // Now the frame is live; the rest can await freely.
      if (audio && meme.music) {
        try {
          audio.volume = 1;
          audio.currentTime = meme.musicStart || 0;
          await audio.play();
          video.muted = true; // music carries the sound
        } catch {
          video.muted = false; // music blocked - fall back to the video's audio
        }
      }
      try {
        await overlayRef.current?.requestFullscreen?.();
      } catch {
        /* fullscreen needs a live gesture - windowed is fine */
      }
    };

    const onKey = (e) => e.key === 'Escape' && finish();
    const onError = () => finish(); // missing/broken clip - close, don't hang

    video.addEventListener('loadedmetadata', pickClipStart);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    window.addEventListener('keydown', onKey);
    start();

    return () => {
      cancelAnimationFrame(rafRef.current);
      video.removeEventListener('loadedmetadata', pickClipStart);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      window.removeEventListener('keydown', onKey);
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      if (audio) {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [meme]);

  if (!meme) return null;

  const mediaCls = 'max-w-[94vw] max-h-[92vh] w-auto h-auto';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center cursor-pointer"
      onClick={() => setMeme(null)}
      role="dialog"
      aria-label="Sale celebration"
    >
      {/* Green-screen memes render through the keyed canvas; the video is the
          hidden frame source. Plain clips render the video directly. */}
      <video
        ref={videoRef}
        src={meme.video}
        playsInline
        preload="auto"
        className={meme.chroma ? 'hidden' : mediaCls}
      />
      {meme.chroma && <canvas ref={canvasRef} className={mediaCls} />}
      {meme.music && <audio ref={audioRef} src={meme.music} preload="auto" />}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMeme(null);
        }}
        aria-label="Close"
        className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20"
      >
        <X size={20} weight="bold" />
      </button>
    </div>
  );
}
