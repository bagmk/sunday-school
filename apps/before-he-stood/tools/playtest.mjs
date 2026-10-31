#!/usr/bin/env node
/*
 * tools/playtest.mjs - end-to-end browser playtest for "Before He Stood" (SPEC version 4: story mode).
 * Owner: engine + tools agent. Node 22+, Playwright (npm package installed outside the project) + preinstalled Chromium.
 *
 * Usage:
 *   node tools/playtest.mjs [--route scribe,friend,asher] [--profiles phone,tv1080,tv720] [--no-keyboard]
 *                           [--quick] [--root DIR] [--headed] [--no-dist] [--no-shots]
 *                           [--step-timeout MS] [--run-timeout S] [--budget-min N]
 *
 * One-time setup (outside the project; the version must match the preinstalled chromium-1194 build):
 *   npm i --prefix /tmp/pwqa playwright@1.56.1
 * The module is looked up in $PLAYWRIGHT_MODULE, /tmp/pwqa/node_modules, ./node_modules and the global
 * npm root. PLAYWRIGHT_BROWSERS_PATH defaults to /opt/pw-browsers when that folder exists.
 *
 * Plans: "true" = the true path (the first continue option at every choice); "one" = the first cut
 * branch and the first scold met on the way, then the true path; "all" = every cut branch (each one:
 * snip card, Try again, back at the same choice with the same options) and every scold (the option
 * disappears, the same choice is asked again), then the true path.
 * Run matrix (per route):
 *   tv1080 1920x1080, mouse, both languages: plan "all" (screenshots qa/playtest/tv-*.png)
 *   tv1080 keyboard only (Space/Enter/ArrowRight/PageDown/ArrowDown advance, 1-4 pick by position, a
 *          clicker's PageDown moves the focus and "b" picks it, Enter on the snip card and the story
 *          tree, no mouse): plan "one", then the route
 *          select with the played badge and the focus on the next character
 *   tv720  1280x720, mouse: plan "true", language ko (scribe) / en (friend) / both (asher)
 *   phone  390x844, isMobile, touch, DPR 2: plan "one", with leave-and-resume checks
 * Every run starts at the title, goes through the prologue, route select and the route, and ends on the
 * route's story tree (the cut branches seen in that run labeled, the others faint, unlabeled stubs; the
 * star lit). Checks on every screen: console/page errors, failed local requests, unresolved text,
 * horizontal overflow, tap targets >= 44 px; no ASCII digits on options, cards, the snip card or the
 * trees. True-path runs also match their text screens one by one against the SPEC reference
 * (tools/validate.mjs simulate). TV runs check SPEC 5.6: story text >= 36 px and options >= 30 px at
 * 1080p (>= 24 / 20 px at 720p), nothing outside the viewport, the text panel below the top 60%.
 * The title checks open the story trees from the title, the deep links, ?debug=1 (jump list = choice
 * ids plus one entry per cut branch), drop stale saves (lens releases, a stale fingerprint) without a
 * "Continue", and check the class flow on the route select. One route is also played from
 * dist/before-he-stood.html via file://.
 *
 * Output: qa/reports/playtest.txt and screenshots in qa/playtest/.
 * Exit code: 0 = all checks passed, 1 = failures, 2 = skipped (index.html or Playwright missing).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';
import {
  loadProject, simulate, renderText, verseDisplayText, Report, ROUTE_IDS, isObj, optionOutcome, choicesOf, nextPick, treeLevels
} from './validate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const T0 = Date.now();

const PROFILES = {
  phone: { id: 'phone', viewport: { width: 390, height: 844 }, mobile: true, scale: 2, tv: null },
  tv1080: { id: 'tv1080', viewport: { width: 1920, height: 1080 }, mobile: false, scale: 1, tv: { story: 36, option: 30 } },
  tv720: { id: 'tv720', viewport: { width: 1280, height: 720 }, mobile: false, scale: 1, tv: { story: 24, option: 20 } }
};
const ADVANCE_KEYS = ['Space', 'Enter', 'ArrowRight', 'PageDown', 'ArrowDown'];
const REQUIRED_KEYS = ['Space', 'Enter', 'ArrowRight'];

// ---------------------------------------------------------------------------------------------
// Arguments

function parseArgs(argv) {
  const a = {
    root: DEFAULT_ROOT, routes: null, profiles: ['phone', 'tv1080', 'tv720'],
    keyboard: true, quick: false, headed: false, dist: true, shots: true,
    stepTimeout: 5000, runTimeout: 240, budgetMin: 25
  };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    const val = () => argv[++i];
    if (x === '--root') a.root = path.resolve(val());
    else if (x === '--route' || x === '--routes') a.routes = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (x === '--profiles') a.profiles = val().split(',').map((s) => s.trim()).filter((p) => PROFILES[p]);
    else if (x === '--no-keyboard') a.keyboard = false;
    else if (x === '--quick') a.quick = true;
    else if (x === '--headed') a.headed = true;
    else if (x === '--no-dist') a.dist = false;
    else if (x === '--no-shots') a.shots = false;
    else if (x === '--step-timeout') a.stepTimeout = Number(val());
    else if (x === '--run-timeout') a.runTimeout = Number(val());
    else if (x === '--budget-min') a.budgetMin = Number(val());
    else if (x === '-h' || x === '--help') a.help = true;
    else a.bad = x;
  }
  return a;
}

// ---------------------------------------------------------------------------------------------
// Small helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snip = (s, n = 60) => {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
};
const elapsedMin = () => (Date.now() - T0) / 60000;
const pad = (s, n) => { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); };
const norm = (s) => String(s || '').replace(/[\s​]+/g, '');

function withTimeout(promise, ms, onTimeout) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => { timer = setTimeout(() => resolve(onTimeout()), ms); })
  ]);
}

function buildPlan(routes, args) {
  const plan = [];
  for (const rid of routes) {
    if (args.profiles.includes('tv1080')) {
      if (!args.quick) plan.push({ rid, mode: 'all', profile: 'tv1080', input: 'mouse', lang: 'both', shots: true });
      if (args.keyboard) plan.push({ rid, mode: 'one', profile: 'tv1080', input: 'keyboard', lang: 'both', shots: false });
    }
    if (args.profiles.includes('tv720') && !args.quick) {
      plan.push({ rid, mode: 'true', profile: 'tv720', input: 'mouse', lang: { scribe: 'ko', friend: 'en', asher: 'both' }[rid] || 'both', shots: false });
    }
    if (args.profiles.includes('phone')) plan.push({ rid, mode: args.quick ? 'true' : 'one', profile: 'phone', input: 'touch', lang: 'both', shots: true });
  }
  return plan;
}

function runLabel(p) {
  return `${p.rid}/${p.mode}@${p.profile}${p.input === 'keyboard' ? '+kbd' : ''}${p.lang !== 'both' ? '(' + p.lang + ')' : ''}`;
}

// What a run picks at a shown choice. Plan "all" tries every cut option and every scold once (in option
// order), "one" only the first cut option and the first scold met on the way; then the first continue
// option moves the story on (the true path).
function decide(run, route, cid, shown) {
  const b = choicesOf(route).find((x) => x.id === cid);
  if (!b) return null;
  if (run.mode !== 'true') {
    for (const o of (b.options || []).filter((x) => isObj(x) && shown.includes(x.id))) {
      const kind = optionOutcome(o);
      if (kind === 'continue') continue;
      if (run.tried.has(`${cid}/${o.id}`)) continue;
      if (run.mode === 'one' && ((kind === 'bad' && run.oneBad) || (kind === 'scold' && run.oneScold))) continue;
      return { id: o.id, kind, bad: o.bad || null };
    }
  }
  return { id: nextPick(b, shown, { picks: {} }), kind: 'continue' };
}

// Normalized prefixes of texts that are centered by design: "sign" captions, last lines and memory verses.
function specialTexts(data) {
  const out = new Set();
  const add = (t) => {
    if (!t) return;
    for (const l of ['ko', 'en']) {
      const r = norm(renderText(String(t[l] || ''), l, data.scripture)).replace(/[“”"]/g, '').slice(0, 12);
      if (r.length >= 4) out.add(r);
    }
  };
  const visit = (v) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (!isObj(v)) return;
    if (v.type === 'line' && v.speaker === 'sign') add(v.text);
    Object.values(v).forEach(visit);
  };
  visit(data.common && data.common.prologue);
  for (const rid of ROUTE_IDS) {
    const r = data.routes[rid];
    if (!isObj(r)) continue;
    visit(r);
    const e = isObj(r.endings) ? r.endings : {};
    if (isObj(e.good)) {
      add(e.good.last);
      const v = data.scripture && data.scripture[e.good.verse];
      if (v) add({ ko: v.ko, en: verseDisplayText(v.en, 'en') });
    }
    if (isObj(e.bad)) Object.values(e.bad).forEach((x) => x && add(x.last));
  }
  return [...out];
}

// Expected text screens (textbox contents) of the true path, as normalized prefixes: the prologue, then
// the route along the first continue options, the memory verse and the ending. Verse cards use the
// display form (SPEC 4.3).
function expectedTranscript(data, rid, lang) {
  const l = lang === 'en' ? 'en' : 'ko';
  const out = [];
  const add = (raw, kind) => {
    const s = String(raw || '');
    const r = norm(kind === 'verse' ? verseDisplayText(s, l) : renderText(s, l, data.scripture)).replace(/[“”"]/g, '');
    out.push(r.slice(0, 14));
  };
  for (const b of (data.common && data.common.prologue) || []) {
    if (!isObj(b)) continue;
    if (b.type === 'line' && b.text) add(b.text[l], 'line');
  }
  const sim = simulate(data.routes[rid], data, { picks: {} });
  for (const it of sim.out) {
    if (it.kind === 'line') add(it.beat.text && it.beat.text[l], 'line');
    else if (it.kind === 'verse' || it.kind === 'memory') {
      const key = it.kind === 'memory' ? it.key : it.beat.key;
      add(data.scripture && data.scripture[key] ? data.scripture[key][l] : '', 'verse');
    }
  }
  const dedup = [];
  for (const x of out) if (dedup[dedup.length - 1] !== x) dedup.push(x);
  return dedup;
}

function textIn(t, lang) {
  if (!t) return [];
  return lang === 'en' ? [t.en] : lang === 'ko' ? [t.ko] : [t.ko, t.en];
}

// ---------------------------------------------------------------------------------------------
// Playwright loading

function loadPlaywright(root) {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
  const candidates = [process.env.PLAYWRIGHT_MODULE, '/tmp/pwqa/node_modules/playwright', path.join(root, 'node_modules', 'playwright')];
  try {
    const g = execSync('npm root -g', { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (g) candidates.push(path.join(g, 'playwright'));
  } catch (e) { /* npm not available */ }
  const req = createRequire(import.meta.url);
  for (const c of candidates.filter(Boolean)) {
    try {
      if (!fs.existsSync(path.join(c, 'package.json'))) continue;
      const mod = req(c);
      const version = JSON.parse(fs.readFileSync(path.join(c, 'package.json'), 'utf8')).version;
      return { pw: mod, from: c, version };
    } catch (e) { /* try next */ }
  }
  return null;
}

async function launchBrowser(pw, headed) {
  const errors = [];
  try {
    return { browser: await pw.chromium.launch({ headless: !headed }), how: 'default' };
  } catch (e) { errors.push(e.message.split('\n')[0]); }
  for (const exe of ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium']) {
    if (!fs.existsSync(exe)) continue;
    try {
      return { browser: await pw.chromium.launch({ headless: !headed, executablePath: exe }), how: exe };
    } catch (e) { errors.push(e.message.split('\n')[0]); }
  }
  throw new Error('could not launch Chromium: ' + errors.join(' | '));
}

// ---------------------------------------------------------------------------------------------
// In-page helpers (serialized into every page with addInitScript; must be self-contained)

