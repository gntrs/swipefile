/*
 * The size sweep for swipefile.
 *
 * It lays the app out inside an iframe of an exact size, walks every screen,
 * and measures. A screenshot of
 * one maximised window says nothing about the other sizes, and resizing a
 * maximised window is silently ignored, so the iframe is the method.
 *
 * How to run it by hand:
 *
 *   1. npm run dev (no .env, so the demo library loads)
 *   2. Open the dev server in Chrome, any route
 *   3. Paste the whole of this file into the console
 *   4. report(await probeAll())
 *
 * With the team modules on (VITE_MODULES=all), sweep their screens too:
 *
 *   report(await probeAll(SIZES, ROUTES.concat(TEAM_ROUTES)))
 *
 * What it reports:
 *
 *   overflow     the page or the main scroller runs off sideways. Always a bug.
 *   small        a control under 44 CSS px in either direction. Inline text
 *                links inside a sentence are exempt and counted separately.
 *   unreachable  a control outside the frame with no scroller between it and
 *                the page. Nobody can touch it.
 *   below-fold   outside the frame but inside something that scrolls. Fine,
 *                counted, not listed.
 *   THREW        a screen never arrived. The size is marked failed.
 *
 * Screens are reached by pushState plus popstate, so React Router moves
 * without a reload. Each screen waits for its own data-page marker; a step
 * that never sees its marker throws instead of measuring the wrong screen.
 */

const SIZES = [
  [390, 844, 'iPhone 12 to 16'],
  [390, 664, 'the same iPhone with the browser bars showing'],
  [360, 800, 'Galaxy A series, the commonest Android viewport'],
  [360, 660, 'the same with the toolbar showing'],
  [412, 915, 'Pixel and Galaxy S'],
  [320, 690, 'the smallest phone still in use'],
  [768, 1024, 'iPad portrait'],
  [1024, 768, 'iPad landscape'],
  [1280, 800, 'laptop'],
  [1440, 900, 'desktop'],
]

/* The demo seed uses fixed ids, so these routes always exist in demo mode.
   Keep this list honest: every screen the app has belongs in it. */
const AD_1 = '00000000-0000-4000-8000-000000000001'
const AD_2 = '00000000-0000-4000-8000-000000000002'
const ROUTES = [
  { label: 'library', path: '/ads', page: 'library' },
  { label: 'library-filtered', path: '/ads?verdict=winner', page: 'library' },
  { label: 'ad-detail', path: `/ad/${AD_1}`, page: 'ad-detail' },
  { label: 'add-ad', path: '/ads/add', page: 'add-ad' },
  { label: 'import', path: '/ads/import', page: 'import' },
  { label: 'hooks', path: '/hooks', page: 'hooks' },
  { label: 'briefs', path: '/briefs', page: 'briefs' },
  { label: 'competitors', path: '/competitors', page: 'competitors' },
  { label: 'intel', path: '/intel', page: 'intel' },
  { label: 'overview', path: '/overview', page: 'dashboard' },
  { label: 'compare', path: `/compare?ids=${AD_1},${AD_2}`, page: 'compare' },
  { label: 'profile', path: '/profile', page: 'profile' },
  { label: 'setup', path: '/setup', page: 'setup' },
  { label: 'capture-setup', path: '/capture/setup', page: 'capture-setup' },
  { label: 'capture', path: '/capture?v=1&src=bookmarklet&id=999900001234567&brand=Lumen%20Loop&title=Sample', page: 'capture' },
  { label: 'more-sheet', path: '/ads', page: 'library', open: 'more' },
]

/* Screens that exist only with the team module on. */
const POST_1 = '00000000-0000-4000-8000-000000000401'
const TEAM_ROUTES = [
  { label: 'home', path: '/', page: 'dashboard' },
  { label: 'posts', path: '/posts', page: 'posts' },
  { label: 'add-post', path: '/posts/add', page: 'add-post' },
  { label: 'post-detail', path: `/post/${POST_1}`, page: 'post-detail' },
  { label: 'outreach', path: '/outreach', page: 'outreach' },
  { label: 'availability', path: '/availability', page: 'availability' },
]

function yieldNow() {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => resolve()
    channel.port2.postMessage(0)
  })
}

async function wait(ms) {
  const started = performance.now()
  while (performance.now() - started < ms) await yieldNow()
}

async function until(ready, what, timeoutMs = 6000) {
  const started = performance.now()
  for (;;) {
    if (ready()) return
    if (performance.now() - started > timeoutMs) {
      throw new Error(`probe: waited ${timeoutMs} ms and ${what} never happened`)
    }
    await yieldNow()
  }
}

const SETTLE_MS = 150
const text = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)

function scrolls(node) {
  const style = getComputedStyle(node)
  return /auto|scroll/.test(`${style.overflowY} ${style.overflowX}`)
}

function inScroller(el) {
  for (let node = el.parentElement; node !== null; node = node.parentElement) {
    if (scrolls(node) && (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)) {
      return true
    }
  }
  return false
}

/* A link that sits inside a sentence is text, not a button: WCAG exempts it
   and so does this probe. Counted, never silently. */
