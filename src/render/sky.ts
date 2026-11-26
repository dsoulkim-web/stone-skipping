// 하늘: 대기 산란 느낌의 그라데이션 + 해 둘레 빛무리 + 흐르는 구름 + 밤하늘(별·은하수·달).
// 출력은 선형 HDR 값이라 해와 별이 블룸으로 번진다.
import * as THREE from 'three';

export const SKY_RADIUS = 4000;

const vert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  gl_Position.z = gl_Position.w; // 항상 가장 먼 곳
}`;

export const SKY_GLSL = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uCloud;
uniform float uNight;
uniform float uHaze;
uniform float uSkyTime;
uniform float uMilky;

float sh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
float sh2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sh2(i), sh2(i + vec2(1, 0)), f.x), mix(sh2(i + vec2(0, 1)), sh2(i + vec2(1, 1)), f.x), f.y);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += vnoise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}

vec3 skyColor(vec3 dir) {
  float y = dir.y;
  float yc = max(y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(yc, 0.42));
  // 지평선 근처는 공기층 때문에 밝고 희뿌옇다
  col = mix(col, uHorizon * 1.08, exp(-yc * 18.0) * 0.6 * uHaze);
  float mu = dot(dir, normalize(uSunDir));
  float day = 1.0 - uNight;
  // 해 둘레 빛무리 (미 산란)
  col += uSunColor * (pow(max(mu, 0.0), 6.0) * 0.18 + pow(max(mu, 0.0), 60.0) * 0.55) * day * (0.6 + uHaze);
  // 해 원반
  col += uSunColor * smoothstep(0.99955, 0.99985, mu) * mix(40.0, 6.0, uNight);

  // 밤하늘
  if (uNight > 0.0) {
    vec3 q = floor(dir * 420.0);
    float r = sh(q);
    float star = step(0.9965, r) * smoothstep(0.0, 0.25, y);
    float tw = 0.6 + 0.4 * sin(uSkyTime * (2.0 + r * 5.0) + r * 60.0);
    col += vec3(0.9, 0.95, 1.0) * star * (1.0 + 3.5 * fract(r * 913.0)) * tw * uNight;
    // 은하수: 기울어진 대원을 따라 흐릿한 띠
    vec3 axis = normalize(vec3(0.35, 0.55, 0.75));
    float bd = dot(dir, axis) * 5.0; float band = exp(-bd * bd);
    vec2 mp = vec2(atan(dir.z, dir.x) * 4.0, dir.y * 7.0);
    float dust = fbm2(mp * 1.5);
    float fine = step(0.985, sh(floor(dir * 900.0)));
    col += (vec3(0.30, 0.32, 0.45) * band * smoothstep(0.35, 0.8, dust) * 0.9
          + vec3(0.9) * fine * band * 1.5) * uMilky * smoothstep(0.0, 0.2, y);
    col -= vec3(0.05, 0.05, 0.06) * band * smoothstep(0.55, 0.75, fbm2(mp * 3.0 + 4.0)) * uMilky; // 암흑 성운
  }

  // 구름: 높은 평면에 투영한 fbm
  if (uCloud > 0.0 && y > 0.0) {
    vec2 cp = dir.xz / (y + 0.12) * 1.3 + vec2(uSkyTime * 0.006, uSkyTime * 0.002);
    float c = fbm2(cp);
    float cover = uCloud;
    float dens = smoothstep(1.0 - cover * 0.75, 1.0 - cover * 0.75 + 0.3, c);
    float lit = fbm2(cp + normalize(uSunDir).xz * 0.08);
    float shade = clamp(0.55 + (c - lit) * 3.0, 0.2, 1.0);
    vec3 cc = mix(uHorizon * 0.55, vec3(1.0), shade) * mix(1.0, 0.06, uNight);
    cc += uSunColor * pow(max(mu, 0.0), 12.0) * 1.2 * day * (1.0 - dens * 0.5); // 은빛 테두리
    float fade = smoothstep(0.0, 0.18, y);
    col = mix(col, cc, dens * fade * 0.92);
  }
  return max(col, vec3(0.0));
}`;

const frag = /* glsl */ `
${SKY_GLSL}
varying vec3 vWorld;
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  gl_FragColor = vec4(skyColor(dir), 1.0);
}`;

export interface SkyLook {
  zenith: number;
  horizon: number;
  sunColor: number;
  sunDir: THREE.Vector3;
  cloud: number;
  night: boolean;
  haze: number;
  milky: number;
}

export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor() {
    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 0.3, -1) },
      uSunColor: { value: new THREE.Color() },
      uCloud: { value: 0.3 },
      uNight: { value: 0 },
      uHaze: { value: 0.6 },
      uSkyTime: { value: 0 },
      uMilky: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 48, 24), mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  apply(look: SkyLook): void {
    const u = this.uniforms;
    (u.uZenith.value as THREE.Color).setHex(look.zenith);
    (u.uHorizon.value as THREE.Color).setHex(look.horizon);
    (u.uSunColor.value as THREE.Color).setHex(look.sunColor);
    (u.uSunDir.value as THREE.Vector3).copy(look.sunDir).normalize();
    u.uCloud.value = look.cloud;
    u.uNight.value = look.night ? 1 : 0;
    u.uHaze.value = look.haze;
    u.uMilky.value = look.milky;
  }
}
