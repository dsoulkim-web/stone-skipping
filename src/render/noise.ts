// 지형·텍스처용 결정적 노이즈 (값 노이즈 + fbm + 능선 노이즈).
export function makeNoise(seed: number) {
  const perm = new Uint8Array(512);
  let s = seed >>> 0 || 1;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = new Float32Array(256).map(() => r() * 2 - 1);
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const h = (x: number, y: number) => vals[perm[(perm[x & 255] + y) & 511]];

  /** -1~1 */
  function n2(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = fade(x - xi), fy = fade(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x: number, y: number, oct = 5): number {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += n2(x * f + i * 17.3, y * f - i * 9.1) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }
  /** 0~1, 날카로운 산 능선 */
  function ridged(x: number, y: number, oct = 6): number {
    let sum = 0, amp = 0.5, f = 1, norm = 0, w = 1;
    for (let i = 0; i < oct; i++) {
      let v = 1 - Math.abs(n2(x * f + i * 31.7, y * f + i * 11.3));
      v *= v;
      sum += v * amp * w;
      w = Math.min(1, v * 1.6);
      norm += amp;
      amp *= 0.5;
      f *= 2.1;
    }
    return sum / norm;
  }
  return { n2, fbm, ridged, rand: r };
}
export type Noise = ReturnType<typeof makeNoise>;
