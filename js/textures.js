import * as THREE from '../lib/three.module.min.js';

// Procedurally painted textures (no image files). Each painter draws a color layer and a
// matching height layer; the height layer becomes a bump map so mortar, grooves and stones
// catch the sun. Textures are cached per name + resolution.
const cache = new Map();
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const R = (a, b) => a + rnd() * (b - a);
const pickC = (arr) => arr[Math.floor(rnd() * arr.length)];

function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
function toTex(c, color = true, repeat = true, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const gray = (v, a = 1) => rgb(v, v, v, a);

// ---------- shared brushes ----------
function grain(C, s, n, alpha, light, size = 2) {
  for (let i = 0; i < n; i++) { C.fillStyle = light ? rgb(255, 255, 255, rnd() * alpha) : rgb(0, 0, 0, rnd() * alpha); C.fillRect(rnd() * s, rnd() * s, 1 + rnd() * size, 1 + rnd() * size); }
}
function blotch(C, s, n, color, maxR) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, y = rnd() * s, r = maxR * (0.3 + rnd());
    const g = C.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    C.fillStyle = g; C.fillRect(x - r, y - r, r * 2, r * 2);
    // wrap for seamless tiling
    for (const [ox, oy] of [[s, 0], [-s, 0], [0, s], [0, -s]]) if (x + ox - r < s && x + ox + r > 0 && y + oy - r < s && y + oy + r > 0) { C.save(); C.translate(ox, oy); C.fillRect(x - r, y - r, r * 2, r * 2); C.restore(); }
  }
}
function crack(C, H, x, y, len, width, s) {
  let a = rnd() * Math.PI * 2;
  C.strokeStyle = rgb(40, 30, 20, 0.45); H.strokeStyle = gray(40);
  C.lineWidth = H.lineWidth = width;
  C.beginPath(); H.beginPath(); C.moveTo(x, y); H.moveTo(x, y);
  for (let i = 0; i < len; i++) { a += R(-0.6, 0.6); x += Math.cos(a) * s * 0.02; y += Math.sin(a) * s * 0.02; C.lineTo(x, y); H.lineTo(x, y); }
  C.stroke(); H.stroke();
}
function streaks(C, s, n, color) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s, w = R(2, 10) * s / 512, len = R(0.2, 0.8) * s;
    const g = C.createLinearGradient(0, 0, 0, len); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    C.fillStyle = g; C.fillRect(x, 0, w, len);
  }
}
// blocks with mortar: rows of randomized-width blocks, chipped corners, per-block tone
function masonry(C, H, s, { rows, cols, mortar, tone, jitter = 18, bevel = 0.18, chip = 0.35, offset = 0.5 }) {
  C.fillStyle = mortar; C.fillRect(0, 0, s, s);
  H.fillStyle = gray(60); H.fillRect(0, 0, s, s);
  const bh = s / rows, gap = Math.max(2, s / 170);
  for (let r = 0; r < rows; r++) {
    let x = -(r % 2) * (s / cols) * offset - rnd() * 4;
    while (x < s) {
      const bw = (s / cols) * R(0.8, 1.2);
      const [tr, tg, tb] = tone();
      const v = R(-jitter, jitter);
      const draw = (ox) => {
        const x0 = x + ox + gap, y0 = r * bh + gap, w = bw - gap * 2, h = bh - gap * 2;
        C.fillStyle = rgb(tr + v, tg + v, tb + v); C.fillRect(x0, y0, w, h);
        // top light / bottom shade inside the block
        const gr = C.createLinearGradient(0, y0, 0, y0 + h); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
        C.fillStyle = gr; C.fillRect(x0, y0, w, h);
        // height: plateau with bevelled edges
        const bv = Math.min(w, h) * bevel;
        H.fillStyle = gray(150); H.fillRect(x0, y0, w, h);
        H.fillStyle = gray(200); H.fillRect(x0 + bv, y0 + bv, w - bv * 2, h - bv * 2);
        // chipped corners
        if (rnd() < chip) { const cs = R(0.1, 0.3) * h, cx = rnd() < 0.5 ? x0 : x0 + w - cs, cy = rnd() < 0.5 ? y0 : y0 + h - cs; C.fillStyle = mortar; C.fillRect(cx, cy, cs, cs); H.fillStyle = gray(90); H.fillRect(cx, cy, cs, cs); }
      };
      draw(0); if (x + bw > s) draw(-s);
      x += bw;
    }
  }
}

