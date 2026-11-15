# 마지막 게시물 · The Last Post

마태복음 16:21–23 수업의 도입으로 쓰는 댓글 화면이에요. 지어낸 앱 「follo」에서, 팔로워 5만 명인 지어낸 작가 지호가 글을 올렸어요. "요즘 내 마음이 온통 여기 가 있어요. 하나님이 내려놓으라고 하시는 것 같아요. 그래서 이 계정을 지우려고 해요." 아이들이 로그인 없이 댓글을 달고, 이야기는 선생님이 이끌어요. 파일 하나로 되어 있어요.

A one-file opener for Matthew 16:21–23. In a made-up app, a made-up artist with 50K followers posts that the account is about to be deleted. The class comments with no sign-in, and every open screen shows the same comments. The artist can like and answer each comment, and tapping the profile picture plays five short stories.

- **열기:** https://bagmk.github.io/sunday-school/apps/the-last-post/
- **선생님 컴퓨터:** https://bagmk.github.io/sunday-school/apps/the-last-post/?teacher=1 (한 번 열면 그 컴퓨터는 선생님 화면으로 기억돼요)
- **오프라인:** `index.html`을 더블클릭하면 열려요. 인터넷이 없으면 댓글은 그 기기에서만 보여요.

## 진행 (선생님용)

