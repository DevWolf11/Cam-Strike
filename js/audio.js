// Tiny synthesized sound kit (no audio files needed).
let ctx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function out(vol, pan) {
  const g = ctx.createGain(); g.gain.value = vol;
  if (ctx.createStereoPanner && pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master); }
  else g.connect(master);
  return g;
}

function noiseBurst(dur, freq, q, vol, pan, type = 'lowpass') {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = out(0, pan);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}

function tone(freq, dur, vol, type = 'sine', pan = 0, slideTo = 0) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = out(0, pan);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); o.start(t); o.stop(t + dur + 0.02);
}

const GUN = {
  pistol:  { dur: 0.16, freq: 2600, vol: 0.55, thump: 140 },
  smg:     { dur: 0.12, freq: 3200, vol: 0.45, thump: 170 },
  shotgun: { dur: 0.4,  freq: 1400, vol: 0.9,  thump: 70 },
  rifle:   { dur: 0.22, freq: 2100, vol: 0.65, thump: 100 },
  sniper:  { dur: 0.6,  freq: 1200, vol: 1.0,  thump: 55 },
};

// dist/pan let far away shots sound quieter and positional
export function gunshot(id, dist = 0, pan = 0) {
  if (!ctx) return;
  const g = GUN[id] || GUN.pistol;
  const att = 1 / (1 + dist * 0.06);
  if (att < 0.03) return;
  noiseBurst(g.dur, dist > 30 ? g.freq * 0.5 : g.freq, 0.7, g.vol * att, pan);
  tone(g.thump, g.dur * 0.8, 0.5 * att, 'triangle', pan, 40);
}

export function hitmarker() { if (ctx) tone(1800, 0.05, 0.18, 'square'); }
export function headshot() { if (ctx) { tone(2600, 0.08, 0.2, 'square'); noiseBurst(0.08, 5000, 2, 0.25, 0, 'highpass'); } }
export function hurt() { if (ctx) noiseBurst(0.18, 600, 1, 0.5, 0); }
export function reload() { if (ctx) { tone(500, 0.05, 0.15, 'square'); setTimeout(() => ctx && tone(350, 0.06, 0.15, 'square'), 180); } }
export function click() { if (ctx) tone(900, 0.03, 0.12, 'square'); }
export function beep(urgent) { if (ctx) tone(urgent ? 2000 : 1600, 0.09, 0.28, 'sine'); }
export function plantDone() { if (ctx) { tone(900, 0.12, 0.3, 'square'); setTimeout(() => ctx && tone(1300, 0.18, 0.3, 'square'), 140); } }
export function buy() { if (ctx) { tone(700, 0.05, 0.2, 'triangle'); setTimeout(() => ctx && tone(1050, 0.08, 0.2, 'triangle'), 60); } }
export function step(vol = 0.08, pan = 0) { if (ctx) noiseBurst(0.06, 900, 1.5, vol, pan); }
export function explosion(dist = 0) {
  if (!ctx) return;
  const att = 1 / (1 + dist * 0.02);
  noiseBurst(2.2, 400, 0.5, 1.4 * att, 0);
  tone(60, 1.8, 0.9 * att, 'sine', 0, 25);
}
export function roundStart() { if (ctx) { tone(600, 0.1, 0.2); setTimeout(() => ctx && tone(900, 0.15, 0.2), 120); } }
export function roundEnd(win) {
  if (!ctx) return;
  const notes = win ? [523, 659, 784] : [392, 330, 262];
  notes.forEach((n, i) => setTimeout(() => ctx && tone(n, 0.3, 0.25, 'triangle'), i * 160));
}

// ---- melee & grenades ----
export function knifeSwing() { if (ctx) noiseBurst(0.12, 2500, 0.8, 0.25, 0, 'bandpass'); }
export function knifeHit() { if (ctx) { noiseBurst(0.1, 900, 1, 0.5, 0); tone(180, 0.1, 0.3, 'triangle'); } }
export function nadeBounce(dist = 0) { if (ctx) tone(900 + Math.random() * 300, 0.04, 0.2 / (1 + dist * 0.1), 'square'); }
export function pin() { if (ctx) { tone(2400, 0.03, 0.15, 'square'); setTimeout(() => ctx && tone(1800, 0.05, 0.12, 'square'), 90); } }
export function heBoom(dist = 0) {
  if (!ctx) return;
  const att = 1 / (1 + dist * 0.04);
  noiseBurst(0.9, 600, 0.6, 1.1 * att, 0);
  tone(70, 0.7, 0.8 * att, 'sine', 0, 30);
}
export function flashBang(dist = 0) {
  if (!ctx) return;
  const att = 1 / (1 + dist * 0.05);
  noiseBurst(0.3, 3500, 0.5, 0.9 * att, 0, 'highpass');
  tone(110, 0.3, 0.5 * att, 'sine', 0, 50);
}
export function ringing(sec) {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = 3200; g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + sec);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + sec);
}
export function smokePop(dist = 0) { if (ctx) noiseBurst(1.6, 1800, 0.4, 0.35 / (1 + dist * 0.05), 0, 'bandpass'); }
export function fireWhoosh(dist = 0) { if (ctx) noiseBurst(1.2, 500, 0.5, 0.6 / (1 + dist * 0.05), 0); }
export function fireCrackle(dist = 0) { if (ctx && dist < 25) noiseBurst(0.08, 3000, 3, 0.12 / (1 + dist * 0.2), 0, 'bandpass'); }
