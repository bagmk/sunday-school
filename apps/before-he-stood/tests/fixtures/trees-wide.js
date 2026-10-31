/*
 * tests/fixtures/trees-wide.js - FIXTURE ONLY. Story trees at their widest (SPEC 4.5 / 8 allow 4-6 cut
 * branches per route; this fixture goes one past that): every route has seven cut branches, three of
 * them at one choice point, and long branch titles (eight Korean syllables, up to thirty English
 * characters). Each route puts its crowded choice point somewhere else, so the layout meets every case:
 *   scribe: five choices, three branches in the middle (c3)
 *   friend: six choices, three branches at the bottom (c1), two at c3
 *   asher:  five choices, three branches at the top (c5, right under the star), two at c4
 * Load it into a page that already has the game (index.html), then call BHS_WIDE_TREES.install(): it
 * replaces BHS.routes with these shells (only what the story trees read: choices, options, endings) and
 * returns every seen id (true endings and cut branches) for the trees to mark. The shells are for the
 * story trees only; they are not meant to be played.
 */
(function () {
  var W = window;
  function T(ko, en) {
    return { ko: ko, en: en };
  }

  // levels: one entry per choice point, the cut branches that grow there as [id, ko, en].
  function shell(rid, good, levels) {
    var beats = [{ type: "scene", bg: "black" }];
    var bad = {};
    levels.forEach(function (cuts, k) {
      var ids = ["a", "b", "c", "d"];
      var options = [{ id: "a", text: T("계속 간다.", "Go on.") }];
      cuts.forEach(function (c, j) {
        options.push({ id: ids[j + 1], text: T("엉뚱한 길로 간다.", "Take the odd way."), bad: c[0] });
        bad[c[0]] = { title: T(c[1], c[2]), beats: [], last: T("여기서 끝.", "That's that.") };
      });
      beats.push({ type: "line", text: T("이야기가 이어진다.", "The story goes on.") });
      beats.push({ type: "choice", id: "c" + (k + 1), prompt: T("어떻게 할까?", "What now?"), options: options });
    });
    return { id: rid, beats: beats, endings: { good: { title: good, verse: "MT_9_2B", beats: [], last: T("끝.", "The end.") }, bad: bad } };
  }

  var routes = {
    scribe: shell("scribe", T("남은 질문 하나", "One Question Left"), [
      [["typo", "두루마리 오타 사냥", "The Great Typo Hunt in Psalms"]],
      [["wordWar", "죄라는 단어 대논쟁", "A Word War over the Word Sin"]],
      [
        ["guardhouse", "경비대 하룻밤 강의", "Leviticus for a Bored Soldier"],
        ["turnedBlue", "파랗게 물든 서기관", "The Scribe Who Turned Blue"],
        ["leftEarly", "중간에 슬쩍 퇴장", "Walked Out Before the End"]
      ],
      [["rebuttal", "반박문 마흔 장 완성", "Forty Pages of Rebuttal"]],
      [["figs", "무화과 걸고 팔씨름", "Arm-Wrestling on a Fish Barrel"]]
    ]),
    friend: shell("friend", T("집까지 함께 간 길", "All the Way Home Together"), [
      [
        ["bigCatch", "혼자 만선, 빈 바닷가", "Full Boat, Empty Shore"],
        ["fishChase", "생선 바구니 대소동", "The Great Fish Basket Chase"],
        ["shouting", "생선 통 위 고함 대회", "A Shouting Match on a Barrel"]
      ],
      [],
      [
        ["debate", "완벽한 승리, 빈 골목", "A Flawless Win, Empty Lane"],
        ["broadBack", "제일 넓은 등 뒤에서", "Stuck Behind the Broadest Back"]
      ],
      [["fainted", "내 침상 타고 집으로", "Carried Home on Our Own Bed"]],
      [["halfNews", "반쪽짜리 특종 소식", "Half a Scoop, Told Too Soon"]],
      []
    ]),
    asher: shell("asher", T("내가 일어나기 전", "Before I Stood"), [
      [["nap", "오 분만 더, 해 질 녘", "Five More Minutes Until Dusk"]],
      [["hotSprings", "디베랴 온천 나들이", "A Day at the Tiberias Springs"]],
      [],
      [
        ["beams", "들보 세기 또 세기", "Counting the Beams Once More"],
        ["longWay", "아무도 없는 뒷길로", "The Back Way, Away from All"]
      ],
      [
        ["boat", "바다로 간 침상 소동", "The Bed That Sailed Away"],
        ["eyesDown", "고개 숙인 채 끝까지", "Eyes Down All the Way Home"],
        ["stayedHome", "오늘은 집에 있을래", "Not Going Out Today, Thanks"]
      ]
    ])
  };

  function seenIds() {
    var out = [];
    Object.keys(routes).forEach(function (rid) {
      out.push(rid + "-good");
      Object.keys(routes[rid].endings.bad).forEach(function (id) {
        out.push(rid + "-bad-" + id);
      });
    });
    return out;
  }

  W.BHS_WIDE_TREES = {
    routes: routes,
    seenIds: seenIds,
    // Replaces the loaded routes with the shells; returns every seen id.
    install: function () {
      var BHS = (W.BHS = W.BHS || {});
      BHS.routes = BHS.routes || {};
      Object.keys(routes).forEach(function (rid) {
        BHS.routes[rid] = JSON.parse(JSON.stringify(routes[rid]));
      });
      return seenIds();
    }
  };
})();