// ---------- painters: (C = color ctx, H = height ctx, s = size) ----------
const PAINT = {
  sand(C, H, s) {
    C.fillStyle = '#c9ab7a'; C.fillRect(0, 0, s, s); H.fillStyle = gray(128); H.fillRect(0, 0, s, s);
    blotch(C, s, 18, 'rgba(150,112,66,0.22)', s * 0.18); blotch(C, s, 14, 'rgba(236,210,160,0.22)', s * 0.14);
    // wind ripples
    for (let y = 0; y < s; y += s / 28) {
      H.strokeStyle = gray(165, 0.5); H.lineWidth = s / 160; H.beginPath();
      for (let x = 0; x <= s; x += 8) H.lineTo(x, y + Math.sin(x / s * Math.PI * 4 + y) * s * 0.012);
      H.stroke();
      C.strokeStyle = rgb(120, 90, 55, 0.07); C.lineWidth = s / 200; C.stroke();
    }
    for (let i = 0; i < 90; i++) { const x = rnd() * s, y = rnd() * s, r = R(1, 4) * s / 512; C.fillStyle = rgb(R(110, 170), R(95, 140), R(70, 100)); C.beginPath(); C.arc(x, y, r, 0, 7); C.fill(); H.fillStyle = gray(220); H.beginPath(); H.arc(x, y, r, 0, 7); H.fill(); }
    grain(C, s, s * 30, 0.14, false); grain(C, s, s * 14, 0.12, true); grain(H, s, s * 20, 0.2, true);
  },
  cobble(C, H, s) {
    // irregular setts: jittered grid of rounded polygons with dark gritty joints
    C.fillStyle = '#5e5244'; C.fillRect(0, 0, s, s); H.fillStyle = gray(50); H.fillRect(0, 0, s, s);
    grain(C, s, s * 20, 0.25, false);
    const n = 8, cs = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const cx = (x + 0.5 + R(-0.12, 0.12)) * cs + (y % 2) * cs * 0.35, cy = (y + 0.5 + R(-0.1, 0.1)) * cs;
      const rw = cs * R(0.40, 0.5), rh = cs * R(0.36, 0.46), k = 5 + Math.floor(rnd() * 3), rot = rnd() * 7;
      const pts = []; for (let j = 0; j < k; j++) { const a = rot + j / k * Math.PI * 2, f = R(0.82, 1.05); pts.push([Math.cos(a) * rw * f, Math.sin(a) * rh * f]); }
      const v = R(135, 190), tint = pickC([[1, 0.9, 0.76], [1, 0.88, 0.8], [0.94, 0.9, 0.84], [1, 0.84, 0.7]]);
      for (const wx of [0, -s, s]) for (const wy of [0, -s, s]) {
        const ox = cx + wx, oy = cy + wy;
        if (ox + rw < 0 || ox - rw > s || oy + rh < 0 || oy - rh > s) continue;
        const path = (c) => { c.beginPath(); for (const [px, py] of pts) c.lineTo(ox + px, oy + py); c.closePath(); };
        path(C); C.fillStyle = rgb(v * tint[0], v * tint[1], v * tint[2]); C.fill();
        const g = C.createLinearGradient(ox, oy - rh, ox, oy + rh); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.16)');
        C.fillStyle = g; C.fill();
        path(H); const hg = H.createRadialGradient(ox, oy, 1, ox, oy, Math.max(rw, rh)); hg.addColorStop(0, gray(225)); hg.addColorStop(0.75, gray(185)); hg.addColorStop(1, gray(90));
        H.fillStyle = hg; H.fill();
      }
    }
    grain(C, s, s * 18, 0.16, false); grain(C, s, s * 8, 0.1, true); blotch(C, s, 14, 'rgba(60,45,30,0.16)', s * 0.18); blotch(C, s, 8, 'rgba(230,210,180,0.12)', s * 0.2);
  },
  concrete(C, H, s) {
    C.fillStyle = '#8d8d87'; C.fillRect(0, 0, s, s); H.fillStyle = gray(150); H.fillRect(0, 0, s, s);
    blotch(C, s, 22, 'rgba(90,90,82,0.16)', s * 0.18); blotch(C, s, 12, 'rgba(205,205,198,0.2)', s * 0.15);
    // slab seams
    C.strokeStyle = rgb(60, 60, 58, 0.45); H.strokeStyle = gray(60); C.lineWidth = H.lineWidth = s / 180;
    for (const p of [0, s / 2]) { C.beginPath(); C.moveTo(p, 0); C.lineTo(p, s); C.moveTo(0, p); C.lineTo(s, p); C.stroke(); H.beginPath(); H.moveTo(p, 0); H.lineTo(p, s); H.moveTo(0, p); H.lineTo(s, p); H.stroke(); }
    for (let i = 0; i < 4; i++) crack(C, H, rnd() * s, rnd() * s, 14, s / 400, s);
    for (let i = 0; i < 260; i++) { const x = rnd() * s, y = rnd() * s, r = R(0.6, 2) * s / 512; H.fillStyle = gray(80); H.beginPath(); H.arc(x, y, r, 0, 7); H.fill(); C.fillStyle = rgb(80, 80, 76, 0.5); C.beginPath(); C.arc(x, y, r, 0, 7); C.fill(); }
    grain(C, s, s * 20, 0.1, false); grain(C, s, s * 10, 0.1, true); grain(H, s, s * 16, 0.15, false);
  },
  asphalt(C, H, s) {
    C.fillStyle = '#48494b'; C.fillRect(0, 0, s, s); H.fillStyle = gray(128); H.fillRect(0, 0, s, s);
    grain(C, s, s * 50, 0.3, true, 1.6); grain(C, s, s * 30, 0.25, false); grain(H, s, s * 50, 0.4, true, 1.6);
    blotch(C, s, 8, 'rgba(20,20,20,0.3)', s * 0.14); blotch(C, s, 5, 'rgba(120,110,95,0.15)', s * 0.2);
    for (let i = 0; i < 3; i++) crack(C, H, rnd() * s, rnd() * s, 20, s / 300, s);
    // tar patch
    C.fillStyle = 'rgba(25,25,27,0.55)'; C.fillRect(s * 0.1, s * 0.62, s * 0.3, s * 0.18);
  },
  tiles(C, H, s) {
    const n = 8, cs = s / n;
    C.fillStyle = '#3a3026'; C.fillRect(0, 0, s, s); H.fillStyle = gray(50); H.fillRect(0, 0, s, s);
    const pal = ['#b9563a', '#d8c7a6', '#2f6f7a', '#d8c7a6'];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const g = s / 256, x0 = x * cs + g, y0 = y * cs + g, w = cs - g * 2;
      const base = pal[(x + y * 2) % 4];
      C.fillStyle = base; C.fillRect(x0, y0, w, w);
      // Moroccan-style inset star
      C.fillStyle = 'rgba(255,255,255,0.14)'; C.beginPath();
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, r = k % 2 ? w * 0.18 : w * 0.38; C.lineTo(x0 + w / 2 + Math.cos(a) * r, y0 + w / 2 + Math.sin(a) * r); }
      C.fill();
      const gr = C.createLinearGradient(x0, y0, x0 + w, y0 + w); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
      C.fillStyle = gr; C.fillRect(x0, y0, w, w);
      H.fillStyle = gray(200); H.fillRect(x0, y0, w, w);
      if (rnd() < 0.1) { C.fillStyle = 'rgba(40,30,20,0.4)'; C.fillRect(x0 + w * 0.6, y0, w * 0.4, w * 0.35); H.fillStyle = gray(120); H.fillRect(x0 + w * 0.6, y0, w * 0.4, w * 0.35); }
    }
    grain(C, s, s * 10, 0.12, false);
  },
  wood(C, H, s) {
    const n = 7, ph = s / n;
    for (let i = 0; i < n; i++) {
      const v = R(105, 150), y0 = i * ph;
      C.fillStyle = rgb(v, v * 0.7, v * 0.44); C.fillRect(0, y0, s, ph);
      H.fillStyle = gray(190); H.fillRect(0, y0, s, ph);
      for (let k = 0; k < 14; k++) { C.strokeStyle = rgb(60, 35, 15, R(0.08, 0.25)); C.lineWidth = R(0.5, 2); C.beginPath(); const yy = y0 + rnd() * ph; C.moveTo(0, yy); C.bezierCurveTo(s * 0.3, yy + R(-4, 4), s * 0.6, yy + R(-4, 4), s, yy); C.stroke(); }
      if (rnd() < 0.6) { const kx = rnd() * s, ky = y0 + ph / 2; C.fillStyle = rgb(70, 40, 20, 0.6); C.beginPath(); C.ellipse(kx, ky, ph * 0.18, ph * 0.1, 0, 0, 7); C.fill(); }
      C.fillStyle = 'rgba(0,0,0,0.5)'; C.fillRect(0, y0, s, s / 256 * 2); H.fillStyle = gray(40); H.fillRect(0, y0, s, s / 256 * 3);
      const joint = rnd() * s; C.fillRect(joint, y0, s / 256 * 2, ph); H.fillRect(joint, y0, s / 256 * 3, ph);
      for (const nx of [joint - s * 0.02, joint + s * 0.02]) for (const ny of [y0 + ph * 0.3, y0 + ph * 0.7]) { C.fillStyle = '#2a2a2a'; C.fillRect(nx, ny, s / 170, s / 170); }
    }
    grain(C, s, s * 10, 0.12, false);
  },
  metal(C, H, s) {
    C.fillStyle = '#6b7075'; C.fillRect(0, 0, s, s); H.fillStyle = gray(100); H.fillRect(0, 0, s, s);
    const n = 16, cs = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const cx = x * cs + cs / 2, cy = y * cs + cs / 2, rot = (x + y) % 2 ? 0.8 : -0.8;
      C.save(); C.translate(cx, cy); C.rotate(rot); C.fillStyle = 'rgba(255,255,255,0.16)'; C.fillRect(-cs * 0.3, -cs * 0.08, cs * 0.6, cs * 0.16); C.restore();
      H.save(); H.translate(cx, cy); H.rotate(rot); H.fillStyle = gray(230); H.fillRect(-cs * 0.3, -cs * 0.08, cs * 0.6, cs * 0.16); H.restore();
    }
    blotch(C, s, 10, 'rgba(120,70,35,0.22)', s * 0.12); grain(C, s, s * 12, 0.12, true);
  },
  sandstone(C, H, s) {
    masonry(C, H, s, { rows: 4, cols: 2.5, mortar: '#b09a74', tone: () => pickC([[222, 196, 150], [212, 184, 138], [228, 206, 162], [200, 176, 132]]), jitter: 14, chip: 0.4 });
    blotch(C, s, 12, 'rgba(130,95,55,0.18)', s * 0.14); streaks(C, s, 6, 'rgba(90,70,45,0.14)');
    grain(C, s, s * 18, 0.12, false); grain(H, s, s * 18, 0.18, false);
  },
  plaster(C, H, s, tint = [226, 211, 180]) {
    C.fillStyle = rgb(...tint); C.fillRect(0, 0, s, s); H.fillStyle = gray(170); H.fillRect(0, 0, s, s);
    blotch(C, s, 20, 'rgba(150,120,80,0.14)', s * 0.18); blotch(C, s, 10, 'rgba(255,246,222,0.2)', s * 0.14);
    streaks(C, s, 8, 'rgba(110,85,55,0.16)');
    // chipped patches revealing brick underneath
    for (let k = 0; k < 1; k++) {
      const px = rnd() * s * 0.75, py = rnd() * s * 0.75, pw = s * R(0.10, 0.16), ph = s * R(0.06, 0.1);
      C.save(); C.beginPath(); C.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, R(-0.3, 0.3), 0, 7); C.clip();
      for (let yy = py; yy < py + ph; yy += s / 40) for (let xx = px - ((yy / (s / 40)) % 2) * s / 40; xx < px + pw; xx += s / 20) { C.fillStyle = rgb(R(150, 175), R(100, 120), R(75, 90)); C.fillRect(xx + 1, yy + 1, s / 20 - 2, s / 40 - 2); }
      C.restore();
      H.fillStyle = gray(90); H.beginPath(); H.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, 7); H.fill();
    }
    for (let i = 0; i < 3; i++) crack(C, H, rnd() * s, rnd() * s, 10, s / 500, s);
    grain(C, s, s * 12, 0.08, false); grain(H, s, s * 30, 0.2, true);
  },
  plaster_pink(C, H, s) { PAINT.plaster(C, H, s, [228, 194, 168]); },
  stone(C, H, s) {
    masonry(C, H, s, { rows: 3, cols: 1.6, mortar: '#8a7c62', tone: () => pickC([[190, 175, 145], [176, 162, 134], [200, 186, 156]]), jitter: 16, chip: 0.5, bevel: 0.12 });
    blotch(C, s, 10, 'rgba(90,80,60,0.18)', s * 0.14); grain(C, s, s * 18, 0.14, false); grain(H, s, s * 24, 0.25, false);
  },
  brick(C, H, s) {
    masonry(C, H, s, { rows: 16, cols: 4, mortar: '#8d8378', tone: () => pickC([[150, 70, 52], [132, 60, 46], [165, 82, 60], [118, 58, 48]]), jitter: 12, chip: 0.2, bevel: 0.25 });
    streaks(C, s, 5, 'rgba(40,30,25,0.18)'); grain(C, s, s * 14, 0.14, false);
  },
  basecourse(C, H, s) {
    masonry(C, H, s, { rows: 2, cols: 3, mortar: '#6f6554', tone: () => pickC([[150, 138, 112], [138, 126, 102], [162, 148, 120]]), jitter: 14, chip: 0.6, bevel: 0.1 });
    blotch(C, s, 10, 'rgba(50,40,30,0.25)', s * 0.18); grain(C, s, s * 20, 0.18, false); grain(H, s, s * 30, 0.3, false);
  },
  corrugated(C, H, s) {
    const rib = s / 32;
    for (let x = 0; x < s; x += rib) {
      const g = C.createLinearGradient(x, 0, x + rib, 0); g.addColorStop(0, '#80868c'); g.addColorStop(0.5, '#c4c9ce'); g.addColorStop(1, '#747a80');
      C.fillStyle = g; C.fillRect(x, 0, rib, s);
      const hg = H.createLinearGradient(x, 0, x + rib, 0); hg.addColorStop(0, gray(40)); hg.addColorStop(0.5, gray(230)); hg.addColorStop(1, gray(40));
      H.fillStyle = hg; H.fillRect(x, 0, rib, s);
    }
    streaks(C, s, 10, 'rgba(140,75,35,0.28)'); blotch(C, s, 8, 'rgba(120,70,40,0.2)', s * 0.12);
    C.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = s * 0.25; y < s; y += s / 2) for (let x = rib / 2; x < s; x += rib * 2) C.fillRect(x, y, s / 256 * 3, s / 256 * 3);
  },
  panel(C, H, s) {
    C.fillStyle = '#c9ccc9'; C.fillRect(0, 0, s, s); H.fillStyle = gray(170); H.fillRect(0, 0, s, s);
    C.fillStyle = '#b3b7b4'; C.fillRect(0, s * 0.55, s, s * 0.45);
    C.fillStyle = '#3f6f8f'; C.fillRect(0, s * 0.5, s, s * 0.05); H.fillStyle = gray(200); H.fillRect(0, s * 0.5, s, s * 0.05);
    C.strokeStyle = 'rgba(40,40,40,0.4)'; H.strokeStyle = gray(60); C.lineWidth = H.lineWidth = s / 200;
    for (const x0 of [0, s / 2]) { C.strokeRect(x0 + 2, 2, s / 2 - 4, s - 4); H.strokeRect(x0 + 2, 2, s / 2 - 4, s - 4); }
    for (const [x, y] of [[10, 10], [s / 2 - 10, 10], [10, s - 10], [s / 2 - 10, s - 10]]) for (const ox of [0, s / 2]) {
      C.fillStyle = 'rgba(40,40,40,0.6)'; C.beginPath(); C.arc(x + ox, y, s / 170, 0, 7); C.fill(); H.fillStyle = gray(255); H.beginPath(); H.arc(x + ox, y, s / 170, 0, 7); H.fill();
    }
    streaks(C, s, 8, 'rgba(90,90,80,0.14)'); blotch(C, s, 8, 'rgba(90,90,80,0.12)', s * 0.12);
  },
  crate(C, H, s) {
    C.fillStyle = '#9b6a3a'; C.fillRect(0, 0, s, s); H.fillStyle = gray(150); H.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) { const v = R(130, 175); C.fillStyle = rgb(v, v * 0.68, v * 0.4); C.fillRect(0, i * s / 6, s, s / 6 - 2); C.fillStyle = 'rgba(40,20,5,0.6)'; C.fillRect(0, (i + 1) * s / 6 - 2, s, 2); H.fillStyle = gray(60); H.fillRect(0, (i + 1) * s / 6 - 3, s, 3); }
    for (let k = 0; k < 30; k++) { C.strokeStyle = rgb(70, 40, 15, 0.2); C.beginPath(); const y = rnd() * s; C.moveTo(0, y); C.lineTo(s, y + R(-3, 3)); C.stroke(); }
    const f = s * 0.09;
    C.fillStyle = '#6a4522'; H.fillStyle = gray(235);
    for (const [x, y, w, h] of [[0, 0, s, f], [0, s - f, s, f], [0, 0, f, s], [s - f, 0, f, s]]) { C.fillRect(x, y, w, h); H.fillRect(x, y, w, h); }
    C.save(); C.translate(s / 2, s / 2); C.rotate(Math.PI / 4); C.fillRect(-s * 0.62, -f * 0.45, s * 1.24, f * 0.9); C.restore();
    H.save(); H.translate(s / 2, s / 2); H.rotate(Math.PI / 4); H.fillRect(-s * 0.62, -f * 0.45, s * 1.24, f * 0.9); H.restore();
    C.fillStyle = '#2d2d2d'; for (const [x, y] of [[f / 2, f / 2], [s - f / 2, f / 2], [f / 2, s - f / 2], [s - f / 2, s - f / 2]]) { C.beginPath(); C.arc(x, y, s / 100, 0, 7); C.fill(); }
    C.fillStyle = 'rgba(25,15,5,0.55)'; C.font = `bold ${s * 0.085}px monospace`; C.textAlign = 'center'; C.fillText('FRAGILE', s * 0.5, s * 0.3); C.fillText('↑ THIS SIDE UP ↑', s * 0.5, s * 0.78);
    grain(C, s, s * 8, 0.15, false); blotch(C, s, 6, 'rgba(50,30,10,0.18)', s * 0.12);
  },
  container(C, H, s) {
    const rib = s / 20;
    C.fillStyle = '#d4d4d4'; C.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += rib) {
      C.fillStyle = 'rgba(0,0,0,0.18)'; C.fillRect(x, 0, rib * 0.35, s); C.fillStyle = 'rgba(255,255,255,0.14)'; C.fillRect(x + rib * 0.5, 0, rib * 0.3, s);
      const hg = H.createLinearGradient(x, 0, x + rib, 0); hg.addColorStop(0, gray(70)); hg.addColorStop(0.25, gray(70)); hg.addColorStop(0.45, gray(210)); hg.addColorStop(0.9, gray(210)); hg.addColorStop(1, gray(70));
      H.fillStyle = hg; H.fillRect(x, 0, rib, s);
    }
    C.fillStyle = 'rgba(0,0,0,0.3)'; C.fillRect(0, 0, s, s * 0.03); C.fillRect(0, s * 0.97, s, s * 0.03);
    streaks(C, s, 12, 'rgba(120,60,25,0.3)'); blotch(C, s, 10, 'rgba(120,70,40,0.22)', s * 0.1);
    C.fillStyle = 'rgba(255,255,255,0.75)'; C.font = `bold ${s * 0.07}px sans-serif`; C.fillText('CAM LINES', s * 0.08, s * 0.2);
    C.font = `${s * 0.045}px monospace`; C.fillText('CAMU 204871 3', s * 0.08, s * 0.28); C.fillText('45G1', s * 0.08, s * 0.34);
    grain(C, s, s * 10, 0.12, false);
  },
  ceiling(C, H, s) {
    C.fillStyle = '#b8b0a2'; C.fillRect(0, 0, s, s); H.fillStyle = gray(160); H.fillRect(0, 0, s, s);
    C.fillStyle = '#8f877a'; H.fillStyle = gray(230);
    for (let i = 0; i < 4; i++) { C.fillRect(0, i * s / 4, s, s / 32); H.fillRect(0, i * s / 4, s, s / 32); }
    blotch(C, s, 10, 'rgba(90,80,60,0.18)', s * 0.14); grain(C, s, s * 14, 0.12, false);
  },
};

