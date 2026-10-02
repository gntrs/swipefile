// Deno entry for the ai edge function. All the logic lives in handler.js,
// which runs anywhere; this file only wires in the runtime.
//
// Deploy: supabase functions deploy ai
// Key:    supabase secrets set ANTHROPIC_API_KEY=your-key
// Optional secrets: AI_MODEL, AI_BATCH_LIMIT (1 to 50, default 20).
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { handle } from './handler.js';

Deno.serve((req: Request) =>
  handle(req, {
    env: (name: string) => Deno.env.get(name),
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
    makeClient: (apiKey: string) => new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 }),
  })
);
