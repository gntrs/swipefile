// Deno entry for fetch-media. All the logic is in handler.js, which vitest
// also runs in Node. Deploy: supabase functions deploy fetch-media
// Optional secrets: FETCH_MEDIA_HOSTS (comma list), FETCH_MEDIA_MAX_MB (1 to 50).
import { handleRequest } from './handler.js';

Deno.serve((req: Request) =>
  handleRequest(req, {
    fetch: (input: string, init?: RequestInit) => fetch(input, init),
    env: (name: string) => Deno.env.get(name),
  })
);
