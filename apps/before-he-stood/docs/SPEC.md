# SPEC — 그가 일어나기 전 · Before He Stood

Version 4 (2026-10-18): story mode. Single source of truth for every agent on this project.
- Version 4 merges the story-mode addendum (the former docs/SPEC-v4-story.md, including the teacher's notes in §0.1): one true ending per character, cut branches with "Try again", scolded options, the story tree, no numbers on screen. It replaces version 3's lenses, scoring, double weight, mismatch line, cut endings, 3 × 4 endings gallery and lens balance.
- The route files (data/routes/*.js) are the story. docs/scenario-v2.md (Korean) stays as background for voices, callbacks and tone; where it describes lenses or 10-choice routes, this file wins.
- THIS FILE owns structure, schema, canon facts, glossary, and guardrails. On conflict about structure or facts, this file wins.
- Never edit a file you do not own (see §1). Put needed changes under "Requests" in your final report.

---

## 0. What we are building

- A mobile-first, bilingual (Korean/English) visual novel for a Korean-American church youth class (4–5 students, ages 14–18). Based on Matthew 9:1–8.
- The class plays ALL THREE characters together on one TV in a single lesson, about 5 minutes per character read aloud (a phone still plays one character alone). Each character's route is ONE story that the class pushes forward through 5–6 choices. A wrong choice can cut the story off (a short, funny scene, then "Try again" from that choice) or get scolded away (the option disappears and the same choice is asked again). Each character has exactly ONE ending, the true ending, which closes with that character's memory verse. After it, the route's story tree shows what the class saw: the trunk up to the star and the branches that got cut. The sermon on Matthew 8:23–9:8 follows.
- Choices never change the biblical event (§4.6). They decide whether the protagonist stays in the story.
- The story is the point: no numbers on screen during play (no ①②③, no counts, no scores, no visible 1–4 badges on options), no labels such as "good/bad/true ending" anywhere on screen.
- Static site: plain HTML/CSS/JS. No framework, no build step to play, no network required (Google Fonts optional, always with fallbacks). Must run (a) by double-clicking index.html (file://), (b) on GitHub Pages, (c) as a claude.ai artifact (single-file build, see §5.7).
- The site is the game only: index.html (plus the single-file builds). There is no teacher page and no final screen with fill-in blanks; after the true ending the player sees the route's story tree.
- **All code comments in English only. Never write Korean in code comments.** Korean is fine inside data strings.
- No audio. No external images. All art is code (SVG).

### 0.1 The teacher's direction (2026-10-18, verbatim intent)
- "Rather than a dating-sim where you collect different endings, it's more fun to push the story forward. A wrong choice can just end the game (e.g. Asher refuses to go → not healed, the end; the scribe says something outrageous → spends the night in a guardhouse), or a friend / another scribe scolds you ('그건 아니지!') and the option disappears. Only ONE final ending per character; reaching it shows Scripture and the ending. Options can be 2 or 4. Make the options snappy and fun, and weird choices lead to weird (funny) endings — fun for the kids, but not unbiblical."
- "The wording is awkward. Write in easier words, like a native speaker, not translationese. Make the text easier, readable and natural. Trying to steer toward endings and having numbers pop up in the middle makes it awkward. Focus on the story; don't force it into a format."
- (Asher) "Make 일어나기 / 밖으로 just options among the choices — it says it can't, and the option turns off. Don't keep them in the middle of the screen."
- (Asher) "If Asher says he won't go out, end the route right there": he stays home and is not healed (a cut branch; no scolding, no second chance inside the story; the class can use Try again).
- (With a screenshot of the old 「① 누가? · 그분은 누구신가」 card) "Don't force the story along with choices like this — it can just end. Numbers that keep appearing feel off. Keep ONE ending; before it, the story can get cut off. At the very end just show, as a tree, what we saw. Twelve endings aren't needed — one is enough. Only the branches that got pruned (cut off) go in the tree."

### 0.2 Writing first (applies to every string)
- **Native Korean first.** Write each line as a Korean speaker would actually say or write it today — then write the English as a native English speaker would, not as a translation of the Korean. Meaning should match; wording should not be word-for-word.
- **Easy words, short sentences.** High-school readers, read aloud on a TV. One idea per sentence. Avoid literary/archaic vocabulary (e.g. 해명, 연유, 무릇), stiff written forms (~하는 것이다, ~에 대한, ~을 통해, 하나의, 그는 ~했다 in every line), and English calques in Korean (그녀/그 for every reference, passive constructions, "그것은").
- **Dialogue sounds like people.** Yonah and Asher talk like close friends (반말, teasing, short). Hanan speaks politely but bluntly to his teacher. Menahem is precise and a bit stiff — that is his character, but still natural Korean. Narration is plain and visual.
- **Story, not scaffolding.** No numbers or game labels inside the story: no lens numbers, no counters, no "sentence count", no stats, no meta-commentary about choices or endings. The story never stops to explain itself.
- Scripture text stays exactly as published (개역개정 / ESV) through verse beats and tokens; only our own lines change.
- English data uses straight apostrophes (') inside words; curly quotes “ ” mark spoken words.

## 1. Files and ownership

| Path | Owner | Notes |
| --- | --- | --- |
| docs/SPEC.md, docs/scenario-v2.md | lead | read-only for agents |
| data/meta.js | lead | titles, route cards, notices |
| data/characters.js | lead | speaker ids, names, colors |
| data/common.js | lead | prologue, route-select prompt and suggested order |
| data/scripture.js, docs/scripture-sources.md | scripture agent | exact verse text; keys fixed in §4.3 |
| data/routes/scribe.js | scribe writer | the story, its true ending and cut branches (titles included) |
| data/routes/friend.js | friend writer | |
| data/routes/asher.js | asher writer | |
| drafts/ (when present) | writers | working drafts; never loaded by the game |
| index.html, css/style.css, js/engine.js, js/ui.js, js/main.js, data/ui-strings.js, tools/build-single.mjs, tests/* (incl. fixtures) | engine agent | |
| js/art.js | art agent | scene backgrounds as SVG |
| js/portraits.js | portrait agent | character busts as SVG |
| tools/validate.mjs, tools/playtest.mjs, tools/serve.mjs, qa/* | engine + tools agent | |
| README.md | lead | |

Do not run `git commit`; the lead commits.

## 2. Global namespace and load order

Every data/JS file is a classic script (no `import`/`export`, no `fetch`, no modules), ES2019, wrapped in an IIFE:

```js
(function () {
  var BHS = (window.BHS = window.BHS || {});
  BHS.routes = BHS.routes || {};
  BHS.routes.scribe = { /* ... */ };
})();
```

Load order in index.html (fixed):
1. data/meta.js
2. data/characters.js
3. data/scripture.js
4. data/common.js
5. data/ui-strings.js
6. data/routes/scribe.js, data/routes/friend.js, data/routes/asher.js
7. js/engine.js, js/art.js, js/portraits.js, js/ui.js, js/main.js

Data files must not depend on each other at load time. js/engine.js must not touch the DOM at load time, so Node can load it with a `window` shim (`globalThis.window = globalThis`).

## 3. Text model

### 3.1 T — bilingual text
`T = { ko: string, en: string }`. Both required and non-empty. Plain text only, no HTML, no line breaks (use separate beats). Allowed inline markup: `*emphasis*` → rendered as `<em>`.

### 3.2 Tokens inside T strings
- `{{v:KEY}}` → verse text of KEY in the same language. The engine adds curly quotes “…” around it. Writers never add quotes around a token.
- `{{r:KEY}}` → verse reference in the same language (`시 107:17` / `Ps 107:17`).
- `{{var:NAME}}` → integer runtime variable (kept for older data; the version 4 routes use none).

**Rule:** any text presented as a quotation of Scripture must be a `{{v:KEY}}` token or a `verse` beat. Never type scripture wording directly into a string. Paraphrase without quotation marks is fine and may cite `{{r:KEY}}`.

### 3.3 Length limits (per language, checked by the validator)
| Field | ko soft / hard | en soft / hard |
| --- | --- | --- |
| line text | 80 / 110 chars | 150 / 200 chars |
| option text | 45 / 60 | 90 / 120 |
| choice prompt | 50 / 70 | 100 / 130 |

Token text counts as its rendered length. Options aim shorter: ≤ 24 Korean / ≤ 48 English characters (the validator lists longer ones as INFO). Our own strings carry no ASCII digits (numbers are written as words: 「마흔 장」, 「오 분만 더」, "forty pages"); verse text, references and ids are exempt. Screen budget and reading time: §4.5.

### 3.4 Style per language
Korean
- Narration: short declarative sentences, mostly present tense (「등잔불이 흔들린다.」). Second person 「너」 only in ending narration and last lines.
- `thought` speaker: the protagonist's inner voice, 반말 monologue.
- Honorifics: Hanan → Menahem 존댓말 (~요/~습니다; calls him 「선생님」). Menahem → Hanan 반말 (~해라/~지). Yonah ↔ Asher 반말. Asher → mother 존댓말 (~요; 「어머니」). Mother → Asher 반말. Neighbor, passerby, partners: casual.
- Teen-readable. No modern slang, no heavy archaic style outside Scripture.

English
- Natural, concise, contemporary, not slangy. Present tense narration. Second person "you" only where the Korean uses 너.
- Hanan calls Menahem "Teacher". Asher calls his mother "Mom" (never "Mother").
- Scripture only via tokens (ESV).

Both
- Same meaning, same beats. No jokes in one language only.
- Never mention game mechanics in story text (no "points", "lens", "ending", "choice", no numbers).

### 3.5 Route shape (version 4)
- Each route is ONE linear story with **5–6 choices** (`c1`…`c6`). Each option either **continues**, **cuts** the story into a short funny cut branch (`bad`), or is **scolded** away (`scold`) (§4.5).
- Exactly ONE **true ending** per route (`endings.good`), reached only by continuing through every choice. It closes with the character's **memory verse** (a big verse card), then the last line (§4.6).
**Teacher's note (v4.1):** "At the lane, where the passerby talks, every story branches in a way that isn't much fun. Let them quarrel a bit and get snipped in sillier ways. And near the end, with Jesus, the cuts are just 'leaving' — make some sillier ones there too." So every route has at least one comic quarrel at THE LANE that ends in an absurd cut branch, and at least one absurd cut branch in THE CROWD that is not simply walking away.
- **4–6 cut branches** per route (`endings.bad`): short, funny, a little absurd, never mean, never unbiblical. They are not endings to collect; on screen they are pruned branches of the story tree. After one, the class can **try again from that choice**.
- **Option voice — 톡톡 튀게:** short; spoken words in “ ”, thoughts without quotes, actions as plain verbs (「침상을 내려놓는다.」). Each choice should feel like a real debate for a class: one sincere option, one bold option, one funny/weird option. No option names its outcome; a weird option tempts because it is funny, not because it is labeled. Humor comes from situations and the characters' wit (Asher's dry voice, Yonah's impulsiveness, Menahem's pedantry, Hanan's bluntness) — never from Asher's body or disability, never from violence or injury.
- **Scolders:** scribe route → Hanan (polite but blunt: 「선생님, 그건 좀…」); friend route → a net partner (`partners`) or Asher; Asher route → Yonah, and Asher's own thought for his "can't" options. Scold lines are short and funny (「그건 아니지!」 energy), never cruel.
- No evening or epilogue scenes on the true path: it ends at the crowd or one step away (Asher's doorway at most). A cut branch may end somewhere else later that day.
- Keep: canon and voices; THE LANE (§6.3) and THE CROWD order (§6.4) on every true path; Jesus only through verse beats/tokens; the scribe's 「읽음」 (pinThought + readReceipt); Asher's lying POV and the press sequence 일어나기 → 침상을 들어 → 집으로; the light FX.
- Dropped in version 4: lenses and scoring, the double-weight last choice, the mismatch line, cut endings and their title cards, the 3 × 4 gallery, Asher's persistent gray buttons (`actions`), numeric codas.

Route skeletons as written (the route files are the story; options paraphrased):

**Scribe — Menahem (Hanan scolds).** 1. Dawn, Psalm 103:3 with Hanan → c1 (go and see / a typo hunt in the scroll → cut `typo`). 2. THE LANE → c2 (pray for the man in silence / agree with the passerby → Hanan scolds (Job 42:7) / "let's define our terms" → a word war with the passerby over 죄·죄악·허물 until sunset → cut `wordWar` 「말꼬리 대전」 / back away slowly → bottom-first into a dyer's vat → cut `dyeVat` 「파란 서기관」). 3. THE CROWD: 9:2A, the first words 9:2B (hush, bright light, Ps 103:3 echo), his unspoken 9:3 thought (pinned) → c3 (shout "Blasphemy!" and push forward → cut `guardhouse` / write it in huge letters → Hanan scolds / go check for a "permit to forgive sins" → stuck behind the broadest back in Capernaum → cut `permit` 「제일 넓은 등」 / keep it inside and watch). 4. 「읽음」 at 9:4, 9:4Q, 9:5 → c4 ("which is easier?": easier to say, nobody can check / rush home to write a rebuttal — forty pages and one wall → cut `rebuttal` / both are easy to say, proving it is hard). 5. 9:6A–9:8 → c5 (four ways to look; "pretend it never happened" → Hanan scolds). True ending: memory verse MT_9_6A.

**Friend — Yonah (a net partner or Asher scolds).** 1. The shore at dawn, the rumor → c1 (let's get Asher / the sea's all mine today → cut `bigCatch` / check the rumor first → a partner scolds). 2. Asher's house: 「내가 뭘 잘못해서 이렇게 된 걸까?」 → c2 (three kind answers / "any guesses?" → Asher scolds 「너까지 그러기야?」). 3. THE LANE: the passerby, Menahem steps aside → c3 (answer the passerby / whisper "all the way" / "Take that back!" → an arm-wrestling match across a fish stall, the lane betting figs → cut `armWrestle` 「세기의 팔씨름」 / set the bed down → cut `stayedInLane`). 4. THE CROWD: the bed set down, 9:2A, 9:2B → c4 (look at Asher's face / why that first? / "his legs too?" → Asher scolds 「쉿! 나한테 하신 말씀이야.」 / "Somebody pinch me!" → he faints and wakes up being carried home on the bed by Asher → cut `fainted` 「자리 바꾸기」). 5. 9:4–9:8 → c5 (two options). True ending: memory verse MT_9_2 (the whole verse).

**Asher (Yonah scolds; his own thought answers his "can't" options).** 1. Dawn, the ceiling → c1 (pray Ps 41:4 / 「일어나기」 → 「다리가 대답하지 않는다.」, removed / "five more minutes" → cut `nap` / count the beams). 2. Yonah bursts in → c2 ("I want to go, but I'm scared" / the hot springs of Tiberias instead → cut `hotSprings` / 「밖으로 나가기」 → his thought, removed / "No. I'm not going out." → cut `stayedHome` at once, as the teacher asked). 3. THE LANE (carried POV) → c3 (a dry comeback / "why don't we start with *your* story?" → the bed swings, a fish basket goes over, the whole lane chases fish → cut `fishChase` 「생선 대소동」 / "put me down, I'm going home" → Yonah scolds / the back way, away from people → cut `longWay` 「염소 관객」). 4. The crowd's edge (carried, before 9:2A) → c4 ("Yonah, don't let go" / "could you pass me to the front?" → the crowd passes the bed overhead the wrong way, into a fishing boat → cut `bedSurf` 「침상 파도타기」 / "heal me and Yonah's fish are free for life" → Yonah scolds 「흥정하는 거 아니야!」). 5. THE CROWD (lying): 9:2A, 9:2B1, 「나를 뭐라고 부르셨지?」, 9:2B2 → c5 (「일어나 본다」 → 「다리는 그대로다.」, removed / "is he really saying this to me?" / "what about my legs?" → Yonah scolds / "so it was my fault?"). 6. 9:3–9:6B, press 「일어나기」, POV standing, presses 「침상을 들어」 → 「집으로」, 9:7, 9:8 → c6 (two options; "Yonah, you carry the bed" → Yonah scolds 「그건 아니지! 네 침상은 네가 들어!」, which leaves one option, still shown as a normal choice). True ending: memory verse MT_9_2B. Asher's true path is 29 screens (accepted; the reassuring 「겁나도 돼. 드는 건 우리가 할게.」 sets up 「요나, 손 놓지 마.」).

## 4. Data schema

### 4.1 data/meta.js (lead)
`BHS.meta = { version, title: T, subtitle: T, disclaimer: T, bibleNotice: T, routeOrder: [...], routes: { routeId: { protagonist, name: T, title: T, tagline: T, firstLine: T } } }`.
Route cards read `routes`. The titles of the true ending and of the cut branches live in the route files (§4.6). The lens, cut and ending fields of version 3 (`lenses`, `cut`, `endings`, `routes[*].lensDesc`) are gone.

### 4.2 data/characters.js (lead)
`BHS.characters[id] = { name: T, role: T, color: "#hex", drawn?: false }`. Speaker ids for `line` beats come from here, plus the pseudo-speakers in §4.5.

### 4.3 data/scripture.js (scripture agent)
`BHS.scripture[KEY] = { ref: T, ko: string, en: string, speaker?: "jesus"|"scribes"|"narrator", refOnly?: true, full?: { ko: string, en: string } }`. `full` holds the whole verse for keys that are cuts of a verse (QA checks the cut is an exact substring).
- Korean = 성경전서 개역개정판. English = ESV. Exact wording and punctuation of the published text (partial verses are exact substrings of the verse).
- `refOnly` keys have empty `ko`/`en` and may only be used with `{{r:KEY}}`.
- Writers may use ONLY these keys. Need another? Ask in your report; do not invent keys.

Matthew 9 (the fixed event):
| Key | ref ko / en | Speaker | Content (approximate; agent verifies) |
| --- | --- | --- | --- |
| MT_9_1 | 마 9:1 / Matt 9:1 | narrator | 예수께서 배에 오르사 건너가 본 동네에 이르시니 |
| MT_9_2 | 마 9:2 | narrator | the whole verse (= `full` of MT_9_2A/2B): 침상에 누운 중풍병자를 … 네 죄 사함을 받았느니라 / "And behold, … “Take heart, my son; your sins are forgiven.”" (friend memory verse) |
| MT_9_2A | 마 9:2 | narrator | 침상에 누운 중풍병자를 사람들이 데리고 오거늘 예수께서 그들의 믿음을 보시고 중풍병자에게 이르시되 / "And behold, some people brought to him a paralytic, lying on a bed. And when Jesus saw their faith, he said to the paralytic," |
| MT_9_2B | 마 9:2 | jesus | 작은 자야 안심하라 네 죄 사함을 받았느니라 / Take heart, my son; your sins are forgiven. |
| MT_9_2B1 | 마 9:2 | jesus | 작은 자야 안심하라 / Take heart, my son; |
| MT_9_2B2 | 마 9:2 | jesus | 네 죄 사함을 받았느니라 / your sins are forgiven. |
| MT_9_3 | 마 9:3 | narrator | whole verse |
| MT_9_3Q | 마 9:3 | scribes | 이 사람이 신성을 모독하도다 / This man is blaspheming. |
| MT_9_4 | 마 9:4 | narrator | whole verse |
| MT_9_4N | 마 9:4 | narrator | 예수께서 그 생각을 아시고 이르시되 / But Jesus, knowing their thoughts, said, |
| MT_9_4Q | 마 9:4 | jesus | 너희가 어찌하여 마음에 악한 생각을 하느냐 / Why do you think evil in your hearts? |
| MT_9_5 | 마 9:5 | jesus | whole verse (spoken) |
| MT_9_6A | 마 9:6 | jesus | 그러나 인자가 세상에서 죄를 사하는 권능이 있는 줄을 너희로 알게 하려 하노라 / But that you may know that the Son of Man has authority on earth to forgive sins |
| MT_9_6N | 마 9:6 | narrator | 하시고 중풍병자에게 말씀하시되 / —he then said to the paralytic— |
| MT_9_6B | 마 9:6 | jesus | 일어나 네 침상을 가지고 집으로 가라 / Rise, pick up your bed and go home. |
| MT_9_7 | 마 9:7 | narrator | 그가 일어나 집으로 돌아가거늘 / And he rose and went home. |
| MT_9_8 | 마 9:8 | narrator | whole verse |

Context:
| Key | Speaker | Content |
| --- | --- | --- |
| MT_7_29 | narrator | 이는 그 가르치시는 것이 권위 있는 자와 같고 그들의 서기관들과 같지 아니함일러라 |
| MT_8_20Q | jesus | 여우도 굴이 있고 공중의 새도 거처가 있으되 인자는 머리 둘 곳이 없다 |
| MT_8_26B | narrator | 곧 일어나사 바람과 바다를 꾸짖으시니 아주 잔잔하게 되거늘 |
| MT_8_34 | narrator | 온 시내가 예수를 만나려고 나가서 보고 그 지방에서 떠나시기를 간구하더라 |
| DN_7_14A | narrator | 그에게 권세와 영광과 나라를 주고 / And to him was given dominion and glory and a kingdom, (scribe true ending) |
| MT_26_65Q | narrator | (대제사장) 그가 신성 모독하는 말을 하였으니 / He has uttered blasphemy. |
| JN_9_2 | narrator | 랍비여 이 사람이 맹인으로 난 것이 누구의 죄로 인함이니이까 자기니이까 그의 부모니이까 |
| JN_9_3 | jesus | 이 사람이나 그 부모의 죄로 인한 것이 아니라 그에게서 하나님이 하시는 일을 나타내고자 하심이라 |
| PS_103_3 | narrator | 그가 네 모든 죄악을 사하시며 네 모든 병을 고치시며 / who forgives all your iniquity, who heals all your diseases, |
| PS_107_17 | narrator | 미련한 자들은 그들의 죄악의 길을 따르고 그들의 악을 범하기 때문에 고난을 받아 |
| PS_107_20 | narrator | 그가 그의 말씀을 보내어 그들을 고치시고 위험한 지경에서 건지시는도다 |
| PS_107_29 | narrator | 광풍을 고요하게 하사 물결도 잔잔하게 하시는도다 |
| PS_38_3 | narrator | 주의 진노로 말미암아 내 살에 성한 곳이 없사오며 나의 죄로 말미암아 내 뼈에 평안함이 없나이다 |
| PS_38_3B | narrator | 나의 죄로 말미암아 내 뼈에 평안함이 없나이다 (second half; use when a character prays it) |
| PS_41_4 | narrator | 내가 말하기를 여호와여 내게 은혜를 베푸소서 내가 주께 범죄하였사오니 나를 고치소서 하였나이다 |
| PS_41_4Q | narrator | 여호와여 내게 은혜를 베푸소서 내가 주께 범죄하였사오니 나를 고치소서 (the prayer only; use this when a character prays it) |
| PS_22_1A | narrator | 내 하나님이여 내 하나님이여 어찌 나를 버리셨나이까 |
| DT_6_4 | narrator | 이스라엘아 들으라 우리 하나님 여호와는 오직 유일한 여호와이시니 |
| IS_43_25 | narrator | 나 곧 나는 나를 위하여 네 허물을 도말하는 자니 네 죄를 기억하지 아니하리라 |
| LV_4_31B | narrator | 제사장이 그를 위하여 속죄한즉 그가 사함을 받으리라 |
| LV_24_16A | narrator | 여호와의 이름을 모독하는 자는 반드시 죽일지니 온 회중이 돌로 그를 칠 것이니라 |
| SA2_12_13B | narrator | 여호와께서도 당신의 죄를 사하셨나니 |
| KI1_8_39B | narrator | 주만 홀로 모든 인생들의 마음을 다 아심이니이다 |

Reference-only (`refOnly: true`): MT_8_19_20 (마 8:19–20), MT_8_23_27 (마 8:23–27), MT_8_28_34 (마 8:28–34), MT_20_2 (마 20:2), MT_26_65 (마 26:65), MK_2_4 (막 2:4), MK_2_7 (막 2:7), DT_13_1_3 (신 13:1–3), JB_42_7 (욥 42:7), LK_13_2_3 (눅 13:2–3), LV_13_15 (레 13–15장).

Reference format: ko uses 개역개정 abbreviations (마, 막, 눅, 요, 시, 신, 사, 레, 삼하, 왕상, 욥); en uses Matt, Mark, Luke, John, Ps, Deut, Isa, Lev, 2 Sam, 1 Kgs, Job. Ranges use an en dash (–).

### 4.4 data/common.js (lead)
`BHS.common = { prologue: [Beat], routeSelect: { prompt: T, hint: T } }`. `hint` is the suggested order shown under the prompt (§5.8). The mismatch line of version 3 is gone.

### 4.5 Route files (writers)

```js
BHS.routes.scribe = {
  id: "scribe",
  beats: [ /* Beat */ ],
  endingPreface: [ /* optional Beat list, played right before the true ending's title card */ ],
  endings: {
    good: { title: T, verse: "MT_9_6A", beats: [ /* 1-3 short beats */ ], last: T },
    bad: {
      typo: { title: T, beats: [ /* 2-3 short beats */ ], last: T },
      guardhouse: { title: T, beats: [...], last: T }
      // 3-4 cut branches per route
    }
  },
  endingCoda: [ /* optional Beat list after the true ending's last line; no numbers or stats */ ]
};
```

**Beat types.** Any beat may carry `when: Cond`; a beat whose condition is false is skipped. Any beat may carry an optional unique `id` (string) for debugging.

1. `{ type: "scene", bg: BG_ID, caption?: T, pov?: "normal"|"lying"|"standing", time?: "day"|"evening"|"night" }` — change background; optional place/time chip, e.g. `{ko:"새벽 · 므나헴의 방", en:"Dawn · Menahem's room"}`. `time` (default "day") is passed to `BHS.art.render(bg, { pov, time })`. A scene change keeps the current light level and pov unless the beat sets pov.
2. `{ type: "line", speaker?: SPEAKER, text: T }` — one text box. SPEAKER = a character id (§6.1) | `"narrator"` (default) | `"thought"` (protagonist's inner voice; rendered italic, no name plate) | `"sign"` (centered caption such as 「― 두루마리 펴는 소리 ―」 or 「몇 시간 뒤 / Hours later」).
3. `{ type: "verse", key: KEY, speaker?: "jesus"|"scribes"|"narrator" }` — scripture card (text + reference). Speaker defaults to the key's speaker. Jesus' words appear ONLY as verse beats or tokens.
4. `{ type: "choice", id: "c1"…"c6", prompt: T, options: [Option ×2–4] }` — 5–6 choices per route, ids in order (§8).
   `Option = { id: "a"|"b"|"c"|"d", text: T, set?: { flag: value }, reaction?: [Beat], bad?: "<id>", scold?: { speaker?: SPEAKER, text: T } }`. Option ids a–d in order. An option's `set` applies whenever it is picked.
5. `{ type: "fx", fx: FX_NAME, ...params }` — see FX list.
6. `{ type: "press", label?: T, hint?: T }` — waits for the player to tap one glowing button (e.g. 「일어나기」, 「침상을 들어 / Pick up your bed」, 「집으로」).

**Option outcomes** (exactly one per option; the validator errors on `bad` together with `scold`):
- **continue** (no `bad`, no `scold`): the reaction plays (0–1 short beat; two only when a `when` variant needs it), then the story goes on. The pick is the choice's answer (`choices.cN`).
- **bad**: `bad: "<id>"` names a cut branch in `endings.bad`. The reaction plays (0–1 beat), then the cut branch (§4.6). A cut branch may be reachable from more than one option, even at different choices; every cut branch must be reachable.
- **scold**: `scold: { speaker?, text }`. The reaction (optional) plays, then the scold line as a normal line by that speaker (`"thought"` = the protagonist's own thought, as in Asher's "can't" options; no speaker = narration). Then the option is **removed** and the **same choice is asked again** (its prompt and the remaining options, in order). Removed options stay removed for the rest of the route, also after Try again. A scolded pick is never the choice's answer: conditions such as `{ choice: "c3", is: "a" }` only see the pick that moved the story on.
- Every choice keeps a continue option, so after all of its scolds at least one continue option remains (no dead ends). A choice may end up with a single option after a scold; it is still shown as a normal choice.

**Conditions (Cond).** May only reference earlier choices and flags set earlier.
- `{ choice: "c3", is: "a" }`, `{ choice: "c3", in: ["a","b"] }`
- `{ flag: "stood", is: true }`, `{ flag: "mark", in: ["he","order"] }` (an unset flag counts as `false`)
- `{ all: [Cond...] }`, `{ any: [Cond...] }`, `{ not: Cond }`
- `{ lastLens }` / `{ c10lens }` of earlier releases are not supported any more (always false, with an engine warning).

**FX list** (the engine implements exactly these):
- `{ fx: "light", level: "off"|"soft"|"bright" }` — the light that marks Jesus' presence. `soft` while he is present, `bright` for MT_9_2B and MT_9_6B, `off` when leaving the scene.
- `{ fx: "hush" }` — the world goes quiet for the next beat (dim + slower text). Scribe route at the first words.
- `{ fx: "echoVerse", key: KEY, highlight?: { flag: FLAG, map: { [flagValue]: { ko: [string], en: [string] } | "*" | null } } }` — overlays a verse on the scene for one beat, highlighting the listed substrings for the current flag value (`"*"` = whole verse). Scribe route.
- `{ fx: "pinThought", items: ["verse:KEY" | "choice:cN"] }` — pins a thought bubble that stays on screen. Scribe route.
- `{ fx: "readReceipt" }` — stamps 「읽음 ✓ / Read ✓」 on the pinned bubble. Scribe route.
- `{ fx: "unpinThought" }`
- `{ fx: "pov", pov: "lying"|"standing"|"normal" }` — camera. Asher route.
- `actionReply`, `actionsHide`, `actionsShow` and the route-level `actions` (version 3's persistent gray buttons) are still read for older data; the version 4 routes use none, and the UI shows no buttons when a route has none.

**Screens.** Screens = line + verse + choice + press beats along a path, plus the true ending's memory-verse card (scene and fx beats, the true ending's title card and the snip card are not screens). Counted by tools/validate.mjs on every path:
- **True path** (every choice answered by a continue option; every combination of continue options and `when` variants): target **24–29** screens, WARN at 30, ERROR above **30**. The cap is counted without scold detours; each detour adds two screens (the scold line and the re-asked choice), and the all-detours maximum is reported as INFO only.
- **Cut path** (the route start through the cutting option's reaction, the branch beats and its last line): ERROR above **20**.
- About 5 minutes per character on the true path read aloud, plus about a minute per cut branch the class runs into. The validator reports reading time per route and per cut branch.

**Try again and the re-ask (engine).** Whenever a choice is shown (a re-ask included), the engine stores a snapshot of the whole state: the stage (background, caption, pov, light, pinned thought, cast), hush and echo, choices, flags, vars, removed options and the step. **Try again** (`game.retry()`) restores that snapshot exactly — the same choice, the same options (scolded ones stay removed), the same scene, light and pinned thought — and keeps it, so Try again works again after the next cut. Saving and resuming work everywhere: mid-route, inside a reaction, a scold or a cut branch, on the snip card (Continue shows it again and Try again still works) and during the true ending.

### 4.6 Endings: the true ending and the cut branches
- **Titles** live in the route file: `endings.good.title` and `endings.bad[id].title`. A cut branch's title labels its branch in the story tree: keep it short and funny (2–8 Korean characters, e.g. 「오타 사냥」, 「오 분만 더」). Cut-branch ids: short ascii (`typo`, `guardhouse`, `nap`).
- **True ending sequence:** `endingPreface` → a title card with the ending's `title` only (no number, no label) → the **memory-verse card** (`verse`, big, with its reference, in the light) → `beats` (1–3 short beats) → `last` (a large last line) → `endingCoda` → the route's story tree (§5.8). The memory-verse card repeats a verse already shown in the crowd; it is not part of the crowd sequence (§6.4).
- **Cut-branch sequence:** the option's reaction → the protagonist leaves the scene (the pinned thought is cleared, the light goes off; the branch beats may set scene and light again) → `beats` (2–3 short beats) → `last` (the punchline) → the **snip card**: a playful stamp 「싹둑!」 / "Snip!", the branch `title`, the line 「여기서 이야기가 끊겼어요.」 / "The story got cut off here." and two buttons: 「다시 고르기 · Try again」 (default focus; §4.5) and 「처음 화면 · Title screen」 (the save keeps the choice before the cut, so Continue starts there). No number, no "BAD END", no "ending" on the card. No `endingPreface` or `endingCoda` in a cut branch.
- **Memory-card display:** when the memory verse is an excerpt that stops mid-sentence (its `full` text continues and it does not end in terminal punctuation — the scribe's MT_9_6A), the card shows a trailing 「…」/"…" in both languages (`engine.memoryDisplay`); data unchanged. Long whole verses (MT_9_2) shrink the card type automatically at the largest text size.
- **Memory verses** (one per character, in data/scripture.js): scribe → `MT_9_6A` (the authority to forgive sins — the answer to his question; the sermon's theme); friend → `MT_9_2` (the whole verse: Jesus saw *their* faith; MT_9_2A alone stops mid-sentence); asher → `MT_9_2B` (「작은 자야 안심하라 네 죄 사함을 받았느니라」 — what he was called).
- **The event never changes.** Jesus still comes to Capernaum that day and forgives and heals there. In the scribe's and the friend's cut branches the protagonist misses it, leaves, mixes something up or ends up somewhere silly (and plausible for first-century Galilee); others still carry Asher and he is still healed. In Asher's own cut branches he simply isn't there to receive it (he stays home, sleeps in, goes to the hot springs, takes the back way). The `last` line is a light twist with a tiny "아, 이렇구나", not a sermon. Never shame the player; the class should laugh and press Try again.
- Allowed comic settings (examples): a typo hunt in a scroll; a forty-page rebuttal; a night in the guardhouse of Capernaum's garrison (the centurion of Matt 8:5 lives here; not called "Roman" — Galilee was Herod Antipas's territory) explaining Leviticus to a bored soldier; a huge catch of fish; winning an argument with the passerby while the crowd goes home; an arm-wrestling match or a shouting contest with the passerby across a fish stall while the whole lane bets figs; a word war over the exact Hebrew word for "sin"; backing away from the bed so carefully that you fall into a dyer's vat and turn blue; a basket of fish knocked over and a fish chase through the lane; being stuck behind the broadest fisherman's back for the whole event; fainting from excitement and being carried home on the very bed you brought; a bed passed over the crowd's heads the wrong way, all the way into a boat; the hot springs of Tiberias (warm water, same legs); "five more minutes" and waking up at dusk to the town's excitement; counting the roof beams again. Quarrels stay verbal or playful contests (no hitting, no shoving anyone down); slapstick never hurts anyone. Not allowed: violence, injury, mocking disability, Jesus refusing or failing, Jesus' words outside verse beats, anything that makes the scribes villains or caricatures (comic flaws are universal: pedantry, pride, overthinking), Mark/Luke-only details (no roof opening), the Talmud.
- **Seen ids** (stored on the device, §5.3): `"<route>-good"` once the true ending ends, `"<route>-bad-<id>"` once a snip card shows.

### 4.7 data/ui-strings.js (engine agent)
All UI chrome strings (buttons, labels, settings, snip card, story trees, errors) as T objects in `BHS.ui`. They must read naturally to native Korean and English speakers (short, easy, no translationese).

## 5. Engine rules

### 5.1 Engine API (js/engine.js, `BHS.engine`; pure, no DOM)
- Data helpers: `getRoute(routeOrId)`, `choiceBeats(route)`, `findChoice(route, id)`, `findOption(choiceBeat, id)`, `optionOutcome(option)` → `"continue"|"bad"|"scold"`, `badTargets(routeOrId)` → `[{ choice, option, badId }]` in beat order, `treeOf(routeOrId)` → `{ routeId, levels: [{ id, branches: [{ badId, id, title, last }] }], good: { id, title, verse } }` (each cut branch at the first choice that leads to it; scolded options are not part of the tree), `goodId(rid)`, `branchId(rid, badId)`, `parseSeenId(id)`.
- Text: `evalCond(cond, state)`, `resolveText(t, lang, state)` (lang ∈ "ko"|"en"), `resolveSegments`, `plainText`, `pickLang`, `quoteVerse`, `nestQuotes`, `verseText(key, lang)`, `verseDisplay(key, lang)` (§4.3 display rule), `verseRef`, `verseSpeaker`.
- Saves: `fingerprint(routeOrId)`, `canRestore(savedState)` (§5.3), `STATE_VERSION` (3).
- Games: `createGame(routeId | "prologue", opts)`, `restoreGame(savedState, opts)`, `createSequence(beats, opts)` (tests). A game has `step` (`line`, `verse`, `choice`, `press`, `endingTitle`, `memory`, `last`, `snip`, `routeSelect`, `end`) and `view()`, `next()`, `choose(optionId)`, `press()`, `retry()`, `canRetry()`, `continueOption(step)`, `optionMarks(seen)` (options whose cut branch is among the seen ids, for the scissors mark), `serialize()`, `fastForward({ until, pick })` (debug and tests; follows continue options and stops at a snip card), `position()`.
- A choice step is `{ kind: "choice", id, prompt, options: [{ id, text }], removed: [ids], again: bool, justRemoved: { id, text, at } | null }`; the scolded option of a re-ask comes as `justRemoved` for the removal animation.
- `state.ending` is `{ kind: "good", id: "<route>-good", title, verse }` during the true ending and `{ kind: "bad", id: "<route>-bad-<id>", badId, title, cutAt: { choice, option } }` inside a cut branch.

### 5.2 Language modes
`ko`, `en`, `both`. The title screen asks first (default highlight: `both`). In `both`, Korean first, English below in a secondary style. Changeable anytime from the header. Option buttons in `both` show both lines. In `both` the typewriter types the two languages in parallel: both start together and their last characters appear together (the shorter timeline is stretched); one tap completes both.

### 5.3 Persistence (localStorage, every access in try/catch; game must work without it)
- `bhs.v1.settings` — language, text speed, text size.
- `bhs.v1.save` — current route, position, state (resume after an accidental refresh). Save format 3 (version 4): every save carries the route fingerprint, a hash of the route's structure (beat types in order, choice and option ids, each option's outcome and cut-branch id, reaction and ending lengths; text edits keep it). A save that no longer fits the loaded data — from release 1.0, from the lens releases (format 2), or from before a route was restructured — is removed silently and no "Continue" is offered.
- `bhs.v1.gallery` — the seen ids on this device (`"scribe-good"`, `"friend-bad-bigCatch"`; the key name is kept from earlier releases). Ids of earlier releases (`"scribe-1"`, `"friend-cut"`) are ignored and dropped on the next write. Without storage the seen ids live in memory for the session.

### 5.4 Controls and accessibility
Tap/click/Enter/Space to advance; typewriter with tap-to-complete; text speed (slow/normal/instant); text size (A−/A+); tap targets ≥ 44px; visible focus; `aria-live` on the text box; `prefers-reduced-motion` → no typewriter, no shake, no lift on the route cards, fades ≤ 150ms.
- Choices: options carry no visible numbers; keys 1–4 pick by place on screen (no letter shortcuts: a clicker's blank-screen key sends "b" or "."). Next keys (PageDown, ↓, →) move the focus to the next option and previous keys (PageUp, ↑, ←) to the previous one, both wrapping; Enter, Space, "b" and "." pick the focused option; holding a next key for about 0.8 s (timed keydown→keyup, with an amber fill sweeping across the option) also picks it, so a two-button clicker can choose. On a fresh choice the first key only shows the focus on the first option. A key that picked does nothing more until it is released; held keys never act twice anywhere.
- Input guards: right after a screen changes, activations are ignored for a short time (line 220 ms, choice 400 ms, press 600 ms, Asher's rise 1.8 s, snip card and tree 700 ms, pages 400 ms; none with `?test=1`), so a double click, double tap or fast clicker press never skips a screen the class hasn't seen. The stage's advance button gives up focus after a pointer click.
- Title: the next keys press the default button — Continue when there is a save (focused and filled), Start otherwise; a prologue position never overwrites a route save.
- Snip card and story trees: Enter/Space press the focused button; a clicker's next keys (→, ↓, PageDown) press the focused button (the default one when nothing has focus); its previous keys (←, ↑, PageUp) move the focus between the buttons. Right after these screens appear, a short guard ignores keys, so a double press never skips them.
- Route select on a keyboard or clicker: 1–3 start a route, arrows and PageUp/PageDown move the focus between the cards, Enter/Space start the focused card.
- Esc opens the in-page menu (home confirm); a second Esc closes it in place.

### 5.5 Debug and deep links
`?debug=1` → panel with route, beat, step, choices, removed options, the current ending or cut branch, Try again state, flags; a jump list with the route's choice ids plus one entry per cut branch (`bad:<id>`, labeled "Cut branch: <id> (cN/x)") — a choice jump replays the route along continue options; a branch jump also takes the cutting option, so the branch starts; an auto-pick button; an auto-play button (to the true ending and the story tree; inside a cut branch it plays to the snip card, marks it seen, then tries again). `#scribe`, `#friend`, `#asher` → start that route directly (bare hash tokens only); the hash is removed after use, and on load a save for the same route is resumed instead of restarted. `?test=1` → instant text, no animations, no input guard (automated tests).