function initQa() {
  const vis = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    // Like Playwright, opacity does not count: elements fading in (opacity 0 at the first frame) are visible.
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (e.hidden) return false;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    return true;
  };
  const dbg = () => {
    try {
      const B = window.BHS || {};
      let d = null;
      let src = null;
      if (B.ui && typeof B.ui.debugState === 'function') { d = B.ui.debugState(); src = 'BHS.ui.debugState()'; }
      else if (window.BHS_DEBUG && typeof window.BHS_DEBUG.state === 'function') { d = window.BHS_DEBUG.state(); src = 'BHS_DEBUG.state()'; }
      return d ? { d: JSON.parse(JSON.stringify(d)), src } : { d: null, src: null };
    } catch (e) { return { d: null, src: 'error: ' + e.message }; }
  };
  const visibleIds = () => {
    const ids = [];
    document.querySelectorAll('[data-testid]').forEach((el) => { if (vis(el)) ids.push(el.getAttribute('data-testid')); });
    return ids;
  };
  const text = (sel) => {
    const el = document.querySelector(sel);
    return el && vis(el) ? (el.innerText || '').trim() : '';
  };
  const KEY_IDS = /^(choice-[a-d]|press|route-\w+|start|ending-title|verse-card|memory-verse|confirm-yes|snip-card|tree-(next|home)|trees-home)$/;
  const sig = () => {
    const b = dbg().d;
    const ids = visibleIds().filter((x) => KEY_IDS.test(x)).join(',');
    return [document.body.dataset.screen || '', b ? b.list + '#' + b.beatIndex : '', text('[data-testid="textbox"]'), text('[data-testid="ending-title"]'), ids].join('|');
  };
  const isKo = (t) => /[가-힣]/.test(t);
  // Font sizes of visible text inside an element, split into Korean and other text.
  const fontsIn = (root) => {
    const out = { ko: [], en: [] };
    if (!root || !vis(root)) return out;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      const t = n.nodeValue.replace(/\s+/g, '');
      if (!t) continue;
      const el = n.parentElement;
      if (!el || !vis(el)) continue;
      out[isKo(t) ? 'ko' : 'en'].push({ fs: parseFloat(getComputedStyle(el).fontSize), t: t.slice(0, 16) });
    }
    return out;
  };
  const sum = (arr) => (arr.length ? { min: Math.min(...arr.map((x) => x.fs)), max: Math.max(...arr.map((x) => x.fs)), sample: arr.reduce((a, b) => (b.fs < a.fs ? b : a)).t } : null);
  const tv = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const tb = document.querySelector('[data-testid="textbox"]');
    const story = fontsIn(tb);
    const opts = { ko: [], en: [] };
    const choiceEls = Array.from(document.querySelectorAll('[data-testid^="choice-"]')).filter(vis);
    choiceEls.forEach((b) => { const f = fontsIn(b); opts.ko.push(...f.ko); opts.en.push(...f.en); });
    const sp = fontsIn(document.querySelector('[data-testid="speaker"]'));
    let panel = null;
    if (tb && vis(tb)) {
      // The visual panel is the nearest ancestor with a background, but never a (near) full-screen container.
      for (let e = tb; e && e !== document.body; e = e.parentElement) {
        if (e.getBoundingClientRect().height > 0.9 * H) break;
        const cs = getComputedStyle(e);
        const bg = cs.backgroundColor;
        if ((cs.backgroundImage && cs.backgroundImage !== 'none') || (bg && bg !== 'transparent' && !/rgba\(\d+, \d+, \d+, 0\)/.test(bg))) { panel = e; break; }
      }
      if (!panel) panel = tb;
    }
    const pr = panel ? panel.getBoundingClientRect() : null;
    const stage = document.getElementById('stage');
    const offenders = [];
    let minAll = null;
    const all = document.body.querySelectorAll('*');
    for (const el of all) {
      if (stage && stage.contains(el)) continue;
      if (el.closest('[aria-hidden="true"], noscript, script, style, .vh')) continue;
      const hasText = Array.from(el.childNodes).some((c) => c.nodeType === 3 && c.nodeValue.trim());
      const isContent = hasText || el.matches('button, a[href], input, textarea, select, [data-testid]');
      if (!isContent) continue;
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (offenders.length < 8 && (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)) {
        offenders.push({
          id: el.getAttribute('data-testid') || el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''),
          r: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
          text: (el.innerText || '').trim().slice(0, 24)
        });
      }
      if (hasText) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (!minAll || fs < minAll.fs) minAll = { fs, id: el.getAttribute('data-testid') || el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''), t: (el.innerText || '').trim().slice(0, 20) };
      }
    }
    const light = document.getElementById('light');
    let fsBtn = null;
    document.querySelectorAll('button, [role="button"]').forEach((b) => {
      const k = (b.getAttribute('data-testid') || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '');
      if (/fullscreen|full screen|전체\s?화면/i.test(k) && vis(b)) fsBtn = b.getAttribute('data-testid') || 'button';
    });
    return {
      W, H,
      story: { ko: sum(story.ko), en: sum(story.en) },
      options: { ko: sum(opts.ko), en: sum(opts.en) },
      speaker: sum(sp.ko.concat(sp.en)),
      panel: pr ? { top: pr.top, bottom: pr.bottom, left: pr.left, right: pr.right, width: pr.width } : null,
      choices: choiceEls.map((b) => { const r = b.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), text: (b.innerText || '').trim().slice(0, 40) }; }),
      stacked: !!document.querySelector('#choices.is-stacked'),
      offenders,
      scrollH: Math.max(document.documentElement.scrollHeight, (document.getElementById('screen') || document.body).scrollHeight),
      minAll,
      light: light ? light.getAttribute('data-level') : null,
      fullscreenButton: fsBtn,
      dialogOpen: Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')).some(vis)
    };
  };
  // ASCII digits on game chrome (options, cards, the snip card, story trees, route cards).
  const digits = () => {
    const out = [];
    const sel = '[data-testid^="choice-"], [data-testid="ending-title"], [data-testid="snip-card"], [data-testid^="tree-"], .routecard';
    document.querySelectorAll(sel).forEach((el) => {
      if (!vis(el)) return;
      const t = (el.innerText || '').trim();
      if (/[0-9]/.test(t) && out.length < 4) out.push(`${el.getAttribute('data-testid') || el.className}: "${t.replace(/\s+/g, ' ').slice(0, 40)}"`);
    });
    return out;
  };
  const snap = (opts) => {
    const ids = visibleIds();
    const b = dbg();
    const sw = document.documentElement.scrollWidth;
    const iw = window.innerWidth;
    const small = [];
    document.querySelectorAll('button, [role="button"], a[href], input[type="button"], input[type="submit"], summary').forEach((el) => {
      if (!vis(el) || el.closest('.debug')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) {
        small.push({
          id: el.getAttribute('data-testid') || (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')),
          w: Math.round(r.width), h: Math.round(r.height),
          text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30)
        });
      }
    });
    const bodyText = document.body.innerText || '';
    const leaks = [];
    const re = /\{\{[^}\n]*\}?\}?|\[MT_[A-Za-z0-9_]*\]?|\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/g;
    let m;
    while ((m = re.exec(bodyText)) && leaks.length < 5) leaks.push(bodyText.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24).replace(/\s+/g, ' '));
    const shown = Array.from(document.querySelectorAll('[data-testid^="choice-"]')).filter(vis).map((el) => el.getAttribute('data-option'));
    const choiceTexts = {};
    Array.from(document.querySelectorAll('[data-testid^="choice-"]')).filter(vis).forEach((el) => { choiceTexts[el.getAttribute('data-option')] = (el.innerText || '').trim(); });
    const snipped = Array.from(document.querySelectorAll('[data-testid^="choice-"][data-snipped="true"]')).filter(vis).map((el) => el.getAttribute('data-option'));
    const ae = document.activeElement;
    return {
      screen: document.body.dataset.screen || '',
      ids,
      dbg: b.d,
      dbgSource: b.src,
      textbox: text('[data-testid="textbox"]'),
      speaker: text('[data-testid="speaker"]'),
      endingTitle: text('[data-testid="ending-title"]'),
      shown,
      snipped,
      choiceTexts,
      badges: document.querySelectorAll('.opt__num').length,
      overflow: sw - iw,
      scrollWidth: sw,
      innerWidth: iw,
      small,
      leaks,
      digits: digits(),
      bodyText: bodyText.slice(0, 4000),
      focus: ae && ae !== document.body ? ae.getAttribute('data-testid') || ae.tagName.toLowerCase() : null,
      tv: opts && opts.tv ? tv() : null,
      sig: sig()
    };
  };
  window.__qa = { vis, dbg, sig, snap, visibleIds };
}

// ---------------------------------------------------------------------------------------------
// Results

class Results {
  constructor() {
    this.runs = [];
    this.global = { failures: [], warnings: [], info: [] };
    this.small = new Map();
    this.overflow = new Map();
    this.external = new Set();
    this.screensChecked = 0;
  }
  fail(msg) { this.global.failures.push(msg); }
  warn(msg) { if (!this.global.warnings.includes(msg)) this.global.warnings.push(msg); }
  info(msg) { if (!this.global.info.includes(msg)) this.global.info.push(msg); }
}

// ---------------------------------------------------------------------------------------------
// Page plumbing

