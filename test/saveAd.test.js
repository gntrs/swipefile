import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  extFor,
  formatFor,
  mediaPathFor,
  avatarPathFor,
  validateFile,
  friendlyStorageError,
  saveAd,
  uploadMedia,
  removeMedia,
  announceSaved,
  MAX_UPLOAD_BYTES,
  MEDIA_BUCKET,
  STORAGE_ERRORS,
  uploadBody,
  attachMedia,
} from '../src/lib/saveAd.js';

const MB = 1024 * 1024;
// validateFile and friends only read name, type and size.
const file = (name, type = '', size = 1000) => ({ name, type, size });
const USER = { id: 'user-1', email: 'you@example.com' };

// A stub Supabase client that records what it was asked.
function stub({ uploadError = null, insertError = null, insertThrows = false } = {}) {
  const calls = { upload: [], remove: [], insert: [] };
  const client = {
    storage: {
      from: (bucket) => ({
        upload: async (path, body) => {
          calls.upload.push({ bucket, path, body });
          return { data: uploadError ? null : { path }, error: uploadError };
        },
        remove: async (paths) => {
          calls.remove.push({ bucket, paths });
          return { data: [], error: null };
        },
      }),
    },
    from: (table) => ({
      insert: (row) => {
        calls.insert.push({ table, row });
        return {
          select: () => ({
            single: async () => {
              if (insertThrows) throw new Error('socket hang up');
              return insertError ? { data: null, error: insertError } : { data: { id: 'new-ad', ...row }, error: null };
            },
          }),
        };
      },
    }),
  };
  return { client, calls };
}

afterEach(() => {
  delete globalThis.window;
});

describe('extFor and formatFor', () => {
  it('takes the extension from the name, lowercased', () => {
    expect(extFor(file('IMG.HEIC'))).toBe('heic');
    expect(extFor(file('weird.name.JPG'))).toBe('jpg');
  });
  it('falls back to the MIME type when the name has none', () => {
    expect(extFor(file('screenshot', 'image/png'))).toBe('png');
    expect(extFor(file('clip', 'video/quicktime'))).toBe('mov');
    expect(extFor(file('x', 'image/jpeg'))).toBe('jpg');
    expect(extFor(file('x', 'video/webm'))).toBe('webm');
  });
  it('is bin when nothing is known', () => {
    expect(extFor(file('noext', ''))).toBe('bin');
    expect(extFor(file('name.toolongext', ''))).toBe('bin');
    expect(extFor({})).toBe('bin');
  });
  it('knows video by MIME or extension', () => {
    expect(formatFor(file('a', 'video/mp4'))).toBe('video');
    expect(formatFor(file('a.MOV', ''))).toBe('video');
    expect(formatFor(file('a.m4v', ''))).toBe('video');
    expect(formatFor(file('a.png', 'image/png'))).toBe('image');
    expect(formatFor(file('a', ''))).toBe('image');
  });
});

describe('paths', () => {
  it('puts media in the uploader folder with a unique name', () => {
    expect(mediaPathFor('u1', file('a.PNG'), { now: 1700000000000, rand: 'abcd1234' })).toBe('u1/1700000000000-abcd1234.png');
    const p = mediaPathFor('u1', file('screenshot', 'image/png'));
    expect(p).toMatch(/^u1\/\d+-[a-z0-9]{8}\.png$/);
    expect(mediaPathFor('u1', file('a.png'))).not.toBe(mediaPathFor('u1', file('a.png')));
  });
  it('puts avatars where the storage policy allows them', () => {
    expect(avatarPathFor('u1', file('me.jpg'), { now: 5, rand: 'zzzzzzzz' })).toBe('avatars/u1-5-zzzzzzzz.jpg');
  });
});

