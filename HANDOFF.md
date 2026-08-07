# 인수인계 — 다른 컴퓨터에서 이어서 작업하기

이 문서 하나만 읽으면 지금 상태를 파악하고 이어서 작업할 수 있도록 정리했다.
설계 배경은 [STACK.md](STACK.md) · [PHYSICS.md](PHYSICS.md) · [REFERENCE.md](REFERENCE.md) ·
[GAME_DESIGN.md](GAME_DESIGN.md) · [SCENARIO.md](SCENARIO.md)에 나뉘어 있다.

---

## 1. 이 게임이 무엇인가

**귀곡의 초원** — 1998년 국산 게임 *퇴마전설*과 그 온라인판 *슬레이어즈*에 대한 오마주.
브라우저에서 도는 쿼터뷰 액션 RPG. 배포는 GitHub Pages(정적 호스팅).

원작에서 가져온 것은 **컨셉**이다(선택적 스킬 성장 · 성향 · 술법 이펙트 · 캐릭터 선택).
진짜 온라인화는 v2.0으로 미뤄뒀고, 지금은 WebRTC P2P로 협동만 붙어 있다.

---

## 2. 개발 환경 세팅

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 생성 (약 3~4분)
```

Node 20 기준. 빌드가 느린 건 Babylon.js 번들 크기 때문이며 정상이다.

`.claude/launch.json`에 `game-dev` 항목이 있어 Claude Code의 preview 도구로 바로 띄울 수 있다.

---

## 3. 기술 스택 — **중요: three.js가 아니라 Babylon.js다**

조사 문서(STACK.md의 원본 리서치)는 three.js를 전제로 쓰여 있지만
실제 구현은 **Babylon.js + Havok**이다. 문서의 권고를 적용할 때는 항상 Babylon API로 번역해야 한다.
이 불일치는 STACK.md §0에 명시해뒀다.

| 항목 | 선택 | 이유 |
|---|---|---|
| 렌더러 | Babylon.js | 이미 구현이 여기에 얹혀 있다 |
| 물리 | Havok (WASM) | **단일 스레드 빌드 필수** — Pages는 COOP/COEP 헤더를 못 준다 |
| 번들러 | Vite (`base: './'`) | Pages 하위 경로 배포 |
| 멀티 | Trystero 0.25 (WebRTC, nostr 시그널링) | 41KB · MIT · 서버 불필요 |
| 에셋 | KayKit CC0 (Adventurers / Skeletons) | 재배포 가능 |
| 이펙트 | 직접 구현 (Effekseer 안 씀) | 번들 0KB · 플랫 셰이딩과 톤이 맞는다 |

---

## 4. 소스 구조

```
src/
  main.js              게임 루프 · 네트워크 이벤트 처리 · 기여도 보상 분배
  core/
    scene.js           씬·카메라·라이트
    physics.js         Havok 초기화, 정적 월드
    input.js           키보드/마우스
    spells.js          술법 15종 정의 (계열 태그 cls, 이펙트 태그 fx)
    stats.js           레벨·경험치·스탯 투자·저장(localStorage, SAVE_VERSION + migrate)
    skills.js          무기별 숙련
    characters.js      캐릭터 설정 (현재 이림 1명)
    sfx.js / juice.js  소리 · 히트스톱/화면 흔들림
  player/
    player.js          이동·공격·castMagic(술법 시전 전부) · 버프 타이머
    weapons.js         무기 4종 정의 + KayKit 무기 메시 로더
    camera.js          쿼터뷰 카메라 리그
    companions.js      동료 AI
  world/
    ground.js monsters.js npcs.js drops.js loot.js projectiles.js
    vfx.js             이펙트 구현 전부 (풀링)
    vfx_textures.js    절차적 텍스처 8종 (다운로드 없음)
  net/
    net.js             Trystero 래퍼
    ghosts.js          원격 플레이어 렌더링
  ui/
    spellbar.js inventory.js chat.js minimap.js skills.js shop.js dialog.js loading.js
