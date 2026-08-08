# 기술 스택 기준 문서

> 기준: ① 상업적 사용 가능 라이선스 ② 정적 호스팅(GitHub Pages)에서 동작
> ③ 번들 크기 대비 이득이 명확 ④ KayKit 아트 톤과 충돌하지 않음
>
> 라이선스는 도입 시점에 각 저장소에서 재확인할 것. 아래는 작성 시점(2026-08) 기준.
>
> **상태 표기**: ✅ 적용됨 · 🔶 부분 적용 · ⬜ 미적용 · ❌ 채택하지 않음

---

## 0. 엔진 — three.js가 아니라 Babylon.js

원본 조사는 three.js를 전제로 작성되었으나, **이 프로젝트는 이미 Babylon.js로 구현되어 있다.**
엔진을 바꾸려면 렌더링·애니메이션·물리·입력 전 계층을 다시 써야 하므로 **Babylon.js를 유지한다.**

조사 문서의 엔진 종속 항목은 아래 대응표로 치환해 따른다. **나머지 항목(에셋·오디오·폰트·
배포·최적화·데이터·체크리스트)은 엔진과 무관하므로 원문 그대로 적용한다.**

| 조사 문서 (three.js) | 이 프로젝트 (Babylon.js) | 상태 |
|---|---|---|
| `AnimationMixer` + `crossFadeTo` | `AnimationGroup` + `enableBlending` / `blendingSpeed` | ✅ |
| `SkeletonUtils.clone()` | `ImportMeshAsync`를 인스턴스마다 호출 (스켈레톤 개별 생성) | ✅ |
| `Raycaster` | `scene.pick(x, y, predicate, fast, camera)` | ✅ |
| `EffectComposer` | `PostProcess` / `DefaultRenderingPipeline` | ⬜ |
| `Points` / `InstancedMesh` 파티클 | `ParticleSystem` / `createInstance()` | ⬜ |
| `renderer.setPixelRatio(min(dpr, 2))` | `engine.setHardwareScalingLevel(1 / min(dpr, 2))` | ✅ |
| `LoadingManager` 진행률 | `AssetsManager` 또는 `SceneLoader` 콜백 집계 | ✅ |
| three-mesh-bvh | Babylon 내장 `OctreeSceneComponent` | ⬜ |
| Rapier / cannon-es | **Havok (이미 통합됨)** — [PHYSICS.md](PHYSICS.md) 참조 | ✅ |

> Havok은 WASM이다. 조사 문서 §4의 경고대로 **싱글스레드 빌드**를 쓴다 (GitHub Pages는
> COOP/COEP 헤더를 설정할 수 없어 SharedArrayBuffer 멀티스레드 빌드가 동작하지 않는다).
> 현재 `@babylonjs/havok` 기본 빌드가 싱글스레드이므로 조건을 만족한다.

---

## 1. 코어

| 용도 | 선택 | 라이선스 | 상태 |
|---|---|---|---|
| 렌더러 | **Babylon.js** (조사 원문은 three.js) | Apache-2.0 | ✅ |
| 번들러 | **Vite** | MIT | ✅ `base: './'`로 Pages 하위경로 대응 |
| 배포 | **GitHub Actions → Pages** | — | ✅ [.github/workflows/deploy.yml](.github/workflows/deploy.yml) |
| 디버그 UI | lil-gui / Babylon Inspector | MIT | ⬜ |

**❌ 쓰지 않음**: React/Vue — 게임 루프와 렌더 주기가 어긋난다. UI 오버레이는 순수 DOM으로 충분.
현재 HUD가 이 방침대로 되어 있다 ([index.html](index.html) + [src/ui/](src/ui/)).

---

## 2. 3D 에셋

