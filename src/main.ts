// 화면 흐름: 타이틀 → 세계 지도(도장) → 조합 선택 → 투척(자세 + 플릭) → 연출 → 결과
import { byId, CHARACTERS, ITEMS, PLACES, STONES, type Place } from './game/data';
import { simulate, type Loadout, type ThrowInput } from './game/physics';
import { addRecord, cleared, isUnlocked, loadProgress, placeProgress, saveProgress } from './game/progress';
import { missionDone, perfectWindow, score } from './game/scoring';
import { FlickDetector } from './input/flick';
import { poseAccuracy, PoseTracker } from './input/pose';
import { GameScene } from './render/scene';
import { Sfx } from './audio/sfx';

const ui = document.getElementById('ui')!;
const scene = new GameScene(document.getElementById('gl') as HTMLCanvasElement);
const pose = new PoseTracker();
const sfx = new Sfx();
const progress = loadProgress();
if (import.meta.env.DEV) Object.assign(window, { __pose: pose, __scene: scene });

const SETTINGS_KEY = 'stone-skipping/settings/v1';
const settings: { leftHanded: boolean; fx: 'real' | 'flashy' } = (() => {
  try {
    return { leftHanded: false, fx: 'flashy', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { leftHanded: false, fx: 'flashy' };
  }
})();
const saveSettings = () => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 무시 */
  }
};
pose.leftHanded = settings.leftHanded;
scene.fx = settings.fx;

const sel = { place: PLACES[0].id, character: CHARACTERS[0].id, stone: STONES[0].id, item: 'none' };
let perfectStreak = 0;
let sensorStarted = false;
let rafId = 0;

const loadout = (): Loadout => ({
  character: byId(CHARACTERS, sel.character),
  stone: byId(STONES, sel.stone),
  place: byId(PLACES, sel.place),
  item: byId(ITEMS, sel.item),
});

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function show(html: string): HTMLElement {
  cancelAnimationFrame(rafId);
  ui.innerHTML = html;
  return ui.firstElementChild as HTMLElement;
}

function on(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener('click', fn);
}

// ── 타이틀 ────────────────────────────────────────────
function title() {
  scene.setPlace(byId(PLACES, sel.place));
  scene.setAimCamera();
  show(`<div class="screen center dim">
    <h1>퐁당퐁당</h1>
    <p class="sub">폰을 돌처럼 기울이고, 엄지로 튕겨라</p>
    <p class="sub">세계 물수제비 명소 도장깨기</p>
    <div style="height:32px"></div>
    <button class="primary" id="start">시작하기</button>
    <div style="height:20px"></div>
    <div class="row" style="justify-content:center">
      <button class="toggle" id="hand">${settings.leftHanded ? '왼손' : '오른손'}</button>
      <button class="toggle" id="fx">연출: ${settings.fx === 'flashy' ? '화려하게' : '실제처럼'}</button>
    </div>
    <p class="sub" style="margin-top:24px;font-size:12px">크게 휘두르지 않아요. 앉아서도 할 수 있어요.</p>
  </div>`);
  on('start', async () => {
    sfx.unlock();
    if (!sensorStarted) {
      sensorStarted = await pose.start();
    }
    map();
  });
  on('hand', () => {
    settings.leftHanded = !settings.leftHanded;
    pose.leftHanded = settings.leftHanded;
    saveSettings();
    title();
  });
  on('fx', () => {
    settings.fx = settings.fx === 'flashy' ? 'real' : 'flashy';
    scene.fx = settings.fx;
    saveSettings();
    title();
  });
}

