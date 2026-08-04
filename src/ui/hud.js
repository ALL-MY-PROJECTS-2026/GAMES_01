const WEAPON_SLOTS = { punch: 2, sword: 3, gun: 4 };

export function initHUD() {
  const bar = document.getElementById('quickbar');
  for (let i = 1; i <= 8; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.id = `slot-${i}`;
    slot.innerHTML = `<span>${i}</span>`;
    bar.appendChild(slot);
  }
  const s1 = document.getElementById('slot-1');
  s1.innerHTML = `<span>1</span><div class="slot-icon">🍮</div><div class="slot-count" id="jelly-count">0</div>`;
  s1.title = '슬라임 젤리 (HP +15)';

  const weapons = [
    [2, '👊', '펀치 — 빠른 기본 공격'],
    [3, '🗡️', '검 — 넓은 범위, 강한 넉백'],
    [4, '🔫', '총 — 원거리 연사']
  ];
  for (const [i, icon, title] of weapons) {
    const s = document.getElementById(`slot-${i}`);
    s.innerHTML = `<span>${i}</span><div class="slot-icon">${icon}</div>`;
    s.title = title;
  }
}

export function setActiveWeapon(key) {
  for (const [w, idx] of Object.entries(WEAPON_SLOTS)) {
    document.getElementById(`slot-${idx}`).classList.toggle('active', w === key);
  }
}

export function setHP(cur, max) {
  document.getElementById('hpfill').style.width = `${(cur / max) * 100}%`;
  document.getElementById('hptxt').textContent = `HP ${cur} / ${max}`;
}

export function setMP(cur, max) {
  document.getElementById('mpfill').style.width = `${(cur / max) * 100}%`;
  document.getElementById('mptxt').textContent = `MP ${cur} / ${max}`;
}

export function setXP(cur, max) {
  document.getElementById('xpfill').style.width = `${Math.min(100, (cur / max) * 100)}%`;
  document.getElementById('xptxt').textContent = `XP ${cur} / ${max}`;
}

export function setLevel(level) {
  document.getElementById('char-name').textContent = `모험가 (Lv.${level})`;
}

export function setGold(gold) {
  document.getElementById('gold-amount').textContent = gold.toLocaleString();
  const inv = document.getElementById('inv-gold');
  if (inv) inv.textContent = `${gold.toLocaleString()} G`;
}

export function setJellyCount(n) {
  document.getElementById('jelly-count').textContent = n;
  const inv = document.getElementById('inv-jelly-count');
  if (inv) inv.textContent = `x ${n}`;
}

export function flashLevelUp(level) {
  const el = document.getElementById('levelup');
  el.textContent = `LEVEL UP!  Lv.${level}`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

export function toggleInventory() {
  const panel = document.getElementById('inventory');
  panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}
