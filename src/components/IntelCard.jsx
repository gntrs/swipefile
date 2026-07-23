import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GlobeHemisphereWest, MagnifyingGlass, ArrowRight } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { geoStatus, countryOptions } from '@/lib/ads';

const MARKET_LABEL = { ES: 'Spain', FR: 'France', US: 'US' };

// The dashboard face of /intel: three plain-language headlines, no controls.
// Reuses the ads the dashboard already loaded (geo), and does one cheap read
// for the sharpest SEO fact. Everything degrades to a quiet "set up" line so an
// un-migrated environment shows nothing alarming.
export default function IntelCard({ ads = [] }) {
  const [seoRows, setSeoRows] = useState(null); // null = loading, [] = none/missing

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await db
          .from('seo_ranks')
          .select('market, term, position, is_ours, day')
          .order('day', { ascending: false })
          .limit(400);
        if (!mounted) return;
        setSeoRows(error ? [] : data || []);
      } catch {
        if (mounted) setSeoRows([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const geo = useMemo(() => {
    let eu = 0;
    ads.forEach((a) => {
      if (geoStatus(a) === 'eu') eu += 1;
    });
    const countries = countryOptions(ads);
    const focus = countries.filter((c) => c.code === 'ES' || c.code === 'FR');
    return { eu, ready: eu > 0, focus };
  }, [ads]);

  // Our best (lowest) position anywhere on the latest data we have.
  const seo = useMemo(() => {
    if (!seoRows || seoRows.length === 0) return { ready: false };
    const ours = seoRows.filter((r) => r.is_ours && r.position != null);
    if (ours.length === 0) return { ready: true, best: null };
    const best = ours.reduce((b, r) => (r.position < b.position ? r : b), ours[0]);
    return { ready: true, best };
  }, [seoRows]);

  const seoLine =
    !seo.ready
      ? 'Search tracking not set up'
      : seo.best
      ? `Best rank #${seo.best.position} — “${seo.best.term}” (${MARKET_LABEL[seo.best.market] || seo.best.market})`
      : 'Not in top results in any tracked market';

  const geoLine = geo.ready
    ? `${geo.eu} ads ran in the EU` +
      (geo.focus.length ? ` · ${geo.focus.map((c) => `${c.count} ${MARKET_LABEL[c.code]}`).join(' · ')}` : '')
    : 'EU geo sync not run';

  return (
    <Link
      to="/intel"
      className="block bg-card rounded-xl3 border border-line shadow-card p-5 hover:border-coral/50 transition-colors group mb-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-[15px]">Market intel</h2>
        <span className="text-[12px] text-coral-dark font-medium flex items-center gap-1 group-hover:gap-1.5 transition-all">
          Full view <ArrowRight size={13} weight="bold" />
        </span>
      </div>
      <div className="space-y-2.5">
        <div className="flex items-start gap-2.5">
          <MagnifyingGlass size={16} weight="bold" className="text-ink-soft flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-ink leading-snug">{seoLine}</p>
        </div>
        <div className="flex items-start gap-2.5">
          <GlobeHemisphereWest size={16} weight="bold" className="text-ink-soft flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-ink leading-snug">{geoLine}</p>
        </div>
      </div>
    </Link>
  );
}
