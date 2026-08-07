import {
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  SceneLoader
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { resolveCollision, WORLD_HALF } from '../world/ground.js';
import { makeNameLabel } from '../world/npcs.js';
import { setPartyHP } from '../ui/hud.js';

const FOLLOW_SPEED = 8.5;
const LEASH = 16;
const REVIVE_TIME = 15;
const LOOPING = new Set(['Idle', 'Walking', 'Running']);

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
    this.headMesh = head;

    this.groups = null;
    this.currentAction = null;
    this.currentName = '';
    this.actionT = 0;
    this._loadModel(shadow);

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

  async _loadModel(shadow) {
    const res = await SceneLoader.ImportMeshAsync('', 'models/', 'character.glb', this.scene);
    const rootMesh = res.meshes[0];

    this.model = new TransformNode('compModel' + this.cfg.name, this.scene);
    this.model.parent = this.group;
    rootMesh.parent = this.model;

    const { min, max } = rootMesh.getHierarchyBoundingVectors(true);
    const h = max.y - min.y;
    const scale = 1.7 / h;
    this.model.scaling.setAll(scale);
    this.model.position.y = -min.y * scale;

    // 캐릭터별 팔레트 스왑: 같은 모델을 색으로 구분
    const tint = Color3.FromHexString(this.cfg.tint || this.cfg.color);
    const done = new Set();
    for (const m of res.meshes) {
      if (shadow && m.getTotalVertices && m.getTotalVertices() > 0) shadow.addShadowCaster(m);
      const mat = m.material;
      if (!mat || done.has(mat)) continue;
      done.add(mat);
      if (mat.albedoColor) mat.albedoColor = mat.albedoColor.multiply(tint);
      else if (mat.diffuseColor) mat.diffuseColor = mat.diffuseColor.multiply(tint);
    }

    this.groups = {};
    for (const g of res.animationGroups) {
      g.stop();
      this.groups[g.name] = g;
      for (const ta of g.targetedAnimations) {
        ta.animation.enableBlending = true;
        ta.animation.blendingSpeed = 0.1;
      }
    }

    this.bodyMesh.dispose();
    this.bodyMesh = null;
    this.headMesh.dispose();
    this.headMesh = null;
    this.play('Idle');
  }

  play(name, force = false, speed = 1) {
    if (!this.groups) return;
    const next = this.groups[name];
    if (!next) return;
    if (this.currentName === name && !force) return;
    if (this.currentAction && this.currentAction !== next) this.currentAction.stop();
    if (this.currentName === name && force) next.stop();
    next.start(LOOPING.has(name), speed);
    this.currentAction = next;
    this.currentName = name;
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
        // 시전 모션: 술법사는 손짓, 사수는 지르기
        this.play(this.cfg.role === 'mage' ? 'Wave' : 'Punch', true, 1.6);
        this.actionT = 0.5;
      }
    }

    const mdx = destX - pos.x;
    const mdz = destZ - pos.z;
    const mDist = Math.hypot(mdx, mdz);
    let moveSpeed = 0;
    if (mDist > 0.4) {
      const sp = Math.min(FOLLOW_SPEED, mDist * 4);
      moveSpeed = sp;
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

    if (this.groups) {
      this.actionT = Math.max(0, this.actionT - delta);
      if (this.actionT <= 0) {
        if (moveSpeed > 5.5) this.play('Running', false, 1.25);
        else if (moveSpeed > 0) this.play('Walking', false, 1.2);
        else this.play('Idle');
      }
    } else if (this.bodyMesh) {
      this.bob += delta * 5;
      this.bodyMesh.position.y = 0.8 + Math.abs(Math.sin(this.bob)) * 0.05;
    }
  }
}

export class CompanionManager {
  constructor(scene, shadow) {
    this.list = [
      new Companion(scene, shadow, {
        name: '쿠사', role: 'mage', slot: 1, color: '#34406e', tint: '#8fa8ff',
        projColor: '#7fb0ff', damage: 10, interval: 1.6, range: 15, hp: 80,
        offset: { x: -1.6, z: -1.6 }
      }),
      new Companion(scene, shadow, {
        name: '레닝', role: 'archer', slot: 2, color: '#2e5a38', tint: '#9fdca8',
        projColor: '#ffd666', damage: 7, interval: 1.0, range: 16, hp: 80,
        offset: { x: 1.6, z: -1.8 }
      })
    ];
  }

  update(delta, player, monsters, obstacles, projectiles, onHit) {
    for (const c of this.list) c.update(delta, player, monsters, obstacles, projectiles, onHit);
  }
}
