// Sample data for demo mode. Every brand, person and ad here is made up: the
// brands are fictional, the ad library ids start with 9999 so they can never
// point at a real ad, and every creative is drawn by art.js with a SAMPLE
// label. Loaded lazily by the demo client, so none of it ships in the main
// bundle.
import { DEMO_USER, DEMO_OWN_BRAND, demoId } from './constants.js';
import { DEMO_PALETTES } from './art.js';

const DAY = 86400000;

export const DEMO_BRANDS = [
  DEMO_OWN_BRAND,
  'Lumen Loop',
  'Kettle & Kite',
  'Northpaw',
  'Quillfox',
  'Sundial Skin',
  'Brightbarn',
  'Marrow & Moss',
];

const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// One entry per ad, in id order (ad 1 is the newest). `by` is who added it:
// 'adlib' rows came from the Ad Library importer and carry an auto verdict,
// 'you' rows were added by hand. Rival rows list how long they ran and where:
// `geo` is a country list (EU data), 'none' (checked, not in the EU) or absent
// (never checked).
const ADS = [
  // Driftwood Oats: the demo's own brand, judged on spend.
  {
    hook: 'Breakfast in 90 seconds, no pan to wash',
    copy: 'Overnight oats that are ready when you are.\nSix flavours, zero added sugar.',
    verdict: 'testing', by: 'you', tags: ['static', 'recently-added'], angle: 'offer',
    own: { spend: 18, ctr: 2.4, cpc: 0.62, impressions: 2100, clicks: 50, ad_name: 'DO_breakfast_static_v3' },
  },
  {
    hook: '"I stopped skipping breakfast." 4,000 reviews say the same',
    copy: 'Real customers, real mornings.\nTry the sampler box and keep the one you love.\nFree shipping over 30.',
    verdict: 'winner', by: 'you', tags: ['ugc', 'testimonial', 'recently-added'], angle: 'social_proof', starred: true, ai: true,
    own: { spend: 240, roas: 2.1, ctr: 3.1, cpc: 0.48, impressions: 16100, clicks: 500, ad_name: 'DO_reviews_ugc_v1' },
  },
  {
    hook: 'Why we started milling our own oats',
    copy: 'It began in a small kitchen with one grinder.\nThis is the story of our first thousand jars.',
    verdict: 'loser', by: 'you', tags: ['founder'], angle: 'story',
    own: { spend: 95, roas: 0.6, ctr: 0.9, cpc: 1.9, impressions: 5600, clicks: 50, ad_name: 'DO_founder_video_v2' },
  },
  // Lumen Loop
  {
    hook: 'The lamp that dims itself when your eyes get tired',
    copy: 'Light that follows the sun, all day, on its own.\nSet it once.',
    verdict: 'winner', by: 'adlib', tags: ['static', 'recently-added'], angle: 'curiosity', starred: true, ai: true,
    run: { live: true, days: 96 }, geo: ['DE', 'NL', 'FR'],
  },
  {
    hook: 'Headaches after 3pm? Check your desk light',
    copy: 'Most desk lamps flicker faster than you can see.\nOurs does not.',
    verdict: 'testing', by: 'adlib', tags: ['how-to'], angle: 'pain',
    run: { live: true, days: 12 }, geo: ['ES', 'IT'],
  },
  {
    hook: 'How to set up a desk that is easy on your eyes',
    copy: 'Three changes, ten minutes, no new furniture.\n1. Move the light.\n2. Warm the colour.\n3. Lower the screen.',
    verdict: 'unsure', by: 'you', tags: ['how-to', 'carousel'], angle: 'how_to',
    run: { live: false, days: 34 }, geo: 'none',
  },
  // Kettle & Kite
  {
    hook: 'Tea sommeliers picked these five. You can taste why',
    copy: 'Blended by people who taste 200 teas a week.\nStart with the flight of five.',
    verdict: 'winner', by: 'adlib', tags: ['review'], angle: 'authority',
    run: { live: false, days: 118, endedAgo: 10 }, geo: ['FR', 'DE', 'PL'],
  },
  {
    hook: 'Last 48 hours: the winter blend is leaving',
    copy: 'Once it is gone, it is gone until next year.',
    verdict: 'loser', by: 'adlib', tags: ['seasonal', 'offer'], angle: 'urgency',
    run: { live: false, days: 9 }, geo: 'none',
  },
  {
    hook: 'Bagged tea vs loose leaf: the cup test',
    copy: 'Same water, same minute, two very different cups.\nSee the side by side.',
    verdict: 'testing', by: 'you', tags: ['before-after'], angle: 'comparison',
    run: { live: true, days: 21 },
  },
  // Northpaw
  {
    hook: 'For dogs who pull and owners who are done with it',
    copy: 'A harness that turns a tug into a turn.\nMade for big dogs and busy mornings.',
    verdict: 'winner', by: 'you', tags: ['ugc'], angle: 'identity', human: true,
    run: { live: true, days: 74 }, geo: ['SE', 'NL'],
  },
  {
    hook: 'Muddy paws ruin more floors than rain does',
    copy: 'A towel that dries a paw in one squeeze.',
    verdict: 'unsure', by: 'adlib', tags: ['static'], angle: 'pain',
    run: { live: false, days: 45 }, geo: ['DE', 'IT', 'PT'],
  },
  {
    hook: 'Buy one bed, get the cover free this week',
    copy: 'Washable, chew tested, three sizes.\nCover included while stock lasts.',
    verdict: 'testing', by: 'adlib', tags: ['offer'], angle: 'offer',
    run: { live: true, days: 33 }, geo: 'none',
  },
  // Quillfox
  {
    hook: 'The notebook I have refilled for six years',
    copy: 'One cover, endless refills.\nThis is what a long term habit looks like.',
    verdict: 'winner', by: 'adlib', tags: ['founder', 'review'], angle: 'story', starred: true, ai: true,
    run: { live: true, days: 140 }, geo: ['FR', 'ES', 'DE', 'IT'],
  },
  {
    hook: 'What do pro planners write on page one?',
    copy: 'We asked forty of them. The answers surprised us.',
    verdict: 'unsure', by: 'you', tags: ['carousel'], angle: 'curiosity',
    run: { live: true, days: 5 }, geo: ['NL', 'SE'],
  },
  {
    hook: 'Pens restock Friday. The blue ink sells out first',
    copy: 'Set a reminder or join the list.',
    verdict: 'loser', by: 'you', tags: ['offer'], angle: 'urgency',
    run: { live: false, days: 14 }, geo: 'none',
  },
  // Sundial Skin
  {
    hook: '12,000 five star reviews for a sunscreen you forget you wear',
    copy: 'No white cast, no sting, no shine.\nSPF 50 that feels like nothing.',
    verdict: 'winner', by: 'adlib', tags: ['review', 'testimonial'], angle: 'social_proof',
    run: { live: true, days: 63 }, geo: ['ES', 'PT', 'FR'],
  },
  {
    hook: 'How much sunscreen is actually enough? Two fingers',
    copy: 'The two finger rule, shown on camera.\nMost people use a third of what they need.',
    verdict: 'testing', by: 'adlib', tags: ['how-to', 'ugc'], angle: 'how_to', format: 'video',
    run: { live: true, days: 18 }, geo: ['IT', 'ES'],
  },
  {
    hook: 'Day 1 vs day 30 with the same moisturiser',
    copy: 'Same light, same camera, one month apart.',
    verdict: 'unsure', by: 'you', tags: ['before-after'], angle: 'comparison',
    run: { live: false, days: 27 },
  },
  // Brightbarn
  {
    hook: 'One spray, every surface, no streaks',
    copy: 'Glass, steel, stone and wood.\nRefill pouches cut the plastic by 80 percent.',
    verdict: 'winner', by: 'you', tags: ['ugc', 'before-after'], starred: true, format: 'video',
    run: { live: false, days: 101, endedAgo: 20 }, geo: ['DE', 'PL', 'NL'],
  },
  {
    hook: 'Spring clean kit, 30 percent off today',
    copy: 'Everything for a weekend reset in one box.',
    verdict: 'loser', by: 'adlib', tags: ['seasonal', 'offer'],
    run: { live: false, days: 2 }, geo: 'none',
  },
  {
    hook: 'The cleaning order that saves an hour',
    copy: 'Top to bottom, dry to wet. Here is the full routine.',
    verdict: 'unsure', by: 'adlib', tags: ['how-to'], format: 'video',
    run: { live: false, days: 60 }, geo: ['FR', 'IT'],
  },
  // Marrow & Moss
  {
    hook: 'Plants that survive a forgetful owner',
    copy: 'Six picks that are fine with a missed week of water.',
    verdict: 'testing', by: 'you', tags: ['carousel'],
    run: { live: true, days: 40 },
  },
  {
    hook: 'A candle that smells like the forest after rain',
    copy: 'Poured by hand in small batches.',
    verdict: 'unsure', by: 'you', tags: ['static'], format: 'video',
    run: { live: true, days: 8 }, geo: 'none',
  },
  {
    hook: 'Your windowsill is a greenhouse. Here is what to grow',
    copy: 'Herbs, succulents and one surprise.\nFree care card with every pot.',
    verdict: 'unsure', by: 'adlib', tags: ['how-to', 'offer'],
    run: { live: false, days: 52 }, geo: ['SE', 'DE'],
  },
];

