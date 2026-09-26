// Sound. Recorded effects (public domain, CC0 — see README) packed into one sprite, assets/audio/sfx.mp3,
// with sfx.json giving each sound's [start, duration] in seconds. Everything plays through one bus:
//   voices -> [lowpass for distance / walls] -> [stereo pan] -> dry + reverb send -> compressor -> out
// Positional sounds take s = { dist, pan, occl } (see Game.soundFrom): far sounds get quieter, duller and
// wetter, sounds behind walls are muffled. Until the sprite is decoded (or if it fails) a small
// synthesizer stands in, so the game is never silent.

const SPRITE = 'assets/audio/sfx';
let ctx = null, master = null, bus = null, revIn = null, noiseBuf = null;
let spriteData = null, B = {}, loaded = false;
let voices = 0;
const MAX_VOICES = 40;

// fetch the sprite as soon as the page loads; decode it once there's an AudioContext (first tap)
const fetching = fetch(SPRITE + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
const indexing = fetch(SPRITE + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  // master: a gentle compressor keeps a full spray plus an explosion from clipping
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
  master = ctx.createGain(); master.gain.value = 0.9;
  comp.connect(master); master.connect(ctx.destination);
  bus = ctx.createGain(); bus.connect(comp);
  // reverb: a generated impulse response (short, bright slapback: open streets and courtyards)
  const conv = ctx.createConvolver(); conv.buffer = impulse(1.25, 2.6);
  const revGain = ctx.createGain(); revGain.gain.value = 0.55;
  revIn = ctx.createGain(); revIn.connect(conv); conv.connect(revGain); revGain.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  Promise.all([fetching, indexing]).then(([buf, idx]) => {
    if (!buf || !idx) return;
    spriteData = idx;
    return new Promise((res, rej) => ctx.decodeAudioData(buf.slice(0), res, rej)).then(split);
  }).catch((e) => console.warn('Sound effects unavailable, using synthesized sounds', e));
}

// Cut the decoded sprite into one buffer per sound. MP3 decoders pad the start by a few ms (and not all
// honour the gapless header), so each sound is found by its first non-silent sample near its offset.
function split(all) {
  const sr = all.sampleRate, src = all.getChannelData(0);
  for (const [name, e] of Object.entries(spriteData)) {
    if (name.startsWith('_')) continue;
    const [start, dur] = e;
    let i0 = Math.max(0, Math.floor((start - 0.06) * sr));
    const lim = Math.min(src.length, Math.floor((start + 0.12) * sr));
    while (i0 < lim && Math.abs(src[i0]) < 0.002) i0++;
    const n = Math.min(Math.floor(dur * sr), src.length - i0);
    const b = ctx.createBuffer(1, n, sr);
    b.copyToChannel(src.subarray(i0, i0 + n), 0);
    B[name] = b;
  }
  loaded = true;
}

// Exponentially decaying stereo noise, darker as it decays, with a pre-delay and an early "slap"
function impulse(sec, decay) {
  const sr = ctx.sampleRate, n = Math.floor(sec * sr), ir = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (t < 0.012) continue;
      const k = 0.35 + 0.6 * Math.exp(-t * 3);                // one-pole lowpass closes over time
      lp += ((Math.random() * 2 - 1) - lp) * k;
      d[i] = lp * Math.exp(-t * decay) * (t > 0.07 && t < 0.085 ? 2.2 : 1);
    }
  }
  return ir;
}

export const audioStats = () => ({ loaded, voices, sounds: Object.keys(B).length, state: ctx?.state });
// dev: a stream of the final mix (for recording in tests)
export function audioTap() { const d = ctx.createMediaStreamDestination(); master.connect(d); return d.stream; }

