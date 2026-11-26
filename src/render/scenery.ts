// 명소 배경을 절차적으로 만든다: 발밑 자갈 강변(물속까지 이어짐), 건너편 강둑·절벽·산맥, 숲, 도시, 다리.
// 같은 물가 모양 함수를 GLSL로도 내보내 물 셰이더가 수심(얕은 물빛·투명도)을 계산한다.
// 블렌더 에셋(public/places/<id>.glb)이 들어오면 이 그룹을 통째로 바꾼다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Place } from '../game/data';
import { makeNoise, type Noise } from './noise';
import { pebbleBeach, windows } from './textures';

type Extra = 'city' | 'bridges' | 'lowBridge' | 'lupins' | 'boats';

export interface SceneryLook {
  /** 건너편 물가까지 거리(m) */
  far: number;
  /** 내 쪽 물가 굽은 정도 (클수록 만(灣) 안에 선 느낌) */
  curve: number;
  nearSlope: number;
  farSlope: number;
  /** 건너편 높이 함수 (x, 물가에서 안쪽 거리 d) */
  height: (x: number, d: number, n: Noise) => number;
  snowLine: number;
  treeLine: number;
  trees: 'conifer' | 'broadleaf' | 'mixed' | 'none';
  treeCount: number;
  grass: number;
  rock: number;
  sand: number;
  sun: { el: number; az: number };
  cloud: number;
  haze: number;
  fog: number;
  exposure: number;
  extras: Extra[];
}

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const SCENERY: Record<string, SceneryLook> = {
  donggang: {
    far: 95, curve: 0.0003, nearSlope: 0.22, farSlope: 0.35,
    height: (x, d, n) =>
      26 * ss(1 + 6 * (n.fbm(x / 30, 5, 2) + 1), 14 + 10 * (n.fbm(x / 45, 9, 2) + 1), d) * (0.45 + 0.9 * (n.fbm(x / 70, 0.3, 4) * 0.5 + 0.5)) + 6 * n.ridged(x / 12, d / 12, 3) * ss(0, 10, d) + n.fbm(x / 9, d / 9, 3) * 3 * ss(0, 6, d) +
      ss(120, 400, d) * (140 + 160 * n.ridged(x / 420, d / 420, 5)),
    snowLine: 9999, treeLine: 600, trees: 'mixed', treeCount: 2600,
    grass: 0x4b6a35, rock: 0x6b665c, sand: 0xb5ad9c,
    sun: { el: 30, az: -62 }, cloud: 0.38, haze: 0.7, fog: 0.0016, exposure: 1.0, extras: [],
  },
  hangang: {
    far: 420, curve: 0.00008, nearSlope: 0.2, farSlope: 0.25,
    height: (x, d, n) => 7 * ss(0, 10, d) + ss(700, 1300, d) * (120 + 220 * n.ridged(x / 600, d / 600, 5)),
    snowLine: 9999, treeLine: 0, trees: 'none', treeCount: 0,
    grass: 0x2a3a2a, rock: 0x3a3c44, sand: 0x55585e,
    sun: { el: 22, az: 55 }, cloud: 0.25, haze: 0.9, fog: 0.0011, exposure: 1.6, extras: ['city', 'bridges'],
  },
  shimanto: {
    far: 80, curve: 0.0004, nearSlope: 0.18, farSlope: 0.3,
    height: (x, d, n) => 3 * ss(0, 10, d) + ss(20, 280, d) * (45 + 85 * (n.fbm(x / 160, d / 160, 5) * 0.5 + 0.5)) + 8 * n.fbm(x / 30, d / 30, 3) * ss(10, 40, d),
    snowLine: 9999, treeLine: 900, trees: 'broadleaf', treeCount: 3600,
    grass: 0x3f6a2e, rock: 0x7c7a6e, sand: 0xa8a090,
    sun: { el: 40, az: 35 }, cloud: 0.45, haze: 0.8, fog: 0.0018, exposure: 1.0, extras: ['lowBridge'],
  },
  easdale: {
    far: 46, curve: 0.0006, nearSlope: 0.3, farSlope: 0.6,
    height: (x, d, n) =>
      (9 + 3 * n.fbm(x / 25, 1, 3)) * ss(0, 3, d) * (1 - ss(28, 50, d)) - 0.6 * ss(40, 60, d) +
      ss(500, 900, d) * (90 + 120 * n.ridged(x / 500, d / 500, 4)),
    snowLine: 9999, treeLine: 0, trees: 'none', treeCount: 0,
    grass: 0x56693f, rock: 0x3d4248, sand: 0x4c5158,
    sun: { el: 20, az: -60 }, cloud: 0.92, haze: 1.0, fog: 0.0024, exposure: 1.05, extras: ['boats'],
  },
  mackinac: {
    far: 950, curve: 0.0009, nearSlope: 0.15, farSlope: 0.12,
    height: (x, d, n) => (18 + 25 * (n.fbm(x / 300, 0.5, 4) * 0.5 + 0.5)) * ss(0, 60, d) * (1 - ss(-900, -500, -Math.abs(x)) * 0) ,
    snowLine: 9999, treeLine: 200, trees: 'conifer', treeCount: 1600,
    grass: 0x3b5a32, rock: 0x9c9583, sand: 0xd2c6aa,
    sun: { el: 17, az: 38 }, cloud: 0.3, haze: 0.9, fog: 0.0009, exposure: 0.95, extras: ['boats'],
  },
  moraine: {
    far: 300, curve: 0.0016, nearSlope: 0.2, farSlope: 0.4,
    height: (x, d, n) =>
      6 * ss(0, 15, d) + ss(30, 120, d) * 25 + ss(180, 900, d) * (140 + 620 * n.ridged(x / 480, d / 480, 6)) + n.fbm(x / 40, d / 40, 3) * 8,
    snowLine: 430, treeLine: 260, trees: 'conifer', treeCount: 4200,
    grass: 0x33502f, rock: 0x7e7f82, sand: 0x8f8a80,
    sun: { el: 30, az: 115 }, cloud: 0.25, haze: 0.5, fog: 0.0008, exposure: 1.0, extras: [],
  },
  tekapo: {
    far: 1300, curve: 0.0013, nearSlope: 0.18, farSlope: 0.25,
    height: (x, d, n) => 10 * ss(0, 40, d) + ss(300, 1500, d) * (180 + 700 * n.ridged(x / 600, d / 600, 6)),
    snowLine: 420, treeLine: 0, trees: 'none', treeCount: 0,
    grass: 0x4a4a32, rock: 0x5a5a62, sand: 0x3e3a45,
    sun: { el: 14, az: -100 }, cloud: 0.12, haze: 0.4, fog: 0.0004, exposure: 2.4, extras: ['lupins'],
  },
  brienz: {
    far: 700, curve: 0.0011, nearSlope: 0.2, farSlope: 0.5,
    height: (x, d, n) => 4 * ss(0, 8, d) + ss(15, 260, d) * (70 + 60 * (n.fbm(x / 200, 3, 3) * 0.5 + 0.5)) + ss(250, 1300, d) * (200 + 1000 * n.ridged(x / 700, d / 700, 6)) + n.fbm(x / 50, d / 50, 3) * 10,
    snowLine: 1100, treeLine: 420, trees: 'conifer', treeCount: 4200,
    grass: 0x3a5a30, rock: 0x85837d, sand: 0x9a9384,
    sun: { el: 42, az: -120 }, cloud: 0.35, haze: 0.6, fog: 0.0007, exposure: 1.0, extras: ['boats'],
  },
};

