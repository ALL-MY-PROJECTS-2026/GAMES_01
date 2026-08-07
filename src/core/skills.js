// 슬레이어즈식 선택적 스킬 성장 — 무기 계열별 트리, 레벨업 포인트로 원하는 기술만 강화
export const SKILL_TREES = {
  punch: {
    name: '권법',
    icon: '👊',
    skills: [
      { key: 'punch_mastery', name: '연권 숙련', icon: '🥋', max: 3, info: '권법 피해 +12%씩', mods: { dmgMul: 0.12 } },
      { key: 'gale_step', name: '질풍보', icon: '💨', max: 3, info: '이동 속도 +5%씩', mods: { moveMul: 0.05 } },
      { key: 'crusher', name: '붕권', icon: '💥', max: 3, info: '연계 마무리(붕권) 피해 +25% · 넉백 +20%씩', mods: { finDmgMul: 0.25, finKnockMul: 0.2 } }
    ]
  },
  sword: {
    name: '퇴마검',
    icon: '🗡️',
    skills: [
      { key: 'sword_mastery', name: '검기 숙련', icon: '⚔️', max: 3, info: '퇴마검 피해 +12%씩', mods: { dmgMul: 0.12 } },
      { key: 'reach', name: '파마검기', icon: '🌙', max: 3, info: '검 사거리 +0.35씩', mods: { range: 0.35 } },
      { key: 'subdue', name: '항마참', icon: '⛓️', max: 3, info: '검 넉백 +25%씩', mods: { knockMul: 0.25 } }
    ]
  },
  gun: {
    name: '부적',
    icon: '🧧',
    skills: [
      { key: 'gun_mastery', name: '부적 숙련', icon: '📜', max: 3, info: '부적 피해 +15%씩', mods: { dmgMul: 0.15 } },
      { key: 'chant', name: '연속 영창', icon: '🔥', max: 3, info: '부적 쿨다운 -8%씩', mods: { cdMul: -0.08 } },
      { key: 'spirit_flame', name: '귀화(鬼火)', icon: '👻', max: 3, info: '부적 넉백 +30%씩', mods: { knockMul: 0.3 } }
    ]
  }
};

export function findSkill(key) {
  for (const tree of Object.values(SKILL_TREES)) {
    const def = tree.skills.find((s) => s.key === key);
    if (def) return def;
  }
  return null;
}

export function totalSpent(skillLevels) {
  let n = 0;
  for (const v of Object.values(skillLevels || {})) n += v;
  return n;
}

// 무기 스탯에 해당 계열 스킬 보정을 적용한 사본을 돌려준다
export function applyWeaponSkills(w, weaponKey, skillLevels) {
  const tree = SKILL_TREES[weaponKey];
  if (!tree || !skillLevels) return w;
  let dmgMul = 1;
  let cdMul = 1;
  let knockMul = 1;
  let range = w.range;
  for (const s of tree.skills) {
    const lvl = skillLevels[s.key] || 0;
    if (!lvl) continue;
    if (s.mods.dmgMul) dmgMul += s.mods.dmgMul * lvl;
    if (s.mods.cdMul) cdMul += s.mods.cdMul * lvl;
    if (s.mods.knockMul) knockMul += s.mods.knockMul * lvl;
    if (s.mods.range) range += s.mods.range * lvl;
  }
  if (dmgMul === 1 && cdMul === 1 && knockMul === 1 && range === w.range) return w;
  return {
    ...w,
    damage: Math.round(w.damage * dmgMul),
    cd: w.cd * cdMul,
    knock: w.knock * knockMul,
    range
  };
}

export function moveSpeedMul(skillLevels) {
  const lvl = (skillLevels && skillLevels.gale_step) || 0;
  return 1 + 0.05 * lvl;
}

// 권법 3타 마무리(붕권) 보정
export function finisherMods(skillLevels) {
  const lvl = (skillLevels && skillLevels.crusher) || 0;
  return { dmgMul: 1 + 0.25 * lvl, knockMul: 1 + 0.2 * lvl };
}