// ---- core voice ----
// o: vol, pan, rate, lp (lowpass Hz), rev (send 0..1), delay (s), loop
function voice(name, o = {}) {
  if (!ctx || !loaded || !B[name]) return null;
  const vol = o.vol ?? 1;
  if (!o.force && (vol < 0.004 || (voices >= MAX_VOICES && vol < 0.35))) return null;   // inaudible, or busy: drop quiet ones first
  const t = ctx.currentTime + (o.delay || 0);
  const src = ctx.createBufferSource(); src.buffer = B[name];
  src.playbackRate.value = o.rate ?? 1;
  if (o.loop) src.loop = true;
  let node = src;
  if (o.lp && o.lp < 18000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; node.connect(f); node = f; }
  const g = ctx.createGain(); g.gain.value = vol; node.connect(g); node = g;
  if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node.connect(p); node = p; }
  node.connect(bus);
  if (o.rev) { const r = ctx.createGain(); r.gain.value = o.rev; node.connect(r); r.connect(revIn); }
  src.start(t);
  voices++;
  src.onended = () => { voices--; };
  return { src, gain: g };
}
const pick = (base, n) => base + (1 + Math.floor(Math.random() * n));
const jitter = (k = 0.04) => 1 + (Math.random() * 2 - 1) * k;

// How a sound at distance d (m) is heard: level, muffling, reverb. `ref` = distance at which it's at half level.
function spatial(s, ref, opts = {}) {
  const dist = s?.dist || 0, occl = !!s?.occl;
  let vol = 1 / (1 + Math.pow(dist / ref, 1.3));
  let lp = 20000 * Math.exp(-dist / (opts.air || 60));
  if (occl) { vol *= 0.45; lp *= 0.3; }
  return { vol, lp: Math.max(500, lp), pan: (s?.pan || 0) * Math.min(1, dist / 3), rev: (opts.rev ?? 0.12) + Math.min(0.55, dist / 70) };
}

// ---- guns ----
const GUN = {
  pistol:  { vol: 0.8, ref: 16, thump: 0 },
  smg:     { vol: 0.62, ref: 10, thump: 0 },
  shotgun: { vol: 1.0, ref: 22, thump: 0.5 },
  rifle:   { vol: 0.85, ref: 20, thump: 0.25 },
  sniper:  { vol: 1.0, ref: 30, thump: 0.6 },
};
export function gunshot(id, dist = 0, pan = 0, occl = false) {
  if (!ctx) return;
  const g = GUN[id] || GUN.pistol, s = { dist, pan, occl };
  if (!loaded) return synthGun(id, dist, pan);
  const sp = spatial(s, g.ref, { rev: dist < 1 ? 0.1 : 0.18 });
  voice(pick(id, 2), { vol: g.vol * sp.vol, pan: sp.pan, lp: sp.lp, rev: sp.rev, rate: jitter(0.035) });
  // a low body under the close shots of the big guns (the recordings are light below 100 Hz)
  if (g.thump && dist < 15) thump(70, 0.16, g.thump * sp.vol, sp.pan);
}
// mechanical sounds after a shot: shotgun pump, sniper bolt
export function afterShot(id, s = null) {
  if (!ctx || !loaded) return;
  const sp = spatial(s, 6, { rev: 0.05 }), v = s ? sp.vol * 0.8 : 0.75;
  if (id === 'shotgun') voice('shotgun_pump', { vol: v, pan: sp.pan, lp: sp.lp, rev: sp.rev, delay: 0.32, rate: jitter(0.02) });
  if (id === 'sniper') {
    voice('sniper_boltback', { vol: v, pan: sp.pan, lp: sp.lp, delay: 0.42 });
    voice('sniper_boltfwd', { vol: v, pan: sp.pan, lp: sp.lp, delay: 0.72 });
  }
}
// one step of a reload ('magout', 'magin', 'bolt', 'shell', 'pump', 'slide'), for weapon id
export function reloadStep(id, step, s = null) {
  if (!ctx) return;
  if (!loaded) { if (step === 'magin' || step === 'slide') synthReload(); return; }
  const sp = spatial(s, 5, { rev: 0.04 }), v = (s ? sp.vol : 1) * 0.45, o = { vol: v, pan: sp.pan, lp: sp.lp, rev: sp.rev, rate: jitter(0.03) };
  const gun = id === 'pistol' ? 'pistol' : 'rifle';
  if (id === 'smg') o.rate *= 1.12;                                 // lighter parts, a touch higher
  if (step === 'bolt') { voice(id === 'sniper' ? 'sniper_boltback' : 'rifle_boltback', o); voice(id === 'sniper' ? 'sniper_boltfwd' : 'rifle_boltfwd', { ...o, delay: 0.14 }); }
  else if (step === 'shell') voice('shotgun_shell', o);
  else if (step === 'pump') voice('shotgun_pump', o);
  else if (step === 'slide') voice('pistol_slide', o);
  else voice(`${gun}_${step}`, o);
}
export function click() { if (!ctx) return; if (loaded) voice('dryfire', { vol: 0.7 }); else tone(900, 0.03, 0.12, 'square'); }
export function draw(kind) {
  if (!ctx || !loaded) return;
  if (kind === 'knife') voice('knife_draw', { vol: 0.5, rate: jitter(0.05) });
  else if (kind !== 'nade') voice('draw', { vol: 0.45, rate: kind === 'pistol' ? 1.1 : 0.95 });
}

