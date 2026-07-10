// Tiny dependency-free confetti burst. One full-viewport canvas, ~1.8s of
// physics, removes itself. Fired by RevenueCard when a new sale lands.
const COLORS = ['#FFFFFF', '#E5E5E5', '#B4B4B4', '#8B8B8B', '#D4D4D4', '#6B6B6B'];

export function confettiBurst({ count = 140 } = {}) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 9999,
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = window.innerWidth;
  const H = window.innerHeight;
  // Two side cannons angled at the center, like a real celebration popper.
  const parts = Array.from({ length: count }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const angle = (fromLeft ? -60 : -120) + (Math.random() - 0.5) * 50; // degrees, up-ish
    const speed = 9 + Math.random() * 9;
    const rad = (angle * Math.PI) / 180;
    return {
      x: fromLeft ? -10 : W + 10,
      y: H * (0.45 + Math.random() * 0.25),
      vx: Math.cos(rad) * speed,
      vy: Math.sin(rad) * speed,
      w: 6 + Math.random() * 5,
      h: 8 + Math.random() * 6,
      color: COLORS[i % COLORS.length],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
    };
  });

  const started = performance.now();
  const DURATION = 1800;

  function frame(now) {
    const t = now - started;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.25; // gravity
      p.vx *= 0.992; // drag
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = Math.max(0, 1 - t / DURATION);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
