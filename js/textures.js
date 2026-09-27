import * as THREE from '../lib/three.module.min.js';

// Canvas-drawn textures (no image files): signs, site decals, posters, particles and fabric.
// Map surfaces are photographic (see mapassets.js). Textures are cached per name.
const cache = new Map();

function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
function toTex(c, color = true, repeat = true, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---------- non-tiling textures ----------
function make(size, draw, repeat = true) {
  const c = canvas(size);
  draw(c.getContext('2d'), size);
  return toTex(c, true, repeat);
}

export function signTexture(text, arrow) {
  return make(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(190,30,30,0.9)';
    ctx.font = `bold ${s * 0.6}px Impact, Arial Black, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, s * 0.38, s * 0.5);
    if (arrow) {
      ctx.save(); ctx.translate(s * 0.78, s * 0.5);
      ctx.rotate({ e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 }[arrow] ?? 0);
      ctx.beginPath(); ctx.moveTo(s * 0.14, 0); ctx.lineTo(-s * 0.06, -s * 0.13); ctx.lineTo(-s * 0.06, s * 0.13); ctx.closePath(); ctx.fill();
      ctx.fillRect(-s * 0.16, -s * 0.04, s * 0.12, s * 0.08);
      ctx.restore();
    }
    // weathering: knock paint out in speckles
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.6})`; ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  }, false);
}

export function siteDecal(letter) {
  return make(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = '#d8332a'; ctx.lineWidth = 12; ctx.globalAlpha = 0.72;
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#d8332a'; ctx.font = 'bold 170px Impact, Arial Black, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, s / 2, s / 2 + 8);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 1500; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.7})`; ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
  }, false);
}

export function radialTex(inner, outer) {
  const key = 'radial' + inner + outer;
  if (cache.has(key)) return cache.get(key);
  const t = make(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }, false);
  cache.set(key, t);
  return t;
}

// Soft, lumpy puff for smoke/dust (less "perfect circle" than a radial gradient)
export function puffTex() {
  if (cache.has('puff')) return cache.get('puff');
  const t = make(128, (ctx, s) => {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * s * 0.22, x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d, r = s * (0.12 + Math.random() * 0.16);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
  }, false);
  cache.set('puff', t);
  return t;
}

// Six-point muzzle flash starburst
export function flashTex() {
  if (cache.has('flash')) return cache.get('flash');
  const t = make(128, (ctx, s) => {
    ctx.translate(s / 2, s / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s / 2); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,200,90,0.9)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g;
    for (let k = 0; k < 6; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, -s * 0.06); ctx.lineTo(s * (0.34 + (k % 2) * 0.14), 0); ctx.lineTo(0, s * 0.06); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, 7); ctx.fill();
  }, false);
  cache.set('flash', t);
  return t;
}

