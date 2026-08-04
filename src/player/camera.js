import { FreeCamera, Vector3 } from '@babylonjs/core';

const BASE_FOV = 0.9;
const PITCH = 0.95;
const ROTATE_SPEED = 1.8;

export class ThirdPersonCamera {
  constructor(scene) {
    this.cam = new FreeCamera('mainCam', new Vector3(0, 12, 9), scene);
    this.cam.minZ = 0.1;
    this.cam.maxZ = 500;
    this.cam.fov = BASE_FOV;

    this.dist = 14;
    this.curDist = 14;
    this.obstacles = [];
    this.smoothTarget = new Vector3(0, 1.2, 0);

    this._fwd = new Vector3(0, 0, -1);
    this._dir = new Vector3(0, 0, 0);
    this._pos = new Vector3(0, 0, 0);
  }

  setObstacles(list) {
    this.obstacles = list;
  }

  flatForward() {
    this._fwd.copyFrom(this.smoothTarget).subtractInPlace(this.cam.position);
    this._fwd.y = 0;
    if (this._fwd.lengthSquared() < 1e-6) this._fwd.copyFromFloats(0, 0, -1);
    return this._fwd.normalize();
  }

  update(delta, input, player, extraFov = 0) {
    this.dist = Math.max(8, Math.min(22, this.dist + input.consumeZoom() * 1.2));

    if (input.pressed('KeyQ')) input.yaw += ROTATE_SPEED * delta;
    if (input.pressed('KeyE')) input.yaw -= ROTATE_SPEED * delta;

    const p = player.group.position;
    const k = 1 - Math.exp(-14 * delta);
    this.smoothTarget.x += (p.x - this.smoothTarget.x) * k;
    this.smoothTarget.y += (p.y + 1.2 - this.smoothTarget.y) * k;
    this.smoothTarget.z += (p.z - this.smoothTarget.z) * k;

    const yaw = input.yaw;
    const dir = this._dir.copyFromFloats(
      Math.sin(yaw) * Math.cos(PITCH),
      Math.sin(PITCH),
      Math.cos(yaw) * Math.cos(PITCH)
    );

    this.curDist += (this.dist - this.curDist) * (1 - Math.exp(-10 * delta));

    this._pos.copyFrom(dir).scaleInPlace(this.curDist).addInPlace(this.smoothTarget);
    this.cam.position.copyFrom(this._pos);
    this.cam.setTarget(this.smoothTarget);

    const targetFov = BASE_FOV + extraFov;
    if (Math.abs(this.cam.fov - targetFov) > 0.001) {
      this.cam.fov += (targetFov - this.cam.fov) * Math.min(1, delta * 6);
    }
  }
}
