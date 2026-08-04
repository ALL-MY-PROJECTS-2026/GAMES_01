import { MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';
import { WORLD_HALF } from './ground.js';

const SPEED = 42;
const LIFE = 0.9;

export class ProjectileManager {
  constructor(scene, obstacles) {
    this.scene = scene;
    this.obstacles = obstacles;
    this.list = [];
    this.mat = new StandardMaterial('bulletMat', scene);
    this.mat.emissiveColor = Color3.FromHexString('#ffd666');
    this.mat.disableLighting = true;
  }

  spawn(origin, dir, damage, knock) {
    const mesh = MeshBuilder.CreateSphere('bullet', { diameter: 0.18, segments: 6 }, this.scene);
    mesh.material = this.mat;
    mesh.applyFog = false;
    mesh.position.copyFrom(origin);
    mesh.scaling.set(1, 1, 2.6);
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    this.list.push({
      mesh,
      vx: dir.x * SPEED,
      vz: dir.z * SPEED,
      dirN: { x: dir.x, z: dir.z },
      life: LIFE,
      damage,
      knock
    });
  }

  _remove(i) {
    this.list[i].mesh.dispose();
    this.list.splice(i, 1);
  }

  update(delta, monsters, onHit) {
    outer: for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= delta;
      const pos = p.mesh.position;
      pos.x += p.vx * delta;
      pos.z += p.vz * delta;

      if (p.life <= 0 || Math.abs(pos.x) > WORLD_HALF + 4 || Math.abs(pos.z) > WORLD_HALF + 4) {
        this._remove(i);
        continue;
      }

      for (const m of monsters) {
        if (m.dead) continue;
        const dx = pos.x - m.group.position.x;
        const dz = pos.z - m.group.position.z;
        if (dx * dx + dz * dz < 0.72 * 0.72 && pos.y < 1.6) {
          const killed = m.takeDamage(p.damage, p.dirN, p.knock);
          if (onHit) onHit(m, killed);
          this._remove(i);
          continue outer;
        }
      }

      for (const o of this.obstacles) {
        const dx = pos.x - o.x;
        const dz = pos.z - o.z;
        if (dx * dx + dz * dz < o.r * o.r && pos.y < (o.h || 99)) {
          this._remove(i);
          continue outer;
        }
      }
    }
  }
}
