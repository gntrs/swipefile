import React, { useEffect, useState } from 'react';
import { CaretDown, CheckCircle, PlusCircle, Warning } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';

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
    supabase
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
    const { data: session } = await supabase.auth.getUser();
    const patch = {
      brand: name,
      active: true,
      added_by_email: session?.user?.email || null,
    };
    if (pageId) patch.page_id = pageId;
    const ig = handle.trim().replace(/^@/, '').toLowerCase();
    if (ig) patch.ig_handle = ig;
    const { error: err } = await supabase.from('competitors').upsert(patch, { onConflict: 'brand' });
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
    await supabase.from('competitors').update({ active: !row.active }).eq('id', row.id);
    load();
  }

  const field =
    'w-full px-3 py-2 rounded-xl border border-line bg-cream/50 text-[14px] focus:outline-none focus:border-coral';

  return (
    <div className="bg-card rounded-xl3 border border-line shadow-card px-4 py-3.5 mb-6">
      <button onClick={() => setOpenForm(!openForm)} className="w-full flex items-center gap-3 text-left">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[15px]">Auto-tracked competitors</p>
          <p className="text-[12px] text-ink-soft">
            {rows.length
              ? `${rows.filter((r) => r.active).length} of ${rows.length} scraped daily from the Meta Ad Library`
              : 'Add brands to pull their ads daily from the Meta Ad Library'}
          </p>
        </div>
        <CaretDown
          size={16}
          weight="bold"
          className={`text-ink-soft flex-shrink-0 transition-transform ${openForm ? 'rotate-180' : ''}`}
        />
      </button>

      {openForm && (
        <div className="mt-3 pt-3 border-t border-line">
          {rows.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-3">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-[13px]">
                  <button
                    onClick={() => toggle(r)}
                    title={r.active ? 'Tracking - tap to pause' : 'Paused - tap to resume'}
                    className={`flex-shrink-0 w-9 h-5 rounded-full transition-colors relative ${
                      r.active ? 'bg-mint' : 'bg-line'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-all ${
                        r.active ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                  <span className={`font-semibold truncate ${r.active ? '' : 'text-ink-soft line-through'}`}>
                    {r.brand}
                  </span>
                  {r.page_id ? (
                    <span className="flex items-center gap-1 text-emerald-700 text-[11px] flex-shrink-0">
                      <CheckCircle size={13} weight="fill" /> ads
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 text-[11px] flex-shrink-0" title="No page id yet - the importer tries to find it, or re-add the brand with its Ad Library link">
                      <Warning size={13} weight="fill" /> page id pending
                    </span>
                  )}
                  {r.ig_handle && <span className="text-ink-soft text-[11px] truncate">@{r.ig_handle}</span>}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={add} className="flex flex-col gap-2">
            <div className="grid sm:grid-cols-3 gap-2">
              <input className={field} placeholder="Brand name" value={brand} onChange={(e) => setBrand(e.target.value)} />
              <input
                className={field}
                placeholder="Ad Library link or page id (optional)"
                value={page}
                onChange={(e) => setPage(e.target.value)}
              />
              <input
                className={field}
                placeholder="Instagram handle (optional)"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
            </div>
            {error && <p className="text-[12px] text-coral-dark">{error}</p>}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || !brand.trim()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-coral text-black text-[13px] font-semibold shadow-cta disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                <PlusCircle size={16} weight="bold" /> Track brand
              </button>
              <p className="text-[11px] text-ink-soft">
                Re-adding an existing brand updates it. Handle feeds the weekly posts scrape.
              </p>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
