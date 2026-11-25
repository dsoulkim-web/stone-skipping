// 엄지 플릭: 손가락이 떨어지기 직전 0.1초의 이동 속도 = 힘, 궤적 각도 = 좌우 방향.

export interface FlickResult {
  /** 0~1, 개인 최대 플릭 속도 대비 */
  power: number;
  /** 좌우 방향(°), +는 오른쪽, ±30 제한 */
  direction: number;
  /** 화면 높이 기준 속도 (화면/초) */
  rawSpeed: number;
}

interface Pt {
  x: number;
  y: number;
  t: number;
}

/** 순수 함수: 포인터 기록으로 플릭 값을 계산 (테스트용으로 분리) */
export function computeFlick(points: Pt[], screenH: number, maxSpeed: number): FlickResult | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const window = points.filter((p) => last.t - p.t <= 100);
  const first = window.length >= 2 ? window[0] : points[points.length - 2];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return null;
  const dx = last.x - first.x;
  const dy = first.y - last.y; // 위로 튕기면 +
  if (dy <= 0) return null; // 앞(위)으로 튕긴 것만 인정
  const rawSpeed = Math.hypot(dx, dy) / screenH / dt;
  const direction = Math.max(-30, Math.min(30, (Math.atan2(dx, dy) * 180) / Math.PI));
  const power = Math.max(0, Math.min(1, rawSpeed / maxSpeed));
  return { power, direction, rawSpeed };
}

export class FlickDetector {
  private pts: Pt[] = [];
  private active = false;
  /** 튜토리얼에서 잰 개인 최대 플릭 속도 (화면/초) */
  maxSpeed = 6;
  onStart?: () => void;
  onMove?: (x: number, y: number) => void;
  onFlick?: (r: FlickResult) => void;
  onCancel?: () => void;

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.cancel);
  }

  private down = (e: PointerEvent) => {
    this.active = true;
    this.pts = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    this.el.setPointerCapture?.(e.pointerId);
    this.onStart?.();
  };

  private move = (e: PointerEvent) => {
    if (!this.active) return;
    this.pts.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (this.pts.length > 64) this.pts.shift();
    this.onMove?.(e.clientX, e.clientY);
  };

  private up = (e: PointerEvent) => {
    if (!this.active) return;
    this.active = false;
    this.pts.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    const r = computeFlick(this.pts, window.innerHeight, this.maxSpeed);
    if (r && r.rawSpeed > 0.4) this.onFlick?.(r);
    else this.onCancel?.();
  };

  private cancel = () => {
    this.active = false;
    this.onCancel?.();
  };
}
