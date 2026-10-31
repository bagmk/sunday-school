// tests/routes-smoke.mjs - plays the REAL route files through the engine and reports anything the
// engine cannot handle. Run: node tests/routes-smoke.mjs   (exit code 1 on errors, 0 on warnings only)
// Complements tools/validate.mjs; this checks engine compatibility, not prose rules.
// Version 4 routes (story mode): choices c1..cN with 2-4 options; each option continues, cuts the story
// (bad: id -> endings.bad[id] -> snip card) or is scolded away (scold: { speaker?, text } -> re-ask).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
globalThis.window = globalThis;

const FILES = [
  "data/meta.js",
  "data/characters.js",
  "data/scripture.js",
  "data/common.js",
  "data/ui-strings.js",
  "data/routes/scribe.js",
  "data/routes/friend.js",
  "data/routes/asher.js",
  "js/engine.js",
  "js/art.js"
];
const missingFiles = [];
for (const rel of FILES) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    missingFiles.push(rel);
    continue;
  }
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

const BHS = globalThis.BHS;
const E = BHS.engine;
const errors = [];
const warns = [];
const err = (r, msg) => errors.push(`[${r}] ${msg}`);
const warn = (r, msg) => warns.push(`[${r}] ${msg}`);

const BG_IDS = ["black", "dawn_lamp", "shore_dawn", "asher_ceiling", "asher_home", "lane", "sky_carried", "crowd", "crowd_lying", "road_home", "doorway_evening", "lamp_night"];
const FX = ["light", "hush", "echoVerse", "pinThought", "readReceipt", "unpinThought", "pov", "actionReply", "actionsHide", "actionsShow"];
const PSEUDO = ["narrator", "thought", "sign"];
const TOKEN = /\{\{\s*(v|r|var)\s*:\s*([A-Za-z0-9_]+)\s*\}\}/g;

function isT(t) {
  return t && typeof t === "object" && typeof t.ko === "string" && typeof t.en === "string" && t.ko.length > 0 && t.en.length > 0;
}

function checkT(r, where, t) {
  if (!isT(t)) {
    err(r, `${where}: not a T {ko,en} with both non-empty`);
    return;
  }
  for (const lang of ["ko", "en"]) {
    let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(t[lang]))) {
      const [, kind, key] = m;
      if (kind === "v" || kind === "r") {
        const s = BHS.scripture && BHS.scripture[key];
        if (!s) err(r, `${where}: unknown scripture key ${key}`);
        else if (kind === "v" && s.refOnly) err(r, `${where}: {{v:${key}}} uses a refOnly key`);
      }
    }
    if (/\n/.test(t[lang])) err(r, `${where}: line break inside ${lang}`);
    if (/<[a-z]/i.test(t[lang])) warn(r, `${where}: looks like HTML in ${lang}`);
    if (/[0-9]/.test(t[lang].replace(TOKEN, ""))) err(r, `${where}: ASCII digits on screen in ${lang} (version 4: no numbers)`);
  }
}