/** 내 쪽 물가선 z (월드) */
export function nearShoreZ(x: number, curve: number): number {
  return 0.5 - curve * x * x + 0.4 * Math.sin(x * 0.21) + 0.25 * Math.sin(x * 0.57 + 1.3);
}
export function farShoreZ(x: number, far: number): number {
  return -far + 2.0 * Math.sin(x * 0.05) + 1.2 * Math.sin(x * 0.13 + 2.0);
}
export function waterDepth(x: number, z: number, s: SceneryLook): number {
  const a = Math.min(6, Math.max(0, (nearShoreZ(x, s.curve) - z) * s.nearSlope));
  const b = Math.min(6, Math.max(0, (z - farShoreZ(x, s.far)) * s.farSlope));
  return Math.min(a, b);
}

/** 물 셰이더용 GLSL (위 함수와 같은 식) */
export const SHORE_GLSL = /* glsl */ `
uniform float uCurve; uniform float uFar; uniform float uNearSlope; uniform float uFarSlope;
float nearShoreZ(float x) { return 0.5 - uCurve * x * x + 0.4 * sin(x * 0.21) + 0.25 * sin(x * 0.57 + 1.3); }
float farShoreZ(float x) { return -uFar + 2.0 * sin(x * 0.05) + 1.2 * sin(x * 0.13 + 2.0); }
float waterDepth(vec2 p) {
  float a = clamp((nearShoreZ(p.x) - p.y) * uNearSlope, 0.0, 6.0);
  float b = clamp((p.y - farShoreZ(p.x)) * uFarSlope, 0.0, 6.0);
  return min(a, b);
}`;

