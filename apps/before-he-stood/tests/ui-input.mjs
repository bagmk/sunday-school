// tests/ui-input.mjs - browser checks for input and persistence (the v4 code audit): title keys with a
// save (B1), a font request that hangs (B2), press beats and double clicks/taps right after a screen
// change (S1, S2), held keys and keys after a mouse click (S3), the idle cursor (S4), deep links and
// reloads (S5), the last-line veil (N1), storage that reads but cannot write (N2), stored settings and
// saves that are damaged (N3, N4), the scold animation (N5), the route select guard (N6), a reload on
// the story tree (N7), the home dialog without storage (N8), the F key by its place (N10), letter keys,
// and the memory-verse card (trailing "…", fit on TV and phone).
// Run alone: node tests/ui-input.mjs      (node tests/ui-extra.mjs runs it too)
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const index = pathToFileURL(path.join(root, "index.html")).href;
const FONT_URL = /fonts\.(googleapis|gstatic)\.com/;
const ignorable = (t) => /fonts\.(googleapis|gstatic)\.com|ERR_TUNNEL_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/.test(t);

async function loadChromium() {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync("/opt/pw-browsers")) process.env.PLAYWRIGHT_BROWSERS_PATH = "/opt/pw-browsers";
  try {
    return createRequire(import.meta.url)("/tmp/pwqa/node_modules/playwright").chromium;
  } catch {
    try {
      return (await import("playwright")).chromium;
    } catch {
      return (await import("/opt/npm-tools/node_modules/playwright/index.mjs")).chromium;
    }
  }
}

// Page helpers installed before the game loads. move() drives the running game through the engine
// (continue options, or `picks`) to the step just before the first step matching `spec`, or onto it,
// then re-renders the screen with BHS_DEBUG.render().
function pageLib() {
  const one = (g, picks) => {
    const s = g.step;
    if (!s) return false;
    if (s.kind === "choice") {
      const want = picks && picks[s.id];
      return g.choose(want && s.options.some((o) => o.id === want) ? want : g.continueOption(s));
    }
    if (s.kind === "press") return g.press();
    if (s.kind === "snip") return g.retry();
    return g.next();
  };
  const matches = (s, spec) => !!s && Object.keys(spec).every((k) => s[k] === spec[k]);
  window.__t = {
    move(spec, picks, onto) {
      const E = window.BHS.engine;
      const g = window.BHS_DEBUG.game();
      if (!g) return "no game";
      for (let i = 0; i < 900; i++) {
        if (onto && matches(g.step, spec)) {
          window.BHS_DEBUG.render();
          return "ok";
        }
        if (!onto) {
          const peek = E.restoreGame(g.serialize());
          one(peek, picks);
          if (matches(peek.step, spec)) {
            window.BHS_DEBUG.render();
            return "ok";
          }
        }
        if (!one(g, picks)) return "stuck at " + (g.step && g.step.kind);
      }
      return "not found";
    },
    step() {
      window.__t.move({}, null, false);
    },
    next(picks) {
      const g = window.BHS_DEBUG.game();
      one(g, picks);
      window.BHS_DEBUG.render();
    },
    save() {
      return window.BHS_DEBUG.game().serialize();
    },
    load(s) {
      window.BHS_DEBUG.game().state = JSON.parse(JSON.stringify(s));
      window.BHS_DEBUG.render();
    },
    rect(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height };
    },
    st() {
      const g = window.BHS_DEBUG.game();
      const s = window.BHS_DEBUG.state();
      s.label = g && g.step && g.step.label ? g.step.label.ko : null;
      s.key = g && g.step ? g.step.key || null : null;
      s.picks = g ? g.state.picks.slice() : [];
      s.steps = g ? g.state.steps : null;
      s.focus = document.activeElement ? document.activeElement.getAttribute("data-testid") : null;
      return s;
    },
    stored() {
      try {
        return JSON.parse(localStorage.getItem("bhs.v1.save"));
      } catch (e) {
        return null;
      }
    },
    ring() {
      const a = document.activeElement;
      if (!a || a === document.body) return false;
      const cs = getComputedStyle(a);
      return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
    }
  };
}

function settingsInit(s) {
  try {
    localStorage.setItem("bhs.v1.settings", JSON.stringify(s));
  } catch (e) {
    /* storage off */
  }
}

