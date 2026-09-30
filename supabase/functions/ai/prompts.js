// The three answer shapes the model must return, and the prompts that ask for
// them. Schemas use only type, properties, required, items, enum and
// additionalProperties: lengths and counts are checked by the handler.
import { ANGLES, ANGLE_IDS } from '../_shared/angles.js';

export const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['hook', 'angle', 'format', 'audience', 'why_it_works', 'weaknesses', 'remix_ideas'],
  properties: {
    hook: { type: 'string' },
    angle: { type: 'string', enum: ANGLE_IDS },
    format: { type: 'string' },
    audience: { type: 'string' },
    why_it_works: { type: 'string' },
    weaknesses: { type: 'string' },
    remix_ideas: { type: 'array', items: { type: 'string' } },
  },
};

export const CLASSIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['i', 'angle'],
        properties: { i: { type: 'integer' }, angle: { type: 'string', enum: ANGLE_IDS } },
      },
    },
  },
};

export const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: { title: { type: 'string' }, body: { type: 'string' } },
};

const clean = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const cut = (v, n) => {
  const s = clean(v);
  return s.length > n ? `${s.slice(0, n)}...` : s;
};
const angleList = () => ANGLES.map((a) => `- ${a.id}: ${a.label}, ${a.hint}`).join('\n');
const line = (label, value) => `${label}: ${clean(value) || 'not given'}`;

// The line a hook is known by: the headline, else the first line of the copy.
export function hookLine(ad, max = 200) {
  const hook = clean(ad?.hook);
  if (hook) return cut(hook, max);
  const first = clean(ad?.ad_copy).split('\n').map((s) => s.trim()).find(Boolean) || '';
  return cut(first, max);
}

function runningLine(metrics = {}) {
  const days = Number(metrics.days_running);
  const parts = [];
  if (Number.isFinite(days) && days > 0) parts.push(`${Math.round(days)} days`);
  if (metrics.live === true) parts.push('still running');
  else if (metrics.live === false) parts.push('stopped');
  return parts.length ? parts.join(', ') : 'unknown';
}

const ANALYZE_SYSTEM =
  'You are a direct response creative strategist. Explain, plainly and specifically, why this ad could work and where it is weak. ' +
  'Base every point on what is in the ad: its words, the image when one is attached, the offer, the landing page address. ' +
  'Never invent performance numbers. Write short plain sentences without dashes. ' +
  'Pick the angle from the list by its id. Give one to five remix ideas, each one line.';

// -> { system, text }
export function analyzePrompt(ad, { imageAttached } = {}) {
  const video = clean(ad?.format).toLowerCase() === 'video';
  const tags = Array.isArray(ad?.tags) ? ad.tags.filter(Boolean).join(', ') : '';
  const lines = [
    line('Brand', ad?.brand),
    line('Headline', ad?.hook),
    line('Primary text', cut(ad?.ad_copy, 3000)),
    line('Landing page', ad?.landing_url),
    line('Format', ad?.format || 'image'),
  ];
  if (video) lines.push('The video itself is not attached; judge the copy.');
  else if (imageAttached) lines.push('The ad image is attached above.');
  else lines.push('No image is attached; judge the copy.');
  lines.push(
    line('Platform', ad?.platform),
    line('Verdict so far', ad?.verdict),
    `Days running: ${runningLine(ad?.metrics || {})}`,
    line('Tags', tags),
    '',
    'Angles:',
    angleList(),
  );
  return { system: ANALYZE_SYSTEM, text: lines.join('\n') };
}

const CLASSIFY_SYSTEM =
  'You label the persuasion angle of ad hooks. For each numbered hook choose exactly one angle id from the list. ' +
  'Use other only when nothing fits. Answer with one item per hook, using its number as i.';

// hooks: string[], numbered from 0. -> { system, text }
export function classifyPrompt(hooks) {
  const list = (hooks || []).map((h, i) => `${i}: ${clean(h).replace(/\s+/g, ' ')}`).join('\n');
  return { system: CLASSIFY_SYSTEM, text: `Angles:\n${angleList()}\n\nHooks:\n${list}` };
}

const BRIEF_SYSTEM =
  'You are a creative strategist writing a brief for the next round of ads, using only the source ads and hooks given. ' +
  'Write plain text a designer or video editor can act on, in short labelled paragraphs: Goal, Audience, Angle, ' +
  'Hooks to test (three to five lines), Visual, Call to action, Avoid. No markdown headings, no emoji, no dashes. ' +
  'When a video would suit, end with a prompt for an AI video editor between a line >>> AI EDITOR PROMPT and a line <<< END PROMPT. ' +
  'The title is short and says what the brief is for.';

// -> { system, text }
export function briefPrompt({ ads = [], hooks = [], notes } = {}) {
  const parts = [];
  parts.push(`Notes from the person asking: ${clean(notes) || 'none'}`);
  if (ads.length) {
    parts.push('', 'Source ads:');
    ads.forEach((ad, i) => {
      const m = ad?.metrics || {};
      const angle = ANGLES.find((a) => a.id === m.angle);
      const rows = [
        `Ad ${i + 1}`,
        line('Brand', ad?.brand),
        line('Headline', ad?.hook),
        line('Copy', cut(ad?.ad_copy, 600)),
        line('Verdict', ad?.verdict),
        `Days running: ${runningLine(m)}`,
        line('Angle', angle ? angle.label : ''),
      ];
      if (m.ai && typeof m.ai.why_it_works === 'string' && m.ai.why_it_works.trim()) {
        rows.push(line('Why it works', cut(m.ai.why_it_works, 600)));
      }
      parts.push(rows.join('\n'), '');
    });
  }
  if (hooks.length) {
    parts.push('Hooks:');
    hooks.forEach((h) => parts.push(`- ${clean(h).replace(/\s+/g, ' ')}`));
  }
  return { system: BRIEF_SYSTEM, text: parts.join('\n').trim() };
}