| 용도 | 선택 | 라이선스 | 상태 |
|---|---|---|---|
| 캐릭터 | **KayKit Adventurers** | CC0 | ✅ Rogue(이림) · Knight(마검졸) |
| 적 | **KayKit Skeletons** | CC0 | ✅ Warrior(골귀) · Minion(뼈 졸개) |
| 무기/소품 | **KayKit Assets** | CC0 | ✅ sword_1handed · arrow / 🔶 quiver·shield·smokebomb 받아둠 |
| 던전/실내 | KayKit Dungeon Pack | CC0 | ⬜ 4~5장(명계 동굴·귀문)용 |
| 야외 | KayKit Forest Nature + Kenney Nature Kit | CC0 | ⬜ 1~2장(초원·안개 삼림)용 |
| 그레이박싱 | Kenney Prototype Kit | CC0 | ⬜ |

**조합 규칙**: KayKit 팩끼리는 아틀라스를 공유하므로 머티리얼 1개로 통합 가능.
Kenney를 섞을 땐 UV를 KayKit 아틀라스로 옮겨야 통합이 유지된다.

**❌ 쓰지 않음**: Mixamo, Sketchfab/Poly Pizza 모델, Poly Haven HDRI.
(초기에 검토했던 Sketchfab 삿갓 검객 + Mixamo 경로는 이 방침에 따라 폐기하고 KayKit으로 확정)

**라이선스 파일 보관**: `public/models/KAYKIT_LICENSE.txt`, `KAYKIT_SKELETONS_LICENSE.txt`

---

## 3. 애니메이션

| 용도 | 선택 | 상태 |
|---|---|---|
| 재생/블렌딩 | `AnimationGroup` + `blendingSpeed` | ✅ |
| 다중 인스턴스 | 몬스터마다 GLB를 개별 임포트 (스켈레톤 공유 회피) | ✅ |
| 논리 키 ↔ 클립 매핑 | [characters.js](src/core/characters.js) `KAYKIT_CLIPS` / 몬스터별 `clips` | ✅ |

**⚠️ 루트 모션 없음** — KayKit 애니메이션은 제자리에서 재생된다. 이동은 코드로 직접 처리한다.
현재 `PUNCH_COMBO`/`SWORD_COMBO`의 `lunge` 값이 그 역할을 한다.

**⚠️ 공격 판정은 이벤트가 아니라 시간 구간으로 검사** — 현재 `pendingHit` 타이머 방식으로
클립 길이에 비례해 판정 시점을 잡고 있다 ([player.js](src/player/player.js) `_applyHit`).

**⚠️ 상태 머신 없이 시작하면 반드시 꼬인다** (조사 문서가 꼽은 3대 함정 중 하나)
→ 현재는 `lockTimer` / `animLock` / `dodgeT`로 우선순위를 관리하는 임시 구조.
전투 상태가 더 늘어나면(방어·경직·시전) 명시적 상태 머신으로 승격할 것. **🔶 부채로 기록**

---

## 4. 충돌 / 물리

번들이 커지는 순서대로 위에서부터 검토한다.

| 규모 | 선택 | 상태 |
|---|---|---|
| 캐릭터가 걷고 벽에 막히는 정도 | 직접 구현 (원-원 충돌 + `scene.pick`) | ✅ `resolveCollision` |
| 복잡한 지오메트리에 레이캐스트 다수 | Octree | ⬜ 필요해지면 |
| 물체가 굴러가고 쌓여야 함 | **Havok** (이미 통합) | ✅ 드랍 아이템 |

설계 원칙과 수치는 [PHYSICS.md](PHYSICS.md)에 별도 정리되어 있다.

---

## 5. 입력

| 용도 | 선택 | 상태 |
|---|---|---|
| 키보드/마우스 | 직접 구현, **`KeyboardEvent.code` 기준** | ✅ |
| 모바일 가상 조이스틱 | nipplejs | ⬜ **결정 보류** |
| 게임패드 | Gamepad API | ⬜ |

**`key`가 아니라 `code`를 쓰는 이유**: 한글 입력 상태에서 `key`는 값이 달라진다.
현재 [input.js](src/core/input.js)가 전부 `code` 기준이다. ✅

