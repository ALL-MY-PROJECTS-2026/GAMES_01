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
  },
  // 귀뢰(鬼雷) — 적에서 적으로 튀는 번개. 단일 타깃이 아니라 연쇄이므로 사거리를 좁게 잡았다
  chainBolt: {
    key: 'chainBolt',
    name: '귀뢰',
    icon: '⚡',
    desc: '번개가 적을 타고 연쇄한다',
    cost: 35,
    cd: 3.0,
    kind: 'chain',
    color: '#a9d4ff',
    baseDamage: 16,
    perLevel: 2.2,
    knock: 5,
    range: 13,
    chainRange: 6.5,
    maxChains: 4,
    falloff: 0.8      // 튈 때마다 피해 감소
  },
  // 결계 — 자기 버프. 지속 동안 받는 피해 감소 (B 유형 오라)
  wardBarrier: {
    key: 'wardBarrier',
    name: '결계',
    icon: '🛡️',
    desc: '몸을 감싸 받는 피해를 줄인다',
    cost: 40,
    cd: 12,
    kind: 'buff',
    color: '#8fe6c8',
    duration: 8,
    damageTakenMul: 0.55
  },
  // 빙백진 — 자기중심 폭발. 이동추종 없음 + 즉발 단발이라 규칙 위반 아님
  frostNova: {
    key: 'frostNova',
    name: '빙백진',
    icon: '❄️',
    desc: '주변을 얼려 밀쳐낸다',
    cost: 30,
    cd: 6,
    kind: 'nova',
    color: '#9fe4ff',
    baseDamage: 18,
    perLevel: 2,
    radius: 5.5,
    knock: 26,
    knockUp: 6,
    slowDuration: 2.5,
    slowMul: 0.45
  }
};

export const SPELL_ORDER = ['boltFlame', 'flameField', 'chainBolt', 'frostNova', 'wardBarrier'];
