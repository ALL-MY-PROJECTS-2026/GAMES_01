import {
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  DynamicTexture,
  SceneLoader
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { WORLD_HALF, resolveCollision } from './ground.js';
import { loadKitMesh } from '../player/weapons.js';

const RED = Color3.FromHexString('#e24b4a');
const ATTACK_INTERVAL = 1.2;
const RESPAWN_TIME = 15;
// 이 거리 밖의 개체는 골격 애니메이션을 멈춘다. 개체 수를 늘린 만큼
// 화면에 보이지도 않는 개체의 본 계산이 그대로 비용이 된다.
const ANIM_CULL_DIST = 48;

// 같은 GLB를 개체마다 다시 내려받아 파싱하면 개체 수에 비례해 로딩이 늘어난다.
// 파일당 한 번만 읽어 컨테이너로 들고 있다가 개체는 거기서 복제해 쓴다.
const MODEL_CACHE = new Map();

function loadContainer(scene, file) {
  let pending = MODEL_CACHE.get(file);
  if (!pending) {
    pending = SceneLoader.LoadAssetContainerAsync('models/', file, scene);
    MODEL_CACHE.set(file, pending);
  }
  return pending;
}

// 난이도는 `ring`(초원 중심에서의 거리)으로 가른다. 중심에 가까울수록 약한 것만 나온다.
// 종류를 늘리는 값싼 방법은 REFERENCE.md §4에 정리해둔 대로 셋이다:
//   proc/procColor  — 절차적 몬스터의 색·크기만 바꾼 변종 (에셋 0)
//   model.tint      — 같은 GLB를 다른 색으로 (지상 ↔ 지하 티어링)
//   propVariants    — 같은 모델에 다른 무기를 들려 개체마다 다르게
export const MONSTER_TYPES = {
  // ── T0 · 중심부 (Lv.1~) ────────────────────────────────────
  slime: {
    name: '원귀', proc: 'ghost',
    hp: 30, damage: 5, speed: 3.6, wanderSpeed: 1, aggro: 10, attackRange: 1.9,
    xp: 12, gold: [3, 7], jelly: 1,
    barY: 1.9, ring: [18, 55]
  },
  // 혼불 — 원귀보다 작고 빠른 최약체. 초반 사냥감 밀도를 채운다
  wisp: {
    name: '혼불', proc: 'ghost', procColor: '#bfe8ff', procGlow: '#2a5a7a', procScale: 0.6,
    hp: 18, damage: 3, speed: 4.6, wanderSpeed: 1.4, aggro: 9, attackRange: 1.7,
    xp: 8, gold: [2, 5], jelly: 1,
    barY: 1.3, ring: [14, 42]
  },
  mushroom: {
    name: '도깨비', proc: 'oni',
    hp: 60, damage: 10, speed: 2.2, wanderSpeed: 0.7, aggro: 9, attackRange: 2.0,
    xp: 25, gold: [8, 14], jelly: 2,
    barY: 2.1, ring: [45, 85]
  },
  fox: {
    name: '요호',
    hp: 45, damage: 8, speed: 5.4, wanderSpeed: 1.8, aggro: 13, attackRange: 1.8,
    xp: 20, gold: [6, 12], jelly: 1,
    barY: 1.7, ring: [30, 70],
    model: { file: 'Fox.glb', height: 1.1, clips: { idle: 'Survey', walk: 'Walk', run: 'Run' } }
  },
  // 골귀(骨鬼) — 뼈만 남은 무사. 느리지만 단단하고 한 방이 무겁다
  bone: {
    name: '골귀',
    hp: 90, damage: 14, speed: 2.6, wanderSpeed: 0.8, aggro: 11, attackRange: 2.3,
    xp: 38, gold: [12, 20], jelly: 2,
    barY: 2.3, ring: [50, 90],
    model: {
      file: 'Skeleton_Warrior.glb', height: 1.95,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '1H_Melee_Attack_Chop', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      kitProps: [
        { file: 'sword_1handed.gltf', height: 0.95 },
        { file: 'axe_1handed.gltf', height: 0.85 },
        { file: 'sword_2handed.gltf', height: 1.25 }
      ],
      // 해골은 내장 프롭이 없어 방패도 kit으로만 들릴 수 있다
      kitOffhand: [
        { file: 'shield_spikes.gltf', height: 0.7 },
        { file: 'shield_square.gltf', height: 0.75 },
        { file: 'shield_badge.gltf', height: 0.75 },
        { file: 'shield_round_barbarian.gltf', height: 0.72 },
        null, null
      ]
    }
  },
  // 마검졸 — 마물이 아닌 인간 산적 (REFERENCE.md T1). 방패를 들고 끈질기게 파고든다
  bandit: {
    name: '마검졸',
    hp: 70, damage: 11, speed: 3.8, wanderSpeed: 1.1, aggro: 12, attackRange: 2.1,
    xp: 30, gold: [15, 26], jelly: 1,
    barY: 2.2, ring: [35, 75],
    model: {
      file: 'Knight.glb', height: 1.85,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '1H_Melee_Attack_Slice_Diagonal', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      props: ['1H_Sword', 'Round_Shield'],
      // 개체마다 다른 무기를 들려 같은 모델로 변형을 만든다 (REFERENCE.md의 리스킨 기법)
      propVariants: [
        ['1H_Sword', 'Round_Shield'],
        ['2H_Sword'],
        ['1H_Sword', 'Spike_Shield'],
        ['1H_Sword', 'Badge_Shield'],
        ['1H_Sword', 'Rectangle_Shield'],
        ['1H_Sword', '1H_Sword_Offhand']
      ]
    }
  },
  // 악귀 술사 — 거리를 두고 술법을 쏜다. 근접하면 물러난다
  // (REFERENCE.md: 원거리·술법형 적이 없으면 전투가 단조로워진다)
  caster: {
    name: '악귀 술사',
    hp: 55, damage: 13, speed: 3.0, wanderSpeed: 0.9, aggro: 18, attackRange: 15,
    xp: 34, gold: [14, 24], jelly: 2,
    barY: 2.2, ring: [40, 80],
    ranged: { projectileColor: '#b06cff', speed: 22, interval: 2.2, keepDistance: 7 },
    model: {
      file: 'Mage.glb', height: 1.85,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: 'Spellcast_Shoot', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      propVariants: [
        ['2H_Staff', 'Spellbook'],
        ['1H_Wand', 'Spellbook_open'],
        ['2H_Staff', 'Spellbook_open']
      ]
    }
  },
  // 골귀 자객 — 빠르고 두 자루 단검을 쓴다. 물러서지 않고 파고든다
  boneRogue: {
    name: '골귀 자객',
    hp: 52, damage: 10, speed: 5.6, wanderSpeed: 1.6, aggro: 14, attackRange: 1.9,
    xp: 28, gold: [10, 18], jelly: 1,
    barY: 2.0, ring: [30, 75],
    model: {
      file: 'Skeleton_Rogue.glb', height: 1.75,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: 'Dualwield_Melee_Attack_Slice', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      kitProps: [{ file: 'dagger.gltf', height: 0.6 }]
    }
  },
  // 골귀 술사 — 언데드 주술사. 멀리서 저주탄을 쏜다
  boneMage: {
    name: '골귀 술사',
    hp: 48, damage: 15, speed: 2.6, wanderSpeed: 0.8, aggro: 19, attackRange: 16,
    xp: 36, gold: [16, 28], jelly: 2,
    barY: 2.2, ring: [45, 88],
    ranged: { projectileColor: '#7ce8b0', speed: 20, interval: 2.6, keepDistance: 8 },
    model: {
      file: 'Skeleton_Mage.glb', height: 1.85,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: 'Spellcast_Shoot', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      kitProps: [{ file: 'staff.gltf', height: 1.5 }, { file: 'wand.gltf', height: 0.75 }],
      kitOffhand: [{ file: 'spellbook_closed.gltf', height: 0.3 }, null]
    }
  },
  // 한귀 — 원귀 계열의 냉기 변종. 빠르지만 여전히 물렁하다
  frostWisp: {
    name: '한귀', proc: 'ghost', procColor: '#a8f0ff', procGlow: '#1a4a6a', procScale: 0.85,
    hp: 40, damage: 9, speed: 5.0, wanderSpeed: 1.5, aggro: 12, attackRange: 1.8,
    xp: 22, gold: [7, 13], jelly: 1,
    barY: 1.7, ring: [30, 72]
  },
  // 청귀 — 도깨비의 상위 변종. 조금 크고 단단하다
  blueOni: {
    name: '청귀', proc: 'oni', procColor: '#3f6ea8', procScale: 1.12,
    hp: 75, damage: 12, speed: 2.9, wanderSpeed: 0.8, aggro: 10, attackRange: 2.1,
    xp: 30, gold: [10, 17], jelly: 2,
    barY: 2.3, ring: [45, 85]
  },
  // 마궁졸 — 마검졸의 원거리 짝. 인간 산적이 활을 든 형태
  banditArcher: {
    name: '마궁졸',
    hp: 58, damage: 9, speed: 3.6, wanderSpeed: 1.1, aggro: 17, attackRange: 14,
    xp: 30, gold: [14, 24], jelly: 1,
    barY: 2.15, ring: [38, 80],
    ranged: { projectileColor: '#ffd666', speed: 26, interval: 1.9, keepDistance: 8 },
    model: {
      file: 'Rogue.glb', height: 1.8,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '1H_Ranged_Shoot', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      propVariants: [['1H_Crossbow'], ['2H_Crossbow']]
    }
  },
  // 저주귀 — 다가오지 않고 저주탄만 흘린다. 절차적 몬스터라 값이 싸다
  hexGhost: {
    name: '저주귀', proc: 'ghost', procColor: '#c8a8ff', procGlow: '#4a2a6a',
    hp: 50, damage: 14, speed: 2.6, wanderSpeed: 0.8, aggro: 18, attackRange: 15,
    xp: 38, gold: [15, 26], jelly: 2,
    barY: 2.0, ring: [50, 88],
    ranged: { projectileColor: '#b06cff', speed: 19, interval: 2.5, keepDistance: 7 }
  },
  // 골귀 사수 — 해골은 내장 무기가 없어 여태 활을 못 들렸다. kit 석궁으로 열린 종류
  boneArcher: {
    name: '골귀 사수',
    hp: 54, damage: 13, speed: 3.2, wanderSpeed: 1.0, aggro: 18, attackRange: 15,
    xp: 36, gold: [15, 26], jelly: 2,
    barY: 2.15, ring: [48, 88],
    ranged: { projectileColor: '#e8d8a8', speed: 25, interval: 2.1, keepDistance: 8 },
    model: {
      file: 'Skeleton_Rogue.glb', height: 1.8, tint: '#cdbb96',
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '1H_Ranged_Shoot', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      kitProps: [
        { file: 'crossbow_1handed.gltf', height: 0.7 },
        { file: 'crossbow_2handed.gltf', height: 1.05 }
      ],
      kitOffhand: [{ file: 'quiver.gltf', height: 0.5 }, null]
    }
  },
  // 흑의 자객 — 마검졸 무리의 정예. 빠르고 단검을 쓴다
  hoodedRogue: {
    name: '흑의 자객',
    hp: 66, damage: 13, speed: 5.8, wanderSpeed: 1.5, aggro: 15, attackRange: 1.9,
    xp: 36, gold: [16, 28], jelly: 2,
    barY: 2.1, ring: [45, 88],
    model: {
      file: 'Rogue_Hooded.glb', height: 1.8,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '1H_Melee_Attack_Slice_Diagonal', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      kitProps: [{ file: 'dagger.gltf', height: 0.6 }]
    }
  },
  // 백요호 — 요호의 상위 개체. 같은 모델을 희게 물들이고 키웠다
  whiteFox: {
    name: '백요호',
    hp: 85, damage: 14, speed: 6.2, wanderSpeed: 1.9, aggro: 15, attackRange: 1.9,
    xp: 42, gold: [18, 30], jelly: 2,
    barY: 2.0, ring: [52, 90],
    model: {
      file: 'Fox.glb', height: 1.45, tint: '#dce8ff',
      clips: { idle: 'Survey', walk: 'Walk', run: 'Run' }
    }
  },
  // 화귀 술사 — 악귀 술사의 화염 계열. 사거리가 더 길고 한 방이 무겁다
  firewitch: {
    name: '화귀 술사',
    hp: 62, damage: 17, speed: 2.8, wanderSpeed: 0.9, aggro: 20, attackRange: 17,
    xp: 44, gold: [20, 34], jelly: 3,
    barY: 2.25, ring: [58, 92],
    ranged: { projectileColor: '#ff7a3a', speed: 21, interval: 2.4, keepDistance: 8 },
    model: {
      file: 'Mage.glb', height: 1.9, tint: '#ff9a6a',
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: 'Spellcast_Shoot', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      propVariants: [['2H_Staff'], ['1H_Wand', 'Spellbook_open']]
    }
  },

  // ── T3 · 외곽 (Lv.10~) ─────────────────────────────────────
  // 적귀 — 도깨비 계열 최상위. 크고 한 방이 무겁다
  redOni: {
    name: '적귀', proc: 'oni', procColor: '#c8452e', procScale: 1.3,
    hp: 130, damage: 18, speed: 2.4, wanderSpeed: 0.7, aggro: 11, attackRange: 2.4,
    xp: 55, gold: [24, 40], jelly: 3,
    barY: 2.7, ring: [62, 92]
  },
  // 흑골 졸개 — 뼈 졸개의 지하계 변종. 색만 바꿔 티어를 올린 예시
  darkMinion: {
    name: '흑골 졸개',
    hp: 72, damage: 12, speed: 4.8, wanderSpeed: 1.5, aggro: 13, attackRange: 1.9,
    xp: 34, gold: [12, 22], jelly: 2,
    barY: 1.95, ring: [60, 90],
    model: {
      file: 'Skeleton_Minion.glb', height: 1.62, tint: '#6a5a8a',
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: 'Unarmed_Melee_Attack_Punch_A', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      kitProps: [
        { file: 'dagger.gltf', height: 0.6 },
        { file: 'axe_1handed.gltf', height: 0.8 }
      ],
      kitOffhand: [
        { file: 'shield_round_color.gltf', height: 0.65 },
        { file: 'shield_spikes_color.gltf', height: 0.65 },
        null
      ]
    }
  },
  // 철갑전사 — 물리 방어 최고. 넉백이 통하지 않아 정면 대결이 성립하지 않는다
  ironKnight: {
    name: '철갑전사',
    hp: 220, damage: 20, speed: 2.4, wanderSpeed: 0.7, aggro: 12, attackRange: 2.5,
    xp: 90, gold: [40, 66], jelly: 4,
    barY: 2.5, ring: [66, 92],
    superArmor: true,
    model: {
      file: 'Knight.glb', height: 2.05, tint: '#8fa4bb',
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '1H_Melee_Attack_Chop', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      propVariants: [
        ['2H_Sword'],
        ['1H_Sword', 'Spike_Shield'],
        ['1H_Sword', 'Rectangle_Shield'],
        ['1H_Sword', 'Badge_Shield']
      ]
    }
  },
  // 골귀 대장 — 골귀 무리의 네임드. 같은 모델을 키우고 금빛으로 물들였다
  boneCaptain: {
    name: '골귀 대장',
    hp: 280, damage: 24, speed: 2.5, wanderSpeed: 0.7, aggro: 13, attackRange: 2.6,
    xp: 120, gold: [55, 88], jelly: 5,
    barY: 2.8, ring: [70, 92],
    model: {
      file: 'Skeleton_Warrior.glb', height: 2.35, tint: '#d8c08a',
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '1H_Melee_Attack_Chop', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      kitProps: [
        { file: 'sword_2handed_color.gltf', height: 1.45 },
        { file: 'axe_2handed.gltf', height: 1.5 }
      ],
      kitOffhand: [{ file: 'shield_square_color.gltf', height: 0.95 }, null]
    }
  },
  // 도형마 — 고공격력. 보스 모델을 줄여 잡몹으로 쓴다 (원작의 보스→잡몹 강등 수법)
  ogre: {
    name: '도형마',
    hp: 320, damage: 26, speed: 2.8, wanderSpeed: 0.6, aggro: 14, attackRange: 2.8,
    xp: 140, gold: [65, 100], jelly: 5,
    barY: 2.9, ring: [70, 92],
    model: {
      file: 'Barbarian.glb', height: 2.45, tint: '#9a7a5a',
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '2H_Melee_Attack_Chop', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      propVariants: [
        ['2H_Axe'],
        ['1H_Axe', 'Barbarian_Round_Shield'],
        ['1H_Axe', '1H_Axe_Offhand'],
        ['1H_Axe', 'Mug']
      ]
    }
  },

  // ── 필드 보스 ──────────────────────────────────────────────
  // 왕도깨비 — 1장 필드 보스. 느리고 단단하며 패턴 2개를 번갈아 쓴다
  boss: {
    name: '왕도깨비',
    hp: 900, damage: 22, speed: 2.4, wanderSpeed: 0.6, aggro: 16, attackRange: 3.1,
    xp: 400, gold: [180, 260], jelly: 12,
    barY: 3.4, ring: [55, 70],
    isBoss: true,
    superArmor: true,       // 넉백·에어본 면역 (REFERENCE.md: 무게 등급)
    respawn: 60,
    model: {
      file: 'Barbarian.glb', height: 3.0,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '2H_Melee_Attack_Chop', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B',
        spin: '2H_Melee_Attack_Spin', taunt: 'Taunt'
      },
      props: ['2H_Axe']
    },
    // 번갈아 쓰는 공격 패턴
    patterns: [
      { clip: 'attack', range: 3.1, damageMul: 1, windup: 0.45, knock: 16, knockUp: 0, radius: 0 },
      { clip: 'spin', range: 4.2, damageMul: 1.5, windup: 0.55, knock: 22, knockUp: 5, radius: 4.2 }
    ]
  },
  // 골왕 — 초원 바깥 경계의 두 번째 필드 보스. 왕도깨비보다 멀리, 더 단단하게
  boneKing: {
    name: '골왕',
    hp: 1200, damage: 26, speed: 2.2, wanderSpeed: 0.5, aggro: 16, attackRange: 3.2,
    xp: 620, gold: [260, 380], jelly: 18,
    barY: 3.6, ring: [80, 92],
    isBoss: true,
    superArmor: true,
    respawn: 90,
    model: {
      file: 'Skeleton_Warrior.glb', height: 3.1, tint: '#cfe0ff',
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: '1H_Melee_Attack_Chop', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B',
        sweep: '1H_Melee_Attack_Slice_Diagonal'
      },
      kitProps: [{ file: 'sword_2handed_color.gltf', height: 1.9 }],
      kitOffhand: [{ file: 'shield_badge_color.gltf', height: 1.1 }]
    },
    patterns: [
      { clip: 'attack', range: 3.2, damageMul: 1, windup: 0.5, knock: 15, knockUp: 0, radius: 0 },
      { clip: 'sweep', range: 4.6, damageMul: 1.4, windup: 0.6, knock: 20, knockUp: 6, radius: 4.6 }
    ]
  },
  // 뼈 졸개 — 약하지만 무리로 몰려온다
  minion: {
    name: '뼈 졸개',
    hp: 34, damage: 6, speed: 4.2, wanderSpeed: 1.4, aggro: 12, attackRange: 1.9,
    xp: 15, gold: [4, 9], jelly: 1,
    barY: 1.8, ring: [25, 65],
    model: {
      file: 'Skeleton_Minion.glb', height: 1.5,
      clips: {
        idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
        attack: 'Unarmed_Melee_Attack_Punch_A', hit: 'Hit_A', hitB: 'Hit_B', death: 'Death_A', deathB: 'Death_B'
      },
      kitProps: [
        { file: 'dagger.gltf', height: 0.55 },
        { file: 'sword_1handed.gltf', height: 0.9 }
      ]
    }
  }
};

