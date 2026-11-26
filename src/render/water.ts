// 수면: 평면 반사(실제 장면을 거울 카메라로 렌더) + 프레넬 + 수심에 따른 투명도·물빛
// + 여러 방향 잔물결 + 햇빛 반짝임 + 튕긴 자리에서 퍼지는 분산 물결 링과 포말.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { SHORE_GLSL } from './scenery';

export const MAX_RIPPLES = 48;

const vert = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUv4;
varying vec3 vWorld;
void main() {
  vUv4 = textureMatrix * vec4(position, 1.0);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 color;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uWaves;
uniform float uGlow;
uniform float uNight;
uniform vec3 uAmbient;
uniform vec4 uRipples[${MAX_RIPPLES}]; // x, z, 시작 시각, 세기
${SHORE_GLSL}
varying vec4 vUv4;
varying vec3 vWorld;

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}

// 방향파 하나의 기울기 (진폭 a, 파장 L, 방향 d, 위상속도는 심해파 분산 c = sqrt(gL/2π))
vec2 wave(vec2 p, vec2 d, float L, float a, float t, float lod) {
  float k = 6.2831 / L;
  float c = sqrt(9.81 / k);
  float fade = clamp(1.0 - lod * k * 0.35, 0.0, 1.0);
  return d * (a * k * cos(dot(p, d) * k - c * k * t)) * fade;
}

