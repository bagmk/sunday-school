// tests/ui-playtest.mjs - browser playtest of index.html with Playwright (Chromium), SPEC version 4.
// Run: node tests/ui-playtest.mjs [--shots] [--sizes=phone,tv,hd] [--url=<file or http url>]
// Per size: the title, prologue, route select, settings and the home dialog; every route played to its
// true ending with one cut branch (snip card, Try again back at the same choice with the same options)
// and one scold (the option leaves, the choice is asked again) on the way; the true ending's title card,
// memory-verse card and story tree; one route keyboard-only. Checks console errors and the QA hooks;
// with --shots saves screenshots to qa/engine/.
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);

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

const SIZES = {
  phone: { width: 390, height: 844, dpr: 2 },
  tv: { width: 1920, height: 1080, dpr: 1 },
  hd: { width: 1280, height: 720, dpr: 1 },
  small: { width: 360, height: 640, dpr: 2 }
};
const sizes = String(args.sizes || "phone,tv,hd").split(",");
const baseUrl = args.url || pathToFileURL(path.join(root, "index.html")).href;
const shotDir = path.join(root, "qa/engine");
if (args.shots) fs.mkdirSync(shotDir, { recursive: true });

const failures = [];
const notes = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

function ignorable(text) {
  // Google Fonts are optional; the sandbox has no route to them.
  return /fonts\.(googleapis|gstatic)\.com|ERR_TUNNEL_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/.test(text);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const g = window.BHS_DEBUG && window.BHS_DEBUG.game();
    const shown = Array.from(document.querySelectorAll('[data-testid^="choice-"]')).map((b) => b.getAttribute("data-option"));
    return {
      st: window.BHS_DEBUG ? window.BHS_DEBUG.state() : null,
      step: g ? g.step : null,
      stage: g ? g.state.stage : null,
      now: g ? g.state.now : null,
      screen: document.body.dataset.screen,
      shown,
      snipped: Array.from(document.querySelectorAll('[data-testid^="choice-"][data-snipped="true"]')).map((b) => b.getAttribute("data-option")),
      badges: document.querySelectorAll(".opt__num").length,
      optionDigits: Array.from(document.querySelectorAll('[data-testid^="choice-"]')).some((b) => /[0-9]/.test(b.innerText))
    };
  });
}

// Outcome of every option of a choice, read from the loaded route data through the engine.
async function outcomes(page, routeId, choiceId) {
  return page.evaluate(
    ([rid, cid]) => {
      const E = window.BHS.engine;
      const b = E.findChoice(E.getRoute(rid), cid);
      const out = {};
      (b ? b.options : []).forEach((o) => {
        out[o.id] = { kind: E.optionOutcome(o), bad: o.bad || null };
      });
      return out;
    },
    [routeId, choiceId]
  );
}

async function shot(page, name) {
  if (!args.shots) return;
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(shotDir, name + ".png") });
}

async function newPage(browser, sizeName, extra = "") {
  const sz = SIZES[sizeName];
  const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: sz.dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !ignorable(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => {
    if (!ignorable(r.url() + " " + (r.failure() && r.failure().errorText))) errors.push("requestfailed: " + r.url());
  });
  page.on("dialog", (d) => {
    errors.push("native dialog used: " + d.type());
    d.dismiss();
  });
  const url = baseUrl + (baseUrl.includes("?") ? "&" : "?") + "test=1" + extra;
  return { ctx, page, errors, url };
}

async function noHorizontalScroll(page, label) {
  const over = await page.evaluate(() => {
    const els = [document.documentElement, document.body, document.getElementById("screen")];
    return els.some((el) => el && el.scrollWidth > el.clientWidth + 1);
  });
  check(!over, `${label}: horizontal overflow`);
}

async function minFontPx(page) {
  // Smallest rendered font size among visible text nodes (debug panel and screen-reader text excluded).
  return page.evaluate(() => {
    let min = 1e9;
    let who = "";
    const walker = document.createTreeWalker(document.getElementById("app"), NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest(".debug") || el.closest("[hidden]") || el.closest(".vh")) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      const fs = parseFloat(cs.fontSize);
      if (fs < min) {
        min = fs;
        who = el.className + " :: " + n.textContent.trim().slice(0, 30);
      }
    }
    return { min, who };
  });
}

