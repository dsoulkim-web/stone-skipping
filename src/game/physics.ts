// 물수제비 물리 모델. 같은 입력 + 같은 시드면 항상 같은 결과가 나온다 (랭킹 서버 재계산 검증용).
// 좌표: x = 앞(던지는 방향), y = 위, z = 오른쪽. 단위 m, s.

import type { Character, Item, Place, Stone } from './data';

export const G = 9.81;
const DEG = Math.PI / 180;
const MAX_BOUNCES = 150;
const IDEAL_TILT = 20;

/** 플레이어 입력 (센서 + 터치) */
export interface ThrowInput {
  /** 플릭 힘 0~1 (개인 보정 후 상대값) */
  power: number;
  /** 좌우 방향(°), +는 오른쪽 */
  direction: number;
  /** 발사 순간 돌 기울기 = 폰 롤(°) */
  tilt: number;
  /** 발사 순간 발사각 = 폰 피치(°) */
  pitch: number;
  /** 자세 정확도 0~1 */
  accuracy: number;
  /** 안정성 0~1 */
  stability: number;
  /** 집중 게이지 0~1 */
  focus: number;
}

export interface Loadout {
  character: Character;
  stone: Stone;
  place: Place;
  item: Item;
}

/** 공중 비행 구간: 시작 위치·속도에서 중력만 받는 포물선 */
export interface Segment {
  t0: number;
  t1: number;
  p0: [number, number, number];
  v0: [number, number, number];
  /** 옆바람 가속도 (z) */
  az: number;
  /** 구간 동안의 돌 기울기와 스핀 (연출용) */
  tilt: number;
  spin: number;
}

export interface Bounce {
  t: number;
  pos: [number, number, number];
  /** 접촉 순간 수평 속도 */
  speed: number;
  tilt: number;
  /** 잔물결 구간(아주 짧은 튕김)인지 */
  skid: boolean;
  rescued?: boolean;
}

export type SinkReason = 'slow' | 'steep' | 'tilt' | 'limit';

export interface SimResult {
  segments: Segment[];
  bounces: Bounce[];
  sinkAt: { t: number; pos: [number, number, number]; reason: SinkReason };
  /** 수평 이동 거리(m) */
  distance: number;
  initial: { speed: number; launch: number; tilt: number; spin: number };
}

/** 작은 결정적 난수 생성기 (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 공중에서 수면(y=0)에 닿는 시각 */
function impactTime(y0: number, vy: number): number {
  // y0 + vy t - G t²/2 = 0
  const disc = vy * vy + 2 * G * y0;
  return (vy + Math.sqrt(disc)) / G;
}

