// "gm" listener. Runs on the WSL cron every minute. Polls Telegram for messages
// the owner sends the bot; when they say "gm" (or morning / intel / news), it sends
// today's startup-radar digest IF it hasn't already gone out this morning. Saying
// "refresh" / "again" forces a fresh pull regardless.
//
// This is the only thing that READS from the bot (the bot is otherwise send-only,
// no webhook), so getUpdates is ours to use — offset is tracked on disk so nothing
// gets processed twice.
//
//   node scripts/gm-listener.mjs           # one poll (cron uses this)
//   node scripts/gm-listener.mjs --peek     # show pending updates, act on nothing
//
// Env (.env): TG_BOT_TOKEN, TG_CHAT_ID (only that chat is listened to).

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const PEEK = process.argv.includes('--peek');
const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT = String(process.env.TG_CHAT_ID || '');

const OFFSET_PATH = path.resolve('.claude-data/gm-offset.json');
const LOCK_PATH = path.resolve('.claude-data/gm-lock');
const SENT_PATH = path.resolve('.claude-data/radar-last-sent.json');
const LOG_PATH = path.resolve('.claude-data/gm-listener.log');
const RADAR = path.resolve('scripts/startup-radar.mjs');
const CLAUDE_BIN = process.env.RADAR_CLAUDE_BIN || "claude";
const AGENT_MODEL = process.env.TG_AGENT_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-5';
// Text-only assistant. It replies from general knowledge and the context below.
// It has NO access to files, data, or the box (that fuller version needs
// explicit approval since it means running commands on the box from phone input).
const APP_NAME = process.env.APP_NAME || "this product";
const AGENT_CONTEXT = [
  `You are the assistant for the team behind ${APP_NAME}, reachable over Telegram. A team member is texting you right now.`,
  "IMPORTANT: right now you are in a text-only mode. You cannot read their files, logs, revenue, or run anything on their machine. If they ask for a specific live number (like today's revenue or a log), tell them plainly you cannot read it in this text-only mode yet, and that they can switch on the fuller version when back at a computer. Do not guess or make up numbers.",
  "You CAN help with: thinking through ideas, product and startup questions, drafting, quick research from your own knowledge, explaining things.",
  "How to reply: plain, short, easy to read on a phone. No em dashes. No AI-slop words. Casual is fine. Give the answer, not the steps. Under about 1200 characters unless asked for more.",
].join('\n');

const localDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.RADAR_TZ || "UTC" }).format(new Date());

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync('.claude-data', { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch { /* best-effort */ }
}

if (!TG_TOKEN || !TG_CHAT) { log('[gm] TG not configured, exiting'); process.exit(0); }

// ---- one-run lock so a slow radar run never overlaps the next minute's poll --
function lockHeld() {
  try {
    const age = Date.now() - fs.statSync(LOCK_PATH).mtimeMs;
    if (age < 5 * 60 * 1000) return true;      // fresh lock, someone's working
  } catch { /* no lock */ }
  return false;
}
function takeLock() { try { fs.writeFileSync(LOCK_PATH, String(process.pid)); } catch {} }
function freeLock() { try { fs.unlinkSync(LOCK_PATH); } catch {} }

const loadOffset = () => { try { return JSON.parse(fs.readFileSync(OFFSET_PATH, 'utf8')).offset || 0; } catch { return 0; } };
const saveOffset = (o) => { try { fs.writeFileSync(OFFSET_PATH, JSON.stringify({ offset: o })); } catch {} };
const sentToday = () => { try { return JSON.parse(fs.readFileSync(SENT_PATH, 'utf8')).day === localDay(); } catch { return false; } };

async function send(text) {
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
    });
  } catch (err) { log(`[gm] send failed: ${err.message}`); }
}

async function getUpdates(offset) {
  const res = await fetch(
    `https://api.telegram.org/bot${TG_TOKEN}/getUpdates?timeout=0&allowed_updates=%5B%22message%22%5D` +
    (offset ? `&offset=${offset}` : ''),
    { method: 'GET' }
  );
  const json = await res.json();
  if (!json.ok) throw new Error(JSON.stringify(json).slice(0, 200));
  return json.result || [];
}

