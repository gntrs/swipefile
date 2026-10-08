import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { db } from '@/lib/db';
import { useTeam } from '@/contexts/TeamContext';
import { RowsSkeleton } from '@/components/Skeleton';
import { compactNum } from '@/lib/format';
import { shortDate } from '@/features/ai/dates';
import {
  Page,
  PageHeader,
  Button,
  Panel,
  List,
  Row,
  Meta,
  Badge,
  EmptyState,
  Segmented,
  Toolbar,
  SearchField,
} from '@/components/ui';

const PLATFORMS = ['all', 'Facebook', 'Instagram', 'TikTok', 'YouTube', 'Other'];
const PLATFORM_OPTIONS = PLATFORMS.map((p) => ({ id: p, label: p === 'all' ? 'All' : p }));

const VERDICT = {
  winner: { label: 'Winner', tone: 'good' },
  loser: { label: 'Loser', tone: 'bad' },
  testing: { label: 'Testing', tone: 'warn' },
  unsure: { label: 'Unsure', tone: 'neutral' },
};

// The numbers each row shows, in fixed width columns so they line up row to row.
const NUMBERS = [
  ['views', 'Views'],
  ['likes', 'Likes'],
];

const metric = (p, key) => p?.metrics?.[key] ?? null;

function Numbers({ post, className = '' }) {
  return (
    <span className={className}>
      {NUMBERS.map(([key, label]) => {
        const v = metric(post, key);
        return (
          <span key={key} className="flex flex-col w-16 text-left sm:text-right">
            <span className={`num text-num ${v == null ? 'text-ink-soft' : 'text-ink'}`}>{v == null ? '-' : compactNum(v)}</span>
            <span className="text-meta font-medium text-ink-soft">{label}</span>
          </span>
        );
      })}
    </span>
  );
}

export default function Posts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('all');
  const { displayName } = useTeam();

  useEffect(() => {
    let mounted = true;
    db
      .from('posts')
      .select('*')
      .order('posted_at', { ascending: false, nullsFirst: false })
      .then(({ data }) => {
        if (!mounted) return;
        setPosts(data || []);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return posts.filter((p) => {
      if (platform !== 'all' && p.platform !== platform) return false;
      if (!term) return true;
      return [p.title, p.copy, p.platform, p.brand, ...(p.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [posts, q, platform]);

  return (
    <Page id="posts">
      <PageHeader
        title="Organic posts"
        context={`${posts.length} logged`}
        actions={
          <Button variant="primary" icon={Plus} to="/posts/add">
            Add post
          </Button>
        }
      />

      <Toolbar
        search={<SearchField value={q} onChange={setQ} placeholder="Search title, copy, tags..." label="Search posts" />}
      >
        <Segmented label="Platform" options={PLATFORM_OPTIONS} value={platform} onChange={setPlatform} />
      </Toolbar>

      {loading ? (
        <RowsSkeleton rows={3} />
      ) : filtered.length === 0 ? (
        <Panel>
          {posts.length === 0 ? (
            <EmptyState
              title="No posts logged yet."
              action={
                <Button variant="secondary" to="/posts/add">
                  Add your first post
                </Button>
              }
            />
          ) : (
            <EmptyState title="No posts match." text="Try another word or platform." />
          )}
        </Panel>
      ) : (
        <Panel flush>
          <List>
            {filtered.map((p) => {
              const v = VERDICT[p.verdict] || VERDICT.unsure;
              return (
                <Row
                  key={p.id}
                  to={`/post/${p.id}`}
                  title={
                    <>
                      <span className="mr-2">{p.title || 'Untitled post'}</span>
                      <Badge tone={v.tone} className="align-[0.1em]">
                        {v.label}
                      </Badge>
                    </>
                  }
                  meta={
                    <>
                      <Meta
                        items={[
                          p.brand && (
                            <span key="b" className="text-ink">
                              {p.brand}
                            </span>
                          ),
                          p.platform,
                          p.post_type,
                          shortDate(p.posted_at),
                          p.added_by_email && <span key="by" className="whitespace-nowrap">by {displayName(p.added_by_email)}</span>,
                        ]}
                      />
                      <Numbers post={p} className="flex gap-4 mt-2 sm:hidden" />
                    </>
                  }
                  trailing={<Numbers post={p} className="hidden sm:flex gap-4" />}
                />
              );
            })}
          </List>
        </Panel>
      )}
    </Page>
  );
}
