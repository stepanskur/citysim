// Звуки обратной связи через WebAudio (синтез, без внешних файлов).
let ctx: AudioContext | null = null; export let soundOn = localStorage.getItem('citysim_sound') !== '0';
export function setSound(v: boolean) { soundOn = v; localStorage.setItem('citysim_sound', v ? '1' : '0'); }
function ac() { if (!ctx) { try { ctx = new AudioContext(); } catch { return null; } } if (ctx.state === 'suspended') ctx.resume(); return ctx; }
function tone(f: number, t0: number, dur: number, type: OscillatorType = 'sine', vol = 0.12) {
  const c = ac(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f;
  const s = c.currentTime + t0; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(vol, s + 0.015); g.gain.exponentialRampToValueAtTime(0.0008, s + dur);
  o.connect(g).connect(c.destination); o.start(s); o.stop(s + dur + 0.05);
}
export const SFX = {
  click: () => soundOn && tone(880, 0, 0.06, 'triangle', 0.05),
  coin: () => { if (!soundOn) return; tone(988, 0, 0.09, 'square', 0.04); tone(1319, 0.08, 0.22, 'square', 0.04); },
  quest: () => { if (!soundOn) return; [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.09)); },
  ach: () => { if (!soundOn) return; [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.45, 'sine', 0.1)); tone(1568, 0.34, 0.6, 'triangle', 0.05); },
  alarm: () => { if (!soundOn) return; tone(440, 0, 0.18, 'sawtooth', 0.05); tone(330, 0.2, 0.25, 'sawtooth', 0.05); },
  bad: () => soundOn && tone(196, 0, 0.35, 'triangle', 0.08),
  info: () => { if (!soundOn) return; tone(660, 0, 0.12); tone(880, 0.1, 0.18); },
};
