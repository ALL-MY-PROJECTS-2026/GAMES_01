export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.yaw = Math.PI;
    this.zoomDelta = 0;

    this.attackQueued = false;
    this.attackQueuedT = 0;
    this.interactQueued = false;

    const queueAttack = () => {
      this.attackQueued = true;
      this.attackQueuedT = performance.now();
    };
    this.queueAttack = queueAttack;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyF') queueAttack();
      if (e.code === 'KeyE') this.interactQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

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
