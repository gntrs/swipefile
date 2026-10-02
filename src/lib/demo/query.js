// The query builder behind the demo client. It answers the subset of the
// supabase-js query API the app uses, over plain arrays held in memory, and
// returns the same result shapes ({ data, error, count }). Anything it does not
// understand comes back as a DEMO_UNSUPPORTED error and warns once, so a gap is
// loud instead of silently wrong.

const warned = new Set();
export function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  if (typeof console !== 'undefined') console.warn(`[demo] ${message}`);
}

export function randomUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-8${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// Resolves a column reference against a row. Plain names read the column;
// `metrics->key` reads the raw json value and `metrics->>key` its text form
// (null when missing), like Postgres.
export function readPath(row, column) {
  const parts = String(column).split(/(->>|->)/);
  let value = row?.[parts[0].trim()];
  let asText = false;
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i + 1].trim().replace(/^'(.*)'$/, '$1');
    value = value == null ? undefined : value[key];
    asText = parts[i] === '->>';
  }
  if (value === undefined || value === null) return null;
  if (asText) return typeof value === 'object' ? JSON.stringify(value) : String(value);
  return value;
}

const isNumeric = (v) => v !== '' && v !== null && typeof v !== 'boolean' && Number.isFinite(Number(v));

function same(cell, value) {
  if (cell === null || cell === undefined) return false;
  if (typeof cell === typeof value) {
    if (typeof cell === 'object') return JSON.stringify(cell) === JSON.stringify(value);
    return cell === value;
  }
  if (isNumeric(cell) && isNumeric(value)) return Number(cell) === Number(value);
  return String(cell) === String(value);
}