// ---- hits and impacts ----
export function hitmarker() { if (!ctx) return; tone(1600, 0.035, 0.07, 'triangle'); }
export function headshot() {
  if (!ctx) return;
  if (loaded) voice('hit_helmet', { vol: 0.55, rate: 1.25 }); else { tone(2600, 0.08, 0.2, 'square'); noiseBurst(0.08, 5000, 2, 0.25, 0, 'highpass'); }
}
export function hurt() { if (!ctx) return; if (loaded) voice(pick('hit_body', 2), { vol: 0.8, rate: jitter(0.06) }); else noiseBurst(0.18, 600, 1, 0.5, 0); }
// a bullet striking a surface (kind: 'hard' | 'body'); ricochets now and then
export function impact(kind, s) {
  if (!ctx || !loaded || (s?.dist || 0) > 40) return;
  const sp = spatial(s, 6, { rev: 0.08 });
  if (kind === 'body') { voice(pick('hit_body', 2), { vol: 0.55 * sp.vol, pan: sp.pan, lp: sp.lp, rate: jitter(0.08) }); return; }
  voice(Math.random() < 0.5 ? 'imp_stone' : 'imp_hard', { vol: 0.32 * sp.vol, pan: sp.pan, lp: sp.lp, rev: sp.rev, rate: jitter(0.12) });
  if (Math.random() < 0.12) voice(pick('ric', 3), { vol: 0.28 * sp.vol, pan: sp.pan, lp: sp.lp, rev: sp.rev, rate: jitter(0.08) });
}
export function casing(s) {
  if (!ctx || !loaded || (s?.dist || 0) > 12) return;
  const sp = spatial(s, 3);
  voice(pick('casing', 2), { vol: 0.22 * sp.vol, pan: sp.pan, lp: sp.lp, rate: jitter(0.1) });
}
// a bullet passing close by
export function whiz(pan) { if (ctx && loaded) voice('whiz', { vol: 0.45, pan, rate: jitter(0.12) }); }

// ---- movement ----
export function step(vol = 0.08, pan = 0, s = null) {
  if (!ctx) return;
  if (!loaded) return noiseBurst(0.06, 900, 1.5, vol, pan);
  const sp = s ? spatial(s, 6, { rev: 0.05 }) : { vol: 1, lp: 20000, pan, rev: 0.02 };
  voice(pick('step', 8), { vol: vol * 3 * sp.vol, pan: sp.pan, lp: s?.occl ? sp.lp : 20000, rev: sp.rev, rate: jitter(0.06) });
}
export function land(vol = 0.5) { if (ctx && loaded) voice('land', { vol, rate: jitter(0.05) }); }

// ---- knife ----
export function knifeSwing(s = null) {
  if (!ctx) return;
  if (!loaded) return noiseBurst(0.12, 2500, 0.8, 0.25, 0, 'bandpass');
  const sp = spatial(s, 4);
  voice(pick('knife_swing', 2), { vol: 0.6 * sp.vol, pan: sp.pan, rate: jitter(0.08) });
}
export function knifeHit(s = null) {
  if (!ctx) return;
  if (!loaded) { noiseBurst(0.1, 900, 1, 0.5, 0); tone(180, 0.1, 0.3, 'triangle'); return; }
  const sp = spatial(s, 5);
  voice('knife_hit', { vol: 0.8 * sp.vol, pan: sp.pan, rate: jitter(0.05) });
}
export function knifeWall(s = null) { if (ctx && loaded) { const sp = spatial(s, 5); voice('knife_wall', { vol: 0.5 * sp.vol, pan: sp.pan, rate: jitter(0.1) }); } }

