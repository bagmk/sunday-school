// tests/engine.test.mjs - engine unit tests. Run: node tests/engine.test.mjs
// Plain Node assert, no dependencies. Uses fixture routes (version 4 format) and fixture scripture only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

globalThis.window = globalThis;
globalThis.BHS_FORCE_FIXTURE = true;

function load(rel) {
  const file = path.join(root, rel);
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

load("data/meta.js");
load("data/characters.js");
load("tests/fixtures/scripture.js");
load("data/common.js");
load("tests/fixtures/routes.js");
load("js/engine.js");

const BHS = globalThis.BHS;
const E = BHS.engine;

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name, err });
  }
}

// ---------------------------------------------------------------- helpers

function playTo(game, predicate, pick) {
  return game.fastForward({ until: predicate, pick: pick || ((s, g) => g.continueOption(s)) });
}

// Plays to the end (or to a snip card); `pickMap` maps a choice id to an option id, or to an array of
// option ids tried in turn (each later presentation of the same choice takes the next entry).
function stepsUntilStop(game, pickMap = {}) {
  const log = [];
  const asked = {};
  for (let i = 0; i < 2000; i++) {
    const s = game.step;
    log.push(s);
    if (s.kind === "end" || s.kind === "routeSelect" || s.kind === "snip") break;
    if (s.kind === "choice") {
      const want = pickMap[s.id];
      const n = (asked[s.id] = (asked[s.id] || 0) + 1);
      const id = Array.isArray(want) ? want[Math.min(n - 1, want.length - 1)] : want;
      assert.ok(game.choose(id || game.continueOption(s)), `choose ${s.id}/${id}`);
    } else if (s.kind === "press") game.press();
    else game.next();
  }
  return log;
}

const texts = (log) => log.filter((s) => s.text && s.kind !== "snip").map((s) => s.text.ko);
const snapshot = (g) => JSON.parse(JSON.stringify(g.serialize()));
const ids = (step) => step.options.map((o) => o.id).join("");

// ---------------------------------------------------------------- outcomes, ids, tree

test("optionOutcome: continue by default, bad with an id, scold with an object; old fields ignored", () => {
  assert.equal(E.optionOutcome({ id: "a", text: {} }), "continue");
  assert.equal(E.optionOutcome({ id: "a", bad: "typo" }), "bad");
  assert.equal(E.optionOutcome({ id: "a", scold: { text: { ko: "x", en: "x" } } }), "scold");
  assert.equal(E.optionOutcome({ id: "a", lens: 2, cut: true }), "continue", "lens and cut (version 3) mean nothing now");
  assert.equal(E.optionOutcome({ id: "a", bad: "" }), "continue");
  assert.equal(E.optionOutcome(null), "continue");
});

test("seen ids: <route>-good and <route>-bad-<id>; lens-release ids are not parsed", () => {
  assert.equal(E.goodId("scribe"), "scribe-good");
  assert.equal(E.branchId("friend", "bigCatch"), "friend-bad-bigCatch");
  assert.deepEqual(E.parseSeenId("asher-good"), { routeId: "asher", kind: "good" });
  assert.deepEqual(E.parseSeenId("friend-bad-bigCatch"), { routeId: "friend", kind: "bad", badId: "bigCatch" });
  for (const old of ["scribe-1", "friend-cut", "asher-3", "scribe-bad-", 42, null, "Scribe-good"]) assert.equal(E.parseSeenId(old), null, String(old));
});

test("treeOf: the trunk passes every choice point; each cut branch grows once, at its first choice", () => {
  const t = E.treeOf("scribe");
  assert.equal(t.routeId, "scribe");
  assert.deepEqual(t.levels.map((l) => [l.id, l.branches.map((b) => b.badId).join(",")]), [["c1", "typo"], ["c2", "guardhouse"], ["c3", "rebuttal"], ["c4", "forgot"]]);
  assert.equal(t.levels[0].branches[0].id, "scribe-bad-typo");
  assert.deepEqual(t.levels[0].branches[0].title, BHS.fixtureRoutes.scribe.endings.bad.typo.title);
  assert.deepEqual(t.good, { id: "scribe-good", title: BHS.fixtureRoutes.scribe.endings.good.title, verse: "MT_9_6A" });
  const f = E.treeOf("friend");
  assert.deepEqual(f.levels.map((l) => l.branches.map((b) => b.badId).join(",")), ["bigCatch", "", "debate,lane", ""], "debate (c3 and c4) is drawn once, at c3");
  assert.equal(E.treeOf("nope"), null);
});

test("badTargets lists every option that cuts the story, in beat order", () => {
  assert.deepEqual(E.badTargets("friend"), [
    { choice: "c1", option: "b", badId: "bigCatch" },
    { choice: "c3", option: "b", badId: "debate" },
    { choice: "c3", option: "d", badId: "lane" },
    { choice: "c4", option: "c", badId: "debate" }
  ]);
});

// ---------------------------------------------------------------- choices

test("choice steps carry ids and texts only (no outcome), plus removed / justRemoved / again", () => {
  const g = E.createGame("scribe");
  playTo(g, (s) => s.kind === "choice" && s.id === "c1");
  const s = g.step;
  assert.equal(ids(s), "abcd");
  for (const o of s.options) assert.deepEqual(Object.keys(o).sort(), ["id", "text"]);
  assert.deepEqual(s.removed, []);
  assert.equal(s.justRemoved, null);
  assert.equal(s.again, false);
  assert.equal(g.canRetry(), true, "a shown choice can be tried again");
});

test("continue: the reaction plays, flags are set, the story goes on", () => {
  const g = E.createGame("scribe");
  playTo(g, (s) => s.kind === "choice" && s.id === "c1");
  g.choose("a");
  assert.equal(g.step.kind, "line");
  assert.equal(g.step.speaker, "thought");
  assert.equal(g.step.text.ko, "*그가*에 밑줄을 긋는다.");
  assert.equal(g.state.flags.mark, "he");
  assert.equal(g.state.choices.c1, "a");
  g.next();
  assert.equal(g.step.text.en, "What belongs to God belongs to God.");
});