function compare(a, b) {
  if (isNumeric(a) && isNumeric(b)) return Number(a) - Number(b);
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function likeToRegex(pattern, flags) {
  let src = '';
  for (const ch of String(pattern)) {
    if (ch === '%') src += '.*';
    else if (ch === '_') src += '.';
    else src += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${src}$`, flags);
}

// Postgres array literal ('{a,b}') or a real array.
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && /^\{.*\}$/.test(value)) {
    const inner = value.slice(1, -1).trim();
    return inner ? inner.split(',').map((s) => s.trim().replace(/^"(.*)"$/, '$1')) : [];
  }
  if (typeof value === 'string' && /^\(.*\)$/.test(value)) {
    const inner = value.slice(1, -1).trim();
    return inner ? inner.split(',').map((s) => s.trim().replace(/^"(.*)"$/, '$1')) : [];
  }
  return [value];
}

function contains(cell, value) {
  if (cell === null || cell === undefined) return false;
  if (Array.isArray(cell)) return asArray(value).every((v) => cell.some((c) => same(c, v)));
  if (typeof cell === 'object' && value && typeof value === 'object') {
    return Object.entries(value).every(([k, v]) => same(cell[k], v));
  }
  return false;
}

// Operator name -> predicate(cell, value). `cs` and `in` are the PostgREST
// spellings `not()` receives.
const OPS = {
  eq: (c, v) => same(c, v),
  neq: (c, v) => c !== null && c !== undefined && !same(c, v),
  gt: (c, v) => c !== null && compare(c, v) > 0,
  gte: (c, v) => c !== null && compare(c, v) >= 0,
  lt: (c, v) => c !== null && compare(c, v) < 0,
  lte: (c, v) => c !== null && compare(c, v) <= 0,
  in: (c, v) => asArray(v).some((x) => same(c, x)),
  is: (c, v) => {
    if (v === null || v === 'null') return c === null || c === undefined;
    if (v === true || v === 'true') return c === true;
    if (v === false || v === 'false') return c === false;
    return false;
  },
  like: (c, v) => c !== null && likeToRegex(v, '').test(String(c)),
  ilike: (c, v) => c !== null && likeToRegex(v, 'i').test(String(c)),
  contains: (c, v) => contains(c, v),
  cs: (c, v) => contains(c, v),
};

// One query against one table. Thenable: awaiting it runs it.
export class DemoQuery {
  constructor(getStore, table) {
    this.getStore = getStore;
    this.table = table;
    this.op = 'select';
    this.payload = null;
    this.options = {};
    this.columns = '*';
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.rangeFrom = null;
    this.rangeTo = null;
    this.singleMode = null; // 'single' | 'maybe'
    this.returning = false;
    this.countMode = null;
    this.head = false;
    this.problem = null;
  }

  unsupported(what) {
    const message = `demo client does not support ${what}`;
    warnOnce(what, message);
    if (!this.problem) this.problem = { code: 'DEMO_UNSUPPORTED', message };
    return this;
  }

  select(columns = '*', { count, head } = {}) {
    if (this.op === 'select') {
      this.columns = columns || '*';
      this.countMode = count || null;
      this.head = Boolean(head);
    } else {
      this.returning = true;
      this.columns = columns || '*';
    }
    return this;
  }

  insert(values, options = {}) {
    this.op = 'insert';
    this.payload = values;
    this.options = options || {};
    return this;
  }

  update(values) {
    this.op = 'update';
    this.payload = values;
    return this;
  }

  upsert(values, options = {}) {
    this.op = 'upsert';
    this.payload = values;
    this.options = options || {};
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  filter(column, operator, value) {
    if (!OPS[operator]) return this.unsupported(`the ${operator} operator`);
    this.filters.push({ column, test: (row) => OPS[operator](readPath(row, column), value) });
    return this;
  }

  eq(c, v) { return this.filter(c, 'eq', v); }
  neq(c, v) { return this.filter(c, 'neq', v); }
  gt(c, v) { return this.filter(c, 'gt', v); }
  gte(c, v) { return this.filter(c, 'gte', v); }
  lt(c, v) { return this.filter(c, 'lt', v); }
  lte(c, v) { return this.filter(c, 'lte', v); }
  in(c, v) { return this.filter(c, 'in', v); }
  is(c, v) { return this.filter(c, 'is', v); }
  like(c, v) { return this.filter(c, 'like', v); }
  ilike(c, v) { return this.filter(c, 'ilike', v); }
  contains(c, v) { return this.filter(c, 'contains', v); }

  not(column, operator, value) {
    if (!OPS[operator]) return this.unsupported(`not() with the ${operator} operator`);
    this.filters.push({ column, test: (row) => !OPS[operator](readPath(row, column), value) });
    return this;
  }

  match(obj) {
    for (const [k, v] of Object.entries(obj || {})) this.eq(k, v);
    return this;
  }

  or() { return this.unsupported('or()'); }
  textSearch() { return this.unsupported('textSearch()'); }
  overlaps() { return this.unsupported('overlaps()'); }
  containedBy() { return this.unsupported('containedBy()'); }

  order(column, { ascending = true, nullsFirst } = {}) {
    this.orders.push({ column, ascending, nullsFirst: nullsFirst === undefined ? !ascending : nullsFirst });
    return this;
  }

  limit(n) {
    this.limitN = n;
    return this;
  }

  range(from, to) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }

  then(resolve, reject) {
    return this.run().then(resolve, reject);
  }

  catch(reject) {
    return this.run().catch(reject);
  }

  finally(fn) {
    return this.run().finally(fn);
  }

  project(row) {
    const cols = String(this.columns || '*').trim();
    if (cols === '*' || cols === '') return clone(row);
    const out = {};
    for (const raw of cols.split(',')) {
      const name = raw.trim();
      if (!name) continue;
      if (name === '*') return clone(row);
      if (Object.prototype.hasOwnProperty.call(row, name)) out[name] = clone(row[name]);
    }
    return out;
  }

  sortRows(rows) {
    if (!this.orders.length) return rows;
    return [...rows].sort((a, b) => {
      for (const { column, ascending, nullsFirst } of this.orders) {
        const va = readPath(a, column);
        const vb = readPath(b, column);
        const na = va === null || va === undefined;
        const nb = vb === null || vb === undefined;
        if (na && nb) continue;
        if (na) return nullsFirst ? -1 : 1;
        if (nb) return nullsFirst ? 1 : -1;
        const c = compare(va, vb);
        if (c !== 0) return ascending ? c : -c;
      }
      return 0;
    });
  }

  window(rows) {
    let out = rows;
    if (this.rangeFrom !== null) out = out.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return out;
  }

  finish(rows, count = null) {
    if (this.singleMode) {
      if (rows.length === 1) return { data: rows[0], error: null, count, status: 200 };
      if (rows.length === 0 && this.singleMode === 'maybe') return { data: null, error: null, count, status: 200 };
      return {
        data: null,
        error: {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
          details: `The result contains ${rows.length} rows`,
        },
        count,
        status: 406,
      };
    }
    return { data: rows, error: null, count, status: 200 };
  }

  async run() {
    if (this.problem) return { data: null, error: this.problem, count: null, status: 400 };
    const store = await this.getStore();
    if (!store.tables[this.table]) store.tables[this.table] = [];
    const table = store.tables[this.table];
    const matches = (row) => this.filters.every((f) => f.test(row));

    if (this.op === 'select') {
      const hits = this.sortRows(table.filter(matches));
      const count = this.countMode ? hits.length : null;
      if (this.head) return { data: null, error: null, count, status: 200 };
      return this.finish(this.window(hits).map((r) => this.project(r)), count);
    }

    if (this.op === 'insert' || this.op === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const keys = String(this.options.onConflict || 'id').split(',').map((s) => s.trim());
      const written = [];
      for (const raw of list) {
        const values = clone(raw || {});
        if (this.op === 'upsert') {
          const existing = keys.every((k) => values[k] !== undefined)
            ? table.find((r) => keys.every((k) => same(r[k], values[k])))
            : null;
          if (existing) {
            if (this.options.ignoreDuplicates) continue;
            Object.assign(existing, values);
            written.push(existing);
            continue;
          }
        } else if (values.id && table.some((r) => r.id === values.id)) {
          return {
            data: null,
            error: { code: '23505', message: `duplicate key value violates unique constraint "${this.table}_pkey"` },
            count: null,
            status: 409,
          };
        }
        const row = { ...values };
        if (!row.id) row.id = randomUuid();
        if (!row.created_at) row.created_at = new Date().toISOString();
        table.unshift(row);
        written.push(row);
      }
      if (!this.returning) return { data: null, error: null, count: null, status: 201 };
      return this.finish(written.map((r) => this.project(r)));
    }

    if (this.op === 'update') {
      const values = clone(this.payload || {});
      const hits = table.filter(matches);
      for (const row of hits) Object.assign(row, values);
      if (!this.returning) return { data: null, error: null, count: null, status: 204 };
      return this.finish(hits.map((r) => this.project(r)));
    }

    if (this.op === 'delete') {
      const hits = table.filter(matches);
      store.tables[this.table] = table.filter((r) => !matches(r));
      if (!this.returning) return { data: null, error: null, count: null, status: 204 };
      return this.finish(hits.map((r) => this.project(r)));
    }

    return { data: null, error: { code: 'DEMO_UNSUPPORTED', message: `unknown operation ${this.op}` }, count: null };
  }
}

// rpc() result: a thenable that accepts the same chain calls as a query and
// ignores them, because the demo only answers a fixed set of functions.
export class DemoRpc {
  constructor(runner) {
    this.runner = runner;
    this.singleMode = null;
  }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  then(resolve, reject) { return Promise.resolve().then(() => this.runner(this)).then(resolve, reject); }
  catch(reject) { return this.then(undefined, reject); }
  finally(fn) { return this.then().finally(fn); }
}
for (const name of ['range', 'limit', 'order', 'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'like', 'ilike', 'contains', 'not', 'filter', 'match']) {
  DemoRpc.prototype[name] = function chain() {
    return this;
  };
}
