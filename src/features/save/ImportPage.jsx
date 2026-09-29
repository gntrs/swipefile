import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CaretLeft, DownloadSimple, FileCsv, UploadSimple } from '@phosphor-icons/react';
import { db, IS_DEMO, fetchAll } from '@/lib/db';
import { OWN_BRAND_NAME } from '@/lib/brand';
import { announceSaved } from '@/lib/saveAd';
import { useAuth } from '@/contexts/AuthContext';
import { SAMPLE_CSV, FORMAT_LABELS, LIMITS, limitProblem } from '@/lib/csv/index';
import { readCsv, planSwipe, planMeta, INSERT_BATCH } from '@/lib/csv/importPlan';
import { invalidateLocalCache } from '@/lib/library/query';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
const btn = 'press inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-4 rounded-xl font-semibold text-[14px] transition-colors';

function downloadTemplate() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'swipefile-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Lookups the plan needs, against the database.
const existingIds = async (ids) => {
  const { data, error } = await db.from('ads').select('id, metrics').in('metrics->>ad_library_id', ids);
  if (error) throw new Error(`Could not check for ads already saved: ${error.message}`);
  return (data || []).map((r) => r.metrics?.ad_library_id).filter(Boolean);
};
const existingByName = async () => {
  const rows = await fetchAll((q) => q.eq('brand', OWN_BRAND_NAME).not('metrics->>ad_name', 'is', null), 'ads');
  if (rows.error) throw new Error(`Could not read your ads to match names: ${rows.error.message}`);
  return new Map(rows.map((r) => [r.metrics.ad_name, r]));
};

