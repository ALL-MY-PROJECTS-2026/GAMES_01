import { LOOT } from '../world/loot.js';
import { stats, save } from '../core/stats.js';

// 소지품 카드 그리드 — 획득한 소모품이 칸에 쌓이고, 클릭하면 사용된다.
let useHandler = null;

export function initInventory(onUse) {
  useHandler = onUse;
  const panel = document.getElementById('inventory');
  if (!panel) return;
  panel.addEventListener('click', (e) => {
    const cell = e.target.closest('.inv-cell');
    if (!cell || !cell.dataset.item) return;
    useItem(cell.dataset.item);
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

export function renderInventory() {
  const grid = document.getElementById('inv-grid');
  if (!grid) return;
  const gold = document.getElementById('inv-gold');
  if (gold) gold.textContent = `${stats.gold.toLocaleString()} G`;

  // 소지 중인 것만 앞에 채우고 나머지는 빈 칸으로 — 아이템창처럼 격자가 유지된다
  // stats.items.jelly는 혼백(soul)과 같은 것을 가리킨다
  const items = { ...stats.items };
  if (items.jelly) { items.soul = (items.soul || 0) + items.jelly; delete items.jelly; }
  const owned = Object.entries(items)
    .filter(([k, v]) => v > 0 && LOOT[k])
    .sort((a, b) => (LOOT[b[0]].weight || 0) - (LOOT[a[0]].weight || 0));

  const CELLS = 20;
  let html = '';
  for (let i = 0; i < CELLS; i++) {
    const entry = owned[i];
    if (!entry) {
      html += '<div class="inv-cell empty"></div>';
      continue;
    }
    const [key, count] = entry;
    const d = LOOT[key];
    const usable = !!d.use;
    html += `<div class="inv-cell${usable ? ' usable' : ''}" data-item="${key}"
      style="--item-color:${d.color}" title="${d.name} — ${d.desc || ''}${usable ? ' (클릭해 사용)' : ''}">
      <div class="inv-ic">${d.icon}</div>
      <div class="inv-ct">${count}</div>
    </div>`;
  }
  grid.innerHTML = html;

  const empty = document.getElementById('inv-empty');
  if (empty) empty.style.display = owned.length ? 'none' : 'block';
}