- **선생님 컴퓨터**를 TV나 프로젝터에 연결하고 `?teacher=1` 주소로 열어요. 선생님 화면에서는 어떤 댓글이든 지울 수 있고, 글 오른쪽 위 `•••` 메뉴에서 모든 기기의 댓글을 한 번에 지울 수 있어요(두 번 눌러야 지워져요). 끄려면 `?teacher=0`으로 한 번 열어요.
- **아이들 휴대폰**은 앱 목록(https://bagmk.github.io/sunday-school/)에서 「마지막 게시물」을 눌러요. 로그인은 없어요. 처음 들어오면 동물 하나가 정해지고, 글 쓰는 칸 위의 얼굴을 누르면 바꿀 수 있어요. 동물은 여덟이에요: 토끼, 거북이, 여우, 곰, 고양이, 강아지, 펭귄, 부엉이. 얼굴이 놓이는 순서는 기기마다 달라요. 아이들은 자기가 쓴 댓글만 지울 수 있어요.
- **컴퓨터 한 대로만 할 때**는 아이들이 돌아가며 얼굴을 눌러 바꾸고 댓글을 써요.
- 오른쪽 위에 `live`가 보이면 댓글이 다른 기기와 맞춰지고 있는 거예요. `offline`이면 그 기기에서만 보여요.
- `View all … comments`를 누르면 지어낸 팔로워 댓글 열두 개가 펼쳐져요. 말리는 이유가 저마다 달라요(아까워서, 팬이라서, 돈 때문에, 영향력 때문에, 후회할까 봐, 사람들 시선 때문에 …). 아이들이 먼저 쓰게 하려면 나중에 여세요.
- **스토리:** 지호의 프로필 사진(파란 고리)을 누르면 스토리 다섯 장이 넘어가요. 첫 그림과 팔로워 12명 → 5만 명 → "내 마음이 온통 여기 가 있었어요" → 기도 → 마지막 그림. 오른쪽을 누르면 다음, 왼쪽을 누르면 이전, 누르고 있으면 멈춰요. 컴퓨터에서는 화살표 키와 Esc도 돼요.
- 하트, Follow, 저장, 공유 버튼도 눌려요. 하트와 Follow는 그 기기에만 남아요.

## 지호의 좋아요와 답장

댓글마다 지호가 좋아요를 누르고 짧게 답장해요. 답장은 모든 기기에 보여요. 방법은 둘이고, 둘 다 켜도 댓글 하나에 답장은 하나만 달려요.

**1. 준비된 답장 (프로그램 없이)** — 선생님 화면(`?teacher=1`)의 `•••` 메뉴에서 「지호의 준비된 답장 켜기」를 눌러요. 새 댓글이 올라오면 2~3초 뒤에, 미리 써 둔 문장 가운데 댓글 내용에 맞는 것이 달려요. 선생님 화면이 열려 있는 동안만 움직여요.

**2. GPT 답장** — 선생님 컴퓨터의 터미널에서 작은 프로그램을 실행해요. Python 3.8 이상만 있으면 돼요.

```sh
curl -fsSLO https://bagmk.github.io/sunday-school/apps/the-last-post/tools/jiho_bot.py
python3 jiho_bot.py
```

- OpenAI 키를 물어봐요. 입력해도 화면에 보이지 않고, 어디에도 저장하지 않아요. 키를 웹페이지나 저장소에 넣지 마세요. (OpenAI는 웹페이지에서 직접 부르는 것을 막아 두어서, 페이지 안에서는 GPT를 쓸 수 없어요.)
- 키로 쓸 수 있는 작은 모델을 알아서 골라요. 직접 정하려면 `--model 모델이름`.
- GPT가 안 되면(키, 한도, 인터넷) 그 댓글에는 준비된 답장이 대신 달려요. `--ready`로 실행하면 GPT 없이 준비된 답장만 써요.
- `--dry-run`은 답장을 보여 주기만 하고 쓰지 않아요. 끝낼 때는 `Ctrl+C`.
- 댓글의 글자만 OpenAI로 보내요. 동물 이름이나 기기 정보는 보내지 않아요.
- 지호는 한두 문장으로, 댓글과 같은 말(한국어/영어)로 답해요. 마음은 받아 주되 결정은 바꾸지 않고, 설교하거나 성경을 인용하지 않아요. 수업의 결론은 선생님이 이끌어요.

<details>
<summary>이 글이 본문과 이어지는 곳 (선생님만 보세요)</summary>

- 지호는 따르는 사람 5만 명을 두고 계정을 지우러 가요. 예수님은 따르던 오천 명(마 14:21)을 두고, 고난받고 죽으러 예루살렘에 올라가야 한다고 하세요(16:21).
- 아이들이 다는 댓글은 대부분 지호를 아껴서 말리는 말이에요. 베드로가 한 말(16:22)과 같은 자리에 놓여요.
- 예수님은 그 말을 "하나님의 일"이 아니라 "사람의 일"을 생각하는 것이라고 하세요(16:23). 댓글을 하나씩 「사람 뜻 / 하나님 뜻」으로 나눠 보면 그 말씀이 그대로 보여요.
- 지어낸 팔로워 댓글 가운데 `church_friend`의 "그 계정으로 하나님 일을 하면 되잖아요"가 핵심이에요. 믿음 좋은 말처럼 들리지만, 하나님이 하라신 것과 달라요.
- 지호와 예수님은 크기가 달라요. 같은 것은 따르는 사람들을 두고 가는 길과, 아끼는 마음으로 말리는 친구예요.

</details>

## 댓글이 맞춰지는 방식

- 댓글은 Firebase 프로젝트 `sunday-school-1ee25`의 Realtime Database, `/lastpost/comments` 아래에 저장돼요. 로그인도 SDK도 없이 REST 주소로만 읽고 써요.
- 지호의 답장은 `/lastpost/replies/<댓글 키>` 아래에 글(300자까지)과 시각으로 저장돼요. 답장이 있으면 좋아요도 같이 보여요. 댓글을 지우면 답장도 같이 지워져요.
- 열려 있는 화면은 2초마다 댓글 목록을 다시 가져와요. 화면이 가려져 있으면 쉬어요.
- 인터넷이 끊기면 댓글은 그 기기에 남았다가, 다시 이어지면 올라가요. 같은 댓글이 두 번 올라가지 않게 확인해요.
- 저장되는 것은 댓글마다 동물 번호, 글(200자까지), 쓴 시각뿐이에요. 이름이나 기기 정보는 저장하지 않아요.

### Realtime Database 규칙

Firebase 콘솔 → Realtime Database → 규칙에 넣어요. 댓글과 답장의 읽기, 새로 쓰기, 지우기만 열려 있고, 고치기와 다른 경로는 막혀 있어요. `replies` 부분이 없어도 댓글은 그대로 되고, 답장만 안 보여요.

```json
{
  "rules": {
    "lastpost": {
      "comments": {
        ".read": true,
        "$id": {
          ".write": "!data.exists() || !newData.exists()",
          ".validate": "newData.hasChildren(['who', 'text', 't']) && newData.child('who').isNumber() && newData.child('who').val() >= 0 && newData.child('who').val() <= 7 && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 200 && newData.child('t').isNumber()",
          "$field": { ".validate": "$field == 'who' || $field == 'text' || $field == 't'" }
        }
      },
      "replies": {
        ".read": true,
        "$id": {
          ".write": "!data.exists() || !newData.exists()",
          ".validate": "newData.hasChildren(['text', 't']) && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 300 && newData.child('t').isNumber()",
          "$field": { ".validate": "$field == 'text' || $field == 't'" }
        }
      }
    }
  }
}
```

- 주소를 아는 사람은 누구나 댓글과 답장을 쓰고 지울 수 있어요. 수업이 끝나면 `".read"`와 `".write"`를 `false`로 바꿔 닫아 두세요.
- 데이터베이스를 미국(us-central1)이 아닌 곳에 만들었다면 주소가 달라요. `index.html`의 `DB_DEFAULT`를 그 주소로 바꾸거나, 주소 끝에 `?db=https://…`를 붙여요.

## 주소 끝에 붙일 수 있는 것

| 붙이는 것 | 하는 일 |
| --- | --- |
| `?teacher=1` | 이 기기를 선생님 화면으로 기억해요 (`?teacher=0`으로 끔) |
| `?reset=1` | 이 기기에 남아 있던 댓글과 하트, 얼굴 순서를 잊고 시작해요 (다른 기기의 댓글은 그대로예요) |
| `?db=off` | 댓글을 맞추지 않고 이 기기에서만 써요 |
| `?db=https://…` | 다른 Realtime Database 주소를 써요 |

## 지어낸 것

앱 follo, 작가 지호, 프로필 사진(사진처럼 그린 그림이에요)과 「마지막 그림」, 스토리, 팔로워 수와 팔로워 댓글, 지호의 답장은 모두 이 수업을 위해 지어낸 것이에요. 실제 서비스나 사람이 아니고, 화면 아래에도 그렇게 적혀 있어요.

## 파일

- `index.html` — 화면 전체 (파일 하나)
- `tools/jiho_bot.py` — GPT 답장 프로그램 (선생님 컴퓨터에서 실행)
