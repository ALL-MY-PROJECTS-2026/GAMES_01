import { CHARACTERS } from '../core/characters.js';
import { load } from '../core/stats.js';

export function showCharSelect() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('charselect');
    const box = document.getElementById('charselect-cards');
    const saved = (load() || {}).charKey;
    box.innerHTML = '';
    for (const c of Object.values(CHARACTERS)) {
      const card = document.createElement('div');
      card.className = 'char-card' + (saved === c.key ? ' last-pick' : '');
      card.innerHTML = `
        <div class="portrait ${c.portraitClass}">${c.letter}</div>
        <div class="cc-name">${c.name}</div>
        <div class="cc-role">${c.role}</div>
        <div class="cc-desc">${c.desc}</div>
        ${saved === c.key ? '<div class="cc-last">지난 여정</div>' : ''}`;
      card.addEventListener('click', () => {
        overlay.style.display = 'none';
        resolve(c.key);
      });
      box.appendChild(card);
    }
    overlay.style.display = 'flex';
  });
}
