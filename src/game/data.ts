// 게임 데이터: 캐릭터, 돌, 명소, 아이템. 수치는 기획서 초안 값이며 플레이 테스트로 조정한다.

export interface Character {
  id: string;
  name: string;
  desc: string;
  str: number; // 힘 1~5: 초속 증폭
  snap: number; // 손목 1~5: 스핀
  acc: number; // 정확 1~5: 떨림·방향 오차 감소
  feel: number; // 감각 1~5: 퍼펙트 범위
  /** 놓는 순간 손 높이(m): 쪼그려 앉아 낮게 던진다 */
  height: number;
  trait: string;
}

export interface Stone {
  id: string;
  name: string;
  desc: string;
  /** 질량(kg) */
  mass: number;
  /** 반지름(m) */
  radius: number;
  /** 물과의 마찰 계수 C_f (작을수록 속도를 덜 잃는다) */
  friction: number;
  /** 바람 영향 배율 (가벼울수록 큼) */
  windFactor: number;
  /** 접촉할 때마다 스핀이 줄어드는 비율 */
  spinDecay: number;
  /** 허용 기울기 상한(°) */
  maxTilt: number;
  color: number;
}

export interface Place {
  id: string;
  country: string;
  name: string;
  kind: string;
  desc: string;
  stars: number; // 난이도 1~5
  /** 옆바람(m/s², +는 오른쪽) */
  wind: number;
  /** 물결 세기 0~1: 접촉 순간 입사각에 흔들림 */
  waves: number;
  /** 목표 자세 */
  targetRoll: number;
  targetPitch: number;
  /** 관장 기록(튕김 횟수) */
  masterSkips: number;
  missions: Mission[];
  sky: { top: number; bottom: number; sun: number };
  water: { deep: number; shallow: number };
  shore: number;
  night?: boolean;
}

export type Mission =
  | { kind: 'skips'; n: number; label: string }
  | { kind: 'perfectStreak'; n: number; label: string }
  | { kind: 'distance'; m: number; label: string }
  | { kind: 'score'; n: number; label: string };

export interface Item {
  id: string;
  name: string;
  desc: string;
  eBonus?: number;
  noWind?: boolean;
  rescue?: boolean;
  perfectBonus?: number;
  scoreMul?: number;
}

export const CHARACTERS: Character[] = [
  { id: 'haram', name: '하람', desc: '물가가 처음인 초등학생', str: 2, snap: 3, acc: 2, feel: 3, height: 0.4, trait: '초보자용, 퍼펙트 판정이 넉넉함' },
  { id: 'no', name: '노 선생', desc: '강변에서 평생 돌을 던진 할아버지', str: 1, snap: 4, acc: 4, feel: 5, height: 0.45, trait: '바람 영향 절반' },
  { id: 'miru', name: '미루', desc: '힘센 어부', str: 5, snap: 2, acc: 3, feel: 2, height: 0.5, trait: '파도 장소에서 힘 +1' },
  { id: 'sol', name: '솔', desc: '물가에 사는 너구리', str: 2, snap: 5, acc: 2, feel: 3, height: 0.3, trait: '잔물결 구간 튕김 1.5배' },
];

export const STONES: Stone[] = [
  { id: 'flat', name: '납작 조약돌', desc: '균형형 기본 돌', mass: 0.1, radius: 0.045, friction: 0.03, windFactor: 1, spinDecay: 0.03, maxTilt: 45, color: 0x9a948a },
  { id: 'round', name: '둥근 자갈', desc: '무겁고 두꺼워 기울기 실수에 너그러움', mass: 0.15, radius: 0.04, friction: 0.04, windFactor: 0.8, spinDecay: 0.03, maxTilt: 55, color: 0x7d7a74 },
  { id: 'shale', name: '얇은 점판암', desc: '가볍고 넓어 잘 뜨지만 바람에 약함', mass: 0.07, radius: 0.05, friction: 0.03, windFactor: 1.6, spinDecay: 0.04, maxTilt: 40, color: 0x4f5660 },
  { id: 'basalt', name: '무거운 현무암', desc: '바람과 물결에 강하지만 빨리 던져야 뜸', mass: 0.18, radius: 0.045, friction: 0.03, windFactor: 0.5, spinDecay: 0.025, maxTilt: 45, color: 0x2f2d2c },
  { id: 'jade', name: '달빛 옥돌', desc: '매끈해 마찰이 적고 스핀이 오래감', mass: 0.1, radius: 0.045, friction: 0.02, windFactor: 1, spinDecay: 0.015, maxTilt: 45, color: 0x6fb59a },
];

const m = (skips: number, streak: number, dist: number): Mission[] => [
  { kind: 'skips', n: skips, label: `${skips}회 이상 튕기기` },
  { kind: 'perfectStreak', n: streak, label: `퍼펙트 각도 ${streak}연속` },
  { kind: 'distance', m: dist, label: `${dist}m 이상 날리기` },
];

