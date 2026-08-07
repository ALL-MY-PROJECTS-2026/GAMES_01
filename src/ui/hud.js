const WEAPON_SLOTS = { punch: 2, sword: 3, gun: 4 };

let playerName = '이림';

export function setPlayerIdentity(cfg) {
  playerName = cfg.name;
  const p = document.getElementById('pportrait');
  p.className = 'portrait ' + cfg.portraitClass;
  p.textContent = cfg.letter;
}

export function setPartyInfo(idx, cfg) {
  const nameEl = document.getElementById(`comp${idx}-name`);
  const p = document.getElementById(`comp${idx}-portrait`);
  if (!nameEl || !p) return;
  nameEl.innerHTML = `<b>${cfg.name}</b> — ${cfg.role}`;
  p.className = 'portrait ' + cfg.portraitClass;
  p.textContent = cfg.letter;
}

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
  s1.innerHTML = `<span>1</span><div class="slot-icon">🔮</div><div class="slot-count" id="jelly-count">0</div>`;
  s1.title = '혼백 (HP +15)';

  const weapons = [
    [2, '👊', '권법 — 5단 연계 콤보 (잽·잽·훅·어퍼·붕권)'],
    [3, '🗡️', '퇴마검 — 넓은 범위, 강한 넉백'],
    [4, '🧧', '부적 — 원거리 연사']
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

export function setWeaponUpgrade(key, level) {
  const idx = WEAPON_SLOTS[key];
  if (!idx) return;
  const slot = document.getElementById(`slot-${idx}`);
  let badge = slot.querySelector('.slot-plus');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'slot-plus';
    slot.appendChild(badge);
  }
  badge.textContent = level > 0 ? `+${level}` : '';
}

export function setHP(cur, max) {
  document.getElementById('hpfill').style.width = `${(cur / max) * 100}%`;
  document.getElementById('hptxt').textContent = `HP ${cur} / ${max}`;
}

export function setMP(cur, max) {
  const el = document.getElementById('mpfill');
  if (!el) return;
  el.style.width = `${(cur / max) * 100}%`;
  document.getElementById('mptxt').textContent = `MP ${cur} / ${max}`;
}

export function setPartyHP(idx, cur, max) {
  const fill = document.getElementById(`comp${idx}-hp`);
  const txt = document.getElementById(`comp${idx}-txt`);
  if (!fill) return;
  fill.style.width = `${Math.max(0, (cur / max) * 100)}%`;
  txt.textContent = cur > 0 ? `${Math.ceil(cur)} / ${max}` : '기절';
}

export function setXP(cur, max) {
  document.getElementById('xpfill').style.width = `${Math.min(100, (cur / max) * 100)}%`;
  document.getElementById('xptxt').textContent = `XP ${cur} / ${max}`;
}

export function setLevel(level) {
  document.getElementById('char-name').innerHTML = `<b>${playerName}</b> (Lv.${level})`;
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

export function setSkillPoints(n) {
  const el = document.getElementById('skill-pts');
  if (!el) return;
  el.textContent = n > 0 ? `(+${n})` : '';
}

export function flashLevelUp(level) {
  const el = document.getElementById('levelup');
  el.innerHTML = `LEVEL UP!  Lv.${level}<div class="lvup-sub">스킬 포인트 +1 — K 키로 배분</div>`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

let comboHideT = null;

export function showCombo(n, finisher = false) {
  const el = document.getElementById('combo');
  if (!el) return;
  el.textContent = finisher ? `${n}연격 붕권!` : `${n}연격`;
  el.classList.toggle('finisher', finisher);
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  el.style.display = 'block';
  if (comboHideT) clearTimeout(comboHideT);
  comboHideT = setTimeout(() => { el.style.display = 'none'; }, 1200);
}

export function toggleInventory() {
  const panel = document.getElementById('inventory');
  panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}
