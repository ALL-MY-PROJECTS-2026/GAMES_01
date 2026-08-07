// 논리 동작 키 → 실제 GLB 클립 이름 매핑. 모델마다 클립 이름이 다르므로 여기서 흡수한다.
// KayKit Adventurers (CC0) — 무술/검술 클립이 갖춰진 리깅 모델
const KAYKIT_CLIPS = {
  idle: 'Idle', walk: 'Walking_A', run: 'Running_A', jump: 'Jump_Full_Short',
  punch1: 'Unarmed_Melee_Attack_Punch_A',
  punch2: 'Unarmed_Melee_Attack_Punch_B',
  punch3: 'Unarmed_Melee_Attack_Kick',
  punch4: 'Unarmed_Melee_Attack_Punch_A',
  punch5: 'Unarmed_Melee_Attack_Kick',
  sword1: '1H_Melee_Attack_Stab',              // 찌르기
  sword2: '1H_Melee_Attack_Slice_Horizontal',  // 가로베기
  cast: 'Spellcast_Shoot', shoot: '1H_Ranged_Shoot',
  hit: 'Hit_A', death: 'Death_A',
  dodge: 'Dodge_Forward', dodgeBack: 'Dodge_Backward',
  block: 'Blocking', blockHit: 'Block_Hit', cheer: 'Cheer'
};

// RobotExpressive(기존 샘플 모델) — 클립이 적어 구간 슬라이스로 동작을 나눈다
const ROBOT_CLIPS = {
  idle: 'Idle', walk: 'Walking', run: 'Running', jump: 'Jump',
  punch1: 'Punch', punch2: 'Punch', punch3: 'Wave', punch4: 'Jump', punch5: 'Punch',
  sword1: 'Punch', sword2: 'Wave',
  cast: 'Wave', shoot: 'Punch',
  hit: 'Idle', death: 'Death',
  dodge: 'Running', dodgeBack: 'Running', block: 'Idle', blockHit: 'Idle', cheer: 'ThumbsUp'
};

// 플레이어 3인 — 선택한 1인을 조작하고 나머지 둘은 동료 AI가 된다 (슬레이어즈식 소프트 락:
// 무기/술법은 공용, 캐릭터별 배율로 정체성 부여)
export const CHARACTERS = {
  ilim: {
    key: 'ilim', name: '이림', role: '근접 무투가', desc: '검문의 마지막 제자. 주먹과 검의 달인',
    portraitClass: 'p-ilim', letter: '림', tint: null, compRole: 'fighter',
    // 붉은 무복의 검객 — 기본 텍스처의 초록 계열을 붉은색으로, 청록은 남색으로 갈아입힌다
    model: {
      file: 'Rogue.glb', clips: KAYKIT_CLIPS, height: 1.85, weaponBone: 'handslot.r',
      // 4번 슬롯은 모델에 내장된 석궁 메시를 그대로 쓴다
      props: { gun: '1H_Crossbow' },
      texture: 'models/rogue_texture.png',
      recolor: [
        { from: [75, 168], to: 2, satMul: 1.25 },    // 초록 옷 → 붉은 무복
        { from: [168, 205], to: 224, satMul: 1.1 }   // 청록 → 남색 하의
      ]
    },
    meleeMul: 1.15, rangedMul: 1.0, magicMul: 0.8,
    maxMp: 80, mpRegen: 5,
    companion: { color: '#7a3b2e', tint: '#e8b49a', projColor: '#ff9a66', damage: 9, interval: 1.1, range: 13, hp: 95 }
  },
  kusa: {
    key: 'kusa', name: '쿠사', role: '술법사', desc: '반귀의 소녀. 청염 술법으로 광역을 압도',
    portraitClass: 'p-kusa', letter: '쿠', tint: '#8fa8ff', compRole: 'mage',
    model: { file: 'character.glb', clips: ROBOT_CLIPS, height: 1.9 },
    meleeMul: 0.75, rangedMul: 0.9, magicMul: 1.6,
    maxMp: 150, mpRegen: 10,
    companion: { color: '#34406e', tint: '#8fa8ff', projColor: '#7fb0ff', damage: 10, interval: 1.6, range: 15, hp: 80 }
  },
  rening: {
    key: 'rening', name: '레닝', role: '사수', desc: '서역의 사냥꾼. 부적 연사와 침착한 한 발',
    portraitClass: 'p-rening', letter: '레', tint: '#9fdca8', compRole: 'archer',
    model: { file: 'character.glb', clips: ROBOT_CLIPS, height: 1.9 },
    meleeMul: 0.85, rangedMul: 1.45, magicMul: 1.0,
    maxMp: 100, mpRegen: 6,
    companion: { color: '#2e5a38', tint: '#9fdca8', projColor: '#ffd666', damage: 7, interval: 1.0, range: 16, hp: 80 }
  }
};
