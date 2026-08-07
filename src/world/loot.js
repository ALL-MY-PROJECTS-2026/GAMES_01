// 드랍 아이템 정의 — 실제로 이 게임에서 쓰이는 효과만 넣는다.
// weight가 클수록 자주 나온다. tier는 그 아이템이 나올 수 있는 최소 몬스터 등급.
export const LOOT = {
  soul: {
    key: 'soul', name: '혼백', icon: '🔮', color: '#9fd8ff',
    shape: 'gem', weight: 100, effect: 'jelly', amount: 1
  },
  elixir: {
    key: 'elixir', name: '영약', icon: '🧪', color: '#ff6b6b',
    model: 'mug_full.gltf', height: 0.5, weight: 26, effect: 'heal', amount: 35
  },
  spiritInk: {
    key: 'spiritInk', name: '주묵', icon: '📗', color: '#7fb0ff',
    model: 'spellbook_open.gltf', height: 0.45, weight: 22, effect: 'mana', amount: 45
  },
  stamPill: {
    key: 'stamPill', name: '기력단', icon: '💨', color: '#8fe6c8',
    model: 'smokebomb.gltf', height: 0.4, weight: 20, effect: 'stamina', amount: 999
  },
  arrowBundle: {
    key: 'arrowBundle', name: '화살 다발', icon: '🎯', color: '#ffd666',
    model: 'arrow_bundle.gltf', height: 0.5, weight: 18, effect: 'gold', amount: [18, 34]
  },
  goldPouch: {
    key: 'goldPouch', name: '금낭', icon: '💰', color: '#ffb03a',
    shape: 'pouch', weight: 30, effect: 'gold', amount: [25, 55]
  },
  steelShard: {
    key: 'steelShard', name: '강철 파편', icon: '⚙️', color: '#c9d2dc',
    model: 'dagger.gltf', height: 0.42, weight: 10, tier: 2, effect: 'jelly', amount: 3
  },
  wardStone: {
    key: 'wardStone', name: '결계석 조각', icon: '💎', color: '#b06cff',
    shape: 'gem', scale: 1.5, weight: 4, tier: 3, effect: 'jelly', amount: 8
  }
};

/** 몬스터 등급(0~3)에 맞춰 드랍 하나를 뽑는다 */
export function rollLoot(tier = 0) {
  const pool = Object.values(LOOT).filter((l) => (l.tier || 0) <= tier);
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
