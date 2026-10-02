// Dev tool: runs the bots' map analysis (js/botnav.js) on every map, prints what it found and how long
// it took, and renders a top-down PNG per map with the analysis drawn on it:
//   orange/red lines = T routes, blue = CT routes, big rings = mouths (with an arrow for the way in),
//   green = rifle holds, purple = sniper holds, cyan = close holds, white = anchors (lines go to the mouth),
//   yellow squares = T staging (+ slots), red crosses = plant spots.
//   node tools/botnavcheck.mjs [outDir] [mapId,...] [--lineups]
import fs from 'fs';
import zlib from 'zlib';
import { MAPS } from '../js/maps/index.js';
import { setMap, MAT } from '../js/world.js';
import { getNav, routeUtilityJob, finishJob, watchSpots } from '../js/botnav.js';
import { simulateThrow } from '../js/nadephys.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const outDir = args[0] || '.';
const only = args[1] ? args[1].split(',') : null;
const S = flags.has('--big') ? 12 : 6;

function png(w, h, rgb) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const def of Object.values(MAPS)) {
  if (only && !only.includes(def.id)) continue;
  setMap(def);
  const nav = getNav(def);
  console.log(`\n== ${def.id}: analysis ${nav.ms.toFixed(0)} ms`, Object.entries(nav.timing).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '));
  const W = def.w * S, H = def.h * S, img = Buffer.alloc(W * H * 3);
  const px = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; img[i] = c >> 16; img[i + 1] = (c >> 8) & 255; img[i + 2] = c & 255; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(x, y, c); };
  const dot = (p, c, r = 3) => rect(Math.round(p.x * S) - r, Math.round(p.z * S) - r, Math.round(p.x * S) + r + 1, Math.round(p.z * S) + r + 1, c);
  const line = (a, b, c, thick = 0) => {
    const x0 = a.x * S, y0 = a.z * S, x1 = b.x * S, y1 = b.z * S, n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let k = 0; k <= n; k++) { const t = n ? k / n : 0, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t); if (thick) rect(x - thick, y - thick, x + thick + 1, y + thick + 1, c); else px(x, y, c); }
  };
  const ring = (p, r, c) => { for (let a = 0; a < 6.283; a += 0.02) px(Math.round(p.x * S + Math.cos(a) * r), Math.round(p.z * S + Math.sin(a) * r), c); };
  const cross = (p, c, r = 5) => { for (let k = -r; k <= r; k++) { rect(Math.round(p.x * S) + k, Math.round(p.z * S) + k, Math.round(p.x * S) + k + 2, Math.round(p.z * S) + k + 2, c); rect(Math.round(p.x * S) + k, Math.round(p.z * S) - k, Math.round(p.x * S) + k + 2, Math.round(p.z * S) - k + 2, c); } };
  // base: walls dark, floors shaded by height, obstacle tops tinted, clearance faintly
  for (let z = 0; z < def.h; z++) for (let x = 0; x < def.w; x++) {
    const i = z * def.w + x;
    let c;
    if (def.solid[i]) c = 0x1c1c1c;
    else {
      const hgt = def.height[i], m = def.mat[i];
      if (m === MAT.CRATE || m === MAT.CONTAINER) c = 0x7a6040;
      else if (m === MAT.HIDDEN) c = 0x804040;
      else if (m === MAT.LOWWALL) c = 0x707060;
      else { const v = Math.min(230, 120 + Math.round(hgt * 25)); c = (v << 16) | (v << 8) | Math.round(v * 0.85); }
      if (def.roof[i] > 0) c = (((c >> 16) * 0.75) << 16) | ((((c >> 8) & 255) * 0.75) << 8) | ((c & 255) * 0.9);
    }
    rect(x * S, z * S, x * S + S, z * S + S, c);
  }
  for (const [k, Z] of Object.entries(def.zones)) {
    const c = { A: 0xff3030, B: 0xff3030, T: 0xffa020, CT: 0x3080ff }[k] || 0xffffff;
    for (let x = Z.x0 * S; x < (Z.x1 + 1) * S; x++) { px(x, Z.z0 * S, c); px(x, (Z.z1 + 1) * S - 1, c); }
    for (let y = Z.z0 * S; y < (Z.z1 + 1) * S; y++) { px(Z.x0 * S, y, c); px((Z.x1 + 1) * S - 1, y, c); }
  }
  const pt = (i) => ({ x: (i % def.w) + 0.5, z: Math.floor(i / def.w) + 0.5 });
  const tCol = [0xff8000, 0xff3060, 0xffd000, 0xc06000], ctCol = [0x2060ff, 0x00b0ff, 0x6040ff, 0x0080a0];
  for (const site of Object.values(nav.sites)) {
    site.ctRoutes.forEach((r, k) => { for (let j = 1; j < r.cells.length; j++) line(pt(r.cells[j - 1]), pt(r.cells[j]), ctCol[k % 4], 0); });
    site.tRoutes.forEach((r, k) => { for (let j = 1; j < r.cells.length; j++) line(pt(r.cells[j - 1]), pt(r.cells[j]), tCol[k % 4], 1); });
  }
  for (const site of Object.values(nav.sites)) {
    for (const m of site.mouths) {
      for (const [style, col] of [['rifle', 0x20d040], ['sniper', 0xb040ff], ['close', 0x00e0e0]]) {
        for (const h of m.holds[style]) { line(h, m, col & 0x7f7f7f); dot(h, col, 3); if (h.coverPt) dot(h.coverPt, 0x404040, 1); }
      }
      ring(m, 14, 0xff00ff); ring(m, 15, 0xff00ff);
      line(m, { x: m.x + m.dir.x * 5, z: m.z + m.dir.z * 5 }, 0xff00ff, 1);
    }
    for (const m of site.ctMouths) { ring(m, 10, 0x0000ff); line(m, { x: m.x + m.dir.x * 4, z: m.z + m.dir.z * 4 }, 0x0000ff, 1); }
    for (const a of site.anchors) { dot(a, 0xffffff, 4); for (const l of a.looks) line(a, l, 0xffffff); }
    for (const r of site.tRoutes) { const st = r.stage; dot(st, st.exposed ? 0xff0000 : 0xffff00, 5); for (const s of st.slots) dot(s, 0xffff80, 2); }
    for (const p of site.plants) cross(p, 0xff0000);
    console.log(` site ${site.key}: center (${site.center.x.toFixed(0)},${site.center.z.toFixed(0)})`);
    for (const r of site.tRoutes) console.log(`   T  ${r.id} via ${r.name.padEnd(16)} len ${r.len.toFixed(0).padStart(3)} m  mouth ${r.mouth.name} (${r.mouth.x},${r.mouth.z}) width ${r.mouth.width.toFixed(1)}  stage ${r.stage.s} m back${r.stage.exposed ? ' EXPOSED' : ''} slots ${r.stage.slots.length}`);
    for (const r of site.ctRoutes) console.log(`   CT ${r.id} via ${r.name.padEnd(16)} len ${r.len.toFixed(0).padStart(3)} m  mouth ${r.mouth.name} (${r.mouth.x},${r.mouth.z})`);
    for (const m of site.mouths) console.log(`   mouth ${m.id} ${m.name}: holds rifle ${m.holds.rifle.length} sniper ${m.holds.sniper.length} close ${m.holds.close.length}; best ${m.holds.rifle.slice(0, 3).map((h) => `(${h.x},${h.z}) ${h.score} d${h.d} c${h.cover} e${h.exposure}`).join(' | ')}`);
    console.log(`   anchors ${site.anchors.length}, plants ${site.plants.map((p) => `(${p.x},${p.z}) seen${p.seen}`).join(' ')}`);
    if (flags.has('--lineups')) {
      for (const r of site.tRoutes) {
        const t0 = performance.now(), job = routeUtilityJob(nav, r);
        let steps = 0, worst = 0, t = performance.now();
        for (let st = job.next(); !st.done; st = job.next()) { steps++; worst = Math.max(worst, performance.now() - t); t = performance.now(); }
        const u = r.util, desc = (x) => (x ? `err ${x.sol.err.toFixed(1)} spr ${x.sol.spread.toFixed(1)} p${x.sol.power}` : '-');
        console.log(`   util ${r.id}: smokes ${u.smokes.map(desc).join(', ') || '-'} | flash ${desc(u.flash)} | molly ${desc(u.molly)}  (${(performance.now() - t0).toFixed(0)} ms, ${steps} steps, worst ${worst.toFixed(1)} ms)`);
        for (const x of [...u.smokes, u.flash, u.molly]) {
          if (!x) continue;
          const col = x.type === 'smoke' ? 0xffffff : x.type === 'flash' ? 0x00ffff : 0xff6000;
          const tr = [];
          simulateThrow(x.type, x.from.x, x.from.y + 1.62, x.from.z, x.sol.yaw, x.sol.pitch, x.sol.power, 0, 0, 1 / 60, tr);
          for (let k = 1; k < tr.length; k++) line({ x: tr[k - 1][0], z: tr[k - 1][2] }, { x: tr[k][0], z: tr[k][2] }, col);
          ring(x.sol.land, x.type === 'smoke' ? 4.2 * S : 1.5 * S, col);
        }
      }
      const P = site.plants[0];
      if (P) for (const w of watchSpots(nav, site.key, { x: P.x, y: P.y, z: P.z }, 5)) { dot(w, 0xff80ff, 4); line(w, P, 0xff80ff); }
    }
  }
  fs.writeFileSync(`${outDir}/nav-${def.id}.png`, png(W, H, img));
  // close-ups of each site (and its approaches)
  for (const site of Object.values(nav.sites)) {
    const Z = def.zones[site.key], pad = 22;
    const x0 = Math.max(0, (Z.x0 - pad) * S), z0 = Math.max(0, (Z.z0 - pad) * S), x1 = Math.min(W, (Z.x1 + 1 + pad) * S), z1 = Math.min(H, (Z.z1 + 1 + pad) * S);
    const cw = x1 - x0, ch = z1 - z0, crop = Buffer.alloc(cw * ch * 3);
    for (let y = 0; y < ch; y++) img.copy(crop, y * cw * 3, ((z0 + y) * W + x0) * 3, ((z0 + y) * W + x1) * 3);
    fs.writeFileSync(`${outDir}/nav-${def.id}-${site.key}.png`, png(cw, ch, crop));
  }
}
