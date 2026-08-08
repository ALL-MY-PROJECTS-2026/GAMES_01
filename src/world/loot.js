import { ownsWeapon } from '../core/stats.js';

// 드랍 아이템 정의 — 실제로 이 게임에서 쓰이는 효과만 넣는다.
// weight가 클수록 자주 나온다. tier는 그 아이템이 나올 수 있는 최소 몬스터 등급.
export const LOOT = {
  soul: {
    key: 'soul', name: '혼백', icon: '🔮', color: '#9fd8ff',
    shape: 'gem', weight: 100, effect: 'jelly', amount: 1, desc: '무기 강화 재료 · 사용 시 HP +15'
  },
  elixir: {
    key: 'elixir', name: '영약', icon: '🧪', color: '#ff6b6b',
    model: 'mug_full.gltf', height: 0.5, weight: 26, effect: 'item', use: 'heal', amount: 35,
    desc: '생명력 35 회복'
  },
  spiritInk: {
    key: 'spiritInk', name: '주묵', icon: '📗', color: '#7fb0ff',
    model: 'spellbook_open.gltf', height: 0.45, weight: 22, effect: 'item', use: 'mana', amount: 45,
    desc: '기(MP) 45 회복'
  },
  stamPill: {
    key: 'stamPill', name: '기력단', icon: '💨', color: '#8fe6c8',
    model: 'smokebomb.gltf', height: 0.4, weight: 20, effect: 'item', use: 'stamina', amount: 999,
    desc: '기력을 가득 채운다'
  },
  arrowBundle: {
    key: 'arrowBundle', name: '화살 다발', icon: '🎯', color: '#ffd666',
    model: 'arrow_bundle.gltf', height: 0.5, weight: 18, effect: 'gold', amount: [18, 34],
    desc: '팔아서 골드로'
  },
  goldPouch: {
    key: 'goldPouch', name: '금낭', icon: '💰', color: '#ffb03a',
    shape: 'pouch', weight: 30, effect: 'gold', amount: [25, 55], desc: '즉시 골드 획득'
  },
  emptyFlask: {
    key: 'emptyFlask', name: '빈 술잔', icon: '🍶', color: '#c8b48a',
    model: 'mug_empty.gltf', height: 0.42, weight: 14, effect: 'gold', amount: [8, 16],
    desc: '팔아서 골드로'
  },
  steelShard: {
    key: 'steelShard', name: '강철 파편', icon: '⚙️', color: '#c9d2dc',
    model: 'dagger.gltf', height: 0.42, weight: 10, tier: 2, effect: 'jelly', amount: 3,
    desc: '강화 재료 (혼백 3개분)'
  },
  wardStone: {
    key: 'wardStone', name: '결계석 조각', icon: '💎', color: '#b06cff',
    shape: 'gem', scale: 1.5, weight: 4, tier: 3, effect: 'jelly', amount: 8,
    desc: '희귀 강화 재료 (혼백 8개분)'
  },

  // ── 무기 ──────────────────────────────────────────────────
  // 한 번 얻으면 영구 보유이므로, 이미 가진 것은 rollLoot에서 후보에서 빠진다.
  // 그만큼 남은 무기가 나올 확률이 올라가고, 다 모으면 소모품 확률로 돌아간다.
  dropDagger: {
    key: 'dropDagger', name: '비수', icon: '🔪', color: '#c9d2dc',
    model: 'dagger.gltf', height: 0.55, weight: 5, effect: 'weapon', weapon: 'dagger',
    amount: 1, desc: '무기 · 짧고 빠르다'
  },
  dropGun: {
    key: 'dropGun', name: '석궁', icon: '🏹', color: '#ffd666',
    model: 'arrow_bundle.gltf', height: 0.55, weight: 5, tier: 1,
    effect: 'weapon', weapon: 'gun', amount: 1, desc: '무기 · 멀리서 쏜다'
  },
  dropAxe: {
    key: 'dropAxe', name: '도끼', icon: '🪓', color: '#d8a86a',
    model: 'axe_1handed.gltf', height: 0.6, weight: 4, tier: 1,
    effect: 'weapon', weapon: 'axe', amount: 1, desc: '무기 · 무겁게 밀어낸다'
  },
  dropStaff: {
    key: 'dropStaff', name: '법장', icon: '🪄', color: '#b06cff',
    model: 'staff.gltf', height: 0.75, weight: 4, tier: 2,
    effect: 'weapon', weapon: 'staff', amount: 1, desc: '무기 · 술법이 세진다'
  },
  dropGreatsword: {
    key: 'dropGreatsword', name: '대도', icon: '⚔️', color: '#e8e2d0',
    model: 'sword_2handed.gltf', height: 0.8, weight: 3, tier: 2,
    effect: 'weapon', weapon: 'greatsword', amount: 1, desc: '무기 · 느리고 무겁다'
  },
  dropTwinKnife: {
    key: 'dropTwinKnife', name: '쌍비수', icon: '🗡️', color: '#dbe3ec',
    model: 'dagger.gltf', height: 0.55, weight: 4, tier: 1,
    effect: 'weapon', weapon: 'twinKnife', amount: 1, desc: '무기 · 두 자루를 쥔다'
  },
  dropThrowStar: {
    key: 'dropThrowStar', name: '표창', icon: '✴️', color: '#cfd8e4',
    model: 'smokebomb.gltf', height: 0.45, weight: 4, tier: 1,
    effect: 'weapon', weapon: 'throwStar', amount: 1, desc: '무기 · 던져서 맞힌다'
  },
  dropBattleAxe: {
    key: 'dropBattleAxe', name: '거부', icon: '🪚', color: '#d0b48a',
    model: 'axe_2handed.gltf', height: 0.85, weight: 2, tier: 3,
    effect: 'weapon', weapon: 'battleAxe', amount: 1, desc: '무기 · 가장 무거운 한 방'
  }
};

/** 몬스터 등급(0~3)에 맞춰 드랍 하나를 뽑는다. 이미 가진 무기는 후보에서 뺀다 */
export function rollLoot(tier = 0) {
  const pool = Object.values(LOOT).filter((l) => (l.tier || 0) <= tier
    && !(l.effect === 'weapon' && ownsWeapon(l.weapon)));
  const total = pool.reduce((a, l) => a + l.weight, 0);
  let r = Math.random() * total;
  for (const l of pool) {
    r -= l.weight;
    if (r <= 0) return l;
  }
  return pool[0];
}

/** 몬스터 스펙으로 등급을 추정 — 강할수록 좋은 게 나온다 */
export function tierOf(cfg) {
  if (cfg.isBoss) return 3;
  if (cfg.hp >= 80) return 2;
  if (cfg.hp >= 50) return 1;
  return 0;
}
