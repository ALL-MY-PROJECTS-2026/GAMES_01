import {
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  TransformNode,
  PhysicsAggregate,
  PhysicsShapeType
} from '@babylonjs/core';
import { loadKitMesh } from '../player/weapons.js';
import { rollLoot, tierOf } from './loot.js';

const PICKUP_RANGE = 1.1;
const MAGNET_RANGE = 3.5;
const AUTO_PULL_SPEED = 16;   // 자동 수집으로 끌려오는 속도
const LIFETIME = 30;

export class DropManager {
  constructor(scene, physicsEnabled = true) {
    this.scene = scene;
    this.physicsEnabled = physicsEnabled;
    this.mats = {};
    this.kitCache = {};
    this.list = [];
    this.autoCollect = true;   // 처치 드랍은 알아서 딸려온다
  }

  _mat(hex) {
    if (!this.mats[hex]) {
      const m = new StandardMaterial('lootMat' + hex, this.scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.emissiveColor = Color3.FromHexString(hex).scale(0.45);
      m.specularColor = new Color3(0, 0, 0);
      this.mats[hex] = m;
    }
    return this.mats[hex];
  }

  // 아이템 모양 — 모델이 있으면 kit에서, 없으면 간단한 도형으로
  _makeMesh(def) {
    if (def.shape === 'pouch') {
      const g = new TransformNode('lootPouch', this.scene);
      const body = MeshBuilder.CreateSphere('pouchBody', { diameter: 0.34, segments: 8 }, this.scene);
      body.material = this._mat(def.color);
      body.parent = g;
      const neck = MeshBuilder.CreateCylinder('pouchNeck', { diameter: 0.16, height: 0.12, tessellation: 6 }, this.scene);
      neck.material = this._mat('#6b4a2e');
      neck.position.y = 0.2;
      neck.parent = g;
      return g;
    }
    const gem = MeshBuilder.CreatePolyhedron('lootGem', { type: 3, size: 0.22 * (def.scale || 1) }, this.scene);
    gem.material = this._mat(def.color);
    return gem;
  }

  /** 몬스터 처치 시 — 등급에 맞는 아이템을 뽑아 떨어뜨린다 */
  spawnFor(cfg, pos, count = 1) {
    const tier = tierOf(cfg);
    for (let i = 0; i < count; i++) this.spawn(pos, rollLoot(tier));
  }

  spawn(pos, def = null) {
    const item = def || rollLoot(0);
    const mesh = this._makeMesh(item);
    mesh.position.set(pos.x, 0.8, pos.z);
    // kit 모델이 있으면 도형 대신 붙인다 (비동기라 나중에 교체)
    if (item.model) this._attachKit(mesh, item);

    let agg = null;
    if (this.physicsEnabled) {
      agg = new PhysicsAggregate(
        mesh,
        PhysicsShapeType.SPHERE,
        { mass: 0.3, restitution: 0.55, friction: 0.6 },
        this.scene
      );
      agg.body.setLinearVelocity(
        new Vector3((Math.random() - 0.5) * 4, 5 + Math.random() * 2.5, (Math.random() - 0.5) * 4)
      );
      agg.body.setAngularVelocity(
        new Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6)
      );
    }
    this.list.push({ mesh, agg, t: 0, life: LIFETIME, item, auto: this.autoCollect });
  }

  async _attachKit(parent, item) {
    let proto = this.kitCache[item.model];
    if (proto === undefined) {
      proto = await loadKitMesh(this.scene, item.model, { height: item.height || 0.5 });
      this.kitCache[item.model] = proto;
      if (proto) proto.setEnabled(false);
    }
    if (!proto || parent.isDisposed()) return;
    const inst = proto.clone('loot_' + item.key);
    inst.setEnabled(true);
    for (const c of inst.getChildMeshes()) { c.setEnabled(true); c.isPickable = false; }
    inst.parent = parent;
    inst.position.set(0, 0, 0);
    // 도형은 숨기고 모델만 보이게
    for (const c of parent.getChildMeshes()) {
      if (!c.name.startsWith('loot_') && !inst.getChildMeshes().includes(c)) c.setEnabled(false);
    }
    if (parent.getClassName && parent.getClassName() === 'Mesh') parent.isVisible = false;
  }

  _removePhysics(d) {
    if (d.agg) {
      d.agg.dispose();
      d.agg = null;
      if (d.mesh.rotationQuaternion) {
        d.mesh.rotationQuaternion = null;
        d.mesh.rotation.set(0, 0, 0);
      }
    }
  }

  _dispose(i) {
    const d = this.list[i];
    this._removePhysics(d);
    d.mesh.dispose();
    this.list.splice(i, 1);
  }

  update(delta, player, onPickup) {
    const ppos = player.group.position;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.t += delta;
      d.life -= delta;

      if (d.agg) {
        const dist = Math.hypot(ppos.x - d.mesh.position.x, ppos.z - d.mesh.position.z);
        if (d.t > (d.auto ? 0.45 : 0.6) && (d.auto || dist < MAGNET_RANGE)) this._removePhysics(d);
      } else {
        d.mesh.rotation.y += delta * 2;
        d.mesh.position.y = Math.max(d.mesh.position.y, 0.3 + Math.sin(d.t * 3) * 0.08);

        const dx = ppos.x - d.mesh.position.x;
        const dz = ppos.z - d.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (d.auto && dist > 0.01) {
          // 자동 수집 — 거리와 상관없이 플레이어에게 날아온다
          const pull = AUTO_PULL_SPEED * delta;
          d.mesh.position.x += (dx / dist) * Math.min(pull, dist);
          d.mesh.position.z += (dz / dist) * Math.min(pull, dist);
          d.mesh.position.y += (0.9 - d.mesh.position.y) * 6 * delta;
        } else if (dist < MAGNET_RANGE && dist > 0.01) {
          const pull = (1 - dist / MAGNET_RANGE) * 7 * delta;
          d.mesh.position.x += (dx / dist) * pull;
          d.mesh.position.z += (dz / dist) * pull;
          d.mesh.position.y += (0.7 - d.mesh.position.y) * 4 * delta;
        }
        if (dist < PICKUP_RANGE) {
          const item = d.item;
          this._dispose(i);
          if (onPickup) onPickup(item);
          continue;
        }
      }

      if (d.life <= 0) this._dispose(i);
    }
  }
}
