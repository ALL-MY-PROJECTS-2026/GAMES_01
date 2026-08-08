// 키보드/마우스와 터치를 같은 창구로 모은다.
// 게임 로직은 어느 쪽에서 들어온 입력인지 알 필요가 없다 — pressed()와 axis만 본다.

/** 터치 기기인가 — 마우스가 없는 환경이면 온스크린 조작을 띄운다 */
export function isTouchDevice() {
  return (typeof window !== 'undefined')
    && (('ontouchstart' in window) || navigator.maxTouchPoints > 0)
    && window.matchMedia('(pointer: coarse)').matches;
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.yaw = Math.PI;
    this.zoomDelta = 0;

    this.attackQueued = false;
    this.attackQueuedT = 0;
    this.interactQueued = false;
    this.dodgeQueued = false;

    // 터치용 아날로그 이동 — x는 오른쪽, y는 앞쪽 (-1~1)
    this.axis = { x: 0, y: 0 };
    // 터치로 눌러 두는 상태 (달리기·방어). 키보드의 pressed()와 합쳐서 본다
    this.held = new Set();
    this.touch = false;

    const queueAttack = () => {
      this.attackQueued = true;
      this.attackQueuedT = performance.now();
    };
    this.queueAttack = queueAttack;
    this.queueInteract = () => { this.interactQueued = true; };
    this.queueDodge = () => { this.dodgeQueued = true; };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.keys.has('Space')) this.dodgeQueued = true;
      this.keys.add(e.code);
      if (e.code === 'KeyF') queueAttack();
      if (e.code === 'KeyE') this.interactQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.held.clear(); });

    window.addEventListener('wheel', (e) => {
      this.zoomDelta += Math.sign(e.deltaY);
    });
  }

  /** 키보드로 눌렸거나 터치 버튼으로 눌러 두었거나 */
  pressed(code) {
    return this.keys.has(code) || this.held.has(code);
  }

  /** 터치 버튼을 눌러 두는 상태로 만든다 (달리기·방어) */
  setHeld(code, on) {
    if (on) this.held.add(code);
    else this.held.delete(code);
  }

  /**
   * 이동 입력을 하나로 합쳐 돌려준다.
   * WASD는 켜고 끄는 값이라 길이가 1이고, 조이스틱은 기울인 만큼 0~1이다.
   */
  moveAxis() {
    let x = this.axis.x;
    let y = this.axis.y;
    if (this.pressed('KeyW')) y += 1;
    if (this.pressed('KeyS')) y -= 1;
    if (this.pressed('KeyD')) x += 1;
    if (this.pressed('KeyA')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, len: Math.min(1, len) };
  }

  consumeZoom() {
    const z = this.zoomDelta;
    this.zoomDelta = 0;
    return z;
  }

  consumeAttack() {
    const fresh = this.attackQueued && performance.now() - this.attackQueuedT < 450;
    this.attackQueued = false;
    return fresh;
  }

  consumeInteract() {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }

  consumeDodge() {
    const v = this.dodgeQueued;
    this.dodgeQueued = false;
    return v;
  }
}
