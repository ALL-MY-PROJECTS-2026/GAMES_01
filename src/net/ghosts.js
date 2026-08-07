import { TransformNode, SceneLoader, Color3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { makeNameLabel } from '../world/npcs.js';
import { CHARACTERS } from '../core/characters.js';

// 원격 플레이어 표시 — 수신 좌표로 순간이동시키지 않고 보간으로 따라간다.
// 각자의 스탯·레벨은 로컬에 있고, 여기서는 이름표에 레벨만 보여준다.
const LERP_RATE = 12;

class Ghost {
  constructor(scene, shadow, peerId, tint) {
    this.scene = scene;
    this.peerId = peerId;
    this.group = new TransformNode('ghost-' + peerId, scene);
    this.target = { x: 0, z: 0, ry: 0 };
    this.label = null;
    this.labelText = '';
    this.groups = null;
    this.currentKey = '';
    this.tint = tint;
    this._load(shadow);
  }

  async _load(shadow) {
    const cfg = CHARACTERS.ilim.model;
    const res = await SceneLoader.ImportMeshAsync('', 'models/', cfg.file, this.scene);
    const root = res.meshes[0];
    const holder = new TransformNode('ghostModel-' + this.peerId, this.scene);
    holder.parent = this.group;
    root.parent = holder;

    const { min, max } = root.getHierarchyBoundingVectors(true);
    const h = max.y - min.y;
    const scale = cfg.height / h;
    holder.scaling.setAll(scale);
    holder.position.y = -min.y * scale;

    // 내장 무기 프롭은 끄고, 피어마다 다른 색으로 구분한다
    const tint = Color3.FromHexString(this.tint);
    const touched = new Set();
    for (const m of res.meshes) {
      if (shadow && m.getTotalVertices && m.getTotalVertices() > 0) shadow.addShadowCaster(m);
      const parent = m.parent && m.parent.name;
      if (parent && /^handslot/i.test(parent)) m.setEnabled(false);
      const mat = m.material;
      if (!mat || touched.has(mat)) continue;
      touched.add(mat);
      const cloned = mat.clone('ghostMat-' + this.peerId);
      if (cloned.albedoColor) cloned.albedoColor = cloned.albedoColor.multiply(tint);
      else if (cloned.diffuseColor) cloned.diffuseColor = cloned.diffuseColor.multiply(tint);
      m.material = cloned;
    }

    this.clipMap = cfg.clips;
    this.groups = {};
    for (const g of res.animationGroups) {
      g.stop();
      this.groups[g.name] = g;
      for (const ta of g.targetedAnimations) {
        ta.animation.enableBlending = true;
        ta.animation.blendingSpeed = 0.1;
      }
    }
    this.play('idle');
  }

  play(key) {
    if (!this.groups || this.currentKey === key) return;
    const name = this.clipMap[key] || key;
    const next = this.groups[name];
    if (!next) return;
    if (this.current) this.current.stop();
    next.start(key === 'idle' || key === 'walk' || key === 'run');
    this.current = next;
    this.currentKey = key;
  }

  /** 공격·시전처럼 한 번만 재생하는 동작 (상태 샘플링으로는 놓치기 쉬워 이벤트로 받는다) */
  playOnce(key, speed = 1, fromFrac = 0, toFrac = 1) {
    if (!this.groups) return;
    const name = this.clipMap[key] || key;
    const next = this.groups[name];
    if (!next) return;
    if (this.current) this.current.stop();
    if (fromFrac > 0 || toFrac < 1) {
      const f0 = next.from + (next.to - next.from) * fromFrac;
      const f1 = next.from + (next.to - next.from) * toFrac;
      next.start(false, speed, f0, f1);
    } else {
      next.start(false, speed);
    }
    this.current = next;
    this.currentKey = key;
    this.lockT = 0.5;
  }

  setLabel(text) {
    if (this.labelText === text) return;
    this.labelText = text;
    if (this.label) this.label.dispose();
    this.label = makeNameLabel(this.scene, text);
    this.label.position.y = 2.3;
    this.label.parent = this.group;
  }

  apply(state) {
    if (!state) return;
    this.target.x = state.x;
    this.target.z = state.z;
    this.target.ry = state.ry;
    // 원샷 동작 재생 중에는 상태값으로 덮어쓰지 않는다
    if (!(this.lockT > 0)) this.play(state.a || 'idle');
    this.setLabel(`${state.n || '퇴마사'} Lv.${state.lv || 1}`);
  }

  update(delta) {
    if (this.lockT > 0) this.lockT -= delta;
    const k = Math.min(1, delta * LERP_RATE);
    const p = this.group.position;
    p.x += (this.target.x - p.x) * k;
    p.z += (this.target.z - p.z) * k;
    let diff = this.target.ry - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * k;
  }

  dispose() {
    if (this.label) this.label.dispose();
    this.group.dispose(false, true);
  }
}

const TINTS = ['#8fa8ff', '#9fdca8', '#ffcf8f', '#e39fd8', '#9fe4ff'];

export class GhostManager {
  constructor(scene, shadow) {
    this.scene = scene;
    this.shadow = shadow;
    this.map = new Map();
    this.n = 0;
  }

  ensure(peerId) {
    let g = this.map.get(peerId);
    if (!g) {
      g = new Ghost(this.scene, this.shadow, peerId, TINTS[this.n++ % TINTS.length]);
      this.map.set(peerId, g);
    }
    return g;
  }

  remove(peerId) {
    const g = this.map.get(peerId);
    if (g) {
      g.dispose();
      this.map.delete(peerId);
    }
  }

  update(delta, peers) {
    for (const [id, p] of peers) {
      if (!p.state) continue;
      this.ensure(id).apply(p.state);
    }
    for (const g of this.map.values()) g.update(delta);
  }

  clear() {
    for (const g of this.map.values()) g.dispose();
    this.map.clear();
  }
}