async function newPage(browser, R, opts = {}) {
  const prof = PROFILES[opts.profile || 'phone'];
  const context = await browser.newContext({
    viewport: opts.viewport || prof.viewport,
    isMobile: opts.mobile != null ? opts.mobile : prof.mobile,
    hasTouch: opts.mobile != null ? opts.mobile : prof.mobile,
    deviceScaleFactor: opts.scale || prof.scale,
    locale: 'ko-KR',
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference'
  });
  // Offline check: only the local server, file:, data: and blob: URLs may load.
  await context.route('**/*', (route) => {
    let u;
    try { u = new URL(route.request().url()); } catch (e) { return route.continue(); }
    if (u.protocol === 'file:' || u.protocol === 'data:' || u.protocol === 'blob:' || u.hostname === '127.0.0.1' || u.hostname === 'localhost') return route.continue();
    R.external.add(u.hostname);
    return route.abort();
  });
  await context.addInitScript(initQa);
  const page = await context.newPage();
  page.setDefaultTimeout(opts.stepTimeout || 5000);
  const log = { console: [], pageErrors: [], requestFailed: [], dialogs: [] };
  const isLocal = (url) => !url || /^(file:|data:|blob:|http:\/\/(127\.0\.0\.1|localhost)[:/])/.test(url);
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const where = msg.location() || {};
    if (!isLocal(where.url)) return;
    if (/net::ERR_FAILED/.test(msg.text()) && /Failed to load resource/.test(msg.text())) return;
    log.console.push(`${snip(msg.text(), 200)}${where.url ? ` (${where.url.replace(/^.*\//, '')}:${where.lineNumber})` : ''}`);
  });
  page.on('pageerror', (err) => log.pageErrors.push(snip(err && err.stack ? err.stack.split('\n').slice(0, 2).join(' ') : String(err), 240)));
  page.on('requestfailed', (req) => {
    if (!isLocal(req.url())) return;
    log.requestFailed.push(`${req.url()} (${req.failure() ? req.failure().errorText : 'failed'})`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && isLocal(res.url())) log.requestFailed.push(`${res.url()} (HTTP ${res.status()})`);
  });
  page.on('dialog', (d) => { log.dialogs.push(`${d.type()}: ${snip(d.message(), 80)}`); d.dismiss().catch(() => {}); });
  return { context, page, log };
}

const loc = (page, id) => page.locator(`[data-testid="${id}"]:visible`).first();
const snapOf = (page, tv) => page.evaluate((o) => window.__qa.snap(o), { tv: !!tv });

async function visible(page, id) {
  try { return await loc(page, id).isVisible(); } catch (e) { return false; }
}

// Pointer activation: touch tap on phones, mouse click on TV; falls back to a DOM click.
async function tap(page, id, run, input, timeout = 2500) {
  const l = loc(page, id);
  try {
    if (input === 'touch') await l.tap({ timeout });
    else await l.click({ timeout });
    return 'click';
  } catch (e) {
    try {
      await l.dispatchEvent('click', {}, { timeout: 1000 });
      if (run) {
        const screen = await page.evaluate(() => document.body.dataset.screen).catch(() => '?');
        const why = (e.message.match(/(intercepts pointer events|not stable|not visible|not enabled|outside of the viewport|detached)[^\n]*/) || [e.message.split('\n')[0]])[0];
        run.fallbacks = (run.fallbacks || 0) + 1;
        run.note(`"${id}" could not be ${input === 'touch' ? 'tapped' : 'clicked'} normally on "${screen}" (${snip(why, 110)}); used a DOM click`);
      }
      return 'dispatch';
    } catch (e2) { return null; }
  }
}

// Keyboard-only activation of a page button: Tab until it has focus, then Enter.
async function keyActivate(page, id, run, maxTabs = 60) {
  for (let i = 0; i <= maxTabs; i++) {
    const f = await page.evaluate(() => (document.activeElement ? document.activeElement.getAttribute('data-testid') : null));
    if (f === id) {
      // SPEC 5.4: visible focus. The focused control needs an outline or a focus box-shadow.
      if (run && !run.focusChecked.has(id)) {
        run.focusChecked.add(id);
        const ring = await page.evaluate(() => {
          const cs = getComputedStyle(document.activeElement);
          const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
          return { outline, shadow: cs.boxShadow !== 'none' };
        });
        if (!ring.outline && !ring.shadow) run.warn(`keyboard: "${id}" has no visible focus indicator (SPEC 5.4)`, true);
      }
      await page.keyboard.press('Enter');
      return true;
    }
    await page.keyboard.press('Tab');
  }
  if (run) run.fail(`keyboard: could not reach "${id}" with Tab (${maxTabs} presses)`, true);
  return false;
}

async function waitChange(page, prevSig, timeout) {
  try {
    await page.waitForFunction((prev) => window.__qa && window.__qa.sig() !== prev, prevSig, { timeout, polling: 40 });
    return true;
  } catch (e) { return false; }
}

async function waitScreen(page, names, timeout) {
  const list = Array.isArray(names) ? names : [names];
  try {
    await page.waitForFunction((l) => l.includes(document.body.dataset.screen), list, { timeout, polling: 50 });
    return true;
  } catch (e) { return false; }
}

async function shot(page, file, R) {
  try {
    await page.screenshot({ path: file });
    return path.basename(file);
  } catch (e) {
    R.warn(`screenshot failed (${path.basename(file)}): ${snip(e.message, 80)}`);
    return null;
  }
}
// ---------------------------------------------------------------------------------------------
// Per-snapshot checks

function checkSnapshot(s, run, R) {
  R.screensChecked++;
  const where = run.where;
  if (s.overflow > 1) {
    const k = `${run.profile}|${s.screen}`;
    if (!R.overflow.has(k)) R.overflow.set(k, `${where}: horizontal overflow on "${s.screen}" (scrollWidth ${s.scrollWidth} > innerWidth ${s.innerWidth})`);
    run.fail(`horizontal overflow on screen "${s.screen}" (scrollWidth ${s.scrollWidth} > ${s.innerWidth})`, true);
  }
  for (const b of s.small) {
    // SPEC 5.4 tap targets are a touch rule: FAIL on the phone profile, WARN on mouse/keyboard TV profiles.
    const k = `${run.profile}|${b.id}`;
    if (!R.small.has(k)) R.small.set(k, `[${run.profile}] ${b.id} is ${b.w}x${b.h} px${b.text ? ` ("${snip(b.text, 24)}")` : ''}, first on "${s.screen}" (${where})`);
    const msg = `tap target smaller than 44x44: ${b.id} ${b.w}x${b.h} (first on "${s.screen}")`;
    if (run.small.has(b.id)) continue;
    run.small.add(b.id);
    if (PROFILES[run.profile].tv) run.warn(msg, true);
    else run.fail(msg, true);
  }
  if (s.digits.length) run.fail(`ASCII digits on screen "${s.screen}" (SPEC 5.6: no numbers during play): ${s.digits[0]}`, true);
  if (s.leaks.length) run.fail(`unresolved or broken text on "${s.screen}": "${s.leaks[0]}"`, true);
  if (run.lang === 'both' && s.screen === 'play' && s.textbox && s.textbox.length > 6) {
    const hasKo = HANGUL.test(s.textbox);
    const hasEn = /[A-Za-z]{3,}/.test(s.textbox);
    if (!hasKo || !hasEn) run.warn(`"both" language mode shows only ${hasKo ? 'Korean' : 'English'} in the text box: "${snip(s.textbox, 50)}"`, true);
  }
  if (run.lang === 'en' && s.textbox && HANGUL.test(s.textbox)) run.warn(`English mode shows Hangul in the text box: "${snip(s.textbox, 50)}"`, true);
  if (run.lang === 'ko' && s.textbox && /[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(s.textbox)) run.warn(`Korean mode shows English in the text box: "${snip(s.textbox, 50)}"`, true);
  if (s.tv) checkTv(s, run);
}

// SPEC 5.6 TV checks (coordinator thresholds: 1080p story >= 36 px, options >= 30 px; 720p 24 / 20 px).
function checkTv(s, run) {
  const tv = s.tv;
  const vh = tv.H / 100;
  const primary = run.lang === 'en' ? 'en' : 'ko';
  const m = run.tvm;
  const playLike = s.screen === 'play' || s.screen === 'prologue' || s.screen === 'ending';
  if (playLike && s.textbox && tv.story[primary]) {
    const st = tv.story[primary];
    if (st.min < m.storyMin) { m.storyMin = st.min; m.storySample = st.sample; }
    if (run.lang === 'both' && tv.story.en && tv.story.en.min < m.storyEnMin) { m.storyEnMin = tv.story.en.min; m.storyEnSample = tv.story.en.sample; }
    const special = run.special && run.special.some((x) => norm(s.textbox).includes(x));
    if (tv.panel && special) {
      const topPct = (tv.panel.top / tv.H) * 100;
      if (topPct < m.specialTopMin) m.specialTopMin = topPct;
    } else if (tv.panel) {
      const topPct = (tv.panel.top / tv.H) * 100;
      if (topPct < m.panelTopMin) { m.panelTopMin = topPct; m.panelTopText = s.textbox; }
      if (tv.panel.top < 0.6 * tv.H - 2 && !m.panelBad.some((x) => x.text === s.textbox)) m.panelBad.push({ pct: topPct, text: s.textbox });
      const centerOff = Math.abs((tv.panel.left + tv.panel.right) / 2 - tv.W / 2);
      if (centerOff > tv.W * 0.03) run.warn(`TV: text panel is not centered (center ${Math.round(centerOff)} px off)`, true);
      if (tv.panel.width > tv.W * 0.9) run.warn(`TV: text panel spans ${Math.round(tv.panel.width / tv.W * 100)}% of the width (SPEC 5.6: comfortable max width)`, true);
    }
    if (s.speaker && tv.speaker && tv.speaker.min < 3 * vh - 0.5) run.warn(`TV: speaker name ${tv.speaker.min.toFixed(1)} px < 3vh (${(3 * vh).toFixed(1)} px)`, true);
  }
  if (s.screen === 'play' && tv.options[primary]) {
    const op = tv.options[primary];
    if (op.min < m.optionMin) { m.optionMin = op.min; m.optionSample = op.sample; }
    if (tv.choices.length === 4 && run.profile === 'tv1080' && !tv.stacked) {
      const xs = new Set(tv.choices.map((c) => Math.round(c.x / 20)));
      const ys = new Set(tv.choices.map((c) => Math.round(c.y / 20)));
      if (!(xs.size === 2 && ys.size === 2)) run.warn(`TV: options are not in a 2x2 grid at 1920 wide (SPEC 5.6; ${xs.size} columns x ${ys.size} rows)`, true);
    }
  }
  for (const o of tv.offenders) {
    const k = `${s.screen}|${o.id}|${o.r.join(',')}`;
    if (m.offenderKeys.has(k)) continue;
    m.offenderKeys.add(k);
    m.offenders++;
    if (!m.offendersByScreen.has(s.screen)) m.offendersByScreen.set(s.screen, []);
    m.offendersByScreen.get(s.screen).push(`${o.id} [${o.r.join(', ')}]${o.text ? ` "${snip(o.text, 18)}"` : ''}`);
  }
  if (tv.scrollH > tv.H + 1 && !m.scrollScreens.has(s.screen)) {
    m.scrollScreens.add(s.screen);
    run.fail(`TV: page scrolls vertically on "${s.screen}" (scrollHeight ${tv.scrollH} > ${tv.H})`, true);
  }
  if (tv.minAll && tv.minAll.fs < 2.2 * vh - 0.5) {
    run.warn(`TV: text below 2.2vh on "${s.screen}": ${tv.minAll.id} at ${tv.minAll.fs.toFixed(1)} px ("${snip(tv.minAll.t, 20)}") (SPEC 5.6: nothing below 2.2vh)`, true);
  }
}

// Turns the per-screen TV measurements of a run into a few aggregated failure lines.
function finalizeTv(run, prof) {
  const m = run.tvm;
  const [W, H] = [prof.viewport.width, prof.viewport.height];
  if (m.storyMin < prof.tv.story - 0.25) run.fail(`TV: story text down to ${m.storyMin.toFixed(1)} px at ${W}x${H} (needs >= ${prof.tv.story} px; "${m.storySample}")`, true);
  if (m.storyEnMin < 2.2 * H / 100 - 0.25) run.fail(`TV: English story line down to ${m.storyEnMin.toFixed(1)} px (< 2.2vh = ${(2.2 * H / 100).toFixed(1)} px; "${m.storyEnSample}")`, true);
  if (m.optionMin < prof.tv.option - 0.25) run.fail(`TV: option text down to ${m.optionMin.toFixed(1)} px at ${W}x${H} (needs >= ${prof.tv.option} px; "${m.optionSample}")`, true);
  if (m.panelBad.length) {
    const worst = m.panelBad.reduce((a, b) => (b.pct < a.pct ? b : a));
    const eg = m.panelBad.slice(0, 3).map((x) => `${x.pct.toFixed(0)}% "${snip(x.text, 28)}"`).join('; ');
    run.fail(`TV: the text panel reaches above 60% of the screen height on ${m.panelBad.length} text screen(s); worst ${worst.pct.toFixed(0)}% ("${snip(worst.text, 40)}"); e.g. ${eg}`, true);
  }
  for (const [screen, list] of m.offendersByScreen) {
    run.fail(`TV: ${list.length} element(s) outside the ${W}x${H} viewport on "${screen}": ${list.slice(0, 3).join('; ')}${list.length > 3 ? '; ...' : ''}`, true);
  }
}

// ---------------------------------------------------------------------------------------------
// One playthrough

function newRun(p) {
  const run = {
    rid: p.rid, mode: p.mode, profile: p.profile, input: p.input, lang: p.lang, where: runLabel(p),
    made: {}, failures: [], warnings: [], notes: [], screens: new Set(), steps: 0, shots: [],
    title: '', result: 'PASS', ms: 0, last: { screen: '', beat: '', text: '' },
    texts: [], dbgSource: null, keys: { ok: {}, fail: {} }, small: new Set(), special: p.special || null, focusChecked: new Set(),
    tried: new Set(), triedBad: new Set(), oneBad: false, oneScold: false, pending: null,
    snips: 0, retries: 0, scolds: 0, memory: false, tree: false,
    tvm: {
      storyMin: Infinity, storyEnMin: Infinity, optionMin: Infinity, panelTopMin: Infinity, panelTopText: '', specialTopMin: Infinity,
      offenders: 0, offenderKeys: new Set(), offendersByScreen: new Map(), panelBad: [], scrollScreens: new Set(),
      storySample: '', storyEnSample: '', optionSample: ''
    }
  };
  run.fail = (m, once) => { if (!once || !run.failures.includes(m)) run.failures.push(m); };
  run.warn = (m, once) => { if (!once || !run.warnings.includes(m)) run.warnings.push(m); };
  run.note = (m) => { if (!run.notes.includes(m)) run.notes.push(m); };
  return run;
}

async function playRun(browser, R, cfg) {
  const { url, data, args, p, fileMode } = cfg;
  const rid = p.rid;
  const run = newRun(p);
  if (cfg.label) run.where = cfg.label;
  const t0 = Date.now();
  const prof = PROFILES[p.profile];
  const kbd = p.input === 'keyboard';
  const { context, page, log } = await newPage(browser, R, { profile: p.profile, stepTimeout: args.stepTimeout });
  const route = data.routes[rid];
  const ui = data.ui || {};
  const shotTaken = new Set();
  const takeShot = async (name, enabled) => {
    if (!enabled || !args.shots || shotTaken.has(name)) return;
    shotTaken.add(name);
    const f = await shot(page, path.join(args.shotDir, name + '.png'), R);
    if (f) run.shots.push(f);
  };
  const phoneShots = p.profile === 'phone' && p.shots && !fileMode;
  const tvShots = p.profile === 'tv1080' && p.shots && !fileMode;
  const firstShots = cfg.firstOfProfile;
  const did = {};
  let choiceCount = 0;
  let done = false;
  let advIdx = 0;
  const press = async (id) => (kbd ? keyActivate(page, id, run) : tap(page, id, run, p.input));
  const snapNow = () => snapOf(page, !!prof.tv);
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    if (resp && resp.status && resp.status() >= 400) { run.fail(`index page returned HTTP ${resp.status()}`); throw new Error('stop'); }
    if (!(await waitScreen(page, 'title', 10000))) {
      const s0 = await snapOf(page, false).catch(() => ({ screen: '?' }));
      run.fail(`title screen never appeared (body data-screen="${s0.screen}")`);
      throw new Error('stop');
    }
    let s = await snapNow();
    run.dbgSource = s.dbgSource;
    checkSnapshot(s, run, R);
    await takeShot('phone-title', phoneShots && firstShots);
    await takeShot('tv-title', tvShots && firstShots);
    for (const id of ['start', 'lang-ko', 'lang-en', 'lang-both', 'trees-open']) {
      if (!s.ids.includes(id)) run.fail(`title screen: data-testid="${id}" not visible`, true);
    }
    if (kbd) {
      const pressed = await page.evaluate(() => { const b = document.querySelector('[data-testid="lang-both"]'); return b ? b.getAttribute('aria-pressed') : null; });
      if (pressed !== 'true') run.warn(`title: lang-both is not the default selection (aria-pressed=${JSON.stringify(pressed)}; SPEC 5.2)`, true);
    } else if (s.ids.includes('lang-' + p.lang)) await tap(page, 'lang-' + p.lang, run, p.input);
    const before = await page.evaluate(() => window.__qa.sig());
    if (!(await press('start'))) { run.fail('could not activate "start"'); throw new Error('stop'); }
    await waitChange(page, before, args.stepTimeout);
    let stuck = 0;
    for (let guard = 0; guard < 1200 && !done; guard++) {
      s = await snapNow();
      run.steps++;
      run.screens.add(s.screen);
      run.last = { screen: s.screen, beat: s.dbg ? `${s.dbg.list}#${s.dbg.beatIndex}` : '', text: s.textbox || s.endingTitle };
      if (s.dbgSource && !run.dbgSource) run.dbgSource = s.dbgSource;
      checkSnapshot(s, run, R);
      if (s.textbox && /^(prologue|play|ending)$/.test(s.screen) && run.texts[run.texts.length - 1] !== s.textbox) run.texts.push(s.textbox);
      const prev = s.sig;
      let acted = null;
      switch (s.screen) {
        case 'title':
          acted = s.ids.includes('start') ? await press('start') : null;
          break;
        case 'prologue':
          acted = kbd ? 'key' : await tap(page, 'advance', run, p.input);
          break;
        case 'routeSelect':
          await takeShot('phone-route-select', phoneShots && firstShots);
          await takeShot('tv-route-select', tvShots && firstShots);
          for (const r of ROUTE_IDS) if (!s.ids.includes('route-' + r)) run.fail(`route select: data-testid="route-${r}" not visible`, true);
          if (!did.routeArt) {
            did.routeArt = true;
            await routeCardChecks(page, run);
          }
          acted = await press('route-' + rid);
          break;
        case 'play': {
          const choiceVisible = s.shown.length > 0;
          if (!choiceVisible && s.textbox) await takeShot(`phone-${rid}-1-first-scene`, phoneShots);
          if (s.ids.includes('verse-card')) await takeShot(`phone-${rid}-3-verse-card`, phoneShots);
          if (tvShots && !did.cursor && s.textbox && !choiceVisible && firstShots) { did.cursor = true; await cursorCheck(page, run); }
          if (!did.aria && s.textbox) {
            did.aria = true;
            const live = await page.evaluate(() => { const t = document.querySelector('[data-testid="textbox"]'); return t ? t.getAttribute('aria-live') || (t.closest('[aria-live]') ? 'inherited' : null) : null; });
            if (!live) run.warn('the text box has no aria-live (SPEC 5.4)', true);
          }
          if (prof.tv && !did.fsButton && s.tv) {
            did.fsButton = true;
            if (!s.tv.fullscreenButton) run.warn('TV: no visible fullscreen button during play (SPEC 5.6)', true);
          }
          if (!(Array.isArray(route.actions) && route.actions.length) && s.ids.some((x) => /^action-/.test(x))) run.fail('persistent action buttons are shown although the route has no actions (SPEC 4.5)', true);
          if (kbd && !did.esc && choiceCount >= 1 && s.textbox && !choiceVisible) { did.esc = true; await escMenuCheck(page, run, args); continue; }
          if (kbd && !did.fkey && choiceCount >= 2 && s.textbox && !choiceVisible) { did.fkey = true; await fullscreenKeyCheck(page, run); }
          if (choiceVisible) {
            const cid = s.dbg ? s.dbg.stepId : null;
            if (!cid) { run.fail('a choice is shown but debugState() has no step id'); throw new Error('stop'); }
            pendingAtChoice(run, s, cid);
            if (s.badges) run.fail(`options show number badges (.opt__num) at ${cid} (SPEC 5.6: no numbers on screen)`, true);
            await takeShot(`phone-${rid}-2-first-choice`, phoneShots);
            await takeShot(`tv-${rid}-choice`, tvShots);
            if (!fileMode && p.profile === 'phone' && !did.lang && run.mode !== 'true') { did.lang = true; await langSwitchCheck(page, run, s, p.input); }
            if (!fileMode && cfg.settingsCheck && !did.settings) { did.settings = true; await settingsCheck(page, run, p.input); }
            const d = decide(run, route, cid, s.shown);
            if (!d || !d.id) { run.fail(`${cid}: nothing to pick among ${s.shown.join(', ')}`); throw new Error('stop'); }
            let ok = false;
            if (kbd) {
              const idx = s.shown.indexOf(d.id);
              // Every third choice like a clicker: PageDown moves the focus (the first press shows it
              // on the first option), the blank-screen key "b" picks the focused option.
              const clicker = choiceCount % 3 === 2;
              const key = clicker ? `PageDown x${idx + 1}, b` : String(idx + 1);
              if (clicker) {
                for (let j = 0; j <= idx; j++) await page.keyboard.press('PageDown');
                await page.keyboard.press('b');
              } else await page.keyboard.press(key);
              ok = await waitChange(page, prev, args.stepTimeout);
              if (!ok) run.fail(`keyboard: key "${key}" did not pick option ${d.id} (place ${idx + 1}) at ${cid}`, true);
              acted = ok ? 'key' : null;
            } else {
              acted = await tap(page, 'choice-' + d.id, run, p.input);
              ok = acted ? await waitChange(page, prev, args.stepTimeout) : false;
            }
            if (ok) {
              choiceCount++;
              run.tried.add(`${cid}/${d.id}`);
              if (d.kind === 'bad') {
                run.oneBad = true;
                run.triedBad.add(d.bad);
                run.pending = { type: 'bad', cid, shown: s.shown.slice(), opt: d.id, bad: d.bad };
              } else if (d.kind === 'scold') {
                run.oneScold = true;
                run.pending = { type: 'scold', cid, shown: s.shown.slice(), opt: d.id, textsAt: run.texts.length };
              } else {
                run.made[cid] = d.id;
                const s2 = await snapOf(page, false);
                if (s2.dbg && s2.dbg.choices && s2.dbg.choices[cid] !== d.id) run.fail(`${cid}: debugState().choices.${cid} is ${JSON.stringify(s2.dbg.choices[cid])}, expected "${d.id}"`, true);
              }
              stuck = 0;
              continue;
            }
            if (!acted) { run.fail(`${cid}: could not pick option ${d.id}`); throw new Error('stop'); }
          } else if (s.ids.includes('press')) {
            if (kbd) {
              acted = 'key';
              const okKey = await keyAdvance(page, run, prev, args, ['Space', 'Enter', 'ArrowRight']);
              if (okKey) { stuck = 0; continue; }
              run.warn('keyboard: a press beat could not be activated with Space/Enter/ArrowRight; needed Tab+Enter (a clicker could not continue)', true);
              acted = (await keyActivate(page, 'press', run)) ? 'key' : null;
            } else acted = await tap(page, 'press', run, p.input);
          } else {
            if (!fileMode && p.profile === 'phone' && !did.resume && choiceCount >= 2 && s.textbox) {
              did.resume = true;
              if (!(await resumeCheck(page, run, s, p.input))) throw new Error('stop');
              continue;
            }
            acted = kbd ? 'key' : await tap(page, 'advance', run, p.input);
          }
          break;
        }
        case 'snip': {
          run.snips++;
          await takeShot(`tv-${rid}-snip-card`, tvShots);
          await takeShot(`phone-${rid}-5-snip-card`, phoneShots);
          await snipChecks(page, run, s, route, ui);
          const pend = run.pending;
          if (!fileMode && p.profile === 'phone' && !did.snipHome && pend && pend.type === 'bad') {
            // "Title screen" on the snip card, then Continue: back at the choice before the cut.
            did.snipHome = true;
            await tap(page, 'snip-home', run, p.input);
            if (!(await waitScreen(page, 'title', 3000))) { run.fail('snip card: "Title screen" did not open the title screen'); throw new Error('stop'); }
            if (!(await visible(page, 'continue'))) { run.fail('after the snip card\'s "Title screen" the title offers no "Continue" (the choice before the cut should be saved)'); throw new Error('stop'); }
            await tap(page, 'continue', run, p.input);
            if (!(await waitScreen(page, 'play', 3000))) { run.fail('"Continue" after the snip card did not open the play screen'); throw new Error('stop'); }
            run.pending = Object.assign({}, pend, { type: 'retry', via: 'title screen + Continue' });
            continue;
          }
          if (kbd) {
            // A clicker: previous moves the focus to "Title screen" and back; next presses the focused button.
            await page.keyboard.press('ArrowLeft');
            const f1 = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-testid'));
            await page.keyboard.press('PageUp');
            const f2 = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-testid'));
            if (f1 !== 'snip-home' || f2 !== 'snip-retry') run.fail(`snip card: Left/PageUp should move the focus between the buttons (got ${f1}, then ${f2})`, true);
            await page.keyboard.press('PageDown');
            acted = 'pressed';
          } else acted = await tap(page, 'snip-retry', run, p.input);
          if (pend && pend.type === 'bad') run.pending = Object.assign({}, pend, { type: 'retry', via: kbd ? 'PageDown' : 'Try again' });
          break;
        }
        case 'endingCard':
          await takeShot(`phone-${rid}-4-ending-card`, phoneShots);
          await takeShot(`tv-${rid}-ending-card`, tvShots);
          endingCardChecks(s, run, route);
          acted = kbd ? 'key' : await tap(page, 'advance', run, p.input);
          break;
        case 'ending':
          if (s.ids.includes('memory-verse')) {
            await takeShot(`tv-${rid}-memory-verse`, tvShots);
            await memoryChecks(page, run, s, route, data);
          }
          if (kbd && !did.escEnding && s.textbox) { did.escEnding = true; await escMenuCheck(page, run, args); continue; }
          if (!fileMode && p.profile === 'phone' && !did.resumeEnding && s.textbox) {
            did.resumeEnding = true;
            if (!(await resumeCheck(page, run, s, p.input))) throw new Error('stop');
            continue;
          }
          acted = kbd ? 'key' : await tap(page, 'advance', run, p.input);
          break;
        case 'tree': {
          await takeShot(`tv-${rid}-tree`, tvShots);
          await takeShot(`phone-${rid}-6-tree`, phoneShots);
          await treeChecks(page, run, route);
          if (kbd) await page.keyboard.press('Enter');
          else await tap(page, 'tree-next', run, p.input);
          if (!(await waitScreen(page, 'routeSelect', 3000))) run.fail(`story tree: ${kbd ? 'Enter on ' : ''}"Next character" did not open the route select`, true);
          else await playedChecks(page, run, rid);
          done = true;
          acted = 'done';
          break;
        }
        default:
          run.fail(`unexpected body data-screen="${s.screen}"`, true);
          acted = kbd ? 'key' : await tap(page, 'advance', run, p.input);
      }
      if (done) break;
      if (!acted) {
        run.fail(`no actionable control on screen "${s.screen}" (visible testids: ${s.ids.join(', ') || 'none'})`);
        break;
      }
      let changed;
      if (acted === 'key') {
        const keys = ADVANCE_KEYS.slice(advIdx).concat(ADVANCE_KEYS.slice(0, advIdx));
        advIdx = (advIdx + 1) % ADVANCE_KEYS.length;
        changed = await keyAdvance(page, run, prev, args, keys);
      } else changed = await waitChange(page, prev, args.stepTimeout);
      if (!changed && !kbd) {
        for (const fb of ['Enter', 'Space', 'dom-advance']) {
          if (fb === 'dom-advance') await loc(page, 'advance').dispatchEvent('click').catch(() => {});
          else await page.keyboard.press(fb).catch(() => {});
          changed = await waitChange(page, prev, 1500);
          if (changed) { run.note(`progress needed a fallback (${fb}) on screen "${s.screen}"`); break; }
        }
      }
      if (!changed) {
        stuck++;
        if (stuck >= 2) {
          run.fail(`stuck on screen "${s.screen}" at ${s.dbg ? s.dbg.list + '#' + s.dbg.beatIndex : '?'} after ${choiceCount} picks; text "${snip(s.textbox || s.endingTitle, 50)}"; visible: ${s.ids.join(', ')}`);
          break;
        }
      } else stuck = 0;
    }
    if (!done && !run.failures.length) run.fail('did not reach the story tree within the step limit');
    if (run.pending && run.pending.type !== 'done') run.fail(`a ${run.pending.type} check at ${run.pending.cid} was never completed`, true);
    if (done && !run.memory) run.fail('the memory-verse card (data-testid="memory-verse") never appeared before the true ending', true);
    if (done) {
      const bads = new Set(choicesOf(route).flatMap((b) => (b.options || []).filter((o) => optionOutcome(o) === 'bad').map((o) => o.bad)));
      const scolds = choicesOf(route).flatMap((b) => (b.options || []).filter((o) => optionOutcome(o) === 'scold')).length;
      if (run.mode === 'all' && (run.triedBad.size !== bads.size || run.scolds !== scolds)) run.fail(`plan "all" tried ${run.triedBad.size}/${bads.size} cut branches and ${run.scolds}/${scolds} scolds`, true);
      if (run.mode === 'true') transcriptCheck(run, data, rid, p);
    }
    if (prof.tv) finalizeTv(run, prof);
    if (kbd) {
      for (const k of REQUIRED_KEYS) if (!run.keys.ok[k]) run.fail(`keyboard: ${k} never advanced the story`, true);
      for (const k of ADVANCE_KEYS) if (run.keys.fail[k] && run.keys.ok[k]) run.warn(`keyboard: ${k} advanced on ${run.keys.ok[k]} screen(s) but not on ${run.keys.fail[k]}`, true);
      for (const k of ADVANCE_KEYS.filter((x) => !REQUIRED_KEYS.includes(x))) if (!run.keys.ok[k]) run.warn(`keyboard: ${k} never advanced (SPEC 5.6 lists it for presentation clickers)`, true);
    }
  } catch (e) {
    if (e && e.message !== 'stop') run.fail(`exception: ${snip(e.message, 200)}`);
  }
  for (const c of log.console) run.fail(`console error: ${c}`, true);
  for (const pe of log.pageErrors) run.fail(`page error: ${pe}`, true);
  for (const r of log.requestFailed) run.fail(`failed request: ${r}`, true);
  for (const d of log.dialogs) run.warn(`native dialog opened (${d}); SPEC 5.4 expects in-page UI`, true);
  if (run.failures.length) {
    run.result = 'FAIL';
    if (args.shots) {
      const f = await shot(page, path.join(args.shotDir, `FAIL-${run.where.replace(/[^\w-]+/g, '_')}.png`), R);
      if (f) run.shots.push(f);
    }
  }
  run.ms = Date.now() - t0;
  await context.close().catch(() => {});
  return run;
}

// A pending check met at the next choice: after Try again (or Continue after "Title screen" on the snip
// card) the same choice with the same options and the scissors mark on the tried option; after a scold
// the same choice without the scolded option (and the scold line shown in between).
function pendingAtChoice(run, s, cid) {
  const pend = run.pending;
  if (!pend) return;
  if (pend.type === 'retry') {
    if (cid !== pend.cid) run.fail(`${pend.via} after the cut at ${pend.cid}/${pend.opt}: the game shows ${cid}, expected ${pend.cid}`, true);
    else if (s.shown.join('') !== pend.shown.join('')) run.fail(`${pend.via} at ${pend.cid}: options ${s.shown.join(',')} differ from the options shown before the cut (${pend.shown.join(',')})`, true);
    else {
      run.retries++;
      if (!s.snipped.includes(pend.opt)) run.warn(`after Try again at ${cid}, option ${pend.opt} (its cut branch now seen) carries no scissors mark`, true);
      if (s.dbg && (s.dbg.ending || s.dbg.bad)) run.fail(`after Try again at ${cid} the game still reports the ending ${s.dbg.ending}`, true);
    }
    run.pending = null;
    return;
  }
  if (pend.type === 'scold') {
    const want = pend.shown.filter((x) => x !== pend.opt);
    if (cid !== pend.cid) run.fail(`after the scold at ${pend.cid}/${pend.opt} the game moved on to ${cid} instead of asking ${pend.cid} again`, true);
    else if (s.shown.join('') !== want.join('')) run.fail(`after the scold at ${pend.cid}/${pend.opt} the options are ${s.shown.join(',')}, expected ${want.join(',')}`, true);
    else {
      run.scolds++;
      if (run.texts.length <= pend.textsAt) run.fail(`the scold at ${pend.cid}/${pend.opt} showed no line before the choice came back`, true);
      if (!s.dbg || !s.dbg.removed || !(s.dbg.removed[cid] || []).includes(pend.opt)) run.fail(`debugState().removed.${cid} does not list ${pend.opt}`, true);
      if (s.dbg && s.dbg.choices && s.dbg.choices[cid]) run.fail(`a scolded pick is recorded as the answer of ${cid} (${s.dbg.choices[cid]})`, true);
    }
    run.pending = null;
    return;
  }
  if (pend.type === 'bad') run.fail(`the cut at ${pend.cid}/${pend.opt} came back to a choice (${cid}) without a snip card`, true);
  run.pending = null;
}

async function snipChecks(page, run, s, route, ui) {
  const pend = run.pending;
  if (!pend || pend.type !== 'bad') { run.fail(`a snip card appeared without a cutting pick (pending ${pend ? pend.type : 'none'})`, true); return; }
  const e = route.endings && route.endings.bad ? route.endings.bad[pend.bad] : null;
  const r = await page.evaluate(() => {
    const q = (id) => { const el = document.querySelector(`[data-testid="${id}"]`); return el && window.__qa.vis(el) ? (el.innerText || '').trim() : null; };
    const card = document.querySelector('[data-testid="snip-card"]');
    return {
      card: q('snip-card'), stamp: q('snip-stamp'), title: q('snip-title'), retry: q('snip-retry'), home: q('snip-home'),
      focus: document.activeElement && document.activeElement.getAttribute('data-testid'),
      branch: card ? card.getAttribute('data-branch') : null
    };
  });
  const where = `snip card after ${pend.cid}/${pend.opt}`;
  if (r.card == null) { run.fail(`${where}: data-testid="snip-card" not visible`, true); return; }
  for (const [k, v] of [['snip-stamp', r.stamp], ['snip-title', r.title], ['snip-retry', r.retry], ['snip-home', r.home]]) if (v == null) run.fail(`${where}: ${k} not visible`, true);
  if (e && r.title != null && textIn(e.title, run.lang).some((x) => !r.title.includes(x))) run.fail(`${where}: the title shows "${snip(r.title, 50)}", expected "${textIn(e.title, run.lang).join(' / ')}"`, true);
  if (r.stamp != null && textIn(ui.snipStamp, run.lang).some((x) => !r.stamp.includes(x))) run.fail(`${where}: the stamp shows "${snip(r.stamp, 30)}"`, true);
  if (textIn(ui.snipLine, run.lang).some((x) => !r.card.includes(x))) run.fail(`${where}: the line "${textIn(ui.snipLine, run.lang).join(' / ')}" is missing`, true);
  if (/\bending\b|엔딩|BAD/i.test(r.card)) run.fail(`${where}: the card mentions an ending ("${snip(r.card, 60)}")`, true);
  if (r.focus !== 'snip-retry') run.fail(`${where}: the default focus is on ${r.focus}, expected snip-retry (Try again)`, true);
  if (r.branch !== pend.bad) run.fail(`${where}: data-branch is ${r.branch}, expected ${pend.bad}`, true);
  const d = s.dbg || {};
  if (d.endingKind !== 'bad' || d.bad !== pend.bad || !d.canRetry) run.fail(`${where}: debugState reports ${d.endingKind}/${d.bad} (retry ${d.canRetry}), expected bad/${pend.bad}`, true);
  if (!(d.seen || []).includes(`${run.rid}-bad-${pend.bad}`)) run.fail(`${where}: ${run.rid}-bad-${pend.bad} is not stored as seen`, true);
}

function endingCardChecks(s, run, route) {
  const good = route.endings && route.endings.good;
  run.title = s.endingTitle;
  if (!good) return;
  const need = textIn(good.title, run.lang);
  if (need.some((x) => !s.endingTitle.includes(x))) run.fail(`the true ending's title card shows "${snip(s.endingTitle, 60)}", expected "${need.join(' / ')}"`, true);
  if (/[①②③]/.test(s.endingTitle)) run.fail('the title card shows a lens number', true);
  if (s.dbg && (s.dbg.endingKind !== 'good' || s.dbg.ending !== run.rid + '-good')) run.fail(`debugState reports the ending ${s.dbg.ending} (${s.dbg.endingKind}) on the title card`, true);
}

async function memoryChecks(page, run, s, route, data) {
  run.memory = true;
  const good = route.endings && route.endings.good;
  const v = good && data.scripture ? data.scripture[good.verse] : null;
  if (!v) return;
  const ref = await page.evaluate(() => { const el = document.getElementById('ref'); return el && !el.hidden ? el.innerText.trim() : ''; });
  const l = run.lang === 'en' ? 'en' : 'ko';
  const want = norm(verseDisplayText(v[l], l)).slice(0, 12);
  if (!norm(s.textbox).includes(want)) run.fail(`the memory-verse card shows "${snip(s.textbox, 50)}", expected ${good.verse} ("${want}…")`, true);
  if (!ref || !ref.includes(v.ref[l])) run.fail(`the memory-verse card shows the reference "${ref}", expected "${v.ref[l]}"`, true);
}

async function treeChecks(page, run, route) {
  run.tree = true;
  const rid = run.rid;
  const r = await page.evaluate((id) => {
    const tree = document.querySelector(`[data-testid="tree-${id}"]`);
    const goal = document.querySelector(`[data-testid="tree-goal-${id}"]`);
    const prefix = `tree-branch-${id}-`;
    const branches = Array.from(document.querySelectorAll(`[data-testid^="${prefix}"]`)).map((el) => {
      const tag = el.querySelector('.branch__tag');
      return { id: el.getAttribute('data-testid').slice(prefix.length), state: el.getAttribute('data-state'), tag: tag ? (tag.innerText || '').trim() : null, snip: !!el.querySelector('.branch__snip') };
    });
    const trees = Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid')).filter((x) => /^tree-(scribe|friend|asher)$/.test(x));
    return {
      has: !!tree, done: tree ? tree.getAttribute('data-done') : null, goal: goal ? goal.getAttribute('data-state') : null,
      goalText: goal ? (goal.innerText || '').trim() : '', levels: tree ? tree.querySelectorAll('.tree__level').length : 0,
      branches, trees, focus: document.activeElement && document.activeElement.getAttribute('data-testid'),
      next: !!document.querySelector('[data-testid="tree-next"]'), home: !!document.querySelector('[data-testid="tree-home"]')
    };
  }, rid);
  if (!r.has) { run.fail(`story tree: data-testid="tree-${rid}" missing after the true ending`, true); return; }
  if (r.trees.join(',') !== `tree-${rid}`) run.fail(`story tree: the page after the true ending shows ${r.trees.join(', ')}, expected only tree-${rid}`, true);
  if (r.done !== 'true' || r.goal !== 'seen') run.fail(`story tree: the trunk is not finished (data-done=${r.done}, star ${r.goal})`, true);
  const good = route.endings && route.endings.good;
  if (good && textIn(good.title, run.lang).some((x) => !r.goalText.includes(x))) run.fail(`story tree: the star is labeled "${snip(r.goalText, 40)}", expected the true ending's title`, true);
  const nChoices = choicesOf(route).length;
  if (r.levels !== nChoices) run.fail(`story tree: ${r.levels} choice points on the trunk, expected ${nChoices}`, true);
  const bads = [...new Set(choicesOf(route).flatMap((b) => (b.options || []).filter((o) => optionOutcome(o) === 'bad').map((o) => o.bad)))];
  for (const id of bads) {
    const b = r.branches.find((x) => x.id === id);
    const seen = run.triedBad.has(id);
    if (!b) { run.fail(`story tree: no branch for the cut branch ${id}`, true); continue; }
    if ((b.state === 'seen') !== seen) run.fail(`story tree: branch ${id} is "${b.state}", but it was ${seen ? '' : 'not '}seen in this run`, true);
    if (seen) {
      const e = route.endings.bad[id];
      if (!b.tag || textIn(e.title, run.lang).some((x) => !b.tag.includes(x))) run.fail(`story tree: branch ${id} is labeled "${b.tag}", expected "${textIn(e.title, run.lang).join(' / ')}"`, true);
      if (!b.snip) run.fail(`story tree: the seen branch ${id} has no scissors mark`, true);
    } else if (b.tag) run.fail(`story tree: the unseen branch ${id} shows a label ("${b.tag}")`, true);
  }
  if (r.branches.length !== bads.length) run.fail(`story tree: ${r.branches.length} branches drawn, expected ${bads.length}`, true);
  if (!r.next || !r.home) run.fail('story tree: "Next character" (tree-next) or "Title screen" (tree-home) missing', true);
  if (r.focus !== 'tree-next') run.fail(`story tree: the default focus is on ${r.focus}, expected tree-next`, true);
}

// After a true ending the route select stamps the route as played; the focus waits on the next one.
async function playedChecks(page, run, rid) {
  const r = await page.evaluate((id) => ({
    played: Array.from(document.querySelectorAll('.routecard[data-played="true"]')).map((c) => c.getAttribute('data-route')),
    stamp: !!document.querySelector(`[data-testid="routecard-played-${id}"]`),
    focus: document.activeElement && document.activeElement.getAttribute('data-testid')
  }), rid);
  if (r.played.join(',') !== rid || !r.stamp) run.fail(`route select after the true ending: played ${r.played.join(',') || 'none'} (stamp ${r.stamp}), expected ${rid}`, true);
  const order = ['scribe', 'friend', 'asher'];
  const next = order.find((x) => x !== rid);
  if (r.focus !== 'route-' + next) run.fail(`route select after the true ending: the focus is on ${r.focus}, expected route-${next}`, true);
  else run.note(`route select: ${rid} stamped as played, focus on route-${next}`);
}

// Every text screen shown must match the SPEC reference sequence (prologue + true path), in order.
function transcriptCheck(run, data, rid, p) {
  const exp = expectedTranscript(data, rid, p.lang);
  const got = run.texts.map((t) => norm(t).replace(/[“”"]/g, ''));
  let i = 0;
  let j = 0;
  while (i < exp.length && j < got.length) {
    if (!exp[i] || got[j].includes(exp[i])) { i++; j++; continue; }
    run.fail(`transcript: text screen #${j + 1} shows "${snip(run.texts[j], 40)}" but the reference expects "${exp[i]}…" (${exp.length} expected, ${got.length} shown)`, true);
    return;
  }
  if (i < exp.length) run.fail(`transcript: ${exp.length - i} expected text screen(s) were never shown (next expected "${exp[i]}…")`, true);
  else if (j < got.length) run.fail(`transcript: ${got.length - j} extra text screen(s) after the reference ended (first "${snip(run.texts[j], 40)}")`, true);
}

async function resumeCheck(page, run, s, input) {
  // Home -> confirm-no keeps the place; home -> confirm-yes -> continue resumes at the same place
  // (on the same screen: "play" mid-route, "ending" during the true ending).
  const screen = s.screen;
  const where = { text: s.textbox, at: s.dbg ? `${s.dbg.list}#${s.dbg.beatIndex}` : null, choices: s.dbg ? JSON.stringify(s.dbg.choices || {}) : null };
  if (!(await visible(page, 'home'))) { run.fail(`home button not visible on "${screen}"`, true); return true; }
  await tap(page, 'home', run, input);
  try { await loc(page, 'confirm-no').waitFor({ state: 'visible', timeout: 2000 }); } catch (e) { run.fail(`home did not open a confirm dialog with confirm-no on "${screen}"`, true); return true; }
  await tap(page, 'confirm-no', run, input);
  await sleep(150);
  let a = await snapOf(page, false);
  if (a.screen !== screen || a.textbox !== where.text) run.fail(`confirm-no did not return to the same place on "${screen}" (screen ${a.screen}, text "${snip(a.textbox, 40)}")`, true);
  await tap(page, 'home', run, input);
  try { await loc(page, 'confirm-yes').waitFor({ state: 'visible', timeout: 2000 }); } catch (e) { run.fail(`second home press did not open the confirm dialog on "${screen}"`, true); return false; }
  await tap(page, 'confirm-yes', run, input);
  if (!(await waitScreen(page, 'title', 3000))) { run.fail(`confirm-yes did not go to the title screen from "${screen}"`, true); return false; }
  if (!(await visible(page, 'continue'))) { run.fail(`title screen has no "continue" button after leaving from "${screen}" (SPEC 5.3 resume)`, true); return false; }
  await tap(page, 'continue', run, input);
  if (!(await waitScreen(page, screen, 3000))) { run.fail(`"continue" did not return to the "${screen}" screen`, true); return false; }
  await sleep(100);
  a = await snapOf(page, false);
  const at = a.dbg ? `${a.dbg.list}#${a.dbg.beatIndex}` : null;
  if (where.at && at !== where.at) run.fail(`resume on "${screen}": at ${at}, expected ${where.at}`, true);
  if (a.textbox !== where.text) run.warn(`resume on "${screen}": text after "continue" differs ("${snip(a.textbox, 40)}" vs "${snip(where.text, 40)}")`, true);
  if (where.choices && a.dbg && JSON.stringify(a.dbg.choices || {}) !== where.choices) run.fail(`resume on "${screen}": choices differ after "continue"`, true);
  return true;
}

// Presses advance keys in order until the page changes; records which keys worked.
async function keyAdvance(page, run, prev, args, keys) {
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    await page.keyboard.press(k);
    const ok = await waitChange(page, prev, i === 0 ? args.stepTimeout : 1200);
    const s = await snapOf(page, false);
    if (s.ids.includes('confirm-yes') || s.ids.includes('speed-instant')) {
      run.fail(`keyboard: ${k} opened a dialog/menu instead of advancing (focus was on "${s.focus || 'body'}")`, true);
      await page.keyboard.press('Escape');
      await sleep(100);
      if (await visible(page, 'confirm-no')) await keyActivate(page, 'confirm-no', run);
      if (await visible(page, 'settings-close')) await keyActivate(page, 'settings-close', run);
      return false;
    }
    if (ok) {
      run.keys.ok[k] = (run.keys.ok[k] || 0) + 1;
      return true;
    }
    run.keys.fail[k] = (run.keys.fail[k] || 0) + 1;
  }
  return false;
}
// Route cards (SPEC 5.8): each shows its protagonist between the tagline and the first line, aria-hidden,
// never over the text; Asher lies (never standing). Missing portraits are allowed (text-only cards): WARN.
async function routeCardChecks(page, run) {
  const r = await page.evaluate(() => Array.from(document.querySelectorAll('.routecard')).map((card) => {
    const art = card.querySelector('[data-testid^="routecard-portrait-"]');
    const box = (sel) => { const el = card.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
    const a = art ? art.getBoundingClientRect() : null;
    const tag = box('.routecard__tag');
    const first = box('.routecard__first');
    const svg = art && art.querySelector('svg');
    return {
      route: card.getAttribute('data-route'),
      art: !!art,
      hidden: art ? art.getAttribute('aria-hidden') : null,
      lying: art ? art.classList.contains('routecard__art--lying') : null,
      who: svg ? svg.getAttribute('data-portrait') : null,
      clearTop: a && tag ? a.top >= tag.bottom - 0.5 : true,
      clearBottom: a && first ? a.bottom <= first.top + 0.5 : true
    };
  }));
  for (const c of r) {
    if (!c.art) { run.warn(`route select: no portrait on the ${c.route} card (allowed only without js/portraits.js)`, true); continue; }
    if (c.hidden !== 'true') run.fail(`route select: the ${c.route} portrait is not aria-hidden`, true);
    if (!c.clearTop || !c.clearBottom) run.fail(`route select: the ${c.route} portrait band overlaps the card text`, true);
    if (c.route === 'asher' && !c.lying) run.fail('route select: Asher must lie on his card (his standing pose is the ending)', true);
  }
}
// Header language buttons: the contract names lang-ko/en/both; the header may use hdr-lang-*.
async function langButton(page, mode) {
  for (const id of [`lang-${mode}`, `hdr-lang-${mode}`]) if (await visible(page, id)) return id;
  return null;
}

async function langSwitchCheck(page, run, s, input) {
  const idEn = await langButton(page, 'en');
  const idKo = await langButton(page, 'ko');
  const idBoth = await langButton(page, 'both');
  if (!idEn || !idKo || !idBoth) { run.fail('language cannot be switched during play: no visible lang-ko/en/both (or hdr-lang-*) buttons (SPEC 5.2)', true); return; }
  const texts = async () => (await snapOf(page, false)).choiceTexts;
  await tap(page, idEn, run, input);
  await sleep(120);
  const en = await texts();
  if (Object.values(en).some((t) => HANGUL.test(t))) run.warn(`English mode still shows Hangul in options: "${snip(Object.values(en).find((t) => HANGUL.test(t)), 50)}"`, true);
  await tap(page, idKo, run, input);
  await sleep(120);
  const ko = await texts();
  if (Object.values(ko).some((t) => !HANGUL.test(t))) run.warn('Korean mode shows an option without Hangul', true);
  if (Object.values(ko).some((t) => /[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(t))) run.warn('Korean mode still shows English text in options', true);
  await tap(page, idBoth, run, input);
  await sleep(120);
  const both = await texts();
  if (Object.values(both).some((t) => !HANGUL.test(t) || !/[A-Za-z]{3,}/.test(t))) run.warn('"both" mode options do not show both languages', true);
  const after = await snapOf(page, false);
  if (after.screen !== s.screen || after.shown.join('') !== s.shown.join('')) run.fail(`switching language changed the choice screen (options ${after.shown.join(',')} vs ${s.shown.join(',')})`, true);
}

async function settingsCheck(page, run, input) {
  if (!(await visible(page, 'settings-open'))) { run.fail('settings-open not visible during play', true); return; }
  await tap(page, 'settings-open', run, input);
  try { await loc(page, 'speed-instant').waitFor({ state: 'visible', timeout: 2000 }); } catch (e) { run.fail('settings panel did not show speed-instant', true); return; }
  await tap(page, 'speed-instant', run, input);
  const stored = await page.evaluate(() => { try { return localStorage.getItem('bhs.v1.settings') || ''; } catch (e) { return 'ERR'; } });
  if (!/instant/.test(stored)) run.warn('text speed "instant" was not saved to localStorage bhs.v1.settings (SPEC 5.3)', true);
  if (await visible(page, 'settings-close')) await tap(page, 'settings-close', run, input);
  else await page.keyboard.press('Escape').catch(() => {});
  await sleep(150);
  if (await visible(page, 'speed-instant')) {
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(150);
    if (await visible(page, 'speed-instant')) run.fail('settings panel could not be closed (settings-close / Escape)', true);
  }
}
async function cursorCheck(page, run) {
  // SPEC 5.6: the mouse cursor hides after a few seconds of inactivity.
  const x = 960;
  const y = 260;
  await page.mouse.move(x - 40, y);
  await page.mouse.move(x, y);
  await sleep(4500);
  const cur = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return el ? getComputedStyle(el).cursor : null;
  }, [x, y]);
  if (cur !== 'none') run.warn(`TV: mouse cursor still "${cur}" after 4.5 s without movement (SPEC 5.6: hide after a few seconds)`, true);
  else run.note('mouse cursor hides after 4.5 s idle');
}

async function escMenuCheck(page, run, args) {
  // SPEC 5.6: Esc opens the menu; a second Esc (or the dialog's own button) closes it.
  const before = await snapOf(page, true);
  await page.keyboard.press('Escape');
  await sleep(250);
  const a = await snapOf(page, true);
  // Agreed contract: Esc opens the home confirm dialog (confirm-yes / confirm-no).
  if (!a.ids.includes('confirm-yes')) {
    const other = a.ids.filter((x) => !before.ids.includes(x));
    run.warn(`keyboard: Esc did not open the home confirm dialog${other.length ? ` (opened: ${other.join(', ')})` : ''} (SPEC 5.6)`, true);
    if (!other.length) return;
  }
  await page.keyboard.press('Escape');
  await sleep(250);
  let c = await snapOf(page, false);
  if (c.ids.includes('confirm-yes') || c.ids.includes('speed-instant')) {
    run.warn('keyboard: a second Esc did not close the menu', true);
    if (c.ids.includes('confirm-no')) await keyActivate(page, 'confirm-no', run);
    else if (c.ids.includes('settings-close')) await keyActivate(page, 'settings-close', run);
    await sleep(150);
    c = await snapOf(page, false);
  }
  if (c.screen !== before.screen || c.textbox !== before.textbox) run.fail(`keyboard: opening and closing the Esc menu moved the story (screen ${before.screen} -> ${c.screen})`, true);
}

async function fullscreenKeyCheck(page, run) {
  const before = await page.evaluate(() => !!document.fullscreenElement);
  await page.keyboard.press('f');
  await sleep(300);
  const on = await page.evaluate(() => !!document.fullscreenElement);
  if (on === before) { run.warn('keyboard: F did not toggle fullscreen (SPEC 5.6; headless Chromium may block it)', true); return; }
  await page.keyboard.press('f');
  await sleep(300);
  const off = await page.evaluate(() => !!document.fullscreenElement);
  if (off !== before) run.warn('keyboard: a second F did not leave fullscreen', true);
  else run.note('F toggles fullscreen on and off');
}

// ---------------------------------------------------------------------------------------------
// Title, story trees, deep links, debug panel, stale saves, class flow

// A save exactly as release 1.0 wrote it (10-choice routes, c1-c10 picks, old beat indexes, no fingerprint).
const V1_SAVE = {
  v: 1, at: 1760000000000, screen: 'play', routeId: 'scribe',
  state: {
    v: 1, routeId: 'scribe', segs: ['beats', '@ending'], seg: 0, stack: [{ list: 'beats', i: 57 }],
    choices: { c1: 'a', c2: 'b', c3: 'c', c4: 'd', c5: 'a', c6: 'b', c7: 'c', c8: 'd', c9: 'a' }, flags: { mark: 'he' }, vars: {},
    picks: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'], c10Lens: null,
    stage: { bg: 'lamp_night', caption: null, time: 'day', pov: 'normal', light: 'off', pinned: null, actionsVisible: false, actionReplies: {}, actionCounts: {}, sceneSeq: 9, cast: [], speaking: null, castSeq: 4, risen: true },
    pending: { hush: false, echo: null }, now: { hush: false, echo: null },
    step: { kind: 'choice', id: 'c10', prompt: { ko: '기록장의 마지막 줄에 무엇을 적을까?', en: 'What do you write?' }, options: [] },
    at: { list: 'beats', index: 56 }, ending: null, steps: 140, done: false
  }
};

// A save of the lens releases (save format 2, state version 2, with a fingerprint of the old route shape).
const V2_SAVE = {
  v: 2, at: 1770000000000, screen: 'play', routeId: 'friend', fp: 'r1a2b3c4d',
  state: {
    v: 2, fp: 'r1a2b3c4d', routeId: 'friend', segs: ['beats', '@ending'], seg: 0, stack: [{ list: 'beats', i: 14 }],
    choices: { c1: 'b', c2: 'a' }, flags: {}, vars: {}, picks: ['c1', 'c2'], lastLens: 2,
    stage: { bg: 'shore_dawn', caption: null, time: 'day', pov: 'normal', light: 'off', pinned: null, actionsVisible: false, actionReplies: {}, actionCounts: {}, sceneSeq: 2, cast: [], speaking: null, castSeq: 1, risen: false },
    pending: { hush: false, echo: null }, now: { hush: false, echo: null },
    step: { kind: 'line', speaker: 'narrator', text: { ko: '…', en: '…' } },
    at: { list: 'beats', index: 13 }, ending: null, steps: 30, done: false
  }
};

const okLine = (cond, ok, bad) => (cond ? `ok   ${ok}` : `FAIL ${bad}`);

function badIdsOf(route) {
  return treeLevels(route).flatMap((lv) => lv.branches);
}

async function seedStorage(page, url, items) {
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.evaluate((it) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(it)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, items);
  await page.reload({ waitUntil: 'load' });
  return waitScreen(page, 'title', 8000);
}

// The story trees page from the title: one tree per route; the trunk and star lit only after the true
// ending; seen cut branches labeled with their title and the scissors, the others faint unlabeled stubs.
async function treesPageCheck(page, out, data, routes, seen, label, shotFile, R) {
  await page.locator('[data-testid="trees-open"]').first().click({ timeout: 3000 });
  if (!(await waitScreen(page, 'trees', 3000))) { out.push(`FAIL "${label}": trees-open did not open the story trees`); return; }
  await sleep(120);
  const r = await page.evaluate(() => {
    const trees = Array.from(document.querySelectorAll('section[data-testid^="tree-"]')).map((t) => {
      const rid = t.getAttribute('data-route');
      const goal = t.querySelector(`[data-testid="tree-goal-${rid}"]`);
      const prefix = `tree-branch-${rid}-`;
      return {
        rid, done: t.getAttribute('data-done'),
        goal: goal ? goal.getAttribute('data-state') : null,
        goalText: goal && goal.querySelector('.tree__goaltitle') ? (goal.querySelector('.tree__goaltitle').innerText || '').trim() : '',
        branches: Array.from(t.querySelectorAll(`[data-testid^="${prefix}"]`)).map((b) => {
          const tag = b.querySelector('.branch__tag');
          const wood = b.querySelector('.branch__wood') || b;
          return { id: b.getAttribute('data-testid').slice(prefix.length), state: b.getAttribute('data-state'), tag: tag ? (tag.innerText || '').trim() : '', snip: !!b.querySelector('.branch__snip'), opacity: parseFloat(getComputedStyle(b).opacity) * parseFloat(getComputedStyle(wood).opacity) };
        }),
        trunkOpacity: parseFloat(getComputedStyle(t.querySelector('.tree__levels') || t).opacity)
      };
    });
    const s = window.__qa.snap({ tv: true });
    return { trees, focus: s.focus, digits: s.digits, overflow: s.overflow, scrollH: s.tv.scrollH, H: s.tv.H, offenders: s.tv.offenders.length };
  });
  const problems = [];
  if (r.trees.map((t) => t.rid).join(',') !== routes.join(',')) problems.push(`trees shown: ${r.trees.map((t) => t.rid).join(', ')}`);
  for (const rid of routes) {
    const t = r.trees.find((x) => x.rid === rid);
    if (!t) continue;
    const route = data.routes[rid];
    const done = seen.includes(`${rid}-good`);
    if ((t.done === 'true') !== done || (t.goal === 'seen') !== done) problems.push(`${rid}: trunk ${t.done}/star ${t.goal}, expected ${done ? 'lit' : 'faint'}`);
    if (done && route.endings.good.title && !t.goalText.includes(route.endings.good.title.ko)) problems.push(`${rid}: the star is labeled "${snip(t.goalText, 30)}"`);
    if (!done && t.goalText) problems.push(`${rid}: an unfinished tree shows a star label "${snip(t.goalText, 30)}"`);
    const ids = badIdsOf(route);
    if (t.branches.map((b) => b.id).join(',') !== ids.join(',')) problems.push(`${rid}: branches ${t.branches.map((b) => b.id).join(',')} (expected ${ids.join(',')})`);
    for (const b of t.branches) {
      const want = seen.includes(`${rid}-bad-${b.id}`);
      if ((b.state === 'seen') !== want) problems.push(`${rid}/${b.id}: ${b.state}, expected ${want ? 'seen' : 'unseen'}`);
      if (want && (!b.tag.includes(route.endings.bad[b.id].title.ko) || !b.snip)) problems.push(`${rid}/${b.id}: seen branch shows "${snip(b.tag, 30)}" (scissors ${b.snip})`);
      if (!want && b.tag) problems.push(`${rid}/${b.id}: unseen branch labeled "${snip(b.tag, 30)}"`);
      if (!want && b.opacity > 0.6) problems.push(`${rid}/${b.id}: unseen stub is not faint (opacity ${b.opacity})`);
    }
  }
  if (r.focus !== 'trees-home') problems.push(`focus on ${r.focus}, expected trees-home`);
  if (r.digits.length) problems.push(`digits: ${r.digits[0]}`);
  if (r.overflow > 1) problems.push(`horizontal overflow ${r.overflow} px`);
  if (r.scrollH > r.H + 1) problems.push(`the page scrolls at 1920x1080 (${r.scrollH} px)`);
  if (r.offenders) problems.push(`${r.offenders} element(s) outside the viewport`);
  out.push(problems.length ? `FAIL story trees from the title (${label}): ${problems.slice(0, 4).join('; ')}` : `ok   story trees from the title (${label}): ${routes.length} trees, ${seen.length ? seen.join(', ') + ' marked' : 'all faint, no labels'}`);
  if (shotFile && R) await shot(page, shotFile, R);
  await page.locator('[data-testid="trees-home"]').first().click({ timeout: 3000 });
  if (!(await waitScreen(page, 'title', 3000))) out.push('FAIL "Title screen" on the story trees did not return to the title');
}

// ?debug=1: the jump list offers every choice id plus one entry per cut branch; a cut-branch entry
// opens its snip card, and Try again lands on the choice that leads to it.
async function debugJumpChecks(page, base, out, data, routes) {
  for (const rid of routes) {
    const route = data.routes[rid];
    // A deep link is used once (its hash leaves the address bar, so a reload shows the title): clear the
    // storage, then load the link fresh.
    await page.goto(base + 'index.html?test=1&debug=1', { waitUntil: 'load', timeout: 20000 });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
    await page.goto('about:blank');
    await page.goto(base + 'index.html?test=1&debug=1#' + rid, { waitUntil: 'load', timeout: 20000 });
    if (!(await waitScreen(page, 'play', 4000))) { out.push(`FAIL ?debug=1#${rid} did not open the play screen`); continue; }
    await sleep(150);
    const visibleDbg = await page.evaluate(() => { const d = document.getElementById('debug'); return !!(d && window.__qa.vis(d)); });
    if (!visibleDbg) { out.push(`FAIL ?debug=1#${rid} shows no debug panel`); continue; }
    const vals = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="debug-select"] option')).map((o) => o.value));
    const want = choicesOf(route).map((b) => b.id).concat(badIdsOf(route).map((id) => 'bad:' + id));
    if (vals.join(',') !== want.join(',')) { out.push(`FAIL ${rid} debug jump list offers "${vals.join(',')}", expected ${want.join(',')}`); continue; }
    const problems = [];
    for (const id of badIdsOf(route)) {
      const at = choicesOf(route).find((b) => (b.options || []).some((o) => o.bad === id));
      await page.selectOption('[data-testid="debug-select"]', 'bad:' + id);
      await page.locator('[data-testid="debug-jump"]').click();
      // The jump lands at the start of the cut branch (the pick is made); its beats lead to the snip card.
      await sleep(80);
      const j = await page.evaluate(() => window.BHS_DEBUG.state());
      if (j.choices[at.id] !== (at.options || []).find((o) => o.bad === id).id) problems.push(`bad:${id}: the jump did not pick ${at.id}/${(at.options || []).find((o) => o.bad === id).id} (choices ${JSON.stringify(j.choices)})`);
      for (let k = 0; k < 40 && (await page.evaluate(() => document.body.dataset.screen)) === 'play'; k++) {
        await page.locator('[data-testid="advance"]').click({ timeout: 2000 }).catch(() => {});
      }
      if (!(await waitScreen(page, 'snip', 3000))) { problems.push(`bad:${id} did not lead to a snip card`); continue; }
      const branch = await page.evaluate(() => { const c = document.querySelector('[data-testid="snip-card"]'); return c ? c.getAttribute('data-branch') : null; });
      if (branch !== id) problems.push(`bad:${id} opened the snip card of ${branch}`);
      await page.locator('[data-testid="snip-retry"]').click();
      if (!(await waitScreen(page, 'play', 3000))) { problems.push(`Try again after bad:${id} did not return to play`); continue; }
      const d = await page.evaluate(() => window.BHS_DEBUG.state());
      if (d.step !== 'choice' || d.stepId !== at.id) problems.push(`Try again after bad:${id} shows ${d.step} ${d.stepId}, expected choice ${at.id}`);
    }
    out.push(problems.length ? `FAIL ${rid} debug jumps: ${problems.slice(0, 3).join('; ')}` : `ok   ${rid}: ?debug=1 jump list = ${want.length} entries (${choicesOf(route).length} choices + ${badIdsOf(route).length} cut branches); each cut-branch entry starts that branch, which ends on its snip card, and Try again returns to its choice`);
  }
}

// Saves that no longer fit the data must be dropped silently: no "Continue", the key removed, no errors.
async function staleSaveChecks(page, base, out, data, routes) {
  const url = base + 'index.html?test=1';
  const cases = [
    ['a release 1.0 save (10 choices)', V1_SAVE],
    ['a lens-release save (format 2)', V2_SAVE],
    ['a lens-release route-select save (format 2)', { v: 2, at: 1, screen: 'routeSelect', routeId: null, state: null }]
  ];
  for (const [label, save] of cases) {
    if (!(await seedStorage(page, url, { 'bhs.v1.save': save }))) { out.push(`FAIL title did not appear with ${label} stored`); continue; }
    const cont = await visible(page, 'continue');
    const left = await page.evaluate(() => localStorage.getItem('bhs.v1.save'));
    out.push(okLine(!cont && left === null, `${label} is dropped: no Continue, key removed`, `${label}: Continue ${cont ? 'offered' : 'hidden'}, key ${left === null ? 'removed' : 'kept'}`));
  }
  // Seen ids of earlier releases are ignored (the trees show nothing seen).
  if (await seedStorage(page, url, { 'bhs.v1.gallery': ['scribe-1', 'friend-9', 'scribe-cut', 'asher-c7', 42] })) {
    await treesPageCheck(page, out, data, routes, [], 'only ids of earlier releases stored');
  }
  // A save of this version whose route fingerprint no longer matches (the route was edited).
  await seedStorage(page, url, {});
  await page.goto(url + '#scribe', { waitUntil: 'load', timeout: 20000 });
  if (!(await waitScreen(page, 'play', 5000))) { out.push('FAIL #scribe did not open the play screen'); return; }
  await loc(page, 'advance').click().catch(() => {});
  await sleep(150);
  const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('bhs.v1.save')); } catch (e) { return null; } });
  if (!saved || saved.v !== 3 || !saved.state || !saved.state.fp) { out.push(`FAIL a running game stores no format-3 save with a route fingerprint (${saved ? 'v ' + saved.v + ', fp ' + (saved.state && saved.state.fp) : 'no save'})`); return; }
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await waitScreen(page, 'title', 8000);
  const ok = await visible(page, 'continue');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('bhs.v1.save'));
    s.state.fp = 'r0stale';
    s.fp = 'r0stale';
    localStorage.setItem('bhs.v1.save', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'load' });
  await waitScreen(page, 'title', 8000);
  const cont2 = await visible(page, 'continue');
  const left2 = await page.evaluate(() => localStorage.getItem('bhs.v1.save'));
  out.push(okLine(ok && !cont2 && left2 === null, 'a save carries the route fingerprint (format 3); a stale fingerprint is dropped without a Continue', `fingerprint check: fresh save Continue ${ok}, stale save Continue ${cont2}, key ${left2 === null ? 'removed' : 'kept'}`));
  await page.evaluate(() => { localStorage.clear(); });
}

