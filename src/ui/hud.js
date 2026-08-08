import { WEAPONS } from '../player/weapons.js';

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

// 무기는 숫자키로 바꾸지 않는다 — 소지품(I)에서 눌러 장착한다.
// 퀵바에는 혼백과 '지금 든 무기' 한 칸만 남긴다.
export const WEAPON_HINT = {
  punch: '5단 연계 콤보 (잽·잽·훅·어퍼·붕권)',
  sword: '2단 연계 (찌르기 → 가로베기)',
  gun: '화살 원거리 사격',
  dagger: '짧고 빠르다',
  axe: '무겁게 밀어낸다',
  greatsword: '두 손 연계 (내려찍기 → 휘돌려베기)',
  staff: '술법 피해 +30%',
  twinKnife: '3단 쌍수 연계 — 가장 촘촘하다',
  throwStar: '던지는 무기 — 석궁보다 짧고 빠르다',
  battleAxe: '가장 무거운 한 방 — 두 손 연계'
};

export function initHUD() {
  const bar = document.getElementById('quickbar');
  bar.innerHTML = `
    <div class="slot" id="slot-1" title="혼백 (HP +15)">
      <span>1</span><div class="slot-icon">🔮</div>
      <div class="slot-count" id="jelly-count">0</div>
    </div>
    <div class="slot active" id="slot-weapon">
      <span>무기</span><div class="slot-icon" id="weapon-icon">👊</div>
    </div>`;
}

/** 지금 든 무기를 퀵바에 보여준다 (교체는 소지품에서 한다) */
export function setActiveWeapon(key) {
  const w = WEAPONS[key];
  const icon = document.getElementById('weapon-icon');
  const slot = document.getElementById('slot-weapon');
  if (!w || !icon || !slot) return;
  icon.textContent = w.icon;
  slot.title = `${w.name} — ${WEAPON_HINT[key] || ''} (공격력 ${w.damage}) · I 를 눌러 교체`;
  slot.dataset.weapon = key;
}

/** 강화 표시 — 지금 든 무기의 것만 퀵바에 띄운다 */
export function setWeaponUpgrade(key, level) {
  const slot = document.getElementById('slot-weapon');
  if (!slot || slot.dataset.weapon !== key) return;
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

// 기력(달리기 자원) 바 — 비면 색이 바뀌어 회복 대기를 알린다
export function setStamina(cur, max, exhausted = false) {
  const el = document.getElementById('spfill');
  if (!el) return;
  el.style.width = `${Math.max(0, (cur / max) * 100)}%`;
  el.classList.toggle('empty', exhausted);
  const t = document.getElementById('sptxt');
  if (t) t.textContent = `기력 ${Math.round(cur)} / ${max}`;
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
  el.innerHTML = `LEVEL UP!  Lv.${level}<div class="lvup-sub">스탯 +3 · 스킬 +1 — K 키로 배분</div>`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// 피해 숫자 팝업 (원작처럼 타격 지점에 붉은 숫자)
export function showDamage(screenX, screenY, amount, crit = false) {
  const layer = document.getElementById('dmg-layer');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'dmgnum' + (crit ? ' crit' : '');
  el.textContent = amount;
  el.style.left = `${screenX}px`;
  el.style.top = `${screenY}px`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

// 보스 HP바 — 근처에 살아있는 보스가 있을 때만 표시
export function setBossBar(boss) {
  const el = document.getElementById('bossbar');
  if (!el) return;
  if (!boss) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  document.getElementById('boss-name').firstChild.textContent = `${boss.displayName || boss.cfg.name} `;
  document.getElementById('boss-hp').style.width =
    `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
  document.getElementById('boss-hptxt').textContent =
    `${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp}`;
}

// 아이템 획득 알림 — 화면 우하단에 쌓였다 사라진다
export function showPickup(item, amount) {
  const layer = document.getElementById('pickup-layer');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'pickup';
  el.innerHTML = `<span class="pk-icon">${item.icon}</span>${item.name} <b>+${amount}</b>`;
  el.style.borderLeftColor = item.color;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2200);
  while (layer.children.length > 5) layer.removeChild(layer.firstChild);
}

/** 획득 알림 자리에 띄우는 짧은 안내 (무기 해금 등) */
export function showToast(text, color = '#ffd666') {
  const layer = document.getElementById('pickup-layer');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'pickup';
  el.textContent = text;
  el.style.borderLeftColor = color;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 3000);
  while (layer.children.length > 5) layer.removeChild(layer.firstChild);
}

/** 장 진행 추적기 — 지금 무엇을 해야 하는지 늘 띄워 둔다 */
export function setQuest(info) {
  const el = document.getElementById('quest');
  if (!el) return;
  if (!info || !info.step) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  const { chapter, step, progress } = info;
  document.getElementById('quest-chapter').textContent = chapter.title;
  document.getElementById('quest-step').textContent = step.text;
  document.getElementById('quest-fill').style.width =
    `${Math.min(100, (progress / step.goal) * 100)}%`;
  document.getElementById('quest-count').textContent = `${progress} / ${step.goal}`;
  document.getElementById('quest-hint').textContent = step.hint || '';
}

export function setAutoHunt(on) {
  const el = document.getElementById('autohunt');
  if (el) el.classList.toggle('on', on);
}

export function flashHurt() {
  const el = document.getElementById('hitflash');
  if (!el) return;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

let comboHideT = null;

export function showCombo(n, finisher = false, finisherName = '붕권') {
  const el = document.getElementById('combo');
  if (!el) return;
  el.textContent = finisher ? `${n}연격 ${finisherName}!` : `${n}연격`;
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