**🔴 미결정 사항 — 모바일 지원 여부.** 조사 문서가 "나중에 고치는 비용이 가장 큰 세 가지" 중
1순위로 꼽은 항목이다. 나중에 붙이면 카메라·이동 코드를 다시 짜야 한다.
현재는 데스크톱 전용(우클릭 술법, Shift 달리기, WASD)으로 만들어져 있다.

---

## 6. 오디오

| 용도 | 선택 | 상태 |
|---|---|---|
| 재생 엔진 | howler.js | ⬜ 현재 WebAudio 직접 합성 |
| 3D 공간음 | Babylon `Sound` (spatial) | ⬜ |
| 효과음 에셋 | Kenney Audio 팩 (CC0) | ⬜ |
| 효과음 생성 | jsfxr / ChipTone / Bfxr | ⬜ |
| BGM | FreePD(PD) · Incompetech(CC-BY, 크레딧 필요) | ⬜ |

현재 [sfx.js](src/core/sfx.js)는 WebAudio 오실레이터로 직접 합성한다(파일 0KB).
음질을 올리려면 Kenney 팩 + howler로 교체.

**웹 함정 두 가지**
1. **자동재생 차단** — "클릭해서 시작" 화면에서 `AudioContext.resume()` 호출 필수. iOS Safari가 특히 엄격
2. **포맷** — `.ogg`만 두지 말고 `.m4a`/`.mp3` 폴백 병행

---

## 7. UI / 폰트 / 아이콘

**UI는 캔버스 안이 아니라 DOM 오버레이로 만든다.** ✅ 현재 방침대로 되어 있다.

| 용도 | 선택 | 라이선스 | 상태 |
|---|---|---|---|
| UI 그래픽 | Kenney UI Pack | CC0 | ⬜ 현재 순수 CSS |
| 한글 본문 | **Pretendard** | OFL | ✅ |
| 아이콘 | Lucide | ISC | ⬜ 현재 이모지 |
| 게임 아이콘 | game-icons.net | CC-BY (크레딧 필요) | ⬜ |

**⚠️ 한글 폰트가 숨은 용량 지뢰다.** 완성형 웹폰트는 보통 수 MB.
→ Pretendard **동적 서브셋(`unicode-range` 분할본)**을 CDN에서 로드해, 실제 쓰는 글자의
조각만 내려받도록 했다. 정적 서브셋은 동적 텍스트(NPC 대사 추가 등)에서 글자가 깨질 수 있다.

---

## 8. 레벨 제작

| 용도 | 선택 | 상태 |
|---|---|---|
| 모델 편집 | Blender | ⬜ |
| 구역(존) 정의 | [zones.js](src/world/zones.js) | ✅ |
| 지형 배치 | 존 시드 기반 결정적 생성 | ✅ |
| 런타임 조립 | `createInstance()` | ✅ 나무·바위 |
| 손배치 랜드마크 | Tiled → JSON | ⬜ |
| 길찾기 | 직접 구현 A* / three-pathfinding 대응물 | ⬜ 현재 직선 추격 |

**권장 방식**: 통짜 glb로 굽지 말고 좌표만 들고 런타임에 인스턴싱으로 조립.
벽 200개를 놓아도 다운로드는 메시 1개 + 좌표 배열.

### 구역(존) 구조

씬은 **하나만** 두고 내용물만 갈아끼운다. 씬을 통째로 바꾸면 물리·카메라·HUD·네트워크를
전부 다시 세워야 하는데 그럴 이득이 없다. 몬스터 GLB는 파일당 한 번만 파싱하는 캐시에
남아 있어 존을 오가도 다시 읽지 않는다.

- `buildWorld(scene, shadow, zone)` → `{ obstacles, ground, dispose }`
- `MonsterManager.load(zone)` / `dispose()`
- `addStaticWorld(...)` → `{ dispose }`
- `obstacles` 배열은 여러 곳이 참조로 들고 있으므로 **새 배열로 갈지 말고 내용만 바꾼다**

**지형은 반드시 결정적이어야 한다.** `Math.random()`으로 뿌리면 실행마다 지도가 달라져
랜드마크를 놓을 수 없고, 멀티에서 피어마다 나무 위치가 어긋나 한쪽만 막힌다.
존마다 고정 `seed`를 주고 mulberry32로 뽑는다.