function walkBeats(r, route, list, where, ctx) {
  if (!Array.isArray(list)) {
    if (list != null) err(r, `${where}: not an array`);
    return;
  }
  list.forEach((b, i) => {
    const w = `${where}[${i}]${b && b.id ? "#" + b.id : ""}`;
    if (!b || typeof b !== "object") return err(r, `${w}: not an object`);
    switch (b.type) {
      case "scene":
        if (!BG_IDS.includes(b.bg)) err(r, `${w}: unknown bg ${b.bg}`);
        if (b.caption) checkT(r, w + ".caption", b.caption);
        if (b.pov && !["normal", "lying", "standing"].includes(b.pov)) err(r, `${w}: bad pov ${b.pov}`);
        if (b.time && !["day", "evening", "night"].includes(b.time)) err(r, `${w}: bad time ${b.time}`);
        if (BHS.art && BHS.art.ids && !BHS.art.ids.includes(b.bg)) warn(r, `${w}: art module does not list ${b.bg}`);
        break;
      case "line": {
        const sp = b.speaker || "narrator";
        if (!PSEUDO.includes(sp) && !(BHS.characters && BHS.characters[sp])) err(r, `${w}: unknown speaker ${sp}`);
        if (sp === "jesus") err(r, `${w}: Jesus may speak only through verse beats`);
        checkT(r, w + ".text", b.text);
        break;
      }
      case "verse": {
        const s = BHS.scripture && BHS.scripture[b.key];
        if (!s) err(r, `${w}: unknown verse key ${b.key}`);
        else if (s.refOnly) err(r, `${w}: verse beat uses refOnly key ${b.key}`);
        if (b.speaker && !["jesus", "scribes", "narrator"].includes(b.speaker)) err(r, `${w}: bad verse speaker ${b.speaker}`);
        break;
      }
      case "choice": {
        if (ctx.inReaction) err(r, `${w}: choice inside a reaction`);
        ctx.choices.push(b);
        checkT(r, w + ".prompt", b.prompt);
        const n = Array.isArray(b.options) ? b.options.length : 0;
        if (n < 2 || n > 4) err(r, `${w}: needs 2-4 options, has ${n}`);
        let cont = 0;
        (b.options || []).forEach((o, k) => {
          const ow = `${w}.${o && o.id}`;
          if (!o || o.id !== "abcd"[k]) err(r, `${ow}: option ids must be a,b,c,d in order`);
          if (o.cut !== undefined || o.lens !== undefined) err(r, `${ow}: lens/cut fields of the lens releases (version 4 uses bad / scold)`);
          if (o.bad !== undefined && o.scold !== undefined) err(r, `${ow}: both bad and scold`);
          const kind = E.optionOutcome(o);
          if (kind === "continue") cont++;
          if (kind === "bad") ctx.bads.push(o.bad);
          if (kind === "scold") {
            ctx.scolds++;
            checkT(r, ow + ".scold", o.scold.text);
            const sp = o.scold.speaker || "narrator";
            if (!PSEUDO.includes(sp) && !(BHS.characters && BHS.characters[sp])) err(r, `${ow}: unknown scold speaker ${sp}`);
            if (sp === "jesus") err(r, `${ow}: a scold by Jesus`);
          }
          checkT(r, ow + ".text", o.text);
          if (o.set && typeof o.set === "object") Object.keys(o.set).forEach((f) => ctx.flagsSet.add(f));
          if (o.reaction) {
            const unconditional = o.reaction.filter((x) => x && !x.when && x.type !== "fx" && x.type !== "scene").length;
            if (unconditional > 1) warn(r, `${ow}: ${unconditional} unconditional reaction beats (spec: 0-1)`);
            walkBeats(r, route, o.reaction, ow + ".reaction", Object.assign({}, ctx, { inReaction: true }));
          }
        });
        if (!cont) err(r, `${w}: no continue option (a dead end)`);
        break;
      }
      case "fx":
        if (!FX.includes(b.fx)) err(r, `${w}: unknown fx ${b.fx}`);
        if (b.fx === "light" && !["off", "soft", "bright"].includes(b.level)) err(r, `${w}: bad light level ${b.level}`);
        if (b.fx === "pov" && !["normal", "lying", "standing"].includes(b.pov)) err(r, `${w}: bad pov ${b.pov}`);
        if (b.fx === "echoVerse") {
          const s = BHS.scripture && BHS.scripture[b.key];
          if (!s) err(r, `${w}: echoVerse unknown key ${b.key}`);
          if (b.highlight && b.highlight.map && s) {
            Object.entries(b.highlight.map).forEach(([val, m]) => {
              if (m && typeof m === "object") {
                ["ko", "en"].forEach((l) =>
                  (m[l] || []).forEach((sub) => {
                    if (s[l].indexOf(sub) < 0) err(r, `${w}: highlight "${sub}" (${val}/${l}) not found in ${b.key}`);
                  })
                );
              }
            });
            ctx.flagsUsed.add(b.highlight.flag);
          }
        }
        if (b.fx === "pinThought") {
          (b.items || []).forEach((it) => {
            const [kind, ref] = String(it).split(":");
            if (kind === "verse" && !(BHS.scripture && BHS.scripture[ref])) err(r, `${w}: pin verse ${ref} unknown`);
            if (kind === "choice" && !ctx.choices.some((c) => c.id === ref)) err(r, `${w}: pin choice ${ref} not made yet`);
            if (kind !== "verse" && kind !== "choice") err(r, `${w}: bad pin item ${it}`);
          });
        }
        if (b.fx === "actionReply") {
          if (!(route.actions || []).some((a) => a.id === b.action)) err(r, `${w}: actionReply for unknown action ${b.action}`);
          checkT(r, w + ".text", b.text);
        }
        break;
      case "press":
        if (b.action && !(route.actions || []).some((a) => a.id === b.action)) err(r, `${w}: press on unknown action ${b.action}`);
        if (!b.action && !b.label) warn(r, `${w}: press without label or action`);
        if (b.label) checkT(r, w + ".label", b.label);
        if (b.hint) checkT(r, w + ".hint", b.hint);
        break;
      default:
        err(r, `${w}: unknown beat type ${b.type}`);
    }
    if (b.when) checkCond(r, w + ".when", b.when, ctx);
  });
}