// UVs are laid out at one repeat per 2m; these stretch to one per 4m so large patterns don't visibly tile
const WIDE = { plaster: 0.5, plaster_pink: 0.5, concrete: 0.5, sand: 0.5, asphalt: 0.5 };

// Returns the color texture for `name`, or its bump map for `name:bump`
export function tex(name, quality = 'medium') {
  const size = quality === 'low' ? 256 : 512;
  const key = `${name}@${size}`;
  if (cache.has(key)) return cache.get(key);
  const isBump = name.endsWith(':bump');
  const base = isBump ? name.slice(0, -5) : name;
  const painter = PAINT[base] || PAINT.concrete;
  seed = 7 + base.length * 131 + base.charCodeAt(0);
  const c = canvas(size), h = canvas(size);
  painter(c.getContext('2d'), h.getContext('2d'), size);
  const an = quality === 'high' ? 8 : 4, ct = toTex(c, true, true, an), ht = toTex(h, false, true, an), rep = WIDE[base] || 1;
  ct.repeat.set(rep, rep); ht.repeat.set(rep, rep);
  cache.set(`${base}@${size}`, ct);
  cache.set(`${base}:bump@${size}`, ht);
  return cache.get(key);
}

// ---------- non-tiling textures ----------
function make(size, draw, repeat = true) {
  const c = canvas(size);
  seed = 1 + size;
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
