import { db } from './db.js';
import { VERDICTS, STATUSES } from './ads.js';

// Saving an ad, in one place. Every way into the swipe file (the Add form, a
// multi file drop, CSV import, capture) goes through saveAd so uploads are
// checked the same way and a failed insert never leaves an orphaned file.

export const MEDIA_BUCKET = 'ad-media';
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // matches the bucket's file_size_limit in db-setup.sql

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'];
const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'm4v'];

function nameExt(file) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(file?.name || ''));
  return m ? m[1].toLowerCase() : null;
}

// File extension for the stored object: from the name when it has a sensible
// one, else from the MIME type, else 'bin'. Always lowercase.
export function extFor(file) {
  return nameExt(file) || MIME_EXT[String(file?.type || '').toLowerCase()] || 'bin';
}

export function formatFor(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type.startsWith('video/')) return 'video';
  return VIDEO_EXTS.includes(extFor(file)) ? 'video' : 'image';
}

function randomToken(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

// `<user id>/<ms>-<8 chars>.<ext>`: unique per upload, inside the uploader's own
// folder, which is what the storage insert policy allows.
export function mediaPathFor(userId, file, { now = Date.now(), rand } = {}) {
  return `${userId}/${now}-${rand || randomToken()}.${extFor(file)}`;
}

// `avatars/<user id>-<ms>-<8 chars>.<ext>`: the one other place a member may
// upload, per the storage policy.
export function avatarPathFor(userId, file, { now = Date.now(), rand } = {}) {
  return `avatars/${userId}-${now}-${rand || randomToken()}.${extFor(file)}`;
}

const MB = 1024 * 1024;
// Size rounded up, so a file one byte over the limit never reads as "50 MB".
export const tooBigMessage = (bytes, maxBytes = MAX_UPLOAD_BYTES) =>
  `That file is ${Math.ceil(bytes / MB)} MB. The limit is ${Math.round(maxBytes / MB)} MB: trim it or export a smaller one.`;

// null when the file can be uploaded, else { code, message }.
export function validateFile(file, { maxBytes = MAX_UPLOAD_BYTES } = {}) {
  if (!file || !file.size) return { code: 'empty', message: 'That file is empty.' };
  if (file.size > maxBytes) return { code: 'too_big', message: tooBigMessage(file.size, maxBytes) };
  const type = String(file.type || '').toLowerCase();
  const ext = nameExt(file);
  const mediaType = type.startsWith('image/') || type.startsWith('video/');
  const mediaExt = ext && (IMAGE_EXTS.includes(ext) || VIDEO_EXTS.includes(ext));
  if (!mediaType && !mediaExt) {
    return { code: 'bad_type', message: `${file.name || 'That file'} is not an image or a video.` };
  }
  return null;
}

export const STORAGE_ERRORS = {
  bucket: 'Storage bucket ad-media is missing. Re-run db-setup.sql, it creates the bucket.',
  policy: 'Upload refused by storage policy. Re-run db-setup.sql to install the storage policies.',
};

// Turns a storage error into a sentence that says what to do.
export function friendlyStorageError(error, { size } = {}) {
  const message = String(error?.message || error || '');
  const status = String(error?.statusCode ?? error?.status ?? '');
  if (/bucket not found/i.test(message)) return STORAGE_ERRORS.bucket;
  if (/row.level security|violates.*policy|unauthori[sz]ed/i.test(message) || status === '403') return STORAGE_ERRORS.policy;
  if (/maximum allowed size|too large|payload too large/i.test(message) || status === '413') {
    return tooBigMessage(size || MAX_UPLOAD_BYTES + 1);
  }
  return message || 'Upload failed.';
}

export async function uploadMedia(file, { user, client = db } = {}) {
  const invalid = validateFile(file);
  if (invalid) throw new Error(invalid.message);
  const path = mediaPathFor(user.id, file);
  let result;
  try {
    result = await client.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type || undefined });
  } catch (err) {
    throw new Error(friendlyStorageError(err, { size: file.size }));
  }
  if (result?.error) throw new Error(friendlyStorageError(result.error, { size: file.size }));
  return { path, format: formatFor(file) };
}

export async function removeMedia(path, { client = db } = {}) {
  if (!path) return;
  try {
    await client.storage.from(MEDIA_BUCKET).remove([path]);
  } catch {
    /* best effort: an orphaned file is better than a crash */
  }
}

export function announceSaved(ids) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent('sf:ads-saved', { detail: { ids } }));
  } catch {
    /* no CustomEvent: nothing listens anyway */
  }
}

const trimOrNull = (v) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s || null;
};

function cleanTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(',');
  const out = [];
  for (const t of list) {
    const s = String(t || '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export async function saveAd(fields = {}, { user, file = null, client = db } = {}) {
  let upload = null;
  if (file) upload = await uploadMedia(file, { user, client });

  const row = {
    brand: trimOrNull(fields.brand),
    platform: trimOrNull(fields.platform) || 'Facebook',
    format: upload ? upload.format : fields.format || 'image',
    hook: trimOrNull(fields.hook),
    ad_copy: trimOrNull(fields.ad_copy),
    landing_url: trimOrNull(fields.landing_url),
    verdict: VERDICTS.includes(fields.verdict) ? fields.verdict : 'unsure',
    status: STATUSES.includes(fields.status) ? fields.status : 'running',
    tags: cleanTags(fields.tags),
    metrics: fields.metrics || {},
    media_path: upload ? upload.path : null,
    added_by: user.id,
    added_by_email: user.email,
  };

  let result;
  try {
    result = await client.from('ads').insert(row).select().single();
  } catch (err) {
    result = { data: null, error: err };
  }
  if (result?.error || !result?.data) {
    if (upload) await removeMedia(upload.path, { client });
    throw new Error(result?.error?.message || 'Could not save the ad.');
  }

  announceSaved([result.data.id]);
  return { ad: result.data };
}