test("scold: the scold line (speaker) plays, then the same choice is asked without that option", () => {
  const g = E.createGame("scribe");
  playTo(g, (s) => s.kind === "choice" && s.id === "c1");
  assert.equal(g.choose("c"), true);
  assert.equal(g.step.kind, "line");
  assert.equal(g.step.speaker, "hanan");
  assert.equal(g.step.text.ko, "선생님, 그건 좀…");
  assert.equal(g.state.choices.c1, undefined, "a scolded pick is never recorded as the choice");
  g.next();
  const s = g.step;
  assert.equal(s.kind, "choice");
  assert.equal(s.id, "c1");
  assert.equal(ids(s), "abd");
  assert.deepEqual(s.removed, ["c"]);
  assert.deepEqual(s.justRemoved, { id: "c", text: BHS.fixtureRoutes.scribe.beats[4].options[2].text, at: 2 });
  assert.equal(s.again, true);
  assert.equal(g.state.choices.c1, undefined, "the re-asked choice is unanswered again");
  assert.equal(g.choose("c"), false, "a removed option cannot be picked");
  g.choose("a");
  assert.equal(g.step.text.ko, "*그가*에 밑줄을 긋는다.");
  g.next();
  assert.equal(g.step.text.en, "What belongs to God belongs to God.", "after the re-asked choice the story goes on once");
  assert.deepEqual(g.state.picks, ["c1", "c1"]);
});

test("scold without a speaker is narration; a thought speaker is the inner voice", () => {
  const g = E.createGame("scribe");
  playTo(g, (s) => s.kind === "choice" && s.id === "c3");
  g.choose("a");
  assert.equal(g.step.kind, "line");
  assert.equal(g.step.speaker, "narrator");
  assert.equal(g.step.text.ko, "하난이 말없이 기록장을 덮는다.");
  g.next();
  assert.equal(ids(g.step), "bc");
  const a = E.createGame("asher");
  playTo(a, (s) => s.kind === "choice" && s.id === "c1");
  a.choose("b");
  assert.equal(a.step.speaker, "thought");
  assert.equal(a.step.text.ko, "다리가 대답하지 않는다.");
  a.next();
  assert.equal(ids(a.step), "acd");
  assert.equal(a.step.justRemoved.at, 1);
});

test("a scold option's reaction plays before the scold line; several scolds at one choice", () => {
  const route = {
    id: "__scold",
    beats: [
      {
        type: "choice",
        id: "c1",
        prompt: { ko: "p", en: "p" },
        options: [
          { id: "a", text: { ko: "a", en: "a" }, scold: { speaker: "hanan", text: { ko: "아니지", en: "No" } }, reaction: [{ type: "line", text: { ko: "먼저", en: "First" } }] },
          { id: "b", text: { ko: "b", en: "b" }, scold: { text: { ko: "또 아니지", en: "No again" } } },
          { id: "c", text: { ko: "c", en: "c" } }
        ]
      },
      { type: "line", text: { ko: "끝", en: "End" } }
    ],
    endings: { good: { title: { ko: "끝", en: "End" }, beats: [], last: { ko: "마지막", en: "Last" } } }
  };
  BHS.routes.__scold = route;
  try {
    const g = E.createGame("__scold");
    assert.equal(ids(g.step), "abc");
    g.choose("a");
    assert.deepEqual(texts([g.step]), ["먼저"]);
    g.next();
    assert.equal(g.step.text.ko, "아니지");
    g.next();
    assert.equal(ids(g.step), "bc");
    assert.equal(g.step.justRemoved.at, 0);
    g.choose("b");
    g.next();
    assert.equal(ids(g.step), "c");
    assert.deepEqual(g.step.removed, ["a", "b"]);
    assert.equal(g.step.justRemoved.id, "b");
    assert.equal(g.step.justRemoved.at, 0, "b stood first among the options shown just before");
    g.choose("c");
    assert.equal(g.step.text.ko, "끝");
    const log = stepsUntilStop(g);
    assert.equal(log[log.length - 1].kind, "end");
  } finally {
    delete BHS.routes.__scold;
  }
});

// ---------------------------------------------------------------- cut branches + Try again

test("bad: reaction -> cut branch beats -> last -> snip card; nothing else from the route", () => {
  const g = E.createGame("scribe");
  const log = stepsUntilStop(g, { c1: "b" });
  const iPick = log.findIndex((s) => s.kind === "choice" && s.id === "c1");
  assert.equal(log[iPick + 1].text.ko, "므나헴이 두루마리에 코를 박는다.", "the bad option's reaction plays");
  assert.deepEqual(texts(log.slice(iPick + 2)), ["몇 시간 뒤", "선생님, 다들 갔어요.", "오타는 없었다. 그날 일어난 일도 못 봤다."]);
  assert.equal(log[log.length - 2].kind, "last");
  const snip = log[log.length - 1];
  assert.deepEqual(snip, { kind: "snip", routeId: "scribe", id: "scribe-bad-typo", badId: "typo", title: { ko: "오타 사냥", en: "Typo Hunt" } });
  assert.ok(!log.some((s) => s.kind === "verse" && /^MT_9_/.test(s.key)), "the rest of the route is skipped");
  assert.ok(!log.some((s) => s.kind === "endingTitle" || s.kind === "memory"), "no true-ending cards on a cut");
  assert.deepEqual(g.state.ending, { routeId: "scribe", id: "scribe-bad-typo", kind: "bad", badId: "typo", title: { ko: "오타 사냥", en: "Typo Hunt" }, cutAt: { choice: "c1", option: "b" } });
  assert.equal(g.next(), false, "the snip card waits for Try again or the title screen");
  assert.equal(g.step.kind, "snip");
});

test("bad at the crowd: the protagonist leaves the scene (pinned thought cleared, light off)", () => {
  const g = E.createGame("scribe");
  playTo(g, (s) => s.kind === "choice" && s.id === "c2");
  assert.ok(g.view().stage.pinned, "the thought is pinned when the choice is shown");
  assert.equal(g.view().stage.light, "soft");
  g.choose("a");
  assert.equal(g.step.kind, "line", "the reaction still plays at the crowd");
  assert.ok(g.view().stage.pinned, "and the thought stays during it");
  g.next();
  assert.equal(g.step.text.ko, "므나헴은 밤새 병사에게 레위기를 설명한다.");
  assert.equal(g.view().stage.pinned, null);
  assert.equal(g.view().stage.light, "off");
  const log = stepsUntilStop(g);
  assert.equal(log[log.length - 1].id, "scribe-bad-guardhouse");
});

