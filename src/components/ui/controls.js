// Class strings for native form controls, so every input, select and textarea
// in the app has the same edge, height and type. Pair them with Field.

const CONTROL =
  'w-full min-h-[44px] rounded-xl bg-white/[0.03] border border-line px-3.5 text-ui text-ink placeholder:text-ink-soft transition-colors disabled:opacity-50';

export const inputCls = CONTROL;
export const selectCls = `${CONTROL} pr-2 cursor-pointer`;
export const textareaCls = `${CONTROL} py-3 min-h-[7rem] leading-relaxed resize-y`;

// A selected chip or segment: a lighter surface and a faint inset ring. White
// fill is kept for the one primary action on the screen.
export const selectedCls = 'bg-white/[0.12] text-ink shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]';
