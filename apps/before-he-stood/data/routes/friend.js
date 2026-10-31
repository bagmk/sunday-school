/*
 * Friend route, v4 story mode: "A Corner of the Bed" (Yonah). Owner: friend writer.
 * Rules: docs/SPEC.md, version 4 (route shape, choices and endings: sections 3.5, 4.5, 4.6, 8).
 * Schema basics, canon and guardrails: docs/SPEC.md sections 3.3, 3.4, 4.5, 6 and 7.
 *
 * Shape: one story with five choices (c1-c5). Every option has exactly one outcome:
 * - continue (default): optional reaction, then the story goes on;
 * - bad: "<id>": the reaction plays, then endings.bad[<id>] (a cut branch with a snip card);
 * - scold: { speaker, text }: the line plays, the option is removed, the same choice is asked again.
 *
 * Choice map:
 * - c1 shore (3 options): a continue | b bad bigCatch | c scold (partners)
 * - c2 Asher's house (4): a, b, c continue | d scold (Asher)
 * - c3 THE LANE (4): a, b continue | c bad armWrestle (the quarrel) | d bad stayedInLane
 * - c4 right after MT_9_2B (4): a, b continue | c scold (Asher) | d bad fainted
 * - c5 right after MT_9_8 (2): a, b continue (the ending's beat answers the pick)
 *
 * Teacher's note v4.1 (SPEC 3.5): the lane quarrel ends in an absurd contest (an arm-wrestling match on
 * a fish barrel), and the crowd cut is a faint, not a walk-out.
 * Asher's portrait is drawn lying until MT_9_6B has been shown, so in a cut branch that shows him
 * standing (fainted, stayedInLane) his words stay inside narration, never as an "asher" line.
 *
 * Canon kept: Yonah's arrival words are identical to the Asher route; the passerby line is
 * byte-identical to SPEC 6.3; the crowd sequence follows SPEC 6.4 on every true path; the
 * scribes' 9:3 thought is never shown here (only that they go silent and stiff); carriers are
 * never numbered; no roof, no house at the crowd. Jesus speaks only through verse beats.
 * Nothing ties "your sins are forgiven" to Asher's morning question (QA v3 theology S2/S3).
 * Every cut branch leaves the event unchanged: Jesus still forgives and heals Asher that day.
 */
