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
  `press flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl text-[11px] font-medium transition-colors ${
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
            className="sm:hidden fixed inset-0 bg-black/60 z-[55] animate-fade"
            onClick={() => setMoreOpen(false)}
          />
          <div data-sheet="more" className="sm:hidden fixed inset-x-0 bottom-0 z-[56] bg-card rounded-t-3xl px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-sheet-up">
            <div className="flex items-center justify-between mb-3">
              <span className="kicker">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="press w-11 h-11 -mr-1.5 rounded-full bg-white/[0.06] flex items-center justify-center text-ink-soft hover:text-ink"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MORE.map((item) => {
                const { to, label, icon: Icon } = item;
                const active = isMoreItemActive(item);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={`press flex items-center gap-3 min-h-[52px] px-4 py-3 rounded-xl text-[15px] font-medium transition-colors ${
                      active ? 'bg-accent text-black' : 'bg-white/[0.06] text-ink'
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

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-[50] bg-canvas/95 border-t border-line flex items-stretch px-1 pt-1 pb-[calc(0.4rem+env(safe-area-inset-bottom))]">
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
          className={`press flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl text-[11px] font-medium transition-colors ${
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