**존을 오갈 때 새는 것 셋** (전부 겪고 고쳤다):
1. 비동기 모델 로딩이 dispose 뒤에 끝나면 고아 메시가 남는다 → `disposed` 플래그로 접는다
2. 어떤 메시에도 안 붙는 더미 재질은 `group.dispose`가 못 잡는다 → 종류마다 공유
3. 색이 고정인 재질(눈·체력바)을 개체마다 만들면 그대로 쌓인다 → `sharedFlatMat`

### 난이도 — 두 단으로 건다

| 축 | 무엇 | 어디에 |
|---|---|---|
| 거시 | 존의 `level` 구간 | `zones.js` |
| 미시 | 몬스터의 `ring`(중심 거리) | `MONSTER_TYPES` |

`MONSTER_TYPES`의 숫자는 손으로 맞춘 균형이라 **건드리지 않고 배율만 곱한다**
(`Monster._applyLevel`). hp ×(1+0.35k) · 공격 ×(1+0.18k) · 경험치 ×(1+0.30k) · 골드 ×(1+0.25k).
전리품 등급은 `tierOf(cfg)`가 hp 기준이라 **자동으로 따라 오른다**.

> 존을 추가할 때마다 `REFERENCE.md §6`의 파워 커브 체크리스트를 돌 것.
> 플레이어 성장률과 몬스터 성장률을 같이 보지 않으면 구간 하나가 벽이 되거나 무의미해진다.

**멀티**: 몬스터 스냅샷이 인덱스 기반이라 구역이 다르면 엉뚱한 개체가 움직인다.
방 이름에 구역을 붙여(`code@zoneKey`) 애초에 같은 구역끼리만 만나게 한다.

```json
{ "tile": "wall_corner", "pos": [4, 0, 8], "rot": 90 }
```

---

## 9. 이펙트 (마법 VFX)

### 결론 — **런타임 라이브러리는 안 쓴다.** 연출은 직접 구현하고, 텍스처만 CC0 스프라이트를 쓴다.

| 판단 축 | Effekseer | 직접 구현 |
|---|---|---|
| 번들 | WASM 런타임 추가 (수백 KB~) | **0KB** |
| 아트 톤 | 화려한 파티클 — KayKit 플랫 셰이딩과 이질적 | 팔레트 그대로 사용 |
| 모바일 | 파티클 오버드로우로 프레임 저하 | 메시 기반이라 저렴 |
| 엔진 통합 | 렌더 상태 충돌 위험 | 없음 |

**예외**: 이펙트가 게임의 핵심 셀링포인트가 될 때만 재검토.

### 텍스처 — **Kenney Particle Pack (CC0)이 기본** (2026-08-08 변경)

원래는 절차적 생성만 쓰기로 했으나, 두 세트를 나란히 붙여 비교한 뒤 Kenney 쪽으로 정했다.
절차적 텍스처는 128²~512²로 들쭉날쭉해 가까이서 계단이 보였고, 겹쳐 쓸 그림(연기·불꽃·
소용돌이·그을음)이 없어 연출을 두껍게 만들 수가 없었다.

- 파일: `public/textures/fx/` — 193장 중 **18장만** 골라 넣었다 (약 1.2MB). CC0라 재배포 자유
- 절차적 세트는 **그대로 둔다**. `vfx.js`의 `texSets`에 두 벌이 살아 있고 **`T` 키로 즉시 전환**된다
- 절차적 세트에 짝이 없는 키(연기·불꽃 등)는 `PROC_FALLBACK`으로 가장 가까운 것에 접힌다
- 새 스프라이트를 더 쓰려면 `KENNEY_FILES`에 키를 추가하고 `PROC_FALLBACK`에도 대응을 적는다

여전히 **금지**인 것은 그대로다 — ShaderToy 코드 복사(CC BY-NC-SA), Unity Asset Store(재배포 금지),
파티클 런타임 라이브러리.