// 색이 고정인 공용 재질은 씬당 하나만 만든다 — 개체마다 만들면 존을 오갈 때마다 쌓인다
const SHARED_MATS = new WeakMap();
function sharedFlatMat(scene, name, hex, emissive = false) {
  let byName = SHARED_MATS.get(scene);
  if (!byName) { byName = {}; SHARED_MATS.set(scene, byName); }
  if (!byName[name]) byName[name] = flatMat(scene, name, hex, emissive);
  return byName[name];
}

function flatMat(scene, name, hex, emissive = false) {
  const mat = new StandardMaterial(name, scene);
  if (emissive) {
    mat.emissiveColor = Color3.FromHexString(hex);
    mat.disableLighting = true;
  } else {
    mat.diffuseColor = Color3.FromHexString(hex);
  }
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}

class Monster {
  constructor(scene, shadow, typeKey, zone = null) {
    this.scene = scene;
    this.typeKey = typeKey;
    this.zone = zone;
    this.cfg = MONSTER_TYPES[typeKey];
    this.group = new TransformNode('mon-' + typeKey, scene);
    this.body = new TransformNode('monBody', scene);
    this.body.parent = this.group;
    // body는 피격 스쿼시로 계속 늘었다 줄었다 하므로, 종류별 크기는 한 겹 안쪽에 준다
    const shell = new TransformNode('monShell', scene);
    shell.parent = this.body;
    shell.scaling.setAll(this.cfg.procScale || 1);

    const eyeMat = sharedFlatMat(scene, 'eye', '#222222', true);

    if (this.cfg.model) {
      // GLB 스킨드 메시 몬스터 — 히트 플래시 대신 스쿼시만 사용.
      // 이 재질은 어떤 메시에도 붙지 않는 더미라 종류마다 하나만 두면 된다
      // (개체마다 만들면 메시에 안 붙어 있어 group.dispose가 못 잡고 그대로 샌다)
      this.flashMat = sharedFlatMat(scene, 'dummyFlash' + typeKey, '#ffffff');
      this.baseColor = this.flashMat.diffuseColor.clone();
      this.anims = null;
      this.animName = '';
      this._loadModel(shadow);
    } else if (this.cfg.proc === 'ghost') {
      // 원귀 계열 — 색과 크기만 바꿔 변종을 만든다 (에셋 추가 없음)
      const skin = this.cfg.procColor || '#dfe9ff';
      this.flashMat = new StandardMaterial('ghostMat', scene);
      this.flashMat.diffuseColor = Color3.FromHexString(skin);
      this.flashMat.emissiveColor = Color3.FromHexString(this.cfg.procGlow || '#2a3a6a');
      this.flashMat.alpha = 0.72;
      this.flashMat.specularColor = new Color3(0, 0, 0);
      this.baseColor = Color3.FromHexString(skin);

      const head = MeshBuilder.CreateSphere('ghostHead', { diameter: 1.1, segments: 12 }, scene);
      head.material = this.flashMat;
      head.position.y = 1.0;
      head.parent = shell;

      const tail = MeshBuilder.CreateCylinder(
        'ghostTail', { diameterTop: 1.05, diameterBottom: 0.1, height: 0.9, tessellation: 10 }, scene
      );
      tail.material = this.flashMat;
      tail.position.y = 0.45;
      tail.parent = shell;

      for (const sx of [-0.2, 0.2]) {
        const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.16, segments: 6 }, scene);
        eye.material = eyeMat;
        eye.position.set(sx, 1.08, 0.46);
        eye.parent = shell;
      }
    } else {
      // 도깨비 계열 — 마찬가지로 색·크기 변종
      const skin = this.cfg.procColor || '#a04a38';
      this.flashMat = new StandardMaterial('dokkaebiMat', scene);
      this.flashMat.diffuseColor = Color3.FromHexString(skin);
      this.flashMat.specularColor = new Color3(0, 0, 0);
      this.baseColor = Color3.FromHexString(skin);

      const torso = MeshBuilder.CreateCylinder(
        'dkBody', { diameterTop: 0.9, diameterBottom: 1.15, height: 1.3, tessellation: 10 }, scene
      );
      torso.material = this.flashMat;
      torso.position.y = 0.65;
      torso.parent = shell;
      if (shadow) shadow.addShadowCaster(torso);

      const head = MeshBuilder.CreateSphere('dkHead', { diameter: 0.85, segments: 12 }, scene);
      head.material = this.flashMat;
      head.position.y = 1.55;
      head.parent = shell;
      if (shadow) shadow.addShadowCaster(head);

      const horn = MeshBuilder.CreateCylinder(
        'dkHorn', { diameterTop: 0, diameterBottom: 0.22, height: 0.45, tessellation: 8 }, scene
      );
      horn.material = sharedFlatMat(scene, 'hornMat', '#e8d8a8');
      horn.position.set(0, 2.05, 0);
      horn.parent = shell;

      const club = MeshBuilder.CreateCylinder(
        'dkClub', { diameterTop: 0.3, diameterBottom: 0.14, height: 1.0, tessellation: 8 }, scene
      );
      club.material = sharedFlatMat(scene, 'clubMat', '#5a4028');
      club.position.set(0.62, 0.9, 0.15);
      club.rotation.z = -0.5;
      club.parent = shell;

      for (const sx of [-0.18, 0.18]) {
        const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.15, segments: 6 }, scene);
        eye.material = sharedFlatMat(scene, 'dkEye', '#ffd23e', true);
        eye.position.set(sx, 1.6, 0.38);
        eye.parent = shell;
      }
    }

    this.hpBg = MeshBuilder.CreatePlane('hpBg', { width: 1.3, height: 0.14 }, scene);
    this.hpBg.material = sharedFlatMat(scene, 'hpBg', '#2c2c2a', true);
    this.hpBg.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.hpBg.position.y = this.cfg.barY;
    this.hpBg.parent = this.group;

    this.hpBar = MeshBuilder.CreatePlane('hpBar', { width: 1.24, height: 0.1 }, scene);
    this.hpBar.material = sharedFlatMat(scene, 'hpFill', '#e24b4a', true);
    this.hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.hpBar.position.y = this.cfg.barY;
    this.hpBar.parent = this.group;

    // 레벨 표시 — 안 보이면 왜 갑자기 죽는지 알 수 없다
    this.levelTex = new DynamicTexture('lvTex', { width: 128, height: 32 }, scene, false);
    this.levelTex.hasAlpha = true;
    const lvMat = new StandardMaterial('lvMat', scene);
    lvMat.emissiveTexture = this.levelTex;
    lvMat.opacityTexture = this.levelTex;
    lvMat.disableLighting = true;
    lvMat.specularColor = new Color3(0, 0, 0);
    this.levelPlate = MeshBuilder.CreatePlane('lvPlate', { width: 0.9, height: 0.23 }, scene);
    this.levelPlate.material = lvMat;
    this.levelPlate.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.levelPlate.position.y = this.cfg.barY + 0.22;
    this.levelPlate.isPickable = false;
    this.levelPlate.parent = this.group;

    // 스탯은 개체가 들고 있는다 — 같은 종이라도 존과 위치에 따라 세기가 달라진다
    this.level = 1;
    this.maxHp = this.cfg.hp;
    this.damage = this.cfg.damage;
    this.xpValue = this.cfg.xp;
    this.goldRange = this.cfg.gold;
    this.jellyCount = this.cfg.jelly;
    this.hp = this.maxHp;
    this.dead = false;
    this.respawnT = 0;
    this.attackT = 0;
    this.attackAnim = 0;
    this.flashT = 0;
    this.velY = 0;
    this.deathT = 0;
    this.slowT = 0;
    this.slowMul = 1;
    this.stunT = 0;    // 석화·봉인으로 굳은 시간 — 그동안 아무것도 못 한다
    this.wanderT = 0;
    this.wanderDir = new Vector3(0, 0, 0);
    this.knock = new Vector3(0, 0, 0);
    this.bounce = Math.random() * 10;
    this._tmp = new Vector3(0, 0, 0);

    for (const cm of this.group.getChildMeshes()) cm.metadata = { monster: this };

    this.placeRandom();
  }

  async _loadModel(shadow) {
    const m = this.cfg.model;
    const container = await loadContainer(this.scene, m.file);
    if (this.disposed) return;
    // 색을 갈아입힐 때만 재질을 복제한다 — 나머지는 파일 하나의 재질을 공유한다
    const inst = container.instantiateModelsToScene((name) => name, !!m.tint);
    const rootMesh = inst.rootNodes[0];
    // 이 아래로는 언제든 걷어내야 할 수 있으므로 정리 함수를 미리 잡아둔다
    const bail = () => {
      for (const g of inst.animationGroups) g.dispose();
      rootMesh.dispose(false, true);
    };
    if (this.disposed) return bail();

    const holder = new TransformNode('monModel', this.scene);
    holder.parent = this.body;
    rootMesh.parent = holder;

    const { min, max } = rootMesh.getHierarchyBoundingVectors(true);
    const h = max.y - min.y;
    const scale = m.height / h;
    holder.scaling.setAll(scale);
    holder.position.y = -min.y * scale;
    holder.rotation.y = m.yaw || 0;

    // 모델 내장 무기 프롭은 기본적으로 끄고, 지정된 것만 켠다
    const variants = m.propVariants;
    const wanted = variants
      ? variants[Math.floor(Math.random() * variants.length)]
      : (m.props || []);
    const tint = m.tint ? Color3.FromHexString(m.tint) : null;
    const tinted = new Set();
    for (const mesh of rootMesh.getChildMeshes(false)) {
      if (shadow && mesh.getTotalVertices && mesh.getTotalVertices() > 0) shadow.addShadowCaster(mesh);
      mesh.metadata = { monster: this };
      const parent = mesh.parent && mesh.parent.name;
      if (parent && /^handslot/i.test(parent)) mesh.setEnabled(wanted.includes(mesh.name));
      // 같은 모델의 다른 티어 — 재질 색을 곱해 물들인다 (REFERENCE.md §4 팔레트 스왑)
      const mat = tint && mesh.material;
      if (mat && !tinted.has(mat)) {
        tinted.add(mat);
        if (mat.albedoColor) mat.albedoColor = mat.albedoColor.multiply(tint);
        else if (mat.diffuseColor) mat.diffuseColor = mat.diffuseColor.multiply(tint);
      }
    }

    this.anims = {};
    this.animDur = {};
    for (const g of inst.animationGroups) {
      g.stop();
      this.anims[g.name] = g;
      const a = g.targetedAnimations[0] ? g.targetedAnimations[0].animation : null;
      this.animDur[g.name] = (g.to - g.from) / (a ? a.framePerSecond : 60);
      for (const ta of g.targetedAnimations) {
        ta.animation.enableBlending = true;
        ta.animation.blendingSpeed = 0.12;
      }
    }
    // 내장 무기가 없는 모델(해골 등)은 kit 무기를 본에 직접 붙인다.
    // kitProps는 주손, kitOffhand는 왼손 — 각각 따로 뽑아 방패까지 들릴 수 있게 한다
    const skel = inst.skeletons[0];
    if (skel) {
      for (const [list, defBone] of [[m.kitProps, 'handslot.r'], [m.kitOffhand, 'handslot.l']]) {
        if (!list || !list.length) continue;
        const pick = list[Math.floor(Math.random() * list.length)];
        if (!pick) continue;
        const bone = skel.bones.find((b) => b.name === (pick.bone || defBone));
        if (!bone) continue;
        const mesh = await loadKitMesh(this.scene, pick.file, { height: pick.height || 0.9 });
        if (!mesh) continue;
        if (this.disposed) { mesh.dispose(false, true); return bail(); }
        mesh.parent = bone.getTransformNode();
        mesh.position.set(0, 0, 0);
        if (shadow) for (const cm of mesh.getChildMeshes()) shadow.addShadowCaster(cm);
      }
    }

    if (this.disposed) return bail();
    this.playAnim('idle');
  }

  // key는 논리 이름(idle/walk/run/attack/hit/death) — 몬스터별 클립 맵으로 변환된다
  playAnim(key, speed = 1, loop = true) {
    if (!this.anims) return;
    const name = this.cfg.model.clips[key];
    const next = name && this.anims[name];
    if (!next || this.animName === name) return;
    if (this.animName && this.anims[this.animName]) this.anims[this.animName].stop();
    next.start(loop, speed);
    // 멀어서 멈춰둔 상태라면 새로 튼 클립도 바로 멈춘다
    if (this._animPaused) next.pause();
    this.animName = name;
    return this.animDur[name] / speed;
  }

  // 공격·피격·사망처럼 한 번만 재생하고 끝나는 동작
  // 피격·사망은 A/B 두 벌이 있으면 번갈아 쓴다 — 한 종류만 쓰면 무리 전투에서 티가 난다
  playOneShot(key, speed = 1) {
    if (!this.anims) return 0;
    const clips = this.cfg.model.clips;
    let use = key;
    const alt = key + 'B';
    if (clips[alt] && Math.random() < 0.5) use = alt;
    if (!clips[use]) return 0;
    const dur = this.playAnim(use, speed, false) || 0;
    this.animLock = Math.max(this.animLock || 0, dur);
    return dur;
  }

  /** 이름표에 레벨을 그린다 — 보스는 눈에 띄게 */
  _drawLevel() {
    const g = this.levelTex.getContext();
    g.clearRect(0, 0, 128, 32);
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'center';
    g.fillStyle = this.cfg.isBoss ? '#ffb03a' : '#e8e2d0';
    g.fillText(`Lv.${this.level}`, 64, 24);
    this.levelTex.update();
  }

  placeRandom() {
    const [rMin, rMax] = this.cfg.ring;
    const angle = Math.random() * Math.PI * 2;
    const radius = rMin + Math.random() * (rMax - rMin);
    this.group.position.set(
      Math.max(-WORLD_HALF, Math.min(WORLD_HALF, Math.cos(angle) * radius)),
      0,
      Math.max(-WORLD_HALF, Math.min(WORLD_HALF, Math.sin(angle) * radius))
    );
    // 자리를 잡은 뒤에야 레벨이 정해진다 — 중심에서 멀수록 세다
    this._applyLevel((radius - rMin) / Math.max(0.001, rMax - rMin));
  }

  /**
   * 존의 레벨 구간과 중심으로부터의 거리로 개체 레벨을 정하고 배율만 곱한다.
   * MONSTER_TYPES의 숫자는 손으로 맞춘 균형이라 건드리지 않는다.
   */
  _applyLevel(ringRatio) {
    const zone = this.zone;
    if (!zone || !zone.level) return;
    const [lo, hi] = zone.level;
    const lv = Math.max(1, Math.round(lo + (hi - lo) * Math.min(1, Math.max(0, ringRatio))));
    this.level = lv;
    const k = lv - 1;
    this.maxHp = Math.round(this.cfg.hp * (1 + 0.35 * k));
    this.damage = Math.round(this.cfg.damage * (1 + 0.18 * k));
    this.xpValue = Math.round(this.cfg.xp * (1 + 0.30 * k));
    const gm = 1 + 0.25 * k;
    this.goldRange = [Math.round(this.cfg.gold[0] * gm), Math.round(this.cfg.gold[1] * gm)];
    this.jellyCount = this.cfg.jelly + Math.floor(k / 6);
    this.hp = this.maxHp;
    if (this.levelTex) this._drawLevel();
  }

  setVisible(v) {
    this.group.setEnabled(v);
  }

  /** 존을 바꿀 때 통째로 걷어낸다 */
  dispose() {
    // 모델 로딩이 끝나기 전에 걷어낼 수 있다. 플래그를 보고 뒤늦은 로딩이 스스로 접게 한다
    this.disposed = true;
    if (this.levelTex) this.levelTex.dispose();
    this.group.dispose(false, true);
  }

  takeDamage(amount, dir = null, knock = 9, knockUp = 0) {
    if (this.dead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.flashT = 0.15;
    this.flashMat.diffuseColor.copyFrom(RED);
    this.body.scaling.set(1.18, 0.45, 1.18);
    // 슈퍼아머(보스): 밀리지도, 뜨지도 않는다
    if (dir && !this.cfg.superArmor) {
      this.knock.copyFromFloats(dir.x, 0, dir.z);
      this.knock.scaleInPlace(knock);
    }
    if (knockUp > 0 && !this.cfg.superArmor) this.velY = Math.max(this.velY, knockUp);
    if (this.hp <= 0) {
      this.dead = true;
      this.respawnT = this.cfg.respawn || RESPAWN_TIME;
      this.pendingAtk = null;
      // 사망 연출: 막타 방향으로 시체가 날아간다 (PHYSICS.md §2-4)
      this.deathT = 0.55;
      this.knock.scaleInPlace(1.4);
      this.hpBg.setEnabled(false);
      this.hpBar.setEnabled(false);
      this.levelPlate.setEnabled(false);
      // 사망 클립이 있으면 쓰러지는 연출로, 없으면 시체가 날아가는 연출로
      if (this.cfg.model && this.cfg.model.clips.death) {
        this.playOneShot('death', 1);
      } else {
        this.velY = Math.max(this.velY, 4.5);
      }
      return true;
    }
    // 슈퍼아머는 피격 모션으로 공격이 끊기지 않는다
    if (!this.cfg.superArmor) this.playOneShot('hit', 1.6);
    return false;
  }

  _rotateToward(target, rate, delta) {
    let diff = target - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, delta * rate);
  }

  update(delta, targets, obstacles) {
    // 빙결 둔화 — 지속 동안 이동이 느려진다
    if (this.slowT > 0) this.slowT -= delta;
    const slow = this.slowT > 0 ? (this.slowMul || 0.5) : 1;
    if (this.dead) {
      if (this.deathT > 0) {
        this.deathT -= delta;
        const pos = this.group.position;
        this.velY -= 30 * delta;
        pos.y += this.velY * delta;
        pos.x += this.knock.x * delta;
        pos.z += this.knock.z * delta;
        this.knock.scaleInPlace(Math.exp(-2 * delta));
        const hasDeathClip = this.cfg.model && this.cfg.model.clips.death;
        if (!hasDeathClip) {
          // 클립이 없는 몬스터만 회전하며 작아지는 연출을 쓴다
          this.body.rotation.x += 9 * delta;
          const s = Math.max(0.25, this.deathT / 0.55);
          this.body.scaling.set(s, s, s);
        }
        if (this.deathT <= 0 || pos.y < -1) {
          this.deathT = 0;
          this.setVisible(false);
          pos.y = 0;
          this.velY = 0;
          this.knock.setAll(0);
          this.body.rotation.x = 0;
          this.body.scaling.set(1, 1, 1);
          this.animName = '';
          this.animLock = 0;
        }
      }
      this.respawnT -= delta;
      if (this.respawnT <= 0) {
        this.dead = false;
        this.hp = this.maxHp;
        this.stunT = 0;
        this.slowT = 0;
        this.hpBg.setEnabled(true);
        this.hpBar.setEnabled(true);
        this.levelPlate.setEnabled(true);
        this.setVisible(true);
        this.placeRandom();
      }
      return;
    }

    if (this.flashT > 0) {
      this.flashT -= delta;
      if (this.flashT <= 0) {
        this.flashMat.diffuseColor.copyFrom(this.baseColor);
        this.body.scaling.set(1, 1, 1);
      }
    }

    const pos = this.group.position;

    // 에어본(수직) + 넉백(수평) — 힘을 받는 동안은 행동 불가 (PHYSICS.md §2-2/2-3)
    const airborne = pos.y > 0.001 || this.velY > 0;
    if (airborne || this.knock.lengthSquared() > 0.04) {
      if (airborne) {
        this.velY -= 30 * delta;
        pos.y += this.velY * delta;
        if (pos.y <= 0) {
          pos.y = 0;
          this.velY = 0;
          this.body.scaling.set(1.3, 0.55, 1.3); // 착지 스쿼시
          this.flashT = Math.max(this.flashT, 0.12);
        }
      }
      pos.addInPlace(this._tmp.copyFrom(this.knock).scaleInPlace(delta));
      this.knock.scaleInPlace(Math.exp(-6 * delta));
      pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
      pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.z));
      resolveCollision(pos, 0.7, obstacles);
      this.hpBar.scaling.x = Math.max(0, this.hp / this.maxHp);
      return;
    }

    // 굳어 있는 동안은 제자리에서 아무것도 하지 않는다
    if (this.stunT > 0) {
      this.stunT -= delta;
      this.pendingAtk = null;
      this.playAnim('idle');
      this.hpBar.scaling.x = Math.max(0, this.hp / this.maxHp);
      return;
    }

    let target = null;
    let dist = Infinity;
    for (const t of targets) {
      if (t.dead || t.hp <= 0) continue;
      const d = Math.hypot(t.group.position.x - pos.x, t.group.position.z - pos.z);
      if (d < dist) {
        dist = d;
        target = t;
      }
    }

    // 화면 밖 개체의 본 계산을 멈춘다. 개체 수가 많을수록 이게 프레임을 좌우한다.
    if (this.anims) {
      const far = dist > ANIM_CULL_DIST;
      if (far !== this._animPaused) {
        this._animPaused = far;
        const g = this.anims[this.animName];
        if (g) {
          if (far) g.pause();
          else g.play(true);
        }
      }
    }

    if (target && dist < this.cfg.aggro) {
      const toT = this._tmp.copyFrom(target.group.position).subtractInPlace(pos);
      toT.y = 0;
      const safeD = Math.max(dist, 0.001);
      const nx = toT.x / safeD;
      const nz = toT.z / safeD;

      this._rotateToward(Math.atan2(toT.x, toT.z), 10, delta);

      const rng = this.cfg.ranged;
      if (rng) {
        // 원거리형: 사거리 안이면 멈추고, 너무 붙으면 뒷걸음질친다
        if (dist > this.cfg.attackRange * 0.85) {
          pos.x += nx * this.cfg.speed * slow * delta;
          pos.z += nz * this.cfg.speed * slow * delta;
          this._moveState = 'run';
        } else if (dist < rng.keepDistance) {
          pos.x -= nx * this.cfg.speed * 0.85 * delta;
          pos.z -= nz * this.cfg.speed * 0.85 * delta;
          this._moveState = 'walk';
        } else {
          this._moveState = 'idle';
        }
      } else if (dist > this.cfg.attackRange * 0.8) {
        pos.x += nx * this.cfg.speed * slow * delta;
        pos.z += nz * this.cfg.speed * slow * delta;
        this._moveState = 'run';
      } else {
        this._moveState = 'idle';
      }
      this.attackT -= delta;
      if (this.cfg.patterns) {
        // 보스: 패턴을 번갈아 쓰고, 예비동작 뒤에 판정이 나간다
        if (this.pendingAtk) {
          this.pendingAtk.t -= delta;
          if (this.pendingAtk.t <= 0) {
            const pat = this.pendingAtk.pattern;
            const dmg = Math.round(this.damage * pat.damageMul);
            for (const t of targets) {
              if (t.dead || t.hp <= 0) continue;
              const d = Math.hypot(t.group.position.x - pos.x, t.group.position.z - pos.z);
              const reach = pat.radius > 0 ? pat.radius : pat.range;
              if (d > reach) continue;
              const ux = (t.group.position.x - pos.x) / Math.max(d, 0.001);
              const uz = (t.group.position.z - pos.z) / Math.max(d, 0.001);
              t.takeDamage(dmg, { x: ux, z: uz });
            }
            this.pendingAtk = null;
          }
        } else if (dist < this.cfg.attackRange + 1 && this.attackT <= 0) {
          this.patIndex = ((this.patIndex || 0) + 1) % this.cfg.patterns.length;
          const pat = this.cfg.patterns[this.patIndex];
          this.attackT = ATTACK_INTERVAL * 1.9;
          this.attackAnim = 0.3;
          this.playOneShot(pat.clip, 1);
          this.pendingAtk = { pattern: pat, t: pat.windup };
        }
      } else if (this.cfg.ranged) {
        // 원거리형: 투사체를 쏜다 (판정은 ProjectileManager가 처리)
        if (dist < this.cfg.attackRange && this.attackT <= 0 && this.projectiles) {
          const rng = this.cfg.ranged;
          this.attackT = rng.interval;
          this.attackAnim = 0.3;
          this.playOneShot('attack', 1.2);
          this.projectiles.spawnHostile(
            { x: pos.x + nx * 0.6, y: 1.3, z: pos.z + nz * 0.6 },
            { x: nx, z: nz },
            this.damage, rng.projectileColor, rng.speed
          );
        }
      } else if (dist < this.cfg.attackRange && this.attackT <= 0) {
        this.attackT = ATTACK_INTERVAL;
        this.attackAnim = 0.3;
        this.playOneShot('attack', 1.3);
        target.takeDamage(this.damage, { x: nx, z: nz });
      }
    } else {
      this.wanderT -= delta;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        this.wanderDir.copyFromFloats(Math.sin(a), 0, Math.cos(a));
        if (Math.random() < 0.35) this.wanderDir.copyFromFloats(0, 0, 0);
      }
      if (this.wanderDir.lengthSquared() > 0) {
        pos.x += this.wanderDir.x * this.cfg.wanderSpeed * delta;
        pos.z += this.wanderDir.z * this.cfg.wanderSpeed * delta;
        this._rotateToward(Math.atan2(this.wanderDir.x, this.wanderDir.z), 6, delta);
        this._moveState = 'walk';
      } else {
        this._moveState = 'idle';
      }
    }

    pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
    pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.z));
    resolveCollision(pos, 0.7, obstacles);

    this.bounce += delta * (this.typeKey === 'slime' ? 2.2 : 3.5);
    let hop = 0;
    if (this.attackAnim > 0) {
      this.attackAnim -= delta;
      hop = Math.sin(Math.max(0, this.attackAnim) / 0.3 * Math.PI) * 0.35;
    }
    if (this.cfg.model) {
      // 원샷(공격/피격) 재생 중에는 이동 애니메이션으로 덮어쓰지 않는다
      this.animLock = Math.max(0, (this.animLock || 0) - delta);
      if (this.animLock <= 0) {
        if (this._moveState === 'run') this.playAnim('run', 1.3);
        else if (this._moveState === 'walk') this.playAnim('walk', 1.1);
        else this.playAnim('idle');
      }
      this.body.position.y = hop;
    } else if (this.typeKey === 'slime') {
      this.body.position.y = 0.25 + Math.sin(this.bounce) * 0.18 + hop;
    } else {
      this.body.position.y = Math.abs(Math.sin(this.bounce)) * 0.12 + hop;
    }

    this.hpBar.scaling.x = Math.max(0, this.hp / this.maxHp);
  }
}

