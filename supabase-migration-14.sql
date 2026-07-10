-- Migration 14: contact emails for scraped creator leads.
-- Run in the Supabase SQL editor after migration 13. Safe to re-run.
--
-- scripts/scrape-emails.mjs fills these: it looks for the business email a
-- creator publishes (bio snippet already stored, their linktr.ee / beacons
-- page, then one Brave search) and records where it found it.
-- email_checked_at set + email null = looked and found nothing, do not retry.

alter table public.creator_leads add column if not exists email text;
alter table public.creator_leads add column if not exists email_source text;
alter table public.creator_leads add column if not exists email_checked_at timestamptz;
