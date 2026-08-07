import { SKILL_TREES } from '../core/skills.js';
import {
  stats, learnSkill, investStat, ATTR_DEFS, ATTR_MAX, exportSave, importSave
} from '../core/stats.js';

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

  // 캐릭터 정보를 파일로 주고받는다 — 다른 컴퓨터/브라우저로 옮길 때
  const msg = document.getElementById('save-msg');
  const file = document.getElementById('save-file');
  const say = (text) => { if (msg) msg.textContent = text; };

  document.getElementById('save-export').addEventListener('click', () => {
    say(exportSave() ? '저장 파일을 내려받았습니다.' : '저장할 정보가 없습니다.');
  });

  document.getElementById('save-import').addEventListener('click', () => file.click());

  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    const res = await importSave(f);
    if (!res.ok) {
      const why = {
        parse: '파일을 읽을 수 없습니다 (형식 오류)',
        format: '이 게임의 저장 파일이 아닙니다',
        version: '더 새로운 버전의 저장 파일입니다',
        storage: '브라우저 저장소에 쓸 수 없습니다',
        read: '파일을 여는 데 실패했습니다'
      };
      say(why[res.reason] || '불러오지 못했습니다');
      return;
    }
    // 화면에 떠 있는 값과 어긋나지 않도록 새로고침해서 통째로 다시 읽는다
    say(`Lv.${res.level} 캐릭터를 불러왔습니다. 곧 새로고침합니다...`);
    setTimeout(() => window.location.reload(), 900);
  });
}
