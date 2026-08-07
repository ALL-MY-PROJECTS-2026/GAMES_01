// 플레이어 3인 — 선택한 1인을 조작하고 나머지 둘은 동료 AI가 된다 (슬레이어즈식 소프트 락:
// 무기/술법은 공용, 캐릭터별 배율로 정체성 부여)
export const CHARACTERS = {
  ilim: {
    key: 'ilim', name: '이림', role: '근접 무투가', desc: '검문의 마지막 제자. 주먹과 검의 달인',
    portraitClass: 'p-ilim', letter: '림', tint: null, compRole: 'fighter',
    meleeMul: 1.15, rangedMul: 1.0, magicMul: 0.8,
    maxMp: 80, mpRegen: 5,
    companion: { color: '#7a3b2e', tint: '#e8b49a', projColor: '#ff9a66', damage: 9, interval: 1.1, range: 13, hp: 95 }
  },
  kusa: {
    key: 'kusa', name: '쿠사', role: '술법사', desc: '반귀의 소녀. 청염 술법으로 광역을 압도',
    portraitClass: 'p-kusa', letter: '쿠', tint: '#8fa8ff', compRole: 'mage',
    meleeMul: 0.75, rangedMul: 0.9, magicMul: 1.6,
    maxMp: 150, mpRegen: 10,
    companion: { color: '#34406e', tint: '#8fa8ff', projColor: '#7fb0ff', damage: 10, interval: 1.6, range: 15, hp: 80 }
  },
  rening: {
    key: 'rening', name: '레닝', role: '사수', desc: '서역의 사냥꾼. 부적 연사와 침착한 한 발',
    portraitClass: 'p-rening', letter: '레', tint: '#9fdca8', compRole: 'archer',
    meleeMul: 0.85, rangedMul: 1.45, magicMul: 1.0,
    maxMp: 100, mpRegen: 6,
    companion: { color: '#2e5a38', tint: '#9fdca8', projColor: '#ffd666', damage: 7, interval: 1.0, range: 16, hp: 80 }
  }
};