export async function runInputChecks(chromium) {
  const failures = [];
  const notes = [];
  const check = (c, m) => {
    if (!c) failures.push(m);
  };
  const browser = await chromium.launch();

  async function open(url, opts = {}) {
    const ctx = await browser.newContext({
      viewport: opts.viewport || { width: 1920, height: 1080 },
      deviceScaleFactor: opts.dpr || 1,
      hasTouch: !!opts.touch,
      isMobile: !!opts.touch,
      reducedMotion: "no-preference"
    });
    // Fonts fail fast here (the font hang has its own check).
    await ctx.route(FONT_URL, (r) => r.abort());
    await ctx.addInitScript(pageLib);
    if (opts.settings) await ctx.addInitScript(settingsInit, opts.settings);
    if (opts.init) await ctx.addInitScript(opts.init, opts.initArg === undefined ? null : opts.initArg);
    const errors = [];
    const watch = (page) => {
      page.on("console", (m) => {
        const where = (m.location() && m.location().url) || "";
        if (m.type() === "error" && !ignorable(m.text() + " " + where)) errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    };
    const page = await ctx.newPage();
    watch(page);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.BHS_DEBUG && document.body.dataset.screen);
    const another = async (u) => {
      const p = await ctx.newPage();
      watch(p);
      await p.goto(u, { waitUntil: "domcontentloaded" });
      await p.waitForFunction(() => window.BHS_DEBUG && document.body.dataset.screen);
      return p;
    };
    return { ctx, page, errors, another };
  }

  const st = (page) => page.evaluate(() => window.__t.st());
  const move = (page, spec, picks, onto) => page.evaluate(([s, p, o]) => window.__t.move(s, p, o), [spec, picks || null, !!onto]);
  const rect = (page, sel) => page.evaluate((s) => window.__t.rect(s), sel);
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
  const toTitle = async (page) => {
    await page.keyboard.press("Escape");
    await page.click('[data-testid="confirm-yes"]');
    await page.waitForFunction(() => document.body.dataset.screen === "title");
  };
  const INSTANT = { lang: "both", speed: "instant", size: 1 };
  // UI_INPUT_ONLY="title keys,fonts" runs only those blocks.
  const only = (process.env.UI_INPUT_ONLY || "").split(",").map((x) => x.trim()).filter(Boolean);
  const run = async (name, fn) => {
    if (only.length && !only.includes(name)) return;
    try {
      await fn();
    } catch (err) {
      const msg = err && err.message ? err.message.split("\n").filter((x) => x.trim()).slice(0, 8).join(" / ") : String(err);
      failures.push(`${name}: crashed: ${msg}`);
    }
  };

  // ---------------------------------------------------------------- B1: title keys with a save
  await run("title keys", async () => {
    const { ctx, page, errors } = await open(index + "?test=1#asher");
    check((await move(page, { kind: "choice", id: "c3" }, null, true)) === "ok", "B1: Asher reaches c3");
    await toTitle(page);
    const t = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.getAttribute("data-testid"), ring: window.__t.ring() }));
    check(t.focus === "continue" && t.ring, `B1: with a save the title focuses Continue with a visible ring (${JSON.stringify(t)})`);
    for (const key of ["PageDown", "Enter", "Space", "ArrowRight", "ArrowDown"]) {
      await page.keyboard.press(key);
      const s = await st(page);
      check(s.screen === "play" && s.routeId === "asher" && s.stepId === "c3", `B1: ${key} on the title continues Asher at c3 (${s.screen} ${s.routeId} ${s.stepId})`);
      await toTitle(page);
      const saved = await page.evaluate(() => window.__t.stored());
      check(saved && saved.routeId === "asher" && saved.state.step.id === "c3", `B1: after ${key} the save still holds Asher at c3 (${saved && saved.routeId})`);
    }
    // Previous keys move the focus between the title buttons; Start on purpose keeps the save until a
    // route is picked (the prologue never replaces it).
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    const f = (await st(page)).focus;
    check(f === "start", `B1: previous keys move the focus to Start (${f})`);
    await page.keyboard.press("PageDown");
    let s = await st(page);
    check(s.screen === "prologue", `B1: the next key presses the focused Start (${s.screen})`);
    await page.click('[data-testid="advance"]');
    let saved = await page.evaluate(() => window.__t.stored());
    check(saved && saved.routeId === "asher", `B1: the prologue does not overwrite the save (${saved && saved.routeId})`);
    await toTitle(page);
    const label = await page.textContent('[data-testid="continue"]').catch(() => "");
    check(/아셀|Asher/.test(label || ""), `B1: Continue still names Asher ("${(label || "").trim()}")`);
    await page.keyboard.press("Enter");
    s = await st(page);
    check(s.routeId === "asher" && s.stepId === "c3", `B1: Enter on the title still continues at c3 (${s.routeId} ${s.stepId})`);
    // Without a save, the next key starts (the prologue may then be saved).
    await page.evaluate(() => localStorage.clear());
    await page.goto(index + "?test=1", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.screen === "title");
    const noRing = await page.evaluate(() => document.activeElement === document.body);
    check(noRing, "B1: without a save nothing is focused on the title (the look is unchanged)");
    await page.keyboard.press("PageDown");
    check((await st(page)).screen === "prologue", "B1: without a save the next key starts the prologue");
    check(errors.length === 0, "B1: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- B2: a font request that hangs
  await run("fonts", async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "bhs-dist-"));
    try {
      execFileSync(process.execPath, [path.join(root, "tools/build-single.mjs"), "--out", out], { stdio: "pipe" });
      const files = [
        ["index.html", path.join(root, "index.html")],
        ["single file", path.join(out, "before-he-stood.html")],
        ["artifact fragment", path.join(out, "artifact.html")]
      ];
      for (const [label, file] of files) {
        const html = fs.readFileSync(file, "utf8");
        const links = html.replace(/<noscript>[\s\S]*?<\/noscript>/gi, "").match(/<link\b[^>]*rel="stylesheet"[^>]*>/gi) || [];
        const blocking = links.filter((tag) => /href="https?:/i.test(tag) && !/\smedia="print"/i.test(tag));
        check(!blocking.length, `B2 ${label}: no blocking external stylesheet (${blocking.join(" ")})`);
        check(links.some((tag) => FONT_URL.test(tag) && /onload="this\.media='all'"/.test(tag)), `B2 ${label}: the font stylesheet switches itself on when it arrives`);
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        let held = 0;
        // Never answered: a captive portal or a packet-dropping firewall.
        await ctx.route(FONT_URL, () => {
          held++;
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const t0 = Date.now();
        await page.goto(pathToFileURL(file).href + "?test=1", { waitUntil: "commit" });
        let ok = true;
        try {
          await page.waitForFunction(() => window.BHS_DEBUG && document.body.dataset.screen === "title" && !!document.querySelector('[data-testid="start"]'), null, { timeout: 5000 });
        } catch {
          ok = false;
        }
        const ms = Date.now() - t0;
        check(ok && held >= 1, `B2 ${label}: the game boots while the font request hangs (${ok ? ms + " ms" : "not booted after 5 s"}, ${held} font request(s) held)`);
        if (ok) {
          await page.click('[data-testid="start"]');
          check((await page.evaluate(() => document.body.dataset.screen)) === "prologue", `B2 ${label}: Start works while the fonts hang`);
          notes.push(`B2 ${label}: booted in ${ms} ms with the font request held`);
        }
        check(errors.length === 0, `B2 ${label}: page errors ${errors.join(" | ")}`);
        await ctx.close();
      }
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------- S5: deep links and reloads
  await run("deep links", async () => {
    const { ctx, page, errors, another } = await open(index + "?test=1#friend");
    let s = await st(page);
    const hash = await page.evaluate(() => location.hash);
    check(s.screen === "play" && s.routeId === "friend" && hash === "", `S5: #friend opens the route and leaves the address bar ("${hash}")`);
    check((await move(page, { kind: "choice", id: "c3" }, null, true)) === "ok", "S5: friend reaches c3");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.BHS_DEBUG && document.body.dataset.screen);
    s = await st(page);
    const saved = await page.evaluate(() => window.__t.stored());
    check(s.screen === "title" && saved && saved.routeId === "friend" && saved.state.step.id === "c3", `S5: a reload after a deep link keeps the save and shows the title (${s.screen}, save ${saved && saved.routeId} ${saved && saved.state && saved.state.step.id})`);
    await page.click('[data-testid="continue"]');
    s = await st(page);
    check(s.routeId === "friend" && s.stepId === "c3", `S5: Continue resumes friend at c3 (${s.routeId} ${s.stepId})`);
    // A link that still carries the hash (a bookmark, a frame that refuses replaceState) resumes the
    // same route's save instead of restarting it.
    const p2 = await another(index + "?test=1#friend");
    s = await st(p2);
    check(s.screen === "play" && s.routeId === "friend" && s.stepId === "c3", `S5: loading #friend with a friend save resumes it (${s.routeId} ${s.stepId})`);
    // A hash typed while the page is open starts that route; the hash leaves the address bar.
    await p2.evaluate(() => {
      location.hash = "#asher";
    });
    await p2.waitForFunction(() => window.BHS_DEBUG.state().routeId === "asher");
    s = await st(p2);
    const h2 = await p2.evaluate(() => location.hash);
    check(s.routeId === "asher" && !Object.keys(s.choices).length && h2 === "", `S5: a typed #asher starts Asher (${s.routeId}, hash "${h2}")`);
    // Loading a deep link to another route than the save starts that route.
    const p3 = await another(index + "?test=1#scribe");
    s = await st(p3);
    check(s.routeId === "scribe" && !Object.keys(s.choices).length && s.beatIndex <= 2, `S5: #scribe with an Asher save starts the scribe (${s.routeId} #${s.beatIndex})`);
    check(errors.length === 0, "S5: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- S1, S2, N6: guards (no ?test=1)
  await run("guards", async () => {
    const { ctx, page, errors } = await open(index + "#scribe", { settings: INSTANT });
    const cut = await firstOf(page, "scribe", "bad");
    const picks = { [cut.choice]: cut.option };
    // Where the snip card's buttons will be: show the card once.
    check((await move(page, { kind: "snip" }, picks)) === "ok", "S2: the scribe's first cut branch reaches its last line");
    const lastLine = await page.evaluate(() => window.__t.save());
    await page.evaluate(() => window.__t.next());
    const retry = await rect(page, '[data-testid="snip-retry"]');
    const home = await rect(page, '[data-testid="snip-home"]');
    for (const [label, pos] of [
      ["Try again", retry],
      ["Title screen", home]
    ]) {
      await page.evaluate((s) => window.__t.load(s), lastLine);
      await page.waitForTimeout(350);
      await page.mouse.click(pos.x, pos.y);
      await page.waitForTimeout(120);
      await page.mouse.click(pos.x, pos.y);
      const s = await st(page);
      check(s.screen === "snip", `S2: a double click on the cut branch's last line where "${label}" will be keeps the snip card (${s.screen} ${s.stepId || ""})`);
    }
    await page.waitForTimeout(800);
    await page.click('[data-testid="snip-retry"]');
    let s = await st(page);
    check(s.screen === "play" && s.step === "choice" && s.stepId === cut.choice, `S2: after the guard Try again works (${s.screen} ${s.stepId})`);

    // The true ending's last screen: a double click where "Next character" will be keeps the tree.
    await page.evaluate(() => window.BHS_DEBUG.showTree("scribe"));
    const next = await rect(page, '[data-testid="tree-next"]');
    await page.evaluate(() => window.BHS_DEBUG.startRoute("scribe"));
    check((await move(page, { kind: "end" })) === "ok", "S2: the scribe reaches the true ending's last screen");
    await page.waitForTimeout(350);
    await page.mouse.click(next.x, next.y);
    await page.waitForTimeout(120);
    await page.mouse.click(next.x, next.y);
    s = await st(page);
    check(s.screen === "tree", `S2: a double click on the last line keeps the story tree (${s.screen})`);
    // N6 by pointer: a double click on "Next character" keeps the route select.
    await page.waitForTimeout(750);
    await page.mouse.click(next.x, next.y);
    await page.waitForTimeout(120);
    await page.mouse.click(next.x, next.y);
    s = await st(page);
    check(s.screen === "routeSelect", `S2/N6: a double click on "Next character" keeps the route select (${s.screen} ${s.routeId || ""})`);
    // N6 by keys: Enter on the tree, then Enter again at once.
    await page.evaluate(() => window.BHS_DEBUG.showTree("scribe"));
    await page.waitForTimeout(750);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(120);
    await page.keyboard.press("Enter");
    s = await st(page);
    check(s.screen === "routeSelect", `N6: Enter twice on the tree stops at the route select (${s.screen} ${s.routeId || ""})`);
    await page.waitForTimeout(450);
    await page.keyboard.press("2");
    s = await st(page);
    check(s.screen === "play" && s.routeId === "friend", `N6: after the guard a key starts a route (${s.screen} ${s.routeId})`);

    check(errors.length === 0, "guards: console errors " + errors.join(" | "));
    await ctx.close();
  });

  await run("choice guard", async () => {
    const { ctx, page, errors } = await open(index + "#scribe", { settings: INSTANT });
    let s;
    // A double click on the line before a choice never picks an option.
    check((await move(page, { kind: "choice", id: "c2" })) === "ok", "S2: the scribe reaches the line before c2");
    const beforeC2 = await page.evaluate(() => window.__t.save());
    await page.evaluate(() => window.__t.next());
    const optB = await rect(page, '[data-testid="choice-b"]');
    await page.evaluate((x) => window.__t.load(x), beforeC2);
    await page.waitForTimeout(350);
    await page.mouse.click(optB.x, optB.y);
    await page.waitForTimeout(120);
    await page.mouse.click(optB.x, optB.y);
    s = await st(page);
    check(s.step === "choice" && s.stepId === "c2" && !s.picks.includes("c2"), `S2: a double click on the line before c2 picks nothing (${s.step} ${s.stepId}, picks ${s.picks.join()})`);
    check(errors.length === 0, "choice guard: console errors " + errors.join(" | "));
    await ctx.close();
  });

  await run("press guard", async () => {
    const { ctx, page, errors } = await open(index + "#asher", { settings: INSTANT });
    let s;
    // S1: quick presses never skip Asher's press beats.
    check((await move(page, { kind: "press" })) === "ok", "S1: Asher reaches the verse before the first press");
    await page.waitForTimeout(350);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(60);
    }
    s = await st(page);
    check(s.step === "press" && s.label === "일어나기", `S1: four quick PageDown stop at 「일어나기」 (${s.step} ${s.label || s.key})`);
    await page.waitForTimeout(650);
    await page.dblclick('[data-testid="press"]');
    s = await st(page);
    const rise = await page.evaluate(() => ({ rising: document.getElementById("play").classList.contains("play--rising"), opacity: Number(getComputedStyle(document.getElementById("pressbox")).opacity) }));
    check(s.step === "press" && s.label === "침상을 들어", `S1: a double click on 「일어나기」 stops at 「침상을 들어」 (${s.step} ${s.label || s.key})`);
    check(rise.rising && rise.opacity < 0.2, `rise: 「침상을 들어」 waits while Asher stands up (${JSON.stringify(rise)})`);
    await page.waitForTimeout(1000);
    await page.keyboard.press("PageDown");
    s = await st(page);
    check(s.step === "press" && s.label === "침상을 들어", `rise: a press during the rise is ignored (${s.step} ${s.label || s.key})`);
    await page.waitForTimeout(1500);
    const shown = await page.evaluate(() => Number(getComputedStyle(document.getElementById("pressbox")).opacity));
    check(shown > 0.9, `rise: 「침상을 들어」 shows once Asher is up (opacity ${shown})`);
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(150);
    await page.keyboard.press("PageDown");
    s = await st(page);
    check(s.step === "press" && s.label === "집으로", `S1: two quick presses stop at 「집으로」 (${s.step} ${s.label || s.key})`);
    await page.waitForTimeout(650);
    await page.keyboard.press("PageDown");
    s = await st(page);
    check(s.step === "verse" && s.key === "MT_9_7", `S1: after the guard the last press leads to 9:7 (${s.step} ${s.key})`);
    check(errors.length === 0, "press guard: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- S2 on a phone: a double tap
  await run("double tap", async () => {
    const { ctx, page, errors } = await open(index + "#scribe", { settings: INSTANT, viewport: { width: 390, height: 844 }, dpr: 2, touch: true });
    check((await move(page, { kind: "choice", id: "c2" })) === "ok", "S2 phone: the scribe reaches the line before c2");
    const beforeC2 = await page.evaluate(() => window.__t.save());
    await page.evaluate(() => window.__t.next());
    const optB = await rect(page, '[data-testid="choice-b"]');
    await page.evaluate((x) => window.__t.load(x), beforeC2);
    await page.waitForTimeout(350);
    await page.touchscreen.tap(optB.x, optB.y);
    await page.waitForTimeout(120);
    await page.touchscreen.tap(optB.x, optB.y);
    const s = await st(page);
    check(s.step === "choice" && s.stepId === "c2" && !s.picks.includes("c2"), `S2 phone: a double tap on the line before c2 picks nothing (${s.step} ${s.stepId}, picks ${s.picks.join()})`);
    await page.waitForTimeout(450);
    await page.touchscreen.tap(optB.x, optB.y);
    check((await st(page)).picks.includes("c2"), "S2 phone: after the guard a tap picks the option");
    check(errors.length === 0, "double tap: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- S3: held keys, keys after a click
  await run("held keys", async () => {
    const { ctx, page, errors } = await open(index + "?test=1#scribe");
    await page.click('[data-testid="advance"]');
    let s = await st(page);
    check(s.focus !== "advance", `S3: a mouse click on the stage leaves no focus on it (${s.focus})`);
    await page.evaluate(() => window.BHS_DEBUG.startRoute("scribe"));
    check((await move(page, { kind: "choice", id: "c1" })) === "ok", "S3: the scribe reaches the line before c1");
    await page.click('[data-testid="advance"]');
    s = await st(page);
    const first = await page.evaluate(() => window.BHS_DEBUG.state().options[0]);
    check(s.step === "choice" && s.stepId === "c1", `S3: a click brings c1 (${s.step} ${s.stepId})`);
    await page.keyboard.press("Enter");
    s = await st(page);
    const ring = await page.evaluate(() => window.__t.ring());
    check(s.focus === "choice-" + first && ring && !s.picks.length, `S3: after mouse clicks, Enter at a choice focuses the first option with a ring (${s.focus}, ring ${ring}, picks ${s.picks.join()})`);
    await page.keyboard.press("Enter");
    s = await st(page);
    check(s.picks.includes("c1"), `S3: a second Enter picks the focused option (picks ${s.picks.join()})`);
    // Space works the same way at the next choice.
    check((await move(page, { kind: "choice", id: "c2" })) === "ok", "S3: the scribe reaches the line before c2");
    await page.click('[data-testid="advance"]');
    await page.keyboard.press("Space");
    s = await st(page);
    check(s.stepId === "c2" && /^choice-/.test(s.focus || "") && !s.picks.includes("c2"), `S3: Space at a choice shows the focus first (${s.stepId} ${s.focus})`);
    await page.keyboard.press("Space");
    s = await st(page);
    check(s.picks.includes("c2"), "S3: a second Space picks the focused option");

    // A held Enter with the stage button focused advances exactly once.
    await page.evaluate(() => window.BHS_DEBUG.startRoute("scribe"));
    await page.focus('[data-testid="advance"]');
    const s0 = await st(page);
    await page.keyboard.down("Enter");
    for (let i = 0; i < 6; i++) await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    s = await st(page);
    check(s.steps === s0.steps + 1, `S3: a held Enter on the focused stage button advances once (${s0.steps} -> ${s.steps})`);
    // A held Enter or Space at a choice only shows the focus; it never picks.
    for (const key of ["Enter", "Space"]) {
      await page.evaluate(() => window.BHS_DEBUG.startRoute("scribe"));
      await move(page, { kind: "choice", id: "c1" }, null, true);
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.down(key);
      for (let i = 0; i < 5; i++) await page.keyboard.down(key);
      await page.keyboard.up(key);
      s = await st(page);
      check(s.step === "choice" && s.stepId === "c1" && !s.picks.length && /^choice-/.test(s.focus || ""), `S3: a held ${key} at a choice picks nothing (${s.step} ${s.stepId}, picks ${s.picks.join()}, focus ${s.focus})`);
      await page.keyboard.press(key);
      s = await st(page);
      check(s.picks.includes("c1"), `S3: a fresh ${key} then picks the focused option`);
    }
    // Held keys never skip screens on a line either (focus on the page).
    await page.evaluate(() => window.BHS_DEBUG.startRoute("scribe"));
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const s1 = await st(page);
    await page.keyboard.down("PageDown");
    for (let i = 0; i < 6; i++) await page.keyboard.down("PageDown");
    await page.keyboard.up("PageDown");
    s = await st(page);
    check(s.steps === s1.steps + 1, `S3: a held PageDown advances once (${s1.steps} -> ${s.steps})`);
    check(errors.length === 0, "held keys: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- letters, blank-screen keys, F, N5a
  await run("letter keys", async () => {
    const { ctx, page, errors } = await open(index + "?test=1#scribe");
    const s0 = await st(page);
    for (const key of ["b", ".", "w", "B", "W"]) await page.keyboard.press(key);
    let s = await st(page);
    check(s.steps === s0.steps, `letters: "b", ".", "w" do nothing on a line (${s0.steps} -> ${s.steps})`);
    await move(page, { kind: "choice", id: "c1" }, null, true);
    for (const key of ["a", "c", "d", "A", "C", "D", "w", "W"]) await page.keyboard.press(key);
    s = await st(page);
    check(s.step === "choice" && s.stepId === "c1" && !s.picks.length && !/^choice-/.test(s.focus || ""), `letters: A-D and "w" do nothing at a choice (picks ${s.picks.join()}, focus ${s.focus})`);
    const shortcuts = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="choice-"]')).map((b) => b.getAttribute("aria-keyshortcuts")));
    check(shortcuts.every((k, i) => k === String(i + 1)), `letters: options announce digit shortcuts only (${shortcuts.join(",")})`);
    // N5 (a): while a scolded option is still leaving, digits wait (the buttons on screen do not match).
    await page.evaluate(() => {
      const b = document.createElement("button");
      b.className = "opt opt--leaving";
      document.querySelector("#choices .choices__list").appendChild(b);
    });
    await page.keyboard.press("1");
    s = await st(page);
    check(!s.picks.length, "N5: digits wait while a scolded option fades out");
    await page.evaluate(() => document.querySelector("#choices .opt--leaving").remove());
    await page.keyboard.press("1");
    s = await st(page);
    check(s.picks.includes("c1"), "letters: the digit 1 still picks the first option");
    // N10: F by its place, for input sources that report a jamo.
    const fs1 = await page.evaluate(() => {
      window.__fs = 0;
      try {
        Object.defineProperty(document, "fullscreenEnabled", { get: () => true, configurable: true });
      } catch (e) {
        /* already true */
      }
      document.documentElement.requestFullscreen = function () {
        window.__fs++;
        return Promise.resolve();
      };
      const send = (key, code) => document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
      send("ㄹ", "KeyF");
      const jamo = window.__fs;
      send("f", "KeyF");
      const latin = window.__fs - jamo;
      send("u", "KeyF");
      const other = window.__fs - jamo - latin;
      return { jamo, latin, other };
    });
    check(fs1.jamo === 1 && fs1.latin === 1 && fs1.other === 0, `N10: F toggles fullscreen by its place when a jamo is reported (${JSON.stringify(fs1)})`);
    check(errors.length === 0, "letter keys: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- a clicker at a choice
  await run("clicker at a choice", async () => {
    const { ctx, page, errors } = await open(index + "?test=1#scribe");
    // A four-option choice of the scribe (move, wrap).
    const four = await page.evaluate(() => {
      const E = window.BHS.engine;
      const cb = E.choiceBeats(E.getRoute("scribe")).find((c) => c.options.length === 4);
      return cb ? cb.id : null;
    });
    check(!!four, "clicker: the scribe has a four-option choice");
    await move(page, { kind: "choice", id: four }, null, true);
    const opts = await page.evaluate(() => window.BHS_DEBUG.state().options);
    const focusSeq = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("PageDown");
      focusSeq.push((await st(page)).focus);
    }
    const wantDown = [0, 1, 2, 3, 0].map((i) => "choice-" + opts[i]);
    check(focusSeq.join() === wantDown.join(), `clicker: PageDown shows the first option, then moves on and wraps (${focusSeq.join()})`);
    const upSeq = [];
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press("PageUp");
      upSeq.push((await st(page)).focus);
    }
    check(upSeq.join() === ["choice-" + opts[3], "choice-" + opts[2]].join(), `clicker: PageUp moves back and wraps (${upSeq.join()})`);
    for (const [key, want] of [
      ["ArrowDown", 3],
      ["ArrowRight", 0],
      ["ArrowLeft", 3],
      ["ArrowUp", 2]
    ]) {
      await page.keyboard.press(key);
      const f = (await st(page)).focus;
      check(f === "choice-" + opts[want], `clicker: ${key} moves the focus to ${opts[want]} (${f})`);
    }
    let s = await st(page);
    check(!s.picks.includes(four), `clicker: moving never picks (picks ${s.picks.join()})`);
    // The blank-screen key picks the focused option.
    await page.keyboard.press("b");
    s = await st(page);
    check(s.picks.includes(four) && (s.choices[four] === opts[2] || s.step !== "choice" || s.stepId !== four), `clicker: "b" picks the focused option ${opts[2]} (picks ${s.picks.join()}, choices ${JSON.stringify(s.choices)})`);
    // "." with nothing focused only shows the focus; then it picks.
    await page.evaluate(() => window.BHS_DEBUG.startRoute("scribe"));
    await move(page, { kind: "choice", id: "c1" }, null, true);
    await page.keyboard.press(".");
    s = await st(page);
    check(!s.picks.length && /^choice-/.test(s.focus || ""), `clicker: "." on a fresh choice only shows the focus (${s.focus})`);
    await page.keyboard.press(".");
    s = await st(page);
    check(s.picks.includes("c1"), "clicker: a second \".\" picks the focused option");
    // Holding PageDown on a focused option picks it after a moment; a fill shows on the option.
    await page.evaluate(() => window.BHS_DEBUG.startRoute("scribe"));
    await move(page, { kind: "choice", id: "c1" }, null, true);
    const c1 = await page.evaluate(() => window.BHS_DEBUG.state().options);
    await page.keyboard.press("PageDown");
    await page.keyboard.down("PageDown");
    await page.waitForTimeout(300);
    const mid = await page.evaluate(() => ({ holding: Array.from(document.querySelectorAll(".opt.is-holding")).map((b) => b.getAttribute("data-option")), picks: window.BHS_DEBUG.game().state.picks.length }));
    check(mid.holding.join() === c1[0] && !mid.picks, `clicker: while PageDown is held the focused option shows the fill (${JSON.stringify(mid)})`);
    await page.waitForTimeout(700);
    s = await st(page);
    check(s.picks.includes("c1") && s.choices.c1 === c1[0], `clicker: holding PageDown for 0.8 s picks the focused option ${c1[0]} (${JSON.stringify(s.choices)})`);
    // Still held: repeats and a stray keydown never act again; the release does nothing either.
    const after = s.steps;
    for (let i = 0; i < 4; i++) await page.keyboard.down("PageDown");
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", code: "PageDown", bubbles: true, cancelable: true })));
    await page.waitForTimeout(900);
    await page.keyboard.up("PageDown");
    s = await st(page);
    check(s.steps === after, `clicker: after a hold picks, nothing more happens until the key is released (${after} -> ${s.steps})`);
    await page.keyboard.press("PageDown");
    s = await st(page);
    check(s.steps === after + 1 || s.step === "choice", `clicker: after the release the next press works again (${after} -> ${s.steps})`);
    // A quick press only moves; a hold on a fresh choice (nothing focused) only shows the focus.
    await page.evaluate(() => window.BHS_DEBUG.startRoute("scribe"));
    await move(page, { kind: "choice", id: "c1" }, null, true);
    await page.keyboard.down("PageDown");
    await page.waitForTimeout(1100);
    await page.keyboard.up("PageDown");
    s = await st(page);
    check(!s.picks.length && s.focus === "choice-" + c1[0], `clicker: holding PageDown on a fresh choice only shows the first option (picks ${s.picks.join()}, focus ${s.focus})`);
    await page.keyboard.down("PageDown");
    await page.waitForTimeout(200);
    await page.keyboard.up("PageDown");
    s = await st(page);
    const holding = await page.evaluate(() => document.querySelectorAll(".opt.is-holding").length);
    check(!s.picks.length && s.focus === "choice-" + c1[1] && !holding, `clicker: a short press moves the focus without picking (focus ${s.focus}, fill ${holding})`);
    // Enter and Space pick the focused option.
    await page.keyboard.press("Enter");
    s = await st(page);
    check(s.picks.includes("c1") && s.choices.c1 === c1[1], `clicker: Enter picks the focused option (${JSON.stringify(s.choices)})`);
    check(errors.length === 0, "clicker: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- N5 (b): the scold animation plays once
  await run("scold animation", async () => {
    // The save as the page finds it at document start, before the game runs (see the reload below).
    const bootSave = () => {
      try {
        window.__bootSave = localStorage.getItem("bhs.v1.save");
      } catch (e) {
        window.__bootSave = null;
      }
    };
    const { ctx, page, errors } = await open(index + "#scribe", { settings: INSTANT, init: bootSave });
    const sc = await firstOf(page, "scribe", "scold");
    await move(page, { kind: "choice", id: sc.choice }, null, true);
    await page.waitForTimeout(500);
    await page.click(`[data-testid="choice-${sc.option}"]`);
    // The scold line, then the re-ask: the option leaves there once.
    for (let i = 0; i < 6; i++) {
      const s = await st(page);
      if (s.step === "choice") break;
      await page.waitForTimeout(260);
      await page.click('[data-testid="advance"]');
    }
    let s = await st(page);
    const leaving = await page.evaluate(() => {
      const b = document.querySelector(".opt--leaving .opt__body");
      return { n: document.querySelectorAll(".opt--leaving").length, strike: b ? getComputedStyle(b).textDecorationLine : null };
    });
    check(s.step === "choice" && s.stepId === sc.choice && leaving.n === 1, `N5: the re-ask shows the scolded option leaving (${s.stepId}, ${leaving.n})`);
    check(/line-through/.test(leaving.strike || ""), `scold cue: the leaving option is struck through (${leaving.strike})`);
    // While it leaves and the others glide, the options keep their size and stay inside the panel.
    const frames = await page.evaluate(
      () =>
        new Promise((done) => {
          const out = [];
          const t0 = performance.now();
          const tick = () => {
            const box = document.getElementById("choices").getBoundingClientRect();
            const opts = Array.from(document.querySelectorAll("#choices .opt:not(.opt--leaving)")).map((b) => b.getBoundingClientRect());
            out.push({ h: opts.map((r) => Math.round(r.height)), out: opts.some((r) => r.bottom > box.bottom + 1 || r.top < box.top - 1) });
            if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
            else done(out);
          };
          tick();
        })
    );
    const h0 = frames[0].h;
    const grew = frames.filter((f) => f.h.some((x, i) => Math.abs(x - h0[i]) > 1)).length;
    const outside = frames.filter((f) => f.out).length;
    check(!grew && !outside, `scold removal: the remaining options keep their size and stay in the panel (${frames.length} frames, ${grew} resized, ${outside} outside)`);
    await page.click('[data-testid="hdr-lang-en"]');
    const again = await page.evaluate(() => document.querySelectorAll(".opt--leaving").length);
    check(again === 0, `N5: a language switch at the re-ask does not replay the exit (${again})`);
    const savedAt = await page.evaluate(() => window.__t.stored());
    // Headless Chromium can hand a file:// page reloaded right after a burst of writes an empty
    // localStorage (the writes of the page before reach the store a moment later); a class reloading
    // seconds into a lesson still finds its earlier saves. So the writes settle first, and when the
    // reloaded page still starts without the save, the browser lost it, not the game: it is put back
    // once. A save the page did start with and the game then dropped fails the check.
    const reload = async () => {
      await page.waitForTimeout(2500);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.body.dataset.screen === "title");
      // The title ignores clicks for a moment after it appears (the guard).
      await page.waitForTimeout(450);
      return page.locator('[data-testid="continue"]').count();
    };
    let cont = await reload();
    let boot = await page.evaluate(() => window.__bootSave);
    if (!cont && !boot) {
      notes.push("scold animation: the browser started the reloaded page without the save; put back once");
      await page.evaluate((s) => localStorage.setItem("bhs.v1.save", JSON.stringify(s)), savedAt);
      cont = await reload();
      boot = await page.evaluate(() => window.__bootSave);
    }
    if (!cont) {
      const now = await page.evaluate(() => ({ save: localStorage.getItem("bhs.v1.save"), url: location.href }));
      throw new Error(`no Continue after the reload (${boot ? "the game dropped the save it started with" : "the page started without the save"}): save before ${JSON.stringify(savedAt).slice(0, 200)}; now ${JSON.stringify(now).slice(0, 300)}`);
    }
    await page.click('[data-testid="continue"]');
    const resumed = await page.evaluate(() => ({ leaving: document.querySelectorAll(".opt--leaving").length, step: window.BHS_DEBUG.state().stepId }));
    check(resumed.step === sc.choice && resumed.leaving === 0, `N5: Continue at a re-ask does not replay the exit (${JSON.stringify(resumed)})`);
    check(errors.length === 0, "scold animation: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- S4: the idle cursor
  await run("idle cursor", async () => {
    const { ctx, page, errors } = await open(index + "?test=1");
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(3400);
    let idle = await page.evaluate(() => ({ screen: document.body.dataset.screen, idle: document.body.classList.contains("is-idle") }));
    check(idle.screen === "prologue" && idle.idle, `S4: keyboard only, the cursor hides in the prologue (${JSON.stringify(idle)})`);
    await page.evaluate(() => window.BHS_DEBUG.showTree("scribe"));
    idle = await page.evaluate(() => document.body.classList.contains("is-idle"));
    check(!idle, "S4: the cursor shows on the story tree");
    await page.keyboard.press("Enter");
    await page.keyboard.press("2");
    await page.waitForTimeout(3400);
    idle = await page.evaluate(() => ({ screen: document.body.dataset.screen, idle: document.body.classList.contains("is-idle") }));
    check(idle.screen === "play" && idle.idle, `S4: after a story tree the cursor hides again in the next route (${JSON.stringify(idle)})`);
    await page.mouse.move(400, 300);
    await page.mouse.move(420, 320);
    idle = await page.evaluate(() => document.body.classList.contains("is-idle"));
    check(!idle, "S4: moving the mouse shows the cursor");
    await page.waitForTimeout(3400);
    idle = await page.evaluate(() => document.body.classList.contains("is-idle"));
    check(idle, "S4: and it hides again after a few seconds");
    check(errors.length === 0, "idle cursor: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- N1, N7: after the true ending
  await run("after the true ending", async () => {
    const { ctx, page, errors } = await open(index + "?test=1#friend");
    check((await move(page, { kind: "last" }, null, true)) === "ok", "N1: friend reaches the last line");
    const last = await page.evaluate(() => document.body.classList.contains("is-last"));
    check(last, "N1: the last line darkens the veil");
    for (let i = 0; i < 8 && (await st(page)).screen !== "tree"; i++) await page.click('[data-testid="advance"]');
    let s = await st(page);
    const onTree = await page.evaluate(() => document.body.classList.contains("is-last"));
    check(s.screen === "tree" && !onTree, `N1: the story tree has no last-line veil (${s.screen}, is-last ${onTree})`);
    // N7: a reload on the tree keeps the place: Continue opens the route select.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.screen === "title");
    const cont = await page.locator('[data-testid="continue"]').count();
    check(cont === 1, "N7: a reload on the story tree offers Continue");
    await page.keyboard.press("PageDown");
    s = await st(page);
    const veil = await page.evaluate(() => getComputedStyle(document.getElementById("veil")).backgroundColor);
    check(s.screen === "routeSelect", `N7: Continue opens the route select (${s.screen})`);
    check(/0\.25\)$/.test(veil), `N1: the route select has its light veil (${veil})`);
    check((await page.locator('[data-testid="routecard-played-friend"]').count()) === 1, "N7: friend is stamped as played");
    check(errors.length === 0, "after the ending: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- N2: storage reads but cannot write
  await run("read-only storage", async () => {
    const init = () => {
      try {
        localStorage.setItem("bhs.v1.gallery", JSON.stringify(["scribe-bad-typo"]));
      } catch (e) {
        /* storage off */
      }
      Storage.prototype.setItem = function () {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      };
    };
    const { ctx, page, errors } = await open(index + "?test=1#friend", { init });
    check((await move(page, { kind: "end" }, null, true)) === "ok", "N2: friend reaches the end");
    let s = await st(page);
    const tree = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="tree-friend"]');
      return t ? t.getAttribute("data-done") : null;
    });
    check(s.screen === "tree" && tree === "true", `N2: the tree shows this session's true ending (${s.screen}, done ${tree})`);
    check(s.seen.includes("friend-good") && s.seen.includes("scribe-bad-typo"), `N2: stored and session ids are merged (${s.seen.join()})`);
    await page.click('[data-testid="tree-next"]');
    s = await st(page);
    const stamp = await page.locator('[data-testid="routecard-played-friend"]').count();
    check(s.screen === "routeSelect" && stamp === 1 && s.focus === "route-scribe", `N2: friend is stamped and the focus waits on the scribe (${stamp}, focus ${s.focus})`);
    check(errors.length === 0, "read-only storage: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- N3, N4: damaged settings and saves
  await run("damaged data", async () => {
    for (const [size, want] of [
      [1.5, "1.12"],
      [9, "1.4"],
      [-3, "0.9"],
      ["2", "1.12"]
    ]) {
      const { ctx, page, errors } = await open(index + "?test=1#scribe", { settings: { lang: "both", speed: "normal", size } });
      const scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim());
      const fsz = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#text p")).fontSize));
      check(scale === want && fsz > 20, `N3: stored size ${JSON.stringify(size)} gives text scale ${want} (${scale}, story ${fsz}px)`);
      check(errors.length === 0, "N3: console errors " + errors.join(" | "));
      await ctx.close();
    }
    const { ctx, page, errors } = await open(index + "?test=1#scribe");
    await move(page, { kind: "choice", id: "c2" }, null, true);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("bhs.v1.save"));
      s.state.retry = { routeId: "scribe" };
      localStorage.setItem("bhs.v1.save", JSON.stringify(s));
    });
    await page.goto(index + "?test=1", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.screen === "title");
    const cont = await page.locator('[data-testid="continue"]').count();
    const left = await page.evaluate(() => localStorage.getItem("bhs.v1.save"));
    check(cont === 0 && left === null, `N4: a save with a damaged Try-again snapshot is dropped (Continue ${cont}, key ${left === null ? "removed" : "kept"})`);
    check(errors.length === 0, "N4: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- N8: the home dialog without storage
  await run("dialog", async () => {
    const init = () => {
      const deny = () => {
        throw new Error("storage disabled");
      };
      Object.defineProperty(window, "localStorage", { get: deny, configurable: true });
    };
    const { ctx, page, errors } = await open(index + "?test=1#scribe", { init });
    await page.keyboard.press("Escape");
    const body = await page.textContent(".dialog__body");
    check(/저장이 꺼져/.test(body) && /Saving is off/.test(body), `N8: without storage the dialog does not promise a saved place ("${(body || "").trim().slice(0, 60)}")`);
    const inside = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
      inside.push(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid")));
    }
    check(inside.every((x) => x === "confirm-yes" || x === "confirm-no"), `N8: Tab stays inside the dialog (${inside.join(",")})`);
    await page.keyboard.press("Escape");
    check((await page.locator('[data-testid="confirm-yes"]').count()) === 0, "N8: Esc closes the dialog");
    check(errors.length === 0, "dialog: console errors " + errors.join(" | "));
    await ctx.close();
  });

  // ---------------------------------------------------------------- layout fixes from the visual audit
  await run("layout", async () => {
    // The choice prompt's English sits on its own line on a TV.
    {
      const { ctx, page, errors } = await open(index + "?test=1#asher");
      await move(page, { kind: "choice", id: "c1" }, null, true);
      const pr = await page.evaluate(() => {
        const en = document.querySelector(".choices__prompt .en");
        return en ? { display: getComputedStyle(en).display, before: getComputedStyle(en, "::before").content } : null;
      });
      check(pr && pr.display === "block" && (pr.before === "none" || pr.before === "normal"), `prompt: the English line stands on its own on a TV (${JSON.stringify(pr)})`);
      // The last line: one sentence per line.
      await page.evaluate(() => window.BHS_DEBUG.startRoute("friend"));
      await move(page, { kind: "last" }, null, true);
      const last = await page.evaluate(() => Array.from(document.querySelectorAll("#text p")).map((p) => ({ lines: p.textContent.split("\n").length, ws: getComputedStyle(p).whiteSpace })));
      check(last.length === 2 && last.every((x) => x.lines === 2 && x.ws === "pre-line"), `last line: one sentence per line (${JSON.stringify(last)})`);
      // The default button is also the filled one (title with a save, the Esc dialog).
      await page.keyboard.press("Escape");
      const dlg = await page.evaluate(() => ({ no: document.querySelector('[data-testid="confirm-no"]').className, focus: document.activeElement.getAttribute("data-testid") }));
      check(/btn--primary/.test(dlg.no) && dlg.focus === "confirm-no", `dialog: "Keep playing" is focused and filled (${JSON.stringify(dlg)})`);
      await page.click('[data-testid="confirm-yes"]');
      await page.waitForFunction(() => document.body.dataset.screen === "title");
      const title = await page.evaluate(() => ({ cont: document.querySelector('[data-testid="continue"]').className, start: document.querySelector('[data-testid="start"]').className }));
      check(/btn--primary/.test(title.cont) && /btn--ghost/.test(title.start), `title: with a save Continue is the filled button (${JSON.stringify(title)})`);
      check(errors.length === 0, "layout: console errors " + errors.join(" | "));
      await ctx.close();
    }
    // The story tree's root plate stays inside its card (TV sizes, 4:3 included); the three trees fit 4:3.
    for (const [w, h] of [
      [1920, 1080],
      [1280, 720],
      [1024, 768]
    ]) {
      const { ctx, page, errors } = await open(index + "?test=1", { viewport: { width: w, height: h } });
      await page.evaluate(() => {
        const E = window.BHS.engine;
        const ids = [];
        ["scribe", "friend", "asher"].forEach((r) => {
          const t = E.treeOf(r);
          ids.push(t.good.id);
          t.levels.forEach((lv) => lv.branches.forEach((b) => ids.push(b.id)));
        });
        localStorage.setItem("bhs.v1.gallery", JSON.stringify(ids));
      });
      for (const rid of ["scribe", "friend", "asher"]) {
        await page.evaluate((r) => window.BHS_DEBUG.showTree(r), rid);
        const m = await page.evaluate(() => {
          const card = document.querySelector("section.tree").getBoundingClientRect();
          const plate = document.querySelector(".tree__plate").getBoundingClientRect();
          const scr = document.getElementById("screen");
          return { plate: Math.round(plate.bottom), card: Math.round(card.bottom), scroll: scr.scrollHeight - scr.clientHeight };
        });
        check(m.plate <= m.card && m.scroll <= 1, `tree ${w}x${h} ${rid}: the name plate stays inside the card, nothing scrolls (${JSON.stringify(m)})`);
      }
      await page.evaluate(() => window.BHS_DEBUG.showTrees());
      const t = await page.evaluate(() => {
        const scr = document.getElementById("screen");
        return scr.scrollHeight - scr.clientHeight;
      });
      // SPEC 5.6 asks 16:9 TVs to fit; 4:3 depends on the fonts (the web fonts fit, offline fallbacks may not).
      if (w / h > 1.5) check(t <= 1, `trees ${w}x${h}: the three trees fit without scrolling (${t}px)`);
      else notes.push(`trees ${w}x${h}: ${t}px to scroll with the fonts of this machine`);
      check(errors.length === 0, `trees ${w}x${h}: console errors ${errors.join(" | ")}`);
      await ctx.close();
    }
    // Phones: the header has a backdrop over the scrolling page screens; a TV keeps a clear header.
    for (const [w, h, want] of [
      [390, 844, true],
      [1920, 1080, false]
    ]) {
      const { ctx, page, errors } = await open(index + "?test=1", { viewport: { width: w, height: h }, dpr: w < 900 ? 2 : 1 });
      const looks = [];
      for (const show of ["showTree", "showTrees"]) {
        await page.evaluate((f) => (f === "showTree" ? window.BHS_DEBUG.showTree("scribe") : window.BHS_DEBUG.showTrees()), show);
        looks.push(await page.evaluate(() => getComputedStyle(document.getElementById("topbar")).backgroundImage));
      }
      check(looks.every((b) => /gradient/.test(b) === want), `header ${w}x${h}: ${want ? "a backdrop" : "no backdrop"} on the tree pages (${looks.map((b) => b.slice(0, 16)).join(", ")})`);
      check(errors.length === 0, `header ${w}x${h}: console errors ${errors.join(" | ")}`);
      await ctx.close();
    }
    // Settings chips never wrap and stay inside the panel (phone, small phone, tablet, TV).
    for (const [w, h, dpr] of [
      [390, 844, 2],
      [360, 640, 2],
      [768, 1024, 2],
      [1920, 1080, 1]
    ]) {
      const { ctx, page, errors } = await open(index + "?test=1#scribe", { viewport: { width: w, height: h }, dpr });
      await page.click('[data-testid="settings-open"]');
      const m = await page.evaluate(() => {
        const box = document.getElementById("settings");
        const inner = box.getBoundingClientRect().right - parseFloat(getComputedStyle(box).paddingRight);
        const chips = Array.from(box.querySelectorAll(".chip"));
        return { over: Math.round(Math.max(...chips.map((c) => c.getBoundingClientRect().right)) - inner), ws: getComputedStyle(chips[0]).whiteSpace };
      });
      check(m.over <= 1 && m.ws === "nowrap", `settings ${w}x${h}: the chips stay on one line inside the panel (${JSON.stringify(m)})`);
      check(errors.length === 0, `settings ${w}x${h}: console errors ${errors.join(" | ")}`);
      await ctx.close();
    }
    // TV details: the scribe's read-receipt stamp is legible, verse lines are balanced, the reference keeps
    // clear of the corner marker, unseen tree stubs are visible.
    {
      const { ctx, page, errors } = await open(index + "?test=1#scribe");
      const ok = await page.evaluate(() => {
        const g = window.BHS_DEBUG.game();
        g.fastForward({ until: () => !!(g.state.stage.pinned && g.state.stage.pinned.read) });
        window.BHS_DEBUG.render();
        return !!document.querySelector(".receipt");
      });
      const rc = ok ? await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".receipt")).fontSize)) : 0;
      check(rc >= 0.029 * 1080, `receipt: 「읽음」 is at least 3vh on a TV (${rc}px)`);
      await page.evaluate(() => window.BHS_DEBUG.startRoute("scribe"));
      await move(page, { kind: "verse" }, null, true);
      const v = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="verse-card"] #text p');
        const cs = getComputedStyle(p);
        return { wrap: cs.textWrapStyle || cs.textWrap || "", pad: parseFloat(getComputedStyle(document.getElementById("ref")).paddingRight) };
      });
      check(/balance/.test(v.wrap) && v.pad > 10, `verse card: balanced lines and the reference clear of the marker (${JSON.stringify(v)})`);
      await page.evaluate(() => window.BHS_DEBUG.showTree("scribe"));
      const stub = await page.evaluate(() => {
        const w = document.querySelector('.branch[data-state="unseen"] .branch__wood');
        return w ? Number(getComputedStyle(w).opacity) : null;
      });
      check(stub !== null && stub >= 0.55, `tree: unseen stubs are visible on a TV (opacity ${stub})`);
      check(errors.length === 0, "TV details: console errors " + errors.join(" | "));
      await ctx.close();
    }
    // The played stamp stays clear of the text and the figure at every size.
    for (const [w, h, dpr] of [
      [1920, 1080, 1],
      [1280, 720, 1],
      [390, 844, 2]
    ]) {
      const { ctx, page, errors } = await open(index + "?test=1", { viewport: { width: w, height: h }, dpr });
      await page.evaluate(() => {
        localStorage.setItem("bhs.v1.gallery", JSON.stringify(["scribe-good", "friend-good", "asher-good"]));
        localStorage.setItem("bhs.v1.save", JSON.stringify({ v: 3, at: 1, screen: "routeSelect", routeId: null, state: null }));
      });
      await page.goto(index + "?test=1", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.body.dataset.screen === "title");
      await page.click('[data-testid="continue"]');
      const m = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".routecard")).map((c) => {
          const r = (el) => (el ? el.getBoundingClientRect() : null);
          const b = r(c.querySelector('[data-testid^="routecard-played-"]'));
          const fig = r(c.querySelector(".routecard__fig"));
          const tag = r(c.querySelector(".routecard__tag"));
          const first = r(c.querySelector(".routecard__first"));
          return { text: c.querySelector('[data-testid^="routecard-played-"]').innerText.trim().replace(/\s+/g, " "), clear: !!b && b.top >= tag.bottom - 0.5 && b.bottom <= first.top + 0.5 && (!fig || b.right <= fig.left + 0.5 || b.bottom <= fig.top + 0.5), inCard: !!b && b.right <= c.getBoundingClientRect().right };
        })
      );
      check(m.length === 3 && m.every((x) => x.clear && x.inCard && x.text === "✓ 끝까지 함 Finished"), `played stamp ${w}x${h}: "✓ 끝까지 함" over "Finished", clear of text and figure (${JSON.stringify(m)})`);
      check(errors.length === 0, `played stamp ${w}x${h}: console errors ${errors.join(" | ")}`);
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------- memory-verse card: "…" and fit
  await run("memory card", async () => {
    {
      const { ctx, page, errors } = await open(index + "?test=1#scribe");
      for (const rid of ["scribe", "friend", "asher"]) {
        await page.evaluate((r) => window.BHS_DEBUG.startRoute(r), rid);
        await move(page, { kind: "memory" }, null, true);
        for (const lang of ["ko", "en", "both"]) {
          await page.click(`[data-testid="hdr-lang-${lang}"]`);
          const texts = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="memory-verse"] #text p')).map((p) => p.textContent));
          const want = rid === "scribe";
          check(texts.length === (lang === "both" ? 2 : 1) && texts.every((t) => /…$/.test(t) === want), `memory card ${rid} ${lang}: ${want ? 'a trailing "…" (the verse goes on)' : 'no trailing "…"'} (${texts.map((t) => "…" + t.slice(-12)).join(" | ")})`);
        }
      }
      check(errors.length === 0, "memory card text: console errors " + errors.join(" | "));
      await ctx.close();
    }
    for (const [w, h, dpr] of [
      [1920, 1080, 1],
      [1280, 720, 1],
      [390, 844, 2],
      [360, 640, 2]
    ]) {
      for (const size of [1, 4]) {
        const { ctx, page, errors } = await open(index + "?test=1#friend", { viewport: { width: w, height: h }, dpr, settings: { lang: "both", speed: "normal", size } });
        await move(page, { kind: "memory" }, null, true);
        for (const lang of ["ko", "en", "both"]) {
          await page.click(`[data-testid="hdr-lang-${lang}"]`);
          const m = await page.evaluate(() => {
            const p = document.getElementById("panel").getBoundingClientRect();
            const hdr = document.getElementById("topbar").getBoundingClientRect();
            return { top: p.top, bottom: p.bottom, hdr: hdr.bottom, vh: innerHeight, fit: document.getElementById("panel").style.getPropertyValue("--memory-fit"), overX: document.documentElement.scrollWidth - innerWidth, key: window.BHS_DEBUG.game().step.key };
          });
          const ok = m.top >= m.hdr - 1 && m.bottom <= m.vh + 1 && m.overX <= 1;
          check(m.key === "MT_9_2" && ok, `memory card fits ${w}x${h} ${lang} text size ${size} (${m.key}: card ${Math.round(m.top)}-${Math.round(m.bottom)}, header ${Math.round(m.hdr)}, screen ${m.vh}, fit ${m.fit || "1"})`);
          if (size === 1 && w >= 390) check(!m.fit, `memory card ${w}x${h} ${lang}: the default size needs no scaling (fit ${m.fit})`);
          if (m.fit) notes.push(`memory card ${w}x${h} ${lang} size ${size}: type scaled to ${m.fit}`);
        }
        check(errors.length === 0, `memory card ${w}x${h}: console errors ${errors.join(" | ")}`);
        await ctx.close();
      }
    }
  });

  await browser.close();
  return { failures, notes };
}

// Standalone run.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const chromium = await loadChromium();
  const { failures, notes } = await runInputChecks(chromium);
  notes.forEach((n) => console.log("note  " + n));
  failures.forEach((f) => console.log("FAIL  " + f));
  console.log(`\nui-input: ${failures.length} failures`);
  process.exit(failures.length ? 1 : 0);
}
