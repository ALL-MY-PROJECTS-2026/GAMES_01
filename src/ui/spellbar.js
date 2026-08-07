import { SPELLS, SPELL_ORDER, SPELL_CLASSES, spellsOf } from '../core/spells.js';

// 하단 마법창 — 클릭해서 술법을 고르고, 우클릭으로 시전한다
let selected = SPELL_ORDER[0];
let onChange = null;

export function initSpellBar(handler) {
  onChange = handler;
  const bar = document.getElementById('spellbar');
  if (!bar) return;
  bar.innerHTML = '';
  // 계열별로 줄을 나눈다 — 나중에 캐릭터를 분리하면 해당 줄만 남기면 된다
  for (const [cls, meta] of Object.entries(SPELL_CLASSES)) {
    const keys = spellsOf(cls);
    if (!keys.length) continue;
    const row = document.createElement('div');
    row.className = 'spell-row';
    const tag = document.createElement('div');
    tag.className = 'spell-tag';
    tag.textContent = meta.name;
    tag.style.color = meta.color;
    row.appendChild(tag);
    for (const key of keys) {
      const sp = SPELLS[key];
      const i = SPELL_ORDER.indexOf(key);
      const el = document.createElement('div');
      el.className = 'spell' + (key === selected ? ' active' : '');
      el.dataset.spell = key;
      el.style.setProperty('--spell-color', sp.color);
      el.title = `${sp.name} — ${sp.desc} (기력 ${sp.cost} · 재사용 ${sp.cd}초)`;
      el.innerHTML = `
        <span class="spell-key">${i < 12 ? 'F' + (i + 1) : ''}</span>
        <div class="spell-icon">${sp.icon}</div>
        <div class="spell-name">${sp.name}</div>
        <div class="spell-cd"></div>`;
      el.addEventListener('click', () => selectSpell(key));
      row.appendChild(el);
    }
    bar.appendChild(row);
  }
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
