# 주일학교 수업과 게임 · Sunday School Lessons & Games

중고등부 수업을 위해 만든 활동을 모았어요. 본문 하나에 활동 하나, 대부분 20분짜리입니다. 수업마다 진행안과 인쇄 자료가 있고, 그중 둘은 TV나 프로젝터 한 대로 함께 하는 웹 게임이에요.

Activities made for a youth Sunday-school class: one passage, one activity, mostly 20 minutes. Each lesson has a teacher's guide (in Korean) and printables; two of them are web games played together on one screen.

- **게임 열기 · Play:** https://bagmk.github.io/sunday-school/
- **블로그 · Blog:** https://salt-light.tistory.com/category/%EA%B5%90%EC%9C%A1
- **오프라인:** 폴더의 `index.html`을 더블클릭하면 인터넷 없이 앱 목록이 열려요. 각 게임도 파일로 바로 열 수 있어요.

## 수업 · Lessons

| | 본문 · Passage | 수업 · Lesson | 형식 | 자료 |
| --- | --- | --- | --- | --- |
| 1 | 에스라 4–6장 · Ezra 4–6 | [왕을 설득하라](lessons/01-ezra-4-6-persuade-the-king/) | 카드게임 · 20분 | 카드 20장, 역할 카드, 정답표, 진행 시트 |
| 2 | 느헤미야 9장 · Nehemiah 9 | [스물네 조각 보드](lessons/02-nehemiah-9-board/) | 보드게임 · 20분 | 24칸 보드, 카드 25장 |
| 3 | 에스라–느헤미야 · Ezra–Nehemiah | [Breaking News](lessons/03-ezra-nehemiah-breaking-news/) | 기자 취재와 보도 · 60분 | 주제표, 빈 기자증 |
| 4 | 마태복음 3:17–4:11 · Matthew 3:17–4:11 | [Operation Zero · 작전명: 제로](lessons/04-matthew-4-operation-zero/) | 역할극 | 브리핑 슬라이드, 학생 카드 8쪽 |
| 5 | 마태복음 9:1–8 · Matthew 9:1–8 | [그가 일어나기 전 · Before He Stood](lessons/05-matthew-9-before-he-stood/) | 이야기 게임(웹) · 약 20분 | [게임](apps/before-he-stood/) |
| 6 | 마태복음 14:22–33 · Matthew 14:22–33 | [새벽 3시 · The Fourth Watch](lessons/06-matthew-14-fourth-watch/) | 건너기 게임(웹) · 20분 | [게임](apps/fourth-watch/), 게임 뒤 슬라이드 |

만든 순서대로예요. 1–3은 2026년 8–9월 에스라·느헤미야, 4–6은 10–11월 마태복음입니다.

## 웹 게임 · Apps

| 본문 · Passage | 제목 · Title | 종류 | 폴더 |
| --- | --- | --- | --- |
| 마태복음 9:1–8 · Matthew 9:1–8 | 그가 일어나기 전 · Before He Stood | 이야기 게임 (세 인물, 약 20분) | [`apps/before-he-stood/`](apps/before-he-stood/) |
| 마태복음 14:22–33 · Matthew 14:22–33 | 새벽 3시 · The Fourth Watch | 건너기 게임 (한 사람 60초, 키보드 · 휴대폰) | [`apps/fourth-watch/`](apps/fourth-watch/) |
| 마태복음 16:21–23 · Matthew 16:21–23 | 마지막 게시물 · The Last Post | 댓글 달기 (수업 도입, 컴퓨터 · 휴대폰, 로그인 없음) | [`apps/the-last-post/`](apps/the-last-post/) |

- **그가 일어나기 전**: 사용법과 내용 수정 방법은 [`apps/before-he-stood/README.md`](apps/before-he-stood/README.md)에 있어요.
- **새벽 3시**: 선생님용 키, 숨겨진 규칙, 휴대폰 버전 조작은 [`apps/fourth-watch/README.md`](apps/fourth-watch/README.md)에 있어요.
- **마지막 게시물**: 지어낸 작가의 글에 반 아이들이 댓글을 다는 화면이에요. 선생님 화면, 댓글이 맞춰지는 방식, 데이터베이스 규칙은 [`apps/the-last-post/README.md`](apps/the-last-post/README.md)에 있어요.

## 수업을 만드는 기준

참여하면서 이해하고, "그랬구나"로 끝내지 않고, 그 자리에 서 보고, 재미있고, 너무 복잡하지 않게. 이 다섯 가지와 여섯 수업이 각각 어디서 아이의 생각을 뒤집는지는 [`docs/five-criteria.md`](docs/five-criteria.md)에 적어 두었습니다.

## 폴더 구조

```
index.html                 앱 목록과 수업 목록 (첫 화면)
lessons/                   수업별 진행안과 인쇄 자료 (01–06)
apps/before-he-stood/      그가 일어나기 전 (이야기 게임, 도구와 테스트 포함)
apps/fourth-watch/         새벽 3시 (index.html: 키보드 버전, mobile.html: 휴대폰 버전)
apps/the-last-post/        마지막 게시물 (index.html: 지어낸 앱의 글·댓글·스토리, tools/: 답장 프로그램)
docs/five-criteria.md      수업을 만들 때 보는 다섯 가지
```

## 출처

성경 본문: 성경전서 개역개정판 © 대한성서공회. Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.

게임 속 인물의 이름, 가족, 대화와 이야기는 창작이에요. 「마지막 게시물」의 앱 follo, 작가 지호, 팔로워와 댓글도 모두 지어낸 것이에요.
