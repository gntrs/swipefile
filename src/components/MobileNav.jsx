import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { DotsThreeOutline, SignOut } from '@phosphor-icons/react';
import { mobileTabs, moreItems } from '@/lib/nav';
import Sheet from '@/components/ui/Sheet';
import { useAuth } from '@/contexts/AuthContext';
import { IS_DEMO } from '@/lib/db';

// The tab bar under lg: Home, Ads, Insights and Rivals spread evenly across
// the bar, plus More for the rest (Hooks and Posts live there). A plain,
// tappable bottom nav, everything is one tap. On a phone held sideways the
// bar keeps clear of the notch on either side.
// Both lists come from src/lib/nav.js, filtered by the modules that are on.
const TABS = mobileTabs();

// Secondary destinations live in the More sheet.
const MORE = moreItems();

const tabCls = (on) =>
  `press flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] text-meta font-medium transition-colors ${
    on ? 'text-ink' : 'text-ink-soft'
  }`;

export default function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const { pathname } = loc;
  const isMoreItemActive = (m) =>
    m.match ? m.match(loc) : pathname.startsWith(m.to) && m.to !== '/';
  const moreActive = MORE.some(isMoreItemActive);
  const moreOn = moreActive || moreOpen;

  return (
    <>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More" sheetId="more">
        <ul className="-mx-2 flex flex-col gap-0.5">
          {MORE.map((item) => {
            const { to, label, icon: Icon } = item;
            const active = isMoreItemActive(item);
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`press flex items-center gap-3 min-h-[52px] px-3 rounded-xl text-body font-medium transition-colors ${
                    active ? 'bg-white/[0.06] text-ink' : 'text-ink hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" className={active ? '' : 'text-ink-soft'} />
                  {label}
                </NavLink>
              </li>
            );
          })}
        </ul>
        {/* Under lg the sidebar is hidden, so sign out sits at the foot of
            More, after Profile. Demo mode has nothing to sign out of, and the
            demo banner already says how to connect. */}
        {!IS_DEMO && (
          <div className="-mx-2 mt-4">
            <button
              type="button"
              onClick={async () => {
                setMoreOpen(false);
                await signOut();
                navigate('/login');
              }}
              className="press w-full flex items-center gap-3 min-h-[52px] px-3 rounded-xl text-body font-medium text-ink-soft hover:text-ink hover:bg-white/[0.04] transition-colors"
            >
              <SignOut size={20} aria-hidden="true" /> Sign out
            </button>
          </div>
        )}
      </Sheet>

      <nav
        aria-label="Main"
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 h-[var(--tabbar-h)] bg-canvas/95 border-t border-line flex items-stretch pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map(({ to, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => tabCls(isActive)}>
            {({ isActive }) => (
              <>
                <Icon size={22} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />
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
          className={tabCls(moreOn)}
        >
          <DotsThreeOutline size={22} weight={moreOn ? 'fill' : 'regular'} aria-hidden="true" />
          More
        </button>
      </nav>
    </>
  );
}
