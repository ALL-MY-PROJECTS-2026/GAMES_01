import {
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh
} from '@babylonjs/core';
import { WORLD_HALF, resolveCollision } from './ground.js';

const RED = Color3.FromHexString('#e24b4a');
const ATTACK_INTERVAL = 1.2;
const RESPAWN_TIME = 15;

export const MONSTER_TYPES = {
  slime: {
    name: '원귀',
    hp: 30, damage: 5, speed: 3.6, wanderSpeed: 1, aggro: 10, attackRange: 1.9,
    xp: 12, gold: [3, 7], jelly: 1,
    barY: 1.9, ring: [18, 55]
  },
  mushroom: {
    name: '도깨비',
    hp: 60, damage: 10, speed: 2.2, wanderSpeed: 0.7, aggro: 9, attackRange: 2.0,
    xp: 25, gold: [8, 14], jelly: 2,
    barY: 2.1, ring: [45, 85]
  }
};

function flatMat(scene, name, hex, emissive = false) {
  const mat = new StandardMaterial(name, scene);
  if (emissive) {
    mat.emissiveColor = Color3.FromHexString(hex);
    mat.disableLighting = true;
  } else {
    mat.diffuseColor = Color3.FromHexString(hex);
  }
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}

class Monster {
  constructor(scene, shadow, typeKey) {
    this.scene = scene;
    this.typeKey = typeKey;
    this.cfg = MONSTER_TYPES[typeKey];
    this.group = new TransformNode('mon-' + typeKey, scene);
    this.body = new TransformNode('monBody', scene);
    this.body.parent = this.group;

    const eyeMat = flatMat(scene, 'eye', '#222222', true);

    if (typeKey === 'slime') {
      this.flashMat = new StandardMaterial('ghostMat', scene);
      this.flashMat.diffuseColor = Color3.FromHexString('#dfe9ff');
      this.flashMat.emissiveColor = Color3.FromHexString('#2a3a6a');
      this.flashMat.alpha = 0.72;
      this.flashMat.specularColor = new Color3(0, 0, 0);
      this.baseColor = Color3.FromHexString('#dfe9ff');

      const head = MeshBuilder.CreateSphere('ghostHead', { diameter: 1.1, segments: 12 }, scene);
      head.material = this.flashMat;
      head.position.y = 1.0;
      head.parent = this.body;

      const tail = MeshBuilder.CreateCylinder(
        'ghostTail', { diameterTop: 1.05, diameterBottom: 0.1, height: 0.9, tessellation: 10 }, scene
      );
      tail.material = this.flashMat;
      tail.position.y = 0.45;
      tail.parent = this.body;

      for (const sx of [-0.2, 0.2]) {
        const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.16, segments: 6 }, scene);
        eye.material = eyeMat;
        eye.position.set(sx, 1.08, 0.46);
        eye.parent = this.body;
      }
    } else {
      this.flashMat = new StandardMaterial('dokkaebiMat', scene);
      this.flashMat.diffuseColor = Color3.FromHexString('#a04a38');
      this.flashMat.specularColor = new Color3(0, 0, 0);
      this.baseColor = Color3.FromHexString('#a04a38');

      const torso = MeshBuilder.CreateCylinder(
        'dkBody', { diameterTop: 0.9, diameterBottom: 1.15, height: 1.3, tessellation: 10 }, scene
      );
      torso.material = this.flashMat;
      torso.position.y = 0.65;
      torso.parent = this.body;
      if (shadow) shadow.addShadowCaster(torso);

      const head = MeshBuilder.CreateSphere('dkHead', { diameter: 0.85, segments: 12 }, scene);
      head.material = this.flashMat;
      head.position.y = 1.55;
      head.parent = this.body;
      if (shadow) shadow.addShadowCaster(head);

      const horn = MeshBuilder.CreateCylinder(
        'dkHorn', { diameterTop: 0, diameterBottom: 0.22, height: 0.45, tessellation: 8 }, scene
      );
      horn.material = flatMat(scene, 'hornMat', '#e8d8a8');
      horn.position.set(0, 2.05, 0);
      horn.parent = this.body;

      const club = MeshBuilder.CreateCylinder(
        'dkClub', { diameterTop: 0.3, diameterBottom: 0.14, height: 1.0, tessellation: 8 }, scene
      );
      club.material = flatMat(scene, 'clubMat', '#5a4028');
      club.position.set(0.62, 0.9, 0.15);
      club.rotation.z = -0.5;
      club.parent = this.body;

      for (const sx of [-0.18, 0.18]) {
        const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.15, segments: 6 }, scene);
        eye.material = flatMat(scene, 'dkEye', '#ffd23e', true);
        eye.position.set(sx, 1.6, 0.38);
        eye.parent = this.body;
      }
    }

    this.hpBg = MeshBuilder.CreatePlane('hpBg', { width: 1.3, height: 0.14 }, scene);
    this.hpBg.material = flatMat(scene, 'hpBg', '#2c2c2a', true);
    this.hpBg.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.hpBg.position.y = this.cfg.barY;
    this.hpBg.parent = this.group;

    this.hpBar = MeshBuilder.CreatePlane('hpBar', { width: 1.24, height: 0.1 }, scene);
    this.hpBar.material = flatMat(scene, 'hpFill', '#e24b4a', true);
    this.hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.hpBar.position.y = this.cfg.barY;
    this.hpBar.parent = this.group;

    this.hp = this.cfg.hp;
    this.dead = false;
    this.respawnT = 0;
    this.attackT = 0;
    this.attackAnim = 0;
    this.flashT = 0;
    this.wanderT = 0;
    this.wanderDir = new Vector3(0, 0, 0);
    this.knock = new Vector3(0, 0, 0);
    this.bounce = Math.random() * 10;
    this._tmp = new Vector3(0, 0, 0);

    for (const cm of this.group.getChildMeshes()) cm.metadata = { monster: this };

    this.placeRandom();
  }

  placeRandom() {
    const [rMin, rMax] = this.cfg.ring;
    const angle = Math.random() * Math.PI * 2;
    const radius = rMin + Math.random() * (rMax - rMin);
    this.group.position.set(
      Math.max(-WORLD_HALF, Math.min(WORLD_HALF, Math.cos(angle) * radius)),
      0,
      Math.max(-WORLD_HALF, Math.min(WORLD_HALF, Math.sin(angle) * radius))
    );
  }

  setVisible(v) {
    this.group.setEnabled(v);
  }

  takeDamage(amount, dir = null, knock = 9) {
    if (this.dead) return false;
    this.hp -= amount;
    this.flashT = 0.15;
    this.flashMat.diffuseColor.copyFrom(RED);
    this.body.scaling.set(1.18, 0.45, 1.18);
    if (dir) {
      this.knock.copyFromFloats(dir.x, 0, dir.z);
      this.knock.scaleInPlace(knock);
    }
    if (this.hp <= 0) {
      this.dead = true;
      this.respawnT = RESPAWN_TIME;
      this.setVisible(false);
      return true;
    }
    return false;
  }

  _rotateToward(target, rate, delta) {
    let diff = target - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(1, delta * rate);
  }

  update(delta, targets, obstacles) {
    if (this.dead) {
      this.respawnT -= delta;
      if (this.respawnT <= 0) {
        this.dead = false;
        this.hp = this.cfg.hp;
        this.setVisible(true);
        this.placeRandom();
      }
      return;
    }

    if (this.flashT > 0) {
      this.flashT -= delta;
      if (this.flashT <= 0) {
        this.flashMat.diffuseColor.copyFrom(this.baseColor);
        this.body.scaling.set(1, 1, 1);
      }
    }

    const pos = this.group.position;

    if (this.knock.lengthSquared() > 0.04) {
      pos.addInPlace(this._tmp.copyFrom(this.knock).scaleInPlace(delta));
      this.knock.scaleInPlace(Math.exp(-6 * delta));
      pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
      pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.z));
      resolveCollision(pos, 0.7, obstacles);
      this.hpBar.scaling.x = Math.max(0, this.hp / this.cfg.hp);
      return;
    }

    let target = null;
    let dist = Infinity;
    for (const t of targets) {
      if (t.dead || t.hp <= 0) continue;
      const d = Math.hypot(t.group.position.x - pos.x, t.group.position.z - pos.z);
      if (d < dist) {
        dist = d;
        target = t;
      }
    }

    if (target && dist < this.cfg.aggro) {
      const toT = this._tmp.copyFrom(target.group.position).subtractInPlace(pos);
      toT.y = 0;
      const safeD = Math.max(dist, 0.001);
      const nx = toT.x / safeD;
      const nz = toT.z / safeD;

      this._rotateToward(Math.atan2(toT.x, toT.z), 10, delta);

      if (dist > this.cfg.attackRange * 0.8) {
        pos.x += nx * this.cfg.speed * delta;
        pos.z += nz * this.cfg.speed * delta;
      }
      this.attackT -= delta;
      if (dist < this.cfg.attackRange && this.attackT <= 0) {
        this.attackT = ATTACK_INTERVAL;
        this.attackAnim = 0.3;
        target.takeDamage(this.cfg.damage, { x: nx, z: nz });
      }
    } else {
      this.wanderT -= delta;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        this.wanderDir.copyFromFloats(Math.sin(a), 0, Math.cos(a));
        if (Math.random() < 0.35) this.wanderDir.copyFromFloats(0, 0, 0);
      }
      if (this.wanderDir.lengthSquared() > 0) {
        pos.x += this.wanderDir.x * this.cfg.wanderSpeed * delta;
        pos.z += this.wanderDir.z * this.cfg.wanderSpeed * delta;
        this._rotateToward(Math.atan2(this.wanderDir.x, this.wanderDir.z), 6, delta);
      }
    }

    pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
    pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.z));
    resolveCollision(pos, 0.7, obstacles);

    this.bounce += delta * (this.typeKey === 'slime' ? 2.2 : 3.5);
    let hop = 0;
    if (this.attackAnim > 0) {
      this.attackAnim -= delta;
      hop = Math.sin(Math.max(0, this.attackAnim) / 0.3 * Math.PI) * 0.35;
    }
    if (this.typeKey === 'slime') {
      this.body.position.y = 0.25 + Math.sin(this.bounce) * 0.18 + hop;
    } else {
      this.body.position.y = Math.abs(Math.sin(this.bounce)) * 0.12 + hop;
    }

    this.hpBar.scaling.x = Math.max(0, this.hp / this.cfg.hp);
  }
}

export class MonsterManager {
  constructor(scene, obstacles, shadow, counts = { slime: 8, mushroom: 5 }) {
    this.obstacles = obstacles;
    this.list = [];
    for (const [type, n] of Object.entries(counts)) {
      for (let i = 0; i < n; i++) this.list.push(new Monster(scene, shadow, type));
    }
  }

  update(delta, targets) {
    for (const m of this.list) m.update(delta, targets, this.obstacles);
  }
}