### 유형별 구현 방식 (three.js → Babylon.js 대응)

| 유형 | 방식 | Babylon 대응 | 상태 |
|---|---|---|---|
| **A. 바닥 마법진** | 평면 + UV 회전, 링 2개 역방향 | `CreateDisc` + `rotation.y` | ✅ |
| **B. 오라/실드** | 구체 + 프레넬, `BackSide` | `CreateSphere` + `sideOrientation: BACKSIDE` | ✅ |
| **C. 발사체** | 코어 메시 + 트레일, **풀링 필수** | `CreateSphere` + 리본 | ✅ |
| **D. 폭발/타격** | 스프라이트 플립북 (또는 확대+페이드) | 빌보드 평면 | ✅ |
| **E. 검기/슬래시** | 부채꼴 `RingGeometry`, thetaLength 0→최대 | `CreateDisc(arc)` | ✅ |
| **F. 앰비언트** | `Points` 하나, 셰이더에서 위치 계산 | `ParticleSystem` | ⬜ |

**구현 순서**: A(마법진) → E(검기) → D(폭발) → C(발사체) → B(오라) → F(앰비언트)
**1~3번까지가 외부 라이브러리 없이 가능하고 체감 효과의 대부분을 차지한다.**

### 술법별 전용 이펙트 (21종)

같은 `kind`끼리 색만 바꿔 쓰면 무엇을 시전했는지 구분이 안 된다. 그래서 술법마다
`fx` 태그를 두고 `vfx.js`의 전용 연출로 갈라 쓴다. 원격 플레이어의 술법도 같은 표를 따른다
(`main.js`의 `net.onEvent` → `sp.fx` 분기).

| 계열 | 술법 | `fx` | 화면에 보이는 것 | 사거리 |
|---|---|---|---|---|
| 술법 | 청염탄 | `flame` | 발밑 마법진 + 도깨비불 발사체 | 무제한 |
| 술법 | 지염장 | `blaze` | 머무는 불바다, 불티가 계속 피어오름 | 7 |
| 술법 | 귀뢰 | `thunder` | 적을 잇는 빔 + 지그재그 낙뢰 | 8 |
| 술법 | 빙백진 | `frost` | 서릿발 파문 + 둘레에 얼음 가시 | 자기중심 |
| 술법 | 유성우 | `meteor` | 하늘에서 비스듬히 떨어지는 불덩이 | 8 |
| 무예 | 결계 | `ward` | 돔형 오라 + 회전 마법진 | 자기중심 |
| 무예 | 선풍참 | `whirl` | 회전 참격 3겹이 시차를 두고 펼쳐짐 | 자기중심 |
| 무예 | 돌풍격 | `gust` | 돌진 경로에 남는 바람 자국 3줄 | 전방 9 |
| 무예 | 기합 | `cry` | 발밑에서 솟아오르는 함성 고리 | 자기중심 |
| 무예 | 지진격 | `quake` | 파문 3겹 + 솟아오르는 돌덩이 | 자기중심 |
| 궁술 | 관통시 | `lance` | 화살길을 따라 남는 빛줄기 | 10 |
| 궁술 | 연사 | `fan` | 부채꼴 섬광 2겹 | 전방 |
| 궁술 | 시우 | `arrows` | 촘촘히 비스듬히 꽂히는 화살비 | 9 |
| 궁술 | 절족시 | `snare` | 발밑에 깔려 남는 거미줄 | 9 |
| 궁술 | 풍신보 | `wind` | 뒤로 빠지며 흩어지는 잔상 | 후방 8 |
| 술법 | 치유술 | `heal` | 발밑 마법진 + 떠오르는 빛 알갱이 | 자기 |
| 술법 | 석화술 | `stone` | 갈라진 돌판이 솟고 문양이 찍힌다 | 자기중심 5 |
| 무예 | 금강불괴 | `iron` | 몸을 감싸는 쇳빛 오라 + 문양 | 자기 |
| 무예 | 화벽술 | `firewall` | 몸을 따라다니는 불길, 주기적으로 타오름 | 자기중심 3 |
| 궁술 | 정령시 | `spirit` | 소용돌이로 모였다가 스스로 쫓아가는 화살 | 유도 |
| 궁술 | 봉인시 | `seal` | 맞은 자리에 부적 문양이 박힌다 | 10 |

