import { SPELLS, SPELL_ORDER } from '../core/spells.js';

// 하단 마법창 — 클릭해서 술법을 고르고, 우클릭으로 시전한다
let selected = SPELL_ORDER[0];
let onChange = null;

export function initSpellBar(handler) {
  onChange = handler;
  const bar = document.getElementById('spellbar');
  if (!bar) return;
  bar.innerHTML = '';
  SPELL_ORDER.forEach((key, i) => {
    const s = SPELLS[key];
    const el = document.createElement('div');
    el.className = 'spell' + (key === selected ? ' active' : '');
    el.dataset.spell = key;
    el.title = `${s.name} — ${s.desc} (기력 ${s.cost})`;
    el.innerHTML = `
      <span class="spell-key">F${i + 1}</span>
      <div class="spell-icon">${s.icon}</div>
      <div class="spell-name">${s.name}</div>
      <div class="spell-cd"></div>`;
    el.addEventListener('click', () => selectSpell(key));
    bar.appendChild(el);
  });
}

export function selectSpell(key) {
  if (!SPELLS[key]) return;
  selected = key;
  document.querySelectorAll('#spellbar .spell').forEach((el) => {
    el.classList.toggle('active', el.dataset.spell === key);
  });
  if (onChange) onChange(key);
}

export function selectSpellByIndex(i) {
  if (SPELL_ORDER[i]) selectSpell(SPELL_ORDER[i]);
}

export function getSelectedSpell() {
  return SPELLS[selected];
}

// 쿨다운 오버레이 갱신 (0~1)
export function setSpellCooldown(key, ratio) {
  const el = document.querySelector(`#spellbar .spell[data-spell="${key}"] .spell-cd`);
  if (el) el.style.height = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
}

// 기력이 모자란 술법은 흐리게
export function setSpellAffordable(key, ok) {
  const el = document.querySelector(`#spellbar .spell[data-spell="${key}"]`);
  if (el) el.classList.toggle('poor', !ok);
}