/** 물속 바닥에 일렁이는 빛(커스틱)을 넣는다 */
export function addCaustics(mat: THREE.MeshStandardMaterial, shared: Record<string, THREE.IUniform>, rock = false): void {
  if (rock) mat.defines = { ...(mat.defines ?? {}), ROCK_DETAIL: '' };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
uniform float uTime; uniform vec3 uSunColor; uniform float uNight; uniform vec3 uDeep; uniform vec3 uShallow;
float rh3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float rn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rh3(i), rh3(i + vec3(1,0,0)), f.x), mix(rh3(i + vec3(0,1,0)), rh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rh3(i + vec3(0,0,1)), rh3(i + vec3(1,0,1)), f.x), mix(rh3(i + vec3(0,1,1)), rh3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float caustic(vec2 p, float t) {
  vec2 q = p;
  float c = 0.0;
  for (int n = 0; n < 3; n++) {
    q += vec2(sin(q.y * 1.3 + t), cos(q.x * 1.1 - t * 0.9)) * 0.55;
    c += sin(q.x * 2.1) * sin(q.y * 1.9);
  }
  c = clamp(1.0 - abs(c / 3.0), 0.0, 1.0);
  return c * c * c * c * c * c * c * c;
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#ifdef ROCK_DETAIL
{
  float dn = rn3(vWPos * 0.08) * 0.5 + rn3(vWPos * 0.31) * 0.3 + rn3(vWPos * 1.3) * 0.2;
  float fadeD = exp(-length(vWPos - cameraPosition) * 0.004);
  outgoingLight *= mix(1.0, 0.55 + dn * 0.9, fadeD * 0.85);
}
#endif
if (vWPos.y < 0.02) {
  float dep = max(0.0, -vWPos.y);
  float cs = caustic(vWPos.xz * 5.5, uTime * 1.1);
  outgoingLight += uSunColor * cs * exp(-dep * 0.5) * 0.09 * (0.6 + rn3(vec3(vWPos.xz * 0.3, uTime * 0.05))) * (1.0 - uNight) * smoothstep(0.0, 0.2, dep);
  vec3 tint = mix(uShallow * 1.6, uDeep, clamp(dep / 4.0, 0.0, 1.0));
  outgoingLight = mix(outgoingLight, outgoingLight * tint * 2.2, clamp(dep * 0.5, 0.0, 0.85));
}
#include <opaque_fragment>`,
      );
  };
}

export interface BuiltScenery {
  group: THREE.Group;
  dispose(): void;
}

