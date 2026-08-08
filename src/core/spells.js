// 술법 정의 — 마법창에서 고르고 우클릭으로 시전한다.
//
// AoE 설계 규칙 (REFERENCE.md §3): 저코스트 · 광범위 · 이동추종 · 다단 중 최대 2개까지만.
// 원작에서 지열파가 넷 다 가져서 다른 장판기를 전부 사장시킨 사례를 반복하지 않는다.
//
// class는 나중에 캐릭터별로 갈라 쓰기 위한 태그다. 지금은 한 캐릭터가 전부 사용한다.
//   mage  = 술법사 (쿠사) — 광역과 제어
//   knight = 기사 (이림)  — 자기중심 · 근접 보조 · 생존
//   ranger = 사수 (레닝)  — 단일 고화력 · 견제 · 기동
export const SPELL_CLASSES = {
  mage: { name: '술법', color: '#7fb0ff' },
  knight: { name: '무예', color: '#ffb03a' },
  ranger: { name: '궁술', color: '#9fdca8' }
};

export const SPELLS = {
  // ── 술법사(마법사) — 광역과 제어 ────────────────────────────
  boltFlame: {
    key: 'boltFlame', cls: 'mage', name: '청염탄', icon: '🔥',
    desc: '푸른 도깨비불을 날린다',
    cost: 20, cd: 0.8, kind: 'bolt', fx: 'flame', color: '#7fb0ff',
    baseDamage: 14, perLevel: 2, knock: 7
  },
  flameField: {
    key: 'flameField', cls: 'mage', name: '지염장', icon: '🌋',
    desc: '지정한 곳에 불길을 피워 지속 피해',
    cost: 45, cd: 4.5, kind: 'ground', fx: 'blaze', color: '#ff8a3a',
    baseDamage: 9, perLevel: 1.5, radius: 4.0, duration: 3.2, tickInterval: 0.55,
    range: 7, knock: 2
  },
  chainBolt: {
    key: 'chainBolt', cls: 'mage', name: '귀뢰', icon: '⚡',
    desc: '번개가 적을 타고 연쇄한다',
    cost: 35, cd: 3.0, kind: 'chain', fx: 'thunder', color: '#a9d4ff',
    baseDamage: 16, perLevel: 2.2, knock: 5,
    range: 8, chainRange: 5.5, maxChains: 4, falloff: 0.8
  },
  frostNova: {
    key: 'frostNova', cls: 'mage', name: '빙백진', icon: '❄️',
    desc: '주변을 얼려 밀쳐낸다',
    cost: 30, cd: 6, kind: 'nova', fx: 'frost', color: '#9fe4ff',
    baseDamage: 18, perLevel: 2, radius: 5.5, knock: 26, knockUp: 6,
    slowDuration: 2.5, slowMul: 0.45
  },
  // 치유술 — 원작 회복술(REFERENCE §3-10). 규칙 6대로 술법 스탯을 타지 않는다.
  // 누가 들어도 같은 양을 회복하므로 협동에서 역할이 갈린다
  healWard: {
    key: 'healWard', cls: 'mage', name: '치유술', icon: '💚',
    desc: '상처를 아물게 한다',
    cost: 40, cd: 9, kind: 'heal', fx: 'heal', color: '#8fe6c8',
    healFlat: 45, healPerLevel: 4
  },
  // 석화술 — 범위 무력화. 저코스트도 광범위도 아니고 피해도 낮다(제어 전용)
  petrify: {
    key: 'petrify', cls: 'mage', name: '석화술', icon: '🗿',
    desc: '주변을 굳혀 움직임을 멈춘다',
    cost: 60, cd: 15, kind: 'nova', fx: 'stone', color: '#c8c0a8',
    baseDamage: 8, perLevel: 1, radius: 5.0, knock: 0, knockUp: 0,
    slowDuration: 0, slowMul: 1, stunDuration: 2.6
  },
  // 광역 + 다단이므로 이동추종 없음 + 최고 코스트로 제약
  meteorRain: {
    key: 'meteorRain', cls: 'mage', name: '유성우', icon: '☄️',
    desc: '지정한 곳에 불덩이가 연달아 떨어진다',
    cost: 70, cd: 14, kind: 'rain', fx: 'meteor', color: '#ff7a4e',
    baseDamage: 26, perLevel: 3, radius: 5.0, range: 8,
    strikes: 5, interval: 0.42, knock: 12, knockUp: 3
  },

  // ── 기사(무예) — 자기중심 · 돌진 · 생존 ─────────────────────
  wardBarrier: {
    key: 'wardBarrier', cls: 'knight', name: '결계', icon: '🛡️',
    desc: '몸을 감싸 받는 피해를 줄인다',
    cost: 40, cd: 12, kind: 'buff', fx: 'ward', color: '#8fe6c8',
    duration: 8, damageTakenMul: 0.55
  },
  whirlwind: {
    key: 'whirlwind', cls: 'knight', name: '선풍참', icon: '🌀',
    desc: '제자리에서 휘돌아 주변을 벤다',
    cost: 30, cd: 5, kind: 'nova', fx: 'whirl', color: '#cfe4ff',
    baseDamage: 22, perLevel: 2.6, radius: 4.2, knock: 14, knockUp: 2,
    slowDuration: 0, slowMul: 1
  },
  chargeStrike: {
    key: 'chargeStrike', cls: 'knight', name: '돌풍격', icon: '💨',
    desc: '앞으로 파고들며 길목의 적을 밀어낸다',
    cost: 25, cd: 6, kind: 'dash', fx: 'gust', color: '#ffd27a',
    baseDamage: 24, perLevel: 2.8, distance: 9, width: 2.2, knock: 20, knockUp: 4
  },
  warCry: {
    key: 'warCry', cls: 'knight', name: '기합', icon: '📣',
    desc: '한동안 공격이 매서워진다',
    cost: 35, cd: 16, kind: 'buff', fx: 'cry', color: '#ffb03a',
    duration: 10, damageBonus: 0.35
  },
  // 금강불괴 — 원작의 근접 무적(REFERENCE §3-9). 원작은 후반 위협이 술법인데
  // 근접만 막아 실패했다(규칙 3). 그래서 물리 피해 대폭 감소 + 넉백 면역으로 바꿨다
  ironBody: {
    key: 'ironBody', cls: 'knight', name: '금강불괴', icon: '🗿',
    desc: '몸이 굳어 물리 공격을 거의 받지 않는다',
    cost: 55, cd: 22, kind: 'buff', fx: 'iron', color: '#c9d2dc',
    duration: 6, physMul: 0.2, noKnock: true
  },
  // 화벽술 — 원작 화벽술(REFERENCE §3-2). 이동추종 + 다단이라 규칙 1에 걸린다
  // → 나머지 둘(저코스트·광범위)을 포기해 고코스트 · 좁은 반경으로 잡았다
  flameWall: {
    key: 'flameWall', cls: 'knight', name: '화벽술', icon: '🔥',
    desc: '몸을 두른 불길이 따라다니며 태운다',
    cost: 60, cd: 18, kind: 'aurafield', fx: 'firewall', color: '#ff8a3a',
    baseDamage: 7, perLevel: 1.2, radius: 3.0, duration: 6, tickInterval: 0.5, knock: 3
  },
  groundSlam: {
    key: 'groundSlam', cls: 'knight', name: '지진격', icon: '🪨',
    desc: '땅을 내리찍어 주변을 띄운다',
    cost: 45, cd: 9, kind: 'nova', fx: 'quake', color: '#c8a06a',
    baseDamage: 30, perLevel: 3.2, radius: 4.8, knock: 24, knockUp: 9,
    slowDuration: 1.2, slowMul: 0.6
  },

  // ── 사수(궁술) — 단일 고화력 · 견제 · 기동 ───────────────────
  piercingShot: {
    key: 'piercingShot', cls: 'ranger', name: '관통시', icon: '🏹',
    desc: '적을 꿰뚫는 화살을 쏜다',
    cost: 28, cd: 2.4, kind: 'pierce', fx: 'lance', color: '#ffd666',
    baseDamage: 30, perLevel: 3.4, knock: 12, range: 10, maxHits: 4, falloff: 0.85
  },
  arrowVolley: {
    key: 'arrowVolley', cls: 'ranger', name: '연사', icon: '🎯',
    desc: '부채꼴로 화살을 뿌린다',
    cost: 32, cd: 5, kind: 'spread', fx: 'fan', color: '#ffe9a8',
    baseDamage: 14, perLevel: 1.8, knock: 6, count: 5, spreadDeg: 46
  },
  arrowRain: {
    key: 'arrowRain', cls: 'ranger', name: '시우(矢雨)', icon: '🌧️',
    desc: '지정한 곳에 화살비를 퍼붓는다',
    cost: 55, cd: 11, kind: 'rain', fx: 'arrows', color: '#ffd27a',
    baseDamage: 15, perLevel: 1.8, radius: 4.4, range: 9,
    strikes: 6, interval: 0.3, knock: 5, knockUp: 0
  },
  crippleShot: {
    key: 'crippleShot', cls: 'ranger', name: '절족시', icon: '🕸️',
    desc: '다리를 노려 크게 둔화시킨다',
    cost: 26, cd: 7, kind: 'pierce', fx: 'snare', color: '#9fdca8',
    baseDamage: 18, perLevel: 2, knock: 4, range: 9, maxHits: 2, falloff: 1,
    slowDuration: 4, slowMul: 0.35
  },
  // 정령시 — 원작 정령술(REFERENCE §3-4)의 유도 성질. 빗나가지 않는 대신 느리다
  spiritArrow: {
    key: 'spiritArrow', cls: 'ranger', name: '정령시', icon: '🦋',
    desc: '스스로 적을 쫓는 화살을 놓는다',
    // 선회 반경 = 속도 / 선회율. 술법탄 기본 속도(42)로는 표적을 스치고 지나가므로
    // 속도를 크게 낮추고 대신 오래 날며 넉넉히 판정한다
    cost: 34, cd: 3.2, kind: 'homing', fx: 'spirit', color: '#9fe4ff',
    baseDamage: 26, perLevel: 3, knock: 8,
    homing: 7, speedMul: 0.4, lifeMul: 2.6, hitR: 1.1, count: 2
  },
  // 봉인시 — 원작 봉인술(REFERENCE §3-1)을 단일 대상 무력화로 옮겼다.
  // 석화술보다 범위가 없는 대신 훨씬 오래 묶는다
  sealShot: {
    key: 'sealShot', cls: 'ranger', name: '봉인시', icon: '📿',
    desc: '부적을 박아 한 마리를 오래 묶는다',
    cost: 30, cd: 10, kind: 'pierce', fx: 'seal', color: '#e8d8a8',
    baseDamage: 12, perLevel: 1.5, knock: 0, range: 10, maxHits: 1, falloff: 1,
    stunDuration: 4.5
  },
  windStep: {
    key: 'windStep', cls: 'ranger', name: '풍신보', icon: '🍃',
    desc: '뒤로 물러서며 발이 빨라진다',
    cost: 22, cd: 8, kind: 'dash', fx: 'wind', color: '#9fe4ff',
    baseDamage: 0, perLevel: 0, distance: -8, width: 1.6, knock: 0, knockUp: 0,
    hasteDuration: 5, hasteMul: 1.4
  }
};

// 시전 자세 — kind마다 다른 클립을 쓴다 (전부 같은 동작이면 15종이 구분되지 않는다)
//   shoot  = 앞으로 쏘는 동작   long = 길게 끌어 지점에 꽂는 동작
//   raise  = 위로 들어올리는 동작(버프)   hold = 모아서 터뜨리는 동작(자기중심)
const CAST_BY_KIND = {
  bolt: 'cast', chain: 'cast', pierce: 'shoot', spread: 'shoot', homing: 'cast',
  ground: 'castLong', rain: 'castLong',
  buff: 'castRaise', heal: 'castRaise',
  nova: 'castHold', dash: 'cast', aurafield: 'castHold'
};

/** 이 술법을 시전할 때 쓸 애니메이션 논리 키 */
export function castClipOf(spell) {
  if (!spell) return 'cast';
  return spell.castClip || CAST_BY_KIND[spell.kind] || 'cast';
}

export const SPELL_ORDER = Object.keys(SPELLS);

/** 계열별 목록 — 나중에 캐릭터를 나눌 때 이걸로 거른다 */
export function spellsOf(cls) {
  return SPELL_ORDER.filter((k) => SPELLS[k].cls === cls);
}