function checkCond(r, where, c, ctx) {
  if (Array.isArray(c)) return c.forEach((x) => checkCond(r, where, x, ctx));
  if (!c || typeof c !== "object") return err(r, `${where}: bad condition`);
  const keys = Object.keys(c);
  if (c.all) return c.all.forEach((x) => checkCond(r, where, x, ctx));
  if (c.any) return c.any.forEach((x) => checkCond(r, where, x, ctx));
  if (c.not) return checkCond(r, where, c.not, ctx);
  if ("choice" in c) {
    if (!ctx.choices.some((x) => x.id === c.choice) && !ctx.allowAllChoices) err(r, `${where}: refers to ${c.choice} before it is asked`);
    if (keys.length !== 2 || !("is" in c || "in" in c)) err(r, `${where}: choice condition needs exactly one of is/in`);
    return;
  }
  if ("flag" in c) {
    ctx.flagsUsed.add(c.flag);
    if (keys.length > 2) err(r, `${where}: flag condition has extra keys ${keys}`);
    return;
  }
  if ("lastLens" in c || "c10lens" in c) {
    err(r, `${where}: a lens condition (the lens releases); version 4 has no lenses`);
    return;
  }
  if ("var" in c) {
    warn(r, `${where}: var condition is an engine extension, not in SPEC 4.5`);
    return;
  }
  err(r, `${where}: unknown condition ${JSON.stringify(c)}`);
}

function staticChecks(r) {
  const route = BHS.routes[r];
  const ctx = { choices: [], flagsSet: new Set(), flagsUsed: new Set(), inReaction: false, bads: [], scolds: 0 };
  if (route.id !== r) err(r, `route.id is ${route.id}`);
  (route.actions || []).forEach((a, i) => {
    if (!a.id) err(r, `actions[${i}] without id`);
    checkT(r, `actions[${i}].label`, a.label);
    (a.replies || []).forEach((t, k) => checkT(r, `actions[${i}].replies[${k}]`, t));
  });
  walkBeats(r, route, route.beats, "beats", ctx);
  const ids = ctx.choices.map((c) => c.id);
  if (ids.some((id, i) => id !== "c" + (i + 1))) err(r, `choice ids ${JSON.stringify(ids)} (want c1, c2, ... in order, once each)`);
  const endCtx = Object.assign({}, ctx, { allowAllChoices: true });
  walkBeats(r, route, route.endingPreface, "endingPreface", endCtx);
  const good = route.endings && route.endings.good;
  if (!good) err(r, "endings.good missing");
  else {
    checkT(r, "endings.good.title", good.title);
    const v = BHS.scripture && BHS.scripture[good.verse];
    if (!v || v.refOnly) err(r, `endings.good.verse ${good.verse} is not a verse with text`);
    walkBeats(r, route, good.beats, "endings.good.beats", endCtx);
    checkT(r, "endings.good.last", good.last);
  }
  const bad = (route.endings && route.endings.bad) || {};
  for (const id of ctx.bads) if (!bad[id]) err(r, `bad "${id}" has no endings.bad.${id}`);
  for (const [id, e] of Object.entries(bad)) {
    if (!ctx.bads.includes(id)) err(r, `endings.bad.${id} is unreachable`);
    checkT(r, `endings.bad.${id}.title`, e.title);
    walkBeats(r, route, e.beats, `endings.bad.${id}.beats`, endCtx);
    checkT(r, `endings.bad.${id}.last`, e.last);
  }
  walkBeats(r, route, route.endingCoda, "endingCoda", endCtx);
  ctx.flagsUsed.forEach((f) => {
    if (!ctx.flagsSet.has(f)) err(r, `flag "${f}" is tested but never set`);
  });
}