export function buildScenery(place: Place, s: SceneryLook, shared: Record<string, THREE.IUniform>, seed: number): BuiltScenery {
  const g = new THREE.Group();
  const n = makeNoise(seed);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const night = !!place.night;

  // ── 발밑 강변 (물속 비탈까지) ──
  {
    const xs = 180, zs = 120;
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const wet = new THREE.Color(place.shore).multiplyScalar(0.55);
    const dry = new THREE.Color(place.shore);
    const c = new THREE.Color();
    for (let j = 0; j <= zs; j++) {
      const tz = j / zs;
      const z = -60 + 130 * Math.pow(tz, 1.0);
      for (let i = 0; i <= xs; i++) {
        const t = i / xs * 2 - 1;
        const x = Math.sign(t) * Math.pow(Math.abs(t), 1.7) * 420;
        const z0 = nearShoreZ(x, s.curve);
        let y: number;
        if (z >= z0) {
          const dz = z - z0;
          y = dz * 0.07 + Math.max(0, dz - 12) * 0.12 + n.fbm(x / 6, z / 6, 3) * 0.08 + Math.max(0, dz - 25) * 0.25 * (n.fbm(x / 40, z / 40, 3) + 0.6);
        } else {
          y = -Math.min(6, (z0 - z) * s.nearSlope) + n.fbm(x / 5, z / 5, 3) * 0.12;
        }
        // 건너편과 겹치면 건너편에 맡긴다
        const zf = farShoreZ(x, s.far);
        if (z < zf + 4) y = Math.min(y, -6);
        pos.push(x, y, z);
        uv.push(x / 2.6, z / 2.6);
        const dz = z - z0;
        const k = ss(-0.2, 1.6, dz);
        c.copy(wet).lerp(dry, k);
        if (dz > 20) c.lerp(new THREE.Color(s.grass), ss(20, 40, dz));
        c.multiplyScalar(0.92 + n.fbm(x / 3, z / 3, 2) * 0.12);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < zs; j++) for (let i = 0; i < xs; i++) {
      const a = j * (xs + 1) + i, b = a + 1, d = a + xs + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tx = pebbleBeach(place.shore, seed);
    keep(tx.map); keep(tx.bump);
    const mat = keep(new THREE.MeshStandardMaterial({ map: tx.map, bumpMap: tx.bump, bumpScale: 2.2, vertexColors: true, roughness: 0.92 }));
    mat.color.setScalar(1.25);
    addCaustics(mat, shared);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    g.add(mesh);
  }

  // ── 발밑의 입체 자갈 (물속에도) ──
  {
    const base = new THREE.IcosahedronGeometry(1, 2);
    const p = base.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(1 + n.fbm(v.x * 1.5, v.y * 1.5 + v.z, 2) * 0.25);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    base.computeVertexNormals();
    keep(base);
    const N = 1400;
    const mat = keep(new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 }));
    addCaustics(mat, shared);
    const im = new THREE.InstancedMesh(base, mat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    const shore = new THREE.Color(place.shore);
    const hsl = { h: 0, s: 0, l: 0 };
    shore.getHSL(hsl);
    let i = 0;
    for (let k = 0; k < N * 3 && i < N; k++) {
      const x = (n.rand() - 0.5) * 2 * (3 + 22 * Math.pow(n.rand(), 2));
      const z = -4 + 14 * Math.pow(n.rand(), 0.8);
      const z0 = nearShoreZ(x, s.curve);
      if (z < z0 - 0.6) continue;
      const groundY = z >= z0 ? (z - z0) * 0.07 : -Math.min(6, (z0 - z) * s.nearSlope);
      const sc = 0.03 + Math.pow(n.rand(), 3) * 0.12;
      q.setFromEuler(new THREE.Euler((n.rand() - 0.5) * 0.4, n.rand() * 6.3, (n.rand() - 0.5) * 0.4));
      m.compose(new THREE.Vector3(x, groundY + sc * 0.15, z), q, new THREE.Vector3(sc, sc * (0.35 + n.rand() * 0.3), sc * (0.6 + n.rand() * 0.4)));
      im.setMatrixAt(i, m);
      const l = hsl.l * (0.35 + n.rand() * 0.55) * (z < z0 + 0.8 ? 0.65 : 1);
      c.setHSL(hsl.h + (n.rand() - 0.5) * 0.06, hsl.s * (0.3 + n.rand()), Math.min(0.9, l));
      im.setColorAt(i, c);
      i++;
    }
    im.count = i;
    im.receiveShadow = true;
    im.castShadow = true;
    g.add(im);
  }

  // ── 양옆 큰 바위 ──
  {
    const rockMat = keep(new THREE.MeshStandardMaterial({ color: s.rock, roughness: 0.85, flatShading: false }));
    addCaustics(rockMat, shared, true);
    for (let k = 0; k < 9; k++) {
      const geo = keep(new THREE.IcosahedronGeometry(1, 3));
      const p = geo.attributes.position as THREE.BufferAttribute;
      const off = n.rand() * 100;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const d = 1 + n.fbm(v.x * 1.2 + off, v.y * 1.2 + v.z * 0.7, 4) * 0.45 + n.ridged(v.x * 3 + off, v.z * 3, 2) * 0.1;
        v.multiplyScalar(d);
        if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3;
        p.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const side = k % 2 ? 1 : -1;
      const x = side * (5 + n.rand() * 28);
      const z = -3 + n.rand() * 14;
      const z0 = nearShoreZ(x, s.curve);
      const y = z >= z0 ? (z - z0) * 0.07 : -Math.min(6, (z0 - z) * s.nearSlope);
      const sc = 0.5 + n.rand() * 1.8;
      const mesh = new THREE.Mesh(geo, rockMat);
      mesh.position.set(x, y, z);
      mesh.scale.set(sc * (1 + n.rand()), sc * (0.5 + n.rand() * 0.5), sc);
      mesh.rotation.y = n.rand() * 6;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    }
  }

  // ── 건너편 지형 ──
  const farH = (x: number, d: number) => (d < 0 ? Math.max(-6, d * s.farSlope) : s.height(x, d, n));
  const W = Math.max(2400, s.far * 2.5);
  {
    const xs = 260, ds = 150;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let j = 0; j <= ds; j++) {
      const t = j / ds;
      const d = -20 + 3200 * Math.pow(t, 2.2);
      for (let i = 0; i <= xs; i++) {
        const u = i / xs * 2 - 1;
        const x = Math.sign(u) * Math.pow(Math.abs(u), 1.5) * W;
        pos.push(x, farH(x, d), farShoreZ(x, s.far) - d);
      }
    }
    for (let j = 0; j < ds; j++) for (let i = 0; i < xs; i++) {
      const a = j * (xs + 1) + i, b = a + 1, c = a + xs + 1, e = c + 1;
      idx.push(a, b, c, b, e, c);
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const grass = new THREE.Color(s.grass), rock = new THREE.Color(s.rock), sand = new THREE.Color(s.sand), snow = new THREE.Color(0xd9e0e8);
    const forest = grass.clone().multiplyScalar(0.62);
    const c = new THREE.Color();
    for (let i = 0; i < nrm.count; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const up = nrm.getY(i);
      const slope = 1 - up;
      const v = n.fbm(x / 35, z / 35, 3);
      c.copy(grass);
      if (s.trees !== 'none' && y < s.treeLine) c.lerp(forest, ss(-0.2, 0.3, v));
      const strata = 0.85 + 0.12 * Math.sin(y * 0.6 + n.fbm(x / 20, y / 10, 2) * 4) + n.fbm(x / 6, z / 6, 2) * 0.2;
      const rk = rock.clone().multiplyScalar(strata);
      c.lerp(rk, ss(0.22, 0.42, slope + v * 0.1));
      if (y < 1.4) c.lerp(sand.clone().multiplyScalar(0.75), 1 - ss(0.3, 1.4, y));
      if (y < 0) c.copy(sand).multiplyScalar(0.4);
      const sl = s.snowLine * (1 + v * 0.15);
      if (y > sl) c.lerp(snow, ss(sl, sl + 60, y) * (1 - ss(0.45, 0.7, slope)));
      if (night) c.multiplyScalar(0.8);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    addCaustics(mat, shared, true);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = false;
    g.add(mesh);
  }

  // ── 숲 ──
  if (s.trees !== 'none' && s.treeCount > 0) {
    const conifer = keep(coniferGeo());
    const broad = keep(broadleafGeo(n));
    const mat = keep(new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true }));
    const types = s.trees === 'mixed' ? [conifer, broad] : [s.trees === 'conifer' ? conifer : broad];
    for (const geo of types) {
      const count = Math.round(s.treeCount / types.length);
      const im = new THREE.InstancedMesh(geo, mat, count);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), sc = new THREE.Vector3();
      let placed = 0;
      for (let tries = 0; tries < count * 6 && placed < count; tries++) {
        const d = 3 + Math.pow(n.rand(), 1.7) * 1400;
        const x = (n.rand() - 0.5) * 2 * Math.min(W * 0.8, 250 + d * 1.4);
        const y = farH(x, d);
        if (y < 2 || y > s.treeLine * (0.85 + n.fbm(x / 50, d / 50, 2) * 0.3)) continue;
        const slope = Math.abs(farH(x + 2, d) - farH(x - 2, d)) / 4 + Math.abs(farH(x, d + 2) - farH(x, d - 2)) / 4;
        if (slope > 0.9) continue;
        if (n.fbm(x / 80, d / 80, 3) < -0.25) continue; // 빈터
        const h = (geo === conifer ? 9 : 8) + n.rand() * 14;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), n.rand() * 6.3);
        sc.set(h * (0.8 + n.rand() * 0.4), h, h * (0.8 + n.rand() * 0.4));
        m.compose(new THREE.Vector3(x, y - 0.5, farShoreZ(x, s.far) - d), q, sc);
        im.setMatrixAt(placed, m);
        const tone = 0.45 + n.rand() * 0.35;
        c.setHex(s.grass).multiplyScalar(tone * (night ? 0.6 : 1));
        if (geo === broad && n.rand() < 0.08) c.setHSL(0.09 + n.rand() * 0.05, 0.5, 0.35); // 단풍 몇 그루
        im.setColorAt(placed, c);
        placed++;
      }
      im.count = placed;
      im.castShadow = false;
      g.add(im);
    }
    // 내 쪽 양옆 숲 (만 안쪽 느낌)
    const im = new THREE.InstancedMesh(types[0], mat, 500);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    let placed = 0;
    for (let k = 0; k < 2000 && placed < 500; k++) {
      const x = (n.rand() < 0.5 ? -1 : 1) * (35 + n.rand() * 380);
      const z0 = nearShoreZ(x, s.curve);
      const z = z0 + 12 + n.rand() * 60;
      if (z < farShoreZ(x, s.far) + 10) continue;
      const dz = z - z0;
      const y = dz * 0.07 + Math.max(0, dz - 12) * 0.12 + Math.max(0, dz - 25) * 0.25 * (n.fbm(x / 40, z / 40, 3) + 0.6);
      const h = 8 + n.rand() * 12;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), n.rand() * 6.3);
      m.compose(new THREE.Vector3(x, y - 0.3, z), q, new THREE.Vector3(h, h, h));
      im.setMatrixAt(placed, m);
      im.setColorAt(placed, c.setHex(s.grass).multiplyScalar((0.4 + n.rand() * 0.35) * (night ? 0.6 : 1)));
      placed++;
    }
    im.count = placed;
    g.add(im);
  }

  if (s.extras.includes('city')) g.add(city(s, n, keep));
  if (s.extras.includes('bridges')) for (const bx of [-190, 330]) g.add(bridge(bx, s, n, keep, true));
  if (s.extras.includes('lowBridge')) g.add(bridge(38, s, n, keep, false));
  if (s.extras.includes('lupins')) g.add(lupins(s, n, keep));
  if (s.extras.includes('boats')) g.add(boats(s, n, keep));

  return { group: g, dispose: () => disposables.forEach((d) => d.dispose()) };
}