test("Try again: back to the same choice, exactly as it was shown", () => {
  const g = E.createGame("scribe");
  playTo(g, (s) => s.kind === "choice" && s.id === "c2");
  const shown = snapshot(g);
  stepsUntilStop(g, { c2: "a" });
  assert.equal(g.step.kind, "snip");
  assert.equal(g.retry(), true);
  const back = snapshot(g);
  assert.deepEqual(back.step, shown.step, "same choice, same options");
  for (const k of ["choices", "flags", "vars", "removed", "stage", "now", "stack", "segs", "seg", "picks", "steps", "ending", "cutAt"]) {
    assert.deepEqual(back[k], shown[k], `state.${k} restored`);
  }
  assert.equal(g.choose("b"), true, "the restored choice can be answered");
  const log = stepsUntilStop(g);
  assert.equal(log[log.length - 1].kind, "end");
  assert.equal(g.state.ending.id, "scribe-good");
});

test("Try again keeps scolded options removed and earlier picks made; it can be repeated", () => {
  const g = E.createGame("scribe");
  playTo(g, (s) => s.kind === "choice" && s.id === "c1");
  g.choose("c");
  g.next();
  assert.equal(ids(g.step), "abd");
  g.choose("b");
  stepsUntilStop(g);
  assert.equal(g.step.kind, "snip");
  g.retry();
  assert.equal(g.step.kind, "choice");
  assert.equal(ids(g.step), "abd");
  assert.deepEqual(g.step.removed, ["c"]);
  assert.equal(g.step.justRemoved, null, "no removal animation after Try again");
  g.choose("b");
  stepsUntilStop(g);
  assert.equal(g.retry(), true, "Try again works a second time");
  assert.equal(ids(g.step), "abd");
  // A cut later on keeps the picks made before it.
  const h = E.createGame("scribe");
  stepsUntilStop(h, { c1: "d", c3: "b" });
  assert.equal(h.step.id, "scribe-bad-rebuttal");
  h.retry();
  assert.equal(h.step.id, "c3");
  assert.deepEqual(h.state.choices, { c1: "d", c2: "b" });
  assert.equal(h.state.flags.mark, "whole");
});

test("retry before any choice is refused", () => {
  const g = E.createGame("scribe");
  assert.equal(g.canRetry(), false);
  assert.equal(g.retry(), false);
  assert.equal(g.step.kind, "line");
});

test("a cut branch reachable from two choices plays the same branch from both", () => {
  const a = E.createGame("friend");
  stepsUntilStop(a, { c3: "b" });
  const b = E.createGame("friend");
  stepsUntilStop(b, { c4: "c" });
  assert.equal(a.step.id, "friend-bad-debate");
  assert.equal(b.step.id, "friend-bad-debate");
  assert.deepEqual(a.state.ending.cutAt, { choice: "c3", option: "b" });
  assert.deepEqual(b.state.ending.cutAt, { choice: "c4", option: "c" });
  b.retry();
  assert.equal(b.step.id, "c4");
});

test("optionMarks: a small scissors only on options whose cut branch was seen", () => {
  const g = E.createGame("friend");
  playTo(g, (s) => s.kind === "choice" && s.id === "c3");
  assert.deepEqual(g.optionMarks([]), {});
  assert.deepEqual(g.optionMarks(["friend-bad-debate", "scribe-bad-typo"]), { b: true });
  assert.deepEqual(g.optionMarks(["friend-bad-debate", "friend-bad-lane"]), { b: true, d: true });
  playTo(g, (s) => s.kind === "choice" && s.id === "c4");
  assert.deepEqual(g.optionMarks(["friend-bad-debate"]), { c: true });
  g.next();
  assert.deepEqual(E.createGame("asher").optionMarks(["asher-bad-nap"]), {}, "no marks outside a choice");
});

test("continueOption: the first option that neither cuts nor is scolded", () => {
  const g = E.createGame("asher");
  playTo(g, (s) => s.kind === "choice" && s.id === "c3");
  assert.equal(g.continueOption(), "b");
  const f = E.createGame("friend");
  assert.equal(playTo(f, (s) => s.kind === "choice" && s.id === "c4").id, "c4");
  assert.equal(f.continueOption(), "b");
});

// ---------------------------------------------------------------- true ending

test("true ending: preface -> title card (title only) -> memory verse -> beats -> last -> coda -> end", () => {
  const g = E.createGame("scribe");
  const log = stepsUntilStop(g, { c4: "a" });
  const kinds = log.map((s) => s.kind);
  const iTitle = kinds.indexOf("endingTitle");
  assert.equal(log[iTitle - 1].text.ko, "기록장을 편다.", "endingPreface right before the title card");
  assert.deepEqual(log[iTitle], { kind: "endingTitle", routeId: "scribe", title: { ko: "누가 말했는가", en: "Who Spoke" } });
  assert.deepEqual(log[iTitle + 1], { kind: "memory", key: "MT_9_6A", speaker: "jesus" });
  assert.deepEqual(texts(log.slice(iTitle + 2)), [
    "므나헴은 그 주장을 누구보다 정확히 알아들었다.",
    "그는 한 사람을 집에 보냈다. 기록장의 마지막 줄이다.",
    "하나님에 대해서는 네가 옳았다. 남은 질문은 그에 대한 것이다.",
    "― 등잔이 꺼진다 ―"
  ]);
  assert.equal(log[kinds.indexOf("last")].text.ko, "하나님에 대해서는 네가 옳았다. 남은 질문은 그에 대한 것이다.");
  assert.equal(kinds[kinds.length - 1], "end");
  assert.deepEqual(g.state.ending, { routeId: "scribe", id: "scribe-good", kind: "good", title: { ko: "누가 말했는가", en: "Who Spoke" }, verse: "MT_9_6A" });
  assert.equal(g.state.done, true);
  const other = stepsUntilStop(E.createGame("scribe"), { c4: "b" });
  assert.ok(!texts(other).includes("그는 한 사람을 집에 보냈다. 기록장의 마지막 줄이다."), "the when variant follows the pick");
});

