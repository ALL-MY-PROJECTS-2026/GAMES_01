import {
  setHP, setMP, setLevel, setXP, setGold, setJellyCount, flashLevelUp, setWeaponUpgrade,
  setSkillPoints
} from '../ui/hud.js';
import { sfx } from './sfx.js';
import { findSkill, totalSpent } from './skills.js';

const SAVE_KEY = 'windkingdom-save-v1';
export const MAX_UPGRADE = 5;
export const JELLY_PRICE = 5;
export const STAT_POINTS_PER_LEVEL = 3;
export const ATTR_MAX = 50;

// 퇴마전설식 스탯 (REFERENCE.md §2 계수를 게임 스케일로 변환)
export const ATTR_DEFS = [
  { key: 'str', name: '근력', icon: '💪', info: '물리 공격력 +2% · 최대 생명력 +0.6씩' },
  { key: 'vit', name: '체력', icon: '❤️', info: '최대 생명력 +4 · 받는 피해 -0.5%씩' },
  { key: 'dex', name: '민첩', icon: '🌀', info: '공격 속도 +1% · 이동 속도 +0.7%씩' },
  { key: 'mag', name: '술법', icon: '🔮', info: '술법 피해 +3% · 최대 기력 +2씩' }
];

export const stats = {
  level: 1,
  xp: 0,
  xpMax: 25,
  gold: 0,
  items: { jelly: 0 },
  upgrades: { punch: 0, sword: 0, gun: 0 },
  skillPoints: 0,
  skills: {},
  statPoints: 0,
  attrs: { str: 0, vit: 0, dex: 0, mag: 0 }
};

// 파생 효과 계수 (캡 포함)
export function attackSpeedMul() {
  return 1 + Math.min(0.5, stats.attrs.dex * 0.01);
}
export function moveSpeedAttrMul() {
  return 1 + Math.min(0.35, stats.attrs.dex * 0.007);
}
export function magicDamageMul() {
  return 1 + stats.attrs.mag * 0.03;
}
export function damageTakenMul() {
  return 1 - Math.min(0.4, stats.attrs.vit * 0.005);
}

let playerRef = null;

export function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      level: stats.level,
      xp: stats.xp,
      xpMax: stats.xpMax,
      gold: stats.gold,
      jelly: stats.items.jelly,
      upgrades: stats.upgrades,
      skillPoints: stats.skillPoints,
      skills: stats.skills,
      statPoints: stats.statPoints,
      attrs: stats.attrs,
      weapon: playerRef ? playerRef.weapon : 'punch',
      charKey: playerRef ? playerRef.charKey : undefined
    }));
  } catch (e) { /* storage unavailable */ }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function bindPlayer(player) {
  playerRef = player;

  const data = load();
  if (data) {
    stats.level = data.level || 1;
    stats.xp = data.xp || 0;
    stats.xpMax = data.xpMax || 25;
    stats.gold = data.gold || 0;
    stats.items.jelly = data.jelly || 0;
    Object.assign(stats.upgrades, data.upgrades || {});
    stats.skills = data.skills || {};
    // 구버전 세이브: 지나간 레벨업만큼 포인트 소급 지급
    stats.skillPoints = data.skillPoints !== undefined
      ? data.skillPoints
      : Math.max(0, stats.level - 1 - totalSpent(stats.skills));
    Object.assign(stats.attrs, data.attrs || {});
    const attrSpent = Object.values(stats.attrs).reduce((a, b) => a + b, 0);
    stats.statPoints = data.statPoints !== undefined
      ? data.statPoints
      : Math.max(0, (stats.level - 1) * STAT_POINTS_PER_LEVEL - attrSpent);
    applyAttrEffects();
    player.hp = player.maxHp;
    if (data.weapon) player.setWeapon(data.weapon);
  } else {
    applyAttrEffects();
  }

  window.addEventListener('beforeunload', save);
  refreshAll();
}

export function refreshAll() {
  setLevel(stats.level);
  setXP(stats.xp, stats.xpMax);
  setGold(stats.gold);
  setJellyCount(stats.items.jelly);
  for (const k of ['punch', 'sword', 'gun']) setWeaponUpgrade(k, stats.upgrades[k]);
  setSkillPoints(stats.skillPoints + stats.statPoints);
  if (playerRef) setHP(playerRef.hp, playerRef.maxHp);
}