function coloredGeo(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

function coniferGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.015, 0.025, 0.25, 5);
  trunk.translate(0, 0.125, 0);
  parts.push(coloredGeo(trunk, new THREE.Color(0x3a2a1e)));
  for (let k = 0; k < 4; k++) {
    const r = 0.2 - k * 0.04;
    const cone = new THREE.ConeGeometry(r, 0.34, 8);
    cone.translate(0, 0.28 + k * 0.17, 0);
    parts.push(coloredGeo(cone, new THREE.Color(1, 1, 1).multiplyScalar(0.85 + k * 0.06)));
  }
  return mergeGeometries(parts)!;
}

function broadleafGeo(n: Noise): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.015, 0.025, 0.45, 5);
  trunk.translate(0, 0.2, 0);
  parts.push(coloredGeo(trunk, new THREE.Color(0x3d2d20)));
  for (let k = 0; k < 9; k++) {
    const b = new THREE.IcosahedronGeometry(0.11 + n.rand() * 0.07, 1);
    const pp = b.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) pp.setXYZ(i, pp.getX(i) * (1 + (n.rand() - 0.5) * 0.35), pp.getY(i) * (1 + (n.rand() - 0.5) * 0.35), pp.getZ(i) * (1 + (n.rand() - 0.5) * 0.35));
    b.translate((n.rand() - 0.5) * 0.28, 0.42 + n.rand() * 0.38, (n.rand() - 0.5) * 0.28);
    parts.push(coloredGeo(b, new THREE.Color(1, 1, 1).multiplyScalar(0.8 + n.rand() * 0.3)));
  }
  return mergeGeometries(parts)!;
}