test("true ending without a coda ends right after the last line; the memory verse of each route", () => {
  const g = E.createGame("friend");
  const log = stepsUntilStop(g);
  assert.equal(log[log.length - 2].kind, "last");
  assert.equal(log[log.length - 1].kind, "end");
  assert.equal(log.find((s) => s.kind === "memory").key, "MT_9_2A");
  assert.equal(log.find((s) => s.kind === "memory").speaker, "narrator");
  const a = stepsUntilStop(E.createGame("asher"));
  assert.equal(a.find((s) => s.kind === "memory").key, "MT_9_2B");
});

test("a route without endings.good just ends; a missing memory verse is skipped", () => {
  BHS.routes.__plain = { id: "__plain", beats: [{ type: "line", text: { ko: "가", en: "a" } }] };
  BHS.routes.__noverse = { id: "__noverse", beats: [{ type: "line", text: { ko: "가", en: "a" } }], endings: { good: { title: { ko: "끝", en: "End" }, verse: "NOPE_1", beats: [], last: { ko: "끝줄", en: "Last" } } } };
  try {
    const log = stepsUntilStop(E.createGame("__plain"));
    assert.deepEqual(log.map((s) => s.kind), ["line", "end"]);
    const log2 = stepsUntilStop(E.createGame("__noverse"));
    assert.deepEqual(log2.map((s) => s.kind), ["line", "endingTitle", "last", "end"]);
  } finally {
    delete BHS.routes.__plain;
    delete BHS.routes.__noverse;
  }
});

test("a lens-release route (endings 1/2/3/cut, options with lens/cut) is read tolerantly", () => {
  BHS.routes.__v3 = {
    id: "__v3",
    beats: [
      { type: "choice", id: "c1", prompt: { ko: "p", en: "p" }, options: [{ id: "a", text: { ko: "a", en: "a" }, lens: 1 }, { id: "b", text: { ko: "b", en: "b" }, lens: null, cut: true }] },
      { type: "line", text: { ko: "가", en: "a" } }
    ],
    endings: { 1: { beats: [], last: { ko: "x", en: "x" } }, cut: { beats: [], last: { ko: "y", en: "y" } } }
  };
  try {
    const log = stepsUntilStop(E.createGame("__v3"), { c1: "b" });
    assert.deepEqual(log.map((s) => s.kind), ["choice", "line", "end"], "an old cut option is just an option now");
  } finally {
    delete BHS.routes.__v3;
  }
});

// ---------------------------------------------------------------- every path

// Every true path (each combination of continue options) ends in the true ending; every cut option,
// after any continue prefix, ends on its snip card; Try again goes back to that choice.
test("all paths of the fixture routes: true paths, cut paths and Try again", () => {
  for (const rid of ["scribe", "friend", "asher"]) {
    const route = BHS.routes[rid];
    const choices = E.choiceBeats(route);
    const cont = choices.map((cb) => cb.options.filter((o) => E.optionOutcome(o) === "continue").map((o) => o.id));
    let trues = 0;
    let cuts = 0;
    const walk = (k, prefix) => {
      if (k === choices.length) {
        const g = E.createGame(rid);
        const log = stepsUntilStop(g, prefix);
        assert.equal(log[log.length - 1].kind, "end", `${rid} ${JSON.stringify(prefix)}`);
        assert.equal(g.state.ending.id, rid + "-good");
        trues++;
        return;
      }
      const cb = choices[k];
      for (const o of cb.options.filter((x) => E.optionOutcome(x) === "bad")) {
        const g = E.createGame(rid);
        const log = stepsUntilStop(g, Object.assign({}, prefix, { [cb.id]: o.id }));
        const snip = log[log.length - 1];
        assert.equal(snip.kind, "snip", `${rid} ${cb.id}/${o.id}`);
        assert.equal(snip.id, `${rid}-bad-${o.bad}`);
        assert.ok(g.retry());
        assert.equal(g.step.kind, "choice");
        assert.equal(g.step.id, cb.id);
        assert.ok(g.step.options.some((x) => x.id === o.id), "the cut option is still offered after Try again");
        cuts++;
      }
      for (const id of cont[k]) walk(k + 1, Object.assign({}, prefix, { [cb.id]: id }));
    };
    walk(0, {});
    assert.ok(trues >= 1 && cuts >= 2, `${rid}: ${trues} true paths, ${cuts} cut paths`);
  }
});

test("fastForward follows the true path by default and stops at a snip card", () => {
  const g = E.createGame("asher");
  assert.equal(g.fastForward().kind, "end");
  assert.equal(g.state.ending.id, "asher-good");
  const h = E.createGame("asher");
  const s = h.fastForward({ pick: (st) => (st.id === "c2" ? "b" : h.continueOption(st)) });
  assert.equal(s.kind, "snip");
  assert.equal(s.id, "asher-bad-stayedHome");
});

// ---------------------------------------------------------------- conditions

test("evalCond: choice is / in", () => {
  const st = { choices: { c3: "a" }, flags: {} };
  assert.equal(E.evalCond({ choice: "c3", is: "a" }, st), true);
  assert.equal(E.evalCond({ choice: "c3", is: "b" }, st), false);
  assert.equal(E.evalCond({ choice: "c3", in: ["b", "a"] }, st), true);
  assert.equal(E.evalCond({ choice: "c4", in: ["a"] }, st), false);
  assert.equal(E.evalCond({ choice: "c4", is: "a" }, st), false);
});

test("evalCond: flag is / in, unset counts as false", () => {
  const st = { choices: {}, flags: { mark: "he", stood: true } };
  assert.equal(E.evalCond({ flag: "stood", is: true }, st), true);
  assert.equal(E.evalCond({ flag: "mark", in: ["he", "order"] }, st), true);
  assert.equal(E.evalCond({ flag: "mark", in: ["whole"] }, st), false);
  assert.equal(E.evalCond({ flag: "missing", is: true }, st), false);
  assert.equal(E.evalCond({ flag: "missing", is: false }, st), true);
  assert.equal(E.evalCond({ flag: "stood" }, st), true);
});

