import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Images, Megaphone, PaperPlaneTilt, CalendarBlank, SquaresFour, SignOut, User, Binoculars, Quotes, NotePencil, ChartLineUp } from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeam } from '@/contexts/TeamContext';
import { useMediaUrl } from '@/lib/media';
import WelcomePopup from '@/components/WelcomePopup';
import MobileNav from '@/components/MobileNav';
import SaleCelebration from '@/components/SaleCelebration';

const nav = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: SquaresFour, end: true },
  { to: '/ads', label: 'Ads', icon: Images },
  { to: '/hooks', label: 'Hook bank', short: 'Hooks', icon: Quotes },
  { to: '/briefs', label: 'Briefs', icon: NotePencil },
  { to: '/posts', label: 'Organic posts', short: 'Posts', icon: Megaphone },
  { to: '/competitors', label: 'Competitors', short: 'Rivals', icon: Binoculars },
  { to: '/intel', label: 'Market intel', short: 'Intel', icon: ChartLineUp },
  { to: '/outreach', label: 'Outreach', short: 'Reach', icon: PaperPlaneTilt },
  { to: '/availability', label: 'Availability', short: 'When', icon: CalendarBlank },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const { me, avatarFor, displayName } = useTeam();
  const navigate = useNavigate();
  const avatar = useMediaUrl(user ? avatarFor(user.email) : null);

  return (
    <div className="h-full flex bg-cream text-ink">
      {/* First-login setup: pick a nickname + replace the temporary password */}
      <WelcomePopup />

      {/* Inside-joke fullscreen meme on a new sale (desktop only). */}
      <SaleCelebration />

      {/* Sidebar - a translucent structural layer (content scrolls under the
          blur), not an opaque strip. `glass` lets reduced-transparency and
          high-contrast users get a solid fallback. */}
      <aside className="glass hidden sm:flex w-60 flex-col border-r border-line bg-card/60 backdrop-blur-xl backdrop-saturate-150 px-4 py-5">
        {/* Wordmark only - no icon. One coral accent, nothing else. */}
        <div className="px-3 mb-7 pt-1">
          <span className="font-semibold text-[18px] tracking-tight">
            Tracker<span className="text-coral">.</span>
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `press flex items-center gap-3 px-3 py-2.5 rounded-2xl font-medium text-[15px] transition-colors ${
                  isActive ? 'bg-coral-soft text-coral-dark' : 'text-ink-soft hover:bg-cream'
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
                isActive ? 'bg-coral-soft' : 'hover:bg-cream'
              }`
            }
          >
            <span className="w-8 h-8 rounded-full bg-cream border border-line overflow-hidden flex items-center justify-center flex-shrink-0">
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
          <button
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="press mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-2xl text-[14px] font-medium text-ink-soft hover:bg-cream transition-colors"
          >
            <SignOut size={18} weight="bold" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main. Safe-area padding keeps content clear of the notch (standalone
          PWA) and of the bottom nav + home indicator on phones. */}
      {/* overscroll-contain: hitting the top/bottom of the feed must not
          rubber-band the whole app frame (the PWA "wiggle"); overflow-x-hidden
          clips any accidentally-wide child instead of letting it pan the page. */}
      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain pt-[env(safe-area-inset-top)] pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom nav (sidebar is hidden on phones): four primary tabs
          spread evenly, plus a More sheet for the rest. One tap each. */}
      <MobileNav />
    </div>
  );
}
