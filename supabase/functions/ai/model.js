// One call to the model, with every failure mapped to the status and code the
// app understands. Runtime agnostic: the Anthropic client is passed in.

// The two dash characters the app never shows. Built from their code points so
// no file in the repo carries the characters themselves.
const DASH_CLASS = '[' + String.fromCharCode(0x2014, 0x2013) + ']';
const DIGIT_RANGE = new RegExp('(\\d)[ \\t]*' + DASH_CLASS + '[ \\t]*(?=\\d)', 'g');
const ANY_DASH = new RegExp('[ \\t]*' + DASH_CLASS + '[ \\t]*', 'g');
const LINE_START_DASH = new RegExp('^([ \\t]*)' + DASH_CLASS + '[ \\t]*', 'gm');
const LINE_END_DASH = new RegExp('[ \\t]*' + DASH_CLASS + '[ \\t]*$', 'gm');

// Replaces the two dash characters: between digits with ' to ' (3 to 5),
// anywhere else inside a line with ', '. A dash that opens or ends a line is
// dropped, so a list marker does not turn into a stray comma. Then collapses
// doubled commas and double spaces inside a line (indentation stays).
export function sanitize(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(LINE_START_DASH, '$1')
    .replace(LINE_END_DASH, '')
    .replace(DIGIT_RANGE, '$1 to ')
    .replace(ANY_DASH, ', ')
    .replace(/,(?:[ \t]*,)+/g, ',')
    .replace(/(\S) {2,}/g, '$1 ');
}

// The API's own message when it has one, else the SDK's.
function apiMessage(err) {
  const inner = err?.error?.error?.message || err?.error?.message;
  if (typeof inner === 'string' && inner) return inner;
  return typeof err?.message === 'string' && err.message ? err.message : 'The model call failed.';
}

function mapThrown(err, model) {
  const status = Number(err?.status) || 0;
  if (status === 401 || status === 403) {
    return {
      ok: false,
      status: 412,
      code: 'bad_key',
      message: 'Anthropic rejected ANTHROPIC_API_KEY. Set a valid key: supabase secrets set ANTHROPIC_API_KEY=your-key',
    };
  }
  if (status === 404) {
    return { ok: false, status: 502, code: 'upstream', message: `Model ${model} not found. Set AI_MODEL to a current model id.` };
  }
  if (status === 429) {
    return { ok: false, status: 429, code: 'rate_limited', message: 'Anthropic is rate limiting this key. Wait a minute and try again.' };
  }
  if (status === 400) {
    return { ok: false, status: 502, code: 'upstream', message: apiMessage(err), upstreamStatus: 400 };
  }
  return {
    ok: false,
    status: 502,
    code: 'upstream',
    message: status ? `Anthropic answered ${status}. Try again in a moment.` : 'Could not reach Anthropic. Try again in a moment.',
    upstreamStatus: status || undefined,
  };
}

// -> { ok: true, data } | { ok: false, status, code, message, category? }
export async function callModel(client, { model, system, content, schema, effort, maxTokens }) {
  let msg;
  try {
    // No `thinking` field: the model decides, and an explicit disable is
    // refused on current models.
    msg = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort, format: { type: 'json_schema', schema } },
    });
  } catch (err) {
    return mapThrown(err, model);
  }
  if (msg?.stop_reason === 'refusal') {
    const category = msg?.stop_details?.category;
    return {
      ok: false,
      status: 422,
      code: 'refused',
      message: 'The model declined this request.',
      ...(category ? { category } : {}),
    };
  }
  if (msg?.stop_reason === 'max_tokens') {
    return { ok: false, status: 502, code: 'truncated', message: 'The answer was cut off before it finished. Try again.' };
  }
  const block = Array.isArray(msg?.content) ? msg.content.find((b) => b?.type === 'text') : null;
  if (!block || typeof block.text !== 'string') {
    return { ok: false, status: 502, code: 'bad_output', message: 'The model sent no answer. Try again.' };
  }
  try {
    return { ok: true, data: JSON.parse(block.text) };
  } catch {
    return { ok: false, status: 502, code: 'bad_output', message: 'The model sent an answer that is not valid JSON. Try again.' };
  }
}
