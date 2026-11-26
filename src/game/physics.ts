// 물수제비 물리 모델 (Clanet·Hersen·Bocquet 2004 Nature, Rosellini 외 2005 EPL).
// 공중에서는 중력(+옆바람)만 받는 포물선. 물에 닿으면 접촉 시간 동안 수치 적분한다:
//   잠긴 면적 S(돌 뒷가장자리가 물에 들어간 깊이로 정해지는 원 조각)에
//   수직 압력 F_n = ½ ρ C_n U² S sin(α+β) (돌 판에 수직)
//   마찰   F_f = ½ ρ C_f U² S (속도 반대 방향)
// α = 돌 기울기(받음각), β = 진입 각도(아래로 +). 이 둘만으로 '20° 근처가 가장 잘 튐',
// '튈수록 속도와 튀는 높이가 줄고 간격이 짧아짐', '마지막엔 미끄러지다 가라앉음'이 저절로 나온다.
// 같은 입력 + 같은 시드면 항상 같은 결과 (랭킹 서버 재계산 검증용).
// 좌표: x = 앞(던지는 방향), y = 위, z = 오른쪽. 단위 m, s, kg.

import type { Character, Item, Place, Stone } from './data';

export const G = 9.81;
const DEG = Math.PI / 180;
const MAX_BOUNCES = 150;
const RHO = 1000;
/** 판에 수직인 압력 계수 (평판 실험값 약 1) */
const CN = 1.0;
/**
 * 판 압력의 뒤쪽 성분 중 실제로 속도를 깎는 비율.
 * 빠르게 미끄러질 때 생기는 물보라 시트와 뒤쪽 공기 공동이 압력 분포를 앞쪽으로 옮겨
 * 순수 평판보다 저항이 작다 (Rosellini 외 2005의 C_D/C_L ≈ 0.2~0.3 수준).
 */
const KAPPA = 0.3;
/** 한 번에 미끄러질 수 있는 최대 시간(s) */
const PLANE_LIMIT = 0.05;
/** 접촉 적분 간격(s) */
const DT = 0.0002;

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

/** 돌 중심의 움직임 구간. p1이 없으면 중력 포물선(공중), 있으면 p0→p1 직선(물에 닿아 있는 동안) */
export interface Segment {
  t0: number;
  t1: number;
  p0: [number, number, number];
  v0: [number, number, number];
  p1?: [number, number, number];
  /** 옆바람 가속도 (z) */
  az: number;
  /** 구간 동안의 돌 기울기(°)와 스핀(0~1), 회전수(rev/s) */
  tilt: number;
  spin: number;
  rps: number;
}

