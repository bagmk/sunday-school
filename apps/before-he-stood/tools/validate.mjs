#!/usr/bin/env node
/*
 * tools/validate.mjs - data validator for "Before He Stood" (SPEC version 4: story mode).
 * Owner: engine + tools agent. Node 22+, no npm dependencies.
 *
 * Route rules checked (SPEC 4.5, 4.6, 8): choices c1..cN in order with 2-4 options each (ids a-d in
 * order); exactly one outcome per option (continue, `bad: "<id>"` or `scold: { speaker?, text }`);
 * every choice keeps a continue option, so the scolds never leave a dead end; bad ids exist and every
 * cut branch is reachable; one true ending (endings.good: title, memory verse, beats, last) and the
 * cut branches (endings.bad); the counts the story shape asks for (5-6 choices, 4-6 cut branches,
 * 2-4 scolds, at least one 2-option and two 4-option choices; WARN outside). Every true path (each
 * combination of continue options, `when` variants included) and every cut path (each cutting option
 * after every continue prefix) is simulated: screens (true path WARN > 29, ERROR > 30; cut path ERROR
 * > 20), the crowd order of SPEC 6.4 on every true path, the passerby line (SPEC 6.3), reading time per
 * route and per cut branch. Story strings carry no ASCII digits (no numbers on screen). The engine
 * (js/engine.js) is cross-checked step by step on every path, with and without the scolds, including
 * "Try again" (retry) after every cut branch.
 *
 * Usage:
 *   node tools/validate.mjs [--route scribe|friend|asher] [--json] [--partial]
 *                           [--root DIR] [--no-write] [--selftest]
 *
 *   --route     run route-level checks for one route only (global checks always run)
 *   --json      print the report as JSON instead of text
 *   --partial   work-in-progress mode: a missing route file is a WARN instead of an ERROR
 *   --root      project root (default: the parent folder of tools/)
 *   --no-write  do not write qa/reports/validate.txt
 *   --selftest  run the built-in fixture tests and exit
 *
 * The data files are classic scripts (IIFE writing to window.BHS). They are loaded
 * in a node:vm context with a `window` shim, in the same order as index.html.
 *
 * Exit code: 1 if any ERROR was reported, 0 otherwise, 2 on an internal failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(HERE, '..');

export const ROUTE_IDS = ['scribe', 'friend', 'asher'];
export const OPTION_IDS = ['a', 'b', 'c', 'd'];
// Story shape (SPEC 4.5 / 8, version 4). Outside these counts: WARN (writer guidance), except options.
const SHAPE = { choices: [5, 6], options: [2, 4], bad: [4, 6], scolds: [2, 4], twoOption: 1, fourOption: 2 };
// Screens = line + verse + choice + press + the memory-verse card (the true ending's title card and
// the snip card are not screens). True path: WARN above 29 (that is, at 30), ERROR above 30; cut path:
// ERROR above 20.
const SCREENS = { trueWarn: 29, trueMax: 30, trueTarget: [24, 29], cutMax: 20 };
// Ending lengths in screens before the last line: the true ending 1-3 beats, a cut branch 2-3.
const ENDING_BEATS = { good: [1, 3], bad: [2, 3] };
// The memory verse of each route (SPEC 4.6).
const MEMORY_VERSE = { scribe: 'MT_9_6A', friend: 'MT_9_2', asher: 'MT_9_2B' };
// A cut branch's title labels its branch in the story tree: short and funny (2-8 Korean characters).
const BAD_TITLE_KO = [2, 8];
// Option voice (SPEC 4.5): aim at 24 Korean / 48 English characters (INFO above; SPEC 3.3 limits apply).
const OPTION_AIM = { ko: 24, en: 48 };
// Paths simulated per route at most (the story shape keeps it far below).
const PATH_LIMIT = 4000;
const BEAT_TYPES = ['scene', 'line', 'verse', 'choice', 'fx', 'press'];
const PSEUDO_SPEAKERS = ['narrator', 'thought', 'sign'];
const VERSE_SPEAKERS = ['jesus', 'scribes', 'narrator'];
const POV_VALUES = ['normal', 'lying', 'standing'];
const TIME_VALUES = ['day', 'evening', 'night'];
const LIGHT_LEVELS = ['off', 'soft', 'bright'];

// Fallbacks used when docs/SPEC.md cannot be parsed.
const FALLBACK = {
  bgIds: ['black', 'dawn_lamp', 'shore_dawn', 'asher_ceiling', 'asher_home', 'lane', 'sky_carried', 'crowd',
    'crowd_lying', 'road_home', 'doorway_evening', 'lamp_night'],
  forbidden: ['메나헴', '므나햄', '하넌', '요나스', '아셰르',
    '아쉐르', 'Menachem', 'Jonah', 'Asel', 'Asser'],
  passerby: {
    ko: '고통 뒤에 무슨 사연이 있는지 누가 알겠어. ' +
      '저 사람은 무슨 잘못을 했기에 저렇게 됐을까.',
    en: "Who knows what's behind suffering like that. What did he do to end up like that?"
  },
  limits: {
    line: { ko: [80, 110], en: [150, 200] },
    option: { ko: [45, 60], en: [90, 120] },
    prompt: { ko: [50, 70], en: [100, 130] }
  }
};

// FX names and their allowed parameters (SPEC 4.5).
const FX_PARAMS = {
  light: ['level'],
  hush: [],
  echoVerse: ['key', 'highlight'],
  pinThought: ['items'],
  readReceipt: [],
  unpinThought: [],
  pov: ['pov'],
  actionReply: ['action', 'text'],
  actionsHide: [],
  actionsShow: []
};
// The route each FX was designed for (used for INFO notes only).
const FX_HOME = {
  hush: 'scribe', echoVerse: 'scribe', pinThought: 'scribe', readReceipt: 'scribe', unpinThought: 'scribe',
  pov: 'asher', actionReply: 'asher', actionsHide: 'asher', actionsShow: 'asher'
};
const BEAT_KEYS = {
  scene: ['type', 'bg', 'caption', 'pov', 'time', 'when', 'id'],
  line: ['type', 'speaker', 'text', 'when', 'id'],
  verse: ['type', 'key', 'speaker', 'when', 'id'],
  choice: ['type', 'id', 'prompt', 'options', 'when'],
  fx: ['type', 'fx', 'when', 'id'],
  press: ['type', 'action', 'label', 'hint', 'when', 'id']
};
const OPTION_KEYS = ['id', 'text', 'set', 'reaction', 'bad', 'scold'];
const ROUTE_KEYS = ['id', 'actions', 'beats', 'endingPreface', 'endings', 'endingCoda'];

// The fixed crowd sequence (SPEC 6.4). Each key maps to an event group; sub-order is checked separately.
const EVENT_GROUP = {
  MT_9_1: 1, MT_9_2A: 2, MT_9_2B: 3, MT_9_2B1: 3, MT_9_2B2: 3, MT_9_3: 4, MT_9_3Q: 4,
  MT_9_4: 5, MT_9_4N: 5, MT_9_4Q: 5, MT_9_5: 6, MT_9_6A: 7, MT_9_6N: 7, MT_9_6B: 7, MT_9_7: 8, MT_9_8: 9
};
const EVENT_LABEL = {
  1: '9:1 boat', 2: '9:2a brought', 3: '9:2b first words', 4: '9:3 scribes', 5: '9:4 answer',
  6: '9:5 which is easier', 7: '9:6 authority + rise', 8: '9:7 rose', 9: '9:8 crowd'
};
const SUB_ORDER = [['MT_9_2B1', 'MT_9_2B2'], ['MT_9_4N', 'MT_9_4Q'], ['MT_9_6A', 'MT_9_6N'], ['MT_9_6N', 'MT_9_6B'],
  ['MT_9_6A', 'MT_9_6B']];

const BOOKS = {
  MT: ['마', 'Matt'], MK: ['막', 'Mark'], LK: ['눅', 'Luke'], JN: ['요', 'John'],
  PS: ['시', 'Ps'], DT: ['신', 'Deut'], IS: ['사', 'Isa'], LV: ['레', 'Lev'],
  SA2: ['삼하', '2 Sam'], KI1: ['왕상', '1 Kgs'], JB: ['욥', 'Job']
};

// Character classes. Hangul syllables, jamo, and compatibility jamo.
const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏가-힣]/g;
const HANGUL_TEST = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const LATIN_RE = /[A-Za-z]/g;
export const TOKEN_RE = /\{\{(v|r|var):([A-Za-z0-9_]+)\}\}/g;

// Story-text heuristics (player-facing story text only). Comments stay in English, so each
// Korean pattern's meaning is given in the comment above it.
// ko mechanics words: cham/jin/good/bad/happy ending, "ending", "score", "lens", "correct answer".
const MECH_KO = /(참|진|좋은|나쁜|배드|해피|굿)\s?엔딩|엔딩|점수|렌즈|정답/;
const MECH_EN = /\b(true|good|bad|happy|best|real|secret)\s+ending\b|\bending\b(?!\s+up)|\bscores?\b|\b\d+\s*points?\b|\blens(es)?\b|\bcorrect answer\b/i;
// ko "four people" (Mark 2:3): "ne myeong" (not followed by ryeong/ye/dan), "net-iseo", "ne saram-i".
const FOUR_KO = /네\s?명(?![령예단])|넷이서|네 사람이/;
const FOUR_EN = /\bfour\s+(men|of them|friends|people|carriers|bearers)\b/i;
// ko "roof".
const ROOF_KO = /지붕/;
// The idioms "a roof of his own" / "a roof over his head" (homelessness) are not Mark's roof.
const ROOF_EN = /\broof\b(?!\s+(of\s+(his|her|their|my|your|one's)\s+own|over\s+\S+\s+head))/i;
// Mark 2:7 wording: ko "hananim han bun oe-e", "nuga neunghi joe-reul saha".
const MK27_KO = /하나님\s?한\s?분\s?외에|누가\s?능히\s?죄를\s?사하/;
const MK27_EN = /\bbut god alone\b|\bwho can forgive sins but\b/i;
// Talmud (Nedarim 41a) must not be quoted in first-century scenes.
const TALMUD = /탈무드|네다림|Talmud|Nedarim/i;
// Mentions of Jesus, gestures/emotions, and other people (to limit false positives).
const JESUS_REF = /예수님|예수께서|예수라는|그분|\bJesus\b/;
const GESTURE = /미소|웃으|웃는|웃었|끄덕|한숨|눈물|울먹|\bsmil|\blaugh|\bnod(s|ded)?\b|\bsigh|\bgrin|\bwink|\btears?\b|\bwept\b/i;
const OTHER_PEOPLE = /아셀|요나|므나헴|하난|어머니|동생|\bAsher\b|\bYonah\b|\bMenahem\b|\bHanan\b|\bMom\b|\bbrother\b/;
const MARK_LABEL = /MK_\d|마가|\bMark\b/;
const QUOTE_BEFORE = /["“'‘「『]$/;
const QUOTE_AFTER = /^["”'’」』]/;
// How the protagonist's voice names Jesus (SPEC 6.1). Scribe POV: "yesu-raneun saram", "geu saram",
// "geu" (no honorific "geubun" or "yesunim"). Friend and Asher POV: "geubun" (never "yesu-raneun saram").
const HONOR_KO = /그분|예수님/;
const PLAIN_KO = /예수라는\s?사람/;
// ASCII digits in our own story strings (no numbers on screen, SPEC 4.5); tokens are stripped first.
const DIGITS = /[0-9]/;

// ---------------------------------------------------------------------------------------------
// Small helpers

export function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function isT(x) { return isObj(x) && typeof x.ko === 'string' && typeof x.en === 'string'; }
function snip(s, n = 34) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ');
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function cpLen(s) { return Array.from(s).length; }
function stripTokens(s) { return String(s).replace(TOKEN_RE, ' '); }
function countRe(s, re) { const m = String(s).match(re); return m ? m.length : 0; }
function pct(x) { return (x * 100).toFixed(1) + '%'; }
export function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const n = a.length;
  if (!n) return 0;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function padL(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

// ---------------------------------------------------------------------------------------------
// Report

export class Report {
  constructor() {
    this.findings = [];
    this.stats = [];
    this.files = [];
    this.seen = new Set();
  }
  add(level, code, where, msg) {
    const key = level + '|' + code + '|' + where + '|' + msg;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.findings.push({ level, code, where, msg });
  }
  error(code, where, msg) { this.add('ERROR', code, where, msg); }
  warn(code, where, msg) { this.add('WARN', code, where, msg); }
  info(code, where, msg) { this.add('INFO', code, where, msg); }
  count(level) { return this.findings.filter((f) => f.level === level).length; }
  has(level, code, re) {
    return this.findings.some((f) => f.level === level && (!code || f.code === code) &&
      (!re || re.test(f.msg + ' ' + f.where)));
  }
  section(title, lines) { this.stats.push({ title, lines }); }
}

// ---------------------------------------------------------------------------------------------
// SPEC parsing (keeps the validator in sync with docs/SPEC.md)

export function parseSpec(root) {
  const out = { ok: false, keys: new Map(), refOnlyRefs: new Map(), bgIds: null, forbidden: null, passerby: null, limits: null };
  let src;
  try { src = fs.readFileSync(path.join(root, 'docs', 'SPEC.md'), 'utf8'); } catch (e) { return out; }
  out.ok = true;
  let section = '';
  for (const ln of src.split('\n')) {
    const h = ln.match(/^#{2,4}\s+(\d+(?:\.\d+)*)\s/);
    if (h) section = h[1];
    if (section === '4.3') {
      const m = ln.match(/^\|\s*([A-Z][A-Z0-9]*_[0-9][A-Z0-9_]*)\s*\|(.*)\|\s*$/);
      if (m) {
        const cells = m[2].split('|').map((s) => s.trim());
        const sp = cells.find((c) => VERSE_SPEAKERS.includes(c)) || null;
        out.keys.set(m[1], { speaker: sp, refOnly: false });
      }
      if (/^Reference-only/.test(ln)) {
        for (const mm of ln.matchAll(/([A-Z][A-Z0-9]*_[0-9][0-9_]*)\s*\(([^)]+)\)/g)) {
          out.keys.set(mm[1], { speaker: null, refOnly: true });
          out.refOnlyRefs.set(mm[1], mm[2].trim());
        }
      }
    }
    if (section === '6.6') {
      const m = ln.match(/^\|\s*([a-z][a-z_]*)\s*\|/);
      if (m) (out.bgIds = out.bgIds || []).push(m[1]);
    }
    if (section === '6.5' && /Forbidden variants/.test(ln)) {
      const after = ln.split(':').slice(1).join(':');
      out.forbidden = after.split(',').map((s) => s.replace(/\(.*?\)/g, '').replace(/[.`]/g, '').trim()).filter(Boolean);
    }
    if (section === '6.3') {
      let m = ln.match(/KO:\s*「(.+)」/);
      if (m) (out.passerby = out.passerby || {}).ko = m[1];
      m = ln.match(/EN:\s*"(.+)"\s*$/);
      if (m) (out.passerby = out.passerby || {}).en = m[1];
    }
    if (section === '3.3') {
      const m = ln.match(/^\|\s*(line text|option text|choice prompt)\s*\|\s*(\d+)\s*\/\s*(\d+)[^|]*\|\s*(\d+)\s*\/\s*(\d+)/);
      if (m) {
        const k = m[1].startsWith('line') ? 'line' : m[1].startsWith('option') ? 'option' : 'prompt';
        (out.limits = out.limits || {})[k] = { ko: [+m[2], +m[3]], en: [+m[4], +m[5]] };
      }
    }
  }
  return out;
}

function canonFromSpec(spec) {
  return {
    bgIds: spec.bgIds && spec.bgIds.length >= 8 ? spec.bgIds : FALLBACK.bgIds,
    forbidden: spec.forbidden && spec.forbidden.length ? spec.forbidden : FALLBACK.forbidden,
    passerby: spec.passerby && spec.passerby.ko && spec.passerby.en ? spec.passerby : FALLBACK.passerby,
    limits: Object.assign({}, FALLBACK.limits, spec.limits || {})
  };
}

function expectedRef(key, spec) {
  const m = key.match(/^([A-Z]+[0-9]?)_(\d+)_(\d+)(?:_(\d+))?([A-Z][A-Z0-9]*)?$/);
  if (!m || !BOOKS[m[1]]) return null;
  const [ko, en] = BOOKS[m[1]];
  const specKo = spec.refOnlyRefs.get(key);
  if (specKo && /장$/.test(specKo)) {
    // Chapter range such as "Lev 13-15".
    return { ko: specKo.replace(/-/g, '–'), en: en + ' ' + m[2] + '–' + m[3] };
  }
  const v = m[4] ? m[3] + '–' + m[4] : m[3];
  return { ko: ko + ' ' + m[2] + ':' + v, en: en + ' ' + m[2] + ':' + v };
}

// ---------------------------------------------------------------------------------------------
// Lexer for comments and code (strings/comments blanked) - used for the comment-language check
// and for classic-script checks (import/export/fetch, ES2020+ syntax).

export function lexJs(src) {
  const n = src.length;
  const code = [];
  const comments = [];
  const stack = [];
  let depth = 0;
  let i = 0;
  let prevValue = false;
  const blank = (from, to) => { for (let k = from; k < to; k++) code.push(src[k] === '\n' ? '\n' : ' '); };
  const readTemplate = () => {
    while (i < n) {
      const c = src[i];
      if (c === '\\') { blank(i, Math.min(n, i + 2)); i += 2; continue; }
      if (c === '`') { code.push('`'); i++; return 'end'; }
      if (c === '$' && src[i + 1] === '{') { code.push('$', '{'); i += 2; stack.push(depth); depth++; return 'expr'; }
      code.push(c === '\n' ? '\n' : ' ');
      i++;
    }
    return 'end';
  };
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '\n' || c === ' ' || c === '\t' || c === '\r') { code.push(c); i++; continue; }
    if (c === '/' && d === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      comments.push({ text: src.slice(i + 2, j), index: i });
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2);
      const end = j < 0 ? n : j + 2;
      comments.push({ text: src.slice(i + 2, j < 0 ? n : j), index: i });
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (src[j] === '\n') break;
        j++;
      }
      j = Math.min(n, j + 1);
      code.push(c);
      blank(i + 1, j - 1);
      code.push(c);
      i = j;
      prevValue = true;
      continue;
    }
    if (c === '`') {
      code.push('`');
      i++;
      prevValue = readTemplate() === 'end';
      continue;
    }
    if (c === '{') { depth++; code.push(c); i++; prevValue = false; continue; }
    if (c === '}') {
      if (stack.length && stack[stack.length - 1] === depth - 1) {
        depth--;
        stack.pop();
        code.push(c);
        i++;
        prevValue = readTemplate() === 'end';
        continue;
      }
      depth--;
      code.push(c);
      i++;
      prevValue = true;
      continue;
    }
    if (c === '/') {
      if (prevValue) { code.push(c); i++; prevValue = false; continue; }
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const e = src[j];
        if (e === '\\') { j += 2; continue; }
        if (e === '\n') break;
        if (inClass) { if (e === ']') inClass = false; } else if (e === '[') inClass = true; else if (e === '/') break;
        j++;
      }
      j = Math.min(n, j + 1);
      while (j < n && /[a-z]/i.test(src[j])) j++;
      code.push('/');
      blank(i + 1, j);
      i = j;
      prevValue = true;
      continue;
    }
    if (/[A-Za-z_$0-9]/.test(c) || c > '\x7f') {
      let j = i;
      while (j < n && (/[A-Za-z_$0-9]/.test(src[j]) || src[j] > '\x7f')) j++;
      const w = src.slice(i, j);
      code.push(w);
      i = j;
      prevValue = !/^(return|typeof|case|do|else|in|of|new|delete|void|throw|instanceof|yield|await)$/.test(w);
      continue;
    }
    if (c === ')' || c === ']') { code.push(c); i++; prevValue = true; continue; }
    code.push(c);
    i++;
    prevValue = false;
  }
  return { code: code.join(''), comments };
}

function lineAt(src, index) {
  let line = 1;
  for (let k = 0; k < index && k < src.length; k++) if (src.charCodeAt(k) === 10) line++;
  return line;
}

function scanSourceFile(rep, root, rel) {
  let src;
  try { src = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return; }
  const ext = path.extname(rel);
  const comments = [];
  const codeChunks = [];
  if (ext === '.js' || ext === '.mjs') {
    const lx = lexJs(src);
    lx.comments.forEach((c) => comments.push({ text: c.text, line: lineAt(src, c.index) }));
    codeChunks.push({ code: lx.code, offset: 0 });
  } else if (ext === '.css') {
    for (const m of src.matchAll(/\/\*([\s\S]*?)\*\//g)) comments.push({ text: m[1], line: lineAt(src, m.index) });
  } else if (ext === '.html') {
    for (const m of src.matchAll(/<!--([\s\S]*?)-->/g)) comments.push({ text: m[1], line: lineAt(src, m.index) });
    for (const m of src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/.test(m[1])) continue;
      const off = m.index + m[0].indexOf('>') + 1;
      const lx = lexJs(m[2]);
      lx.comments.forEach((c) => comments.push({ text: c.text, line: lineAt(src, off + c.index) }));
      codeChunks.push({ code: lx.code, offset: off });
    }
    for (const m of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      const off = m.index + m[0].indexOf('>') + 1;
      for (const c of m[1].matchAll(/\/\*([\s\S]*?)\*\//g)) comments.push({ text: c[1], line: lineAt(src, off + c.index) });
    }
  }
  const bad = comments.filter((c) => HANGUL_TEST.test(c.text));
  if (bad.length) {
    rep.warn('comment', rel, `Korean text in ${bad.length} code comment(s) (SPEC 0: comments in English only), first at line ` +
      `${bad[0].line}: "${snip(bad[0].text.trim(), 40)}"`);
  }
  const classic = /^(data|js)\//.test(rel) && ext === '.js';
  if (classic) {
    for (const ch of codeChunks) {
      const code = ch.code;
      const checks = [
        [/(^|[;\n])\s*import\s+[\w{*'"]/, 'ERROR', 'uses an import statement (classic scripts only, SPEC 2)'],
        [/(^|[;\n])\s*export\s+(default|const|let|var|function|class|\{)/, 'ERROR', 'uses an export statement (classic scripts only, SPEC 2)'],
        [/\bfetch\s*\(/, 'ERROR', 'calls fetch() (no network/fetch allowed, SPEC 0/2)'],
        [/\?\.(?!\d)/, 'WARN', 'uses optional chaining ?. (SPEC 2 targets ES2019)'],
        [/\?\?/, 'WARN', 'uses nullish coalescing ?? (SPEC 2 targets ES2019)'],
        [/(\|\||&&)=/, 'WARN', 'uses logical assignment (SPEC 2 targets ES2019)']
      ];
      for (const [re, level, msg] of checks) {
        const m = code.match(re);
        if (m) rep.add(level, 'script', `${rel}:${lineAt(src, ch.offset + m.index + (m[1] ? m[1].length : 0))}`, msg);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Loading the project data in a vm context

const DATA_FILES = ['data/meta.js', 'data/characters.js', 'data/scripture.js', 'data/common.js', 'data/ui-strings.js'];

export function loadProject(root, rep, opts = {}) {
  const files = {};
  const sandbox = { console: { log() {}, info() {}, warn() {}, error() {}, debug() {} } };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  const readRel = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return null;
    const src = fs.readFileSync(abs, 'utf8');
    files[rel] = { src };
    return src;
  };
  const run = (rel, src) => {
    try {
      vm.runInContext(src, ctx, { filename: rel, timeout: 5000 });
      return null;
    } catch (e) {
      const where = (String(e.stack || '').match(new RegExp(rel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + ':(\\d+)')) || [])[1];
      return `${e.name || 'Error'}: ${e.message}${where ? ' (line ' + where + ')' : ''}`;
    }
  };
  const status = [];
  for (const rel of DATA_FILES) {
    const src = readRel(rel);
    if (src == null) {
      status.push({ rel, status: 'MISSING' });
      if (rel === 'data/ui-strings.js') rep.info('load', rel, 'not present yet (engine agent); skipped');
      else if (rel === 'data/scripture.js') rep.warn('load', rel, 'missing; token keys are checked against the SPEC 4.3 key list');
      else rep.error('load', rel, 'missing');
      continue;
    }
    const err = run(rel, src);
    status.push({ rel, status: err ? 'LOAD ERROR' : 'OK', bytes: Buffer.byteLength(src) });
    if (err) rep.error('load', rel, err);
  }
  const BHS = sandbox.BHS || {};
  for (const rid of ROUTE_IDS) {
    const rel = `data/routes/${rid}.js`;
    if (opts.routeFilter && opts.routeFilter !== rid) continue;
    const src = readRel(rel);
    if (src == null) {
      status.push({ rel, status: 'MISSING' });
      if (opts.partial) rep.warn('load', rel, 'missing (route writer still working?); route checks skipped');
      else rep.error('load', rel, 'missing; route checks skipped (use --partial while writers are still working)');
      continue;
    }
    const before = Object.assign({}, (sandbox.BHS && sandbox.BHS.routes) || {});
    const err = run(rel, src);
    status.push({ rel, status: err ? 'LOAD ERROR' : 'OK', bytes: Buffer.byteLength(src) });
    if (err) { rep.error('load', rel, err); continue; }
    const after = (sandbox.BHS && sandbox.BHS.routes) || {};
    for (const k of Object.keys(after)) {
      if (k !== rid && before[k] !== after[k]) rep.warn('load', rel, `also defines or replaces BHS.routes.${k}`);
    }
    if (!after[rid]) rep.error('load', rel, `does not define BHS.routes.${rid}`);
  }
  // Optional: the engine, loaded after the data with the same window shim (SPEC 2: no DOM at load time).
  let engine = null;
  const engRel = 'js/engine.js';
  const engSrc = readRel(engRel);
  if (engSrc == null) {
    status.push({ rel: engRel, status: 'MISSING' });
    rep.info('engine', engRel, 'not present yet; engine cross-check skipped');
  } else {
    const err = run(engRel, engSrc);
    status.push({ rel: engRel, status: err ? 'LOAD ERROR' : 'OK', bytes: Buffer.byteLength(engSrc) });
    if (err) rep.error('engine', engRel, `failed to load in Node with a window shim (SPEC 2: no DOM access at load time): ${err}`);
    else if (!sandbox.BHS || !sandbox.BHS.engine) rep.error('engine', engRel, 'loaded but BHS.engine is not defined');
    else engine = sandbox.BHS.engine;
  }
  const B = sandbox.BHS || {};
  return {
    files,
    status,
    bhs: sandbox.BHS || null,
    data: {
      meta: B.meta, characters: B.characters, scripture: B.scripture, common: B.common, ui: B.ui,
      routes: B.routes || {}, engine
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Story structure (SPEC 4.5, version 4) - the reference shared with tools/playtest.mjs

// The outcome of an option: "continue" (default), "bad" (cuts the story) or "scold" (removed, asked again).
export function optionOutcome(o) {
  if (!isObj(o)) return 'continue';
  if (typeof o.bad === 'string' && o.bad) return 'bad';
  if (isObj(o.scold)) return 'scold';
  return 'continue';
}

// The route's choice beats in beat order (the first of a duplicated id only).
export function choicesOf(route) {
  const out = [];
  const seen = new Set();
  for (const b of (route && Array.isArray(route.beats) ? route.beats : [])) {
    if (!isObj(b) || b.type !== 'choice' || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
  }
  return out;
}

function optionsOf(b) { return (b && Array.isArray(b.options) ? b.options : []).filter(isObj); }
function continueIds(b) { return optionsOf(b).filter((o) => optionOutcome(o) === 'continue').map((o) => o.id); }

export function goodEnding(route) {
  const e = route && isObj(route.endings) ? route.endings.good : null;
  return isObj(e) ? e : null;
}

export function badEnding(route, id) {
  const bad = route && isObj(route.endings) && isObj(route.endings.bad) ? route.endings.bad : null;
  return bad && Object.prototype.hasOwnProperty.call(bad, id) && isObj(bad[id]) ? bad[id] : null;
}

// A path label: the option picked at each choice in order, "-" where the choice is never asked.
export function pathLabel(route, picks) {
  return choicesOf(route).map((b) => (picks && picks[b.id]) || '-').join('');
}

// Every true path: each combination of continue options (a choice without one leaves no true path).
export function truePaths(route, limit = PATH_LIMIT) {
  const ch = choicesOf(route);
  const cont = ch.map(continueIds);
  const out = [];
  const walk = (k, acc) => {
    if (out.length >= limit) return;
    if (k === ch.length) { out.push(Object.assign({}, acc)); return; }
    for (const id of cont[k]) {
      acc[ch[k].id] = id;
      walk(k + 1, acc);
    }
    delete acc[ch[k].id];
  };
  walk(0, {});
  return out;
}

// Every cut path: each option with `bad` at choice k, after every combination of continue options before k.
export function cutPaths(route, limit = PATH_LIMIT) {
  const ch = choicesOf(route);
  const cont = ch.map(continueIds);
  const out = [];
  ch.forEach((b, k) => {
    const bads = optionsOf(b).filter((o) => optionOutcome(o) === 'bad');
    if (!bads.length) return;
    const prefixes = [];
    const walk = (j, acc) => {
      if (prefixes.length >= limit) return;
      if (j === k) { prefixes.push(Object.assign({}, acc)); return; }
      for (const id of cont[j]) {
        acc[ch[j].id] = id;
        walk(j + 1, acc);
      }
      delete acc[ch[j].id];
    };
    walk(0, {});
    for (const p of prefixes) {
      for (const o of bads) {
        if (out.length >= limit) return;
        out.push({ picks: Object.assign({}, p, { [b.id]: o.id }), choice: b.id, option: o.id, bad: o.bad });
      }
    }
  });
  return out;
}

// The option a plan picks at a presented choice (the reference simulation and the engine driver share
// it): with `scoldFirst`, every scold option still shown, in order; then the planned option when it
// is shown; otherwise the first shown continue option (or the first shown option).
export function nextPick(b, shown, plan) {
  const opts = optionsOf(b).filter((o) => shown.includes(o.id));
  if (plan && plan.scoldFirst) {
    const s = opts.find((o) => optionOutcome(o) === 'scold');
    if (s) return s.id;
  }
  const want = plan && plan.picks ? plan.picks[b.id] : undefined;
  if (want && shown.includes(want)) return want;
  const c = opts.find((o) => optionOutcome(o) === 'continue');
  return c ? c.id : opts.length ? opts[0].id : null;
}

export function scoldLine(b, o) {
  return { type: 'line', speaker: (o.scold && o.scold.speaker) || 'narrator', text: o.scold ? o.scold.text : null, id: `scold-${b.id}-${o.id}` };
}

// The cut branches of the story tree: each bad id at the first choice that leads to it.
export function treeLevels(route) {
  const placed = new Set();
  return choicesOf(route).map((b) => ({
    id: b.id,
    branches: optionsOf(b).filter((o) => optionOutcome(o) === 'bad' && !placed.has(o.bad) && placed.add(o.bad)).map((o) => o.bad)
  }));
}

// ---------------------------------------------------------------------------------------------
// Conditions

// An unset value (undefined/null) matches `false`, so {flag:"far", is:false} is true before "far" is set.
// This mirrors js/engine.js (looseEq).
function condEq(v, x) {
  if (v === undefined) v = null;
  if (x === false && v === null) return true;
  if (x === null) return v === null;
  return v === x;
}
export function evalCond(c, st) {
  if (Array.isArray(c)) return c.every((x) => evalCond(x, st));
  if (!isObj(c)) return false;
  if ('all' in c) return Array.isArray(c.all) && c.all.every((x) => evalCond(x, st));
  if ('any' in c) return Array.isArray(c.any) && c.any.some((x) => evalCond(x, st));
  if ('not' in c) return !evalCond(c.not, st);
  if ('choice' in c || 'flag' in c) {
    const v = 'choice' in c ? (st.choices ? st.choices[c.choice] : undefined) : (st.flags ? st.flags[c.flag] : undefined);
    if ('is' in c) return condEq(v, c.is);
    if ('in' in c) return Array.isArray(c.in) && c.in.some((x) => condEq(v, x));
    return v !== undefined && v !== null && v !== false;
  }
  if ('var' in c) {
    const n = Number((st.vars || {})[c.var] || 0);
    if ('is' in c) return n === Number(c.is);
    if ('gte' in c) return n >= Number(c.gte);
    if ('gt' in c) return n > Number(c.gt);
    if ('lte' in c) return n <= Number(c.lte);
    if ('lt' in c) return n < Number(c.lt);
    return n !== 0;
  }
  return false;
}

function isPrimitive(v) { return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'; }

function checkCond(cond, cx, w) {
  const rep = cx.rep;
  if (!isObj(cond)) { rep.error('cond', w, 'condition must be an object'); return; }
  const keys = Object.keys(cond);
  const extra = (allowed) => keys.filter((k) => !allowed.includes(k));
  if ('choice' in cond) {
    const ex = extra(['choice', 'is', 'in']);
    if (ex.length) rep.error('cond', w, `unknown key(s) in choice condition: ${ex.join(', ')}`);
    const known = cx.choiceIds || new Set();
    if (!known.has(cond.choice)) rep.error('cond', w, `unknown choice id "${cond.choice}" (choices are ${[...known].join(', ') || 'none'})`);
    else if (!cx.seen.has(cond.choice)) {
      if (cx.inBadEnding) rep.error('cond', w, `references ${cond.choice}, which is never asked before this cut branch (it starts at ${cx.badFrom})`);
      else rep.error('cond', w, `references ${cond.choice}, which does not appear earlier in the beat order`);
    }
    if ('is' in cond && 'in' in cond) rep.error('cond', w, 'use either "is" or "in", not both');
    else if ('is' in cond) { if (!OPTION_IDS.includes(cond.is)) rep.error('cond', w, `"is" must be one of a-d, got ${JSON.stringify(cond.is)}`); }
    else if ('in' in cond) {
      if (!Array.isArray(cond.in) || !cond.in.length || !cond.in.every((x) => OPTION_IDS.includes(x))) {
        rep.error('cond', w, `"in" must be a non-empty array of a-d, got ${JSON.stringify(cond.in)}`);
      }
    } else rep.error('cond', w, 'choice condition needs "is" or "in"');
    return;
  }
  if ('flag' in cond) {
    const ex = extra(['flag', 'is', 'in']);
    if (ex.length) rep.error('cond', w, `unknown key(s) in flag condition: ${ex.join(', ')}`);
    const f = cond.flag;
    if (typeof f !== 'string' || !f) { rep.error('cond', w, 'flag name must be a non-empty string'); return; }
    const avail = cx.flags.get(f);
    if (!avail) {
      if (cx.allFlags && cx.allFlags.has(f)) rep.error('cond', w, `flag "${f}" is only set later in the route (must be set earlier)`);
      else rep.error('cond', w, `flag "${f}" is never set by any option "set"`);
    }
    const vals = 'in' in cond ? cond.in : [cond.is];
    if ('is' in cond && 'in' in cond) rep.error('cond', w, 'use either "is" or "in", not both');
    else if (!('is' in cond) && !('in' in cond)) rep.error('cond', w, 'flag condition needs "is" or "in"');
    else if ('in' in cond && (!Array.isArray(cond.in) || !cond.in.length)) rep.error('cond', w, '"in" must be a non-empty array');
    else {
      for (const v of vals) {
        if (!isPrimitive(v)) rep.error('cond', w, `flag value must be a string, number or boolean, got ${JSON.stringify(v)}`);
        // An unset flag counts as false, so {flag, is:false} needs no report.
        else if (v === false) continue;
        else if (avail && !avail.has(v)) rep.warn('cond', w, `flag "${f}" is never set to ${JSON.stringify(v)} (set values: ${[...avail].map((x) => JSON.stringify(x)).join(', ')})`);
      }
    }
    return;
  }
  if ('var' in cond) {
    const ex = extra(['var', 'is', 'gte', 'gt', 'lte', 'lt']);
    if (ex.length) rep.error('cond', w, `unknown key(s) in var condition: ${ex.join(', ')}`);
    rep.warn('cond', w, 'var condition is an engine extension, not in SPEC 4.5');
    if (!cx.counters.has(cond.var)) rep.error('cond', w, `var "${cond.var}" is not an action counter of this route`);
    return;
  }
  for (const k of ['lastLens', 'c10lens']) {
    if (k in cond) { rep.error('cond', w, `${k} is a lens condition of the earlier releases; version 4 has no lenses (SPEC 4.5)`); return; }
  }
  for (const k of ['all', 'any']) {
    if (k in cond) {
      const ex = extra([k]);
      if (ex.length) rep.error('cond', w, `unknown key(s) next to "${k}": ${ex.join(', ')}`);
      if (!Array.isArray(cond[k]) || !cond[k].length) { rep.error('cond', w, `"${k}" must be a non-empty array`); return; }
      cond[k].forEach((c, i) => checkCond(c, cx, `${w}.${k}[${i}]`));
      return;
    }
  }
  if ('not' in cond) {
    const ex = extra(['not']);
    if (ex.length) rep.error('cond', w, `unknown key(s) next to "not": ${ex.join(', ')}`);
    checkCond(cond.not, cx, `${w}.not`);
    return;
  }
  rep.error('cond', w, `unrecognized condition ${snip(JSON.stringify(cond), 60)}`);
}

// ---------------------------------------------------------------------------------------------
// Text rendering for length and reading time

// Display form of a verse text (mirrors BHS.engine.verseDisplay, SPEC 4.3): an English excerpt that
// starts with a lowercase letter is shown with a leading ellipsis. Korean is never changed.
export function verseDisplayText(txt, lang) {
  const s = String(txt == null ? '' : txt);
  return lang === 'en' && /^[a-z]/.test(s) ? '…' + s : s;
}

// Display form on the memory-verse card (mirrors BHS.engine.memoryDisplay, SPEC 4.6): verseDisplayText,
// plus a trailing "…" when the key is an excerpt that stops mid-sentence: its `full` verse goes on with
// more words after it, and the excerpt does not end in terminal punctuation (. ? ! closing quotes, …).
export function memoryDisplayText(entry, lang) {
  if (!isObj(entry)) return '';
  const txt = String(entry[lang] == null ? '' : entry[lang]);
  const shown = verseDisplayText(txt, lang);
  const full = isObj(entry.full) && typeof entry.full[lang] === 'string' ? entry.full[lang] : null;
  if (!txt || !full) return shown;
  const at = full.lastIndexOf(txt);
  if (at < 0) return shown;
  const goesOn = /[0-9A-Za-z\u1100-\u11ff\u3131-\u318e\uac00-\ud7a3]/.test(full.slice(at + txt.length));
  return goesOn && !/[.?!”’"'…]$/.test(txt.replace(/\s+$/, '')) ? shown + '…' : shown;
}

export function renderText(str, lang, scripture, vars) {
  return String(str)
    .replace(TOKEN_RE, (m, kind, key) => {
      const s = scripture ? scripture[key] : null;
      if (kind === 'v') return s && s[lang] ? '“' + verseDisplayText(s[lang], lang) + '”' : m;
      if (kind === 'r') return s && s.ref && s.ref[lang] ? s.ref[lang] : m;
      return String(vars && vars[key] != null ? vars[key] : 0);
    })
    .replace(/\*([^*\n]+)\*/g, '$1');
}