**신규 6종은 `REFERENCE.md §3`의 미구현 축을 채운 것이다** — 회복(10 회복술) · 상태이상(8 석화술) ·
유틸 봉인(1 봉인술) · 유도 투사체(4 정령술) · 자기중심 지속장판(2 화벽술) · 물리 면역(9 금강불괴).
금강불괴는 원작이 "근접만 무적"이라 후반에 사장된 실패 사례(규칙 3)라, 물리 피해 감소 +
넉백 면역으로 바꿔 넣었다. 치유술은 규칙 6대로 술법 스탯을 타지 않는다.

사거리는 **궁술 > 술법 > 근접** 순으로 고정한다. 계열 성격이 숫자로 드러나야
나중에 캐릭터를 분리했을 때 역할이 겹치지 않는다.

### 조준 표시 (`vfx.aimRing`)

풀에서 링 2개를 빼두고 프레임마다 위치·크기만 갱신한다(수명 관리 대상 아님).

- `range` — 석궁을 들었거나 사거리가 있는 술법을 고르면 발밑에 아주 옅게(alpha 0.12).
  상시 떠 있는 표시라 진하면 배경을 가리고 눈이 피로해진다
- `area` — 지점 술법(`ground`/`rain`)을 고르면 커서 위치에 착탄 반경을 조금 더 진하게(alpha 0.4).
  커서가 사거리 밖이면 사거리 경계로 당겨서 실제 착탄 지점을 보여준다

### 공통 규칙 (코드에서 강제)

```js
// VFX 머티리얼 표준 — src/world/vfx.js 의 vfxMaterial()
mat.disableLighting = true;        // 씬 라이트에 반응하면 어두워진다
mat.emissiveColor = <색>;          // diffuse 아님
mat.backFaceCulling = false;
mat.alphaMode = ALPHA_ADD;         // 빛나는 것 (연기·먼지는 ALPHA_COMBINE)
mesh.isPickable = false;           // 클릭 판정을 가로채면 안 된다
```

- **깊이 쓰기 끄기** — 안 끄면 반투명끼리 서로 잘라먹는다
- **오브젝트 풀링** — 런타임 `new`는 GC 스파이크의 주원인. 미리 만들고 `setEnabled(false)`로 재사용
- **동시 개수 상한** — 초과 시 가장 오래된 것부터 제거 (모바일 오버드로우 방어)
- **고정 스텝에 묶기** — 이펙트 시간도 게임 로직 시계를 쓴다 (일시정지 시 함께 멈춤)

### 색은 KayKit 아틀라스에서 뽑는다
임의의 네온 색을 쓰면 즉시 겉돈다. 현재 팔레트: 청염 `#7fb0ff` · 술사 `#b06cff` ·
검기 `#cfe4ff` · 화염 `#ff8a3a` · 액센트 `#ffb03a`

### ❌ 금지
- **ShaderToy 코드 복사** — 기본 라이선스가 CC BY-NC-SA(비상업). MIT/CC0 명시본만 허용
- **Unity Asset Store 에셋** — 재배포 금지 조항 → public 저장소에 원본을 올릴 수 없다
- **블룸 / SSAO / DOF** — 플랫 셰이딩 스타일이 무너지고 모바일에서 비싸다
- **파티클 라이브러리(three.quarks 등)** — 현재 규모에서는 과함

### 재검토 트리거
동시 파티클 5,000개 초과 · 아티스트가 코드 없이 편집해야 함 · 이펙트 30종 초과

---

## 10. 최적화 파이프라인

| 용도 | 선택 | 상태 |
|---|---|---|
| glb 병합/dedup/quantize | gltf-transform 또는 gltfpack(meshoptimizer) | ⬜ |
| 이미지 압축 | sharp / squoosh CLI | ⬜ |

