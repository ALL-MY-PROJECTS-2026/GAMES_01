// 구역(존) 정의 — 맵 하나에 해당한다.
//
// 씬은 하나만 두고 내용물만 갈아끼운다. 씬을 통째로 바꾸면 물리·카메라·HUD·네트워크를
// 전부 다시 세워야 하는데 그럴 이득이 없고, 몬스터 GLB는 이미 파일당 한 번만 파싱하는
// 캐시가 있어 존을 오가도 다시 읽지 않는다.
//
// 난이도는 두 단으로 건다 (REFERENCE.md §6의 파워 커브 체크리스트를 존마다 돌 것):
//   거시 = 존의 level 구간 — 존을 넘어가면 확 세진다
//   미시 = 몬스터의 ring   — 존 안에서 중심은 약하고 외곽은 세다
//
// 시나리오는 SCENARIO.md §4를 따른다.
export const ZONES = {
  grassland: {
    key: 'grassland',
    name: '귀곡의 초원',
    chapter: 1,
    level: [1, 8],
    seed: 20260808,
    trees: 34,
    rocks: 14,
    hasNpc: true,             // 사당 마을 — 청운·소하가 있는 시작 구역
    eliteChance: 0.07,        // 접두사가 붙을 확률 (구역이 험할수록 높다)
    start: { x: 0, z: 0 },
    palette: {
      ground: { base: '#3a6136', shades: ['#35603f', '#456f41', '#2f5a34', '#4a7a46', '#3a6538'] },
      trunk: '#5a3b28', leaf: '#24492a', rock: '#6a675e'
    },
    spawns: {
      // T0 · 중심부
      wisp: 6, slime: 4, minion: 5,
      // T1
      frostWisp: 4, fox: 4, mushroom: 3, bandit: 3, banditArcher: 3, blueOni: 3,
      // T2
      hexGhost: 3, bone: 3, boneRogue: 3, hoodedRogue: 3, boneArcher: 3,
      caster: 2, boneMage: 2, whiteFox: 2, firewitch: 2,
      // T3 · 외곽
      darkMinion: 4, redOni: 3, ironKnight: 2, boneCaptain: 2, ogre: 2,
      // 필드 보스
      boss: 1, boneKing: 1
    },
    exits: [
      { to: 'forest', x: 78, z: 0, needLevel: 8, label: '안개 삼림',
        arrive: { x: -70, z: 0 } }
    ],
    // 귀문 균열 (REFERENCE.md §5) — 마물이 스며 나오는 구멍.
    // 균열마다 소환 종류·속도·동시 상한·레벨을 따로 준다. 봉인하면 그 구멍은 멎는다.
    rifts: [
      { id: 'g1', x: 26, z: -22, radius: 12, level: 2, interval: 8, cap: 6,
        types: ['wisp', 'slime', 'minion', 'frostWisp'] },
      { id: 'g2', x: -34, z: 30, radius: 14, level: 5, interval: 11, cap: 6,
        types: ['fox', 'mushroom', 'blueOni', 'bandit', 'banditArcher'] },
      { id: 'g3', x: 54, z: 46, radius: 16, level: 7, interval: 14, cap: 6,
        types: ['bone', 'boneRogue', 'boneMage', 'boneArcher', 'hexGhost', 'caster',
          'hoodedRogue', 'whiteFox', 'firewitch'] },
      { id: 'g4', x: -62, z: -52, radius: 16, level: 8, interval: 18, cap: 5,
        types: ['darkMinion', 'redOni', 'ironKnight', 'boneCaptain', 'ogre'] }
    ]
  },

  // 2장 — 낮에도 안개가 걷히지 않는 숲 (SCENARIO.md §4).
  // 전용 몬스터(여우불·목각귀·구미호)는 아직 없어 기존 종으로 성격만 맞췄다.
  // 요호 계열과 원거리 견제형을 늘리고 근접 잡몹을 줄였다.
  forest: {
    key: 'forest',
    name: '안개 삼림',
    chapter: 2,
    level: [8, 16],
    seed: 771104,
    trees: 96,                // 숲이므로 나무를 훨씬 빽빽하게
    rocks: 8,
    hasNpc: false,
    eliteChance: 0.14,
    start: { x: -70, z: 0 },
    palette: {
      ground: { base: '#2b3f30', shades: ['#273a2c', '#334a36', '#223528', '#3a5540', '#2a4232'] },
      trunk: '#4a3324', leaf: '#1b3a24', rock: '#5e6058'
    },
    spawns: {
      fox: 6, whiteFox: 5, hexGhost: 5, frostWisp: 4,
      hoodedRogue: 4, boneRogue: 4, boneArcher: 4, boneMage: 3,
      caster: 3, firewitch: 3, bandit: 3, banditArcher: 3,
      darkMinion: 4, bone: 3, ironKnight: 3, boneCaptain: 2, ogre: 2,
      boneKing: 1
    },
    exits: [
      { to: 'grassland', x: -78, z: 0, needLevel: 0, label: '귀곡의 초원',
        arrive: { x: 70, z: 0 } }
    ],
    rifts: [
      { id: 'f1', x: -30, z: 28, radius: 15, level: 9, interval: 9, cap: 7,
        types: ['fox', 'whiteFox', 'frostWisp', 'hexGhost'] },
      { id: 'f2', x: 34, z: -30, radius: 16, level: 12, interval: 12, cap: 7,
        types: ['hoodedRogue', 'boneRogue', 'boneArcher', 'boneMage', 'caster',
          'bandit', 'banditArcher'] },
      { id: 'f3', x: 58, z: 52, radius: 16, level: 15, interval: 16, cap: 6,
        types: ['firewitch', 'darkMinion', 'bone', 'ironKnight', 'boneCaptain', 'ogre'] }
    ]
  }
};

// 봉인 비용(혼백)과 보상 — 균열 레벨에 비례한다
export const SEAL_COST = 10;
export function sealReward(rift) {
  return Math.round(60 + rift.level * 45);
}

export const ZONE_ORDER = Object.keys(ZONES);
export const FIRST_ZONE = 'grassland';

export function zoneOf(key) {
  return ZONES[key] || ZONES[FIRST_ZONE];
}
