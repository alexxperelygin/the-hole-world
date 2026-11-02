/* Synthesised sound, no assets. Tone depends on the layer segment. */
import { S } from './state';
import { haptic } from './platform/telegram';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

class Sound {
  ctx: AudioContext | null = null; noise: AudioBuffer | null = null;
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); const len = Math.floor(this.ctx.sampleRate * 0.25);
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = b;
    } catch { this.ctx = null; }
  }
  ok(): this is this & { ctx: AudioContext; noise: AudioBuffer } { return !!(S.sound && this.ctx && this.ctx.state === 'running'); }
  dig(seg: number) {
    if (!this.ok()) return; const c = this.ctx, t0 = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = (1100 - seg * 40) * rnd(0.8, 1.2); f.Q.value = 1.4;
    const g = c.createGain(); g.gain.setValueAtTime(0.32, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t0); src.stop(t0 + 0.1);
    const o = c.createOscillator(); o.frequency.setValueAtTime(150 - seg * 4, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.08);
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.22, t0); g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
    o.connect(g2); g2.connect(c.destination); o.start(t0); o.stop(t0 + 0.12);
  }
  tones(fr: number[], dur = 0.08, type: OscillatorType = 'triangle', vol = 0.14) {
    if (!this.ok()) return; const c = this.ctx; let t0 = c.currentTime;
    fr.forEach(f => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; const g = c.createGain();
      g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur * 1.6);
      o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur * 1.7); t0 += dur; });
  }
  buy() { this.tones([523, 784], 0.06, 'square', 0.06); }
  find(r: number) { this.tones([[660, 880], [660, 880, 1175], [523, 659, 784, 1047], [523, 659, 784, 1047, 1319, 1568]][r], 0.075, 'triangle', 0.13); }
  boom() {
    if (!this.ok()) return; const c = this.ctx, t0 = c.currentTime;
    const o = c.createOscillator(); o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(32, t0 + 0.6);
    const g = c.createGain(); g.gain.setValueAtTime(0.4, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 0.75);
    this.tones([392, 523, 659], 0.09, 'triangle', 0.1);
  }
}
export const Snd = new Sound();
export const buzz = haptic;