test("evalCond: all / any / not and implicit array; lens conditions are unknown now", () => {
  const st = { choices: { c1: "a" }, flags: { stood: true } };
  assert.equal(E.evalCond({ all: [{ choice: "c1", is: "a" }, { flag: "stood", is: true }] }, st), true);
  assert.equal(E.evalCond({ all: [{ choice: "c1", is: "a" }, { flag: "stood", is: false }] }, st), false);
  assert.equal(E.evalCond({ any: [{ choice: "c1", is: "b" }, { flag: "stood", is: true }] }, st), true);
  assert.equal(E.evalCond({ any: [] }, st), false);
  assert.equal(E.evalCond({ not: { flag: "stood", is: true } }, st), false);
  assert.equal(E.evalCond({ not: { all: [{ choice: "c1", is: "b" }] } }, st), true);
  assert.equal(E.evalCond([{ choice: "c1", is: "a" }, { flag: "stood" }], st), true);
  assert.equal(E.evalCond(null, st), true);
  assert.equal(E.evalCond({ lastLens: 2 }, { lastLens: 2 }), false);
  assert.equal(E.evalCond({ bogus: 1 }, {}), false);
  assert.equal(E.evalCond({ var: "n", gte: 2 }, { vars: { n: 3 } }), true);
  assert.equal(E.evalCond({ var: "n", is: 0 }, { vars: {} }), true);
});

test("friend: flags and all/any/not conditions drive lines", () => {
  const t = texts(stepsUntilStop(E.createGame("friend"), { c2: "c", c3: "a", c4: "d" }));
  assert.ok(t.includes("그 손들 가운데 네 손이 있다."), "flag condition");
  assert.ok(t.includes("요나는 물러서서 아셀이 자기 침상을 들게 둔다."), "any[] via flag");
  assert.ok(t.includes("행인 앞을 막아섰던 손이 이제는 비어 있다."), "all[] + not");
  const t2 = texts(stepsUntilStop(E.createGame("friend"), { c2: "a", c3: "c", c4: "b" }));
  assert.ok(t2.includes("요나는 물러서서 아셀이 자기 침상을 들게 둔다."), "any[] via choice");
  assert.ok(!t2.includes("행인 앞을 막아섰던 손이 이제는 비어 있다."));
});

// ---------------------------------------------------------------- tokens

test("resolveText: verse tokens get curly quotes in both languages", () => {
  const t = { ko: "읽는다. {{v:PS_103_3}}", en: "You read. {{v:PS_103_3}}" };
  assert.equal(E.resolveText(t, "ko", {}), "읽는다. “그가 네 모든 죄악을 사하시며 네 모든 병을 고치시며”");
  assert.equal(E.resolveText(t, "en", {}), "You read. “…who forgives all your iniquity, who heals all your diseases,”");
});

test("verse display rule (SPEC 4.3): an English excerpt that starts with a lowercase letter gets a leading …", () => {
  assert.equal(E.verseText("MT_9_2B2", "en"), "your sins are forgiven.");
  assert.equal(E.verseDisplay("MT_9_2B2", "en"), "…your sins are forgiven.");
  assert.equal(E.verseDisplay("MT_9_2B1", "en"), "Take heart, my son;");
  assert.equal(E.verseDisplay("MT_9_6N", "en"), "—he then said to the paralytic—");
  assert.equal(E.verseDisplay("MT_9_2B2", "ko"), "네 죄 사함을 받았느니라");
  assert.equal(E.verseDisplay("MT_20_2", "en"), null);
  assert.equal(E.verseDisplay("NOPE_1", "en"), null);
  const t = { ko: "그 말 {{v:MT_9_2B2}}", en: "The words {{v:MT_9_2B2}}" };
  assert.equal(E.resolveText(t, "en", {}), "The words “…your sins are forgiven.”");
  assert.equal(E.plainText(t, "en", {}), "The words “…your sins are forgiven.”");
  const seg = E.resolveSegments(t, "en", {}).find((s) => s.kind === "v");
  assert.equal(seg.key, "MT_9_2B2");
  const g = E.createSequence([{ type: "verse", key: "MT_9_2B2" }]);
  assert.equal(g.step.kind, "verse");
  assert.equal(g.step.key, "MT_9_2B2");
});

test("memory-card display rule (SPEC 4.6): a trailing … only for an excerpt that stops mid-sentence", () => {
  const scr = BHS.scripture;
  const full6 = { ko: "그러나 인자가 세상에서 죄를 사하는 권능이 있는 줄을 너희로 알게 하려 하노라 하시고 중풍병자에게 말씀하시되", en: "But that you may know that the Son of Man has authority on earth to forgive sins”—he then said to the paralytic—" };
  const full2 = { ko: "침상에 누운 중풍병자를 데리고 오거늘 이르시되 작은 자야 안심하라 네 죄 사함을 받았느니라", en: "And behold, some people brought to him a paralytic. He said, “Take heart, my son; your sins are forgiven.”" };
  const tmp = {
    T_6A: { ref: { ko: "마 9:6", en: "Matt 9:6" }, ko: "그러나 인자가 세상에서 죄를 사하는 권능이 있는 줄을 너희로 알게 하려 하노라", en: "But that you may know that the Son of Man has authority on earth to forgive sins", speaker: "jesus", full: full6 },
    T_2: { ref: { ko: "마 9:2", en: "Matt 9:2" }, ko: full2.ko, en: full2.en, speaker: "narrator", full: full2 },
    T_2B: { ref: { ko: "마 9:2", en: "Matt 9:2" }, ko: "작은 자야 안심하라 네 죄 사함을 받았느니라", en: "Take heart, my son; your sins are forgiven.", speaker: "jesus", full: full2 },
    T_2B2: { ref: { ko: "마 9:2", en: "Matt 9:2" }, ko: "네 죄 사함을 받았느니라", en: "your sins are forgiven.", speaker: "jesus", full: full2 }
  };
  Object.assign(scr, tmp);
  try {
    assert.equal(E.memoryDisplay("T_6A", "en"), tmp.T_6A.en + "…", "the scribe's verse stops mid-sentence (EN)");
    assert.equal(E.memoryDisplay("T_6A", "ko"), tmp.T_6A.ko + "…", "the scribe's verse stops mid-sentence (KO)");
    assert.equal(E.memoryDisplay("T_2", "en"), full2.en, "a whole verse is unchanged");
    assert.equal(E.memoryDisplay("T_2", "ko"), full2.ko);
    assert.equal(E.memoryDisplay("T_2B", "en"), tmp.T_2B.en, "an excerpt ending with a period is unchanged");
    assert.equal(E.memoryDisplay("T_2B", "ko"), tmp.T_2B.ko, "nothing follows the Korean excerpt");
    assert.equal(E.memoryDisplay("T_2B2", "en"), "…your sins are forgiven.", "the leading … rule still applies");
    assert.equal(E.verseDisplay("T_6A", "en"), tmp.T_6A.en, "verse cards are unchanged");
    assert.equal(E.memoryDisplay("MT_9_6A", "en"), E.verseDisplay("MT_9_6A", "en"), "no full verse: nothing to compare, unchanged");
    assert.equal(E.memoryDisplay("NOPE_1", "en"), null);
    assert.equal(scr.T_6A.en, "But that you may know that the Son of Man has authority on earth to forgive sins", "data unchanged");
  } finally {
    Object.keys(tmp).forEach((k) => delete scr[k]);
  }
});