// ── 세계 지도 (도장 목록) ─────────────────────────────
function map() {
  const stampCount = PLACES.filter((p) => progress.places[p.id]?.stamp).length;
  let html = `<div class="screen dim"><div class="top" style="display:flex;justify-content:space-between;align-items:baseline">
    <h2>세계 명소 도장깨기</h2><span class="sub">인장 ${stampCount}/${PLACES.length} · 코인 ${progress.coins}</span></div>`;
  let country = '';
  for (const p of PLACES) {
    if (p.country !== country) {
      country = p.country;
      html += `<h3>${esc(country)}</h3>`;
    }
    const pp = progress.places[p.id];
    const open = isUnlocked(progress, p.id);
    const done = pp?.missions.filter(Boolean).length ?? 0;
    const best = pp?.records[0];
    html += `<button class="card ${open ? '' : 'locked'}" data-place="${p.id}" ${open ? '' : 'disabled'}>
      <div class="top"><span class="name">${esc(p.name)} <span class="sub">${esc(p.kind)}</span></span>
      ${pp?.stamp ? '<span class="stamp">인장</span>' : `<span class="stars">${stars(p.stars)}</span>`}</div>
      <p class="sub">${esc(p.desc)}</p>
      <p class="sub">${open ? `미션 ${'●'.repeat(done)}${'○'.repeat(3 - done)} · 관장 ${p.masterSkips}회${best ? ` · 내 최고 ${best.score.toLocaleString()}점` : ''}` : '앞 명소에서 별 2개와 관장 승리가 필요해요'}</p>
    </button>`;
  }
  html += `<div class="bottom"><button id="back">처음으로</button></div></div>`;
  show(html);
  ui.querySelectorAll<HTMLButtonElement>('[data-place]').forEach((b) =>
    b.addEventListener('click', () => {
      sel.place = b.dataset.place!;
      perfectStreak = 0;
      loadoutScreen();
    }),
  );
  on('back', title);
}

// ── 조합 선택 ─────────────────────────────────────────
function loadoutScreen() {
  const place = byId(PLACES, sel.place);
  scene.setPlace(place);
  scene.setAimCamera();
  const pp = placeProgress(progress, place.id);
  const chips = <T extends { id: string; name: string }>(key: 'character' | 'stone' | 'item', list: T[], sub: (x: T) => string) =>
    `<div class="chips">${list
      .map((x) => `<button class="chip ${sel[key] === x.id ? 'on' : ''}" data-k="${key}" data-id="${x.id}"><b>${esc(x.name)}</b><small>${esc(sub(x))}</small></button>`)
      .join('')}</div>`;
  show(`<div class="screen dim">
    <h2>${esc(place.country)} · ${esc(place.name)} <span class="stars">${stars(place.stars)}</span></h2>
    <p class="sub">${esc(place.desc)}${place.wind ? ` · 옆바람 ${place.wind > 0 ? '→' : '←'} ${Math.abs(place.wind).toFixed(1)}` : ''}</p>
    <div class="card"><b>도장 미션</b>
      ${place.missions.map((m, i) => `<p class="${pp.missions[i] ? 'ok' : 'no'}">${pp.missions[i] ? '★' : '☆'} ${esc(m.label)}</p>`).join('')}
      <p class="${pp.stamp ? 'ok' : 'no'}">${pp.stamp ? '✓' : '·'} 관장 기록 ${place.masterSkips}회보다 많이 튕기기</p>
    </div>
    <h3>캐릭터</h3>${chips('character', CHARACTERS, (c) => `${c.desc}. 힘${c.str} 손목${c.snap} 정확${c.acc} 감각${c.feel}`)}
    <h3>돌</h3>${chips('stone', STONES, (s) => `${s.desc}. ${Math.round(s.mass * 1000)}g · 지름 ${Math.round(s.radius * 200)}cm`)}
    <h3>아이템</h3>${chips('item', ITEMS, (i) => i.desc)}
    <div class="bottom"><button id="back">지도</button><button class="primary" id="go">도전</button></div>
  </div>`);
  ui.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) =>
    b.addEventListener('click', () => {
      sel[b.dataset.k as 'character' | 'stone' | 'item'] = b.dataset.id!;
      const y = (ui.firstElementChild as HTMLElement).scrollTop;
      loadoutScreen();
      (ui.firstElementChild as HTMLElement).scrollTop = y;
    }),
  );
  on('back', map);
  on('go', aim);
}

