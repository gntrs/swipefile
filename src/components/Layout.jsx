import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { SignOut, User } from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { useMediaUrl } from '@/lib/media';
import WelcomePopup from '@/components/WelcomePopup';
import MobileNav from '@/components/MobileNav';
import SaleCelebration from '@/components/SaleCelebration';
import DemoBanner from '@/components/DemoBanner';
import SetupBanner from '@/components/SetupBanner';
import { IS_DEMO } from '@/lib/db';
import { APP_NAME } from '@/lib/brand';
import { isOn } from '@/lib/modules';
import { sidebarItems } from '@/lib/nav';
import AiBackground from '@/features/ai/AiBackground';

// Sidebar entries come from src/lib/nav.js, filtered by the modules that are on.
const nav = sidebarItems();

export default function Layout() {
  const { user, signOut } = useAuth();
  const { me, avatarFor, displayName } = useTeam();
  const navigate = useNavigate();
  const avatar = useMediaUrl(user ? avatarFor(user.email) : null);

  return (
    <div className="h-full flex bg-canvas text-ink">
      {/* First-login setup: pick a nickname + replace the temporary password.
          Team module only: a solo install has nobody to introduce. */}
      {isOn('team') && <WelcomePopup />}

      {/* Fullscreen celebration on a new sale (desktop only), ops module. */}
      {isOn('ops') && <SaleCelebration />}

      {/* Background AI work after saves (renders nothing). */}
      <AiBackground />

      {/* Sidebar - a translucent structural layer (content scrolls under the
          blur), not an opaque strip. `glass` lets reduced-transparency and
          high-contrast users get a solid fallback. */}
      <aside className="glass hidden sm:flex w-60 flex-col border-r border-line bg-card/60 backdrop-blur-xl backdrop-saturate-150 px-4 py-5">
        {/* Wordmark only, no icon. One accent dot, nothing else. */}
        <div className="px-3 mb-7 pt-1">
          <span className="font-semibold text-[18px] tracking-tight">
            {APP_NAME}
            <span className="text-accent">.</span>
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `press flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-2xl font-medium text-[15px] transition-colors ${
                  isActive ? 'bg-accent-wash text-accent-dim' : 'text-ink-soft hover:bg-canvas'
                }`
              }
            >
              <Icon size={20} weight="bold" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-line">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `press flex items-center gap-2.5 px-3 py-2 rounded-2xl transition-colors ${
                isActive ? 'bg-accent-wash' : 'hover:bg-canvas'
              }`
            }
          >
            <span className="w-8 h-8 rounded-full bg-canvas border border-line overflow-hidden flex items-center justify-center flex-shrink-0">
              {avatar ? (
                <img src={avatar} alt="me" className="w-full h-full object-cover" />
              ) : (
                <User size={16} className="text-ink-soft" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold truncate">
                {me?.nickname || displayName(user?.email)}
              </span>
              <span className="block text-[11px] text-ink-soft truncate">{user?.email}</span>
            </span>
          </NavLink>
          {IS_DEMO ? (
            <p className="mt-2 px-3 min-h-[44px] flex items-center font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
              Demo mode
            </p>
          ) : (
            <button
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
              className="press mt-2 w-full min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-2xl text-[14px] font-medium text-ink-soft hover:bg-canvas transition-colors"
            >
              <SignOut size={18} weight="bold" /> Sign out
            </button>
          )}
        </div>
      </aside>

      {/* Main. Safe-area padding keeps content clear of the notch (standalone
          PWA) and of the bottom nav + home indicator on phones. */}
      {/* overscroll-contain: hitting the top/bottom of the feed must not
          rubber-band the whole app frame (the PWA "wiggle"); overflow-x-hidden
          clips any accidentally-wide child instead of letting it pan the page. */}
      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain pt-[env(safe-area-inset-top)] pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-0">
        <DemoBanner />
        <SetupBanner />
        <Outlet />
      </main>

      {/* Mobile bottom nav (sidebar is hidden on phones): four primary tabs
          spread evenly, plus a More sheet for the rest. One tap each. */}
      <MobileNav />
    </div>
  );
}
