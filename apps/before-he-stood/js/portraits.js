/* Character portraits for "Before He Stood", drawn as inline SVG strings.
   Owner: portrait agent. See docs/SPEC.md §5.6 (look), §6.1 (fixed facts), §7 (guardrails).
   - Classic script, no modules, no fetch, no external assets, no SVG filters.
   - Each portrait is a half-body bust on a transparent background, viewBox 0 0 600 900,
     bottom edge cut by the frame. Faces sit above y ~560 because the text panel covers
     the lower part of the stage. The root <svg> uses preserveAspectRatio="xMidYMax meet",
     so a container of any size keeps the figure standing on its bottom edge.
   - FACING: every figure faces screen-LEFT (three-quarter view, gaze to the left).
     BHS.portraits.facing[id] says so too; the UI can mirror a portrait with CSS
     transform: scaleX(-1) when it stands on the left of the stage (the art has no text).
   - Style: cut-paper relief. Flat color planes in natural dyes, one warm shadow color and
     one warm light color laid over them as planes, no outlines. Light comes from the upper
     left (the side they face): a thin warm rim catches the upper-left edges and the figure
     casts a soft offset shadow, so it separates from dark interiors and bright noon scenes.
   - Jesus is never drawn: render("jesus") returns null. No crosses, halos or text.
   - Ids inside each SVG are prefixed with the character id plus a per-render counter. */
