import { describe, expect, it } from 'vitest';
import { computeFlick } from '../src/input/flick';
import { poseAccuracy, stabilityFromRates } from '../src/input/pose';

describe('poseAccuracy', () => {
  it('matches the design formula', () => {
    expect(poseAccuracy(20, 10, 20, 10)).toBe(1);
    expect(poseAccuracy(23, 8, 20, 10)).toBeCloseTo(0.8);
    expect(poseAccuracy(45, 10, 20, 10)).toBe(0);
  });
});

describe('stabilityFromRates', () => {
  it('is 1 when still and drops with shaking', () => {
    expect(stabilityFromRates([0, 0, 0])).toBe(1);
    expect(stabilityFromRates([30, 30])).toBeCloseTo(0.5);
    expect(stabilityFromRates([200])).toBe(0);
  });
});

describe('computeFlick', () => {
  const H = 800;
  it('reads an upward flick as power and direction', () => {
    const r = computeFlick([
      { x: 200, y: 700, t: 0 },
      { x: 200, y: 600, t: 40 },
      { x: 200, y: 400, t: 80 },
    ], H, 6)!;
    expect(r.direction).toBeCloseTo(0);
    expect(r.rawSpeed).toBeCloseTo(300 / H / 0.08);
    expect(r.power).toBeGreaterThan(0.5);
  });

  it('angles right for a rightward flick and clamps to 30°', () => {
    const r = computeFlick([{ x: 0, y: 500, t: 0 }, { x: 300, y: 450, t: 50 }], H, 6)!;
    expect(r.direction).toBe(30);
  });

  it('ignores a downward swipe', () => {
    expect(computeFlick([{ x: 0, y: 100, t: 0 }, { x: 0, y: 300, t: 50 }], H, 6)).toBeNull();
  });
});
