/** @type {import('tailwindcss').Config} */
// Black-and-white dark skin: a monochrome, high-contrast surface inspired by
// the Superpower reference (big display numerals, near-black canvas, dark
// rounded cards, hairline borders, a single white accent). The whole app is
// driven by a handful of tokens, so remapping them here flips every screen.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // The single accent is white (winners, CTAs, active states). On white
        // surfaces the foreground goes black (see text-black swaps). `soft` is
        // a near-black tint used behind the accent on dark cards.
        coral: { DEFAULT: '#FFFFFF', dark: '#D4D4D4', soft: '#1C1C1C' },
        cream: '#0A0A0A', // page canvas + in-card track fills (near-black)
        ink: { DEFAULT: '#F4F4F5', soft: '#8B8B8B' }, // light body / muted secondary
        mint: { DEFAULT: '#22C978', dark: '#63EFA6' }, // good/proven: vivid green
        line: '#262626', // dark hairline borders
        card: '#161616', // elevated card surface (replaces bg-white)

        // Semantic ramps for a dark canvas. Only three meanings carry colour,
        // and they are VIBRANT so they pop against the black - but still just
        // three coordinated hues, not a rainbow: green = good/winner, red =
        // bad/loser, gold = star/warn. Low shades (50/100) are dark tinted
        // chip fills; high shades (600-900) are the bright text tones on them.
        // Deep-merges over Tailwind defaults, so every existing utility
        // repaints without touching files.
        emerald: {
          50: '#0E2419', 100: '#123024', 300: '#5FF0A6', 400: '#3FE48D',
          500: '#22C978', 600: '#4DEB97', 700: '#63EFA6', 900: '#9CF7C6',
        },
        red: {
          50: '#2A1113', 100: '#361517', 300: '#FF8E8A',
          500: '#FB4D52', 600: '#FF6E70',
        },
        rose: { 50: '#2A1116', 500: '#FB4E68', 600: '#FF6E86' },
        amber: {
          50: '#2A2109', 100: '#342A0C', 300: '#FFD866', 400: '#FFC53D',
          500: '#F5B420', 600: '#FFCF54', 700: '#FFD877',
        },
        // Decorative hues stay cool grayscale so only the three meaningful
        // accents pop; the rest of the UI reads black and white.
        blue: { 50: '#191A1B', 500: '#3C3F42', 600: '#AFB4B9' },
        violet: { 50: '#1A191B', 600: '#B2AEB8' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Numbers wear Geist Mono: tabular, technical, the digits line up and
        // pop out of the surrounding text.
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // Dark-surface shadows: a 1px top highlight (the "lit edge" that makes
        // a dark card look crafted rather than flat) plus deeper drops so cards
        // separate from the canvas.
        card: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.6)',
        cardhover: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 4px rgba(0,0,0,0.5), 0 12px 30px rgba(0,0,0,0.7)',
        cta: '0 2px 12px rgba(255,255,255,0.14)',
      },
      // Tighter than before (was 18/24): rounded, but not bubbly. Overrides
      // Tailwind's 2xl/3xl too so every card/button de-puffs at once.
      borderRadius: {
        xl2: '12px',
        xl3: '16px',
        '2xl': '12px',
        '3xl': '16px',
      },
      keyframes: {
        // Cards ease up + fade in on mount - the "polished app" feel.
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Loading skeletons: a soft light sweep across the placeholder.
        shimmer: {
          '0%': { backgroundPosition: '-160% 0' },
          '100%': { backgroundPosition: '160% 0' },
        },
      },
      animation: {
        rise: 'rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
