// 로딩 화면 진행률 (STACK.md §14)
let done = 0;
let total = 1;

export function setLoadingTotal(n) {
  total = Math.max(1, n);
  done = 0;
  render('준비하는 중…');
}

export function loadingStep(label) {
  done = Math.min(total, done + 1);
  render(label);
}

function render(label) {
  const fill = document.getElementById('load-fill');
  const status = document.getElementById('load-status');
  if (fill) fill.style.width = `${Math.round((done / total) * 100)}%`;
  if (status && label) status.textContent = label;
}

export function finishLoading() {
  done = total;
  render('시작합니다');
  const el = document.getElementById('loading');
  if (!el) return;
  el.classList.add('done');
  setTimeout(() => el.remove(), 500);
}