type Keep = <T extends { dispose(): void }>(x: T) => T;

function city(s: SceneryLook, n: Noise, keep: Keep): THREE.Group {
  const g = new THREE.Group();
  const win = keep(windows(7));
  const geo = keep(new THREE.BoxGeometry(1, 1, 1));
  geo.translate(0, 0.5, 0);
  const mat = keep(new THREE.MeshStandardMaterial({ color: 0x1a1d26, roughness: 0.6, metalness: 0.3, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 2.2 }));
  const N = 900;
  const im = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < N; i++) {
    const d = 40 + Math.pow(n.rand(), 1.1) * 1100;
    const x = (n.rand() - 0.5) * 2 * (600 + d);
    const tall = n.rand() < 0.15;
    const h = (tall ? 60 + n.rand() * 90 : 14 + n.rand() * 36) * (1 - d / 1800);
    const w = 18 + n.rand() * 30;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (n.rand() - 0.5) * 0.4);
    m.compose(new THREE.Vector3(x, 6.5, farShoreZ(x, s.far) - d), q, new THREE.Vector3(w, h, w * (0.6 + n.rand() * 0.6)));
    im.setMatrixAt(i, m);
  }
  g.add(im);
  // 옥상 항공 장애등 + 강변 가로등
  const pts: number[] = [], cols: number[] = [];
  for (let i = 0; i < 260; i++) {
    const x = (n.rand() - 0.5) * 1800;
    pts.push(x, 7.5, farShoreZ(x, s.far) - 4 - n.rand() * 6);
    cols.push(1.0, 0.75, 0.45);
  }
  for (let i = 0; i < 80; i++) {
    const x = (n.rand() - 0.5) * 1600;
    pts.push(x, 100 + n.rand() * 120, farShoreZ(x, s.far) - 100 - n.rand() * 500);
    cols.push(1.0, 0.15, 0.1);
  }
  g.add(glowPoints(pts, cols, 3.2, keep));
  return g;
}

