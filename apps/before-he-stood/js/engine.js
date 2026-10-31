/*
 * js/engine.js - pure game logic for "Before He Stood" (SPEC version 4: story mode).
 * No DOM access anywhere in this file. Loadable in Node with `globalThis.window = globalThis`.
 *
 * Route shape (SPEC 4.5): one story with choices c1..cN of 2-4 options. Each option has exactly one
 * outcome (optionOutcome):
 *   continue (default)  its reaction plays, then the story goes on;
 *   bad: "<id>"         its reaction plays, then the cut branch endings.bad[id]: beats -> last -> snip card;
 *   scold: {speaker?, text}  its reaction plays, then the scold line, then the option is removed and the
 *                       same choice is asked again.
 * One true ending: endingPreface (optional) -> title card (endings.good.title) -> memory-verse card
 * (endings.good.verse) -> endings.good.beats -> last -> endingCoda -> end.
 *
 * Public API (BHS.engine):
 *   optionOutcome(option)                -> "continue" | "bad" | "scold"
 *   goodId(routeId) / branchId(routeId, badId) / parseSeenId(id)
 *                                        -> seen ids "<route>-good" and "<route>-bad-<id>"
 *   treeOf(routeOrId)                    -> { routeId, levels: [{ id, branches: [{ badId, id, title, last }] }],
 *                                             good: { id, title, verse } }  (the story tree, SPEC 5.8)
 *   badTargets(routeOrId)                -> [{ choice, option, badId }] every option that cuts the story
 *   evalCond(cond, state)                -> boolean                                      (SPEC 4.5)
 *   resolveText(t, lang, state)          -> string, tokens resolved, *emphasis* markers kept
 *   plainText(t, lang, state)            -> string, tokens resolved, emphasis markers removed
 *   resolveSegments(t, lang, state)      -> [{ text, em, kind?, key? }] for renderers
 *   quoteVerse(text)                     -> “text” with inner double quotes turned into ‘ ’
 *   verseText(key, lang) / verseRef(key, lang) / verseSpeaker(key)
 *   verseDisplay(key, lang)              -> verse text as shown: an English excerpt that starts with a
 *                                           lowercase letter gets a leading "…" (SPEC 4.3); data unchanged
 *   memoryDisplay(key, lang)             -> the memory-verse card's text: verseDisplay plus a trailing "…"
 *                                           when the key stops mid-sentence (SPEC 4.6); data unchanged
 *   fingerprint(routeOrId)               -> short structural hash of a route ("prologue" = common.prologue)
 *   canRestore(savedState)               -> true when a snapshot fits the current data (state version + fingerprint)
 *   createGame(routeId, opts)            -> Game   (routeId may be "prologue")
 *   createSequence(beats, opts)          -> Game   (plays an arbitrary beat list, for tests)
 *   restoreGame(savedState)              -> Game   (throws when canRestore(savedState) is false)
 *
 * Game (driven by the UI):
 *   game.step                 current blocking step (see STEP KINDS below)
 *   game.view()               { step, now: {hush, echo}, stage, actions, ending, routeId }
 *   game.next()               advance from line / verse / endingTitle / memory / last
 *   game.choose(optionId)     answer the current choice (only options still shown)
 *   game.press()              answer the current press beat
 *   game.retry()              "Try again": back to the last choice exactly as it was shown
 *   game.canRetry()           true once a choice has been shown
 *   game.continueOption(step) first option of a choice step whose outcome is "continue"
 *   game.optionMarks(seenIds) { optionId: true } for options whose cut branch was already seen
 *   game.tapAction(actionId)  tap a persistent action (route-level `actions`, optional)
 *   game.serialize()          JSON-safe snapshot; restore with restoreGame(snapshot)
 *   game.fastForward(opts)    debug helper: auto-play until a predicate holds (default pick: continue)
 *
 * STEP KINDS: line {speaker, text} | verse {key, speaker} | memory {key, speaker}
 *   | choice {id, prompt, options:[{id,text}], removed:[ids], justRemoved: {id,text,at}|null, again}
 *   | press {action?, label?, hint?} | endingTitle {routeId, title} | last {text}
 *   | snip {routeId, id, badId, title} | routeSelect {} | end {}
 * Choice steps never expose outcomes, so the UI cannot leak which option cuts the story (SPEC 7.2).
 * Every choice presentation (the re-ask after a scold included) stores a snapshot in state.retry;
 * retry() restores it, so scolded options stay removed and picks made before stay made.
 */
