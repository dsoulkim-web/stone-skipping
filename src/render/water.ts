// 수면 셰이더: 잔물결 + 튕긴 자리에서 퍼지는 빛나는 링(과장 연출) + 하늘 반사.
import * as THREE from 'three';

export const MAX_RIPPLES = 24;

const vert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform vec3 uFog;
uniform float uWaves;
uniform float uGlow;
uniform vec4 uRipples[${MAX_RIPPLES}]; // x, z, 시작 시각, 세기
varying vec3 vWorld;

// 잔물결 높이의 기울기
vec2 waveGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.3) * cos(dot(p, vec2(0.8, 0.3)) * 1.7 + t * 1.3) * 0.05;
  g += vec2(-0.4, 0.9) * cos(dot(p, vec2(-0.4, 0.9)) * 2.9 + t * 1.9) * 0.03;
  g += vec2(0.2, -1.0) * cos(dot(p, vec2(0.2, -1.0)) * 5.3 + t * 2.7) * 0.015;
  g += vec2(0.95, 0.1) * cos(dot(p, vec2(0.95, 0.1)) * 9.1 + t * 3.4) * 0.008;
  return g * (0.4 + uWaves * 3.0);
}

void main() {
  vec2 p = vWorld.xz;
  vec2 grad = waveGrad(p, uTime);
  float glow = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.0) continue;
    float age = uTime - r.z;
    if (age < 0.0 || age > 6.0) continue;
    vec2 d = p - r.xy;
    float dist = length(d);
    float radius = age * 1.6;
    float band = exp(-pow((dist - radius) * 3.0, 2.0));
    float fade = exp(-age * 0.7) * r.w;
    // 링 안쪽으로 몇 겹의 물결
    float wave = sin((dist - radius) * 18.0) * band * fade;
    grad += normalize(d + 1e-4) * wave * 0.35;
    glow += band * fade;
  }
  vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, view), 0.0), 4.0);
  vec3 refl = reflect(-view, n);
  vec3 sky = mix(uSkyBottom, uSkyTop, clamp(refl.y * 1.5, 0.0, 1.0));
  vec3 base = mix(uDeep, uShallow, 0.35 + 0.3 * n.x);
  vec3 col = mix(base, sky, 0.25 + 0.65 * fres);
  float spec = pow(max(dot(refl, normalize(uSunDir)), 0.0), 180.0);
  col += uSun * spec * 1.6;
  col += vec3(0.75, 0.95, 1.0) * glow * uGlow;
  float fogF = 1.0 - exp(-length(cameraPosition - vWorld) * 0.012);
  col = mix(col, uFog, clamp(fogF, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Water {
  readonly mesh: THREE.Mesh;
  private ripples: THREE.Vector4[];
  private next = 0;
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor() {
    this.ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0));
    this.uniforms = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color() },
      uShallow: { value: new THREE.Color() },
      uSkyTop: { value: new THREE.Color() },
      uSkyBottom: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0.6, 0.35, -0.4) },
      uFog: { value: new THREE.Color() },
      uWaves: { value: 0.1 },
      uGlow: { value: 0.6 },
      uRipples: { value: this.ripples },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat);
    this.mesh.rotation.x = -Math.PI / 2;
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
