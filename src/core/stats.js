import { setHP, setMP, setLevel, setXP, setGold, setJellyCount, flashLevelUp } from '../ui/hud.js';
import { sfx } from './sfx.js';

export const stats = {
  level: 1,
  xp: 0,
  xpMax: 25,
  gold: 0,
  items: { jelly: 0 }
};

let playerRef = null;

export function bindPlayer(player) {
  playerRef = player;
  refreshAll();
}

export function refreshAll() {
  setLevel(stats.level);
  setXP(stats.xp, stats.xpMax);
  setGold(stats.gold);
  setJellyCount(stats.items.jelly);
  if (playerRef) setHP(playerRef.hp, playerRef.maxHp);
}

export function addXp(amount) {
  stats.xp += amount;
  let leveled = false;
  while (stats.xp >= stats.xpMax) {
    stats.xp -= stats.xpMax;
    stats.level += 1;
    stats.xpMax = Math.round(stats.xpMax * 1.4);
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
  return leveled;
}

export function addGold(amount) {
  stats.gold += amount;
  setGold(stats.gold);
}

export function addJelly(n = 1) {
  stats.items.jelly += n;
  setJellyCount(stats.items.jelly);
}

export function useJelly() {
  if (stats.items.jelly <= 0 || !playerRef) return false;
  if (playerRef.hp >= playerRef.maxHp) return false;
  stats.items.jelly -= 1;
  playerRef.hp = Math.min(playerRef.maxHp, playerRef.hp + 15);
  setHP(playerRef.hp, playerRef.maxHp);
  setJellyCount(stats.items.jelly);
  return true;
}
