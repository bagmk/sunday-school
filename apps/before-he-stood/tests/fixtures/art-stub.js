/*
 * tests/fixtures/art-stub.js - FIXTURE ONLY. A minimal stand-in for js/art.js:
 * BHS.art.render(bgId, opts) returns simple SVG markup for each BG id in SPEC 6.6.
 * Defines BHS.art only when the real art module has not.
 */
(function () {
  var BHS = (window.BHS = window.BHS || {});
  if (BHS.art && typeof BHS.art.render === "function") return;

  var SKIES = {
    black: ["#121110", "#1d1b19"],
    dawn_lamp: ["#2a221a", "#4a3523"],
    shore_dawn: ["#9fb4c0", "#e3cfa8"],
    asher_ceiling: ["#3b2f25", "#6a5440"],
    asher_home: ["#5a4836", "#8c7457"],
    lane: ["#cfd9df", "#efe6cf"],
    sky_carried: ["#7fb0cf", "#d9ebf3"],
    crowd: ["#c7d6dd", "#f1e6c8"],
    crowd_lying: ["#a9c6d6", "#f4e8c8"],
    road_home: ["#e8c98f", "#f3e2bb"],
    doorway_evening: ["#4a3b52", "#c58f5c"],
    lamp_night: ["#15130f", "#3a2a1a"]
  };

  function render(bgId, opts) {
    var c = SKIES[bgId] || SKIES.black;
    var ground = bgId === "black" ? "" : '<rect x="0" y="560" width="400" height="240" fill="#2b2925" opacity="0.85"/>';
    var lamp = bgId === "dawn_lamp" || bgId === "lamp_night" ? '<circle cx="200" cy="470" r="70" fill="#f2b552" opacity="0.35"/><circle cx="200" cy="470" r="10" fill="#ffd27a"/>' : "";
    var houses = bgId === "lane" ? '<rect x="0" y="180" width="110" height="420" fill="#2d2a27"/><rect x="290" y="150" width="110" height="450" fill="#2d2a27"/>' : "";
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + bgId + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs>' +
      '<rect width="400" height="800" fill="url(#g)"/>' + houses + ground + lamp +
      "</svg>"
    );
  }

  BHS.art = { render: render, stub: true };
})();