function inlineTextLink(el) {
  if (el.tagName !== 'A') return false
  if (getComputedStyle(el).display !== 'inline') return false
  const parent = el.parentElement
  if (!parent) return false
  for (const node of parent.childNodes) {
    if (node !== el && node.nodeType === 3 && node.textContent.trim()) return true
  }
  return false
}

function visible(el) {
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return false
  const style = getComputedStyle(el)
  if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false
  if (el.closest('[aria-hidden="true"], [data-probe-skip]')) return false
  return true
}

function inspect(doc, w, h, label, issues, counts) {
  const root = doc.documentElement
  if (root.scrollWidth > w + 1) issues.push(`${label}: overflow sideways ${root.scrollWidth} > ${w}`)
  if (doc.body.scrollHeight > h + 1) issues.push(`${label}: overflow down ${doc.body.scrollHeight} > ${h}`)
  const main = doc.querySelector('main')
  if (main && main.scrollWidth > main.clientWidth + 1) {
    issues.push(`${label}: overflow sideways in main ${main.scrollWidth} > ${main.clientWidth}`)
  }

  const controls = doc.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="switch"], [role="checkbox"], [role="tab"]'
  )
  for (const el of controls) {
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    const name = text(el) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName
    if (r.height < 44 || r.width < 44) {
      if (inlineTextLink(el)) counts.inlineLinks += 1
      else issues.push(`${label}: small ${Math.round(r.width)}x${Math.round(r.height)} "${name}"`)
    }
    if (r.right > w + 1 || r.left < -1 || r.bottom > h + 1 || r.top < -1) {
      if (inScroller(el)) counts.belowFold += 1
      else issues.push(`${label}: unreachable "${name}"`)
    }
  }
}

let running = false

async function go(doc, win, route) {
  win.history.pushState({}, '', route.path)
  win.dispatchEvent(new win.PopStateEvent('popstate'))
  await until(
    () => doc.querySelector(`[data-page="${route.page}"]`) !== null && win.location.pathname === route.path.split('?')[0],
    `${route.path} rendered its page`
  )
  if (route.open === 'more') {
    const more = doc.querySelector('[aria-label="More sections"]')
    if (more && more.getBoundingClientRect().width > 0) {
      more.click()
      await until(() => doc.querySelector('[data-sheet="more"]') !== null, 'the More sheet opened')
    }
  }
}

async function probe(w, h, note, routes = ROUTES) {
  document.getElementById('probe-frame')?.remove()
  document.body.style.margin = '0'
  const frame = document.createElement('iframe')
  frame.id = 'probe-frame'
  frame.src = routes[0].path
  frame.style.cssText = `width:${w}px;height:${h}px;border:0;display:block;background:#0a0a0a`
  document.body.appendChild(frame)
  await new Promise((r) => frame.addEventListener('load', r, { once: true }))
  const doc = frame.contentDocument
  const win = frame.contentWindow
  await until(() => doc.querySelector('[data-page]') !== null, `the app booted at ${w}x${h}`, 15000)
  await wait(SETTLE_MS)

  const issues = []
  const counts = { inlineLinks: 0, belowFold: 0 }
  for (const route of routes) {
    await go(doc, win, route)
    await wait(SETTLE_MS)
    inspect(doc, w, h, route.label, issues, counts)
  }
  return { size: `${w}x${h}`, note, issues, counts }
}

async function probeAll(sizes = SIZES, routes = ROUTES) {
  if (running) throw new Error('probe: a sweep is already running in this tab')
  running = true
  const rows = []
  const started = performance.now()
  try {
    for (const [w, h, note] of sizes) {
      try {
        rows.push(await probe(w, h, note, routes))
      } catch (e) {
        rows.push({ size: `${w}x${h}`, note, issues: [`THREW: ${(e && e.message) || e}`], counts: { inlineLinks: 0, belowFold: 0 } })
      }
    }
  } finally {
    running = false
    document.getElementById('probe-frame')?.remove()
  }
  rows.seconds = +((performance.now() - started) / 1000).toFixed(1)
  globalThis.probeRows = rows
  return rows
}

const FAULT = /overflow|unreachable|: small |THREW/

function report(rows) {
  const out = []
  let failed = 0
  for (const row of rows) {
    const bad = [...new Set(row.issues.filter((i) => FAULT.test(i)))]
    if (bad.length > 0) failed += 1
    const c = row.counts || { inlineLinks: 0, belowFold: 0 }
    out.push(
      `${bad.length === 0 ? 'ok  ' : 'FAIL'} ${row.size.padEnd(9)} ${row.note}  (${c.belowFold} below fold, ${c.inlineLinks} inline links)`
    )
    for (const issue of bad) out.push(`       ${issue}`)
  }
  out.push('')
  out.push(`${rows.length - failed}/${rows.length} sizes clean` + (rows.seconds === undefined ? '' : `, ${rows.seconds}s`))
  return out.join('\n')
}

globalThis.probe = probe
globalThis.probeAll = probeAll
globalThis.report = report
globalThis.SIZES = SIZES
globalThis.ROUTES = ROUTES
globalThis.TEAM_ROUTES = TEAM_ROUTES
console.log('probe ready. run: report(await probeAll())')