(function () {
  "use strict";
  var BHS = (window.BHS = window.BHS || {});

  var IDS = ["menahem", "hanan", "yonah", "asher", "mother", "brother", "neighbor", "passerby", "partners", "scribes"];
  var renderCount = 0;

  var SH = "#2a1409";   // shadow overlay (warm umber), used at a few fixed strengths
  var HI = "#fff1d6";   // light overlay
  var INK = "#1d130d";  // lash lines and pupils

  // ---------------------------------------------------------------- utilities

  var PREC = 1;         // path number precision: 1 = integers, 10 = one decimal (faces)
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rn(v) { var n = Math.round(v * PREC) / PREC; return n === 0 ? 0 : n; }
  function r1(v) { var n = Math.round(v * 10) / 10; return n === 0 ? 0 : n; }
  function op(o) { return o !== undefined && o !== 1 ? ' opacity="' + String(o).replace(/^0\./, ".") + '"' : ""; }

  // Number without a leading zero (0.5 -> .5, -0.5 -> -.5).
  function fmt(n) {
    var s = String(n);
    if (s.length > 1 && s.charAt(0) === "0") return s.slice(1);
    if (s.length > 2 && s.slice(0, 2) === "-0") return "-" + s.slice(2);
    return s;
  }
  // Joins numbers for path data with the fewest separators.
  function nums(arr) {
    var s = "", prev = "";
    for (var i = 0; i < arr.length; i++) {
      var t = fmt(rn(arr[i]));
      if (i > 0 && t.charAt(0) !== "-" && !(t.charAt(0) === "." && prev.indexOf(".") >= 0)) s += " ";
      s += t;
      prev = t;
    }
    return s;
  }

  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    var x = hexRgb(a), y = hexRgb(b), o = "#";
    for (var i = 0; i < 3; i++) {
      var v = Math.round(lerp(x[i], y[i], t));
      o += (v < 16 ? "0" : "") + v.toString(16);
    }
    return o;
  }

  // A frame maps local units (u right, v down) to viewBox coordinates: origin (x, y),
  // scale s, optional rotation in radians. Heads use 1 unit = half the head height.
  function frame(x, y, s, rot, flip) {
    var c = Math.cos(rot || 0), n = Math.sin(rot || 0), m = flip ? -1 : 1;
    var f = function (u, v) { v *= m; return [x + s * (u * c - v * n), y + s * (u * n + v * c)]; };
    f.s = s;
    f.x = x;
    f.y = y;
    return f;
  }
  // Local v of the frame bottom (plus a margin), so garments always reach the cut edge.
  function bot(b) { return Math.max(5.7, (912 - b.y) / b.s); }
  var V = frame(0, 0, 1, 0);  // plain viewBox coordinates

  function mapPts(f, list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i], q = f(p[0], p[1]);
      if (p[2]) q.push(1);
      out.push(q);
    }
    return out;
  }

  // Smooth path through points (Catmull-Rom as cubic Beziers). A point with a third entry
  // is a corner: its tangents point along the chords to its neighbours. Written with
  // relative commands; offsets come from rounded absolute points, so nothing drifts.
  function curve(p, closed) {
    var n = p.length, last = closed ? n : n - 1;
    var cx = rn(p[0][0]), cy = rn(p[0][1]), out = [];
    for (var i = 0; i < last; i++) {
      var p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
      var a = p1[2] ? [lerp(p1[0], p2[0], 0.3), lerp(p1[1], p2[1], 0.3)] : [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      var b = p2[2] ? [lerp(p2[0], p1[0], 0.3), lerp(p2[1], p1[1], 0.3)] : [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      var ex = rn(p2[0]), ey = rn(p2[1]);
      out.push(rn(a[0]) - cx, rn(a[1]) - cy, rn(b[0]) - cx, rn(b[1]) - cy, ex - cx, ey - cy);
      cx = ex; cy = ey;
    }
    return "M" + nums([p[0][0], p[0][1]]) + "c" + nums(out) + (closed ? "z" : "");
  }
  function sm(f, list) { return curve(mapPts(f, list), true); }

  // Cubic Bezier point.
  function bez(p0, p1, p2, p3, t) {
    var m = 1 - t, a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  }

  // Ellipse outline as smooth points (local units), starting at angle a0.
  function ellPts(cx, cy, rx, ry, k, a0) {
    var out = [];
    for (var i = 0; i < k; i++) {
      var a = (a0 || 0) + (i / k) * Math.PI * 2;
      out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return out;
  }

  // ---------------------------------------------------------------- render context

  function Ctx(cid, uid) {
    this.cid = cid;
    this.pre = cid + "-" + uid + "-";
    this.defs = [];
    this.body = [];
    this.sil = [];
    this.refs = {};
    this.n = 0;
    this.tints = [];      // [color, opacity] washes over the whole figure (shade, scene light)
    this.inner = false;   // true while drawing shapes that never reach the outer outline
  }
  Ctx.prototype.id = function (name) { return this.pre + name; };
  Ctx.prototype.add = function (s) { this.body.push(s); };
  Ctx.prototype.def = function (s) { this.defs.push(s); };
  // Filled path. o = opacity; sil = also part of the outer silhouette (rim light, shadow).
  Ctx.prototype.fill = function (d, color, o, sil, extra) {
    var a = ' fill="' + color + '"' + op(o) + (extra || "");
    this.refs[d] = { i: this.body.length, a: a };
    this.body.push('<path d="' + d + '"' + a + "/>");
    if (sil && !this.inner) this.sil.push(this.ref(d));
    return d;
  };
  // A shape needed again (silhouette, clip) moves into <defs> once; the body then draws it
  // with <use>, so its path data is written a single time.
  Ctx.prototype.ref = function (d) {
    var r = this.refs[d] || (this.refs[d] = {});
    if (!r.id) {
      r.id = this.id("p" + (++this.n));
      this.def('<path id="' + r.id + '" d="' + d + '"/>');
      if (r.i !== undefined) this.body[r.i] = '<use href="#' + r.id + '"' + r.a + "/>";
    }
    return r.id;
  };
  Ctx.prototype.shape = function (f, list, color, o, sil) { return this.fill(sm(f, list), color, o, sil); };
  // Open smooth stroke through frame-local points.
  Ctx.prototype.line = function (f, list, color, w, o) {
    this.body.push('<path d="' + curve(mapPts(f, list), false) + '" fill="none" stroke="' + color + '" stroke-width="' + r1(w) +
      '" stroke-linecap="round"' + op(o) + "/>");
  };
  Ctx.prototype.clip = function (d) {
    var id = this.id("k" + (++this.n));
    this.def('<clipPath id="' + id + '"><use href="#' + this.ref(d) + '"/></clipPath>');
    return "url(#" + id + ")";
  };
  Ctx.prototype.inside = function (d) { this.body.push('<g clip-path="' + this.clip(d) + '">'); };
  Ctx.prototype.end = function () { this.body.push("</g>"); };
  Ctx.prototype.circle = function (p, r, color, o) {
    this.body.push('<circle cx="' + r1(p[0]) + '" cy="' + r1(p[1]) + '" r="' + r1(r) + '" fill="' + color + '"' + op(o) + "/>");
  };

  Ctx.prototype.svg = function () {
    var sid = this.id("sil"), u = "#" + sid, i;
    var box = ' x="-40" y="-40" width="680" height="980"';
    var defs = '<g id="' + sid + '">';
    for (i = 0; i < this.sil.length; i++) defs += '<use href="#' + this.sil[i] + '"/>';
    defs += "</g>" +
      // Rim: the silhouette minus itself shifted down-right leaves a thin upper-left edge.
      '<mask id="' + this.id("rim") + '" maskUnits="userSpaceOnUse"' + box + '><use href="' + u + '" fill="#fff"/>' +
      '<use href="' + u + '" fill="#000" transform="translate(4 3.5)"/></mask>' +
      '<mask id="' + this.id("in") + '" maskUnits="userSpaceOnUse"' + box + '><use href="' + u + '" fill="#fff"/></mask>' +
      // Light falls off toward the bottom, where the text panel sits.
      '<linearGradient id="' + this.id("fd") + '" gradientUnits="userSpaceOnUse" x1="0" y1="470" x2="0" y2="900">' +
      '<stop offset="0" stop-color="' + SH + '" stop-opacity="0"/><stop offset="1" stop-color="' + SH + '" stop-opacity=".34"/></linearGradient>';
    // Cast shadow, strictly down-right of the figure (never a band around the head).
    var shadow = '<g opacity=".14"><use href="' + u + '" transform="translate(14 16)" fill="#120904" stroke="#120904" stroke-width="14" stroke-linejoin="round"/></g>' +
      '<g opacity=".2"><use href="' + u + '" transform="translate(6 7)" fill="#120904" stroke="#120904" stroke-width="4" stroke-linejoin="round"/></g>';
    var over = '<rect' + box + ' fill="url(#' + this.id("fd") + ')" mask="url(#' + this.id("in") + ')"/>';
    for (i = 0; i < this.tints.length; i++) over += '<rect' + box + ' fill="' + this.tints[i][0] + '"' + op(this.tints[i][1]) + ' mask="url(#' + this.id("in") + ')"/>';
    over += '<rect' + box + ' fill="#ffe8c4"' + op(this.tints.length ? 0.38 : 0.46) + ' mask="url(#' + this.id("rim") + ')"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" preserveAspectRatio="xMidYMax meet" width="100%" height="100%"' +
      ' class="bhs-portrait" data-portrait="' + this.cid + '" data-facing="left" aria-hidden="true" focusable="false">' +
      "<defs>" + defs + this.defs.join("") + "</defs>" + shadow + compact(this.body) + over + "</svg>";
  };

  // Joins consecutive paths that share every attribute into one element (same look: they
  // were drawn one after another with the same paint), which keeps the markup small.
  function compact(body) {
    var out = [], prevA = null, prevD = "";
    function flush() { if (prevA !== null) out.push('<path d="' + prevD + '"' + prevA + "/>"); prevA = null; prevD = ""; }
    for (var i = 0; i < body.length; i++) {
      var m = /^<path d="([^"]*)"([^>]*)\/>$/.exec(body[i]);
      if (m && (m[2].indexOf("opacity") >= 0 || m[2].indexOf("stroke=") >= 0)) {
        if (prevA === m[2]) { prevD += m[1]; continue; }
        flush();
        prevA = m[2]; prevD = m[1];
        continue;
      }
      flush();
      out.push(body[i]);
    }
    flush();
    return out.join("");
  }

  // Lens-shaped tapered stroke from a through m to b, t thick at m (frame units).
  function leaf(c, f, a, m, b, t, color, o) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = (-dy / L) * t * 0.5, ny = (dx / L) * t * 0.5;
    c.shape(f, [[a[0], a[1], 1], [m[0] + nx, m[1] + ny], [b[0], b[1], 1], [m[0] - nx, m[1] - ny]], color, o);
  }

  // Small deterministic PRNG (mulberry32) so curls and tufts come out the same every time.
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Point at fraction t along a polyline (by segment index).
  function along(pts, t) {
    var x = Math.max(0, Math.min(1, t)) * (pts.length - 1), i = Math.min(Math.floor(x), pts.length - 2), k = x - i;
    return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
  }
  // Irregular edge along a base polyline: n bumps pushed away from the point ctr by about
  // amp, with uneven sizes and spacing. tips makes the bumps pointed (tufts).
  function lumpy(base, n, amp, seed, ctr, tips) {
    var rnd = prng(seed), out = [], N = n * 2;
    for (var i = 1; i < N; i++) {
      var p = along(base, (i + (rnd() - 0.5) * 0.6) / N);
      var dx = p[0] - ctr[0], dy = p[1] - ctr[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
      var r = i % 2 ? amp * (0.5 + rnd()) : amp * 0.15 * rnd();
      out.push([p[0] + (dx / L) * r, p[1] + (dy / L) * r, tips && i % 2 ? 1 : 0]);
    }
    return out;
  }

  // ---------------------------------------------------------------- face kit
  // Head-local units: head height 2 (crown v=-1, chin v=1), u to the right. Three-quarter
  // view facing screen-left: the far eye (left) is narrower, the near ear shows on the right.

  var FACE = {
    jaw: 1, chin: 1, round: 0, hollow: 0,                 // head shape
    eye: 1, open: 1, gaze: -0.2, crinkle: 0, tired: 0,    // eyes
    browIn: 0, browUp: 0, browT: 1, arch: 1,              // brows (browIn > 0 lifts the inner ends)
    smile: 0, part: 0, mouthW: 1, wry: 0,                 // mouth (wry lifts the near corner and brow)
    age: 0, nose: 1, noseW: 1, ear: 1, lash: 1, blush: 0,
    lite: false,                                          // fewer fine lines (small group faces)
    soft: 0,                                              // 0..1 lighter shading planes (women, children)
    skin: "#a6744f", lip: "#8a4a36", brow: "#2a1f19", iris: "#3a2416", sclera: "#d9ccb4"
  };
  function withFace(o) { var r = {}, k; for (k in FACE) r[k] = FACE[k]; for (k in o) r[k] = o[k]; return r; }

  function headPts(o) {
    var j = o.jaw, k = o.chin, r = o.round, h = o.hollow;
    return [
      [0.04, -1], [0.5, -0.92], [0.74, -0.62], [0.79, -0.22], [0.76 + r * 0.03, 0.18],
      [0.62 * j + r * 0.05, 0.54], [0.34 * j + r * 0.05, 0.85 * k], [-0.02, 0.98 * k], [-0.27, 0.99 * k],
      [-0.47 - r * 0.04, 0.875 * k], [-0.585 - r * 0.06 + h * 0.03, 0.62], [-0.65 - r * 0.04 + h * 0.015, 0.3],
      [-0.675, 0.02], [-0.665, -0.3], [-0.575, -0.64], [-0.33, -0.915]
    ];
  }

  // Tapered brow from the inner end a to the outer end b, arched upward.
  function brow(c, f, a, b, arch, t, color) {
    var top = [], bot = [];
    for (var i = 0; i <= 4; i++) {
      var s = i / 4, x = lerp(a[0], b[0], s);
      var y = lerp(a[1], b[1], s) - arch * Math.sin(Math.PI * Math.pow(s, 1.36));
      var th = t * (1 - 0.78 * Math.pow(s, 1.4));
      top.push([x, y - th * 0.5]);
      bot.push([x, y + th * 0.5]);
    }
    top[0].push(1); bot[0].push(1);
    c.shape(f, top.concat(bot.reverse()), color);
  }

  // One eye: sclera almond, iris clipped by the lids, lid shadow, lash line, crease.
  // inner = +1 when the inner corner is on the right (far eye), -1 when on the left.
  function eye(c, f, cx, cy, w, inner, o) {
    var h = w * 0.46 * o.open, d = w * 0.3;
    var I = [cx + inner * w, cy + 0.008], O = [cx - inner * w, cy - 0.012];
    var u1 = [lerp(I[0], O[0], 0.25), cy - h * 1.3], u2 = [lerp(I[0], O[0], 0.7), cy - h * 1.22];
    var l1 = [lerp(I[0], O[0], 0.72), cy + d * (1.25 - o.crinkle * 0.45)], l2 = [lerp(I[0], O[0], 0.28), cy + d * 1.2];
    function P(q) { return nums(f(q[0], q[1])); }
    var upper = "M" + P(I) + "C" + P(u1) + " " + P(u2) + " " + P(O);
    var almond = upper + "C" + P(l1) + " " + P(l2) + " " + P(I) + "Z";
    c.fill(almond, o.sclera);
    var r = w * 0.44, g = [cx + o.gaze * w, cy - h * 0.1 + d * 0.32], s = f.s;
    c.inside(almond);
    c.circle(f(g[0], g[1]), r * s, o.iris);
    c.circle(f(g[0], g[1]), r * 0.5 * s, INK);
    c.fill(upper + "C" + P([u2[0], u2[1] + h * 0.75]) + " " + P([u1[0], u1[1] + h * 0.75]) + " " + P(I) + "Z", SH, 0.3);
    c.end();
    c.circle(f(g[0] - r * 0.3, g[1] - r * 0.34), r * 0.2 * s, "#fff8ea", 0.85);
    // Lash line along the upper lid, a little past the outer corner.
    var t = 0.024 * o.lash, Oe = [O[0] - inner * w * (0.12 + 0.06 * o.lash), O[1] + w * 0.03];
    c.fill(upper + "L" + P(Oe) + "C" + P([u2[0], u2[1] - t * 1.6]) + " " + P([u1[0], u1[1] - t * 1.4]) + " " + P([I[0], I[1] - t * 0.3]) + "Z", INK, 0.92);
    if (o.lite) return;
    // Upper-lid crease and a faint lower lid.
    var k = 0.035 + h * 0.55;
    c.add('<path d="M' + P([lerp(I[0], O[0], 0.12), lerp(I[1], O[1], 0.12) - k * 0.5]) + "C" + P([u1[0], u1[1] - k]) + " " + P([u2[0], u2[1] - k]) + " " +
      P([lerp(I[0], O[0], 0.92), lerp(I[1], O[1], 0.92) - k * 0.6]) + '" fill="none" stroke="' + SH + '" stroke-width="' + r1(s * 0.014) +
      '" stroke-linecap="round" opacity=".38"/>');
    var b1 = bez(O, l1, l2, I, 0.18), b2 = bez(O, l1, l2, I, 0.5), b3 = bez(O, l1, l2, I, 0.82);
    c.line(f, [[b1[0], b1[1] + 0.012], [b2[0], b2[1] + 0.016], [b3[0], b3[1] + 0.012]], SH, s * 0.012, r1(0.22 + o.tired * 0.2 + o.age * 0.1));
    if (o.tired > 0 || o.age > 0) {
      c.line(f, [[b1[0], b1[1] + 0.06], [b2[0], b2[1] + 0.075], [b3[0], b3[1] + 0.05]], SH, s * 0.012, r1(0.1 + o.tired * 0.14 + o.age * 0.06));
    }
    if (o.crinkle > 0 || o.age > 0.5) {
      var ox = O[0] - inner * 0.03;
      c.line(f, [[ox, O[1] + 0.01], [ox - inner * 0.06, O[1] + 0.035]], SH, s * 0.012, r1(0.22 + o.crinkle * 0.15));
      c.line(f, [[ox, O[1] + 0.045], [ox - inner * 0.05, O[1] + 0.09]], SH, s * 0.012, r1(0.18 + o.crinkle * 0.12));
    }
  }

  // Draws the head: skin, ear, light and shadow planes, eyes, brows, nose. The mouth is
  // separate so beards can go between. Returns the head outline path.
  function head(c, f, o) {
    var keep = PREC;
    PREC = 1;
    var hd = c.shape(f, headPts(o), o.skin, 1, true);
    if (o.ear) {
      c.shape(f, [[0.6, -0.05], [0.69, -0.1], [0.8, -0.06], [0.84, 0.1], [0.79, 0.29], [0.69, 0.38], [0.61, 0.33]], mix(o.skin, SH, 0.2), 1, true);
      c.shape(f, [[0.665, 0.0], [0.75, -0.03], [0.785, 0.1], [0.74, 0.25], [0.69, 0.21], [0.72, 0.1], [0.68, 0.06]], SH, 0.32);
    }
    c.inside(hd);
    var sf = 1 - 0.35 * o.soft;
    // Near side plane, from the temple past the outer eye corner and down the cheek.
    c.shape(f, [[0.33, -1.05], [0.27, -0.55], [0.25, -0.22], [0.27, 0.06], [0.245, 0.3, 1], [0.16, 0.56], [0.03, 0.8], [-0.08, 1.02],
      [0.6, 1.3, 1], [1.1, 0.4, 1], [1.1, -1.1, 1]], SH, r1(0.2 * sf));
    if (o.hollow) {
      c.shape(f, [[0.245, 0.3], [0.1, 0.42], [0.03, 0.62], [0.18, 0.6]], SH, r1(0.14 * o.hollow));
      c.shape(f, [[-0.66, 0.3], [-0.52, 0.42], [-0.56, 0.64], [-0.64, 0.6]], SH, r1(0.12 * o.hollow));
    }
    if (o.blush) {
      c.shape(f, [[-0.06, 0.22], [0.14, 0.18], [0.24, 0.33], [0.1, 0.46], [-0.06, 0.38]], "#b8442a", r1(0.1 * o.blush));
      c.shape(f, [[-0.62, 0.22], [-0.47, 0.2], [-0.43, 0.34], [-0.56, 0.42]], "#b8442a", r1(0.07 * o.blush));
    }
    // Eye sockets under the brow ridge.
    c.shape(f, [[-0.12, -0.14], [0.05, -0.17], [0.23, -0.11], [0.21, 0.0], [0.05, -0.07], [-0.11, -0.03]], SH, 0.12);
    c.shape(f, [[-0.38, -0.13], [-0.52, -0.155], [-0.65, -0.11], [-0.63, -0.01], [-0.5, -0.06], [-0.39, -0.03]], SH, 0.1);
    if (!o.lite) {
      // Light on the far cheekbone and the chin.
      c.shape(f, [[-0.66, 0.1], [-0.5, 0.14], [-0.42, 0.3], [-0.6, 0.38]], HI, 0.12);
      c.shape(f, [[-0.34, 0.86], [-0.22, 0.84], [-0.15, 0.9], [-0.3, 0.94]], HI, 0.06);
    }
    if (o.age > 0) {
      c.line(f, [[-0.5, -0.47], [-0.25, -0.52], [0.0, -0.49]], SH, f.s * 0.012, r1(0.22 * o.age));
      if (!o.lite) c.line(f, [[-0.12, 0.43], [-0.06, 0.55], [-0.04, 0.66]], SH, f.s * 0.014, r1(0.3 * o.age));
    }
    c.end();
    // Eyes and brows.
    PREC = f.s < 100 ? 1 : 10;
    var ey = 0.03, es = o.eye;
    eye(c, f, -0.505, ey, 0.115 * es, 1, o);
    eye(c, f, 0.035, ey, 0.146 * es, -1, o);
    PREC = 1;
    var bu = o.browUp, bi = o.browIn, t = 0.052 * o.browT, ar = 0.035 * o.arch;
    brow(c, f, [-0.37, -0.165 - bu - bi], [-0.655, -0.13 - bu], ar, t * 0.92, o.brow);
    brow(c, f, [-0.125, -0.175 - bu - bi], [0.245, -0.135 - bu - o.wry * 0.05], ar + o.wry * 0.02, t, o.brow);
    // Nose: shadow side plane, wing, nostril, ridge light, cast shadow below.
    PREC = f.s < 100 ? 1 : 10;
    var n = o.nose, w = o.noseW;
    c.shape(f, [[-0.228, -0.02], [-0.18, 0.1], [-0.162 + 0.02 * (w - 1), 0.28 * n], [-0.112 + 0.05 * (w - 1), 0.38 * n, 1], [-0.14 + 0.04 * (w - 1), 0.432 * n],
      [-0.222, 0.44 * n], [-0.2, 0.37 * n], [-0.212, 0.2 * n]], SH, r1(0.24 * sf));
    if (!o.lite) c.line(f, [[-0.128 + 0.05 * (w - 1), 0.33 * n], [-0.105 + 0.05 * (w - 1), 0.39 * n], [-0.135 + 0.04 * (w - 1), 0.435 * n]], SH, f.s * 0.016, r1(0.4 * sf));
    c.shape(f, [[-0.27, 0.425 * n], [-0.235, 0.41 * n], [-0.2, 0.425 * n], [-0.235, 0.44 * n]], SH, r1(0.6 * sf));
    if (!o.lite) c.line(f, [[-0.27, 0.0], [-0.3, 0.18 * n], [-0.322, 0.33 * n]], HI, f.s * 0.018, 0.32);
    c.shape(f, [[-0.37 - 0.03 * (w - 1), 0.415 * n], [-0.28, 0.465 * n], [-0.15, 0.462 * n], [-0.11 + 0.05 * (w - 1), 0.425 * n], [-0.24, 0.445 * n]], SH, 0.26);
    PREC = keep;
    return hd;
  }

  // Mouth: upper lip, lower lip, the line between, a shadow under the lower lip. With a
  // beard (bd = its options) the upper lip hides under a mustache drawn last.
  function mouth(c, f, o, bd) {
    var keep = PREC;
    PREC = 10;
    var s = o.smile * 0.035, w = o.mouthW, cx = -0.255, y = 0.628;
    var A = [cx - 0.168 * w, y - s], B = [cx + 0.18 * w, y - s * 1.15 - o.wry * 0.03];
    var mid = [cx, y + 0.01 + s * 0.25];
    var gap = 0.012 + o.part * 0.034;
    if (!bd) c.shape(f, [A, [cx - 0.07, y - 0.035], [cx, y - 0.028], [cx + 0.07, y - 0.035], B, mid], o.lip, 0.55);
    c.shape(f, [[A[0] + 0.02, A[1] + 0.012], [cx, y + 0.07 + s * 0.2 + o.part * 0.02], [B[0] - 0.03, B[1] + 0.012], mid], o.lip, bd ? 0.9 : 0.55);
    var ld = c.shape(f, [A, [cx - 0.08, mid[1] - gap * 0.6], [cx + 0.08, mid[1] - gap * 0.6], B, [cx + 0.08, mid[1] + gap * 0.5], [cx - 0.08, mid[1] + gap * 0.5]],
      mix(o.lip, INK, 0.62), 0.95);
    if (o.part > 0.45) {
      c.inside(ld);
      c.shape(f, [[cx - 0.12, mid[1] - gap], [cx + 0.12, mid[1] - gap], [cx + 0.1, mid[1] - gap * 0.2], [cx - 0.1, mid[1] - gap * 0.2]], "#e8dccb", 0.85);
      c.end();
    }
    if (!bd) c.shape(f, [[cx - 0.1, y + 0.085], [cx, y + 0.1], [cx + 0.1, y + 0.08], [cx, y + 0.125]], SH, 0.16);
    PREC = keep;
    if (bd && !bd.stubble) {
      var m = s * 0.6;
      c.shape(f, [[-0.47, 0.67 - m], [-0.43, 0.56], [-0.34, 0.505], [-0.255, 0.522], [-0.17, 0.505], [-0.05, 0.53], [0.01, 0.64 - m], [-0.08, 0.605 - m],
        [-0.255, 0.592], [-0.4, 0.607 - m]], mix(bd.color, HI, 0.06));
      c.shape(f, [[-0.12, 0.5], [0.0, 0.53], [0.01, 0.64 - m], [-0.1, 0.6]], SH, 0.22);
    }
  }

  // ---------------------------------------------------------------- hair, beards, garments

  var HAIR_OUT = [[-0.75, -0.42], [-0.7, -0.76], [-0.48, -1.02], [-0.14, -1.14], [0.22, -1.13], [0.54, -1.02], [0.78, -0.78], [0.9, -0.44], [0.92, -0.08], [0.88, 0.24]];
  var HAIR_LINE = [[0.14, -0.58], [-0.1, -0.64], [-0.34, -0.63], [-0.54, -0.57], [-0.64, -0.42]];

  // Hair: from the far temple over the top of the head to the nape, then behind and over the
  // near ear, down the sideburn and back along the hairline. The top edge is smooth, or
  // irregular with h.lumps bumps (h.tips for pointed tufts); h.line replaces the hairline,
  // h.ear the part around the ear. h.curls scatters small curl marks; h.locks adds leaves.
  function hair(c, f, h) {
    var sb = h.side === undefined ? 0.18 : h.side, v = h.vol || 1, i;
    var base = [];
    for (i = 0; i < HAIR_OUT.length; i++) base.push([0.06 + (HAIR_OUT[i][0] - 0.06) * v, -0.25 + (HAIR_OUT[i][1] + 0.25) * v]);
    var outer = h.lumps ? [base[0]].concat(lumpy(base, h.lumps, h.amp || 0.08, h.seed || 3, [0.06, -0.25], h.tips), [base[base.length - 1]]) : base;
    var ear = h.ear || [[0.78, 0.44, 1], [0.8, 0.22], [0.8, 0.0], [0.76, -0.1], [0.66, -0.13], [0.56, -0.05], [0.5, 0.08], [0.47, sb, 1], [0.4, 0.04], [0.34, -0.22], [0.3, -0.46, 1]];
    var line = h.line || HAIR_LINE;
    // Shadow the hair casts on the forehead.
    var band = [[0.3, -0.46]].concat(line, [[-0.68, -0.16]]), sh = [];
    for (i = 0; i < band.length; i++) sh.push([band[i][0], band[i][1]]);
    for (i = band.length - 1; i >= 0; i--) sh.push([band[i][0], band[i][1] + 0.08]);
    c.shape(f, sh, SH, 0.15);
    var d = c.shape(f, [[-0.68, -0.16, 1]].concat(outer, ear, line), h.color, 1, true);
    c.inside(d);
    c.shape(f, [[0.3, -1.5], [1.4, -1.3], [1.4, 0.8], [0.6, 0.6], [0.42, -0.2]], SH, 0.24);
    c.shape(f, [[-0.8, -0.6], [-0.46, -1.06], [0.1, -1.2], [0.02, -0.96], [-0.45, -0.76]], HI, 0.1);
    if (h.curls) {
      var rnd = prng((h.seed || 3) + 17);
      for (i = 0; i < h.curls; i++) {
        var p = along(base, 0.06 + 0.88 * rnd()), k = 0.1 + 0.32 * rnd();
        var q = [lerp(p[0], 0.06, k), lerp(p[1], -0.25, k)], a = rnd() * 6.28, L = 0.065;
        leaf(c, f, [q[0] - L * Math.cos(a), q[1] - L * Math.sin(a)], [q[0] + 0.035 * Math.sin(a), q[1] - 0.035 * Math.cos(a)],
          [q[0] + L * Math.cos(a), q[1] + L * Math.sin(a)], 0.03, h.hi, 0.55);
      }
    }
    var K = h.locks || [];
    for (i = 0; i < K.length; i++) leaf(c, f, K[i][0], K[i][1], K[i][2], K[i][3] || 0.05, h.hi || HI, K[i][4] || 0.16);
    c.end();
    return d;
  }

  // Beard over the jaw; e widens it, len lengthens it, tufts roughens its lower edge. A thin
  // half-tone band softens the cheek line. stubble draws only a faint shadow. locks are
  // leaves in a lighter (gray) or darker tone. The mustache is drawn by mouth().
  function beard(c, f, b) {
    var e = b.e || 0, L = b.len || 0, i;
    var low = [[0.6 + e, 0.42], [0.52 + e, 0.8], [0.26 + e * 0.5, 1.0 + L * 0.55], [-0.12, 1.07 + L], [-0.42, 0.99 + L * 0.7], [-0.62 - e * 0.5, 0.74], [-0.69 - e * 0.3, 0.4]];
    if (b.tufts) low = [low[0]].concat(lumpy(low, b.tufts, b.amp || 0.05, b.seed || 5, [-0.1, 0.45], true), [low[low.length - 1]]);
    var cheek = [[-0.68, 0.08, 1], [-0.6, 0.3], [-0.5, 0.47], [-0.45, 0.58], [-0.37, 0.515], [-0.255, 0.49], [-0.15, 0.51], [-0.05, 0.56], [0.04, 0.5], [0.2, 0.36], [0.35, 0.2]];
    var p = [[0.46, 0.12, 1]].concat(low, cheek);
    if (b.stubble) { c.shape(f, p, SH, b.stubble); return null; }
    if (!b.lite) {
      var soft = [[0.47, 0.04]];
      for (i = cheek.length - 1; i >= 0; i--) soft.push([cheek[i][0], cheek[i][1] - 0.075]);
      for (i = 0; i < cheek.length; i++) soft.push([cheek[i][0], cheek[i][1] + 0.03]);
      soft.push([0.47, 0.16]);
      c.shape(f, soft, b.color, 0.3);
    }
    var d = c.shape(f, p, b.color, 1, true);
    c.inside(d);
    c.shape(f, [[0.12, 0.45], [0.7, 0.1], [0.8, 1.8], [0.0, 1.8], [0.05, 1.0]], SH, 0.24);
    c.shape(f, [[-0.7, 0.86 + L * 0.5], [0.5, 0.86 + L * 0.5], [0.5, 1.6 + L], [-0.7, 1.6 + L]], SH, 0.16);
    c.shape(f, [[-0.68, 0.2], [-0.54, 0.5], [-0.48, 0.78], [-0.64, 0.72]], HI, 0.1);
    var K = b.locks || [];
    for (i = 0; i < K.length; i++) leaf(c, f, K[i][0], K[i][1], K[i][2], K[i][3] || 0.05, b.hi || HI, K[i][4] || 0.3);
    c.end();
    return d;
  }

  // Neck column from the jaw to below the collar, mostly in shadow.
  function neck(c, f, skin, w) {
    var k = w || 1;
    c.shape(f, [[-0.34 * k, 0.55], [0.3, 0.3], [0.82, 0.24], [0.7 * k, 1.0], [0.62 * k, 1.72], [-0.44 * k, 1.76], [-0.36 * k, 1.05]], mix(skin, SH, 0.18), 1, true);
    c.shape(f, [[-0.4 * k, 0.72], [0.5 * k, 0.55], [0.5 * k, 1.05], [-0.06, 1.1], [-0.42 * k, 0.98]], SH, 0.2);
  }

  // Tunic over shoulders and chest (body frame: head center origin, head units). k scales
  // the width; nk the depth of the neckline. The arms hang at the sides, set off by shadow.
  function tunic(c, b, color, k, nk, bottom, plain) {
    var n = nk || 1, B = bottom || bot(b);
    var d = c.shape(b, [[-1.86 * k, B, 1], [-1.84 * k, 2.6], [-1.72 * k, 1.9], [-1.32 * k, 1.52], [-0.44, 1.32, 1], [0.02, 1.32 + 0.28 * n], [0.5, 1.28, 1],
      [1.38 * k, 1.46], [1.94 * k, 1.8], [2.06 * k, 2.6], [2.08 * k, B, 1]], color, 1, true);
    if (plain) {
      c.shape(b, [[-0.44, 1.32], [0.02, 1.32 + 0.28 * n], [0.5, 1.28], [0.5, 1.4], [0.02, 1.43 + 0.28 * n], [-0.44, 1.43]], SH, 0.22);
      return d;
    }
    c.inside(d);
    c.shape(b, [[0.95, 1.2], [2.4, 1.5], [2.4, B], [1.25, B], [1.1, 3.0]], SH, 0.15);
    c.shape(b, [[-0.44, 1.32], [0.02, 1.32 + 0.28 * n], [0.5, 1.28], [0.5, 1.4], [0.02, 1.43 + 0.28 * n], [-0.44, 1.43]], SH, 0.22);
    leaf(c, b, [-1.26 * k, 2.0], [-1.34 * k, 3.4], [-1.36 * k, B], 0.1, SH, 0.24);
    leaf(c, b, [1.48 * k, 2.0], [1.56 * k, 3.4], [1.58 * k, B], 0.1, SH, 0.26);
    c.shape(b, [[-1.68 * k, 1.92], [-1.2 * k, 1.56], [-0.6, 1.42], [-0.9, 1.62], [-1.4 * k, 1.94], [-1.62 * k, 2.6]], HI, 0.14);
    c.end();
    return d;
  }

  // Mantle drawn over the head (scribes): the part behind the head, then the front.
  function hoodBack(c, b, M) {
    c.shape(b, [[-0.3, -1.13], [0.25, -1.17], [0.73, -0.98], [0.98, -0.55], [1.04, 0.05], [1.02, 0.6], [0.9, 1.5], [-0.82, 1.5], [-0.88, 0.6], [-0.86, -0.3], [-0.74, -0.84]], M.inner, 1, true);
  }
  function hoodFront(c, b, M, k, lite) {
    var B = bot(b);
    var d = c.shape(b, [
      [-0.8, B, 1], [-0.72, 2.3], [-0.78, 1.45], [-0.84, 0.6], [-0.8, 0.0], [-0.72, -0.6, 1], [-0.42, -0.75], [-0.05, -0.78], [0.25, -0.7],
      [0.4, -0.42], [0.47, 0.0], [0.52, 0.45], [0.55, 0.9], [0.64, 1.4], [0.74, 2.3], [0.7, B, 1],
      [2.1 * k, B, 1], [2.07 * k, 2.6], [1.98 * k, 1.9], [1.62 * k, 1.52], [1.14, 1.26], [1.04, 0.7], [1.05, 0.05], [0.98, -0.55], [0.73, -0.98],
      [0.25, -1.17], [-0.3, -1.13], [-0.73, -0.84], [-0.89, -0.3], [-0.94, 0.45], [-1.0, 1.1], [-1.32 * k, 1.44], [-1.7 * k, 1.62], [-1.86 * k, 1.98],
      [-1.92 * k, 2.6], [-1.96 * k, B, 1]
    ], M.cloth, 1, true);
    c.inside(d);
    // Hood interior: a narrow band along the face opening.
    c.shape(b, [[-0.72, -0.6], [-0.42, -0.75], [-0.05, -0.78], [0.25, -0.7], [0.4, -0.42], [0.47, 0.0], [0.52, 0.45], [0.55, 0.9], [0.64, 1.4],
      [0.71, 1.4], [0.62, 0.9], [0.59, 0.45], [0.54, 0.0], [0.47, -0.46], [0.29, -0.78], [-0.05, -0.85], [-0.44, -0.82], [-0.78, -0.64]], M.inner, 0.55);
    // Shade on the right half; light on the crown; folds.
    c.shape(b, [[0.64, -0.3], [1.15, -0.6], [2.5, 1.7], [2.5, B], [1.35, B], [1.1, 3.0], [0.86, 1.7]], SH, 0.14);
    c.shape(b, [[-0.62, -0.96], [-0.1, -1.13], [0.5, -1.02], [0.3, -0.88], [-0.2, -0.92]], HI, 0.3);
    leaf(c, b, [1.2, 1.45], [1.34 * k, 2.3], [1.36 * k, 3.6], 0.1, M.dark, 0.9);
    leaf(c, b, [-1.38 * k, 1.7], [-1.48 * k, 2.5], [-1.5 * k, 3.6], 0.09, M.dark, 0.9);
    if (!lite) {
      leaf(c, b, [1.62 * k, 1.75], [1.74 * k, 2.7], [1.74 * k, 3.8], 0.09, M.dark, 0.9);
      leaf(c, b, [-1.02, 1.42], [-1.1, 2.1], [-1.1, 3.0], 0.08, M.dark, 0.8);
      leaf(c, b, [0.75, -0.92], [0.97, -0.4], [1.0, 0.3], 0.08, M.dark, 0.7);
    }
    // Two dark bands across the hanging panels.
    if (M.band) {
      c.shape(b, [[-2.3, 2.62], [-1.3, 2.7], [0, 2.6], [1.4, 2.72], [2.4, 2.64], [2.4, 2.86], [1.4, 2.94], [0, 2.82], [-1.3, 2.92], [-2.3, 2.84]], M.band, 0.92);
      c.shape(b, [[-2.3, 3.04], [-1.3, 3.12], [0, 3.02], [1.4, 3.14], [2.4, 3.06], [2.4, 3.14], [1.4, 3.22], [0, 3.1], [-1.3, 3.2], [-2.3, 3.12]], M.band, 0.92);
    }
    c.end();
    return d;
  }

  // Cloth wrapped around the head (townsmen): a tail behind the ear, the crown cap, folds.
  function headcloth(c, f, h) {
    c.shape(f, [[0.7, -0.4], [0.98, -0.25], [1.06, 0.4], [1.0, 1.1], [0.84, 1.3], [0.74, 0.8], [0.76, 0.2]], mix(h.color, SH, 0.25), 1, true);
    var lo = h.low || 0;
    var d = c.shape(f, [[-0.73, -0.3 + lo, 1], [-0.78, -0.7], [-0.54, -1.06], [0.0, -1.2], [0.55, -1.1], [0.88, -0.8], [0.95, -0.36], [0.84, -0.08], [0.62, -0.05],
      [0.5, -0.36 + lo], [0.25, -0.5 + lo], [-0.1, -0.56 + lo], [-0.48, -0.5 + lo]], h.color, 1, true);
    c.inside(d);
    c.shape(f, [[0.3, -1.4], [1.2, -1.2], [1.2, 0.2], [0.5, 0.0], [0.4, -0.6]], SH, 0.22);
    c.shape(f, [[-0.8, -0.62], [-0.45, -1.0], [0.1, -1.16], [0.0, -0.98], [-0.5, -0.78]], HI, 0.18);
    leaf(c, f, [-0.74, -0.58 + lo], [-0.1, -0.74 + lo], [0.86, -0.52], 0.09, mix(h.color, SH, 0.4), 0.8);
    leaf(c, f, [-0.62, -0.88], [0.0, -1.02], [0.82, -0.86], 0.06, mix(h.color, SH, 0.4), 0.7);
    c.end();
    return d;
  }

  // Relaxed hand seen from the back: wrist at the origin, fingers along +u, thumb toward -v.
  // Hand-local frame in head units (a hand is about 1.4 units long, as long as a face).
  // curl draws the fingers loosely folded.
  function hand(c, h, skin, curl) {
    var d = curl
      ? c.shape(h, [[0, 0.26, 1], [0.4, 0.32], [0.7, 0.31], [0.9, 0.27], [1.0, 0.14], [1.02, -0.04], [0.96, -0.2], [0.8, -0.3], [0.68, -0.34],
        [0.7, -0.44], [0.62, -0.53], [0.42, -0.48], [0.2, -0.35], [0, -0.26, 1]], skin, 1, true)
      : c.shape(h, [[0, 0.26, 1], [0.4, 0.32], [0.72, 0.31], [1.0, 0.3], [1.16, 0.24], [1.22, 0.14], [1.32, 0.1], [1.41, 0.02], [1.4, -0.08], [1.33, -0.18],
        [1.24, -0.26], [0.95, -0.32], [0.72, -0.35], [0.68, -0.43], [0.82, -0.52], [0.72, -0.59], [0.45, -0.49], [0.2, -0.35], [0, -0.26, 1]], skin, 1, true);
    c.inside(d);
    c.shape(h, [[0.2, 0.1], [1.5, 0.05], [1.5, 0.4], [0.2, 0.4]], SH, 0.14);
    c.shape(h, [[0.1, -0.2], [0.7, -0.3], [0.5, -0.1], [0.15, -0.05]], HI, 0.12);
    if (curl) c.shape(h, [[0.74, -0.4], [1.1, -0.3], [1.1, 0.4], [0.74, 0.4], [0.8, 0.0]], SH, 0.12);
    c.end();
    var e = curl ? [[0.78, 0.9, 0.98], [0.78, 0.92, 1.0], [0.76, 0.88, 0.96]] : [[0.82, 1.06, 1.26], [0.82, 1.08, 1.3], [0.8, 1.0, 1.14]];
    var vv = [-0.15, 0.01, 0.16];
    for (var i = 0; i < 3; i++) c.line(h, [[e[i][0], vv[i]], [e[i][1], vv[i] + 0.01], [e[i][2], vv[i] + 0.02]], SH, h.s * 0.012, 0.35);
    return d;
  }

  // Fist around a rod (scroll, rope): back of the fingers toward the viewer, thumb over the
  // top. Hand-local frame: u along the rod, v across it.
  function fist(c, h, skin) {
    var d = c.shape(h, [[-0.36, -0.1], [-0.24, -0.26], [0.1, -0.3], [0.34, -0.23], [0.4, 0.0], [0.36, 0.22], [0.14, 0.31], [-0.2, 0.31], [-0.38, 0.14]], skin, 1, true);
    c.inside(d);
    c.shape(h, [[-0.5, 0.08], [0.5, 0.08], [0.5, 0.4], [-0.5, 0.4]], SH, 0.16);
    c.end();
    for (var i = 0; i < 3; i++) { var x = -0.17 + i * 0.18; c.line(h, [[x, -0.16], [x + 0.01, 0.06], [x, 0.27]], SH, h.s * 0.012, 0.38); }
    c.shape(h, [[-0.38, -0.02], [-0.26, -0.22], [-0.02, -0.34], [0.17, -0.31], [0.13, -0.24], [-0.1, -0.16], [-0.28, 0.06]], mix(skin, HI, 0.1), 1, true);
    return d;
  }

  // ---------------------------------------------------------------- characters

  var draw = {};

  // Menahem: scribe of Capernaum, about 50. Cream mantle with dark bands drawn over his
  // head, a tassel on the corner thrown over his shoulder, gray-streaked beard, a small
  // scroll held to his chest, ink-darkened fingertips. Sincere and careful.
  draw.menahem = function (c) {
    var o = withFace({ skin: "#a6744f", lip: "#86493a", brow: "#3e3630", age: 1, open: 0.88, browIn: 0.022, gaze: -0.2, nose: 1.06, hollow: 0.4, jaw: 1.02 });
    var f = frame(290, 226, 122, -0.02), b = frame(290, 226, 122, 0);
    var M = { cloth: "#dcd1b6", dark: "#b6a88a", inner: "#8d806a", band: "#363a47" };
    var TUNIC = "#93703f";
    var bd = { color: "#5a5047", e: 0.04, len: 0.36, tufts: 5, amp: 0.05, seed: 21, hi: "#b3ac9f", locks: [
      [[-0.64, 0.42], [-0.6, 0.72], [-0.5, 1.02], 0.07, 0.75], [[-0.4, 0.8], [-0.36, 1.08], [-0.26, 1.36], 0.07, 0.8], [[-0.16, 0.86], [-0.12, 1.14], [-0.1, 1.4], 0.06, 0.65],
      [[0.04, 0.82], [0.06, 1.06], [0.02, 1.3], 0.06, 0.55], [[-0.5, 0.5], [-0.46, 0.66], [-0.4, 0.8], 0.05, 0.6]
    ] };
    neck(c, f, o.skin, 1.05);
    tunic(c, b, TUNIC, 1, 0.6, 0, true);
    hoodBack(c, b, M);
    c.inner = true;
    head(c, f, o);
    // Hair at the far temple and along the forehead, gray at the temple.
    c.shape(f, [[-0.72, -0.6], [-0.45, -0.76], [-0.05, -0.79], [0.22, -0.7], [0.12, -0.63], [-0.2, -0.67], [-0.5, -0.61], [-0.63, -0.42], [-0.67, -0.12, 1], [-0.75, -0.25]], "#463e37");
    leaf(c, f, [-0.71, -0.3], [-0.66, -0.5], [-0.5, -0.66], 0.05, "#aaa398", 0.9);
    leaf(c, f, [-0.4, -0.7], [-0.2, -0.73], [0.05, -0.74], 0.03, "#aaa398", 0.6);
    beard(c, f, bd);
    mouth(c, f, o, bd);
    c.inner = false;
    leaf(c, f, [-0.42, 0.56], [-0.3, 0.52], [-0.17, 0.54], 0.03, "#b3ac9f", 0.7);
    // His right arm comes from under the mantle; the sleeve shows at the wrist.
    var q = b(-0.66, 2.66), h = frame(q[0], q[1], 122, -0.62), skin = mix(o.skin, SH, 0.06);
    c.shape(h, [[-0.3, -0.06], [-0.2, 0.3], [-0.7, 0.86], [-1.2, 0.5]], mix(TUNIC, SH, 0.15), 1, true);
    hoodFront(c, b, M, 1);
    // Corner thrown over the near shoulder; its tassel (one cord blue) hangs behind.
    c.shape(b, [[1.5, 1.42], [1.98, 1.52], [2.2, 1.78], [2.16, 2.12, 1], [1.82, 1.9], [1.56, 1.66]], mix(M.cloth, SH, 0.1), 1, true);
    c.circle(b(2.16, 2.16), b.s * 0.05, "#cdbfa0");
    leaf(c, b, [2.12, 2.18], [2.1, 2.45], [2.08, 2.8], 0.05, "#e7ddc5");
    leaf(c, b, [2.17, 2.18], [2.19, 2.47], [2.2, 2.84], 0.045, "#3e5d8a");
    leaf(c, b, [2.2, 2.18], [2.25, 2.44], [2.29, 2.76], 0.05, "#e7ddc5");
    c.sil.push(c.ref(sm(b, [[2.04, 2.1], [2.3, 2.1], [2.32, 2.84], [2.06, 2.82]])));
    // Small scroll held to his chest in his fist; ink on the thumb and fingertips.
    c.shape(h, [[-0.78, -0.15, 1], [1.24, -0.15, 1], [1.24, 0.15, 1], [-0.78, 0.15, 1]], "#d8c49b", 1, true);
    c.shape(h, [[-0.78, -0.15, 1], [1.24, -0.15, 1], [1.24, -0.07, 1], [-0.78, -0.07, 1]], HI, 0.4);
    c.shape(h, [[-0.78, 0.07, 1], [1.24, 0.07, 1], [1.24, 0.15, 1], [-0.78, 0.15, 1]], SH, 0.2);
    c.shape(h, [[1.22, -0.15], [1.3, 0], [1.22, 0.15], [1.16, 0]], "#eedfb9", 1, true);
    c.line(h, [[1.2, -0.05], [1.25, 0.0], [1.21, 0.06]], "#a88a5c", h.s * 0.012, 0.8);
    c.shape(h, [[-0.76, -0.15], [-0.84, 0], [-0.76, 0.15], [-0.7, 0]], "#b49668");
    fist(c, h, skin);
    var INKS = "#2a3040";
    c.shape(h, [[0.02, -0.33], [0.1, -0.36], [0.17, -0.33], [0.15, -0.27], [0.06, -0.24], [0.0, -0.28]], INKS, 0.45);
    c.shape(h, [[-0.3, 0.2], [-0.2, 0.22], [-0.12, 0.3], [-0.2, 0.33], [-0.3, 0.3]], INKS, 0.4);
    c.shape(h, [[-0.11, 0.22], [-0.02, 0.24], [0.04, 0.3], [-0.04, 0.33], [-0.12, 0.3]], INKS, 0.35);
  };

  // Hanan: Menahem's student, 17. Barely a beard, bright curious eyes, a wax tablet held
  // up in one hand and a stylus in the other. Undyed tunic, olive mantle over one shoulder.
  draw.hanan = function (c) {
    var o = withFace({ skin: "#b4835b", lip: "#9b5443", brow: "#2a1e17", jaw: 0.95, chin: 0.96, round: 0.18, open: 1.08, gaze: -0.16, browUp: 0.035,
      browIn: 0.02, browT: 0.85, arch: 1.25, smile: 0.3, part: 0.3, blush: 1, eye: 1.06, nose: 0.96, noseW: 0.94 });
    var f = frame(294, 238, 116, -0.03), b = frame(300, 238, 116, 0), B = bot(b);
    neck(c, f, o.skin, 0.95);
    tunic(c, b, "#d2c4a3", 0.95, 1);
    // Olive mantle over the far shoulder, falling across the front.
    var man = c.shape(b, [[-0.42, 1.34], [-1.28, 1.48], [-1.64, 1.86], [-1.76, 2.6], [-1.8, B, 1], [2.0, B, 1], [1.98, 4.3], [1.1, 3.75], [0.3, 2.9], [-0.18, 2.0]], "#6c7744", 1, true);
    c.inside(man);
    c.shape(b, [[-0.42, 1.34], [-0.18, 2.0], [0.3, 2.9], [1.1, 3.75], [1.98, 4.3], [1.98, 4.5], [1.0, 3.95], [0.16, 3.05], [-0.32, 2.1], [-0.56, 1.4]], "#86915a");
    leaf(c, b, [-1.2, 1.7], [-1.3, 2.7], [-1.3, 4.2], 0.1, "#4f5730", 0.9);
    leaf(c, b, [-0.6, 2.4], [-0.5, 3.4], [-0.3, 4.6], 0.09, "#4f5730", 0.8);
    c.shape(b, [[-1.0, 1.4], [-1.7, 1.86], [-1.5, 2.0], [-0.9, 1.6]], HI, 0.16);
    c.end();
    head(c, f, o);
    beard(c, f, { stubble: 0.08 });
    mouth(c, f, o, null);
    hair(c, f, { color: "#241a14", lumps: 4, amp: 0.05, seed: 9, vol: 1.04, side: 0.2, hi: "#5e4a3c",
      line: [[0.14, -0.56], [-0.04, -0.62], [-0.16, -0.5, 1], [-0.24, -0.6], [-0.42, -0.6], [-0.56, -0.53], [-0.64, -0.4]],
      locks: [[[-0.62, -0.72], [-0.3, -0.96], [0.12, -1.04], 0.05, 0.3], [[-0.2, -0.68], [0.12, -0.84], [0.46, -0.86], 0.045, 0.24], [[0.3, -0.62], [0.6, -0.62], [0.84, -0.34], 0.04, 0.2]] });
    // Wax tablet, tilted, wood frame around dark wax with a few scratched strokes.
    var tc = b(0.05, 2.5), t = frame(tc[0], tc[1], 116, -0.1);
    c.shape(t, [[-0.66, -0.42, 1], [0.66, -0.42, 1], [0.66, 0.42, 1], [-0.66, 0.42, 1]], "#9c7348", 1, true);
    c.shape(t, [[-0.57, -0.33, 1], [0.57, -0.33, 1], [0.57, 0.33, 1], [-0.57, 0.33, 1]], "#3c3127");
    c.shape(t, [[-0.66, -0.42, 1], [0.66, -0.42, 1], [0.66, -0.36, 1], [-0.66, -0.36, 1]], HI, 0.3);
    c.line(t, [[-0.46, -0.18], [-0.3, -0.21], [-0.12, -0.17], [0.1, -0.2]], "#74624d", t.s * 0.014, 0.8);
    c.line(t, [[-0.46, -0.04], [-0.22, -0.07], [0.0, -0.03], [0.24, -0.06]], "#74624d", t.s * 0.014, 0.8);
    c.line(t, [[-0.46, 0.1], [-0.3, 0.08], [-0.16, 0.11]], "#74624d", t.s * 0.014, 0.8);
    var skin = mix(o.skin, SH, 0.05);
    // Stylus lying across the wax; both hands hold the lower corners, thumbs on the front.
    leaf(c, t, [-0.36, 0.22], [0.0, 0.12], [0.4, -0.04], 0.045, "#e2d3b0");
    for (var i = 0; i < 2; i++) {
      var sx = i ? -1 : 1, hc = t(sx * 0.5, 0.42), h = frame(hc[0], hc[1], 116, -0.1, i === 1);
      var u = i ? -1 : 1;
      var fb = c.shape(h, [[-0.26 * u, -0.04], [0.26 * u, -0.06], [0.3 * u, 0.12], [0.22 * u, 0.26], [-0.22 * u, 0.28], [-0.3 * u, 0.12]], skin, 1, true);
      c.inside(fb);
      c.shape(h, [[-0.4, 0.14], [0.4, 0.14], [0.4, 0.4], [-0.4, 0.4]], SH, 0.18);
      c.end();
      for (var j = 0; j < 3; j++) { var x = (-0.12 + j * 0.12) * u; c.line(h, [[x, 0.0], [x, 0.24]], SH, h.s * 0.012, 0.38); }
      c.shape(h, [[0.2 * u, -0.02], [0.08 * u, -0.2], [-0.04 * u, -0.26], [-0.1 * u, -0.2], [0.0, -0.06]], mix(skin, HI, 0.08), 1, true);
    }
  };

  // Yonah: fisherman, about 24. Sun-darkened, short beard, sturdy, warm smile, sleeves
  // pushed up on a bare arm, a coil of rope over his far shoulder. Faded indigo tunic.
  draw.yonah = function (c) {
    var o = withFace({ skin: "#8b5a3a", lip: "#743e2d", brow: "#1d1611", jaw: 1.1, chin: 1.0, round: 0.05, open: 0.92, gaze: -0.16, crinkle: 0.8, smile: 0.7,
      browT: 1.18, arch: 0.8, browIn: 0.008, blush: 0.4, noseW: 1.15 });
    var f = frame(300, 230, 124, -0.015), b = frame(306, 230, 124, 0), B = bot(b);
    var bd = { color: "#221a14", e: 0.02, len: -0.03, tufts: 5, amp: 0.035, seed: 33, hi: "#5b4a3d",
      locks: [[[-0.5, 0.62], [-0.44, 0.8], [-0.34, 0.94], 0.04, 0.4], [[0.1, 0.7], [0.14, 0.84], [0.1, 0.96], 0.04, 0.3]] };
    neck(c, f, o.skin, 1.2);
    tunic(c, b, "#3d5b74", 1.08, 0.9);
    // Near arm: sleeve bunched above the elbow, bare forearm below.
    var arm = c.shape(b, [[1.6, 2.2], [2.16, 2.24], [2.24, 3.4], [2.27, B, 1], [1.58, B, 1], [1.56, 3.3]], o.skin, 1, true);
    c.inside(arm);
    c.shape(b, [[1.98, 2.2], [2.4, 2.2], [2.4, B], [2.04, B]], SH, 0.24);
    leaf(c, b, [1.66, 3.0], [1.74, 3.6], [1.72, 4.4], 0.06, SH, 0.2);
    c.end();
    c.shape(b, [[1.48, 1.95], [1.98, 1.84], [2.26, 2.1], [2.28, 2.5], [1.94, 2.62], [1.56, 2.6]], "#4a6a84", 1, true);
    leaf(c, b, [1.6, 2.22], [1.9, 2.18], [2.22, 2.3], 0.06, "#2c4458", 0.9);
    leaf(c, b, [1.62, 2.44], [1.92, 2.4], [2.2, 2.46], 0.05, "#2c4458", 0.8);
    head(c, f, o);
    beard(c, f, bd);
    mouth(c, f, o, bd);
    hair(c, f, { color: "#1e1712", lumps: 9, amp: 0.085, seed: 4, vol: 1.0, side: 0.12, hi: "#5d4a3c", curls: 10,
      line: [[0.14, -0.56], [0.02, -0.6], [-0.1, -0.56], [-0.22, -0.62], [-0.36, -0.58], [-0.5, -0.6], [-0.62, -0.46]] });
    // Coil of rope over the far shoulder: a bundle of loops, bound where it hangs.
    var rc = b(-1.4, 2.4), ring = "", mid = frame(rc[0], rc[1], 124, 0.3);
    for (var k = 0; k < 5; k++) {
      var r = frame(rc[0] + k * 4 - 8, rc[1] + k * 2.8 - 6, 124, 0.22 + k * 0.035);
      ring += curve(mapPts(r, ellPts(0, 0, 0.64 - k * 0.04, 0.94 - k * 0.045, 12, k * 0.5)), true);
    }
    var core = curve(mapPts(mid, ellPts(0, 0, 0.56, 0.85, 12)), true);
    c.add('<path d="' + core + '" fill="none" stroke="#4d3b24" stroke-width="34" opacity=".45"/>');
    c.add('<path d="' + ring + '" fill="none" stroke="#9c7d4f" stroke-width="10"/>');
    c.add('<path d="' + ring + '" fill="none" stroke="#c4a571" stroke-width="5"/>');

  };

  // Asher's face, shared by both poses: about 24, thinner, wry, guarded but kind eyes.
  function asherFace() {
    return withFace({ skin: "#a87b5c", lip: "#8a5141", brow: "#241b16", jaw: 0.94, chin: 1.0, hollow: 1, open: 0.84, gaze: -0.12, wry: 0.6,
      smile: 0.2, browIn: 0.012, browT: 0.95, arch: 0.9, tired: 0.3 });
  }
  var ASHER_BEARD = { color: "#2b211b", e: -0.01, len: -0.02, tufts: 6, amp: 0.04, seed: 12, hi: "#5d4c40",
    locks: [[[-0.55, 0.5], [-0.5, 0.7], [-0.4, 0.86], 0.04, 0.35], [[0.2, 0.5], [0.24, 0.66], [0.2, 0.84], 0.04, 0.3]] };
  function asherHead(c, f, o) {
    head(c, f, o);
    beard(c, f, ASHER_BEARD);
    mouth(c, f, o, ASHER_BEARD);
    hair(c, f, { color: "#251b16", lumps: 6, amp: 0.07, seed: 27, vol: 1.06, hi: "#6a5444",
      ear: [[0.96, 0.5], [0.92, 0.66, 1], [0.84, 0.52], [0.8, 0.64, 1], [0.74, 0.46], [0.8, 0.28], [0.8, 0.12], [0.72, 0.04], [0.6, 0.06], [0.5, 0.14], [0.47, 0.26, 1], [0.4, 0.06], [0.34, -0.2], [0.3, -0.44, 1]],
      line: [[0.16, -0.52], [0.02, -0.5], [-0.1, -0.38, 1], [-0.2, -0.52], [-0.34, -0.5], [-0.45, -0.4, 1], [-0.52, -0.54], [-0.64, -0.46]],
      locks: [[[-0.6, -0.76], [-0.3, -0.98], [0.05, -1.06], 0.05, 0.25], [[-0.46, -0.5], [-0.3, -0.64], [-0.1, -0.72], 0.04, 0.2], [[0.5, -0.8], [0.76, -0.56], [0.9, -0.2], 0.04, 0.16]] });
  }
  var ASHER_TUNIC = "#93604b", CLOAK = "#6b4f3b", CLOAK_HI = "#866650", CLOAK_FOLD = "#4e392b";

  // Lying back: seen from beside the bed and a little above, the bust reclines on a diagonal.
  // His head rests on a rolled pillow that frames it; the worn brown cloak is pulled up to
  // his chest like a blanket and falls over the side of the bed; one hand rests on it.
  function asherLying(c) {
    var o = asherFace(), PIL = "#d2c5a6", rot = -0.52;
    var b = frame(262, 318, 106, rot), f = b;
    var pil = c.shape(b, [[-1.66, -1.3], [0.0, -1.38], [1.8, -1.3], [2.02, -0.3], [1.86, 0.8], [0.0, 0.86], [-1.7, 0.8], [-1.92, -0.26]], PIL, 1, true);
    c.inside(pil);
    c.shape(b, [[-2.3, 0.32], [2.3, 0.32], [2.3, 1.2], [-2.3, 1.2]], SH, 0.16);
    c.shape(b, [[-2.3, -1.5], [2.3, -1.5], [2.3, -1.12], [-2.3, -1.12]], HI, 0.4);
    var bands = [-1.42, -1.26, 1.34, 1.5];
    for (var i = 0; i < 4; i++) c.shape(b, [[bands[i], -1.5, 1], [bands[i] + 0.08, -1.5, 1], [bands[i] + 0.08, 1.0, 1], [bands[i], 1.0, 1]], "#7a5a44", 0.8);
    // The head presses into the pillow: a soft shadow below and to the right of it.
    c.shape(b, [[0.5, -1.2], [1.04, -0.6], [1.12, 0.4], [0.86, 0.9], [0.2, 0.96], [0.62, 0.3], [0.8, -0.4]], SH, 0.2);
    c.end();
    c.shape(b, [[-1.92, -0.26], [-1.8, -1.0], [-1.66, -1.3], [-1.5, -0.26], [-1.62, 0.76], [-1.76, 0.6]], mix(PIL, SH, 0.16));
    neck(c, f, o.skin, 0.9);
    tunic(c, b, ASHER_TUNIC, 0.92, 0.9, 2.5);
    asherHead(c, f, o);
    // Cloak over him; it falls over the side of the bed on the right.
    var top = mapPts(b, [[-2.36, 2.12, 1], [-1.1, 1.95], [0.2, 2.05], [1.35, 1.93], [2.34, 2.08, 1]]);
    var low = mapPts(b, [[-2.5, 3.2], [-2.6, 4.6, 1]]);
    var cl = c.fill(curve([[330, 912, 1]].concat(low.reverse(), top, [[592, 440], [580, 560], [584, 700], [590, 912, 1]]), true), CLOAK, 1, true);
    c.inside(cl);
    c.shape(b, [[-2.5, 2.14], [-1.1, 1.97], [0.2, 2.07], [1.35, 1.95], [2.5, 2.1], [2.5, 2.36], [1.35, 2.17], [0.2, 2.29], [-1.1, 2.2], [-2.5, 2.4]], CLOAK_HI);
    c.shape(V, [[560, 380], [620, 380], [620, 912], [520, 912], [540, 600]], SH, 0.22);
    leaf(c, b, [-1.7, 2.45], [-1.8, 3.3], [-2.0, 4.4], 0.12, CLOAK_FOLD, 0.9);
    leaf(c, b, [-0.6, 2.45], [-0.66, 3.6], [-0.8, 5.0], 0.11, CLOAK_FOLD, 0.8);
    leaf(c, b, [0.6, 2.5], [0.62, 3.4], [0.5, 4.6], 0.1, CLOAK_FOLD, 0.8);
    leaf(c, V, [574, 520], [584, 700], [580, 900], 18, CLOAK_FOLD, 0.8);
    c.shape(b, [[-1.5, 2.85], [-1.06, 2.8], [-1.02, 3.3], [-1.46, 3.36]], "#5c4535");
    c.add('<path d="' + sm(b, [[-1.5, 2.85, 1], [-1.06, 2.8, 1], [-1.02, 3.3, 1], [-1.46, 3.36, 1]]) + '" fill="none" stroke="#a1825f" stroke-width="2" stroke-dasharray="4 6" opacity=".7"/>');
    c.end();
    // His near hand rests on the cloak, the wrist coming out from under its edge.
    var w = b(1.3, 2.3);
    hand(c, frame(w[0], w[1], 100, 2.25, true), mix(o.skin, SH, 0.04), true);
  }

  // Standing: upright for the first time, the same face, the cloak folded over his forearm.
  function asherStanding(c) {
    var o = asherFace();
    var f = frame(298, 226, 118, -0.02), b = frame(302, 226, 118, 0), B = bot(b);
    var skin = mix(o.skin, SH, 0.05);
    neck(c, f, o.skin, 0.9);
    tunic(c, b, ASHER_TUNIC, 0.92, 0.9);
    asherHead(c, f, o);
    // Near forearm across his waist; elbow-length sleeve; the hand at its end.
    c.shape(b, [[1.98, 2.56], [2.0, 3.0], [1.2, 2.98], [0.62, 2.94], [0.6, 2.66], [1.2, 2.64]], skin, 1, true);
    c.shape(b, [[1.6, 2.2], [2.04, 2.22], [2.1, 3.02], [1.66, 3.0]], mix(ASHER_TUNIC, SH, 0.1), 1, true);
    var w = b(0.72, 2.8);
    hand(c, frame(w[0], w[1], 100, Math.PI - 0.5, true), skin, true);
    // The folded cloak hangs over the forearm, both halves falling in front of him.
    var cl = c.shape(b, [[0.78, 2.7], [1.0, 2.56], [1.32, 2.52], [1.58, 2.58], [1.7, 2.76], [1.78, 3.4], [1.84, B, 1], [0.56, B, 1], [0.66, 3.4]], CLOAK, 1, true);
    c.inside(cl);
    c.shape(b, [[0.78, 2.7], [1.0, 2.56], [1.32, 2.52], [1.58, 2.58], [1.7, 2.76], [1.7, 2.92], [1.32, 2.76], [1.0, 2.78], [0.8, 2.9]], CLOAK_HI);
    c.shape(b, [[1.3, 2.4], [2.2, 2.4], [2.2, B], [1.36, B]], SH, 0.2);
    leaf(c, b, [0.86, 3.0], [0.92, 4.0], [0.84, 5.4], 0.12, CLOAK_FOLD, 0.9);
    leaf(c, b, [1.22, 3.0], [1.3, 4.2], [1.26, 5.6], 0.12, CLOAK_FOLD, 0.85);
    leaf(c, b, [1.58, 3.0], [1.66, 4.0], [1.64, 5.4], 0.1, CLOAK_FOLD, 0.8);
    c.end();
  }

  draw.asher = function (c, opts) {
    if (opts && opts.pose === "standing") asherStanding(c);
    else asherLying(c);
  };

  // Asher's mother: head covering, tired and tender, a clay water jar held at her side.
  draw.mother = function (c) {
    var o = withFace({ skin: "#a3714f", lip: "#9e5a52", brow: "#2e231d", jaw: 0.84, chin: 0.92, round: 0.32, open: 0.82, gaze: -0.14, tired: 0.7,
      browIn: 0.04, browT: 0.6, arch: 1.25, smile: 0.32, lash: 1.45, age: 0.3, blush: 0.7, nose: 0.94, noseW: 0.88, mouthW: 0.92, soft: 1 });
    var f = frame(296, 248, 112, -0.07), b = frame(300, 248, 112, 0), B = bot(b);
    var VE = "#6d4a58", VD = "#4f3441", WRAP = "#c7b896";
    // Veil behind the head.
    c.shape(b, [[-0.34, -1.12], [0.3, -1.16], [0.8, -0.95], [1.06, -0.5], [1.14, 0.2], [1.1, 0.8], [0.96, 1.62], [-0.86, 1.62], [-0.92, 0.7], [-0.9, -0.3], [-0.76, -0.86]], VD, 1, true);
    c.inner = true;
    neck(c, f, o.skin, 0.86);
    c.inner = false;
    tunic(c, b, "#86705a", 0.9, 0.8, 0, true);
    c.inner = true;
    head(c, f, o);
    mouth(c, f, o, null);
    c.inner = false;
    // Hair under the wrap: dark, one gray strand at the far temple.
    c.shape(f, [[-0.74, -0.62], [-0.4, -0.76], [0.1, -0.76], [0.36, -0.64], [0.38, -0.3], [0.2, -0.5], [-0.04, -0.58], [-0.14, -0.66, 1], [-0.26, -0.58], [-0.56, -0.5], [-0.665, -0.2, 1], [-0.75, -0.32]], "#3a2c24");
    leaf(c, f, [-0.7, -0.3], [-0.64, -0.46], [-0.48, -0.58], 0.04, "#9a8f83", 0.85);
    leaf(c, f, [-0.16, -0.7], [-0.38, -0.66], [-0.6, -0.56], 0.035, "#6b5646", 0.8);
    leaf(c, f, [-0.12, -0.7], [0.1, -0.66], [0.3, -0.56], 0.035, "#6b5646", 0.7);
    // Clay water jar held against her side, tucked under the edge of her veil.
    var jc = b(0.92, 3.02), j = frame(jc[0], jc[1], 120, 0.06);
    var jar = c.shape(j, [[-0.17, -0.9, 1], [0.17, -0.9, 1], [0.15, -0.66], [0.48, -0.5], [0.58, -0.1], [0.52, 0.4], [0.3, 0.8], [0.0, 0.92], [-0.3, 0.8], [-0.52, 0.4], [-0.58, -0.1], [-0.48, -0.5], [-0.15, -0.66]], "#a6603c", 1, true);
    c.inside(jar);
    c.shape(j, [[0.1, -0.9], [0.8, -0.6], [0.8, 1.0], [0.0, 1.0], [0.24, 0.2]], SH, 0.26);
    c.shape(j, [[-0.46, -0.44], [-0.2, -0.56], [-0.28, -0.1], [-0.5, 0.1]], HI, 0.22);
    c.add('<path d="' + curve(mapPts(j, [[-0.56, -0.2], [0.0, -0.12], [0.56, -0.2]]), false) + '" fill="none" stroke="#6e3a22" stroke-width="3" opacity=".5"/>');
    c.end();
    c.shape(j, [[-0.22, -0.96, 1], [0.22, -0.96, 1], [0.22, -0.86, 1], [-0.22, -0.86, 1]], "#b97350", 1, true);
    // Veil front: over the crown, down both sides of the face, over the shoulders. Its
    // undyed lining shows as a soft band along the face opening.
    var opening = [[-0.76, -0.62], [-0.44, -0.78], [0.0, -0.82], [0.4, -0.72], [0.52, -0.48], [0.5, 0.0], [0.52, 0.6], [0.6, 1.2], [0.86, 1.7]];
    var vd = c.shape(b, [
      [-0.9, B, 1], [-0.86, 2.6], [-0.78, 1.7], [-0.86, 0.9], [-0.86, 0.1], [-0.76, -0.62, 1], [-0.44, -0.78], [0.0, -0.82], [0.4, -0.72], [0.52, -0.48],
      [0.5, 0.0], [0.52, 0.6], [0.6, 1.2], [0.86, 1.7], [1.0, 2.6], [1.0, B, 1], [2.0, B, 1], [1.98, 2.6], [1.86, 1.84], [1.5, 1.5], [1.16, 1.2],
      [1.1, 0.5], [1.12, -0.1], [1.02, -0.66], [0.72, -1.04], [0.2, -1.22], [-0.36, -1.18], [-0.8, -0.92], [-0.98, -0.3], [-1.0, 0.5], [-1.08, 1.2],
      [-1.4, 1.52], [-1.64, 1.9], [-1.74, 2.6], [-1.78, B, 1]
    ], VE, 1, true);
    c.inside(vd);
    var lining = opening.slice();
    for (var i = opening.length - 1; i >= 0; i--) lining.push([opening[i][0] + (i > 3 ? 0.09 : 0.03), opening[i][1] - (i > 3 ? 0.0 : 0.09)]);
    c.shape(b, lining, WRAP);
    c.shape(b, opening.concat([[0.98, 1.66], [0.72, 1.2], [0.66, 0.6], [0.64, 0.0], [0.66, -0.5], [0.5, -0.9], [0.0, -1.02], [-0.46, -0.96], [-0.84, -0.72]]), VD, 0.45);
    c.shape(b, [[0.66, -0.3], [1.2, -0.6], [2.4, 1.7], [2.4, B], [1.5, B], [1.2, 3.0], [0.9, 1.7]], SH, 0.18);
    c.shape(b, [[-0.66, -1.0], [-0.1, -1.18], [0.5, -1.06], [0.3, -0.94], [-0.2, -0.98]], HI, 0.2);
    leaf(c, b, [0.8, -0.95], [1.0, -0.4], [1.04, 0.4], 0.08, VD, 0.8);
    leaf(c, b, [-1.2, 1.6], [-1.36, 2.6], [-1.4, 3.8], 0.1, VD, 0.85);
    leaf(c, b, [1.3, 1.6], [1.5, 2.4], [1.56, 3.6], 0.1, VD, 0.85);
    c.end();
  };

  // Asher's little brother: about 10, tousled hair, lively grin.
  draw.brother = function (c) {
    var o = withFace({ skin: "#ad7650", lip: "#9b5644", brow: "#2a1f18", jaw: 0.86, chin: 0.9, round: 0.45, open: 1.12, gaze: -0.2, browUp: 0.04,
      browIn: 0.012, browT: 0.8, arch: 1.2, smile: 0.85, part: 0.7, eye: 1.14, blush: 1.2, nose: 0.88, noseW: 0.9, mouthW: 0.95, soft: 0.6 });
    var f = frame(312, 352, 100, 0.07), b = frame(314, 352, 100, 0);
    neck(c, f, o.skin, 0.85);
    tunic(c, b, "#ad8a50", 0.82, 0.9);
    head(c, f, o);
    mouth(c, f, o, null);
    hair(c, f, { color: "#2a1f18", lumps: 7, amp: 0.1, seed: 44, tips: true, vol: 1.04, side: 0.14, hi: "#7a604a",
      line: [[0.16, -0.5], [0.04, -0.38, 1], [-0.06, -0.52], [-0.2, -0.4, 1], [-0.3, -0.54], [-0.44, -0.42, 1], [-0.52, -0.56], [-0.64, -0.44]],
      locks: [[[-0.6, -0.7], [-0.3, -0.96], [0.1, -1.04], 0.05, 0.3]] });
  };

  // Neighbor: an ordinary townsman, middle-aged, bringing news; head cloth, gray in the beard.
  draw.neighbor = function (c) {
    var o = withFace({ skin: "#9b6a45", lip: "#80463a", brow: "#2b231e", jaw: 1.06, round: 0.3, open: 1.04, gaze: -0.18, browUp: 0.045,
      browIn: 0.026, part: 0.5, smile: 0.05, age: 0.6, nose: 1.1, noseW: 1.2 });
    var f = frame(296, 236, 120, -0.02), b = frame(302, 236, 120, 0), B = bot(b);
    var bd = { color: "#2e2620", e: 0.04, len: 0.1, tufts: 5, amp: 0.045, seed: 52, hi: "#9b948a",
      locks: [[[-0.6, 0.5], [-0.56, 0.72], [-0.46, 0.92], 0.05, 0.6], [[-0.3, 0.8], [-0.26, 1.0], [-0.2, 1.12], 0.04, 0.5], [[0.16, 0.66], [0.2, 0.86], [0.14, 1.02], 0.04, 0.4]] };
    neck(c, f, o.skin, 1.1);
    tunic(c, b, "#7a5c44", 1.05, 0.8);
    // Gray-brown mantle over both shoulders, open in front.
    var mn = c.shape(b, [[-1.95, B, 1], [-1.9, 2.6], [-1.76, 1.86], [-1.3, 1.46], [-0.56, 1.3], [-0.5, 1.6], [-0.7, 2.6], [-0.6, B, 1],
      [0.8, B, 1], [0.86, 2.6], [0.62, 1.56], [0.58, 1.26], [1.42, 1.4], [2.0, 1.76], [2.12, 2.6], [2.16, B, 1]], "#8a7f70", 1, true);
    c.inside(mn);
    c.shape(b, [[0.6, 1.2], [2.4, 1.5], [2.4, B], [1.3, B], [1.1, 3.0]], SH, 0.16);
    leaf(c, b, [-1.3, 1.8], [-1.4, 2.8], [-1.42, 4.2], 0.1, "#6a6155", 0.9);
    leaf(c, b, [1.4, 1.8], [1.56, 2.8], [1.6, 4.2], 0.1, "#6a6155", 0.9);
    c.shape(b, [[-1.7, 1.9], [-1.2, 1.5], [-0.6, 1.36], [-0.9, 1.6], [-1.4, 1.9]], HI, 0.16);
    c.end();
    head(c, f, o);
    hair(c, f, { color: "#2c241e", side: 0.18 });
    beard(c, f, bd);
    mouth(c, f, o, bd);
    headcloth(c, f, { color: "#c4b28c" });
  };

  // Passerby: an ordinary person in the lane, a little in shadow, glancing sideways while
  // muttering. Still human and plain, never villainous.
  draw.passerby = function (c) {
    var o = withFace({ skin: "#976b4b", lip: "#7a473b", brow: "#262019", open: 0.86, gaze: -0.4, browIn: 0.006, smile: -0.12, part: 0.12, age: 0.5, sclera: "#d2c4aa", nose: 1.04 });
    var f = frame(300, 240, 118, -0.03), b = frame(304, 240, 118, 0), B = bot(b);
    var CL = "#5b4b3d", CD = "#3f342a";
    var bd = { color: "#3a3029", tufts: 4, amp: 0.035, seed: 61, hi: "#8a8076", locks: [[[-0.56, 0.5], [-0.5, 0.7], [-0.4, 0.88], 0.04, 0.4]] };
    c.shape(b, [[-0.36, -1.1], [0.3, -1.15], [0.78, -0.94], [1.02, -0.5], [1.08, 0.2], [1.04, 0.8], [0.92, 1.56], [-0.84, 1.56], [-0.88, 0.7], [-0.88, -0.3], [-0.76, -0.84]], CD, 1, true);
    c.inner = true;
    neck(c, f, o.skin, 1.0);
    c.inner = false;
    tunic(c, b, "#6e604e", 1.0, 0.8, 0, true);
    c.inner = true;
    head(c, f, o);
    beard(c, f, bd);
    mouth(c, f, o, bd);
    c.inner = false;
    // Head cloth pulled forward; its edge shades the brow.
    var hd = c.shape(b, [
      [-0.86, B, 1], [-0.8, 2.4], [-0.84, 1.4], [-0.84, 0.5], [-0.8, -0.2], [-0.72, -0.48, 1], [-0.4, -0.58], [0.0, -0.6], [0.3, -0.52], [0.44, -0.3],
      [0.5, 0.1], [0.54, 0.6], [0.62, 1.2], [0.8, 1.7], [0.9, 2.4], [0.9, B, 1], [2.04, B, 1], [2.0, 2.6], [1.9, 1.86], [1.5, 1.48], [1.12, 1.2], [1.06, 0.5],
      [1.08, -0.1], [0.98, -0.62], [0.7, -1.02], [0.2, -1.2], [-0.34, -1.16], [-0.78, -0.9], [-0.96, -0.36], [-1.0, 0.5], [-1.06, 1.2], [-1.4, 1.5],
      [-1.7, 1.9], [-1.8, 2.6], [-1.84, B, 1]
    ], CL, 1, true);
    c.inside(hd);
    c.shape(b, [[0.6, -0.3], [1.2, -0.6], [2.4, 1.7], [2.4, B], [1.4, B], [1.1, 3.0], [0.86, 1.7]], SH, 0.2);
    c.shape(b, [[-0.64, -0.92], [-0.1, -1.12], [0.5, -1.0], [0.3, -0.86], [-0.2, -0.9]], HI, 0.16);
    leaf(c, b, [-1.25, 1.7], [-1.4, 2.6], [-1.44, 3.8], 0.1, CD, 0.9);
    leaf(c, b, [1.36, 1.7], [1.54, 2.5], [1.6, 3.8], 0.1, CD, 0.9);
    leaf(c, b, [0.78, -0.9], [0.98, -0.4], [1.02, 0.3], 0.08, CD, 0.8);
    c.end();
    c.shape(f, [[-0.75, -0.5], [-0.4, -0.6], [0.0, -0.62], [0.42, -0.5], [0.46, -0.16], [0.0, -0.24], [-0.4, -0.22], [-0.7, -0.2]], "#10131c", 0.14);
    c.tints.push(["#1a1612", 0.1]);
  };

  // One member of a group: neck, tunic, head, beard, mouth, hair or head cloth. Faces use
  // the lite kit (fewer fine lines) to keep the file small.
  function member(c, x, y, R, m) {
    m.face.lite = true;
    var o = withFace(m.face);
    var f = frame(x, y, R, m.tilt || 0), b = frame(x + R * 0.05, y, R, 0);
    if (m.hood) hoodBack(c, b, m.hood);
    c.inner = !!m.hood;
    neck(c, f, o.skin, m.neck || 1);
    c.inner = false;
    tunic(c, b, m.tunic, m.k || 0.86, 0.8, 0, !!m.hood || m.back);
    c.inner = !!m.hood;
    head(c, f, o);
    if (!m.hood) hair(c, f, m.hair);
    if (m.beard) { m.beard.lite = true; beard(c, f, m.beard); }
    mouth(c, f, o, m.beard);
    c.inner = false;
    if (m.cloth) headcloth(c, f, m.cloth);
    if (m.hood) hoodFront(c, b, m.hood, m.k || 0.86, true);
    if (m.net) {
      // A fishing net bundled over the shoulder, cork floats along its edge.
      var nd = c.shape(b, [[0.66, 1.34], [1.3, 1.36], [1.72, 1.64], [1.86, 2.2], [1.84, 3.1], [1.62, 3.5], [1.44, 3.2], [1.26, 3.62], [1.04, 3.24], [0.86, 3.5], [0.74, 2.6]], "#cbb68c", 0.82, true);
      c.inside(nd);
      var g = "";
      for (var i = -8; i < 10; i++) {
        var p0 = b(0.6 + i * 0.17, 1.2), p1 = b(0.6 + i * 0.17 + 1.5, 3.8), p2 = b(0.6 + i * 0.17 + 1.5, 1.2), p3 = b(0.6 + i * 0.17, 3.8);
        g += "M" + nums(p0) + "L" + nums(p1) + "M" + nums(p2) + "L" + nums(p3);
      }
      c.add('<path d="' + g + '" stroke="#6e5c40" stroke-width="2" opacity=".6"/>');
      c.shape(b, [[1.4, 1.3], [2.2, 1.6], [2.2, 4.0], [1.5, 4.0]], SH, 0.22);
      c.end();
      c.shape(b, ellPts(0.92, 1.46, 0.11, 0.075, 8), "#a8743c", 1, true);
      c.shape(b, ellPts(1.44, 1.56, 0.11, 0.075, 8), "#a8743c", 1, true);
      c.shape(b, ellPts(1.8, 1.98, 0.075, 0.11, 8), "#96652f", 1, true);
    }
  }

  // Yonah's net partners, together in one image (number deliberately not emphasized).
  draw.partners = function (c) {
    member(c, 300, 214, 80, { back: true,
      face: { skin: "#9a6943", lip: "#80463a", brow: "#2b231e", open: 0.9, smile: 0.3, crinkle: 0.5, gaze: -0.2, age: 0.7, jaw: 1.04, noseW: 1.1 },
      tunic: "#c4b494", cloth: { color: "#b9a682" }, hair: { color: "#2c241e" },
      beard: { color: "#3a322b", e: 0.03, len: 0.1, tufts: 4, amp: 0.04, seed: 71, hi: "#a59d92", locks: [[[-0.5, 0.6], [-0.44, 0.8], [-0.34, 0.98], 0.05, 0.7], [[0.1, 0.7], [0.14, 0.9], [0.1, 1.04], 0.05, 0.6]] }
    });
    member(c, 172, 322, 88, {
      face: { skin: "#7c5034", lip: "#6c392b", brow: "#1d1611", open: 0.95, smile: 0.5, crinkle: 0.6, gaze: -0.18, jaw: 1.05, browT: 1.1, noseW: 1.15 },
      tunic: "#5a7262", hair: { color: "#1c1511", lumps: 8, amp: 0.08, seed: 15, line: [[0.14, -0.56], [-0.04, -0.6], [-0.2, -0.56], [-0.36, -0.62], [-0.54, -0.56], [-0.64, -0.44]], hi: "#5b4a3d", curls: 6 },
      beard: { color: "#1f1813", e: 0.0, len: -0.05, tufts: 4, amp: 0.03, seed: 73 }
    });
    member(c, 432, 330, 88, {
      face: { skin: "#8a5a3a", lip: "#74402f", brow: "#211a15", open: 0.9, smile: 0.25, gaze: -0.2, jaw: 1.1, nose: 1.06, browT: 1.1 },
      tunic: "#6d5440", cloth: { color: "#9c7d57", low: 0.06 }, hair: { color: "#211a15" }, net: true,
      beard: { color: "#211a15", e: 0.05, len: 0.12, tufts: 4, amp: 0.045, seed: 75, hi: "#5b4a3d", locks: [[[-0.5, 0.6], [-0.44, 0.84], [-0.34, 1.02], 0.05, 0.4]] }
    });
  };

  // Some of the scribes: mantles over their heads like Menahem's, composed and stern, not evil.
  draw.scribes = function (c) {
    var M1 = { cloth: "#e0d6be", dark: "#b8aa8d", inner: "#90836c", band: "#2f3442" };
    var M2 = { cloth: "#d6cbb0", dark: "#ae9f81", inner: "#867963", band: "#2f3442" };
    member(c, 304, 212, 80, { back: true,
      face: { skin: "#b07d55", lip: "#8e4c3c", brow: "#2a201a", open: 0.86, gaze: -0.12, browIn: -0.008, smile: -0.06, jaw: 0.98 },
      tunic: "#7d6a4c", hood: M2, k: 0.82, beard: { color: "#2a201a", e: -0.02, len: -0.02 }
    });
    member(c, 176, 320, 90, {
      face: { skin: "#a6744f", lip: "#86493a", brow: "#4a423b", open: 0.84, gaze: -0.14, browIn: -0.01, smile: -0.08, age: 1, hollow: 0.4, nose: 1.06 },
      tunic: "#8a6a3c", hood: M1, k: 0.84,
      beard: { color: "#6e665d", e: 0.05, len: 0.4, tufts: 4, amp: 0.05, seed: 81, hi: "#c2bbaf", locks: [[[-0.6, 0.5], [-0.54, 0.82], [-0.44, 1.12], 0.07, 0.8], [[-0.3, 0.8], [-0.24, 1.1], [-0.16, 1.38], 0.07, 0.8], [[0.06, 0.78], [0.1, 1.04], [0.06, 1.3], 0.06, 0.6]] }
    });
    member(c, 430, 328, 88, {
      face: { skin: "#8f6244", lip: "#7a4234", brow: "#211a15", open: 0.84, gaze: -0.14, browIn: -0.012, smile: -0.08, jaw: 1.06, nose: 1.08, noseW: 1.1, age: 0.4 },
      tunic: "#5e5444", hood: M2, k: 0.84,
      beard: { color: "#221b16", e: 0.04, len: 0.22, tufts: 4, amp: 0.045, seed: 83, hi: "#5f5046", locks: [[[-0.5, 0.6], [-0.44, 0.86], [-0.34, 1.1], 0.05, 0.4]] }
    });
  };

  // ---------------------------------------------------------------- public API

  // Optional washes so a figure sits in the scene's light: opts.light = "lamp" | "dusk" | "night".
  var LIGHT = { lamp: ["#4a2810", 0.2], dusk: ["#2c1a3a", 0.2], night: ["#0d1220", 0.3] };

  var FACING = {};
  for (var fi = 0; fi < IDS.length; fi++) FACING[IDS[fi]] = "left";

  BHS.portraits = {
    ids: IDS.slice(),
    // Every portrait looks toward screen-left; mirror with CSS scaleX(-1) to face right.
    facing: FACING,
    // render(id, { pose?: "standing"|"lying" (asher only, default "lying"),
    //              light?: "lamp"|"dusk"|"night" (optional wash to match the scene), uid?: string })
    // -> SVG string, or null for unknown ids (including "jesus", who is never drawn).
    render: function (id, opts) {
      var o = opts || {};
      if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(draw, id)) return null;
      var uid = typeof o.uid === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(o.uid) ? o.uid : (++renderCount).toString(36);
      PREC = 1;
      var c = new Ctx(id, uid);
      draw[id](c, o);
      if (typeof o.light === "string" && Object.prototype.hasOwnProperty.call(LIGHT, o.light)) c.tints.push(LIGHT[o.light]);
      return c.svg();
    }
  };
})();
