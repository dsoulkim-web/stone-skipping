// 폰 자세 추적: 롤(좌우 기울임)·피치(앞뒤 숙임), 안정성(흔들림).
// 기준 자세(화면을 보며 든 자연스러운 자세)를 0°로 잡고 상대각을 쓴다.

export interface PoseSample {
  roll: number;
  pitch: number;
  /** 안정성 0~1: 최근 0.5초 각속도 흔들림이 작을수록 1 */
  stability: number;
}

type PermissionFn = () => Promise<'granted' | 'denied'>;

/** 목표 자세와의 정확도 0~1. 오차 합 5°면 0.8, 25°면 0 */
export function poseAccuracy(roll: number, pitch: number, targetRoll: number, targetPitch: number): number {
  const err = Math.abs(roll - targetRoll) + Math.abs(pitch - targetPitch);
  return Math.max(0, 100 - 4 * err) / 100;
}

/** 각속도(°/s) RMS → 안정성 0~1 */
export function stabilityFromRates(rates: number[]): number {
  if (rates.length === 0) return 1;
  const rms = Math.sqrt(rates.reduce((a, r) => a + r * r, 0) / rates.length);
  return Math.max(0, Math.min(1, 1 - rms / 60));
}

export class PoseTracker {
  private rawBeta = 0;
  private rawGamma = 0;
  private baseBeta = 40;
  private baseGamma = 0;
  private smoothRoll = 0;
  private smoothPitch = 0;
  private rates: { t: number; r: number }[] = [];
  private lastOrient: { t: number; b: number; g: number } | null = null;
  private gotMotion = false;
  /** 센서 이벤트를 한 번이라도 받았는지 */
  hasSensor = false;
  /** 좌우 반전 (왼손) */
  leftHanded = false;
  /** 센서 없는 환경(데스크톱)에서 마우스로 자세를 흉내 낸다 */
  private sim = { roll: 0, pitch: 0 };

  async start(): Promise<boolean> {
    // 마우스 대체 입력은 권한과 상관없이 항상 켠다 (센서가 오면 자동으로 무시)
    window.addEventListener('mousemove', this.onMouse);
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: PermissionFn } }).DeviceOrientationEvent;
    const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: PermissionFn } }).DeviceMotionEvent;
    try {
      // iOS 13+: 사용자 터치 안에서 권한 요청 필요
      if (DOE?.requestPermission) {
        const r = await DOE.requestPermission();
        if (r !== 'granted') return false;
      }
      if (DME?.requestPermission) await DME.requestPermission();
    } catch {
      return false;
    }
    window.addEventListener('deviceorientation', this.onOrient);
    window.addEventListener('devicemotion', this.onMotion);
    return true;
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.onOrient);
    window.removeEventListener('devicemotion', this.onMotion);
    window.removeEventListener('mousemove', this.onMouse);
  }

  /** 현재 자세를 기준(0°)으로 잡는다 */
  calibrate(): void {
    if (!this.hasSensor) return;
    this.baseBeta = this.rawBeta;
    this.baseGamma = this.rawGamma;
    this.smoothRoll = 0;
    this.smoothPitch = 0;
  }

  private onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    // 데스크톱 브라우저는 값이 0인 가짜 이벤트를 보내기도 한다
    if (!this.hasSensor && e.beta === 0 && e.gamma === 0) return;
    this.hasSensor = true;
    const now = performance.now();
    this.rawBeta = e.beta;
    this.rawGamma = e.gamma;
    // 자이로(devicemotion)가 없을 때 자세 변화율로 흔들림을 대신 잰다
    if (!this.gotMotion && this.lastOrient) {
      const dt = (now - this.lastOrient.t) / 1000;
      if (dt > 0) {
        const r = Math.hypot(e.beta - this.lastOrient.b, e.gamma - this.lastOrient.g) / dt;
        this.pushRate(now, r);
      }
    }
    this.lastOrient = { t: now, b: e.beta, g: e.gamma };
  };

  private onMotion = (e: DeviceMotionEvent) => {
    const rr = e.rotationRate;
    if (!rr || rr.alpha == null) return;
    this.gotMotion = true;
    this.pushRate(performance.now(), Math.hypot(rr.alpha ?? 0, rr.beta ?? 0, rr.gamma ?? 0));
  };

  /** 센서를 못 쓰는 환경(웹앱 미리보기 등)에서 손가락으로 자세를 정한다 */
  setManual(roll: number, pitch: number): void {
    const r = Math.hypot(roll - this.sim.roll, pitch - this.sim.pitch) * 60;
    this.sim = { roll, pitch };
    this.pushRate(performance.now(), r);
  }

  private onMouse = (e: MouseEvent) => {
    // 버튼을 누른 채 움직이는 건 플릭이므로 자세로 보지 않는다
    if (this.hasSensor || e.buttons !== 0) return;
    const now = performance.now();
    const roll = (e.clientX / window.innerWidth - 0.5) * 70;
    const pitch = (0.5 - e.clientY / window.innerHeight) * 50;
    const r = Math.hypot(roll - this.sim.roll, pitch - this.sim.pitch) * 60;
    this.sim = { roll, pitch };
    this.pushRate(now, r);
  };

  private pushRate(t: number, r: number) {
    this.rates.push({ t, r });
    while (this.rates.length && t - this.rates[0].t > 500) this.rates.shift();
  }

  /** 매 프레임 호출: 저역 통과 필터로 손 떨림을 줄인 자세 */
  sample(): PoseSample {
    const now = performance.now();
    while (this.rates.length && now - this.rates[0].t > 500) this.rates.shift();
    let roll: number;
    let pitch: number;
    if (this.hasSensor) {
      roll = this.rawGamma - this.baseGamma;
      pitch = this.baseBeta - this.rawBeta; // 위쪽을 앞으로 숙이면 +
    } else {
      roll = this.sim.roll;
      pitch = this.sim.pitch;
    }
    if (this.leftHanded) roll = -roll;
    const a = 0.25;
    this.smoothRoll += (roll - this.smoothRoll) * a;
    this.smoothPitch += (pitch - this.smoothPitch) * a;
    return {
      roll: this.smoothRoll,
      pitch: this.smoothPitch,
      stability: stabilityFromRates(this.rates.map((x) => x.r)),
    };
  }
}
