import { describe, expect, it } from 'vitest';
import { byId, CHARACTERS, ITEMS, PLACES, STONES } from '../src/game/data';
import { positionAt, simulate, type Loadout, type ThrowInput } from '../src/game/physics';
import { score } from '../src/game/scoring';

const loadout = (over: Partial<Loadout> = {}): Loadout => ({
  character: byId(CHARACTERS, 'haram'),
  stone: byId(STONES, 'flat'),
  place: byId(PLACES, 'donggang'),
  item: byId(ITEMS, 'none'),
  ...over,
});

const good: ThrowInput = { power: 0.95, direction: 0, tilt: 20, pitch: 10, accuracy: 1, stability: 0.95, focus: 1 };
const sloppy: ThrowInput = { power: 0.4, direction: 12, tilt: 38, pitch: 28, accuracy: 0.3, stability: 0.3, focus: 0 };

describe('simulate', () => {
  it('is deterministic for the same seed', () => {
    const a = simulate(good, loadout(), 42);
    const b = simulate(good, loadout(), 42);
    expect(a).toEqual(b);
  });

  it('a well matched throw skips 10+ times', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(simulate(good, loadout(), seed).bounces.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('a sloppy throw skips 3 or fewer times', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(simulate(sloppy, loadout(), seed).bounces.length).toBeLessThanOrEqual(3);
    }
  });

  it('a negative tilt sinks on first contact', () => {
    const r = simulate({ ...good, tilt: -10 }, loadout(), 1);
    expect(r.bounces.length).toBe(0);
    expect(r.sinkAt.reason).toBe('tilt');
  });

  it('more power goes further', () => {
    const lo = simulate({ ...good, power: 0.6 }, loadout(), 7).distance;
    const hi = simulate({ ...good, power: 1 }, loadout(), 7).distance;
    expect(hi).toBeGreaterThan(lo);
  });

  it('wind pushes the stone sideways and the fan cancels it', () => {
    const windy = loadout({ place: byId(PLACES, 'brienz') });
    const pushed = simulate(good, windy, 3).sinkAt.pos[2];
    const calm = simulate(good, { ...windy, item: byId(ITEMS, 'fan') }, 3).sinkAt.pos[2];
    expect(Math.abs(pushed)).toBeGreaterThan(Math.abs(calm));
  });

  it('positionAt starts at hand height and ends on the water', () => {
    const r = simulate(good, loadout(), 9);
    expect(positionAt(r, 0).pos[1]).toBeCloseTo(0.4);
    expect(positionAt(r, r.sinkAt.t + 1).pos[1]).toBe(0);
  });

  it('clover rescues one sink', () => {
    const base = simulate(sloppy, loadout(), 2).bounces.length;
    const rescued = simulate(sloppy, loadout({ item: byId(ITEMS, 'clover') }), 2);
    expect(rescued.bounces.some((b) => b.rescued)).toBe(true);
    expect(rescued.bounces.length).toBeGreaterThan(base);
  });
});

describe('score', () => {
  it('rewards a perfect, straight, steady throw', () => {
    const l = loadout();
    const r = simulate(good, l, 1);
    const s = score(good, r, l);
    expect(s.perfect).toBe(true);
    expect(s.bonuses.map((b) => b.label)).toEqual(expect.arrayContaining(['퍼펙트 각도', '일자 투척', '흔들림 없는 자세']));
    expect(s.total).toBe(Math.round(s.base + s.bonuses.reduce((a, b) => a + b.points, 0)));
  });

  it('applies place stars multiplier', () => {
    const l = loadout({ place: byId(PLACES, 'easdale') });
    const s = score(good, simulate(good, l, 1), l);
    expect(s.placeMul).toBe(1.7);
  });
});
