# Build "새벽 3시 · The Fourth Watch" — a Frogger-style classroom game (single HTML file)

## Context (read first)
This game is for a 20-minute youth Sunday-school lesson on Matthew 14:22–33 (Peter walking on the water). It runs offline on a laptop connected to a projector; 4–5 students take turns at the keyboard, then the teacher plays last.

It must look and feel like an ordinary "cross the lanes, dodge the obstacles" game. It contains a hidden mechanic that only the teacher knows:
- Dodging the wind lane by lane (the natural strategy) must never get Peter across.
- About every 10 seconds Jesus quietly says "오라 / Come". If the player presses and holds ↑ while He is speaking, and keeps holding it, Peter walks straight across on the Word and the wind cannot touch him.
- Sinking never ends the game. Peter cries out, a hand of light reaches down and lifts him, Jesus speaks, and Peter restarts from the boat.

Never reveal or hint at the Word mechanic in any on-screen text, tutorial, or tooltip. The speech bubble must look like ambient animation.

Six reference mockups are attached (1_title, 2_play, 3_word, 4_sinkcry, 5_sinkhand, 6_result). Match their layout, palette, and mood. Ignore the small "MOCKUP" badges in the top-right corner.

## Deliverable
- One file: `index.html` with inline CSS and JS. No external libraries, fonts, images, or network calls; it must run from `file://`.
- Vanilla JS, Canvas 2D. Logical resolution 1280×720, scaled to fit the window with letterboxing, devicePixelRatio-aware.
- Fixed-timestep update at 60 Hz; render with requestAnimationFrame.
- All tunables in one `CONFIG` object at the top.
- Brief English comments only. No console errors.

## Layout (logical px)
- Top zone y 0–110: night sky with dark storm-cloud blobs. Jesus stands on the water at top center (feet at y≈100).
- Sea y 110–630: 8 horizontal lanes, 65 px each. Lane 1 is just above the boat; lane 8 is just below Jesus.
- Boat zone y 630–720: boat silhouette centered; Peter starts at the bow (x = 640).
- Grid: 16 columns × 80 px. In normal mode Peter moves exactly one column (←/→) or one lane (↑/↓) per key press.

## Visual style (match the mockups)
- **Background:** vertical gradient #060b15 → #0a1424 (sky), #0b1b2e → #06121f (sea).
  - Lane bands alternate rgba(20,48,76,.30) / rgba(10,30,54,.30).
  - 3 thin animated wave lines per lane, rgba(150,190,230,.05–.09).
  - Faint diagonal rain, rgba(180,200,230,.08).
- **Jesus:** a figure made of light — round head plus bell-shaped robe, no facial features, color rgba(255,246,226,.95) with a warm shadow glow.
  - Large radial glow behind him: rgba(255,238,200,.55) fading to 0 over r≈270.
  - Shimmering reflection under him: 9 short horizontal gold lines that shrink downward.
  - During a Word window the glow brightens about 20%.
- **Word bubble:** small, translucent, thin gold outline (≈118×42), to the right of Jesus' head.
  - Text: "오라" in serif 21 px, then "Come" in sans 14 px at 60% alpha.
  - No sound, no flashing, no shake.
- **Wind gusts:** three tapered white bezier strands with a curl at the leading end and a few spray dots, alpha ≈.55.
  - The leading end points in the direction of travel.
  - Odd lanes travel right, even lanes travel left.
