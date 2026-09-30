import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Star } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useMediaUrl } from '@/lib/media';
import { setStarred, isStarred } from '@/lib/ads';
import { parseCompareIds, bestIndex, MAX_COMPARE } from '@/lib/compare';
import { compactNum, formatMoney } from '@/lib/format';
import { RowsSkeleton } from '@/components/Skeleton';
import { Page, PageHeader, Panel, Button, IconButton, EmptyState, Notice } from '@/components/ui';

const num = (a, k) => {
  const v = Number(a?.metrics?.[k]);
  return Number.isFinite(v) && v > 0 ? v : null;
};
const fmtEur = (v) => (v == null ? null : formatMoney(v));
const fmtPct = (v) => (v == null ? null : `${v.toFixed(2)}%`);
const fmtNum = (v) => (v == null ? null : compactNum(v));

// Metric rows. `best` = 'max' (higher wins) or 'min' (lower wins); the best
// cell in a row is marked only when at least two ads have that number and one
// is strictly ahead. Reach and impressions are different measures (people
// against views), so each gets its own row and they are never compared.
const ROWS = [
  { key: 'ctr', label: 'CTR', get: (a) => num(a, 'ctr'), fmt: fmtPct, best: 'max' },
  { key: 'cpc', label: 'CPC', get: (a) => num(a, 'cpc'), fmt: fmtEur, best: 'min' },
  { key: 'spend', label: 'Spend', get: (a) => num(a, 'spend'), fmt: fmtEur, best: null },
  { key: 'roas', label: 'ROAS', get: (a) => num(a, 'roas'), fmt: (v) => (v == null ? null : v.toFixed(2)), best: 'max' },
  { key: 'impressions', label: 'Impressions', get: (a) => num(a, 'impressions'), fmt: fmtNum, best: 'max' },
  { key: 'reach', label: 'Reach', get: (a) => num(a, 'reach'), fmt: fmtNum, best: 'max' },
  { key: 'days', label: 'Days running', get: (a) => (typeof a?.metrics?.days_running === 'number' ? a.metrics.days_running : null), fmt: (v) => (v == null ? null : `${v}d`), best: 'max' },
];

// The label column stays put while the ads scroll sideways under it.
const labelCell = 'sticky left-0 z-10 bg-card pl-4 pr-2 lg:px-6 py-3 text-left align-top text-small font-medium text-ink-soft';
const cell = 'px-4 py-3 text-left align-top';

function AdThumb({ ad }) {
  const src = useMediaUrl(ad.media_path);
  return (
    <div className="aspect-[4/5] max-h-56 w-full bg-canvas rounded-xl overflow-hidden flex items-center justify-center">
      {src ? (
        ad.format === 'video' ? (
          <video src={src} muted loop playsInline className="w-full h-full object-contain" />
        ) : (
          <img src={src} alt={ad.brand || 'ad'} className="w-full h-full object-contain" />
        )
      ) : (
        <span className="text-small text-ink-soft">No media</span>
      )}
    </div>
  );
}

