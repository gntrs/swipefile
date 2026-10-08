import React, { useEffect, useRef, useState } from 'react';

import { DownloadSimple, FileCsv, UploadSimple } from '@phosphor-icons/react';
import { Page, PageHeader, Panel, List, Row, Meta, Metrics, Button, Notice } from '@/components/ui';
import { db, IS_DEMO, fetchAll } from '@/lib/db';
import { OWN_BRAND_NAME } from '@/lib/brand';
import { announceSaved } from '@/lib/saveAd';
import { useAuth } from '@/contexts/AuthContext';
import { SAMPLE_CSV, FORMAT_LABELS, LIMITS, limitProblem } from '@/lib/csv/index';
import { readCsv, planSwipe, planMeta, INSERT_BATCH } from '@/lib/csv/importPlan';
import { invalidateLocalCache } from '@/lib/library/query';
import { byId } from '@/lib/byId';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;

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
        r = await byId(db.from('ads').update(u.patch), u.id);
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
    <Page id="import" width="narrow">
      <PageHeader
        back={{ to: '/ads', label: 'Library' }}
        title="Import ads"
        context="A CSV in the swipe file format or a Meta Ads Manager export."
        actions={
          <Button icon={DownloadSimple} onClick={downloadTemplate} aria-label="Download a template">
            <span className="hidden sm:inline">Download a template</span>
          </Button>
        }
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`bg-white/[0.02] border border-dashed rounded-xl3 transition-colors ${over ? 'border-accent bg-card-hi' : 'border-line hover:border-ink-soft'}`}
      >
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="press w-full flex flex-col items-center justify-center text-center min-h-[44px] py-10 px-5 rounded-xl3 text-ink-soft disabled:opacity-60"
        >
          {fileName ? (
            <FileCsv size={24} weight="bold" aria-hidden="true" className="mb-3" />
          ) : (
            <UploadSimple size={24} weight="bold" aria-hidden="true" className="mb-3" />
          )}
          <span className="text-body font-medium text-ink break-all">{fileName || 'Drop a .csv file here, or tap to pick'}</span>
          <span className="text-small mt-1">{fileName ? 'Tap to pick another file' : 'One file at a time'}</span>
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
      <p className="mt-3 text-small text-ink-soft">
        Up to {fmt(LIMITS.rows)} rows and 10 MB. For bigger Meta exports use{' '}
        <code className="font-mono text-meta text-ink bg-white/[0.06] rounded-md px-1.5 py-0.5 break-all">scripts/import-ads-csv.mjs</code>.
        {IS_DEMO && ' Demo: imported ads stay until you reload.'}
      </p>

      {reading && <p className="mt-4 text-body text-ink-soft">Reading the file...</p>}
      {error && (
        <Notice tone="bad" className="mt-4">
          {error}
        </Notice>
      )}

      {plan && (
        <section className="mt-8" aria-label="Preview">
          <p className="text-small font-medium text-ink-soft">{FORMAT_LABELS[plan.format]}</p>
          {plan.blocked ? (
            <Notice tone="warn" className="mt-2">
              Set VITE_OWN_BRAND first: your own ads are stored under that brand name.
            </Notice>
          ) : (
            <>
              <Metrics
                cols={3}
                className="mt-3 max-w-[30rem]"
                items={[
                  { key: 'new', label: 'New', value: fmt(newCount) },
                  { key: 'known', label: 'Already saved', value: fmt(knownCount) },
                  { key: 'problems', label: 'With problems', value: fmt(problemCount), tone: problemCount ? 'bad' : undefined },
                ]}
              />
              {plan.format === 'meta' && plan.updates.length > 0 && (
                <p className="mt-2 text-body text-ink-soft">
                  {plural(plan.updates.length, 'ad', 'ads')} already saved under {OWN_BRAND_NAME} get fresh numbers. Their verdicts stay as they are.
                </p>
              )}
              {plan.duplicates.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer min-h-[44px] flex items-center text-ui text-ink-soft">
                    Skipped as already saved: {fmt(plan.duplicates.length)}
                  </summary>
                  <ul className="text-small text-ink-soft grid gap-1 pb-2">
                    {plan.duplicates.slice(0, 100).map((d) => (
                      <li key={`${d.line}-${d.reason}`}>
                        Line {d.line}: {d.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {plan.errors.length > 0 && (
                <div className="mt-4">
                  <p className="text-ui text-red-300">These rows will not be imported:</p>
                  <ul className="mt-2 grid gap-1 text-small text-ink-soft max-h-64 overflow-y-auto overscroll-contain">
                    {plan.errors.map((e) => (
                      <li key={e.line}>
                        <span className="text-ink tabular-nums">Line {e.line}</span>{' '}
                        {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.preview.length > 0 && (
                <Panel flush title={`First ${plan.preview.length} as they will be saved`} className="mt-6">
                  <List>
                    {plan.preview.map((a, i) => (
                      <Row
                        key={i}
                        title={
                          <>
                            <span className="block text-small font-semibold text-ink-soft truncate">{a.brand || 'Untitled'}</span>
                            <span className="block break-words">{a.hook || a.ad_copy || 'No hook'}</span>
                          </>
                        }
                        meta={
                          <Meta
                            items={[
                              a.verdict && a.verdict[0].toUpperCase() + a.verdict.slice(1),
                              a.status,
                              a.platform,
                              a.metrics?.ad_library_id && (
                                <>
                                  id <span className="num text-small">{a.metrics.ad_library_id}</span>
                                </>
                              ),
                              (a.tags || []).join(', '),
                            ]}
                            className="break-words"
                          />
                        }
                      />
                    ))}
                  </List>
                </Panel>
              )}
            </>
          )}

          {!plan.blocked && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {!result && (
                <Button variant="primary" onClick={run} disabled={!canImport}>
                  {progress ? 'Importing...' : `Import ${plural(newCount + plan.updates.length, 'ad', 'ads')}`}
                </Button>
              )}
              {progress && <Button onClick={() => (cancel.current = true)}>Cancel</Button>}
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
              <p className="mt-2 text-small text-ink-soft">
                <span className="num text-small">{fmt(progress.done)}</span> of <span className="num text-small">{fmt(progress.total)}</span>
              </p>
            </div>
          )}

          {result && (
            <div role="status" className="mt-4">
              <p className="text-lead text-ink">
                {result.cancelled ? 'Stopped. ' : ''}Imported {plural(result.imported, 'ad', 'ads')}.
                {result.updated > 0 && ` Refreshed ${plural(result.updated, 'ad', 'ads')}.`}
              </p>
              {result.failed.length > 0 && (
                <ul className="mt-2 grid gap-1 text-ui text-red-300">
                  {result.failed.map((f, i) => (
                    <li key={i}>
                      {f.rows} failed: {f.message}
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="primary" to="/ads" className="mt-4">
                Open library
              </Button>
            </div>
          )}
        </section>
      )}
    </Page>
  );
}
