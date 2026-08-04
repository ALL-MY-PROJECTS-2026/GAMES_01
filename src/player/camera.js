import { FreeCamera, Vector3 } from '@babylonjs/core';

const BASE_FOV = 1.08;

export class ThirdPersonCamera {
  constructor(scene) {
    this.cam = new FreeCamera('mainCam', new Vector3(0, 3.5, 6), scene);
    this.cam.minZ = 0.1;
    this.cam.maxZ = 500;
    this.cam.fov = BASE_FOV;

    this.dist = 6;
    this.curDist = 6;
    this.obstacles = [];
    this.smoothTarget = new Vector3(0, 1.6, 0);

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
    this.dist = Math.max(3, Math.min(12, this.dist + input.consumeZoom() * 0.8));

    const p = player.group.position;
    const k = 1 - Math.exp(-20 * delta);
    this.smoothTarget.x += (p.x - this.smoothTarget.x) * k;
    this.smoothTarget.y += (p.y + 1.6 - this.smoothTarget.y) * k;
    this.smoothTarget.z += (p.z - this.smoothTarget.z) * k;

    const { yaw, pitch } = input;
    const dir = this._dir.copyFromFloats(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    );

    let allowed = this.dist;
    const ox = this.smoothTarget.x;
    const oy = this.smoothTarget.y;
    const oz = this.smoothTarget.z;
    const dx = dir.x * this.dist;
    const dy = dir.y * this.dist;
    const dz = dir.z * this.dist;
    const a = dx * dx + dz * dz;
    if (a > 1e-8) {
      for (const o of this.obstacles) {
        const cx = o.x - ox;
        const cz = o.z - oz;
        const dc = dx * cx + dz * cz;
        if (dc <= 0) continue;
        const rr = o.r + 0.3;
        const disc = dc * dc - a * (cx * cx + cz * cz - rr * rr);
        if (disc <= 0) continue;
        const t = (dc - Math.sqrt(disc)) / a;
        if (t > 0.04 && t < 1) {
          const yAt = oy + dy * t;
          if (yAt < (o.h || 99)) allowed = Math.min(allowed, t * this.dist);
        }
      }
    }

    if (allowed < this.curDist) this.curDist = allowed;
    else this.curDist += (allowed - this.curDist) * (1 - Math.exp(-8 * delta));

    this._pos.copyFrom(dir).scaleInPlace(this.curDist).addInPlace(this.smoothTarget);
    if (this._pos.y < 0.4) this._pos.y = 0.4;
    this.cam.position.copyFrom(this._pos);
    this.cam.setTarget(this.smoothTarget);

    const targetFov = BASE_FOV + extraFov;
    if (Math.abs(this.cam.fov - targetFov) > 0.001) {
      this.cam.fov += (targetFov - this.cam.fov) * Math.min(1, delta * 6);
    }
  }
}