// Decal atlas: 4x2 cells -> bullet holes, blood splats, scorch mark
export function decalAtlas() {
  if (cache.has('decals')) return cache.get('decals');
  const t = make(512, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const cw = s / 4, ch = s / 2;
    for (let k = 0; k < 3; k++) {                           // bullet holes
      const cx = k * cw + cw / 2, cy = ch / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw * 0.32); g.addColorStop(0, 'rgba(6,5,4,1)'); g.addColorStop(0.38, 'rgba(18,14,10,1)'); g.addColorStop(0.5, 'rgba(45,36,28,0.75)'); g.addColorStop(0.75, 'rgba(70,58,44,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(k * cw, 0, cw, ch);
      ctx.strokeStyle = 'rgba(20,15,10,0.6)'; ctx.lineWidth = 1.5;
      for (let r = 0; r < 5; r++) { const a = Math.random() * 7; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * cw * 0.3, cy + Math.sin(a) * cw * 0.3); ctx.stroke(); }
    }
    { const cx = 3 * cw + cw / 2, cy = ch / 2; const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw * 0.45); g.addColorStop(0, 'rgba(15,12,10,0.85)'); g.addColorStop(0.6, 'rgba(30,25,20,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(3 * cw, 0, cw, ch); } // scorch
    for (let k = 0; k < 4; k++) {                           // blood splats
      const cx = k * cw + cw / 2, cy = ch + ch / 2;
      ctx.fillStyle = 'rgba(110,8,8,0.9)';
      ctx.beginPath(); ctx.arc(cx, cy, cw * 0.14, 0, 7); ctx.fill();
      for (let d = 0; d < 14; d++) { const a = Math.random() * 7, r = cw * (0.1 + Math.random() * 0.3), rr = cw * (0.02 + Math.random() * 0.05); ctx.globalAlpha = 0.6 + Math.random() * 0.4; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, rr, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }, false);
  cache.set('decals', t);
  return t;
}

// Poster / graffiti atlas: 4x2 cells
export function posterAtlas() {
  if (cache.has('posters')) return cache.get('posters');
  const t = make(1024, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const cw = s / 4, ch = s / 2;
    const posters = [
      ['#c8a24a', '#3a2a1a', 'WANTED', '$5000'], ['#2c5d8a', '#f0e6d0', 'CAM', 'STRIKE'], ['#a33a2a', '#f7e7c0', 'CIRCUS', 'TONIGHT'], ['#e8e0cc', '#222', 'LOST CAT', 'CALL 555'],
    ];
    posters.forEach(([bg, fg, a, b], k) => {
      const x = k * cw + cw * 0.12, y = ch * 0.1, w = cw * 0.76, h = ch * 0.8;
      ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.font = `bold ${cw * 0.14}px Impact, sans-serif`; ctx.fillText(a, x + w / 2, y + h * 0.25);
      ctx.fillRect(x + w * 0.2, y + h * 0.33, w * 0.6, h * 0.35);
      ctx.font = `bold ${cw * 0.1}px sans-serif`; ctx.fillText(b, x + w / 2, y + h * 0.85);
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 600; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 3, 3); }
      ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.beginPath(); ctx.moveTo(x + w, y + h * 0.7); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w * 0.75, y + h); ctx.fill(); // torn corner
      ctx.globalCompositeOperation = 'source-over';
    });
    const tags = [['#e0403a', 'KAOS'], ['#3ab0e0', 'CT 4EVA'], ['#8ce03a', 'B→'], ['#f0c030', 'RUSH B']];
    tags.forEach(([col, text], k) => {
      const cx = k * cw + cw / 2, cy = ch + ch / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.12 + Math.random() * 0.24);
      ctx.font = `italic 900 ${cw * 0.2}px Impact, Arial Black, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = cw * 0.03; ctx.strokeStyle = 'rgba(20,20,20,0.9)'; ctx.strokeText(text, 0, 0);
      ctx.fillStyle = col; ctx.fillText(text, 0, 0);
      ctx.restore();
      // drips
      ctx.fillStyle = col; for (let d = 0; d < 6; d++) ctx.fillRect(k * cw + cw * (0.2 + Math.random() * 0.6), cy + cw * 0.08, 3, Math.random() * cw * 0.18);
    });
  }, false);
  cache.set('posters', t);
  return t;
}

// Fabric noise for character clothing (tiling, multiplied with vertex colors)
export function fabricTex() {
  if (cache.has('fabric')) return cache.get('fabric');
  const t = make(128, (ctx, s) => {
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) { ctx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.04})`; ctx.fillRect(0, y, s, 1); }
    for (let x = 0; x < s; x += 3) { ctx.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.04})`; ctx.fillRect(x, 0, 1, s); }
    for (let i = 0; i < 40; i++) { const x = Math.random() * s, y = Math.random() * s, r = 4 + Math.random() * 14; const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(0,0,0,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  });
  cache.set('fabric', t);
  return t;
}

export { make as makeCanvasTexture };
