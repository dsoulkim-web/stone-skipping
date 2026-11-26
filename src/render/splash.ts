// 물보라: 물방울(햇빛 받아 반짝임) + 물안개(퍼지며 옅어짐).
// 튕길 때는 돌 진행 방향으로 V자 물보라 시트, 가라앉을 때는 왕관 + 워딩턴 물기둥.
// 실제 크기보다 2~3배 과장한다.
import * as THREE from 'three';

const N_DROP = 3600;
const N_MIST = 500;

class Pool {
  readonly points: THREE.Points;
  pos: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  size: Float32Array;
  next = 0;
  constructor(readonly n: number, mat: THREE.ShaderMaterial, readonly gravity: number, readonly drag: number) {
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    geo.setAttribute('aMax', new THREE.BufferAttribute(this.maxLife, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
  }
  update(dt: number, onLand?: (x: number, z: number) => void) {
    const k = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j] *= k; this.vel[j + 1] *= k; this.vel[j + 2] *= k;
      this.vel[j + 1] -= this.gravity * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0) {
        if (onLand && this.size[i] > 0.09 && Math.random() < 0.08) onLand(this.pos[j], this.pos[j + 2]);
        this.life[i] = 0;
      }
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aLife.needsUpdate = a.aMax.needsUpdate = a.aSize.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}

export class Splash {
  readonly group = new THREE.Group();
  private drops: Pool;
  private mist: Pool;
  readonly uniforms = {
    uLight: { value: new THREE.Color(1, 1, 1) },
    uAmbient: { value: new THREE.Color(0.3, 0.35, 0.4) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uBright: { value: 1.0 },
  };
  /** 떨어진 물방울이 수면에 작은 물결을 남긴다 */
  onDropLand?: (x: number, z: number) => void;

  constructor() {
    const dropMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float aLife; attribute float aMax; attribute float aSize;
        varying float vA; varying float vSpark;
        uniform vec3 uSunDir;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float t = clamp(aLife / aMax, 0.0, 1.0);
          vA = smoothstep(0.0, 0.25, t) * step(0.001, aLife);
          vec3 v = normalize(cameraPosition - position);
          vSpark = pow(max(dot(reflect(-v, vec3(0.0, 1.0, 0.0)), normalize(uSunDir)) * 0.5 + 0.5, 0.0), 6.0);
          gl_PointSize = clamp(aSize * (520.0 / -mv.z), 1.0, 90.0) * step(0.001, aLife);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight; uniform vec3 uAmbient; uniform float uBright;
        varying float vA; varying float vSpark;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float d = length(q);
          if (d > 0.5) discard;
          float rim = (1.0 - smoothstep(0.3, 0.5, d));
          float hl = exp(-dot(q - vec2(-0.13, -0.13), q - vec2(-0.13, -0.13)) * 90.0);
          vec3 c = mix(uAmbient * 1.2, uLight, 0.55) * (0.75 + 0.25 * rim) + uLight * hl * (0.6 + vSpark * 2.5) * uBright;
          gl_FragColor = vec4(c, vA * (0.25 + 0.5 * rim));
        }`,
    });
    const mistMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float aLife; attribute float aMax; attribute float aSize; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float t = clamp(aLife / aMax, 0.0, 1.0);
          vA = t * (1.0 - smoothstep(0.85, 1.0, t)) * step(0.001, aLife);
          gl_PointSize = clamp(aSize * (1.0 + (1.0 - t) * 2.5) * (520.0 / -mv.z), 1.0, 400.0) * step(0.001, aLife);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight; uniform vec3 uAmbient; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = exp(-d * d * 14.0) * vA * 0.09;
          gl_FragColor = vec4(mix(uAmbient, uLight, 0.5), a);
        }`,
    });
    this.drops = new Pool(N_DROP, dropMat, 9.81, 0.25);
    this.mist = new Pool(N_MIST, mistMat, 0.4, 1.6);
    this.group.add(this.mist.points, this.drops.points);
  }

  /** 튕김 물보라. (dirX, dirZ) = 돌 진행 방향 단위벡터, speed = 접촉 속도, strength 0~1 */
  crown(x: number, z: number, dirX: number, dirZ: number, strength: number, perfect: boolean, speed = 6): void {
    const sideX = -dirZ, sideZ = dirX;
    // 실제 고속 촬영: 돌 뒷가장자리에서 얇은 물 시트가 앞·옆으로 V자로 갈라져 튀고, 작은 물방울로 부서진다
    const count = Math.round(25 + 140 * strength + (perfect ? 50 : 0));
    for (let k = 0; k < count; k++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const fwd = speed * (0.1 + Math.random() * 0.3);
      const lat = (0.25 + Math.random() * 0.9) * (0.4 + strength * 0.6) * side;
      const up = (0.3 + Math.random() * 1.2) * (0.35 + strength * 0.75);
      const back = Math.random() * 0.12;
      this.drops.emit(
        x - dirX * back + (Math.random() - 0.5) * 0.03, 0.01, z - dirZ * back + (Math.random() - 0.5) * 0.03,
        dirX * fwd + sideX * lat, up, dirZ * fwd + sideZ * lat,
        0.35 + Math.random() * 0.5,
        0.005 + Math.pow(Math.random(), 5) * 0.025,
      );
    }
    for (let k = 0; k < 3 * strength; k++) {
      this.mist.emit(x, 0.05, z, dirX * speed * 0.1, 0.2, dirZ * speed * 0.1, 0.6, 0.12 + Math.random() * 0.1);
    }
  }

  /** 가라앉을 때: 왕관 모양 튀김 + 가운데 솟는 물기둥 + 꼭대기 물방울 */
  column(x: number, z: number, big = 1): void {
    for (let k = 0; k < 360 * big; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.12 + Math.random() * 0.05;
      const out = 0.9 + Math.random() * 1.4;
      this.drops.emit(x + Math.cos(a) * r, 0.02, z + Math.sin(a) * r, Math.cos(a) * out, 1.6 + Math.random() * 1.8, Math.sin(a) * out,
        0.7 + Math.random() * 0.5, 0.012 + Math.random() * 0.03);
    }
    for (let k = 0; k < 520 * big * big; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.07;
      const v = 3.5 + Math.random() * 3.8;
      this.drops.emit(x + Math.cos(a) * r, 0.02, z + Math.sin(a) * r, Math.cos(a) * r * 2, v, Math.sin(a) * r * 2,
        0.9 + Math.random() * 0.7, 0.015 + Math.random() * 0.04);
    }
    for (let k = 0; k < 14 * big; k++) {
      this.drops.emit(x, 0.1, z, (Math.random() - 0.5) * 0.4, 6.8 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4, 1.6, 0.05 + Math.random() * 0.03);
    }
    for (let k = 0; k < 40 * big * big; k++) {
      this.mist.emit(x + (Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 1.5, z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8, 1.4 + Math.random(), 0.4 + Math.random() * 0.5);
    }
  }

  update(dt: number): void {
    this.drops.update(dt, this.onDropLand);
    this.mist.update(dt);
  }

  clear(): void {
    this.drops.clear();
    this.mist.clear();
  }
}
