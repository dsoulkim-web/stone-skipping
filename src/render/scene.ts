// 3D 장면: 명소 배경, 하늘, 반사 수면, 돌, 물보라, 카메라 연출, 후처리.
// 물리 좌표(x 앞, y 위, z 오른쪽) → 월드 좌표(x 오른쪽, y 위, -z 앞).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Place, Stone } from '../game/data';
import { positionAt, type SimResult } from '../game/physics';
import { Post } from './post';
import { SCENERY, buildScenery, type BuiltScenery, type SceneryLook } from './scenery';
import { SkyDome } from './sky';
import { Splash } from './splash';
import { makeStoneMesh } from './stone';
import { Water } from './water';

const toWorld = (p: [number, number, number]) => new THREE.Vector3(p[2], p[1], -p[0]);
const TRAIL = 16;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const QUALITY = [2, 1.6, 1.3, 1.0, 0.8];

export interface PlaybackHooks {
  onBounce?: (index: number, perfect: boolean) => void;
  onSink?: () => void;
  onEnd?: () => void;
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private post: Post;
  private water: Water;
  private sky = new SkyDome();
  private splash = new Splash();
  private stone: THREE.Mesh;
  private stoneId = '';
  private trail: THREE.Mesh;
  private trailPts: THREE.Vector3[] = [];
  private env = new THREE.Group();
  private built: BuiltScenery | null = null;
  private envMap: THREE.Texture | null = null;
  private pmrem: THREE.PMREMGenerator;
  private sun = new THREE.DirectionalLight(0xffffff, 3);
  private fill = new THREE.HemisphereLight(0xffffff, 0x444444, 0);
  private clock = new THREE.Clock();
  private time = 0;
  private loader = new GLTFLoader();
  private placeId = '';
  private night = false;
  /** 바닥 커스틱 등 여러 재질이 함께 쓰는 유니폼 */
  private shared: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uSunColor: { value: new THREE.Color() },
    uNight: { value: 0 },
    uDeep: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color() },
  };

  // 화질 자동 조절
  private quality = 1;
  private frameAvg = 1 / 60;
  private frames = 0;

  // 재생 상태
  private sim: SimResult | null = null;
  private simT = 0;
  private hooks: PlaybackHooks = {};
  private nextBounce = 0;
  private sunk = false;
  private endTimer = 0;
  private perfect = false;
  private flash = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private curLook = new THREE.Vector3(0, 0.2, -12);
  private heading = 0;
  private spinAngle = 0;
  private qYaw = new THREE.Quaternion();
  private qPitch = new THREE.Quaternion();
  private qSpin = new THREE.Quaternion();
  /** 화면 연출 강도: 'real' 실제처럼, 'flashy' 화려하게 */
  fx: 'real' | 'flashy' = 'flashy';
  /** 개발용: 고정 프레임 시간 (느린 헤드리스 렌더 확인용) */
  fixedDt = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.quality = window.devicePixelRatio > 1.5 ? 1 : 0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[this.quality]));
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.08, 9000);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.scene.fog = new THREE.FogExp2(0xffffff, 0.001);
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.water = new Water(Math.round(buf.x * 0.5), Math.round(buf.y * 0.5));
    // 떨어지는 물방울 물결은 튕김 물결 사슬을 덮어쓰지 않도록 쓰지 않는다

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -9;
    sc.right = sc.top = 9;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sky.mesh, this.water.mesh, this.splash.group, this.env, this.sun, this.sun.target, this.fill);

    this.stone = new THREE.Mesh();
    this.scene.add(this.stone);

    this.trail = this.makeTrail();
    this.scene.add(this.trail);

    this.post = new Post(this.renderer, this.scene, this.camera);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setAimCamera();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio, QUALITY[this.quality]);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, pr);
    this.water.setResolution(Math.round(w * pr * 0.5), Math.round(h * pr * 0.5));
    this.camera.aspect = w / h;
    // 세로 화면에서도 수평선 폭이 좁아지지 않게
    this.camera.fov = w < h ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  /** 명소 배경 구성. 블렌더 에셋(public/places/<id>.glb)이 있으면 그걸 쓰고, 없으면 절차적으로 만든다 */
  setPlace(place: Place): void {
    if (this.placeId === place.id) return;
    this.placeId = place.id;
    const s: SceneryLook = SCENERY[place.id] ?? SCENERY.donggang;
    this.night = !!place.night;
    const el = THREE.MathUtils.degToRad(s.sun.el);
    const az = THREE.MathUtils.degToRad(s.sun.az);
    const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));

    this.sky.apply({
      zenith: place.sky.top,
      horizon: place.sky.bottom,
      sunColor: place.sky.sun,
      sunDir,
      cloud: s.cloud,
      night: this.night,
      haze: s.haze,
      milky: place.id === 'tekapo' ? 1 : this.night ? 0.25 : 0,
    });

    const horizon = new THREE.Color(place.sky.bottom);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(horizon);
    fog.density = s.fog;

    const u = this.water.uniforms;
    (u.uDeep.value as THREE.Color).setHex(place.water.deep);
    (u.uShallow.value as THREE.Color).setHex(place.water.shallow);
    (u.uSunDir.value as THREE.Vector3).copy(sunDir);
    (u.uSunColor.value as THREE.Color).setHex(place.sky.sun).multiplyScalar(this.night ? 0.5 : 2.2);
    (u.uFogColor.value as THREE.Color).copy(horizon);
    u.uFogDensity.value = s.fog;
    u.uWaves.value = place.waves;
    u.uNight.value = this.night ? 1 : 0;
    (u.uAmbient.value as THREE.Color)
      .setHex(place.sky.top)
      .lerp(horizon, 0.5)
      .multiplyScalar(this.night ? 0.45 : 0.45);
    u.uCurve.value = s.curve;
    u.uFar.value = s.far;
    u.uNearSlope.value = s.nearSlope;
    u.uFarSlope.value = s.farSlope;

    (this.shared.uSunColor.value as THREE.Color).setHex(place.sky.sun).multiplyScalar(this.night ? 0.2 : 1.2);
    this.shared.uNight.value = this.night ? 1 : 0;
    (this.shared.uDeep.value as THREE.Color).setHex(place.water.deep);
    (this.shared.uShallow.value as THREE.Color).setHex(place.water.shallow);

    this.sun.color.setHex(this.night ? 0x9fb4ff : place.sky.sun);
    this.sun.intensity = this.night ? 0.8 : 3.2 * Math.min(1, 0.4 + Math.sin(el) * 1.4) * (s.cloud > 0.8 ? 0.55 : 1);
    this.sun.userData.dir = sunDir;
    this.fill.color.setHex(place.sky.top);
    this.fill.groundColor.setHex(place.shore);
    this.fill.intensity = this.night ? 0.6 : 0;

    const sp = this.splash.uniforms;
    sp.uLight.value.setHex(place.sky.sun).multiplyScalar(this.night ? 0.35 : 1.3);
    sp.uAmbient.value.copy(u.uAmbient.value as THREE.Color).multiplyScalar(1.6);
    sp.uSunDir.value.copy(sunDir);
    sp.uBright.value = this.night ? 0.4 : 1;

    this.renderer.toneMappingExposure = s.exposure;
    this.post.bloom.strength = this.night ? 0.9 : 0.4;
    this.post.bloom.threshold = this.night ? 0.7 : 1.0;

    // 하늘로 주변광(환경맵)을 굽는다
    this.envMap?.dispose();
    const envScene = new THREE.Scene();
    this.scene.remove(this.sky.mesh);
    envScene.add(this.sky.mesh);
    this.sky.mesh.position.set(0, 0, 0);
    this.envMap = this.pmrem.fromScene(envScene, 0.02, 0.1, 9000).texture;
    envScene.remove(this.sky.mesh);
    this.scene.add(this.sky.mesh);
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = this.night ? 0.5 : 0.9;

    this.env.clear();
    this.built?.dispose();
    this.built = buildScenery(place, s, this.shared, hash(place.id));
    this.env.add(this.built.group);
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

  setStone(stone: Stone): void {
    if (this.stoneId === stone.id) return;
    this.stoneId = stone.id;
    const old = this.stone;
    const mesh = makeStoneMesh(stone);
    mesh.position.copy(old.position);
    mesh.rotation.copy(old.rotation);
    mesh.visible = old.visible;
    this.scene.remove(old);
    old.geometry.dispose();
    (old.material as THREE.Material).dispose?.();
    this.stone = mesh;
    this.scene.add(mesh);
  }

  /** 투척 준비: 손 위치에서 앞을 본다. roll·pitch로 손에 든 돌을 기울여 보여준다 */
  setAimCamera(): void {
    this.sim = null;
    this.camPos.set(0.35, 1.05, 1.9);
    this.camLook.set(0, 0.3, -14);
    this.camera.position.copy(this.camPos);
    this.curLook.copy(this.camLook);
    this.stone.position.set(0.2, 0.78, 1.2);
    this.stone.visible = true;
    this.trailPts = [];
    this.updateTrail();
  }

  aimPose(roll: number, pitch: number): void {
    if (this.sim) return;
    // 손에 든 돌: 폰 롤 = 돌의 받음각(앞을 드는 각), 폰 피치 = 던지는 방향의 위아래
    this.qPitch.setFromAxisAngle(X_AXIS, THREE.MathUtils.degToRad(roll));
    this.qYaw.setFromAxisAngle(Y_AXIS, 0);
    this.stone.quaternion.copy(this.qYaw).multiply(this.qPitch);
    this.stone.rotateX(THREE.MathUtils.degToRad(-(pitch - 10) * 0.6));
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
      // 첫 접촉만 고속 촬영처럼 느리게 보여준다
      if (d < 0.06) s = Math.min(s, i === 0 ? (this.perfect ? 0.15 : 0.25) : 0.5);
    }
    return s;
  }

  /** 개발용: 즉시 한 프레임 그리고 캔버스 이미지를 돌려준다 */
  snap(): string {
    this.frame();
    return this.renderer.domElement.toDataURL('image/png');
  }

  /** 개발용: 그리지 않고 시간만 한 프레임 진행 */
  frameOnly(): void {
    const r = this.post.render.bind(this.post);
    this.post.render = () => {};
    this.frame();
    this.post.render = r;
  }

  private frame(): void {
    const raw = this.clock.getDelta();
    const dt = this.fixedDt || Math.min(raw, 0.05);
    if (!this.fixedDt) this.adapt(raw);
    if (import.meta.env.DEV) {
      const w = window as unknown as { __frames: number };
      w.__frames = this.sim ? (w.__frames || 0) + 1 : 0;
    }
    this.time += dt;
    this.water.uniforms.uTime.value = this.time;
    this.water.uniforms.uGlow.value = this.fx === 'flashy' ? 0.1 : 0;
    this.shared.uTime.value = this.time;
    this.sky.uniforms.uSkyTime.value = this.time;
    this.splash.update(dt);

    if (this.sim) this.step(dt);
    this.camera.position.lerp(this.camPos, this.sim ? 0.08 : 0.15);
    this.curLook.lerp(this.camLook, this.sim ? 0.18 : 0.2);
    this.camera.lookAt(this.curLook);
    this.sky.mesh.position.copy(this.camera.position);

    // 그림자는 보고 있는 곳 주변만
    const dir = this.sun.userData.dir as THREE.Vector3 | undefined;
    if (dir) {
      const focus = this.sim ? this.stone.position : new THREE.Vector3(0, 0, -2);
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).addScaledVector(dir, 60);
    }

    this.flash *= Math.exp(-dt * 6);
    this.post.grade.uniforms.uFlash.value = this.fx === 'flashy' ? this.flash : 0;
    this.post.render(dt);
  }

  /** 프레임이 느리면 해상도를 한 단계씩 낮춘다 */
  private adapt(raw: number): void {
    if (raw > 0.25) return; // 탭 전환 등
    this.frameAvg += (raw - this.frameAvg) * 0.05;
    this.frames++;
    if (this.frames > 90 && this.frameAvg > 1 / 38 && this.quality < QUALITY.length - 1) {
      this.quality++;
      this.frames = 0;
      this.resize();
      if (this.quality >= 3) this.sun.shadow.mapSize.set(512, 512);
    }
  }

  private step(dt: number): void {
    const sim = this.sim!;
    const prevT = this.simT;
    this.simT += dt * this.timeScale();
    const { pos, seg } = positionAt(sim, this.simT);
    const wp = toWorld(pos);
    this.stone.position.copy(wp);
    if (seg) {
      // 진행 방향(수평)으로 돌을 향하게 하고, 받음각만큼 앞을 들고, 자기 축으로 실제 회전수만큼 돈다
      const d = this.simT - seg.t0;
      const hx = seg.v0[2] + (seg.p1 ? 0 : seg.az * d);
      const hz = -seg.v0[0];
      if (hx * hx + hz * hz > 1e-6) this.heading = Math.atan2(-hx, -hz);
      this.spinAngle += dt * this.timeScale() * seg.rps * Math.PI * 2;
      // 스핀이 약하면 자이로 안정이 약해 받음각이 흔들린다 (세차 운동)
      const wobble = Math.sin(this.spinAngle * 0.13) * (1 - seg.spin) * 4;
      this.qYaw.setFromAxisAngle(Y_AXIS, this.heading);
      this.qPitch.setFromAxisAngle(X_AXIS, THREE.MathUtils.degToRad(seg.tilt + wobble));
      this.qSpin.setFromAxisAngle(Y_AXIS, this.spinAngle);
      this.stone.quaternion.copy(this.qYaw).multiply(this.qPitch).multiply(this.qSpin);
    }

    while (this.nextBounce < sim.bounces.length && sim.bounces[this.nextBounce].t <= this.simT) {
      const b = sim.bounces[this.nextBounce];
      const bp = toWorld(b.pos);
      const out = toWorld(b.out);
      const hlen = Math.hypot(out.x, out.z) || 1;
      // 물보라 크기: 잠긴 깊이 × 속도 (물을 밀어낸 양에 비례)
      const strength = THREE.MathUtils.clamp((b.depth / 0.012) * (b.speed / 9), 0.06, 1.2);
      const big = this.fx === 'flashy' ? 1 : 0.7;
      const first = this.perfect && this.nextBounce < 3;
      this.splash.crown(bp.x, bp.z, out.x / hlen, out.z / hlen, strength * big, first, b.speed);
      this.water.addRipple(bp.x, bp.z, this.time, THREE.MathUtils.clamp(0.25 + strength * 0.8, 0.25, 1.2));
      if (first && this.nextBounce === 0) this.flash = 0.06;
      this.hooks.onBounce?.(this.nextBounce, this.perfect);
      this.nextBounce++;
    }

    if (!this.sunk && this.simT >= sim.sinkAt.t && prevT < sim.sinkAt.t + 1) {
      this.sunk = true;
      const sp = toWorld(sim.sinkAt.pos);
      // 마지막은 대개 느려진 돌이 '퐁' 하고 잠긴다. 처음부터 처박힌 경우만 크게 튄다
      const hard = sim.bounces.length === 0 ? 1 : 0.3;
      this.splash.column(sp.x, sp.z, hard * (this.fx === 'flashy' ? 1 : 0.7));
      this.water.addRipple(sp.x, sp.z, this.time, 0.6 + hard * 0.8);
      this.stone.visible = false;
      this.hooks.onSink?.();
    }
    if (this.sunk) {
      this.endTimer += dt;
      if (this.endTimer > 2.2) {
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
    } else if (this.trailPts.length) this.trailPts.shift();
    this.updateTrail();

    // 카메라: 처음엔 돌 뒤를 낮게 따라가고, 튈수록 조금씩 올라가며 물결 사슬이 보이게 물러난다
    const target = this.sunk ? toWorld(sim.sinkAt.pos) : wp;
    const k = Math.min(this.nextBounce, 20);
    this.camPos.set(target.x + 0.8 + k * 0.06, 0.45 + Math.max(0, target.y) * 0.6 + k * 0.09, target.z + 2.8 + k * 0.2);
    this.camLook.copy(target).add(new THREE.Vector3(0, 0, -2.2));
  }

  private makeTrail(): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
    const t = new Float32Array(TRAIL * 2);
    for (let i = 0; i < TRAIL; i++) t[i * 2] = t[i * 2 + 1] = i / (TRAIL - 1);
    geo.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uA: { value: 0.3 } },
      vertexShader: /* glsl */ `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `varying float vT; uniform float uA; void main(){ gl_FragColor = vec4(vec3(0.8, 0.95, 1.0) * 0.7 * vT * vT * uA, 1.0); }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 4;
    return m;
  }

  private updateTrail(): void {
    const attr = this.trail.geometry.attributes.position as THREE.BufferAttribute;
    const pts = this.trailPts;
    const n = pts.length;
    this.trail.visible = n > 2 && this.fx === 'flashy';
    if (!this.trail.visible) return;
    const toCam = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < TRAIL; i++) {
      // 가장 오래된 점을 앞쪽 인덱스로 채우고, 모자라면 첫 점 반복
      const k = Math.max(0, n - TRAIL + i);
      const p = pts[Math.min(k, n - 1)];
      const q = pts[Math.min(k + 1, n - 1)];
      const r = pts[Math.max(k - 1, 0)];
      tan.subVectors(q, r);
      if (tan.lengthSq() < 1e-8) tan.set(0, 0, -1);
      toCam.subVectors(this.camera.position, p);
      side.crossVectors(tan, toCam).normalize().multiplyScalar(0.012 * (i / TRAIL));
      attr.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z);
      attr.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
    }
    attr.needsUpdate = true;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
