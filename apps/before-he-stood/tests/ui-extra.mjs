// tests/ui-extra.mjs - focused browser checks that complement tests/ui-playtest.mjs (SPEC version 4).
// At the end it also runs tests/ui-input.mjs (input guards, title keys, deep links, fonts, storage,
// clicker choices, layout fixes), which can run on its own too.
// Run: node tests/ui-extra.mjs [--shots]
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const shots = process.argv.includes("--shots");
const shotDir = path.join(root, "qa/engine");
fs.mkdirSync(shotDir, { recursive: true });

// Playwright 1.56.1 lives outside the project (/tmp/pwqa); the browsers are preinstalled in /opt/pw-browsers.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync("/opt/pw-browsers")) process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/pw-browsers";
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("/tmp/pwqa/node_modules/playwright"));
} catch {
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    ({ chromium } = await import("/opt/npm-tools/node_modules/playwright/index.mjs"));
  }
}

const index = pathToFileURL(path.join(root, "index.html")).href;
const fixture = pathToFileURL(path.join(root, "tests/fixture.html")).href;
const failures = [];
const notes = [];
const check = (c, m) => {
  if (!c) failures.push(m);
};
const ignorable = (t) => /fonts\.(googleapis|gstatic)\.com|ERR_TUNNEL_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/.test(t);
const ALL_SEEN = ["scribe", "friend", "asher"];

async function open(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1920, height: 1080 }, deviceScaleFactor: opts.dpr || 1, reducedMotion: opts.reducedMotion || "no-preference" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !ignorable(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(url);
  await page.waitForFunction(() => window.BHS_DEBUG && document.body.dataset.screen);
  return { ctx, page, errors };
}

const state = (page) => page.evaluate(() => window.BHS_DEBUG.state());
const shot = async (page, name) => {
  if (shots) await page.screenshot({ path: path.join(shotDir, name + ".png") });
};

// Every seen id of the loaded routes (each true ending and every cut branch).
const allSeenIds = (page) =>
  page.evaluate((rids) => {
    const E = window.BHS.engine;
    const out = [];
    rids.forEach((rid) => {
      const t = E.treeOf(rid);
      if (!t) return;
      out.push(t.good.id);
      t.levels.forEach((lv) => lv.branches.forEach((b) => out.push(b.id)));
    });
    return out;
  }, ALL_SEEN);

// The story trees on the page as drawn: every label's box (tilt included) against the other labels,
// the trunk, the star, the ending's title, the ground, the name plate and the unseen stubs; labels
// outside their card or on the wrong side; the scissors between the trunk and their label; the smallest
// label text; at a choice point with three branches, the sides alternate and the third grows above the
// first. Returns { scrollY, overX, problems, labels, minFont, fans }.
const treeLayout = (page) =>
  page.evaluate(() => {
    const scr = document.getElementById("screen");
    const R = (el) => el.getBoundingClientRect();
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const out = { scrollY: scr.scrollHeight - scr.clientHeight, overX: document.documentElement.scrollWidth - innerWidth, problems: [], labels: 0, minFont: Infinity, fans: [] };
    document.querySelectorAll("section.tree").forEach((t) => {
      const rid = t.getAttribute("data-route");
      const card = R(t);
      const tags = Array.from(t.querySelectorAll(".branch__tag")).map((el) => ({ el, b: el.closest(".branch"), r: R(el) }));
      const name = (x) => rid + "/" + x.b.getAttribute("data-testid").replace("tree-branch-" + rid + "-", "");
      const fixed = [];
      t.querySelectorAll(".tree__trunk").forEach((el, i) => fixed.push(["trunk" + i, R(el)]));
      [".tree__star", ".tree__goaltitle", ".tree__base", ".tree__ground", ".tree__plate"].forEach((sel) => {
        const el = t.querySelector(sel);
        if (el) fixed.push([sel.slice(7), R(el)]);
      });
      t.querySelectorAll(".tree__crown path").forEach((el, i) => {
        const r = R(el);
        if (r.width > 0) fixed.push(["leaf" + i + " by the star", r]);
      });
      const stubs = Array.from(t.querySelectorAll('.branch[data-state="unseen"] .branch__wood')).map(R);
      const trunk = R(t.querySelector(".tree__trunk"));
      const cx = trunk.left + trunk.width / 2;
      out.labels += tags.length;
      tags.forEach((a, i) => {
        tags.forEach((b, j) => {
          if (j > i && hit(a.r, b.r)) out.problems.push(`${name(a)} overlaps ${name(b)}`);
        });
        fixed.forEach(([k, r]) => {
          if (hit(a.r, r)) out.problems.push(`${name(a)} overlaps the ${k}`);
        });
        stubs.forEach((r) => {
          if (hit(a.r, r)) out.problems.push(`${name(a)} covers an unseen stub`);
        });
        if (a.r.left < card.left - 0.5 || a.r.right > card.right + 0.5 || a.r.top < card.top - 0.5 || a.r.bottom > card.bottom + 0.5) out.problems.push(`${name(a)} leaves its card`);
        const right = a.b.getAttribute("data-side") === "r";
        if (right !== a.r.left > cx) out.problems.push(`${name(a)} sits on the wrong side of the trunk`);
        const snip = a.b.querySelector(".branch__snip");
        if (!snip) out.problems.push(`${name(a)} has no scissors`);
        else {
          const s = R(snip);
          const sx = s.left + s.width / 2;
          const between = right ? sx > cx && sx < a.r.left + s.width * 0.5 : sx < cx && sx > a.r.right - s.width * 0.5;
          if (!between) out.problems.push(`${name(a)}: the scissors are not between the trunk and the label`);
          tags.forEach((b) => {
            if (b !== a && hit(s, b.r)) out.problems.push(`${name(a)}: its scissors lie on ${name(b)}`);
          });
        }
        a.el.querySelectorAll("*").forEach((x) => (out.minFont = Math.min(out.minFont, parseFloat(getComputedStyle(x).fontSize))));
        out.minFont = Math.min(out.minFont, parseFloat(getComputedStyle(a.el).fontSize));
      });
      // A choice point with three branches: sides alternating, the later one on a side higher.
      const byAt = {};
      t.querySelectorAll(".branch").forEach((b) => (byAt[b.getAttribute("data-at")] = (byAt[b.getAttribute("data-at")] || []).concat([b])));
      Object.keys(byAt).forEach((at) => {
        const bs = byAt[at].sort((x, y) => x.getAttribute("data-nth") - y.getAttribute("data-nth"));
        if (bs.length < 3) return;
        const sides = bs.map((b) => b.getAttribute("data-side")).join("");
        out.fans.push(`${rid}@${at}:${sides}`);
        if (sides !== "rlr" && sides !== "lrl") out.problems.push(`${rid}: the branches of one choice point do not alternate sides (${sides})`);
        const tagOf = (b) => b.querySelector(".branch__tag");
        if (tagOf(bs[0]) && tagOf(bs[2])) {
          const y = (b) => {
            const r = R(tagOf(b));
            return r.top + r.height / 2;
          };
          if (!(y(bs[2]) < y(bs[0]) - 1)) out.problems.push(`${rid}: the third branch of a choice point does not grow above the first on its side`);
        }
      });
    });
    return out;
  });

