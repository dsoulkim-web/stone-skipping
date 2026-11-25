// 점수 계산: (100 × 튕김 + 10 × 거리 + 기술 보너스) × 장소 배율 × 아이템 배율

import { STAR_MULTIPLIER, type Mission } from './data';
import type { Loadout, SimResult, ThrowInput } from './physics';

export interface BonusLine {
  label: string;
  points: number;
}

export interface ScoreResult {
  skips: number;
  distance: number;
  base: number;
  bonuses: BonusLine[];
  placeMul: number;
  itemMul: number;
  total: number;
  perfect: boolean;
  grade: string;
}

export function perfectWindow(loadout: Loadout): number {
  // 감각 1당 +0.75°, 기본 ±3°, 최대 ±6°, 아이템 보너스 별도
  const base = Math.min(6, 3 + (loadout.character.feel - 1) * 0.75);
  return base + (loadout.item.perfectBonus ?? 0);
}

export function isPerfect(input: ThrowInput, loadout: Loadout): boolean {
  return Math.abs(input.tilt - 20) <= perfectWindow(loadout);
}

export function gradeFor(skips: number): string {
  if (skips >= 30) return '전설';
  if (skips >= 20) return '물차기';
  if (skips >= 12) return '톡톡';
  if (skips >= 7) return '통통';
  if (skips >= 3) return '퐁당';
  return '풍덩';
}

export function score(input: ThrowInput, res: SimResult, loadout: Loadout): ScoreResult {
  const skips = res.bounces.length;
  const distance = res.distance;
  const base = 100 * skips + Math.round(10 * distance);
  const bonuses: BonusLine[] = [];
  const perfect = isPerfect(input, loadout);
  // 기술 보너스는 한 번이라도 튕겼을 때만
  const skipped = skips > 0;
  if (perfect && skipped) bonuses.push({ label: '퍼펙트 각도', points: 200 });
  if (skipped && Math.abs(input.direction) <= 3) bonuses.push({ label: '일자 투척', points: 100 });
  if (skipped && input.stability >= 0.9) bonuses.push({ label: '흔들림 없는 자세', points: 100 });
  const skidAfterTen = skips >= 10 && res.bounces.slice(10).some((b) => b.skid);
  if (skidAfterTen) bonuses.push({ label: '물결 콤보', points: 300 });
  const placeMul = STAR_MULTIPLIER[loadout.place.stars] ?? 1;
  const itemMul = loadout.item.scoreMul ?? 1;
  const bonusSum = bonuses.reduce((a, b) => a + b.points, 0);
  const total = Math.round((base + bonusSum) * placeMul * itemMul);
  return { skips, distance, base, bonuses, placeMul, itemMul, total, perfect, grade: gradeFor(skips) };
}

/** 도장 미션 판정. perfectStreak는 연속 투척 기록(세션 상태)으로 판정한다. */
export function missionDone(mission: Mission, s: ScoreResult, perfectStreak: number): boolean {
  switch (mission.kind) {
    case 'skips':
      return s.skips >= mission.n;
    case 'perfectStreak':
      return perfectStreak >= mission.n;
    case 'distance':
      return s.distance >= mission.m;
    case 'score':
      return s.total >= mission.n;
  }
}