// Plays a route from its deep link to the story tree. At the first choice that has one, it takes a
// scold (checks the re-ask) and, at the first choice that has one, a cut branch (checks the snip card
// and Try again); otherwise the first continue option.
async function fullRoute(browser, sizeName, routeId, opts = {}) {
  const { ctx, page, errors, url } = await newPage(browser, sizeName);
  const tag = `${sizeName}/${routeId}`;
  await page.goto(url + "#" + routeId);
  await page.waitForSelector('[data-testid="advance"]');
  let s = await snapshot(page);
  check(s.screen === "play", `${tag}: deep link should open play, got ${s.screen}`);
  const vh = SIZES[sizeName].height;
  const taken = new Set();
  const shots = opts.shots || {};
  let minStory = 1e9;
  let didScold = false;
  let didCut = false;
  let pending = null;
  let sawCard = false;
  let sawMemory = false;
  let sawLast = false;
  const choiceHeights = [];
  for (let i = 0; i < 1500; i++) {
    s = await snapshot(page);
    const step = s.step || {};
    for (const [name, pred] of Object.entries(shots)) {
      if (!taken.has(name) && pred(s)) {
        taken.add(name);
        await shot(page, `${sizeName}-${name}`);
      }
    }
    if (s.screen === "tree") break;
    if (s.screen === "routeSelect" || s.screen === "title") throw new Error(`${tag}: reached ${s.screen} before the story tree`);
    if (step.kind === "line" && i % 3 === 0) {
      const protagonist = { scribe: "menahem", friend: "yonah", asher: "asher" }[routeId];
      const own = await page.locator(`[data-testid="portrait-${protagonist}"]`).count();
      check(own === 0, `${tag}: protagonist portrait shown at ${s.st.list}#${s.st.beatIndex}`);
    }
    if (step.kind === "line" && i % 7 === 0) {
      const fsz = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#text p")).fontSize));
      minStory = Math.min(minStory, fsz);
    }
    if (s.screen === "endingCard") {
      sawCard = true;
      const t = await page.textContent('[data-testid="ending-title"]');
      check(!/[0-9①②③]/.test(t), `${tag}: the title card shows no number ("${t.trim()}")`);
    }
    if (step.kind === "memory") {
      sawMemory = true;
      check((await page.locator('[data-testid="memory-verse"]').count()) === 1, `${tag}: the memory verse shows on its own card`);
      const ref = await page.textContent("#ref");
      check(ref && ref.trim().length > 0, `${tag}: the memory verse shows its reference`);
    }
    if (step.kind === "last") sawLast = true;
    if (s.screen === "snip") {
      check(pending && pending.type === "bad", `${tag}: a snip card without a cutting pick`);
      const card = await page.evaluate(() => {
        const c = document.querySelector('[data-testid="snip-card"]');
        return c ? { branch: c.getAttribute("data-branch"), text: c.innerText, focus: document.activeElement && document.activeElement.getAttribute("data-testid") } : null;
      });
      check(card && card.branch === pending.bad, `${tag}: the snip card belongs to ${pending && pending.bad} (${card && card.branch})`);
      check(card && /싹둑|Snip/.test(card.text) && /이야기가 끊겼어요|story got cut off/.test(card.text), `${tag}: the snip card shows the stamp and the line`);
      check(card && !/[0-9]/.test(card.text), `${tag}: the snip card shows no number`);
      check(card && card.focus === "snip-retry", `${tag}: Try again has the focus (${card && card.focus})`);
      check(s.st.seen.includes(`${routeId}-bad-${pending.bad}`), `${tag}: the cut branch is stored as seen`);
      await shot(page, `${sizeName}-${routeId}-snip`);
      await page.click('[data-testid="snip-retry"]');
      pending = Object.assign({}, pending, { type: "retry" });
      continue;
    }
    if (step.kind === "choice") {
      check(s.badges === 0 && !s.optionDigits, `${tag}: ${step.id} options show no numbers`);
      check(s.shown.length >= 1 && s.shown.length <= 4, `${tag}: ${step.id} shows ${s.shown.length} options`);
      if (pending && pending.type === "retry") {
        check(step.id === pending.cid && s.shown.join() === pending.shown.join(), `${tag}: Try again returns to ${pending.cid} with ${pending.shown.join()} (got ${step.id} with ${s.shown.join()})`);
        check(s.snipped.includes(pending.opt), `${tag}: the tried option carries the scissors mark after Try again`);
        pending = null;
      } else if (pending && pending.type === "scold") {
        const want = pending.shown.filter((x) => x !== pending.opt);
        check(step.id === pending.cid && s.shown.join() === want.join(), `${tag}: the scold at ${pending.cid}/${pending.opt} asks again with ${want.join()} (got ${step.id} with ${s.shown.join()})`);
        check(!s.st.choices[step.id] && (s.st.removed[step.id] || []).includes(pending.opt), `${tag}: a scolded pick is removed and not recorded`);
        pending = null;
      } else if (pending) {
        check(false, `${tag}: ${pending.type} at ${pending.cid} never came back`);
        pending = null;
      }
      if (sizeName !== "phone") {
        const m = await page.evaluate(() => {
          const box = document.getElementById("choices");
          const r = box.getBoundingClientRect();
          return { h: r.height, top: r.top, scroll: box.scrollHeight > box.clientHeight + 1, stacked: box.classList.contains("is-stacked"), away: document.getElementById("cast").classList.contains("is-away") };
        });
        choiceHeights.push({ id: step.id, pct: Math.round((100 * m.h) / vh), scroll: m.scroll, stacked: m.stacked });
        check(m.away, `${tag}: portraits step back during ${step.id}`);
        check(m.top >= vh * 0.2, `${tag}: ${step.id} leaves the top of the scene visible (top ${Math.round(m.top)}px)`);
      }
      const out = await outcomes(page, routeId, step.id);
      const scold = !didScold && s.shown.find((x) => out[x] && out[x].kind === "scold");
      const cut = !didCut && s.shown.find((x) => out[x] && out[x].kind === "bad");
      let pick;
      if (scold) {
        didScold = true;
        pick = scold;
        pending = { type: "scold", cid: step.id, opt: scold, shown: s.shown };
      } else if (cut) {
        didCut = true;
        pick = cut;
        pending = { type: "bad", cid: step.id, opt: cut, shown: s.shown, bad: out[cut].bad };
      } else pick = s.shown.find((x) => out[x] && out[x].kind === "continue");
      await page.click(`[data-testid="choice-${pick}"]`);
    } else if (step.kind === "press") await page.click('[data-testid="press"]');
    else await page.click('[data-testid="advance"]');
  }
  s = await snapshot(page);
  check(s.screen === "tree", `${tag}: the true ending should lead to the story tree, got ${s.screen}`);
  check(sawCard && sawMemory && sawLast, `${tag}: the true ending shows the title card, the memory verse and the last line (${sawCard}/${sawMemory}/${sawLast})`);
  check(didScold && didCut, `${tag}: the run met a scold and a cut branch (${didScold}/${didCut})`);
  const tree = await page.evaluate((rid) => {
    const t = document.querySelector(`[data-testid="tree-${rid}"]`);
    return t
      ? {
          done: t.getAttribute("data-done"),
          seen: Array.from(t.querySelectorAll('.branch[data-state="seen"]')).map((b) => b.getAttribute("data-testid")),
          focus: document.activeElement && document.activeElement.getAttribute("data-testid"),
          digits: /[0-9]/.test(t.innerText)
        }
      : null;
  }, routeId);
  check(tree && tree.done === "true", `${tag}: the story tree's trunk is finished`);
  check(tree && tree.seen.length === 1, `${tag}: the tree shows the one cut branch seen (${tree && tree.seen.join()})`);
  check(tree && tree.focus === "tree-next" && !tree.digits, `${tag}: "Next character" has the focus; no numbers on the tree`);
  await noHorizontalScroll(page, `${tag} tree`);
  if (opts.treeShot) await shot(page, `${sizeName}-${routeId}-tree`);
  await page.click('[data-testid="tree-next"]');
  const rs = await snapshot(page);
  check(rs.screen === "routeSelect", `${tag}: "Next character" opens the route select`);
  check((await page.locator(`[data-testid="routecard-played-${routeId}"]`).count()) === 1, `${tag}: the route card is stamped as played`);
  if (sizeName !== "phone" && minStory < 1e9) {
    check(minStory >= vh * 0.036 - 0.5, `${tag}: story text ${minStory}px < 3.6vh`);
  }
  check(errors.length === 0, `${tag}: console errors: ${errors.join(" | ")}`);
  notes.push(`${tag}: true ending ${s.st && s.st.seen.filter((x) => /-good$/.test(x)).join()}, min story font ${minStory.toFixed(1)}px`);
  if (choiceHeights.length) {
    const over = choiceHeights.filter((c) => c.pct > 50);
    notes.push(`${tag}: choice sheet height % of screen: ${choiceHeights.map((c) => c.id + "=" + c.pct + (c.stacked ? "s" : "") + (c.scroll ? "!" : "")).join(" ")}` + (over.length ? `  (over 50%: ${over.map((c) => c.id).join(",")})` : ""));
    check(!choiceHeights.some((c) => c.scroll), `${tag}: a choice sheet needs scrolling`);
  }
  await ctx.close();
}

