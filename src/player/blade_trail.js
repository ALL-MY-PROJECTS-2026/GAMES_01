import { MeshBuilder, StandardMaterial, Color3, Vector3, Mesh } from '@babylonjs/core';

// 칼 궤적 — 원작처럼 베는 궤도가 눈에 보이도록 칼날이 지나간 자리를 리본으로 남긴다.
const SEGMENTS = 14;

export class BladeTrail {
  constructor(scene, color = '#cfe4ff') {
    this.scene = scene;
    this.life = 0;
    this.samples = []; // { base: Vector3, tip: Vector3 }

    const mat = new StandardMaterial('bladeTrailMat', scene);
    mat.emissiveColor = Color3.FromHexString(color);
    mat.diffuseColor = Color3.FromHexString(color);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.alpha = 0;
    this.mat = mat;

    // 초기 경로(placeholder) — 이후 매 프레임 갱신된다
    const a = [];
    const b = [];
    for (let i = 0; i < SEGMENTS; i++) {
      a.push(new Vector3(0, 0, 0));
      b.push(new Vector3(0, 0.01, 0));
    }
    this.mesh = MeshBuilder.CreateRibbon(
      'bladeTrail',
      { pathArray: [a, b], updatable: true, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    this.mesh.material = mat;
    this.mesh.isPickable = false;
    this.mesh.applyFog = false;
    this.mesh.setEnabled(false);
  }

  start() {
    this.samples.length = 0;
    this.life = 0.32;
  }

  // 매 프레임 칼날의 뿌리·끝 월드 좌표를 기록
  emit(base, tip) {
    this.samples.push({ base: base.clone(), tip: tip.clone() });
    if (this.samples.length > SEGMENTS) this.samples.shift();
  }

  update(delta) {
    if (this.life <= 0) {
      if (this.mesh.isEnabled()) this.mesh.setEnabled(false);
      return;
    }
    this.life -= delta;
    if (this.samples.length < 3) return;

    const a = [];
    const b = [];
    const n = this.samples.length;
    for (let i = 0; i < SEGMENTS; i++) {
      const s = this.samples[Math.min(n - 1, Math.floor((i / (SEGMENTS - 1)) * (n - 1)))];
      a.push(s.base);
      b.push(s.tip);
    }
    this.mesh = MeshBuilder.CreateRibbon('bladeTrail', { pathArray: [a, b], instance: this.mesh });
    this.mesh.setEnabled(true);
    this.mat.alpha = Math.max(0, Math.min(0.85, this.life * 2.6));
  }
}
