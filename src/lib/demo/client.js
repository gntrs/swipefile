// An in memory stand in for the Supabase client, used when no database is
// configured. It answers the calls the app makes with supabase-js result
// shapes, so every page works on sample data. Nothing is saved: a fresh page
// load builds a fresh store from the seed.
//
// The seed (sample ads and their art) is loaded on first use with a dynamic
// import, so it stays out of the main bundle and Node scripts that import this
// file never touch it.
import { DemoQuery, DemoRpc, warnOnce } from './query.js';
import { DEMO_USER, DEMO_FUNCTIONS_MESSAGE } from './constants.js';
import { EXPECTED_SCHEMA_VERSION } from '../setup/checks.js';

const loadSeed = () => import('./seed.js').then((m) => m.buildSeed);

function demoUser() {
  return {
    id: DEMO_USER.id,
    email: DEMO_USER.email,
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: {},
    app_metadata: {},
  };
}

function demoSession() {
  return { access_token: 'demo', token_type: 'bearer', user: demoUser() };
}

export function createDemoClient({ seed } = {}) {
  let storePromise = null;
  const getStore = () => {
    if (!storePromise) {
      storePromise = (seed ? Promise.resolve(seed) : loadSeed()).then((build) => {
        const built = build(Date.now()) || {};
        return { tables: built.tables || {}, art: built.art || {}, files: new Map() };
      });
    }
    return storePromise;
  };

  const rpc = (name) =>
    new DemoRpc(async () => {
      if (name === 'swipefile_health') {
        return {
          data: { schema_version: EXPECTED_SCHEMA_VERSION, bucket_exists: true, bucket_public: false },
          error: null,
          count: null,
          status: 200,
        };
      }
      return { data: null, error: { code: 'PGRST202', message: 'demo: function not available' }, count: null, status: 404 };
    });

  const bucket = (bucketName) => ({
    async upload(path, file) {
      const store = await getStore();
      let url = null;
      try {
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && file) {
          url = URL.createObjectURL(file);
        }
      } catch {
        url = null;
      }
      store.files.set(`${bucketName}/${path}`, { url, size: file?.size ?? 0, type: file?.type || '' });
      return { data: { path, id: path, fullPath: `${bucketName}/${path}` }, error: null };
    },
    async createSignedUrl(path) {
      const store = await getStore();
      const file = store.files.get(`${bucketName}/${path}`);
      if (file?.url) return { data: { signedUrl: file.url }, error: null };
      const spec = store.art[path];
      if (spec) {
        const { demoArtUrl } = await import('./art.js');
        return { data: { signedUrl: demoArtUrl(spec) }, error: null };
      }
      return { data: null, error: { statusCode: '404', message: 'Object not found' } };
    },
    async createSignedUrls(paths) {
      const out = [];
      for (const path of paths || []) {
        const { data, error } = await this.createSignedUrl(path);
        out.push({ path, signedUrl: data?.signedUrl || null, error: error ? error.message : null });
      }
      return { data: out, error: null };
    },
    async remove(paths) {
      const store = await getStore();
      const removed = [];
      for (const path of paths || []) {
        const key = `${bucketName}/${path}`;
        const file = store.files.get(key);
        if (file) {
          try {
            if (file.url && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(file.url);
          } catch {
            /* nothing to release */
          }
          store.files.delete(key);
          removed.push({ name: path, bucket_id: bucketName });
        }
      }
      return { data: removed, error: null };
    },
    async list(prefix = '') {
      const store = await getStore();
      const lead = `${bucketName}/${prefix ? `${prefix.replace(/\/$/, '')}/` : ''}`;
      const data = [...store.files.keys()]
        .filter((k) => k.startsWith(lead))
        .map((k) => ({ name: k.slice(lead.length) }));
      return { data, error: null };
    },
  });

  return {
    isDemo: true,
    from: (table) => new DemoQuery(getStore, table),
    rpc,
    storage: { from: bucket },
    auth: {
      getSession: async () => ({ data: { session: demoSession() }, error: null }),
      getUser: async () => ({ data: { user: demoUser() }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { user: demoUser(), session: demoSession() }, error: null }),
      signUp: async () => ({ data: { user: demoUser(), session: demoSession() }, error: null }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: demoUser() }, error: null }),
    },
    channel() {
      const ch = {
        on: () => ch,
        subscribe: () => ch,
        unsubscribe: async () => 'ok',
      };
      return ch;
    },
    removeChannel: async () => 'ok',
    functions: {
      invoke: async () => ({
        data: null,
        error: { name: 'DemoFunctionsError', code: 'demo', message: DEMO_FUNCTIONS_MESSAGE },
      }),
    },
    // Exposed for tests only.
    _store: getStore,
    _warnOnce: warnOnce,
  };
}
