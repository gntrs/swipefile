import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { DotsThreeOutline, X } from '@phosphor-icons/react';
import { mobileTabs, moreItems } from '@/lib/nav';

// Four primary tabs spread evenly across the bar, plus More for the rest.
// A plain, tappable bottom nav, no hold to fan gesture. Everything is one tap.
// Both lists come from src/lib/nav.js, filtered by the modules that are on.
const TABS = mobileTabs();

// Secondary destinations live in the More sheet.
const MORE = moreItems();

const tabCls = ({ isActive }) =>
  `press flex-1 flex flex-col items-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${
    isActive ? 'text-ink' : 'text-ink-soft'
  }`;

export default function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const loc = useLocation();
  const { pathname } = loc;
  const isMoreItemActive = (m) =>
    m.match ? m.match(loc) : pathname.startsWith(m.to) && m.to !== '/';
  const moreActive = MORE.some(isMoreItemActive);

  return (
    <>
      {/* More sheet */}
      {moreOpen && (
        <>
          <div
            aria-hidden="true"
            className="sm:hidden fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[55]"
            onClick={() => setMoreOpen(false)}
          />
          <div data-sheet="more" className="sm:hidden fixed inset-x-0 bottom-0 z-[56] bg-card border-t border-line rounded-t-3xl px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-sheet-up">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="press w-11 h-11 -mr-1.5 rounded-full border border-line flex items-center justify-center text-ink-soft"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {MORE.map((item) => {
                const { to, label, icon: Icon } = item;
                const active = isMoreItemActive(item);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={`press flex items-center gap-3 min-h-[48px] px-4 py-3 rounded-2xl border text-[14px] font-medium transition-colors ${
                      active ? 'bg-white/[0.06] border-line text-ink' : 'border-line text-ink-soft'
                    }`}
                  >
                    <Icon size={20} weight={active ? 'fill' : 'bold'} />
                    {label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </>
      )}

      <nav className="glass sm:hidden fixed bottom-0 inset-x-0 z-[50] bg-card/80 backdrop-blur-xl backdrop-saturate-150 border-t border-line flex items-stretch px-1 pt-1 pb-[calc(0.4rem+env(safe-area-inset-bottom))]">
        {TABS.map(({ to, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={tabCls}>
            {({ isActive }) => (
              <>
                <Icon size={23} weight={isActive ? 'fill' : 'bold'} />
                {short}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="More sections"
          aria-expanded={moreOpen}
          className={`press flex-1 flex flex-col items-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${
            moreActive || moreOpen ? 'text-ink' : 'text-ink-soft'
          }`}
        >
          <DotsThreeOutline size={23} weight={moreActive || moreOpen ? 'fill' : 'bold'} />
          More
        </button>
      </nav>
    </>
  );
}
