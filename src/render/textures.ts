// 캔버스로 굽는 절차 텍스처: 자갈 강변, 돌 표면, 건물 창문.
// 블렌더에서 구운 텍스처가 생기면 같은 자리에 갈아 끼운다.
import * as THREE from 'three';
import { makeNoise } from './noise';

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 자갈이 빽빽한 강변 (색 + 높이). 이어 붙여도 이음새가 없게 가장자리를 감싸 그린다 */
export function pebbleBeach(base: number, seed: number, size = 1024): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const [cc, cx] = canvas(size);
  const [hc, hx] = canvas(size);
  const n = makeNoise(seed);
  const baseCol = new THREE.Color(base);
  const sand = baseCol.clone().multiplyScalar(0.55);
  cx.fillStyle = `#${sand.getHexString()}`;
  cx.fillRect(0, 0, size, size);
  hx.fillStyle = '#000';
  hx.fillRect(0, 0, size, size);
  // 모래 알갱이
  const img = cx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 0.75 + n.rand() * 0.5;
    img.data[i] *= v;
    img.data[i + 1] *= v;
    img.data[i + 2] *= v;
  }
  cx.putImageData(img, 0, 0);
  const count = Math.round(size * size / 260);
  const hsl = { h: 0, s: 0, l: 0 };
  baseCol.getHSL(hsl);
  for (let k = 0; k < count; k++) {
    const big = k < count * 0.25;
    const r = (big ? 14 + n.rand() * 22 : 5 + n.rand() * 12) * (size / 1024);
    const x = n.rand() * size, y = n.rand() * size;
    const asp = 0.55 + n.rand() * 0.45;
    const rot = n.rand() * Math.PI;
    const col = new THREE.Color().setHSL(
      hsl.h + (n.rand() - 0.5) * 0.08,
      Math.max(0, hsl.s * (0.4 + n.rand() * 0.9)),
      Math.min(0.92, hsl.l * (0.55 + n.rand() * 0.75)),
    );
    // 가끔 흰 석영, 붉은 돌
    if (n.rand() < 0.05) col.setHSL(0.08, 0.05, 0.82);
    else if (n.rand() < 0.04) col.setHSL(0.03, 0.3, 0.38);
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const px = x + ox, py = y + oy;
      if (px < -r * 2 || px > size + r * 2 || py < -r * 2 || py > size + r * 2) continue;
      cx.save();
      cx.translate(px, py);
      cx.rotate(rot);
      cx.scale(1, asp);
      // 그림자 틈
      cx.fillStyle = 'rgba(0,0,0,0.35)';
      cx.beginPath(); cx.arc(1.5, 2.5, r * 1.06, 0, Math.PI * 2); cx.fill();
      const g = cx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r);
      g.addColorStop(0, `#${col.clone().offsetHSL(0, 0, 0.12).getHexString()}`);
      g.addColorStop(0.7, `#${col.getHexString()}`);
      g.addColorStop(1, `#${col.clone().multiplyScalar(0.6).getHexString()}`);
      cx.fillStyle = g;
      cx.beginPath(); cx.arc(0, 0, r, 0, Math.PI * 2); cx.fill();
      // 높이
      const hg = hx.createRadialGradient(0, 0, 0, 0, 0, r);
      hg.addColorStop(0, `rgb(${big ? 255 : 200},${big ? 255 : 200},${big ? 255 : 200})`);
      hg.addColorStop(0.75, 'rgb(120,120,120)');
      hg.addColorStop(1, 'rgb(0,0,0)');
      hx.save();
      hx.translate(px, py); hx.rotate(rot); hx.scale(1, asp);
      hx.fillStyle = hg;
      hx.beginPath(); hx.arc(0, 0, r, 0, Math.PI * 2); hx.fill();
      hx.restore();
      cx.restore();
    }
  }
  return { map: tex(cc, true), bump: tex(hc, false) };
}

/** 던지는 돌의 표면: 반점·결이 있는 색, 거칠기, 법선 */
export function stoneSurface(base: number, seed: number, veins: boolean, size = 256) {
  const n = makeNoise(seed);
  const [cc, cx] = canvas(size);
  const [rc, rx] = canvas(size);
  const [nc, nx] = canvas(size);
  const col = cx.createImageData(size, size);
  const rough = rx.createImageData(size, size);
  const nor = nx.createImageData(size, size);
  const h = new Float32Array(size * size);
  const b = new THREE.Color(base);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * 6, v = y / size * 6;
    let f = n.fbm(u, v, 5);
    if (veins) f += Math.pow(1 - Math.abs(n.fbm(u * 0.6 + 3, v * 0.6, 4)), 12) * 0.9;
    const speck = n.rand() < 0.03 ? 0.25 : 0;
    h[y * size + x] = f;
    const k = 0.78 + f * 0.45 + speck;
    const i = (y * size + x) * 4;
    col.data[i] = Math.min(255, b.r * 255 * k);
    col.data[i + 1] = Math.min(255, b.g * 255 * k);
    col.data[i + 2] = Math.min(255, b.b * 255 * k);
    col.data[i + 3] = 255;
    const r = Math.max(0, Math.min(255, (0.55 + f * 0.5) * 255));
    rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = r;
    rough.data[i + 3] = 255;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hl = h[y * size + ((x + size - 1) % size)], hr = h[y * size + ((x + 1) % size)];
    const hd = h[((y + size - 1) % size) * size + x], hu = h[((y + 1) % size) * size + x];
    const v = new THREE.Vector3((hl - hr) * 3, (hd - hu) * 3, 1).normalize();
    const i = (y * size + x) * 4;
    nor.data[i] = (v.x * 0.5 + 0.5) * 255;
    nor.data[i + 1] = (v.y * 0.5 + 0.5) * 255;
    nor.data[i + 2] = (v.z * 0.5 + 0.5) * 255;
    nor.data[i + 3] = 255;
  }
  cx.putImageData(col, 0, 0);
  rx.putImageData(rough, 0, 0);
  nx.putImageData(nor, 0, 0);
  return { map: tex(cc, true), roughness: tex(rc, false), normal: tex(nc, false) };
}

/** 밤 도시 건물 창문 (발광 맵) */
export function windows(seed: number, size = 256): THREE.CanvasTexture {
  const n = makeNoise(seed);
  const [c, x] = canvas(size);
  x.fillStyle = '#000';
  x.fillRect(0, 0, size, size);
  const cols = 16, rows = 32;
  const w = size / cols, hh = size / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (n.rand() < 0.42) continue;
    const warm = n.rand();
    const l = 0.45 + n.rand() * 0.55;
    x.fillStyle = warm < 0.7 ? `rgba(255,${200 + warm * 40},${130 + warm * 60},${l})` : `rgba(190,220,255,${l})`;
    x.fillRect(i * w + w * 0.18, j * hh + hh * 0.2, w * 0.64, hh * 0.55);
  }
  return tex(c, true);
}