// ── 투척: 목표 자세 맞추기 + 플릭 ──────────────────────
function aim() {
  const lo = loadout();
  const place = lo.place;
  scene.setPlace(place);
  scene.setStone(lo.stone);
  scene.setAimCamera();
  const win = perfectWindow(lo);
  let calibrated = !pose.hasSensor;
  const root = show(`<div class="hud" id="hud">
    <div class="topbar"><span>${esc(place.name)} · 관장 ${place.masterSkips}회</span><span id="exit" style="pointer-events:auto;padding:4px 8px">✕</span></div>
    <div class="meter" id="meter"><div class="cross"></div><div class="cross h"></div>
      <div class="target" style="width:${win * 8}px;height:${win * 8}px"></div>
      <div class="target" style="width:${5 * 8 * 2}px;height:${5 * 8 * 2}px;border-width:1px;opacity:.5"></div>
      <div class="dot" id="dot"></div></div>
    <div class="readout">
      <div class="big" id="acc">0%</div>
      <div class="sub" id="angles"></div>
      <div class="bars">
        <label><span>안정성</span><span id="stabv"></span></label><div class="bar"><i id="stab"></i></div>
        <label><span>집중</span><span></span></label><div class="bar focus"><i id="focus"></i></div>
      </div>
    </div>
    <div class="flickzone" id="hint"><div><span class="arrow">↑</span>${calibrated ? '노란 점을 가운데 원에 맞추고, 엄지로 위로 튕기세요' : '폰을 편하게 들고 화면을 한 번 탭해 기준을 잡으세요'}</div></div>
  </div>`);
  document.getElementById('exit')!.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    flick.dispose();
    loadoutScreen();
  });

  const dot = document.getElementById('dot')!;
  const accEl = document.getElementById('acc')!;
  const anglesEl = document.getElementById('angles')!;
  const stabEl = document.getElementById('stab')!;
  const stabV = document.getElementById('stabv')!;
  const focusEl = document.getElementById('focus')!;
  const hint = document.getElementById('hint')!;
  let focus = 0;
  let last = performance.now();
  let current = { roll: 0, pitch: 0, stability: 1, accuracy: 0 };

  // 센서가 없으면 조준 원을 손가락으로 끌어 자세를 정한다 (센서 대신)
  const meter = document.getElementById('meter')!;
  const manualHint = document.createElement('div');
  manualHint.className = 'sub manual-hint';
  manualHint.textContent = '센서를 쓸 수 없어 손가락 모드예요. 원 안을 끌어 노란 점을 맞추세요';
  let dragging = false;
  const dragTo = (e: PointerEvent) => {
    const r = meter.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    pose.setManual(place.targetRoll + dx / 8, place.targetPitch - dy / 8);
  };
  meter.addEventListener('pointerdown', (e) => {
    if (pose.hasSensor) return;
    e.stopPropagation();
    dragging = true;
    meter.setPointerCapture?.(e.pointerId);
    dragTo(e);
  });
  meter.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.stopPropagation();
    dragTo(e);
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    e.stopPropagation();
    dragging = false;
  };
  meter.addEventListener('pointerup', endDrag);
  meter.addEventListener('pointercancel', endDrag);

  const flick = new FlickDetector(root);
  flick.onFlick = (f) => {
    if (!calibrated) {
      pose.calibrate();
      calibrated = true;
      hint.innerHTML = '<div><span class="arrow">↑</span>노란 점을 가운데 원에 맞추고, 엄지로 위로 튕기세요</div>';
      return;
    }
    flick.dispose();
    cancelAnimationFrame(rafId);
    const input: ThrowInput = {
      power: f.power,
      direction: f.direction,
      tilt: current.roll,
      pitch: current.pitch,
      accuracy: current.accuracy,
      stability: current.stability,
      focus,
    };
    fly(input);
  };
  flick.onCancel = () => {
    if (!calibrated) {
      pose.calibrate();
      calibrated = true;
      hint.innerHTML = '<div><span class="arrow">↑</span>노란 점을 가운데 원에 맞추고, 엄지로 위로 튕기세요</div>';
    }
  };

  const tick = () => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    const s = pose.sample();
    const accuracy = poseAccuracy(s.roll, s.pitch, place.targetRoll, place.targetPitch);
    current = { ...s, accuracy };
    if (calibrated && accuracy > 0.7 && s.stability > 0.6) focus = Math.min(1, focus + dt / 1.5);
    else focus = Math.max(0, focus - dt);
    // 목표를 가운데에 두고 오차를 1°당 8px로 표시
    const R = 108;
    let dx = (s.roll - place.targetRoll) * 8;
    let dy = -(s.pitch - place.targetPitch) * 8;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx *= R / len;
      dy *= R / len;
    }
    dot.style.transform = `translate(${dx}px, ${dy}px)`;
    accEl.textContent = `${Math.round(accuracy * 100)}%`;
    accEl.style.color = accuracy >= 0.8 ? 'var(--accent)' : '';
    anglesEl.textContent = `기울기 ${s.roll.toFixed(0)}° / 목표 ${place.targetRoll}° · 숙임 ${s.pitch.toFixed(0)}° / 목표 ${place.targetPitch}°`;
    stabEl.style.width = `${s.stability * 100}%`;
    stabV.textContent = `${Math.round(s.stability * 100)}%`;
    focusEl.style.width = `${focus * 100}%`;
    scene.aimPose(s.roll, s.pitch);
    if (!pose.hasSensor && !manualHint.isConnected) document.querySelector('.readout')?.appendChild(manualHint);
    if (pose.hasSensor && manualHint.isConnected) manualHint.remove();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