const SAMPLE_AI = {
  2: {
    hook: 'A customer quote plus a big review count',
    angle: 'social_proof',
    format: 'UGC video with captions',
    audience: 'Busy people who skip breakfast',
    why_it_works: 'It opens with a line the viewer has said themselves, then proves it is common with a number.',
    weaknesses: 'The offer arrives late and the free shipping threshold is easy to miss.',
    remix_ideas: ['Lead with the review count on screen', 'Cut to the product in the first two seconds', 'Test a flavour quiz as the call to action'],
  },
  4: {
    hook: 'A product that does something unexpected on its own',
    angle: 'curiosity',
    format: 'Static image',
    audience: 'People who work at a desk all day',
    why_it_works: 'The promise is specific and a little surprising, so the viewer wants to see how it works.',
    weaknesses: 'No proof in the image itself.',
    remix_ideas: ['Show the light shifting over a day in a short loop', 'Add one number, like hours of screen time'],
  },
  13: {
    hook: 'A long personal habit as proof of quality',
    angle: 'story',
    format: 'Static image with a handwritten note',
    audience: 'Planners and journal keepers',
    why_it_works: 'Six years of use says more than any claim about paper quality.',
    weaknesses: 'The refill price is not shown.',
    remix_ideas: ['Show the stack of filled refills', 'Pair the story with the refill price'],
  },
};

