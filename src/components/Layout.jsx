import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
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
import Wordmark from '@/components/Wordmark';
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

      {/* Sidebar from lg: a solid strip on the canvas, split from the content
          by one hairline. Under lg the tab bar takes over. */}
      <aside className="hidden lg:flex w-[var(--nav-w)] flex-shrink-0 flex-col overflow-y-auto border-r border-line bg-canvas px-3 py-5">
        <div className="px-3 mb-8 pt-1">
          <Wordmark />
        </div>

        <nav className="flex flex-col gap-0.5">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `press flex items-center gap-3 min-h-[44px] px-3 rounded-xl text-ui font-medium transition-colors ${
                  isActive ? 'bg-card text-ink' : 'text-ink-soft hover:text-ink hover:bg-white/[0.04]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" className="flex-shrink-0" />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-6">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `press flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-xl transition-colors ${
                isActive ? 'bg-card' : 'hover:bg-white/[0.04]'
              }`
            }
          >
            <span className="w-8 h-8 rounded-full bg-card-hi overflow-hidden flex items-center justify-center flex-shrink-0">
              {avatar ? (
                <img src={avatar} alt="me" className="w-full h-full object-cover" />
              ) : (
                <User size={16} className="text-ink-soft" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-small font-semibold text-ink truncate">
                {me?.nickname || displayName(user?.email)}
              </span>
              <span className="block text-small text-ink-soft truncate">{user?.email}</span>
            </span>
          </NavLink>
          {IS_DEMO ? (
            <div className="mt-1 flex items-center justify-between gap-2 min-h-[44px] pl-3">
              <span className="text-small text-ink-soft">Demo mode</span>
              <Link
                to="/setup"
                className="press inline-flex items-center min-h-[44px] px-3 rounded-xl text-small font-medium text-ink hover:bg-white/[0.04] transition-colors"
              >
                Connect
              </Link>
            </div>
          ) : (
            <button
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
              className="press mt-1 w-full min-h-[44px] flex items-center gap-3 px-3 rounded-xl text-ui font-medium text-ink-soft hover:text-ink hover:bg-white/[0.04] transition-colors"
            >
              <SignOut size={20} aria-hidden="true" /> Sign out
            </button>
          )}
        </div>
      </aside>

      {/* Main is the one scroller (the library keys and scroll to top query
          it). Safe-area padding keeps content clear of the notch, and the
          bottom padding clears the tab bar on phones and tablets.
          overscroll-contain stops the app frame rubber banding; overflow-x
          hidden clips any accidentally wide child. */}
      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain pt-[env(safe-area-inset-top)] pb-[calc(var(--tabbar-h)+1.25rem)] lg:pb-0">
        {/* On desktop the sidebar already says demo mode. */}
        <div className="lg:hidden">
          <DemoBanner />
        </div>
        <SetupBanner />
        <Outlet />
      </main>

      {/* The tab bar under lg: four primary tabs spread evenly, plus a More
          sheet for the rest. One tap each. */}
      <MobileNav />
    </div>
  );
}