/** 강을 가로지르는 다리. high=true: 조명 켠 큰 다리, false: 난간 없는 잠수교 */
function bridge(x0: number, s: SceneryLook, n: Noise, keep: Keep, high: boolean): THREE.Group {
  const g = new THREE.Group();
  const z0 = nearShoreZ(x0, s.curve) - 2, z1 = farShoreZ(x0, s.far) + 2;
  const len = z0 - z1;
  const deckY = high ? 14 : 0.9;
  const mat = keep(new THREE.MeshStandardMaterial({ color: high ? 0x5a5e68 : 0xa9a69c, roughness: 0.8 }));
  const deck = new THREE.Mesh(keep(new THREE.BoxGeometry(high ? 24 : 4.2, high ? 2.2 : 0.45, len)), mat);
  deck.position.set(x0, deckY, (z0 + z1) / 2);
  g.add(deck);
  const span = high ? 60 : 9;
  const pier = keep(new THREE.BoxGeometry(high ? 6 : 1.2, 1, high ? 3 : 0.9));
  pier.translate(0, 0.5, 0);
  for (let z = z0 - span / 2; z > z1; z -= span) {
    const p = new THREE.Mesh(pier, mat);
    p.position.set(x0, -6, z);
    p.scale.y = deckY + 6;
    g.add(p);
  }
  if (high) {
    const pts: number[] = [], cols: number[] = [];
    const c = new THREE.Color();
    for (let z = z0; z > z1; z -= 2.5) {
      const t = (z0 - z) / len;
      c.setHSL((0.55 + t * 0.4 + n.rand() * 0.02) % 1, 0.8, 0.6);
      for (const side of [-1, 1]) {
        pts.push(x0 + side * 12.2, deckY - 1.2, z);
        cols.push(c.r, c.g, c.b);
      }
      if (Math.round(z) % 10 === 0) {
        pts.push(x0 + 11, deckY + 6, z);
        cols.push(1, 0.85, 0.6);
      }
    }
    g.add(glowPoints(pts, cols, 2.6, keep));
  }
  return g;
}

