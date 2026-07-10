import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CaretRight, FileText } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';

// Newest analysis brief, pinned on the dashboard. Full history at /briefs.
// Renders nothing until the briefs table exists and has a row.
export default function LatestBrief() {
  const [brief, setBrief] = useState(null);

  useEffect(() => {
    let mounted = true;
    supabase
      .from('briefs')
      .select('id, title, body, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (mounted && data?.[0]) setBrief(data[0]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!brief) return null;

  return (
    <Link
      to="/briefs"
      className="block bg-card rounded-xl3 border border-line shadow-card hover:shadow-cardhover transition-all p-5 mb-4"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-7 h-7 rounded-xl bg-coral-soft text-coral-dark flex items-center justify-center flex-shrink-0">
          <FileText size={15} weight="bold" />
        </span>
        <h2 className="font-semibold text-[15px] flex-1 min-w-0 truncate">Latest brief</h2>
        <span className="flex items-center gap-0.5 text-[13px] font-semibold text-coral-dark flex-shrink-0">
          All briefs <CaretRight size={13} weight="bold" />
        </span>
      </div>
      <p className="font-semibold text-[15px] leading-snug">{brief.title}</p>
      <p className="text-[13px] text-ink-soft mt-1 line-clamp-2 whitespace-pre-wrap">{brief.body}</p>
      <p className="text-[12px] text-ink-soft/70 mt-1.5">
        {new Date(brief.created_at).toLocaleDateString()}
      </p>
    </Link>
  );
}