describe('validateFile', () => {
  it('refuses an empty file', () => {
    expect(validateFile(file('a.png', 'image/png', 0))).toMatchObject({ code: 'empty' });
    expect(validateFile(null)).toMatchObject({ code: 'empty' });
  });
  it('allows exactly 50 MB and refuses one byte more, with the exact message', () => {
    expect(validateFile(file('a.mp4', 'video/mp4', MAX_UPLOAD_BYTES))).toBe(null);
    const tooBig = validateFile(file('a.mp4', 'video/mp4', MAX_UPLOAD_BYTES + 1));
    expect(tooBig.code).toBe('too_big');
    expect(tooBig.message).toBe('That file is 51 MB. The limit is 50 MB: trim it or export a smaller one.');
    expect(validateFile(file('b.mp4', 'video/mp4', 200 * MB)).message).toBe(
      'That file is 200 MB. The limit is 50 MB: trim it or export a smaller one.'
    );
  });
  it('refuses what is not an image or a video', () => {
    expect(validateFile(file('doc.pdf', 'application/pdf'))).toMatchObject({ code: 'bad_type' });
    expect(validateFile(file('doc.pdf', 'application/pdf')).message).toContain('doc.pdf');
    expect(validateFile(file('noext', ''))).toMatchObject({ code: 'bad_type' });
  });
  it('accepts media with an empty MIME type by its extension (HEIC from some phones)', () => {
    expect(validateFile(file('IMG_0001.HEIC', ''))).toBe(null);
    expect(validateFile(file('clip.mov', ''))).toBe(null);
  });
  it('accepts media with no extension by its MIME type', () => {
    expect(validateFile(file('screenshot', 'image/png'))).toBe(null);
  });
  it('takes a custom limit', () => {
    expect(validateFile(file('a.png', 'image/png', 2 * MB), { maxBytes: MB }).code).toBe('too_big');
  });
});

describe('friendlyStorageError', () => {
  it('maps a missing bucket', () => {
    expect(friendlyStorageError({ message: 'Bucket not found' })).toBe(STORAGE_ERRORS.bucket);
    expect(STORAGE_ERRORS.bucket).toBe('Storage bucket ad-media is missing. Re-run db-setup.sql, it creates the bucket.');
  });
  it('maps a policy refusal', () => {
    expect(friendlyStorageError({ message: 'new row violates row-level security policy' })).toBe(STORAGE_ERRORS.policy);
    expect(friendlyStorageError({ statusCode: '403', message: 'x' })).toBe(STORAGE_ERRORS.policy);
    expect(STORAGE_ERRORS.policy).toBe('Upload refused by storage policy. Re-run db-setup.sql to install the storage policies.');
  });
  it('maps too large from the server', () => {
    expect(friendlyStorageError({ message: 'The object exceeded the maximum allowed size' }, { size: 60 * MB })).toBe(
      'That file is 60 MB. The limit is 50 MB: trim it or export a smaller one.'
    );
    expect(friendlyStorageError({ statusCode: 413, message: 'Payload too large' })).toMatch(/^That file is \d+ MB\./);
  });
  it('passes anything else through', () => {
    expect(friendlyStorageError({ message: 'Something odd' })).toBe('Something odd');
    expect(friendlyStorageError('plain string')).toBe('plain string');
    expect(friendlyStorageError(null)).toBe('Upload failed.');
  });
});

describe('uploadMedia and removeMedia', () => {
  it('uploads into the bucket and reports the format', async () => {
    const { client, calls } = stub();
    const res = await uploadMedia(file('clip.mp4', 'video/mp4'), { user: USER, client });
    expect(res.format).toBe('video');
    expect(res.path).toMatch(/^user-1\/\d+-[a-z0-9]{8}\.mp4$/);
    expect(calls.upload[0].bucket).toBe(MEDIA_BUCKET);
  });
  it('refuses a bad file before touching storage', async () => {
    const { client, calls } = stub();
    await expect(uploadMedia(file('a.pdf', 'application/pdf'), { user: USER, client })).rejects.toThrow(/not an image or a video/);
    expect(calls.upload).toHaveLength(0);
  });
  it('turns a storage error into the friendly text', async () => {
    const { client } = stub({ uploadError: { message: 'Bucket not found' } });
    await expect(uploadMedia(file('a.png', 'image/png'), { user: USER, client })).rejects.toThrow(STORAGE_ERRORS.bucket);
  });
  it('sends a file with an empty type under the type its name gives', async () => {
    // The bucket takes only images and video. A browser that hands over a
    // HEIC or an mp4 with an empty type would upload it as
    // application/octet-stream, which a real Supabase bucket refuses.
    const { client, calls } = stub();
    const heic = new File([new Uint8Array(12)], 'IMG_0001.HEIC', { type: '' });
    const res = await uploadMedia(heic, { user: USER, client });
    expect(res.path).toMatch(/\.heic$/);
    expect(calls.upload[0].body.type).toBe('image/heic');
    expect(calls.upload[0].body.size).toBe(12);
  });
  it('uploadBody leaves typed and unknown files alone', () => {
    const typed = new File([new Uint8Array(3)], 'a.png', { type: 'image/png' });
    expect(uploadBody(typed)).toBe(typed);
    const unknown = new File([new Uint8Array(3)], 'notes', { type: '' });
    expect(uploadBody(unknown)).toBe(unknown);
    expect(uploadBody(new File([new Uint8Array(3)], 'clip.mp4', { type: '' })).type).toBe('video/mp4');
    expect(uploadBody(new File([new Uint8Array(3)], 'clip.m4v', { type: '' })).type).toBe('video/x-m4v');
    expect(uploadBody(null)).toBe(null);
  });
  it('removeMedia never throws', async () => {
    const client = { storage: { from: () => ({ remove: async () => { throw new Error('x'); } }) } };
    await expect(removeMedia('p', { client })).resolves.toBeUndefined();
    await expect(removeMedia(null, { client })).resolves.toBeUndefined();
  });
});