**❌ Draco 사용 금지** — 저폴리라 디코더 용량이 모델보다 클 수 있다. meshopt quantize를 쓸 것.

**현재 상태**: 모델 총 ~34MB(캐릭터 6종 + 스켈레톤 4종). 번들 7.2MB(gzip 1.6MB).
스켈레톤 팩은 4종을 받았으나 2종만 사용 중 → 미사용 파일 정리 + quantize가 1순위 최적화 대상.

---

## 11. 계측 / 디버깅

| 용도 | 선택 | 상태 |
|---|---|---|
| FPS | stats.js / `engine.getFps()` | 🔶 콘솔로만 확인 |
| 드로우콜/GPU | Spector.js | ⬜ |
| 파라미터 튜닝 | lil-gui / Tweakpane | ⬜ |
| 에러 수집 | `window.onerror` + Sentry 무료 티어 | ⬜ |
| 실기기 테스트 | `vite --host` | ⬜ |

**감으로 최적화하지 말 것.** 데스크톱 60fps가 중급 안드로이드 20fps인 경우가 흔하다.

---

## 12. 데이터 / 저장

| 용도 | 선택 | 상태 |
|---|---|---|
| 밸런스 데이터 | JSON으로 코드와 분리 | ⬜ 현재 JS 상수 |
| 세이브 | `localStorage` + **`version` 필드** | ✅ |
| 상태 머신 | 직접 구현 (타이틀/플레이/일시정지/게임오버) | ⬜ |

**서버가 없다는 전제**: 리더보드·멀티플레이·계정·치트 방지 전부 불가.
필요해지면 Supabase / Firebase 무료 티어를 별도 연동.
→ [GAME_DESIGN.md](GAME_DESIGN.md)의 v2.0 "온라인화"가 여기에 해당한다.

---

## 13. 배포 / 운영

| 용도 | 선택 | 상태 |
|---|---|---|
| 호스팅 | **GitHub Pages** (사이트 1GB, 대역폭 월 100GB 소프트) | ✅ |
| 게임 배포 병행 | itch.io — **Pages는 상업적/전자상거래 용도 금지** | ⬜ |
| 분석 | Cloudflare Web Analytics / GoatCounter | ⬜ |

**배포 URL**: https://all-my-projects-2026.github.io/GAMES_01/

**❌ Git LFS 사용 금지** — 무료 할당이 1GiB 스토리지 + 월 1GiB 대역폭뿐.
KayKit은 팩당 수십 MB라 애초에 불필요.

---

## 14. 출시 전 체크리스트

- [x] 페이지 타이틀
- [x] 파비콘 / OG 이미지 (링크 공유 시 회색 박스 방지)
- [x] 로딩 화면 — 진행률 표시
- [x] 조작법 안내 — 첫 화면에 키 배치
- [ ] 크레딧 화면 — CC0라 의무는 아니나 관례. CC-BY 에셋은 필수
- [x] 픽셀 비율 상한 (`min(devicePixelRatio, 2)`)
- [ ] 그림자는 라이트 1개에만, `shadow.camera` 범위 최소화
- [x] 고정 스텝 루프 — 로직 1/60 고정, 렌더만 가변
- [ ] 실기기(중급 안드로이드) 테스트

---

## 나중에 고치는 비용이 가장 큰 세 가지

조사 문서가 프로토타입 단계에서 잡으라고 지목한 항목들. 현재 상태:

| # | 항목 | 상태 |
|---|---|---|
| 1 | **입력 방식** (모바일 지원 여부) | 🔴 **미결정** — 데스크톱 전용으로 진행 중 |
| 2 | **고정 스텝 루프** | ✅ 적용 — 로직 1/60 고정, 렌더 가변 |
| 3 | **애니메이션 전환 구조** (상태 머신) | 🔶 임시 구조 — 전투 상태 증가 시 승격 필요 |

**1번이 유일하게 열려 있는 결정이다.** 모바일을 지원할 계획이면 카메라·이동 코드가
더 커지기 전에 지금 확정하는 편이 싸다.