async function titleAndPrologue(browser, sizeName) {
  const { ctx, page, errors, url } = await newPage(browser, sizeName);
  const tag = `${sizeName}/title`;
  await page.goto(url);
  await page.waitForSelector('[data-testid="start"]');
  check((await page.getAttribute('[data-testid="lang-both"]', "aria-pressed")) === "true", `${tag}: both is the default language`);
  check((await page.locator('[data-testid="continue"]').count()) === 0, `${tag}: no continue without a save`);
  check((await page.locator('[data-testid="trees-open"]').count()) === 1, `${tag}: the title offers the story trees`);
  await shot(page, `${sizeName}-title`);
  await noHorizontalScroll(page, tag);
  const mf = await minFontPx(page);
  if (sizeName !== "phone") check(mf.min >= SIZES[sizeName].height * 0.022 - 0.5, `${tag}: smallest text ${mf.min}px (${mf.who}) < 2.2vh`);
  notes.push(`${tag}: smallest text ${mf.min}px (${mf.who})`);
  // The story trees from the title: three faint trees on a new device.
  await page.click('[data-testid="trees-open"]');
  let s = await snapshot(page);
  check(s.screen === "trees", `${tag}: the story trees open from the title`);
  const trees = await page.evaluate(() => Array.from(document.querySelectorAll("section.tree")).map((t) => t.getAttribute("data-done")));
  check(trees.join() === "false,false,false", `${tag}: three unfinished trees (${trees.join()})`);
  await noHorizontalScroll(page, `${sizeName}/trees`);
  const mft = await minFontPx(page);
  if (sizeName !== "phone") check(mft.min >= SIZES[sizeName].height * 0.022 - 0.5, `${sizeName}/trees: smallest text ${mft.min}px (${mft.who})`);
  await shot(page, `${sizeName}-trees`);
  await page.click('[data-testid="trees-home"]');
  await page.click('[data-testid="start"]');
  s = await snapshot(page);
  check(s.screen === "prologue", `${tag}: start opens the prologue`);
  for (let i = 0; i < 40 && s.screen === "prologue"; i++) {
    await page.click('[data-testid="advance"]');
    s = await snapshot(page);
  }
  check(s.screen === "routeSelect", `${tag}: prologue ends at route select`);
  await shot(page, `${sizeName}-route-select`);
  await noHorizontalScroll(page, `${sizeName}/routeSelect`);
  const mf2 = await minFontPx(page);
  if (sizeName !== "phone") check(mf2.min >= SIZES[sizeName].height * 0.022 - 0.5, `${sizeName}/routeSelect: smallest text ${mf2.min}px (${mf2.who})`);
  // Continue appears after a reload (route select is saved).
  await page.reload();
  await page.waitForSelector('[data-testid="start"]');
  check((await page.locator('[data-testid="continue"]').count()) === 1, `${tag}: continue offered after reload`);
  // Settings + header controls.
  await page.click('[data-testid="continue"]');
  s = await snapshot(page);
  check(s.screen === "routeSelect", `${tag}: continue restores route select`);
  await page.click('[data-testid="route-asher"]');
  await page.click('[data-testid="settings-open"]');
  await page.click('[data-testid="speed-instant"]');
  await shot(page, `${sizeName}-settings`);
  await page.click('[data-testid="settings-close"]');
  await page.click('[data-testid="home"]');
  check((await page.locator('[data-testid="confirm-yes"]').count()) === 1, `${tag}: in-page confirm`);
  await shot(page, `${sizeName}-confirm`);
  await page.click('[data-testid="confirm-no"]');
  s = await snapshot(page);
  check(s.screen === "play", `${tag}: confirm-no stays in play`);
  await page.click('[data-testid="home"]');
  await page.click('[data-testid="confirm-yes"]');
  s = await snapshot(page);
  check(s.screen === "title", `${tag}: confirm-yes returns to title`);
  check(errors.length === 0, `${tag}: console errors: ${errors.join(" | ")}`);
  await ctx.close();
}

