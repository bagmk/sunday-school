/* Shared narrative: prologue, route select. Owner: lead. */
(function () {
  var BHS = (window.BHS = window.BHS || {});

  BHS.common = {
    prologue: [
      { type: "scene", bg: "black" },
      {
        type: "line",
        speaker: "sign",
        text: {
          ko: "― 두루마리 펴는 소리. 돌길 위 발소리. 바닥에 끌리는 침상. ―",
          en: "— A scroll unrolling. Footsteps on a stone lane. A bed scraping the floor. —"
        }
      },
      { type: "scene", bg: "shore_dawn", caption: { ko: "갈릴리 바다 · 가버나움", en: "Sea of Galilee · Capernaum" } },
      { type: "line", text: { ko: "가버나움. 예수라는 사람이 배를 타고 돌아온다.", en: "Capernaum. A man named Jesus is coming back by boat." } },
      {
        type: "line",
        // Both rumors point to the sermon text (Matt 8:23-27 and 8:28-34) before the game's own story (9:1-8).
        text: {
          ko: "소문이 그보다 먼저 와 있었다. 말 한마디로 폭풍을 잠재웠다는 소문, 건너편에서 귀신들을 쫓아냈다는 소문.",
          en: "Rumors got here before he did: he calmed a storm with a single word, and across the lake, he drove out demons."
        }
      },
      {
        type: "line",
        text: {
          ko: "하지만 오늘 그가 할 첫마디는 아무도 예상하지 못했다.",
          en: "But no one expected the first thing he would say today."
        }
      }
    ],

    routeSelect: {
      prompt: { ko: "누구의 눈으로 그날을 볼까요?", en: "Through whose eyes will you see this day?" },
      // The scribe's unspoken thought (route 1) is answered in routes 2 and 3; Asher standing up comes last.
      hint: { ko: "추천 순서: 서기관 → 친구 → 아셀", en: "Suggested order: scribe → friend → Asher" }
    }
  };
})();
