// 3D 장면: 명소 배경, 수면, 돌, 물보라, 카메라 연출.
// 물리 좌표(x 앞, y 위, z 오른쪽) → 월드 좌표(x 오른쪽, y 위, -z 앞).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Place, Stone } from '../game/data';
import { positionAt, rng, type SimResult } from '../game/physics';
import { Splash } from './splash';
import { Water } from './water';

const toWorld = (p: [number, number, number]) => new THREE.Vector3(p[2], p[1], -p[0]);
const TRAIL = 48;

export interface PlaybackHooks {
  onBounce?: (index: number, perfect: boolean) => void;
  onSink?: () => void;
  onEnd?: () => void;
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private water = new Water();
  private splash = new Splash();
  private stone: THREE.Mesh;
  private trail: THREE.Line;
  private trailPts: THREE.Vector3[] = [];
  private env = new THREE.Group();
  private skyMat: THREE.ShaderMaterial;
  private sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  private clock = new THREE.Clock();
  private time = 0;
  private loader = new GLTFLoader();
  private placeId = '';

  // 재생 상태
  private sim: SimResult | null = null;
  private simT = 0;
  private hooks: PlaybackHooks = {};
  private nextBounce = 0;
  private sunk = false;
  private endTimer = 0;
  private perfect = false;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  /** 화면 연출 강도: 'real' 실제처럼, 'flashy' 화려하게 */
  fx: 'real' | 'flashy' = 'flashy';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 900);

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uStars: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; uniform float uStars; varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){ float t = clamp(vDir.y * 1.6 + 0.08, 0.0, 1.0); vec3 c = mix(uBottom, uTop, t);
          vec3 q = floor(vDir * 380.0); float s = step(0.9975, h(q)) * uStars * smoothstep(0.02, 0.3, vDir.y);
          gl_FragColor = vec4(c + vec3(s), 1.0); }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), this.skyMat));
    this.scene.add(this.water.mesh, this.splash.points, this.env, this.sunLight, this.hemi);

    const geo = new THREE.SphereGeometry(1, 24, 12);
    geo.scale(0.14, 0.035, 0.11); // 실제보다 약 2.5배 크게 보여준다
    this.stone = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.55 }));
    this.scene.add(this.stone);

    const tg = new THREE.BufferGeometry().setFromPoints(Array.from({ length: TRAIL }, () => new THREE.Vector3()));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setAimCamera();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 명소 배경 구성. 블렌더 에셋(public/places/<id>.glb)이 있으면 그걸 쓰고, 없으면 절차적으로 만든다 */
  setPlace(place: Place): void {
    if (this.placeId === place.id) return;
    this.placeId = place.id;
    const u = this.water.uniforms;
    (u.uDeep.value as THREE.Color).setHex(place.water.deep);
    (u.uShallow.value as THREE.Color).setHex(place.water.shallow);
    (u.uSkyTop.value as THREE.Color).setHex(place.sky.top);
    (u.uSkyBottom.value as THREE.Color).setHex(place.sky.bottom);
    (u.uSun.value as THREE.Color).setHex(place.sky.sun);
    (u.uFog.value as THREE.Color).setHex(place.sky.bottom);
    u.uWaves.value = place.waves;
    (this.skyMat.uniforms.uTop.value as THREE.Color).setHex(place.sky.top);
    (this.skyMat.uniforms.uBottom.value as THREE.Color).setHex(place.sky.bottom);
    this.skyMat.uniforms.uStars.value = place.night ? 1 : 0;
    this.sunLight.color.setHex(place.sky.sun);
    this.sunLight.intensity = place.night ? 0.5 : 2.2;
    this.sunLight.position.set(30, 25, -20);
    this.hemi.color.setHex(place.sky.top);
    this.hemi.groundColor.setHex(place.shore);
    this.hemi.intensity = place.night ? 0.5 : 1.2;

    this.env.clear();
    this.buildProcedural(place);
    const id = place.id;
    this.loader.load(
      `places/${id}.glb`,
      (gltf) => {
        if (this.placeId !== id) return;
        this.env.clear();
        this.env.add(gltf.scene);
      },
      undefined,
      () => {
        /* 블렌더 에셋이 아직 없으면 절차적 배경 유지 */
      },
    );
  }

  private buildProcedural(place: Place): void {
    const rand = rng(hash(place.id));
    // 발밑 자갈 강변
    const shore = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 30),
      new THREE.MeshStandardMaterial({ color: place.shore, roughness: 1 }),
    );
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(0, 0.01, 15.5);
    this.env.add(shore);
    // 물가 자갈
    const pebbleGeo = new THREE.IcosahedronGeometry(1, 0);
    const pebbles = new THREE.InstancedMesh(pebbleGeo, new THREE.MeshStandardMaterial({ color: place.shore, roughness: 0.9 }), 400);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    for (let i = 0; i < 400; i++) {
      const s = 0.03 + rand() * 0.12;
      q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
      m.compose(new THREE.Vector3((rand() - 0.5) * 30, s * 0.3, 0.6 + rand() * 8), q, new THREE.Vector3(s, s * 0.5, s * 0.8));
      pebbles.setMatrixAt(i, m);
      pebbles.setColorAt(i, c.setHex(place.shore).multiplyScalar(0.6 + rand() * 0.6));
    }
    this.env.add(pebbles);
    // 먼 산 능선
    const far = new THREE.Color(place.sky.bottom).lerp(new THREE.Color(place.water.deep), 0.45);
    if (place.night) far.multiplyScalar(0.35);
    for (let i = 0; i < 14; i++) {
      const h = 15 + rand() * (place.stars >= 4 ? 70 : 35);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(30 + rand() * 40, h, 5),
        new THREE.MeshBasicMaterial({ color: far.clone().multiplyScalar(0.75 + rand() * 0.25), fog: false }),
      );
      cone.position.set((i - 7) * 45 + rand() * 20, h / 2 - 1, -260 - rand() * 80);
      this.env.add(cone);
    }
    // 양옆 나무
    if (!place.night) {
      const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f4a32, roughness: 1 });
      for (let i = 0; i < 40; i++) {
        const side = i % 2 ? 1 : -1;
        const h = 3 + rand() * 5;
        const t = new THREE.Mesh(new THREE.ConeGeometry(h * 0.3, h, 6), treeMat);
        t.position.set(side * (18 + rand() * 30), h / 2, -rand() * 120);
        this.env.add(t);
      }
    } else {
      // 밤: 건너편 불빛
      const n = 300;
      const pts = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pts.set([(rand() - 0.5) * 400, rand() * (place.id === 'hangang' ? 25 : 3), -150 - rand() * 30], i * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      this.env.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.9, sizeAttenuation: true })));
    }
  }

  setStone(stone: Stone): void {
    (this.stone.material as THREE.MeshStandardMaterial).color.setHex(stone.color);
  }

  /** 투척 준비: 손 위치에서 앞을 본다. roll·pitch로 손에 든 돌을 기울여 보여준다 */
  setAimCamera(): void {
    this.sim = null;
    this.camPos.set(0.35, 0.95, 1.6);
    this.camLook.set(0, 0.2, -12);
    this.stone.position.set(0.25, 0.45, 0.4);
    this.trailPts = [];
    this.updateTrail();
  }

  aimPose(roll: number, pitch: number): void {
    if (this.sim) return;
    this.stone.rotation.set(-((pitch - 10) * Math.PI) / 180, 0, (-roll * Math.PI) / 180);
  }

  play(sim: SimResult, perfect: boolean, hooks: PlaybackHooks): void {
    this.sim = sim;
    this.simT = 0;
    this.hooks = hooks;
    this.nextBounce = 0;
    this.sunk = false;
    this.endTimer = 0;
    this.perfect = perfect;
    this.trailPts = [];
    this.water.clearRipples();
    this.splash.clear();
  }

  /** 슬로모션: 첫 접촉과 퍼펙트 순간은 느리게, 끝의 연속 튕김은 빠르게 */
  private timeScale(): number {
    if (!this.sim || this.fx === 'real') return 1;
    const b = this.sim.bounces;
    let s = 1;
    for (let i = 0; i < Math.min(3, b.length); i++) {
      const d = Math.abs(this.simT - b[i].t);
      if (d < 0.09) s = Math.min(s, i === 0 && this.perfect ? 0.18 : 0.35);
    }
    if (b.length > 8 && this.simT > b[b.length - 4]?.t) s = Math.max(s, 1.4);
    return s;
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.water.uniforms.uTime.value = this.time;
    this.water.uniforms.uGlow.value = this.fx === 'flashy' ? 0.7 : 0.15;
    this.splash.update(dt);

    if (this.sim) this.step(dt);
    this.camera.position.lerp(this.camPos, this.sim ? 0.08 : 0.2);
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
  }

  private step(dt: number): void {
    const sim = this.sim!;
    const prevT = this.simT;
    this.simT += dt * this.timeScale();
    const { pos, seg } = positionAt(sim, this.simT);
    const wp = toWorld(pos);
    this.stone.position.copy(wp);
    if (seg) {
      const spin = seg.spin;
      this.stone.rotation.set(0, this.stone.rotation.y + dt * (8 + 30 * spin), (-seg.tilt * Math.PI) / 180, 'YXZ');
    }

    while (this.nextBounce < sim.bounces.length && sim.bounces[this.nextBounce].t <= this.simT) {
      const b = sim.bounces[this.nextBounce];
      const bp = toWorld(b.pos);
      const strength = Math.min(1, b.speed / 8);
      const dir = new THREE.Vector3(0, 0, -1);
      const big = this.fx === 'flashy' ? 1 : 0.45;
      this.splash.crown(bp.x, bp.z, dir.x, dir.z, (b.skid ? 0.25 : strength) * big, this.perfect && this.nextBounce < 3);
      this.water.addRipple(bp.x, bp.z, this.time, b.skid ? 0.5 : 1);
      this.hooks.onBounce?.(this.nextBounce, this.perfect);
      this.nextBounce++;
    }

    if (!this.sunk && this.simT >= sim.sinkAt.t && prevT < sim.sinkAt.t + 1) {
      this.sunk = true;
      const sp = toWorld(sim.sinkAt.pos);
      this.splash.column(sp.x, sp.z);
      this.water.addRipple(sp.x, sp.z, this.time, 1.4);
      this.stone.visible = false;
      this.hooks.onSink?.();
    }
    if (this.sunk) {
      this.endTimer += dt;
      if (this.endTimer > 1.6) {
        this.hooks.onEnd?.();
        this.hooks = {};
        this.sim = null;
        this.stone.visible = true;
        return;
      }
    }

    // 꼬리 잔상
    if (!this.sunk) {
      this.trailPts.push(wp.clone());
      if (this.trailPts.length > TRAIL) this.trailPts.shift();
      this.updateTrail();
    }

    // 카메라: 돌 뒤를 따라가다 10회를 넘으면 위에서 내려다본다
    const overhead = this.nextBounce >= 10 && this.fx === 'flashy';
    const target = this.sunk ? toWorld(sim.sinkAt.pos) : wp;
    if (overhead) this.camPos.set(target.x + 1.5, 7, target.z + 6);
    else this.camPos.set(target.x + 0.9, Math.max(0.6, target.y + 0.9), target.z + 3.4);
    this.camLook.copy(target).add(new THREE.Vector3(0, 0, -2));
  }

  private updateTrail(): void {
    const attr = this.trail.geometry.attributes.position as THREE.BufferAttribute;
    const last = this.trailPts[this.trailPts.length - 1] ?? this.stone.position;
    for (let i = 0; i < TRAIL; i++) {
      const p = this.trailPts[i] ?? last;
      attr.setXYZ(i, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
    this.trail.visible = this.trailPts.length > 1;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

