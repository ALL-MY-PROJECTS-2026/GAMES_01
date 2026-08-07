import { MeshBuilder, StandardMaterial, Color3, Mesh } from '@babylonjs/core';
import { WORLD_HALF } from './ground.js';

const SPEED = 42;
const LIFE = 0.9;

export class ProjectileManager {
  constructor(scene, obstacles) {
    this.scene = scene;
    this.obstacles = obstacles;
    this.list = [];
    this.mats = {};
    this.arrowTemplate = null;
  }

  // 화살 원본을 한 번만 만들고 이후에는 복제해서 쓴다 (로컬 +Z가 진행 방향)
  _arrowTemplate() {
    if (this.arrowTemplate) return this.arrowTemplate;
    const scene = this.scene;
    const shaftMat = new StandardMaterial('arrowShaft', scene);
    shaftMat.diffuseColor = Color3.FromHexString('#8a6a42');
    shaftMat.specularColor = new Color3(0, 0, 0);
    const headMat = new StandardMaterial('arrowHead', scene);
    headMat.diffuseColor = Color3.FromHexString('#c9d2dc');
    headMat.emissiveColor = Color3.FromHexString('#4a5460');
    headMat.specularColor = new Color3(0, 0, 0);
    const fletchMat = new StandardMaterial('arrowFletch', scene);
    fletchMat.diffuseColor = Color3.FromHexString('#c43a2e');
    fletchMat.specularColor = new Color3(0, 0, 0);

    const shaft = MeshBuilder.CreateCylinder('arrowShaftM', { diameter: 0.045, height: 0.72, tessellation: 6 }, scene);
    shaft.rotation.x = Math.PI / 2;
    shaft.material = shaftMat;
    shaft.bakeCurrentTransformIntoVertices();

    const head = MeshBuilder.CreateCylinder('arrowHeadM', { diameterTop: 0, diameterBottom: 0.11, height: 0.22, tessellation: 6 }, scene);
    head.rotation.x = Math.PI / 2;
    head.position.z = 0.44;
    head.material = headMat;
    head.bakeCurrentTransformIntoVertices();

    const fletch = MeshBuilder.CreateBox('arrowFletchM', { width: 0.015, height: 0.14, depth: 0.2 }, scene);
    fletch.position.z = -0.3;
    fletch.material = fletchMat;
    fletch.bakeCurrentTransformIntoVertices();
    const fletch2 = fletch.clone('arrowFletchM2');
    fletch2.rotation.z = Math.PI / 2;
    fletch2.bakeCurrentTransformIntoVertices();

    const arrow = Mesh.MergeMeshes([shaft, head, fletch, fletch2], true, true, undefined, false, true);
    arrow.name = 'arrowTemplate';
    arrow.isPickable = false;
    arrow.applyFog = false;
    arrow.setEnabled(false);
    this.arrowTemplate = arrow;
    return arrow;
  }

  _mat(color) {
    if (!this.mats[color]) {
      const m = new StandardMaterial('bulletMat' + color, this.scene);
      m.emissiveColor = Color3.FromHexString(color);
      m.disableLighting = true;
      this.mats[color] = m;
    }
    return this.mats[color];
  }

  spawn(origin, dir, damage, knock, color = '#ffd666', kind = 'bolt') {
    let mesh;
    if (kind === 'arrow') {
      mesh = this._arrowTemplate().clone('arrow');
      mesh.setEnabled(true);
      mesh.rotation.y = Math.atan2(dir.x, dir.z);
    } else {
      mesh = MeshBuilder.CreateSphere('bullet', { diameter: 0.18, segments: 6 }, this.scene);
      mesh.material = this._mat(color);
      mesh.scaling.set(1, 1, 2.6);
      mesh.rotation.y = Math.atan2(dir.x, dir.z);
    }
    mesh.applyFog = false;
    mesh.position.copyFrom(origin);
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
