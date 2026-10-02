/** @type {import('tailwindcss').Config} */
// Black and white, dark only. A near black canvas, slightly lighter cards that
// need no border to stand apart, light ink, one white accent, and small radii.
// Mono carries labels and numbers. Colour only ever means something: green is
// good, red is bad, amber is a star or a warning. The whole app is driven by
// these tokens, so changing them here changes every screen.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // The single accent is white: primary buttons, active states, focus
        // rings, progress fills. On a white surface the foreground goes black
        // (see the text-black swaps). `dim` is the softer accent for links and
        // secondary emphasis; `wash` is a near black tint behind the accent on
        // dark cards (active nav rows, selected chips).
        accent: { DEFAULT: '#FFFFFF', dim: '#D4D4D4', wash: '#1C1C1C' },
        canvas: '#0A0A0A', // page background and in-card track fills (near black)
        ink: { DEFAULT: '#F4F4F5', soft: '#8B8B8B' }, // light body / muted secondary
        mint: { DEFAULT: '#22C978', dark: '#63EFA6' }, // good/proven: vivid green
        line: '#262626', // hairlines: inputs, dividers, never around every card
        // Cards sit on the canvas without a border. `hi` is the same card under
        // the pointer or holding a pressed control.
        card: { DEFAULT: '#161616', hi: '#1C1C1C' },

        // Semantic ramps for a dark canvas. Only three meanings carry colour:
        // green is good or winner, red is bad or loser, amber is a star or a
        // warning. Low shades (50/100) are dark tinted fills; high shades are
        // the bright text tones on them. They merge over Tailwind's defaults.
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
        // There is no blue and no violet: both ramps are grays, so an old
        // utility that asks for them still reads black and white.
        blue: { 50: '#191A1B', 500: '#3C3F42', 600: '#AFB4B9' },
        violet: { 50: '#1A191B', 600: '#B2AEB8' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Geist Mono for labels, meta, numbers and code. Numbers also take
        // tabular-nums so columns line up.
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // Barely there. A card is lit on its top edge and nothing else; the
        // hover state adds one soft drop. Buttons carry no glow.
        card: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        cardhover: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.45)',
        cta: 'none',
      },
      // Small radii: 8px on controls and chips, 10px on cards and sheets.
      // Nothing is rounder except rounded-full on avatars, dots and status
      // pills.
      borderRadius: {
        xl: '8px',
        xl2: '8px',
        xl3: '10px',
        '2xl': '8px',
        '3xl': '10px',
      },
      // One easing for everything: fast out, no overshoot.
      transitionTimingFunction: {
        swift: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        // A plain opacity fade, for the scrim behind a sheet or a modal.
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // A surface that appears on its own (a modal, the login card): opacity
        // and a small scale, nothing else.
        materialize: {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        // A bottom sheet comes in from the edge it lives on.
        sheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        // Loading skeletons: a soft light sweep across the placeholder.
        shimmer: {
          '0%': { backgroundPosition: '-160% 0' },
          '100%': { backgroundPosition: '160% 0' },
        },
      },
      animation: {
        fade: 'fade 0.18s cubic-bezier(0.32, 0.72, 0, 1) both',
        materialize: 'materialize 0.32s cubic-bezier(0.32, 0.72, 0, 1) both',
        'sheet-up': 'sheetUp 0.32s cubic-bezier(0.32, 0.72, 0, 1) both',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
