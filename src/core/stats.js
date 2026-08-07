import {
  setHP, setMP, setLevel, setXP, setGold, setJellyCount, flashLevelUp, setWeaponUpgrade,
  setSkillPoints
} from '../ui/hud.js';
import { sfx } from './sfx.js';
import { findSkill, totalSpent } from './skills.js';

const SAVE_KEY = 'windkingdom-save-v1';
// 세이브 스키마 버전 (STACK.md §12) — 형식이 바뀌면 올리고 migrate()에 변환을 추가한다
const SAVE_VERSION = 3;
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

// 불러오기 직후에는 저장을 막는다. 새로고침 전까지 게임이 계속 돌면서
// 자동 저장을 하면 방금 불러온 내용을 그대로 덮어써 버린다.
let saveLocked = false;

export function save() {
  if (saveLocked) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: SAVE_VERSION,
      level: stats.level,
      xp: stats.xp,
      xpMax: stats.xpMax,
      gold: stats.gold,
      // 소지품 전체를 저장한다 (v2까지는 혼백만 저장해서 나머지 아이템이 사라졌다)
      items: { ...stats.items },
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

// 구버전 세이브를 현재 스키마로 끌어올린다. 알 수 없는 미래 버전은 버린다.
function migrate(data) {
  const v = data.version || 1;
  if (v > SAVE_VERSION) return null;
  if (v < 2) {
    // v1: 스탯/스킬 포인트가 없던 시절 — 지나간 레벨업만큼 소급 지급은 bindPlayer가 처리
    data.attrs = data.attrs || { str: 0, vit: 0, dex: 0, mag: 0 };
  }
  if (v < 3) {
    // v2: 혼백 개수만 따로 저장하던 형식 → 소지품 묶음으로 옮긴다
    data.items = { jelly: data.jelly || 0 };
  }
  data.version = SAVE_VERSION;
  return data;
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

/** 캐릭터 정보를 파일로 내보낸다 — 다른 컴퓨터로 옮길 때 쓴다 */
export function exportSave() {
  save();
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `guigok-save-lv${stats.level}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 브라우저가 다운로드를 시작할 틈을 준 뒤 해제한다
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * 내보낸 파일을 되읽어 저장소에 덮어쓴다.
 * 형식이 맞는지 확인만 하고 반영은 새로고침에 맡긴다 — 게임 도중에 갈아끼우면
 * 이미 화면에 떠 있는 값들과 어긋나기 때문이다.
 */
export function importSave(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve({ ok: false, reason: 'read' });
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (e) {
        return resolve({ ok: false, reason: 'parse' });
      }
      if (!data || typeof data.level !== 'number') {
        return resolve({ ok: false, reason: 'format' });
      }
      const migrated = migrate(data);
      if (!migrated) return resolve({ ok: false, reason: 'version' });
      try {
        saveLocked = true;
        localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
      } catch (e) {
        saveLocked = false;
        return resolve({ ok: false, reason: 'storage' });
      }
      resolve({ ok: true, level: migrated.level });
    };
    reader.readAsText(file);
  });
}

export function bindPlayer(player) {
  playerRef = player;

  const data = load();
  if (data) {
    stats.level = data.level || 1;
    stats.xp = data.xp || 0;
    stats.xpMax = data.xpMax || 25;
    stats.gold = data.gold || 0;
    // 저장된 소지품을 통째로 복원한다
    for (const k of Object.keys(stats.items)) delete stats.items[k];
    Object.assign(stats.items, data.items || { jelly: data.jelly || 0 });
    stats.items.jelly = stats.items.jelly || 0;
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
  // 기력 최대치도 레벨·체력에 따라 늘어난다
  if (playerRef.refreshStamina) playerRef.refreshStamina();
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
    if (playerRef) {
      playerRef.mp = playerRef.maxMp;
      setMP(Math.round(playerRef.mp), playerRef.maxMp);
      playerRef.stamina = playerRef.maxStamina;
    }
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