export default function Compare() {
  const [params] = useSearchParams();
  const raw = params.get('ids') || '';
  const { ids, invalid, dropped } = parseCompareIds(raw);
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let mounted = true;
    setError('');
    if (!ids.length) {
      setAds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.resolve(db.from('ads').select('*').in('id', ids))
      .then(({ data, error: err }) => {
        if (!mounted) return;
        if (err) {
          setError(err.message || 'Could not load these ads.');
          setAds([]);
        } else {
          // preserve the order the user picked
          const byId = new Map((data || []).map((a) => [a.id, a]));
          setAds(ids.map((id) => byId.get(id)).filter(Boolean));
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.message || 'Could not load these ads.');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, reload]);

  // Asked for, minus what came back: bad ids plus ids with no row.
  const requested = ids.length + invalid.length;
  const missing = requested - ads.length;

  const toggleStar = async (ad) => {
    const next = !isStarred(ad);
    const swap = (starred) =>
      setAds((cur) => cur.map((a) => (a.id === ad.id ? { ...a, metrics: { ...(a.metrics || {}), starred } } : a)));
    swap(next);
    const ok = await setStarred(ad, next);
    if (!ok) swap(!next);
  };

  // Best cell index per row, or -1 when there is no single best.
  const bestOf = (row) => bestIndex(ads.map((a) => row.get(a)), row.best);

  const showTable = !loading && !error && ads.length >= 2;

  return (
    <Page id="compare">
      <PageHeader
        back={{ to: '/ads', label: 'Library' }}
        title="Compare"
        context={showTable ? `${ads.length} ads side by side. The best number in a row is marked best.` : null}
      />

      {(!loading && !error && missing > 0) || dropped > 0 ? (
        <div className="flex flex-col gap-2 mb-4 lg:mb-6">
          {!loading && !error && missing > 0 && (
            <Notice tone="warn">
              {missing} of {requested} ads were not found.
            </Notice>
          )}
          {dropped > 0 && (
            <Notice tone="info">
              Compare shows up to {MAX_COMPARE} ads. {dropped} more {dropped === 1 ? 'was' : 'were'} left out.
            </Notice>
          )}
        </div>
      ) : null}

      {loading ? (
        <RowsSkeleton rows={3} />
      ) : error ? (
        <Notice tone="bad" action={<Button onClick={() => setReload((n) => n + 1)}>Retry</Button>}>
          <p className="font-semibold">Could not load these ads.</p>
          <p className="text-ink-soft mt-0.5">{error}</p>
        </Notice>
      ) : ads.length < 2 ? (
        <EmptyState
          page
          title="Pick at least 2 ads to compare."
          text="Select ads in the library, then press Compare."
          action={<Button to="/ads">Back to the library</Button>}
        />
      ) : (
        <Panel flush className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full table-fixed border-collapse" style={{ minWidth: `${7 + ads.length * 11}rem` }}>
              <colgroup>
                <col className="w-28 lg:w-40" />
                {ads.map((a) => (
                  <col key={a.id} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className={`${labelCell} pt-5 lg:pt-6`}>
                    <span className="sr-only">Metric</span>
                  </th>
                  {ads.map((a) => {
                    const starred = isStarred(a);
                    return (
                      <th key={a.id} scope="col" className={`${cell} pt-5 lg:pt-6 pb-4 font-normal`}>
                        <AdThumb ad={a} />
                        <div className="flex items-center gap-1 mt-3 -mr-2">
                          <Link
                            to={`/ad/${a.id}`}
                            className="flex-1 min-w-0 flex items-center min-h-[44px] text-title text-ink truncate hover:underline underline-offset-4"
                          >
                            <span className="truncate">{a.brand || 'Untitled'}</span>
                          </Link>
                          <IconButton
                            label={starred ? 'Remove star' : 'Star'}
                            pressed={starred}
                            onClick={() => toggleStar(a)}
                            icon={<Star size={18} weight={starred ? 'fill' : 'bold'} aria-hidden="true" className={starred ? 'text-ink' : ''} />}
                          />
                        </div>
                        <p className="text-small text-ink-soft truncate">{a.platform || '-'}</p>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-line border-t border-line">
                {ROWS.map((row) => {
                  const best = bestOf(row);
                  return (
                    <tr key={row.key}>
                      <th scope="row" className={labelCell}>
                        {row.label}
                      </th>
                      {ads.map((a, i) => {
                        const value = row.fmt(row.get(a));
                        return (
                          <td key={a.id} className={cell}>
                            {value == null ? (
                              <span className="num text-num text-ink-soft">-</span>
                            ) : i === best ? (
                              <span className="inline-flex items-baseline gap-2 text-ink">
                                <span className="num text-num font-semibold">{value}</span>
                                <span className="text-meta text-ink-soft">best</span>
                              </span>
                            ) : (
                              <span className="num text-num text-ink">{value}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr>
                  <th scope="row" className={labelCell}>
                    Hook
                  </th>
                  {ads.map((a) => (
                    <td key={a.id} className={`${cell} text-body text-ink`}>
                      {a.hook || <span className="text-ink-soft">-</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className={`${labelCell} pb-5 lg:pb-6`}>
                    Copy
                  </th>
                  {ads.map((a) => (
                    <td key={a.id} className={`${cell} pb-5 lg:pb-6 text-small text-ink-soft whitespace-pre-line`}>
                      {a.ad_copy ? (a.ad_copy.length > 280 ? `${a.ad_copy.slice(0, 280)}...` : a.ad_copy) : '-'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </Page>
  );
}