// Only short, standalone command words fire the radar. A real sentence like
// "any news on proton?" falls through to the assistant instead.
function asCommand(text) {
  const s = text.trim().toLowerCase().replace(/[\s!.?,]+$/, '');
  if (/^(refresh|again|latest|fresh|gm again)$/.test(s)) return 'force';
  if (/^(gm+|g ?m|good ?morning|morning|intel|news|radar|update me|updates?)$/.test(s)) return 'normal';
  return null;
}

// Answer a free-text message as his assistant. Text-only: no tools, so the reply
// comes from the model plus the context above, nothing on the box is touched.
async function askClaude(text) {
  const prompt = `${AGENT_CONTEXT}\n\nTheir message: ${text}\n\nReply to him now in plain text. Do not use any tools.`;
  const { stdout } = await execFileP(
    CLAUDE_BIN,
    ['-p', prompt, '--model', AGENT_MODEL],
    { cwd: process.cwd(), timeout: Number(process.env.TG_AGENT_TIMEOUT_MS || 150000), maxBuffer: 4 * 1024 * 1024 }
  );
  return (stdout || '').trim().replace(/\s[—–]\s/g, '. ').replace(/[—–]/g, ',');
}

async function main() {
  if (lockHeld()) return;           // another run is mid-radar; skip quietly
  takeLock();
  try {
    let offset = loadOffset();
    const updates = await getUpdates(offset);

    if (PEEK) {
      log(`[gm] peek: ${updates.length} pending update(s)`);
      for (const u of updates) {
        const t = (u.message?.text || '').slice(0, 80);
        log(`  update_id=${u.update_id} chat=${u.message?.chat?.id} text="${t}"`);
      }
      return; // do NOT advance offset or act
    }

    let trigger = null;   // 'force' | 'normal'  -> radar
    const asks = [];       // free-text messages -> assistant
    for (const u of updates) {
      offset = u.update_id + 1;
      const msg = u.message;
      if (!msg || String(msg.chat?.id) !== TG_CHAT || !msg.text) continue;
      const cmd = asCommand(msg.text);
      if (cmd === 'force') trigger = 'force';
      else if (cmd === 'normal') { if (trigger !== 'force') trigger = 'normal'; }
      else asks.push(msg.text.trim());
    }
    saveOffset(offset);

    if (!trigger && !asks.length) return; // nothing for us, stay silent

    // 1) radar command (gm / refresh)
    if (trigger) {
      if (trigger === 'normal' && sentToday()) {
        await send("gm 👋 your morning intel already went out earlier today. say \"refresh\" if you want a fresh pull.");
        log('[gm] gm received, already sent today -> nudged');
      } else {
        await send('gm. pulling your intel now, one sec 🛰️');
        log(`[gm] trigger=${trigger} -> running radar`);
        try {
          await execFileP('node', [RADAR], { cwd: process.cwd(), timeout: 240000, maxBuffer: 4 * 1024 * 1024 });
        } catch (err) {
          log(`[gm] radar run failed: ${err.message}`);
          await send('couldnt pull the intel just now, it will still land on the morning run. try again in a bit.');
        }
      }
    }

    // 2) anything else -> answer as his assistant (reply to the most recent message)
    if (asks.length) {
      const q = asks[asks.length - 1];
      log(`[gm] agent question: ${q.slice(0, 80)}`);
      await send('on it 🤔');
      try {
        const reply = await askClaude(q);
        await send(reply ? reply.slice(0, 3800) : 'didnt get a clear answer that time. try rephrasing?');
        log('[gm] agent replied');
      } catch (err) {
        log(`[gm] agent failed: ${err.message}`);
        await send('couldnt answer that just now, try again in a bit.');
      }
    }
  } catch (err) {
    log(`[gm] cycle error: ${err.message}`);
  } finally {
    freeLock();
  }
}

main();
