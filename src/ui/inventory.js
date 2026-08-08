import { LOOT } from '../world/loot.js';
import { stats, save, ownsWeapon } from '../core/stats.js';
import { WEAPONS, WEAPON_ORDER } from '../player/weapons.js';

// 소지품 카드 그리드 — 얻은 무기와 소모품이 같은 칸에 들어간다.
// 무기는 눌러서 장착하고, 소모품은 눌러서 쓴다. 무기 교체용 숫자키는 없다.
let useHandler = null;
let equipHandler = null;

export function initInventory(onUse, onEquip = null) {
  useHandler = onUse;
  equipHandler = onEquip;
  const panel = document.getElementById('inventory');
  if (!panel) return;
  panel.addEventListener('click', (e) => {
    const cell = e.target.closest('.inv-cell');
    if (!cell) return;
    if (cell.dataset.weapon) {
      if (equipHandler) equipHandler(cell.dataset.weapon);
    } else if (cell.dataset.item) {
      useItem(cell.dataset.item);
    }
  });
}

export function addItem(key, n = 1) {
  stats.items[key] = (stats.items[key] || 0) + n;
  save();
  renderInventory();
}

export function useItem(key) {
  const def = LOOT[key];
  if (!def || (stats.items[key] || 0) <= 0) return false;
  const ok = useHandler ? useHandler(def) : false;
  if (!ok) return false;
  stats.items[key] -= 1;
  if (stats.items[key] <= 0) delete stats.items[key];
  save();
  renderInventory();
  return true;
}

export function renderInventory(activeWeapon = null) {
  const grid = document.getElementById('inv-grid');
  if (!grid) return;
  const gold = document.getElementById('inv-gold');
  if (gold) gold.textContent = `${stats.gold.toLocaleString()} G`;

  // 얻은 무기가 먼저, 그 뒤에 소모품. 둘 다 같은 격자에 들어간다
  let html = '';
  for (const key of WEAPON_ORDER) {
    if (!ownsWeapon(key)) continue;
    const w = WEAPONS[key];
    const lvl = stats.upgrades[key] || 0;
    const on = key === activeWeapon;
    html += `<div class="inv-cell weapon${on ? ' equipped' : ''}" data-weapon="${key}"
      title="${w.name} — 공격력 ${w.damage}${lvl ? ` (+${lvl})` : ''}${on ? ' · 장착 중' : ' (클릭해 장착)'}">
      <div class="inv-ic">${w.icon}</div>
      ${lvl ? `<div class="inv-ct">+${lvl}</div>` : ''}
      ${on ? '<div class="inv-eq">착용</div>' : ''}
    </div>`;
  }

  // stats.items.jelly는 혼백(soul)과 같은 것을 가리킨다
  const items = { ...stats.items };
  if (items.jelly) { items.soul = (items.soul || 0) + items.jelly; delete items.jelly; }
  const owned = Object.entries(items)
    .filter(([k, v]) => v > 0 && LOOT[k])
    .sort((a, b) => (LOOT[b[0]].weight || 0) - (LOOT[a[0]].weight || 0));

  for (const [key, count] of owned) {
    const d = LOOT[key];
    const usable = !!d.use;
    html += `<div class="inv-cell${usable ? ' usable' : ''}" data-item="${key}"
      style="--item-color:${d.color}" title="${d.name} — ${d.desc || ''}${usable ? ' (클릭해 사용)' : ''}">
      <div class="inv-ic">${d.icon}</div>
      <div class="inv-ct">${count}</div>
    </div>`;
  }

  // 격자 모양이 유지되도록 남는 칸은 빈 칸으로 채운다
  const used = WEAPON_ORDER.filter(ownsWeapon).length + owned.length;
  for (let i = used; i < Math.max(24, Math.ceil(used / 4) * 4); i++) {
    html += '<div class="inv-cell empty"></div>';
  }
  grid.innerHTML = html;

  const empty = document.getElementById('inv-empty');
  if (empty) empty.style.display = owned.length ? 'none' : 'block';
}
