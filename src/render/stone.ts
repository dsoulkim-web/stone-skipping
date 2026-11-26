// 던지는 돌: 조금씩 찌그러진 납작한 형태 + 젖은 느낌의 PBR 재질.
import * as THREE from 'three';
import type { Stone } from '../game/data';
import { makeNoise } from './noise';
import { stoneSurface } from './textures';

/** 실제보다 약 2.5배 크게 보여준다 */
const SIZE: Record<string, [number, number, number]> = {
  flat: [0.14, 0.032, 0.11],
  round: [0.12, 0.05, 0.11],
  shale: [0.15, 0.022, 0.1],
  basalt: [0.13, 0.04, 0.115],
  jade: [0.13, 0.03, 0.1],
};

export function makeStoneMesh(stone: Stone): THREE.Mesh {
  const seed = [...stone.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const n = makeNoise(seed);
  const geo = new THREE.SphereGeometry(1, 64, 32);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = 1 + n.fbm(v.x * 1.4 + 3, v.z * 1.4 + v.y * 0.5, 4) * 0.12;
    v.x *= d;
    v.z *= d;
    // 위아래 면을 평평하게: 극 쪽을 눌러 둥근 판 모양
    v.y = Math.sign(v.y) * Math.pow(Math.abs(v.y), stone.id === 'round' ? 1.0 : 1.6) * (1 + n.fbm(v.x * 3, v.z * 3, 2) * 0.15);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const s = SIZE[stone.id] ?? SIZE.flat;
  geo.scale(s[0], s[1], s[2]);
  geo.computeVertexNormals();
  const tx = stoneSurface(stone.color, seed, stone.id === 'jade' || stone.id === 'shale');
  const jade = stone.id === 'jade';
  const mat = new THREE.MeshPhysicalMaterial({
    map: tx.map,
    roughnessMap: tx.roughness,
    normalMap: tx.normal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: jade ? 0.35 : 0.8,
    metalness: 0,
    clearcoat: jade ? 1 : 0.35, // 물에 젖은 막
    clearcoatRoughness: jade ? 0.08 : 0.25,
    sheen: jade ? 0.4 : 0,
    sheenColor: new THREE.Color(0x9fffe0),
    emissive: jade ? new THREE.Color(0x0d3a2a) : new THREE.Color(0),
    emissiveIntensity: jade ? 0.6 : 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}