function lupins(s: SceneryLook, n: Noise, keep: Keep): THREE.Group {
  const g = new THREE.Group();
  const geo = keep(new THREE.ConeGeometry(0.09, 0.7, 6));
  geo.translate(0, 0.55, 0);
  const stem = keep(new THREE.CylinderGeometry(0.01, 0.015, 0.4, 4));
  stem.translate(0, 0.2, 0);
  const merged = keep(mergeGeometries([coloredGeo(geo, new THREE.Color(1, 1, 1)), coloredGeo(stem, new THREE.Color(0.25, 0.4, 0.2))])!);
  const mat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  const N = 2200;
  const im = new THREE.InstancedMesh(merged, mat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  const palette = [0x8a4fd6, 0xd65fa8, 0x5b6fe0, 0xe8a0d0, 0xf0f0f6];
  let placed = 0;
  for (let k = 0; k < N * 3 && placed < N; k++) {
    const side = n.rand() < 0.5 ? -1 : 1;
    const x = side * (6 + Math.pow(n.rand(), 1.5) * 160);
    const z0 = nearShoreZ(x, s.curve);
    const z = z0 + 1.5 + n.rand() * 14;
    if (n.fbm(x / 12, z / 12, 2) < -0.1) continue;
    const dz = z - z0;
    const y = dz * 0.07;
    const sc = 0.7 + n.rand() * 0.7;
    q.setFromEuler(new THREE.Euler((n.rand() - 0.5) * 0.2, 0, (n.rand() - 0.5) * 0.2));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, sc, sc));
    im.setMatrixAt(placed, m);
    im.setColorAt(placed, c.setHex(palette[Math.floor(n.rand() * palette.length)]).multiplyScalar(0.6));
    placed++;
  }
  im.count = placed;
  g.add(im);
  return g;
}

function boats(s: SceneryLook, n: Noise, keep: Keep): THREE.Group {
  const g = new THREE.Group();
  const hull = keep(new THREE.CylinderGeometry(0.5, 0.25, 4, 8, 1, false, 0, Math.PI));
  hull.rotateZ(Math.PI / 2);
  hull.rotateX(Math.PI);
  const mat = keep(new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.5 }));
  const sailGeo = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, 0.3, 2.4)]));
  sailGeo.computeVertexNormals();
  const sailMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.7 }));
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(hull, mat));
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.z = -0.8;
    b.add(sail);
    const d = Math.min(s.far * 0.8, 120 + n.rand() * 500);
    b.position.set((n.rand() - 0.5) * 500, 0, -d);
    b.rotation.y = n.rand() * 6;
    b.scale.setScalar(1.4);
    g.add(b);
  }
  return g;
}

function glowPoints(pts: number[], cols: number[], size: number, keep: Keep): THREE.Points {
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const mat = keep(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uSize: { value: size } },
      vertexShader: /* glsl */ `attribute vec3 color; varying vec3 vC; uniform float uSize;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = clamp(uSize * 400.0 / -mv.z, 1.5, 24.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5);
          float a = exp(-d * d * 18.0); gl_FragColor = vec4(vC * 6.0 * a, a); }`,
    }),
  );
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}
