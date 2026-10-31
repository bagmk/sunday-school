/* Game metadata: titles, route cards, notices. Owner: lead. */
(function () {
  var BHS = (window.BHS = window.BHS || {});

  BHS.meta = {
    // 2.0.0: short routes (4 choices, cut endings), no final screen, no teacher page.
    version: "2.0.0",

    title: { ko: "그가 일어나기 전", en: "Before He Stood" },
    subtitle: { ko: "그날, 가버나움 · 마태복음 9:1–8", en: "Capernaum, That Day · Matthew 9:1–8" },

    disclaimer: {
      ko: "사건은 마태복음 9:1–8을 그대로 따라가요. 이름, 대화, 인물들의 사연과 잘린 가지들은 지어낸 이야기예요.",
      en: "The event follows Matthew 9:1–8. The names, conversations, backstories and side branches are made up."
    },

    bibleNotice: {
      ko: "성경 본문: 성경전서 개역개정판 © 대한성서공회. 영어 본문: ESV® Bible © 2001 Crossway.",
      en: "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. Korean: 성경전서 개역개정판 © 대한성서공회."
    },

    routeOrder: ["scribe", "friend", "asher"],

    routes: {
      scribe: {
        protagonist: "menahem",
        name: { ko: "서기관 므나헴", en: "Menahem, the scribe" },
        title: { ko: "아침에 읽은 문장", en: "The Line I Read This Morning" },
        tagline: { ko: "말씀을 지키려는 사람", en: "He guards what belongs to God." },
        firstLine: {
          ko: "하나님께 속한 것을 사람이 함부로 말하게 둘 수는 없다.",
          en: "I can't let anyone lightly claim what belongs to God."
        }
      },
      friend: {
        protagonist: "yonah",
        name: { ko: "친구 요나", en: "Yonah, the friend" },
        title: { ko: "침상의 귀퉁이", en: "A Corner of the Bed" },
        tagline: { ko: "친구를 예수님께 데려가는 사람", en: "He carries a friend to Jesus." },
        firstLine: {
          ko: "아셀이 다시 걸을 수 있다면, 오늘 내가 할 수 있는 건 뭐든 하겠다.",
          en: "If it means Asher can walk again, I'll do whatever I can today."
        }
      },
      asher: {
        protagonist: "asher",
        name: { ko: "침상의 아셀", en: "Asher, on the bed" },
        title: { ko: "나를 뭐라고 부르셨지", en: "What Did He Call Me?" },
        tagline: { ko: "예수님 앞에 누워 있는 사람", en: "He lies on a bed in front of Jesus." },
        firstLine: {
          ko: "사람들은 내가 왜 이렇게 됐는지 묻는다. 이제는 나도 그 이유가 두렵다.",
          en: "People ask why I ended up like this. Now I'm afraid of the answer too."
        }
      }
    }
  };
})();
