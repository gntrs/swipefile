// The app's side of the ai edge function. None of these throw: every result
// carries `ok`, and a failure carries a `code` and a `message` fit to show.
//
// This build has no AI yet, so every call answers `not_built`. The exported
// names, arguments and result shapes are the ones the full client keeps, so
// the pages that call them do not change when it lands.

export const AI_FIX_TEXT = {
  no_key: 'Add ANTHROPIC_API_KEY to your edge function: supabase secrets set ANTHROPIC_API_KEY=your-key',
  bad_key: 'Anthropic rejected ANTHROPIC_API_KEY. Set a valid key: supabase secrets set ANTHROPIC_API_KEY=your-key',
  not_deployed: 'Deploy the ai edge function: supabase functions deploy ai',
  demo: 'AI runs in your own Supabase project. Connect one and deploy the ai function to use it.',
  signed_out: 'Sign in to use AI.',
  not_built: 'AI is not part of this build yet.',
};

const notBuilt = () => ({ ok: false, code: 'not_built', message: AI_FIX_TEXT.not_built });

// -> { ok, state, message, model?, batchLimit? }
export async function aiStatus({ force = false } = {}) {
  return { ok: false, state: 'not_built', message: AI_FIX_TEXT.not_built };
}

// -> { ok: true, analysis, ad } | { ok: false, code, message }
export async function analyzeAd(adId) {
  return notBuilt();
}

// -> { ok: true, classified, remaining, capped, limit } | { ok: false, code, message }
export async function classifyAds({ adIds, limit } = {}) {
  return notBuilt();
}

// -> { ok: true, brief } | { ok: false, code, message }
export async function buildBrief({ adIds = [], hooks = [], title, notes } = {}) {
  return notBuilt();
}

// -> { ok: true, count } | { ok: false, code, message }
export async function countUnclassified() {
  return notBuilt();
}

// Fire and forget angle tagging after a save. Does nothing in this build.
export function classifyInBackground(adIds) {}
