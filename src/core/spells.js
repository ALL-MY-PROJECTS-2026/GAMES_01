// 술법 정의 — 마법창에서 고르고 우클릭으로 시전한다.
// AoE 설계 규칙(REFERENCE.md §3): 저코스트·광범위·이동추종·다단 중 최대 2개까지만.
export const SPELLS = {
  boltFlame: {
    key: 'boltFlame',
    name: '청염탄',
    icon: '🔥',
    desc: '푸른 도깨비불을 날린다',
    cost: 20,
    cd: 0.8,
    kind: 'bolt',
    color: '#7fb0ff',
    baseDamage: 14,
    perLevel: 2,
    knock: 7
  },
  // 지염장(地炎場) — 지정 지점에 불길. 광범위 + 다단이므로 이동추종 없음 + 고코스트로 제약
  flameField: {
    key: 'flameField',
    name: '지염장',
    icon: '🌋',
    desc: '지정한 곳에 불길을 피워 지속 피해',
    cost: 45,
    cd: 4.5,
    kind: 'ground',
    color: '#ff8a3a',
    baseDamage: 9,
    perLevel: 1.5,
    radius: 4.0,
    duration: 3.2,
    tickInterval: 0.55,
    range: 18,
    knock: 2
  }
};

export const SPELL_ORDER = ['boltFlame', 'flameField'];
