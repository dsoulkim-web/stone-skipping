// 물보라 입자: 왕관 모양 튀김, 물기둥. 실제보다 2~3배 크게 과장한다.
import * as THREE from 'three';

const N = 2400;

export class Splash {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private next = 0;

  constructor() {
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.size = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0xdff6ff) } },
      vertexShader: /* glsl */ `
        attribute float aLife; attribute float aSize; varying float vLife;
        void main() {
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (300.0 / -mv.z) * step(0.001, aLife);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(uColor, (1.0 - d * 2.0) * clamp(vLife, 0.0, 1.0) * 0.9);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number) {
    const i = this.next;
    this.next = (this.next + 1) % N;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life;
    this.size[i] = size;
  }

  /** 튕김 물보라. dirX/dirZ = 돌 진행 방향, strength 0~1 */
  crown(x: number, z: number, dirX: number, dirZ: number, strength: number, perfect: boolean): void {
    const count = Math.round(60 + 140 * strength + (perfect ? 120 : 0));
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random() * 1.4) * (0.6 + strength);
      // 진행 방향 앞쪽으로 더 많이 튄다
      const fwd = 0.8 + Math.random() * 1.2;
      this.emit(
        x, 0.02, z,
        Math.cos(a) * sp + dirX * fwd * strength,
        1.2 + Math.random() * 2.6 * (0.5 + strength),
        Math.sin(a) * sp + dirZ * fwd * strength,
        0.6 + Math.random() * 0.6,
        0.05 + Math.random() * 0.08 + (perfect ? 0.04 : 0),
      );
    }
  }

  /** 가라앉을 때 큰 물기둥 */
  column(x: number, z: number): void {
    for (let k = 0; k < 420; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.6;
      this.emit(x, 0.02, z, Math.cos(a) * r, 2.5 + Math.random() * 4.5, Math.sin(a) * r, 0.9 + Math.random() * 0.8, 0.07 + Math.random() * 0.1);
    }
  }

  update(dt: number): void {
    const g = 9.81;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] -= g * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0) this.life[i] = 0;
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aLife.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
  }
}
