import {
  MeshBuilder, StandardMaterial, Color3, Color4, Engine, Mesh, ParticleSystem, Vector3
} from '@babylonjs/core';
import {
  makeRuneTexture, makeGlowTexture, makeSparkTexture, makeSlashTexture, makeNoiseTexture,
  makeShockRingTexture, makeFireFieldTexture
} from './vfx_textures.js';

// 마법·타격 이펙트 (STACK.md §9)
// 규칙: 라이팅 계산 금지 · 깊이 쓰기 끔 · 오브젝트 풀링 · 동시 개수 상한 · 고정 스텝 시계 사용
const MAX_LIVE = 24;   // 모바일 오버드로우 방어 — 초과 시 가장 오래된 것부터 회수

export function vfxMaterial(scene, name, hex, additive = true) {
  const mat = new StandardMaterial('vfx_' + name, scene);
  mat.emissiveColor = Color3.FromHexString(hex);
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.alphaMode = additive ? Engine.ALPHA_ADD : Engine.ALPHA_COMBINE;
  mat.alpha = 1;
  return mat;
}

class Pool {
  constructor(scene, make) {
    this.scene = scene;
    this.make = make;
    this.free = [];
  }
  take() {
    const m = this.free.pop() || this.make(this.scene);
    m.setEnabled(true);
    return m;
  }
  give(m) {
    m.setEnabled(false);
    this.free.push(m);
  }
}

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.live = [];   // { mesh, pool, t, dur, kind, ...}

    // 절차적 텍스처 — 단색 도형만으로는 밋밋해서 문양·감쇠를 입힌다
    this.tex = {
      rune: makeRuneTexture(scene),
      glow: makeGlowTexture(scene),
      spark: makeSparkTexture(scene),
      slash: makeSlashTexture(scene),
      noise: makeNoiseTexture(scene),
      shockRing: makeShockRingTexture(scene),
      fireField: makeFireFieldTexture(scene)
    };

    // 지염장 — 머무는 불바다 (얼룩 텍스처, 느리게 회전)
    this.fieldPool = new Pool(scene, (s) => {
      const f = MeshBuilder.CreateDisc('vfxField', { radius: 1, tessellation: 40 }, s);
      f.rotation.x = Math.PI / 2;
      f.isPickable = false;
      f.applyFog = false;
      f.material = vfxMaterial(s, 'field' + Math.random(), '#ffffff');
      f.material.emissiveTexture = this.tex.fireField;
      f.material.opacityTexture = this.tex.fireField;
      f.setEnabled(false);
      return f;
    });
    // 빙백진 — 날카롭게 퍼지는 얼음 파문
    this.novaPool = new Pool(scene, (s) => {
      const n = MeshBuilder.CreateDisc('vfxNova', { radius: 1, tessellation: 48 }, s);
      n.rotation.x = Math.PI / 2;
      n.isPickable = false;
      n.applyFog = false;
      n.material = vfxMaterial(s, 'nova' + Math.random(), '#ffffff');
      n.material.emissiveTexture = this.tex.shockRing;
      n.material.opacityTexture = this.tex.shockRing;
      n.setEnabled(false);
      return n;
    });
    this.discPool = new Pool(scene, (s) => {
      const d = MeshBuilder.CreateDisc('vfxDisc', { radius: 1, tessellation: 40 }, s);
      d.rotation.x = Math.PI / 2;
      d.isPickable = false;
      d.applyFog = false;
      d.material = vfxMaterial(s, 'disc' + Math.random(), '#ffffff');
      d.material.emissiveTexture = this.tex.slash;
      d.material.opacityTexture = this.tex.slash;
      d.setEnabled(false);
      return d;
    });
    this.ringPool = new Pool(scene, (s) => {
      const r = MeshBuilder.CreateDisc('vfxRing', { radius: 1, tessellation: 48, arc: 0.5 }, s);
      r.rotation.x = Math.PI / 2;
      r.isPickable = false;
      r.applyFog = false;
      r.material = vfxMaterial(s, 'ring' + Math.random(), '#ffffff');
      r.material.emissiveTexture = this.tex.rune;
      r.material.opacityTexture = this.tex.rune;
      r.setEnabled(false);
      return r;
    });
    // 오라: 구체의 안쪽 면만 그려서 캐릭터를 덮지 않는다
    this.spherePool = new Pool(scene, (s) => {
      const sp = MeshBuilder.CreateSphere('vfxAura',
        { diameter: 2, segments: 16, sideOrientation: Mesh.BACKSIDE }, s);
      sp.isPickable = false;
      sp.applyFog = false;
      sp.material = vfxMaterial(s, 'aura' + Math.random(), '#ffffff');
      sp.material.emissiveTexture = this.tex.noise;
      sp.material.opacityTexture = this.tex.noise;
      sp.setEnabled(false);
      return sp;
    });
    this.beamPool = new Pool(scene, (s) => {
      const b = MeshBuilder.CreateBox('vfxBeam', { size: 1 }, s);
      b.isPickable = false;
      b.applyFog = false;
      b.material = vfxMaterial(s, 'beam' + Math.random(), '#ffffff');
      b.setEnabled(false);
      return b;
    });
    this.puffPool = new Pool(scene, (s) => {
      const p = MeshBuilder.CreatePlane('vfxPuff', { size: 1 }, s);
      p.billboardMode = Mesh.BILLBOARDMODE_ALL;
      p.isPickable = false;
      p.applyFog = false;
      p.material = vfxMaterial(s, 'puff' + Math.random(), '#ffffff');
      p.material.emissiveTexture = this.tex.glow;
      p.material.opacityTexture = this.tex.glow;
      p.setEnabled(false);
      return p;
    });

  }

  /** 불티 — 타격·폭발에 흩날리는 파편. 엔진 내장 파티클을 풀로 돌린다 */
  sparks(pos, { count = 18, color = '#ffd23e', power = 4, size = 0.28, spread = 'burst' } = {}) {
    let ps = this.sparkFree && this.sparkFree.pop();
    if (!ps) {
      ps = new ParticleSystem('vfxSparks', 60, this.scene);
      ps.particleTexture = this.tex.spark;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.minLifeTime = 0.18;
      ps.maxLifeTime = 0.42;
      ps.gravity = new Vector3(0, -14, 0);
      ps.minAngularSpeed = -6;
      ps.maxAngularSpeed = 6;
      ps.emitter = new Vector3(0, 0, 0);
    }
    const c = Color3.FromHexString(color);
    ps.color1 = new Color4(c.r, c.g, c.b, 1);
    ps.color2 = new Color4(1, 1, 1, 0.9);
    ps.colorDead = new Color4(c.r, c.g, c.b, 0);
    ps.minSize = size * 0.5;
    ps.maxSize = size;
    ps.minEmitPower = power * 0.5;
    ps.maxEmitPower = power;
    // 흩어지는 방향 — 불티는 위로, 얼음 파편은 낮고 넓게
    if (spread === 'up') {
      ps.direction1 = new Vector3(-0.25, 1.2, -0.25);
      ps.direction2 = new Vector3(0.25, 2.2, 0.25);
      ps.gravity = new Vector3(0, -3, 0);
    } else if (spread === 'flat') {
      ps.direction1 = new Vector3(-1, 0.05, -1);
      ps.direction2 = new Vector3(1, 0.35, 1);
      ps.gravity = new Vector3(0, -8, 0);
    } else {
      ps.direction1 = new Vector3(-1, 0.4, -1);
      ps.direction2 = new Vector3(1, 1.4, 1);
      ps.gravity = new Vector3(0, -14, 0);
    }
    ps.emitter = new Vector3(pos.x, (pos.y || 0) + 0.9, pos.z);
    ps.manualEmitCount = count;
    ps.start();
    this.sparkBusy = this.sparkBusy || [];
    this.sparkBusy.push({ ps, t: 0.7 });
  }

  // 알파를 개별로 애니메이션하므로 머티리얼은 메시마다 전용이어야 한다
  _tint(mesh, hex) {
    mesh.material.emissiveColor = Color3.FromHexString(hex);
    mesh.material.alpha = 1;
  }

  _push(entry) {
    if (this.live.length >= MAX_LIVE) {
      const oldest = this.live.shift();
      oldest.pool.give(oldest.mesh);
    }
    this.live.push(entry);
  }

  /** A. 바닥 마법진 — 링 2개가 반대로 돈다 */
  circle(pos, { radius = 2, color = '#7fb0ff', dur = 0.9 } = {}) {
    for (let i = 0; i < 2; i++) {
      const mesh = this.ringPool.take();
      this._tint(mesh, color);
      mesh.position.set(pos.x, 0.06 + i * 0.01, pos.z);
      mesh.scaling.setAll(radius * (i ? 0.66 : 1));
      mesh.rotation.y = Math.random() * Math.PI;
      this._push({ mesh, pool: this.ringPool, t: 0, dur, kind: 'circle', spin: i ? -3.2 : 2.4, base: radius * (i ? 0.66 : 1) });
    }
  }

  /** D. 타격/폭발 — 빌보드 평면을 확대하며 페이드 */
  burst(pos, { size = 1.6, color = '#ffb03a', dur = 0.32 } = {}) {
    const mesh = this.puffPool.take();
    this._tint(mesh, color);
    mesh.position.set(pos.x, (pos.y || 0) + 0.9, pos.z);
    mesh.scaling.setAll(size * 0.4);
    this._push({ mesh, pool: this.puffPool, t: 0, dur, kind: 'burst', base: size });
  }

  /** E. 검기 — 부채꼴이 펼쳐지며 사라진다 */
  slash(pos, facingY, { radius = 3.2, color = '#cfe4ff', dur = 0.26 } = {}) {
    const mesh = this.discPool.take();
    this._tint(mesh, color);
    mesh.position.set(pos.x, 1.0, pos.z);
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.z = -facingY;
    mesh.scaling.setAll(radius * 0.5);
    this._push({ mesh, pool: this.discPool, t: 0, dur, kind: 'slash', base: radius });
  }

  /** 폭발 링 — 보스 회전베기 같은 광역 경고/타격 */
  shockwave(pos, { radius = 4.2, color = '#ff8a3a', dur = 0.45 } = {}) {
    const mesh = this.discPool.take();
    this._tint(mesh, color);
    mesh.position.set(pos.x, 0.08, pos.z);
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.z = 0;
    mesh.scaling.setAll(0.2);
    this._push({ mesh, pool: this.discPool, t: 0, dur, kind: 'shock', base: radius });
  }

  /** B. 오라/실드 — 안쪽 면을 그려 캐릭터를 가리지 않는다. follow를 주면 따라다닌다 */
  aura(follow, { radius = 1.4, color = '#7fb0ff', dur = 6 } = {}) {
    const mesh = this.spherePool.take();
    this._tint(mesh, color);
    mesh.scaling.setAll(radius);
    this._push({ mesh, pool: this.spherePool, t: 0, dur, kind: 'aura', base: radius, follow });
    return mesh;
  }

  /** 지염장 — 지속되는 불바다. 바닥이 일렁이고 불티가 계속 피어오른다 */
  fireField(pos, { radius = 4, color = '#ff8a3a', dur = 3.2 } = {}) {
    const mesh = this.fieldPool.take();
    this._tint(mesh, color);
    mesh.position.set(pos.x, 0.05, pos.z);
    mesh.scaling.setAll(radius * 0.3);
    this._push({
      mesh, pool: this.fieldPool, t: 0, dur, kind: 'field',
      base: radius, color, emberT: 0, pos: { x: pos.x, z: pos.z }
    });
  }

  /** 빙백진 — 한 번에 확 퍼지는 서릿발 파문 */
  frostNova(pos, { radius = 5.5, color = '#9fe4ff', dur = 0.55 } = {}) {
    const mesh = this.novaPool.take();
    this._tint(mesh, color);
    mesh.position.set(pos.x, 0.07, pos.z);
    mesh.scaling.setAll(radius * 0.15);
    this._push({ mesh, pool: this.novaPool, t: 0, dur, kind: 'nova', base: radius });
    // 얼음 파편이 낮게 사방으로 흩어진다
    this.sparks(pos, { count: 30, color, power: 11, size: 0.34, spread: 'flat' });
  }

  /** 연쇄 번개 — 두 지점을 잇는 얇은 기둥 */
  beam(from, to, { width = 0.18, color = '#a9d4ff', dur = 0.22 } = {}) {
    const mesh = this.beamPool.take();
    this._tint(mesh, color);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    mesh.position.set((from.x + to.x) / 2, 1.1, (from.z + to.z) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.scaling.set(width, width, len);
    this._push({ mesh, pool: this.beamPool, t: 0, dur, kind: 'beam' });
  }

  update(delta) {
    // 다 쓴 파티클 시스템 회수
    if (this.sparkBusy) {
      this.sparkFree = this.sparkFree || [];
      for (let i = this.sparkBusy.length - 1; i >= 0; i--) {
        const b = this.sparkBusy[i];
        b.t -= delta;
        if (b.t <= 0) {
          b.ps.stop();
          this.sparkFree.push(b.ps);
          this.sparkBusy.splice(i, 1);
        }
      }
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.t += delta;
      const p = Math.min(1, e.t / e.dur);

      if (e.kind === 'circle') {
        e.mesh.rotation.y += e.spin * delta;
        const s = e.base * (0.7 + 0.3 * Math.min(1, p * 3));
        e.mesh.scaling.setAll(s);
        e.mesh.material.alpha = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;
      } else if (e.kind === 'burst') {
        e.mesh.scaling.setAll(e.base * (0.4 + 1.2 * p));
        e.mesh.material.alpha = 1 - p;
      } else if (e.kind === 'slash') {
        e.mesh.scaling.setAll(e.base * (0.5 + 0.6 * p));
        e.mesh.material.alpha = (1 - p) * 0.85;
      } else if (e.kind === 'shock') {
        e.mesh.scaling.setAll(e.base * (0.2 + 0.8 * p));
        e.mesh.material.alpha = (1 - p) * 0.8;
      } else if (e.kind === 'aura') {
        if (e.follow) {
          e.mesh.position.set(e.follow.position.x, e.follow.position.y + 1.0, e.follow.position.z);
        }
        // 숨쉬듯 맥동하고 끝에서만 사라진다
        const pulse = 1 + Math.sin(e.t * 6) * 0.045;
        e.mesh.scaling.setAll(e.base * pulse);
        e.mesh.material.alpha = 0.3 * (p > 0.85 ? (1 - p) / 0.15 : 1);
      } else if (e.kind === 'field') {
        // 천천히 회전하며 불규칙하게 일렁인다
        e.mesh.rotation.y += 0.5 * delta;
        const grow = Math.min(1, p * 5);
        const flick = 1 + Math.sin(e.t * 11) * 0.05 + Math.sin(e.t * 6.7) * 0.03;
        e.mesh.scaling.setAll(e.base * (0.3 + 0.7 * grow) * flick);
        e.mesh.material.alpha = (p > 0.8 ? (1 - p) / 0.2 : 0.85) * (0.85 + Math.sin(e.t * 9) * 0.15);
        // 불티가 계속 피어오른다
        e.emberT -= delta;
        if (e.emberT <= 0) {
          e.emberT = 0.22;
          const a = Math.random() * Math.PI * 2;
          const rr = Math.sqrt(Math.random()) * e.base * 0.85;
          this.sparks(
            { x: e.pos.x + Math.cos(a) * rr, y: 0, z: e.pos.z + Math.sin(a) * rr },
            { count: 5, color: e.color, power: 3.2, size: 0.22, spread: 'up' }
          );
        }
      } else if (e.kind === 'nova') {
        // 빠르게 튀어나갔다가 급히 옅어진다
        const ease = 1 - Math.pow(1 - p, 3);
        e.mesh.scaling.setAll(e.base * (0.15 + 0.95 * ease));
        e.mesh.material.alpha = Math.pow(1 - p, 1.6);
      } else if (e.kind === 'beam') {
        e.mesh.material.alpha = 1 - p;
      }

      if (p >= 1) {
        e.pool.give(e.mesh);
        this.live.splice(i, 1);
      }
    }
  }
}