(function () {
  "use strict";

  var root = typeof window !== "undefined" ? window : globalThis;
  var BHS = (root.BHS = root.BHS || {});

  var LIGHT_LEVELS = { off: true, soft: true, bright: true };
  var POVS = { normal: true, lying: true, standing: true };
  var TIMES = { day: true, evening: true, night: true };
  // Speakers that may appear as portraits (never Jesus; the protagonist is excluded per route).
  var PORTRAIT_IDS = { menahem: true, hanan: true, yonah: true, asher: true, mother: true, brother: true, neighbor: true, passerby: true, partners: true, scribes: true };
  var MAX_CAST = 2;
  // 3 = story mode (version 4): option outcomes, scold re-asks, retry snapshots.
  // Snapshots of earlier versions (lens routes) are never restored.
  var STATE_VERSION = 3;

  var warnings = [];

  function warn(msg) {
    if (warnings.length < 200) warnings.push(String(msg));
    if (api.debug && root.console && root.console.warn) root.console.warn("[BHS.engine] " + msg);
  }

  function own(o, k) {
    return o != null && Object.prototype.hasOwnProperty.call(o, k);
  }

  function clone(x) {
    return x == null ? x : JSON.parse(JSON.stringify(x));
  }

  // ---------------------------------------------------------------------------
  // Data access
  // ---------------------------------------------------------------------------

  function getRoute(routeOrId) {
    if (routeOrId && typeof routeOrId === "object") return routeOrId;
    return (BHS.routes && BHS.routes[routeOrId]) || null;
  }

  function choiceBeats(route) {
    var out = [];
    var seen = {};
    if (!route || !route.beats) return out;
    for (var i = 0; i < route.beats.length; i++) {
      var b = route.beats[i];
      if (b && b.type === "choice") {
        if (seen[b.id]) {
          warn("duplicate choice id " + b.id + " in route " + route.id + "; only the first counts");
          continue;
        }
        seen[b.id] = true;
        out.push(b);
      }
    }
    return out;
  }

  function findChoice(route, id) {
    var list = choiceBeats(route);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function findOption(choiceBeat, optId) {
    if (!choiceBeat || !choiceBeat.options) return null;
    for (var i = 0; i < choiceBeat.options.length; i++) {
      if (choiceBeat.options[i] && choiceBeat.options[i].id === optId) return choiceBeat.options[i];
    }
    return null;
  }

  // The outcome of an option (SPEC 4.5). Unknown old fields (lens, cut) are ignored.
  function optionOutcome(opt) {
    if (!opt || typeof opt !== "object") return "continue";
    if (typeof opt.bad === "string" && opt.bad) return "bad";
    if (opt.scold && typeof opt.scold === "object") return "scold";
    return "continue";
  }

  function goodEnding(route) {
    var e = route && route.endings && route.endings.good;
    return e && typeof e === "object" ? e : null;
  }

  function badEnding(route, badId) {
    var bad = route && route.endings && route.endings.bad;
    return bad && typeof bad === "object" && own(bad, badId) && bad[badId] && typeof bad[badId] === "object" ? bad[badId] : null;
  }

  function routeIdOf(route, fallback) {
    return (route && typeof route.id === "string" && route.id) || (typeof fallback === "string" ? fallback : "");
  }

  function goodId(routeId) {
    return routeId + "-good";
  }

  function branchId(routeId, badId) {
    return routeId + "-bad-" + badId;
  }

  // "<route>-good" -> { routeId, kind: "good" }; "<route>-bad-<id>" -> { routeId, kind: "bad", badId }.
  // Anything else (ids from the lens releases such as "scribe-1" or "friend-cut") -> null.
  function parseSeenId(id) {
    if (typeof id !== "string") return null;
    var m = /^([a-z][a-z0-9]*)-good$/.exec(id);
    if (m) return { routeId: m[1], kind: "good" };
    m = /^([a-z][a-z0-9]*)-bad-([A-Za-z][A-Za-z0-9_]*)$/.exec(id);
    if (m) return { routeId: m[1], kind: "bad", badId: m[2] };
    return null;
  }

  // Every option that cuts the story, in beat order.
  function badTargets(routeOrId) {
    var route = getRoute(routeOrId);
    var out = [];
    choiceBeats(route).forEach(function (cb) {
      (cb.options || []).forEach(function (o) {
        if (optionOutcome(o) === "bad") out.push({ choice: cb.id, option: o.id, badId: o.bad });
      });
    });
    return out;
  }

  // The story tree of a route (SPEC 5.8): the trunk runs through every choice point to the true ending;
  // each cut branch grows at the first choice point that leads to it. Scolded options are not part of it.
  function treeOf(routeOrId) {
    var route = getRoute(routeOrId);
    if (!route) return null;
    var rid = routeIdOf(route, routeOrId);
    var placed = {};
    var levels = choiceBeats(route).map(function (cb) {
      var branches = [];
      (cb.options || []).forEach(function (o) {
        if (optionOutcome(o) !== "bad" || placed[o.bad]) return;
        placed[o.bad] = true;
        var e = badEnding(route, o.bad);
        branches.push({ badId: o.bad, id: branchId(rid, o.bad), title: (e && e.title) || null, last: (e && e.last) || null });
      });
      return { id: cb.id, branches: branches };
    });
    var good = goodEnding(route);
    return { routeId: rid, levels: levels, good: { id: goodId(rid), title: (good && good.title) || null, verse: (good && good.verse) || null } };
  }

  function scriptureEntry(key) {
    return (BHS.scripture && own(BHS.scripture, key) && BHS.scripture[key]) || null;
  }

  function verseText(key, lang) {
    var s = scriptureEntry(key);
    if (!s || s.refOnly) return null;
    var txt = s[lang === "en" ? "en" : "ko"];
    return typeof txt === "string" && txt.length ? txt : null;
  }

  // Display form of a verse text (SPEC 4.3). An English excerpt that starts mid-sentence (its first
  // character is a lowercase letter, e.g. "your sins are forgiven.") is shown with a leading ellipsis.
  // The stored text stays an exact substring of the verse; Korean text is never changed.
  var ELLIPSIS = "…";
  function verseDisplay(key, lang) {
    var txt = verseText(key, lang);
    if (txt == null) return null;
    return lang === "en" && /^[a-z]/.test(txt) ? ELLIPSIS + txt : txt;
  }

  // True when a key is an excerpt that stops mid-sentence: its `full` verse goes on after it with more
  // words, and the excerpt does not end in terminal punctuation (. ? ! closing quotes, an ellipsis).
  // The Korean Bible text has no full stops, so a Korean excerpt stops mid-sentence whenever words follow.
  var TERMINAL_END = /[.?!”’"'…]$/;
  var WORD_CHAR = /[0-9A-Za-zᄀ-ᇿㄱ-ㆎ가-힣]/;
  function stopsMidSentence(key, lang) {
    var s = scriptureEntry(key);
    var txt = verseText(key, lang);
    var l = lang === "en" ? "en" : "ko";
    if (!s || txt == null || !s.full || typeof s.full[l] !== "string") return false;
    var full = s.full[l];
    // The last place the excerpt fits, so a phrase that also ends the verse is never marked.
    var at = full.lastIndexOf(txt);
    if (at < 0) return false;
    if (!WORD_CHAR.test(full.slice(at + txt.length))) return false;
    return !TERMINAL_END.test(txt.replace(/\s+$/, ""));
  }

  // The memory-verse card of the true ending (SPEC 4.6) shows the verse in its display form, plus a
  // trailing "…" when the key stops mid-sentence (the scribe's MT_9_6A). Display only; data unchanged.
  function memoryDisplay(key, lang) {
    var txt = verseDisplay(key, lang);
    if (txt == null) return null;
    return stopsMidSentence(key, lang) ? txt + ELLIPSIS : txt;
  }

  function verseRef(key, lang) {
    var s = scriptureEntry(key);
    if (!s || !s.ref) return null;
    var r = s.ref[lang === "en" ? "en" : "ko"];
    return typeof r === "string" && r.length ? r : null;
  }

  function verseSpeaker(key) {
    var s = scriptureEntry(key);
    return (s && s.speaker) || "narrator";
  }

  // ---------------------------------------------------------------------------
  // Conditions (SPEC 4.5)
  // ---------------------------------------------------------------------------

  function looseEq(v, x) {
    if (v === undefined) v = null;
    // An unset flag or choice counts as `false` so `{ flag: "far", is: false }` reads naturally.
    if (x === false && v === null) return true;
    if (x === null) return v === null;
    return v === x;
  }

  function matchValue(v, cond) {
    if (own(cond, "is")) return looseEq(v, cond.is);
    if (own(cond, "in")) {
      var arr = Array.isArray(cond["in"]) ? cond["in"] : [];
      for (var i = 0; i < arr.length; i++) if (looseEq(v, arr[i])) return true;
      return false;
    }
    // A bare `{ flag: "x" }` tests truthiness.
    return v !== undefined && v !== null && v !== false;
  }

  function evalCond(cond, state) {
    if (cond == null) return true;
    state = state || {};
    if (Array.isArray(cond)) {
      for (var i = 0; i < cond.length; i++) if (!evalCond(cond[i], state)) return false;
      return true;
    }
    if (typeof cond !== "object") return !!cond;
    if (own(cond, "all")) {
      var all = cond.all || [];
      for (var a = 0; a < all.length; a++) if (!evalCond(all[a], state)) return false;
      return true;
    }
    if (own(cond, "any")) {
      var any = cond.any || [];
      for (var b = 0; b < any.length; b++) if (evalCond(any[b], state)) return true;
      return false;
    }
    if (own(cond, "not")) return !evalCond(cond.not, state);
    if (own(cond, "choice")) return matchValue((state.choices || {})[cond.choice], cond);
    if (own(cond, "flag")) return matchValue((state.flags || {})[cond.flag], cond);
    if (own(cond, "var")) {
      // Extension (not in SPEC 4.5): numeric test on a runtime variable.
      var n = Number((state.vars || {})[cond["var"]] || 0);
      if (own(cond, "is")) return n === Number(cond.is);
      if (own(cond, "gte")) return n >= Number(cond.gte);
      if (own(cond, "gt")) return n > Number(cond.gt);
      if (own(cond, "lte")) return n <= Number(cond.lte);
      if (own(cond, "lt")) return n < Number(cond.lt);
      return n !== 0;
    }
    warn("unknown condition " + JSON.stringify(cond));
    return false;
  }

  // ---------------------------------------------------------------------------
  // Text and tokens (SPEC 3.1-3.2)
  // ---------------------------------------------------------------------------

  var TOKEN_SRC = "\\{\\{\\s*(v|r|var)\\s*:\\s*([A-Za-z0-9_]+)\\s*\\}\\}";
  var OPEN_Q = "“";
  var CLOSE_Q = "”";

  function isDebug(state) {
    return !!((state && state.debug) || api.debug);
  }

  function pickLang(t, lang) {
    if (t == null) return "";
    if (typeof t === "string") return t;
    var l = lang === "en" ? "en" : "ko";
    if (typeof t[l] === "string") return t[l];
    var other = l === "en" ? "ko" : "en";
    return typeof t[other] === "string" ? t[other] : "";
  }

  // Inside our curly double quotes, any double quote in the verse becomes a single curly quote,
  // so quotes never nest double-in-double. Straight quotes open after whitespace or an opening
  // bracket/dash, and close otherwise.
  function nestQuotes(text) {
    var out = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === "“") out += "‘";
      else if (ch === "”") out += "’";
      else if (ch === '"') {
        var prev = i > 0 ? text.charAt(i - 1) : "";
        out += prev === "" || /[\s(\[{—–]/.test(prev) ? "‘" : "’";
      } else out += ch;
    }
    return out;
  }

  function quoteVerse(text) {
    return OPEN_Q + nestQuotes(String(text)) + CLOSE_Q;
  }

  function tokenValue(kind, key, lang, state) {
    if (kind === "v") {
      var v = verseDisplay(key, lang);
      if (v == null) {
        warn("missing verse text for " + key);
        return isDebug(state) ? "[" + key + "]" : OPEN_Q + "…" + CLOSE_Q;
      }
      return quoteVerse(v);
    }
    if (kind === "r") {
      var r = verseRef(key, lang);
      if (r == null) {
        warn("missing verse reference for " + key);
        return isDebug(state) ? "[" + key + "]" : "…";
      }
      return r;
    }
    if (kind === "var") {
      var vars = (state && state.vars) || {};
      var n = Number(vars[key]);
      return String(isFinite(n) ? Math.round(n) : 0);
    }
    return "";
  }

  function resolveText(t, lang, state) {
    var str = pickLang(t, lang);
    return str.replace(new RegExp(TOKEN_SRC, "g"), function (m, kind, key) {
      return tokenValue(kind, key, lang, state);
    });
  }

  function resolveSegments(t, lang, state) {
    var str = pickLang(t, lang);
    var re = new RegExp(TOKEN_SRC, "g");
    var out = [];
    var em = false;
    var last = 0;
    var m;

    function pushLiteral(s) {
      var parts = s.split("*");
      for (var i = 0; i < parts.length; i++) {
        if (i > 0) em = !em;
        if (parts[i]) out.push({ text: parts[i], em: em });
      }
    }

    while ((m = re.exec(str))) {
      pushLiteral(str.slice(last, m.index));
      out.push({ text: tokenValue(m[1], m[2], lang, state), em: em, kind: m[1], key: m[2] });
      last = re.lastIndex;
    }
    pushLiteral(str.slice(last));
    return out;
  }

  function plainText(t, lang, state) {
    return resolveSegments(t, lang, state)
      .map(function (s) {
        return s.text;
      })
      .join("");
  }

  // ---------------------------------------------------------------------------
  // Route fingerprints (save compatibility)
  // ---------------------------------------------------------------------------

  // A snapshot stores list names and beat indexes, so it only fits the route data it was made from.
  // The fingerprint hashes the route's skeleton: the beat types of every list in order, choice ids,
  // option ids and outcomes, reaction lengths, ending ids and lengths, the memory verse, and action
  // ids. Text edits keep it; added, removed or reordered beats and changed outcomes change it.
  function skeletonOf(list) {
    if (!Array.isArray(list)) return "-";
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || typeof b !== "object") {
        out.push("?");
        continue;
      }
      if (b.type === "choice") {
        var opts = (Array.isArray(b.options) ? b.options : []).map(function (o) {
          if (!o) return "?";
          var kind = optionOutcome(o);
          var tag = kind === "bad" ? "!" + o.bad : kind === "scold" ? "~" : "";
          return String(o.id) + tag + "[" + skeletonOf(o.reaction) + "]";
        });
        out.push("choice:" + b.id + "(" + opts.join(",") + ")");
      } else out.push(String(b.type));
    }
    return out.join(".");
  }

  function hashString(s) {
    // FNV-1a, 32 bit.
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  function fingerprint(routeOrId) {
    if (routeOrId === "prologue") return "p" + hashString(skeletonOf((BHS.common && BHS.common.prologue) || []));
    var route = getRoute(routeOrId);
    if (!route) return null;
    var parts = ["v4", "beats:" + skeletonOf(route.beats), "preface:" + skeletonOf(route.endingPreface)];
    var good = goodEnding(route);
    parts.push("good:" + (good ? skeletonOf(good.beats) + (good.last ? "+last" : "") + "@" + (good.verse || "") : "-"));
    var bad = route.endings && route.endings.bad && typeof route.endings.bad === "object" ? route.endings.bad : {};
    Object.keys(bad)
      .sort()
      .forEach(function (k) {
        var e = bad[k];
        parts.push("bad " + k + ":" + skeletonOf(e && e.beats) + (e && e.last ? "+last" : ""));
      });
    parts.push("coda:" + skeletonOf(route.endingCoda));
    parts.push(
      "actions:" +
        routeActions(route)
          .map(function (a) {
            return a && a.id;
          })
          .join(",")
    );
    return "r" + hashString(parts.join("|"));
  }

  // True when a snapshot can be resumed against the data loaded now. Anything else (saves of the lens
  // releases, saves from before a route edit, damaged objects) is refused.
  function canRestore(saved) {
    if (!saved || typeof saved !== "object" || saved.v !== STATE_VERSION) return false;
    if (typeof saved.routeId !== "string" || !saved.routeId) return false;
    if (saved.routeId !== "prologue" && !getRoute(saved.routeId)) return false;
    if (!Array.isArray(saved.segs) || !Array.isArray(saved.stack) || typeof saved.seg !== "number") return false;
    if (!saved.stage || typeof saved.stage !== "object" || !saved.step || typeof saved.step.kind !== "string") return false;
    if (!saved.choices || typeof saved.choices !== "object") return false;
    if (saved.removed != null && typeof saved.removed !== "object") return false;
    // The Try-again snapshot is a whole state of its own (its own retry is null); a damaged one would
    // break "Try again" later, so the save is refused now.
    if (saved.retry != null && (typeof saved.retry !== "object" || saved.retry.routeId !== saved.routeId || saved.retry.retry != null || !canRestore(saved.retry))) return false;
    var fp = fingerprint(saved.routeId);
    return !!fp && saved.fp === fp;
  }

  // A minimal shape check for a Try-again snapshot before it is installed (custom test sequences have
  // no fingerprint, so canRestore cannot be used here).
  function usableSnapshot(snap) {
    return !!snap && typeof snap === "object" && !!snap.stage && typeof snap.stage === "object" && !!snap.step && typeof snap.step.kind === "string" &&
      Array.isArray(snap.segs) && Array.isArray(snap.stack) && typeof snap.seg === "number" && !!snap.choices && typeof snap.choices === "object";
  }

  // ---------------------------------------------------------------------------
  // Game state machine
  // ---------------------------------------------------------------------------

  function routeActions(route) {
    return (route && Array.isArray(route.actions) && route.actions) || [];
  }

  function initialState(routeId, route, custom) {
    var segs;
    if (custom) segs = ["custom", "@end"];
    else if (routeId === "prologue") segs = ["prologue", "@routeSelect"];
    else segs = ["beats", "@ending"];
    return {
      v: STATE_VERSION,
      routeId: routeId,
      fp: custom ? "custom" : fingerprint(routeId === "prologue" ? "prologue" : route),
      segs: segs,
      seg: 0,
      stack: [{ list: segs[0], i: 0 }],
      choices: {},
      flags: {},
      vars: {},
      picks: [],
      removed: {},
      justRemoved: null,
      retry: null,
      cutAt: null,
      stage: {
        bg: null,
        caption: null,
        time: "day",
        pov: "normal",
        light: "off",
        pinned: null,
        actionsVisible: routeActions(route).length > 0,
        actionReplies: {},
        actionCounts: {},
        sceneSeq: 0,
        cast: [],
        speaking: null,
        castSeq: 0,
        risen: false
      },
      pending: { hush: false, echo: null },
      now: { hush: false, echo: null },
      step: null,
      at: { list: segs[0], index: -1 },
      ending: null,
      steps: 0,
      done: false
    };
  }

  function Game(routeId, opts) {
    opts = opts || {};
    this.routeId = routeId;
    this.custom = Array.isArray(opts.beats) ? opts.beats : null;
    this.route = routeId === "prologue" || this.custom ? opts.route || null : getRoute(routeId);
    if (!this.route && routeId !== "prologue" && !this.custom) throw new Error("Unknown route: " + routeId);
    this.debug = !!opts.debug;
    if (opts.state) {
      if (!canRestore(opts.state) || opts.state.routeId !== routeId) throw new Error("Incompatible saved state");
      this.state = clone(opts.state);
      if (!this.state.removed || typeof this.state.removed !== "object") this.state.removed = {};
      if (this.state.retry === undefined) this.state.retry = null;
    } else {
      this.state = initialState(routeId, this.route, !!this.custom);
      this._run();
    }
  }

  Object.defineProperty(Game.prototype, "step", {
    get: function () {
      return this.state.step;
    }
  });

  Game.prototype.condState = function () {
    var st = this.state;
    return {
      routeId: this.route ? st.routeId : null,
      choices: st.choices,
      flags: st.flags,
      vars: st.vars,
      debug: this.debug
    };
  };

  // A choice beat by id: the route's own, or one inside a custom sequence (tests).
  Game.prototype._choiceBeat = function (id) {
    var cb = this.route ? findChoice(this.route, id) : null;
    if (cb || !this.custom) return cb;
    for (var i = 0; i < this.custom.length; i++) {
      var b = this.custom[i];
      if (b && b.type === "choice" && b.id === id) return b;
    }
    return null;
  };

  Game.prototype._list = function (name) {
    var route = this.route;
    if (name === "custom") return this.custom || [];
    if (name === "prologue") return (BHS.common && BHS.common.prologue) || [];
    var parts;
    if (name.indexOf("react:") === 0) {
      parts = name.split(":");
      var ro = findOption(this._choiceBeat(parts[1]), parts[2]);
      return (ro && ro.reaction) || [];
    }
    if (name.indexOf("scold:") === 0) {
      // The scold line plays as a normal line: the given speaker ("thought" allowed), narration if none.
      parts = name.split(":");
      var so = findOption(this._choiceBeat(parts[1]), parts[2]);
      var sc = so && so.scold;
      if (!sc || typeof sc !== "object" || !sc.text) return [];
      return [{ type: "line", speaker: sc.speaker || "narrator", text: sc.text, id: "scold-" + parts[1] + "-" + parts[2] }];
    }
    if (name.indexOf("reask:") === 0) {
      var cb = this._choiceBeat(name.slice(6));
      return cb ? [cb] : [];
    }
    if (!route) return [];
    if (name === "beats") return route.beats || [];
    if (name === "endingPreface") return route.endingPreface || [];
    if (name === "endingCoda") return route.endingCoda || [];
    if (name === "ending:good") {
      var g = goodEnding(route);
      return (g && g.beats) || [];
    }
    if (name.indexOf("bad:") === 0) {
      var e = badEnding(route, name.slice(4));
      return (e && e.beats) || [];
    }
    return [];
  };

  Game.prototype._run = function () {
    var st = this.state;
    var guard = 0;
    for (;;) {
      if (++guard > 20000) throw new Error("engine loop guard tripped");
      var frame = st.stack[st.stack.length - 1];
      if (!frame) {
        st.seg++;
        if (st.seg >= st.segs.length) {
          this._setStep({ kind: "end" });
          st.done = true;
          return;
        }
        var seg = st.segs[st.seg];
        if (seg.charAt(0) === "@") {
          if (this._synthetic(seg)) return;
          continue;
        }
        st.stack.push({ list: seg, i: 0 });
        continue;
      }
      var list = this._list(frame.list);
      if (frame.i >= list.length) {
        st.stack.pop();
        continue;
      }
      var index = frame.i;
      var beat = list[index];
      frame.i++;
      if (!beat || typeof beat !== "object") continue;
      if (beat.when && !evalCond(beat.when, this.condState())) continue;
      st.at = { list: frame.list, index: index };
      if (this._apply(beat)) return;
    }
  };

  // Inserts an ending sequence right after the current segment.
  Game.prototype._queue = function (tail) {
    var st = this.state;
    Array.prototype.splice.apply(st.segs, [st.seg + 1, 0].concat(tail));
  };

  Game.prototype._synthetic = function (seg) {
    var st = this.state;
    var route = this.route;
    switch (seg) {
      case "@routeSelect":
        this._setStep({ kind: "routeSelect" });
        return true;
      case "@ending": {
        // Every choice was answered with a continue option: the true ending.
        var good = goodEnding(route);
        if (!good) {
          warn("route " + st.routeId + " has no endings.good");
          this._queue(["@end"]);
          return false;
        }
        st.ending = { routeId: st.routeId, id: goodId(st.routeId), kind: "good", title: good.title || null, verse: good.verse || null };
        this._queue(["endingPreface", "@title", "@memory", "ending:good", "@last", "endingCoda", "@end"]);
        return false;
      }
      case "@bad": {
        // The story got cut: the protagonist leaves the scene, so the pinned thought goes, the light goes
        // off and persistent actions hide (the cut branch's beats may set scene and light again).
        var cut = st.cutAt || {};
        var be = badEnding(route, cut.bad);
        if (!be) warn("route " + st.routeId + " has no endings.bad." + cut.bad);
        st.stage.pinned = null;
        st.stage.light = "off";
        st.stage.actionsVisible = false;
        st.ending = {
          routeId: st.routeId,
          id: branchId(st.routeId, cut.bad),
          kind: "bad",
          badId: cut.bad || null,
          title: (be && be.title) || null,
          cutAt: { choice: cut.choice || null, option: cut.option || null }
        };
        this._queue(be ? ["bad:" + cut.bad, "@last", "@snip"] : ["@snip"]);
        return false;
      }
      case "@title": {
        var ending = st.ending || {};
        this._castClear();
        st.at = { list: "@title", index: 0 };
        this._setStep({ kind: "endingTitle", routeId: st.routeId, title: ending.title || { ko: "", en: "" } });
        return true;
      }
      case "@memory": {
        var key = st.ending && st.ending.verse;
        if (!key || verseText(key, "ko") == null) {
          if (key) warn("memory verse " + key + " has no text");
          return false;
        }
        this._castClear();
        st.at = { list: "@memory", index: 0 };
        this._setStep({ kind: "memory", key: key, speaker: verseSpeaker(key) });
        return true;
      }
      case "@last": {
        var en = st.ending || {};
        var e = en.kind === "bad" ? badEnding(route, en.badId) : goodEnding(route);
        if (!e || !e.last) return false;
        st.at = { list: "@last", index: 0 };
        this._castClear();
        this._setStep({ kind: "last", text: e.last });
        return true;
      }
      case "@snip": {
        var sn = st.ending || {};
        this._castClear();
        st.at = { list: "@snip", index: 0 };
        this._setStep({ kind: "snip", routeId: st.routeId, id: sn.id || null, badId: sn.badId || null, title: sn.title || { ko: "", en: "" } });
        return true;
      }
      case "@end":
        this._setStep({ kind: "end" });
        st.done = true;
        return true;
      default:
        warn("unknown synthetic segment " + seg);
        return false;
    }
  };

  // ---- portrait cast (who stands on stage)

  Game.prototype._protagonist = function () {
    var meta = BHS.meta || {};
    var r = meta.routes && meta.routes[this.state.routeId];
    return (r && r.protagonist) || null;
  };

  Game.prototype._castClear = function () {
    this.state.stage.cast = [];
    this.state.stage.speaking = null;
  };

  // A character line puts the speaker on stage (most recent two, stable left/right slots).
  Game.prototype._castLine = function (speaker) {
    var stage = this.state.stage;
    if (!stage.cast) stage.cast = [];
    if (!PORTRAIT_IDS[speaker] || speaker === this._protagonist()) {
      stage.speaking = null;
      return;
    }
    var pose = speaker === "asher" ? (stage.risen ? "standing" : "lying") : null;
    var t = (stage.castSeq = (stage.castSeq || 0) + 1);
    var cast = stage.cast;
    var found = null;
    for (var i = 0; i < cast.length; i++) if (cast[i].id === speaker) found = cast[i];
    if (found) {
      found.t = t;
      found.pose = pose;
    } else if (cast.length < MAX_CAST) {
      var used = cast.length ? cast[0].slot : 1;
      cast.push({ id: speaker, slot: cast.length ? 1 - used : 0, pose: pose, t: t });
    } else {
      var oldest = cast[0];
      for (var j = 1; j < cast.length; j++) if (cast[j].t < oldest.t) oldest = cast[j];
      oldest.id = speaker;
      oldest.pose = pose;
      oldest.t = t;
    }
    stage.speaking = speaker;
  };

  Game.prototype._apply = function (beat) {
    var st = this.state;
    switch (beat.type) {
      case "scene":
        // A scene never touches the light level, and changes pov only when it sets one.
        st.stage.bg = beat.bg || null;
        st.stage.caption = beat.caption || null;
        st.stage.time = TIMES[beat.time] ? beat.time : "day";
        if (beat.pov && POVS[beat.pov]) st.stage.pov = beat.pov;
        st.stage.sceneSeq++;
        this._castClear();
        return false;
      case "line":
        this._castLine(beat.speaker || "narrator");
        this._setStep({ kind: "line", speaker: beat.speaker || "narrator", text: beat.text, id: beat.id || null });
        return true;
      case "verse": {
        var vsp = beat.speaker || verseSpeaker(beat.key);
        // When Jesus speaks, the light takes the stage.
        if (vsp === "jesus") this._castClear();
        st.stage.speaking = null;
        if (beat.key === "MT_9_6B") st.stage.risen = true;
        this._setStep({
          kind: "verse",
          key: beat.key,
          speaker: vsp,
          id: beat.id || null
        });
        return true;
      }
      case "choice":
        return this._presentChoice(beat);
      case "press":
        st.stage.speaking = null;
        this._setStep({
          kind: "press",
          action: beat.action || null,
          label: beat.label || null,
          hint: beat.hint || null,
          id: beat.id || null
        });
        return true;
      case "fx":
        this._fx(beat);
        return false;
      default:
        warn("unknown beat type " + beat.type);
        return false;
    }
  };

  // Shows a choice with the options still in play (scolded ones are removed), then stores the retry
  // snapshot: the state exactly as the class sees this choice.
  Game.prototype._presentChoice = function (beat) {
    var st = this.state;
    var removed = (st.removed && st.removed[beat.id]) || [];
    var all = (beat.options || []).filter(function (o) {
      return !!o;
    });
    var open = all.filter(function (o) {
      return removed.indexOf(o.id) < 0;
    });
    if (!open.length) {
      warn("choice " + beat.id + " has no options left; skipped");
      st.justRemoved = null;
      return false;
    }
    var just = null;
    var jr = st.justRemoved;
    if (jr && jr.choice === beat.id) {
      // Where the scolded option stood among the options shown just before (for the removal animation).
      var before = all.filter(function (o) {
        return o.id === jr.option || removed.indexOf(o.id) < 0;
      });
      for (var i = 0; i < before.length; i++) {
        if (before[i].id === jr.option) just = { id: before[i].id, text: before[i].text, at: i };
      }
    }
    st.justRemoved = null;
    st.stage.speaking = null;
    // A presented choice is unanswered.
    delete st.choices[beat.id];
    this._setStep({
      kind: "choice",
      id: beat.id,
      prompt: beat.prompt || null,
      options: open.map(function (o) {
        return { id: o.id, text: o.text };
      }),
      removed: removed.slice(),
      justRemoved: just,
      again: removed.length > 0
    });
    this._snapshot();
    return true;
  };

  Game.prototype._snapshot = function () {
    var st = this.state;
    st.retry = null;
    var snap = clone(st);
    if (snap.step) snap.step.justRemoved = null;
    st.retry = snap;
  };

  Game.prototype._fx = function (beat) {
    var st = this.state;
    var stage = st.stage;
    switch (beat.fx) {
      case "light":
        stage.light = LIGHT_LEVELS[beat.level] ? beat.level : "off";
        break;
      case "hush":
        st.pending.hush = true;
        break;
      case "echoVerse":
        st.pending.echo = { key: beat.key, highlight: beat.highlight || null };
        break;
      case "pinThought":
        stage.pinned = { items: this._pinItems(beat.items || []), read: false };
        break;
      case "readReceipt":
        if (stage.pinned) stage.pinned.read = true;
        else warn("readReceipt without a pinned thought");
        break;
      case "unpinThought":
        stage.pinned = null;
        break;
      case "pov":
        if (POVS[beat.pov]) stage.pov = beat.pov;
        break;
      case "actionReply":
        if (beat.action) stage.actionReplies[beat.action] = beat.text || null;
        break;
      case "actionsHide":
        stage.actionsVisible = false;
        break;
      case "actionsShow":
        stage.actionsVisible = routeActions(this.route).length > 0;
        break;
      default:
        warn("unknown fx " + beat.fx);
    }
  };

  Game.prototype._pinItems = function (items) {
    var st = this.state;
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var raw = String(items[i]);
      var cut = raw.indexOf(":");
      var kind = raw.slice(0, cut);
      var ref = raw.slice(cut + 1);
      if (kind === "verse") {
        out.push({ type: "verse", key: ref });
      } else if (kind === "choice") {
        var optId = st.choices[ref];
        var opt = findOption(this._choiceBeat(ref), optId);
        if (opt) out.push({ type: "choice", id: ref, option: optId, text: opt.text });
        else warn("pinThought: no pick for " + ref);
      } else {
        warn("pinThought: unknown item " + raw);
      }
    }
    return out;
  };

  Game.prototype._resolveEcho = function (echo) {
    if (!echo) return null;
    var st = this.state;
    var marks = null;
    var hl = echo.highlight;
    if (hl && hl.map) {
      var val;
      if (own(hl, "flag")) val = st.flags[hl.flag];
      else if (own(hl, "choice")) val = st.choices[hl.choice];
      var mapKey = val === undefined || val === null ? "null" : String(val);
      var m = own(hl.map, mapKey) ? hl.map[mapKey] : null;
      if (m === "*") marks = "*";
      else if (m && typeof m === "object") marks = { ko: m.ko || [], en: m.en || [] };
    }
    return { key: echo.key, marks: marks };
  };

  Game.prototype._setStep = function (step) {
    var st = this.state;
    st.now = { hush: !!st.pending.hush, echo: this._resolveEcho(st.pending.echo) };
    st.pending = { hush: false, echo: null };
    st.step = step;
    st.steps++;
  };

  Game.prototype._clearNow = function () {
    this.state.now = { hush: false, echo: null };
  };

  var BLOCKING = { choice: true, press: true, end: true, routeSelect: true, snip: true };

  Game.prototype.next = function () {
    var k = this.state.step && this.state.step.kind;
    if (!k || BLOCKING[k]) return false;
    this._clearNow();
    this._run();
    return true;
  };

  // A cut option ends the story: every list still open (the route's main beats, a re-ask) is exhausted
  // and the coming "@ending" segment becomes "@bad". The option's reaction is pushed afterwards, so it
  // still plays. All of this lives in the state, so saving and resuming work inside a cut branch.
  Game.prototype._badFrom = function (choiceId, optId, badId) {
    var st = this.state;
    st.cutAt = { choice: choiceId, option: optId, bad: badId };
    for (var i = 0; i < st.stack.length; i++) st.stack[i].i = this._list(st.stack[i].list).length;
    var at = st.segs.indexOf("@ending", st.seg);
    if (at >= 0) st.segs[at] = "@bad";
    else st.segs.splice(st.seg + 1, 0, "@bad");
  };

  Game.prototype.choose = function (optId) {
    var st = this.state;
    var step = st.step;
    if (!step || step.kind !== "choice") return false;
    var shown = false;
    for (var i = 0; i < step.options.length; i++) if (step.options[i].id === optId) shown = true;
    if (!shown) return false;
    var opt = findOption(this._choiceBeat(step.id), optId);
    if (!opt) return false;
    var kind = optionOutcome(opt);
    // Only the pick that moves the story on (continue or bad) is the choice's answer; a scolded pick
    // is never recorded in `choices` (conditions see the answer, never the scolded option).
    if (kind !== "scold") st.choices[step.id] = optId;
    st.picks.push(step.id);
    if (opt.set && typeof opt.set === "object") {
      Object.keys(opt.set).forEach(function (k) {
        st.flags[k] = opt.set[k];
      });
    }
    if (kind === "bad") {
      this._badFrom(step.id, optId, opt.bad);
    } else if (kind === "scold") {
      // reaction -> scold line -> the same choice again, without this option.
      var rm = st.removed[step.id] || (st.removed[step.id] = []);
      if (rm.indexOf(optId) < 0) rm.push(optId);
      st.justRemoved = { choice: step.id, option: optId };
      st.stack.push({ list: "reask:" + step.id, i: 0 });
      st.stack.push({ list: "scold:" + step.id + ":" + optId, i: 0 });
    }
    if (Array.isArray(opt.reaction) && opt.reaction.length) {
      st.stack.push({ list: "react:" + step.id + ":" + optId, i: 0 });
    }
    this._clearNow();
    this._run();
    return true;
  };

  Game.prototype.canRetry = function () {
    return !!this.state.retry;
  };

  // "Try again" (SPEC 4.5): the state exactly as it was when the last choice was shown.
  Game.prototype.retry = function () {
    var snap = this.state.retry;
    if (!snap) return false;
    if (!usableSnapshot(snap)) {
      warn("retry snapshot is damaged; Try again refused");
      return false;
    }
    var restored = clone(snap);
    restored.retry = clone(snap);
    this.state = restored;
    return true;
  };

  Game.prototype.continueOption = function (step) {
    step = step || this.state.step;
    if (!step || step.kind !== "choice" || !step.options || !step.options.length) return null;
    var cb = this._choiceBeat(step.id);
    for (var i = 0; i < step.options.length; i++) {
      if (optionOutcome(findOption(cb, step.options[i].id)) === "continue") return step.options[i].id;
    }
    return step.options[0].id;
  };

  // Options of the current choice whose cut branch is among `seen` (for the small scissors mark).
  Game.prototype.optionMarks = function (seen) {
    var out = {};
    var step = this.state.step;
    if (!step || step.kind !== "choice" || !Array.isArray(seen)) return out;
    var cb = this._choiceBeat(step.id);
    var rid = this.state.routeId;
    step.options.forEach(function (o) {
      var opt = findOption(cb, o.id);
      if (optionOutcome(opt) === "bad" && seen.indexOf(branchId(rid, opt.bad)) >= 0) out[o.id] = true;
    });
    return out;
  };

  Game.prototype.press = function () {
    var st = this.state;
    var step = st.step;
    if (!step || step.kind !== "press") return false;
    // Persistent buttons stay until actionsHide or the press on an action (SPEC 4.5).
    if (step.action) st.stage.actionsVisible = false;
    this._clearNow();
    this._run();
    return true;
  };

  Game.prototype._action = function (id) {
    var acts = routeActions(this.route);
    for (var i = 0; i < acts.length; i++) if (acts[i].id === id) return acts[i];
    return null;
  };

  Game.prototype.tapAction = function (id) {
    var st = this.state;
    var step = st.step;
    if (step && step.kind === "press" && step.action === id) {
      this.press();
      return { id: id, pressed: true, text: null, count: st.stage.actionCounts[id] || 0 };
    }
    var act = this._action(id);
    if (!act || !st.stage.actionsVisible || !step || step.kind === "end" || step.kind === "snip") return null;
    var n = (st.stage.actionCounts[id] || 0) + 1;
    st.stage.actionCounts[id] = n;
    if (act.counter) st.vars[act.counter] = (Number(st.vars[act.counter]) || 0) + 1;
    var replies = Array.isArray(act.replies) ? act.replies : [];
    var override = st.stage.actionReplies[id];
    var text = override || (replies.length ? replies[Math.min(n - 1, replies.length - 1)] : null);
    return { id: id, pressed: false, text: text, count: n };
  };

  Game.prototype.actions = function () {
    var st = this.state;
    var step = st.step;
    var litId = step && step.kind === "press" ? step.action : null;
    return routeActions(this.route)
      .map(function (a) {
        var lit = a.id === litId;
        return {
          id: a.id,
          label: a.label,
          lit: lit,
          visible: lit || (st.stage.actionsVisible && !(litId && !st.stage.actionsVisible))
        };
      })
      .filter(function (a) {
        return a.visible;
      });
  };

  Game.prototype.view = function () {
    var st = this.state;
    return {
      routeId: st.routeId,
      step: st.step,
      now: st.now,
      stage: st.stage,
      actions: this.actions(),
      ending: st.ending,
      vars: st.vars,
      done: st.done
    };
  };

  Game.prototype.position = function () {
    var st = this.state;
    return { seg: st.segs[st.seg], list: st.at.list, index: st.at.index, steps: st.steps };
  };

  Game.prototype.serialize = function () {
    return clone(this.state);
  };

  // Auto-play for debug and tests. `until(step, game)` stops the run; `pick(step, game)` picks an option
  // id (default: the first continue option, so the run follows the true path). Stops at a snip card.
  Game.prototype.fastForward = function (opts) {
    opts = opts || {};
    var self = this;
    var until =
      opts.until ||
      function () {
        return false;
      };
    var pick =
      opts.pick ||
      function (step) {
        return self.continueOption(step);
      };
    var max = opts.maxSteps || 5000;
    for (var i = 0; i < max; i++) {
      var step = this.state.step;
      if (!step || step.kind === "end" || step.kind === "routeSelect" || step.kind === "snip") return step;
      if (until(step, this)) return step;
      if (step.kind === "choice") {
        if (!this.choose(pick(step, this))) return step;
      } else if (step.kind === "press") this.press();
      else this.next();
    }
    return this.state.step;
  };

  // ---------------------------------------------------------------------------
  // Factories
  // ---------------------------------------------------------------------------

  function createGame(routeId, opts) {
    return new Game(routeId, opts);
  }

  function createSequence(beats, opts) {
    opts = opts || {};
    return new Game(opts.routeId || "custom", { beats: beats, route: opts.route || null, debug: opts.debug });
  }

  function restoreGame(saved, opts) {
    if (!saved || !saved.routeId) throw new Error("No saved state");
    opts = opts || {};
    return new Game(saved.routeId, { state: saved, debug: opts.debug });
  }

  var api = {
    version: "4.0.0",
    STATE_VERSION: STATE_VERSION,
    debug: false,
    warnings: warnings,
    PORTRAIT_IDS: PORTRAIT_IDS,
    getRoute: getRoute,
    choiceBeats: choiceBeats,
    findChoice: findChoice,
    findOption: findOption,
    optionOutcome: optionOutcome,
    goodId: goodId,
    branchId: branchId,
    parseSeenId: parseSeenId,
    badTargets: badTargets,
    treeOf: treeOf,
    evalCond: evalCond,
    resolveText: resolveText,
    resolveSegments: resolveSegments,
    plainText: plainText,
    pickLang: pickLang,
    quoteVerse: quoteVerse,
    nestQuotes: nestQuotes,
    verseText: verseText,
    verseDisplay: verseDisplay,
    memoryDisplay: memoryDisplay,
    verseRef: verseRef,
    verseSpeaker: verseSpeaker,
    fingerprint: fingerprint,
    canRestore: canRestore,
    createGame: createGame,
    createSequence: createSequence,
    restoreGame: restoreGame,
    Game: Game
  };

  BHS.engine = api;
})();
