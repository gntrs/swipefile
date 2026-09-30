import React, { useEffect, useState } from 'react';
import { CaretDown, Plus } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { Badge, Button, Field, inputCls } from '@/components/ui';

// Which brands the Ad Library importer auto-tracks (competitors table,
// migration 15). Adding a brand that already exists updates its row, so
// filling in a missing page id or handle is just re-adding the brand.
// The page id comes from the brand's Ad Library URL (view_all_page_id=...)
// or gets resolved automatically by the importer when left empty.

function parsePageId(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  const fromUrl = s.match(/view_all_page_id=(\d+)/);
  if (fromUrl) return fromUrl[1];
  return /^\d{5,}$/.test(s) ? s : null;
}

export default function TrackCompetitors() {
  const [rows, setRows] = useState([]);
  const [openForm, setOpenForm] = useState(false);
  const [brand, setBrand] = useState('');
  const [page, setPage] = useState('');
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = () =>
    db
      .from('competitors')
      .select('*')
      .order('brand')
      .then(({ data }) => setRows(data || []));

  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    const name = brand.trim();
    if (!name) return;
    const pageId = parsePageId(page);
    if (page.trim() && !pageId) {
      setError('Paste the Ad Library link (with view_all_page_id) or the numeric page id.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data: session } = await db.auth.getUser();
    const patch = {
      brand: name,
      active: true,
      added_by_email: session?.user?.email || null,
    };
    if (pageId) patch.page_id = pageId;
    const ig = handle.trim().replace(/^@/, '').toLowerCase();
    if (ig) patch.ig_handle = ig;
    const { error: err } = await db.from('competitors').upsert(patch, { onConflict: 'brand' });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setBrand('');
    setPage('');
    setHandle('');
    load();
  }

  async function toggle(row) {
    await db.from('competitors').update({ active: !row.active }).eq('id', row.id);
    load();
  }

  return (
    <section className="bg-card rounded-xl3">
      <button
        type="button"
        aria-expanded={openForm}
        onClick={() => setOpenForm(!openForm)}
        className="w-full min-h-[44px] flex items-center gap-4 px-5 lg:px-6 py-4 text-left rounded-xl3 hover:bg-white/[0.02] transition-colors focus-visible:!outline-offset-[-2px]"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-title text-ink">Auto tracked</span>
          <span className="block text-small text-ink-soft mt-0.5">
            {rows.length
              ? `${rows.filter((r) => r.active).length} of ${rows.length} scraped daily from the Meta Ad Library`
              : 'Add brands to pull their ads daily from the Meta Ad Library'}
          </span>
        </span>
        <CaretDown
          size={16}
          weight="bold"
          aria-hidden="true"
          className={`text-ink-soft flex-shrink-0 transition-transform ${openForm ? 'rotate-180' : ''}`}
        />
      </button>

      {openForm && (
        <div className="px-5 lg:px-6 pb-5 lg:pb-6">
          {rows.length > 0 && (
            <ul className="divide-y divide-line border-y border-line mb-5">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 min-h-[52px] py-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(r.active)}
                    aria-label={`Track ${r.brand}`}
                    onClick={() => toggle(r)}
                    title={r.active ? 'Tracking: tap to pause' : 'Paused: tap to resume'}
                    className="press flex-shrink-0 -ml-1.5 w-11 h-11 flex items-center justify-center rounded-xl"
                  >
                    <span
                      aria-hidden="true"
                      className={`relative w-9 h-5 rounded-full transition-colors ${r.active ? 'bg-mint' : 'bg-line'}`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-all ${
                          r.active ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </span>
                  </button>
                  <span
                    className={`flex-1 min-w-0 text-body font-medium truncate ${
                      r.active ? 'text-ink' : 'text-ink-soft line-through'
                    }`}
                  >
                    {r.brand}
                    {r.ig_handle && <span className="ml-2 text-small font-normal text-ink-soft">@{r.ig_handle}</span>}
                  </span>
                  {r.page_id ? (
                    <Badge tone="good" className="flex-shrink-0">
                      Page linked
                    </Badge>
                  ) : (
                    <Badge
                      tone="warn"
                      className="flex-shrink-0"
                      title="No page id yet. The importer tries to find it, or re-add the brand with its Ad Library link."
                    >
                      Page id pending
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={add}>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Brand" htmlFor="track-brand">
                <input id="track-brand" className={inputCls} placeholder="Brand name" value={brand} onChange={(e) => setBrand(e.target.value)} />
              </Field>
              <Field label="Ad Library link or page id" htmlFor="track-page">
                <input
                  id="track-page"
                  className={inputCls}
                  placeholder="Optional"
                  value={page}
                  onChange={(e) => setPage(e.target.value)}
                />
              </Field>
              <Field label="Instagram handle" htmlFor="track-handle">
                <input
                  id="track-handle"
                  className={inputCls}
                  placeholder="Optional"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                />
              </Field>
            </div>
            {error && (
              <p role="alert" className="text-small text-red-300 mt-3">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4">
              <Button type="submit" variant="secondary" icon={Plus} disabled={saving || !brand.trim()}>
                Track brand
              </Button>
              <p className="text-small text-ink-soft min-w-0 flex-1 basis-60">
                Re-adding an existing brand updates it. The handle feeds the weekly posts scrape.
              </p>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
