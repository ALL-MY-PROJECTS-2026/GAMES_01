import {
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh
} from '@babylonjs/core';
import { WORLD_HALF, resolveCollision } from './ground.js';

const AGGRO_RANGE = 10;
const ATTACK_RANGE = 1.9;
const ATTACK_DAMAGE = 5;
const ATTACK_INTERVAL = 1.2;
const MOVE_SPEED = 3.6;
const WANDER_SPEED = 1;
const MAX_HP = 30;
const RESPAWN_TIME = 15;

const GREEN = Color3.FromHexString('#59b83a');
const RED = Color3.FromHexString('#e24b4a');

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

class Slime {
  constructor(scene, shadow) {
    this.scene = scene;
    this.group = new TransformNode('slime', scene);

    this.bodyMat = new StandardMaterial('slimeMat', scene);
    this.bodyMat.diffuseColor = GREEN.clone();
    this.bodyMat.specularColor = new Color3(0, 0, 0);

    this.body = MeshBuilder.CreateSphere('slimeBody', { diameter: 1.4, segments: 12 }, scene);
    this.body.material = this.bodyMat;
    this.body.scaling.set(1, 0.72, 1);
    this.body.position.y = 0.5;
    this.body.parent = this.group;
    if (shadow) shadow.addShadowCaster(this.body);

    const eyeMat = flatMat(scene, 'eye', '#222222', true);
    for (const sx of [-0.22, 0.22]) {
      const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.18, segments: 6 }, scene);
      eye.material = eyeMat;
      eye.position.set(sx, 0.62, 0.58);
      eye.parent = this.group;
    }

    this.hpBg = MeshBuilder.CreatePlane('hpBg', { width: 1.3, height: 0.14 }, scene);
    this.hpBg.material = flatMat(scene, 'hpBg', '#2c2c2a', true);
    this.hpBg.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.hpBg.position.y = 1.5;
    this.hpBg.parent = this.group;

    this.hpBar = MeshBuilder.CreatePlane('hpBar', { width: 1.24, height: 0.1 }, scene);
    this.hpBar.material = flatMat(scene, 'hpFill', '#e24b4a', true);
    this.hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.hpBar.position.y = 1.5;
    this.hpBar.parent = this.group;

    this.hp = MAX_HP;
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
    const angle = Math.random() * Math.PI * 2;
    const radius = 18 + Math.random() * 55;
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
    this.bodyMat.diffuseColor.copyFrom(RED);
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
        this.hp = MAX_HP;
        this.setVisible(true);
        this.placeRandom();
      }
      return;
    }

    if (this.flashT > 0) {
      this.flashT -= delta;
      if (this.flashT <= 0) {
        this.bodyMat.diffuseColor.copyFrom(GREEN);
        this.body.scaling.set(1, 0.72, 1);
      }
    }

    const pos = this.group.position;

    if (this.knock.lengthSquared() > 0.04) {
      pos.addInPlace(this._tmp.copyFrom(this.knock).scaleInPlace(delta));
      this.knock.scaleInPlace(Math.exp(-6 * delta));
      pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
      pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.z));
      resolveCollision(pos, 0.7, obstacles);
      this.hpBar.scaling.x = Math.max(0, this.hp / MAX_HP);
      return;
    }

    const toPlayer = this._tmp.copyFrom(player.group.position).subtractInPlace(pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    if (dist < AGGRO_RANGE) {
      const safeD = Math.max(dist, 0.001);
      const nx = toPlayer.x / safeD;
      const nz = toPlayer.z / safeD;

      this._rotateToward(Math.atan2(toPlayer.x, toPlayer.z), 10, delta);

      if (dist > ATTACK_RANGE * 0.8) {
        pos.x += nx * MOVE_SPEED * delta;
        pos.z += nz * MOVE_SPEED * delta;
      }
      this.attackT -= delta;
      if (dist < ATTACK_RANGE && this.attackT <= 0) {
        this.attackT = ATTACK_INTERVAL;
        this.attackAnim = 0.3;
        player.takeDamage(ATTACK_DAMAGE, { x: nx, z: nz });
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
        pos.x += this.wanderDir.x * WANDER_SPEED * delta;
        pos.z += this.wanderDir.z * WANDER_SPEED * delta;
        this._rotateToward(Math.atan2(this.wanderDir.x, this.wanderDir.z), 6, delta);
      }
    }

    pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
    pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.z));
    resolveCollision(pos, 0.7, obstacles);

    this.bounce += delta * 6;
    let hop = 0;
    if (this.attackAnim > 0) {
      this.attackAnim -= delta;
      hop = Math.sin(Math.max(0, this.attackAnim) / 0.3 * Math.PI) * 0.35;
    }
    this.body.position.y = 0.5 + Math.abs(Math.sin(this.bounce)) * 0.12 + hop;

    this.hpBar.scaling.x = Math.max(0, this.hp / MAX_HP);
  }
}

export class MonsterManager {
  constructor(scene, obstacles, shadow, count = 8) {
    this.obstacles = obstacles;
    this.list = [];
    for (let i = 0; i < count; i++) this.list.push(new Slime(scene, shadow));
  }

  update(delta, player) {
    for (const m of this.list) m.update(delta, player, this.obstacles);
  }
}