```

---

## 5. 지금까지 끝낸 것

- **핵심 루프** — 사냥 → 경험치/골드/아이템 → 스탯 투자 → 더 센 몬스터. 보스 포함
- **고정 스텝 루프** — 1/60 누산기, 최대 5스텝 따라잡기 (가변 스텝의 물리 오차 제거)
- **캐릭터** — KayKit Rogue 기반 이림 1명. 붉은 상의로 리컬러(휴 기반 절차적 텍스처)
- **무기 4종** — 권법(3연타 콤보) · 퇴마검(찌르기/가로베기 2콤보) · 석궁(화살) · 맨손
- **술법 15종** — 계열별 5개씩(술법/무예/궁술). 지금은 한 캐릭터가 전부 쓰고, 나중에 분리
- **이펙트** — 술법마다 전용 연출. 절차적 텍스처만 사용(외부 다운로드 0)
- **조준 표시** — 사거리 링(옅게) + 지점 술법 착탄 반경(커서 추종, 사거리 밖이면 경계로 당김)
- **스태미나** — Shift 달리기 제한, 레벨에 따라 최대치 증가
- **자동 수집 / 자동 사냥 모드**
- **멀티플레이** — 방 이름만 맞추면 접속. 최저 peerId가 호스트로 몬스터 AI를 돌리고
  10Hz로 스냅샷 전송. 각자의 레벨·스탯은 로컬에 그대로 유지된다
- **기여도 보상 분배** — 몬스터에 준 피해 비율로 경험치/골드/아이템 주인을 정한다
- **채팅** — Enter로 열고 보내기, 좌측 창, 12초 후 페이드
- **인벤토리** — 우측 카드 그리드(리니지식). 소지품 전체가 브라우저(localStorage)에 저장된다
- **캐릭터 파일 저장/불러오기** — 수련(K) 창 아래 버튼. 세이브를 JSON 파일로 내려받고
  다시 읽어들인다. 다른 컴퓨터·브라우저로 캐릭터를 옮길 때 쓴다

---

## 6. 술법 15종 (계열 분리 대비)

`src/core/spells.js`의 각 술법은 `cls`(계열)와 `fx`(이펙트) 태그를 가진다.
캐릭터를 나눌 때는 `spellsOf('mage')` 처럼 걸러 쓰면 된다. UI(`spellbar.js`)도
이미 계열별 3줄로 그리므로 해당 줄만 남기면 끝난다.

| 계열 | 술법 | kind | 사거리 |
|---|---|---|---|
| 술법(mage) | 청염탄 · 지염장 · 귀뢰 · 빙백진 · 유성우 | bolt / ground / chain / nova / rain | 최대 8 |
| 무예(knight) | 결계 · 선풍참 · 돌풍격 · 기합 · 지진격 | buff / nova / dash / buff / nova | 자기중심 |
| 궁술(ranger) | 관통시 · 연사 · 시우 · 절족시 · 풍신보 | pierce / spread / rain / pierce / dash | 최대 10 |

사거리는 **궁술 > 술법 > 근접** 순서를 유지한다. 이펙트 대응표는 STACK.md §9에 있다.

단축키는 F1~F12(앞 12개), 나머지는 마우스 클릭으로 고른다. 고른 뒤 **우클릭으로 시전**.

---

## 7. 배포

`main`에 push하면 GitHub Actions(`.github/workflows/`)가 `npm ci → npm run build → dist/` 를
Pages에 올린다. **저장소 원본을 그대로 서빙하지 않는다** — 예전에 그렇게 해서 깨졌던 적이 있다.

Pages 설정은 반드시 **Source: GitHub Actions**여야 한다.

---

## 8. 밟았던 지뢰 (다시 밟지 말 것)

| 증상 | 원인 | 해결 |
|---|---|---|
| 좌클릭 공격이 안 맞음 | `scene.pick`이 미니맵 카메라를 씀 | `camRig.cam`을 명시적으로 넘긴다 |
| 상단 UI가 안 죽음 / 방 참가 버튼 무반응 | index.html에 HUD 블록이 통째로 중복 | 중복 제거 (`getElementById`가 첫 번째에만 붙었다) |
| 화살이 안 보임 | 속도 42 → 프레임당 0.7유닛이라 잔상만 남음 | 속도 27 · 수명 1.4초 · 글로우 확대 |
| 멀티에서 경험치가 안 오름 | 비호스트는 피해를 중계만 해 `killed`가 항상 false | 기여도 기반 분배로 전환 |
| 지염장과 빙백진이 똑같아 보임 | 둘 다 같은 링 이펙트 | 머무는 불바다 vs 순간 서릿발로 분리 |
| 술법이 색만 다르고 그림이 같음 | `kind`가 같으면 연출도 같았음 | 술법마다 `fx` 태그 + 전용 연출 |
| Trystero 연결 실패 | `makeAction`은 객체 반환, `onMessage`/`onPeerJoin`은 **세터** | 호출이 아니라 대입. 수신 콜백 2번째 인자는 `{peerId}` 객체 |
| 저장 데이터 깨짐 | 스키마 버전이 없었음 | `SAVE_VERSION` + `migrate()` |
| 이펙트가 몇 개만 보임 | 동시 표시 상한 24 | 48로 상향 (술법 하나가 조각을 여러 개 쓴다) |
| 아이템이 새로고침하면 사라짐 | 세이브가 혼백 개수만 저장했음 | `items` 통째로 저장, `SAVE_VERSION` 3 + migrate |
| 불러오기가 먹히지 않음 | 새로고침 전까지 게임이 계속 자동 저장해 덮어씀 | `importSave` 성공 시 `saveLocked`로 저장 차단 |

**Bash 힌트**: 이 저장소에서 heredoc으로 큰 패치를 넣으면 따옴표 파싱에서 자주 깨진다.
파이썬 패치 스크립트를 스크래치패드에 써서 실행하는 편이 안전하다.

---

## 9. 다음에 할 일

1. **M4 성향(알라인먼트) 시스템** — 선/악 선택이 술법과 NPC 반응에 반영
2. **SCENARIO.md 2~5장** — 퀘스트와 대사
3. **캐릭터 분리** — 이림(무예)/쿠사(술법)/레닝(궁술)로 나누고 `spellsOf(cls)`로 술법 배분
4. **모바일 대응** — 현재는 데스크톱 전용(우클릭 시전 · Shift 달리기 · WASD)
5. **v2.0 진짜 온라인** — 권위 서버. 지금의 P2P 호스트 권위는 호스트가 나가면 끊긴다