// Plays one game with a pick function; returns the shown step kinds, screens and how it stopped.
function play(g, picker, max = 3000) {
  let screens = 0;
  const seen = [];
  for (let i = 0; i < max; i++) {
    const s = g.step;
    if (s.kind === "end" || s.kind === "snip") break;
    // Screens as in SPEC 4.5 and tools/validate.mjs: line (the last line too), verse, memory, choice, press.
    if (s.kind === "line" || s.kind === "last" || s.kind === "verse" || s.kind === "memory" || s.kind === "choice" || s.kind === "press") screens++;
    if (s.kind === "line") {
      ["ko", "en"].forEach((l) => {
        const txt = E.plainText(s.text, l, g.state);
        if (/\[[A-Z0-9_]+\]|…”/.test(txt) && /\{\{/.test(JSON.stringify(s.text))) err(g.state.routeId, `unresolved token in "${txt.slice(0, 40)}"`);
      });
    }
    seen.push(s.kind + (s.id ? ":" + s.id : ""));
    if (s.kind === "choice") {
      if (!g.choose(picker(s, g))) {
        err(g.state.routeId, `choose refused at ${s.id}`);
        break;
      }
    } else if (s.kind === "press") g.press();
    else g.next();
  }
  return { screens, seen, stop: g.step.kind, id: g.step.kind === "snip" ? g.step.id : g.state.ending && g.state.ending.id };
}

const report = {};
const routeIds = ["scribe", "friend", "asher"].filter((r) => BHS.routes && BHS.routes[r]);
for (const r of ["scribe", "friend", "asher"]) if (!routeIds.includes(r)) err(r, "route file missing or not registered");

for (const r of routeIds) {
  staticChecks(r);
  const route = BHS.routes[r];
  const out = { truePaths: 0, cutPaths: 0, trueScreens: [], cutScreens: [], scoldsTried: 0, retries: 0 };
  const choices = E.choiceBeats(route);
  const cont = choices.map((cb) => cb.options.filter((o) => E.optionOutcome(o) === "continue").map((o) => o.id));
  // Every true path (each combination of continue options) ends in the true ending.
  const walkTrue = (k, picks) => {
    if (k === choices.length) {
      const res = play(E.createGame(r), (s, g) => picks[s.id] || g.continueOption(s));
      out.truePaths++;
      out.trueScreens.push(res.screens);
      if (res.stop !== "end" || res.id !== r + "-good") err(r, `true path ${JSON.stringify(picks)} stopped at ${res.stop} ${res.id}`);
      if (res.screens > 30) err(r, `true path ${JSON.stringify(picks)}: ${res.screens} screens (max 30)`);
      return;
    }
    for (const id of cont[k]) walkTrue(k + 1, Object.assign({}, picks, { [choices[k].id]: id }));
  };
  walkTrue(0, {});
  // Every cut option along the first true path: its snip card, then Try again back at the same choice.
  choices.forEach((cb) => {
    cb.options.filter((o) => E.optionOutcome(o) === "bad").forEach((o) => {
      const g = E.createGame(r);
      let shown = null;
      const res = play(g, (s, gg) => {
        if (s.id === cb.id) {
          shown = s.options.map((x) => x.id).join("");
          return o.id;
        }
        return gg.continueOption(s);
      });
      out.cutPaths++;
      out.cutScreens.push(res.screens);
      if (res.stop !== "snip" || res.id !== `${r}-bad-${o.bad}`) err(r, `${cb.id}/${o.id} stopped at ${res.stop} ${res.id}, expected the snip card of ${r}-bad-${o.bad}`);
      if (res.screens > 20) err(r, `${cb.id}/${o.id}: ${res.screens} screens on the cut path (max 20)`);
      if (!g.retry() || g.step.kind !== "choice" || g.step.id !== cb.id || g.step.options.map((x) => x.id).join("") !== shown) err(r, `${cb.id}/${o.id}: Try again did not return to ${cb.id} with options ${shown}`);
      else out.retries++;
    });
  });
  // Every scold: the line plays, the option goes, the same choice comes back without it.
  choices.forEach((cb) => {
    cb.options.filter((o) => E.optionOutcome(o) === "scold").forEach((o) => {
      const g = E.createGame(r);
      g.fastForward({ until: (s) => s.kind === "choice" && s.id === cb.id });
      if (!g.choose(o.id)) return err(r, `${cb.id}/${o.id}: the scold option could not be picked`);
      for (let i = 0; i < 6 && g.step.kind !== "choice"; i++) g.next();
      if (g.step.kind !== "choice" || g.step.id !== cb.id || g.step.options.some((x) => x.id === o.id) || !g.step.removed.includes(o.id)) err(r, `${cb.id}/${o.id}: the choice was not asked again without the scolded option`);
      else out.scoldsTried++;
    });
  });
  // A saved game resumes to the same place from any point (random plans, cut paths included).
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let k = 0; k < 40; k++) {
    const pickRandom = (s) => s.options[Math.floor(rnd() * s.options.length)].id;
    const a = E.createGame(r);
    const stopAt = 1 + Math.floor(rnd() * 30);
    const plan = [];
    for (let i = 0; i < stopAt && a.step.kind !== "end" && a.step.kind !== "snip"; i++) {
      if (a.step.kind === "choice") {
        const id = pickRandom(a.step);
        plan.push(id);
        a.choose(id);
      } else if (a.step.kind === "press") a.press();
      else a.next();
    }
    const snap = JSON.parse(JSON.stringify(a.serialize()));
    if (!E.canRestore(snap)) {
      err(r, `canRestore refused a fresh snapshot (${a.step.kind})`);
      continue;
    }
    const b = E.restoreGame(snap);
    const ra = play(a, (s, g) => g.continueOption(s));
    const rb = play(b, (s, g) => g.continueOption(s));
    if (JSON.stringify(ra) !== JSON.stringify(rb)) err(r, `resume after ${stopAt} steps differs from the uninterrupted game`);
  }
  const mm = (arr) => (arr.length ? [Math.min(...arr), Math.max(...arr)] : null);
  report[r] = { truePaths: out.truePaths, trueScreensMinMax: mm(out.trueScreens), cutPaths: out.cutPaths, cutScreensMinMax: mm(out.cutScreens), tryAgainOk: out.retries, scoldsOk: out.scoldsTried, tree: E.treeOf(r).levels.map((l) => l.id + "[" + l.branches.map((b) => b.badId).join(",") + "]").join(" ") };
}

E.warnings.forEach((w) => warns.push("[engine] " + w));
console.log(JSON.stringify(report, null, 1));
if (missingFiles.length) console.log("missing files:", missingFiles.join(", "));
const uniq = (a) => Array.from(new Set(a));
uniq(warns).forEach((w) => console.log("WARN  " + w));
uniq(errors).forEach((e) => console.log("ERROR " + e));
console.log(`\nroutes-smoke: ${uniq(errors).length} errors, ${uniq(warns).length} warnings`);
process.exit(errors.length ? 1 : 0);
