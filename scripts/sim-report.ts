// 물리 밸런스 확인용: npx vite-node scripts/sim-report.ts
import { byId, CHARACTERS, ITEMS, PLACES, STONES } from '../src/game/data';
import { simulate, type ThrowInput } from '../src/game/physics';

const good: ThrowInput = { power: 0.95, direction: 0, tilt: 20, pitch: 10, accuracy: 1, stability: 0.95, focus: 1 };
const cases: [string, ThrowInput][] = [
  ['good', good],
  ['mid', { power: 0.7, direction: 3, tilt: 25, pitch: 14, accuracy: 0.7, stability: 0.7, focus: 0.3 }],
  ['tilt10', { ...good, tilt: 10 }],
  ['tilt35', { ...good, tilt: 35 }],
  ['steep', { ...good, pitch: 2 }],
  ['sloppy', { power: 0.4, direction: 12, tilt: 38, pitch: 28, accuracy: 0.3, stability: 0.3, focus: 0 }],
  ['weak', { ...good, power: 0.3 }],
];
const lo = (place = 'donggang', stone = 'flat') => ({ character: byId(CHARACTERS, 'haram'), stone: byId(STONES, stone), place: byId(PLACES, place), item: byId(ITEMS, 'none') });
for (const [name, inp] of cases) {
  const r = simulate(inp, lo(), 1);
  const gaps = r.bounces.slice(0, 12).map((b, i) => (i ? (b.pos[0] - r.bounces[i - 1].pos[0]).toFixed(1) : b.pos[0].toFixed(1)));
  console.log(name.padEnd(7), 'skips', String(r.bounces.length).padStart(3), 'dist', r.distance.toFixed(1).padStart(5), r.sinkAt.reason.padEnd(5),
    'gaps', gaps.join(' '), '| depth mm', r.bounces.slice(0, 4).map((b) => (b.depth * 1000).toFixed(1)).join(' '), '| contact ms', r.bounces.slice(0, 3).map((b) => (b.duration * 1000).toFixed(0)).join(' '),
    '| vy', r.bounces.slice(0, 3).map((b) => b.out[1].toFixed(2)).join(' '));
}
for (const st of STONES) {
  const n = [1, 2, 3, 4, 5].map((sd) => simulate(good, lo('donggang', st.id), sd).bounces.length);
  console.log('stone', st.id.padEnd(7), n.join(','));
}
for (const pl of PLACES) {
  const n = [1, 2, 3, 4, 5].map((sd) => simulate(good, lo(pl.id), sd).bounces.length);
  console.log('place', pl.id.padEnd(9), n.join(','), 'master', pl.masterSkips);
}
for (const tl of [5, 10, 15, 20, 25, 30, 35, 40, 45]) {
  const n = [1, 2, 3].map((sd) => simulate({ ...good, tilt: tl }, lo(), sd).bounces.length);
  process.stdout.write(`tilt${tl}:${n.join('/')}  `);
}
console.log();
