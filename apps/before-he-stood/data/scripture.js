/*
 * data/scripture.js - exact verse text for every key in SPEC section 4.3.
 * Korean: Korean Revised Version, New Edition (Gaeyeok Gaejeong). English: ESV (2016 text;
 * none of these verses changed in the ESV 2025 text edition).
 *
 * STATUS: every non-refOnly key was verified against published sources (Korean Bible
 * Society reader + a second site for Korean; esv.org + a second site for English).
 * Sources, whole verses and cut points per key: docs/scripture-sources.md.
 *
 * Conventions:
 * - Speech keys (speaker "jesus" or "scribes") hold only the spoken words,
 *   without enclosing quotation marks (the engine adds curly quotes).
 * - Narrator keys hold the text as published (inner ESV quotation marks kept).
 * - Partial keys (suffix A/B/N/Q/B1/B2, and any key whose text is a cut of the
 *   verse) carry `full: { ko, en }` with the whole published verse so QA can
 *   check that `ko`/`en` are exact contiguous substrings.
 * - refOnly keys have empty ko/en and may only be used with {{r:KEY}}.
 * - Typography follows the printed ESV: curly quotes, em dashes. The small-caps divine
 *   name is written "LORD" (plain text cannot carry small caps).
 * - DT_6_4 and IS_43_25: the ESV verse opens with a speech quotation mark that is not
 *   closed within the verse; it is dropped here (kept in `full`) because the engine
 *   adds its own quotes.
 */
