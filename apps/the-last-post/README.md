# 마지막 게시물 · The Last Post

마태복음 16:21–23 수업의 도입으로 쓰는 댓글 화면이에요. 지어낸 앱 「follo」에서, 팔로워 5만 명인 지어낸 작가 지호가 글을 올렸어요. "요즘 내 마음이 온통 여기 가 있어요. 하나님이 내려놓으라고 하시는 것 같아요. 그래서 이 계정을 지우려고 해요." 아이들이 로그인 없이 댓글을 달고, 이야기는 선생님이 이끌어요. 파일 하나로 되어 있어요.

A one-file opener for Matthew 16:21–23. In a made-up app, a made-up artist with 50K followers posts that the account is about to be deleted. The class comments with no sign-in, and every open screen shows the same comments.

- **열기:** https://bagmk.github.io/sunday-school/apps/the-last-post/
- **선생님 컴퓨터:** https://bagmk.github.io/sunday-school/apps/the-last-post/?teacher=1 (한 번 열면 그 컴퓨터는 선생님 화면으로 기억돼요)
- **오프라인:** `index.html`을 더블클릭하면 열려요. 인터넷이 없으면 댓글은 그 기기에서만 보여요.

## 진행 (선생님용)

- **선생님 컴퓨터**를 TV나 프로젝터에 연결하고 `?teacher=1` 주소로 열어요. 선생님 화면에서는 어떤 댓글이든 지울 수 있고, 글 오른쪽 위 `•••` 메뉴에서 모든 기기의 댓글을 한 번에 지울 수 있어요(두 번 눌러야 지워져요). 끄려면 `?teacher=0`으로 한 번 열어요.
- **아이들 휴대폰**은 앱 목록(https://bagmk.github.io/sunday-school/)에서 「마지막 게시물」을 눌러요. 로그인은 없어요. 처음 들어오면 동물 하나가 정해지고, 글 쓰는 칸 위의 얼굴을 누르면 바꿀 수 있어요. 동물은 여덟이에요: 토끼, 거북이, 여우, 곰, 고양이, 강아지, 펭귄, 부엉이. 아이들은 자기가 쓴 댓글만 지울 수 있어요.
- **컴퓨터 한 대로만 할 때**는 아이들이 돌아가며 얼굴을 눌러 바꾸고 댓글을 써요.
- 오른쪽 위에 `live`가 보이면 댓글이 다른 기기와 맞춰지고 있는 거예요. `offline`이면 그 기기에서만 보여요.
- `View all … comments`를 누르면 지어낸 팔로워 댓글 네 개가 펼쳐져요. 아이들이 먼저 쓰게 하려면 나중에 여세요.
- 하트, Follow, 저장, 공유 버튼도 눌려요. 하트와 Follow는 그 기기에만 남아요.

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
- 열려 있는 화면은 2초마다 댓글 목록을 다시 가져와요. 화면이 가려져 있으면 쉬어요.
- 인터넷이 끊기면 댓글은 그 기기에 남았다가, 다시 이어지면 올라가요. 같은 댓글이 두 번 올라가지 않게 확인해요.
- 저장되는 것은 댓글마다 동물 번호, 글(200자까지), 쓴 시각뿐이에요. 이름이나 기기 정보는 저장하지 않아요.

### Realtime Database 규칙

Firebase 콘솔 → Realtime Database → 규칙에 넣어요. 댓글 목록 읽기, 새 댓글 쓰기, 댓글 지우기만 열려 있고, 고치기와 다른 경로는 막혀 있어요.

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
      }
    }
  }
}
```

- 주소를 아는 사람은 누구나 댓글을 쓰고 지울 수 있어요. 수업이 끝나면 `".read"`와 `".write"`를 `false`로 바꿔 닫아 두세요.
- 데이터베이스를 미국(us-central1)이 아닌 곳에 만들었다면 주소가 달라요. `index.html`의 `DB_DEFAULT`를 그 주소로 바꾸거나, 주소 끝에 `?db=https://…`를 붙여요.

## 주소 끝에 붙일 수 있는 것

| 붙이는 것 | 하는 일 |
| --- | --- |
| `?teacher=1` | 이 기기를 선생님 화면으로 기억해요 (`?teacher=0`으로 끔) |
| `?reset=1` | 이 기기에 남아 있던 댓글과 하트를 잊고 시작해요 (다른 기기의 댓글은 그대로예요) |
| `?db=off` | 댓글을 맞추지 않고 이 기기에서만 써요 |
| `?db=https://…` | 다른 Realtime Database 주소를 써요 |

## 지어낸 것

앱 follo, 작가 지호, 프로필 그림과 「마지막 그림」, 팔로워 수와 팔로워 댓글은 모두 이 수업을 위해 지어낸 것이에요. 실제 서비스나 사람이 아니고, 화면 아래에도 그렇게 적혀 있어요.
