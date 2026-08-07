import { Texture } from '@babylonjs/core';

// 팔레트 아틀라스를 색조(hue) 기준으로 갈아입힌다. 색을 하나하나 대응시키는 대신
// "이 색조 구간을 저 색조로" 규칙만 주면 그라데이션·AA 픽셀까지 한 번에 처리된다.
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/**
 * @param rules [{ from:[h0,h1], to:number, satMul?:number, lightMul?:number }]
 */
export async function recolorTexture(scene, url, rules, name = 'recolored') {
  const img = new Image();
  img.src = url;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (s < 0.12) continue; // 무채색(금속·가죽 음영)은 건드리지 않는다
    for (const rule of rules) {
      const [h0, h1] = rule.from;
      if (h >= h0 && h <= h1) {
        const [r, g, b] = hslToRgb(
          rule.to,
          Math.min(1, s * (rule.satMul || 1)),
          Math.min(1, l * (rule.lightMul || 1))
        );
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
        break;
      }
    }
  }
  ctx.putImageData(data, 0, 0);

  const tex = new Texture(canvas.toDataURL('image/png'), scene, false, false);
  tex.name = name;
  return tex;
}
