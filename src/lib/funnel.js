// Funnel stages for the Site funnel card (ops module). Set VITE_FUNNEL_STAGES
// to `event:Label` pairs, comma separated, in funnel order. The event names
// must match what scripts/snapshot-kpis.mjs stores (its FUNNEL_EVENTS).
export const DEFAULT_FUNNEL_STAGES =
  'landing_cta_clicked:Landing CTA,signup_started:Sign up started,signup_completed:Sign up done,user_registered:Registered,payment_initiated:Checkout started,payment_completed:Paid';

export function parseFunnelStages(raw) {
  const stages = [];
  for (const part of String(raw || '').split(',')) {
    const [key, ...rest] = part.split(':');
    const k = (key || '').trim();
    if (!k || stages.some((s) => s.key === k)) continue;
    stages.push({ key: k, label: rest.join(':').trim() || k });
  }
  return stages.length ? stages : parseFunnelStages(DEFAULT_FUNNEL_STAGES);
}