// ---- grenades ----
export function pin(s = null) {
  if (!ctx) return;
  if (!loaded) { tone(2400, 0.03, 0.15, 'square'); setTimeout(() => ctx && tone(1800, 0.05, 0.12, 'square'), 90); return; }
  const sp = spatial(s, 4);
  voice('pin', { vol: 0.7 * sp.vol, pan: sp.pan, rate: jitter(0.05) });
}
export function throwWhoosh(s = null) { if (ctx && loaded) { const sp = spatial(s, 4); voice('knife_swing1', { vol: 0.35 * sp.vol, pan: sp.pan, rate: 0.7 }); } }
export function nadeBounce(dist = 0, pan = 0, speed = 6, occl = false) {
  if (!ctx) return;
  if (!loaded) return tone(900 + Math.random() * 300, 0.04, 0.2 / (1 + dist * 0.1), 'square');
  const sp = spatial({ dist, pan, occl }, 7);
  voice(pick('bounce', 2), { vol: Math.min(1, speed / 10) * 0.55 * sp.vol, pan: sp.pan, lp: sp.lp, rev: sp.rev, rate: jitter(0.1) });
}
export function heBoom(dist = 0, pan = 0, occl = false) {
  if (!ctx) return;
  if (!loaded) { const att = 1 / (1 + dist * 0.04); noiseBurst(0.9, 600, 0.6, 1.1 * att, 0); tone(70, 0.7, 0.8 * att, 'sine', 0, 30); return; }
  const sp = spatial({ dist, pan, occl }, 35, { air: 120, rev: 0.3 });
  voice('he', { vol: sp.vol, pan: sp.pan * 0.6, lp: sp.lp, rev: sp.rev, rate: jitter(0.03) });
  thump(55, 0.5, 0.9 * sp.vol, 0);
}
export function flashBang(dist = 0, pan = 0, occl = false) {
  if (!ctx) return;
  if (!loaded) { const att = 1 / (1 + dist * 0.05); noiseBurst(0.3, 3500, 0.5, 0.9 * att, 0, 'highpass'); tone(110, 0.3, 0.5 * att, 'sine', 0, 50); return; }
  const sp = spatial({ dist, pan, occl }, 30, { air: 150, rev: 0.3 });
  voice('flash', { vol: 1.5 * sp.vol, pan: sp.pan * 0.6, lp: sp.lp, rev: sp.rev });
}
// the ear ringing after being flashed: two close sines beating, fading over sec
export function ringing(sec) {
  if (!ctx) return;
  const t = ctx.currentTime, g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.setValueAtTime(0.0001, t + 0.12); g.gain.exponentialRampToValueAtTime(0.07, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0005, t + sec);
  g.connect(master);
  for (const f of [3150, 3190]) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + sec); }
  // everything else goes muffled for a while once the bang has passed, like CS
  const d = t + 0.15;
  bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(1, d); bus.gain.linearRampToValueAtTime(0.25, d + 0.1); bus.gain.linearRampToValueAtTime(1, d + Math.min(sec, 3));
}
export function smokePop(dist = 0, pan = 0, occl = false) {
  if (!ctx) return;
  if (!loaded) return noiseBurst(1.6, 1800, 0.4, 0.35 / (1 + dist * 0.05), 0, 'bandpass');
  const sp = spatial({ dist, pan, occl }, 12, { rev: 0.2 });
  voice('smoke', { vol: 0.5 * sp.vol, pan: sp.pan, lp: sp.lp, rev: sp.rev });
  voice('bounce2', { vol: 0.3 * sp.vol, pan: sp.pan, lp: sp.lp, rate: 0.8 });
}
export function fireWhoosh(dist = 0, pan = 0, occl = false) {
  if (!ctx) return;
  if (!loaded) return noiseBurst(1.2, 500, 0.5, 0.6 / (1 + dist * 0.05), 0);
  const sp = spatial({ dist, pan, occl }, 14, { rev: 0.15 });
  voice('glass', { vol: 0.8 * sp.vol, pan: sp.pan, lp: sp.lp, rev: sp.rev, rate: jitter(0.05) });
  voice('ignite', { vol: 0.85 * sp.vol, pan: sp.pan, lp: sp.lp, rev: sp.rev, delay: 0.05 });
}
// A burning molotov: a looping fire sound that follows the listener's distance; returns a handle
export function fireLoop() {
  if (!ctx || !loaded) return null;
  const v = voice('fire_loop', { vol: 0, loop: true, force: true });
  if (!v) return null;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 8000;
  v.src.disconnect(); v.src.connect(f); f.connect(v.gain);
  return {
    set(s, fade = 1) {
      const sp = spatial(s, 8), t = ctx.currentTime;
      v.gain.gain.setTargetAtTime(0.5 * sp.vol * fade, t, 0.1);
      f.frequency.setTargetAtTime(sp.lp, t, 0.1);
    },
    stop() { const t = ctx.currentTime; v.gain.gain.setTargetAtTime(0, t, 0.15); v.src.stop(t + 0.8); },
  };
}