// ── 비행 연출 ─────────────────────────────────────────
function fly(input: ThrowInput) {
  const lo = loadout();
  const seed = (Math.random() * 2 ** 31) | 0;
  const res = simulate(input, lo, seed);
  const s = score(input, res, lo);
  sfx.throwWhoosh();
  show(`<div class="hud"><div class="counter" id="count"></div><div id="fx"></div>
    <div class="topbar"><span>${esc(lo.place.name)}</span><span id="skip" style="pointer-events:auto;padding:4px 8px">건너뛰기</span></div></div>`);
  const count = document.getElementById('count')!;
  const fxEl = document.getElementById('fx')!;
  const flash = (text: string) => {
    const d = document.createElement('div');
    d.className = 'flash';
    d.textContent = text;
    fxEl.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  };
  if (s.perfect) flash('퍼펙트 각도!');
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    result(input, res, s, seed);
  };
  document.getElementById('skip')!.addEventListener('click', finish);
  scene.play(res, s.perfect, {
    onBounce: (i, perfect) => {
      count.textContent = String(i + 1);
      count.classList.remove('pop');
      void count.offsetWidth;
      count.classList.add('pop');
      sfx.bounce(i, perfect);
      navigator.vibrate?.(12);
      if (i + 1 === lo.place.masterSkips + 1) flash('관장 기록 돌파!');
      if (i + 1 === 10) flash('물결 콤보');
    },
    onSink: () => sfx.sink(),
    onEnd: finish,
  });
}

