/** @type {import('tailwindcss').Config} */
// Black and white, dark only. A near black canvas, slightly lighter cards that
// need no border to stand apart, light ink, one white accent, and small radii.
// Figtree for reading, JetBrains Mono only for numbers, code and one eyebrow
// per page. The whole app is driven by these tokens, so changing them here
// changes every screen.
//
// Colour only ever means something, and each meaning has one token:
//   status  good (winner, ok), bad (loser, error), warn (testing, due soon),
//           neutral (unsure, info), live (running now). A status colour is a
//           mark (a dot, an icon, a tinted fill) and always rides with a word;
//           the word itself stays in ink.
//   viz     one neutral ramp for magnitude: every bar is the same light grey on
//           a dark track, because bar length already carries the number.
// No chart needs categorical identity, so there is no categorical palette.
// The status marks were checked with the dataviz palette validator in dark
// mode against the card (#161616) and the canvas (#0A0A0A), all pairs: every
// check passes, worst colour blind pair Delta E 9.5, worst normal 17.7. The
// *-300 text tints clear 10:1 on both surfaces.
const STATUS = {
  good: '#36A980',
  warn: '#C18434',
  bad: '#C13140',
  neutral: '#8B8B8B',
  live: '#F4F4F5',
};
const STATUS_TEXT = { good: '#80E2B9', warn: '#F9BE79', bad: '#FFADAC' };
// A change between two periods. good and bad are the status text tints under a
// name that says what they are for; flat is the neutral grey, for no change and
// for a change that has no better direction (a rival running more ads).
const DELTA = { good: STATUS_TEXT.good, bad: STATUS_TEXT.bad, flat: STATUS.neutral };
// Heat cells: five steps of the neutral bar grey, ordinal only. 0 is the bare
// track (no mark), 5 is the same grey as viz.bar. Checked with the dataviz
// validator on the card and the canvas: the ramp passes the ordinal checks.
const HEAT = { 0: '#262626', 1: '#4A4A4A', 2: '#6A6A6A', 3: '#8C8C8C', 4: '#AFAFAF', 5: '#D4D4D4' };

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // A hover style applies only on a device that can hover, so a tap never
  // leaves one stuck on a phone.
  future: { hoverOnlyWhenSupported: true },
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
        line: '#262626', // hairlines: inputs, dividers, never around every card
        // Cards sit on the canvas without a border. `hi` is the same card under
        // the pointer or holding a pressed control.
        card: { DEFAULT: '#161616', hi: '#1C1C1C' },

        // The status marks and their text tints (see the note at the top).
        status: { ...STATUS, 'good-text': STATUS_TEXT.good, 'warn-text': STATUS_TEXT.warn, 'bad-text': STATUS_TEXT.bad },
        // Magnitude: a bar, its track, and the hairline grid of a plot.
        viz: { bar: '#D4D4D4', 'bar-hi': '#FFFFFF', track: '#262626', grid: '#262626' },
        // Arrow and number of a change (see Delta.jsx), and the heat ramp
        // (see HeatStrip.jsx). Both mirrored as css vars in index.css.
        delta: DELTA,
        heat: HEAT,

        // The older ramp names now point at the same status tokens, so a
        // utility that still asks for emerald, red or amber gets the checked
        // colour. 50 and 100 are dark tinted fills, 300 the text tint, 400 and
        // 500 the mark. mint is the good mark (a done tick, an on switch).
        mint: { DEFAULT: STATUS.good },
        emerald: { 50: '#042016', 100: '#02291C', 300: STATUS_TEXT.good, 400: STATUS.good, 500: STATUS.good, 900: '#042016' },
        red: { 50: '#2B1213', 100: '#361717', 300: STATUS_TEXT.bad, 400: STATUS.bad, 500: STATUS.bad },
        amber: { 50: '#261704', 100: '#311D03', 300: STATUS_TEXT.warn, 400: STATUS.warn, 500: STATUS.warn },
      },
      fontFamily: {
        // Both faces are self hosted through @fontsource (see src/main.jsx).
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        // Numbers, code and keys only. Numbers also take tabular-nums (.num)
        // so columns line up.
        mono: ['"JetBrains Mono"', 'ui-monospace', '"SF Mono"', '"Cascadia Mono"', 'Menlo', 'monospace'],
      },
      // The only type sizes a page may use. All rem, so the root size in
      // index.css (16, 17.5 from 1200px, 18.5 from 1600px) moves the whole
      // scale. text-meta is the floor: nothing renders smaller.
      fontSize: {
        meta: ['0.75rem', { lineHeight: '1rem' }],
        small: ['0.875rem', { lineHeight: '1.35rem' }],
        ui: ['0.9375rem', { lineHeight: '1.25rem' }],
        body: ['1rem', { lineHeight: '1.6' }],
        lead: ['1.125rem', { lineHeight: '1.55' }],
        title: ['1.125rem', { lineHeight: '1.35', letterSpacing: '-0.01em', fontWeight: '600' }],
        h2: ['1.375rem', { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '700' }],
        h1: ['clamp(1.75rem, 1.4rem + 0.8vw, 2rem)', { lineHeight: '1.1', letterSpacing: '-0.025em', fontWeight: '700' }],
        num: ['1rem', { lineHeight: '1.25' }],
        // The value in a key number cell (KpiGroup).
        'num-md': ['1.375rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'num-lg': ['clamp(1.75rem, 1.4rem + 0.9vw, 2.25rem)', { lineHeight: '1', letterSpacing: '-0.02em' }],
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