// ---- bomb and rounds ----
export function explosion(dist = 0, pan = 0) {
  if (!ctx) return;
  if (!loaded) { const att = 1 / (1 + dist * 0.02); noiseBurst(2.2, 400, 0.5, 1.4 * att, 0); tone(60, 1.8, 0.9 * att, 'sine', 0, 25); return; }
  const sp = spatial({ dist, pan }, 70, { air: 200, rev: 0.35 });
  voice('c4_boom', { vol: sp.vol, lp: sp.lp, rev: sp.rev, rate: 0.9 });
  voice('he', { vol: 0.8 * sp.vol, lp: sp.lp, rev: sp.rev, rate: 0.8 });
  thump(40, 1.2, sp.vol, 0);
}
export function beep(urgent) { if (ctx) { tone(urgent ? 1900 : 1650, 0.1, 0.22, 'sine'); tone(urgent ? 3800 : 3300, 0.05, 0.03, 'square'); } }
export function plantDone() { if (!ctx) return; tone(900, 0.12, 0.25, 'square'); setTimeout(() => ctx && tone(1300, 0.18, 0.25, 'square'), 140); }
export function buy() { if (!ctx) return; if (loaded) { voice('rifle_magin', { vol: 0.35, rate: 1.1 }); voice('ui_click', { vol: 0.4 }); } else { tone(700, 0.05, 0.2, 'triangle'); setTimeout(() => ctx && tone(1050, 0.08, 0.2, 'triangle'), 60); } }
export function uiClick() { if (ctx && loaded) voice('ui_click', { vol: 0.4 }); }
export function roundStart() { if (ctx) { tone(600, 0.1, 0.14); setTimeout(() => ctx && tone(900, 0.15, 0.14), 120); } }
export function roundEnd(win) {
  if (!ctx) return;
  const notes = win ? [523, 659, 784] : [392, 330, 262];
  notes.forEach((n, i) => setTimeout(() => ctx && tone(n, 0.3, 0.18, 'triangle'), i * 160));
}

// ---- synthesizer (fallback, beeps, and the low end under explosions) ----
function out(vol, pan) {
  const g = ctx.createGain(); g.gain.value = vol;
  if (ctx.createStereoPanner && pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(bus); }
  else g.connect(bus);
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
// a low sine drop: weight under shots and blasts
function thump(freq, dur, vol, pan) {
  if (vol < 0.01) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = out(0, pan);
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.6, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g); o.start(t); o.stop(t + dur + 0.02);
}
const SYN = { pistol: [0.16, 2600, 0.55, 140], smg: [0.12, 3200, 0.45, 170], shotgun: [0.4, 1400, 0.9, 70], rifle: [0.22, 2100, 0.65, 100], sniper: [0.6, 1200, 1.0, 55] };
function synthGun(id, dist, pan) {
  const [dur, freq, vol, th] = SYN[id] || SYN.pistol, att = 1 / (1 + dist * 0.06);
  if (att < 0.03) return;
  noiseBurst(dur, dist > 30 ? freq * 0.5 : freq, 0.7, vol * att, pan);
  tone(th, dur * 0.8, 0.5 * att, 'triangle', pan, 40);
}
function synthReload() { tone(500, 0.05, 0.15, 'square'); setTimeout(() => ctx && tone(350, 0.06, 0.15, 'square'), 180); }
