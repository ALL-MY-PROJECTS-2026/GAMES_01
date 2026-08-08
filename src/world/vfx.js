import {
  MeshBuilder, StandardMaterial, Color3, Color4, Engine, Mesh, ParticleSystem, Vector3
} from '@babylonjs/core';
import {
  makeRuneTexture, makeGlowTexture, makeSparkTexture, makeSlashTexture, makeNoiseTexture,
  makeShockRingTexture, makeFireFieldTexture, makeKenneyTextures, PROC_FALLBACK
} from './vfx_textures.js';

// 마법·타격 이펙트 (STACK.md §9)
// 규칙: 라이팅 계산 금지 · 깊이 쓰기 끔 · 오브젝트 풀링 · 동시 개수 상한 · 고정 스텝 시계 사용
// 모바일 오버드로우 방어 — 초과 시 가장 오래된 것부터 회수.
// 술법 하나가 링·섬광·연기·자국을 겹쳐 쓰면서 조각 수가 늘어 상한을 올렸다.
const MAX_LIVE = 80;

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

    // 텍스처 두 벌 — 같은 키를 쓰므로 통째로 갈아끼워 비교할 수 있다 (T 키)
    //   kenney : Kenney Particle Pack (CC0) 스프라이트 — 기본 (STACK.md §9)
    //   proc   : 절차적 생성, 다운로드 0KB. 대응이 없는 키는 근사값으로 접힌다
    const proc = {
      rune: makeRuneTexture(scene),
      glow: makeGlowTexture(scene),
      spark: makeSparkTexture(scene),
      slash: makeSlashTexture(scene),
      noise: makeNoiseTexture(scene),
      shockRing: makeShockRingTexture(scene),
      fireField: makeFireFieldTexture(scene)
    };
    for (const [key, near] of Object.entries(PROC_FALLBACK)) proc[key] = proc[near];
    this.texSets = { proc, kenney: makeKenneyTextures(scene) };
    this.texSet = 'kenney';
    this.tex = this.texSets.kenney;
    // 갈아끼울 때 되짚어야 하므로 어떤 재질이 어떤 키를 쓰는지 기억해 둔다
    this._bound = [];
    this._sparkSystems = [];

    // 지염장 — 머무는 불바다 (얼룩 텍스처, 느리게 회전)
    this.fieldPool = new Pool(scene, (s) => {
      const f = MeshBuilder.CreateDisc('vfxField', { radius: 1, tessellation: 40 }, s);
      f.rotation.x = Math.PI / 2;
      f.isPickable = false;
      f.applyFog = false;
      f.material = vfxMaterial(s, 'field' + Math.random(), '#ffffff');
      this._bindTex(f.material, 'fireField');
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
      this._bindTex(n.material, 'shockRing');
      n.setEnabled(false);
      return n;
    });
    this.discPool = new Pool(scene, (s) => {
      const d = MeshBuilder.CreateDisc('vfxDisc', { radius: 1, tessellation: 40 }, s);
      d.rotation.x = Math.PI / 2;
      d.isPickable = false;
      d.applyFog = false;
      d.material = vfxMaterial(s, 'disc' + Math.random(), '#ffffff');
      this._bindTex(d.material, 'slash');
      d.setEnabled(false);
      return d;
    });
    this.ringPool = new Pool(scene, (s) => {
      const r = MeshBuilder.CreateDisc('vfxRing', { radius: 1, tessellation: 48, arc: 0.5 }, s);
      r.rotation.x = Math.PI / 2;
      r.isPickable = false;
      r.applyFog = false;
      r.material = vfxMaterial(s, 'ring' + Math.random(), '#ffffff');
      this._bindTex(r.material, 'rune');
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
      this._bindTex(sp.material, 'noise');
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
      this._bindTex(p.material, 'glow');
      p.setEnabled(false);
      return p;
    });
    // 빛나는 스프라이트 한 장을 아무 그림으로나 쓰는 공용 판 (섬광·소용돌이·문양…)
    this.flarePool = new Pool(scene, (s) => {
      const p = MeshBuilder.CreatePlane('vfxFlare', { size: 1 }, s);
      p.billboardMode = Mesh.BILLBOARDMODE_ALL;
      p.isPickable = false;
      p.applyFog = false;
      p.material = vfxMaterial(s, 'flare' + Math.random(), '#ffffff');
      this._bindTex(p.material, 'star');
      p.setEnabled(false);
      return p;
    });
    // 연기·먼지 — 빛나지 않으므로 가산이 아니라 일반 알파로 섞는다
    this.smokePool = new Pool(scene, (s) => {
      const p = MeshBuilder.CreatePlane('vfxSmoke', { size: 1 }, s);
      p.billboardMode = Mesh.BILLBOARDMODE_ALL;
      p.isPickable = false;
      p.applyFog = false;
      p.material = vfxMaterial(s, 'smoke' + Math.random(), '#ffffff', false);
      this._bindTex(p.material, 'smoke');
      p.setEnabled(false);
      return p;
    });
    // 바닥에 남는 그을음 자국 — 폭발이 지나간 흔적
    this.decalPool = new Pool(scene, (s) => {
      const d = MeshBuilder.CreateDisc('vfxDecal', { radius: 1, tessellation: 24 }, s);
      d.rotation.x = Math.PI / 2;
      d.isPickable = false;
      d.applyFog = false;
      d.material = vfxMaterial(s, 'decal' + Math.random(), '#ffffff', false);
      this._bindTex(d.material, 'scorch');
      d.setEnabled(false);
      return d;
    });
  }

  /** 아무 스프라이트나 한 장 띄워 확대·회전하며 사라지게 한다 */
  flare(pos, { key = 'star', size = 2, color = '#ffffff', dur = 0.3, grow = 1.6,
    spin = 0, y = 1.0 } = {}) {
    const mesh = this.flarePool.take();
    this._useTex(mesh, key);
    this._tint(mesh, color);
    mesh.position.set(pos.x, (pos.y || 0) + y, pos.z);
    mesh.scaling.setAll(size);
    mesh.rotation.z = Math.random() * Math.PI * 2;
    this._push({ mesh, pool: this.flarePool, t: 0, dur, kind: 'flare', base: size, grow, spin });
  }

  /** 연기 한 덩이 — 떠오르며 흩어진다 */
  smoke(pos, { size = 1.6, color = '#8a8676', dur = 0.9, rise = 1.2, grow = 2.0 } = {}) {
    const mesh = this.smokePool.take();
    this._tint(mesh, color);
    mesh.position.set(
      pos.x + (Math.random() - 0.5) * 0.5,
      (pos.y || 0) + 0.7,
      pos.z + (Math.random() - 0.5) * 0.5
    );
    mesh.scaling.setAll(size);
    mesh.rotation.z = Math.random() * Math.PI * 2;
    this._push({ mesh, pool: this.smokePool, t: 0, dur, kind: 'smoke', base: size, grow, rise });
  }

  /** 바닥 그을음 — 천천히 옅어진다 */
  scorch(pos, { radius = 2.2, color = '#2a2320', dur = 2.4, key = 'scorch' } = {}) {
    const mesh = this.decalPool.take();
    this._useTex(mesh, key);
    this._tint(mesh, color);
    mesh.position.set(pos.x, 0.045, pos.z);
    mesh.scaling.setAll(radius);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    this._push({ mesh, pool: this.decalPool, t: 0, dur, kind: 'decal', base: radius });
  }

  /** 불티 — 타격·폭발에 흩날리는 파편. 엔진 내장 파티클을 풀로 돌린다 */
  sparks(pos, { count = 18, color = '#ffd23e', power = 4, size = 0.28, spread = 'burst' } = {}) {
    let ps = this.sparkFree && this.sparkFree.pop();
    if (!ps) {
      ps = new ParticleSystem('vfxSparks', 60, this.scene);
      ps.particleTexture = this.tex.spark;
      this._sparkSystems.push(ps);
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

  /**
   * 재질에 텍스처를 물린다. 어떤 키를 쓰는지 재질에 적어두므로
   * 나중에 세트를 갈아끼우거나(_setTextureSet) 다른 스프라이트로 바꿔도(_useTex) 따라온다.
   */
  _bindTex(mat, key) {
    mat.metadata = { fxKey: key };
    mat.emissiveTexture = this.tex[key];
    mat.opacityTexture = this.tex[key];
    this._bound.push(mat);
  }

  /** 공용 풀에서 꺼낸 메시에 이번만 다른 스프라이트를 물린다 */
  _useTex(mesh, key) {
    const mat = mesh.material;
    mat.metadata = { fxKey: key };
    mat.emissiveTexture = this.tex[key];
    mat.opacityTexture = this.tex[key];
  }

  /**
   * 이펙트 텍스처 세트를 통째로 바꾼다 ('proc' | 'kenney').
   * 이미 만들어진 풀의 재질까지 되짚어야 화면이 바로 바뀐다.
   */
  setTextureSet(name) {
    const set = this.texSets[name];
    if (!set || name === this.texSet) return this.texSet;
    this.texSet = name;
    this.tex = set;
    for (const mat of this._bound) {
      const key = mat.metadata && mat.metadata.fxKey;
      if (!key || !set[key]) continue;
      mat.emissiveTexture = set[key];
      mat.opacityTexture = set[key];
    }
    for (const ps of this._sparkSystems) ps.particleTexture = set.spark;
    return name;
  }

  /** 두 세트를 번갈아 본다 — 어느 쪽이 나은지 눈으로 비교하려고 둔 것 */
  toggleTextureSet() {
    return this.setTextureSet(this.texSet === 'proc' ? 'kenney' : 'proc');
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

  /** A. 바닥 마법진 — 문양이 다른 링 세 겹이 서로 반대로 돈다 */
  circle(pos, { radius = 2, color = '#7fb0ff', dur = 0.9 } = {}) {
    const layers = [
      { key: 'magicRing', k: 1, spin: 2.4 },
      { key: 'rune', k: 0.66, spin: -3.2 },
      { key: 'symbol', k: 0.4, spin: 1.6 }
    ];
    for (const l of layers) {
      const mesh = this.ringPool.take();
      this._useTex(mesh, l.key);
      this._tint(mesh, color);
      mesh.position.set(pos.x, 0.06 + l.k * 0.02, pos.z);
      mesh.scaling.setAll(radius * l.k);
      mesh.rotation.y = Math.random() * Math.PI;
      this._push({ mesh, pool: this.ringPool, t: 0, dur, kind: 'circle',
        spin: l.spin, base: radius * l.k });
    }
  }

  /** D. 타격/폭발 — 섬광 + 확산 + 연기가 겹쳐야 한 방이 무겁게 읽힌다 */
  burst(pos, { size = 1.6, color = '#ffb03a', dur = 0.32, heavy = false } = {}) {
    const mesh = this.puffPool.take();
    this._tint(mesh, color);
    mesh.position.set(pos.x, (pos.y || 0) + 0.9, pos.z);
    mesh.scaling.setAll(size * 0.4);
    this._push({ mesh, pool: this.puffPool, t: 0, dur, kind: 'burst', base: size });
    // 터지는 순간의 날카로운 섬광
    this.flare(pos, { key: 'muzzle', size: size * 0.9, color, dur: dur * 0.55,
      grow: 2.2, y: 0.9 });
    if (heavy) {
      this.flare(pos, { key: 'star', size: size * 1.4, color, dur: dur * 1.1,
        grow: 2.4, spin: 3, y: 0.95 });
      this.smoke(pos, { size: size * 0.7, dur: 0.8, rise: 1.4 });
    }
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
    // 바닥만으로는 납작해 보인다 — 불길과 연기를 세워 올린다
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * radius * 0.7;
      const at = { x: pos.x + Math.cos(a) * rr, z: pos.z + Math.sin(a) * rr };
      this.flare(at, { key: 'flame', size: radius * 0.5, color, dur: dur * 0.6,
        grow: 1.2, y: 0.9 });
    }
    this.scorch(pos, { radius: radius * 0.9, color: '#2a1a12', dur: dur + 1.6 });
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
    // 갈라지는 얼음판과 냉기 소용돌이를 겹친다
    this.flare(pos, { key: 'shard', size: radius * 0.9, color, dur: 0.4, grow: 1.9, y: 0.5 });
    this.flare(pos, { key: 'twirl', size: radius * 0.7, color: '#ffffff', dur: 0.5,
      grow: 2.1, spin: -4, y: 0.7 });
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
    this.burst(pos, { size, color, dur: 0.34, heavy: true });
    this.flare({ x: from.x * 0.35 + to.x * 0.65, z: from.z * 0.35 + to.z * 0.65 },
      { key: 'flame', size: size * 0.9, color, dur: 0.2, grow: 1.4, y: 6 });
    this.scorch(pos, { radius: size * 1.3, dur: 3.0 });
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
    this.flare(pos, { key: 'trace', size: 3.4, color, dur: 0.16, grow: 1.1, y: 3.2 });
    this.flare(pos, { key: 'muzzle', size: 2.2, color: '#ffffff', dur: 0.14, grow: 2.4, y: 0.4 });
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
    this.flare(pos, { key: 'twirl', size: radius * 0.8, color, dur: 0.45,
      grow: 1.8, spin: 9, y: 1.1 });
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
    // 흙먼지가 자욱하게 일고 땅에 자국이 남는다
    for (let i = 0; i < 3; i++) {
      this.smoke(pos, { size: radius * 0.5, color: '#9a8168', dur: 1.0, rise: 0.9, grow: 2.4 });
    }
    this.scorch(pos, { key: 'dirt', radius: radius * 0.8, color: '#6a5540', dur: 2.2 });
  }

  /** 석화술 — 바닥이 갈라지고 돌판이 솟아 굳는다 */
  stoneField(pos, { radius = 5, color = '#c8c0a8' } = {}) {
    this.shockwave(pos, { radius: radius * 1.1, color, dur: 0.5 });
    this.scorch(pos, { key: 'dirt', radius: radius * 0.9, color: '#6b6350', dur: 2.6 });
    // 굳어가는 돌판 — 가장자리를 따라 갈라진 조각이 솟는다
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      const rr = radius * (0.4 + Math.random() * 0.5);
      const at = { x: pos.x + Math.cos(a) * rr, z: pos.z + Math.sin(a) * rr };
      this.flare(at, { key: 'shard', size: 1.5, color, dur: 0.9, grow: 1.15, y: 0.7 });
    }
    this.flare(pos, { key: 'symbol', size: radius * 0.8, color, dur: 0.8, grow: 1.4, y: 0.3 });
    this.sparks({ x: pos.x, y: 0, z: pos.z },
      { count: 14, color: '#9a9078', power: 5, size: 0.26, spread: 'up' });
  }

  /** 치유술 — 발밑에서 빛이 차오른다 */
  heal(target, { color = '#8fe6c8' } = {}) {
    const pos = target.position || target;
    this.circle(pos, { radius: 2.0, color, dur: 1.2 });
    this.aura(target, { radius: 1.3, color, dur: 1.0 });
    // 위로 떠오르는 빛 알갱이
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const at = { x: pos.x + Math.cos(a) * 0.7, z: pos.z + Math.sin(a) * 0.7 };
      this.flare(at, { key: 'star', size: 0.8, color, dur: 0.7, grow: 0.4, y: 0.4 + i * 0.35 });
    }
    this.sparks({ x: pos.x, y: 0, z: pos.z },
      { count: 16, color, power: 3, size: 0.22, spread: 'up' });
  }

  /** 정령시 — 화살이 떠나기 전 정령의 빛이 모인다 */
  spiritCall(pos, { color = '#9fe4ff' } = {}) {
    this.flare(pos, { key: 'twirl', size: 2.0, color, dur: 0.35, grow: 0.5, spin: -7, y: 1.2 });
    this.flare(pos, { key: 'star', size: 1.2, color: '#ffffff', dur: 0.28, grow: 1.6, y: 1.2 });
    this.sparks({ x: pos.x, y: 0.4, z: pos.z },
      { count: 10, color, power: 3, size: 0.2, spread: 'up' });
  }

  /** 봉인시 — 맞은 자리에 부적 문양이 박힌다 */
  seal(pos, { color = '#e8d8a8' } = {}) {
    this.flare(pos, { key: 'symbol', size: 1.8, color, dur: 1.2, grow: 1.1, spin: 1.2, y: 1.1 });
    this.circle(pos, { radius: 1.2, color, dur: 1.0 });
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
      } else if (e.kind === 'flare') {
        // 확 커졌다가 사그라든다. spin이 있으면 돌면서
        e.mesh.scaling.setAll(e.base * (0.5 + (e.grow - 0.5) * p));
        if (e.spin) e.mesh.rotation.z += e.spin * delta;
        e.mesh.material.alpha = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      } else if (e.kind === 'smoke') {
        // 떠오르며 퍼지고 옅어진다
        e.mesh.position.y += e.rise * delta;
        e.mesh.scaling.setAll(e.base * (1 + (e.grow - 1) * p));
        e.mesh.material.alpha = (1 - p) * 0.5;
      } else if (e.kind === 'decal') {
        // 바닥 자국은 크기가 변하지 않고 천천히 지워진다
        e.mesh.material.alpha = p < 0.1 ? (p / 0.1) * 0.7 : (1 - (p - 0.1) / 0.9) * 0.7;
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