describe('saveAd', () => {
  it('uploads, inserts once, cleans the row and announces the save', async () => {
    const dispatchEvent = vi.fn();
    globalThis.window = { dispatchEvent };
    const { client, calls } = stub();
    const { ad } = await saveAd(
      { brand: '  Quillfox ', hook: ' Hook ', ad_copy: '', verdict: 'winner', status: 'dead', tags: ' a, b ,a,, ', metrics: { source_url: 'https://x.y' } },
      { user: USER, file: file('shot', 'image/png'), client }
    );
    expect(calls.upload).toHaveLength(1);
    expect(calls.insert).toHaveLength(1);
    const row = calls.insert[0].row;
    expect(row).toMatchObject({
      brand: 'Quillfox', hook: 'Hook', ad_copy: null, landing_url: null, platform: 'Facebook', format: 'image',
      verdict: 'winner', status: 'dead', tags: ['a', 'b'], metrics: { source_url: 'https://x.y' },
      added_by: 'user-1', added_by_email: 'you@example.com',
    });
    expect(row.media_path).toBe(calls.upload[0].path);
    expect(ad.id).toBe('new-ad');
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0][0];
    expect(event.type).toBe('sf:ads-saved');
    expect(event.detail).toEqual({ ids: ['new-ad'] });
  });

  it('removes the upload and throws when the insert fails', async () => {
    const { client, calls } = stub({ insertError: { message: 'permission denied for table ads' } });
    await expect(saveAd({ brand: 'X' }, { user: USER, file: file('a.png', 'image/png'), client })).rejects.toThrow('permission denied for table ads');
    expect(calls.remove).toEqual([{ bucket: MEDIA_BUCKET, paths: [calls.upload[0].path] }]);
  });

  it('removes the upload when the insert throws', async () => {
    const { client, calls } = stub({ insertThrows: true });
    await expect(saveAd({}, { user: USER, file: file('a.png', 'image/png'), client })).rejects.toThrow('socket hang up');
    expect(calls.remove).toHaveLength(1);
  });

  it('without a file inserts once and uploads nothing', async () => {
    const { client, calls } = stub();
    await saveAd({ brand: 'Y', format: 'video' }, { user: USER, client });
    expect(calls.upload).toHaveLength(0);
    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0].row).toMatchObject({ format: 'video', media_path: null, verdict: 'unsure', status: 'running', tags: [], metrics: {} });
  });

  it('never inserts when the upload fails', async () => {
    const { client, calls } = stub({ uploadError: { message: 'new row violates row-level security policy' } });
    await expect(saveAd({}, { user: USER, file: file('a.png', 'image/png'), client })).rejects.toThrow(STORAGE_ERRORS.policy);
    expect(calls.insert).toHaveLength(0);
  });

  it('replaces unknown verdicts and statuses with the defaults', async () => {
    const { client, calls } = stub();
    await saveAd({ verdict: 'great', status: 'paused', tags: ['x', ' ', 'x'] }, { user: USER, client });
    expect(calls.insert[0].row).toMatchObject({ verdict: 'unsure', status: 'running', tags: ['x'] });
  });

  it('announceSaved is a no-op outside the browser', () => {
    expect(() => announceSaved(['a'])).not.toThrow();
  });
});

