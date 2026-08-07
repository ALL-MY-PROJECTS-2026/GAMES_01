import { MeshBuilder, StandardMaterial, Color3, Mesh, TransformNode } from '@babylonjs/core';
import { WORLD_HALF } from './ground.js';
import { loadKitMesh } from '../player/weapons.js';

const SPEED = 42;
const LIFE = 0.9;

export class ProjectileManager {
  constructor(scene, obstacles) {
    this.scene = scene;
    this.obstacles = obstacles;
    this.list = [];
    this.mats = {};
    this.arrowTemplate = null;
    this.hostile = [];   // 적이 쏜 투사체 — 플레이어를 노린다
    this._loadKitArrow();
  }

  // 적 투사체 (술법탄). 플레이어에게만 판정된다
  spawnHostile(origin, dir, damage, color = '#b06cff', speed = 22) {
    const mesh = MeshBuilder.CreateSphere('hostileBolt', { diameter: 0.32, segments: 8 }, this.scene);
    mesh.material = this._mat(color);
    mesh.applyFog = false;
    mesh.isPickable = false;
    mesh.position.set(origin.x, origin.y, origin.z);
    this.hostile.push({
      mesh, vx: dir.x * speed, vz: dir.z * speed,
      dirN: { x: dir.x, z: dir.z }, life: 2.2, damage
    });
  }

  updateHostile(delta, player) {
    for (let i = this.hostile.length - 1; i >= 0; i--) {
      const p = this.hostile[i];
      p.life -= delta;
      const pos = p.mesh.position;
      pos.x += p.vx * delta;
      pos.z += p.vz * delta;
      p.mesh.rotation.y += delta * 6;

      let done = p.life <= 0 || Math.abs(pos.x) > WORLD_HALF + 4 || Math.abs(pos.z) > WORLD_HALF + 4;
      if (!done) {
        const dx = pos.x - player.group.position.x;
        const dz = pos.z - player.group.position.z;
        if (dx * dx + dz * dz < 0.8 * 0.8) {
          player.takeDamage(p.damage, p.dirN);
          done = true;
        }
      }
      if (!done) {
        for (const o of this.obstacles) {
          const dx = pos.x - o.x;
          const dz = pos.z - o.z;
          if (dx * dx + dz * dz < o.r * o.r) { done = true; break; }
        }
      }
      if (done) {
        p.mesh.dispose();
        this.hostile.splice(i, 1);
      }
    }
  }

  // KayKit 화살을 미리 불러 원본으로 삼는다 (실패 시 절차적 화살을 그대로 사용)
  async _loadKitArrow() {
    // 바닥 위에서 잘 읽히도록 크게 만든다
    const kit = await loadKitMesh(this.scene, 'arrow.gltf', { height: 1.5 });
    if (!kit) return;
    // 모델의 긴 축을 진행 방향(+Z)에 맞춘다
    kit.rotation.x = Math.PI / 2;
    const holder = new TransformNode('kitArrowTemplate', this.scene);
    kit.parent = holder;
    for (const m of kit.getChildMeshes()) m.applyFog = false;

    // 발광 트레이서 — 화살 뒤로 늘어난 빛줄기라 배경과 구별된다
    const glow = MeshBuilder.CreatePlane('arrowGlow', { width: 0.42, height: 2.2 }, this.scene);
    const gm = new StandardMaterial('arrowGlowMat', this.scene);
    gm.emissiveColor = Color3.FromHexString('#ffd666');
    gm.diffuseColor = new Color3(0, 0, 0);
    gm.specularColor = new Color3(0, 0, 0);
    gm.disableLighting = true;
    gm.backFaceCulling = false;
    gm.alphaMode = 2;                 // ALPHA_ADD
    gm.alpha = 0.85;
    glow.material = gm;
    // 평면을 지면에 눕힌다 — 로컬 +Y(긴 축)가 진행 방향 +Z로 간다
    glow.rotation.x = Math.PI / 2;
    glow.position.z = -0.6;           // 화살 뒤로 늘어진 빛줄기
    glow.isPickable = false;
    glow.applyFog = false;
    glow.parent = holder;

    holder.setEnabled(false);
    this.arrowTemplate = holder;
    this.kitArrow = true;
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
      const template = this.arrowTemplate || this._arrowTemplate();
      mesh = template.clone('arrow');
      mesh.setEnabled(true);
      for (const c of mesh.getChildMeshes()) c.setEnabled(true);
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
          if (this.vfx) {
            this.vfx.burst(m.group.position, { size: 1.4, color: '#ffd666', dur: 0.26 });
            this.vfx.sparks(m.group.position, { count: 10, color: '#ffe9a8', power: 4.5, size: 0.2 });
          }
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
