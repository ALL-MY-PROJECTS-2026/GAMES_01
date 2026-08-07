import {
  setHP, setMP, setLevel, setXP, setGold, setJellyCount, flashLevelUp, setWeaponUpgrade,
  setSkillPoints
} from '../ui/hud.js';
import { sfx } from './sfx.js';
import { findSkill, totalSpent } from './skills.js';

const SAVE_KEY = 'windkingdom-save-v1';
export const MAX_UPGRADE = 5;
export const JELLY_PRICE = 5;

export const stats = {
  level: 1,
  xp: 0,
  xpMax: 25,
  gold: 0,
  items: { jelly: 0 },
  upgrades: { punch: 0, sword: 0, gun: 0 },
  skillPoints: 0,
  skills: {}
};

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
      weapon: playerRef ? playerRef.weapon : 'punch'
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
    player.maxHp = 100 + (stats.level - 1) * 10;
    player.hp = player.maxHp;
    if (data.weapon) player.setWeapon(data.weapon);
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
  setSkillPoints(stats.skillPoints);
  if (playerRef) setHP(playerRef.hp, playerRef.maxHp);
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
  return Math.round(baseDamage * (1 + 0.15 * lvl));
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
    leveled = true;
    if (playerRef) {
      playerRef.maxHp += 10;
      playerRef.hp = playerRef.maxHp;
    }
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