// Keyboard only: keys 1-4 pick by place, arrows + Enter pick the focused option, a clicker's PageDown
// moves the focus and its blank-screen key "b" picks it, Enter on the snip card tries again,
// PageUp/ArrowLeft never change a line, Enter on the tree goes on.
async function keyboardOnly(browser, sizeName, routeId) {
  const { ctx, page, errors, url } = await newPage(browser, sizeName);
  const tag = `${sizeName}/${routeId}/keyboard`;
  await page.goto(url);
  await page.waitForSelector('[data-testid="start"]');
  await page.keyboard.press("PageDown"); // title -> prologue
  let s = await snapshot(page);
  check(s.screen === "prologue", `${tag}: PageDown on the title starts`);
  const keys = ["Space", "Enter", "ArrowRight", "PageDown", "ArrowDown"];
  let k = 0;
  for (let i = 0; i < 60 && s.screen === "prologue"; i++) {
    await page.keyboard.press(keys[k++ % keys.length]);
    s = await snapshot(page);
  }
  check(s.screen === "routeSelect", `${tag}: keyboard reaches route select`);
  await page.focus(`[data-testid="route-${routeId}"]`);
  await page.keyboard.press("Enter");
  s = await snapshot(page);
  check(s.screen === "play" && s.st.routeId === routeId, `${tag}: Enter on a route card starts it`);
  let picks = 0;
  let snips = 0;
  let escChecked = false;
  let cutDone = false;
  for (let i = 0; i < 1500 && s.screen !== "tree"; i++) {
    const kind = s.step && s.step.kind;
    if (!escChecked && s.screen === "ending") {
      // Esc opens the in-page menu during the ending too; a second Esc closes it in place.
      escChecked = true;
      await page.keyboard.press("Escape");
      check((await page.locator('[data-testid="confirm-yes"]').count()) === 1, `${tag}: Esc opens the menu during the ending`);
      await page.keyboard.press("Escape");
      check((await page.locator('[data-testid="confirm-yes"]').count()) === 0, `${tag}: Esc closes the menu`);
      const after = (await snapshot(page)).st;
      check(after.screen === "ending" && after.list === s.st.list && after.beatIndex === s.st.beatIndex, `${tag}: the Esc menu keeps the place in the ending`);
    }
    if (s.screen === "snip") {
      snips++;
      const f = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
      check(f === "snip-retry", `${tag}: the snip card focuses Try again (${f})`);
      await page.keyboard.press("Enter");
    } else if (kind === "choice") {
      const out = await outcomes(page, routeId, s.step.id);
      const shown = s.shown;
      let id = shown.find((x) => out[x].kind === "continue");
      if (!cutDone) {
        const bad = shown.find((x) => out[x].kind === "bad");
        if (bad) {
          id = bad;
          cutDone = true;
        }
      }
      const idx = shown.indexOf(id);
      if (picks === 2) {
        // Arrow focus then Enter picks the focused option.
        for (let j = 0; j <= idx; j++) await page.keyboard.press("ArrowDown");
        const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
        check(focused === "choice-" + id, `${tag}: arrows move focus (${focused}, expected choice-${id})`);
        if (args.shots && sizeName === "tv") await shot(page, `${sizeName}-keyboard-focus`);
        await page.keyboard.press("Enter");
      } else if (picks % 2) {
        // A clicker: PageDown moves the focus (the first press shows it on the first option), "b" picks.
        for (let j = 0; j <= idx; j++) await page.keyboard.press("PageDown");
        await page.keyboard.press("b");
      } else await page.keyboard.press(String(idx + 1));
      picks++;
    } else if (kind === "press") await page.keyboard.press("ArrowRight");
    else {
      await page.keyboard.press(keys[k++ % keys.length]);
      if (i === 3) {
        const before = (await snapshot(page)).st;
        await page.keyboard.press("PageUp");
        await page.keyboard.press("ArrowLeft");
        const after = (await snapshot(page)).st;
        check(before.beatIndex === after.beatIndex && before.list === after.list, `${tag}: PageUp/ArrowLeft are inert`);
      }
    }
    s = await snapshot(page);
  }
  check(s.screen === "tree", `${tag}: keyboard reaches the story tree (${s.screen})`);
  check(escChecked, `${tag}: an ending screen was shown`);
  check(snips === 1, `${tag}: one cut branch taken and tried again by keyboard (${snips})`);
  await page.keyboard.press("Enter");
  s = await snapshot(page);
  check(s.screen === "routeSelect", `${tag}: Enter on the story tree goes to the route select`);
  check(errors.length === 0, `${tag}: console errors: ${errors.join(" | ")}`);
  notes.push(`${tag}: ${picks} picks by keyboard, ${snips} snip card`);
  await ctx.close();
}