(function () {
  var BHS = (window.BHS = window.BHS || {});

  // Whole verses shared by several partial keys.
  var MT_9_2 = {
    ko: "침상에 누운 중풍병자를 사람들이 데리고 오거늘 예수께서 그들의 믿음을 보시고 중풍병자에게 이르시되 작은 자야 안심하라 네 죄 사함을 받았느니라",
    en: "And behold, some people brought to him a paralytic, lying on a bed. And when Jesus saw their faith, he said to the paralytic, “Take heart, my son; your sins are forgiven.”"
  };
  var MT_9_3 = {
    ko: "어떤 서기관들이 속으로 이르되 이 사람이 신성을 모독하도다",
    en: "And behold, some of the scribes said to themselves, “This man is blaspheming.”"
  };
  var MT_9_4 = {
    ko: "예수께서 그 생각을 아시고 이르시되 너희가 어찌하여 마음에 악한 생각을 하느냐",
    en: "But Jesus, knowing their thoughts, said, “Why do you think evil in your hearts?"
  };
  var MT_9_6 = {
    ko: "그러나 인자가 세상에서 죄를 사하는 권능이 있는 줄을 너희로 알게 하려 하노라 하시고 중풍병자에게 말씀하시되 일어나 네 침상을 가지고 집으로 가라 하시니",
    en: "But that you may know that the Son of Man has authority on earth to forgive sins”—he then said to the paralytic—“Rise, pick up your bed and go home.”"
  };

  function r(ko, en) {
    return { ko: ko, en: en };
  }

  BHS.scripture = {
    // ---- Matthew 9:1-8 (the fixed event) ----
    MT_9_1: {
      ref: r("마 9:1", "Matt 9:1"),
      ko: "예수께서 배에 오르사 건너가 본 동네에 이르시니",
      en: "And getting into a boat he crossed over and came to his own city.",
      speaker: "narrator"
    },
    // The whole verse (verified text, same as `full` below). Used as the friend's memory verse,
    // because MT_9_2A alone stops mid-sentence ("he said to the paralytic,").
    MT_9_2: {
      ref: r("마 9:2", "Matt 9:2"),
      ko: MT_9_2.ko,
      en: MT_9_2.en,
      speaker: "narrator",
      full: MT_9_2
    },
    MT_9_2A: {
      ref: r("마 9:2", "Matt 9:2"),
      ko: "침상에 누운 중풍병자를 사람들이 데리고 오거늘 예수께서 그들의 믿음을 보시고 중풍병자에게 이르시되",
      en: "And behold, some people brought to him a paralytic, lying on a bed. And when Jesus saw their faith, he said to the paralytic,",
      speaker: "narrator",
      full: MT_9_2
    },
    MT_9_2B: {
      ref: r("마 9:2", "Matt 9:2"),
      ko: "작은 자야 안심하라 네 죄 사함을 받았느니라",
      en: "Take heart, my son; your sins are forgiven.",
      speaker: "jesus",
      full: MT_9_2
    },
    MT_9_2B1: {
      ref: r("마 9:2", "Matt 9:2"),
      ko: "작은 자야 안심하라",
      en: "Take heart, my son;",
      speaker: "jesus",
      full: MT_9_2
    },
    MT_9_2B2: {
      ref: r("마 9:2", "Matt 9:2"),
      ko: "네 죄 사함을 받았느니라",
      en: "your sins are forgiven.",
      speaker: "jesus",
      full: MT_9_2
    },
    MT_9_3: {
      ref: r("마 9:3", "Matt 9:3"),
      ko: MT_9_3.ko,
      en: MT_9_3.en,
      speaker: "narrator"
    },
    MT_9_3Q: {
      ref: r("마 9:3", "Matt 9:3"),
      ko: "이 사람이 신성을 모독하도다",
      en: "This man is blaspheming.",
      speaker: "scribes",
      full: MT_9_3
    },
    MT_9_4: {
      ref: r("마 9:4", "Matt 9:4"),
      ko: MT_9_4.ko,
      en: MT_9_4.en,
      speaker: "narrator"
    },
    MT_9_4N: {
      ref: r("마 9:4", "Matt 9:4"),
      ko: "예수께서 그 생각을 아시고 이르시되",
      en: "But Jesus, knowing their thoughts, said,",
      speaker: "narrator",
      full: MT_9_4
    },
    MT_9_4Q: {
      ref: r("마 9:4", "Matt 9:4"),
      ko: "너희가 어찌하여 마음에 악한 생각을 하느냐",
      en: "Why do you think evil in your hearts?",
      speaker: "jesus",
      full: MT_9_4
    },
    MT_9_5: {
      ref: r("마 9:5", "Matt 9:5"),
      ko: "네 죄 사함을 받았느니라 하는 말과 일어나 걸어가라 하는 말 중에 어느 것이 쉽겠느냐",
      en: "For which is easier, to say, ‘Your sins are forgiven,’ or to say, ‘Rise and walk’?",
      speaker: "jesus"
    },
    MT_9_6A: {
      ref: r("마 9:6", "Matt 9:6"),
      ko: "그러나 인자가 세상에서 죄를 사하는 권능이 있는 줄을 너희로 알게 하려 하노라",
      en: "But that you may know that the Son of Man has authority on earth to forgive sins",
      speaker: "jesus",
      full: MT_9_6
    },
    MT_9_6N: {
      ref: r("마 9:6", "Matt 9:6"),
      ko: "하시고 중풍병자에게 말씀하시되",
      en: "—he then said to the paralytic—",
      speaker: "narrator",
      full: MT_9_6
    },
    MT_9_6B: {
      ref: r("마 9:6", "Matt 9:6"),
      ko: "일어나 네 침상을 가지고 집으로 가라",
      en: "Rise, pick up your bed and go home.",
      speaker: "jesus",
      full: MT_9_6
    },
    MT_9_7: {
      ref: r("마 9:7", "Matt 9:7"),
      ko: "그가 일어나 집으로 돌아가거늘",
      en: "And he rose and went home.",
      speaker: "narrator"
    },
    MT_9_8: {
      ref: r("마 9:8", "Matt 9:8"),
      ko: "무리가 보고 두려워하며 이런 권능을 사람에게 주신 하나님께 영광을 돌리니라",
      en: "When the crowds saw it, they were afraid, and they glorified God, who had given such authority to men.",
      speaker: "narrator"
    },

    // ---- Context ----
    MT_7_29: {
      ref: r("마 7:29", "Matt 7:29"),
      ko: "이는 그 가르치시는 것이 권위 있는 자와 같고 그들의 서기관들과 같지 아니함일러라",
      en: "for he was teaching them as one who had authority, and not as their scribes.",
      speaker: "narrator"
    },
    MT_8_20Q: {
      ref: r("마 8:20", "Matt 8:20"),
      ko: "여우도 굴이 있고 공중의 새도 거처가 있으되 인자는 머리 둘 곳이 없다",
      en: "Foxes have holes, and birds of the air have nests, but the Son of Man has nowhere to lay his head.",
      speaker: "jesus",
      full: r(
        "예수께서 이르시되 여우도 굴이 있고 공중의 새도 거처가 있으되 인자는 머리 둘 곳이 없다 하시더라",
        "And Jesus said to him, “Foxes have holes, and birds of the air have nests, but the Son of Man has nowhere to lay his head.”"
      )
    },
    MT_8_26B: {
      ref: r("마 8:26", "Matt 8:26"),
      ko: "곧 일어나사 바람과 바다를 꾸짖으시니 아주 잔잔하게 되거늘",
      en: "Then he rose and rebuked the winds and the sea, and there was a great calm.",
      speaker: "narrator",
      full: r(
        "예수께서 이르시되 어찌하여 무서워하느냐 믿음이 작은 자들아 하시고 곧 일어나사 바람과 바다를 꾸짖으시니 아주 잔잔하게 되거늘",
        "And he said to them, “Why are you afraid, O you of little faith?” Then he rose and rebuked the winds and the sea, and there was a great calm."
      )
    },
    MT_8_34: {
      ref: r("마 8:34", "Matt 8:34"),
      ko: "온 시내가 예수를 만나려고 나가서 보고 그 지방에서 떠나시기를 간구하더라",
      en: "And behold, all the city came out to meet Jesus, and when they saw him, they begged him to leave their region.",
      speaker: "narrator"
    },
    // Daniel 7:14 (first clause): the Son of Man receives dominion. Menahem recalls it at the true ending.
    DN_7_14A: {
      ref: r("단 7:14", "Dan 7:14"),
      ko: "그에게 권세와 영광과 나라를 주고",
      en: "And to him was given dominion and glory and a kingdom,",
      speaker: "narrator",
      full: {
        ko: "그에게 권세와 영광과 나라를 주고 모든 백성과 나라들과 다른 언어를 말하는 모든 자들이 그를 섬기게 하였으니 그의 권세는 소멸되지 아니하는 영원한 권세요 그의 나라는 멸망하지 아니할 것이니라",
        en: "And to him was given dominion and glory and a kingdom, that all peoples, nations, and languages should serve him; his dominion is an everlasting dominion, which shall not pass away, and his kingdom one that shall not be destroyed."
      }
    },
    MT_26_65Q: {
      ref: r("마 26:65", "Matt 26:65"),
      ko: "그가 신성모독 하는 말을 하였으니",
      en: "He has uttered blasphemy.",
      speaker: "narrator",
      full: r(
        "이에 대제사장이 자기 옷을 찢으며 이르되 그가 신성모독 하는 말을 하였으니 어찌 더 증인을 요구하리요 보라 너희가 지금 이 신성모독 하는 말을 들었도다",
        "Then the high priest tore his robes and said, “He has uttered blasphemy. What further witnesses do we need? You have now heard his blasphemy."
      )
    },
    JN_9_2: {
      ref: r("요 9:2", "John 9:2"),
      ko: "랍비여 이 사람이 맹인으로 난 것이 누구의 죄로 인함이니이까 자기니이까 그의 부모니이까",
      en: "Rabbi, who sinned, this man or his parents, that he was born blind?",
      speaker: "narrator",
      full: r(
        "제자들이 물어 이르되 랍비여 이 사람이 맹인으로 난 것이 누구의 죄로 인함이니이까 자기니이까 그의 부모니이까",
        "And his disciples asked him, “Rabbi, who sinned, this man or his parents, that he was born blind?”"
      )
    },
    JN_9_3: {
      ref: r("요 9:3", "John 9:3"),
      ko: "이 사람이나 그 부모의 죄로 인한 것이 아니라 그에게서 하나님이 하시는 일을 나타내고자 하심이라",
      en: "It was not that this man sinned, or his parents, but that the works of God might be displayed in him.",
      speaker: "jesus",
      full: r(
        "예수께서 대답하시되 이 사람이나 그 부모의 죄로 인한 것이 아니라 그에게서 하나님이 하시는 일을 나타내고자 하심이라",
        "Jesus answered, “It was not that this man sinned, or his parents, but that the works of God might be displayed in him."
      )
    },
    PS_103_3: {
      ref: r("시 103:3", "Ps 103:3"),
      ko: "그가 네 모든 죄악을 사하시며 네 모든 병을 고치시며",
      en: "who forgives all your iniquity, who heals all your diseases,",
      speaker: "narrator"
    },
    PS_107_17: {
      ref: r("시 107:17", "Ps 107:17"),
      ko: "미련한 자들은 그들의 죄악의 길을 따르고 그들의 악을 범하기 때문에 고난을 받아",
      en: "Some were fools through their sinful ways, and because of their iniquities suffered affliction;",
      speaker: "narrator"
    },
    PS_107_20: {
      ref: r("시 107:20", "Ps 107:20"),
      ko: "그가 그의 말씀을 보내어 그들을 고치시고 위험한 지경에서 건지시는도다",
      en: "He sent out his word and healed them, and delivered them from their destruction.",
      speaker: "narrator"
    },
    PS_107_29: {
      ref: r("시 107:29", "Ps 107:29"),
      ko: "광풍을 고요하게 하사 물결도 잔잔하게 하시는도다",
      en: "He made the storm be still, and the waves of the sea were hushed.",
      speaker: "narrator"
    },
    PS_38_3: {
      ref: r("시 38:3", "Ps 38:3"),
      ko: "주의 진노로 말미암아 내 살에 성한 곳이 없사오며 나의 죄로 말미암아 내 뼈에 평안함이 없나이다",
      en: "There is no soundness in my flesh because of your indignation; there is no health in my bones because of my sin.",
      speaker: "narrator"
    },
    // Second half of Ps 38:3, for a character praying it (exact substring of PS_38_3).
    PS_38_3B: {
      ref: r("시 38:3", "Ps 38:3"),
      ko: "나의 죄로 말미암아 내 뼈에 평안함이 없나이다",
      en: "there is no health in my bones because of my sin.",
      speaker: "narrator",
      full: {
        ko: "주의 진노로 말미암아 내 살에 성한 곳이 없사오며 나의 죄로 말미암아 내 뼈에 평안함이 없나이다",
        en: "There is no soundness in my flesh because of your indignation; there is no health in my bones because of my sin."
      }
    },
    PS_41_4: {
      ref: r("시 41:4", "Ps 41:4"),
      ko: "내가 말하기를 여호와여 내게 은혜를 베푸소서 내가 주께 범죄하였사오니 나를 고치소서 하였나이다",
      en: "As for me, I said, “O LORD, be gracious to me; heal me, for I have sinned against you!”",
      speaker: "narrator"
    },
    // The prayer itself, for a character praying it in his own voice (exact substring of PS_41_4).
    PS_41_4Q: {
      ref: r("시 41:4", "Ps 41:4"),
      ko: "여호와여 내게 은혜를 베푸소서 내가 주께 범죄하였사오니 나를 고치소서",
      en: "O LORD, be gracious to me; heal me, for I have sinned against you!",
      speaker: "narrator",
      full: {
        ko: "내가 말하기를 여호와여 내게 은혜를 베푸소서 내가 주께 범죄하였사오니 나를 고치소서 하였나이다",
        en: "As for me, I said, “O LORD, be gracious to me; heal me, for I have sinned against you!”"
      }
    },
    PS_22_1A: {
      ref: r("시 22:1", "Ps 22:1"),
      ko: "내 하나님이여 내 하나님이여 어찌 나를 버리셨나이까",
      en: "My God, my God, why have you forsaken me?",
      speaker: "narrator",
      full: r(
        "내 하나님이여 내 하나님이여 어찌 나를 버리셨나이까 어찌 나를 멀리 하여 돕지 아니하시오며 내 신음 소리를 듣지 아니하시나이까",
        "My God, my God, why have you forsaken me? Why are you so far from saving me, from the words of my groaning?"
      )
    },
    DT_6_4: {
      ref: r("신 6:4", "Deut 6:4"),
      ko: "이스라엘아 들으라 우리 하나님 여호와는 오직 유일한 여호와이시니",
      en: "Hear, O Israel: The LORD our God, the LORD is one.",
      speaker: "narrator",
      full: r(
        "이스라엘아 들으라 우리 하나님 여호와는 오직 유일한 여호와이시니",
        "“Hear, O Israel: The LORD our God, the LORD is one."
      )
    },
    IS_43_25: {
      ref: r("사 43:25", "Isa 43:25"),
      ko: "나 곧 나는 나를 위하여 네 허물을 도말하는 자니 네 죄를 기억하지 아니하리라",
      en: "I, I am he who blots out your transgressions for my own sake, and I will not remember your sins.",
      speaker: "narrator",
      full: r(
        "나 곧 나는 나를 위하여 네 허물을 도말하는 자니 네 죄를 기억하지 아니하리라",
        "“I, I am he who blots out your transgressions for my own sake, and I will not remember your sins."
      )
    },
    LV_4_31B: {
      ref: r("레 4:31", "Lev 4:31"),
      ko: "제사장이 그를 위하여 속죄한즉 그가 사함을 받으리라",
      en: "And the priest shall make atonement for him, and he shall be forgiven.",
      speaker: "narrator",
      full: r(
        "그 모든 기름을 화목제물의 기름을 떼어낸 것 같이 떼어내 제단 위에서 불살라 여호와께 향기롭게 할지니 제사장이 그를 위하여 속죄한즉 그가 사함을 받으리라",
        "And all its fat he shall remove, as the fat is removed from the peace offerings, and the priest shall burn it on the altar for a pleasing aroma to the LORD. And the priest shall make atonement for him, and he shall be forgiven."
      )
    },
    LV_24_16A: {
      ref: r("레 24:16", "Lev 24:16"),
      ko: "여호와의 이름을 모독하면 그를 반드시 죽일지니 온 회중이 돌로 그를 칠 것이니라",
      en: "Whoever blasphemes the name of the LORD shall surely be put to death. All the congregation shall stone him.",
      speaker: "narrator",
      full: r(
        "여호와의 이름을 모독하면 그를 반드시 죽일지니 온 회중이 돌로 그를 칠 것이니라 거류민이든지 본토인이든지 여호와의 이름을 모독하면 그를 죽일지니라",
        "Whoever blasphemes the name of the LORD shall surely be put to death. All the congregation shall stone him. The sojourner as well as the native, when he blasphemes the Name, shall be put to death."
      )
    },
    SA2_12_13B: {
      ref: r("삼하 12:13", "2 Sam 12:13"),
      ko: "여호와께서도 당신의 죄를 사하셨나니",
      en: "The LORD also has put away your sin",
      speaker: "narrator",
      full: r(
        "다윗이 나단에게 이르되 내가 여호와께 죄를 범하였노라 하매 나단이 다윗에게 말하되 여호와께서도 당신의 죄를 사하셨나니 당신이 죽지 아니하려니와",
        "David said to Nathan, “I have sinned against the LORD.” And Nathan said to David, “The LORD also has put away your sin; you shall not die."
      )
    },
    KI1_8_39B: {
      ref: r("왕상 8:39", "1 Kgs 8:39"),
      ko: "주만 홀로 사람의 마음을 다 아심이니이다",
      en: "for you, you only, know the hearts of all the children of mankind",
      speaker: "narrator",
      full: r(
        "주는 계신 곳 하늘에서 들으시고 사하시며 각 사람의 마음을 아시오니 그들의 모든 행위대로 행하사 갚으시옵소서 주만 홀로 사람의 마음을 다 아심이니이다",
        "then hear in heaven your dwelling place and forgive and act and render to each whose heart you know, according to all his ways (for you, you only, know the hearts of all the children of mankind),"
      )
    },

    // ---- Reference-only keys (use only with {{r:KEY}}) ----
    MT_8_19_20: { ref: r("마 8:19–20", "Matt 8:19–20"), ko: "", en: "", refOnly: true },
    MT_8_23_27: { ref: r("마 8:23–27", "Matt 8:23–27"), ko: "", en: "", refOnly: true },
    MT_8_28_34: { ref: r("마 8:28–34", "Matt 8:28–34"), ko: "", en: "", refOnly: true },
    MT_20_2: { ref: r("마 20:2", "Matt 20:2"), ko: "", en: "", refOnly: true },
    MT_26_65: { ref: r("마 26:65", "Matt 26:65"), ko: "", en: "", refOnly: true },
    MK_2_4: { ref: r("막 2:4", "Mark 2:4"), ko: "", en: "", refOnly: true },
    MK_2_7: { ref: r("막 2:7", "Mark 2:7"), ko: "", en: "", refOnly: true },
    DT_13_1_3: { ref: r("신 13:1–3", "Deut 13:1–3"), ko: "", en: "", refOnly: true },
    JB_42_7: { ref: r("욥 42:7", "Job 42:7"), ko: "", en: "", refOnly: true },
    LK_13_2_3: { ref: r("눅 13:2–3", "Luke 13:2–3"), ko: "", en: "", refOnly: true },
    LV_13_15: { ref: r("레 13–15장", "Lev 13–15"), ko: "", en: "", refOnly: true }
  };
})();