// ---------------------------------------------------------------------------------------------
// Typed-scripture detector: n-gram index over every verse text (ko: 4 words, en: 5 words).

function normWords(s, lang) {
  let t = String(s);
  if (lang === 'en') t = t.toLowerCase().replace(/[‘’']/g, '').replace(/[^a-z0-9\s]/g, ' ');
  else t = t.replace(/[^가-힣ᄀ-ᇿ㄰-㆏0-9A-Za-z\s]/g, ' ');
  return t.split(/\s+/).filter(Boolean);
}
function buildScriptureIndex(scripture) {
  const idx = { ko: new Map(), en: new Map() };
  if (!isObj(scripture)) return idx;
  const N = { ko: 4, en: 5 };
  for (const [key, e] of Object.entries(scripture)) {
    if (!isObj(e) || e.refOnly) continue;
    for (const lang of ['ko', 'en']) {
      const texts = [e[lang]];
      if (isObj(e.full) && typeof e.full[lang] === 'string') texts.push(e.full[lang]);
      for (const t of texts) {
        const w = normWords(t, lang);
        for (let i = 0; i + N[lang] <= w.length; i++) {
          const g = w.slice(i, i + N[lang]).join(' ');
          if (!idx[lang].has(g)) idx[lang].set(g, key);
        }
      }
    }
  }
  return idx;
}
function findTypedScripture(str, lang, idx) {
  const N = lang === 'en' ? 5 : 4;
  const w = normWords(stripTokens(str), lang);
  for (let i = 0; i + N <= w.length; i++) {
    const g = w.slice(i, i + N).join(' ');
    if (idx[lang].has(g)) return { key: idx[lang].get(g), gram: g };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// T checks

function checkT(t, cx, w, o = {}) {
  // o: { kind: 'line'|'option'|'prompt'|null, story: bool, allowMixed: bool, allowEmpty: bool }
  const rep = cx.rep;
  if (!isT(t)) {
    rep.error('T', w, `expected a bilingual text {ko, en}, got ${snip(JSON.stringify(t), 50)}`);
    return false;
  }
  const extraKeys = Object.keys(t).filter((k) => k !== 'ko' && k !== 'en');
  if (extraKeys.length) rep.warn('T', w, `unexpected key(s) in text object: ${extraKeys.join(', ')}`);
  for (const lang of ['ko', 'en']) {
    const s = t[lang];
    if (!s.trim()) {
      if (!o.allowEmpty) rep.error('T', w, `empty ${lang} text`);
      continue;
    }
    if (/[\r\n]/.test(s)) rep.warn('T', w, `${lang} text contains a line break (use separate beats, SPEC 3.1)`);
    if (/<\/?[a-z][^>]*>/i.test(s)) rep.warn('T', w, `${lang} text contains HTML (plain text only, SPEC 3.1)`);
    if (s !== s.trim()) rep.info('T', w, `${lang} text has leading/trailing spaces`);
    if (countRe(stripTokens(s), /\*/g) % 2) rep.warn('T', w, `${lang} text has an unbalanced * emphasis marker`);
  }
  if (!t.ko.trim() || !t.en.trim()) return true;
  // Language sanity.
  const en = stripTokens(t.en);
  const ko = stripTokens(t.ko);
  const hEn = countRe(en, HANGUL_RE);
  const lEn = countRe(en, LATIN_RE);
  const sev = o.ui ? 'INFO' : null;
  if (hEn && !o.allowMixed) {
    if (hEn / (hEn + lEn) >= 0.3) rep.add(sev || 'ERROR', 'lang', w, `en text is mostly Hangul (languages swapped?): "${snip(t.en)}"`);
    else rep.add(sev || 'WARN', 'lang', w, `en text contains Hangul: "${snip(t.en)}"`);
  }
  const hKo = countRe(ko, HANGUL_RE);
  const lKo = countRe(ko, LATIN_RE);
  if (!hKo && lKo > 3) rep.add(sev || 'ERROR', 'lang', w, `ko text has no Hangul (languages swapped or untranslated?): "${snip(t.ko)}"`);
  if (t.ko.trim() === t.en.trim() && hKo + lKo > 0 && !o.ui) rep.warn('lang', w, `ko and en are identical: "${snip(t.ko)}"`);
  // Tokens.
  for (const lang of ['ko', 'en']) checkTokens(t[lang], lang, cx, w);
  const kt = [...t.ko.matchAll(TOKEN_RE)].map((m) => m[0]).sort().join(' ');
  const et = [...t.en.matchAll(TOKEN_RE)].map((m) => m[0]).sort().join(' ');
  if (kt !== et) rep.warn('token', w, `ko and en use different tokens (ko: ${kt || 'none'}; en: ${et || 'none'})`);
  // Length limits.
  if (o.kind) {
    const lim = cx.canon.limits[o.kind];
    for (const lang of ['ko', 'en']) {
      const len = cpLen(renderText(t[lang], lang, cx.data.scripture));
      const [soft, hard] = lim[lang];
      if (len > hard) rep.error('length', w, `${o.kind} ${lang} is ${len} chars (hard limit ${hard}): "${snip(t[lang], 40)}"`);
      else if (len > soft) rep.warn('length', w, `${o.kind} ${lang} is ${len} chars (soft limit ${soft}): "${snip(t[lang], 40)}"`);
    }
  }
  // Names (everywhere).
  for (const lang of ['ko', 'en']) {
    for (const re of cx.forbiddenRes) {
      if (re.test(t[lang])) rep.error('names', w, `forbidden name variant "${re.source.replace(/\\b/g, '')}" in ${lang}: "${snip(t[lang])}"`);
    }
  }
  if (o.story) storyChecks(t, cx, w, o);
  cx.allTexts.push({ t, w, story: !!o.story, speaker: o.speaker || null, egg: !!cx.egg, bg: cx.bgNow ? cx.bgNow() : null });
  return true;
}

function checkTokens(s, lang, cx, w) {
  const rep = cx.rep;
  const rest = s.replace(TOKEN_RE, '');
  if (/\{\{|\}\}/.test(rest)) rep.error('token', w, `malformed token in ${lang} (expected {{v:KEY}}, {{r:KEY}} or {{var:NAME}}): "${snip(s, 50)}"`);
  const scr = cx.data.scripture;
  for (const m of s.matchAll(TOKEN_RE)) {
    const [whole, kind, key] = m;
    if (kind === 'v' || kind === 'r') {
      if (!isObj(scr)) {
        if (cx.spec.keys.has(key)) {
          rep.warn('token', w, `{{${kind}:${key}}} checked against the SPEC 4.3 key list only (data/scripture.js missing)`);
          if (kind === 'v' && cx.spec.keys.get(key).refOnly) rep.error('token', w, `{{v:${key}}} uses a reference-only key (use {{r:${key}}})`);
        } else rep.error('token', w, `unknown scripture key ${key} (not in SPEC 4.3)`);
        continue;
      }
      const e = scr[key];
      if (!isObj(e)) { rep.error('token', w, `unknown scripture key ${key} in ${whole}`); continue; }
      if (kind === 'v' && e.refOnly) rep.error('token', w, `{{v:${key}}} uses a reference-only key (only {{r:${key}}} is allowed)`);
      else if (kind === 'v' && !(typeof e[lang] === 'string' && e[lang])) rep.error('token', w, `{{v:${key}}} has no ${lang} text in data/scripture.js`);
      if (kind === 'v') {
        const before = s.slice(0, m.index).replace(/\s+$/, '');
        const after = s.slice(m.index + whole.length).replace(/^\s+/, '');
        if (QUOTE_BEFORE.test(before) || QUOTE_AFTER.test(after)) {
          rep.warn('token', w, `quotation marks around ${whole} in ${lang} (the engine adds quotes, SPEC 3.2)`);
        }
      }
      if (cx.usage) cx.usage.add(key);
    } else if (kind === 'var') {
      if (!cx.counters.has(key)) rep.error('token', w, `{{var:${key}}} is not an action counter of this route (counters: ${[...cx.counters].join(', ') || 'none'})`);
    }
  }
}

function storyChecks(t, cx, w, o = {}) {
  const rep = cx.rep;
  if (MECH_KO.test(stripTokens(t.ko))) rep.warn('guard', w, `game-mechanics word in story text (ko): "${snip(t.ko)}" (SPEC 3.4/7.3)`);
  if (MECH_EN.test(stripTokens(t.en))) rep.warn('guard', w, `game-mechanics word in story text (en): "${snip(t.en)}" (SPEC 3.4/7.3)`);
  if (!cx.egg) {
    if (FOUR_KO.test(t.ko) || FOUR_EN.test(t.en)) rep.warn('guard', w, `"four men" (Mark 2:3 detail) outside a labeled Easter egg: "${snip(t.ko)}" (SPEC 6.1/7.5)`);
    if (MK27_KO.test(t.ko) || MK27_EN.test(t.en)) rep.warn('guard', w, `Mark 2:7 wording ("who can forgive sins but God alone") outside an Easter egg (SPEC 7.5)`);
    const bg = cx.bgNow ? cx.bgNow() : null;
    if ((bg === 'crowd' || bg === 'crowd_lying') && (ROOF_KO.test(t.ko) || ROOF_EN.test(t.en))) {
      const lang = ROOF_KO.test(t.ko) ? 'ko' : 'en';
      rep.warn('guard', w, `roof mentioned in the crowd scene outside an Easter egg (no house/roof in Matthew, SPEC 6.2/7.5), ${lang}: "${snip(t[lang], 60)}"`);
    }
  }
  if (TALMUD.test(t.ko) || TALMUD.test(t.en)) rep.warn('guard', w, 'mentions the Talmud/Nedarim in story text (SPEC 7.9)');
  for (const lang of ['ko', 'en']) {
    const s = stripTokens(t[lang]);
    if (JESUS_REF.test(s) && GESTURE.test(s) && !OTHER_PEOPLE.test(s)) {
      rep.warn('guard', w, `possible invented gesture/emotion for Jesus (${lang}): "${snip(t[lang], 50)}" (SPEC 6.1/7.1)`);
    }
  }
  for (const lang of ['ko', 'en']) {
    const hit = findTypedScripture(t[lang], lang, cx.scrIndex);
    if (!hit) continue;
    // Inside quotation marks it reads as a quotation (must be a token); otherwise it may be a paraphrase.
    const quoted = /[\u201c"\u300c\u300e]|\u2018[^\u2019]*\u2019/.test(stripTokens(t[lang]));
    if (quoted) rep.warn('quote', w, `quotes scripture wording from ${hit.key} inside quotation marks (${lang}: "${hit.gram}"); use {{v:KEY}} (SPEC 3.2)`);
    else rep.info('quote', w, `shares scripture wording with ${hit.key} (${lang}: "${hit.gram}"); fine as an unquoted paraphrase, otherwise use {{v:KEY}} (SPEC 3.2)`);
  }
  if (cx.rid === 'asher' && /\bMother\b/.test(t.en)) rep.warn('voice', w, `Asher route uses "Mother" (SPEC 3.4: Asher says "Mom"): "${snip(t.en)}"`);
  // No numbers on screen (SPEC 4.5): our own strings carry no ASCII digits (tokens are stripped first).
  for (const lang of ['ko', 'en']) {
    if (DIGITS.test(stripTokens(t[lang]))) rep.error('digits', w, `ASCII digits in story text (${lang}; SPEC 4.5: no numbers on screen): "${snip(t[lang], 50)}"`);
  }
  if (/\{\{var:/.test(t.ko + t.en)) rep.warn('digits', w, '{{var:}} shows a number on screen (SPEC 4.5: no numbers)');
  // How the protagonist's voice names Jesus (SPEC 6.1).
  const sp = o.speaker || 'narrator';
  const ko = stripTokens(t.ko);
  if (cx.rid === 'scribe' && (((sp === 'thought' || sp === 'menahem') && HONOR_KO.test(ko)) || ((sp === 'narrator' || sp === 'sign') && /그분/.test(ko)))) {
    rep.warn('voice', w, `scribe POV names Jesus with an honorific (SPEC 6.1: 예수라는 사람, 그 사람, 그): "${snip(t.ko)}"`);
  }
  if ((cx.rid === 'friend' || cx.rid === 'asher') && ['narrator', 'thought', 'sign', 'yonah', 'asher'].includes(sp) && PLAIN_KO.test(ko)) {
    rep.warn('voice', w, `${cx.rid} POV says 예수라는 사람 (SPEC 6.1: 그분 with honorific verbs): "${snip(t.ko)}"`);
  }
}

// ---------------------------------------------------------------------------------------------
// Beat checks

function checkBeats(list, cx, label) {
  if (list === undefined) return;
  if (!Array.isArray(list)) { cx.rep.error('schema', `${cx.path} › ${label}`, `${label} must be an array of beats`); return; }
  list.forEach((b, i) => checkBeat(b, cx, `${label}[${i}]`));
}

function beatWhere(cx, label, b) {
  let w = `${cx.path} › ${label}`;
  if (isObj(b)) {
    w += `:${b.type || '?'}`;
    if (b.type === 'choice' && b.id) w += `(${b.id})`;
    else if (b.id) w += `#${b.id}`;
  }
  if (cx.phase === 'main' && !cx.inReaction && cx.lastChoice) w += ` (after ${cx.lastChoice})`;
  return w + locate(cx, b);
}

function locate(cx, b) {
  // Best-effort file:line for a beat, searching forward from the last located position.
  const f = cx.files && cx.files[cx.file];
  if (!f || !isObj(b)) return '';
  let needle = null;
  const fromT = (t) => {
    if (!isT(t)) return null;
    for (const s of [t.ko, t.en]) {
      const cut = s.split(/["'\\\n{]/)[0].slice(0, 18);
      if (cpLen(cut) >= 5) return cut;
    }
    return null;
  };
  const q = (k, v) => new RegExp(k + '\\s*:\\s*["\']' + v + '["\']|\\(\\s*["\']' + v + '["\']');
  const needles = [];
  if (b.type === 'choice' && b.id) needles.push(q('id', b.id));
  needles.push(fromT(b.text), fromT(b.prompt), fromT(b.label), fromT(b.caption));
  if (b.key) needles.push(q('key', b.key));
  if (b.fx) needles.push(q('fx', b.fx));
  if (b.bg) needles.push(q('bg', b.bg));
  const src = f.src;
  const start = cx.cursor ? cx.cursor.pos : 0;
  let idx = -1;
  for (const needle of needles.filter(Boolean)) {
    if (typeof needle === 'string') {
      idx = src.indexOf(needle, start);
      if (idx < 0) idx = src.indexOf(needle);
    } else {
      const re = new RegExp(needle.source, 'g');
      re.lastIndex = start;
      let m = re.exec(src);
      if (!m) { re.lastIndex = 0; m = re.exec(src); }
      idx = m ? m.index : -1;
    }
    if (idx >= 0) break;
  }
  if (idx < 0) return '';
  if (cx.cursor) cx.cursor.pos = idx + 1;
  return ` [${cx.file}:${lineAt(src, idx)}]`;
}

function checkBeat(b, cx, label) {
  const rep = cx.rep;
  const w = beatWhere(cx, label, b);
  if (!isObj(b)) { rep.error('schema', w, 'beat must be an object'); return; }
  if (!BEAT_TYPES.includes(b.type)) { rep.error('schema', w, `unknown beat type ${JSON.stringify(b.type)}`); return; }
  if (b.when !== undefined) checkCond(b.when, cx, `${w} › when`);
  const allowed = b.type === 'fx' ? BEAT_KEYS.fx.concat(FX_PARAMS[b.fx] || []) : BEAT_KEYS[b.type];
  const unknown = Object.keys(b).filter((k) => !allowed.includes(k));
  if (unknown.length) rep.warn('schema', w, `unknown key(s) on ${b.type} beat: ${unknown.join(', ')}`);
  if (b.id !== undefined && b.type !== 'choice') {
    if (typeof b.id !== 'string' || !b.id) rep.error('schema', w, 'beat id must be a non-empty string');
    else if (cx.ids.has(b.id)) rep.warn('schema', w, `duplicate beat id "${b.id}"`);
    else cx.ids.add(b.id);
  }
  switch (b.type) {
    case 'scene': {
      if (!cx.canon.bgIds.includes(b.bg)) rep.error('schema', w, `unknown bg ${JSON.stringify(b.bg)} (SPEC 6.6: ${cx.canon.bgIds.join(', ')})`);
      else if (cx.setBg) cx.setBg(b.bg);
      if (cx.rid && cx.phase === 'main' && !cx.inReaction && (b.time === 'evening' || b.time === 'night' || ['lamp_night', 'road_home', 'doorway_evening'].includes(b.bg))) {
        rep.info('scene', w, `evening/epilogue setting (${b.bg}${b.time ? ', ' + b.time : ''}); SPEC 6.2: the story runs from dawn to the crowd`);
      }
      if (b.caption !== undefined) checkT(b.caption, cx, `${w} › caption`, { story: cx.story });
      if (b.pov !== undefined && !POV_VALUES.includes(b.pov)) rep.error('schema', w, `pov must be one of ${POV_VALUES.join('|')}`);
      if (b.time !== undefined && !TIME_VALUES.includes(b.time)) rep.error('schema', w, `time must be one of ${TIME_VALUES.join('|')} (SPEC 4.5), got ${JSON.stringify(b.time)}`);
      break;
    }
    case 'line': {
      const sp = b.speaker === undefined ? 'narrator' : b.speaker;
      if (sp === 'jesus') rep.error('guard', w, 'line beat with speaker "jesus" (Jesus speaks only through verse beats or tokens, SPEC 4.5/7.1)');
      else if (!PSEUDO_SPEAKERS.includes(sp) && !(isObj(cx.data.characters) && cx.data.characters[sp])) {
        rep.error('schema', w, `unknown speaker ${JSON.stringify(sp)}`);
      }
      checkT(b.text, cx, `${w} › text`, { kind: 'line', story: cx.story, speaker: sp });
      break;
    }
    case 'verse': {
      const scr = cx.data.scripture;
      const e = isObj(scr) ? scr[b.key] : null;
      if (typeof b.key !== 'string') rep.error('schema', w, 'verse beat needs a key');
      else if (!isObj(scr)) {
        if (!cx.spec.keys.has(b.key)) rep.error('token', w, `unknown scripture key ${b.key} (not in SPEC 4.3)`);
        else if (cx.spec.keys.get(b.key).refOnly) rep.error('token', w, `verse beat uses reference-only key ${b.key}`);
      } else if (!e) rep.error('token', w, `unknown scripture key ${b.key}`);
      else if (e.refOnly) rep.error('token', w, `verse beat uses reference-only key ${b.key}`);
      if (b.speaker !== undefined && !VERSE_SPEAKERS.includes(b.speaker)) rep.error('schema', w, `verse speaker must be one of ${VERSE_SPEAKERS.join('|')}`);
      const keySpeaker = e ? e.speaker : cx.spec.keys.get(b.key) ? cx.spec.keys.get(b.key).speaker : null;
      if (b.speaker === 'jesus' && keySpeaker !== 'jesus') rep.warn('guard', w, `verse beat attributes ${b.key} to Jesus, but its scripture speaker is ${keySpeaker || 'unset'}`);
      if (b.speaker && b.speaker !== 'jesus' && keySpeaker === 'jesus') rep.warn('guard', w, `verse beat attributes Jesus' words (${b.key}) to "${b.speaker}"`);
      if (cx.usage && b.key) cx.usage.add(b.key);
      break;
    }
    case 'choice': {
      if (cx.phase !== 'main' || cx.inReaction) rep.error('schema', w, 'choice beats are only allowed in the route\'s main beats');
      else checkChoice(b, cx, w);
      break;
    }
    case 'fx':
      checkFx(b, cx, w);
      break;
    case 'press': {
      if (b.action === undefined && b.label === undefined) rep.error('schema', w, 'press beat needs "action" or "label"');
      if (b.action !== undefined && !cx.actions.has(b.action)) rep.error('schema', w, `press action "${b.action}" is not a route action (${[...cx.actions].join(', ') || 'none'})`);
      if (b.label !== undefined) checkT(b.label, cx, `${w} › label`, { story: cx.story });
      if (b.hint !== undefined) checkT(b.hint, cx, `${w} › hint`, { story: cx.story });
      if (b.action && b.label) rep.info('schema', w, 'press beat has both action and label');
      break;
    }
    default:
      break;
  }
}

function checkFx(b, cx, w) {
  const rep = cx.rep;
  const name = b.fx;
  if (!Object.prototype.hasOwnProperty.call(FX_PARAMS, name)) { rep.error('fx', w, `unknown fx ${JSON.stringify(name)} (SPEC 4.5 FX list)`); return; }
  if (FX_HOME[name] && cx.rid && FX_HOME[name] !== cx.rid) rep.info('fx', w, `fx "${name}" was designed for the ${FX_HOME[name]} route`);
  const scr = cx.data.scripture;
  switch (name) {
    case 'light':
      if (!LIGHT_LEVELS.includes(b.level)) rep.error('fx', w, `light level must be one of ${LIGHT_LEVELS.join('|')}, got ${JSON.stringify(b.level)}`);
      break;
    case 'echoVerse': {
      const e = isObj(scr) ? scr[b.key] : null;
      if (typeof b.key !== 'string') { rep.error('fx', w, 'echoVerse needs a key'); break; }
      if (isObj(scr) && !e) { rep.error('fx', w, `echoVerse: unknown scripture key ${b.key}`); break; }
      if (e && e.refOnly) rep.error('fx', w, `echoVerse uses reference-only key ${b.key}`);
      if (cx.usage) cx.usage.add(b.key);
      if (b.highlight !== undefined) {
        const h = b.highlight;
        if (!isObj(h) || typeof h.flag !== 'string' || !isObj(h.map)) { rep.error('fx', w, 'echoVerse highlight must be {flag, map}'); break; }
        const extra = Object.keys(h).filter((k) => k !== 'flag' && k !== 'map');
        if (extra.length) rep.warn('fx', w, `unknown key(s) in highlight: ${extra.join(', ')}`);
        checkCond({ flag: h.flag, in: [...(cx.flags.get(h.flag) || cx.allFlags.get(h.flag) || new Set(['?']))] }, cx, `${w} › highlight.flag`);
        const setVals = cx.flags.get(h.flag) || new Set();
        for (const v of setVals) {
          if (!Object.prototype.hasOwnProperty.call(h.map, String(v))) rep.info('fx', w, `highlight.map has no entry for ${h.flag}=${JSON.stringify(v)} (nothing will be highlighted)`);
        }
        for (const [val, spec] of Object.entries(h.map)) {
          if (spec === null || spec === '*') continue;
          if (!isObj(spec) || !Array.isArray(spec.ko) || !Array.isArray(spec.en)) {
            rep.error('fx', w, `highlight.map["${val}"] must be {ko:[...], en:[...]}, "*" or null`);
            continue;
          }
          if (!setVals.has(val) && !setVals.has(val === 'true' ? true : val === 'false' ? false : Number(val))) {
            rep.info('fx', w, `highlight.map has an entry "${val}" that ${h.flag} is never set to`);
          }
          for (const lang of ['ko', 'en']) {
            for (const sub of spec[lang]) {
              if (typeof sub !== 'string' || !sub) rep.error('fx', w, `highlight.map["${val}"].${lang} must contain non-empty strings`);
              else if (e && typeof e[lang] === 'string' && !e[lang].includes(sub)) {
                rep.error('fx', w, `highlight "${sub}" is not a substring of ${b.key} (${lang})`);
              }
            }
          }
        }
      }
      break;
    }
    case 'pinThought': {
      if (!Array.isArray(b.items) || !b.items.length) { rep.error('fx', w, 'pinThought needs a non-empty items array'); break; }
      for (const it of b.items) {
        const m = typeof it === 'string' ? it.match(/^(verse|choice):(.+)$/) : null;
        if (!m) { rep.error('fx', w, `pinThought item ${JSON.stringify(it)} must be "verse:KEY" or "choice:cN"`); continue; }
        if (m[1] === 'verse') {
          const e = isObj(scr) ? scr[m[2]] : null;
          if (isObj(scr) && !e) rep.error('fx', w, `pinThought: unknown scripture key ${m[2]}`);
          else if (e && e.refOnly) rep.error('fx', w, `pinThought uses reference-only key ${m[2]}`);
          if (cx.usage) cx.usage.add(m[2]);
        } else if (!(cx.choiceIds || new Set()).has(m[2])) rep.error('fx', w, `pinThought: unknown choice ${m[2]}`);
        else if (!cx.seen.has(m[2])) rep.error('fx', w, `pinThought references ${m[2]}, which does not appear earlier`);
      }
      break;
    }
    case 'pov':
      if (!POV_VALUES.includes(b.pov)) rep.error('fx', w, `pov must be one of ${POV_VALUES.join('|')}`);
      break;
    case 'actionReply':
      if (!cx.actions.has(b.action)) rep.error('fx', w, `actionReply action "${b.action}" is not a route action (${[...cx.actions].join(', ') || 'none'})`);
      checkT(b.text, cx, `${w} › text`, { kind: 'line', story: cx.story });
      break;
    default:
      break;
  }
}

function checkChoice(b, cx, w) {
  const rep = cx.rep;
  if (typeof b.id !== 'string' || !/^c[1-9][0-9]*$/.test(b.id)) rep.error('schema', w, `choice id must be c1, c2, ... in order, got ${JSON.stringify(b.id)}`);
  if (b.when !== undefined) rep.warn('schema', w, 'choice beat has a "when" condition; every choice should be asked on every true path');
  checkT(b.prompt, cx, `${w} › prompt`, { kind: 'prompt', story: cx.story });
  if (!Array.isArray(b.options)) { rep.error('schema', w, 'options must be an array of 2-4 options'); return; }
  const n = b.options.length;
  if (n < SHAPE.options[0] || n > SHAPE.options[1]) rep.error('schema', w, `a choice has ${SHAPE.options[0]}-${SHAPE.options[1]} options (SPEC 4.5), found ${n}`);
  const newFlags = new Map();
  let nContinue = 0;
  b.options.forEach((o, i) => {
    const ow = `${w} › ${b.id}/${isObj(o) && o.id ? o.id : '#' + i}`;
    if (!isObj(o)) { rep.error('schema', ow, 'option must be an object'); return; }
    if (o.id !== OPTION_IDS[i]) rep.error('schema', ow, `option ids must be a, b, c, d in order; position ${i + 1} has ${JSON.stringify(o.id)}`);
    const unknown = Object.keys(o).filter((k) => !OPTION_KEYS.includes(k));
    if ('cut' in o) rep.error('outcome', ow, '"cut" is the cut option of the earlier releases; in version 4 use bad: "<id>" with endings.bad[<id>] (SPEC 4.5)');
    if ('lens' in o) rep.warn('obsolete', ow, '"lens" is ignored in version 4 (no lenses); remove it');
    const rest = unknown.filter((k) => k !== 'cut' && k !== 'lens');
    if (rest.length) rep.warn('schema', ow, `unknown key(s) on option: ${rest.join(', ')}`);
    const hasBad = 'bad' in o;
    const hasScold = 'scold' in o;
    if (hasBad && hasScold) rep.error('outcome', ow, 'an option has exactly one outcome: "bad" or "scold" (or neither, to continue), not both');
    if (hasBad) {
      if (typeof o.bad !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(o.bad)) rep.error('outcome', ow, `bad must be a short ascii id such as "typo" or "bigCatch", got ${JSON.stringify(o.bad)}`);
      else cx.badRefs.push({ choice: b.id, option: o.id, bad: o.bad, w: ow });
    }
    if (hasScold) {
      const sc = o.scold;
      if (!isObj(sc)) rep.error('outcome', ow, 'scold must be { speaker?, text }');
      else {
        const ex = Object.keys(sc).filter((k) => k !== 'speaker' && k !== 'text');
        if (ex.length) rep.warn('schema', ow, `unknown key(s) in scold: ${ex.join(', ')}`);
        const sp = sc.speaker === undefined ? 'narrator' : sc.speaker;
        if (sp === 'jesus') rep.error('guard', ow, 'a scold spoken by Jesus (Jesus speaks only through verse beats, SPEC 7.1)');
        else if (sp === 'sign') rep.warn('outcome', ow, 'a scold shown as a centered sign; use a speaker, "thought" or narration');
        else if (!PSEUDO_SPEAKERS.includes(sp) && !(isObj(cx.data.characters) && cx.data.characters[sp])) rep.error('schema', ow, `unknown scold speaker ${JSON.stringify(sp)}`);
        if (sc.text === undefined) rep.error('outcome', ow, 'scold needs a text');
        else checkT(sc.text, cx, `${ow} › scold`, { kind: 'line', story: cx.story, speaker: sp });
        // Only scolds by another character count toward SPEC 8's 2-3; a character's own "can't"
        // thought (Asher's get up / go outside options, a teacher request) is not a scold by someone.
        if (sp !== 'thought') cx.scolds.push({ choice: b.id, option: o.id, w: ow });
      }
    }
    if (!hasBad && !hasScold) nContinue++;
    const egg = MARK_LABEL.test(JSON.stringify([o.text, o.reaction || []]));
    const ocx = Object.assign({}, cx, { egg });
    checkT(o.text, ocx, `${ow} › text`, { kind: 'option', story: cx.story });
    if (isT(o.text)) {
      const long = ['ko', 'en'].filter((l) => cpLen(renderText(o.text[l], l, cx.data.scripture)) > OPTION_AIM[l]);
      if (long.length) cx.longOptions.push(`${b.id}/${o.id}`);
    }
    const optFlags = new Map([...cx.flags].map(([k, v]) => [k, new Set(v)]));
    if (o.set !== undefined) {
      if (!isObj(o.set) || !Object.keys(o.set).length) rep.error('schema', ow, '"set" must be a non-empty object {flag: value}');
      else {
        for (const [f, v] of Object.entries(o.set)) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(f)) rep.warn('schema', ow, `flag name "${f}" is not a plain identifier`);
          if (!isPrimitive(v)) rep.error('schema', ow, `set.${f} must be a string, number or boolean, got ${JSON.stringify(v)}`);
          if (!optFlags.has(f)) optFlags.set(f, new Set());
          optFlags.get(f).add(v);
          if (!newFlags.has(f)) newFlags.set(f, new Set());
          newFlags.get(f).add(v);
        }
      }
    }
    if (o.reaction !== undefined) {
      if (!Array.isArray(o.reaction)) rep.error('schema', ow, 'reaction must be an array of beats');
      else {
        const seen = new Set(cx.seen);
        seen.add(b.id);
        const rcx = Object.assign({}, cx, { seen, flags: optFlags, inReaction: true, egg, path: `${ow} › reaction` });
        o.reaction.forEach((rb, ri) => checkBeat(rb, rcx, `[${ri}]`));
        const plain = o.reaction.filter((rb) => isObj(rb) && (rb.type === 'line' || rb.type === 'verse' || rb.type === 'press') && rb.when === undefined).length;
        if (plain > 1) rep.warn('schema', ow, `reaction has ${plain} unconditional beats (SPEC 4.5: 0-1 beat; two only when a "when" variant needs it)`);
      }
    }
  });
  if (!nContinue) rep.error('outcome', w, `${b.id} has no continue option: after its scolds only cut branches remain (a dead end, SPEC 4.5)`);
  // After the choice: it becomes "earlier" for later beats, and its flags become available.
  cx.seen.add(b.id);
  for (const [f, vals] of newFlags) {
    if (!cx.flags.has(f)) cx.flags.set(f, new Set());
    for (const v of vals) cx.flags.get(f).add(v);
  }
  cx.lastChoice = b.id;
  cx.choiceList.push(b);
}

// ---------------------------------------------------------------------------------------------
// Path simulation (SPEC 4.5); used for screens, crowd order, passerby coverage and the engine check.
// plan = { picks: { cN: optionId }, scoldFirst?: true }. A choice is presented, the plan picks (see
// nextPick); a scold plays its reaction and its line and the choice is presented again without it; a
// cut option plays its reaction, then the route's remaining beats are skipped and the cut branch runs:
// endings.bad[id].beats -> last -> snip card (light off). Otherwise the true ending runs:
// endingPreface -> title card -> memory verse -> endings.good.beats -> last -> endingCoda.

export function simulate(route, data, plan = {}) {
  const st = { choices: {}, flags: {}, vars: {} };
  const out = [];
  const presentations = {};
  const removed = {};
  let bg = null;
  let light = 'off';
  let cutAt = null;
  const runList = (list, phase) => {
    if (!Array.isArray(list)) return;
    for (const b of list) {
      if (cutAt && /^main/.test(phase)) return;
      if (!isObj(b)) continue;
      if (b.when !== undefined && !evalCond(b.when, st)) continue;
      if (b.type === 'scene') bg = b.bg;
      if (b.type === 'fx' && b.fx === 'light') light = b.level;
      if (b.type === 'choice') runChoice(b, phase);
      else out.push({ kind: b.type, beat: b, phase, bg, light });
    }
  };
  const runChoice = (b, phase) => {
    const opts = optionsOf(b);
    const rm = removed[b.id] || (removed[b.id] = []);
    for (let guard = 0; guard < 8; guard++) {
      const shown = opts.filter((o) => !rm.includes(o.id)).map((o) => o.id);
      if (!shown.length) return;
      (presentations[b.id] = presentations[b.id] || []).push(shown);
      delete st.choices[b.id];
      out.push({ kind: 'choice', beat: b, shown, phase, bg, light });
      const id = nextPick(b, shown, plan);
      const o = opts.find((x) => x.id === id);
      const kind = optionOutcome(o);
      // Only the pick that moves the story on is the choice's answer; a scolded pick is never recorded.
      if (kind !== 'scold') st.choices[b.id] = o.id;
      if (isObj(o.set)) Object.assign(st.flags, o.set);
      runList(o.reaction, phase + '/reaction');
      if (kind === 'scold') {
        rm.push(o.id);
        out.push({ kind: 'line', beat: scoldLine(b, o), phase: phase + '/scold', bg, light });
        continue;
      }
      if (kind === 'bad') cutAt = { choice: b.id, option: o.id, bad: o.bad };
      return;
    }
  };
  runList(route && route.beats, 'main');
  if (cutAt) {
    light = 'off';
    const e = badEnding(route, cutAt.bad);
    if (e) {
      runList(e.beats, 'ending');
      if (isT(e.last)) out.push({ kind: 'line', beat: { type: 'line', text: e.last }, phase: 'last', bg, light });
    }
    out.push({ kind: 'snip', bad: cutAt.bad, phase: 'snip', bg, light });
    return { out, state: st, cut: cutAt, presentations, removed };
  }
  const good = goodEnding(route);
  if (good) {
    runList(route.endingPreface, 'preface');
    out.push({ kind: 'card', phase: 'card', bg, light });
    const e = good.verse && data && isObj(data.scripture) ? data.scripture[good.verse] : null;
    if (isObj(e) && !e.refOnly && typeof e.ko === 'string' && e.ko) out.push({ kind: 'memory', key: good.verse, beat: { type: 'verse', key: good.verse }, phase: 'memory', bg, light });
    runList(good.beats, 'ending');
    if (isT(good.last)) out.push({ kind: 'line', beat: { type: 'line', text: good.last }, phase: 'last', bg, light });
    runList(route.endingCoda, 'coda');
  }
  return { out, state: st, cut: null, presentations, removed };
}

function textsOfItem(it, lang, data) {
  // Rendered strings shown for one simulated item (for reading time and token scans).
  const scr = data.scripture;
  const b = it.beat || {};
  const r = (t) => (isT(t) ? renderText(t[lang], lang, scr) : '');
  switch (it.kind) {
    case 'line': return [r(b.text)];
    case 'verse':
    case 'memory': {
      const e = isObj(scr) ? scr[b.key] : null;
      const shown = it.kind === 'memory' ? memoryDisplayText(e, lang) : verseDisplayText(e ? e[lang] || '' : '', lang);
      return e ? [shown, e.ref ? e.ref[lang] || '' : ''] : [];
    }
    case 'choice': return [r(b.prompt)].concat(optionsOf(b).filter((o) => !it.shown || it.shown.includes(o.id)).map((o) => r(o.text)));
    case 'press': return [r(b.label), r(b.hint)];
    case 'scene': return [r(b.caption)];
    case 'fx': {
      if (b.fx === 'echoVerse' && isObj(scr) && scr[b.key]) return [verseDisplayText(scr[b.key][lang] || '', lang)];
      return [];
    }
    default: return [];
  }
}

function keysShown(it) {
  // Scripture keys displayed by an item (verse beats, {{v:}} tokens, echoVerse, pinned verses).
  const keys = [];
  const b = it.beat || {};
  const tok = (t) => {
    if (!isT(t)) return;
    for (const m of (t.ko + ' ' + t.en).matchAll(TOKEN_RE)) if (m[1] === 'v') keys.push(m[2]);
  };
  if (it.kind === 'verse') keys.push(b.key);
  if (it.kind === 'line') tok(b.text);
  if (it.kind === 'choice') { tok(b.prompt); optionsOf(b).filter((o) => !it.shown || it.shown.includes(o.id)).forEach((o) => tok(o.text)); }
  if (it.kind === 'fx' && b.fx === 'echoVerse') keys.push(b.key);
  if (it.kind === 'fx' && b.fx === 'pinThought' && Array.isArray(b.items)) {
    b.items.forEach((x) => { const m = String(x).match(/^verse:(.+)$/); if (m) keys.push(m[1]); });
  }
  return [...new Set(keys)];
}

const SCREEN_KINDS = new Set(['line', 'verse', 'choice', 'press', 'memory']);

function readingStats(items, data) {
  let screens = 0;
  let choices = 0;
  let koChars = 0;
  let enWords = 0;
  for (const it of items) {
    if (SCREEN_KINDS.has(it.kind)) screens++;
    if (it.kind === 'choice') choices++;
    for (const s of textsOfItem(it, 'ko', data)) koChars += cpLen(s.replace(/\s+/g, ''));
    for (const s of textsOfItem(it, 'en', data)) enWords += s.split(/\s+/).filter((x) => /[A-Za-z0-9]/.test(x)).length;
  }
  return { screens, choices, koChars, enWords };
}

// Reading time. Silent: ko 450 chars/min, en 200 words/min, +4 s per choice. Read aloud on a TV with
// the class (about 5 minutes per route on the true path): ko 260 chars/min, en 150 words/min, +10 s per
// choice (the class decides) and +1 s per screen (the tap and the scene change).
function minutes(st) {
  return {
    ko: (st.koChars / 450 * 60 + st.choices * 4) / 60,
    en: (st.enWords / 200 * 60 + st.choices * 4) / 60,
    koAloud: (st.koChars / 260 * 60 + st.choices * 10 + st.screens) / 60,
    enAloud: (st.enWords / 150 * 60 + st.choices * 10 + st.screens) / 60
  };
}

// ---------------------------------------------------------------------------------------------
// Global data checks

function makeCx(rep, data, spec, canon, files, extra) {
  return Object.assign({
    rep, data, spec, canon, files,
    rid: null, file: null, path: '', story: false, phase: 'global', inReaction: false, egg: false,
    seen: new Set(), flags: new Map(), allFlags: new Map(), counters: new Set(), actions: new Set(), choiceIds: new Set(),
    ids: new Set(), choiceList: [], lastChoice: null, allTexts: [], usage: null, cursor: { pos: 0 },
    badRefs: [], scolds: [], longOptions: [],
    forbiddenRes: canon.forbidden.map((n) => (/^[A-Za-z]+$/.test(n) ? new RegExp('\\b' + n + '\\b') : new RegExp(n))),
    scrIndex: buildScriptureIndex(data.scripture)
  }, extra || {});
}

function checkScripture(rep, data, spec, root) {
  const scr = data.scripture;
  if (!isObj(scr)) return;
  const W = (k) => `scripture › ${k}`;
  for (const [key, e] of Object.entries(scr)) {
    if (!isObj(e)) { rep.error('scripture', W(key), 'entry must be an object'); continue; }
    const extra = Object.keys(e).filter((k) => !['ref', 'ko', 'en', 'speaker', 'refOnly', 'full'].includes(k));
    if (extra.length) rep.warn('scripture', W(key), `unknown key(s): ${extra.join(', ')}`);
    if (!isT(e.ref) || !e.ref.ko.trim() || !e.ref.en.trim()) rep.error('scripture', W(key), 'ref must be {ko, en} with non-empty strings');
    else {
      if (/\d-\d/.test(e.ref.ko + e.ref.en)) rep.warn('scripture', W(key), `ref range uses a hyphen; use an en dash (SPEC 4.3): ${e.ref.ko} / ${e.ref.en}`);
      const exp = expectedRef(key, spec);
      if (exp && (exp.ko !== e.ref.ko || exp.en !== e.ref.en)) rep.warn('scripture', W(key), `ref is "${e.ref.ko}" / "${e.ref.en}", expected "${exp.ko}" / "${exp.en}"`);
    }
    if (e.refOnly) {
      if (e.refOnly !== true) rep.warn('scripture', W(key), 'refOnly should be the boolean true');
      if (e.ko || e.en) rep.warn('scripture', W(key), 'reference-only key has non-empty text');
    } else {
      for (const lang of ['ko', 'en']) {
        if (typeof e[lang] !== 'string' || !e[lang].trim()) rep.error('scripture', W(key), `missing ${lang} text`);
        else {
          if (/\s{2,}/.test(e[lang]) || e[lang] !== e[lang].trim()) rep.warn('scripture', W(key), `${lang} text has doubled or edge whitespace`);
        }
      }
      if (typeof e.ko === 'string' && e.ko && !HANGUL_TEST.test(e.ko)) rep.error('scripture', W(key), 'ko text has no Hangul');
      if (typeof e.en === 'string' && HANGUL_TEST.test(e.en)) rep.error('scripture', W(key), 'en text contains Hangul');
      if (e.speaker === undefined) rep.warn('scripture', W(key), 'speaker not set (jesus|scribes|narrator)');
      else if (!VERSE_SPEAKERS.includes(e.speaker)) rep.error('scripture', W(key), `speaker must be jesus|scribes|narrator, got ${JSON.stringify(e.speaker)}`);
      if ((e.speaker === 'jesus' || e.speaker === 'scribes') && typeof e.en === 'string') {
        if (/^["“‘']/.test(e.en) || /["”’']$/.test(e.en)) rep.warn('scripture', W(key), 'speech key en text starts/ends with a quotation mark (the engine adds quotes)');
      }
      if (e.full !== undefined) {
        if (!isObj(e.full) || typeof e.full.ko !== 'string' || typeof e.full.en !== 'string' || !e.full.ko.trim() || !e.full.en.trim()) {
          rep.error('scripture', W(key), 'full must be {ko: string, en: string} with non-empty text (SPEC 4.3)');
        } else {
          const fx = Object.keys(e.full).filter((k) => k !== 'ko' && k !== 'en');
          if (fx.length) rep.warn('scripture', W(key), `unknown key(s) in full: ${fx.join(', ')}`);
          if (!HANGUL_TEST.test(e.full.ko)) rep.error('scripture', W(key), 'full.ko has no Hangul');
          if (HANGUL_TEST.test(e.full.en)) rep.error('scripture', W(key), 'full.en contains Hangul');
          if (typeof e.ko === 'string' && !e.full.ko.includes(e.ko)) rep.error('scripture', W(key), 'ko text is not an exact substring of full.ko');
          if (typeof e.en === 'string' && !e.full.en.includes(e.en)) rep.error('scripture', W(key), 'en text is not an exact substring of full.en');
        }
      } else if (/_\d+[A-Z][A-Z0-9]*$/.test(key)) {
        rep.info('scripture', W(key), 'partial-looking key without a "full" verse; substring cannot be verified');
      }
    }
    const sk = spec.keys.get(key);
    if (spec.ok && !sk) rep.warn('scripture', W(key), 'key is not listed in SPEC 4.3 (writers may only use listed keys)');
    else if (sk && sk.speaker && e.speaker && sk.speaker !== e.speaker) rep.warn('scripture', W(key), `speaker "${e.speaker}" differs from SPEC 4.3 ("${sk.speaker}")`);
    else if (sk && sk.refOnly && !e.refOnly) rep.warn('scripture', W(key), 'SPEC lists this key as reference-only');
  }
  for (const [key, sk] of spec.keys) {
    if (!scr[key]) {
      if (/^MT_9_/.test(key)) rep.error('scripture', W(key), 'required Matthew 9 key is missing');
      else rep.warn('scripture', W(key), `SPEC 4.3 key is missing${sk.refOnly ? ' (reference-only)' : ''}`);
    }
  }
  for (const key of Object.keys(EVENT_GROUP)) if (!scr[key]) rep.error('scripture', W(key), 'required Matthew 9 key is missing');
  // Cross-consistency of partial keys of the same verse.
  const fullsByRef = new Map();
  for (const [key, e] of Object.entries(scr)) {
    if (!isObj(e) || !isObj(e.full) || !isT(e.ref)) continue;
    const r = e.ref.en;
    if (!fullsByRef.has(r)) fullsByRef.set(r, []);
    fullsByRef.get(r).push({ key, full: e.full });
  }
  for (const [r, list] of fullsByRef) {
    const a = list[0];
    for (const b of list.slice(1)) {
      if (a.full.ko !== b.full.ko || a.full.en !== b.full.en) rep.warn('scripture', W(b.key), `"full" text differs from ${a.key} for the same verse (${r})`);
    }
    for (const [key, e] of Object.entries(scr)) {
      if (isObj(e) && !e.full && !e.refOnly && isT(e.ref) && e.ref.en === r && typeof e.ko === 'string' && e.ko.length > 10) {
        if (e.ko !== a.full.ko || e.en !== a.full.en) rep.warn('scripture', W(key), `whole-verse text differs from the "full" text of ${a.key}`);
      }
    }
  }
  const b1 = scr.MT_9_2B1;
  const b2 = scr.MT_9_2B2;
  const bb = scr.MT_9_2B;
  if (isObj(b1) && isObj(b2) && isObj(bb)) {
    if (bb.ko !== b1.ko + ' ' + b2.ko) rep.warn('scripture', W('MT_9_2B'), 'ko is not MT_9_2B1 + " " + MT_9_2B2');
    if (bb.en !== b1.en + ' ' + b2.en) rep.warn('scripture', W('MT_9_2B'), 'en is not MT_9_2B1 + " " + MT_9_2B2');
  }
  // Verification status.
  try {
    const src = fs.readFileSync(path.join(root, 'data', 'scripture.js'), 'utf8');
    if (/NOT YET VERIFIED|STATUS:\s*DRAFT/i.test(src)) rep.warn('scripture', 'data/scripture.js', 'header still marks the texts as DRAFT / NOT YET VERIFIED');
  } catch (e) { /* fixture mode */ }
  try {
    const doc = fs.readFileSync(path.join(root, 'docs', 'scripture-sources.md'), 'utf8');
    const status = {};
    const lines = doc.split('\n');
    for (const key of Object.keys(scr)) {
      if (scr[key] && scr[key].refOnly) continue;
      const re = new RegExp('\\b' + key + '\\b');
      let st = null;
      for (let i = 0; i < lines.length && !st; i++) {
        if (!re.test(lines[i])) continue;
        for (let j = i; j < Math.min(lines.length, i + 8); j++) {
          const m = lines[j].match(/\b(SINGLE-SOURCE|UNVERIFIED|VERIFIED)\b/);
          if (m) { st = m[1]; break; }
          if (j > i && /^#{1,4}\s/.test(lines[j])) break;
        }
      }
      status[key] = st || 'no entry';
    }
    const tally = {};
    Object.values(status).forEach((s) => { tally[s] = (tally[s] || 0) + 1; });
    rep.info('scripture', 'docs/scripture-sources.md', 'verification status: ' + Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(', '));
    const mt9 = Object.keys(status).filter((k) => /^MT_9_/.test(k) && status[k] !== 'VERIFIED');
    if (mt9.length) rep.warn('scripture', 'docs/scripture-sources.md', `Matthew 9 keys not marked VERIFIED: ${mt9.join(', ')}`);
    const other = Object.keys(status).filter((k) => !/^MT_9_/.test(k) && status[k] !== 'VERIFIED');
    if (other.length) rep.info('scripture', 'docs/scripture-sources.md', `keys not marked VERIFIED: ${other.map((k) => `${k} (${status[k]})`).join(', ')}`);
  } catch (e) { /* no sources doc */ }
}

function checkMeta(rep, data, cx) {
  const m = data.meta;
  if (!isObj(m)) { rep.error('meta', 'data/meta.js', 'BHS.meta missing'); return; }
  const W = (p) => `meta › ${p}`;
  ['title', 'subtitle', 'disclaimer'].forEach((k) => checkT(m[k], cx, W(k), {}));
  checkT(m.bibleNotice, cx, W('bibleNotice'), { allowMixed: true });
  if (!Array.isArray(m.routeOrder) || ROUTE_IDS.some((r) => !m.routeOrder.includes(r))) rep.error('meta', W('routeOrder'), `must list ${ROUTE_IDS.join(', ')}`);
  for (const rid of ROUTE_IDS) {
    const r = m.routes && m.routes[rid];
    if (!isObj(r)) { rep.error('meta', W(`routes.${rid}`), 'missing'); continue; }
    if (!isObj(data.characters) || !data.characters[r.protagonist]) rep.error('meta', W(`routes.${rid}.protagonist`), `unknown character ${JSON.stringify(r.protagonist)}`);
    ['name', 'title', 'tagline', 'firstLine'].forEach((k) => checkT(r[k], cx, W(`routes.${rid}.${k}`), {}));
    if (r.lensDesc !== undefined) rep.warn('obsolete', W(`routes.${rid}.lensDesc`), 'lens descriptions of the earlier releases; nothing reads them in version 4');
  }
  for (const k of ['lenses', 'cut', 'endings']) {
    if (m[k] !== undefined) rep.warn('obsolete', W(k), `meta.${k} belongs to the earlier releases (lenses, cut endings, ending titles); version 4 keeps titles in the route files and nothing reads it`);
  }
}

function checkCommon(rep, data, cx) {
  const c = data.common;
  if (!isObj(c)) { rep.error('common', 'data/common.js', 'BHS.common missing'); return; }
  const pcx = Object.assign({}, cx, { path: 'common › prologue', story: true, phase: 'prologue', file: 'data/common.js', cursor: { pos: 0 } });
  let bgNow = null;
  pcx.setBg = (bg) => { bgNow = bg; };
  pcx.bgNow = () => bgNow;
  if (!Array.isArray(c.prologue) || !c.prologue.length) rep.error('common', 'common › prologue', 'prologue must be a non-empty beat list');
  else checkBeats(c.prologue, pcx, 'beats');
  const rs = c.routeSelect || {};
  checkT(rs.prompt, cx, 'common › routeSelect.prompt', { kind: 'prompt' });
  if (rs.hint !== undefined) checkT(rs.hint, cx, 'common › routeSelect.hint', {});
  for (const [k, t] of [['prompt', rs.prompt], ['hint', rs.hint]]) {
    if (isT(t) && (DIGITS.test(stripTokens(t.ko)) || DIGITS.test(stripTokens(t.en)))) rep.error('digits', `common › routeSelect.${k}`, `ASCII digits on screen (SPEC 4.5: no numbers): "${snip(t.ko)}" / "${snip(t.en)}"`);
  }
  if (c.mismatchLine !== undefined) rep.warn('obsolete', 'common › mismatchLine', 'the mismatch line belongs to the lens releases; nothing reads it in version 4');
}

function checkCharacters(rep, data, cx) {
  const c = data.characters;
  if (!isObj(c)) { rep.error('characters', 'data/characters.js', 'BHS.characters missing'); return; }
  for (const [id, ch] of Object.entries(c)) {
    const W = `characters › ${id}`;
    if (!isObj(ch)) { rep.error('characters', W, 'must be an object'); continue; }
    checkT(ch.name, cx, `${W} › name`, {});
    checkT(ch.role, cx, `${W} › role`, { allowEmpty: id === 'jesus' });
    if (typeof ch.color !== 'string' || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(ch.color)) rep.warn('characters', W, `color should be "#hex", got ${JSON.stringify(ch.color)}`);
    if (PSEUDO_SPEAKERS.includes(id)) rep.error('characters', W, 'id collides with a pseudo-speaker');
  }
  const needed = ['menahem', 'hanan', 'yonah', 'asher', 'mother', 'brother', 'neighbor', 'partners', 'passerby', 'crowd', 'scribes', 'jesus'];
  for (const id of needed) if (!c[id]) rep.error('characters', `characters › ${id}`, 'SPEC 6.1 character missing');
}

// ---------------------------------------------------------------------------------------------
// Route checks

function checkUi(rep, data, cx) {
  const ui = data.ui;
  if (ui === undefined) return;
  if (!isObj(ui)) { rep.error('ui', 'data/ui-strings.js', 'BHS.ui must be an object of T strings'); return; }
  let n = 0;
  const walk = (o, p, depth) => {
    if (depth > 6) return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'function') continue;
      if (isObj(v) && ('ko' in v || 'en' in v)) { n++; checkT(v, cx, `ui › ${p}${k}`, { ui: true }); } else if (isObj(v)) walk(v, `${p}${k}.`, depth + 1);
    }
  };
  walk(ui, '', 0);
  rep.info('ui', 'data/ui-strings.js', `${n} UI strings checked`);
}

// ---------------------------------------------------------------------------------------------
// Route checks

function prescanFlags(route) {
  const all = new Map();
  for (const b of Array.isArray(route.beats) ? route.beats : []) {
    if (!isObj(b) || b.type !== 'choice' || !Array.isArray(b.options)) continue;
    for (const o of b.options) {
      if (isObj(o) && isObj(o.set)) {
        for (const [f, v] of Object.entries(o.set)) {
          if (!all.has(f)) all.set(f, new Set());
          all.get(f).add(v);
        }
      }
    }
  }
  return all;
}

function checkRoute(rep, data, rid, gcx, opts) {
  const route = data.routes[rid];
  if (route === undefined) return null;
  const file = `data/routes/${rid}.js`;
  if (!isObj(route)) { rep.error('schema', rid, 'route must be an object'); return null; }
  const usage = new Set();
  const allFlags = prescanFlags(route);
  const choiceList = choicesOf(route);
  const choiceIds = new Set(choiceList.map((b) => b.id));
  let bgNow = null;
  const cx = Object.assign({}, gcx, {
    rid, file, path: rid, story: true, phase: 'main', seen: new Set(), flags: new Map(), allFlags, choiceIds,
    counters: new Set(), actions: new Set(), ids: new Set(), choiceList: [], lastChoice: null, usage, cursor: { pos: 0 },
    allTexts: [], badRefs: [], scolds: [], longOptions: []
  });
  cx.setBg = (bg) => { bgNow = bg; };
  cx.bgNow = () => bgNow;
  if (route.id !== rid) rep.error('schema', rid, `route id is ${JSON.stringify(route.id)}, expected "${rid}"`);
  const unknown = Object.keys(route).filter((k) => !ROUTE_KEYS.includes(k));
  if (unknown.length) rep.warn('schema', rid, `unknown top-level key(s): ${unknown.join(', ')}`);
  // Persistent actions (optional; the engine keeps them, the UI shows them only when a route has some).
  if (route.actions !== undefined) {
    if (!Array.isArray(route.actions)) rep.error('schema', `${rid} › actions`, 'must be an array');
    else {
      if (route.actions.length) rep.info('schema', `${rid} › actions`, 'persistent action buttons are shown under the text box (version 4 routes usually make them ordinary options)');
      route.actions.forEach((a, i) => {
        const w = `${rid} › actions[${i}]`;
        if (!isObj(a)) { rep.error('schema', w, 'action must be an object'); return; }
        const ex = Object.keys(a).filter((k) => !['id', 'label', 'replies', 'counter'].includes(k));
        if (ex.length) rep.warn('schema', w, `unknown key(s): ${ex.join(', ')}`);
        if (typeof a.id !== 'string' || !a.id) rep.error('schema', w, 'action id must be a string');
        else if (cx.actions.has(a.id)) rep.error('schema', w, `duplicate action id ${a.id}`);
        else cx.actions.add(a.id);
        checkT(a.label, cx, `${w} › label`, { story: true });
        if (!Array.isArray(a.replies) || !a.replies.length) rep.error('schema', w, 'replies must be a non-empty array of texts');
        else a.replies.forEach((t, j) => checkT(t, cx, `${w} › replies[${j}]`, { kind: 'line', story: true }));
        if (typeof a.counter !== 'string' || !a.counter) rep.error('schema', w, 'counter must be a non-empty string');
        else if (cx.counters.has(a.counter)) rep.error('schema', w, `duplicate counter ${a.counter}`);
        else cx.counters.add(a.counter);
      });
    }
  }
  // Main beats.
  if (!Array.isArray(route.beats) || !route.beats.length) rep.error('schema', `${rid} › beats`, 'beats must be a non-empty array');
  else checkBeats(route.beats, cx, 'beats');
  // Choices c1..cN in order (SPEC 4.5), and the story shape (SPEC 8, WARN).
  const ids = cx.choiceList.map((b) => b.id);
  if (ids.some((id, i) => id !== 'c' + (i + 1))) rep.error('schema', `${rid} › beats`, `choice ids must be c1, c2, ... in beat order, once each; found [${ids.join(', ')}]`);
  if (ids.length < SHAPE.choices[0] || ids.length > SHAPE.choices[1]) rep.warn('shape', `${rid} › beats`, `${ids.length} choices (SPEC 8: ${SHAPE.choices[0]}-${SHAPE.choices[1]})`);
  const sizes = cx.choiceList.map((b) => (Array.isArray(b.options) ? b.options.length : 0));
  if (sizes.filter((x) => x === 2).length < SHAPE.twoOption) rep.warn('shape', `${rid} › beats`, `no choice with two options (SPEC 8: at least ${SHAPE.twoOption})`);
  if (sizes.filter((x) => x === 4).length < SHAPE.fourOption) rep.warn('shape', `${rid} › beats`, `${sizes.filter((x) => x === 4).length} choice(s) with four options (SPEC 8: at least ${SHAPE.fourOption})`);
  if (cx.scolds.length < SHAPE.scolds[0] || cx.scolds.length > SHAPE.scolds[1]) rep.warn('shape', `${rid} › beats`, `${cx.scolds.length} scold option(s) (SPEC 8: ${SHAPE.scolds[0]}-${SHAPE.scolds[1]})`);
  const weird = cx.choiceList.filter((b) => (b.options || []).some((o) => optionOutcome(o) !== 'continue')).length;
  if (cx.choiceList.length && weird * 2 < cx.choiceList.length) rep.info('shape', `${rid} › beats`, `${weird} of ${cx.choiceList.length} choices have a weird option (bad or scold); SPEC 8 asks for most`);
  if (cx.longOptions.length) rep.info('voice', rid, `${cx.longOptions.length} option(s) longer than the ${OPTION_AIM.ko}/${OPTION_AIM.en}-character aim (SPEC 4.5): ${cx.longOptions.join(', ')}`);
  // Endings (SPEC 4.6).
  const ecx = Object.assign({}, cx, { phase: 'ending', seen: new Set(choiceIds), flags: new Map([...allFlags].map(([k, v]) => [k, new Set(v)])), lastChoice: null });
  if (route.endingPreface !== undefined) checkBeats(route.endingPreface, Object.assign({}, ecx, { path: `${rid} › endingPreface` }), 'beats');
  const defined = new Set();
  if (!isObj(route.endings)) rep.error('schema', `${rid} › endings`, 'endings must be an object { good, bad }');
  else {
    const old = Object.keys(route.endings).filter((k) => ['1', '2', '3', 'cut'].includes(k));
    if (old.length) rep.error('obsolete', `${rid} › endings`, `lens or cut endings of the earlier releases (${old.join(', ')}); version 4 has endings.good and endings.bad (SPEC 4.6)`);
    const extraE = Object.keys(route.endings).filter((k) => !['good', 'bad', '1', '2', '3', 'cut'].includes(k));
    if (extraE.length) rep.warn('schema', `${rid} › endings`, `unexpected ending key(s): ${extraE.join(', ')}`);
    const good = route.endings.good;
    const gw = `${rid} › endings.good`;
    if (!isObj(good)) rep.error('schema', gw, 'missing: the true ending { title, verse, beats, last } (SPEC 4.6)');
    else {
      const ex = Object.keys(good).filter((k) => !['title', 'verse', 'beats', 'last'].includes(k));
      if (ex.length) rep.warn('schema', gw, `unknown key(s): ${ex.join(', ')}`);
      checkT(good.title, Object.assign({}, ecx, { path: gw }), `${gw} › title`, { story: true });
      const scr = data.scripture;
      if (typeof good.verse !== 'string' || !good.verse) rep.error('schema', gw, 'verse (the memory verse key) is missing');
      else if (isObj(scr) && !isObj(scr[good.verse])) rep.error('token', gw, `unknown memory verse key ${good.verse}`);
      else if (isObj(scr) && scr[good.verse].refOnly) rep.error('token', gw, `the memory verse ${good.verse} is a reference-only key`);
      else {
        if (MEMORY_VERSE[rid] && good.verse !== MEMORY_VERSE[rid]) rep.warn('canon', gw, `memory verse is ${good.verse}; SPEC 4.6 gives ${MEMORY_VERSE[rid]} for the ${rid} route`);
        usage.add(good.verse);
      }
      if (!Array.isArray(good.beats)) rep.error('schema', gw, 'beats must be an array');
      else checkBeats(good.beats, Object.assign({}, ecx, { path: gw }), 'beats');
      checkT(good.last, Object.assign({}, ecx, { path: gw }), `${gw} › last`, { kind: 'line', story: true });
    }
    const bad = route.endings.bad;
    if (bad !== undefined && !isObj(bad)) rep.error('schema', `${rid} › endings.bad`, 'endings.bad must be an object of cut branches');
    else if (isObj(bad)) {
      for (const [id, e] of Object.entries(bad)) {
        defined.add(id);
        const bw = `${rid} › endings.bad.${id}`;
        if (!/^[a-z][A-Za-z0-9]*$/.test(id)) rep.warn('schema', bw, 'cut branch ids are short ascii words such as "typo" or "bigCatch"');
        if (!isObj(e)) { rep.error('schema', bw, 'must be { title, beats, last }'); continue; }
        const ex = Object.keys(e).filter((k) => !['title', 'beats', 'last'].includes(k));
        if (ex.length) rep.warn('schema', bw, `unknown key(s): ${ex.join(', ')}`);
        // Conditions may use only the choices asked before the first option that leads here.
        const refs = cx.badRefs.filter((r) => r.bad === id);
        const firstIdx = refs.length ? Math.min(...refs.map((r) => ids.indexOf(r.choice))) : ids.length - 1;
        const upto = ids.slice(0, firstIdx + 1);
        const bflags = new Map();
        for (const cb of cx.choiceList.filter((b) => upto.includes(b.id))) {
          for (const o of cb.options || []) {
            if (!isObj(o) || !isObj(o.set)) continue;
            for (const [f, v] of Object.entries(o.set)) { if (!bflags.has(f)) bflags.set(f, new Set()); bflags.get(f).add(v); }
          }
        }
        const bcx = Object.assign({}, ecx, { path: bw, inBadEnding: true, badFrom: upto[upto.length - 1] || '-', seen: new Set(upto), flags: bflags });
        checkT(e.title, bcx, `${bw} › title`, { story: true });
        if (isT(e.title)) {
          const n = cpLen(e.title.ko.replace(/\s+/g, ''));
          if (n < BAD_TITLE_KO[0] || n > BAD_TITLE_KO[1]) rep.warn('ending', bw, `title has ${n} Korean characters; a branch label in the story tree is short (SPEC 4.6: ${BAD_TITLE_KO[0]}-${BAD_TITLE_KO[1]}): "${e.title.ko}"`);
        }
        if (!Array.isArray(e.beats)) rep.error('schema', bw, 'beats must be an array');
        else checkBeats(e.beats, bcx, 'beats');
        checkT(e.last, bcx, `${bw} › last`, { kind: 'line', story: true });
      }
    }
  }
  for (const r of cx.badRefs) if (!defined.has(r.bad)) rep.error('outcome', r.w, `bad: "${r.bad}" has no endings.bad.${r.bad}`);
  for (const id of defined) if (!cx.badRefs.some((r) => r.bad === id)) rep.error('outcome', `${rid} › endings.bad.${id}`, 'no option leads to this cut branch (unreachable)');
  const nBad = defined.size;
  if (nBad < SHAPE.bad[0] || nBad > SHAPE.bad[1]) rep.warn('shape', `${rid} › endings.bad`, `${nBad} cut branch(es) (SPEC 8: ${SHAPE.bad[0]}-${SHAPE.bad[1]})`);
  if (route.endingCoda !== undefined) checkBeats(route.endingCoda, Object.assign({}, ecx, { path: `${rid} › endingCoda` }), 'beats');
  // Unused flags.
  const usedFlags = new Set();
  const collectFlags = (c) => {
    if (!isObj(c)) return;
    if ('flag' in c) usedFlags.add(c.flag);
    ['all', 'any'].forEach((k) => Array.isArray(c[k]) && c[k].forEach(collectFlags));
    if ('not' in c) collectFlags(c.not);
  };
  JSON.stringify(route, (k, v) => { if (k === 'when') collectFlags(v); if (k === 'highlight' && isObj(v)) usedFlags.add(v.flag); return v; });
  for (const f of allFlags.keys()) if (!usedFlags.has(f)) rep.info('cond', `${rid}`, `flag "${f}" is set but never used in a condition or highlight`);
  // Guardrail: MT_9_3 / MT_9_3Q only in the scribe route.
  if (rid !== 'scribe') {
    for (const k of ['MT_9_3', 'MT_9_3Q']) if (usage.has(k)) rep.error('guard', rid, `${k} (the scribes' unspoken thought) appears in the ${rid} route (SPEC 6.4: scribe route only)`);
  }
  return { cx, usage };
}

// Crowd order (SPEC 6.4) over the main beats of one simulated path. Returns the problems found.
function crowdProblems(sim, rid, isTrue) {
  const first = {};
  const lightProblems = [];
  sim.out.forEach((it, idx) => {
    if (!/^main/.test(it.phase)) return;
    for (const k of keysShown(it)) {
      if (!(k in EVENT_GROUP)) continue;
      if (first[k] === undefined) first[k] = idx;
      if ((k === 'MT_9_2B' || k === 'MT_9_2B2' || k === 'MT_9_6B') && it.light !== 'bright' && it.kind === 'verse') lightProblems.push(k);
    }
  });
  const probs = [];
  const has = (k) => first[k] !== undefined;
  // Each event group spans from its first shown key to its last required key; groups must not overlap
  // out of order. Later recalls (callbacks) of a key do not count, only first appearances.
  const reqSet = (g) => {
    if (g === 3) return has('MT_9_2B1') && has('MT_9_2B2') ? ['MT_9_2B1', 'MT_9_2B2'] : ['MT_9_2B'];
    if (g === 4) return has('MT_9_3Q') ? ['MT_9_3Q'] : ['MT_9_3'];
    if (g === 5) return has('MT_9_4N') && has('MT_9_4Q') ? ['MT_9_4N', 'MT_9_4Q'] : ['MT_9_4'];
    if (g === 7) return ['MT_9_6A', 'MT_9_6N', 'MT_9_6B'];
    return Object.keys(EVENT_GROUP).filter((k) => EVENT_GROUP[k] === g);
  };
  const groups = [];
  for (let g = 1; g <= 9; g++) {
    const keys = Object.keys(EVENT_GROUP).filter((k) => EVENT_GROUP[k] === g && has(k));
    if (!keys.length) continue;
    const start = Math.min(...keys.map((k) => first[k]));
    const req = reqSet(g).filter(has);
    const endKey = req.length ? req.reduce((x, y) => (first[x] >= first[y] ? x : y)) : keys[0];
    groups.push({ g, start, end: first[endKey], endKey, startKey: keys.find((k) => first[k] === start) });
  }
  for (let i = 1; i < groups.length; i++) {
    const ga = groups[i - 1];
    const gb = groups[i];
    if (ga.end > gb.start) probs.push(`${gb.startKey} (${EVENT_LABEL[gb.g]}) is shown before ${ga.endKey} (${EVENT_LABEL[ga.g]})`);
  }
  for (const [x, y] of SUB_ORDER) if (has(x) && has(y) && first[x] > first[y]) probs.push(`${y} is shown before ${x}`);
  if (isTrue) {
    if (!has('MT_9_2A')) probs.push('MT_9_2A (9:2a) not shown');
    if (!(has('MT_9_2B') || (has('MT_9_2B1') && has('MT_9_2B2')))) probs.push('first words (MT_9_2B or MT_9_2B1+2B2) not shown');
    if (!(has('MT_9_4') || (has('MT_9_4N') && has('MT_9_4Q')))) probs.push('9:4 (MT_9_4N + MT_9_4Q) not shown');
    for (const k of ['MT_9_5', 'MT_9_6A', 'MT_9_6N', 'MT_9_6B', 'MT_9_7', 'MT_9_8']) if (!has(k)) probs.push(`${k} not shown`);
    if (!has('MT_9_1')) probs.push('MT_9_1 (boat) not shown; optional (INFO only)');
    if (rid === 'scribe' && !has('MT_9_3Q') && !has('MT_9_3')) probs.push('MT_9_3Q (scribes\' thought) not shown in the scribe route (WARN only)');
  }
  return { probs, lightProblems };
}

function routeStats(rep, data, rid, rcx, canon, engine) {
  const route = data.routes[rid];
  const tps = truePaths(route);
  const cps = cutPaths(route);
  const lines = { shape: [], screens: [], cuts: [], engine: [], tree: [] };
  if (!choicesOf(route).length) return { lines, summary: null };
  if (!tps.length) rep.error('outcome', rid, 'no true path: some choice has no continue option');
  const prologueItems = [];
  if (data.common && Array.isArray(data.common.prologue)) {
    for (const b of data.common.prologue) if (isObj(b)) prologueItems.push({ kind: b.type, beat: b });
  }
  const pro = readingStats(prologueItems, data);
  const orderProblems = new Map();
  const lightProblems = new Map();
  const passerbyMissing = [];
  const endLen = { good: { min: Infinity, max: -Infinity, eg: '' } };
  const trueRes = [];
  let simFailed = false;
  for (const picks of tps) {
    const label = pathLabel(route, picks);
    let sim;
    try { sim = simulate(route, data, { picks }); } catch (e) { rep.error('internal', rid, `simulation failed on ${label}: ${e.message}`); simFailed = true; break; }
    if (sim.cut) { rep.error('internal', rid, `true path ${label} was cut by ${sim.cut.bad}`); continue; }
    const st = readingStats(sim.out, data);
    trueRes.push({ label, st, mins: minutes(st) });
    const eb = sim.out.filter((it) => it.phase === 'ending' && SCREEN_KINDS.has(it.kind)).length;
    if (eb < endLen.good.min) endLen.good.min = eb;
    if (eb > endLen.good.max) { endLen.good.max = eb; endLen.good.eg = label; }
    const cp = crowdProblems(sim, rid, true);
    for (const pr of cp.probs) { if (!orderProblems.has(pr)) orderProblems.set(pr, []); orderProblems.get(pr).push(label); }
    for (const k of cp.lightProblems) lightProblems.set(k, (lightProblems.get(k) || 0) + 1);
    const shown = sim.out.filter((it) => it.kind === 'line');
    const shownKo = shown.map((it) => (isT(it.beat.text) ? it.beat.text.ko : '')).join(' ');
    const shownEn = shown.map((it) => (isT(it.beat.text) ? it.beat.text.en : '')).join(' ');
    if (rid !== 'scribe' && (!shownKo.includes(canon.passerby.ko) || !shownEn.includes(canon.passerby.en))) passerbyMissing.push(label);
  }
  for (const [pr, labels] of orderProblems) {
    const level = /INFO only/.test(pr) ? 'INFO' : /WARN only/.test(pr) ? 'WARN' : 'ERROR';
    rep.add(level, 'canon', rid, `crowd sequence (SPEC 6.4): ${pr.replace(/ \((WARN|INFO) only\)/, '').replace(/; optional$/, ' (optional)')} on ${labels.length}/${tps.length} true paths (e.g. ${labels[0]})`);
  }
  for (const [k, n] of lightProblems) rep.warn('fx', rid, `${k} is shown without fx light "bright" on ${n}/${tps.length} true paths (SPEC 4.5)`);
  if (rid !== 'scribe' && passerbyMissing.length) rep.error('canon', rid, `the SPEC 6.3 passerby line (verbatim, ko and en) is not shown on ${passerbyMissing.length}/${tps.length} true paths (e.g. ${passerbyMissing[0]})`);
  // Screen budget on the true paths (SPEC 4.5): WARN above 28, ERROR above 30.
  const over = trueRes.filter((r) => r.st.screens > SCREENS.trueMax);
  const warnRes = trueRes.filter((r) => r.st.screens > SCREENS.trueWarn && r.st.screens <= SCREENS.trueMax);
  if (over.length) rep.error('screens', rid, `${over.length}/${trueRes.length} true paths exceed ${SCREENS.trueMax} screens (SPEC 4.5); worst ${Math.max(...over.map((r) => r.st.screens))} on ${over[0].label}`);
  const warnSpan = SCREENS.trueWarn + 1 === SCREENS.trueMax ? `${SCREENS.trueMax}` : `${SCREENS.trueWarn + 1}-${SCREENS.trueMax}`;
  if (warnRes.length) rep.warn('screens', rid, `${warnRes.length}/${trueRes.length} true paths have ${warnSpan} screens (SPEC 4.5 target ${SCREENS.trueTarget[0]}-${SCREENS.trueTarget[1]}); worst ${Math.max(...warnRes.map((r) => r.st.screens))} on ${warnRes[0].label}`);
  if (trueRes.length && Math.max(...trueRes.map((r) => r.st.screens)) < SCREENS.trueTarget[0]) rep.info('screens', rid, `true paths have at most ${Math.max(...trueRes.map((r) => r.st.screens))} screens (SPEC 4.5 target ${SCREENS.trueTarget[0]}-${SCREENS.trueTarget[1]})`);
  const g = endLen.good;
  if (trueRes.length && (g.max > ENDING_BEATS.good[1] || g.min < ENDING_BEATS.good[0])) {
    rep.warn('ending', `${rid} › endings.good`, `shows ${g.min === g.max ? g.min : g.min + '-' + g.max} beat screen(s) before the last line (SPEC 4.6: ${ENDING_BEATS.good[0]}-${ENDING_BEATS.good[1]}); e.g. ${g.eg}`);
  }
  // Scolds: the class may pick every scold on the way (INFO: the longest true path then).
  if (!simFailed && tps.length) {
    let worst = 0;
    for (const picks of tps.slice(0, 200)) worst = Math.max(worst, readingStats(simulate(route, data, { picks, scoldFirst: true }).out, data).screens);
    if (rcx.scolds.length) rep.info('screens', rid, `with every scold picked on the way, a true path shows up to ${worst} screens`);
  }
  // Cut paths: each reaches its branch; at most 20 screens (SPEC 4.5); branch length 2-3 beats.
  const reached = new Set();
  const byBad = new Map();
  for (const c of cps) {
    const label = pathLabel(route, c.picks);
    let sim;
    try { sim = simulate(route, data, { picks: c.picks }); } catch (e) { rep.error('internal', rid, `simulation failed on cut path ${label}: ${e.message}`); break; }
    if (!sim.cut || sim.cut.bad !== c.bad) { rep.error('outcome', rid, `cut path ${label} (${c.choice}/${c.option}) did not reach endings.bad.${c.bad}`); continue; }
    reached.add(c.bad);
    const st = readingStats(sim.out, data);
    const pickIdx = sim.out.findIndex((it, i) => it.kind === 'choice' && it.beat.id === c.choice && !sim.out.slice(i + 1).some((x) => x.kind === 'choice' && x.beat.id === c.choice));
    const branch = readingStats(sim.out.slice(pickIdx + 1), data);
    const eb = sim.out.filter((it) => it.phase === 'ending' && SCREEN_KINDS.has(it.kind)).length;
    const r = byBad.get(c.bad) || { paths: 0, maxScreens: 0, worst: '', branchScreens: branch.screens, branchMins: minutes(branch), ebMin: Infinity, ebMax: -Infinity, at: new Set() };
    r.paths++;
    r.at.add(`${c.choice}/${c.option}`);
    if (st.screens > r.maxScreens) { r.maxScreens = st.screens; r.worst = label; }
    r.ebMin = Math.min(r.ebMin, eb);
    r.ebMax = Math.max(r.ebMax, eb);
    byBad.set(c.bad, r);
    const cp = crowdProblems(sim, rid, false);
    for (const pr of cp.probs) { if (!orderProblems.has('cut:' + pr)) { orderProblems.set('cut:' + pr, [label]); rep.error('canon', rid, `crowd sequence (SPEC 6.4) on cut path ${label}: ${pr}`); } }
  }
  for (const [bad, r] of byBad) {
    if (r.maxScreens > SCREENS.cutMax) rep.error('screens', `${rid} › endings.bad.${bad}`, `a cut path shows ${r.maxScreens} screens (SPEC 4.5: at most ${SCREENS.cutMax}); e.g. ${r.worst}`);
    if (r.ebMax > ENDING_BEATS.bad[1] || r.ebMin < ENDING_BEATS.bad[0]) rep.warn('ending', `${rid} › endings.bad.${bad}`, `shows ${r.ebMin === r.ebMax ? r.ebMin : r.ebMin + '-' + r.ebMax} beat screen(s) before the last line (SPEC 4.6: ${ENDING_BEATS.bad[0]}-${ENDING_BEATS.bad[1]})`);
  }
  if (isObj(route.endings) && isObj(route.endings.bad)) {
    for (const id of Object.keys(route.endings.bad)) if (rcx.badRefs.some((x) => x.bad === id) && !reached.has(id)) rep.error('outcome', `${rid} › endings.bad.${id}`, 'no simulated path reaches this cut branch');
  }
  // Engine cross-check.
  if (engine && typeof engine.createGame === 'function' && !simFailed) {
    const r = enginePathCheck(rep, data, rid, engine);
    if (r) lines.engine.push(`${pad(rid, 7)} ${r}`);
  }
  // Summary lines.
  const ch = choicesOf(route);
  lines.shape.push(`${pad(rid, 7)} ${ch.length} choices (${ch.map((b) => `${b.id}:${optionsOf(b).map((o) => ({ continue: 'o', bad: 'x', scold: '~' })[optionOutcome(o)]).join('')}`).join(' ')})   cut branches ${byBad.size}   scolds ${rcx.scolds.length}   true paths ${tps.length}   cut paths ${cps.length}`);
  lines.tree.push(`${pad(rid, 7)} ${treeLevels(route).map((l) => `${l.id}[${l.branches.join(',')}]`).join(' ')}  -> ★`);
  const stat = (arr, f, d = 1) => (arr.length ? `${Math.min(...arr.map(f)).toFixed(d)} / ${median(arr.map(f)).toFixed(d)} / ${Math.max(...arr.map(f)).toFixed(d)}` : '-');
  let summary = null;
  if (trueRes.length) {
    lines.screens.push(`${pad(rid, 7)} true paths ${pad(trueRes.length, 4)} screens min/median/max ${stat(trueRes, (r) => r.st.screens, 0)}   aloud ko ${stat(trueRes, (r) => r.mins.koAloud)} min   en ${stat(trueRes, (r) => r.mins.enAloud)} min   silent ko ${stat(trueRes, (r) => r.mins.ko)} min`);
    summary = {
      medianScreens: median(trueRes.map((r) => r.st.screens)),
      maxScreens: Math.max(...trueRes.map((r) => r.st.screens)),
      aloudKo: median(trueRes.map((r) => r.mins.koAloud)),
      aloudEn: median(trueRes.map((r) => r.mins.enAloud)),
      silentKo: median(trueRes.map((r) => r.mins.ko))
    };
  }
  for (const [bad, r] of byBad) {
    lines.cuts.push(`${pad(rid, 7)} ${pad(bad, 14)} from ${pad([...r.at].join(' '), 12)} the branch: ${r.branchScreens} screens, aloud ko ~${Math.round(r.branchMins.koAloud * 60)} s / en ~${Math.round(r.branchMins.enAloud * 60)} s   whole cut path: up to ${r.maxScreens} screens`);
  }
  return { lines, summary, prologue: pro };
}

// Signature of one shown step, comparable between the reference simulation and the engine.
function sigOfItem(it) {
  const b = it.beat || {};
  const ko = (t) => (isT(t) ? t.ko : '');
  if (it.kind === 'line') return it.phase === 'last' ? `last|${ko(b.text)}` : `line|${b.speaker || 'narrator'}|${ko(b.text)}`;
  if (it.kind === 'verse') return `verse|${b.key}`;
  if (it.kind === 'memory') return `memory|${it.key}`;
  if (it.kind === 'choice') return `choice|${b.id}|${it.shown.join('')}`;
  if (it.kind === 'press') return `press|${b.action || ''}|${ko(b.label)}`;
  if (it.kind === 'card') return 'title|good';
  if (it.kind === 'snip') return `snip|${it.bad}`;
  return null;
}
function sigOfStep(st) {
  const ko = (t) => (isT(t) ? t.ko : typeof t === 'string' ? t : '');
  switch (st.kind) {
    case 'line': return `line|${st.speaker || 'narrator'}|${ko(st.text)}`;
    case 'verse': return `verse|${st.key}`;
    case 'memory': return `memory|${st.key}`;
    case 'choice': return `choice|${st.id}|${(st.options || []).map((o) => o.id).join('')}`;
    case 'press': return `press|${st.action || ''}|${ko(st.label)}`;
    case 'endingTitle': return 'title|good';
    case 'last': return `last|${ko(st.text)}`;
    case 'snip': return `snip|${st.badId}`;
    default: return `${st.kind}|`;
  }
}

// The state as Try again must restore it: everything but the retry snapshot itself and the removal
// animation hint of a re-asked choice.
function retryView(state) {
  const s = JSON.parse(JSON.stringify(state));
  delete s.retry;
  if (s.step) s.step.justRemoved = null;
  return JSON.stringify(s);
}

// Drives BHS.engine.createGame() along every true path and every cut path, each once as planned and
// once with every scold picked on the way, and compares every shown step with simulate(). On a cut path
// it also presses Try again (retry) on the snip card and checks the game is back at that choice, with
// the same options and the same state as when the choice was shown.
function enginePathCheck(rep, data, rid, engine) {
  const route = data.routes[rid];
  const warnBefore = Array.isArray(engine.warnings) ? engine.warnings.length : 0;
  const plans = [];
  for (const picks of truePaths(route)) {
    plans.push({ picks, kind: 'true' });
    plans.push({ picks, kind: 'true', scoldFirst: true });
  }
  for (const c of cutPaths(route)) {
    plans.push({ picks: c.picks, kind: 'cut', cut: c });
    plans.push({ picks: c.picks, kind: 'cut', cut: c, scoldFirst: true });
  }
  let diffs = 0;
  let retries = 0;
  let firstDiff = null;
  let nTrue = 0;
  let nCut = 0;
  const fail = (plan, detail) => {
    diffs++;
    if (!firstDiff) firstDiff = `${pathLabel(route, plan.picks)}${plan.scoldFirst ? ' (with scolds)' : ''}: ${detail}`;
  };
  for (const plan of plans) {
    const sim = simulate(route, data, plan);
    const mine = sim.out.map(sigOfItem).filter(Boolean);
    const theirs = [];
    let game;
    try { game = engine.createGame(rid); } catch (e) { rep.error('engine', rid, `createGame("${rid}") threw: ${e.message}`); return null; }
    let snapAt = null;
    let broke = false;
    for (let guard = 0; guard < 4000; guard++) {
      const st = game.step;
      if (!st || st.kind === 'end') break;
      theirs.push(sigOfStep(st));
      if (st.kind === 'snip') break;
      try {
        if (st.kind === 'choice') {
          const cb = choicesOf(route).find((b) => b.id === st.id);
          if (plan.cut && st.id === plan.cut.choice) snapAt = retryView(game.serialize());
          const id = nextPick(cb, (st.options || []).map((o) => o.id), plan);
          if (!game.choose(id)) { theirs.push('choose-failed|' + st.id + '/' + id); broke = true; break; }
        } else if (st.kind === 'press') game.press();
        else if (!game.next()) { theirs.push('next-refused|' + st.kind); broke = true; break; }
      } catch (e) { theirs.push('threw|' + e.message); broke = true; break; }
    }
    if (plan.kind === 'true') nTrue++;
    else nCut++;
    const len = Math.max(mine.length, theirs.length);
    let at = -1;
    for (let i = 0; i < len; i++) if (mine[i] !== theirs[i]) { at = i; break; }
    if (at >= 0) { fail(plan, `step ${at + 1}: reference "${snip(mine[at] || '(end)', 60)}" vs engine "${snip(theirs[at] || '(end)', 60)}"`); continue; }
    if (broke) { fail(plan, theirs[theirs.length - 1]); continue; }
    const ending = game.state && game.state.ending;
    if (plan.kind === 'true') {
      if (!game.step || game.step.kind !== 'end' || !ending || ending.id !== rid + '-good') fail(plan, `ended with ${ending ? ending.id : 'no ending'}, expected ${rid}-good`);
      continue;
    }
    const want = `${rid}-bad-${plan.cut.bad}`;
    if (!game.step || game.step.kind !== 'snip' || game.step.id !== want) { fail(plan, `stopped at ${game.step ? game.step.kind + ' ' + (game.step.id || '') : 'nothing'}, expected the snip card of ${want}`); continue; }
    // Try again.
    let ok = false;
    try { ok = typeof game.retry === 'function' && game.retry(); } catch (e) { ok = false; }
    const pres = sim.presentations[plan.cut.choice] || [];
    const wantStep = `choice|${plan.cut.choice}|${(pres[pres.length - 1] || []).join('')}`;
    if (!ok) { fail(plan, 'retry() on the snip card failed'); continue; }
    if (sigOfStep(game.step) !== wantStep) { fail(plan, `Try again shows "${sigOfStep(game.step)}", expected "${wantStep}"`); continue; }
    if (snapAt && retryView(game.serialize()) !== snapAt) { fail(plan, 'Try again did not restore the state as it was when the choice was shown'); continue; }
    retries++;
  }
  if (Array.isArray(engine.warnings) && engine.warnings.length > warnBefore) {
    const uniq = [...new Set(engine.warnings.slice(warnBefore))].slice(0, 5);
    rep.warn('engine', rid, `engine warnings during simulated play: ${uniq.map((x) => snip(x, 80)).join(' | ')}`);
  }
  if (diffs) {
    rep.error('engine', rid, `engine play differs from the SPEC reference simulation on ${diffs}/${plans.length} runs; first: ${firstDiff}`);
    return null;
  }
  return `engine play (createGame) matches the reference step by step: ${nTrue} true-path runs and ${nCut} cut-path runs (each planned and with every scold), Try again back at the right choice ${retries}/${nCut}`;
}

function checkPasserbyText(rep, rid, texts, canon) {
  const want = canon.passerby;
  const pb = texts.filter((x) => x.speaker === 'passerby');
  const norm = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  let okKo = false;
  let okEn = false;
  for (const x of texts) {
    if (x.t.ko.includes(want.ko)) { okKo = true; if (x.speaker && x.speaker !== 'passerby') rep.warn('canon', x.w, `the passerby line is spoken by "${x.speaker}" (expected speaker "passerby")`); }
    if (x.t.en.includes(want.en)) okEn = true;
  }
  if (rid === 'scribe' && !pb.length && !okKo) { rep.info('canon', rid, 'the passerby line is not shown in the scribe route (optional there)'); return; }
  for (const [lang, ok] of [['ko', okKo], ['en', okEn]]) {
    if (ok) continue;
    const joined = pb.map((x) => x.t[lang]).join(' ');
    if (joined.includes(want[lang])) { rep.info('canon', rid, `the passerby line (${lang}) is split across beats`); continue; }
    const close = texts.find((x) => norm(x.t[lang]).includes(norm(want[lang])));
    if (close) { rep.warn('canon', close.w, `the passerby line (${lang}) matches SPEC 6.3 only after normalizing quotes/apostrophes/spaces`); continue; }
    const near = pb.length ? pb.map((x) => `"${snip(x.t[lang], 60)}"`).join(' | ') : 'no passerby line found';
    rep.error('canon', rid, `the SPEC 6.3 passerby line (${lang}) is missing or altered; expected "${want[lang]}"; found: ${near}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Orchestration

export function validateData(data, opts = {}) {
  const rep = opts.report || new Report();
  const spec = opts.spec || parseSpec(opts.root || DEFAULT_ROOT);
  const canon = canonFromSpec(spec);
  const root = opts.root || DEFAULT_ROOT;
  const files = opts.files || {};
  const gcx = makeCx(rep, data, spec, canon, files);
  const routes = ROUTE_IDS.filter((r) => !opts.routeFilter || r === opts.routeFilter);
  if (!spec.ok) rep.warn('spec', 'docs/SPEC.md', 'could not read SPEC; using built-in fallbacks');
  const safe = (label, fn) => {
    try { return fn(); } catch (e) { rep.error('internal', label, `validator crashed: ${e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`); return null; }
  };
  safe('scripture', () => checkScripture(rep, data, spec, opts.fixture ? '/nonexistent' : root));
  safe('characters', () => checkCharacters(rep, data, Object.assign({}, gcx, { file: 'data/characters.js' })));
  safe('meta', () => checkMeta(rep, data, Object.assign({}, gcx, { file: 'data/meta.js' })));
  safe('common', () => checkCommon(rep, data, Object.assign({}, gcx, { file: 'data/common.js' })));
  safe('ui', () => checkUi(rep, data, Object.assign({}, gcx, { file: 'data/ui-strings.js' })));
  const out = { shape: [], tree: [], screens: [], cuts: [], engine: [], routes: {} };
  for (const rid of routes) {
    if (data.routes[rid] === undefined) continue;
    const r = safe(rid, () => checkRoute(rep, data, rid, gcx, opts));
    if (!r) continue;
    safe(rid + ' passerby', () => checkPasserbyText(rep, rid, r.cx.allTexts, canon));
    const s = safe(rid + ' stats', () => routeStats(rep, data, rid, r.cx, canon, data.engine));
    if (s) {
      for (const k of ['shape', 'tree', 'screens', 'cuts', 'engine']) out[k].push(...s.lines[k]);
      out.routes[rid] = { summary: s.summary };
      out.prologue = s.prologue;
    }
  }
  if (data.engine) safe('engine', () => checkEngineExtras(rep, data, routes));
  if (out.shape.length) rep.section('Story shape - options per choice (o = continue, x = cuts the story, ~ = scolded away; SPEC 4.5, 8)', out.shape);
  if (out.tree.length) rep.section('Story trees - cut branches at their first choice point (SPEC 5.8)', out.tree);
  if (out.engine.length) rep.section('Engine cross-check', out.engine);
  if (out.screens.length) {
    const sums = Object.values(out.routes).map((r) => r.summary).filter(Boolean);
    const lesson = [];
    if (out.prologue) lesson.push(`prologue: ${out.prologue.screens} screens (played once per lesson; not in the route numbers)`);
    if (sums.length) {
      const add = (k) => sums.reduce((x, y) => x + y[k], 0);
      lesson.push(`all ${sums.length} routes in one lesson (median true path each): ${add('medianScreens')} screens, read aloud ~${add('aloudKo').toFixed(1)} min (ko) / ~${add('aloudEn').toFixed(1)} min (en), silent ~${add('silentKo').toFixed(1)} min (ko)`);
    }
    rep.section(`True paths - screens and reading time (screens = line+verse+choice+press+memory verse; WARN > ${SCREENS.trueWarn}, ERROR > ${SCREENS.trueMax}; silent ko 450 chars/min, en 200 words/min, +4 s per choice; aloud ko 260 chars/min, en 150 words/min, +10 s per choice, +1 s per screen)`,
      out.screens.concat(lesson));
  }
  if (out.cuts.length) rep.section(`Cut branches - reading time from the cutting pick (reaction, beats, last line) and the longest whole cut path (ERROR > ${SCREENS.cutMax} screens)`, out.cuts);
  return { report: rep, stats: out };
}

function checkEngineExtras(rep, data, routes) {
  const eng = data.engine;
  if (typeof eng.evalCond === 'function') {
    const rng = mulberry32(7);
    let bad = 0;
    let first = null;
    let n = 0;
    for (const rid of routes) {
      const route = data.routes[rid];
      if (!isObj(route)) continue;
      const conds = [];
      JSON.stringify(route, (k, v) => { if (k === 'when' && isObj(v)) conds.push(v); return v; });
      const flagVals = prescanFlags(route);
      const ch = choicesOf(route);
      for (const c of conds) {
        for (let t = 0; t < 12; t++) {
          const choices = {};
          ch.forEach((b) => { const o = optionsOf(b); if (o.length && rng() < 0.85) choices[b.id] = o[Math.floor(rng() * o.length)].id; });
          const flags = {};
          for (const [f, vals] of flagVals) {
            const arr = [...vals];
            if (rng() < 0.75) flags[f] = arr[Math.floor(rng() * arr.length)];
          }
          const st = { routeId: rid, choices, flags, vars: {} };
          let theirs;
          try { theirs = !!eng.evalCond(c, st); } catch (e) { theirs = 'threw ' + e.message; }
          n++;
          if (theirs !== evalCond(c, st)) { bad++; if (!first) first = { c, st, theirs }; }
        }
      }
    }
    if (bad) rep.warn('engine', 'js/engine.js', `evalCond disagrees with the reference on ${bad}/${n} samples; e.g. ${snip(JSON.stringify(first.c), 80)} -> ${first.theirs}`);
    else if (n) rep.info('engine', 'js/engine.js', `evalCond agrees with the reference on ${n} samples`);
  }
  if (typeof eng.resolveText === 'function') {
    let bad = 0;
    let first = null;
    let n = 0;
    const st = { choices: {}, flags: {}, vars: {} };
    const visit = (t) => {
      if (!isT(t)) return;
      for (const lang of ['ko', 'en']) {
        let s;
        try { s = String(eng.resolveText(t, lang, st)); } catch (e) { s = 'THREW ' + e.message; }
        n++;
        if (/\{\{|\[MT_|\bundefined\b|\bnull\b|THREW/.test(s)) { bad++; if (!first) first = { t: t[lang], s }; }
      }
    };
    const walk = (o, depth) => {
      if (depth > 12 || o === null || typeof o !== 'object') return;
      if (isT(o)) { visit(o); return; }
      for (const v of Array.isArray(o) ? o : Object.values(o)) walk(v, depth + 1);
    };
    for (const rid of routes) walk(data.routes[rid], 0);
    walk(data.common, 0);
    if (bad) rep.error('engine', 'js/engine.js', `resolveText leaves unresolved text in ${bad}/${n} strings; e.g. "${snip(first.t, 40)}" -> "${snip(first.s, 60)}"`);
    else if (n) rep.info('engine', 'js/engine.js', `resolveText resolved ${n} strings without leftovers`);
  }
  // Verse display rule (SPEC 4.3): the engine must show the same text as the reference for every key.
  if (typeof eng.verseDisplay === 'function' && isObj(data.scripture)) {
    let bad = 0;
    let first = null;
    let n = 0;
    let marked = 0;
    for (const [key, e] of Object.entries(data.scripture)) {
      if (!isObj(e) || e.refOnly) continue;
      for (const lang of ['ko', 'en']) {
        if (typeof e[lang] !== 'string' || !e[lang]) continue;
        const want = verseDisplayText(e[lang], lang);
        let got;
        try { got = eng.verseDisplay(key, lang); } catch (err) { got = 'THREW ' + err.message; }
        n++;
        if (want !== e[lang]) marked++;
        if (got !== want) { bad++; if (!first) first = { key, lang, got, want }; }
      }
    }
    if (bad) rep.error('engine', 'js/engine.js', `verseDisplay disagrees with the display rule (SPEC 4.3) on ${bad}/${n} texts; e.g. ${first.key} ${first.lang}: "${snip(String(first.got), 40)}", expected "${snip(first.want, 40)}"`);
    else if (n) rep.info('engine', 'js/engine.js', `verseDisplay follows the display rule on ${n} texts (${marked} English excerpt(s) shown with a leading "…")`);
  } else if (typeof eng.verseText === 'function') {
    rep.warn('engine', 'js/engine.js', 'BHS.engine.verseDisplay is not exposed (SPEC 4.3 display rule for excerpts)');
  }
  // Memory-verse card (SPEC 4.6): the engine must show each route's memory verse as the reference does
  // (a trailing "…" only for an excerpt that stops mid-sentence).
  if (typeof eng.memoryDisplay === 'function' && isObj(data.scripture)) {
    const keys = [...new Set(ROUTE_IDS.map((rid) => data.routes[rid] && data.routes[rid].endings && data.routes[rid].endings.good && data.routes[rid].endings.good.verse).filter((k) => typeof k === 'string' && isObj(data.scripture[k]) && !data.scripture[k].refOnly))];
    const bad = [];
    const trailing = [];
    for (const key of keys) {
      for (const lang of ['ko', 'en']) {
        const want = memoryDisplayText(data.scripture[key], lang);
        let got;
        try { got = eng.memoryDisplay(key, lang); } catch (err) { got = 'THREW ' + err.message; }
        if (got !== want) bad.push(`${key} ${lang}: "${snip(String(got), 40)}", expected "${snip(want, 40)}"`);
        else if (/…$/.test(want) && !/…$/.test(data.scripture[key][lang])) trailing.push(`${key} ${lang}`);
      }
    }
    if (bad.length) rep.error('engine', 'js/engine.js', `memoryDisplay disagrees with the memory-card rule (SPEC 4.6): ${bad.slice(0, 2).join('; ')}`);
    else if (keys.length) rep.info('engine', 'js/engine.js', `memory-verse cards follow the display rule for ${keys.join(', ')}${trailing.length ? ` (trailing "…": ${trailing.join(', ')})` : ' (no trailing "…")'}`);
  } else if (typeof eng.verseText === 'function') {
    rep.warn('engine', 'js/engine.js', 'BHS.engine.memoryDisplay is not exposed (SPEC 4.6 memory-card display rule)');
  }
  // The story tree (SPEC 5.8): the engine's tree must match the reference placement.
  if (typeof eng.treeOf === 'function') {
    for (const rid of routes) {
      const route = data.routes[rid];
      if (!isObj(route)) continue;
      let t;
      try { t = eng.treeOf(rid); } catch (e) { t = null; }
      const theirs = t && Array.isArray(t.levels) ? t.levels.map((l) => `${l.id}[${(l.branches || []).map((b) => b.badId).join(',')}]`).join(' ') : 'none';
      const mine = treeLevels(route).map((l) => `${l.id}[${l.branches.join(',')}]`).join(' ');
      if (theirs !== mine) rep.error('engine', rid, `BHS.engine.treeOf gives "${theirs}", the reference tree is "${mine}"`);
      else if (!t.good || t.good.id !== rid + '-good') rep.error('engine', rid, `BHS.engine.treeOf: the true ending id is ${t.good && t.good.id}, expected ${rid}-good`);
    }
  } else rep.warn('engine', 'js/engine.js', 'BHS.engine.treeOf is not exposed (the story tree, SPEC 5.8)');
}

export function formatText(res, meta) {
  const rep = res.report;
  const L = [];
  const E = rep.count('ERROR');
  const W = rep.count('WARN');
  const I = rep.count('INFO');
  L.push('Before He Stood - data validator (tools/validate.mjs)');
  L.push(`Date: ${meta.date}   Node ${process.version}   Root: ${meta.root}`);
  L.push(`Routes: ${meta.routes.join(', ')}${meta.partial ? '   (--partial)' : ''}`);
  L.push('');
  if (meta.status && meta.status.length) {
    L.push('Files');
    for (const s of meta.status) L.push(`  ${pad(s.status, 10)} ${s.rel}${s.bytes ? '  (' + s.bytes + ' bytes)' : ''}`);
    L.push('');
  }
  L.push(`Summary: ${E} ERROR, ${W} WARN, ${I} INFO  ->  ${E ? 'FAIL' : 'PASS'}`);
  for (const level of ['ERROR', 'WARN', 'INFO']) {
    const items = rep.findings.filter((f) => f.level === level);
    L.push('');
    L.push(`${level} (${items.length})`);
    if (!items.length) { L.push('  (none)'); continue; }
    const order = (f) => {
      const r = ROUTE_IDS.findIndex((x) => f.where.startsWith(x));
      return r < 0 ? -1 : r;
    };
    items.sort((a, b) => order(a) - order(b) || a.code.localeCompare(b.code));
    for (const f of items) L.push(`  [${f.code}] ${f.where}: ${f.msg}`);
  }
  for (const s of rep.stats) {
    L.push('');
    L.push(s.title);
    for (const ln of s.lines) L.push('  ' + ln);
  }
  return L.join('\n') + '\n';
}

function parseArgs(argv) {
  const a = { route: null, json: false, partial: false, root: DEFAULT_ROOT, write: true, selftest: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--route') a.route = argv[++i];
    else if (x.startsWith('--route=')) a.route = x.slice(8);
    else if (x === '--json') a.json = true;
    else if (x === '--partial') a.partial = true;
    else if (x === '--root') a.root = path.resolve(argv[++i]);
    else if (x === '--no-write') a.write = false;
    else if (x === '--selftest') a.selftest = true;
    else if (x === '-h' || x === '--help') a.help = true;
    else { a.bad = x; }
  }
  return a;
}

export function runValidation(args) {
  const root = args.root || DEFAULT_ROOT;
  const rep = new Report();
  const spec = parseSpec(root);
  const loaded = loadProject(root, rep, { routeFilter: args.route, partial: args.partial });
  // Source scans: comment language and classic-script rules.
  const scanList = [];
  const addDir = (dir, re) => {
    try { for (const f of fs.readdirSync(path.join(root, dir))) if (re.test(f)) scanList.push(path.posix.join(dir, f)); } catch (e) { /* absent */ }
  };
  addDir('data', /\.js$/);
  addDir('data/routes', /\.js$/);
  addDir('js', /\.js$/);
  addDir('css', /\.css$/);
  addDir('tools', /\.(mjs|js)$/);
  const pages = ['index.html'];
  for (const f of pages) if (fs.existsSync(path.join(root, f))) scanList.push(f);
  for (const rel of scanList) scanSourceFile(rep, root, rel);
  // Forbidden names in the HTML pages (Jonah there is only a WARN: the prophet Jonah may be meant).
  for (const f of pages) {
    let src;
    try { src = fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { continue; }
    const text = src.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
    for (const n of canonFromSpec(spec).forbidden) {
      const re = /^[A-Za-z]+$/.test(n) ? new RegExp('\\b' + n + '\\b') : new RegExp(n);
      if (re.test(text)) rep.add(n === 'Jonah' ? 'WARN' : 'ERROR', 'names', f, `forbidden name variant "${n}" in page text`);
    }
  }
  const res = validateData(loaded.data, { report: rep, spec, root, files: loaded.files, routeFilter: args.route, partial: args.partial });
  const meta = {
    date: new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
    root,
    routes: ROUTE_IDS.filter((r) => !args.route || r === args.route),
    partial: args.partial,
    status: loaded.status
  };
  return { res, meta, loaded };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.bad) {
    if (args.bad) console.error(`Unknown argument: ${args.bad}`);
    console.log('Usage: node tools/validate.mjs [--route scribe|friend|asher] [--json] [--partial] [--root DIR] [--no-write] [--selftest]');
    process.exit(args.bad ? 2 : 0);
  }
  if (args.route && !ROUTE_IDS.includes(args.route)) {
    console.error(`--route must be one of ${ROUTE_IDS.join(', ')}`);
    process.exit(2);
  }
  if (args.selftest) {
    process.exit(selfTest() ? 0 : 1);
  }
  const { res, meta } = runValidation(args);
  const text = formatText(res, meta);
  if (args.write) {
    try {
      fs.mkdirSync(path.join(args.root, 'qa', 'reports'), { recursive: true });
      fs.writeFileSync(path.join(args.root, 'qa', 'reports', 'validate.txt'), text);
    } catch (e) { console.error('could not write qa/reports/validate.txt: ' + e.message); }
  }
  if (args.json) {
    process.stdout.write(JSON.stringify({
      meta, summary: { ERROR: res.report.count('ERROR'), WARN: res.report.count('WARN'), INFO: res.report.count('INFO') },
      findings: res.report.findings, stats: res.report.stats
    }, null, 2) + '\n');
  } else process.stdout.write(text);
  process.exit(res.report.count('ERROR') ? 1 : 0);
}

// ---------------------------------------------------------------------------------------------
// Self-test with inline fixtures (node tools/validate.mjs --selftest)

function T(ko, en) { return { ko, en }; }

const FIX_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
// Extra cut branches for the fixture routes: [choice, option slot, id, ko title, en title]. The first ones
// fill up to the story shape's minimum; the selftest adds the rest to go past its maximum. c3 first, so
// c2 stays the two-option choice; a cut at c5 runs past the cut-path cap (fine for the shape test).
const FIX_EXTRA_BAD = [
  ['c3', 'd', 'detour', '딴길로 새기', 'A Detour'],
  ['c2', 'c', 'figBet', '무화과 내기', 'The Fig Bet'],
  ['c2', 'd', 'byBoat', '배 타고 가기', 'Off by Boat'],
  ['c5', 'd', 'lastWord', '마지막 한마디', 'The Last Word']
];

// Adds the i-th extra cut branch to a fixture route (an option in a free slot, and its ending).
function addFixtureBad(route, i) {
  const [cid, oid, bad, ko, en] = FIX_EXTRA_BAD[i];
  const b = route.beats.find((x) => x.type === 'choice' && x.id === cid);
  if (!b || b.options.some((o) => o.id === oid)) return false;
  b.options.push({ id: oid, text: T('가나다 보기 ' + bad, 'Option ' + bad + '.'), bad });
  b.options.sort((x, y) => OPTION_IDS.indexOf(x.id) - OPTION_IDS.indexOf(y.id));
  route.endings.bad[bad] = {
    title: T(ko, en),
    beats: [{ type: 'line', text: T('가나다 ' + bad + 'one', 'Line ' + bad + 'one.') }, { type: 'line', text: T('가나다 ' + bad + 'two', 'Line ' + bad + 'two.') }],
    last: T('가나다 ' + bad + ' 끝', 'So ' + bad + '.')
  };
  return true;
}

// Expected path counts of a route, from its options alone (cross-checks truePaths/cutPaths): true
// paths multiply the continue options of every choice; each cutting option at choice k counts once per
// combination of continue options before k.
function fixturePathCounts(route, badId) {
  const cont = choicesOf(route).map((b) => optionsOf(b).filter((o) => optionOutcome(o) === 'continue').length);
  const before = (k) => cont.slice(0, k).reduce((a, x) => a * x, 1);
  let cut = 0;
  let cutTo = 0;
  choicesOf(route).forEach((b, k) => {
    optionsOf(b).forEach((o) => {
      if (optionOutcome(o) !== 'bad') return;
      cut += before(k);
      if (o.bad === badId) cutTo += before(k);
    });
  });
  return { truePaths: before(cont.length), cutPaths: cut, cutTo };
}

export function fixtureData(root, opts = {}) {
  // Uses the real meta/characters/scripture/common when available, plus generated story-mode routes
  // (SPEC version 4): five choices with 2-4 options, three scolds, as many cut branches as the story
  // shape asks for at least (SHAPE.bad[0]; one of them reachable from two choices; the latest cut path
  // sits at the 20-screen cap), the crowd sequence, the passerby, and the true ending with the memory
  // verse. No story string carries an ASCII digit.
  const rep = new Report();
  const loaded = loadProject(root, rep, { routeFilter: '__none__', partial: true });
  const d = loaded.data;
  const H = '가나다';
  const ko = (s) => H + ' ' + s;
  const line = (s, sp) => ({ type: 'line', speaker: sp, text: T(ko(s), 'Line ' + s + '.') });
  const opt = (id, s, extra) => Object.assign({ id, text: T(ko('보기 ' + s), 'Option ' + s + '.') }, extra || {});
  const choice = (n, options) => ({ type: 'choice', id: 'c' + n, prompt: T(ko('질문 ' + FIX_WORDS[n]), 'Prompt ' + FIX_WORDS[n] + '?'), options });
  const canon = canonFromSpec(parseSpec(root));
  const pass = { type: 'line', speaker: 'passerby', text: T(canon.passerby.ko, canon.passerby.en) };
  const scolder = { scribe: 'hanan', friend: 'partners', asher: 'yonah' };
  const badEnd = (title, en, s) => ({ title: T(title, en), beats: [line(s + 'one'), line(s + 'two')], last: T(ko(s + ' 끝'), 'So ' + s + '.') });
  const mk = (rid) => {
    const beats = [
      { type: 'scene', bg: rid === 'asher' ? 'asher_ceiling' : 'shore_dawn', caption: T(ko('새벽'), 'Dawn') },
      line('open'), line('dawn'),
      choice(1, [
        opt('a', 'aa', { set: { near: true } }),
        opt('b', 'ab', { bad: 'nap', reaction: [line('yawn')] }),
        opt('c', 'ac', { scold: { speaker: 'thought', text: T(ko('안 된다'), 'Not that.') } }),
        opt('d', 'ad')
      ]),
      line('after'),
      { type: 'scene', bg: rid === 'asher' ? 'sky_carried' : 'lane' },
      pass, line('lane'), line('lanetoo'),
      choice(2, [opt('a', 'ba'), opt('b', 'bb', { bad: 'lane' })]),
      { type: 'scene', bg: rid === 'asher' ? 'crowd_lying' : 'crowd' },
      { type: 'fx', fx: 'light', level: 'soft' }, { type: 'verse', key: 'MT_9_2A' }, { type: 'fx', fx: 'light', level: 'bright' }
    ];
    if (rid === 'asher') beats.push({ type: 'verse', key: 'MT_9_2B1' }, { type: 'verse', key: 'MT_9_2B2' });
    else beats.push({ type: 'verse', key: 'MT_9_2B' });
    beats.push({ type: 'fx', fx: 'light', level: 'soft' });
    if (rid === 'scribe') beats.push({ type: 'verse', key: 'MT_9_3Q', speaker: 'scribes' });
    beats.push(choice(3, [
      opt('a', 'ca', { reaction: [{ type: 'line', when: { flag: 'near', is: true }, text: T(ko('가까이'), 'Close by.') }] }),
      opt('b', 'cb', { scold: { speaker: scolder[rid], text: T(ko('그건 아니지'), 'No way.') } }),
      opt('c', 'cc', { bad: 'guard' })
    ]));
    beats.push({ type: 'verse', key: 'MT_9_4N' }, { type: 'verse', key: 'MT_9_4Q' }, { type: 'verse', key: 'MT_9_5' });
    beats.push(choice(4, [opt('a', 'da'), opt('b', 'db'), opt('c', 'dc', { bad: 'nap' }), opt('d', 'dd', { scold: { text: T(ko('조용히'), 'Hush.') } })]));
    beats.push({ type: 'verse', key: 'MT_9_6A' }, { type: 'verse', key: 'MT_9_6N' }, { type: 'fx', fx: 'light', level: 'bright' }, { type: 'verse', key: 'MT_9_6B' });
    if (rid === 'asher') beats.push({ type: 'press', label: T(ko('일어나기'), 'Get up') });
    beats.push({ type: 'verse', key: 'MT_9_7' }, { type: 'verse', key: 'MT_9_8' }, { type: 'fx', fx: 'light', level: 'soft' });
    beats.push(choice(5, [opt('a', 'ea'), opt('b', 'eb'), opt('c', 'ec')]));
    beats.push({ type: 'fx', fx: 'light', level: 'off' });
    const route = {
      id: rid,
      beats,
      endings: {
        good: { title: T(ko('끝까지'), 'All the Way'), verse: MEMORY_VERSE[rid], beats: [line('home')], last: T(ko('마지막'), 'The last line.') },
        bad: {
          nap: badEnd('낮잠 자기', 'A Nap', 'nap'),
          lane: badEnd('골목에서', 'In the Lane', 'lane'),
          guard: badEnd('수비대', 'The Guardhouse', 'guard')
        }
      }
    };
    // More cut branches until the story shape's minimum, in free option slots before the last choice.
    for (let i = 0; Object.keys(route.endings.bad).length < SHAPE.bad[0] && i < FIX_EXTRA_BAD.length; i++) addFixtureBad(route, i);
    return route;
  };
  d.routes = { scribe: mk('scribe'), friend: mk('friend'), asher: mk('asher') };
  if (opts.withEngine) return { data: d, engine: loaded.data.engine, bhs: loaded.bhs };
  d.engine = null;
  return d;
}

function selfTest() {
  const root = DEFAULT_ROOT;
  const results = [];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const base = fixtureData(root);
  const run = (data, routeFilter) => validateData(data, { root, fixture: true, routeFilter }).report;
  const errorsIn = (rep) => rep.findings.filter((f) => f.level === 'ERROR' && !/^scripture|^data\/scripture|^docs|^meta/.test(f.where));
  const t = (name, fn) => {
    try { const ok = fn(); results.push({ name, ok: !!ok }); } catch (e) { results.push({ name, ok: false, err: e.stack }); }
  };
  const find = (d, rid, pred) => d.routes[rid].beats.find(pred);
  const cho = (d, rid, id) => find(d, rid, (x) => x.type === 'choice' && x.id === id);
  // Pads a route's main beats with narration right before c5, so every true path shows exactly `n` more
  // screens and the cut paths (all cut before c5) stay as they are.
  const pad = (d, rid, n) => {
    const at = d.routes[rid].beats.findIndex((x) => x.type === 'choice' && x.id === 'c5');
    for (let i = 0; i < n; i++) d.routes[rid].beats.splice(at, 0, { type: 'line', text: T('가 채움', 'Filler.') });
  };
  const maxTrue = (d, rid) => Math.max(...truePaths(d.routes[rid]).map((p) => readingStats(simulate(d.routes[rid], d, { picks: p }).out, d).screens));
  const withEngine = () => {
    const fx = fixtureData(root, { withEngine: true });
    if (!fx.engine || !fx.bhs) return null;
    fx.bhs.routes = fx.data.routes;
    return fx;
  };
  t('good fixture has no route/common ERROR', () => {
    const rep = run(clone(base));
    const errs = errorsIn(rep);
    if (errs.length) console.log(errs.map((f) => `   ${f.code} ${f.where}: ${f.msg}`).join('\n'));
    return errs.length === 0;
  });
  t('good fixture: no outcome/shape/screens/canon/ending/schema/cond/digits/voice WARN either', () => {
    const rep = run(clone(base));
    const w = rep.findings.filter((f) => f.level === 'WARN' && ['outcome', 'shape', 'screens', 'canon', 'ending', 'schema', 'cond', 'digits', 'voice'].includes(f.code));
    if (w.length) console.log(w.map((f) => `   ${f.code} ${f.where}: ${f.msg}`).join('\n'));
    return w.length === 0;
  });
  t('paths: true paths = combinations of continue options; cut paths = cutting options after every continue prefix', () => {
    const r = base.routes.scribe;
    // continue options: c1 a,d; c2 a; c3 a; c4 a,b; c5 a,b,c -> 2*1*1*2*3 = 12 true paths
    // cut options: c1 b (1 prefix), c2 b (2), c3 c and the extra branches (2 each), c4 c (2); nap is
    // reachable from c1 b and c4 c (1 + 2 = 3 paths)
    const want = fixturePathCounts(r, 'nap');
    const tp = truePaths(r);
    const cp = cutPaths(r);
    return want.truePaths === 12 && want.cutTo === 3 && tp.length === want.truePaths && cp.length === want.cutPaths &&
      cp.filter((c) => c.bad === 'nap').length === want.cutTo && pathLabel(r, cp[0].picks) === 'b----';
  });
  t('simulation: a scold plays its line and the choice comes back without it; a cut skips the rest', () => {
    const r = base.routes.scribe;
    const s = simulate(r, base, { picks: { c1: 'c' } });
    const i = s.out.findIndex((it) => it.kind === 'line' && /scold/.test(it.phase));
    const again = s.out[i + 1];
    const cut = simulate(r, base, { picks: { c3: 'c' } });
    return s.presentations.c1.length === 2 && s.presentations.c1[1].join('') === 'abd' && again.kind === 'choice' && again.shown.join('') === 'abd' &&
      cut.cut && cut.cut.bad === 'guard' && !cut.out.some((it) => it.kind === 'verse' && it.beat.key === 'MT_9_5') && cut.out[cut.out.length - 1].kind === 'snip';
  });
  t('line speaker jesus -> ERROR guard', () => { const d = clone(base); d.routes.scribe.beats.push({ type: 'line', speaker: 'jesus', text: T('가 a', 'b') }); return run(d).has('ERROR', 'guard', /speaker "jesus"/); });
  t('MT_9_3Q in friend -> ERROR guard', () => { const d = clone(base); d.routes.friend.beats.splice(5, 0, { type: 'verse', key: 'MT_9_3Q' }); return run(d).has('ERROR', 'guard', /MT_9_3Q/); });
  t('passerby altered -> ERROR canon', () => {
    const d = clone(base);
    const b = find(d, 'friend', (x) => x.speaker === 'passerby');
    b.text = T(b.text.ko.replace('사연', '이유'), b.text.en);
    const rep = run(d);
    return rep.has('ERROR', 'canon', /passerby line \(ko\)/) && !rep.has('ERROR', 'canon', /passerby line \(en\)/);
  });
  t('passerby curly apostrophe -> WARN canon only', () => {
    const d = clone(base);
    const b = find(d, 'asher', (x) => x.speaker === 'passerby');
    b.text = T(b.text.ko, b.text.en.replace("'", '’'));
    const rep = run(d);
    return rep.has('WARN', 'canon', /normalizing/) && !rep.has('ERROR', 'canon', /passerby line \(en\) is missing/);
  });
  t('condition on a later choice / unknown choice -> ERROR cond', () => {
    const d = clone(base);
    d.routes.scribe.beats.splice(2, 0, { type: 'line', when: { choice: 'c3', is: 'a' }, text: T('가 x', 'x') });
    const d2 = clone(base);
    d2.routes.scribe.beats.push({ type: 'line', when: { choice: 'c9', is: 'a' }, text: T('가 x', 'x') });
    return run(d).has('ERROR', 'cond', /c3, which does not appear earlier/) && run(d2).has('ERROR', 'cond', /unknown choice id "c9"/);
  });
  t('flag never set / set only later -> ERROR cond', () => {
    const d = clone(base);
    d.routes.scribe.beats.push({ type: 'line', when: { flag: 'nope', is: true }, text: T('가 x', 'x') });
    const d2 = clone(base);
    d2.routes.friend.beats.splice(2, 0, { type: 'line', when: { flag: 'near', is: true }, text: T('가 x', 'x') });
    return run(d).has('ERROR', 'cond', /never set/) && run(d2).has('ERROR', 'cond', /only set later/);
  });
  t('lens conditions of the earlier releases -> ERROR cond', () => {
    const d = clone(base);
    d.routes.scribe.endings.good.beats.push({ type: 'line', when: { lastLens: 2 }, text: T('가 x', 'x') });
    return run(d).has('ERROR', 'cond', /lastLens is a lens condition/);
  });
  t('a cut branch may use only the choices asked before it', () => {
    const d = clone(base);
    d.routes.scribe.endings.bad.guard.beats.push({ type: 'line', when: { choice: 'c4', is: 'a' }, text: T('가 x', 'x') });
    d.routes.scribe.endings.bad.guard.beats.push({ type: 'line', when: { choice: 'c2', is: 'a' }, text: T('가 y', 'y') });
    const rep = run(d);
    return rep.has('ERROR', 'cond', /c4, which is never asked before this cut branch/) && !rep.has('ERROR', 'cond', /c2, which/);
  });
  t('reaction may reference its own choice; two unconditional reaction lines -> WARN', () => {
    const d = clone(base);
    cho(d, 'scribe', 'c2').options[0].reaction = [{ type: 'line', when: { choice: 'c2', is: 'a' }, text: T('가 x', 'x') }];
    const d2 = clone(base);
    cho(d2, 'scribe', 'c2').options[0].reaction = [{ type: 'line', text: T('가 x', 'x') }, { type: 'line', text: T('가 y', 'y') }];
    return !run(d).has('ERROR', 'cond') && run(d2).has('WARN', 'schema', /2 unconditional beats/);
  });
  t('tokens: refOnly / unknown / malformed / var -> ERROR; quotes around a token -> WARN', () => {
    const add = (txt) => { const d = clone(base); d.routes.scribe.beats.push({ type: 'line', text: T('가 ' + txt, 'x ' + txt) }); return run(d); };
    return add('{{v:MT_8_19_20}}').has('ERROR', 'token', /reference-only/) && add('{{r:MT_99_1}}').has('ERROR', 'token', /unknown scripture key/) &&
      add('{{v: MT_9_5}}').has('ERROR', 'token', /malformed/) && add('{{var:getup_count}}').has('ERROR', 'token', /not an action counter/) &&
      add('"{{v:MT_9_5}}"').has('WARN', 'token', /quotation marks/);
  });
  t('unknown bg -> ERROR schema; language and name checks', () => {
    const d = clone(base);
    d.routes.scribe.beats.unshift({ type: 'scene', bg: 'roof' });
    const add = (k, e) => { const x = clone(base); x.routes.friend.beats.push({ type: 'line', text: T(k, e) }); return run(x); };
    return run(d).has('ERROR', 'schema', /unknown bg/) && add('가나다', '가나다라').has('ERROR', 'lang', /mostly Hangul/) &&
      add('Hello there', 'Hello there').has('ERROR', 'lang', /no Hangul/) && add('메나헴이 온다', 'Menahem comes.').has('ERROR', 'names') &&
      add('요나가 온다', 'Jonah comes.').has('ERROR', 'names', /Jonah/);
  });
  t('crowd order swapped / MT_9_7 missing -> ERROR canon on the true paths', () => {
    const d = clone(base);
    const bs = d.routes.scribe.beats;
    const i5 = bs.findIndex((x) => x.key === 'MT_9_5');
    const i4 = bs.findIndex((x) => x.key === 'MT_9_4Q');
    [bs[i5], bs[i4]] = [bs[i4], bs[i5]];
    const d2 = clone(base);
    d2.routes.asher.beats = d2.routes.asher.beats.filter((x) => x.key !== 'MT_9_7');
    const n = truePaths(d2.routes.asher).length;
    return run(d).has('ERROR', 'canon', /crowd sequence/) && run(d2).has('ERROR', 'canon', new RegExp(`MT_9_7 not shown on ${n}/${n} true paths`));
  });
  t('cut paths may stop early: no "not shown" errors from them', () => !run(clone(base)).has(null, 'canon', /not shown/));
  t('choice ids out of order -> ERROR schema', () => { const d = clone(base); cho(d, 'asher', 'c3').id = 'c7'; return run(d).has('ERROR', 'schema', /c1, c2, \.\.\. in beat order/); });
  t('one option or five options -> ERROR schema; option ids out of order -> ERROR schema', () => {
    const d = clone(base);
    cho(d, 'scribe', 'c2').options.pop();
    const d2 = clone(base);
    cho(d2, 'scribe', 'c1').options.push({ id: 'e', text: T('가 e', 'e') });
    const d3 = clone(base);
    cho(d3, 'scribe', 'c4').options[0].id = 'b';
    return run(d).has('ERROR', 'schema', /2-4 options \(SPEC 4\.5\), found 1/) && run(d2).has('ERROR', 'schema', /found 5/) && run(d3).has('ERROR', 'schema', /option ids/);
  });
  t('both bad and scold -> ERROR outcome; bad without its ending / an unreachable ending -> ERROR outcome', () => {
    const d = clone(base);
    Object.assign(cho(d, 'friend', 'c5').options[0], { bad: 'guard', scold: { text: T('가 x', 'x') } });
    const d2 = clone(base);
    cho(d2, 'friend', 'c5').options[0].bad = 'nowhere';
    const d3 = clone(base);
    delete cho(d3, 'friend', 'c3').options[2].bad;
    return run(d).has('ERROR', 'outcome', /exactly one outcome/) && run(d2).has('ERROR', 'outcome', /has no endings\.bad\.nowhere/) &&
      run(d3).has('ERROR', 'outcome', /unreachable/);
  });
  t('scold without text -> ERROR outcome; a scold by Jesus -> ERROR guard', () => {
    const d = clone(base);
    delete cho(d, 'asher', 'c1').options[2].scold.text;
    const d2 = clone(base);
    cho(d2, 'asher', 'c1').options[2].scold.speaker = 'jesus';
    return run(d).has('ERROR', 'outcome', /scold needs a text/) && run(d2).has('ERROR', 'guard', /scold spoken by Jesus/);
  });
  t('a choice with no continue option -> ERROR outcome (dead end, no true path)', () => {
    const d = clone(base);
    cho(d, 'scribe', 'c2').options[0].scold = { text: T('가 x', 'x') };
    const rep = run(d);
    return rep.has('ERROR', 'outcome', /c2 has no continue option/) && rep.has('ERROR', 'outcome', /no true path/);
  });
  t('lens-release fields: cut -> ERROR, lens -> WARN, endings 1/2/3/cut -> ERROR', () => {
    const d = clone(base);
    Object.assign(cho(d, 'scribe', 'c2').options[1], { cut: true, lens: null });
    d.routes.scribe.endings['1'] = { beats: [], last: T('가 x', 'x') };
    const rep = run(d);
    return rep.has('ERROR', 'outcome', /"cut" is the cut option/) && rep.has('WARN', 'obsolete', /"lens" is ignored/) && rep.has('ERROR', 'obsolete', /lens or cut endings/);
  });
  t('true ending: missing -> ERROR; unknown or reference-only memory verse -> ERROR; another verse -> WARN', () => {
    const d = clone(base);
    delete d.routes.friend.endings.good;
    const d2 = clone(base);
    d2.routes.friend.endings.good.verse = 'NOPE_1';
    const d3 = clone(base);
    d3.routes.friend.endings.good.verse = 'MT_20_2';
    const d4 = clone(base);
    d4.routes.friend.endings.good.verse = 'MT_9_6A';
    return run(d).has('ERROR', 'schema', /the true ending/) && run(d2).has('ERROR', 'token', /unknown memory verse/) &&
      run(d3).has('ERROR', 'token', /reference-only/) && run(d4).has('WARN', 'canon', new RegExp(`SPEC 4\\.6 gives ${MEMORY_VERSE.friend} for the friend route`));
  });
  t('cut branch: a long title or a single beat -> WARN ending', () => {
    const d = clone(base);
    d.routes.scribe.endings.bad.nap.title = T('아주 아주 길고 긴 가지 이름', 'A long one');
    d.routes.scribe.endings.bad.lane.beats.pop();
    const rep = run(d);
    return rep.has('WARN', 'ending', /title has 1[0-9] Korean characters/) && rep.has('WARN', 'ending', /shows 1 beat.*endings\.bad\.lane/);
  });
  t('ASCII digits in our own story text -> ERROR digits (inside a token they are fine)', () => {
    const d = clone(base);
    d.routes.scribe.beats.push({ type: 'line', text: T('가 5분만 더', 'Five more minutes.') });
    const d2 = clone(base);
    d2.routes.scribe.beats.push({ type: 'line', text: T('가 {{r:MT_9_5}}', 'See {{r:MT_9_5}}.') });
    return run(d).has('ERROR', 'digits', /5분/) && !run(d2).has('ERROR', 'digits');
  });
  t(`screens: ${SCREENS.trueWarn} on a true path -> fine, ${SCREENS.trueWarn + 1} -> WARN, ${SCREENS.trueMax + 1} -> ERROR; a cut path over ${SCREENS.cutMax} -> ERROR`, () => {
    const m0 = maxTrue(base, 'asher');
    const dOk = clone(base);
    pad(dOk, 'asher', SCREENS.trueWarn - m0);
    const dW = clone(base);
    pad(dW, 'asher', SCREENS.trueWarn + 1 - m0);
    const dE = clone(base);
    pad(dE, 'asher', SCREENS.trueMax + 1 - m0);
    const dC = clone(base);
    for (let i = 0; i < 8; i++) dC.routes.friend.endings.bad.guard.beats.push({ type: 'line', text: T('가 길다', 'Long.') });
    const w = SCREENS.trueWarn + 1;
    return maxTrue(dOk, 'asher') === SCREENS.trueWarn && !run(dOk, 'asher').has(null, 'screens', /true paths (have|exceed)/) &&
      maxTrue(dW, 'asher') === w && run(dW, 'asher').has('WARN', 'screens', new RegExp(`have ${w}(-${SCREENS.trueMax})? screens`)) && !run(dW, 'asher').has('ERROR', 'screens') &&
      run(dE, 'asher').has('ERROR', 'screens', new RegExp(`exceed ${SCREENS.trueMax} screens`)) && run(dC, 'friend').has('ERROR', 'screens', new RegExp(`at most ${SCREENS.cutMax}.*endings\\.bad\\.guard`));
  });
  t('story shape: four choices, too few or too many cut branches, one scold -> WARN shape', () => {
    const d = clone(base);
    d.routes.scribe.beats = d.routes.scribe.beats.filter((x) => !(x.type === 'choice' && x.id === 'c5'));
    // One cut branch fewer than the shape's minimum: its options continue instead.
    const d2 = clone(base);
    const fr = d2.routes.friend;
    for (const id of ['lane', 'guard', 'detour', 'figBet']) {
      if (Object.keys(fr.endings.bad).length < SHAPE.bad[0]) break;
      for (const b of fr.beats) if (b.type === 'choice') for (const o of b.options) if (o.bad === id) delete o.bad;
      delete fr.endings.bad[id];
    }
    const few = Object.keys(fr.endings.bad).length;
    // One cut branch more than the shape's maximum, in the free option slots.
    const d4 = clone(base);
    const ar = d4.routes.asher;
    for (let i = 0; Object.keys(ar.endings.bad).length <= SHAPE.bad[1] && i < FIX_EXTRA_BAD.length; i++) addFixtureBad(ar, i);
    const many = Object.keys(ar.endings.bad).length;
    const d3 = clone(base);
    delete cho(d3, 'asher', 'c3').options[1].scold;
    delete cho(d3, 'asher', 'c4').options[3].scold;
    // "Can't" thoughts are not counted as scolds, so the remaining count is 0 or 1 depending on the fixture.
    return run(d).has('WARN', 'shape', /4 choices/) && few === SHAPE.bad[0] - 1 && run(d2).has('WARN', 'shape', new RegExp(`${few} cut branch`)) &&
      many === SHAPE.bad[1] + 1 && run(d4).has('WARN', 'shape', new RegExp(`${many} cut branch`)) && !run(clone(base)).has('WARN', 'shape', /cut branch/) &&
      run(d3).has('WARN', 'shape', /[01] scold option/);
  });
  t('voice: the scribe narration says 그분 -> WARN; the friend narration says 예수라는 사람 -> WARN', () => {
    const d = clone(base);
    d.routes.scribe.beats.push({ type: 'line', text: T('그분이 말씀하신다.', 'He speaks.') });
    const d2 = clone(base);
    d2.routes.friend.beats.push({ type: 'line', text: T('예수라는 사람이 말한다.', 'This Jesus speaks.') });
    return run(d).has('WARN', 'voice', /scribe POV/) && run(d2).has('WARN', 'voice', /friend POV/);
  });
  t('fx and press checks: highlight not a substring, unknown fx, press with an unknown action', () => {
    const d = clone(base);
    const c1 = cho(d, 'scribe', 'c1');
    c1.options[0].set = { underline: 'he' };
    d.routes.scribe.beats.splice(d.routes.scribe.beats.indexOf(c1) + 1, 0, { type: 'fx', fx: 'echoVerse', key: 'PS_103_3', highlight: { flag: 'underline', map: { he: { ko: ['없는 말'], en: ['who forgives'] } } } });
    const d2 = clone(base);
    d2.routes.scribe.beats.push({ type: 'fx', fx: 'shake' });
    const d3 = clone(base);
    d3.routes.asher.beats.push({ type: 'press', action: 'jump' });
    return run(d).has('ERROR', 'fx', /not a substring/) && run(d2).has('ERROR', 'fx', /unknown fx/) && run(d3).has('ERROR', 'schema', /press action/);
  });
  t('obsolete meta and common fields -> WARN obsolete', () => {
    const d = clone(base);
    d.meta = Object.assign(clone(d.meta), { lenses: { 1: {} } });
    d.common = Object.assign(clone(d.common), { mismatchLine: T('가 x', 'x') });
    const rep = run(d);
    return rep.has('WARN', 'obsolete', /meta\.lenses/) && rep.has('WARN', 'obsolete', /mismatch line/);
  });
  t('real js/engine.js matches the reference on the fixture routes (true paths, cut paths, scolds, Try again)', () => {
    const fx = withEngine();
    if (!fx) return false;
    fx.data.engine = fx.engine;
    const rep = run(fx.data);
    const engErr = rep.findings.filter((f) => f.code === 'engine' && f.level !== 'INFO');
    if (engErr.length) console.log(engErr.map((f) => `   ${f.level} ${f.where}: ${f.msg}`).join('\n'));
    const lines = rep.stats.find((x) => x.title === 'Engine cross-check');
    // Each true path and each cut path runs twice (as planned, and with every scold on the way).
    const want = (rid) => {
      const c = fixturePathCounts(fx.data.routes[rid]);
      return new RegExp(`^${rid}\\s.*${2 * c.truePaths} true-path runs and ${2 * c.cutPaths} cut-path runs.*Try again back at the right choice ${2 * c.cutPaths}/${2 * c.cutPaths}`);
    };
    return !engErr.length && lines && lines.lines.length === 3 && ['scribe', 'friend', 'asher'].every((rid) => lines.lines.some((l) => want(rid).test(l)));
  });
  t('engine cross-check: an engine that keeps scolded options -> ERROR engine', () => {
    const fx = withEngine();
    if (!fx) return false;
    fx.data.engine = Object.assign({}, fx.engine, {
      createGame: (rid, o) => {
        const g = fx.engine.createGame(rid, o);
        const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(g), 'step');
        Object.defineProperty(g, 'step', {
          get() {
            const s = desc.get.call(this);
            if (!s || s.kind !== 'choice' || !s.removed || !s.removed.length) return s;
            const b = fx.data.routes[rid].beats.find((x) => x.type === 'choice' && x.id === s.id);
            return Object.assign({}, s, { options: b.options.map((x) => ({ id: x.id, text: x.text })) });
          }
        });
        return g;
      }
    });
    return run(fx.data, 'scribe').has('ERROR', 'engine', /differs from the SPEC reference/);
  });
  t('engine cross-check: Try again that fails or stays on the snip card -> ERROR engine', () => {
    const broken = (impl) => {
      const fx = withEngine();
      fx.data.engine = Object.assign({}, fx.engine, { createGame: (rid, o) => { const g = fx.engine.createGame(rid, o); g.retry = impl; return g; } });
      return run(fx.data, 'friend');
    };
    return broken(() => false).has('ERROR', 'engine', /retry\(\) on the snip card failed/) && broken(() => true).has('ERROR', 'engine', /Try again shows "snip/);
  });
  t('engine cross-check: treeOf that places a branch at its last choice -> ERROR engine', () => {
    const fx = withEngine();
    if (!fx) return false;
    fx.data.engine = Object.assign({}, fx.engine, {
      treeOf: (rid) => {
        const tr = fx.engine.treeOf(rid);
        tr.levels[0].branches = [];
        return tr;
      }
    });
    return run(fx.data, 'asher').has('ERROR', 'engine', /treeOf gives/);
  });
  t('verse display rule: lowercase English excerpts get a leading "…"; Korean and capitalized text unchanged', () => {
    const scr = { MT_9_2B2: { ko: '네 죄 사함을 받았느니라', en: 'your sins are forgiven.' }, MT_9_2B1: { ko: '작은 자야 안심하라', en: 'Take heart, my son;' } };
    return verseDisplayText('your sins are forgiven.', 'en') === '…your sins are forgiven.' &&
      verseDisplayText('Take heart, my son;', 'en') === 'Take heart, my son;' &&
      verseDisplayText('네 죄 사함을 받았느니라', 'ko') === '네 죄 사함을 받았느니라' &&
      renderText('x {{v:MT_9_2B2}}', 'en', scr) === 'x “…your sins are forgiven.”' &&
      renderText('{{v:MT_9_2B1}}', 'en', scr) === '“Take heart, my son;”';
  });
  t('memory-card display rule: a trailing "…" only for an excerpt that stops mid-sentence', () => {
    const full6 = { ko: '그러나 인자가 권능이 있는 줄을 알게 하려 하노라 하시고 말씀하시되 일어나 가라 하시니', en: 'But that you may know sins”—he then said—“Rise and go home.”' };
    const v6a = { ko: '그러나 인자가 권능이 있는 줄을 알게 하려 하노라', en: 'But that you may know sins', full: full6 };
    const full2 = { ko: '데리고 오거늘 이르시되 작은 자야 안심하라', en: 'They brought him. He said, “Take heart, my son.”' };
    const v2b = { ko: '작은 자야 안심하라', en: 'Take heart, my son.', full: full2 };
    const whole = { ko: full2.ko, en: full2.en, full: full2 };
    const lower = { ko: '안심하라', en: 'my son;', full: { ko: '작은 자야 안심하라 끝', en: 'Take heart, my son; go' } };
    return memoryDisplayText(v6a, 'en') === 'But that you may know sins…' && memoryDisplayText(v6a, 'ko') === v6a.ko + '…' &&
      memoryDisplayText(v2b, 'en') === v2b.en && memoryDisplayText(v2b, 'ko') === v2b.ko &&
      memoryDisplayText(whole, 'en') === whole.en && memoryDisplayText(whole, 'ko') === whole.ko &&
      memoryDisplayText({ ko: '가', en: 'No full verse' }, 'en') === 'No full verse' && memoryDisplayText(lower, 'en') === '…my son;…';
  });
  t('lexer: Korean inside strings is not a comment', () => {
    const lx = lexJs('var a = "// 가"; /* ok */ var r = /\\/\\*x/; // 나\n`${"/*"}` // end');
    return lx.comments.length === 3 && lx.comments.filter((c) => HANGUL_TEST.test(c.text)).length === 1;
  });
  let pass = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.err ? '\n' + r.err : ''}`);
    if (r.ok) pass++;
  }
  console.log(`\nselftest: ${pass}/${results.length} passed`);
  return pass === results.length;
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
}