describe('attachMedia', () => {
  // A stub whose ads update answers with `update` ({ data, error }) or throws.
  function attachStub({ uploadError = null, update = { data: [{ id: 'ad-1' }], error: null }, updateThrows = false } = {}) {
    const { client, calls } = stub({ uploadError });
    calls.update = [];
    client.from = (table) => ({
      // select comes before the filter, see src/lib/byId.js.
      update: (values) => ({
        select: (cols) => ({
          eq: async (col, val) => {
            calls.update.push({ table, values, where: [col, val], cols });
            if (updateThrows) throw new Error('socket hang up');
            return update;
          },
        }),
      }),
    });
    return { client, calls };
  }

  it('uploads, points the ad at the file and returns the path and format', async () => {
    const { client, calls } = attachStub();
    const out = await attachMedia('ad-1', file('clip.mp4', 'video/mp4'), { user: USER, client });
    expect(out.format).toBe('video');
    expect(out.path).toMatch(/^user-1\/\d+-[a-z0-9]{8}\.mp4$/);
    expect(calls.upload).toHaveLength(1);
    expect(calls.update).toEqual([{ table: 'ads', values: { media_path: out.path, format: 'video' }, where: ['id', 'ad-1'], cols: 'id' }]);
    expect(calls.remove).toHaveLength(0);
  });

  it('sends an untyped HEIC as image/heic and marks the ad as an image', async () => {
    const { client, calls } = attachStub();
    const heic = new File([new Uint8Array(12)], 'IMG_0001.HEIC', { type: '' });
    const out = await attachMedia('ad-1', heic, { user: USER, client });
    expect(calls.upload[0].body.type).toBe('image/heic');
    expect(out.format).toBe('image');
    expect(calls.update[0].values.format).toBe('image');
  });

  it('refuses a missing, empty or wrong file before touching storage or the row', async () => {
    const { client, calls } = attachStub();
    await expect(attachMedia('ad-1', null, { user: USER, client })).rejects.toThrow('That file is empty.');
    await expect(attachMedia('ad-1', file('a.png', 'image/png', 0), { user: USER, client })).rejects.toThrow('That file is empty.');
    await expect(attachMedia('ad-1', file('notes.txt', 'text/plain'), { user: USER, client })).rejects.toThrow('notes.txt is not an image or a video.');
    await expect(attachMedia('ad-1', file('big.mp4', 'video/mp4', MAX_UPLOAD_BYTES + 1), { user: USER, client })).rejects.toThrow('The limit is 50 MB');
    expect(calls.upload).toHaveLength(0);
    expect(calls.update).toHaveLength(0);
  });

  it('never touches the row when the upload fails', async () => {
    const { client, calls } = attachStub({ uploadError: { message: 'Bucket not found' } });
    await expect(attachMedia('ad-1', file('a.png', 'image/png'), { user: USER, client })).rejects.toThrow(STORAGE_ERRORS.bucket);
    expect(calls.update).toHaveLength(0);
    expect(calls.remove).toHaveLength(0);
  });

  it('removes the upload and says why when the row refuses it', async () => {
    const { client, calls } = attachStub({ update: { data: null, error: { message: 'permission denied for table ads' } } });
    await expect(attachMedia('ad-1', file('a.png', 'image/png'), { user: USER, client })).rejects.toThrow(
      'Could not save the file: permission denied for table ads'
    );
    expect(calls.remove).toEqual([{ bucket: MEDIA_BUCKET, paths: [calls.upload[0].path] }]);
  });

  it('removes the upload when the ad is gone (no row updated)', async () => {
    const { client, calls } = attachStub({ update: { data: [], error: null } });
    await expect(attachMedia('ad-1', file('a.png', 'image/png'), { user: USER, client })).rejects.toThrow('that ad is not there any more');
    expect(calls.remove).toHaveLength(1);
  });

  it('removes the upload when the update throws', async () => {
    const { client, calls } = attachStub({ updateThrows: true });
    await expect(attachMedia('ad-1', file('a.png', 'image/png'), { user: USER, client })).rejects.toThrow('Could not save the file: socket hang up');
    expect(calls.remove).toHaveLength(1);
  });

  it('two attaches to the same ad upload two distinct files', async () => {
    const { client, calls } = attachStub();
    const [a, b] = await Promise.all([
      attachMedia('ad-1', file('a.png', 'image/png'), { user: USER, client }),
      attachMedia('ad-1', file('a.png', 'image/png'), { user: USER, client }),
    ]);
    expect(a.path).not.toBe(b.path);
    expect(calls.update).toHaveLength(2);
  });
});