// Clicks through the story until `pred` holds. At a choice it picks `picks[id]` when shown, else the
// first continue option; on a snip card it tries again.
async function toStep(page, pred, max = 400, picks = {}) {
  for (let i = 0; i < max; i++) {
    const s = await page.evaluate(() => {
      const g = window.BHS_DEBUG.game();
      const echo = document.getElementById("echo");
      return { st: window.BHS_DEBUG.state(), step: g && g.step, echo: !!(echo && !echo.hidden), cont: g && g.step && g.step.kind === "choice" ? g.continueOption(g.step) : null };
    });
    if (pred(s)) return s;
    const k = s.step && s.step.kind;
    if (k === "choice") {
      const want = picks[s.step.id];
      const id = want && s.step.options.some((o) => o.id === want) ? want : s.cont;
      await page.click(`[data-testid="choice-${id}"]`);
    } else if (k === "press") await page.click('[data-testid="press"]');
    else if (k === "snip") await page.click('[data-testid="snip-retry"]');
    else if (s.st.screen === "tree" || s.st.screen === "routeSelect" || s.st.screen === "title") throw new Error("step not reached (at " + s.st.screen + ")");
    else await page.click('[data-testid="advance"]');
  }
  throw new Error("step not reached");
}

// The first option of `kind` ("bad", "scold") along the true path of a route: { choice, option, bad }.
const firstOf = (page, rid, kind) =>
  page.evaluate(
    ([r, k]) => {
      const E = window.BHS.engine;
      for (const cb of E.choiceBeats(E.getRoute(r))) {
        const o = cb.options.find((x) => E.optionOutcome(x) === k);
        if (o) return { choice: cb.id, option: o.id, bad: o.bad || null };
      }
      return null;
    },
    [rid, kind]
  );

