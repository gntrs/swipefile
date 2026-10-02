// Fixed values for demo mode. Kept apart from the seed so the app can import
// them without pulling the sample data into the main bundle.

export const DEMO_USER = { id: '00000000-0000-4000-8000-00000000d3e0', email: 'demo@example.com' };
export const DEMO_OWN_BRAND = 'Driftwood Oats';

// Each table gets its own id block so a demo id says what it points at.
const BLOCKS = {
  ads: 0,
  briefs: 1,
  competitors: 2,
  comments: 3,
  posts: 4,
  goals: 5,
  chat_messages: 6,
};

// demoId('ads', 1) -> 00000000-0000-4000-8000-000000000001
// demoId('briefs', 2) -> 00000000-0000-4000-8000-000000000102
export function demoId(table, n) {
  const block = BLOCKS[table];
  if (block === undefined) throw new Error(`demoId: unknown table ${table}`);
  const tail = `${block ? String(block) : ''}${String(n).padStart(2, '0')}`;
  return `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
}

export const AD_1 = demoId('ads', 1);
export const AD_2 = demoId('ads', 2);
export const POST_1 = demoId('posts', 1);

// What an edge function call answers in demo mode. Same text as the AI client's
// demo message, kept here so the demo client needs no other import.
export const DEMO_FUNCTIONS_MESSAGE =
  'AI runs in your own Supabase project. Connect one and deploy the ai function to use it.';
