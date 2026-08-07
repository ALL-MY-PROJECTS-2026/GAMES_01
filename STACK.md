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
| 그리드 배치 | Tiled → JSON | ⬜ |
| 런타임 조립 | `InstancedMesh` + JSON 배치 데이터 | ⬜ |
| 길찾기 | 직접 구현 A* / three-pathfinding 대응물 | ⬜ 현재 직선 추격 |

**권장 방식**: 통짜 glb로 굽지 말고 타일 좌표를 JSON으로 저장해 런타임에 인스턴싱으로 조립.
벽 200개를 놓아도 다운로드는 메시 1개 + 좌표 배열.

```json
{ "tile": "wall_corner", "pos": [4, 0, 8], "rot": 90 }
```

---

## 9. 이펙트

| 용도 | 선택 | 상태 |
|---|---|---|
| 파티클 스프라이트 | Kenney Particle Pack (CC0) | ⬜ |
| 파티클 시스템 | Babylon `ParticleSystem` | ⬜ |
| 포스트프로세싱 | Babylon `DefaultRenderingPipeline` | ⬜ |

**⚠️ 저폴리 + 플랫 셰이딩에 블룸·SSAO를 얹으면 스타일이 무너진다.**
아웃라인이나 가벼운 비네트 정도로 제한할 것. 모바일에서 포스트프로세싱은 특히 비싸다.
→ M3의 "화려한 술법 이펙트"는 이 제약 안에서 설계한다 ([REFERENCE.md](REFERENCE.md) §3 규칙과 함께 적용).

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
