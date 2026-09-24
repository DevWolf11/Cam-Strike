// Dev tool: validates every map (paths between spawns, sites and tactic points) and renders
// a top-down PNG of each so layouts can be eyeballed without launching the game.
//   node tools/mapcheck.mjs [outDir]
import fs from 'fs';
import zlib from 'zlib';
import { MAPS } from '../js/maps/index.js';
import { setMap, findPath, spawnPoints, world, MAT } from '../js/world.js';

const outDir = process.argv[2] || '.';
const S = 6; // pixels per cell

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

let failures = 0;
for (const def of Object.values(MAPS)) {
  setMap(def);
  const W = def.w * S, H = def.h * S, img = Buffer.alloc(W * H * 3);
  const px = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; img[i] = c >> 16; img[i + 1] = (c >> 8) & 255; img[i + 2] = c & 255; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(x, y, c); };
  const dot = (p, c, r = 3) => rect(Math.round(p.x * S) - r, Math.round(p.z * S) - r, Math.round(p.x * S) + r, Math.round(p.z * S) + r, c);
  for (let z = 0; z < def.h; z++) for (let x = 0; x < def.w; x++) {
    const i = z * def.w + x;
    let c;
    if (def.solid[i]) c = [0x202020, 0x383028, 0x2a3036, 0x303a44, 0x3a2820][def.wallMat[i]] ?? 0x202020;
    else {
      const hgt = def.height[i], m = def.mat[i];
      if (m === MAT.CRATE) c = 0x9b6a3a;
      else if (m === MAT.CONTAINER) c = def.color.get(i) ?? 0x3a6ea5;
      else if (m === MAT.HIDDEN) c = 0xc03030;
      else if (m === MAT.LOWWALL) c = 0x8a8070;
      else { const v = Math.min(255, 150 + Math.round(hgt * 30)); c = (v << 16) | (Math.round(v * 0.9) << 8) | Math.round(v * 0.7); }
      if (def.roof[i] > 0) c = ((c >> 16) * 0.7 << 16) | (((c >> 8) & 255) * 0.75 << 8) | ((c & 255) * 0.95);
    }
    rect(x * S, z * S, x * S + S, z * S + S, c);
  }
  for (const [k, Z] of Object.entries(def.zones)) {
    const c = { A: 0xff3030, B: 0xff3030, T: 0xffa020, CT: 0x3080ff }[k] || 0xffffff;
    for (let x = Z.x0 * S; x < (Z.x1 + 1) * S; x++) { px(x, Z.z0 * S, c); px(x, (Z.z1 + 1) * S - 1, c); }
    for (let y = Z.z0 * S; y < (Z.z1 + 1) * S; y++) { px(Z.x0 * S, y, c); px((Z.x1 + 1) * S - 1, y, c); }
  }
  const t = def.tactics;
  const spT = spawnPoints('T', 10), spCT = spawnPoints('CT', 10);
  spT.forEach((p) => dot(p, 0xffa020, 2)); spCT.forEach((p) => dot(p, 0x3080ff, 2));
  for (const h of t.ctHolds) { dot(h.pos, 0x0040ff); dot(h.watch, 0x80c0ff, 2); }
  for (const s of ['A', 'B']) { t.tRoutes[s].forEach((p) => dot(p, 0xff8000)); t.plantSpots[s].forEach((p) => dot(p, 0xff0000)); t.entrances[s].forEach((p) => dot(p, 0xffff00, 2)); (t.smokes?.[s] || []).forEach((p) => dot(p, 0xffffff, 2)); }
  fs.writeFileSync(`${outDir}/map-${def.id}.png`, png(W, H, img));

  // ---- reachability ----
  const check = (label, a, b) => {
    const p = findPath(a, b);
    if (!p) { failures++; console.log(`  FAIL ${def.id}: no path ${label} (${a.x.toFixed(1)},${a.z.toFixed(1)} -> ${b.x.toFixed(1)},${b.z.toFixed(1)})`); }
  };
  const t0 = spT[0], c0 = spCT[0];
  for (const s of ['A', 'B']) {
    t.plantSpots[s].forEach((p, i) => { check(`T->plant ${s}${i}`, t0, p); check(`CT->plant ${s}${i}`, c0, p); });
    t.tRoutes[s].forEach((p, i) => { check(`T->route ${s}${i}`, t0, p); check(`route ${s}${i}->site`, p, t.plantSpots[s][0]); });
    t.entrances[s].forEach((p, i) => check(`CT->entrance ${s}${i}`, c0, p));
  }
  t.ctHolds.forEach((h, i) => check(`CT->hold ${i} (${h.site})`, c0, h.pos));
  // Every walkable cell should be reachable from T spawn in some way (report stragglers)
  let walk = 0, unreachable = 0;
  const seen = new Uint8Array(def.w * def.h), q = [Math.floor(t0.z) * def.w + Math.floor(t0.x)];
  seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop(), x = c % def.w, z = (c / def.w) | 0, hh = def.height[c];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, ni = nz * def.w + nx;
      if (nx < 0 || nz < 0 || nx >= def.w || nz >= def.h || seen[ni] || def.solid[ni]) continue;
      if (def.height[ni] - hh > 0.45) continue; // can always drop down, can't climb
      seen[ni] = 1; q.push(ni);
    }
  }
  for (let i = 0; i < def.w * def.h; i++) if (!def.solid[i] && def.mat[i] !== MAT.HIDDEN && def.mat[i] !== MAT.CRATE && def.mat[i] !== MAT.CONTAINER && def.mat[i] !== MAT.LOWWALL) { walk++; if (!seen[i]) unreachable++; }
  console.log(`${def.id}: ${def.w}x${def.h}, walkable ${walk} cells, unreachable ${unreachable}, spawns T ${spT.length} CT ${spCT.length}`);
}
console.log(failures ? `${failures} path failures` : 'all paths OK');
process.exit(failures ? 1 : 0);