// /ads/import: bring in a CSV from the browser. Two formats: the swipe file
// template, and a Meta Ads Manager export of your own ads (written exactly like
// scripts/import-ads-csv.mjs writes them). Preview first, nothing is written
// until Import.
export default function ImportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState(null);
  const [progress, setProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null); // { imported, updated, failed: [{ lines, message }], cancelled }
  const cancel = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel.current = true;
    };
  }, []);

  const reset = () => {
    setError('');
    setPlan(null);
    setResult(null);
    setProgress(null);
  };

  const pick = async (file) => {
    reset();
    if (!file) return;
    setFileName(file.name || 'file.csv');
    if (!/\.csv$/i.test(file.name || '') && !/csv|text\/plain/i.test(file.type || '')) {
      setError(`${file.name || 'That file'} is not a .csv file.`);
      return;
    }
    const tooBig = limitProblem({ bytes: file.size });
    if (tooBig) {
      setError(tooBig);
      return;
    }
    setReading(true);
    try {
      const text = await file.text();
      const parsed = readCsv(text, { bytes: file.size });
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.format === 'meta' && !OWN_BRAND_NAME) {
        setPlan({ format: 'meta', blocked: true, inserts: [], updates: [], duplicates: [], errors: [], preview: [] });
        return;
      }
      const next =
        parsed.format === 'meta'
          ? await planMeta(parsed, { user, ownBrand: OWN_BRAND_NAME, existingByName })
          : await planSwipe(parsed, { user, existingIds });
      if (mounted.current) setPlan(next);
    } catch (err) {
      if (mounted.current) setError(err.message || 'Could not read that file.');
    } finally {
      if (mounted.current) setReading(false);
    }
  };

  const run = async () => {
    if (!plan) return;
    cancel.current = false;
    const total = plan.inserts.length + plan.updates.length;
    let done = 0;
    let imported = 0;
    let updated = 0;
    const failed = [];
    setResult(null);
    setProgress({ done, total });

    for (let i = 0; i < plan.inserts.length && !cancel.current; i += INSERT_BATCH) {
      const batch = plan.inserts.slice(i, i + INSERT_BATCH);
      let r;
      try {
        r = await db.from('ads').insert(batch).select('id');
      } catch (err) {
        r = { error: { message: err?.message || String(err) } };
      }
      if (r?.error) failed.push({ rows: `rows ${fmt(i + 1)} to ${fmt(i + batch.length)}`, message: r.error.message });
      else {
        const ids = (r.data || []).map((x) => x.id);
        imported += ids.length;
        announceSaved(ids);
      }
      done += batch.length;
      if (mounted.current) setProgress({ done, total });
    }
    for (const u of plan.updates) {
      if (cancel.current) break;
      let r;
      try {
        r = await db.from('ads').update(u.patch).eq('id', u.id);
      } catch (err) {
        r = { error: { message: err?.message || String(err) } };
      }
      if (r?.error) failed.push({ rows: u.name, message: r.error.message });
      else updated++;
      done++;
      if (mounted.current) setProgress({ done, total });
    }
    invalidateLocalCache();
    if (updated) announceSaved([]);
    if (!mounted.current) return;
    setProgress(null);
    setResult({ imported, updated, failed, cancelled: cancel.current && done < total });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    // The pick button is disabled while a file is read or imported; a drop is
    // too. Otherwise a second file would replace the plan mid import and the
    // first import's result would show under the second file.
    if (busy) return;
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length > 1) {
      reset();
      setError('Drop one CSV file at a time.');
      return;
    }
    pick(files[0]);
  };

  const newCount = plan ? plan.inserts.length : 0;
  const knownCount = plan ? plan.duplicates.length + plan.updates.length : 0;
  const problemCount = plan ? plan.errors.length : 0;
  const busy = Boolean(progress) || reading;
  const canImport = plan && !plan.blocked && newCount + plan.updates.length > 0 && !busy && !result;

  return (
    <div data-page="import" className="px-5 sm:px-8 pt-4 sm:pt-6 pb-10 max-w-[860px] mx-auto">
      <button
        type="button"
        onClick={() => navigate('/ads')}
        className="press flex items-center gap-1 min-h-[44px] -ml-2 px-2 rounded-xl text-ink-soft hover:text-ink text-[15px] font-medium mb-3"
      >
        <CaretLeft size={16} weight="bold" /> Library
      </button>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-[1.1]">Import ads</h1>
      <p className="text-[16px] text-ink-soft leading-relaxed mt-2 max-w-[68ch]">
        A CSV in the swipe file format (brand, hook, copy, links, verdict, tags), or a Meta Ads Manager export of your own
        ads. Up to {fmt(LIMITS.rows)} rows and 10 MB; for bigger Meta exports use scripts/import-ads-csv.mjs.
      </p>
      <div className="mt-5 mb-6">
        <button type="button" onClick={downloadTemplate} className={`${btn} bg-white/[0.06] hover:bg-white/[0.1] text-ink`}>
          <DownloadSimple size={16} weight="bold" /> Download a template
        </button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`bg-card border border-dashed rounded-xl3 transition-colors ${over ? 'border-accent bg-card-hi' : 'border-ink-soft/40 hover:border-ink-soft'}`}
      >
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="press w-full flex flex-col items-center justify-center text-center min-h-[44px] py-10 px-5 rounded-xl3 text-ink-soft disabled:opacity-60"
        >
          {fileName ? <FileCsv size={28} weight="bold" className="mb-3" /> : <UploadSimple size={28} weight="bold" className="mb-3" />}
          <span className="font-medium text-[16px] text-ink break-all">{fileName || 'Drop a .csv file here, or tap to pick'}</span>
          <span className="text-[14px] mt-1.5">{fileName ? 'Tap to pick another file' : 'One file at a time'}</span>
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
          className="hidden"
        />
      </div>

      {reading && <p className="mt-4 text-[15px] text-ink-soft">Reading the file...</p>}
      {error && (
        <p role="alert" className="mt-4 text-[15px] text-red-600">
          {error}
        </p>
      )}

      {plan && (
        <section className="mt-6" aria-label="Preview">
          <p className="kicker">{FORMAT_LABELS[plan.format]}</p>
          {plan.blocked ? (
            <p role="alert" className="mt-2 text-[16px] text-amber-600">
              Set VITE_OWN_BRAND first: your own ads are stored under that brand name.
            </p>
          ) : (
            <>
              <p className="mt-2 text-[20px] font-semibold tracking-[-0.01em] text-ink tabular-nums">
                {fmt(newCount)} new, {fmt(knownCount)} already saved, {plural(problemCount, 'with problems', 'with problems')}
              </p>
              {plan.format === 'meta' && plan.updates.length > 0 && (
                <p className="mt-1 text-[15px] text-ink-soft">
                  {plural(plan.updates.length, 'ad', 'ads')} already saved under {OWN_BRAND_NAME} get fresh numbers. Their verdicts stay as they are.
                </p>
              )}
              {plan.duplicates.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer min-h-[44px] flex items-center text-[15px] text-ink-soft">
                    Skipped as already saved: {fmt(plan.duplicates.length)}
                  </summary>
                  <ul className="font-mono text-[13px] text-ink-soft grid gap-1 pb-2">
                    {plan.duplicates.slice(0, 100).map((d) => (
                      <li key={`${d.line}-${d.reason}`}>
                        Line {d.line}: {d.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {plan.errors.length > 0 && (
                <div className="mt-3">
                  <p className="text-[15px] text-red-600">These rows will not be imported:</p>
                  <ul className="mt-1 grid gap-1 text-[14px] text-ink-soft max-h-64 overflow-y-auto overscroll-contain">
                    {plan.errors.map((e) => (
                      <li key={e.line}>
                        <span className="font-mono tabular-nums text-ink">Line {e.line}</span> {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.preview.length > 0 && (
                <>
                  <p className="mt-6 kicker">
                    First {plan.preview.length} as they will be saved
                  </p>
                  <ul className="mt-2 grid gap-2">
                    {plan.preview.map((a, i) => (
                      <li key={i} className="bg-card rounded-xl px-4 py-3 min-w-0">
                        <p className="text-[15px] text-ink font-semibold truncate">{a.brand || 'Untitled'}</p>
                        <p className="text-[15px] text-ink-soft break-words line-clamp-2">{a.hook || a.ad_copy || 'No hook'}</p>
                        <p className="font-mono text-[12px] text-ink-soft mt-1 break-words">
                          {[a.verdict, a.status, a.platform, a.metrics?.ad_library_id && `id ${a.metrics.ad_library_id}`, (a.tags || []).join(', ')]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {!plan.blocked && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {!result && (
                <button type="button" onClick={run} disabled={!canImport} className={`${btn} bg-accent hover:bg-accent-dim text-black disabled:opacity-40`}>
                  {progress ? 'Importing...' : `Import ${plural(newCount + plan.updates.length, 'ad', 'ads')}`}
                </button>
              )}
              {progress && (
                <button type="button" onClick={() => (cancel.current = true)} className={`${btn} bg-white/[0.06] hover:bg-white/[0.1] text-ink`}>
                  Cancel
                </button>
              )}
            </div>
          )}

          {progress && (
            <div className="mt-4" aria-live="polite">
              <div
                className="h-2 rounded-full bg-card overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                aria-label="Import progress"
              >
                <div className="h-full bg-accent" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
              <p className="mt-2 font-mono text-[13px] text-ink-soft tabular-nums">
                {fmt(progress.done)} of {fmt(progress.total)}
              </p>
            </div>
          )}

          {result && (
            <div role="status" className="mt-4">
              <p className="text-[18px] text-ink">
                {result.cancelled ? 'Stopped. ' : ''}Imported {plural(result.imported, 'ad', 'ads')}.
                {result.updated > 0 && ` Refreshed ${plural(result.updated, 'ad', 'ads')}.`}
              </p>
              {result.failed.length > 0 && (
                <ul className="mt-2 grid gap-1 text-[15px] text-red-600">
                  {result.failed.map((f, i) => (
                    <li key={i}>
                      {f.rows} failed: {f.message}
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/ads" className={`${btn} mt-4 bg-accent hover:bg-accent-dim text-black`}>
                Open library
              </Link>
            </div>
          )}
        </section>
      )}

      {IS_DEMO && <p className="mt-6 font-mono text-[12px] text-ink-soft">Demo: imported ads stay until you reload.</p>}
    </div>
  );
}
