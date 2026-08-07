import { DynamicTexture } from '@babylonjs/core';

// 절차적 VFX 텍스처 (STACK.md §9) — 다운로드 없이 코드로 생성한다.
// 단색 도형만 쓰면 밋밋하므로 문양·감쇠·노이즈를 넣어 밀도를 만든다.

/** 마법진 — 이중 링 + 눈금 + 룬 글리프 */
export function makeRuneTexture(scene, size = 512) {
  const tex = new DynamicTexture('vfxRune', { width: size, height: size }, scene, true);
  const g = tex.getContext();
  const c = size / 2;
  g.clearRect(0, 0, size, size);
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.lineWidth = size * 0.012;

  // 바깥 링 2개
  for (const rr of [0.47, 0.40]) {
    g.beginPath();
    g.arc(c, c, size * rr, 0, Math.PI * 2);
    g.stroke();
  }
  // 눈금 — 바깥 링 사이를 채운다
  g.lineWidth = size * 0.008;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const long = i % 4 === 0;
    const r0 = size * 0.40;
    const r1 = size * (long ? 0.47 : 0.435);
    g.beginPath();
    g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    g.stroke();
  }
  // 안쪽 링 + 삼각형 문양
  g.lineWidth = size * 0.014;
  g.beginPath();
  g.arc(c, c, size * 0.28, 0, Math.PI * 2);
  g.stroke();
  for (const rot of [0, Math.PI / 3]) {
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = rot + (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = c + Math.cos(a) * size * 0.27;
      const y = c + Math.sin(a) * size * 0.27;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
  }
  // 룬 점
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.arc(c + Math.cos(a) * size * 0.34, c + Math.sin(a) * size * 0.34, size * 0.014, 0, Math.PI * 2);
    g.fill();
  }
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** 부드러운 원형 글로우 — 폭발·타격의 바탕 */
export function makeGlowTexture(scene, size = 256) {
  const tex = new DynamicTexture('vfxGlow', { width: size, height: size }, scene, true);
  const g = tex.getContext();
  const c = size / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** 파편/불티 — 파티클용 별 모양 */
export function makeSparkTexture(scene, size = 128) {
  const tex = new DynamicTexture('vfxSpark', { width: size, height: size }, scene, true);
  const g = tex.getContext();
  const c = size / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c * 0.5);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // 십자 섬광
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = size * 0.035;
  g.beginPath();
  g.moveTo(c, size * 0.08); g.lineTo(c, size * 0.92);
  g.moveTo(size * 0.08, c); g.lineTo(size * 0.92, c);
  g.stroke();
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** 베기 궤적 — 안쪽이 진하고 바깥으로 흩어지는 띠 */
export function makeSlashTexture(scene, size = 256) {
  const tex = new DynamicTexture('vfxSlash', { width: size, height: size }, scene, true);
  const g = tex.getContext();
  const c = size / 2;
  const grad = g.createRadialGradient(c, c, size * 0.18, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.25)');
  grad.addColorStop(0.82, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** 지글거리는 노이즈 — 장판·오라의 일렁임 */
export function makeNoiseTexture(scene, size = 128) {
  const tex = new DynamicTexture('vfxNoise', { width: size, height: size }, scene, true);
  const g = tex.getContext();
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 값 노이즈를 몇 겹 겹쳐 구름처럼
      let v = 0;
      let amp = 0.6;
      let f = 4;
      for (let o = 0; o < 3; o++) {
        const sx = Math.sin((x / size) * f * Math.PI * 2 + o * 1.7);
        const sy = Math.cos((y / size) * f * Math.PI * 2 + o * 2.3);
        v += (sx * sy) * amp;
        amp *= 0.5;
        f *= 2;
      }
      const a = Math.max(0, Math.min(1, 0.5 + v * 0.6));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** 얇고 날카로운 링 — 빙백진의 파문 */
export function makeShockRingTexture(scene, size = 256) {
  const tex = new DynamicTexture('vfxShockRing', { width: size, height: size }, scene, true);
  const g = tex.getContext();
  const c = size / 2;
  const grad = g.createRadialGradient(c, c, size * 0.34, c, c, c * 0.98);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0.15)');
  grad.addColorStop(0.90, 'rgba(255,255,255,1)');
  grad.addColorStop(0.97, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // 서릿발 — 바깥으로 뻗는 가시
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = size * 0.012;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * size * 0.36, c + Math.sin(a) * size * 0.36);
    g.lineTo(c + Math.cos(a) * size * 0.47, c + Math.sin(a) * size * 0.47);
    g.stroke();
  }
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** 불바다 — 얼룩덜룩한 화염 바닥 */
export function makeFireFieldTexture(scene, size = 256) {
  const tex = new DynamicTexture('vfxFireField', { width: size, height: size }, scene, true);
  const g = tex.getContext();
  const c = size / 2;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const d = Math.sqrt(dx * dx + dy * dy);
      // 가장자리로 갈수록 옅어지고, 불규칙한 불꽃 얼룩을 넣는다
      let n = 0;
      let amp = 0.6;
      let f = 3;
      for (let o = 0; o < 3; o++) {
        n += Math.sin(dx * f * 3.1 + o * 2.1) * Math.cos(dy * f * 3.1 + o * 1.3) * amp;
        amp *= 0.5;
        f *= 2.1;
      }
      const edge = Math.max(0, 1 - d);
      const a = Math.max(0, Math.min(1, edge * (0.55 + n * 0.75)));
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}
