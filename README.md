# 주일학교 게임 · Sunday School Games

중고등부 수업에서 TV나 프로젝터 한 대로 함께 하는 성경 게임 모음이에요. 첫 화면은 앱 목록이고, 앱을 누르면 바로 게임이 열려요.

A small "app store" of Bible games for a youth Sunday-school class, played together on one screen.

- **열기 · Open:** https://bagmk.github.io/sunday-school/
- **오프라인:** 폴더의 `index.html`을 더블클릭하면 인터넷 없이 앱 목록이 열려요. 각 게임도 파일로 바로 열 수 있어요.

## 앱 · Apps

| 본문 · Passage | 제목 · Title | 종류 | 폴더 |
| --- | --- | --- | --- |
| 마태복음 9:1–8 · Matthew 9:1–8 | 그가 일어나기 전 · Before He Stood | 이야기 게임 (세 인물, 약 20분) | [`apps/before-he-stood/`](apps/before-he-stood/) |
| 마태복음 14:22–33 · Matthew 14:22–33 | 새벽 3시 · The Fourth Watch | 건너기 게임 (한 사람 60초, 키보드) | [`apps/fourth-watch/`](apps/fourth-watch/) |

- **그가 일어나기 전**: 자세한 사용법과 내용 수정 방법은 [`apps/before-he-stood/README.md`](apps/before-he-stood/README.md)에 있어요.
- **새벽 3시**: 파일 하나(`apps/fourth-watch/index.html`)로 된 게임이에요. 진행 방법은 아래에 있어요.

## 새벽 3시 · The Fourth Watch — 진행 (선생님용)

- 노트북을 프로젝터에 연결하고 게임을 열어 `Enter`로 시작해요. 학생 4–5명이 한 사람씩 60초 동안 하고, 선생님이 마지막에 해요.
- 시간이 끝나면 「다음 사람」 화면이 나오고, `Enter`를 누르면 다음 사람이 바로 시작해요.
- 선생님 전용 키 (화면에는 안내가 나오지 않아요):

| 키 | 기능 |
| --- | --- |
| `Enter` | 시작 · 계속 |
| `N` | 다음 사람으로 넘기기 |
| `D` | 리허설용 디버그 화면 켜기/끄기 (학생들 앞에서는 끄세요) |
| `M` | 소리 끄기/켜기 |
| `Esc` | 첫 화면 |
| `+` / `-` | 말씀 간격 ±1초 (8–12초) |
| `1` / `2` / `3` | 난이도 쉬움 / 보통 / 어려움 |

- 게임에 숨겨진 규칙은 수업 전에 `D` 화면을 켜고 직접 연습해 보세요. 학생들에게는 미리 말하지 않아요.
- 자동 검사: 주소 끝에 `?selftest=1`을 붙여 열면 시뮬레이션 검사가 돌고 결과가 브라우저 콘솔과 화면 왼쪽 위에 나와요.

## 폴더 구조

```
index.html                 앱 목록 (첫 화면)
apps/before-he-stood/      그가 일어나기 전 (이야기 게임, 도구와 테스트 포함)
apps/fourth-watch/         새벽 3시 (단일 파일 게임)
```

## 출처

성경 본문: 성경전서 개역개정판 © 대한성서공회. Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.

인물의 이름, 가족, 대화와 이야기는 창작이에요.
