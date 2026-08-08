import { stats, save } from './stats.js';

// 장(章) 진행 — SCENARIO.md §4를 그대로 옮긴 선형 진행이다.
//
// 별도의 퀘스트 시스템을 만들지 않았다. 필요한 동사(사냥·봉인·봉헌·보스)가 이미
// 게임에 있으므로, 그것들이 몇 번 일어났는지 세기만 하면 장이 닫힌다.
//
// kind별로 무엇을 세는지:
//   kill  — types에 든 몬스터를 처치한 횟수
//   seal  — 귀문 균열을 봉인한 횟수
//   offer — 결계석에 바친 혼백 개수
export const CHAPTERS = {
  1: {
    zone: 'grassland',
    title: '1장 · 귀곡의 초원',
    done: '결계석이 되살아났다. 초원의 귀문이 닫혔다.',
    steps: [
      {
        id: 'hunt', kind: 'kill', goal: 10,
        types: ['slime', 'wisp', 'frostWisp', 'hexGhost'],
        text: '떠도는 원귀를 정화한다',
        hint: '청운: 원귀부터 걷어내게. 혼백이 남을 걸세.'
      },
      {
        id: 'seal', kind: 'seal', goal: 2,
        text: '귀문 균열을 봉인한다',
        hint: '청운: 구멍을 막지 않으면 아무리 베어도 끝이 없네. 혼백을 바쳐 봉하게.'
      },
      {
        id: 'ward', kind: 'offer', goal: 20,
        text: '결계석에 혼백을 바친다',
        hint: '청운: 도깨비 무리 한복판에 결계석이 있네. 혼백 스물이면 다시 타오를 걸세.'
      },
      {
        id: 'boss', kind: 'kill', goal: 1, types: ['boss'],
        text: '왕도깨비를 물리친다',
        hint: '청운: 마지막은 저 큰 놈이야. 조심하게.'
      }
    ]
  }
};

const FIRST = { chapter: 1, step: 0, progress: 0 };

function state() {
  if (!stats.quest) stats.quest = { ...FIRST };
  return stats.quest;
}

/** 지금 해야 할 단계 — 장을 다 끝냈으면 null */
export function currentStep() {
  const q = state();
  const ch = CHAPTERS[q.chapter];
  if (!ch) return null;
  return ch.steps[q.step] || null;
}

export function currentChapter() {
  return CHAPTERS[state().chapter] || null;
}

export function questProgress() {
  const q = state();
  const step = currentStep();
  return { chapter: q.chapter, stepIndex: q.step, progress: q.progress, step };
}

/** 이 장을 끝냈는가 */
export function isChapterDone(n) {
  const q = state();
  return q.chapter > n;
}

/**
 * 진행도를 올린다. 단계가 넘어가거나 장이 끝나면 알려준다.
 * 돌려주는 값: null(변화 없음) | { advanced, step, chapterDone }
 */
function bump(kind, amount, typeKey) {
  const q = state();
  const step = currentStep();
  if (!step || step.kind !== kind) return null;
  if (kind === 'kill' && step.types && !step.types.includes(typeKey)) return null;

  q.progress += amount;
  if (q.progress < step.goal) {
    save();
    return { advanced: false, step };
  }

  // 단계 완료 — 다음으로 넘긴다
  const ch = CHAPTERS[q.chapter];
  q.step += 1;
  q.progress = 0;
  const chapterDone = q.step >= ch.steps.length;
  if (chapterDone) q.chapter += 1;
  save();
  return { advanced: true, step, chapterDone, nextStep: currentStep() };
}

export function onKillFor(typeKey) {
  return bump('kill', 1, typeKey);
}

export function onSeal() {
  return bump('seal', 1);
}

/** 결계석 봉헌 — 몇 개까지 받을 수 있는지 먼저 물어보고 그만큼만 바친다 */
export function offerNeeded() {
  const step = currentStep();
  if (!step || step.kind !== 'offer') return 0;
  return Math.max(0, step.goal - state().progress);
}

export function onOffer(n) {
  return bump('offer', n);
}
