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
    name: '슬라임',
    hp: 30, damage: 5, speed: 3.6, wanderSpeed: 1, aggro: 10, attackRange: 1.9,
    xp: 12, gold: [3, 7], jelly: 1,
    barY: 1.5, ring: [18, 55]
  },
  mushroom: {
    name: '버섯돌이',
    hp: 60, damage: 10, speed: 2.2, wanderSpeed: 0.7, aggro: 9, attackRange: 2.0,
    xp: 25, gold: [8, 14], jelly: 2,
    barY: 1.9, ring: [45, 85]
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
      this.flashMat = new StandardMaterial('slimeMat', scene);
      this.flashMat.diffuseColor = Color3.FromHexString('#59b83a');
      this.flashMat.specularColor = new Color3(0, 0, 0);
      this.baseColor = Color3.FromHexString('#59b83a');

      const s = MeshBuilder.CreateSphere('slimeBody', { diameter: 1.4, segments: 12 }, scene);
      s.material = this.flashMat;
      s.scaling.set(1, 0.72, 1);
      s.position.y = 0.5;
      s.parent = this.body;
      if (shadow) shadow.addShadowCaster(s);

      for (const sx of [-0.22, 0.22]) {
        const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.18, segments: 6 }, scene);
        eye.material = eyeMat;
        eye.position.set(sx, 0.62, 0.58);
        eye.parent = this.body;
      }
    } else {
      this.flashMat = new StandardMaterial('capMat', scene);
      this.flashMat.diffuseColor = Color3.FromHexString('#c4553f');
      this.flashMat.specularColor = new Color3(0, 0, 0);
      this.baseColor = Color3.FromHexString('#c4553f');

      const stem = MeshBuilder.CreateCylinder(
        'stem', { diameterTop: 0.55, diameterBottom: 0.7, height: 0.95, tessellation: 10 }, scene
      );
      stem.material = flatMat(scene, 'stemMat', '#e8dcc4');
      stem.position.y = 0.48;
      stem.parent = this.body;
      if (shadow) shadow.addShadowCaster(stem);

      const cap = MeshBuilder.CreateSphere('cap', { diameter: 1.6, segments: 12 }, scene);
      cap.material = this.flashMat;
      cap.scaling.set(1, 0.62, 1);
      cap.position.y = 1.05;
      cap.parent = this.body;
      if (shadow) shadow.addShadowCaster(cap);

      const spotMat = flatMat(scene, 'spot', '#fdf7ec');
      for (const [sx, sz] of [[-0.35, 0.25], [0.4, 0.1], [0.05, -0.42]]) {
        const spot = MeshBuilder.CreateSphere('spot', { diameter: 0.22, segments: 6 }, scene);
        spot.material = spotMat;
        spot.position.set(sx, 1.32, sz);
        spot.parent = this.body;
      }

      for (const sx of [-0.16, 0.16]) {
        const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.14, segments: 6 }, scene);
        eye.material = eyeMat;
        eye.position.set(sx, 0.62, 0.34);
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

  update(delta, player, obstacles) {
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

    const toPlayer = this._tmp.copyFrom(player.group.position).subtractInPlace(pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    if (dist < this.cfg.aggro) {
      const safeD = Math.max(dist, 0.001);
      const nx = toPlayer.x / safeD;
      const nz = toPlayer.z / safeD;

      this._rotateToward(Math.atan2(toPlayer.x, toPlayer.z), 10, delta);

      if (dist > this.cfg.attackRange * 0.8) {
        pos.x += nx * this.cfg.speed * delta;
        pos.z += nz * this.cfg.speed * delta;
      }
      this.attackT -= delta;
      if (dist < this.cfg.attackRange && this.attackT <= 0) {
        this.attackT = ATTACK_INTERVAL;
        this.attackAnim = 0.3;
        player.takeDamage(this.cfg.damage, { x: nx, z: nz });
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

    this.bounce += delta * (this.typeKey === 'slime' ? 6 : 3.5);
    let hop = 0;
    if (this.attackAnim > 0) {
      this.attackAnim -= delta;
      hop = Math.sin(Math.max(0, this.attackAnim) / 0.3 * Math.PI) * 0.35;
    }
    this.body.position.y = Math.abs(Math.sin(this.bounce)) * 0.12 + hop;

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

  update(delta, player) {
    for (const m of this.list) m.update(delta, player, this.obstacles);
  }
}