test("resolveText: inner double quotes become single curly quotes inside the token quotes", () => {
  assert.equal(E.resolveText({ ko: "{{v:MT_9_3}}", en: "{{v:MT_9_3}}" }, "en", {}), "“And behold, some of the scribes said to themselves, ‘This man is blaspheming.’”");
  assert.equal(E.resolveText({ ko: "x", en: "{{v:MT_9_5}}" }, "en", {}), "“For which is easier, to say, ‘Your sins are forgiven,’ or to say, ‘Rise and walk’?”");
  assert.equal(E.quoteVerse('He said, "Go." Then "stay"'), "“He said, ‘Go.’ Then ‘stay’”");
  assert.equal(E.resolveText({ ko: "{{v:MT_9_3}}", en: "x" }, "ko", {}), "“어떤 서기관들이 속으로 이르되 이 사람이 신성을 모독하도다”");
});

test("resolveText: references, vars, missing keys, emphasis, plain strings", () => {
  const t = { ko: "({{r:PS_103_3}}) 시도 {{var:getup_count}}번", en: "({{r:PS_103_3}}) tried {{var:getup_count}} times" };
  assert.equal(E.resolveText(t, "ko", { vars: { getup_count: 3 } }), "(시 103:3) 시도 3번");
  assert.equal(E.resolveText(t, "en", { vars: {} }), "(Ps 103:3) tried 0 times");
  assert.equal(E.resolveText({ ko: "{{v:NOPE_1}}", en: "{{r:NOPE_1}}" }, "ko", { debug: true }), "[NOPE_1]");
  assert.equal(E.resolveText({ ko: "{{v:NOPE_1}}", en: "{{r:NOPE_1}}" }, "ko", {}), "“…”");
  assert.equal(E.resolveText({ ko: "{{v:NOPE_1}}", en: "{{r:NOPE_1}}" }, "en", {}), "…");
  assert.equal(E.plainText({ ko: "*그가*에 밑줄", en: "x" }, "ko", {}), "그가에 밑줄");
  assert.deepEqual(E.resolveSegments({ ko: "x", en: "You underline *who*." }, "en", {}), [
    { text: "You underline ", em: false },
    { text: "who", em: true },
    { text: ".", em: false }
  ]);
  assert.equal(E.resolveText("{{r:MT_9_7}}", "ko", {}), "마 9:7");
});

// ---------------------------------------------------------------- scribe FX + asher presses

test("scribe: hush + echoVerse apply to the next beat only, with flag highlights", () => {
  const g = E.createGame("scribe");
  playTo(g, (s) => s.kind === "verse" && s.key === "MT_9_2B");
  const v = g.view();
  assert.equal(v.now.hush, true);
  assert.deepEqual(v.now.echo, { key: "PS_103_3", marks: { ko: ["그가"], en: ["who forgives"] } });
  assert.equal(v.stage.light, "bright");
  assert.equal(v.step.speaker, "jesus");
  g.next();
  assert.equal(g.view().now.hush, false);
  assert.equal(g.view().now.echo, null);
  const g2 = E.createGame("scribe");
  playTo(g2, (s) => s.kind === "verse" && s.key === "MT_9_2B", (s, gg) => (s.id === "c1" ? "d" : gg.continueOption(s)));
  assert.equal(g2.view().now.echo.marks, "*");
});

test("scribe: pinThought, readReceipt, unpinThought", () => {
  const g = E.createGame("scribe");
  playTo(g, (s) => s.kind === "choice" && s.id === "c2");
  assert.deepEqual(g.view().stage.pinned, { items: [{ type: "verse", key: "MT_9_3Q" }], read: false });
  playTo(g, (s) => s.kind === "verse" && s.key === "MT_9_4N");
  assert.equal(g.view().stage.pinned.read, true);
  playTo(g, (s) => s.kind === "verse" && s.key === "MT_9_5");
  assert.equal(g.view().stage.pinned, null);
});

test("asher: label presses, pov, risen; next() refuses at a press", () => {
  const g = E.createGame("asher");
  assert.equal(g.view().stage.pov, "lying");
  playTo(g, (s) => s.kind === "press");
  assert.equal(g.step.label.ko, "일어나기");
  assert.equal(g.step.action, null);
  assert.equal(g.next(), false);
  assert.equal(g.choose("a"), false);
  assert.equal(g.view().stage.risen, true);
  assert.equal(g.press(), true);
  assert.equal(g.view().stage.pov, "standing");
  assert.equal(g.step.label.en, "Pick up your bed");
  g.press();
  assert.equal(g.step.label.ko, "집으로");
  assert.equal(g.actions().length, 0, "no persistent buttons on a route without actions");
});