export function simulate(input: ThrowInput, loadout: Loadout, seed: number): SimResult {
  const { character: c, stone: s, place: p, item } = loadout;
  const rand = rng(seed);
  const noise = () => rand() * 2 - 1;

  // 정확 능력치가 높을수록 방향 오차가 줄어든다
  const dirNoise = noise() * (1 - input.stability) * (6 - c.acc) * 0.6;
  const dir = clamp(input.direction, -30, 30) + dirNoise;

  const placeStr = c.id === 'miru' && p.waves >= 0.25 ? 1 : 0;
  const vMax = 9.5;
  const speed0 = vMax * clamp(input.power, 0, 1) * (1 + 0.1 * (c.str + placeStr - 3));
  // 폰 피치 10°(기본 목표)가 수평 발사. 더 숙이거나 들면 발사각이 바뀐다
  const launch = clamp((input.pitch - 10) * 0.6, -15, 35);
  let tilt = clamp(input.tilt, -90, 90);
  const spin0 = clamp(input.stability * (0.55 + 0.09 * c.snap) + input.focus * 0.1, 0, 1);
  let spin = spin0;

  const windAcc = item.noWind ? 0 : p.wind * s.windFactor * (c.id === 'no' ? 0.5 : 1);
  const eBase = s.e + (item.eBonus ?? 0) - (1 - clamp(input.accuracy, 0, 1)) * 0.1 + input.focus * 0.01;

  const vh0 = speed0 * Math.cos(launch * DEG);
  let vx = vh0 * Math.cos(dir * DEG);
  let vz = vh0 * Math.sin(dir * DEG);
  // 바람이 만든 옆 속도: 돌의 진행 속도와 따로 두고, 물에 닿을 때마다 절반으로 줄어든다
  let vzWind = 0;
  let vy = speed0 * Math.sin(launch * DEG);
  let pos: [number, number, number] = [0, c.height, 0];
  let t = 0;

  const segments: Segment[] = [];
  const bounces: Bounce[] = [];
  let rescueLeft = !!item.rescue;
  let reason: SinkReason = 'limit';

  for (let i = 0; i <= MAX_BOUNCES; i++) {
    const dt = impactTime(pos[1], vy);
    segments.push({ t0: t, t1: t + dt, p0: [...pos], v0: [vx, vy, vz + vzWind], az: windAcc, tilt, spin });
    // 수면 도달
    pos = [pos[0] + vx * dt, 0, pos[2] + (vz + vzWind) * dt + 0.5 * windAcc * dt * dt];
    vzWind = (vzWind + windAcc * dt) * 0.5;
    vy = vy - G * dt;
    t += dt;
    if (i === MAX_BOUNCES) break;

    const vh = Math.hypot(vx, vz);
    // 물결: 입사각을 흔든다
    const waveJitter = noise() * p.waves * 20;
    const incidence = Math.atan2(-vy, vh) / DEG + waveJitter;
    const tiltErr = Math.abs(tilt - IDEAL_TILT);
    const vMinEff = s.vMin * (1 + 0.025 * tiltErr);

    let fail: SinkReason | null = null;
    if (tilt <= 0 || tilt > s.maxTilt) fail = 'tilt';
    else if (incidence > 30) fail = 'steep';
    else if (vh < vMinEff) fail = 'slow';

    if (fail) {
      if (rescueLeft && fail !== 'tilt' && vh > 1) {
        rescueLeft = false;
        bounces.push({ t, pos: [...pos], speed: vh, tilt, skid: false, rescued: true });
        vy = 0.25 * vh;
        continue;
      }
      reason = fail;
      break;
    }

    // 튕김: 수평 속도 손실, 다시 뜸
    // 물결이 셀수록 접촉 때 속도를 더 잃는다
    const k = clamp(eBase, 0.5, 0.97) * (1 - 0.004 * tiltErr) * (1 - p.waves * 0.08 * rand());
    vx *= k;
    vz *= k;
    const vh2 = vh * k;
    vy = s.cy * vh2 * (1 + noise() * p.waves * 0.3);
    const skid = vy < 0.35;
    bounces.push({ t, pos: [...pos], speed: vh, tilt, skid });

    // 너구리 솔: 잔물결 구간에서 덜 감속
    if (skid && c.id === 'sol') {
      vx /= Math.sqrt(k);
      vz /= Math.sqrt(k);
    }

    // 스핀이 적을수록 기울기가 흔들린다 (자이로 안정)
    tilt += noise() * (1 - spin) * 8;
    spin *= 1 - s.spinDecay;
  }

  return {
    segments,
    bounces,
    sinkAt: { t, pos, reason },
    distance: Math.hypot(pos[0], pos[2]),
    initial: { speed: speed0, launch, tilt: input.tilt, spin: spin0 },
  };
}

/** 렌더링용: 시각 t의 돌 위치 */
export function positionAt(res: SimResult, t: number): { pos: [number, number, number]; seg: Segment | null } {
  const seg = res.segments.find((sg) => t >= sg.t0 && t < sg.t1) ?? null;
  if (!seg) return { pos: res.sinkAt.pos, seg: null };
  const d = t - seg.t0;
  return {
    pos: [
      seg.p0[0] + seg.v0[0] * d,
      Math.max(0, seg.p0[1] + seg.v0[1] * d - 0.5 * G * d * d),
      seg.p0[2] + seg.v0[2] * d + 0.5 * seg.az * d * d,
    ],
    seg,
  };
}
