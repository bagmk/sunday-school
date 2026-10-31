/* Scene backgrounds for "Before He Stood", drawn as inline SVG strings.
   Owner: art agent. See docs/SPEC.md §5.6 (look), §6.6 (BG ids), §7 (guardrails).
   - Classic script, no modules, no fetch, no external assets, no SVG filters.
   - Square canvas (viewBox 0 0 1600 1600) with preserveAspectRatio "xMidYMid slice":
       16:9 screens (TV, laptop) see the band y 350..1250 at full width (text panel covers ~y 980+);
       portrait phones see the band x ~430..1170 at full height (text panel covers ~y 1040+).
     Every scene keeps its focal point in the shared area x 430..1170, y 450..950 and extends
     scenery sideways for landscape and upward for portrait.
   - Jesus is never drawn: crowd scenes only leave an empty, luminous space.
   - No cross-like silhouettes: boats have no masts or yards; poles carry draped nets only.
   - Ids inside each SVG are prefixed with the bg id plus a per-render counter, so any
     number of SVGs (even the same scene twice) can live in one page. */
(function () {
  "use strict";
  var BHS = (window.BHS = window.BHS || {});

  var W = 1600;
  var H = 1600;
  var MX = 800; // horizontal center of the canvas
  var IDS = ["black", "dawn_lamp", "shore_dawn", "asher_ceiling", "asher_home", "lane",
    "sky_carried", "crowd", "crowd_lying", "road_home", "doorway_evening", "lamp_night"];
  var renderCount = 0;

  // ---------------------------------------------------------------- utilities

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ri(v) { return Math.round(v); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Small deterministic PRNG (mulberry32) so every scene draws the same way each time.
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

  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbHex(c) {
    return "#" + ((1 << 24) | (clamp(ri(c[0]), 0, 255) << 16) | (clamp(ri(c[1]), 0, 255) << 8) | clamp(ri(c[2]), 0, 255)).toString(16).slice(1);
  }
  function mix(a, b, t) {
    var x = hexRgb(a), y = hexRgb(b);
    return rgbHex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]);
  }

  // Joins numbers for path data; a negative number needs no separator.
  function nums(arr) {
    var s = "";
    for (var i = 0; i < arr.length; i++) s += (i === 0 || arr[i] < 0 ? "" : " ") + arr[i];
    return s;
  }

  // Closed polygon with integer coordinates, written as relative moves to keep strings short.
  function poly(pts) {
    var x0 = ri(pts[0][0]), y0 = ri(pts[0][1]), px = x0, py = y0, out = [];
    for (var i = 1; i < pts.length; i++) {
      var x = ri(pts[i][0]), y = ri(pts[i][1]);
      out.push(x - px, y - py);
      px = x; py = y;
    }
    return "M" + nums([x0, y0]) + "l" + nums(out) + "z";
  }

  // Smooth curve through points (Catmull-Rom converted to cubic Beziers).
  function smooth(pts, closed) {
    var n = pts.length, d = "M" + nums([ri(pts[0][0]), ri(pts[0][1])]);
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
      d += "C" + nums([ri(p1[0] + (p2[0] - p0[0]) / 6), ri(p1[1] + (p2[1] - p0[1]) / 6),
        ri(p2[0] - (p3[0] - p1[0]) / 6), ri(p2[1] - (p3[1] - p1[1]) / 6), ri(p2[0]), ri(p2[1])]);
    }
    return d + (closed ? "z" : "");
  }

  // Ridge line across the whole canvas closed down to yBottom (hills, far shores).
  function ridge(rnd, y, amp, steps, yBottom) {
    var pts = [];
    for (var i = 0; i <= steps; i++) pts.push([-30 + ((W + 60) * i) / steps, y + (rnd() - 0.5) * 2 * amp]);
    return smooth(pts, false) + "L" + (W + 30) + " " + yBottom + "L-30 " + yBottom + "z";
  }

  // Element helpers.
  function path(d, fill, extra) { return '<path d="' + d + '" fill="' + fill + '"' + (extra || "") + "/>"; }
  function rect(x, y, w, h, fill, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"' + (extra || "") + "/>";
  }
  function full(fill, extra) { return '<rect width="1600" height="1600" fill="' + fill + '"' + (extra || "") + "/>"; }
  function ell(cx, cy, rx, ry, fill, extra) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"' + (extra || "") + "/>";
  }
  function op(v) { return ' opacity="' + v + '"'; }
  function line(d, color, width, extra) {
    return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round"' + (extra || "") + "/>";
  }

  function stops(list) {
    var s = "";
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      s += '<stop offset="' + st[0] + '" stop-color="' + st[1] + '"' +
        (st[2] !== undefined && st[2] !== 1 ? ' stop-opacity="' + st[2] + '"' : "") + "/>";
    }
    return s;
  }

  // ---------------------------------------------------------------- render context

  function Ctx(bg, uid) {
    this.bg = bg;
    this.pre = bg + "-" + uid + "-";
    this.rnd = prng(hash(bg));
    this.defs = [];
    this.body = [];
    this.names = {};
  }
  Ctx.prototype.id = function (name) { return this.pre + name; };
  Ctx.prototype.url = function (name) { return "url(#" + this.pre + name + ")"; };
  Ctx.prototype.def = function (s) { this.defs.push(s); };
  Ctx.prototype.add = function (s) { this.body.push(s); };
  // Gradient names are made unique within a scene, so two gradients can never collide.
  Ctx.prototype.fresh = function (name) {
    var n = this.names[name] = (this.names[name] || 0) + 1;
    return n === 1 ? name : name + n;
  };
  Ctx.prototype.lin = function (name, x1, y1, x2, y2, list) {
    name = this.fresh(name);
    this.def('<linearGradient id="' + this.id(name) + '" gradientUnits="userSpaceOnUse" x1="' + x1 + '" y1="' + y1 +
      '" x2="' + x2 + '" y2="' + y2 + '">' + stops(list) + "</linearGradient>");
    return this.url(name);
  };
  // Radial gradient; ry (optional) squashes it into an ellipse around its center.
  Ctx.prototype.rad = function (name, cx, cy, r, list, ry) {
    name = this.fresh(name);
    var tf = ry && ry !== r ? ' gradientTransform="translate(' + cx + " " + cy + ")scale(1 " + r2(ry / r) + ")translate(" + -cx + " " + -cy + ')"' : "";
    this.def('<radialGradient id="' + this.id(name) + '" gradientUnits="userSpaceOnUse" cx="' + cx + '" cy="' + cy + '" r="' + r + '"' +
      tf + ">" + stops(list) + "</radialGradient>");
    return this.url(name);
  };
  // Soft round light: a full-canvas rect filled with a radial falloff.
  Ctx.prototype.glow = function (name, cx, cy, r, color, alpha, ry, mid) {
    var m = mid === undefined ? 0.35 : mid;
    this.add(full(this.rad(name, cx, cy, r, [[0, color, alpha], [m, color, r2(alpha * 0.45)], [1, color, 0]], ry)));
  };
  // Clip path (cheap, no filters) used to keep stones inside their wall.
  Ctx.prototype.clip = function (name, d) {
    name = this.fresh(name);
    this.def('<clipPath id="' + this.id(name) + '"><path d="' + d + '"/></clipPath>');
    return this.url(name);
  };
  Ctx.prototype.vignette = function (color, alpha, cx, cy, r) {
    this.add(full(this.rad("vig", cx || MX, cy || 760, r || 1350, [[0, color, 0], [0.5, color, 0], [1, color, alpha]])));
  };
  // Cheap film grain: a deterministic speckle tile instead of feTurbulence.
  // light = relative strength of the pale specks (keep low in dark scenes).
  Ctx.prototype.grain = function (alpha, light) {
    var g = prng(91), dk = "", lt = "";
    for (var i = 0; i < 70; i++) {
      var x = r1(g() * 150), y = r1(g() * 150), s = r1(1.4 + g() * 1.1);
      var sq = "M" + x + " " + y + "h" + s + "v" + s + "h-" + s + "z";
      if (i % 2) dk += sq; else lt += sq;
    }
    this.def('<pattern id="' + this.id("grain") + '" width="150" height="150" patternUnits="userSpaceOnUse">' +
      path(dk, "#000", op(0.5)) + path(lt, "#fff", op(r2(0.4 * (light === undefined ? 1 : light)))) + "</pattern>");
    this.add(full(this.url("grain"), op(alpha)));
  };
  Ctx.prototype.svg = function () {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice" width="100%" height="100%"' +
      ' class="bhs-art" data-bg="' + this.bg + '" aria-hidden="true" focusable="false">' +
      (this.defs.length ? "<defs>" + this.defs.join("") + "</defs>" : "") + this.body.join("") + "</svg>";
  };

  // ---------------------------------------------------------------- shared builders

  // Fieldstone generator for basalt walls. Stones are laid in courses in wall-local units
  // (u along the wall, v down the wall) and mapped to the canvas by map(u, v) -> [x, y],
  // which lets the same code draw flat walls and walls in perspective.
  // o.tone(cx, cy, rnd, u, v) returns a tone index, or -1 to leave the stone in darkness.
  function stones(rnd, map, o) {
    var out = [], i;
    for (i = 0; i < o.n; i++) out.push("");
    var v = o.v0 - rnd() * o.ch[0] * 0.5;
    while (v < o.v1) {
      var ch = lerp(o.ch[0], o.ch[1], rnd());
      var u = o.u0 - rnd() * o.sw[1] * 0.8;
      while (u < o.u1) {
        var sw = lerp(o.sw[0], o.sw[1], rnd());
        var skip = rnd() < (o.skip || 0);
        if (!(o.keep && !o.keep(u + sw / 2, v + ch / 2))) {
          var g = o.gap, a = u + g, b = u + sw - g, t = v + g, e = v + ch - g, j = o.jit || 0;
          var k = Math.min(b - a, e - t), c1 = k * (0.12 + rnd() * 0.3), c2 = k * (0.08 + rnd() * 0.3);
          var pts = rnd() < 0.5
            ? [[a + c1, t], [b, t], [b, e - c2], [b - c2, e], [a, e], [a, t + c1]]
            : [[a, t], [b - c1, t], [b, t + c1], [b, e], [a + c2, e], [a, e - c2]];
          var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
          for (i = 0; i < pts.length; i++) {
            var p = map(pts[i][0] + (rnd() - 0.5) * j, pts[i][1] + (rnd() - 0.5) * j);
            pts[i] = p;
            if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
          }
          var visible = maxX > -10 && minX < W + 10 && maxY > -10 && minY < H + 10 && maxX - minX >= (o.minW || 0);
          // Skipped stones leave gaps; large (near) stones are never skipped so walls stay solid.
          if (skip && maxX - minX < (o.skipMaxW || 1e9)) visible = false;
          if (visible) {
            var ti = o.tone((minX + maxX) / 2, (minY + maxY) / 2, rnd, u, v);
            if (ti >= 0) out[clamp(ti, 0, o.n - 1)] += poly(pts);
          }
        }
        u += sw;
      }
      v += ch;
    }
    return out;
  }
  function addStones(c, list, tones) {
    for (var i = 0; i < list.length; i++) if (list[i]) c.add(path(list[i], tones[i]));
  }
  function flat(u, v) { return [u, v]; }

  // Herodian-style oil lamp seen from the side, nozzle to the left, flame at the nozzle tip.
  // (x, y) is the wick point, k the lamp scale, fh the flame height in canvas units
  // (0 = unlit). Returns { body, flame } strings so light can be layered between them.
  function oilLamp(c, x, y, fh, k, name) {
    var w = fh * 0.24, b = y, t = y - fh;
    var body = '<g transform="translate(' + x + " " + y + ")scale(" + k + ')">' +
      ell(61, 25, 52, 6, "#000", op(0.5)) +
      path("M30 4L7-3Q-4-4-3 3Q-2 9 8 10L33 15Z", c.lin(name + "n", 0, 0, 40, 0, [[0, "#c88a57"], [1, "#7a4b2f"]])) +
      path("M27 13C29-9 93-11 98 11C91 23 35 24 27 13Z", c.lin(name + "b", 25, 0, 99, 0, [[0, "#c98a56"], [0.45, "#94603c"], [1, "#4f3020"]])) +
      ell(61, -2, 8, 2.6, "#2a180e") +
      path("M96 6q9-2 10 4q-1 6-9 5z", "#5a3824") + "</g>";
    if (!fh) return { body: body, flame: "" };
    var flame =
      path("M" + x + " " + b + "C" + r1(x - w) + " " + r1(b - fh * 0.2) + " " + r1(x - w * 0.85) + " " + r1(b - fh * 0.56) + " " + x + " " + t +
        "C" + r1(x + w * 0.85) + " " + r1(b - fh * 0.56) + " " + r1(x + w) + " " + r1(b - fh * 0.2) + " " + x + " " + b + "Z",
        c.lin(name + "f", 0, b, 0, t, [[0, "#fff7df"], [0.35, "#ffd47e"], [1, "#f2902f", 0.85]])) +
      path("M" + x + " " + (b - 1) + "C" + r1(x - w * 0.5) + " " + r1(b - fh * 0.15) + " " + r1(x - w * 0.45) + " " + r1(b - fh * 0.38) + " " + x + " " + r1(b - fh * 0.6) +
        "C" + r1(x + w * 0.45) + " " + r1(b - fh * 0.38) + " " + r1(x + w * 0.5) + " " + r1(b - fh * 0.15) + " " + x + " " + (b - 1) + "Z", "#fffdf4") +
      ell(x, b - 1, r1(w * 0.55), r1(w * 0.3), "#6f8fd0", op(0.45));
    return { body: body, flame: flame };
  }

  // ---------------------------------------------------------------- scenes

  var scenes = {};

  scenes.black = function (c) {
    c.add(full("#090807"));
    c.glow("warm", MX, 720, 900, "#3a2614", 0.5, 760, 0.4);
    c.vignette("#000", 0.6);
    return c.svg();
  };

  // Menahem's room. Shared by dawn_lamp and lamp_night so both read as the same place.
  // Portrait band shows window, table and niche; landscape adds a storage jar and an inner door.
  function room(c, night) {
    var rnd = c.rnd, i;
    var wx = 990, wy = 828;                  // wick point of the lamp on the table
    var fh = night ? 30 : 46;                // flame height ("lower" at night)
    var gx = wx, gy = wy - fh * 0.5;         // light center
    var reach = night ? 470 : 620;

    c.add(full(night ? "#0a0b0d" : "#0e0f12"));

    // Back wall: fieldstones that only show where lamp or window light reaches them.
    var tones = night
      ? ["#141517", "#1b1b1c", "#25221f", "#302a24", "#3d342b", "#151a22", "#1a2029"]
      : ["#17181b", "#211f1f", "#2d2824", "#3c332b", "#4f4133", "#1c222c", "#26303c"];
    addStones(c, stones(rnd, flat, {
      u0: 0, u1: W, v0: 150, v1: 852, ch: [46, 70], sw: [72, 138], gap: 4, jit: 5, n: 7,
      tone: function (x, y, r) {
        var dx = x - gx, dy = (y - gy) * 1.2;
        var L = Math.pow(clamp(1 - Math.sqrt(dx * dx + dy * dy) / reach, 0, 1), 1.5);
        var wdx = x - 590, wdy = (y - 600) * 1.25, wd = Math.sqrt(wdx * wdx + wdy * wdy);
        if (L < 0.16 && wd < 250 && r() < 0.85) return wd < 150 ? 6 : 5;
        if (L < 0.08 && r() < 0.8) return -1;
        return clamp(Math.floor(L * 5 + (r() - 0.5) * 1.1), 0, 4);
      }
    }), tones);

    // Ceiling: dark reeds above a heavy wall-plate beam (portrait only).
    c.add(rect(0, 0, W, 104, "#09090a"));
    c.add(path("M0 100L1600 92V140L0 148Z", night ? "#211913" : "#291f18"));
    c.add(path("M0 141L1600 133V144L0 152Z", night ? "#2b2118" : "#3a2b1f"));

    // Small high window: deep basalt reveal; its sky is drawn after the lamplight.
    c.add(path("M486 498L682 494V522L486 526Z", night ? "#221a13" : "#2b2018"));
    c.add(path("M486 518L682 514V522L486 526Z", night ? "#302419" : "#463428"));
    c.add(path(poly([[500, 522], [536, 527], [536, 674], [500, 690]]), night ? "#171c25" : "#353e4c"));
    c.add(path(poly([[500, 690], [668, 690], [668, 674], [536, 674]]), night ? "#1c2230" : "#56657a"));
    c.add(path(poly([[500, 522], [668, 520], [668, 527], [536, 527]]), night ? "#11151c" : "#28303b"));
    c.glow("win", 600, 610, 300, night ? "#5b74a0" : "#86a2c8", night ? 0.07 : 0.2);

    // Wall niche with two rolled scrolls.
    c.add(path(poly([[1018, 540], [1140, 538], [1140, 558], [1018, 560]]), night ? "#2a241e" : "#383029"));
    c.add(rect(1026, 558, 106, 124, "#09090a"));
    c.add(rect(1042, 620, 78, 20, night ? "#56462f" : "#6f5c41", ' rx="9"'));
    c.add(rect(1036, 640, 86, 22, night ? "#625138" : "#7f6a4c", ' rx="10"'));
    c.add(ell(1047, 630, 5, 9, night ? "#94805c" : "#b9a27a"));
    c.add(ell(1041, 651, 5, 10, night ? "#a08a64" : "#c8b088"));

    // Landscape extras: a doorway to the inner room and a storage jar, both in shadow.
    c.add(path("M1306 540L1486 536V562L1306 566Z", night ? "#1d1610" : "#261c14"));
    c.add(rect(1320, 562, 152, 286, "#050506"));
    c.add(path("M232 852C204 790 214 726 252 700C246 690 250 682 262 680H318C330 682 334 690 328 700C366 726 376 790 348 852Z",
      c.lin("sjar", 214, 0, 376, 0, [[0, "#141313"], [0.75, night ? "#1d2029" : "#262c38"], [1, "#151517"]])));

    // Floor.
    c.add(rect(0, 846, W, 754, c.lin("floor", 0, 846, 0, 1400, [[0, night ? "#14110f" : "#191511"], [1, "#090807"]])));
    c.add(rect(0, 846, W, 3, "#000", op(0.4)));

    // Low table with a deep top so the scroll reads clearly.
    c.add(path(poly([[576, 796], [1144, 796], [1202, 902], [518, 902]]),
      c.lin("top", 518, 0, 1202, 0, [[0, night ? "#20170f" : "#271c13"], [0.68, night ? "#4a3523" : "#5e432a"], [1, night ? "#33251a" : "#3e2c1d"]])));
    c.add(rect(518, 902, 684, 26, "#1c130c"));
    c.add(rect(536, 928, 28, 78, "#130d08"));
    c.add(rect(1156, 928, 28, 78, "#130d08"));
    c.add(ell(860, 1008, 360, 18, "#000", op(0.5)));

    var ln = "";
    if (!night) {
      // Open scroll: parchment between two rolled ends, faint ruled columns (no letters).
      c.add(path(poly([[684, 808], [916, 808], [944, 884], [654, 884]]),
        c.lin("sheet", 654, 0, 944, 0, [[0, "#bfa47a"], [0.7, "#ead6ab"], [1, "#f3e2b9"]])));
      for (i = 0; i < 8; i++) {
        var y = lerp(816, 876, i / 7), f = (y - 808) / 76;
        var xl = lerp(684, 654, f) + 18, xr = lerp(916, 944, f) - 18, mid = (xl + xr) / 2;
        ln += "M" + ri(xl) + " " + ri(y) + "h" + ri((mid - 10 - xl) * (i === 7 ? 0.5 : 0.86 + rnd() * 0.14)) +
          "M" + ri(mid + 10) + " " + ri(y) + "h" + ri((xr - mid - 10) * (0.78 + rnd() * 0.22));
      }
      c.add(line(ln, "#6b563b", 2, op(0.42)));
      c.add(path("M641 882L672 802Q683 799 692 810L667 892Q650 895 641 882Z", "#a3855a"));
      c.add(ell(654, 888, 14, 6, "#d6bf91"));
      c.add(path("M957 882L926 802Q915 799 906 810L931 892Q948 895 957 882Z", "#b8996b"));
      c.add(ell(944, 888, 14, 6, "#ead29f"));
    } else {
      // Notes for the night: a closed scroll, loose sheets, ink and a reed pen.
      c.add(rect(618, 800, 196, 18, "#7a6446", ' rx="9"'));
      c.add(ell(622, 809, 5, 9, "#b0976c"));
      c.add(path(poly([[680, 826], [796, 820], [806, 868], [676, 876]]), "#b39a73"));
      c.add(path(poly([[770, 834], [890, 840], [880, 888], [758, 882]]), "#cbb58c"));
      for (i = 0; i < 5; i++) {
        var yy = 848 + i * 8;
        ln += "M" + (776 - i) + " " + yy + "l" + ri(80 + rnd() * 18 - (i === 4 ? 40 : 0)) + " 3";
      }
      c.add(line(ln, "#5d4a35", 1.6, op(0.5)));
      c.add(line("M820 896L940 872", "#6e5638", 3.4));
      c.add(rect(924, 832, 26, 26, "#1b1714"));
      c.add(ell(937, 832, 13, 4, "#2e2721"));
      c.add(ell(937, 832, 8, 2.4, "#070606"));
    }

    var lamp = oilLamp(c, wx, wy, fh, 1.35, "lamp");
    c.add(lamp.body);

    // Lamplight on the wall, the table and the floor.
    c.add(full(c.rad("light", gx, gy, reach, night
      ? [[0, "#ffbf72", 0.42], [0.12, "#f0a050", 0.24], [0.4, "#b86a2c", 0.08], [1, "#6a3d18", 0]]
      : [[0, "#ffd08c", 0.5], [0.12, "#f5ae5e", 0.3], [0.4, "#c77a33", 0.11], [1, "#7a4a1f", 0]], reach * 0.9)));

    // Sky through the window stays cool (drawn after the warm light).
    c.add(rect(536, 527, 132, 147, c.lin("sky", 0, 527, 0, 674, night
      ? [[0, "#04070d"], [0.6, "#0b1222"], [1, "#141d31"]]
      : [[0, "#192846"], [0.5, "#34507a"], [0.85, "#829db6"], [1, "#b3b2a6"]])));
    c.add(path("M536 654L600 649L668 645V674H536Z", night ? "#020305" : "#0d1119"));
    c.add(rect(640, 637, 11, 9, night ? "#020305" : "#0d1119"));
    c.add(ell(648, 552, 1.8, 1.8, "#eef2f9", op(night ? 0.9 : 0.7)));
    if (night) c.add(ell(576, 586, 1.3, 1.3, "#dfe6f2", op(0.7)));

    // Flame and halo on top.
    c.glow("halo", wx, ri(wy - fh * 0.55), night ? 66 : 92, "#fff0c8", night ? 0.7 : 0.85, 0, 0.3);
    c.add(lamp.flame);

    c.vignette("#000", night ? 0.85 : 0.75, gx - 100, gy - 40, night ? 1100 : 1250);
    c.grain(0.35, 0.25);
    return c.svg();
  }
  scenes.dawn_lamp = function (c) { return room(c, false); };
  scenes.lamp_night = function (c) { return room(c, true); };

  // Narrow lane of black basalt houses sloping down to the lake, late morning.
  // Drawn with a simple pinhole camera so stones, steps and shadows share one perspective.
  scenes.lane = function (c) {
    var rnd = c.rnd;
    var F = 900, CY = 600, EYE = 1.6, G = 0.11;
    var XL = -1.55, XR = 1.5, ZN = 1.0, ZEND = 13.5;
    function fl(z) { return -G * z; }
    function P(x, y, z) { return [MX + (F * x) / z, CY - (F * (y - EYE)) / z]; }
    function Pf(x, z) { return P(x, fl(z), z); }
    var i, z;

    // Sky, far hills, lake.
    c.add(rect(0, 0, W, 606, c.lin("sky", 0, 0, 0, 600, [[0, "#6894b9"], [0.55, "#a6c3d4"], [1, "#e1e8e3"]])));
    c.add(path(ridge(rnd, 586, 6, 9, 606), "#b3bfc2"));
    c.add(path(ridge(rnd, 594, 4, 12, 606), "#95a5ad"));
    var shoreY = Pf(0, 26)[1];
    c.add(rect(0, 600, W, ri(shoreY - 596), c.lin("lake", 0, 600, 0, ri(shoreY), [[0, "#b4cad0"], [0.18, "#86abbb"], [1, "#4f7f97"]])));
    var gl = "";
    for (i = 0; i < 18; i++) {
      var gy = 606 + Math.pow(rnd(), 1.4) * (shoreY - 616), gw = 6 + (rnd() * 26 * (gy - 590)) / 100;
      gl += "M" + ri(690 + rnd() * 210) + " " + ri(gy) + "h" + ri(gw);
    }
    c.add(line(gl, "#f6f3e8", 2.2, op(0.7)));

    // Open shore at the bottom of the slope and a beached boat (no mast).
    c.add(path(poly([Pf(-30, 26), Pf(30, 26), Pf(30, ZEND), Pf(-30, ZEND)]), "#dccba7"));
    c.add(rect(0, ri(shoreY) - 1, W, 3, "#f2f0e6", op(0.8)));
    var b0 = P(-0.7, fl(22) + 0.75, 22), b1 = P(1.0, fl(22) + 0.75, 22), bb = Pf(0.15, 22);
    c.add(path("M" + ri(b0[0] - 6) + " " + ri(b0[1] - 5) + "Q" + ri(bb[0]) + " " + ri(b0[1] + 6) + " " + ri(b1[0] + 6) + " " + ri(b1[1] - 7) +
      "L" + ri(b1[0] - 4) + " " + ri(bb[1] - 6) + "Q" + ri(bb[0]) + " " + ri(bb[1] + 3) + " " + ri(b0[0] + 6) + " " + ri(bb[1] - 5) + "Z", "#3e3129"));
    c.add(path(poly([[b0[0] - 5, b0[1] - 5], [b1[0] + 5, b1[1] - 7], [b1[0] + 3, b1[1] - 2], [b0[0] - 3, b0[1]]]), "#7a6450"));

    // Houses: [z0, z1, height]. Roofs step down with the slope.
    var left = [[1.0, 5.6, 3.55], [5.6, 9.8, 3.3], [9.8, ZEND, 2.3]];
    var right = [[1.0, 4.9, 3.6], [4.9, 9.2, 3.25], [9.2, ZEND, 2.35]];

    function wall(x, houses, lit) {
      var tones = lit ? ["#4b4944", "#58554f", "#66625a", "#747066", "#848075"] : ["#24272c", "#2a2e33", "#30353b", "#383d43"];
      for (var h = 0; h < houses.length; h++) {
        var z0 = houses[h][0], z1 = houses[h][1], top = fl(z0) + houses[h][2];
        c.add(path(poly([P(x, top, z0), P(x, top, z1), Pf(x, z1), Pf(x, z0)]), lit ? "#3a3733" : "#1c1f23"));
        (function (topY) {
          addStones(c, stones(rnd, function (u, v) { return P(x, topY - v, u); }, {
            u0: z0, u1: z1, v0: 0.26, v1: houses[h][2] + G * (z1 - z0) + 0.2, ch: [0.26, 0.4], sw: [0.45, 0.9],
            gap: 0.035, jit: 0.05, n: tones.length, skip: lit ? 0.14 : 0.42, skipMaxW: 70, minW: 5,
            keep: function (u, v) { return topY - v > fl(u) - 0.1; },
            tone: function (cx, cy, r, u, v) {
              var t = r() * tones.length;
              if (lit && v < 0.9) t += 0.8;
              return Math.floor(t);
            }
          }), tones);
        })(top);
        // Roof edge band (packed mud over reeds) and short protruding beam ends.
        c.add(path(poly([P(x, top + 0.04, z0), P(x, top + 0.04, z1), P(x, top - 0.26, z1), P(x, top - 0.26, z0)]), lit ? "#6f6253" : "#2a2927"));
        if (z0 < 9.5) {
          var be = "", bl = "", dx = lit ? -0.17 : 0.17;
          for (z = z0 + 0.5; z < z1 - 0.3; z += 1.1) {
            be += poly([P(x, top - 0.1, z), P(x + dx, top - 0.1, z), P(x + dx, top - 0.22, z), P(x, top - 0.22, z)]);
            bl += poly([P(x + dx, top - 0.1, z), P(x + dx, top - 0.1, z + 0.12), P(x + dx, top - 0.22, z + 0.12), P(x + dx, top - 0.22, z)]);
          }
          c.add(path(be, lit ? "#4a3a2a" : "#1c1712"));
          c.add(path(bl, lit ? "#9c8463" : "#2e2720"));
        }
      }
    }
    wall(XL, left, false);
    wall(XR, right, true);

    // Doorway in the sunlit wall, with a wooden lintel and a clay jar beside it.
    var dz0 = 3.9, dz1 = 4.65, dtop = fl(dz0) + 1.62;
    c.add(path(poly([P(XR, dtop, dz0), P(XR, dtop, dz1), Pf(XR, dz1), Pf(XR, dz0)]),
      c.lin("door", 0, 620, 0, 1000, [[0, "#191817"], [1, "#2b2926"]])));
    c.add(path(poly([P(XR, dtop + 0.16, dz0 - 0.15), P(XR, dtop + 0.16, dz1 + 0.12), P(XR, dtop, dz1 + 0.12), P(XR, dtop, dz0 - 0.15)]), "#5b4733"));
    var jz = 3.45, jx = 1.22, jb = Pf(jx, jz), jt = P(jx, fl(jz) + 0.62, jz), jw = (F * 0.19) / jz;
    c.add(path("M" + ri(jb[0] - jw * 0.55) + " " + ri(jb[1]) + "C" + ri(jb[0] - jw * 1.25) + " " + ri(lerp(jb[1], jt[1], 0.5)) + " " +
      ri(jb[0] - jw * 0.9) + " " + ri(jt[1] + 8) + " " + ri(jb[0] - jw * 0.32) + " " + ri(jt[1]) + "H" + ri(jb[0] + jw * 0.32) + "C" +
      ri(jb[0] + jw * 0.9) + " " + ri(jt[1] + 8) + " " + ri(jb[0] + jw * 1.25) + " " + ri(lerp(jb[1], jt[1], 0.5)) + " " + ri(jb[0] + jw * 0.55) + " " + ri(jb[1]) + "Z",
    c.lin("jar", jb[0] - jw, 0, jb[0] + jw, 0, [[0, "#c27a4e"], [0.5, "#9a5c3a"], [1, "#5e3622"]])));

    // Lane floor: sunlit limestone dust with shallow steps; the left houses shade part of it.
    c.add(path(poly([Pf(XL, ZN), Pf(XL, ZEND), Pf(XR, ZEND), Pf(XR, ZN)]),
      c.lin("lanef", 0, 800, 0, 1500, [[0, "#e2d3b2"], [1, "#c9b48c"]])));
    var cob = "";
    for (i = 0; i < 26; i++) {
      z = 1.6 + Math.pow(rnd(), 1.5) * 7;
      var cx0 = lerp(XL + 0.15, XR - 0.15, rnd()), a = 0.04 + rnd() * 0.06, b2 = 0.03 + rnd() * 0.05;
      cob += poly([Pf(cx0 - a, z), Pf(cx0, z - b2), Pf(cx0 + a, z), Pf(cx0 + a * 0.6, z + b2), Pf(cx0 - a * 0.7, z + b2)]);
    }
    c.add(path(cob, "#bfae8c"));
    var stepD = "", stepL = "";
    for (z = 2.6; z < 13; z += 1.05) {
      stepD += poly([Pf(XL, z), Pf(XR, z), P(XR, fl(z) - 0.08, z), P(XL, fl(z) - 0.08, z)]);
      stepL += poly([P(XL, fl(z) + 0.01, z - 0.03), P(XR, fl(z) + 0.01, z - 0.03), Pf(XR, z), Pf(XL, z)]);
    }
    c.add(path(stepD, "#b7a586"));
    c.add(path(stepL, "#f1e7cf", op(0.55)));
    var sh = [Pf(XL, ZN)];
    for (i = 0; i < left.length; i++) {
      var hh = left[i][2], e = 0.26 * hh, d = 0.5 * hh;
      if (i === 0) sh.push(Pf(XL + e, ZN));
      sh.push(Pf(XL + e, Math.max(ZN, left[i][0] - d)), Pf(XL + e, left[i][1] - d));
    }
    sh.push(Pf(XL, ZEND));
    c.add(path(poly(sh), "#58606a", op(0.5)));

    // Haze that makes the bottom of the slope glow, light vignette and grain.
    c.glow("haze", 805, 660, 420, "#fffaf0", 0.34, 300);
    c.vignette("#1a1c20", 0.35, MX, 700, 1300);
    c.grain(0.3, 0.5);
    return c.svg();
  };

  // ---------------------------------------------------------------- crowd figures

  // Figure templates in local units: head radius 1, head center at the origin, feet at y = 14.5.
  // Fill comes from the <use> element; "color" sets hair (back views) or skin (front views).
  // Faces never get features: a skin oval, a hair or hood shadow, sometimes a beard shadow.
  function crowdDefs(c) {
    // Soft shading toward the feet (local units, so it scales with each figure).
    var grad = c.lin("fsh", 0, 2, 0, 14.5, [[0, "#000", 0], [1, "#000", 0.32]]);
    // Base shapes are defined once and reused by every template.
    function ref(name, extra) { return '<use href="#' + c.id(name) + '"' + (extra || "") + "/>"; }
    c.def('<path id="' + c.id("sb") + '" d="M-.45.8Q-1.75 1-2.05 2.1L-2.3 7.2Q-2.32 8.1-2.05 8.6L-2.25 14.5H2.25L2.05 8.6Q2.32 8.1 2.3 7.2L2.05 2.1Q1.75 1 .45.8Z"/>');
    c.def('<path id="' + c.id("sm") + '" d="M0-1.25C1.25-1.25 1.32.4 1.15 1.1Q2.2 1.4 2.35 2.6L2.5 10.1Q0 10.9-2.5 10.1L-2.35 2.6Q-2.2 1.4-1.15 1.1C-1.32.4-1.25-1.25 0-1.25Z"/>');
    c.def('<path id="' + c.id("st") + '" d="M-2.05 9.6H2.05L2.2 14.5H-2.2Z"/>');
    var body = ref("sb") + ref("sb", ' fill="' + grad + '"') +
      path("M-2.05 2.3L-2.28 7.4Q-1.9 7.9-1.55 7.6L-1.45 3ZM2.05 2.3L2.28 7.4Q1.9 7.9 1.55 7.6L1.45 3Z", "#000", op(0.13)) +
      path("M-2.25 6.9H2.25V7.35H-2.25Z", "#000", op(0.22));
    // Mantle over the head down to the knees, darker tunic below.
    var hood = ref("st") + ref("st", ' fill="#000" opacity=".3"') + ref("sm") + ref("sm", ' fill="' + grad + '"') +
      path("M-.5 3.2L-.8 10.3H-.42L-.2 3.4Z", "#000", op(0.12));
    var sLight = path("M-.45.8Q-1.75 1-2.05 2.1Q-1.5 1.45-.3 1.25ZM.45.8Q1.75 1 2.05 2.1Q1.5 1.45.3 1.25Z", "#fff", op(0.18));
    var hLight = path("M-1.05-.55C-.95-1.32.95-1.32 1.05-.55C.7-1.02-.7-1.02-1.05-.55ZM-1.15 1.1Q-2.2 1.4-2.35 2.6Q-1.7 1.75-1 1.45ZM1.15 1.1Q2.2 1.4 2.35 2.6Q1.7 1.75 1 1.45Z", "#fff", op(0.2));
    function g(name, inner) { c.def('<g id="' + c.id(name) + '">' + inner + "</g>"); }
    // Back views.
    g("fb", body + sLight + '<ellipse rx=".9" ry="1.05" fill="currentColor"/>' +
      path("M-.72-.5C-.55-1.12.55-1.12.72-.5C.4-.82-.4-.82-.72-.5Z", "#fff", op(0.22)));
    g("fh", hood + hLight);
    // Front views.
    g("fa", body + sLight + '<ellipse cy=".05" rx=".85" ry="1.02" fill="currentColor"/>' +
      path("M-.88-.05C-.98-1.3.98-1.3.88-.05C.62-.62-.62-.62-.88-.05Z", "#000", op(0.6)) +
      path("M-.72.38Q-.62 1.16 0 1.22Q.62 1.16.72.38Q.36.72 0 .74Q-.36.72-.72.38Z", "#000", op(0.4)));
    g("fc", hood + '<ellipse cy=".2" rx=".62" ry=".8" fill="currentColor"/>' +
      path("M-.66.06Q0-.52.66.06Q.5-.38 0-.44Q-.5-.38-.66.06Z", "#000", op(0.35)) + hLight);
    // Scribe: pale mantle drawn over the head with dark bands near the hem, tunic below.
    g("fs", path("M-2.2 9.5H2.2L2.35 14.5H-2.35Z", "#8f918c") +
      '<g transform="scale(1.03 1.01)">' + ref("sm") + ref("sm", ' fill="' + grad + '"') + "</g>" +
      path("M-2.57 9.2Q0 9.85 2.57 9.2L2.58 9.6Q0 10.25-2.58 9.6ZM-2.53 8.4Q0 9 2.53 8.4L2.54 8.7Q0 9.3-2.54 8.7Z", "#2d3340") +
      path("M-2.62 10.1l.16 1.2h.24l-.06-1.15ZM2.62 10.1l-.16 1.2h-.24l.06-1.15Z", "#efe9da") +
      path("M-1.1-.6C-1-1.38 1-1.38 1.1-.6C.75-1.08-.75-1.08-1.1-.6ZM-1.2 1.1Q-2.25 1.4-2.4 2.6Q-1.75 1.75-1 1.45ZM1.2 1.1Q2.25 1.4 2.4 2.6Q1.75 1.75 1 1.45Z", "#fff", op(0.3)));
  }
  function useFig(c, kind, x, y, sx, sy, fill, color) {
    var p = Math.abs(sy) < 9 ? r1 : ri;
    return '<use href="#' + c.id(kind) + '" transform="translate(' + p(x) + " " + p(y) + ")scale(" + r2(sx) + " " + r2(sy) + ')" fill="' + fill + '"' +
      (color ? ' color="' + color + '"' : "") + "/>";
  }

  var CLOTH = ["#b7a785", "#6e5642", "#45506a", "#7b4536", "#a3824e", "#5d6243", "#3d3b38", "#c9bea6", "#8a6f55", "#5a4c5e", "#94846a"];
  var HAIR = ["#2b231d", "#3a2c22", "#1f1b18", "#4a3a2c"];
  var SKIN = ["#b07a55", "#9c6a49", "#c08a63", "#8a5c3f"];

  // Open ground at the edge of town near the shore, noon. Seen from a slight rise: a dense ring
  // of people frames an empty, brighter clearing; the scribes stand at its front-left edge.
  // The clearing holds only light (Jesus is never drawn); the crowd is parted toward his boat.
  scenes.crowd = function (c) {
    var rnd = c.rnd, wr = prng(4242), i, t, x, z;
    var F = 1100, HZ = 400, CAM = 2.5;
    var ZC = 8.4, RX = 1.75, RZ = 1.95;
    function X(px, pz) { return MX + (F * px) / pz; }
    function Y(py, pz) { return HZ + (F * (CAM - py)) / pz; }
    function ed(px, pz) { var a = px / RX, b = (pz - ZC) / RZ; return Math.sqrt(a * a + b * b); }
    var shoreY = Y(0, 36);

    // Noon sky with glare and thin high cloud, the far shore, the lake.
    c.add(rect(0, 0, W, HZ + 10, c.lin("sky", 0, 0, 0, HZ, [[0, "#98b9cf"], [0.65, "#cad9df"], [1, "#efeee6"]])));
    c.glow("glare", MX, -80, 950, "#fffef8", 0.55, 420);
    c.add(path("M180 220Q520 196 900 214Q620 232 180 220ZM860 300Q1160 284 1480 296Q1200 312 860 300Z", "#ffffff", op(0.4)));
    c.add(path(ridge(rnd, HZ - 14, 6, 10, HZ + 6), "#bcc5c6"));
    c.add(path(ridge(rnd, HZ - 6, 4, 14, HZ + 6), "#a8b4b7"));
    c.add(rect(0, HZ, W, ri(shoreY - HZ + 4), c.lin("lake", 0, HZ, 0, ri(shoreY), [[0, "#c4d3d5"], [1, "#8eafbd"]])));
    var gl = "";
    for (i = 0; i < 26; i++) gl += "M" + ri(rnd() * W) + " " + ri(HZ + 4 + rnd() * (shoreY - HZ - 10)) + "h" + ri(10 + rnd() * 30);
    c.add(line(gl, "#ffffff", 2.2, op(0.75)));

    // Edge of town on the left: low basalt houses near the shore, softened by noon haze.
    function house(x0, x1, z0, z1, h) {
      var a = [X(x0, z0), Y(h, z0)], b = [X(x1, z0), Y(h, z0)], b2 = [X(x1, z0), Y(0, z0)], a2 = [X(x0, z0), Y(0, z0)];
      var s1 = [X(x1, z1), Y(h, z1)], s2 = [X(x1, z1), Y(0, z1)];
      c.add(path(poly([b, s1, s2, b2]), "#7a7a79"));
      c.add(path(poly([a, b, b2, a2]), "#5b5f63"));
      // Roof edge of packed mud with a few beam ends under it, and a small dark doorway.
      c.add(path(poly([[a[0] - 4, a[1] - 5], [s1[0] + 2, s1[1] - 4], [s1[0], s1[1] + 3], [a[0], a[1] + 3]]), "#7d7466"));
      var be = "";
      for (var bx = x0 + 0.4; bx < x1 - 0.2; bx += 0.9) be += "M" + ri(X(bx, z0)) + " " + ri(a[1] + 3) + "h4v4h-4z";
      c.add(path(be, "#2a2622"));
      var dx = lerp(a[0], b[0], 0.62), dw = (F * 0.45) / z0, dh = (F * 1.5) / z0;
      c.add(rect(ri(dx), ri(a2[1] - dh), ri(dw), ri(dh), "#25272a"));
    }
    house(-12, -7.6, 29, 33, 2.8);
    house(-19, -11.5, 23, 28, 3.0);

    // His boat, pulled up on the shore beyond the crowd (no mast).
    var k0 = X(-2.1, 33), k1 = X(2.1, 33), kt = Y(0.85, 33), kb = Y(0, 33);
    c.add(path("M" + ri(k0) + " " + ri(kt - 4) + "Q" + MX + " " + ri(kt + 8) + " " + ri(k1) + " " + ri(kt - 8) + "L" + ri(k1 - 10) + " " + ri(kb - 4) +
      "Q" + MX + " " + ri(kb + 4) + " " + ri(k0 + 12) + " " + ri(kb - 3) + "Z", "#4a3c31"));
    c.add(path("M" + ri(k0 + 10) + " " + ri(kt - 1) + "Q" + MX + " " + ri(kt + 8) + " " + ri(k1 - 10) + " " + ri(kt - 4) + "L" + ri(k1 - 10) + " " + ri(kt + 1) +
      "Q" + MX + " " + ri(kt + 12) + " " + ri(k0 + 10) + " " + ri(kt + 4) + "Z", "#d9d0bb"));

    // Ground and the clearing: a brighter patch (the UI adds the warm light on top).
    c.add(rect(0, ri(shoreY), W, H - ri(shoreY), c.lin("ground", 0, ri(shoreY), 0, 1150, [[0, "#e4d8ba"], [0.35, "#ddcaa3"], [1, "#c6ab80"]])));
    c.add(rect(0, ri(shoreY) - 1, W, 3, "#f4f1e6", op(0.7)));
    var gy = Y(0, ZC), gry = (Y(0, ZC - RZ) - Y(0, ZC + RZ)) / 2, grx = (F * RX) / ZC;
    c.add(ell(MX, ri(gy), ri(grx * 1.3), ri(gry * 1.35), c.rad("clr", MX, ri(gy), ri(grx * 1.3),
      [[0, "#fffaea", 1], [0.55, "#fbf0d6", 0.85], [1, "#f3e4c2", 0]], ri(gry * 1.35))));

    // People live in world coordinates (meters); wr keeps their placement independent of decoration.
    var people = [];
    function open(px, pz) {
      if (ed(px, pz) < 1.12) return true;                                    // the clearing
      if (pz < ZC && Math.abs(px) < 1.0) return true;                        // open front, where the bed came in
      if (pz > 5.2 && pz < 6.55 && px < -0.6 && px > -2.6) return true;      // keep the scribes in view
      if (px < -6.5 && pz > 21) return true;                                 // houses at the edge of town
      return false;
    }
    function spaced(px, pz, d) {
      for (var k = 0; k < people.length; k++) {
        var q = people[k], a = q.x - px, b = q.z - pz;
        if (a * a + b * b < d * d) return false;
      }
      return true;
    }
    function person(px, pz, kind) {
      people.push({ x: px, z: pz, k: kind, cloth: CLOTH[Math.floor(wr() * CLOTH.length)], hair: HAIR[Math.floor(wr() * HAIR.length)],
        skin: SKIN[Math.floor(wr() * SKIN.length)], hood: wr() < 0.5, w: 0.88 + wr() * 0.26, h: 0.94 + wr() * 0.1, flip: wr() < 0.5 });
    }
    person(-0.9, 6.6, "fs"); person(-1.5, 6.85, "fs"); person(-2.1, 7.2, "fs");
    var near = [[-1.2, 3.3], [1.25, 3.4], [-2.5, 3.9], [2.6, 3.7], [-4.0, 4.3], [4.1, 4.4], [-1.9, 4.9], [1.95, 5.0], [-5.6, 5.4], [5.5, 5.6], [-3.2, 5.9], [3.3, 6.0]];
    for (i = 0; i < near.length; i++) person(near[i][0], near[i][1]);
    t = 0;
    while (t++ < 3000 && people.length < 90) {
      var th = wr() * Math.PI * 2, d = 1.16 + Math.pow(wr(), 1.4) * 2.2;
      x = d * RX * Math.cos(th); z = ZC + d * RZ * Math.sin(th);
      if (!open(x, z) && spaced(x, z, 0.5)) person(x, z);
    }
    t = 0;
    while (t++ < 5000 && people.length < 146) {
      z = Math.sqrt(lerp(5.4 * 5.4, 30 * 30, wr()));
      x = (wr() * 2 - 1) * (z * 0.75 + 0.5);
      var dd = ed(x, z);
      if (open(x, z) || wr() > 0.22 + 0.78 * Math.exp(-((dd - 2) * (dd - 2)) / 12)) continue;
      if (spaced(x, z, z > 15 ? 0.7 : 0.58)) person(x, z);
    }
    people.sort(function (a, b) { return b.z - a.z; });

    crowdDefs(c);
    var shadows = "", figs = [];
    for (i = 0; i < people.length; i++) {
      var p = people[i], s = (F * 0.11) / p.z, hx = X(p.x, p.z), hy = Y(1.6, p.z);
      if (hx + 3 * s < -10 || hx - 3 * s > W + 10) continue;
      var front = p.z > ZC + 0.4;
      var kind = p.k || (front ? (p.hood ? "fc" : "fa") : (p.hood ? "fh" : "fb"));
      var haze = clamp((p.z - 7) / 26, 0, 0.6), dark = clamp((5.6 - p.z) / 4.5, 0, 0.38);
      var fill = mix(mix(kind === "fs" ? "#d8cfba" : p.cloth, "#dcd6c8", haze), "#25211e", dark);
      var col = kind === "fb" ? p.hair : kind === "fa" || kind === "fc" ? p.skin : null;
      if (col) col = mix(mix(col, "#dcd6c8", haze), "#25211e", dark);
      if (ed(p.x, p.z) < 2.3) {
        var fy = ri(hy + 14.5 * s * p.h), rx = ri(2.3 * s * p.w), ry = ri(0.42 * s);
        shadows += "M" + ri(hx - rx) + " " + fy + "a" + rx + " " + ry + " 0 1 0 " + 2 * rx + " 0a" + rx + " " + ry + " 0 1 0 " + -2 * rx + " 0z";
      }
      figs.push({ z: p.z, svg: useFig(c, kind, hx, hy, s * p.w * (p.flip ? -1 : 1), s * p.h, fill, col) });
    }
    c.add(path(shadows, "#8c7a5c", op(0.32)));
    for (i = 0; i < figs.length && figs[i].z > ZC + 0.4; i++) c.add(figs[i].svg);
    // The luminous space where he stands: only light, never a figure.
    c.glow("presence", MX, 640, 300, "#fff8e8", 0.55, 330, 0.3);
    for (; i < figs.length; i++) c.add(figs[i].svg);

    c.vignette("#5a4a32", 0.32, MX, 700, 1300);
    return c.svg();
  };

  // ---------------------------------------------------------------- shore

  // Galilee fishing boat in side view, never with a mast. x0..x1 span, g gunwale y, k keel y.
  function boat(x0, x1, g, k, hull, rim, flip) {
    var L = x1 - x0, h = k - g;
    function X(t) { return ri(flip ? x1 - t * L : x0 + t * L); }
    var sheer = "M" + X(0) + " " + ri(g - h * 0.14) + "Q" + X(0.3) + " " + ri(g + h * 0.1) + " " + X(0.55) + " " + ri(g + h * 0.06) +
      "Q" + X(0.85) + " " + ri(g + h * 0.02) + " " + X(1) + " " + ri(g - h * 0.34);
    return path(sheer + "L" + X(0.95) + " " + ri(k - h * 0.3) + "Q" + X(0.55) + " " + ri(k + h * 0.12) + " " + X(0.07) + " " + ri(k - h * 0.38) + "Z", hull) +
      path(sheer + "L" + X(0.995) + " " + ri(g - h * 0.2) + "Q" + X(0.85) + " " + ri(g + h * 0.16) + " " + X(0.55) + " " + ri(g + h * 0.2) +
        "Q" + X(0.3) + " " + ri(g + h * 0.24) + " " + X(0.01) + " " + ri(g) + "Z", rim) +
      line("M" + X(0.05) + " " + ri(g + h * 0.34) + "Q" + X(0.5) + " " + ri(g + h * 0.56) + " " + X(0.95) + " " + ri(g + h * 0.16), "#000", 3, op(0.22));
  }

  // A net drying between two poles, sagging from its rope (never a single pole with a crossbar).
  function netPoles(c, xa, xb, top, ground, dark) {
    var sag = (xb - xa) * 0.16, mid = (xa + xb) / 2, half = (xb - xa) / 2, hem = "", fl = "", i;
    for (i = 7; i >= 0; i--) {
      var x = lerp(xa + 8, xb - 8, i / 7), yr = top + 10 + sag * (1 - Math.pow((x - mid) / half, 2));
      hem += "L" + ri(x) + " " + ri(yr + 120 + (i % 2) * 28 + Math.sin(i * 1.7) * 16);
    }
    for (i = 1; i < 8; i++) {
      var fx = lerp(xa, xb, i / 8), fy = top + 10 + sag * (1 - Math.pow((fx - mid) / half, 2));
      fl += "M" + ri(fx - 5) + " " + ri(fy) + "a5 3.5 0 1 0 10 0a5 3.5 0 1 0-10 0z";
    }
    var d = "M" + ri(xa) + " " + (top + 10) + "Q" + ri(mid) + " " + ri(top + 10 + sag * 2) + " " + ri(xb) + " " + (top + 10) + hem + "Z";
    var folds = "";
    for (i = 1; i < 6; i++) {
      var fx2 = lerp(xa, xb, i / 6 + 0.03), fy2 = top + 14 + sag * (1 - Math.pow((fx2 - mid) / half, 2));
      folds += "M" + ri(fx2) + " " + ri(fy2) + "q" + ri(6 - i * 2) + " 60 " + ri(-4 + i) + " " + ri(100 + (i % 2) * 22);
    }
    c.add(path(d, dark, op(0.72)));
    c.add(path(d, c.url("mesh")));
    c.add(line(folds, "#000", 7, op(0.25)));
    c.add(rect(ri(xa - 6), top, 12, ground - top, "#1f1a17"));
    c.add(rect(ri(xb - 6), top + 6, 12, ground - top - 6, "#1f1a17"));
    c.add(path(fl, "#d9c6a2", op(0.85)));
  }
  function meshDef(c, color) {
    c.def('<pattern id="' + c.id("mesh") + '" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<path d="M0 .5H10M.5 0V10" fill="none" stroke="' + color + '" stroke-width="1.1" opacity=".38"/></pattern>');
  }

  // Sea of Galilee at dawn: beached boats, nets drying, pale light over the eastern hills.
  scenes.shore_dawn = function (c) {
    var rnd = c.rnd, i, s = "";
    var HY = 620;
    c.add(rect(0, 0, W, HY + 10, c.lin("sky", 0, 0, 0, HY, [[0, "#111a2e"], [0.42, "#293a5b"], [0.72, "#5e6e8e"], [0.9, "#c2a598"], [1, "#ecd2ae"]])));
    for (i = 0; i < 28; i++) s += "M" + ri(rnd() * W) + " " + ri(rnd() * 330) + "h2v2h-2z";
    c.add(path(s, "#e8edf6", op(0.5)));
    c.glow("dawn", 930, 612, 640, "#ffe2b2", 0.62, 300, 0.3);
    c.add(path(ridge(rnd, 566, 14, 9, HY + 8), "#7b7690"));
    c.add(path(ridge(rnd, 592, 10, 12, HY + 8), "#58587a"));

    // Lake with the dawn reflected in a broken column of light.
    c.add(rect(0, HY, W, 172, c.lin("lake", 0, HY, 0, 792, [[0, "#cdb6a3"], [0.25, "#8e8fa3"], [1, "#3e4e68"]])));
    s = "";
    for (i = 0; i < 34; i++) {
      var ry = HY + 4 + Math.pow(rnd(), 1.3) * 156, rw = 16 + rnd() * 110 * (1 - (ry - HY) / 210);
      s += "M" + ri(930 - rw / 2 + (rnd() - 0.5) * 70) + " " + ri(ry) + "h" + ri(rw);
    }
    c.add(line(s, "#ffe9c6", 2.6, op(0.6)));

    // A second boat afloat near the shore, with a faint reflection.
    c.add('<g opacity=".28" transform="translate(0 1546)scale(1 -1)">' + boat(1180, 1480, 756, 786, "#1b1d27", "#1b1d27") + "</g>");
    c.add(boat(1180, 1480, 756, 786, "#262632", "#5c5560"));

    // Beach of dark basalt pebbles with a pale line of foam.
    c.add(path("M-20 790Q400 774 800 784T1620 778V1600H-20Z", c.lin("beach", 0, 780, 0, 1300, [[0, "#58524e"], [0.1, "#3d3936"], [1, "#22201d"]])));
    c.add(line("M-20 790Q400 774 800 784T1620 778", "#ddd3c6", 3, op(0.55)));
    s = "";
    for (i = 0; i < 60; i++) {
      var py = 800 + Math.pow(rnd(), 0.8) * 420, pw = 3 + (py - 780) / 50 + rnd() * 4;
      s += "M" + ri(rnd() * W) + " " + ri(py) + "h" + ri(pw) + "v" + ri(pw * 0.5) + "h-" + ri(pw) + "z";
    }
    c.add(path(s, "#6e6762", op(0.6)));

    // Nets drying on paired poles (one pair at the right of the portrait band, one at far left).
    meshDef(c, "#d4cab8");
    netPoles(c, 1090, 1350, 632, 990, "#2b2827");
    netPoles(c, 120, 360, 660, 1000, "#2b2827");

    // The main boat pulled up on the beach; its top catches the dawn.
    c.add(ell(740, 892, 300, 16, "#000", op(0.35)));
    c.add(boat(460, 1020, 806, 892, "#2b2421", "#8a6a50"));
    // A pile of nets and a basket beside it, where the fishermen mend them.
    c.add(path("M1018 902Q1030 860 1072 866Q1100 846 1132 872Q1160 878 1158 904Z", "#2e2a28"));
    c.add(path("M1018 902Q1030 860 1072 866Q1100 846 1132 872Q1160 878 1158 904Z", c.url("mesh")));
    c.add(path("M404 864Q402 900 434 904Q466 900 464 864Z", "#5e4831"));
    c.add(ell(434, 864, 30, 8, "#3a2c1e"));
    c.add(line("M405 878Q434 886 463 878M407 892Q434 898 461 892", "#2f2418", 2.2, op(0.7)));

    c.vignette("#0b0e18", 0.55, 900, 660, 1300);
    c.grain(0.3, 0.4);
    return c.svg();
  };

  // ---------------------------------------------------------------- Asher's house

  // Reeds laid across the beams: a pattern tile is far cheaper than hundreds of strokes.
  function reedDef(c, colors) {
    var g = prng(55), s = "";
    for (var i = 0; i < 22; i++) {
      var x = r1(i * 7.3 + g() * 4), x2 = r1(x + (g() - 0.5) * 6);
      s += '<path d="M' + x + " 0L" + x2 + ' 320" stroke="' + colors[Math.floor(g() * colors.length)] + '" stroke-width="' + r1(1.6 + g() * 2.6) + '"/>';
    }
    c.def('<pattern id="' + c.id("reed") + '" width="160" height="320" patternUnits="userSpaceOnUse">' + s + "</pattern>");
  }

  // Lying POV inside Asher's house, looking straight up at the beams, reeds and mud.
  // time: day (morning shaft from the doorway), evening (amber doorway, lamp below), night (lamp below).
  scenes.asher_ceiling = function (c, o) {
    var rnd = c.rnd, t = o.time, i;
    var day = t === "day", eve = t === "evening";
    var night = !day && !eve;
    c.add(full(night ? "#0d0a08" : "#1e1711"));
    reedDef(c, night ? ["#21180f", "#271d14", "#1b140e"] : ["#3f3326", "#4a3c2c", "#382d22", "#524230"]);
    c.add(rect(150, 0, 1150, H, c.url("reed")));
    // Patches of packed mud showing between the reeds.
    var mud = "";
    for (i = 0; i < 14; i++) {
      var mx = 180 + rnd() * 1080, my = rnd() * H, mw = 40 + rnd() * 90, mh = 14 + rnd() * 22;
      mud += "M" + ri(mx) + " " + ri(my) + "q" + ri(mw / 2) + " " + ri(-mh) + " " + ri(mw) + " 0q" + ri(-mw / 2) + " " + ri(mh) + " " + ri(-mw) + " 0z";
    }
    c.add(path(mud, night ? "#140f0b" : "#2a2119", op(0.8)));
    c.add(full(night ? "#000" : "#140d08", op(night ? 0.4 : 0.32)));

    // Heavy round beams spanning wall to wall, lit from the doorway side.
    var beamFill = c.lin("beam", 150, 0, 1300, 0, day
      ? [[0, "#2a1f17"], [0.6, "#4a3726"], [1, "#7a5a3c"]]
      : eve ? [[0, "#3a2819"], [0.6, "#4a3424"], [1, "#6a4630"]] : [[0, "#4a321e"], [0.5, "#2a1d14"], [1, "#1a130e"]]);
    var bd = "", bk = "", rnd2 = prng(17);
    for (i = 0; i < 4; i++) {
      var cy = 140 + i * 330, top = [], bot = [];
      for (var k = 0; k <= 6; k++) {
        var x = 150 + (1150 * k) / 6;
        top.push([x, cy - 48 + (rnd() - 0.5) * 12]);
        bot.unshift([x, cy + 48 + (rnd() - 0.5) * 12]);
      }
      bd += smooth(top, false) + "L" + bot.map(function (p) { return ri(p[0]) + " " + ri(p[1]); }).join("L") + "Z";
      for (k = 0; k < 7; k++) {
        var kx = 180 + rnd2() * 1080, ky = cy + (rnd2() - 0.5) * 60;
        bk += "M" + ri(kx) + " " + ri(ky) + "h" + ri(60 + rnd2() * 140);
      }
    }
    c.add(path(bd, beamFill));
    // Round shading: dark top and bottom edges, a soft highlight along the middle, bark streaks.
    var roundG = [];
    for (i = 0; i < 4; i++) {
      var b0 = (140 + i * 330 - 54) / H, b1 = (140 + i * 330 + 54) / H;
      roundG.push([r2(b0), "#000", 0.5], [r2((b0 * 2 + b1) / 3), "#000", 0], [r2((b0 + b1 * 2) / 3), "#000", 0.08], [r2(b1), "#000", 0.6]);
    }
    c.add(path(bd, c.lin("round", 0, 0, 0, H, roundG)));
    c.add(line(bk, "#000", 3, op(0.22)));

    // Walls at the edges (landscape): the right wall holds the doorway.
    c.add(rect(0, 0, 150, H, c.lin("lw", 0, 0, 150, 0, [[0, "#0c0a08"], [1, "#1c1712"]])));
    c.add(rect(1300, 0, 300, H, c.lin("rw", 1300, 0, 1600, 0, [[0, "#211a14"], [1, "#0e0b09"]])));
    var door = [[1360, 640], [1600, 576], [1600, 1024], [1360, 960]];
    c.add(path(poly(door), c.lin("door", 1360, 0, 1600, 0, day
      ? [[0, "#fff4dc"], [1, "#ffe7bd"]] : eve ? [[0, "#f2b066"], [1, "#c9705a"]] : [[0, "#0c1120"], [1, "#070a13"]])));
    if (night) c.add(ell(1500, 700, 2, 2, "#e8eef8", op(0.8)));

    if (day) {
      // Morning shaft of light through dusty air, slanting across the beams.
      c.add(path(poly([[1360, 640], [1360, 960], [260, 820], [260, 250]]),
        c.lin("shaft", 1360, 0, 260, 0, [[0, "#fff3d6", 0.5], [0.55, "#fff0cc", 0.18], [1, "#ffeec8", 0]])));
      var dm = "";
      for (i = 0; i < 16; i++) {
        var u = rnd(), dx = lerp(1300, 380, u), dy = lerp(lerp(660, 300, u), lerp(940, 800, u), rnd());
        dm += "M" + ri(dx) + " " + ri(dy) + "a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0z";
      }
      c.add(path(dm, "#fffaf0", op(0.7)));
      c.glow("door", 1360, 800, 700, "#ffe9c4", 0.3, 520);
    } else {
      // Lamplight from below (the lamp sits in a niche near the bed).
      c.glow("lamp", 560, 1300, 900, "#f2a452", eve ? 0.3 : 0.42, 760, 0.3);
      if (eve) c.glow("door", 1360, 800, 620, "#f0a060", 0.22, 480);
    }

    c.vignette("#000", night ? 0.8 : 0.6, 760, 760, 1250);
    c.grain(0.3, 0.3);
    return c.svg();
  };

  // Asher's house at eye level: basalt back wall, low doorway, water jar, his bed on the floor.
  // Portrait sees the back wall; landscape adds the side walls, a shelf niche and a hand mill.
  // time: day (bright morning doorway), evening (amber dusk outside, lamp lit), night (dark doorway, lamp lit).
  scenes.asher_home = function (c, o) {
    var rnd = c.rnd, t = o.time, i;
    var day = t === "day", eve = t === "evening";
    var night = !day && !eve;
    var BL = 420, BR = 1180, BT = 380, BB = 900;   // back wall
    var DL = 830, DR = 990, DT = 590;              // doorway
    var LX = 1078, LY = 704;                       // lamp wick in its niche
    function lit(x, y) {
      var dd = Math.sqrt((x - 910) * (x - 910) + (y - 750) * (y - 750) * 1.4);
      var dl = Math.sqrt((x - LX) * (x - LX) + (y - LY) * (y - LY) * 1.4);
      var a = day ? clamp(1 - dd / 520, 0, 1) : eve ? 0.45 * clamp(1 - dd / 360, 0, 1) : 0;
      var b = day ? 0 : clamp(1 - dl / (night ? 560 : 460), 0, 1);
      return Math.max(a, b);
    }

    // Ceiling with beams running toward us (portrait only).
    c.add(full(night ? "#0c0a09" : "#16120f"));
    reedDef(c, night ? ["#1a140f", "#211912"] : eve ? ["#2e231a", "#3a2c20", "#241b14"] : ["#2c241c", "#3a2f24", "#231c16"]);
    c.add(path("M0 0H1600V93L1180 380H420L0 93Z", c.url("reed")));
    var bm = "";
    for (i = 0; i < 6; i++) {
      var bx = 470 + i * 132, k = 2.615;
      bm += poly([[bx - 15, BT], [bx + 15, BT], [800 + (bx + 15 - 800) * k, -40], [800 + (bx - 15 - 800) * k, -40]]);
    }
    c.add(path(bm, night ? "#1d1610" : "#2f241a"));
    c.add(path("M0 0H1600V93L1180 380H420L0 93Z", "#000", op(night ? 0.45 : 0.3)));

    // Side walls (landscape): plastered mud in shadow.
    c.add(path(poly([[BL, BT], [0, 93], [0, 1187], [BL, BB]]), c.lin("lwall", 0, 0, BL, 0, [[0, "#15110e"], [1, night ? "#1e1915" : "#2b241e"]])));
    c.add(path(poly([[BR, BT], [1600, 93], [1600, 1187], [BR, BB]]), c.lin("rwall", BR, 0, 1600, 0, night || eve
      ? [[0, "#3a2a1e"], [1, "#130f0c"]] : [[0, "#2e2620"], [1, "#15110e"]])));
    // Back wall stones lit by the doorway (day) or the lamp (evening, night).
    c.add(rect(BL, BT, BR - BL, BB - BT, night ? "#14110f" : eve ? "#211b18" : "#272320"));
    var tones = day ? ["#2f2b28", "#3b3631", "#48413a", "#584f46", "#6b6056"]
      : eve ? ["#2a2321", "#362b25", "#46362b", "#5a4331", "#6e5036"] : ["#1b1715", "#261f1a", "#33291f", "#453424", "#5a412b"];
    c.add('<g clip-path="' + c.clip("bw", "M" + BL + " " + BT + "H" + BR + "V" + BB + "H" + BL + "Z") + '">');
    addStones(c, stones(rnd, flat, {
      u0: BL, u1: BR, v0: BT, v1: BB, ch: [44, 66], sw: [70, 130], gap: 4, jit: 5, n: 5,
      keep: function (u, v) { return !(u > DL - 10 && u < DR + 10 && v > DT - 10); },
      tone: function (x, y, r) {
        var L = lit(x, y);
        if (L < 0.06 && r() < 0.6) return -1;
        return clamp(Math.floor(L * 4.6 + (r() - 0.5) * 1.2), 0, 4);
      }
    }), tones);
    c.add("</g>");

    // Lamp niche.
    c.add(path(poly([[1052, 628], [1152, 626], [1152, 640], [1052, 642]]), night ? "#2a2119" : "#3b3229"));
    c.add(rect(1060, 640, 86, 82, "#0b0908"));
    var lamp = oilLamp(c, LX, LY, day ? 0 : eve ? 20 : 24, 0.6, "lamp");
    c.add(lamp.body);

    // Doorway: what lies outside depends on the time of day.
    var out = day ? ["#eaf1f2", "#cfc6b5", "#efe2c2"] : eve ? ["#e9a56f", "#5b4d58", "#6e5a52"] : ["#0d1426", "#151824", "#1b1d26"];
    c.add(rect(DL, DT, DR - DL, BB - DT, out[1]));
    c.add(rect(DL, DT, DR - DL, 44, c.lin("osky", 0, DT, 0, DT + 44, [[0, out[0]], [1, mix(out[0], out[1], 0.5)]])));
    c.add(rect(DL, 836, DR - DL, BB - 836, out[2]));
    var os = "";
    for (i = 0; i < 6; i++) os += poly([[DL + 6 + (i % 3) * 52, 660 + Math.floor(i / 3) * 70], [DL + 50 + (i % 3) * 52, 662 + Math.floor(i / 3) * 70], [DL + 48 + (i % 3) * 52, 712 + Math.floor(i / 3) * 70], [DL + 8 + (i % 3) * 52, 710 + Math.floor(i / 3) * 70]]);
    c.add(path(os, day ? "#bdb3a1" : eve ? "#4e424d" : "#11141e"));
    if (night) c.add(ell(940, 606, 2, 2, "#e8eef8", op(0.8)));
    if (day) c.add(rect(DL, DT, DR - DL, BB - DT, "#fff6e2", op(0.42)));
    // Deep basalt reveal and threshold, then the wooden lintel.
    c.add(path(poly([[DR, DT], [DR, BB], [971, 874], [971, 595]]), day ? "#d8c6a6" : eve ? "#7a5a4c" : "#17161a"));
    c.add(path(poly([[DL, BB], [DR, BB], [971, 874], [817, 874]]), day ? "#e9d7b5" : eve ? "#8a6a55" : "#1b1a1e"));
    c.add(path(poly([[812, 566], [1008, 564], [1008, 592], [812, 594]]), night ? "#21180f" : "#3b2a1d"));

    // Floor of packed earth.
    c.add(path(poly([[BL, BB], [BR, BB], [1600, 1187], [1600, 1600], [0, 1600], [0, 1187]]),
      c.lin("floor", 0, BB, 0, 1500, [[0, night ? "#1c1713" : eve ? "#2c231c" : "#3a3129"], [1, "#120f0c"]])));
    if (day) {
      c.add(path(poly([[DL, BB], [DR, BB], [1150, 1600], [610, 1600]]),
        c.lin("spill", 0, BB, 0, 1500, [[0, "#ffe9c2", 0.55], [1, "#ffe9c2", 0]])));
    } else if (eve) {
      c.add(path(poly([[DL, BB], [DR, BB], [1100, 1400], [650, 1400]]),
        c.lin("spill", 0, BB, 0, 1400, [[0, "#f0a15c", 0.3], [1, "#f0a15c", 0]])));
    }

    // Water jar beside the door, catching light on the door side.
    c.add(path("M708 902C676 846 684 782 718 760C712 750 716 742 726 740H770C780 742 784 750 778 760C812 782 818 846 788 902Z",
      c.lin("jar", 684, 0, 818, 0, day ? [[0, "#3a2418"], [0.62, "#7a4a30"], [1, "#d39a6a"]]
        : eve ? [[0, "#2e1d14"], [0.7, "#6a3e28"], [1, "#b2723e"]] : [[0, "#1c120d"], [0.7, "#4a2c1c"], [1, "#9a5a2e"]])));
    c.add(ell(748, 742, 24, 5, "#1a100a"));

    // Asher's bed: a light wooden frame with a woven mat and his worn brown cloak.
    c.add(ell(560, 984, 210, 12, "#000", op(0.35)));
    c.add(path(poly([[452, 912], [705, 912], [683, 975], [371, 975]]), day ? "#8a7350" : eve ? "#6e5638" : "#4a3a26"));
    c.add(line("M440 926L700 926M425 940L697 940M410 954L692 954", "#000", 2, op(0.18)));
    c.add(path("M540 914Q600 900 690 912L684 960Q610 972 520 962Q500 936 540 914Z", day ? "#6d4a32" : eve ? "#5a3a26" : "#3e2a1c"));
    c.add(path("M560 930Q610 922 660 932Q620 944 566 942Z", "#000", op(0.22)));
    c.add(path("M454 916Q470 904 500 912L494 950Q470 958 448 948Z", day ? "#b8a582" : eve ? "#8f7c5f" : "#5c4f3c"));
    c.add(path(poly([[352, 972], [700, 972], [698, 984], [348, 984]]), night ? "#2a1d12" : "#4e3824"));
    c.add(path(poly([[440, 908], [716, 908], [714, 916], [438, 916]]), night ? "#22180f" : "#3e2c1c"));

    // Basalt hand mill on the floor near the right wall (landscape).
    c.add(ell(1330, 960, 70, 18, "#1c1a19"));
    c.add(rect(1260, 930, 140, 30, "#2a2826"));
    c.add(ell(1330, 930, 70, 18, "#3b3835"));
    c.add(line("M1360 928L1384 896", "#4a3626", 6));

    // Light.
    if (day) {
      c.glow("door", 910, 745, 560, "#fff3da", 0.42, 520);
      c.add(path(poly([[DL, DT], [DR, DT], [700, 1600], [300, 1600]]),
        c.lin("shaft", 0, DT, 0, 1500, [[0, "#fff4dc", 0.14], [1, "#fff4dc", 0]])));
    } else {
      if (eve) c.glow("door", 910, 745, 440, "#f3a35a", 0.3, 400);
      c.glow("lamp", LX, LY - 10, night ? 620 : 520, "#ffbe6e", night ? 0.48 : 0.38, night ? 560 : 470, 0.3);
      c.glow("halo", LX, LY - 14, 46, "#fff0c8", 0.8, 0, 0.3);
      c.add(lamp.flame);
    }

    c.vignette("#000", night ? 0.82 : eve ? 0.66 : 0.55, 820, 740, 1250);
    c.grain(0.3, night ? 0.2 : 0.4);
    return c.svg();
  };

  // ---------------------------------------------------------------- carried and lying views

  function circ(x, y, r) {
    return "M" + ri(x - r) + " " + ri(y) + "a" + ri(r) + " " + ri(r) + " 0 1 0 " + ri(2 * r) + " 0a" + ri(r) + " " + ri(r) + " 0 1 0 " + -ri(2 * r) + " 0z";
  }
  // Soft cumulus: overlapping puffs with a cool shaded underside.
  function cloud(c, cx, cy, s, a) {
    var d = "", sh = "", parts = [[-1.6, 0.25, 0.85], [-0.75, -0.25, 1.2], [0.45, -0.5, 1.4], [1.55, 0.05, 1.0], [0.2, 0.35, 1.15]];
    for (var k = 0; k < parts.length; k++) {
      var px = cx + parts[k][0] * s * 62, py = cy + parts[k][1] * s * 62, r = parts[k][2] * s * 56;
      d += circ(px, py, r);
      sh += circ(px + 6, py + r * 0.28, r * 0.92);
    }
    c.add(path(sh, "#b3c8da", op(r2(a * 0.9))));
    c.add(path(d, "#ffffff", op(a)));
  }

  // A hand gripping a bed pole, seen from below. (x, y) sits on the pole axis; dir = -1 when the
  // arm comes from the left. The forearm leaves at a slant so pole and arm never form a cross.
  function grip(c, x, y, dir, skin, sleeve) {
    var g = '<g transform="translate(' + x + " " + y + ")scale(" + dir + ' 1)">';
    // Sleeve beyond the elbow, then a tapered forearm reaching down and away from the pole.
    g += path("M-200 250L-262 186L-446 330L-384 404Z", sleeve);
    g += path("M-16 2Q-118 58-252 184Q-250 236-178 262Q-80 150 14 34Z", skin);
    g += path("M-16 2Q-118 58-252 184L-240 196Q-110 74-6 14Z", "#fff", op(0.13));
    g += path("M-178 262Q-80 150 14 34L16 48Q-74 160-170 270Z", "#000", op(0.18));
    // Fist wrapped around the pole; the thumb stays hidden behind it.
    g += path("M-40 -36Q-2 -50 36 -38Q46 0 38 40Q0 54 -36 40Q-48 0 -40 -36Z", skin);
    g += line("M-36 -14Q0 -22 40 -12M-38 8Q0 0 42 10M-36 28Q0 22 40 30", "#000", 3, op(0.2));
    g += path("M-36 40Q0 54 38 40L36 46Q0 62 -34 48Z", "#000", op(0.2));
    return g + "</g>";
  }

  // Lying POV outdoors while being carried: open sky, the bed's poles and gripping hands at the
  // sides; landscape shows the carriers as dark shapes at the edges; a roof edge slides by.
  scenes.sky_carried = function (c) {
    var rnd = c.rnd;
    c.add(full(c.rad("sky", 800, 760, 1250, [[0, "#dce9ee"], [0.35, "#a6c7dd"], [1, "#4c81b1"]])));
    cloud(c, 650, 430, 1.4, 0.92);
    cloud(c, 1140, 240, 1.0, 0.85);
    cloud(c, 1010, 900, 0.75, 0.75);
    cloud(c, 250, 760, 1.1, 0.85);
    cloud(c, 1420, 610, 0.9, 0.8);
    c.add(line("M760 330q10-8 20 0q10-8 20 0M826 296q7-6 14 0q7-6 14 0", "#2a3340", 3, op(0.8)));

    // Roof edges sliding past: top-left for portrait, top-right for landscape.
    function roofEdge(pts, fringe, beams) {
      c.add(path(poly(pts), "#26282c"));
      c.add(line(fringe, "#6b5a40", 9, op(0.9)));
      c.add(path(beams, "#3a2a1c"));
    }
    roofEdge([[380, -20], [840, -20], [720, 150], [380, 270]], "M380 262L452 238L520 214L590 190L660 166L720 146", "M470 220l14 34l26-10l-14-34zM590 178l14 34l26-10l-14-34z");
    roofEdge([[1230, 300], [1620, 250], [1620, 470], [1360, 430]], "M1360 428L1430 440L1500 452L1570 462L1620 468", "M1420 430l-6 36l28 4l6-36zM1530 446l-6 36l28 4l6-36z");

    // The bed's two poles with lashed, rounded ends.
    var pole = c.lin("pole", 0, 0, 60, 0, [[0, "#3e2a1a"], [0.45, "#7a5634"], [1, "#4a321f"]]);
    c.add('<path d="M427 1650L477 1650L505 300L467 300Z" fill="' + pole + '"/>');
    c.add(path("M467 300Q486 270 505 300Z", "#5a3e26"));
    c.add('<path d="M1173 1650L1123 1650L1095 300L1133 300Z" fill="' + pole + '"/>');
    c.add(path("M1095 300Q1114 270 1133 300Z", "#5a3e26"));
    c.add(line("M466 340L506 336M466 352L506 348M1094 336L1134 340M1094 348L1134 352", "#2a1d12", 4));

    // Hands of the friends who carry him (two of them, never a count).
    c.add(grip(c, 490, 610, 1, "#a36c49", "#b6a383"));
    c.add(grip(c, 1110, 720, -1, "#8a5a3c", "#4a5872"));

    c.vignette("#1d3550", 0.35, MX, 760, 1300);
    c.grain(0.22, 0.6);
    return c.svg();
  };

  // Lying POV before Jesus: heads and shoulders lean in from the edges against a bright sky.
  // One side of the ring stays open and warm; nothing stands in that light.
  scenes.crowd_lying = function (c) {
    c.add(full(c.rad("sky", 820, 720, 1200, [[0, "#f2f5f1"], [0.4, "#bfd5e0"], [1, "#7ea8c7"]])));
    c.glow("warm", 1380, 720, 780, "#fff1d4", 0.85, 640, 0.35);
    var LX = 1380, LY = 720, CXc = 800, CYc = 760;
    // Templates seen from below: head at the origin (radius 1), top of the head toward the
    // center of view, shoulders toward the frame edge. Faces are plain backlit ovals.
    // Shoulders are short and rounded: seen from below, the rest of the body hides behind them.
    c.def('<g id="' + c.id("lc") + '"><path d="M0-1.32C1.38-1.32 1.44.3 1.22 1.16Q2.5 1.5 2.62 2.6Q2.52 3.75 1.5 4.35H-1.5Q-2.52 3.75-2.62 2.6Q-2.5 1.5-1.22 1.16C-1.44.3-1.38-1.32 0-1.32Z"/>' +
      '<ellipse cy=".18" rx=".64" ry=".82" fill="currentColor"/>' + path("M-.68.04Q0-.55.68.04Q.5-.4 0-.46Q-.5-.4-.68.04Z", "#000", op(0.4)) +
      path("M-.6.5Q-.5 1.02 0 1.08Q.5 1.02.6.5Q.3.78 0 .8Q-.3.78-.6.5Z", "#000", op(0.25)) + "</g>");
    var garments = ["#4a3f38", "#3d4150", "#57423a", "#3f4a3e", "#5c4c3d", "#4a3d4b"];
    var skins = ["#4c3427", "#422d22", "#56392b", "#3c291f"];
    // People stand on rings around the viewer (outer rows first so the inner row overlaps them).
    // The right side of every ring stays open: that is where the light is.
    var people = [], rows = [[780, 780, 52, [150, 180, 210, 238, 262]], [560, 600, 64, [88, 115, 142, 170, 198, 226, 254, 282, 308]],
      [360, 400, 80, [72, 102, 132, 162, 192, 222, 252, 282, 311]]];
    // Everyone wears a head covering against the noon sun, which also frames each face.
    var kinds = ["lc", "lc"], q = 0;
    for (var rw = 0; rw < rows.length; rw++) {
      for (var k = 0; k < rows[rw][3].length; k++, q++) {
        var a = (rows[rw][3][k] * Math.PI) / 180;
        people.push([ri(760 + rows[rw][0] * Math.cos(a)), ri(740 + rows[rw][1] * Math.sin(a)), rows[rw][2], kinds[(q * 7) % 3 === 0 ? 1 : q % 2], q % 6, (q * 5) % 4]);
      }
    }
    CXc = 760; CYc = 740;
    for (var i = 0; i < people.length; i++) {
      var p = people[i], x = p[0], y = p[1], r = p[2];
      var ang = ri((Math.atan2(CXc - x, -(CYc - y)) * 180) / Math.PI);
      var lx = LX - x, ly = LY - y, ln = Math.sqrt(lx * lx + ly * ly), off = r * 0.08;
      var warm = ln < 760;
      var haze = r < 60 ? 0.3 : r < 70 ? 0.12 : 0;
      var rim = warm ? "#ffd9a0" : "#e2edf2";
      c.add('<use href="#' + c.id(p[3]) + '" transform="translate(' + ri(x + (lx / ln) * off) + " " + ri(y + (ly / ln) * off) + ")rotate(" + ang + ")scale(" + r + ')" fill="' +
        rim + '" color="' + rim + '" opacity="' + (warm ? 0.9 : 0.6) + '"/>');
      c.add('<use href="#' + c.id(p[3]) + '" transform="translate(' + x + " " + y + ")rotate(" + ang + ")scale(" + r + ')" fill="' +
        mix(garments[p[4]], "#a9c0cf", haze) + '" color="' + mix(skins[p[5]], "#a9c0cf", haze) + '"/>');
    }
    c.vignette("#3a4a58", 0.25, MX, 760, 1300);
    c.grain(0.2, 0.6);
    return c.svg();
  };

  // ---------------------------------------------------------------- afternoon and dusk

  // The road home in warm afternoon light: olive trees cast long shadows across the dust,
  // the town of basalt houses waits at the end of the road.
  scenes.road_home = function (c) {
    var rnd = c.rnd, i, k;
    var F = 900, CY = 600, EYE = 1.6;
    function P(x, y, z) { return [MX + (F * x) / z, CY - (F * (y - EYE)) / z]; }
    function G(x, z) { return P(x, 0, z); }

    c.add(rect(0, 0, W, 612, c.lin("sky", 0, 0, 0, 600, [[0, "#84a7c1"], [0.55, "#cbd4cd"], [0.85, "#efd7a9"], [1, "#f4cd92"]])));
    c.glow("sun", 100, 470, 780, "#fff0c4", 0.62, 560);
    c.add(path(ridge(rnd, 520, 24, 7, 612), "#b9a87c"));
    c.add(path(ridge(rnd, 562, 16, 9, 612), "#a19566"));
    c.add(rect(0, 600, W, 1000, c.lin("field", 0, 600, 0, 1300, [[0, "#c9b27b"], [1, "#9a7f4e"]])));

    // The town at the end of the road: sunlit west faces, cooler south fronts.
    var houses = [[-1.2, 1.5, 38, 3.6], [-12, -8.2, 34, 3.4], [9.4, 13, 34, 3.2], [-3.4, -1.0, 33, 3.0], [4.8, 8.6, 31.5, 3.0], [-7.6, -3.8, 30, 3.2], [1.1, 4.4, 29, 3.3]];
    for (i = 0; i < houses.length; i++) {
      var hx0 = houses[i][0], hx1 = houses[i][1], hz = houses[i][2], hh = houses[i][3], dep = 5;
      if (hx0 > 0) c.add(path(poly([P(hx0, hh, hz), P(hx0, hh, hz + dep), G(hx0, hz + dep), G(hx0, hz)]), "#a48a6c"));
      else c.add(path(poly([P(hx1, hh, hz), P(hx1, hh, hz + dep), G(hx1, hz + dep), G(hx1, hz)]), "#4d4553"));
      c.add(path(poly([P(hx0, hh, hz), P(hx1, hh, hz), G(hx1, hz), G(hx0, hz)]), "#6f6159"));
      c.add(path(poly([P(hx0, hh + 0.12, hz), P(hx1, hh + 0.12, hz), P(hx1, hh, hz), P(hx0, hh, hz)]), "#d2b286"));
      var dx = lerp(hx0, hx1, 0.3 + rnd() * 0.3);
      c.add(path(poly([G(dx, hz), P(dx, 1.5, hz), P(dx + 0.7, 1.5, hz), G(dx + 0.7, hz)]), "#2c2522"));
    }

    // The road of packed dust narrowing toward the town, with worn tracks.
    c.add(path(poly([G(-2.2, 1.1), G(-1.5, 29), G(1.5, 29), G(2.2, 1.1)]), c.lin("road", 0, 640, 0, 1500, [[0, "#e6cb98"], [1, "#d1ae78"]])));
    c.add(path(poly([G(-0.75, 1.3), G(-0.62, 28), G(-0.5, 28), G(-0.55, 1.3)]) + poly([G(0.55, 1.3), G(0.5, 28), G(0.62, 28), G(0.75, 1.3)]), "#c29f6c", op(0.6)));

    // Olive trees: [x, z]. Long shadows fall to the right and away from the low western sun,
    // so the canopies of the left-hand trees lay bands of shade across the road.
    var trees = [[-3.9, 17], [4.6, 14], [-4.4, 10.5], [3.8, 7.5], [-3.6, 5.0]];
    var shade = "";
    for (i = 0; i < trees.length; i++) {
      var tx = trees[i][0], tz = trees[i][1], pts = [];
      for (k = 0; k < 14; k++) {
        var a = (k / 14) * Math.PI * 2, along = 5.6 + Math.cos(a) * 2.5, across = Math.sin(a) * 1.5;
        pts.push(G(tx + along * 0.92 - across * 0.38, tz + along * 0.38 + across * 0.92));
      }
      shade += poly(pts) + poly([G(tx - 0.1, tz), G(tx + 3.2 * 0.92 - 0.1, tz + 3.2 * 0.38 + 0.22), G(tx + 3.2 * 0.92 + 0.1, tz + 3.2 * 0.38 - 0.22), G(tx + 0.1, tz)]);
    }
    c.add(path(shade, "#6f5446", op(0.4)));

    // Stones and dry tufts along the roadside.
    var rs = "", tf = "";
    for (i = 0; i < 26; i++) {
      var sz = 3 + Math.pow(rnd(), 1.4) * 20, sx = (rnd() < 0.5 ? -1 : 1) * (2.3 + rnd() * 1.6), ss = 0.12 + rnd() * 0.18;
      var sp = G(sx, sz), sw = (F * ss) / sz;
      rs += "M" + ri(sp[0] - sw) + " " + ri(sp[1]) + "q" + ri(sw) + " " + ri(-sw * 0.9) + " " + ri(sw * 2) + " 0z";
      if (i % 2) tf += "M" + ri(sp[0] + sw * 2) + " " + ri(sp[1]) + "l" + ri(-sw * 0.4) + " " + ri(-sw * 1.6) + "M" + ri(sp[0] + sw * 2.2) + " " + ri(sp[1]) + "l" + ri(sw * 0.5) + " " + ri(-sw * 1.4);
    }
    c.add(path(rs, "#7d6b55"));
    c.add(line(tf, "#8f7c4c", 2.4, op(0.8)));

    // Olive trees: gnarled, forked trunks and wide, broken, silver-green crowns (local units = meters).
    var trunk = "M-.28 0C-.1-.6-.42-1-.16-1.6L-.82-2.3L-.66-2.42L-.04-1.86L.04-1.9L.72-2.56L.86-2.42L.24-1.55C.42-1 .14-.5.34 0Z";
    for (i = 0; i < trees.length; i++) {
      var bx = trees[i][0], bz = trees[i][1], s = r2(F / bz), base = G(bx, bz);
      var g = '<g transform="translate(' + ri(base[0]) + " " + ri(base[1]) + ")scale(" + s + ')">';
      g += path(trunk, "#4a3a2c") + path("M-.28 0C-.1-.6-.42-1-.16-1.6L-.82-2.3L-.74-2.36L-.08-1.62C-.3-1-.02-.6-.12 0Z", "#8a7458", op(0.6));
      var cd = "", cs = "", cl = "";
      for (k = 0; k < 13; k++) {
        // Clumps sit around a connected, flattened crown (outer ring) plus a few inside.
        var ca = (k / 9) * Math.PI * 2 + rnd() * 0.4, cr = k < 9 ? 0.85 + rnd() * 0.15 : rnd() * 0.5;
        var px = Math.cos(ca) * cr * 1.45, py = -2.95 + Math.sin(ca) * cr * 0.55, pr = 0.4 + rnd() * 0.22;
        var arc = "M" + r2(px - pr) + " " + r2(py) + "a" + r2(pr) + " " + r2(pr * 0.8) + " 0 1 0 " + r2(2 * pr) + " 0a" + r2(pr) + " " + r2(pr * 0.8) + " 0 1 0 " + r2(-2 * pr) + " 0z";
        cd += arc;
        cs += "M" + r2(px - pr) + " " + r2(py + 0.16) + "a" + r2(pr) + " " + r2(pr * 0.8) + " 0 1 0 " + r2(2 * pr) + " 0a" + r2(pr) + " " + r2(pr * 0.8) + " 0 1 0 " + r2(-2 * pr) + " 0z";
        if (px < 0.3) cl += "M" + r2(px - pr * 0.9) + " " + r2(py - 0.08) + "a" + r2(pr * 0.6) + " " + r2(pr * 0.45) + " 0 1 0 " + r2(pr * 1.2) + " 0a" + r2(pr * 0.6) + " " + r2(pr * 0.45) + " 0 1 0 " + r2(-pr * 1.2) + " 0z";
      }
      g += path(cs, "#545a3c") + path(cd, "#7c8462") + path(cl, "#b6b98e", op(0.85));
      c.add(g + "</g>");
    }

    c.glow("haze", MX, 610, 980, "#ffe9bf", 0.3, 420);
    c.vignette("#5a3a1e", 0.4, MX, 700, 1300);
    c.grain(0.25, 0.6);
    return c.svg();
  };

  // Asher's doorway at dusk: amber lamplight inside, the sky turning violet; landscape also sees
  // down the lane to the lake, where one other window is lit.
  scenes.doorway_evening = function (c) {
    var rnd = c.rnd, i;
    var DL = 728, DR = 872, DT = 612, DB = 902;
    c.add(rect(0, 0, W, 720, c.lin("sky", 0, 0, 0, 660, [[0, "#1f1a35"], [0.35, "#3b3157"], [0.62, "#77587a"], [0.82, "#c07e79"], [1, "#e5a473"]])));
    c.add(path("M520 120h3v3h-3zM980 210h3v3h-3zM1262 80h3v3h-3zM300 260h2v2h-2z", "#f4f1ea", op(0.85)));

    // View down the lane (left, landscape): dusk lake, far hills, rooftops with one lit window.
    c.add(path(ridge(rnd, 612, 8, 5, 650), "#3d3350"));
    c.add(rect(0, 642, 420, 70, c.lin("lake", 0, 642, 0, 712, [[0, "#c28a86"], [1, "#4c3d5b"]])));
    c.add(path("M-10 700L80 690V662H170V700L240 694V676H330V712L400 706V1000H-10Z", "#1b1622"));
    c.add(rect(120, 676, 12, 10, "#f2b45a"));
    c.add(rect(0, 820, 400, 780, "#221c24"));

    // House front of black basalt, warmed only near the doorway.
    c.add(rect(380, 430, 1220, 1170, "#1d1922"));
    var tones = ["#2d2833", "#36303c", "#403846", "#5a4434", "#7a5534"];
    c.add('<g clip-path="' + c.clip("front", "M380 430H1600V920H380Z") + '">');
    addStones(c, stones(rnd, flat, {
      u0: 380, u1: W, v0: 448, v1: 920, ch: [46, 68], sw: [74, 136], gap: 4, jit: 5, n: 5,
      keep: function (u, v) { return !(u > DL - 24 && u < DR + 24 && v > DT - 30); },
      tone: function (x, y, r) {
        var d = Math.sqrt((x - 800) * (x - 800) + (y - 760) * (y - 760) * 1.3);
        if (d < 300) return 3 + (r() < 0.5 && d < 200 ? 1 : 0);
        return Math.floor(r() * 3);
      }
    }), tones);
    // Corner stones at the left edge of the house.
    var q = "";
    for (i = 0; i < 7; i++) q += poly([[380, 452 + i * 66], [380 + (i % 2 ? 60 : 96), 452 + i * 66], [380 + (i % 2 ? 60 : 96), 512 + i * 66], [380, 512 + i * 66]]);
    c.add(path(q, "#3c3644"));
    c.add("</g>");
    // Roof edge of packed mud over reeds, with beam ends under it.
    c.add(path("M370 414L1600 406V446L370 452Z", "#2b232a"));
    var fr = "M370 418";
    for (var fx = 370; fx < W; fx += 22 + rnd() * 26) fr += "L" + ri(fx) + " " + ri(400 + rnd() * 12);
    c.add(path(fr + "L1600 404V414L370 418Z", "#4a3a2c"));
    var be = "";
    for (i = 0; i < 11; i++) be += "M" + (430 + i * 112) + " 448h22v18h-22z";
    c.add(path(be, "#2a1e15"));

    // Doorway: amber interior with a lit lamp niche, the door leaf swung inward.
    c.add(rect(DL, DT, DR - DL, DB - DT, c.rad("inside", 815, 770, 220, [[0, "#ffd284"], [0.45, "#d98a3a"], [1, "#6e3714"]], 260)));
    c.add(rect(790, 712, 46, 40, "#ffe3a8", op(0.7)));
    c.add(path("M802 744h22l-4-10h-14z", "#7a4a2a"));
    c.add(path(poly([[DL, DT], [DL + 34, DT + 14], [DL + 34, DB - 8], [DL, DB]]), "#3a2414"));
    c.add(path(poly([[DR, DT], [DR, DB], [DR - 14, DB - 10], [DR - 14, DT + 8]]), "#c98446"));
    c.add(path(poly([[706, 588], [894, 586], [894, 614], [706, 616]]), "#3a2a1d"));
    c.add(path(poly([[716, 902], [884, 902], [892, 920], [708, 920]]), "#5e4a40"));

    // Water jar by the door, lit on the door side.
    c.add(path("M612 912C590 868 596 822 620 806C616 798 620 792 628 790H660C668 792 672 798 668 806C692 822 698 868 676 912Z",
      c.lin("jar", 594, 0, 700, 0, [[0, "#1e1418"], [0.7, "#4a2c22"], [1, "#c27a3c"]])));

    // Ground in front of the house and the warm spill from the door.
    c.add(rect(380, 918, 1220, 682, c.lin("ground", 0, 918, 0, 1400, [[0, "#3b3037"], [1, "#1c171c"]])));
    c.add(path(poly([[DL, 920], [DR, 920], [1010, 1300], [590, 1300]]), c.lin("spill", 0, 920, 0, 1300, [[0, "#f3a24a", 0.5], [1, "#f3a24a", 0]])));
    c.glow("door", 800, 760, 420, "#f2a24c", 0.38, 380);

    c.vignette("#0e0b16", 0.6, MX, 720, 1300);
    c.grain(0.28, 0.35);
    return c.svg();
  };

  // Calm neutral gradient for unknown ids.
  function fallback(c) {
    c.add(full(c.lin("bg", 0, 0, 0, 1600, [[0, "#3b3e44"], [0.6, "#5a5751"], [1, "#2c2b29"]])));
    c.vignette("#000", 0.4);
    return c.svg();
  }

  // ---------------------------------------------------------------- public API

  // Point of view can swap a scene for its lying or eye-level counterpart, so a camera
  // change (fx "pov") can simply re-render the current background with the new pov.
  var LYING = { asher_home: "asher_ceiling", lane: "sky_carried", crowd: "crowd_lying" };
  var STANDING = { asher_ceiling: "asher_home", sky_carried: "lane", crowd_lying: "crowd" };
  var TIMES = { day: 1, evening: 1, night: 1 };

  function resolve(bgId, pov) {
    var id = typeof bgId === "string" ? bgId : "";
    if (pov === "lying" && LYING[id]) return LYING[id];
    if (pov === "standing" && STANDING[id]) return STANDING[id];
    return id;
  }

  BHS.art = {
    ids: IDS.slice(),
    // Canvas size of every scene (viewBox), rendered with preserveAspectRatio "xMidYMid slice".
    viewBox: [W, H],
    // Where the luminous space sits in each crowd scene, in canvas units, so the UI can
    // anchor its presence light there. Map to the screen with the slice math:
    // s = max(stageW / 1600, stageH / 1600); x = stageW / 2 + (cx - 800) * s; y = stageH / 2 + (cy - 800) * s.
    lightAt: { crowd: [800, 650], crowd_lying: [1380, 720] },
    // Returns the bg id that render() will actually draw for this pov.
    resolve: resolve,
    // opts: { pov?: "normal"|"lying"|"standing", time?: "day"|"evening"|"night", uid?: string }
    render: function (bgId, opts) {
      var o = opts || {};
      var id = resolve(bgId, o.pov);
      var known = Object.prototype.hasOwnProperty.call(scenes, id);
      var uid = typeof o.uid === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(o.uid) ? o.uid : (++renderCount).toString(36);
      var so = { pov: o.pov, time: TIMES[o.time] ? o.time : "day" };
      try {
        return known ? scenes[id](new Ctx(id, uid), so) : fallback(new Ctx("unknown", uid));
      } catch (err) {
        try { return fallback(new Ctx("unknown", uid)); } catch (e2) {
          return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true"><rect width="1600" height="1600" fill="#3b3e44"/></svg>';
        }
      }
    }
  };
})();
