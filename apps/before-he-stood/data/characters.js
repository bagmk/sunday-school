/* Speaker ids, display names, and name-plate colors. Owner: lead. See docs/SPEC.md §6.1 for fixed facts. */
(function () {
  var BHS = (window.BHS = window.BHS || {});

  BHS.characters = {
    menahem: { name: { ko: "므나헴", en: "Menahem" }, role: { ko: "가버나움의 서기관", en: "a scribe of Capernaum" }, color: "#9a6a2f" },
    hanan: { name: { ko: "하난", en: "Hanan" }, role: { ko: "므나헴의 제자", en: "Menahem's student" }, color: "#6b7a3c" },
    yonah: { name: { ko: "요나", en: "Yonah" }, role: { ko: "어부, 아셀의 친구", en: "a fisherman, Asher's friend" }, color: "#2f6680" },
    asher: { name: { ko: "아셀", en: "Asher" }, role: { ko: "침상의 사람", en: "the man on the bed" }, color: "#9b4f34" },
    mother: { name: { ko: "어머니", en: "Mom" }, role: { ko: "아셀의 어머니", en: "Asher's mother" }, color: "#7d5b7a" },
    brother: { name: { ko: "동생", en: "Little brother" }, role: { ko: "아셀의 동생", en: "Asher's little brother" }, color: "#8a6d3b" },
    neighbor: { name: { ko: "이웃", en: "Neighbor" }, role: { ko: "므나헴의 이웃", en: "Menahem's neighbor" }, color: "#5d5a54" },
    partners: { name: { ko: "그물 동료", en: "Net partner" }, role: { ko: "요나의 그물 동료들", en: "Yonah's net partners" }, color: "#4c6a5c" },
    passerby: { name: { ko: "행인", en: "Passerby" }, role: { ko: "골목의 행인", en: "someone in the lane" }, color: "#5d5a54" },
    crowd: { name: { ko: "무리", en: "The crowd" }, role: { ko: "모여든 사람들", en: "the gathered people" }, color: "#5d5a54" },
    scribes: { name: { ko: "서기관들", en: "The scribes" }, role: { ko: "어떤 서기관들", en: "some of the scribes" }, color: "#7a5a2c" },
    // Jesus is never drawn and speaks only through scripture keys.
    jesus: { name: { ko: "예수님", en: "Jesus" }, role: { ko: "", en: "" }, color: "#b8862b", drawn: false }
  };
})();
