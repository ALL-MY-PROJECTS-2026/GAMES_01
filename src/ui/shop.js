import { WEAPONS } from '../player/weapons.js';
import {
  stats, upgradeCost, tryUpgrade, sellAllJelly, weaponDamage, MAX_UPGRADE, JELLY_PRICE
} from '../core/stats.js';

let open = false;

function panel() {
  return document.getElementById('shop');
}

export function isShopOpen() {
  return open;
}

export function openShop() {
  open = true;
  panel().style.display = 'block';
  renderShop();
}

export function closeShop() {
  open = false;
  panel().style.display = 'none';
}

export function renderShop() {
  document.getElementById('shop-gold').textContent = `${stats.gold.toLocaleString()} G`;
  document.getElementById('shop-jelly').textContent = `젤리 x ${stats.items.jelly}`;
  document.getElementById('shop-sell').textContent =
    `젤리 전부 팔기 (+${stats.items.jelly * JELLY_PRICE} G)`;
  document.getElementById('shop-sell').disabled = stats.items.jelly <= 0;

  const rows = document.getElementById('shop-rows');
  rows.innerHTML = '';
  for (const [key, w] of Object.entries(WEAPONS)) {
    const lvl = stats.upgrades[key] || 0;
    const cost = upgradeCost(key);
    const now = weaponDamage(w.damage, key);
    const next = cost ? Math.round(w.damage * (1 + 0.15 * (lvl + 1))) : null;

    const row = document.createElement('div');
    row.className = 'shop-row';
    const affordable = cost && stats.items.jelly >= cost.jelly && stats.gold >= cost.gold;
    row.innerHTML = `
      <div class="shop-w">
        <span class="shop-icon">${w.icon}</span>
        <span class="shop-name">${w.name} <b>+${lvl}</b></span>
        <span class="shop-dmg">공격력 ${now}${next !== null ? ` → ${next}` : ''}</span>
      </div>
      <div class="shop-action">
        ${cost
          ? `<span class="shop-cost">🍮${cost.jelly} · ${cost.gold}G</span>
             <button class="shop-btn" data-w="${key}" ${affordable ? '' : 'disabled'}>강화</button>`
          : `<span class="shop-max">MAX (+${MAX_UPGRADE})</span>`}
      </div>`;
    rows.appendChild(row);
  }
  rows.querySelectorAll('.shop-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      tryUpgrade(btn.dataset.w);
      renderShop();
    });
  });
}

export function initShop() {
  document.getElementById('shop-sell').addEventListener('click', () => {
    sellAllJelly();
    renderShop();
  });
  document.getElementById('shop-close').addEventListener('click', closeShop);
}