export class MonsterManager {
  // 개체는 존이 정한다 (zones.js의 spawns). 절차적 몬스터(원귀·도깨비 계열)는
  // 스킨드 메시가 없어 값이 싸므로 밀도를 채우는 쪽에 많이 쓴다.
  constructor(scene, obstacles, shadow, zone) {
    this.scene = scene;
    this.shadow = shadow;
    this.obstacles = obstacles;
    this.list = [];
    this.zone = null;
    this.projectiles = null;
    if (zone) this.load(zone);
  }

  /**
   * 존 하나의 몬스터를 세운다. 이전 존은 통째로 걷어낸다.
   * GLB는 파일당 한 번만 파싱하는 캐시에 남아 있으므로 다시 오갈 때 재파싱이 없다.
   */
  load(zone) {
    this.dispose();
    this.zone = zone;
    // 스폰 순서가 곧 인덱스다 — 멀티 스냅샷이 인덱스 기반이라 양쪽이 같아야 한다
    for (const [type, n] of Object.entries(zone.spawns)) {
      if (!MONSTER_TYPES[type]) continue;
      for (let i = 0; i < n; i++) {
        this.list.push(new Monster(this.scene, this.shadow, type, zone));
      }
    }
    if (this.projectiles) this.setProjectiles(this.projectiles);
  }

  dispose() {
    for (const m of this.list) m.dispose();
    this.list = [];
  }

  // 원거리형 몬스터가 투사체를 쏠 수 있도록 매니저를 넘겨준다
  setProjectiles(projectiles) {
    this.projectiles = projectiles;
    for (const m of this.list) m.projectiles = projectiles;
  }

  update(delta, targets) {
    for (const m of this.list) m.update(delta, targets, this.obstacles);
  }
}
