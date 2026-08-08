// 터치 조작 (STACK.md §5) — 왼손은 이동, 오른손은 행동과 시점.
//
// 라이브러리를 쓰지 않았다. 조이스틱 하나와 버튼 몇 개는 PointerEvent로 충분하고,
// nipplejs를 넣으면 번들만 늘고 우리 HUD 톤과도 어긋난다.
//
// 화면을 좌우로 갈라 쓴다:
//   왼쪽 절반 — 누른 자리에 조이스틱이 생긴다 (고정 위치가 아니라 엄지가 닿는 곳에)
//   오른쪽 절반 — 빈 곳을 끌면 시점이 돈다. 버튼 위에서 시작한 터치는 버튼이 가져간다
//   두 손가락 — 벌리고 오므려 줌

const JOY_RADIUS = 62;      // 조이스틱이 최대로 기울어지는 거리(px)
const DRAG_TO_YAW = 0.006;  // 끈 거리(px)를 회전으로 바꾸는 비율

export function initTouchControls(input, { onAttack, onSpell, onDodge, onInteract }) {
  const layer = document.getElementById('touch');
  if (!layer) return null;
  layer.style.display = 'block';
  document.body.classList.add('touch-mode');

  const stick = document.getElementById('touch-stick');
  const knob = document.getElementById('touch-knob');

  let moveId = null;        // 이동을 맡은 손가락
  let lookId = null;        // 시점을 맡은 손가락
  let lookX = 0;
  let lookY = 0;
  const pinch = new Map();  // 줌을 재려면 손가락 두 개의 위치를 들고 있어야 한다
  let pinchDist = 0;

  const setStick = (cx, cy, dx, dy) => {
    stick.style.left = `${cx}px`;
    stick.style.top = `${cy}px`;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const startMove = (e) => {
    moveId = e.pointerId;
    stick.style.display = 'block';
    setStick(e.clientX, e.clientY, 0, 0);
    input.axis.x = 0;
    input.axis.y = 0;
    stick.dataset.cx = e.clientX;
    stick.dataset.cy = e.clientY;
  };

  const dragMove = (e) => {
    const cx = Number(stick.dataset.cx);
    const cy = Number(stick.dataset.cy);
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    setStick(cx, cy, dx, dy);
    // 화면 위쪽이 앞이다 — 화면 y는 아래로 커지므로 부호를 뒤집는다
    input.axis.x = dx / JOY_RADIUS;
    input.axis.y = -dy / JOY_RADIUS;
  };

  const endMove = () => {
    moveId = null;
    stick.style.display = 'none';
    input.axis.x = 0;
    input.axis.y = 0;
  };

  layer.addEventListener('pointerdown', (e) => {
    layer.setPointerCapture(e.pointerId);
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.size === 2) {
      const [a, b] = [...pinch.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    if (e.clientX < window.innerWidth * 0.5) {
      if (moveId === null) startMove(e);
    } else if (lookId === null) {
      lookId = e.pointerId;
      lookX = e.clientX;
      lookY = e.clientY;
    }
  });

  layer.addEventListener('pointermove', (e) => {
    if (pinch.has(e.pointerId)) pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // 두 손가락이면 벌린 거리 변화가 곧 줌이다
    if (pinch.size === 2) {
      const [a, b] = [...pinch.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) input.zoomDelta += (pinchDist - d) * 0.02;
      pinchDist = d;
      return;
    }
    if (e.pointerId === moveId) dragMove(e);
    else if (e.pointerId === lookId) {
      input.yaw -= (e.clientX - lookX) * DRAG_TO_YAW;
      lookX = e.clientX;
      lookY = e.clientY;
    }
  });

  const release = (e) => {
    pinch.delete(e.pointerId);
    if (pinch.size < 2) pinchDist = 0;
    if (e.pointerId === moveId) endMove();
    if (e.pointerId === lookId) lookId = null;
  };
  layer.addEventListener('pointerup', release);
  layer.addEventListener('pointercancel', release);

  // ── 버튼 ────────────────────────────────────────────────────
  // 누르는 순간 반응해야 한다. click은 터치에서 한 박자 늦다
  const tap = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('on');
      fn();
    });
    const off = () => el.classList.remove('on');
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  };

  // 눌러 두는 버튼 (방어) — 떼면 풀린다
  const hold = (id, code) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('on'); input.setHeld(code, true); };
    const off = () => { el.classList.remove('on'); input.setHeld(code, false); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  };

  tap('tb-attack', onAttack);
  tap('tb-spell', onSpell);
  tap('tb-dodge', onDodge);
  tap('tb-interact', onInteract);
  hold('tb-block', 'KeyC');

  return {
    /** 상호작용 버튼은 쓸 데가 있을 때만 보여 준다 */
    setInteractVisible(on) {
      const el = document.getElementById('tb-interact');
      if (el) el.classList.toggle('hidden', !on);
    }
  };
}