const EU_SHARE_BASE = 0.3;
const EU_SHARE_PER_COUNTRY = 0.12;

export function buildSeed(now = Date.now()) {
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const ymd = (msAgo) => new Date(now - msAgo).toISOString().slice(0, 10);

  const art = {};
  const ads = ADS.map((spec, index) => {
    const n = index + 1;
    const id = demoId('ads', n);
    const brandIndex = Math.floor(index / 3);
    const brand = DEMO_BRANDS[brandIndex];
    const own = brand === DEMO_OWN_BRAND;
    const hasMedia = n <= 16;
    const mediaPath = hasMedia ? `demo/${id}.svg` : null;
    if (mediaPath) art[mediaPath] = { brand, hook: spec.hook, palette: DEMO_PALETTES[brandIndex] };

    const metrics = { source: 'demo' };
    let status = 'running';
    let geoStatus = 'unknown';
    let countries = [];
    let euReachValue = null;

    if (own && spec.own) {
      Object.assign(metrics, spec.own);
    }
    if (!own && spec.run) {
      const { live, days, endedAgo = 5 } = spec.run;
      const startedAgo = (live ? days : days + endedAgo) * DAY;
      // Reach grows with the days an ad ran, at a steady daily rate that
      // differs per ad, so a two day test never out reaches a four month run.
      const perDay = 180 + ((n * 37) % 11) * 40;
      const reach = days * perDay;
      metrics.ad_library_id = `99990000${String(n).padStart(7, '0')}`;
      metrics.days_running = days;
      metrics.live = live;
      metrics.started_running = iso(startedAgo);
      metrics.last_synced = iso(DAY + n * 3600000);
      metrics.reach = reach;
      metrics.reach_per_day = perDay;
      status = live ? 'running' : 'dead';
      if (Array.isArray(spec.geo)) {
        geoStatus = 'eu';
        countries = [...spec.geo];
        // The EU part of the reach: never more than the whole.
        euReachValue = Math.round(reach * Math.min(0.9, EU_SHARE_BASE + countries.length * EU_SHARE_PER_COUNTRY));
      } else if (spec.geo === 'none') {
        geoStatus = 'none';
      }
    }
    if (spec.by === 'adlib') metrics.auto_verdict = spec.verdict;
    if (spec.starred) metrics.starred = true;
    if (spec.human) {
      metrics.verdict_by = 'human';
      metrics.verdict_at = iso(3 * DAY);
    }
    if (spec.angle) {
      metrics.angle = spec.angle;
      metrics.angle_source = 'ai';
      metrics.angle_model = 'sample';
      metrics.angle_at = iso(2 * DAY);
    }
    if (spec.ai && SAMPLE_AI[n]) {
      metrics.ai = { ...SAMPLE_AI[n], model: 'sample', analyzed_at: iso(2 * DAY) };
    }

    return {
      id,
      brand,
      platform: n % 4 === 0 ? 'Instagram' : 'Facebook',
      format: spec.format || 'image',
      media_path: mediaPath,
      hook: spec.hook,
      ad_copy: spec.copy,
      landing_url: `https://example.com/${slug(brand)}`,
      status,
      verdict: spec.verdict,
      tags: [...spec.tags],
      metrics,
      geo_status: geoStatus,
      countries,
      eu_reach: euReachValue,
      geo_synced_at: geoStatus === 'unknown' ? null : iso(DAY),
      added_by: spec.by === 'adlib' ? null : DEMO_USER.id,
      added_by_email: spec.by === 'adlib' ? 'adlib@import' : DEMO_USER.email,
      created_at: iso(index * 2.5 * DAY + 3600000),
    };
  });

  const adId = (n) => demoId('ads', n);

  const team = [
    { id: DEMO_USER.id, email: DEMO_USER.email, nickname: 'You', avatar_path: null, role: 'admin', created_at: iso(60 * DAY) },
  ];

  const briefs = [
    {
      id: demoId('briefs', 1),
      title: 'What the long runners have in common',
      body: [
        'Three rival ads ran for over two months. All three open with a specific, checkable claim and show the product in use within the first frame.',
        '',
        'Try next: one static with a review count up front, one short video that shows the product working without a voice over.',
        '',
        '>>> AI EDITOR PROMPT',
        'Write three hooks under 60 characters for a breakfast brand. Each one opens with a specific number or a customer quote. No exclamation marks.',
        '<<< END PROMPT',
      ].join('\n'),
      source_ad_ids: [adId(4), adId(13), adId(16)],
      added_by_email: DEMO_USER.email,
      created_at: iso(4 * DAY),
    },
    {
      id: demoId('briefs', 2),
      title: 'Note: test the founder story again in spring',
      body: 'The founder video lost money on cold traffic. Retry it on people who already visited the site.',
      source_ad_ids: [],
      added_by_email: DEMO_USER.email,
      created_at: iso(12 * DAY),
    },
  ];

  const competitors = DEMO_BRANDS.slice(1).map((brand, i) => ({
    id: demoId('competitors', i + 1),
    brand,
    page_id: i === 2 || i === 5 ? null : `999910000000${String(i + 1).padStart(2, '0')}`,
    ig_handle: slug(brand).replace(/-/g, ''),
    active: true,
    notes: null,
    added_by_email: DEMO_USER.email,
    created_at: iso((50 - i) * DAY),
    last_scraped_at: iso(DAY),
  }));

  const comments = [
    { id: demoId('comments', 1), ad_id: adId(1), post_id: null, body: 'Try this one with the price on the image.', author_id: DEMO_USER.id, author_email: DEMO_USER.email, created_at: iso(DAY) },
    { id: demoId('comments', 2), ad_id: adId(2), post_id: null, body: 'Best cost per click we have had. Keep it running.', author_id: DEMO_USER.id, author_email: DEMO_USER.email, created_at: iso(2 * DAY) },
    { id: demoId('comments', 3), ad_id: adId(2), post_id: null, body: 'Make a static version with the same quote.', author_id: DEMO_USER.id, author_email: DEMO_USER.email, created_at: iso(3 * DAY) },
  ];

  const posts = [
    {
      id: demoId('posts', 1), platform: 'Instagram', post_type: 'reel', url: 'https://example.com/driftwood-oats/reel',
      title: 'Three toppings in thirty seconds', copy: 'Which one are you trying first?', media_path: null,
      posted_at: ymd(5 * DAY), verdict: 'winner', tags: ['how-to'], metrics: { views: 18200, likes: 940, comments: 61, shares: 88, saves: 210 },
      notes: null, brand: null, added_by: DEMO_USER.id, added_by_email: DEMO_USER.email, created_at: iso(5 * DAY),
    },
    {
      id: demoId('posts', 2), platform: 'Instagram', post_type: 'post', url: 'https://example.com/quillfox/post',
      title: 'Desk tour with the refill system', copy: 'Show us your page one.', media_path: null,
      posted_at: ymd(9 * DAY), verdict: 'unsure', tags: ['carousel'], metrics: { views: 7400, likes: 320, comments: 18 },
      notes: null, brand: 'Quillfox', added_by: DEMO_USER.id, added_by_email: DEMO_USER.email, created_at: iso(9 * DAY),
    },
    {
      id: demoId('posts', 3), platform: 'TikTok', post_type: 'video', url: 'https://example.com/sundial-skin/video',
      title: 'The two finger rule', copy: 'Most people use a third of what they need.', media_path: null,
      posted_at: ymd(14 * DAY), verdict: 'winner', tags: ['how-to'], metrics: { views: 52000, likes: 4100, comments: 230, shares: 610 },
      notes: null, brand: 'Sundial Skin', added_by: DEMO_USER.id, added_by_email: DEMO_USER.email, created_at: iso(14 * DAY),
    },
  ];

  const goals = [
    { id: demoId('goals', 1), title: 'Save ten rival ads that ran over 60 days', horizon: '1w', done: false, deadline: ymd(-5 * DAY), urgent: false, brief_id: null, created_by_email: DEMO_USER.email, created_at: iso(2 * DAY) },
    { id: demoId('goals', 2), title: 'Ship two new hooks from the long runners brief', horizon: '1m', done: false, deadline: null, urgent: true, brief_id: demoId('briefs', 1), created_by_email: DEMO_USER.email, created_at: iso(4 * DAY) },
  ];

  const chatMessages = [
    { id: demoId('chat_messages', 1), body: 'Added the Quillfox refill ad, it has run for 140 days.', author_id: DEMO_USER.id, author_email: DEMO_USER.email, mentions: [], created_at: iso(DAY) },
    { id: demoId('chat_messages', 2), body: 'Brief for next week is in Briefs.', author_id: DEMO_USER.id, author_email: DEMO_USER.email, mentions: [], created_at: iso(3600000) },
  ];

  return {
    tables: {
      ads,
      team,
      briefs,
      competitors,
      comments,
      posts,
      goals,
      chat_messages: chatMessages,
      chat_reactions: [],
    },
    art,
  };
}