const browser = await chromium.launch();
try {
  // 1. Language modes on TV: one language in the plate and the text box; the header toggle keeps the place.
  for (const lang of ["ko", "en"]) {
    const { ctx, page, errors } = await open(browser, index + "?test=1");
    await page.click(`[data-testid="lang-${lang}"]`);
    check((await page.getAttribute(`[data-testid="lang-${lang}"]`, "aria-pressed")) === "true", `${lang}: title toggle pressed`);
    await page.click('[data-testid="start"]');
    await toStep(page, (s) => s.st.screen === "routeSelect");
    await page.click('[data-testid="route-scribe"]');
    const s = await toStep(page, (x) => x.step && x.step.kind === "line" && !["narrator", "thought", "sign"].includes(x.step.speaker || "narrator"));
    const name = await page.evaluate((id) => window.BHS.characters[id].name, s.step.speaker);
    const plate = await page.textContent('[data-testid="speaker"]');
    check(plate.trim() === name[lang], `${lang}: plate shows one language (${plate.trim()}, expected ${name[lang]})`);
    const text = await page.textContent('[data-testid="textbox"]');
    check(lang === "ko" ? /[가-힣]/.test(text) && !/[A-Za-z]{4,}/.test(text) : !/[가-힣]/.test(text), `${lang}: text box shows one language`);
    await shot(page, `tv-lang-${lang}-line`);
    await toStep(page, (x) => x.step && x.step.kind === "choice");
    await shot(page, `tv-lang-${lang}-choice`);
    const before = await state(page);
    await page.click('[data-testid="hdr-lang-both"]');
    const after = await state(page);
    check(after.lang === "both" && after.beatIndex === before.beatIndex && after.options.join() === before.options.join(), `${lang}: header language switch keeps the place`);
    check(errors.length === 0, `${lang}: console errors ${errors.join(" | ")}`);
    await ctx.close();
  }

  // 2. Reduced motion: no typewriter even without ?test=1.
  {
    const { ctx, page, errors } = await open(browser, index + "#friend", { reducedMotion: "reduce" });
    await page.waitForTimeout(50);
    const st = await state(page);
    check(st.typing === false, "reduced motion: text appears at once");
    check(errors.length === 0, "reduced motion: console errors " + errors.join(" | "));
    await ctx.close();
  }

  // 2b. "Both" mode types the two languages in parallel: every language starts at t = 0 and the last
  //     characters land together. First the timeline itself, exactly ...
  {
    const { ctx, page, errors } = await open(browser, index + "?test=1");
    const r = await page.evaluate(() => {
      const mk = (str) => Array.from(str).map((ch) => ({ textContent: ch }));
      const ko = mk("등잔불이 흔들린다. 두루마리가 펼쳐져 있다.");
      const en = mk("The lamp flickers. A scroll lies open.");
      const seq = window.BHS.view.typeTimeline([{ chars: ko, rate: 28 }, { chars: en, rate: 28 * 0.4 }]);
      const at = (c) => seq.find((x) => x.c === c).t;
      const one = window.BHS.view.typeTimeline([{ chars: mk("가. 나"), rate: 10 }]).map((x) => x.t);
      return {
        firstKo: at(ko[0]),
        firstEn: at(en[0]),
        lastKo: at(ko[ko.length - 1]),
        lastEn: at(en[en.length - 1]),
        sorted: seq.every((x, i) => i === 0 || seq[i - 1].t <= x.t),
        count: seq.length === ko.length + en.length,
        enMonotone: en.every((c, i) => i === 0 || at(en[i - 1]) <= at(c)),
        single: one
      };
    });
    check(r.firstKo === 0 && r.firstEn === 0, `both mode: both languages start at t=0 (ko ${r.firstKo}, en ${r.firstEn})`);
    check(Math.abs(r.lastKo - r.lastEn) < 1e-6 && r.lastKo > 0, `both mode: last ko and en chars land together (${r.lastKo} / ${r.lastEn})`);
    check(r.sorted && r.count && r.enMonotone, "both mode: one sorted timeline holding every character");
    check(JSON.stringify(r.single) === JSON.stringify([0, 10, 70, 80]), `one language keeps its natural timeline (${r.single})`);
    check(errors.length === 0, "timeline: console errors " + errors.join(" | "));
    await ctx.close();
  }
  // ... then the live typewriter on the first scribe line: within one animation frame (about 17 ms).
  {
    const init = () => {
      try {
        localStorage.setItem("bhs.v1.settings", JSON.stringify({ lang: "both", speed: "normal", size: 1 }));
      } catch (e) {
        /* storage off */
      }
      window.__typed = [];
      document.addEventListener("DOMContentLoaded", () => {
        new MutationObserver((list) => {
          const now = performance.now();
          for (const m of list) {
            const el = m.target;
            if (el.className !== "c on" || el.__seen) continue;
            el.__seen = true;
            const p = el.closest("p");
            const all = p ? Array.from(p.querySelectorAll("span.c")) : [];
            window.__typed.push({ lang: p && p.getAttribute("lang"), i: all.indexOf(el), n: all.length, t: now });
          }
        }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["class"] });
      });
    };
    const { ctx, page, errors } = await open(browser, index + "#scribe", { init });
    await page.waitForFunction(() => window.BHS_DEBUG && window.BHS_DEBUG.state().typing === false, null, { timeout: 15000 });
    const r = await page.evaluate(() => {
      const pick = (lang, which) => {
        const xs = window.__typed.filter((x) => x.lang === lang && x.i === (which === "first" ? 0 : x.n - 1));
        return xs.length ? xs[0].t : null;
      };
      return { firstKo: pick("ko", "first"), firstEn: pick("en", "first"), lastKo: pick("ko", "last"), lastEn: pick("en", "last"), n: window.__typed.length };
    });
    const frame = 17;
    check(r.firstKo != null && r.firstEn != null && Math.abs(r.firstEn - r.firstKo) <= frame, `live both mode: English starts with Korean (${JSON.stringify(r)})`);
    check(r.lastKo != null && r.lastEn != null && Math.abs(r.lastKo - r.lastEn) <= frame, `live both mode: the last ko and en chars land within one frame (${r.lastKo} / ${r.lastEn})`);
    notes.push(`live both-mode typing of the first scribe line: ${(r.lastKo - r.firstKo).toFixed(0)} ms, ${r.n} characters`);
    check(errors.length === 0, "live typing: console errors " + errors.join(" | "));
    await ctx.close();
  }

  // 3. Typewriter at normal speed: first tap completes, second tap advances.
  {
    const { ctx, page } = await open(browser, index + "#scribe", { viewport: { width: 390, height: 844 } });
    await page.waitForTimeout(80);
    const s0 = await state(page);
    check(s0.typing === true, "typewriter runs at normal speed");
    await page.click('[data-testid="advance"]');
    const s1 = await state(page);
    check(s1.typing === false && s1.beatIndex === s0.beatIndex, "first tap completes the line");
    await page.waitForTimeout(260);
    await page.click('[data-testid="advance"]');
    const s2 = await state(page);
    check(s2.beatIndex > s1.beatIndex, "second tap advances");
    await ctx.close();
  }

  // 4. 360x640: Asher c1 (long options) wraps without overflow; the last option is reachable.
  {
    const { ctx, page, errors } = await open(browser, index + "?test=1#asher", { viewport: { width: 360, height: 640 }, dpr: 2 });
    const s = await toStep(page, (x) => x.step && x.step.kind === "choice" && x.step.id === "c1");
    const m = await page.evaluate(() => {
      const box = document.getElementById("choices");
      const opts = Array.from(document.querySelectorAll(".opt"));
      return { scroll: box.scrollHeight > box.clientHeight, boxH: box.clientHeight, widthOk: opts.every((o) => o.scrollWidth <= o.clientWidth + 1), docOver: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    check(m.widthOk && !m.docOver, "360x640: options wrap without horizontal overflow");
    notes.push(`360x640 asher c1: sheet ${m.boxH}px tall, scrolls=${m.scroll}`);
    await shot(page, "small-asher-c1");
    const last = s.step.options[s.step.options.length - 1].id;
    await page.click(`[data-testid="choice-${last}"]`);
    const g = await page.evaluate(() => window.BHS_DEBUG.game().state.picks.slice());
    check(g.length === 1 && g[0] === "c1", `360x640: last option (${last}) reachable and clickable`);
    check(errors.length === 0, "360x640: console errors " + errors.join(" | "));
    await ctx.close();
  }

  // 5. No storage at all: the game still plays; the story tree shows this session's true ending.
  {
    const init = () => {
      const deny = () => {
        throw new Error("storage disabled");
      };
      Object.defineProperty(window, "localStorage", { get: deny, configurable: true });
    };
    const { ctx, page, errors } = await open(browser, index + "?test=1", { init });
    const notice = await page.textContent(".notice").catch(() => "");
    check(/저장|Saving/.test(notice || ""), "no storage: title explains that saving is off");
    await page.click('[data-testid="start"]');
    await toStep(page, (s) => s.st.screen === "routeSelect");
    await page.click('[data-testid="route-asher"]');
    const cut = await firstOf(page, "asher", "bad");
    await toStep(page, (s) => s.st.screen === "snip", 400, { [cut.choice]: cut.option });
    await toStep(page, (s) => s.st.screen === "tree", 1500);
    check((await state(page)).screen === "tree", "no storage: reaches the story tree");
    const t = await page.evaluate(() => {
      const tree = document.querySelector('[data-testid="tree-asher"]');
      return { done: tree && tree.getAttribute("data-done"), seen: Array.from(document.querySelectorAll('.branch[data-state="seen"]')).length };
    });
    check(t.done === "true" && t.seen === 1, `no storage: the tree still shows this session's true ending and cut branch (${JSON.stringify(t)})`);
    check(errors.length === 0, "no storage: console errors " + errors.join(" | "));
    await ctx.close();
  }

  // 6. Debug panel: the jump list holds the choices and one entry per cut branch; jumps and auto-play.
  {
    const { ctx, page, errors } = await open(browser, index + "?debug=1&test=1#friend");
    check(await page.isVisible("#debug pre"), "debug panel visible");
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="debug-select"] option')).map((o) => o.value));
    const want = await page.evaluate(() => {
      const E = window.BHS.engine;
      const t = E.treeOf("friend");
      return E.choiceBeats(E.getRoute("friend")).map((c) => c.id).concat(...t.levels.map((lv) => lv.branches.map((b) => "bad:" + b.badId)));
    });
    check(ids.join(",") === want.join(","), `debug jump lists the choices and the cut branches (${ids.join(",")})`);
    await page.selectOption('[data-testid="debug-select"]', "c3");
    await page.click('[data-testid="debug-jump"]');
    let st = await state(page);
    check(st.step === "choice" && st.stepId === "c3" && Object.keys(st.choices).length === 2 && !st.ending, `debug jump lands on c3 (${st.stepId} ${JSON.stringify(st.choices)})`);
    await shot(page, "tv-debug");
    const bad = want.find((x) => /^bad:/.test(x));
    await page.selectOption('[data-testid="debug-select"]', bad);
    await page.click('[data-testid="debug-jump"]');
    st = await state(page);
    check(st.endingKind === "bad" || st.screen === "play", `debug jump into ${bad} starts the branch (${st.screen} ${st.ending})`);
    await page.click('[data-testid="debug-autoplay"]');
    st = await state(page);
    check(st.screen === "tree", `debug auto-play tries again and reaches the story tree (${st.screen})`);
    check((await page.getAttribute('[data-testid="tree-friend"]', "data-done")) === "true", "debug auto-play: the true ending is marked seen");
    check(errors.length === 0, "debug: console errors " + errors.join(" | "));
    await ctx.close();
  }

  // 7. Continue mid-route after a reload.
  {
    const { ctx, page } = await open(browser, index + "?test=1#scribe");
    const s = await toStep(page, (x) => x.step && x.step.kind === "choice" && x.step.id === "c3");
    await page.click(`[data-testid="choice-${s.cont}"]`);
    const before = await state(page);
    await page.goto(index + "?test=1");
    await page.waitForSelector('[data-testid="continue"]');
    await page.click('[data-testid="continue"]');
    const after = await state(page);
    check(after.routeId === "scribe" && after.beatIndex === before.beatIndex && after.choices.c3 === s.cont, `continue restores the place (${before.beatIndex} -> ${after.beatIndex})`);
    await ctx.close();
  }

  // 7b. Continue during the true ending after a reload, then finish: the tree marks it.
  {
    const { ctx, page, errors } = await open(browser, index + "?test=1#friend");
    const s = await toStep(page, (x) => x.st.screen === "ending" && x.step && x.step.kind === "last", 900);
    await page.goto(index + "?test=1");
    await page.waitForSelector('[data-testid="continue"]');
    await page.click('[data-testid="continue"]');
    const after = await state(page);
    check(after.screen === "ending" && after.list === s.st.list && after.beatIndex === s.st.beatIndex, `continue restores the ending screen (${after.screen} ${after.list}#${after.beatIndex})`);
    await page.click('[data-testid="advance"]');
    await page.waitForFunction(() => document.body.dataset.screen === "tree");
    check((await page.getAttribute('[data-testid="tree-friend"]', "data-done")) === "true", "resumed true ending is marked on the tree");
    check(errors.length === 0, "resume in ending: console errors " + errors.join(" | "));
    await ctx.close();
  }

  // 7c. A snip card survives a reload: Continue shows it again and Try again still returns to the choice;
  //     "Title screen" on the card saves the choice before the cut.
  {
    const { ctx, page, errors } = await open(browser, index + "?test=1#scribe");
    const cut = await firstOf(page, "scribe", "bad");
    await toStep(page, (x) => x.st.screen === "snip", 400, { [cut.choice]: cut.option });
    await page.goto(index + "?test=1");
    await page.waitForSelector('[data-testid="continue"]');
    await page.click('[data-testid="continue"]');
    let st = await state(page);
    check(st.screen === "snip" && st.bad === cut.bad && st.canRetry, `continue restores the snip card (${st.screen} ${st.bad})`);
    await page.click('[data-testid="snip-retry"]');
    st = await state(page);
    check(st.screen === "play" && st.step === "choice" && st.stepId === cut.choice && !st.ending, `Try again after a reload returns to ${cut.choice} (${st.stepId})`);
    const marked = await page.getAttribute(`[data-testid="choice-${cut.option}"]`, "data-snipped");
    check(marked === "true", "the tried option carries the scissors mark");
    await page.click(`[data-testid="choice-${cut.option}"]`);
    await toStep(page, (x) => x.st.screen === "snip", 100);
    await page.click('[data-testid="snip-home"]');
    await page.waitForSelector('[data-testid="continue"]');
    await page.click('[data-testid="continue"]');
    st = await state(page);
    check(st.screen === "play" && st.stepId === cut.choice && !st.ending, `"Title screen" on the snip card, then Continue: back at ${cut.choice} (${st.stepId})`);
    check(errors.length === 0, "snip resume: console errors " + errors.join(" | "));
    await ctx.close();
  }

  // 8. Fixture routes (every beat type, FX and outcome) end to end: every scold and cut branch once,
  //    then the true ending and the story tree.
  for (const rid of ["scribe", "friend", "asher"]) {
    const { ctx, page, errors } = await open(browser, fixture + "?test=1#" + rid);
    const tried = new Set();
    let snips = 0;
    let scolds = 0;
    for (let i = 0; i < 800; i++) {
      const s = await page.evaluate((r) => {
        const g = window.BHS_DEBUG.game();
        const E = window.BHS.engine;
        const st = window.BHS_DEBUG.state();
        let outs = null;
        if (g && g.step && g.step.kind === "choice") {
          const b = E.findChoice(E.getRoute(r), g.step.id);
          outs = g.step.options.map((o) => ({ id: o.id, kind: E.optionOutcome(E.findOption(b, o.id)) }));
        }
        return { st, step: g && g.step, outs, cont: outs ? g.continueOption(g.step) : null };
      }, rid);
      if (s.st.screen === "tree") break;
      const k = s.step && s.step.kind;
      if (k === "choice") {
        const other = s.outs.find((o) => o.kind !== "continue" && !tried.has(s.step.id + o.id));
        const id = other ? other.id : s.cont;
        if (other) {
          tried.add(s.step.id + other.id);
          if (other.kind === "scold") scolds++;
        }
        await page.click(`[data-testid="choice-${id}"]`);
      } else if (k === "press") await page.click('[data-testid="press"]');
      else if (k === "snip") {
        snips++;
        await page.click('[data-testid="snip-retry"]');
      } else await page.click('[data-testid="advance"]');
    }
    const t = await page.evaluate((r) => {
      const tree = document.querySelector(`[data-testid="tree-${r}"]`);
      return tree ? { done: tree.getAttribute("data-done"), seen: tree.querySelectorAll('.branch[data-state="seen"]').length, all: tree.querySelectorAll(".branch").length } : null;
    }, rid);
    check(t && t.done === "true" && t.seen === t.all, `fixture ${rid}: tree finished with every cut branch seen (${JSON.stringify(t)})`);
    notes.push(`fixture ${rid}: ${snips} snip cards, ${scolds} scolds`);
    check(errors.length === 0, `fixture ${rid}: console errors ${errors.join(" | ")}`);
    await ctx.close();
  }

  // 8a. The scolded option leaves gently (outside test mode): it stays in place, fades out and is gone,
  //     the other options keep their order and no number shows anywhere.
  {
    const init = () => {
      try {
        localStorage.setItem("bhs.v1.settings", JSON.stringify({ lang: "both", speed: "instant", size: 1 }));
      } catch (e) {
        /* storage off */
      }
    };
    const { ctx, page, errors } = await open(browser, index + "#scribe", { init });
    const sc = await firstOf(page, "scribe", "scold");
    await toStep(page, (x) => x.step && x.step.kind === "choice" && x.step.id === sc.choice, 400);
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="choice-"]')).map((b) => b.getAttribute("data-option")));
    await page.click(`[data-testid="choice-${sc.option}"]`);
    await toStep(page, (x) => x.step && x.step.kind === "choice" && x.step.id === sc.choice, 40);
    const during = await page.evaluate(() => ({
      leaving: Array.from(document.querySelectorAll(".opt--leaving")).map((b) => b.getAttribute("data-leaving")),
      ids: Array.from(document.querySelectorAll('[data-testid^="choice-"]')).map((b) => b.getAttribute("data-option"))
    }));
    await shot(page, "tv-scold-leaving");
    await page.waitForTimeout(1600);
    const after = await page.evaluate(() => ({
      leaving: document.querySelectorAll(".opt--leaving").length,
      ids: Array.from(document.querySelectorAll('[data-testid^="choice-"]')).map((b) => b.getAttribute("data-option")),
      digits: Array.from(document.querySelectorAll(".opt")).some((b) => /[0-9]/.test(b.innerText))
    }));
    const want = before.filter((x) => x !== sc.option);
    check(during.leaving.join() === sc.option && during.ids.join() === want.join(), `scold: ${sc.option} leaves while ${want.join()} stay (${JSON.stringify(during)})`);
    check(after.leaving === 0 && after.ids.join() === want.join() && !after.digits, `scold: the option is gone after the animation (${JSON.stringify(after)})`);
    check(errors.length === 0, "scold animation: console errors " + errors.join(" | "));
    await ctx.close();
  }

  // 8b. Route cards show the protagonist; aria-hidden; never over the text; no overflow on TV
  //     (1920x1080, 1280x720) or phone (390x844); keys 1-3 and arrows work; no portraits -> text-only.
  const toRouteSelect = async (page) => {
    await page.evaluate(() => {
      try {
        localStorage.setItem("bhs.v1.save", JSON.stringify({ v: 3, at: 1, screen: "routeSelect", routeId: null, state: null }));
      } catch (e) {
        /* storage off */
      }
    });
    await page.goto(index + "?test=1");
    await page.click('[data-testid="continue"]');
    await page.waitForFunction(() => document.body.dataset.screen === "routeSelect");
  };
  for (const [w, h, dpr] of [
    [1920, 1080, 1],
    [1280, 720, 1],
    [390, 844, 2]
  ]) {
    const { ctx, page, errors } = await open(browser, index + "?test=1", { viewport: { width: w, height: h }, dpr });
    await toRouteSelect(page);
    const m = await page.evaluate(() => {
      const out = {};
      for (const rid of ["scribe", "friend", "asher"]) {
        const card = document.querySelector(`[data-testid="route-${rid}"]`);
        const art = document.querySelector(`[data-testid="routecard-portrait-${rid}"]`);
        if (!card || !art) {
          out[rid] = null;
          continue;
        }
        const r = (el) => el.getBoundingClientRect();
        const svg = art.querySelector("svg");
        const fig = r(art.querySelector(".routecard__fig"));
        out[rid] = {
          inCard: art.closest(".routecard") === card,
          hidden: art.getAttribute("aria-hidden"),
          lying: art.classList.contains("routecard__art--lying"),
          svg: !!svg && svg.getAttribute("data-portrait"),
          gapTop: r(art).top - r(card.querySelector(".routecard__tag")).bottom,
          gapBottom: r(card.querySelector(".routecard__first")).top - r(art).bottom,
          title: r(card.querySelector(".routecard__title")).bottom <= r(art).top,
          band: Math.round(r(art).height),
          fig: Math.round(fig.height),
          cardH: Math.round(r(card).height),
          digits: /[0-9]/.test(card.innerText)
        };
      }
      const scr = document.getElementById("screen");
      return { cards: out, overX: document.documentElement.scrollWidth - innerWidth, scrollY: scr.scrollHeight - scr.clientHeight };
    });
    const tag = `${w}x${h}`;
    for (const rid of ["scribe", "friend", "asher"]) {
      const c = m.cards[rid];
      check(c && c.inCard && c.hidden === "true" && c.svg === (rid === "scribe" ? "menahem" : rid === "friend" ? "yonah" : "asher"), `${tag} ${rid}: portrait present, aria-hidden, right character (${JSON.stringify(c)})`);
      if (!c) continue;
      check(c.lying === (rid === "asher"), `${tag} ${rid}: ${rid === "asher" ? "Asher lies (never standing)" : "upright bust"}`);
      check(c.gapTop >= -0.5 && c.gapBottom >= -0.5 && c.title, `${tag} ${rid}: the portrait band sits between the tagline and the first line (gaps ${c.gapTop.toFixed(1)} / ${c.gapBottom.toFixed(1)})`);
      check(c.band >= (w > 900 ? 50 : 80), `${tag} ${rid}: the band has room for the figure (${c.band}px)`);
      check(!c.digits, `${tag} ${rid}: no numbers on the route card`);
    }
    check(m.overX <= 1, `${tag}: no horizontal overflow on the route select (${m.overX}px)`);
    if (w > 900) check(m.scrollY <= 1, `${tag}: the route select fits the TV screen (${m.scrollY}px too tall)`);
    notes.push(`${tag} route cards: bands ${["scribe", "friend", "asher"].map((r) => m.cards[r] && m.cards[r].band + "px").join(" / ")} of ${m.cards.scribe && m.cards.scribe.cardH}px cards; figures ${["scribe", "friend", "asher"].map((r) => m.cards[r] && m.cards[r].fig + "px").join(" / ")}`);
    if (w === 1920) {
      await page.keyboard.press("ArrowRight");
      const f1 = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
      await page.keyboard.press("ArrowRight");
      const f2 = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      const f3 = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
      check(f1 === "route-scribe" && f2 === "route-friend" && f3 === "route-asher", `route select: arrows move the focus (${f1}, ${f2}, ${f3})`);
      await page.keyboard.press("3");
      const st = await state(page);
      check(st.screen === "play" && st.routeId === "asher", `route select: key 3 starts the third route (${st.screen} ${st.routeId})`);
    }
    check(errors.length === 0, `${tag} route cards: console errors ${errors.join(" | ")}`);
    await ctx.close();
  }
  {
    // Class flow: the suggested order under the prompt; a route whose true ending was seen gets a
    // "Finished" stamp that covers neither text nor figure (a cut branch alone does not count), and the
    // focus starts on the first unplayed route.
    const { ctx, page, errors } = await open(browser, index + "?test=1");
    const look = async (seen) => {
      await page.evaluate((g) => {
        localStorage.setItem("bhs.v1.gallery", JSON.stringify(g));
      }, seen);
      await toRouteSelect(page);
      return page.evaluate(() => {
        const r = (el) => (el ? el.getBoundingClientRect() : null);
        const cards = {};
        document.querySelectorAll(".routecard").forEach((c) => {
          const badge = c.querySelector('[data-testid^="routecard-played-"]');
          const b = r(badge);
          const fig = r(c.querySelector(".routecard__fig"));
          const tag = r(c.querySelector(".routecard__tag"));
          const first = r(c.querySelector(".routecard__first"));
          cards[c.getAttribute("data-route")] = {
            played: c.getAttribute("data-played"),
            badge: badge ? badge.innerText.trim() : null,
            clear: b ? b.top >= tag.bottom - 0.5 && b.bottom <= first.top + 0.5 && (!fig || b.right <= fig.left + 0.5) : null,
            sr: (c.querySelector(".vh") || {}).textContent || null
          };
        });
        const hint = document.querySelector('[data-testid="routes-hint"]');
        return { cards, focus: document.activeElement && document.activeElement.getAttribute("data-testid"), hint: hint ? hint.innerText : null };
      });
    };
    const none = await look([]);
    check(none.hint && /서기관/.test(none.hint) && /Suggested order/.test(none.hint), `route select: the suggested order shows under the prompt ("${none.hint}")`);
    check(Object.values(none.cards).every((c) => !c.played && !c.badge) && !/^route-/.test(none.focus || ""), `nothing played: no stamp, no focus on a card (${none.focus})`);
    const cutOnly = await look(["scribe-bad-typo"]);
    check(Object.values(cutOnly.cards).every((c) => !c.played), "a cut branch alone does not stamp the route");
    const one = await look(["scribe-good"]);
    check(one.cards.scribe.played === "true" && /^✓ 끝까지 함\s+Finished$/.test(one.cards.scribe.badge || "") && one.cards.scribe.clear, `scribe played: stamp shown clear of text and figure (${JSON.stringify(one.cards.scribe)})`);
    check(/Finished|끝까지 함/.test(one.cards.scribe.sr || ""), "the played status is also in the card's accessible text");
    check(!one.cards.friend.played && !one.cards.asher.played, "only the played route is stamped");
    check(one.focus === "route-friend", `focus starts on the next unplayed route (${one.focus})`);
    await page.keyboard.press("Enter");
    const st = await state(page);
    check(st.screen === "play" && st.routeId === "friend", `Enter starts the focused next route (${st.screen} ${st.routeId})`);
    const two = await look(["scribe-good", "asher-good"]);
    check(two.focus === "route-friend" && two.cards.asher.played === "true" && two.cards.asher.clear, `scribe + asher played: focus on friend, Asher's stamp clear of his figure (${two.focus})`);
    const three = await look(["scribe-good", "friend-good", "asher-good"]);
    check(["scribe", "friend", "asher"].every((k) => three.cards[k].played === "true") && !/^route-/.test(three.focus || ""), `all played: every card stamped, no focus change (${three.focus})`);
    check(errors.length === 0, "played routes: console errors " + errors.join(" | "));
    await ctx.close();
  }
  {
    // Without the portrait module the cards stay text-only, silently.
    const init = () => {
      const B = (window.BHS = window.BHS || {});
      Object.defineProperty(B, "portraits", { get: () => undefined, set: () => {}, configurable: false });
    };
    const { ctx, page, errors } = await open(browser, index + "?test=1", { init });
    await toRouteSelect(page);
    const n = await page.locator('[data-testid^="routecard-portrait-"]').count();
    const cards = await page.locator(".routecard").count();
    check(n === 0 && cards === 3, `no portrait module: text-only cards (${n} portraits, ${cards} cards)`);
    check(errors.length === 0, "no portrait module: console errors " + errors.join(" | "));
    await ctx.close();
  }

  // 8c. Story trees with everything seen fit the screen: the three trees from the title and each
  //     route's tree, at 1920x1080 and 1280x720 without scrolling, on a phone without sideways overflow.
  for (const [w, h, dpr, lang] of [
    [1920, 1080, 1, "both"],
    [1280, 720, 1, "both"],
    [1920, 1080, 1, "en"],
    [390, 844, 2, "both"]
  ]) {
    const { ctx, page, errors } = await open(browser, index + "?test=1", { viewport: { width: w, height: h }, dpr });
    const ids = await allSeenIds(page);
    await page.evaluate(
      ([g, l]) => {
        localStorage.setItem("bhs.v1.gallery", JSON.stringify(g));
        localStorage.setItem("bhs.v1.settings", JSON.stringify({ lang: l, speed: "normal", size: 1 }));
      },
      [ids, lang]
    );
    await page.reload();
    await page.waitForFunction(() => window.BHS_DEBUG && document.body.dataset.screen === "title");
    const tag = `${w}x${h} ${lang}`;
    const measure = () =>
      page.evaluate(() => {
        const scr = document.getElementById("screen");
        const out = [];
        document.querySelectorAll("section.tree, .branch__tag, .tree__plate, .tree__goaltitle, [data-pagebtn]").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.right > innerWidth + 1 || r.left < -1 || (innerWidth > 900 && r.bottom > innerHeight + 1)) out.push((el.className || el.tagName) + " " + Math.round(r.bottom));
        });
        return { overX: document.documentElement.scrollWidth - innerWidth, scrollY: scr.scrollHeight - scr.clientHeight, out: out.slice(0, 3), labels: document.querySelectorAll(".branch__tag").length, done: Array.from(document.querySelectorAll("section.tree")).map((t) => t.getAttribute("data-done")).join() };
      });
    await page.click('[data-testid="trees-open"]');
    let m = await measure();
    check(m.overX <= 1 && (w < 900 || (m.scrollY <= 1 && !m.out.length)), `${tag} story trees: fit the screen (overflow ${m.overX}px, scroll ${m.scrollY}px, outside ${m.out.join("; ")})`);
    check(m.labels === ids.length - 3 && m.done === "true,true,true", `${tag} story trees: every branch labeled, every trunk finished (${m.labels} labels, ${m.done})`);
    let lay = await treeLayout(page);
    check(!lay.problems.length && (w < 900 || lay.minFont >= h * 0.022 - 0.5), `${tag} story trees: labels clear of each other and of the tree (${lay.problems.slice(0, 3).join("; ")}; smallest ${lay.minFont}px)`);
    if (w === 1920 && lang === "both") await shot(page, "tv-trees-all-seen");
    for (const rid of ["scribe", "friend", "asher"]) {
      await page.evaluate((r) => window.BHS_DEBUG.showTree(r), rid);
      m = await measure();
      check(m.overX <= 1 && (w < 900 || (m.scrollY <= 1 && !m.out.length)), `${tag} ${rid} tree: fits the screen (overflow ${m.overX}px, scroll ${m.scrollY}px, outside ${m.out.join("; ")})`);
      lay = await treeLayout(page);
      check(!lay.problems.length, `${tag} ${rid} tree: labels clear of each other and of the tree (${lay.problems.slice(0, 3).join("; ")})`);
    }
    check(errors.length === 0, `${tag} trees: console errors ${errors.join(" | ")}`);
    await ctx.close();
  }

  // 8c2. Story trees at their widest (tests/fixtures/trees-wide.js: seven cut branches per route, three
  //      at one choice point, long titles), every branch seen, in ko / en / both: on a TV (1920x1080,
  //      1280x720) the three trees and each route's tree fit without scrolling; on a phone the page
  //      scrolls only vertically. No label overlaps another label, the trunk, the star, the ending's
  //      title, the ground or the name plate; every label stays inside its card; the scissors sit
  //      between the trunk and their label; unseen stubs stay clear of the labels; on a TV no label
  //      text is below 2.2vh. The branches of the crowded choice point alternate sides, and the later
  //      one on a side grows higher. Resizing the window lays the trees out again.
  {
    const wideFixture = path.join(root, "tests/fixtures/trees-wide.js");
    const install = async (page) => {
      await page.addScriptTag({ path: wideFixture });
      await page.evaluate(() => window.BHS_WIDE_TREES.install().forEach((id) => window.BHS_DEBUG.markSeen(id)));
    };
    const layoutOf = () => treeLayout(page);
    let page = null;
    for (const [w, h, dpr] of [
      [1920, 1080, 1],
      [1280, 720, 1],
      [390, 844, 2]
    ]) {
      for (const lang of ["both", "ko", "en"]) {
        const o = await open(browser, index + "?test=1", { viewport: { width: w, height: h }, dpr });
        page = o.page;
        await page.evaluate((l) => localStorage.setItem("bhs.v1.settings", JSON.stringify({ lang: l, speed: "normal", size: 1 })), lang);
        await page.reload();
        await page.waitForFunction(() => window.BHS_DEBUG && document.body.dataset.screen === "title");
        await install(page);
        const tag = `wide trees ${w}x${h} ${lang}`;
        const tv = w > 900;
        for (const what of ["trees", "scribe", "friend", "asher"]) {
          await page.evaluate((x) => (x === "trees" ? window.BHS_DEBUG.showTrees() : window.BHS_DEBUG.showTree(x)), what);
          const m = await layoutOf();
          const where = `${tag} ${what === "trees" ? "(three trees)" : what + " tree"}`;
          check(m.labels === (what === "trees" ? 21 : 7), `${where}: every branch labeled (${m.labels})`);
          check(!m.problems.length, `${where}: ${m.problems.slice(0, 4).join("; ")}`);
          check(m.overX <= 1 && (!tv || m.scrollY <= 1), `${where}: fits the screen (sideways ${m.overX}px, scroll ${m.scrollY}px)`);
          if (tv) check(m.minFont >= h * 0.022 - 0.5, `${where}: label text at least 2.2vh (${m.minFont.toFixed(1)}px)`);
          if (what === "trees" && lang === "both") check(m.fans.length === 3, `${where}: one crowded choice point per route (${m.fans.join(", ")})`);
          if (w === 1920 && lang === "both" && (what === "trees" || what === "scribe")) await shot(page, `tv-wide-${what}`);
        }
        check(o.errors.length === 0, `${tag}: console errors ${o.errors.join(" | ")}`);
        await o.ctx.close();
      }
    }
    // A window resized from 1080p to 720p (and a larger text size) lays the trees out again.
    {
      const o = await open(browser, index + "?test=1");
      page = o.page;
      await install(page);
      await page.evaluate(() => window.BHS_DEBUG.showTrees());
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForTimeout(400);
      let m = await layoutOf();
      check(!m.problems.length && m.scrollY <= 1 && m.overX <= 1, `wide trees resized to 1280x720: ${m.problems.slice(0, 3).join("; ")} (scroll ${m.scrollY}px)`);
      await page.click('[data-testid="settings-open"]');
      await page.click('[data-testid="size-up"]');
      await page.click('[data-testid="size-up"]');
      await page.click('[data-testid="settings-close"]');
      m = await layoutOf();
      check(!m.problems.length && m.scrollY <= 1 && m.minFont >= 720 * 0.022 - 0.5, `wide trees at a larger text size: ${m.problems.slice(0, 3).join("; ")} (scroll ${m.scrollY}px, smallest ${m.minFont.toFixed(1)}px)`);
      check(o.errors.length === 0, `wide trees resize: console errors ${o.errors.join(" | ")}`);
      await o.ctx.close();
    }
  }

  // 8d. Verse display rule (SPEC 4.3): an English excerpt that starts with a lowercase letter is shown
  //     with a leading "…" on verse cards, in echo boxes and in {{v:}} tokens inside options. Korean is
  //     unchanged and the stored data stays an exact substring of the verse.
  {
    const { ctx, page, errors } = await open(browser, index + "?test=1");
    await page.click('[data-testid="lang-en"]');
    await page.click('[data-testid="start"]');
    await toStep(page, (s) => s.st.screen === "routeSelect");
    await page.click('[data-testid="route-scribe"]');
    const ps = await page.evaluate(() => window.BHS.scripture.PS_103_3);
    await toStep(page, (x) => x.step && x.step.kind === "verse" && x.step.key === "PS_103_3");
    const card = (await page.textContent('[data-testid="textbox"]')).trim();
    check(/^[a-z]/.test(ps.en) && card === "…" + ps.en, `en verse card: "…" before a lowercase excerpt (${card.slice(0, 32)})`);
    await toStep(page, (x) => x.echo, 200);
    const echo = await page.evaluate(() => {
      const e = document.getElementById("echo");
      const span = e.querySelector('[lang="en"]');
      return { text: span ? span.textContent : "", marks: e.querySelectorAll("mark").length };
    });
    check(echo.text === "…" + ps.en && echo.marks >= 1, `en echo box: "…" kept and the noted word still marked (${echo.text.slice(0, 32)}, ${echo.marks} marks)`);
    await shot(page, "tv-verse-ellipsis-echo");
    check(errors.length === 0, "verse ellipsis (en): console errors " + errors.join(" | "));
    await ctx.close();
  }
  {
    // "Both" mode: the English line gets the "…", the Korean line never does; options with {{v:}}
    // tokens too (the fixture's Asher c1 a quotes Ps 103:3).
    const { ctx, page, errors } = await open(browser, index + "?test=1#scribe");
    const ps = await page.evaluate(() => window.BHS.scripture.PS_103_3);
    await toStep(page, (x) => x.step && x.step.kind === "verse" && x.step.key === "PS_103_3");
    const both = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="textbox"]');
      const ko = box.querySelector('[lang="ko"]');
      const en = box.querySelector('[lang="en"]');
      return { lang: window.BHS_DEBUG.state().lang, ko: ko ? ko.textContent : null, en: en ? en.textContent : null };
    });
    check(both.lang === "both" && both.ko === ps.ko && both.en === "…" + ps.en, `both: Korean unchanged, English with "…" (${JSON.stringify(both).slice(0, 120)})`);
    await page.goto(fixture + "?test=1#asher");
    await page.waitForFunction(() => window.BHS_DEBUG && document.body.dataset.screen);
    await toStep(page, (x) => x.step && x.step.kind === "choice" && x.step.id === "c1");
    const optA = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="choice-a"]');
      const ko = b && b.querySelector('[lang="ko"]');
      const en = b && b.querySelector('[lang="en"]');
      return { ko: ko ? ko.textContent : "", en: en ? en.textContent : "" };
    });
    check(optA.en.includes("…" + ps.en) && optA.ko.includes(ps.ko) && !optA.ko.includes("…"), `fixture asher c1 a: {{v:PS_103_3}} shows "…" in English only (${optA.en.slice(0, 30)} / ${optA.ko.slice(0, 12)})`);
    await shot(page, "tv-verse-ellipsis-options");
    check(errors.length === 0, "verse ellipsis (both): console errors " + errors.join(" | "));
    await ctx.close();
  }

  // 9. Larger text on TV keeps the panel inside the screen (friend opens on a choice; go to its first line).
  {
    const { ctx, page } = await open(browser, index + "?test=1#friend");
    await toStep(page, (x) => x.step && x.step.kind === "line" && (x.step.speaker || "narrator") === "narrator", 40);
    await page.click('[data-testid="settings-open"]');
    await page.click('[data-testid="size-up"]');
    await page.click('[data-testid="size-up"]');
    await page.click('[data-testid="settings-close"]');
    const r = await page.evaluate(() => document.getElementById("panel").getBoundingClientRect().toJSON());
    check(r.top > 0 && r.bottom <= 1080, "A+ A+: panel stays on screen");
    await shot(page, "tv-text-larger");
    await ctx.close();
  }
} catch (err) {
  failures.push("crash: " + (err && err.stack ? err.stack.split("\n").slice(0, 3).join(" / ") : err));
} finally {
  await browser.close();
}
// Input, guards, deep links, storage and layout checks from the v4 audits (tests/ui-input.mjs, which
// also runs on its own).
try {
  const { runInputChecks } = await import("./ui-input.mjs");
  const r = await runInputChecks(chromium);
  r.notes.forEach((n) => notes.push("input: " + n));
  r.failures.forEach((f) => failures.push("input: " + f));
} catch (err) {
  failures.push("ui-input crash: " + (err && err.stack ? err.stack.split("\n").slice(0, 3).join(" / ") : err));
}
notes.forEach((n) => console.log("note  " + n));
failures.forEach((f) => console.log("FAIL  " + f));
console.log(`\nui-extra: ${failures.length} failures`);
process.exit(failures.length ? 1 : 0);