test("persistent actions stay supported: replies, counters, the lit press, var token", () => {
  BHS.routes.__acts = {
    id: "__acts",
    actions: [{ id: "getup", label: { ko: "일어나기", en: "Get up" }, replies: [{ ko: "안 된다.", en: "No." }, { ko: "여전히.", en: "Still no." }], counter: "getup_count" }],
    beats: [
      { type: "line", text: { ko: "가", en: "a" } },
      { type: "press", action: "getup" },
      { type: "line", text: { ko: "시도 {{var:getup_count}}번", en: "Tries {{var:getup_count}}" } }
    ]
  };
  try {
    const g = E.createGame("__acts");
    assert.deepEqual(g.actions().map((a) => [a.id, a.lit]), [["getup", false]]);
    assert.deepEqual([1, 2, 3].map(() => g.tapAction("getup").text.ko), ["안 된다.", "여전히.", "여전히."]);
    assert.equal(g.step.kind, "line", "tapping an action never advances the story");
    g.next();
    assert.equal(g.actions()[0].lit, true);
    assert.equal(g.tapAction("getup").pressed, true);
    assert.equal(g.actions().length, 0);
    assert.equal(E.resolveText(g.step.text, "ko", g.state), "시도 3번");
  } finally {
    delete BHS.routes.__acts;
  }
});

// ---------------------------------------------------------------- portrait cast

test("cast: speakers enter stable slots; protagonist and pseudo-speakers never do", () => {
  const g = E.createGame("scribe");
  assert.deepEqual(g.view().stage.cast, []);
  playTo(g, (s) => s.kind === "line" && s.speaker === "hanan");
  assert.deepEqual(g.view().stage.cast.map((c) => [c.id, c.slot]), [["hanan", 0]]);
  g.next();
  assert.equal(g.view().stage.speaking, null, "nobody speaks during a choice");
  playTo(g, (s) => s.kind === "line" && s.speaker === "neighbor");
  assert.deepEqual(g.view().stage.cast.map((c) => [c.id, c.slot]), [["hanan", 0], ["neighbor", 1]]);
  playTo(g, (s) => s.kind === "line" && s.speaker === "passerby");
  assert.deepEqual(g.view().stage.cast.map((c) => c.id), ["passerby"], "scene change cleared the cast first");
});

test("cast: Jesus' verse clears the stage; the true ending cards clear it too", () => {
  const g = E.createGame("friend");
  playTo(g, (s) => s.kind === "line" && s.speaker === "asher");
  assert.equal(g.view().stage.cast[0].pose, "lying");
  playTo(g, (s) => s.kind === "verse" && s.key === "MT_9_2B");
  assert.deepEqual(g.view().stage.cast, []);
  const e = E.createGame("asher");
  playTo(e, (s) => s.kind === "line" && s.speaker === "yonah");
  assert.equal(e.view().stage.cast[0].id, "yonah");
  e.fastForward({ until: (s) => s.kind === "endingTitle" });
  assert.deepEqual(e.view().stage.cast, []);
});

// ---------------------------------------------------------------- save / restore + fingerprints

test("serialize / restoreGame resumes identically (mid-route, at a re-ask, in a cut branch, on the snip card)", () => {
  const plans = [
    { map: { c1: "d", c2: "b" }, at: (s) => s.kind === "choice" && s.id === "c3" },
    { map: { c1: ["c", "a"] }, at: (s) => s.kind === "choice" && s.id === "c1" && s.again },
    { map: { c3: "b" }, at: (s) => s.kind === "line" && s.speaker === "hanan" && /대답하셨대요/.test(s.text.ko) },
    { map: { c4: "c" }, at: (s) => s.kind === "snip" },
    { map: {}, at: (s) => s.kind === "memory" }
  ];
  for (const p of plans) {
    const a = E.createGame("scribe");
    const asked = {};
    a.fastForward({
      until: p.at,
      pick: (s, g) => {
        const want = p.map[s.id];
        const n = (asked[s.id] = (asked[s.id] || 0) + 1);
        return (Array.isArray(want) ? want[n - 1] : want) || g.continueOption(s);
      }
    });
    assert.ok(p.at(a.step), "reached the save point");
    const snap = snapshot(a);
    assert.equal(snap.v, E.STATE_VERSION);
    assert.equal(snap.fp, E.fingerprint("scribe"));
    assert.equal(E.canRestore(snap), true);
    const b = E.restoreGame(snap);
    assert.deepEqual(b.step, a.step);
    if (a.step.kind === "snip") {
      assert.equal(b.retry(), true, "Try again works after a restore");
      a.retry();
      assert.deepEqual(b.step, a.step);
    }
    const la = stepsUntilStop(a, { c4: "a" });
    const lb = stepsUntilStop(b, { c4: "a" });
    assert.deepEqual(lb, la);
    assert.deepEqual(b.state.ending, a.state.ending);
  }
});

test("fingerprint: stable and structural (text edits keep it; beats and outcomes change it)", () => {
  const base = BHS.fixtureRoutes.scribe;
  const fp = E.fingerprint("scribe");
  assert.match(fp, /^r[0-9a-z]+$/);
  assert.equal(E.fingerprint(base), fp);
  assert.notEqual(E.fingerprint("friend"), fp);
  const edit = (fn) => {
    const r = JSON.parse(JSON.stringify(base));
    fn(r);
    return E.fingerprint(r);
  };
  assert.equal(edit((r) => (r.beats[1].text = { ko: "다른 문장.", en: "Another line." })), fp, "a text edit keeps it");
  assert.equal(edit((r) => (r.endings.bad.typo.title = { ko: "다른 제목", en: "Other" })), fp, "a title edit keeps it");
  assert.notEqual(edit((r) => r.beats.splice(2, 0, { type: "line", text: { ko: "새 줄", en: "New" } })), fp, "an added beat");
  assert.notEqual(edit((r) => (r.beats[4].options[3].bad = "typo")), fp, "an option that now cuts");
  assert.notEqual(edit((r) => (r.beats[4].options[3].scold = { text: { ko: "x", en: "x" } })), fp, "an option that is now scolded");
  assert.notEqual(edit((r) => (r.endings.bad.extra = { title: { ko: "x", en: "x" }, beats: [], last: { ko: "x", en: "x" } })), fp, "a new cut branch");
  assert.notEqual(edit((r) => (r.endings.good.verse = "MT_9_2A")), fp, "another memory verse");
  assert.match(E.fingerprint("prologue"), /^p[0-9a-z]+$/);
  assert.equal(E.fingerprint("nope"), null);
});