export interface Bounce {
  t: number;
  pos: [number, number, number];
  /** 접촉 순간 수평 속도 */
  speed: number;
  tilt: number;
  /** 아주 낮게 튄 잔튕김(미끄러지듯 연속으로 튀는 구간)인지 */
  skid: boolean;
  rescued?: boolean;
  /** 돌 뒷가장자리가 가장 깊이 잠긴 깊이(m) */
  depth: number;
  /** 물에 닿아 있던 시간(s) */
  duration: number;
  /** 물에서 떨어질 때 속도 [vx, vy, vz] */
  out: [number, number, number];
  /** 진입 각도 β(°) */
  incidence: number;
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

/** 반지름 a 원판에서 가장자리로부터 깊이 d만큼 잘린 원 조각 넓이 */
export function segmentArea(a: number, d: number): number {
  if (d <= 0) return 0;
  if (d >= 2 * a) return Math.PI * a * a;
  return a * a * Math.acos(1 - d / a) - (a - d) * Math.sqrt(2 * a * d - d * d);
}

/** 공중: 중심 높이 y0, 수직 속도 vy에서 높이 yHit에 닿는 시각 */
function fallTime(y0: number, vy: number, yHit: number): number {
  const disc = vy * vy + 2 * G * (y0 - yHit);
  return (vy + Math.sqrt(Math.max(0, disc))) / G;
}

interface ContactResult {
  sunk: SinkReason | null;
  dt: number;
  dx: number;
  dy: number;
  vh: number;
  vy: number;
  depth: number;
}

/**
 * 한 번의 접촉을 적분한다. 수직 평면(진행 방향 h, 위 y)에서 푼다.
 * yc = 돌 중심 높이. 뒷가장자리 높이 = yc − a·sinα.
 */
function contact(vh: number, vy: number, yc: number, alpha: number, m: number, a: number, cf: number, uMin: number): ContactResult {
  const sa = Math.sin(alpha), ca = Math.cos(alpha);
  let t = 0, x = 0, y = yc, u = vh, w = vy, maxDepth = 0;
  for (let i = 0; i < 4000; i++) {
    const h = a * sa - y; // 뒷가장자리 잠긴 깊이
    if (h <= 0 && w > 0) return { sunk: null, dt: t, dx: x, dy: y - yc, vh: u, vy: w, depth: maxDepth };
    maxDepth = Math.max(maxDepth, h);
    // 돌 판을 따라 잰 잠긴 길이 → 원 조각 넓이
    const along = sa > 1e-3 ? h / sa : h > 0 ? 2 * a : 0;
    if (along >= 2 * a) return { sunk: 'steep', dt: t, dx: x, dy: y - yc, vh: u, vy: w, depth: maxDepth };
    const S = segmentArea(a, along);
    const U2 = u * u + w * w;
    const U = Math.sqrt(U2);
    const beta = Math.atan2(-w, u); // 아래로 내려가는 각
    const inc = alpha + beta; // 판에 부딪히는 흐름의 각
    const q = 0.5 * RHO * U2 * S;
    const fn = inc > 0 ? q * CN * Math.sin(inc) : 0;
    const ff = q * cf;
    // 판 법선 (−sinα, cosα): 위·뒤로 민다. 마찰은 속도 반대
    const fu = -fn * sa * KAPPA - (U > 0 ? (ff * u) / U : 0);
    const fw = fn * ca - (U > 0 ? (ff * w) / U : 0) - m * G;
    u += (fu / m) * DT;
    w += (fw / m) * DT;
    x += u * DT;
    y += w * DT;
    t += DT;
    if (u < uMin * 0.5) return { sunk: 'slow', dt: t, dx: x, dy: y - yc, vh: Math.max(u, 0), vy: w, depth: maxDepth };
    if (t > PLANE_LIMIT) {
      // 아주 얕게 미끄러지는 중: 실제 수면의 잔물결·돌의 흔들림 때문에 오래 활주하지 못하고
      // 작게 튀어 오르거나(빠를 때) 물을 파고들어 가라앉는다(느릴 때)
      if (u > uMin) return { sunk: null, dt: t, dx: x, dy: Math.max(y, a * sa) - yc, vh: u, vy: Math.max(w, 0.06 + 0.025 * u), depth: maxDepth };
      return { sunk: 'slow', dt: t, dx: x, dy: y - yc, vh: u, vy: w, depth: maxDepth };
    }
  }
  return { sunk: 'slow', dt: t, dx: x, dy: y - yc, vh: u, vy: w, depth: maxDepth };
}

export function simulate(input: ThrowInput, loadout: Loadout, seed: number): SimResult {
  const { character: c, stone: s, place: p, item } = loadout;
  const rand = rng(seed);
  const noise = () => rand() * 2 - 1;
  const m = s.mass;
  const a = s.radius;

  // 정확 능력치가 높을수록 방향 오차가 줄어든다
  const dirNoise = noise() * (1 - input.stability) * (6 - c.acc) * 0.6;
  const dir = clamp(input.direction, -30, 30) + dirNoise;

  const placeStr = c.id === 'miru' && p.waves >= 0.25 ? 1 : 0;
  // 성인 보통 투척 8~12 m/s
  const vMax = 12;
  const speed0 = vMax * clamp(input.power, 0, 1) * (1 + 0.08 * (c.str + placeStr - 3));
  // 폰 피치 10°(기본 목표)가 수평 발사. 더 숙이거나 들면 발사각이 바뀐다
  const launch = clamp((input.pitch - 10) * 0.6, -15, 35);
  // 손에서 떠날 때 손목 흔들림이 기울기 오차가 된다
  let tilt = clamp(input.tilt, -90, 90) + noise() * (1 - clamp(input.accuracy, 0, 1)) * 6;
  const spin0 = clamp(input.stability * (0.55 + 0.09 * c.snap) + input.focus * 0.1, 0, 1);
  let spin = spin0;
  // 실제 물수제비 돌은 초당 10~15바퀴쯤 돈다
  const rpsOf = (sp: number) => 4 + 12 * sp;

  // 마찰: 돌 표면 + 밀랍 + 집중
  let cf = s.friction * (1 - (item.eBonus ?? 0) * 8) * (1 - input.focus * 0.05);
  const windAcc = item.noWind ? 0 : p.wind * s.windFactor * (c.id === 'no' ? 0.5 : 1) * (0.1 / m) ** 0.5;

  // 물 위에 뜰 수 있는 최소 속도: 무게를 받칠 압력 ½ρU²a² ~ mg 에서 U ~ √(mg/ρa²) (Clanet 2004)
  const uMin = 6 * Math.sqrt((m * G) / (RHO * a * a));
  const vh0 = speed0 * Math.cos(launch * DEG);
  let hx = Math.cos(dir * DEG), hz = Math.sin(dir * DEG); // 진행 방향 단위벡터
  let vh = vh0;
  // 바람이 만든 옆 속도: 돌의 진행 속도와 따로 두고, 물에 닿을 때마다 줄어든다
  let vzWind = 0;
  let vy = speed0 * Math.sin(launch * DEG);
  let pos: [number, number, number] = [0, c.height, 0];
  let t = 0;

  const segments: Segment[] = [];
  const bounces: Bounce[] = [];
  let rescueLeft = !!item.rescue;
  let reason: SinkReason = 'limit';

  for (let i = 0; i <= MAX_BOUNCES; i++) {
    // 물결: 닿는 자리의 수면이 기울어 있어 돌이 느끼는 받음각과 진입각이 바뀐다
    const waveSlope = noise() * p.waves * 14 * DEG;
    const alpha = tilt * DEG;
    // 공중: 뒷가장자리가 수면에 닿을 때까지
    const yHit = a * Math.max(0, Math.sin(alpha));
    const dt = pos[1] > yHit || vy > 0 ? fallTime(pos[1], vy, yHit) : 0;
    const vx0 = vh * hx, vz0 = vh * hz + vzWind;
    segments.push({ t0: t, t1: t + dt, p0: [...pos], v0: [vx0, vy, vz0], az: windAcc, tilt, spin, rps: rpsOf(spin) });
    pos = [pos[0] + vx0 * dt, yHit, pos[2] + vz0 * dt + 0.5 * windAcc * dt * dt];
    vzWind += windAcc * dt;
    vy -= G * dt;
    t += dt;
    if (i === MAX_BOUNCES) break;

    const incidence = Math.atan2(-vy, vh) / DEG;
    const touch = { t, pos: [pos[0], 0, pos[2]] as [number, number, number], speed: vh, incidence };

    let r: ContactResult | null = null;
    let fail: SinkReason | null = null;
    // 앞이 아래로 숙으면(기울기 ≤ 0) 앞가장자리가 물을 파고들어 바로 가라앉는다
    if (tilt <= 0) fail = 'tilt';
    else if (tilt > s.maxTilt) fail = 'tilt';
    else {
      const sol = c.id === 'sol' && vh < 4 ? 0.7 : 1; // 너구리 솔: 느린 잔튕김에서 마찰이 적다
      // 기울어진 수면 기준 좌표로 돌려서 접촉을 풀고 다시 돌려놓는다
      const cs = Math.cos(waveSlope), sn = Math.sin(waveSlope);
      const ul = vh * cs + vy * sn, wl = -vh * sn + vy * cs;
      r = contact(ul, wl, pos[1], alpha - waveSlope, m, a, cf * sol, uMin);
      if (!r.sunk) {
        const uo = r.vh * cs - r.vy * sn, wo = r.vh * sn + r.vy * cs;
        const dxo = r.dx * cs - r.dy * sn, dyo = r.dx * sn + r.dy * cs;
        r = { ...r, vh: Math.max(0, uo), vy: wo, dx: dxo, dy: dyo };
        if (r.vy < 0.08) r = { ...r, vy: 0.08 }; // 기울어진 물결 위로 미끄러져 나간다
      }
      fail = r.sunk;
    }

    if (fail) {
      if (rescueLeft && fail !== 'tilt' && vh > 1) {
        // 네잎클로버: 한 번 구제 (게임 아이템)
        rescueLeft = false;
        bounces.push({ ...touch, tilt, skid: false, rescued: true, depth: 0.01, duration: 0.01, out: [vh * hx, 0.25 * vh, vh * hz] });
        vy = 0.25 * vh;
        pos[1] = yHit + 0.001;
        continue;
      }
      if (r) {
        // 가라앉는 장면도 접촉 구간으로 남긴다 (조금 끌려가며 잠김)
        const p1: [number, number, number] = [pos[0] + r.dx * hx, -0.05, pos[2] + r.dx * hz];
        segments.push({ t0: t, t1: t + Math.max(r.dt, 0.03), p0: [...pos], v0: [vh * hx, vy, vh * hz], p1, az: 0, tilt, spin, rps: rpsOf(spin) });
        t += Math.max(r.dt, 0.03);
        pos = [p1[0], 0, p1[2]];
      } else pos[1] = 0;
      reason = fail;
      break;
    }

    const res = r!;
    const p1: [number, number, number] = [pos[0] + res.dx * hx, pos[1] + res.dy, pos[2] + res.dx * hz];
    segments.push({ t0: t, t1: t + res.dt, p0: [...pos], v0: [vh * hx, vy, vh * hz], p1, az: 0, tilt, spin, rps: rpsOf(spin) });
    t += res.dt;
    pos = p1;
    vzWind *= 0.6;
    vh = res.vh;
    vy = res.vy;
    const skid = vy < 0.4;
    bounces.push({ ...touch, tilt, skid, depth: res.depth, duration: res.dt, out: [vh * hx, vy, vh * hz] });

    // 스핀이 적을수록 접촉 때 받는 토크로 기울기가 흔들린다 (자이로 안정)
    tilt += noise() * (1 - spin) * 6 + noise() * p.waves * 2;
    spin *= 1 - s.spinDecay;
    // 기울기 흔들림이 진행 방향도 살짝 튼다
    const turn = noise() * (1 - spin) * 0.8 * DEG;
    [hx, hz] = [hx * Math.cos(turn) - hz * Math.sin(turn), hx * Math.sin(turn) + hz * Math.cos(turn)];
  }

  return {
    segments,
    bounces,
    sinkAt: { t, pos: [pos[0], 0, pos[2]], reason },
    distance: Math.hypot(pos[0], pos[2]),
    initial: { speed: speed0, launch, tilt: input.tilt, spin: spin0 },
  };
}

/** 렌더링용: 시각 t의 돌 (중심) 위치. 물에 닿아 있는 동안은 수면 아래로 살짝 잠긴다 */
export function positionAt(res: SimResult, t: number): { pos: [number, number, number]; seg: Segment | null } {
  const seg = res.segments.find((sg) => t >= sg.t0 && t < sg.t1) ?? null;
  if (!seg) return { pos: t >= res.sinkAt.t ? res.sinkAt.pos : res.segments[0].p0, seg: null };
  const d = t - seg.t0;
  if (seg.p1) {
    const k = (seg.t1 - seg.t0) > 0 ? d / (seg.t1 - seg.t0) : 1;
    // 접촉 동안: 앞으로 미끄러지며 가운데가 가장 깊다
    const dip = Math.sin(Math.PI * k) * 0.006;
    return {
      pos: [seg.p0[0] + (seg.p1[0] - seg.p0[0]) * k, seg.p0[1] + (seg.p1[1] - seg.p0[1]) * k - dip, seg.p0[2] + (seg.p1[2] - seg.p0[2]) * k],
      seg,
    };
  }
  return {
    pos: [seg.p0[0] + seg.v0[0] * d, seg.p0[1] + seg.v0[1] * d - 0.5 * G * d * d, seg.p0[2] + seg.v0[2] * d + 0.5 * seg.az * d * d],
    seg,
  };
}