// ── 결과 ──────────────────────────────────────────────
function result(input: ThrowInput, res: ReturnType<typeof simulate>, s: ReturnType<typeof score>, seed: number) {
  const lo = loadout();
  const place = lo.place;
  const pp = placeProgress(progress, place.id);
  const wasCleared = cleared(pp);
  perfectStreak = s.perfect ? perfectStreak + 1 : 0;
  const newly: number[] = [];
  place.missions.forEach((m, i) => {
    if (!pp.missions[i] && missionDone(m, s, perfectStreak)) {
      pp.missions[i] = true;
      newly.push(i);
    }
  });
  const beatMaster = s.skips > place.masterSkips;
  const newStamp = beatMaster && !pp.stamp;
  if (beatMaster) pp.stamp = true;
  const coinsEarned = s.skips * 10 + (newStamp ? 300 : 0) + newly.length * 100;
  progress.coins += coinsEarned;
  const rank = addRecord(pp, {
    score: s.total, skips: s.skips, distance: Math.round(s.distance * 10) / 10,
    character: lo.character.id, stone: lo.stone.id, item: lo.item.id, at: Date.now(), seed,
  });
  saveProgress(progress);
  const nowCleared = cleared(pp);
  const nextIdx = PLACES.findIndex((p) => p.id === place.id) + 1;
  const next: Place | undefined = nowCleared && !wasCleared ? PLACES[nextIdx] : undefined;
  if (newStamp || next) sfx.fanfare();

  const reasons: Record<string, string> = { slow: '속도가 떨어져 가라앉음', steep: '너무 가파르게 닿음', tilt: '돌 기울기가 맞지 않음', limit: '끝까지 미끄러짐' };
  show(`<div class="screen dim result" style="text-align:center">
    <p class="sub">${esc(place.name)} · ${esc(reasons[res.sinkAt.reason])}</p>
    <div class="grade">${esc(s.grade)}</div>
    <div class="nums"><div><b>${s.skips}</b><span class="sub">튕김</span></div><div><b>${s.distance.toFixed(1)}m</b><span class="sub">거리</span></div><div><b>${Math.round(input.accuracy * 100)}%</b><span class="sub">자세</span></div></div>
    <div class="lines">
      <div class="l"><span>튕김 ${s.skips} × 100 + 거리 × 10</span><span>${s.base.toLocaleString()}</span></div>
      ${s.bonuses.map((b) => `<div class="l"><span>${esc(b.label)}</span><span>+${b.points}</span></div>`).join('')}
      <div class="l"><span>장소 배율 ${stars(place.stars)}${s.itemMul > 1 ? ` · 아이템 ×${s.itemMul}` : ''}</span><span>×${(s.placeMul * s.itemMul).toFixed(1)}</span></div>
      <div class="l total"><span>점수</span><span>${s.total.toLocaleString()}</span></div>
    </div>
    <div class="card" style="max-width:420px;margin:12px auto">
      <b>도장 미션</b>
      ${place.missions.map((m, i) => `<p class="${newly.includes(i) ? 'new' : pp.missions[i] ? 'ok' : 'no'}">${pp.missions[i] ? '★' : '☆'} ${esc(m.label)}${newly.includes(i) ? ' 달성!' : ''}</p>`).join('')}
      <p class="${newStamp ? 'new' : pp.stamp ? 'ok' : 'no'}">${pp.stamp ? '✓' : '·'} 관장 ${place.masterSkips}회 ${beatMaster ? '돌파' : `까지 ${place.masterSkips + 1 - s.skips}회 남음`}${newStamp ? ' · 인장 획득!' : ''}</p>
      ${next ? `<p class="new">새 명소 개방: ${esc(next.country)} ${esc(next.name)}</p>` : ''}
      <p class="sub">코인 +${coinsEarned}</p>
    </div>
    <div class="card" style="max-width:420px;margin:0 auto">
      <b>${esc(place.name)} 기록</b> <span class="sub">(이 기기 · 온라인 랭킹은 다음 단계)</span>
      ${pp.records.slice(0, 5).map((r, i) => `<div class="l" style="display:flex;justify-content:space-between;padding:4px 0"><span class="${i === rank ? 'new' : ''}">${i + 1}. ${r.skips}회 · ${r.distance}m</span><span class="${i === rank ? 'new' : ''}">${r.score.toLocaleString()}</span></div>`).join('')}
    </div>
    <div class="bottom"><button id="map">지도</button><button id="change">조합</button><button class="primary" id="again">다시</button></div>
  </div>`);
  on('map', map);
  on('change', loadoutScreen);
  on('again', aim);
}

if (import.meta.env.DEV) Object.assign(window, { __fly: fly, __go: (id: string) => { sel.place = id; aim(); } });
title();
