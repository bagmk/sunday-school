/* UI chrome strings (buttons, labels, settings, snip card, story trees, errors). Owner: engine agent. Every entry is a T object. */
(function () {
  var BHS = (window.BHS = window.BHS || {});

  function T(ko, en) {
    return { ko: ko, en: en };
  }

  BHS.ui = {
    // Title screen
    start: T("시작하기", "Start"),
    continueGame: T("이어서 하기", "Continue"),
    continueFrom: T("저장된 곳", "Saved at"),
    treesOpen: T("이야기 나무", "Story trees"),
    langPrompt: T("어떤 말로 볼까요?", "Choose a language"),
    langKo: T("한국어", "한국어"),
    langEn: T("English", "English"),
    langBoth: T("함께 보기", "Both"),

    // Header
    home: T("처음 화면으로", "Back to title"),
    langShortKo: T("한", "한"),
    langShortEn: T("EN", "EN"),
    langShortBoth: T("함께", "Both"),
    langGroup: T("언어", "Language"),
    settingsOpen: T("글자 설정", "Text settings"),
    fullscreenEnter: T("전체 화면", "Full screen"),
    fullscreenExit: T("전체 화면 끝내기", "Exit full screen"),

    // Settings
    settingsTitle: T("글자 설정", "Text settings"),
    textSpeed: T("글자 속도", "Text speed"),
    speedSlow: T("느리게", "Slow"),
    speedNormal: T("보통", "Normal"),
    speedInstant: T("바로", "Instant"),
    textSize: T("글자 크기", "Text size"),
    sizeSmaller: T("작게", "Smaller"),
    sizeLarger: T("크게", "Larger"),
    close: T("닫기", "Close"),

    // Confirm dialog
    confirmHomeTitle: T("처음 화면으로 갈까요?", "Go back to the title screen?"),
    confirmHomeBody: T("지금 있는 곳은 저장돼요. 처음 화면에서 이어서 할 수 있어요.", "Your place is saved. You can continue from the title screen."),
    confirmHomeBodyOff: T("이 기기에서는 저장이 꺼져 있어서 지금 있는 곳이 남지 않아요.", "Saving is off on this device, so your place won't be kept."),
    confirmHomeYes: T("처음 화면으로", "Go to title"),
    confirmNo: T("계속하기", "Keep playing"),

    // Play
    advance: T("다음", "Next"),
    tapHint: T("누르거나 스페이스 키로 넘어가요", "Tap or press Space to continue"),
    readReceipt: T("읽음 ✓", "Read ✓"),
    pressDefault: T("누르기", "Tap"),
    choiceGroup: T("선택", "Choice"),
    actionsGroup: T("할 수 있는 일", "Things you can try"),
    pinnedThought: T("속생각", "Unspoken thought"),

    // True ending
    endingCardHint: T("누르면 넘어가요", "Press to continue"),

    // Snip card (a cut branch)
    snipStamp: T("싹둑!", "Snip!"),
    snipLine: T("여기서 이야기가 끊겼어요.", "The story got cut off here."),
    snipRetry: T("다시 고르기", "Try again"),
    snipHome: T("처음 화면", "Title screen"),

    // Story trees
    treeTitle: T("이야기 나무", "Story tree"),
    treesTitle: T("이야기 나무", "Story trees"),
    treeHint: T("가위 자국은 이야기가 끊긴 곳이에요. 흐린 가지는 아직 안 가 본 길이에요.", "A snip marks where the story got cut off. Faint branches are paths you haven't tried yet."),
    treeNext: T("다른 인물로 하기", "Next character"),
    treeHome: T("처음 화면", "Title screen"),
    treeGoalUnseen: T("아직 끝까지 가지 않았어요", "Not finished yet"),
    treeBranchUnseen: T("아직 안 가 본 가지", "A branch not tried yet"),

    // Route select (the suggested-order line itself is BHS.common.routeSelect.hint)
    routePlayed: T("✓ 끝까지 함", "✓ Finished"),

    // Errors and notices
    storageOff: T("이 기기에서는 저장이 꺼져 있어요. 그래도 끝까지 할 수 있어요.", "Saving is off on this device. You can still play to the end."),
    resumeFailed: T("저장된 곳을 불러오지 못했어요. 처음부터 시작해 주세요.", "Your saved place couldn't be loaded. Please start again."),
    routeMissing: T("이 인물의 이야기는 아직 준비 중이에요.", "This character's story isn't ready yet."),
    noscript: T("이 게임은 자바스크립트가 필요해요.", "This game needs JavaScript."),

    // Debug panel (?debug=1)
    debugTitle: T("디버그", "Debug"),
    debugJump: T("이동", "Jump"),
    debugAutoPick: T("자동 선택", "Auto-pick"),
    debugAutoPlay: T("끝까지 자동", "Auto-play to end"),
    debugCut: T("끊긴 가지", "Cut branch"),
    debugHide: T("숨기기", "Hide")
  };
})();