// Class flow (SPEC 5.8): a route whose true ending was seen is stamped; the focus waits on the next one.
async function classFlowChecks(page, base, out) {
  const url = base + 'index.html?test=1';
  await seedStorage(page, url, { 'bhs.v1.gallery': ['scribe-good', 'friend-bad-bigCatch'], 'bhs.v1.save': { v: 3, at: 1, screen: 'routeSelect', routeId: null, state: null } });
  await loc(page, 'continue').click().catch(() => {});
  if (!(await waitScreen(page, 'routeSelect', 3000))) { out.push('FAIL continue did not reopen the route select'); return; }
  const r = await page.evaluate(() => ({
    hint: !!document.querySelector('[data-testid="routes-hint"]'),
    played: Array.from(document.querySelectorAll('.routecard[data-played="true"]')).map((c) => c.getAttribute('data-route')).join(','),
    stamp: !!document.querySelector('[data-testid="routecard-played-scribe"]'),
    friendStamp: !!document.querySelector('[data-testid="routecard-played-friend"]'),
    focus: document.activeElement && document.activeElement.getAttribute('data-testid'),
    digits: window.__qa.snap({}).digits
  }));
  out.push(okLine(r.hint && r.played === 'scribe' && r.stamp && !r.friendStamp && r.focus === 'route-friend' && !r.digits.length,
    'route select: suggested order shown; only a route with its true ending seen is stamped (a cut branch does not count); focus waits on the next route; no numbers',
    `route select class flow: hint ${r.hint}, played "${r.played}", stamp ${r.stamp}, friend stamp ${r.friendStamp}, focus ${r.focus}, digits ${r.digits.join(' | ')}`));
  await page.evaluate(() => { localStorage.clear(); });
}