void main() {
  vec2 p = vWorld.xz;
  float dist = length(cameraPosition - vWorld);
  float lod = length(fwidth(p));
  float w = 0.25 + uWaves * 2.2;

  vec2 g = vec2(0.0);
  g += wave(p, normalize(vec2(0.8, 0.6)), 7.0, 0.035 * w, uTime, lod);
  g += wave(p, normalize(vec2(-0.3, 1.0)), 4.3, 0.022 * w, uTime, lod);
  g += wave(p, normalize(vec2(1.0, -0.2)), 2.6, 0.013 * w, uTime, lod);
  g += wave(p, normalize(vec2(0.2, 0.9)), 1.4, 0.007 * w, uTime, lod);
  g += wave(p, normalize(vec2(-0.7, 0.5)), 0.8, 0.004 * w, uTime, lod);
  g += wave(p, normalize(vec2(0.6, -0.8)), 0.45, 0.0022 * w, uTime, lod);
  g += wave(p, normalize(vec2(-0.9, -0.3)), 0.25, 0.0012 * w, uTime, lod);
  // 바람에 이는 잔결 (패치처럼 뭉쳐 보이게)
  float gust = smoothstep(0.35, 0.8, vn(p * 0.05 + uTime * 0.03));
  g += (vec2(vn(p * 3.1 + uTime * 0.9), vn(p * 3.1 - uTime * 0.7 + 7.0)) - 0.5) * 0.05 * w * gust * clamp(1.0 - lod * 4.0, 0.0, 1.0);

  // 튕긴 자리 물결: 몇 겹의 링이 서로 다른 속도로 퍼진다 (모세관파 + 중력파)
  float foam = 0.0;
  float glow = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.0) continue;
    float age = uTime - r.z;
    if (age < 0.0 || age > 7.0) continue;
    vec2 d = p - r.xy;
    float dd = length(d);
    vec2 dir = d / (dd + 1e-4);
    float amp = r.w * exp(-age * 0.55) / sqrt(dd * 0.6 + 0.4);
    float sum = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float speed = 0.55 + fk * 0.45;
      float rad = age * speed;
      float width = 0.12 + age * 0.12 + fk * 0.05;
      float e0 = (dd - rad) / width; float env = exp(-e0 * e0);
      sum += sin((dd - rad) * (22.0 - fk * 6.0)) * env * (1.0 - fk * 0.25);
      if (k == 0) glow += env * exp(-age * 0.8) * r.w;
    }
    g += dir * sum * amp * 0.5;
    // 가운데 하얀 포말, 시간이 지나며 흩어진다
    float fn = vn(d * 9.0 + r.z * 13.0) * 0.6 + vn(d * 23.0) * 0.4;
    foam += (1.0 - smoothstep(0.0, 0.12 + age * 0.2, dd)) * 0.7 * exp(-age * 1.6) * smoothstep(0.3, 0.7, fn) * r.w;
    float e1 = (dd - age * 0.55) / (0.05 + age * 0.05);
    foam += exp(-e1 * e1) * exp(-age * 2.2) * 0.5 * fn * r.w;
  }

  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 view = normalize(cameraPosition - vWorld);
  float cosT = max(dot(n, view), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

  // 반사: 거울 카메라 렌더 결과를 물결 기울기만큼 일그러뜨린다
  vec2 ruv = vUv4.xy / vUv4.w + n.xz * (0.06 / (1.0 + dist * 0.04));
  vec3 refl = texture2D(tDiffuse, ruv).rgb;

  // 수심에 따른 물빛: 얕으면 바닥이 비치고 깊을수록 진한 색
  float depth = waterDepth(p);
  float viewPath = depth / max(view.y, 0.15);
  float T = exp(-viewPath * 0.55);
  vec3 sunLit = uSunColor * 0.35 * max(uSunDir.y, 0.0) * (1.0 - uNight) + uAmbient;
  vec3 body = mix(uShallow, uDeep, 1.0 - exp(-depth * 0.4)) * sunLit * 1.2;
  // 물결 마루를 통과한 빛 (얕은 옥빛 산란)
  body += uShallow * 0.4 * pow(max(dot(view, -uSunDir) * 0.5 + 0.5, 0.0), 4.0) * max(g.x + g.y, 0.0) * 2.0 * (1.0 - uNight);

  // 햇빛 반짝임: 날카로운 하이라이트 + 넓은 빛길
  vec3 hv = normalize(view + normalize(uSunDir));
  float nh = max(dot(n, hv), 0.0);
  float sunPow = mix(1.0, 0.25, uNight);
  vec3 spec = uSunColor * (pow(nh, 1600.0) * 25.0 + pow(nh, 220.0) * 1.2) * sunPow;

  // 합성 (알파 블렌딩으로 아래 바닥 지형이 비친다)
  float a = F + (1.0 - F) * (1.0 - T);
  vec3 c = (refl * F + body * (1.0 - F) * (1.0 - T)) / max(a, 1e-3);
  c += spec / max(a, 0.2);
  vec3 foamCol = sunLit * 1.4 + uAmbient;
  float fa = clamp(foam, 0.0, 1.0);
  c = mix(c, foamCol, fa);
  a = max(a, fa);
  // 물가 찰랑임
  float edge = (1.0 - smoothstep(0.0, 0.12, depth)) * exp(-dist * 0.02) * (0.5 + 0.5 * sin(uTime * 1.5 + p.x * 0.7 + vn(p * 2.0) * 4.0));
  c = mix(c, foamCol, edge * 0.25);
  a = max(a, edge * 0.3);
  // 과장 연출: 물결 링이 은은하게 빛난다
  c += vec3(0.55, 0.9, 1.0) * glow * uGlow;

  // 대기 원근 (안개)
  float fd = dist * uFogDensity; float fogF = 1.0 - exp(-fd * fd);
  c = mix(c, uFogColor, fogF);
  a = mix(a, 1.0, fogF);
  gl_FragColor = vec4(c * color, a);
}`;

export class Water {
  readonly mesh: Reflector;
  private ripples: THREE.Vector4[];
  private next = 0;
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor(resW: number, resH: number) {
    this.ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0));
    const shader = {
      name: 'StoneWater',
      uniforms: {
        tDiffuse: { value: null },
        color: { value: new THREE.Color(1, 1, 1) },
        textureMatrix: { value: null },
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color() },
        uShallow: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 0.4, -1) },
        uSunColor: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
        uFogDensity: { value: 0.001 },
        uWaves: { value: 0.1 },
        uGlow: { value: 0.3 },
        uNight: { value: 0 },
        uAmbient: { value: new THREE.Color(0.2, 0.25, 0.3) },
        uRipples: { value: this.ripples },
        uCurve: { value: 0 },
        uFar: { value: 80 },
        uNearSlope: { value: 0.2 },
        uFarSlope: { value: 0.3 },
      },
      vertexShader: vert,
      fragmentShader: frag,
    };
    this.mesh = new Reflector(new THREE.PlaneGeometry(12000, 12000), {
      shader,
      textureWidth: resW,
      textureHeight: resH,
      clipBias: 0.002,
      multisample: 0,
      color: 0xffffff,
    });
    this.mesh.rotation.x = -Math.PI / 2;
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.transparent = true;
    mat.depthWrite = true;
    this.uniforms = mat.uniforms;
    // 복제된 유니폼 배열을 다시 내 배열에 연결
    this.uniforms.uRipples.value = this.ripples;
    this.mesh.renderOrder = 1;
  }

  setResolution(w: number, h: number): void {
    this.mesh.getRenderTarget().setSize(w, h);
  }

  /** 월드 좌표 x, z */
  addRipple(x: number, z: number, time: number, strength: number): void {
    this.ripples[this.next].set(x, z, time, strength);
    this.next = (this.next + 1) % MAX_RIPPLES;
  }

  clearRipples(): void {
    for (const r of this.ripples) r.set(0, 0, 0, 0);
  }
}
