export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0.35;
    this.zoomDelta = 0;

    this.attackQueued = false;
    this.attackQueuedT = 0;
    this.interactQueued = false;

    const queueAttack = () => {
      this.attackQueued = true;
      this.attackQueuedT = performance.now();
    };
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyF') queueAttack();
      if (e.code === 'KeyE') this.interactQueued = true;
    });
    window.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement === canvas && e.button === 0) queueAttack();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => canvas.requestPointerLock());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.yaw -= e.movementX * 0.0025;
      this.pitch = Math.max(0.05, Math.min(1.2, this.pitch + e.movementY * 0.0025));
    });
    window.addEventListener('wheel', (e) => {
      this.zoomDelta += Math.sign(e.deltaY);
    });
  }

  pressed(code) {
    return this.keys.has(code);
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
}