// 스탯 파생치를 플레이어에 반영 (최대 HP/MP) — 투자·레벨업·로드 시 호출
export function applyAttrEffects() {
  if (!playerRef) return;
  const hpMax = Math.round(100 + (stats.level - 1) * 10 + stats.attrs.vit * 4 + stats.attrs.str * 0.6);
  const dHp = hpMax - playerRef.maxHp;
  playerRef.maxHp = hpMax;
  if (dHp > 0) playerRef.hp = Math.min(hpMax, playerRef.hp + dHp);
  playerRef.hp = Math.min(playerRef.hp, hpMax);
  const mpMax = playerRef.charCfg.maxMp + stats.attrs.mag * 2;
  playerRef.maxMp = mpMax;
  playerRef.mp = Math.min(playerRef.mp, mpMax);
  setMP(Math.round(playerRef.mp), mpMax);
}

export function investStat(key) {
  if (!ATTR_DEFS.find((a) => a.key === key)) return { ok: false, reason: 'unknown' };
  if (stats.statPoints <= 0) return { ok: false, reason: 'points' };
  if (stats.attrs[key] >= ATTR_MAX) return { ok: false, reason: 'max' };
  stats.statPoints -= 1;
  stats.attrs[key] += 1;
  applyAttrEffects();
  sfx.pickup();
  refreshAll();
  save();
  return { ok: true, value: stats.attrs[key] };
}

export function learnSkill(key) {
  const def = findSkill(key);
  if (!def) return { ok: false, reason: 'unknown' };
  const lvl = stats.skills[key] || 0;
  if (lvl >= def.max) return { ok: false, reason: 'max' };
  if (stats.skillPoints <= 0) return { ok: false, reason: 'points' };
  stats.skillPoints -= 1;
  stats.skills[key] = lvl + 1;
  sfx.levelup();
  refreshAll();
  save();
  return { ok: true, level: stats.skills[key] };
}

export function weaponDamage(baseDamage, weaponKey) {
  const lvl = stats.upgrades[weaponKey] || 0;
  return Math.round(baseDamage * (1 + 0.15 * lvl) * (1 + stats.attrs.str * 0.02));
}

export function upgradeCost(weaponKey) {
  const lvl = stats.upgrades[weaponKey] || 0;
  if (lvl >= MAX_UPGRADE) return null;
  return { jelly: 2 + lvl * 2, gold: 20 + lvl * 30 };
}

export function tryUpgrade(weaponKey) {
  const cost = upgradeCost(weaponKey);
  if (!cost) return { ok: false, reason: 'max' };
  if (stats.items.jelly < cost.jelly || stats.gold < cost.gold) {
    return { ok: false, reason: 'cost' };
  }
  stats.items.jelly -= cost.jelly;
  stats.gold -= cost.gold;
  stats.upgrades[weaponKey] += 1;
  sfx.levelup();
  refreshAll();
  save();
  return { ok: true, level: stats.upgrades[weaponKey] };
}

export function sellAllJelly() {
  const n = stats.items.jelly;
  if (n <= 0) return 0;
  stats.items.jelly = 0;
  stats.gold += n * JELLY_PRICE;
  sfx.pickup();
  refreshAll();
  save();
  return n * JELLY_PRICE;
}

export function addXp(amount) {
  stats.xp += amount;
  let leveled = false;
  while (stats.xp >= stats.xpMax) {
    stats.xp -= stats.xpMax;
    stats.level += 1;
    stats.xpMax = Math.round(stats.xpMax * 1.4);
    stats.skillPoints += 1;
    stats.statPoints += STAT_POINTS_PER_LEVEL;
    leveled = true;
  }
  if (leveled && playerRef) {
    applyAttrEffects();
    playerRef.hp = playerRef.maxHp;
  }
  if (leveled) {
    flashLevelUp(stats.level);
    setMP(100, 100);
    sfx.levelup();
  }
  refreshAll();
  save();
  return leveled;
}

export function addGold(amount) {
  stats.gold += amount;
  setGold(stats.gold);
  save();
}

export function addJelly(n = 1) {
  stats.items.jelly += n;
  setJellyCount(stats.items.jelly);
  save();
}

export function useJelly() {
  if (stats.items.jelly <= 0 || !playerRef) return false;
  if (playerRef.hp >= playerRef.maxHp) return false;
  stats.items.jelly -= 1;
  playerRef.hp = Math.min(playerRef.maxHp, playerRef.hp + 15);
  setHP(playerRef.hp, playerRef.maxHp);
  setJellyCount(stats.items.jelly);
  save();
  return true;
}