const browser = await chromium.launch();
try {
  for (const size of sizes) {
    await titleAndPrologue(browser, size);
    const isPhone = size === "phone";
    await fullRoute(browser, size, "scribe", {
      treeShot: true,
      shots: {
        choice: (s) => s.step && s.step.kind === "choice" && s.step.id === "c1",
        "verse-light": (s) => s.step && s.step.kind === "verse" && s.step.key === "MT_9_2B",
        echo: (s) => s.now && s.now.echo && s.step && s.step.kind === "line",
        "pinned-read": (s) => s.stage && s.stage.pinned && s.stage.pinned.read && s.step && s.step.kind !== "choice",
        "ending-card": (s) => s.screen === "endingCard",
        memory: (s) => s.step && s.step.kind === "memory",
        "last-line": (s) => s.step && s.step.kind === "last"
      }
    });
    await fullRoute(browser, size, "friend", {
      shots: {
        portrait: (s) => s.step && s.step.kind === "line" && s.stage && s.stage.speaking && s.stage.cast && s.stage.cast.length >= 1,
        "portrait-two": (s) => s.step && s.step.kind === "line" && s.stage && s.stage.speaking && s.stage.cast && s.stage.cast.length > 1,
        sign: (s) => s.step && s.step.kind === "line" && s.step.speaker === "sign" && s.st.routeId === "friend",
        "friend-choice": (s) => s.step && s.step.kind === "choice" && s.step.id === "c1"
      }
    });
    await fullRoute(browser, size, "asher", {
      shots: {
        "asher-press": (s) => s.step && s.step.kind === "press",
        "asher-choice": (s) => s.step && s.step.kind === "choice" && s.step.id === "c1",
        "asher-lone": (s) => s.step && s.step.kind === "choice" && s.step.options && s.step.options.length === 1
      }
    });
    if (!isPhone || sizes.length === 1) await keyboardOnly(browser, size, size === "hd" ? "friend" : "scribe");
  }
} catch (err) {
  failures.push("crash: " + (err && err.stack ? err.stack.split("\n").slice(0, 3).join(" / ") : err));
} finally {
  await browser.close();
}

notes.forEach((n) => console.log("note  " + n));
failures.forEach((f) => console.log("FAIL  " + f));
console.log(`\nui-playtest: ${failures.length} failures`);
process.exit(failures.length ? 1 : 0);
