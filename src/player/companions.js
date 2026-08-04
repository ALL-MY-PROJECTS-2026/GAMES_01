import {
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3
} from '@babylonjs/core';
import { resolveCollision, WORLD_HALF } from '../world/ground.js';
import { makeNameLabel } from '../world/npcs.js';
import { setPartyHP } from '../ui/hud.js';

const FOLLOW_SPEED = 8.5;
const LEASH = 16;
const REVIVE_TIME = 15;

function lambert(scene, name, hex) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(hex);
  mat.specularColor = new Color3(0, 0, 0);
  return mat;
}

class Companion {
  constructor(scene, shadow, cfg) {
    this.cfg = cfg;
    this.scene = scene;
    this.group = new TransformNode('comp-' + cfg.name, scene);

    const body = MeshBuilder.CreateCapsule('compBody', { height: 1.5, radius: 0.35 }, scene);
    body.material = lambert(scene, 'compBodyMat' + cfg.name, cfg.color);
    body.position.y = 0.8;
    body.parent = this.group;
    if (shadow) shadow.addShadowCaster(body);
    this.bodyMesh = body;

    const head = MeshBuilder.CreateSphere('compHead', { diameter: 0.5, segments: 12 }, scene);
    head.material = lambert(scene, 'compHead' + cfg.name, '#ffe3c8');
    head.position.y = 1.75;
    head.parent = this.group;

    if (cfg.role === 'mage') {
      const staff = MeshBuilder.CreateCylinder('staff', { diameter: 0.07, height: 1.6, tessellation: 6 }, scene);
      staff.material = lambert(scene, 'staffMat', '#5a4028');
      staff.position.set(0.45, 1.0, 0.1);
      staff.rotation.z = -0.15;
      staff.parent = this.group;
      const orb = MeshBuilder.CreateSphere('orb', { diameter: 0.22, segments: 8 }, scene);
      const orbMat = new StandardMaterial('orbMat', scene);
      orbMat.emissiveColor = Color3.FromHexString(cfg.projColor);
      orbMat.disableLighting = true;
      orb.material = orbMat;
      orb.position.set(0.48, 1.85, 0.1);
      orb.parent = this.group;
    } else {
      const bow = MeshBuilder.CreateBox('bow', { width: 0.08, height: 0.7, depth: 0.12 }, scene);
      bow.material = lambert(scene, 'bowMat', '#7a5a30');
      bow.position.set(0.45, 1.15, 0.1);
      bow.rotation.x = 0.2;
      bow.parent = this.group;
    }

    const label = makeNameLabel(scene, cfg.name);
    label.position.y = 2.35;
    label.parent = this.group;

    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.dead = false;
    this.reviveT = 0;
    this.attackT = 0;
    this.bob = Math.random() * 5;
    this._tmp = new Vector3(0, 0, 0);

    this.group.position.set(cfg.offset.x, 0, cfg.offset.z);
    setPartyHP(cfg.slot, this.hp, this.maxHp);
  }

  takeDamage(amount) {
    if (this.dead) return false;
    this.hp = Math.max(0, this.hp - amount);
    setPartyHP(this.cfg.slot, this.hp, this.maxHp);
    if (this.hp <= 0) {
      this.dead = true;
      this.reviveT = REVIVE_TIME;
      this.group.setEnabled(false);
    }
    return false;
  }

  update(delta, player, monsters, obstacles, projectiles, onHit) {
    if (this.dead) {
      this.reviveT -= delta;
      if (this.reviveT <= 0) {
        this.dead = false;
        this.hp = this.maxHp;
        this.group.setEnabled(true);
        this.group.position.copyFrom(player.group.position);
        this.group.position.x += this.cfg.offset.x;
        setPartyHP(this.cfg.slot, this.hp, this.maxHp);
      }
      return;
    }

    const pos = this.group.position;
    const ppos = player.group.position;
    const ry = player.group.rotation.y;
    const ox = this.cfg.offset.x * Math.cos(ry) + this.cfg.offset.z * Math.sin(ry);
    const oz = -this.cfg.offset.x * Math.sin(ry) + this.cfg.offset.z * Math.cos(ry);
    const homeX = ppos.x + ox;
    const homeZ = ppos.z + oz;

    let target = null;
    let tDist = Infinity;
    for (const m of monsters) {
      if (m.dead) continue;
      const dp = Math.hypot(m.group.position.x - ppos.x, m.group.position.z - ppos.z);
      if (dp > 14) continue;
      const d = Math.hypot(m.group.position.x - pos.x, m.group.position.z - pos.z);
      if (d < tDist) {
        tDist = d;
        target = m;
      }
    }

    const distHome = Math.hypot(homeX - pos.x, homeZ - pos.z);
    let destX = homeX;
    let destZ = homeZ;

    if (target && distHome < LEASH) {
      if (tDist > this.cfg.range * 0.85) {
        destX = target.group.position.x;
        destZ = target.group.position.z;
      } else {
        destX = pos.x;
        destZ = pos.z;
      }
      this.group.rotation.y = Math.atan2(
        target.group.position.x - pos.x,
        target.group.position.z - pos.z
      );

      this.attackT -= delta;
      if (this.attackT <= 0 && tDist < this.cfg.range) {
        this.attackT = this.cfg.interval;
        const dirN = this._tmp.copyFromFloats(
          target.group.position.x - pos.x,
          0,
          target.group.position.z - pos.z
        ).normalize();
        const origin = new Vector3(pos.x + dirN.x * 0.5, 1.3, pos.z + dirN.z * 0.5);
        projectiles.spawn(origin, dirN.clone(), this.cfg.damage, 2.5, this.cfg.projColor);
      }
    }

    const mdx = destX - pos.x;
    const mdz = destZ - pos.z;
    const mDist = Math.hypot(mdx, mdz);
    if (mDist > 0.4) {
      const sp = Math.min(FOLLOW_SPEED, mDist * 4);
      pos.x += (mdx / mDist) * sp * delta;
      pos.z += (mdz / mDist) * sp * delta;
      if (!target) this.group.rotation.y = Math.atan2(mdx, mdz);
    }

    if (distHome > 24) {
      pos.x = homeX;
      pos.z = homeZ;
    }

    pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
    pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.z));
    resolveCollision(pos, 0.45, obstacles);

    this.bob += delta * 5;
    this.bodyMesh.position.y = 0.8 + Math.abs(Math.sin(this.bob)) * 0.05;
  }
}

export class CompanionManager {
  constructor(scene, shadow) {
    this.list = [
      new Companion(scene, shadow, {
        name: '쿠사', role: 'mage', slot: 1, color: '#34406e',
        projColor: '#7fb0ff', damage: 10, interval: 1.6, range: 15, hp: 80,
        offset: { x: -1.6, z: -1.6 }
      }),
      new Companion(scene, shadow, {
        name: '레닝', role: 'archer', slot: 2, color: '#2e5a38',
        projColor: '#ffd666', damage: 7, interval: 1.0, range: 16, hp: 80,
        offset: { x: 1.6, z: -1.8 }
      })
    ];
  }

  update(delta, player, monsters, obstacles, projectiles, onHit) {
    for (const c of this.list) c.update(delta, player, monsters, obstacles, projectiles, onHit);
  }
}