test("canRestore refuses saves of the lens releases and damaged or stale snapshots", () => {
  const g = E.createGame("friend");
  playTo(g, (s) => s.kind === "choice" && s.id === "c2");
  const good = snapshot(g);
  assert.equal(E.canRestore(good), true);
  assert.equal(E.canRestore(Object.assign({}, good, { v: 2 })), false, "a version 3 (lens) save");
  assert.equal(E.canRestore(Object.assign({}, good, { v: 1 })), false, "a release 1.0 save");
  assert.equal(E.canRestore(Object.assign({}, good, { fp: "r0" })), false, "stale fingerprint");
  assert.equal(E.canRestore(Object.assign({}, good, { routeId: "scribe" })), false, "another route's fingerprint");
  assert.equal(E.canRestore(Object.assign({}, good, { routeId: "nope" })), false);
  assert.equal(E.canRestore(Object.assign({}, good, { stack: null })), false, "damaged");
  assert.equal(E.canRestore(Object.assign({}, good, { removed: "x" })), false, "damaged removed list");
  assert.equal(E.canRestore(Object.assign({}, good, { retry: { routeId: "scribe" } })), false, "a retry snapshot of another route");
  assert.equal(E.canRestore({}), false);
  assert.equal(E.canRestore("x"), false);
  assert.throws(() => E.restoreGame(Object.assign({}, good, { fp: "r0" })), /Incompatible saved state/);
  // A version 3 save exactly as the lens release wrote it.
  const v3 = {
    v: 2, routeId: "scribe", fp: E.fingerprint("scribe"), segs: ["beats", "@ending"], seg: 0, stack: [{ list: "beats", i: 20 }],
    choices: { c1: "a", c2: "b" }, flags: {}, vars: {}, picks: ["c1", "c2"], lastLens: null, cutAt: null,
    stage: { bg: "crowd", light: "soft", pov: "normal", cast: [] }, pending: { hush: false, echo: null }, now: { hush: false, echo: null },
    step: { kind: "choice", id: "c3", options: [] }, at: { list: "beats", index: 19 }, ending: null, steps: 30, done: false
  };
  const warned = E.warnings.length;
  assert.equal(E.canRestore(v3), false);
  assert.throws(() => E.restoreGame(v3), /Incompatible saved state/);
  assert.equal(E.warnings.length, warned, "the old snapshot was never run");
});

test("canRestore checks the Try-again snapshot too; a damaged snapshot never crashes Try again", () => {
  const g = E.createGame("friend");
  playTo(g, (s) => s.kind === "choice" && s.id === "c2");
  const good = snapshot(g);
  assert.ok(good.retry && good.retry.retry === null, "the snapshot is a whole state whose own retry is null");
  assert.equal(E.canRestore(good), true);
  // A fingerprint that fits, but a snapshot that is only a stub (audit N4).
  assert.equal(E.canRestore(Object.assign({}, good, { retry: { routeId: "friend" } })), false, "a stub snapshot");
  assert.equal(E.canRestore(Object.assign({}, good, { retry: Object.assign({}, good.retry, { stage: null }) })), false, "a snapshot without a stage");
  assert.equal(E.canRestore(Object.assign({}, good, { retry: Object.assign({}, good.retry, { fp: "r0" }) })), false, "a stale snapshot");
  assert.equal(E.canRestore(Object.assign({}, good, { retry: Object.assign({}, good.retry, { retry: good.retry }) })), false, "a nested snapshot");
  assert.equal(E.canRestore(Object.assign({}, good, { retry: null })), true, "no snapshot yet is fine");
  // An installed game whose snapshot got damaged refuses Try again instead of throwing.
  const h = E.restoreGame(good);
  h.state.retry = { routeId: "friend" };
  let ok;
  assert.doesNotThrow(() => {
    ok = h.retry();
  });
  assert.equal(ok, false);
  assert.equal(h.step.kind, "choice", "the game stays where it was");
});

// ---------------------------------------------------------------- prologue + sequences

test("prologue game plays common.prologue then stops at routeSelect; it can be saved", () => {
  const g = E.createGame("prologue");
  const log = stepsUntilStop(g);
  assert.equal(log.filter((s) => s.kind === "line").length, BHS.common.prologue.filter((b) => b.type === "line").length);
  assert.equal(log[log.length - 1].kind, "routeSelect");
  assert.equal(g.next(), false);
  const p = E.createGame("prologue");
  p.next();
  const snap = snapshot(p);
  assert.equal(E.canRestore(snap), true);
  assert.deepEqual(E.restoreGame(snap).step, p.step);
});

test("createSequence: when-skips, unknown fx tolerated, verse speaker defaults, choices with outcomes", () => {
  const g = E.createSequence([
    { type: "fx", fx: "sparkle" },
    { type: "line", text: { ko: "x", en: "x" }, when: { flag: "nope", is: true } },
    { type: "verse", key: "MT_9_6B" },
    { type: "verse", key: "MT_9_7", speaker: "narrator" }
  ]);
  assert.equal(g.step.speaker, "jesus");
  g.next();
  assert.equal(g.step.speaker, "narrator");
  g.next();
  assert.equal(g.step.kind, "end");
  const s = E.createSequence([
    { type: "choice", id: "c1", prompt: { ko: "p", en: "p" }, options: [{ id: "a", text: { ko: "a", en: "a" }, scold: { text: { ko: "아니", en: "No" } } }, { id: "b", text: { ko: "b", en: "b" }, bad: "gone" }] },
    { type: "line", text: { ko: "끝", en: "End" } }
  ]);
  s.choose("a");
  assert.equal(s.step.text.ko, "아니");
  s.next();
  assert.equal(ids(s.step), "b");
  s.choose("b");
  assert.equal(s.step.kind, "snip", "a cut branch without data goes straight to the snip card");
  assert.equal(s.retry(), true);
  assert.equal(ids(s.step), "b");
});

// ---------------------------------------------------------------- report

if (failures.length) {
  for (const f of failures) {
    console.error("FAIL  " + f.name);
    console.error("      " + (f.err && f.err.stack ? f.err.stack.split("\n").slice(0, 4).join("\n      ") : f.err));
  }
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
} else {
  console.log(`engine tests: ${passed} passed, 0 failed`);
}