- **Peter:** simple pale steel-blue figure (#a9bdd6) — round head, robe, two arms, faint belt line — about 26×60 px, with a soft blue halo so he reads on a projector.
  - In Word Walk: cream (#f4e6c6) with a gold glow and a fading gold light trail back toward the boat.
  - When sinking: clipped at the waterline (waist-deep), right arm raised, 3 elliptical ripples.
- **Boat:** near-black hull silhouette with a mast and 5 small disciple silhouettes.
- **HUD (only these two during play):**
  - Top-left: "{name} · {m:ss}" (17 px, 85% white).
  - Bottom-left: "← ↑ → 이동 · Arrow keys" (14 px, 50% white).
- **Fonts:**
  - Sans: "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif
  - Serif (title and scripture lines): "Noto Serif KR","AppleMyungjo","Batang",serif

## CONFIG defaults
```js
const CONFIG = {
  LANES: 8, LANE_H: 65, TOP_H: 110, COLS: 16, COL_W: 80,
  STEP_COOLDOWN_MS: 110,
  WORD_FIRST_AT_S: 6,      // first Word window after a turn starts
  WORD_INTERVAL_S: 10,     // adjustable 8–12 with +/- keys
  WORD_DURATION_S: 2.5,
  WORD_HOLD_ARM_S: 0.35,   // ↑ must be pressed during a window and held this long
  WORD_WALK_CROSS_S: 5.0,  // time to cross all 8 lanes while holding ↑
  STILL_LIMIT_S: 2.0,      // standing still on the sea starts sinking
  PLAYER_TIME_S: 60,       // per-player turn, unlimited respawns
  LANE_SPEED: [90, 110, 130, 150, 175, 200, 230, 260],   // px/s, lane 1→8
  GUST_LEN:   [120, 140, 140, 160, 170, 180, 190, 210],  // px, lane 1→8
  SUDDEN_P:   [0, 0, 0, 0.15, 0.35, 0.55, 0.75, 1.0],    // lane 1→8, normal mode only
  SUDDEN_TELEGRAPH_S: [0.7, 0.7, 0.7, 0.7, 0.6, 0.5, 0.45, 0.25],
  SINK_LINE: 'v31',        // 'v31' | 'v27' | 'alternate'
  RESPAWN_CALM_S: 1.0,
};
```

## States
TITLE → NAME_ENTRY → PLAYING ⇄ WORD_WALK → (SINKING → RESPAWN → PLAYING) or REACHED → TURN_END → next player … → REVEAL

## Mechanics

**Normal movement (PLAYING)**
- One discrete step per keydown, with STEP_COOLDOWN_MS.
- No auto-repeat while a key is held.
- Peter cannot leave the screen sideways.

**Word windows (hidden)**
- First window at WORD_FIRST_AT_S, then every WORD_INTERVAL_S, each lasting WORD_DURATION_S.
- During a window: the bubble shows and Jesus' glow brightens. Nothing else changes.

**WORD_WALK (hidden)**
- **Trigger:** ArrowUp keydown occurs inside an active window, and the key stays held for WORD_HOLD_ARM_S.
  - Holding ↑ from before the window opened must NOT trigger it.
  - Taps must not trigger it.
- **While held:**
  - Peter glides upward continuously, crossing all 8 lanes in WORD_WALK_CROSS_S.
  - All gust collisions are ignored, and no sudden gusts spawn.
  - Gusts within ±60 px of his column fade to about 15% alpha.
  - Peter glows and leaves a gold trail.
- The window may close mid-walk; the walk continues as long as ↑ stays held.
- **Exit:** releasing ↑, or pressing ←, →, or ↓. This means "he looked at the wind."
  - Snap Peter to the nearest lane and return to PLAYING immediately.
  - Then, with probability 0.9, spawn a sudden gust at his column with a 0.5 s telegraph.

**Wind lanes (normal mode)**
- **Traveling gusts:**
  - Each lane spawns gusts off-screen at LANE_SPEED[n], with random gaps of 1.5–3.5 s.
  - Gaps shrink 10% per lane above lane 4.
  - Lanes 1–4 must always be crossable with reasonable timing, so players feel progress.
- **Sudden gusts:** when Peter steps into lane n, with probability SUDDEN_P[n]:
  1. A spray-burst telegraph appears at his column for SUDDEN_TELEGRAPH_S[n].
  2. A gust then forms there and sweeps in the lane's direction.
  3. In lane 8, the sudden gust covers his column and both neighbors, so a sidestep cannot escape it.
- **Target outcome:** players regularly reach lanes 5–7 ("I almost made it") but never lane 8 → top in normal mode.
- **Collision:** Peter's hitbox (≈24×36, body only) overlaps a gust core (front 70% of its length, ±14 px from lane center). Collision → SINKING.

**Standing still**
- On any sea lane, no movement for STILL_LIMIT_S → SINKING. Fear freezes him.

**SINKING → RESPAWN (≈4.5 s, input disabled, wind keeps moving)**
1. **0.0–0.8 s:** Peter sinks to the waist; ripples; a dark vignette ramps to about .55.
2. **0.3–1.3 s:** Peter's white speech bubble with dark text: "주여, 나를 구원하소서!" / "Lord, save me!"
3. **1.2–1.8 s:** A hand of light extends quickly from Jesus to Peter's raised hand. It is a glowing curved arm ending in an open hand (see mockup 5). The vignette deepens to about .72.
4. **1.8–3.8 s:** Only after the hand arrives, a dark rounded caption box near the bottom shows:
   - Line 1 (serif 30 px, glow):
     - `v31` (default): "믿음이 작은 자여, 왜 의심하였느냐?"
     - `v27`: "안심하라. 나다. 두려워하지 말라."
     - `alternate`: switch between the two each sinking.
   - Line 2 (sans 16 px, 60%): "You of little faith, why did you doubt? · 마태복음 14:31", or "Take heart; it is I. Do not be afraid. · 마태복음 14:27".
   - Small text below the box: "잠시 후 배에서 다시 시작합니다 · Restarting from the boat…"
5. **3.8–4.5 s:** Fade out and in. Peter respawns at the bow. All gusts pause for RESPAWN_CALM_S (14:32: the wind ceased when they got into the boat), then resume.
- Never show "Game Over."

**REACHED (win)**
- When Peter enters the top zone:
  - The wind calms and Jesus' glow envelops Peter.
  - Caption for 3 s: "안심하라. 나다. 두려워하지 말라." / "Take heart; it is I. Do not be afraid. · 마태복음 14:27"
- Then TURN_END.

## Turns, stats, teacher controls
- **NAME_ENTRY:** use a small HTML `<input>` overlay so Korean IME works; Enter confirms.
- **Turn timing:** each turn lasts PLAYER_TIME_S with unlimited respawns; the countdown shows in the HUD.
  - At 0: show "시간 종료 · Time's up" for 2 s.
  - Then TURN_END: "다음 사람 · Next player (N)".
  - Show no stats here.
- **Per-player stats:**
  - `wordsHeard`: Word windows that opened during the turn.
  - `wordWalks`: Word Walks started.
  - `sinks`: number of sinkings.
  - `maxLane`: highest lane reached (0–8).
  - `reached`: whether Peter reached Jesus.
- **Hidden keys:**
  - Enter: start / continue
  - N: next player
  - R: REVEAL screen
  - D: debug overlay — Word timer bar, lane numbers, hitboxes, sudden-gust probabilities, FPS — for teacher rehearsal only
  - M: mute
  - Esc: title
  - + / −: Word interval ±1 s
  - 1 / 2 / 3: difficulty presets that scale SUDDEN_P and LANE_SPEED by 0.85 / 1.0 / 1.15
- **REVEAL screen (mockup 6):**
  - Title: "결과 공개 · Results"
  - Columns: 이름 / 들린 '오라' (Heard 'Come') / 말씀 걷기 (Word walks) / 가라앉음 (Sank) / 최고 도달 (Best lane, shown as "6 / 8", or "도착 ✓" if reached)
  - Gold for the Heard column and for any row that reached Jesus; muted grey for zero Word walks.
  - Footer: "말씀은 처음부터 들리고 있었습니다." / "The Word was speaking the whole time."

## Title screen (mockup 1)
- Dimmed scene behind a rounded dark panel:
  - "새벽 3시" (serif 78 px, warm glow)
  - "The Fourth Watch"
  - "배에서 예수님께로 건너가세요 · Cross from the boat to Jesus"
  - Pill button: "Enter ▶ 시작 · Start"
- Keep this neutral title. Do not title the game "오라" on screen.

## Audio (Web Audio API, procedural, starts on first key press)
- **Wind:** continuous filtered white noise (bandpass ≈400–900 Hz) with a slow LFO. Add a louder whoosh when a gust passes within 150 px of Peter.
- **Splash:** a short noise burst when sinking starts.
- **The Word is completely silent.** The wind is loud and the Word is quiet; that contrast is intentional.

## Acceptance tests
Add a hidden self-test, `?selftest=1`, that runs headless simulations and logs results to the console, then verify:
1. A greedy dodging bot never reaches the top in 200 runs. The bot steps up when the lane above looks clear for 0.6 s and sidesteps when threatened.
2. Press-and-hold ↑ at a Word window from the boat reaches Jesus in 5 ± 0.3 s, in 200 of 200 runs.
3. Holding ↑ from before a window opens does not start a Word Walk.
4. Releasing ↑ mid-walk restores normal rules instantly.
5. Standing still for 2 s on the sea triggers sinking.
6. The sinking order is always cry → hand → line → respawn, and "Game Over" never appears.
7. REVEAL numbers match the session.
8. The game runs from `file://` in Chrome, Edge, and Safari with zero network requests.