### 5.6 Look and feel (engine + art agents)
Committed single look (not a light/dark pair): scene art fills the stage; text sits on a parchment-like panel with dark ink for daylight legibility. Palette from the place: black basalt (Capernaum's houses), limestone, Galilee blue, olive, lamp amber; Jesus' presence = warm white light, never a figure. Korean serif for story text, a clean sans for UI; real fallback stacks. No emoji in UI.

**Two first-class displays:**
1. **TV (primary for class):** the game is shown on a TV connected to a computer, 16:9 landscape (1920×1080 and 1280×720; may be 4K with devicePixelRatio 2), read from 3–5 m away by the whole class. Requirements: story text ≥ about 3.6vh (≈ 39px at 1080p) in landscape, names/options ≥ 3vh, nothing below 2.2vh; text panel centered with a comfortable max width; choices large, with no number badges (two columns when wide; a lone last option centered); keyboard and presentation clicker control — Space / Enter / → / PageDown / ↓ advance, 1–4 pick an option by place (next/previous keys move between options; hold next or press the blank-screen key to pick, §5.4), F toggles fullscreen (also a visible fullscreen button), Esc opens the menu; the mouse cursor hides after a few seconds of inactivity; high contrast. Art must compose well at 16:9 (focal content in the upper-middle; the text panel covers roughly the bottom 30%). Nothing scrolls on a TV: the snip card, the story tree and the three story trees fit 1920×1080 and 1280×720 with every branch seen.
2. **Phone:** portrait 360–430px wide, safe-area insets, touch. Pages may scroll vertically, never sideways.
Tablets and laptops in between should also look right.

### 5.7 Builds
`node tools/build-single.mjs` writes:
- `dist/before-he-stood.html` — one self-contained file (all CSS/JS/data inlined) that runs offline.
- `dist/artifact.html` — same content as a body fragment for claude.ai artifacts: no doctype/html/head/body tags, `<title>` and `<style>` first, `<meta name="claude:viewport-fit-sides" content="cover">`, side gutters `max(16px, env(safe-area-inset-*))`, explicit body background, colors as tokens on `:root`, no external scripts, Google Fonts stylesheet allowed.

The same command also stamps index.html: every local script and stylesheet URL gets `?v=<hash of all local assets>` (idempotent), so a browser that cached the previous release never mixes old and new files after an update (GitHub Pages serves files with a 10-minute max-age). Run it before every release.

Both builds play exactly like index.html. The only thing they add is the marker `window.BHS.config = { build: "single" }` before the data scripts; there are no links to other pages.

### 5.8 Route cards, the snip card and the story trees
- **Route select:** each card shows its protagonist from js/portraits.js in a band between the tagline and the divider above the first line, as wide as the text: Menahem and Yonah as busts rising from the divider toward the right (cropped by it, facing the text, both at the same size), Asher in his lying pose laid across the band with his bed resting on the divider (never standing: that is the ending). A soft wash in the character's color sits behind the figure, inside the card; on hover or keyboard focus the figure lifts a few px and the wash brightens (no lift under reduced motion or `?test=1`). The art is decorative (`aria-hidden`, `data-testid="routecard-portrait-<route>"`), never covers text, and the card stays text-only without the portrait module. No counters on the cards.
- **Class flow:** the suggested order `common.routeSelect.hint` shows as a small line under the prompt. A route whose true ending was seen is stamped 「✓ 끝까지 함」 / "✓ Finished" (two lines in both mode) (`data-played="true"`, `data-testid="routecard-played-<route>"`, in the free top-left corner of its portrait band, never over text or figure); a cut branch alone does not count. Once any route has been played, the keyboard focus starts on the first unplayed route in `meta.routeOrder` (with a visible ring), so the teacher presses Enter for the next character; nothing changes when nothing has been played, and the focus stays put when all three have been.
- **Options:** no number badges. An option whose cut branch was already seen on this device carries a tiny scissors mark ✂ (`data-snipped="true"`, no text). A scolded option leaves gently: on the re-ask it fades out where it stood while the others keep their places, then the layout closes up without a jump.
- **Story tree** (after the true ending; `data-testid="tree-<route>"`): a warm cut-paper tree, bottom to top — the root with the character's name, a knot at every choice point, the ★ of the true ending at the top with its title. At each choice point the cut branches grow sideways (alternating sides): a branch seen on this device is a short bough with a red scissors snip and a paper tag with its title; an unseen one is a faint, short, unlabeled stub. Scolded options are not shown. No numbers, counts or percentages. Layout (measured after the page is built; re-run on resize, text-size change and when web fonts arrive): labels stand in two columns beside the trunk, each as close to its choice point as the others allow, never overlapping each other, the trunk, the star or its leaves; several branches at one choice point fan out on alternating sides with staggered heights; knots sit by their labels so boughs stay short; TV labels shrink to fit but never below 2.2vh; on a phone the tree grows taller instead. Up to 7 branches per route (3 at one point) must fit. Buttons: 「다른 인물로 하기」 / "Next character" (default focus; goes to the route select) and 「처음 화면」 / "Title screen". TV: words and buttons on the left, the tree on the right.
- **Story trees from the title** (「이야기 나무」 / "Story trees", `data-testid="trees-open"`): the three trees side by side (stacked on a phone); a route not yet finished shows a faint trunk and an outlined star, with any cut branches already seen still labeled.
- **Test ids and screens:** `body[data-screen]` ∈ title, prologue, routeSelect, play, endingCard, ending, snip, tree, trees. Play: `advance`, `textbox`, `speaker`, `choice-<option>` (`data-option`, `data-snipped`), `press`, `verse-card`, `memory-verse`, `ending-title`; snip card: `snip-card` (`data-branch`), `snip-stamp`, `snip-title`, `snip-retry`, `snip-home`; trees: `tree-<route>` (`data-done`), `tree-goal-<route>` (`data-state`), `tree-branch-<route>-<badId>` (`data-state` seen|unseen), `tree-next`, `tree-home`, `trees-home`; title: `start`, `continue`, `lang-ko|en|both`, `trees-open`; header: `home`, `hdr-lang-*`, `fullscreen`, `settings-open`; dialogs: `confirm-yes`, `confirm-no`; debug: `debug-select`, `debug-jump`, `debug-autopick`, `debug-autoplay`. Hooks: `window.BHS_DEBUG.state()` / `BHS.ui.debugState()` (screen, routeId, list, beatIndex, step, stepId, options, choices, removed, flags, vars, ending, endingKind, bad, canRetry, seen, light, pov, lang, typing).

### 5.9 Checks
- `node tools/validate.mjs` (and `--selftest`) — schema, outcomes, story shape, screens, crowd order, passerby line, lengths, digits, canon, and an engine cross-check of every true path and every cut path (Try again included). Writes qa/reports/validate.txt.
- `node tests/engine.test.mjs`, `node tests/routes-smoke.mjs` — engine unit tests on tests/fixtures/routes.js and smoke runs on the real routes.
- `node tools/playtest.mjs` — browser playtest (Playwright + Chromium): per route the true path keyboard-only at 1920×1080, mouse at 1280×720, touch at 390×844, every cut branch with its snip card and Try again, every scold and its re-ask, the story tree and the played stamp; the title, story trees, deep links, debug jumps, stale saves and the single-file build. Writes qa/reports/playtest.txt and qa/playtest/*.png.
- `node tests/ui-playtest.mjs`, `node tests/ui-extra.mjs` — focused browser checks (ui-extra 8c2 lays out tests/fixtures/trees-wide.js — 7 branches per route, 3 at one point, long titles — and checks for overlaps and scrolling at 1920×1080, 1280×720 and 390×844); `node tests/ui-input.mjs` (also run at the end of ui-extra) — input and robustness: title keys with a save, a hanging font request, reloads with and without a hash, double clicks right after a screen change, held keys, clicker move/pick/hold, the idle cursor, storage that reads but can't write, the scold animation and the memory card fit.
- Browsers: current Chrome, Edge and Safari 15.4 or later; the Google Fonts stylesheet loads without blocking (the game boots at once if it hangs).

## 6. Canon

### 6.1 Characters — fixed facts (do not contradict)
| id | KO / EN name | Facts | Voice |
| --- | --- | --- | --- |
| menahem | 므나헴 / Menahem | Scribe (서기관) of Capernaum, about 50. Gray-streaked beard, ink-stained fingers. Keeps notes (기록장 / his notes). Loves Scripture sincerely; worries that what belongs to God not be claimed lightly. Not a villain; never sneers. Teaches Hanan. At the crowd he stands among "some of the scribes" near the front and says nothing aloud the whole time. | measured, precise |
| hanan | 하난 / Hanan | Menahem's student, 17. Sharp and curious; asks the dawn questions; walks with Menahem to the crowd. | polite, eager |
| yonah | 요나 / Yonah | Fisherman, about 24. Asher's childhood friend (they raced each other on the beach as boys). Works the nets with his partners; a day's wage is one denarius. | warm, impulsive, plain-spoken |
| asher | 아셀 / Asher | About 24. Has not been able to walk for four years (네 해째 / four years now). The cause is never stated. Lives with his mother and his little brother (about 10). Dry humor, says what he feels, hates being stared at, prays the Psalms. Owns a worn brown wool cloak (겉옷). Years ago he said cruel words to his little brother and never apologized. | wry, guarded, honest |
| mother | 어머니 / Mom (label "Asher's mother" outside Asher's POV) | Draws water every morning; hears talk at the well. Tired and tender. | |
| brother | 동생 / Little brother | About 10, plays by the doorway. Unnamed. | |
| neighbor | 이웃 / Neighbor | Brings the rumor to Menahem's door (scribe route). | |
| partners | 그물 동료들 / net partners | Two or three fishermen, unnamed. Help carry the bed. Never state a number of carriers (avoid Mark's "four"). | |
| passerby | 행인 / Passerby | One person in the lane (§6.3). | |
| crowd | 무리 / The crowd | | |
| scribes | 서기관들 / The scribes | "Some of the scribes" (9:3). | |
| jesus | 예수님 / Jesus | Never drawn; shown only as light. Speaks only through scripture keys. No invented words, emotions, smiles or gestures. Narration may say only what the text says he did: came by boat, saw their faith, said, knew their thoughts, said to the paralytic. | scripture only |

How characters refer to Jesus: scribe POV — 「예수라는 사람」, 「그 사람」, 「그」 / "this Jesus", "the man", "he". Friend and Asher POV — 「그분」 / "him", "Jesus". Neutral narration and his speaker label — 「예수님」 / "Jesus".

### 6.2 Timeline of the day
1. **새벽 / Dawn** — Menahem reads Psalm 103 by lamplight with Hanan. Yonah mends nets on the shore. Asher wakes and prays.
2. **아침 / Morning** — Rumor: Jesus' boat is coming back across the sea. Stories of the storm (8:23–27) and of the demoniacs and the town that begged him to leave (8:28–34) got here first (how is invented). Yonah runs to Asher's house; his partners gather. A neighbor tells Menahem.
3. **늦은 아침 / Late morning — THE LANE** (§6.3).
4. **정오 무렵 / Around noon — THE CROWD** (§6.4), on open ground at the edge of town near the shore where Jesus has landed. No house, no roof, no door.
5. **Right after the crowd** — the true ending (version 4): no evening or epilogue scenes; it ends at the crowd or one step away (Asher's doorway at most). A cut branch may end elsewhere later that day (the guardhouse at night, Menahem's room by lamplight, the shore, Asher's house in the evening).

### 6.3 THE LANE — one moment, three routes (on every true path, after c1)
- A narrow lane of black basalt houses sloping down toward the shore. Late morning, bright, a breeze off the water.
- Yonah and his net partners carry Asher on his bed toward the crowd.
- A passerby mutters this exact line wherever it is shown:
  - KO: 「고통 뒤에 무슨 사연이 있는지 누가 알겠어. 저 사람은 무슨 잘못을 했기에 저렇게 됐을까.」
  - EN: "Who knows what's behind suffering like that. What did he do to end up like that?"
- Menahem and Hanan, walking down to see the teacher, step aside to let the bed pass. Menahem glances at the bed; for a moment his eyes meet Asher's. Neither speaks to the other.
- Player-chosen lines (Yonah answering the passerby, Asher whispering to Yonah) belong to that route only and must not contradict the facts above.

### 6.4 THE CROWD — fixed sequence (identical order in every route)
1. MT_9_1 — the boat arrives (may be narrated before the lane, seen from a distance).
2. The bed is set down before Jesus. MT_9_2A.
3. MT_9_2B — the first words. (Asher route may split it: MT_9_2B1, then MT_9_2B2.)
4. MT_9_3 — the scribes' unspoken thought. Scribe route: show MT_9_3Q as Menahem's own thought. Friend and Asher routes: never show the thought's words; show only that some scribes go silent and stiff.
5. MT_9_4N + MT_9_4Q — Jesus answers thoughts no one spoke aloud. Friend/Asher react: no one said anything.
6. MT_9_5.
7. MT_9_6A → MT_9_6N → MT_9_6B.
8. MT_9_7 — he rises and goes home (Asher route: press beats).
9. MT_9_8 — the crowd is afraid and glorifies God.
Nobody is punished. Jesus does nothing to the scribes. The scribes do nothing.

Version 4: the choices sit inside this sequence where they matter for each character; the last choice comes right after MT_9_7/MT_9_8. MT_9_1 is optional. The order must hold on every true path (the validator checks each one); a cut path may stop early. The true ending's memory-verse card repeats a verse already shown here and is not part of the sequence.

### 6.5 Glossary (use these exact terms)
| KO | EN |
| --- | --- |
| 예수님 (narration, label) | Jesus |
| 그분 | he / him |
| 서기관, 서기관들 | scribe, the scribes |
| 율법 | the Law |
| 회당 | synagogue |
| 침상 | bed (ESV's word; narration may say "his bed" — a light frame you can carry) |
| 중풍병자 | the paralytic (scripture only; narration uses Asher / 아셀) |
| 죄 사함 | forgiveness of sins |
| 네 죄 사함을 받았느니라 | your sins are forgiven |
| 안심하라 | take heart |
| 작은 자야 | my son (ESV); note: the word means "child" |
| 인자 | the Son of Man |
| 권능 | authority |
| 신성모독 | blasphemy |
| 가버나움 | Capernaum |
| 갈릴리 바다 | the Sea of Galilee |
| 예루살렘 성전 | the temple in Jerusalem |
| 데나리온, 품삯 | denarius, a day's wage |
| 두루마리 | scroll |
| 등잔 | oil lamp |
| 무리 | the crowd |
| 겉옷 | cloak |
| 그물 | nets |
| 나단, 다윗, 욥, 엘리야, 엘리사 | Nathan, David, Job, Elijah, Elisha |

Name spellings are fixed. Forbidden variants (validator errors): 메나헴, 므나햄, 하넌, 요나스, 아셰르, 아쉐르, Menachem, Jonah (for Yonah), Asel, Asser.

### 6.6 Backgrounds (BG ids — writers use only these; art agent draws all)
| BG id | Scene |
| --- | --- |
| black | dark screen for prologue and transitions |
| dawn_lamp | Menahem's room before dawn: basalt wall, oil lamp, open scroll |
| shore_dawn | Sea of Galilee at dawn: beached boats, nets, pale light |
| asher_ceiling | lying POV inside Asher's house: wooden beams, reed-and-mud roof, light from the doorway |
| asher_home | Asher's house at eye level: water jar, doorway, mat |
| lane | narrow lane between black basalt houses, late morning |
| sky_carried | lying POV outdoors: sky, the bed's corners and hands at the edges |
| crowd | open ground near the shore, crowd silhouettes, a place of warm light at the center, a few scribes at the front |
| crowd_lying | lying POV before Jesus: faces at the edges looking down, light above |
| road_home | the road home in afternoon light |
| doorway_evening | Asher's doorway at dusk |
| lamp_night | Menahem's room at night: lamp, notes |

## 7. Theology and accuracy guardrails
1. Jesus speaks only through scripture keys. No invented words, emotions, or gestures for him.
2. The game never states or implies that Asher's illness was caused by his sin. Characters may fear it in thoughts or options; narration never confirms it. No "sin removed → body released" framing or visuals (after 9:2B2, trying to get up still answers 「다리는 그대로다.」). No option gets a correct-answer sound, sparkle, or score.
3. No scores, ranks or numbers on screen, and never the words "true/good/bad ending" (those are data keys only). A cut branch is a pruned branch of one story, not a failure: never shame the player.
4. Scribes are sincere, not villains. Menahem's concern (what belongs to God) is right; the open question is the premise "he is just a man". Comic flaws are universal (pedantry, pride, overthinking).
5. Mark- or Luke-only details (roof, four men, house, "who can forgive sins but God alone" as spoken words) appear only as clearly labeled Easter eggs.
6. The crowd's response is exactly 9:8.
7. Cultural views are individual characters' views, never "everyone back then believed X".
8. Invented material (names, families, backstories, how rumors traveled, dialogue, cut branches) is acknowledged on the start screen (meta.disclaimer).
9. Never quote the Talmud (Nedarim 41a) in the first-century scenes; it is a later text.
10. Psalm 103:3's order (forgive, then heal) is literary, not a rule that one must be forgiven before being healed.
11. The true path follows the biblical story. The options that keep the story going are the ones that keep the person in it (going, carrying, staying, listening), not the ones with the most correct doctrine. Humor never comes from Asher's body or disability, from violence or injury; Jesus never refuses or fails (§4.6). Honorifics follow §3.4 and §6.1 (scribe POV: no honorifics for Jesus; friend and Asher POV: 그분 with honorific verbs).

## 8. Story shape (version 4; replaces the lens balance rules)
- 5–6 choices per route (`c1`…`c6`), each with 2–4 options; at least one 2-option choice and at least two 4-option choices per route.
- 4–6 cut branches (`endings.bad`) and 2–4 scold options per route; at least one comic quarrel at THE LANE that ends in an absurd cut branch, and at least one absurd cut branch in THE CROWD that is not simply leaving; most choices have a weird option (a cut or a scold). A character's own "can't" options (scold with speaker "thought", e.g. Asher's 「일어나기」 / 「밖으로 나가기」 / 「일어나 본다」, a teacher request) do not count toward the 2–3.
- Every choice keeps a continue option; every cut branch is reachable; every option has exactly one outcome.
- The true ending shows 1–3 beats before its last line; a cut branch 2–3.
- Screens and reading time: §4.5. Lengths: §3.3.
- The validator errors on the structural rules (2–4 options, outcomes, a continue option per choice, reachable cut branches, screens) and warns outside the counts above (writer guidance).
- No option names its outcome. Options are natural thoughts or actions, never labels.

## 9. Deviation policy and report format
- The route files are the story. Writers may tighten wording, split long lines and fix voice, and change an option or a branch only when needed for §7, §8 or canon consistency (§6). Log every deviation.
- Final report: (1) files written; (2) deviation log; (3) requests to other owners; (4) self-check results (commands you ran and their output summary).
