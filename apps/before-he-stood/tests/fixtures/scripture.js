/*
 * tests/fixtures/scripture.js - FIXTURE ONLY. A few verse entries so the engine tests and the
 * fixture page run without data/scripture.js. Merges only keys that are missing, so it never
 * overrides the scripture agent's verified file when both are loaded.
 */
(function () {
  var BHS = (window.BHS = window.BHS || {});
  var S = (BHS.scripture = BHS.scripture || {});

  function r(ko, en) {
    return { ko: ko, en: en };
  }

  var FIXTURE = {
    MT_9_1: { ref: r("마 9:1", "Matt 9:1"), ko: "예수께서 배에 오르사 건너가 본 동네에 이르시니", en: "And getting into a boat he crossed over and came to his own city.", speaker: "narrator" },
    MT_9_2A: { ref: r("마 9:2", "Matt 9:2"), ko: "침상에 누운 중풍병자를 사람들이 데리고 오거늘 예수께서 그들의 믿음을 보시고 중풍병자에게 이르시되", en: "And behold, some people brought to him a paralytic, lying on a bed. And when Jesus saw their faith, he said to the paralytic,", speaker: "narrator" },
    MT_9_2B: { ref: r("마 9:2", "Matt 9:2"), ko: "작은 자야 안심하라 네 죄 사함을 받았느니라", en: "Take heart, my son; your sins are forgiven.", speaker: "jesus" },
    MT_9_2B1: { ref: r("마 9:2", "Matt 9:2"), ko: "작은 자야 안심하라", en: "Take heart, my son;", speaker: "jesus" },
    MT_9_2B2: { ref: r("마 9:2", "Matt 9:2"), ko: "네 죄 사함을 받았느니라", en: "your sins are forgiven.", speaker: "jesus" },
    MT_9_3: { ref: r("마 9:3", "Matt 9:3"), ko: "어떤 서기관들이 속으로 이르되 이 사람이 신성을 모독하도다", en: "And behold, some of the scribes said to themselves, “This man is blaspheming.”", speaker: "narrator" },
    MT_9_3Q: { ref: r("마 9:3", "Matt 9:3"), ko: "이 사람이 신성을 모독하도다", en: "This man is blaspheming.", speaker: "scribes" },
    PS_41_4: { ref: r("시 41:4", "Ps 41:4"), ko: "내가 말하기를 여호와여 나에게 은혜를 베푸소서 내가 주께 범죄하였사오니 나를 고치소서 하였나이다", en: "As for me, I said, “O LORD, be gracious to me; heal me, for I have sinned against you!”", speaker: "narrator" },
    MT_9_4N: { ref: r("마 9:4", "Matt 9:4"), ko: "예수께서 그 생각을 아시고 이르시되", en: "But Jesus, knowing their thoughts, said,", speaker: "narrator" },
    MT_9_4Q: { ref: r("마 9:4", "Matt 9:4"), ko: "너희가 어찌하여 마음에 악한 생각을 하느냐", en: "Why do you think evil in your hearts?", speaker: "jesus" },
    MT_9_5: { ref: r("마 9:5", "Matt 9:5"), ko: "네 죄 사함을 받았느니라 하는 말과 일어나 걸어가라 하는 말 중에 어느 것이 쉽겠느냐", en: "For which is easier, to say, ‘Your sins are forgiven,’ or to say, ‘Rise and walk’?", speaker: "jesus" },
    MT_9_6A: { ref: r("마 9:6", "Matt 9:6"), ko: "그러나 인자가 세상에서 죄를 사하는 권능이 있는 줄을 너희로 알게 하려 하노라", en: "But that you may know that the Son of Man has authority on earth to forgive sins", speaker: "jesus" },
    MT_9_6N: { ref: r("마 9:6", "Matt 9:6"), ko: "하시고 중풍병자에게 말씀하시되", en: "—he then said to the paralytic—", speaker: "narrator" },
    MT_9_6B: { ref: r("마 9:6", "Matt 9:6"), ko: "일어나 네 침상을 가지고 집으로 가라", en: "Rise, pick up your bed and go home.", speaker: "jesus" },
    MT_9_7: { ref: r("마 9:7", "Matt 9:7"), ko: "그가 일어나 집으로 돌아가거늘", en: "And he rose and went home.", speaker: "narrator" },
    MT_9_8: { ref: r("마 9:8", "Matt 9:8"), ko: "무리가 보고 두려워하며 이런 권능을 사람에게 주신 하나님께 영광을 돌리니라", en: "When the crowds saw it, they were afraid, and they glorified God, who had given such authority to men.", speaker: "narrator" },
    PS_103_3: { ref: r("시 103:3", "Ps 103:3"), ko: "그가 네 모든 죄악을 사하시며 네 모든 병을 고치시며", en: "who forgives all your iniquity, who heals all your diseases,", speaker: "narrator" },
    SA2_12_13B: { ref: r("삼하 12:13", "2 Sam 12:13"), ko: "여호와께서도 당신의 죄를 사하셨나니", en: "The LORD also has put away your sin", speaker: "narrator" },
    MT_20_2: { ref: r("마 20:2", "Matt 20:2"), ko: "", en: "", refOnly: true },
    MK_2_4: { ref: r("막 2:4", "Mark 2:4"), ko: "", en: "", refOnly: true }
  };

  Object.keys(FIXTURE).forEach(function (k) {
    if (!S[k]) S[k] = FIXTURE[k];
  });
})();