async function titleSmoke(browser, R, base, args, data) {
  const out = [];
  const routes = ROUTE_IDS.filter((r) => isObj(data.routes[r]));
  const { context, page, log } = await newPage(browser, R, { profile: 'tv1080', stepTimeout: args.stepTimeout });
  try {
    const url = base + 'index.html?test=1';
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    if (!(await waitScreen(page, 'title', 8000))) { out.push('FAIL title screen did not appear'); return out; }
    await treesPageCheck(page, out, data, routes, [], 'a fresh device');
    const scribe = data.routes.scribe;
    const friend = data.routes.friend;
    const seen = [];
    if (scribe) seen.push('scribe-good', ...badIdsOf(scribe).slice(0, 2).map((id) => `scribe-bad-${id}`));
    if (friend) seen.push(`friend-bad-${badIdsOf(friend)[0]}`);
    if (await seedStorage(page, url, { 'bhs.v1.gallery': seen })) {
      const nCut = seen.filter((id) => /-bad-/.test(id)).length;
      await treesPageCheck(page, out, data, routes, seen, `one true ending and ${nCut} cut branch${nCut === 1 ? '' : 'es'} seen`, args.shots ? path.join(args.shotDir, 'tv-trees-all.png') : null, R);
    }
    // Every true ending and every cut branch seen: the trees still fit one TV screen (SPEC 5.6).
    const everything = routes.flatMap((rid) => [`${rid}-good`, ...badIdsOf(data.routes[rid]).map((id) => `${rid}-bad-${id}`)]);
    if (await seedStorage(page, url, { 'bhs.v1.gallery': everything })) {
      await treesPageCheck(page, out, data, routes, everything, `every true ending and all ${everything.length - routes.length} cut branches seen`, null, R);
    }
    for (const rid of routes) {
      await page.goto(base + `index.html?test=1#${rid}`, { waitUntil: 'load', timeout: 20000 });
      const ok = await waitScreen(page, ['play'], 4000);
      const s = ok ? await snapOf(page, false) : null;
      if (!ok) out.push(`FAIL #${rid} deep link did not open the play screen`);
      else if (s.dbg && s.dbg.routeId && s.dbg.routeId !== rid) out.push(`FAIL #${rid} deep link opened route ${s.dbg.routeId}`);
      else out.push(`ok   #${rid} deep link opens the route`);
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
    }
    await debugJumpChecks(page, base, out, data, routes);
    await staleSaveChecks(page, base, out, data, routes);
    await classFlowChecks(page, base, out);
  } catch (e) {
    out.push(`FAIL title smoke test threw: ${snip(e.message, 160)}`);
  } finally {
    for (const c of log.console) out.push(`FAIL console error (title/trees/deep-link/debug checks): ${c}`);
    for (const pe of log.pageErrors) out.push(`FAIL page error (title/trees/deep-link/debug checks): ${pe}`);
    for (const r of log.requestFailed) out.push(`FAIL failed request: ${r}`);
    await context.close().catch(() => {});
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Report

function fmtPx(x) { return Number.isFinite(x) ? x.toFixed(1) : '-'; }

function formatReport(R, ctx) {
  const L = [];
  const failedRuns = R.runs.filter((r) => r.result === 'FAIL');
  const globalFails = R.global.failures.length;
  const pass = !failedRuns.length && !globalFails && R.runs.length > 0;
  L.push('Before He Stood - browser playtest (tools/playtest.mjs, SPEC version 4: story mode)');
  L.push(`Date: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}Z   Node ${process.version}   Playwright ${ctx.pwVersion || '?'} (${ctx.pwFrom || '?'})`);
  L.push(`Browser: Chromium ${ctx.browserVersion || '?'} (${ctx.launchHow || '?'}); external requests blocked (offline check)`);
  L.push('Profiles: phone 390x844 isMobile+touch DPR2 | tv1080 1920x1080 DPR1 mouse/keyboard | tv720 1280x720 DPR1 mouse');
  L.push('Plans: true = the true path; one = the first cut branch and the first scold met, then the true path; all = every cut branch and every scold, then the true path');
  L.push(`Server: ${ctx.base || '-'} (tools/serve.mjs)   Root: ${ctx.root}`);
  L.push(`Duration: ${elapsedMin().toFixed(1)} min`);
  L.push('');
  L.push(`Summary: ${R.runs.length} runs, ${R.runs.length - failedRuns.length} passed, ${failedRuns.length} failed; ${globalFails} other failure(s); ${R.screensChecked} screen snapshots checked  ->  ${pass ? 'PASS' : 'FAIL'}`);
  if (ctx.skipped.length) L.push(`Skipped: ${ctx.skipped.join('; ')}`);
  L.push('');
  L.push('Runs');
  L.push('  ' + [pad('route/plan@profile', 30), pad('true path', 10), pad('cut+retry', 10), pad('scolds', 7), pad('ending card', 24), pad('tree', 5), pad('steps', 6), pad('time', 7), 'result'].join(' '));
  for (const r of R.runs) {
    const route = ctx.data && ctx.data.routes ? ctx.data.routes[r.rid] : null;
    const picks = route ? choicesOf(route).map((b) => r.made[b.id] || '-').join('') : '-';
    L.push('  ' + [pad(r.where, 30), pad(picks, 10), pad(`${r.snips}/${r.retries}`, 10), pad(r.scolds, 7), pad(snip(r.title, 22), 24), pad(r.tree ? 'ok' : '-', 5), pad(r.steps, 6), pad((r.ms / 1000).toFixed(1) + 's', 7), r.result].join(' '));
  }
  L.push('  (cut+retry = snip cards shown / Try again checks passed back at the same choice with the same options)');
  const tvRuns = R.runs.filter((r) => PROFILES[r.profile] && PROFILES[r.profile].tv);
  if (tvRuns.length) {
    L.push('');
    L.push('TV metrics (SPEC 5.6; thresholds 1080p story >= 36 px, options >= 30 px; 720p 24 / 20 px; panel top >= 60%)');
    L.push('  ' + [pad('run', 30), pad('story min', 10), pad('en line min', 12), pad('option min', 11), pad('panel top min', 14), pad('centered top', 13), pad('outside viewport', 17), 'keys that advanced'].join(' '));
    for (const r of tvRuns) {
      const keys = r.input === 'keyboard' ? Object.keys(r.keys.ok).map((k) => `${k}x${r.keys.ok[k]}`).join(' ') : '-';
      const pctOf = (x) => (Number.isFinite(x) ? x.toFixed(0) + '%' : '-');
      L.push('  ' + [pad(r.where, 30), pad(fmtPx(r.tvm.storyMin), 10), pad(fmtPx(r.tvm.storyEnMin), 12), pad(fmtPx(r.tvm.optionMin), 11), pad(pctOf(r.tvm.panelTopMin), 14), pad(pctOf(r.tvm.specialTopMin), 13), pad(r.tvm.offenders, 17), keys].join(' '));
    }
    L.push('  (sign captions, the memory verse and the last lines are centered by design and exempt from the 60% rule; their top is listed for review)');
  }
  for (const r of R.runs) {
    if (!r.failures.length && !r.warnings.length && !r.notes.length) continue;
    L.push('');
    L.push(`${r.where}  (${r.result}; last screen "${r.last.screen}", beat ${r.last.beat === '' ? '?' : r.last.beat}, text "${snip(r.last.text, 50)}")`);
    r.failures.forEach((m) => L.push(`  FAIL ${m}`));
    r.warnings.forEach((m) => L.push(`  WARN ${m}`));
    r.notes.forEach((m) => L.push(`  note ${m}`));
  }
  L.push('');
  L.push('Layout (all runs)');
  L.push(`  horizontal overflow: ${R.overflow.size ? R.overflow.size + ' problem(s)' : 'none'}`);
  for (const v of R.overflow.values()) L.push(`    ${v}`);
  L.push(`  tap targets under 44x44 px: ${R.small.size ? R.small.size + ' distinct' : 'none'}`);
  for (const v of R.small.values()) L.push(`    ${v}`);
  if (ctx.titleSmoke && ctx.titleSmoke.length) {
    L.push('');
    L.push('Title, story trees, deep links, debug panel, saves, class flow');
    ctx.titleSmoke.forEach((m) => L.push('  ' + m));
  }
  L.push('');
  L.push('Single-file build (dist/before-he-stood.html via file://)');
  L.push('  ' + (ctx.distLine || 'not run'));
  if (R.global.failures.length || R.global.warnings.length || R.global.info.length) {
    L.push('');
    L.push('Other');
    R.global.failures.forEach((m) => L.push(`  FAIL ${m}`));
    R.global.warnings.forEach((m) => L.push(`  WARN ${m}`));
    R.global.info.forEach((m) => L.push(`  info ${m}`));
  }
  if (R.external.size) {
    L.push('');
    L.push(`External hosts requested and blocked: ${[...R.external].join(', ')} (the game must work without them)`);
  }
  const shots = R.runs.flatMap((r) => r.shots);
  if (shots.length) {
    L.push('');
    L.push(`Screenshots (qa/playtest/): ${shots.join(', ')}`);
  }
  return { text: L.join('\n') + '\n', pass };
}

function writeReport(root, text) {
  try {
    fs.mkdirSync(path.join(root, 'qa', 'reports'), { recursive: true });
    fs.writeFileSync(path.join(root, 'qa', 'reports', 'playtest.txt'), text);
  } catch (e) { console.error('could not write qa/reports/playtest.txt: ' + e.message); }
}

// ---------------------------------------------------------------------------------------------
// Main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.bad) {
    if (args.bad) console.error(`Unknown argument: ${args.bad}`);
    console.log('Usage: node tools/playtest.mjs [--route scribe,friend,asher] [--profiles phone,tv1080,tv720] [--no-keyboard] [--quick] [--root DIR] [--headed] [--no-dist] [--no-shots] [--step-timeout MS] [--run-timeout S] [--budget-min N]');
    process.exit(args.bad ? 2 : 0);
  }
  const root = args.root;
  args.shotDir = path.join(root, 'qa', 'playtest');
  const ctx = { root, skipped: [], base: null };
  const R = new Results();
  const finish = (code, extra) => {
    const { text, pass } = formatReport(R, ctx);
    const out = extra ? extra + '\n' + text : text;
    writeReport(root, out);
    process.stdout.write(out);
    process.exit(code == null ? (pass ? 0 : 1) : code);
  };
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    ctx.skipped.push('index.html not found');
    finish(2, 'SKIPPED: index.html does not exist yet; nothing to play.');
    return;
  }
  const missingUi = ['js/ui.js', 'js/main.js', 'css/style.css'].filter((f) => !fs.existsSync(path.join(root, f)));
  if (missingUi.length) R.warn(`UI files missing: ${missingUi.join(', ')} (the game may not start)`);
  const loadRep = new Report();
  const loaded = loadProject(root, loadRep, { partial: true });
  const data = loaded.data;
  ctx.data = data;
  for (const f of loadRep.findings.filter((x) => x.level === 'ERROR')) R.warn(`data load: ${f.where}: ${f.msg}`);
  const wanted = (args.routes || ROUTE_IDS).filter((r) => ROUTE_IDS.includes(r));
  const routes = wanted.filter((r) => isObj(data.routes[r]));
  for (const r of wanted.filter((x) => !routes.includes(x))) ctx.skipped.push(`route ${r} (data/routes/${r}.js missing or broken)`);
  const pwInfo = loadPlaywright(root);
  if (!pwInfo) {
    ctx.skipped.push('Playwright npm package not found');
    finish(2, 'SKIPPED: Playwright not found. Install it outside the project:\n  npm i --prefix /tmp/pwqa playwright@1.56.1\nor set PLAYWRIGHT_MODULE=/path/to/node_modules/playwright');
    return;
  }
  ctx.pwVersion = pwInfo.version;
  ctx.pwFrom = pwInfo.from;
  fs.mkdirSync(args.shotDir, { recursive: true });
  // Failure screenshots from earlier runs would be misleading; other screenshots are overwritten by name.
  for (const f of fs.readdirSync(args.shotDir)) if (/^FAIL-.*\.png$/.test(f)) fs.rmSync(path.join(args.shotDir, f), { force: true });
  let srv;
  let browser;
  try {
    srv = await startServer({ root, port: 0 });
    ctx.base = srv.url;
    const launched = await launchBrowser(pwInfo.pw, args.headed);
    browser = launched.browser;
    ctx.launchHow = launched.how;
    ctx.browserVersion = browser.version();
    const plan = buildPlan(routes, args);
    // Reload the data before every run so the reference matches what the browser loads.
    const freshData = () => {
      const d = loadProject(root, new Report(), { partial: true }).data;
      return isObj(d.routes) ? d : data;
    };
    console.log(`playtest: serving ${root} at ${srv.url}; Chromium ${ctx.browserVersion}; ${plan.length} runs planned`);
    ctx.titleSmoke = await withTimeout(titleSmoke(browser, R, srv.url, args, data), 120000, () => ['FAIL title smoke test timed out after 120 s']);
    const firstOf = new Set();
    let first = true;
    for (const p of plan) {
      const label = runLabel(p);
      if (elapsedMin() > args.budgetMin) { ctx.skipped.push(`${label} (time budget of ${args.budgetMin} min used up)`); continue; }
      process.stdout.write(`  ${pad(label, 30)} ... `);
      const firstOfProfile = !firstOf.has(p.profile);
      firstOf.add(p.profile);
      const runData = freshData();
      if (!isObj(runData.routes[p.rid])) { ctx.skipped.push(`${label} (route data failed to load)`); continue; }
      p.special = specialTexts(runData);
      const cfg = { url: srv.url + 'index.html?test=1', data: runData, args, p, firstOfProfile, settingsCheck: first };
      first = false;
      const run = await withTimeout(playRun(browser, R, cfg), args.runTimeout * 1000, () => {
        const r = newRun(p);
        r.result = 'FAIL';
        r.fail(`run timed out after ${args.runTimeout} s`);
        r.ms = args.runTimeout * 1000;
        return r;
      });
      R.runs.push(run);
      console.log(`${run.result} (${(run.ms / 1000).toFixed(1)}s, ${run.steps} steps, ${run.snips} cut, ${run.scolds} scold${run.failures.length ? ', ' + run.failures.length + ' failure(s): ' + snip(run.failures[0], 90) : ''})`);
    }
    const distFile = path.join(root, 'dist', 'before-he-stood.html');
    if (!args.dist) ctx.distLine = 'skipped (--no-dist)';
    else if (!fs.existsSync(distFile)) ctx.distLine = 'dist/before-he-stood.html not found; skipped (run node tools/build-single.mjs)';
    else if (!routes.length) ctx.distLine = 'no route available; skipped';
    else if (elapsedMin() > args.budgetMin) ctx.distLine = 'skipped (time budget used up)';
    else {
      const rid = routes.includes('asher') ? 'asher' : routes[0];
      const distData = freshData();
      const p = { rid, mode: 'one', profile: 'tv1080', input: 'mouse', lang: 'both', shots: false, special: specialTexts(distData) };
      const label = `dist:${rid}/one@tv1080`;
      const cfg = { url: pathToFileURL(distFile).href + '?test=1', data: distData, args, p, fileMode: true, label };
      // A bundle older than its sources plays stale text.
      const builtAt = fs.statSync(distFile).mtimeMs;
      const sources = ['index.html', 'css/style.css'].concat(...['data', 'data/routes', 'js'].map((d) => {
        try { return fs.readdirSync(path.join(root, d)).filter((f) => /\.(js|css)$/.test(f)).map((f) => d + '/' + f); } catch (e) { return []; }
      }));
      const newer = sources.filter((f) => { try { return fs.statSync(path.join(root, f)).mtimeMs > builtAt + 1000; } catch (e) { return false; } });
      if (newer.length) R.warn(`dist/before-he-stood.html is older than ${newer.slice(0, 4).join(', ')}${newer.length > 4 ? ` and ${newer.length - 4} more` : ''}; rebuild with node tools/build-single.mjs`);
      process.stdout.write(`  ${pad(label, 30)} ... `);
      const run = await withTimeout(playRun(browser, R, cfg), args.runTimeout * 1000, () => {
        const r = newRun(p);
        r.where = label;
        r.result = 'FAIL';
        r.fail(`run timed out after ${args.runTimeout} s`);
        return r;
      });
      R.runs.push(run);
      console.log(`${run.result} (${(run.ms / 1000).toFixed(1)}s)`);
      ctx.distLine = `${run.result}: played ${rid} (plan "one": a cut branch with Try again, a scold, the true ending, the story tree) at 1920x1080 from file:// (${run.steps} steps)`;
    }
    for (const t of ctx.titleSmoke || []) if (/^FAIL/.test(t)) R.fail(t.replace(/^FAIL\s*/, ''));
    const dbgSources = [...new Set(R.runs.map((r) => r.dbgSource).filter(Boolean))];
    if (dbgSources.length) R.info(`debug state read via ${dbgSources.join(', ')}`);
  } catch (e) {
    R.fail(`playtest aborted: ${snip(e.stack || e.message, 300)}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (srv) await srv.close().catch(() => {});
  }
  finish();
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
