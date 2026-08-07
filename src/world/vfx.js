import {
  MeshBuilder, StandardMaterial, Color3, Engine, Mesh
} from '@babylonjs/core';

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

    this.discPool = new Pool(scene, (s) => {
      const d = MeshBuilder.CreateDisc('vfxDisc', { radius: 1, tessellation: 40 }, s);
      d.rotation.x = Math.PI / 2;
      d.isPickable = false;
      d.applyFog = false;
      d.material = vfxMaterial(s, 'disc' + Math.random(), '#ffffff');
      d.setEnabled(false);
      return d;
    });
    this.ringPool = new Pool(scene, (s) => {
      const r = MeshBuilder.CreateDisc('vfxRing', { radius: 1, tessellation: 48, arc: 0.5 }, s);
      r.rotation.x = Math.PI / 2;
      r.isPickable = false;
      r.applyFog = false;
      r.material = vfxMaterial(s, 'ring' + Math.random(), '#ffffff');
      r.setEnabled(false);
      return r;
    });
    this.puffPool = new Pool(scene, (s) => {
      const p = MeshBuilder.CreatePlane('vfxPuff', { size: 1 }, s);
      p.billboardMode = Mesh.BILLBOARDMODE_ALL;
      p.isPickable = false;
      p.applyFog = false;
      p.material = vfxMaterial(s, 'puff' + Math.random(), '#ffffff');
      p.setEnabled(false);
      return p;
    });

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

  update(delta) {
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
      }

      if (p >= 1) {
        e.pool.give(e.mesh);
        this.live.splice(i, 1);
      }
    }
  }
}
