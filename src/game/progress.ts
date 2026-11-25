// 진행 저장: 해금, 도장 미션, 인장, 장소별 기록. 지금은 기기 내 저장, 온라인 랭킹은 다음 단계에서 서버로.
import { PLACES } from './data';

export interface RunRecord {
  score: number;
  skips: number;
  distance: number;
  character: string;
  stone: string;
  item: string;
  at: number;
  /** 서버 재계산 검증용 입력 기록 */
  seed: number;
}

export interface PlaceProgress {
  missions: boolean[];
  stamp: boolean;
  records: RunRecord[];
}

export interface Progress {
  places: Record<string, PlaceProgress>;
  coins: number;
}

const KEY = 'stone-skipping/progress/v1';

export function emptyPlace(): PlaceProgress {
  return { missions: [false, false, false], stamp: false, records: [] };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Progress;
  } catch {
    /* 저장소를 못 쓰는 환경 */
  }
  return { places: {}, coins: 0 };
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 무시 */
  }
}

export function placeProgress(p: Progress, id: string): PlaceProgress {
  return (p.places[id] ??= emptyPlace());
}

/** 도장 클리어: 별 2개 이상 + 관장 승리(인장) */
export function cleared(pp: PlaceProgress | undefined): boolean {
  return !!pp && pp.stamp && pp.missions.filter(Boolean).length >= 2;
}

/** 첫 명소는 항상 열려 있고, 앞 명소를 깨면 다음이 열린다 */
export function isUnlocked(p: Progress, id: string): boolean {
  const i = PLACES.findIndex((x) => x.id === id);
  if (i <= 0) return true;
  return cleared(p.places[PLACES[i - 1].id]);
}

export function addRecord(pp: PlaceProgress, r: RunRecord): number {
  pp.records.push(r);
  pp.records.sort((a, b) => b.score - a.score);
  pp.records = pp.records.slice(0, 10);
  return pp.records.indexOf(r);
}
