/*
 * tests/fixtures/routes.js - FIXTURE ONLY. Three small demo routes (ids scribe / friend / asher) in the
 * version 4 format (story mode: options continue, cut the story with `bad`, or are scolded away with
 * `scold`; one true ending with a memory verse; cut branches end on the snip card). They exercise every
 * beat type, condition form, token and FX in SPEC 4.5. Used by tests/engine.test.mjs and tests/fixture.html.
 * Real routes live in data/routes/*.js.
 *   scribe: four choices; a scold by Hanan, a narrated scold, four cut branches, pinned thought + read
 *           receipt, echo highlight from a flag, endingPreface and endingCoda.
 *   friend: four choices; flags, all/any/not conditions, one cut branch reachable from two choices,
 *           a scold by Asher, no coda.
 *   asher:  four choices; scolds answered by his own thought ("일어나기"), label presses, pov changes,
 *           two cut branches.
 * In every choice the first continue option is the true path, so fastForward's default pick plays a
 * route to its true ending. Each fixture route registers only if the real route is absent, unless
 * window.BHS_FORCE_FIXTURE is set.
 */
(function () {
  var BHS = (window.BHS = window.BHS || {});
  BHS.routes = BHS.routes || {};
  var force = !!window.BHS_FORCE_FIXTURE;

  function T(ko, en) {
    return { ko: ko, en: en };
  }
  function line(speaker, ko, en, extra) {
    var b = { type: "line", text: T(ko, en) };
    if (speaker) b.speaker = speaker;
    if (extra) Object.keys(extra).forEach(function (k) { b[k] = extra[k]; });
    return b;
  }
  function opt(id, ko, en, extra) {
    var o = { id: id, text: T(ko, en) };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function choice(id, pko, pen, options) {
    return { type: "choice", id: id, prompt: T(pko, pen), options: options };
  }
  function scold(speaker, ko, en) {
    var s = { text: T(ko, en) };
    if (speaker) s.speaker = speaker;
    return s;
  }
  var PASSERBY = line(
    "passerby",
    "고통 뒤에 무슨 사연이 있는지 누가 알겠어. 저 사람은 무슨 잘못을 했기에 저렇게 됐을까.",
    "Who knows what's behind suffering like that. What did he do to end up like that?"
  );

  // ------------------------------------------------------------------ scribe
  var scribe = {
    id: "scribe",
    beats: [
      { type: "scene", bg: "dawn_lamp", caption: T("새벽 · 므나헴의 방", "Dawn · Menahem's room") },
      line(null, "등잔불이 흔들린다. 두루마리가 펼쳐져 있다.", "The lamp flickers. A scroll lies open."),
      { type: "verse", key: "PS_103_3" },
      line("hanan", "선생님, 누가 용서하고, 누가 고치시는 거예요?", "Teacher, who forgives, and who heals?"),
      choice("c1", "하난에게 뭐라고 할까?", "What do you tell Hanan?", [
        opt("a", "“주님이시다. 주어를 분명히 해라.”", "“The Lord. Be clear about who acts.”", { set: { mark: "he" }, reaction: [line("thought", "*그가*에 밑줄을 긋는다.", "You underline *who*.")] }),
        opt("b", "두루마리에서 오타부터 찾는다.", "First, hunt for typos in the scroll.", { bad: "typo", reaction: [line(null, "므나헴이 두루마리에 코를 박는다.", "Menahem buries his nose in the scroll.")] }),
        opt("c", "“그건 네가 알아서 생각해라.”", "“Work it out yourself.”", { scold: scold("hanan", "선생님, 그건 좀…", "Teacher, come on…") }),
        opt("d", "“그 사람을 직접 보러 가자.”", "“Let's go and see this man ourselves.”", { set: { mark: "whole" } })
      ]),
      line("thought", "하나님께 속한 것은 하나님께 속한 것이다.", "What belongs to God belongs to God."),
      line("neighbor", "예수라는 사람이 돌아온대요!", "That Jesus is coming back!"),
      { type: "scene", bg: "lane", caption: T("늦은 아침 · 골목", "Late morning · The lane") },
      PASSERBY,
      line(null, "므나헴은 길을 비킨다. 침상 위의 눈과 잠깐 마주친다.", "Menahem steps aside. For a moment he meets the eyes of the man on the bed."),
      { type: "scene", bg: "crowd", caption: T("정오 무렵 · 바닷가 공터", "Around noon · Open ground by the shore") },
      { type: "fx", fx: "light", level: "soft" },
      { type: "verse", key: "MT_9_2A" },
      { type: "fx", fx: "light", level: "bright" },
      { type: "fx", fx: "hush" },
      {
        type: "fx",
        fx: "echoVerse",
        key: "PS_103_3",
        highlight: { flag: "mark", map: { he: { ko: ["그가"], en: ["who forgives"] }, whole: "*" } }
      },
      { type: "verse", key: "MT_9_2B" },
      { type: "fx", fx: "light", level: "soft" },
      { type: "fx", fx: "pinThought", items: ["verse:MT_9_3Q"] },
      { type: "verse", key: "MT_9_3Q", speaker: "scribes" },
      choice("c2", "이제 어떻게 할까?", "What now?", [
        opt("a", "“신성모독이다!” 외치며 앞으로 나간다.", "Shout “Blasphemy!” and push forward.", { bad: "guardhouse", reaction: [line(null, "병사 둘이 므나헴의 팔을 잡는다.", "Two soldiers take Menahem by the arms.")] }),
        opt("b", "속으로만 생각하고 지켜본다.", "Keep it inside and watch.", { reaction: [line("thought", "말이 목까지 차오른다. 그러나 입 밖으로는 나오지 않는다.", "The words rise in your throat. They never leave your mouth.")] })
      ]),
      { type: "fx", fx: "readReceipt" },
      { type: "verse", key: "MT_9_4N" },
      { type: "verse", key: "MT_9_4Q" },
      { type: "fx", fx: "unpinThought" },
      { type: "verse", key: "MT_9_5" },
      choice("c3", "어느 쪽이 쉬울까?", "Which is easier?", [
        opt("a", "기록장에 ‘신성모독’이라고 크게 적는다.", "Write BLASPHEMY in big letters.", { scold: scold(null, "하난이 말없이 기록장을 덮는다.", "Without a word, Hanan closes the notes.") }),
        opt("b", "집에 가서 반박문부터 쓴다.", "Go home and write a rebuttal.", { bad: "rebuttal" }),
        opt("c", "대답을 기다린다.", "Wait for the answer.", {
          reaction: [
            line("thought", "아침에 밑줄 그은 주어가 떠오른다.", "The subject you underlined this morning comes back.", { when: { flag: "mark", is: "he" } }),
            line("thought", "끝까지 들어 보자.", "Let's hear him out.", { when: { not: { flag: "mark", is: "he" } } })
          ]
        })
      ]),
      { type: "verse", key: "MT_9_6A" },
      { type: "verse", key: "MT_9_6N" },
      { type: "fx", fx: "light", level: "bright" },
      { type: "verse", key: "MT_9_6B" },
      { type: "fx", fx: "light", level: "soft" },
      { type: "verse", key: "MT_9_7" },
      { type: "verse", key: "MT_9_8" },
      choice("c4", "오늘 밤 기록장에 무엇을 적을까?", "Tonight, what goes in his notes?", [
        opt("a", "“그는 한 사람을 집에 보냈다.”", "“He sent one man home.”"),
        opt("b", "“하나님께 영광을.”", "“Glory to God.”", { reaction: [line(null, "므나헴의 입술이 무리의 말을 따라 움직인다.", "Menahem's lips move with the crowd's words.")] }),
        opt("c", "아무 일도 없었다고 적는다.", "Write that nothing happened.", { bad: "forgot" }),
        opt("d", "“신성모독.”", "“Blasphemy.”", { scold: scold("hanan", "선생님, 방금 보신 건요?", "Teacher, what about what you just saw?") })
      ]),
      { type: "fx", fx: "light", level: "off" }
    ],
    endingPreface: [line(null, "기록장을 편다.", "He opens his notes.")],
    endings: {
      good: {
        title: T("누가 말했는가", "Who Spoke"),
        verse: "MT_9_6A",
        beats: [
          line(null, "므나헴은 그 주장을 누구보다 정확히 알아들었다.", "Menahem understood that claim better than anyone."),
          line(null, "그는 한 사람을 집에 보냈다. 기록장의 마지막 줄이다.", "He sent one man home. The last line in his notes.", { when: { choice: "c4", is: "a" } })
        ],
        last: T("하나님에 대해서는 네가 옳았다. 남은 질문은 그에 대한 것이다.", "About God, you were right. What's left is a question about him.")
      },
      bad: {
        typo: {
          title: T("오타 사냥", "Typo Hunt"),
          beats: [line("sign", "몇 시간 뒤", "Hours later"), line("hanan", "선생님, 다들 갔어요.", "Teacher, everyone's gone.")],
          last: T("오타는 없었다. 그날 일어난 일도 못 봤다.", "There were no typos. He missed what happened that day, too.")
        },
        guardhouse: {
          title: T("수비대의 밤", "Night in the Guardhouse"),
          beats: [line(null, "므나헴은 밤새 병사에게 레위기를 설명한다.", "All night, Menahem explains Leviticus to a soldier."), line(null, "병사는 하품을 한다.", "The soldier yawns.")],
          last: T("그 시간에 한 사람이 자기 침상을 들고 집에 갔다.", "Meanwhile, a man carried his own bed home.")
        },
        rebuttal: {
          title: T("반박문", "The Rebuttal"),
          beats: [line(null, "므나헴은 밤새 반박문을 쓴다.", "All night, Menahem writes a rebuttal."), line("hanan", "선생님, 그분은 벌써 대답하셨대요.", "Teacher, they say he already answered.")],
          last: T("질문은 좋았다. 대답은 듣지 못했다.", "Good question. He never heard the answer.")
        },
        forgot: {
          title: T("빈 기록장", "Blank Page"),
          beats: [line(null, "기록장의 그날은 비어 있다.", "That day stays blank in his notes."), line(null, "그러나 가버나움 사람들은 다 기억한다.", "But all of Capernaum remembers.")],
          last: T("적지 않아도 그 일은 일어났다.", "Not writing it down didn't undo it.")
        }
      }
    },
    endingCoda: [line("sign", "― 등잔이 꺼진다 ―", "— the lamp goes out —")]
  };

  // ------------------------------------------------------------------ friend
  var friend = {
    id: "friend",
    beats: [
      { type: "scene", bg: "shore_dawn", caption: T("새벽 · 바닷가", "Dawn · The shore") },
      line("partners", "요나! 그분이 배로 돌아오신대!", "Yonah! Jesus is coming back by boat!"),
      choice("c1", "뭐라고 할까?", "What do you say?", [
        opt("a", "“아셀을 데려가자!”", "“Let's get Asher!”"),
        opt("b", "“오늘 고기 잡기 딱 좋은 날이네.”", "“Great day for fishing.”", { bad: "bigCatch", reaction: [line("partners", "그물이 터지겠다!", "The nets are bursting!")] })
      ]),
      { type: "scene", bg: "asher_home", caption: T("아침 · 아셀의 집", "Morning · Asher's house") },
      line("asher", "내가 뭘 잘못해서 이렇게 된 걸까?", "What did I do wrong to end up like this?"),
      choice("c2", "아셀에게 뭐라고 할까?", "What do you tell Asher?", [
        opt("a", "“너 잘못 아니야.”", "“It's not your fault.”", { set: { near: true }, reaction: [line("asher", "네가 그걸 어떻게 알아?", "How would you know?")] }),
        opt("b", "“음, 짐작 가는 거 있어?”", "“Hmm, any guesses?”", { scold: scold("asher", "너까지 그러기야?", "Not you too.") }),
        opt("c", "“설명 안 해도 돼. 그래도 도울 거야.”", "“You don't have to explain. I'm helping anyway.”", {
          set: { near: true, stood: true },
          reaction: [line("asher", "…다들 이유부터 묻던데.", "…Everyone else asks why first.")]
        })
      ]),
      { type: "scene", bg: "lane", caption: T("늦은 아침 · 골목", "Late morning · The lane") },
      PASSERBY,
      line(null, "서기관 한 사람이 비켜선다.", "A scribe steps aside."),
      choice("c3", "행인에게?", "To the passerby?", [
        opt("a", "“우리 지금 그분께 가는 길이에요!”", "“We're on our way to him!”"),
        opt("b", "행인과 끝까지 따진다.", "Argue it out with the passerby.", { bad: "debate" }),
        opt("c", "아셀에게 속삭인다. “끝까지 간다.”", "Whisper to Asher, “All the way.”", { set: { whisper: true } }),
        opt("d", "침상을 내려놓는다. “다들 쳐다보잖아.”", "Set the bed down. “Everyone's staring.”", { bad: "lane" })
      ]),
      { type: "scene", bg: "crowd", caption: T("정오 무렵 · 바닷가 공터", "Around noon · Open ground by the shore") },
      { type: "fx", fx: "light", level: "soft" },
      line(null, "침상이 그분 앞에 내려진다.", "The bed is set down before Jesus."),
      { type: "verse", key: "MT_9_2A" },
      line(null, "그 손들 가운데 네 손이 있다.", "Your hands are among those hands.", { when: { flag: "near", is: true } }),
      { type: "fx", fx: "light", level: "bright" },
      { type: "verse", key: "MT_9_2B" },
      { type: "fx", fx: "light", level: "soft" },
      choice("c4", "무슨 생각이 드나?", "What crosses your mind?", [
        opt("a", "“저기요, 다리도 좀요!”", "“Excuse me, his legs too, please!”", { scold: scold("asher", "쉿! 나한테 하신 말씀이야.", "Shh! He's talking to me.") }),
        opt("b", "아셀의 얼굴을 본다.", "Look at Asher's face."),
        opt("c", "행인을 찾아가 다시 따진다.", "Go find the passerby and argue again.", { bad: "debate" }),
        opt("d", "“그분만 하실 수 있는 말인데…”", "“Only God can say that…”")
      ]),
      line(null, "서기관 몇 사람의 얼굴이 굳는다. 아무도 입을 열지 않는다.", "A few scribes go stiff. No one says a word."),
      { type: "verse", key: "MT_9_4N" },
      { type: "verse", key: "MT_9_4Q" },
      { type: "verse", key: "MT_9_5" },
      { type: "verse", key: "MT_9_6A" },
      { type: "verse", key: "MT_9_6N" },
      { type: "fx", fx: "light", level: "bright" },
      { type: "verse", key: "MT_9_6B" },
      { type: "fx", fx: "light", level: "soft" },
      { type: "verse", key: "MT_9_7" },
      { type: "verse", key: "MT_9_8" },
      line(null, "요나는 물러서서 아셀이 자기 침상을 들게 둔다.", "Yonah steps back and lets Asher carry his own bed.", { when: { any: [{ choice: "c4", is: "b" }, { flag: "stood", is: true }] } }),
      line(null, "행인 앞을 막아섰던 손이 이제는 비어 있다.", "The hands that blocked the passerby are empty now.", { when: { all: [{ choice: "c3", is: "a" }, { not: { flag: "whisper", is: true } }] } })
    ],
    endings: {
      good: {
        title: T("침상의 귀퉁이", "A Corner of the Bed"),
        verse: "MT_9_2A",
        beats: [line(null, "요나는 빈손을 내려다본다.", "Yonah looks down at his empty hands.")],
        last: T("너는 그를 여기까지 들고 왔다. 집까지는 그가 침상을 들고 갔다.", "You carried him here. He carried the bed home.")
      },
      bad: {
        bigCatch: {
          title: T("만선", "The Big Catch"),
          beats: [line(null, "배가 고기로 가득 찬다.", "The boat fills with fish."), line("partners", "오늘 아셀네 동네가 난리였대.", "They say Asher's street went wild today.")],
          last: T("그물은 가득 찼다. 침상 한쪽 귀퉁이는 비어 있었다.", "The nets were full. One corner of the bed was empty.")
        },
        debate: {
          title: T("말싸움 챔피언", "Debate Champion"),
          beats: [line(null, "요나가 말싸움에서 이긴다.", "Yonah wins the argument."), line(null, "돌아보니 무리가 흩어지고 있다.", "He turns around. The crowd is going home.")],
          last: T("말로는 이겼다. 그 사이 다른 손들이 침상을 들었다.", "He won the argument. Other hands carried the bed.")
        },
        lane: {
          title: T("골목에 남다", "Left in the Lane"),
          beats: [line(null, "다른 사람들이 침상을 들고 간다.", "The others carry the bed on."), line(null, "아셀이 자기 침상을 들고 요나 곁을 지나간다.", "Asher walks past Yonah carrying his own bed.")],
          last: T("시선은 피했다. 그 순간도 함께 피했다.", "He dodged the stares. He dodged the moment too.")
        }
      }
    }
  };

  // ------------------------------------------------------------------ asher
  var asher = {
    id: "asher",
    beats: [
      { type: "scene", bg: "asher_ceiling", pov: "lying", caption: T("새벽 · 아셀의 집", "Dawn · Asher's house") },
      line(null, "들보와 갈대 지붕. 네 해째 아침마다 보는 풍경이다.", "Beams and a reed roof. Four years of the same view every morning."),
      choice("c1", "아침에 뭘 할까?", "What now, this morning?", [
        opt("a", "{{v:PS_103_3}}", "{{v:PS_103_3}}", { reaction: [line("thought", "용서하시는 분과 고치시는 분. 같은 분이다.", "The one who forgives and the one who heals. The same one.")] }),
        opt("b", "일어나기", "Get up", { scold: scold("thought", "다리가 대답하지 않는다.", "My legs don't answer.") }),
        opt("c", "“조금만 더 자자…”", "“Just a little longer…”", { bad: "nap" }),
        opt("d", "들보를 다시 센다.", "Count the beams again.")
      ]),
      line("yonah", "아셀! 그분이 배로 돌아오신대. 같이 가자!", "Asher! Jesus is coming back by boat. Come with me!"),
      choice("c2", "뭐라고 하지?", "What do I say?", [
        opt("a", "“가고 싶어. 근데 겁나.”", "“I want to go. But I'm scared.”"),
        opt("b", "“싫어. 안 나갈래.”", "“No. I'm not going out.”", { bad: "stayedHome" }),
        opt("c", "밖으로 나가기", "Go outside", { scold: scold("thought", "그러려면 다리가 필요하다.", "That would take legs.") })
      ]),
      { type: "scene", bg: "sky_carried", pov: "lying", caption: T("늦은 아침 · 골목", "Late morning · The lane") },
      PASSERBY,
      { type: "scene", bg: "crowd_lying", pov: "lying", caption: T("정오 무렵 · 그분 앞", "Around noon · Before Jesus") },
      { type: "fx", fx: "light", level: "soft" },
      { type: "verse", key: "MT_9_2A" },
      { type: "fx", fx: "light", level: "bright" },
      { type: "verse", key: "MT_9_2B1" },
      line("thought", "나를 뭐라고 부르셨지?", "What did he call me?"),
      { type: "fx", fx: "hush" },
      { type: "verse", key: "MT_9_2B2" },
      { type: "fx", fx: "light", level: "soft" },
      choice("c3", "가장 먼저 든 생각은?", "My first thought?", [
        opt("a", "일어나 본다.", "Try to get up.", { scold: scold("thought", "다리는 그대로다.", "My legs haven't changed.") }),
        opt("b", "정말 나에게 하시는 말씀인가.", "Is he really saying this to me?")
      ]),
      line(null, "서기관 몇 사람의 얼굴이 굳는다.", "A few scribes' faces go still."),
      { type: "verse", key: "MT_9_4N" },
      { type: "verse", key: "MT_9_4Q" },
      { type: "verse", key: "MT_9_5" },
      { type: "verse", key: "MT_9_6A" },
      { type: "verse", key: "MT_9_6N" },
      { type: "fx", fx: "light", level: "bright" },
      { type: "verse", key: "MT_9_6B" },
      { type: "press", id: "press-getup", label: T("일어나기", "Get up") },
      { type: "fx", fx: "pov", pov: "standing" },
      { type: "scene", bg: "crowd", pov: "standing" },
      { type: "fx", fx: "light", level: "soft" },
      { type: "press", id: "press-bed", label: T("침상을 들어", "Pick up your bed") },
      { type: "press", id: "press-home", label: T("집으로", "Go home") },
      { type: "verse", key: "MT_9_7" },
      { type: "verse", key: "MT_9_8" },
      choice("c4", "내 첫마디는?", "My first words?", [
        opt("a", "“그분이 나한테 먼저 말을 거셨어.”", "“He spoke to me first.”"),
        opt("b", "“요나, 침상 좀 들어 줘.”", "“Yonah, carry the bed for me.”", { scold: scold("yonah", "그건 아니지! 네 침상은 네가 들어!", "No way! Your bed, you carry it!") }),
        opt("c", "“집까지 달리기 시합이다.”", "“Race you home.”")
      ])
    ],
    endingPreface: [{ type: "fx", fx: "light", level: "off" }],
    endings: {
      good: {
        title: T("나를 뭐라고 부르셨지", "What Did He Call Me?"),
        verse: "MT_9_2B",
        beats: [line("thought", "그분이 나를 그렇게 부르셨다.", "That's what he called me.")],
        last: T("너를 들고 다니던 침상을, 이제 네가 들고 문을 연다.", "Now you carry the bed that used to carry you, and you open the door.")
      },
      bad: {
        nap: {
          title: T("조금만 더", "Just a Bit Longer"),
          beats: [line("sign", "해 질 녘", "At dusk"), line("brother", "형! 동네가 난리 났었어!", "Hey! The whole town went wild!")],
          last: T("푹 잤다. 다리는 여전하다.", "He slept well. His legs are the same.")
        },
        stayedHome: {
          title: T("집에 남다", "Stayed Home"),
          beats: [line(null, "요나는 한참 서 있다가 혼자 나간다.", "Yonah stands there a long time, then leaves alone."), line(null, "멀리서 함성이 들린다.", "A shout rises in the distance.")],
          last: T("문은 열려 있었다. 아셀은 나가지 않았다.", "The door was open. Asher didn't go out.")
        }
      }
    }
  };

  BHS.fixtureRoutes = { scribe: scribe, friend: friend, asher: asher };
  ["scribe", "friend", "asher"].forEach(function (id) {
    if (force || !BHS.routes[id]) BHS.routes[id] = BHS.fixtureRoutes[id];
  });
})();
