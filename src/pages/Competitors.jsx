import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CaretDown, Plus } from '@phosphor-icons/react';
import { fetchAll } from '@/lib/db';
import PartialNotice from '@/components/PartialNotice';
import { isOwnBrand } from '@/lib/brand';
import { isRunning } from '@/lib/dashboard';
import { useTeam } from '@/contexts/TeamContext';
import AdCard from '@/components/AdCard';
import TrackCompetitors from '@/components/TrackCompetitors';
import { isOn } from '@/lib/modules';
import { RowsSkeleton, StatSkeleton } from '@/components/Skeleton';
import { shortDate } from '@/features/ai/dates';
import {
  Page,
  PageHeader,
  Button,
  Panel,
  Section,
  Stat,
  List,
  Row,
  Meta,
  EmptyState,
  GRID_CARDS,
  GRID_STATS,
} from '@/components/ui';

const DAY = 86400000;

function ago(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

const isCompetitor = (brand) => Boolean(brand && brand.trim()) && !isOwnBrand(brand);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The rival table columns. Under lg a row is two lines (brand, then a meta
// line); from lg the counts get their own right aligned columns, and the
// platforms column joins at xl where there is room for it.
const COLS =
  'grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-x-4 ' +
  'lg:grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_7rem_2.75rem] ' +
  'xl:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5.5rem_minmax(0,10rem)_7.5rem_2.75rem]';

function Count({ n, label }) {
  return (
    <span className={`hidden lg:block text-right num text-num ${n ? 'text-ink' : 'text-ink-soft/60'}`}>
      {n}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

// Everything we know about the other brands, in one place: their ads (mostly
// via the Meta Ad Library import, plus anything added by hand), how active
// they have been lately, and the social posts the team has logged for them
// or the weekly Brave scrape has spotted.
export default function Competitors() {
  const { displayName } = useTeam();
  const [ads, setAds] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [partial, setPartial] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let mounted = true;
    // Logged social posts belong to the team module: no fetch when it is off.
    Promise.all([
      fetchAll((q) => q.order('created_at', { ascending: false }), 'ads'),
      isOn('team') ? fetchAll((q) => q.order('posted_at', { ascending: false, nullsFirst: false }), 'posts') : [],
    ]).then(([adsData, postsData]) => {
      if (!mounted) return;
      setAds(adsData);
      setPosts(postsData);
      setPartial([adsData, postsData].find((rows) => rows.error) || null);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [reload]);

  const compAds = useMemo(() => ads.filter((a) => isCompetitor(a.brand)), [ads]);
  const compPosts = useMemo(() => posts.filter((p) => isCompetitor(p.brand)), [posts]);

  const brands = useMemo(() => {
    const map = new Map();
    for (const a of compAds) {
      const key = a.brand.trim().toLowerCase();
      if (!map.has(key)) map.set(key, { key, name: a.brand.trim(), ads: [] });
      map.get(key).ads.push(a);
    }
    for (const p of compPosts) {
      const key = p.brand.trim().toLowerCase();
      if (!map.has(key)) map.set(key, { key, name: p.brand.trim(), ads: [] });
    }
    const cutoff = Date.now() - 30 * DAY;
    return [...map.values()]
      .map((b) => ({
        ...b,
        running: b.ads.filter(isRunning).length,
        winners: b.ads.filter((a) => a.verdict === 'winner').length,
        new30: b.ads.filter((a) => new Date(a.created_at) >= cutoff).length,
        lastSeen: b.ads[0]?.created_at || null,
        platforms: [...new Set(b.ads.map((a) => a.platform).filter(Boolean))],
        posts: compPosts.filter((p) => p.brand.trim().toLowerCase() === b.key),
      }))
      .sort((a, b) => b.running - a.running || b.new30 - a.new30 || b.ads.length - a.ads.length);
  }, [compAds, compPosts]);

  const totals = useMemo(() => {
    const cutoff = Date.now() - 30 * DAY;
    return {
      brands: brands.length,
      ads: compAds.length,
      running: compAds.filter(isRunning).length,
      new30: compAds.filter((a) => new Date(a.created_at) >= cutoff).length,
    };
  }, [brands, compAds]);

  return (
    <Page id="competitors">
      <PageHeader
        title="Competitors"
        context="What the other brands are running"
        actions={
          <Button variant="primary" icon={Plus} to="/ads/add">
            Add ad
          </Button>
        }
      />
      <PartialNotice rows={partial} onRetry={() => setReload((n) => n + 1)} className="mb-6" />

      {loading ? (
        <div className={`${GRID_STATS} mb-6`}>
          {[0, 1, 2, 3].map((i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      ) : (
        brands.length > 0 && (
          <div className={`${GRID_STATS} mb-6`}>
            <Stat label="Brands tracked" value={totals.brands} />
            <Stat label="Ads tracked" value={totals.ads} />
            <Stat label="Running now" value={totals.running} />
            <Stat label="Saved in last 30 days" value={totals.new30} />
          </div>
        )
      )}

      <TrackCompetitors />

      {loading ? (
        <RowsSkeleton rows={4} className="mt-6" />
      ) : brands.length === 0 ? (
        <Panel className="mt-6">
          <EmptyState
            title="No competitor ads yet."
            text="Track a brand above to pull its ads from the Meta Ad Library, or add one by hand with the brand filled in."
            action={
              <Button variant="secondary" to="/ads/add">
                Add one by hand
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <Panel flush className="mt-6 overflow-hidden" aria-label="Rival brands">
            <div
              aria-hidden="true"
              className={`${COLS} hidden lg:grid min-h-[44px] px-6 border-b border-line text-small font-medium text-ink-soft`}
            >
              <span>Brand</span>
              <span className="text-right">Running</span>
              <span className="text-right">Saved 30d</span>
              <span className="text-right">Winners</span>
              <span className="hidden xl:block">Platforms</span>
              <span className="text-right">Last seen</span>
              <span />
            </div>
            <ul className="divide-y divide-line">
              {brands.map((b) => {
                const isOpen = open === b.key;
                const counts = [
                  b.running > 0 && `${b.running} running`,
                  b.new30 > 0 && `${b.new30} saved in 30d`,
                  b.winners > 0 && plural(b.winners, 'winner', 'winners'),
                ].filter(Boolean);
                return (
                  <li key={b.key}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : b.key)}
                      className={`${COLS} w-full min-h-[56px] px-5 lg:px-6 py-3 text-left hover:bg-white/[0.02] transition-colors focus-visible:!outline-offset-[-2px]`}
                    >
                      <span className="min-w-0">
                        <span className="block text-body font-medium text-ink truncate">{b.name}</span>
                        <Meta
                          className="block lg:hidden text-small text-ink-soft mt-0.5"
                          items={[
                            ...(counts.length ? counts : [plural(b.ads.length, 'ad', 'ads')]),
                            b.lastSeen && <span className="whitespace-nowrap">last seen {ago(b.lastSeen)}</span>,
                          ]}
                        />
                      </span>
                      <Count n={b.running} label="running" />
                      <Count n={b.new30} label="saved in the last 30 days" />
                      <Count n={b.winners} label={b.winners === 1 ? 'winner' : 'winners'} />
                      <span className="hidden xl:block text-small text-ink-soft truncate">
                        {b.platforms.join(', ') || '-'}
                      </span>
                      <span className="hidden lg:block text-small text-ink-soft text-right whitespace-nowrap">
                        {b.lastSeen ? ago(b.lastSeen) : '-'}
                      </span>
                      <span className="flex justify-end">
                        <CaretDown
                          size={16}
                          weight="bold"
                          aria-hidden="true"
                          className={`text-ink-soft transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-4 lg:px-6 py-4 lg:py-6 bg-canvas/50 border-t border-line">
                        {b.ads.length === 0 ? (
                          <p className="text-body text-ink-soft">No ads yet, only posts.</p>
                        ) : (
                          <div className={GRID_CARDS}>
                            {b.ads.slice(0, 8).map((ad) => (
                              <AdCard key={ad.id} ad={ad} />
                            ))}
                          </div>
                        )}
                        {b.ads.length > 8 && (
                          <Button
                            variant="ghost"
                            to={`/ads?q=${encodeURIComponent(b.name)}`}
                            className="mt-3 -ml-4"
                          >
                            See all {b.ads.length} in the library
                            <ArrowRight size={14} weight="bold" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* Competitor social posts (team module) */}
          {isOn('team') && (
            <Section
              title="Their social posts"
              action={
                <Button variant="secondary" icon={Plus} to="/posts/add?competitor=1">
                  Log one
                </Button>
              }
            >
              {compPosts.length === 0 ? (
                <Panel>
                  <EmptyState
                    text="Nothing logged yet. Spot a competitor post worth remembering? Log it with the brand filled in."
                  />
                </Panel>
              ) : (
                <Panel flush>
                  <List>
                    {compPosts.map((p) => (
                      <Row
                        key={p.id}
                        to={`/post/${p.id}`}
                        title={p.title || 'Untitled post'}
                        meta={
                          <Meta
                            items={[
                              <span key="b" className="text-ink">
                                {p.brand.trim()}
                              </span>,
                              p.platform,
                              p.post_type,
                              shortDate(p.posted_at),
                              p.added_by_email && `by ${displayName(p.added_by_email)}`,
                            ]}
                          />
                        }
                      />
                    ))}
                  </List>
                </Panel>
              )}
            </Section>
          )}
        </>
      )}
    </Page>
  );
}
