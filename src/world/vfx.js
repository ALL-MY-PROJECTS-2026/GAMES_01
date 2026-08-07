import {
  MeshBuilder, StandardMaterial, Color3, Color4, Engine, Mesh, ParticleSystem, Vector3
} from '@babylonjs/core';
import {
  makeRuneTexture, makeGlowTexture, makeSparkTexture, makeSlashTexture, makeNoiseTexture,
  makeShockRingTexture, makeFireFieldTexture
} from './vfx_textures.js';

// 마법·타격 이펙트 (STACK.md §9)
// 규칙: 라이팅 계산 금지 · 깊이 쓰기 끔 · 오브젝트 풀링 · 동시 개수 상한 · 고정 스텝 시계 사용
const MAX_LIVE = 48;   // 모바일 오버드로우 방어 — 초과 시 가장 오래된 것부터 회수

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
    mesh.rotation.set(0, Math.atan2(dx, dz), 0);
    mesh.scaling.set(width, width, len);
    this._push({ mesh, pool: this.beamPool, t: 0, dur, kind: 'beam' });
  }

  /** 기울어진 빛줄기 — 유성·낙뢰·화살길처럼 3차원으로 뻗는 선 */
  bolt3(from, to, { width = 0.16, color = '#ffffff', dur = 0.24, kind = 'trail', delay = 0 } = {}) {
    const mesh = this.beamPool.take();
    this._tint(mesh, color);
    const fy = from.y || 0;
    const ty = to.y || 0;
    const len = Math.max(0.001, Math.hypot(to.x - from.x, ty - fy, to.z - from.z));
    mesh.position.set((from.x + to.x) / 2, (fy + ty) / 2, (from.z + to.z) / 2);
    mesh.lookAt(new Vector3(to.x, ty, to.z));
    mesh.scaling.set(width, width, len);
    if (delay > 0) mesh.material.alpha = 0;
    this._push({ mesh, pool: this.beamPool, t: 0, dur, kind, delay });
  }

  /** 유성 — 비스듬히 떨어져 지면에서 터진다 */
  meteor(pos, { color = '#ff7a4e', size = 2.4 } = {}) {
    const from = { x: pos.x - 4.5, y: 17, z: pos.z - 6 };
    const to = { x: pos.x, y: 0.3, z: pos.z };
    this.bolt3(from, to, { width: 1.0, color: '#ffe9a8', dur: 0.16 });
    this.bolt3(from, to, { width: 0.5, color, dur: 0.24 });
    this.shockwave(pos, { radius: size * 1.7, color, dur: 0.45 });
    this.burst(pos, { size, color, dur: 0.34 });
    this.sparks({ x: pos.x, y: 0, z: pos.z },
      { count: 18, color, power: 9, size: 0.3, spread: 'up' });
  }

  /** 화살비 — 가는 화살이 촘촘히 비스듬히 꽂힌다 */
  arrowFall(pos, { color = '#ffd27a', count = 6, radius = 1.8 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * radius;
      const gx = pos.x + Math.cos(a) * rr;
      const gz = pos.z + Math.sin(a) * rr;
      this.bolt3({ x: gx - 1.3, y: 13, z: gz - 1.7 }, { x: gx, y: 0.15, z: gz },
        { width: 0.1, color, dur: 0.2, delay: i * 0.035 });
    }
    this.sparks({ x: pos.x, y: 0, z: pos.z },
      { count: 8, color, power: 4, size: 0.18, spread: 'flat' });
  }

  /** 낙뢰 — 지그재그로 머리 위에 내리꽂힌다 */
  lightning(pos, { color = '#a9d4ff' } = {}) {
    let prev = { x: pos.x + (Math.random() - 0.5) * 1.4, y: 13, z: pos.z + (Math.random() - 0.5) * 1.4 };
    for (let i = 1; i <= 3; i++) {
      const t = i / 3;
      const nx = pos.x + (1 - t) * (Math.random() - 0.5) * 2.6;
      const nz = pos.z + (1 - t) * (Math.random() - 0.5) * 2.6;
      const ny = 13 * (1 - t) + 0.2;
      this.bolt3(prev, { x: nx, y: ny, z: nz },
        { width: 0.13 + 0.09 * t, color, dur: 0.18 });
      prev = { x: nx, y: ny, z: nz };
    }
    this.sparks({ x: pos.x, y: 0.3, z: pos.z }, { count: 12, color, power: 7, size: 0.22 });
  }

  /** 선풍참 — 칼바람이 몸을 축으로 여러 겹 돈다 */
  whirl(pos, { radius = 4.2, color = '#cfe4ff' } = {}) {
    for (let i = 0; i < 3; i++) {
      const mesh = this.discPool.take();
      this._tint(mesh, color);
      mesh.position.set(pos.x, 0.7 + i * 0.5, pos.z);
      mesh.rotation.set(Math.PI / 2, 0, i * 2.1);
      mesh.scaling.setAll(radius * 0.5);
      this._push({ mesh, pool: this.discPool, t: 0, dur: 0.5, kind: 'whirl',
        base: radius, spin: 15 - i * 3, delay: i * 0.07 });
    }
    this.sparks({ x: pos.x, y: 0.5, z: pos.z },
      { count: 16, color, power: 6, size: 0.22, spread: 'flat' });
  }

  /** 지진격 — 파문이 겹쳐 퍼지고 돌덩이가 솟는다 */
  quake(pos, { radius = 4.8, color = '#c8a06a' } = {}) {
    for (let i = 0; i < 3; i++) {
      const mesh = this.novaPool.take();
      this._tint(mesh, color);
      mesh.position.set(pos.x, 0.06 + i * 0.01, pos.z);
      mesh.scaling.setAll(radius * 0.15);
      this._push({ mesh, pool: this.novaPool, t: 0, dur: 0.6, kind: 'nova',
        base: radius * (0.7 + i * 0.25), delay: i * 0.1 });
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.random();
      const rr = radius * 0.55;
      const gx = pos.x + Math.cos(a) * rr;
      const gz = pos.z + Math.sin(a) * rr;
      this.bolt3({ x: gx, y: 0, z: gz }, { x: gx, y: 2.2 + Math.random(), z: gz },
        { width: 0.42, color, dur: 0.4 });
    }
    this.sparks({ x: pos.x, y: 0, z: pos.z },
      { count: 24, color, power: 8, size: 0.3, spread: 'up' });
  }

  /** 돌풍격 — 지나간 길에 바람 자국이 남는다 */
  gust(pos, facingY, dist, { color = '#ffd27a' } = {}) {
    const fx = Math.sin(facingY);
    const fz = Math.cos(facingY);
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 0.85;
      const y = 0.7 + i * 0.35;
      this.bolt3(
        { x: pos.x - fz * off, y, z: pos.z + fx * off },
        { x: pos.x + fx * dist - fz * off, y, z: pos.z + fz * dist + fx * off },
        { width: 0.17, color, dur: 0.3, delay: i * 0.04 }
      );
    }
    this.shockwave(pos, { radius: 3, color, dur: 0.3 });
  }

  /** 풍신보 — 뒤로 빠지며 잔상이 흩어진다 */
  windTrail(pos, facingY, { color = '#9fe4ff' } = {}) {
    const fx = Math.sin(facingY);
    const fz = Math.cos(facingY);
    for (let i = 0; i < 4; i++) {
      this.burst({ x: pos.x + fx * i * 1.1, z: pos.z + fz * i * 1.1 },
        { size: 1.4 - i * 0.22, color, dur: 0.3 + i * 0.05 });
    }
    this.circle(pos, { radius: 1.8, color, dur: 0.5 });
  }

  /** 관통시 — 화살길을 따라 빛줄기가 남는다 */
  lance(origin, dir, len, { color = '#ffd666' } = {}) {
    const y = origin.y || 1.15;
    const to = { x: origin.x + dir.x * len, y, z: origin.z + dir.z * len };
    this.bolt3({ x: origin.x, y, z: origin.z }, to, { width: 0.17, color, dur: 0.26 });
    this.bolt3({ x: origin.x, y, z: origin.z }, to, { width: 0.05, color: '#ffffff', dur: 0.34 });
    this.sparks({ x: origin.x, y: 0.4, z: origin.z }, { count: 8, color, power: 5, size: 0.2 });
  }

  /** 연사 — 부채꼴 섬광이 두 겹으로 퍼진다 */
  fan(pos, facingY, { color = '#ffe9a8', radius = 4 } = {}) {
    for (let i = 0; i < 2; i++) {
      const mesh = this.discPool.take();
      this._tint(mesh, color);
      mesh.position.set(pos.x, 1.0 + i * 0.25, pos.z);
      mesh.rotation.set(Math.PI / 2, 0, -facingY);
      mesh.scaling.setAll(radius * 0.4);
      this._push({ mesh, pool: this.discPool, t: 0, dur: 0.32, kind: 'slash',
        base: radius * (1 + i * 0.3), delay: i * 0.06 });
    }
  }

  /** 절족시 — 발밑에 거미줄이 깔려 한동안 남는다 */
  snare(pos, { radius = 1.8, color = '#9fdca8' } = {}) {
    const mesh = this.ringPool.take();
    this._tint(mesh, color);
    mesh.position.set(pos.x, 0.05, pos.z);
    mesh.rotation.set(Math.PI / 2, Math.random() * Math.PI, 0);
    mesh.scaling.setAll(radius);
    this._push({ mesh, pool: this.ringPool, t: 0, dur: 1.4, kind: 'circle',
      spin: -0.7, base: radius });
    this.sparks({ x: pos.x, y: 0, z: pos.z },
      { count: 8, color, power: 3, size: 0.18, spread: 'flat' });
  }

  /** 기합 — 함성 고리가 발밑에서 솟아오른다 */
  cry(pos, { color = '#ffb03a' } = {}) {
    for (let i = 0; i < 3; i++) {
      const mesh = this.novaPool.take();
      this._tint(mesh, color);
      mesh.position.set(pos.x, 0.4, pos.z);
      mesh.scaling.setAll(1);
      this._push({ mesh, pool: this.novaPool, t: 0, dur: 0.85, kind: 'rise',
        base: 3.4, delay: i * 0.15 });
    }
    this.sparks({ x: pos.x, y: 0.6, z: pos.z },
      { count: 14, color, power: 5, size: 0.24, spread: 'up' });
  }

  /** 빙백진 보강 — 파문 둘레에 얼음 가시가 솟는다 */
  frostSpikes(pos, radius, color) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
      const gx = pos.x + Math.cos(a) * radius * 0.72;
      const gz = pos.z + Math.sin(a) * radius * 0.72;
      this.bolt3({ x: gx, y: 0, z: gz }, { x: gx, y: 1.6 + Math.random() * 0.8, z: gz },
        { width: 0.3, color, dur: 0.5, delay: i * 0.03 });
    }
  }

  /** 조준 보조 — 사거리 원과 착탄 범위를 상시 표시한다 (풀에서 빼두고 계속 재사용) */
  aimRing(kind, pos, radius, color) {
    this._aim = this._aim || {};
    let m = this._aim[kind];
    if (!m) {
      m = this.novaPool.take();
      m.material.alphaMode = Engine.ALPHA_ADD;
      this._aim[kind] = m;
    }
    m.setEnabled(true);
    m.material.emissiveColor = Color3.FromHexString(color);
    m.material.alpha = kind === 'range' ? 0.12 : 0.4;
    m.position.set(pos.x, 0.04, pos.z);
    m.scaling.setAll(radius);
  }

  hideAim(kind) {
    if (this._aim && this._aim[kind]) this._aim[kind].setEnabled(false);
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
      // delay가 남아 있으면 아직 보이지 않는다 (연속 타격의 시차 연출)
      if (e.delay > 0) {
        e.delay -= delta;
        e.mesh.material.alpha = 0;
        continue;
      }
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
      } else if (e.kind === 'trail') {
        e.mesh.material.alpha = Math.pow(1 - p, 1.4);
      } else if (e.kind === 'whirl') {
        e.mesh.rotation.z += e.spin * delta;
        e.mesh.scaling.setAll(e.base * (0.5 + 0.55 * p));
        e.mesh.material.alpha = (1 - p) * 0.9;
      } else if (e.kind === 'rise') {
        e.mesh.position.y = 0.4 + p * 2.4;
        e.mesh.scaling.setAll(e.base * (0.3 + 0.9 * p));
        e.mesh.material.alpha = Math.pow(1 - p, 1.2) * 0.9;
      }

      if (p >= 1) {
        e.pool.give(e.mesh);
        this.live.splice(i, 1);
      }
    }
  }
}
