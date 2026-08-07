import { SKILL_TREES } from '../core/skills.js';
import { stats, learnSkill, investStat, ATTR_DEFS, ATTR_MAX } from '../core/stats.js';

let open = false;

function panel() {
  return document.getElementById('skillwin');
}

export function isSkillsOpen() {
  return open;
}

export function openSkills() {
  open = true;
  panel().style.display = 'block';
  renderSkills();
}

export function closeSkills() {
  open = false;
  panel().style.display = 'none';
}

export function toggleSkills() {
  if (open) closeSkills();
  else openSkills();
}

export function renderSkills() {
  document.getElementById('skill-points').textContent =
    `스탯 포인트 ${stats.statPoints} · 스킬 포인트 ${stats.skillPoints}`;
  const box = document.getElementById('skill-trees');
  box.innerHTML = '';

  // 스탯 배분 섹션 (레벨업당 +3)
  const shead = document.createElement('div');
  shead.className = 'skill-tree-head';
  shead.textContent = '📊 스탯';
  box.appendChild(shead);
  for (const a of ATTR_DEFS) {
    const v = stats.attrs[a.key] || 0;
    const row = document.createElement('div');
    row.className = 'skill-row';
    row.innerHTML = `
      <div class="skill-info">
        <span class="skill-icon">${a.icon}</span>
        <span class="skill-name">${a.name} <b class="skill-pips">${v}</b></span>
        <span class="skill-desc">${a.info}</span>
      </div>
      <div class="skill-action">
        ${v >= ATTR_MAX
          ? '<span class="skill-max">MAX</span>'
          : `<button class="skill-btn" data-attr="${a.key}" ${stats.statPoints > 0 ? '' : 'disabled'}>+1</button>`}
      </div>`;
    box.appendChild(row);
  }

  for (const [treeKey, tree] of Object.entries(SKILL_TREES)) {
    const head = document.createElement('div');
    head.className = 'skill-tree-head';
    head.textContent = `${tree.icon} ${tree.name}`;
    box.appendChild(head);
    for (const s of tree.skills) {
      const lvl = stats.skills[s.key] || 0;
      const pips = '●'.repeat(lvl) + '○'.repeat(s.max - lvl);
      const row = document.createElement('div');
      row.className = 'skill-row';
      row.innerHTML = `
        <div class="skill-info">
          <span class="skill-icon">${s.icon}</span>
          <span class="skill-name">${s.name} <b class="skill-pips">${pips}</b></span>
          <span class="skill-desc">${s.info}</span>
        </div>
        <div class="skill-action">
          ${lvl >= s.max
            ? '<span class="skill-max">MAX</span>'
            : `<button class="skill-btn" data-skill="${s.key}" ${stats.skillPoints > 0 ? '' : 'disabled'}>배우기</button>`}
        </div>`;
      box.appendChild(row);
    }
  }
  box.querySelectorAll('.skill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.attr) investStat(btn.dataset.attr);
      else learnSkill(btn.dataset.skill);
      renderSkills();
    });
  });
}

export function initSkills() {
  document.getElementById('skill-close').addEventListener('click', closeSkills);
}
