import * as THREE from '../lib/three.module.min.js';

// Procedurally painted textures (no image files). Each is cached by name.
const cache = new Map();
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function make(size, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  seed = 1 + size;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function speckle(ctx, s, n, alpha, light, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${rnd() * alpha})`;
    ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * size, 1 + rnd() * size);
  }
}
function stains(ctx, s, n, color, maxR) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s, r = maxR * (0.3 + rnd());
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
const shade = (hex, k) => {
  const c = new THREE.Color(hex); c.multiplyScalar(k);
  return `rgb(${Math.min(255, c.r * 255) | 0},${Math.min(255, c.g * 255) | 0},${Math.min(255, c.b * 255) | 0})`;
};

const DRAW = {
  sand(ctx, s) {
    ctx.fillStyle = '#c9ad7f'; ctx.fillRect(0, 0, s, s);
    stains(ctx, s, 14, 'rgba(150,115,70,0.25)', 60); stains(ctx, s, 10, 'rgba(235,210,160,0.25)', 50);
    speckle(ctx, s, 6000, 0.14, false); speckle(ctx, s, 3000, 0.12, true);
  },
  cobble(ctx, s) {
    ctx.fillStyle = '#8f7f68'; ctx.fillRect(0, 0, s, s);
    const n = 8, cs = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const ox = (y % 2) * cs / 2, v = 170 + rnd() * 50;
      ctx.fillStyle = `rgb(${v},${v * 0.9 | 0},${v * 0.76 | 0})`;
      ctx.beginPath();
      ctx.roundRect(x * cs + ox + 2, y * cs + 2, cs - 4 - rnd() * 3, cs - 4 - rnd() * 3, 6);
      ctx.fill();
    }
    speckle(ctx, s, 4000, 0.15, false);
  },
  concrete(ctx, s) {
    ctx.fillStyle = '#a9a9a4'; ctx.fillRect(0, 0, s, s);
    stains(ctx, s, 16, 'rgba(90,90,85,0.18)', 70); stains(ctx, s, 8, 'rgba(200,200,195,0.2)', 60);
    speckle(ctx, s, 5000, 0.1, false); speckle(ctx, s, 2500, 0.08, true);
    ctx.strokeStyle = 'rgba(60,60,60,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  },
  asphalt(ctx, s) {
    ctx.fillStyle = '#4b4c4e'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 9000, 0.25, true, 1.5); speckle(ctx, s, 5000, 0.2, false);
    stains(ctx, s, 6, 'rgba(20,20,20,0.3)', 50);
    ctx.strokeStyle = 'rgba(20,20,20,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, s * 0.3); ctx.bezierCurveTo(s * 0.3, s * 0.4, s * 0.6, s * 0.2, s, s * 0.35); ctx.stroke();
  },
  tiles(ctx, s) {
    const n = 8, cs = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#c8b89a' : '#8f5a3c';
      ctx.fillRect(x * cs, y * cs, cs, cs);
    }
    ctx.strokeStyle = 'rgba(40,30,20,0.4)'; ctx.lineWidth = 2;
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, s); ctx.moveTo(0, i * cs); ctx.lineTo(s, i * cs); ctx.stroke(); }
    speckle(ctx, s, 3000, 0.12, false);
  },
  wood(ctx, s) {
    const n = 6, ph = s / n;
    for (let i = 0; i < n; i++) {
      const v = 120 + rnd() * 40;
      ctx.fillStyle = `rgb(${v},${v * 0.72 | 0},${v * 0.45 | 0})`; ctx.fillRect(0, i * ph, s, ph - 2);
      ctx.strokeStyle = 'rgba(60,35,15,0.25)';
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(0, i * ph + rnd() * ph); ctx.lineTo(s, i * ph + rnd() * ph); ctx.stroke(); }
    }
    speckle(ctx, s, 2500, 0.12, false);
  },
  metal(ctx, s) {
    ctx.fillStyle = '#6d7277'; ctx.fillRect(0, 0, s, s);
    const n = 16, cs = s / n;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) % 2) ctx.fillRect(x * cs + cs * 0.3, y * cs + cs * 0.1, cs * 0.4, cs * 0.8);
    speckle(ctx, s, 2500, 0.12, true); stains(ctx, s, 8, 'rgba(110,70,40,0.2)', 40);
  },
  sandstone(ctx, s) {
    ctx.fillStyle = '#d8c29a'; ctx.fillRect(0, 0, s, s);
    const rows = 8, bh = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (s / 4);
      for (let b = -1; b < 3; b++) {
        const v = 195 + rnd() * 40;
        ctx.fillStyle = `rgb(${v + 18},${v},${v - 42})`;
        ctx.fillRect(b * s / 2 + off + 2, r * bh + 2, s / 2 - 4, bh - 4);
      }
    }
    stains(ctx, s, 10, 'rgba(120,90,50,0.2)', 50); speckle(ctx, s, 4000, 0.12, false);
  },
  plaster(ctx, s, tint = '#e2d3b4') {
    ctx.fillStyle = tint; ctx.fillRect(0, 0, s, s);
    stains(ctx, s, 18, 'rgba(150,120,80,0.16)', 60); stains(ctx, s, 10, 'rgba(255,245,220,0.2)', 50);
    speckle(ctx, s, 3500, 0.08, false);
    // cracked plaster patches showing the bricks underneath
    for (let k = 0; k < 2; k++) {
      const px = rnd() * s * 0.7, py = rnd() * s * 0.7, pw = s * 0.2, ph = s * 0.12;
      ctx.fillStyle = 'rgba(150,120,90,0.55)'; ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = 'rgba(90,70,50,0.4)'; for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.moveTo(px, py + r * ph / 3); ctx.lineTo(px + pw, py + r * ph / 3); ctx.stroke(); }
    }
  },
  plaster_pink(ctx, s) { DRAW.plaster(ctx, s, '#e4c2a8'); },
  stone(ctx, s) {
    ctx.fillStyle = '#b8a888'; ctx.fillRect(0, 0, s, s);
    const rows = 4, bh = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * s / 3;
      for (let b = -1; b < 3; b++) { const v = 160 + rnd() * 50; ctx.fillStyle = `rgb(${v},${v * 0.92 | 0},${v * 0.78 | 0})`; ctx.fillRect(b * s / 1.5 + off + 3, r * bh + 3, s / 1.5 - 6, bh - 6); }
    }
    speckle(ctx, s, 4000, 0.14, false);
  },
  brick(ctx, s) {
    ctx.fillStyle = '#6a5a52'; ctx.fillRect(0, 0, s, s);
    const rows = 16, bh = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * s / 8;
      for (let b = -1; b < 5; b++) { const v = 120 + rnd() * 50; ctx.fillStyle = `rgb(${v + 30},${v * 0.55 | 0},${v * 0.42 | 0})`; ctx.fillRect(b * s / 4 + off + 1, r * bh + 1, s / 4 - 2, bh - 2); }
    }
    speckle(ctx, s, 3000, 0.12, false);
  },
  corrugated(ctx, s) {
    for (let x = 0; x < s; x += 8) {
      const g = ctx.createLinearGradient(x, 0, x + 8, 0);
      g.addColorStop(0, '#8a8f95'); g.addColorStop(0.5, '#c8ccd0'); g.addColorStop(1, '#7a7f85');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 8, s);
    }
    stains(ctx, s, 10, 'rgba(120,80,50,0.18)', 50); speckle(ctx, s, 2000, 0.1, false);
  },
  panel(ctx, s) {
    ctx.fillStyle = '#c9ccc9'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#b8bcb9'; ctx.fillRect(0, s * 0.55, s, s * 0.45);
    ctx.fillStyle = '#3f6f8f'; ctx.fillRect(0, s * 0.5, s, s * 0.05);
    ctx.strokeStyle = 'rgba(40,40,40,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, s / 2 - 4, s - 4); ctx.strokeRect(s / 2 + 2, 2, s / 2 - 4, s - 4);
    ctx.fillStyle = 'rgba(40,40,40,0.5)';
    for (const [x, y] of [[8, 8], [s / 2 - 8, 8], [8, s - 8], [s / 2 - 8, s - 8]]) { ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.arc(x + s / 2, y, 2, 0, 7); ctx.fill(); }
    stains(ctx, s, 8, 'rgba(90,90,80,0.15)', 50);
  },
  crate(ctx, s) {
    ctx.fillStyle = '#9b6a3a'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#8a5c30' : '#a87444'; ctx.fillRect(0, i * s / 8, s, s / 8 - 1); }
    ctx.strokeStyle = '#5e3b1b'; ctx.lineWidth = s * 0.08; ctx.strokeRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92);
    ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.moveTo(s * 0.08, s * 0.08); ctx.lineTo(s * 0.92, s * 0.92); ctx.stroke();
    ctx.fillStyle = 'rgba(30,20,10,0.55)'; ctx.font = `bold ${s * 0.12}px monospace`; ctx.fillText('FRAGILE', s * 0.45, s * 0.3);
    speckle(ctx, s, 1500, 0.15, false);
  },
  container(ctx, s) {
    ctx.fillStyle = '#d0d0d0'; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) { ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(x, 0, 6, s); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 8, 0, 4, s); }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, s, 6); ctx.fillRect(0, s - 6, s, 6);
    stains(ctx, s, 10, 'rgba(120,70,40,0.25)', 40); speckle(ctx, s, 2000, 0.12, false);
  },
  ceiling(ctx, s) {
    ctx.fillStyle = '#b5ada0'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#5a554c';
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * s / 4, s, 8);
    speckle(ctx, s, 3000, 0.12, false);
  },
};

export function tex(name) {
  if (!cache.has(name)) cache.set(name, make(256, DRAW[name] || DRAW.concrete));
  return cache.get(name);
}

export function signTexture(text, arrow) {
  return make(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, s, s);
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
  }, false);
}

export function siteDecal(letter) {
  return make(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = '#d8332a'; ctx.lineWidth = 12; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#d8332a'; ctx.font = 'bold 170px Impact, Arial Black, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, s / 2, s / 2 + 8);
  }, false);
}

export function skyTexture(stops) {
  return make(64, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, stops[0]); g.addColorStop(0.6, stops[1]); g.addColorStop(1, stops[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }, false);
}

export function radialTex(inner, outer) {
  const key = inner + outer;
  if (cache.has(key)) return cache.get(key);
  const t = make(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }, false);
  cache.set(key, t);
  return t;
}

export { make as makeCanvasTexture, shade };
