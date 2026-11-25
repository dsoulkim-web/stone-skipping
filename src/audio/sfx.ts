// 효과음: 외부 파일 없이 WebAudio로 합성. 튕길 때마다 한 음씩 올라가는 음계.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];

export class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;

  /** 사용자 터치 안에서 호출해야 소리가 난다 (모바일 정책) */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    void this.ctx?.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, cutoff: number) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  }

  bounce(index: number, perfect: boolean): void {
    const semis = SCALE[Math.min(index, SCALE.length - 1)];
    const f = 440 * 2 ** (semis / 12);
    this.tone(f, 0.18, 'triangle', 0.25);
    if (perfect && index < 3) this.tone(f * 1.5, 0.3, 'sine', 0.12, 0.02);
    if (index >= 10) this.tone(f * 1.25, 0.25, 'sine', 0.08); // 콤보 화음
    this.noise(0.12, 0.25, 2500);
  }

  sink(): void {
    this.tone(220, 0.35, 'sine', 0.3, 0, 70);
    this.noise(0.5, 0.4, 900);
  }

  throwWhoosh(): void {
    this.noise(0.2, 0.15, 4000);
  }

  fanfare(): void {
    [0, 4, 7, 12].forEach((s, i) => this.tone(523 * 2 ** (s / 12), 0.35, 'triangle', 0.2, i * 0.09));
  }
}