(function () {
  var BHS = (window.BHS = window.BHS || {});
  BHS.routes = BHS.routes || {};

  // Tiny builders. They only return plain objects in the SPEC 4.5 shape.
  function t(ko, en) {
    return { ko: ko, en: en };
  }
  function say(speaker, ko, en, id) {
    var b = { type: "line", text: t(ko, en) };
    if (speaker) b.speaker = speaker;
    if (id) b.id = id;
    return b;
  }
  function verse(key, id) {
    var b = { type: "verse", key: key };
    if (id) b.id = id;
    return b;
  }
  function light(level) {
    return { type: "fx", fx: "light", level: level };
  }

  BHS.routes.friend = {
    id: "friend",

    beats: [
      // ===== Dawn: the shore. The rumor arrives inside the first choice. =====
      // Prompts of choices with a scold option are asked again after the scold, so they describe
      // a state or a line that can repeat ("shouts"), not a one-time arrival ("runs up").
      { type: "scene", bg: "shore_dawn", caption: t("새벽 · 바닷가", "Dawn · The shore") },
      {
        type: "choice",
        id: "c1",
        prompt: t(
          "그물 동료가 소리친다. “요나! 그분이 배로 돌아오신대! 폭풍도 말 한마디로 잠재우셨대!”",
          "A net partner shouts, “Yonah! Jesus is coming back by boat! He calmed a storm with one word!”"
        ),
        options: [
          { id: "a", text: t("“아셀한테 가자!”", "“Let's go get Asher!”") },
          {
            id: "b",
            text: t("“다들 가면, 오늘 바다는 내 차지네.”", "“If everyone's going, the sea's all mine today.”"),
            bad: "bigCatch",
            // The partners do what Yonah skipped: they go and get Asher (the event still happens).
            reaction: [say(null, "동료들은 아셀을 데리러 뛰어간다. 요나는 혼자 배를 민다.", "His partners run off to get Asher. Yonah pushes his boat out alone.")]
          },
          {
            id: "c",
            text: t("“소문이잖아. 확인부터 하자.”", "“It's only a rumor. Let's check first.”"),
            scold: { speaker: "partners", text: t("확인하다가 배 떠난다!", "Keep checking and you'll miss the boat!") }
          }
        ]
      },

      // ===== Morning: Asher's house =====
      { type: "scene", bg: "asher_home", caption: t("아침 · 아셀의 집", "Morning · Asher's house") },
      // Yonah's words are identical to the Asher route (same moment, other side).
      say(
        null,
        "요나가 아셀네 집 문을 벌컥 연다. “아셀! 그분이 배로 돌아오신대. 같이 가자!”",
        "Yonah throws open Asher's door. “Asher! Jesus is coming back by boat. Come with me!”",
        "home-arrive"
      ),
      {
        type: "choice",
        id: "c2",
        prompt: t(
          "아셀은 천장만 본다. 네 해째 보는 천장이다. “내가 뭘 잘못해서 이렇게 된 걸까?”",
          "Asher stares at the ceiling. Four years of that ceiling. “What did I do wrong to end up like this?”"
        ),
        options: [
          {
            id: "a",
            text: t("“네 잘못 아니야.”", "“It's not your fault.”"),
            reaction: [say("asher", "네가 그걸 어떻게 알아? …됐어, 가자. 떨어뜨리지만 마.", "How would you know? …Whatever. Let's go. Just don't drop me.")]
          },
          {
            id: "b",
            text: t("“이유 몰라도 돼. 그냥 가자.”", "“We don't need to know why. Let's just go.”"),
            reaction: [say("asher", "다들 이유부터 묻던데. …좋아. 떨어뜨리지만 마.", "Everyone else wants a reason first. …Okay. Just don't drop me.")]
          },
          {
            id: "c",
            text: t("“누가 너한테 그런 말 했어?”", "“Did someone say that to you?”"),
            reaction: [say("asher", "대놓고는 안 해. 눈으로 하지. …그래도 가 볼게.", "Not out loud. They say it with their eyes. …I'll go anyway.")]
          },
          {
            id: "d",
            text: t("“흠… 짚이는 데라도 있어?”", "“Hmm… any guesses?”"),
            scold: { speaker: "asher", text: t("너까지 그러기야?", "Not you too.") }
          }
        ]
      },

      // ===== Late morning: THE LANE (SPEC 6.3) =====
      { type: "scene", bg: "lane", caption: t("늦은 아침 · 골목", "Late morning · The lane") },
      say(
        null,
        "요나와 동료들이 침상을 들고 골목을 내려간다. 서기관 므나헴이 젊은 제자와 비켜서다가, 잠깐 아셀과 눈이 마주친다.",
        "Yonah and his partners carry the bed down the lane. Menahem the scribe steps aside with his young student, and for a moment his eyes meet Asher's.",
        "lane-carry"
      ),
      say(
        "passerby",
        "고통 뒤에 무슨 사연이 있는지 누가 알겠어. 저 사람은 무슨 잘못을 했기에 저렇게 됐을까.",
        "Who knows what's behind suffering like that. What did he do to end up like that?",
        "lane-passerby"
      ),
      {
        type: "choice",
        id: "c3",
        prompt: t("아셀도 다 들었다.", "Asher heard every word."),
        options: [
          {
            id: "a",
            text: t("“우리 지금 그분께 가는 길이거든요!”", "“We're taking him to Jesus, actually!”"),
            reaction: [say("asher", "…방금 좀 멋있었다.", "…Okay, that was kind of cool.")]
          },
          {
            id: "b",
            text: t("아셀에게 속삭인다. “끝까지 간다.”", "Whisper to Asher, “We're going all the way.”"),
            reaction: [say("asher", "알았어. 근데 네 손 떨려.", "Okay. But your hands are shaking.")]
          },
          {
            id: "c",
            text: t("“아저씨, 방금 그 말 취소하세요!”", "“Hey, mister! Take that back!”"),
            bad: "armWrestle",
            // The bed goes on without him, so Asher still reaches Jesus.
            reaction: [
              say(
                null,
                "요나가 귀퉁이를 놓고 행인 앞을 막아선다. 동료들은 한숨을 쉬고 침상을 든 채 먼저 간다.",
                "Yonah lets go of his corner and blocks the passerby's way. His partners sigh and carry the bed on ahead."
              )
            ]
          },
          {
            id: "d",
            text: t("“…다들 쳐다보잖아. 오늘은 안 되겠어.”", "“…Everyone's staring. I can't do this today.”"),
            bad: "stayedInLane",
            reaction: [
              say(
                null,
                "요나가 귀퉁이를 내려놓는다. 동료들은 말없이 침상을 다시 들고 내려간다.",
                "Yonah sets his corner down. Without a word, his partners lift the bed again and carry it on."
              )
            ]
          }
        ]
      },

      // ===== Around noon: THE CROWD (SPEC 6.4, full sequence, MT_9_1 omitted) =====
      { type: "scene", bg: "crowd", caption: t("정오 무렵 · 바닷가 공터", "Around noon · Open ground by the shore") },
      light("soft"),
      say(
        null,
        "요나와 동료들이 마침내 그분 앞에 침상을 내려놓는다. 귀퉁이를 잡은 손들은 그물 일로 트고 굳은살이 박였다.",
        "At last, Yonah and his partners set the bed down in front of Jesus. The hands on its corners are chapped and callused from the nets.",
        "crowd-bed-down"
      ),
      verse("MT_9_2A", "crowd-9-2a"),
      say("sign", "그 손들 가운데 네 손이 있다.", "Your hands are among them.", "hands-yours"),
      light("bright"),
      verse("MT_9_2B", "crowd-9-2b"),
      light("soft"),
      {
        type: "choice",
        id: "c4",
        // Also says that no cause was given: the passerby and Asher both asked about one (SPEC 7.2).
        prompt: t("다리 얘기는 한마디도 없다. 아셀이 왜 이렇게 됐는지도.", "Not one word about his legs. Or about why this happened to him."),
        options: [
          {
            id: "a",
            text: t("아셀의 얼굴을 본다.", "Look at Asher's face."),
            // Tied to "take heart" on purpose: not to "your sins are forgiven", not to his body
            // (no "sin removed, body released"; nothing answers his morning question).
            reaction: [say(null, "안심하라는 말씀에, 굳어 있던 아셀의 얼굴이 조금 풀린다.", "When Jesus tells him to take heart, Asher's tense face softens a little.")]
          },
          {
            id: "b",
            text: t("왜 그 말씀부터 하셨지?", "Why did he say that first?"),
            // Points at the person, never at a cause for his condition (SPEC 7.2).
            reaction: [
              say(
                "thought",
                "모르겠다. 그래도 그분은 다리가 아니라 아셀한테 말씀하셨다.",
                "I don't know. But he talked to Asher, not to his legs."
              )
            ]
          },
          {
            id: "c",
            text: t("“저기요, 다리도 좀요!”", "“Um, excuse me—his legs too?”"),
            scold: { speaker: "asher", text: t("쉿! 나한테 하신 말씀이야.", "Shh! He was talking to me.") }
          },
          {
            id: "d",
            text: t("“꿈 아니지? 누가 나 좀 꼬집어 봐!”", "“Is this a dream? Somebody pinch me!”"),
            bad: "fainted",
            // Not a walk-out (teacher's note v4.1): he faints from sheer excitement; a partner catches him.
            reaction: [
              say(
                null,
                "동료가 요나의 볼을 살짝 꼬집는다. “꿈 아니야.” 요나는 눈을 끔뻑이더니 동료 품에 스르르 쓰러진다.",
                "A partner gives Yonah's cheek a little pinch. “Not a dream.” Yonah blinks, then faints right into his partner's arms."
              )
            ]
          }
        ]
      },
      // Matthew 9:3 from the friend's side: silence and stiff faces, never the words of the thought.
      say(
        null,
        "맨 앞의 서기관 몇이 입을 꾹 다문 채 굳는다. 골목에서 본 므나헴도 있다.",
        "Up front, a few scribes go silent and stiff. Menahem from the lane is one of them.",
        "scribes-stiff"
      ),
      verse("MT_9_4N", "crowd-9-4n"),
      verse("MT_9_4Q", "crowd-9-4q"),
      say("thought", "누구한테 하시는 말씀이지? 저 사람들, 아무 말도 안 했는데.", "Who's he talking to? Those men never said a word.", "no-one-spoke"),
      verse("MT_9_5", "crowd-9-5"),
      verse("MT_9_6A", "crowd-9-6a"),
      verse("MT_9_6N", "crowd-9-6n"),
      light("bright"),
      verse("MT_9_6B", "crowd-9-6b"),
      light("soft"),
      verse("MT_9_7", "crowd-9-7"),
      verse("MT_9_8", "crowd-9-8"),
      {
        type: "choice",
        id: "c5",
        prompt: t(
          "요나는 입만 벌리고 서 있다. 동네 사람들이 몰려든다. “대체 무슨 일이야?”",
          "Yonah just stands there, mouth open. Neighbors crowd around him. “What on earth just happened?”"
        ),
        options: [
          { id: "a", text: t("“아셀한테 직접 물어봐!”", "“Go ask Asher yourself!”") },
          { id: "b", text: t("“죄 사함이 먼저였어. 걷는 건 그다음.”", "“Forgiveness came first. Walking came after.”") }
        ]
      },
      // The moment is over; the light of his presence fades before the ending.
      light("off")
    ],

    endings: {
      // True ending (engine): title card, memory verse card, beats, last line, then the story tree.
      good: {
        title: t("집까지 같이", "All the Way Home"),
        // The whole verse: a complete sentence for the memory card (MT_9_2A stops at "said to the paralytic,").
        verse: "MT_9_2",
        beats: [
          // Asher returns Yonah's morning words ("Come with me"); one variant per c5 pick.
          {
            type: "line",
            id: "good-ask-him",
            when: { choice: "c5", is: "a" },
            text: t(
              "사람들이 우르르 아셀에게 몰려간다. 침상을 든 아셀이 겨우 빠져나와 요나를 돌아본다. “같이 가자.”",
              "Everyone rushes over to Asher. Bed in hand, he squeezes free and looks back at Yonah. “Come with me.”"
            )
          },
          {
            type: "line",
            id: "good-first-words",
            when: { not: { choice: "c5", is: "a" } },
            text: t(
              "사람들이 고개를 갸웃하는 사이, 침상을 든 아셀이 요나를 돌아본다. “같이 가자.”",
              "While they're still scratching their heads, Asher, bed in hand, looks back at Yonah. “Come with me.”"
            )
          }
        ],
        last: t("너는 친구를 여기까지 들고 왔다. 집까지는 친구가 침상을 들고 갔다.", "You carried your friend this far. The rest of the way home, he carried the bed.")
      },

      // Cut branches (engine: reaction, beats, last line, then the snip card with the title).
      bad: {
        // c1 b: the best day of fishing, on the one day it did not matter.
        bigCatch: {
          title: t("혼자 만선", "Full Boat, Empty Shore"),
          beats: [
            say(null, "그물이 묵직하다. 끌어올려 보니, 평생 이렇게 많이 잡은 건 처음이다.", "The net is heavy. He hauls it in: the biggest catch of his life."),
            say(null, "“이것 좀 봐!” 돌아보니 바닷가에 아무도 없다.", "“Look at this!” He turns around. There's no one on the shore."),
            say(
              null,
              "한참 뒤 동료들이 뛰어온다. 고기는 쳐다보지도 않는다. “요나! 아셀이 걸어!”",
              "Much later, his partners come running. They don't even glance at the fish. “Yonah! Asher's walking!”"
            )
          ],
          last: t("평생 제일 많이 잡은 날. 하필 아무도 고기 얘기를 안 하는 날이었다.", "The biggest catch of his life—on the one day nobody cared about fish.")
        },

        // c3 c: the quarrel with the passerby turns into an arm-wrestling match across a fish stall (a playful
        // contest, SPEC 4.6). The passerby takes his words back only after losing every round, not because
        // of the healing (so the question isn't left standing for anyone who isn't healed). The canon
        // passerby line stays in the lane beat above.
        armWrestle: {
          title: t("세기의 팔씨름", "Arm-Wrestle of the Century"),
          beats: [
            say("passerby", "싫은데? 팔씨름에서 이기면 취소해 주지.", "Nope. Beat me at arm-wrestling, and I'll take it back."),
            say(
              null,
              "곧 생선 좌판 위에서 팔씨름 한판이 벌어진다. 골목 사람들은 무화과를 걸고 내기를 한다. 첫판은 요나가 이긴다!",
              "Soon they're arm-wrestling across a fish stall, and the whole lane is betting figs. Yonah takes the first round!"
            ),
            say("passerby", "방금 건 연습이야! 삼세판! …아니, 다섯 판!", "That one was just practice! Best of three! …No, best of five!")
          ],
          // Not Asher walking up the lane: that picture belongs to stayedInLane, at the same choice.
          last: t(
            "행인은 판판이 다 지고서야 그 말을 취소했다. 그사이 바닷가에서는 아셀이 일어났다.",
            "The passerby took it back only after losing every single round. Meanwhile, down at the shore, Asher stood up."
          )
        },

        // c3 d: he sets the bed down because everyone is staring; the others carry Asher on.
        stayedInLane: {
          title: t("오늘은 안 돼", "Not Today"),
          beats: [
            say(null, "한참 뒤, 누군가 골목을 걸어 올라온다. 자기 침상을 든 아셀이다.", "A long while later, someone comes walking up the lane. It's Asher, carrying his own bed."),
            // Asher's own words carry the first words this branch never heard (forgiveness, then healing).
            say(
              null,
              "아셀이 요나를 지나며 씩 웃는다. “그분이 나한테 먼저 하신 말씀이 있어. 나중에 들려줄게.”",
              "Asher grins as he passes Yonah. “He said something to me first. I'll tell you later.”"
            )
          ],
          last: t("결국 다들 쳐다보긴 했다. 걸어 올라오는 아셀을.", "Everyone stared after all—at Asher, walking up the lane.")
        },

        // c4 d: he faints from excitement right after the first words, misses everything after them, and
        // wakes up on the very bed he brought, with Asher (walking) on one of its corners. The event holds:
        // Asher rose, picked up his bed and went home (MT 9:7); it just had Yonah on it.
        // The scene keeps the normal pov: the sky_carried art already shows the view from the bed, and a
        // lying pov here would replay Asher's rise animation on Try again.
        fainted: {
          title: t("자리 바꾸기", "Switching Places"),
          beats: [
            { type: "scene", bg: "sky_carried", caption: t("오후 · 집으로 가는 길", "Afternoon · The road home") },
            say(null, "요나가 눈을 뜬다. 하늘이 흔들거린다. 누가 요나를 침상째 들고 가고 있다.", "Yonah opens his eyes. The sky is swaying. Someone is carrying him on a bed."),
            say(
              null,
              "침상 귀퉁이를 잡은 손 하나를 따라 올려다본다. 아셀이다. 걸으면서 침상을 들고 있다.",
              "He follows one of the hands on the corners up to a face. It's Asher—walking, and carrying the bed."
            ),
            say(null, "아셀이 요나를 내려다보며 웃는다. “깼어? 이번엔 내가 들 차례야.”", "Asher looks down at him and grins. “You're up? My turn to carry.”")
          ],
          last: t("그날 아셀은 자기 침상을 들고 집에 갔다. 생각보다 좀 무거웠다.", "That day, Asher picked up his bed and went home. It was a little heavier than he expected.")
        }
      }
    }
  };
})();