// 명소 정보는 기획서 초안이며, 대회·기록 관련 사실은 출시 전에 출처 확인 필요.
export const PLACES: Place[] = [
  {
    id: 'donggang', country: '한국', name: '동강', kind: '강', desc: '자갈 강변과 절벽이 있는 잔잔한 여울',
    stars: 1, wind: 0, waves: 0.05, targetRoll: 20, targetPitch: 10, masterSkips: 12, missions: m(8, 2, 15),
    sky: { top: 0x5d9bd6, bottom: 0xcfe6f2, sun: 0xfff3d6 }, water: { deep: 0x1f5a6b, shallow: 0x4f9aa0 }, shore: 0xb9b2a4,
  },
  {
    id: 'hangang', country: '한국', name: '한강', kind: '강', desc: '도시 불빛이 비치는 밤의 강',
    stars: 2, wind: 0.4, waves: 0.12, targetRoll: 20, targetPitch: 8, masterSkips: 14, missions: m(9, 2, 17),
    sky: { top: 0x0b1530, bottom: 0x3a3f6b, sun: 0xffd9a0 }, water: { deep: 0x0a1626, shallow: 0x23324d }, shore: 0x55585e, night: true,
  },
  {
    id: 'shimanto', country: '일본', name: '시만토강', kind: '강', desc: '난간 없는 잠수교가 있는 맑은 강',
    stars: 2, wind: -0.3, waves: 0.15, targetRoll: 18, targetPitch: 10, masterSkips: 15, missions: m(10, 3, 18),
    sky: { top: 0x6aa8d8, bottom: 0xe2eef0, sun: 0xffffe8 }, water: { deep: 0x1d6b6a, shallow: 0x56b3a5 }, shore: 0xa8a090,
  },
  {
    id: 'easdale', country: '스코틀랜드', name: '이스데일 섬', kind: '채석장 연못', desc: '납작한 점판암과 거센 바닷바람',
    stars: 4, wind: 1.4, waves: 0.3, targetRoll: 22, targetPitch: 8, masterSkips: 18, missions: m(12, 4, 20),
    sky: { top: 0x6f7f8f, bottom: 0xc5ccd2, sun: 0xeef2f5 }, water: { deep: 0x24343d, shallow: 0x4a5f66 }, shore: 0x4c5158,
  },
  {
    id: 'mackinac', country: '미국', name: '매키낙 섬', kind: '호수', desc: '큰 호수의 맑은 잔물결',
    stars: 3, wind: 0.6, waves: 0.2, targetRoll: 20, targetPitch: 9, masterSkips: 16, missions: m(11, 3, 20),
    sky: { top: 0x4e8fd4, bottom: 0xd8ecf6, sun: 0xfff7e0 }, water: { deep: 0x1b4f7a, shallow: 0x3f8fb0 }, shore: 0xcbbfa6,
  },
  {
    id: 'moraine', country: '캐나다', name: '모레인 호수', kind: '빙하호', desc: '옥빛 물과 갑자기 부는 바람',
    stars: 3, wind: -0.9, waves: 0.15, targetRoll: 21, targetPitch: 10, masterSkips: 17, missions: m(12, 3, 21),
    sky: { top: 0x3f86cf, bottom: 0xdcefff, sun: 0xffffff }, water: { deep: 0x177a86, shallow: 0x3fc0c4 }, shore: 0x8f8a80,
  },
  {
    id: 'tekapo', country: '뉴질랜드', name: '테카포 호수', kind: '호수', desc: '별이 쏟아지는 밤의 호수',
    stars: 4, wind: 0.8, waves: 0.2, targetRoll: 20, targetPitch: 7, masterSkips: 19, missions: m(13, 4, 22),
    sky: { top: 0x050a1f, bottom: 0x1c2a55, sun: 0xcfd8ff }, water: { deep: 0x061024, shallow: 0x18305a }, shore: 0x3e3a45, night: true,
  },
  {
    id: 'brienz', country: '스위스', name: '브리엔츠 호수', kind: '호수', desc: '알프스 골바람이 수시로 바뀌는 최종 도장',
    stars: 5, wind: -1.8, waves: 0.35, targetRoll: 23, targetPitch: 8, masterSkips: 20, missions: m(14, 5, 22),
    sky: { top: 0x5d93c9, bottom: 0xe8f1f6, sun: 0xffffff }, water: { deep: 0x1a6a6f, shallow: 0x49a9a3 }, shore: 0x9a9384,
  },
];

export const ITEMS: Item[] = [
  { id: 'none', name: '사용 안 함', desc: '아이템 없이 순수 기록에 도전' },
  { id: 'wax', name: '미끄럼 밀랍', desc: '반발 계수 +0.03', eBonus: 0.03 },
  { id: 'fan', name: '순풍 부채', desc: '이번 판 바람 없음', noWind: true },
  { id: 'clover', name: '네잎클로버', desc: '첫 가라앉음 1회 구제', rescue: true },
  { id: 'tea', name: '집중 차', desc: '퍼펙트 각도 범위 +2°', perfectBonus: 2 },
  { id: 'shell', name: '반짝 조개껍데기', desc: '점수 ×1.5', scoreMul: 1.5 },
];

/** 난이도 별 수 → 점수 배율 */
export const STAR_MULTIPLIER = [1, 1, 1.2, 1.4, 1.7, 2.0];

export function byId<T extends { id: string }>(list: T[], id: string): T {
  const found = list.find((x) => x.id === id);
  if (!found) throw new Error(`unknown id: ${id}`);
  return found;
}
