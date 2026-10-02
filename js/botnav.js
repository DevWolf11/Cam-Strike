// Bot map analysis. Everything the bots know about a map is computed from its grid the first time the map
// is played, so a new map gets it for free:
//   - walking distances from each spawn, and the edge clearance of every cell (how open it is);
//   - the distinct routes each side takes to each bombsite, and the chokepoint ("mouth") where a route
//     enters its site;
//   - the spots CTs hold each mouth from, scored for cover, distance, angle and exposure to other entrances;
//   - where Ts stage out of sight before an execute, where to plant, where to play the post-plant;
//   - grenade lineups, found by simulating the game's real throw (nadephys.js).
// Pure logic (no three.js) so tools can run it in node: setMap(def) first, then getNav(def).

import { world, MAT, STEP, DROP, clearLine } from './world.js';
import { simulateThrow } from './nadephys.js';
import { PLAYER } from './config.js';

export const EYE = PLAYER.eyeHeight, CROUCH_EYE = PLAYER.crouchEye, CHEST = 1.15, HEAD = PLAYER.headY;
const SQ2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const DC = [1, 1, 1, 1, SQ2, SQ2, SQ2, SQ2];
const OPP = [1, 0, 3, 2, 7, 6, 5, 4];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const DEBUG = typeof process !== 'undefined' && !!process.env?.NAVDEBUG;

// ---------------------------------------------------------------- grid + search primitives
let G = null;          // { w, h, n, height, solid, mat, moves, steps, clear }

function buildGrid() {
  const w = world.w, h = world.h, n = w * h, height = world.height, solid = world.solid, mat = world.map.mat;
  const moves = new Uint8Array(n), steps = new Uint8Array(n);
  const okStep = (hh, x, z) => x >= 0 && z >= 0 && x < w && z < h && !solid[z * w + x] && Math.abs(height[z * w + x] - hh) <= STEP;
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = z * w + x;
    if (solid[i]) continue;
    const hh = height[i];
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], nz = z + DZ[k];
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const j = nz * w + nx;
      if (solid[j]) continue;
      const d = height[j] - hh;
      if (Math.abs(d) <= STEP) steps[i] |= 1 << k;
      // the world's movement rule (findPath): climb <= STEP, drop <= DROP, diagonals need both sides steppable
      if (d > STEP || d < -DROP) continue;
      if (k >= 4 && (!okStep(hh, x + DX[k], z) || !okStep(hh, x, z + DZ[k]))) continue;
      moves[i] |= 1 << k;
    }
  }
  return { w, h, n, height, solid, mat, moves, steps, clear: null };
}

class Heap {
  constructor(cap = 1 << 15) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; this.top = 0; }
  push(key, val) {
    if (this.n === this.k.length) {
      const k = new Float64Array(this.n * 2), v = new Int32Array(this.n * 2);
      k.set(this.k); v.set(this.v); this.k = k; this.v = v;
    }
    const K = this.k, V = this.v;
    let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = key; V[i] = val;
  }
  pop() {
    const K = this.k, V = this.v, top = V[0];
    this.top = K[0];
    const n = --this.n;
    if (n > 0) {
      const key = K[n], val = V[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && K[c + 1] < K[c]) c++;
        if (K[c] >= key) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = key; V[i] = val;
    }
    return top;
  }
}
const HEAP = new Heap();

// Walking distance (m) from the source cells to every cell (reverse: from every cell to the sources).
// mult scales the cost of entering a cell, block (mask) makes cells impassable, prev records the tree,
// stop (mask) ends the search at the first such cell reached (its index lands in G.stopCell).
function dijkstra(sources, { reverse = false, mult = null, block = null, prev = null, stop = null, out = null, limit = Infinity } = {}) {
  const { w, h, n, moves } = G;
  const dist = out || new Float64Array(n);
  dist.fill(Infinity);
  if (prev) prev.fill(-1);
  const hp = HEAP;
  hp.n = 0; G.stopCell = -1;
  for (const s of sources) if (dist[s] !== 0 && !(block && block[s])) { dist[s] = 0; hp.push(0, s); }
  while (hp.n) {
    const i = hp.pop(), d = hp.top;
    if (d > dist[i]) continue;
    if (stop && stop[i]) { G.stopCell = i; break; }
    if (d > limit) break;
    const x = i % w, z = (i / w) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k], nz = z + DZ[k];
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const j = nz * w + nx;
      if (reverse ? !(moves[j] & (1 << OPP[k])) : !(moves[i] & (1 << k))) continue;
      if (block && block[j]) continue;
      const c = d + DC[k] * (mult ? 0.5 * (mult[i] + mult[j]) : 1);
      if (c < dist[j]) { dist[j] = c; if (prev) prev[j] = i; hp.push(c, j); }
    }
  }
  return dist;
}

// Distance from each walkable cell to the nearest wall or ledge (anything you can't just step onto)
function clearanceField() {
  const { w, h, n, solid, steps } = G;
  const clear = new Float64Array(n);
  const hp = HEAP;
  hp.n = 0;
  for (let i = 0; i < n; i++) {
    if (solid[i]) { clear[i] = 0; continue; }
    if (steps[i] !== 255) { clear[i] = 0.5; hp.push(0.5, i); } else clear[i] = Infinity;
  }
  while (hp.n) {
    const i = hp.pop(), d = hp.top;
    if (d > clear[i]) continue;
    const x = i % w, z = (i / w) | 0;
    for (let k = 0; k < 8; k++) {
      if (!(steps[i] & (1 << k))) continue;
      const j = (z + DZ[k]) * w + x + DX[k], c = d + DC[k];
      if (c < clear[j]) { clear[j] = c; hp.push(c, j); }
    }
  }
  return clear;
}

const cx = (i) => (i % G.w) + 0.5, cz = (i) => ((i / G.w) | 0) + 0.5;
const cellAt = (x, z) => {
  const ix = Math.floor(x), iz = Math.floor(z);
  return ix < 0 || iz < 0 || ix >= G.w || iz >= G.h ? -1 : iz * G.w + ix;
};
const floorOf = (i) => G.height[i];
const OBST = new Set([MAT.CRATE, MAT.CONTAINER, MAT.HIDDEN, MAT.LOWWALL]);
// somewhere a player would stand: not inside a wall, not on top of a prop or a low wall
const standable = (i) => i >= 0 && !G.solid[i] && G.mat[i] !== MAT.HIDDEN && G.mat[i] !== MAT.LOWWALL;
const openish = (i) => standable(i) && !OBST.has(G.mat[i]);

function zoneCells(Z) {
  const out = [];
  for (let z = Z.z0; z <= Z.z1; z++) for (let x = Z.x0; x <= Z.x1; x++) {
    if (x < 0 || z < 0 || x >= G.w || z >= G.h) continue;
    const i = z * G.w + x;
    if (!G.solid[i] && G.moves[i]) out.push(i);
  }
  return out;
}

// The smallest callout containing a point (callouts nest: "B Car" inside "B Site")
export function calloutName(x, z, map = world.map) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let best = null, area = Infinity;
  for (const c of map.callouts || []) {
    if (ix < c.x0 || ix > c.x1 || iz < c.z0 || iz > c.z1) continue;
    const a = (c.x1 - c.x0 + 1) * (c.z1 - c.z0 + 1);
    if (a < area) { area = a; best = c; }
  }
  return best ? best.name : null;
}

// Which cells can see a point: eye height above each cell's floor -> (px, py, pz)
function visField(px, py, pz, R, eyeH) {
  const { w, h, n, solid, height, moves } = G;
  const out = new Uint8Array(n);
  const x0 = Math.max(0, Math.floor(px - R)), x1 = Math.min(w - 1, Math.floor(px + R));
  const z0 = Math.max(0, Math.floor(pz - R)), z1 = Math.min(h - 1, Math.floor(pz + R)), R2 = R * R;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const i = z * w + x;
    if (solid[i] || !moves[i]) continue;
    const ex = x + 0.5, ez = z + 0.5;
    if ((ex - px) ** 2 + (ez - pz) ** 2 > R2) continue;
    if (clearLine(ex, height[i] + eyeH, ez, px, py, pz)) out[i] = 1;
  }
  return out;
}

// ---------------------------------------------------------------- routes
function trace(prev, end) {
  const out = [];
  for (let c = end; c !== -1; c = prev[c]) out.push(c);
  return out.reverse();
}

function mainCallout(cells, cum, from, to, skip) {
  const tally = new Map();
  for (let k = 1; k < cells.length; k++) {
    if (cum[k] < from || cum[k] > to) continue;
    const name = calloutName(cx(cells[k]), cz(cells[k]));
    if (!name || skip(name)) continue;
    tally.set(name, (tally.get(name) || 0) + cum[k] - cum[k - 1]);
  }
  let best = null, bl = 0;
  for (const [k, v] of tally) if (v > bl) { bl = v; best = k; }
  return best;
}

// Wall-to-wall width of the corridor through (x, z) across direction (dx, dz). Props and crates don't
// close a corridor (you walk round them); walls and ledges do.
function corridorWidth(x, z, dx, dz, max = 20) {
  const px = -dz, pz = dx, i0 = cellAt(x, z);
  let total = 0;
  for (const side of [1, -1]) {
    let ref = floorOf(i0), s = 0.5;
    for (; s <= max; s += 0.5) {
      const j = cellAt(x + px * s * side, z + pz * s * side);
      if (j < 0 || G.solid[j]) break;
      if (OBST.has(G.mat[j])) continue;
      if (Math.abs(floorOf(j) - ref) > STEP) break;
      ref = floorOf(j);
    }
    total += s - 0.5;
  }
  return total + 1;
}

function routeDir(cells, k, span = 4) {
  const a = cells[Math.max(0, k - span)], b = cells[Math.min(cells.length - 1, k + span)];
  let dx = cx(b) - cx(a), dz = cz(b) - cz(a);
  const dl = Math.hypot(dx, dz) || 1;
  return { x: dx / dl, z: dz / dl };
}

function makeRoute(cells, team, site) {
  const n = cells.length, cum = new Float32Array(n), width = new Float32Array(n);
  for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + Math.hypot(cx(cells[k]) - cx(cells[k - 1]), cz(cells[k]) - cz(cells[k - 1]));
  for (let k = 0; k < n; k++) { const d = routeDir(cells, k); width[k] = corridorWidth(cx(cells[k]), cz(cells[k]), d.x, d.z); }
  const entry = n - 1, len = cum[entry];
  // the mouth: the narrowest point in the last 18 m before the site (the closest one on ties)
  let mi = entry, mw = Infinity;
  for (let k = entry; k >= 0 && len - cum[k] <= 18; k--) if (width[k] < mw - 0.75) { mw = width[k]; mi = k; }
  if (mw > 10) { mi = entry; while (mi > 0 && len - cum[mi] < 2) mi--; }
  const dir = routeDir(cells, mi), m = cells[mi];
  const siteName = site + ' Site';
  const name = mainCallout(cells, cum, 12, len - 4, (s) => /spawn/i.test(s) || s === siteName) || calloutName(cx(m), cz(m)) || '?';
  return {
    team, site, cells, cum, width, len, entry, name,
    mouth: { i: m, k: mi, x: cx(m), z: cz(m), y: floorOf(m), dir, width: mw, clear: G.clear[m], name: calloutName(cx(m), cz(m)) || name },
  };
}

// Point at path distance s along a route (cell centre)
export function routePoint(r, s) {
  const cum = r.cum;
  let lo = 0, hi = r.cells.length - 1;
  s = Math.max(0, Math.min(cum[hi], s));
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid + 1; else hi = mid; }
  const i = r.cells[lo];
  return { x: cx(i), z: cz(i), y: floorOf(i), k: lo, i };
}

// Do two routes come in the same way? (their last 25 m run within a few metres of each other)
function sameApproach(r, q) {
  const L = r.cum[r.entry], Lq = q.cum[q.entry];
  let sum = 0, cnt = 0, wid = 0;
  for (let s = 1; s <= 25; s += 2) {
    const p = routePoint(r, L - s);
    let best = Infinity;
    for (let t = 0; t <= 40; t += 1) { const o = routePoint(q, Lq - t); best = Math.min(best, Math.hypot(o.x - p.x, o.z - p.z)); }
    sum += best; cnt++; wid += r.width[p.k];
  }
  return sum / cnt < Math.max(6, 0.55 * wid / cnt);
}

// Distinct routes from a spawn into a site: shortest path, then penalise its corridor and search again
function findRoutes(src, inSite, team, site, dEnemy) {
  const { n } = G;
  const mult = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) if (G.clear[i] < 1.2) mult[i] = 1.4;        // run down the middle of corridors
  const prev = new Int32Array(n), tmp = new Float64Array(n), dist0 = dijkstra(src);
  const routes = [];
  let shortest = 0, dups = 0;
  for (let iter = 0; iter < 9 && routes.length < 4 && dups < 3; iter++) {
    dijkstra(src, { mult, prev, stop: inSite, out: tmp });
    const e = G.stopCell;
    if (e < 0) break;
    const cells = trace(prev, e), r = makeRoute(cells, team, site);
    if (!routes.length) shortest = r.len;
    else if (r.len > Math.max(shortest * 1.8, shortest + 85)) { if (DEBUG) console.log(`    ${team}${site} reject long ${r.name} ${r.len.toFixed(0)}`); break; }
    // block this route's corridor (past the spawn) so the next search has to find another way in
    // only the approach is penalised: routes may share a corridor early on and still enter the site differently
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      if (dist0[c] < 14 || r.cum[k] < r.len - 40) continue;
      const R = Math.min(16, r.width[k] + 1.5), x0 = cx(c), z0 = cz(c);
      for (let dz = -Math.ceil(R); dz <= R; dz++) for (let dx = -Math.ceil(R); dx <= R; dx++) {
        if (dx * dx + dz * dz > R * R) continue;
        const j = cellAt(x0 + dx, z0 + dz);
        if (j >= 0 && !inSite[j]) mult[j] = Math.max(mult[j], 7);
      }
    }
    const dup = routes.find((q) => sameApproach(r, q));
    // a way in that runs through the other side's spawn isn't a route, it's a rotation
    const viaSpawn = r.cells.some((c) => dEnemy[c] < 10);
    if (DEBUG) console.log(`    ${team}${site} cand ${r.name} len ${r.len.toFixed(0)} mouth (${r.mouth.x},${r.mouth.z}) ${dup ? 'dup of ' + dup.name : viaSpawn ? 'via enemy spawn' : 'NEW'}`);
    if (dup || viaSpawn) { dups++; continue; }
    dups = 0;
    routes.push(r);
  }
  routes.forEach((r, k) => { r.id = `${team}${site}${k}`; });
  return routes;
}

// ---------------------------------------------------------------- holds
const fitRifle = (d) => (d < 5 ? 0.1 : d < 10 ? 0.1 + 0.9 * (d - 5) / 5 : d <= 28 ? 1 : d < 46 ? 1 - 0.6 * (d - 28) / 18 : 0.3);
const fitSniper = (d) => (d < 12 ? 0 : d < 22 ? (d - 12) / 10 : d <= 55 ? 1 : 0.7);
const fitClose = (d) => (d < 2.5 ? 0.2 : d <= 9 ? 1 : d < 14 ? 1 - (d - 9) / 5 : 0);
// how awkward the spot is for a T walking out of the mouth along dir (0 = straight ahead)
function angleQ(theta, style) {
  const deg = theta * 180 / Math.PI;
  if (style === 'close') return deg < 35 ? 0.2 : deg < 60 ? 0.6 : deg <= 135 ? 1 : 0.6;
  if (style === 'sniper') return deg < 40 ? 1 : deg < 75 ? 0.8 : 0.4;
  return deg < 20 ? 0.6 : deg < 30 ? 0.8 : deg <= 80 ? 1 : deg <= 115 ? 0.7 : 0.3;
}

// The nearest spot within ~2 m you can step to that the mouth can't see (hard cover), or -1
function coverStep(i, vis) {
  const { w, steps } = G;
  let best = -1, bd = Infinity;
  const x = i % w, z = (i / w) | 0;
  for (let k = 0; k < 8; k++) {
    if (!(steps[i] & (1 << k))) continue;
    const j = (z + DZ[k]) * w + x + DX[k];
    if (!vis[j] && standable(j) && DC[k] < bd) { bd = DC[k]; best = j; }
    for (let k2 = 0; k2 < 8; k2++) {
      if (!(steps[j] & (1 << k2))) continue;
      const j2 = j + DX[k2] + DZ[k2] * w;
      const dd = DC[k] + DC[k2];
      if (j2 !== i && !vis[j2] && standable(j2) && dd < bd && Math.hypot(DX[k] + DX[k2], DZ[k] + DZ[k2]) <= 2.3) { bd = dd; best = j2; }
    }
  }
  return best;
}

function pickSpread(list, n, minD, key) {
  const out = [];
  list.sort((a, b) => b[key] - a[key]);
  for (const c of list) {
    if (out.length >= n) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < minD)) continue;
    out.push(c);
  }
  return out;
}

// cells behind the site's T mouths: the Ts would have to come through a mouth (or all the way round) to get there
function behindMask(site, mouths) {
  const { n, w, steps } = G;
  const gate = new Uint8Array(n);
  for (const m of mouths) {
    const px = -m.dir.z, pz = m.dir.x;              // across the corridor
    for (const side of [1, -1]) {
      let prev = m.i;
      for (let s = 0; s <= 10; s += 0.5) {
        const j = cellAt(m.x + px * s * side, m.z + pz * s * side);
        if (j < 0 || G.solid[j] || (j !== prev && Math.abs(floorOf(j) - floorOf(prev)) > STEP)) break;
        // thicken so diagonal moves can't slip through
        for (const o of [0, 1, -1, w, -w]) if (j + o >= 0 && j + o < n && !G.solid[j + o]) gate[j + o] = 1;
        prev = j;
      }
    }
  }
  const dTb = dijkstra(site.tSrc, { block: gate });
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (!G.solid[i] && (!(dTb[i] < Infinity) || dTb[i] > site.dT[i] + 12)) out[i] = 1;
  return out;
}

function holdsFor(nav, site, m, behind, samples) {
  const { n, w } = G;
  const my = m.y + CHEST, R = 62;
  m.vis = visField(m.x, my, m.z, R, EYE);
  m.visC = visField(m.x, my, m.z, R, CROUCH_EYE);
  const cand = [];
  for (let i = 0; i < n; i++) {
    if (!m.vis[i] || !(behind[i] || site.inZone[i]) || !standable(i) || !(nav.dCT[i] < Infinity)) continue;
    const x = cx(i), z = cz(i), dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz);
    if (d < 2.5) continue;
    const cov = coverStep(i, m.vis), low = !m.visC[i];
    const cover = cov >= 0 ? 1 : low ? 0.75 : 0;
    const theta = Math.acos(Math.max(-1, Math.min(1, (dx * m.dir.x + dz * m.dir.z) / (d || 1))));
    const elev = Math.max(-1, Math.min(1, (floorOf(i) - m.y) / 2));
    // CTs need to get there before the Ts can reach the mouth (5.3 m/s for both)
    const lead = (site.dT[m.i] - nav.dCT[i]) / 5.3;
    const leadQ = lead > 6 ? 0 : lead > 0 ? -(6 - lead) / 6 : -1 - Math.min(1, -lead / 6);
    const base = cover * 2.2 + elev * 0.4 + leadQ * 1.2 + (G.clear[i] < 0.9 ? 0.15 : 0);
    const c = {
      i, x, z, y: floorOf(i), d, theta, cover, low, cov, elev, exposure: 0, site: site.key, mouth: m.id,
      rifle: base + fitRifle(d) * 2 + angleQ(theta, 'rifle') * 1.4,
      sniper: base + fitSniper(d) * 2.4 + angleQ(theta, 'sniper') * 1.0,
      close: base + fitClose(d) * 2.4 + angleQ(theta, 'close') * 1.6,
    };
    if (cover === 0) { c.rifle -= 1.5; c.sniper -= 1.5; c.close -= 1.5; }
    cand.push(c);
  }
  // exposure: seen from where the other entrances' Ts come from
  const pre = new Set();
  for (const style of ['rifle', 'sniper', 'close']) {
    cand.sort((a, b) => b[style] - a[style]);
    for (let k = 0; k < Math.min(45, cand.length); k++) pre.add(cand[k]);
  }
  for (const c of pre) {
    let e = 0, tot = 0;
    for (const s of samples) {
      if (s.mouth === m.id) continue;
      tot++;
      if (Math.hypot(s.x - c.x, s.z - c.z) < 55 && clearLine(s.x, s.y + EYE, s.z, c.x, c.y + CHEST, c.z)) e += s.w;
    }
    c.exposure = tot ? e : 0;
    for (const style of ['rifle', 'sniper', 'close']) c[style] -= Math.min(4, c.exposure * 0.9);
  }
  const list = [...pre];
  const out = {};
  for (const style of ['rifle', 'sniper', 'close']) {
    const pool = list.filter((c) => (style === 'close' ? c.d <= 14 : style === 'sniper' ? c.d >= 12 : c.d >= 4));
    out[style] = pickSpread(pool.map((c) => ({ ...c, score: c[style], style })), 6, 3, 'score').map((h) => finishHold(h, m));
  }
  return out;
}

function finishHold(h, m) {
  return {
    x: h.x, z: h.z, y: h.y, site: h.site, mouth: h.mouth, style: h.style, score: +h.score.toFixed(2),
    d: +h.d.toFixed(1), cover: h.cover, low: h.low, exposure: +h.exposure.toFixed(2),
    coverPt: h.cov >= 0 ? { x: cx(h.cov), z: cz(h.cov) } : null,
    look: { x: m.x, y: m.y + HEAD, z: m.z },
  };
}

// Spots that watch two mouths at once (a lone anchor on a site)
function anchorsFor(nav, site) {
  const ms = site.mouths, out = [];
  for (let a = 0; a < ms.length; a++) for (let b = a + 1; b < ms.length; b++) {
    const A = ms[a], B = ms[b], cand = [];
    for (let i = 0; i < G.n; i++) {
      if (!A.vis[i] || !B.vis[i] || !site.inZone[i] || !standable(i)) continue;
      const x = cx(i), z = cz(i), da = Math.hypot(x - A.x, z - A.z), db = Math.hypot(x - B.x, z - B.z);
      if (da < 4 || db < 4) continue;
      const cov = coverStep(i, A.vis) >= 0 || coverStep(i, B.vis) >= 0;
      // both mouths should be in roughly the same direction (one screen), not on opposite sides
      const ax = (A.x - x) / da, az = (A.z - z) / da, bx = (B.x - x) / db, bz = (B.z - z) / db;
      const spread = Math.acos(Math.max(-1, Math.min(1, ax * bx + az * bz)));
      const score = Math.min(fitRifle(da), fitRifle(db)) * 2 + (cov ? 1.5 : 0) + (spread < 1.2 ? 1 : spread < 1.8 ? 0.3 : -1);
      cand.push({ i, x, z, y: floorOf(i), score, a: A.id, b: B.id, spread });
    }
    for (const c of pickSpread(cand, 2, 4, 'score')) {
      const mx = (ms[a].x + ms[b].x) / 2, mz = (ms[a].z + ms[b].z) / 2;
      out.push({ x: c.x, z: c.z, y: c.y, site: site.key, mouths: [c.a, c.b], score: +c.score.toFixed(2), style: 'anchor',
        look: { x: mx, y: (ms[a].y + ms[b].y) / 2 + HEAD, z: mz }, looks: [ms[a], ms[b]].map((m) => ({ x: m.x, y: m.y + HEAD, z: m.z })) });
    }
  }
  return out.sort((p, q) => q.score - p.score);
}

// ---------------------------------------------------------------- T staging, plants
function seenByAny(x, y, z, holds, h = HEAD) {
  for (const o of holds) if (clearLine(o.x, o.y + EYE, o.z, x, y + h, z)) return true;
  return false;
}

// A hidden spot near route point p (within r m, reachable by stepping), or null
function hiddenNear(p, holds, r) {
  const seen = new Set([p.i]), q = [p.i];
  let best = null, bd = Infinity;
  while (q.length) {
    const i = q.shift();
    const x = cx(i), z = cz(i), d = Math.hypot(x - p.x, z - p.z);
    if (d < bd && openish(i) && G.clear[i] >= 0.9 && !seenByAny(x, floorOf(i), z, holds)) { bd = d; best = { x, z, y: floorOf(i), i, k: p.k }; }
    for (let k = 0; k < 8; k++) {
      if (!(G.steps[i] & (1 << k))) continue;
      const j = i + DX[k] + DZ[k] * G.w;
      if (seen.has(j) || Math.hypot(cx(j) - p.x, cz(j) - p.z) > r) continue;
      seen.add(j); q.push(j);
    }
  }
  return best;
}

function stagingFor(route, mouth) {
  const holds = topHolds(mouth, 10);
  const L = route.cum[route.mouth.k];
  let pick = null;
  for (let s = 8; s <= Math.min(95, L - 10) && !pick; s += 1) {
    const p = routePoint(route, L - s);
    if (G.clear[p.i] >= 0.9 && !seenByAny(p.x, p.y, p.z, holds)) pick = { ...p, s };
    // every 4 m, also look beside the route (doorways that line up with a corridor)
    else if (s % 4 === 2) { const h = hiddenNear(p, holds, 6); if (h) pick = { ...h, s }; }
  }
  if (!pick) pick = { ...routePoint(route, L - 12), s: 12, exposed: true };
  // room for a five-stack: nearby hidden cells, spread out
  const slots = [{ x: pick.x, z: pick.z }];
  const seen = new Set([pick.i]), q = [pick.i];
  while (q.length && slots.length < 5) {
    const i = q.shift();
    for (let k = 0; k < 8; k++) {
      if (!(G.steps[i] & (1 << k))) continue;
      const j = i + DX[k] + DZ[k] * G.w;
      if (seen.has(j)) continue;
      seen.add(j);
      const x = cx(j), z = cz(j);
      if (Math.hypot(x - pick.x, z - pick.z) > 5) continue;
      q.push(j);
      if (!openish(j) || G.clear[j] < 0.9) continue;
      if (slots.some((s) => Math.hypot(s.x - x, s.z - z) < 1.3)) continue;
      if (seenByAny(x, floorOf(j), z, holds)) continue;
      slots.push({ x, z });
    }
  }
  return { x: pick.x, z: pick.z, y: pick.y, s: pick.s, exposed: !!pick.exposed, slots, look: { x: route.mouth.x, y: route.mouth.y + HEAD, z: route.mouth.z } };
}

export function topHolds(m, k = 8) {
  const all = [...m.holds.rifle, ...m.holds.sniper, ...m.holds.close];
  all.sort((a, b) => b.score - a.score);
  const out = [];
  for (const h of all) { if (out.length >= k) break; if (!out.some((o) => Math.hypot(o.x - h.x, o.z - h.z) < 1.5)) out.push(h); }
  return out;
}

function plantsFor(site) {
  const cand = [];
  for (const i of site.cells) {
    if (!openish(i)) continue;
    const x = cx(i), z = cz(i), y = floorOf(i);
    let seen = 0;
    for (const m of site.ctMouths) if (clearLine(m.x, m.y + EYE, m.z, x, y + 0.3, z)) seen++;
    let dT = Infinity;
    for (const m of site.mouths) dT = Math.min(dT, Math.hypot(m.x - x, m.z - z));
    const wallNear = G.clear[i] < 1.6 ? 1 : 0;
    cand.push({ x, z, y, score: -seen * 2 - dT / 9 + wallNear * 0.6 + (G.clear[i] < 0.9 ? -0.3 : 0), seen });
  }
  return pickSpread(cand, 4, 3, 'score');
}

// ---------------------------------------------------------------- analysis
function analyze(def) {
  G = buildGrid();
  G.clear = clearanceField();
  const tSrc = zoneCells(def.zones.T), ctSrc = zoneCells(def.zones.CT);
  const nav = { id: def.id, w: G.w, h: G.h, clear: G.clear, sites: {}, routes: [] };
  nav.dT = dijkstra(tSrc);
  nav.dCT = dijkstra(ctSrc);
  const timing = {};
  for (const key of ['A', 'B']) {
    const Z = def.zones[key];
    if (!Z) continue;
    let t = now();
    const cells = zoneCells(Z), inZone = new Uint8Array(G.n);
    for (const i of cells) inZone[i] = 1;
    const site = { key, cells, inZone, dT: nav.dT, tSrc };
    let sx = 0, sz = 0, sn = 0;
    for (const i of cells) if (openish(i)) { sx += cx(i); sz += cz(i); sn++; }
    site.center = { x: sn ? sx / sn : (Z.x0 + Z.x1) / 2, z: sn ? sz / sn : (Z.z0 + Z.z1) / 2 };
    site.tRoutes = findRoutes(tSrc, inZone, 'T', key, nav.dCT);
    site.ctRoutes = findRoutes(ctSrc, inZone, 'CT', key, nav.dT);
    timing[key + ' routes'] = now() - t; t = now();
    // group routes that share a mouth
    const group = (routes, tag) => {
      const out = [];
      for (const r of routes) {
        let m = out.find((o) => Math.hypot(o.x - r.mouth.x, o.z - r.mouth.z) < 4);
        if (!m) { m = { ...r.mouth, id: `${tag}${key}${out.length}`, site: key, routes: [] }; out.push(m); }
        m.routes.push(r.id);
        r.mouthId = m.id;
      }
      return out;
    };
    site.mouths = group(site.tRoutes, 'm');
    site.ctMouths = group(site.ctRoutes, 'c');
    // where Ts come from on each route (the last 30 m), for exposure scoring
    const samples = [];
    for (const r of site.tRoutes) {
      const L = r.cum[r.entry];
      for (let s = 2; s <= 30; s += 4) { const p = routePoint(r, L - s); samples.push({ ...p, mouth: r.mouthId, w: s < 12 ? 1 : 0.6 }); }
    }
    const behind = behindMask(site, site.mouths);
    site.behind = behind;
    timing[key + ' behind'] = now() - t; t = now();
    for (const m of site.mouths) m.holds = holdsFor(nav, site, m, behind, samples);
    timing[key + ' holds'] = now() - t; t = now();
    site.anchors = anchorsFor(nav, site);
    for (const r of site.tRoutes) r.stage = stagingFor(r, site.mouths.find((m) => m.id === r.mouthId));
    site.plants = plantsFor(site);
    timing[key + ' rest'] = now() - t;
    delete site.tSrc; delete site.dT;
    nav.sites[key] = site;
    nav.routes.push(...site.tRoutes, ...site.ctRoutes);
  }
  // how exposed each T route is on the way: CT positions (any site) that can see stretches of it
  const allHolds = [];
  for (const s of Object.values(nav.sites)) { for (const m of s.mouths) allHolds.push(...topHolds(m, 6)); allHolds.push(...s.anchors.slice(0, 2)); }
  for (const r of nav.routes) {
    if (r.team !== 'T') continue;
    const L = r.cum[r.mouth.k];
    let sum = 0, n = 0;
    for (let s = L * 0.25; s < L - 6; s += 4) {
      const p = routePoint(r, s);
      for (const h of allHolds) {
        const d = Math.hypot(h.x - p.x, h.z - p.z);
        if (d < 80 && clearLine(h.x, h.y + EYE, h.z, p.x, p.y + CHEST, p.z)) sum += d < 40 ? 1 : 0.6;
      }
      n++;
    }
    r.danger = n ? sum / n : 0;
  }
  // which site a T is threatening from each cell (bit 1 = A, 2 = B)
  nav.lanes = new Uint8Array(G.n);
  for (const r of nav.routes) {
    if (r.team !== 'T') continue;
    const bit = r.site === 'A' ? 1 : 2;
    for (const c of r.cells) {
      if (nav.dT[c] < 12) continue;
      const x0 = cx(c), z0 = cz(c);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const j = cellAt(x0 + dx, z0 + dz);
        if (j >= 0) nav.lanes[j] |= bit;
      }
    }
  }
  nav.timing = timing;
  nav.grid = G;
  // only needed while analysing: free the visibility fields, keep compact copies of the distance fields
  for (const site of Object.values(nav.sites)) { for (const m of site.mouths) { delete m.vis; delete m.visC; } delete site.behind; }
  nav.dT = Float32Array.from(nav.dT); nav.dCT = Float32Array.from(nav.dCT); G.clear = nav.clear = Float32Array.from(G.clear);
  return nav;
}

export function getNav(def = world.map) {
  if (def._nav) { G = def._nav.grid; return def._nav; }
  if (world.map !== def) throw new Error('botnav: call setMap(def) before analysing it');
  const t0 = now();
  def._nav = analyze(def);
  def._nav.ms = now() - t0;
  return def._nav;
}

// ---------------------------------------------------------------- grenade lineups
// Find a throw from a standing spot (feet at from.x/y/z) that puts a grenade on target.
//  mode 'ground': goes off (or comes to rest) within tol of (tx, tz) on the target's floor level;
//  mode 'air': is at (tx, ty, tz) when the fuse runs out (pop flashes).
// Returns { yaw, pitch, power, land: {x, y, z}, t, err, spread } or null.
const POWERS = [1, 0.65, 0.35];
export function solveThrow(type, from, target, { mode = 'ground', tol = 1.5, eye = EYE, powers = POWERS, seed = null } = {}) {
  const ex = from.x, ez = from.z, eyeY = from.y + eye;
  const tx = target.x, ty = target.y, tz = target.z;
  const yaw0 = Math.atan2(-(tx - ex), -(tz - ez));
  const err = (r) => {
    if (!r) return 1e9;
    if (mode === 'air') return Math.hypot(r.x - tx, (r.y - ty) * 2, r.z - tz);
    const i = cellAt(r.x, r.z), fl = i >= 0 ? G.height[i] : 0;
    return Math.hypot(r.x - tx, r.z - tz) + (Math.abs(fl - ty) > 0.6 ? 6 + Math.abs(fl - ty) : 0);
  };
  const sim = (yaw, pitch, power) => simulateThrow(type, ex, eyeY, ez, yaw, pitch, power);
  const cands = [];
  if (seed) cands.push({ yaw: seed.yaw, pitch: seed.pitch, power: seed.power, e: err(sim(seed.yaw, seed.pitch, seed.power)) });
  else {
    for (const power of powers) for (let p = -0.36; p <= 1.3; p += 0.06) {
      const e = err(sim(yaw0, p, power));
      if (e < 25) cands.push({ yaw: yaw0, pitch: p, power, e });
    }
    cands.sort((a, b) => a.e - b.e);
    // keep distinct starting points (neighbouring pitches of one arc are the same solution)
    const keep = [];
    for (const c of cands) { if (keep.length >= 3) break; if (!keep.some((k) => k.power === c.power && Math.abs(k.pitch - c.pitch) < 0.13)) keep.push(c); }
    cands.length = 0; cands.push(...keep);
  }
  let best = null;
  for (const c of cands) {
    let { yaw, pitch, e } = c, st = seed ? 0.01 : 0.03, budget = 48;
    while (st > 0.0015 && budget > 0 && e > 0.15) {
      let moved = false;
      for (const [dy, dp] of [[0, st], [0, -st], [st, 0], [-st, 0]]) {
        budget--;
        const e2 = err(sim(yaw + dy, pitch + dp, c.power));
        if (e2 < e - 1e-3) { e = e2; yaw += dy; pitch += dp; moved = true; break; }
      }
      if (!moved) st /= 2;
    }
    if (!best || e < best.e) best = { yaw, pitch, power: c.power, e };
    if (best.e < 0.3) break;
  }
  if (!best || best.e > tol) return null;
  const r = sim(best.yaw, best.pitch, best.power);
  // how forgiving the lineup is: landing spread for small aim errors
  let spread = 0;
  for (const [dy, dp] of [[0.012, 0], [-0.012, 0], [0, 0.012], [0, -0.012]]) {
    const q = sim(best.yaw + dy, best.pitch + dp, best.power);
    spread = Math.max(spread, q ? Math.hypot(q.x - r.x, q.z - r.z) : 99);
  }
  return { yaw: best.yaw, pitch: best.pitch, power: best.power, land: { x: r.x, y: r.y, z: r.z }, t: r.t, err: best.e, spread };
}

// ---------------------------------------------------------------- runtime queries
export const floorAt = (x, z) => { const i = cellAt(x, z); return i >= 0 ? G.height[i] : 0; };
export const siteMouth = (nav, route) => nav.sites[route.site].mouths.find((m) => m.id === route.mouthId);

// Which site a point threatens (bit 1 = A, 2 = B; 0 = neither, 3 = both)
export function laneOf(nav, x, z) {
  const i = cellAt(x, z);
  if (i < 0) return 0;
  for (const [k, s] of Object.entries(nav.sites)) if (s.inZone[i]) return k === 'A' ? 1 : 2;
  return nav.lanes[i];
}

// The nearest spot (walking, within maxD m) where none of the threats can see you. Returns {x, z, y} or null.
export function coverSpot(from, threats, maxD = 8, crouched = false) {
  const i0 = cellAt(from.x, from.z);
  if (i0 < 0 || !threats.length) return null;
  const h = crouched ? 0.95 : CHEST;
  const hidden = (i) => {
    const x = cx(i), z = cz(i), y = floorOf(i) + h;
    for (const t of threats) if (clearLine(t.x, t.y, t.z, x, y, z)) return false;
    return true;
  };
  const dist = new Map([[i0, 0]]), q = [i0];
  let best = null, bd = Infinity;
  while (q.length) {
    const i = q.shift(), d = dist.get(i);
    if (d >= bd) continue;
    if (i !== i0 && standable(i) && G.clear[i] >= 0.5 && hidden(i)) { bd = d; best = i; continue; }
    for (let k = 0; k < 8; k++) {
      if (!(G.moves[i] & (1 << k))) continue;
      const j = i + DX[k] + DZ[k] * G.w, nd = d + DC[k];
      if (nd > maxD || (dist.has(j) && dist.get(j) <= nd)) continue;
      dist.set(j, nd); q.push(j);
    }
  }
  return best === null ? null : { x: cx(best), z: cz(best), y: floorOf(best), d: bd };
}

// Spots watching a point (the planted bomb, or the plant spot while Ts take a site): they see it, have
// cover to step back into, aren't in the doorways CTs come through, and are spread around it.
export function watchSpots(nav, siteKey, P, n = 5, opts = {}) {
  const site = nav.sites[siteKey], R = opts.radius || 30, ty = P.y + 1.0;
  const x0 = Math.max(0, Math.floor(P.x - R)), x1 = Math.min(G.w - 1, Math.floor(P.x + R));
  const z0 = Math.max(0, Math.floor(P.z - R)), z1 = Math.min(G.h - 1, Math.floor(P.z + R));
  const entries = [];
  for (const r of site.ctRoutes) {
    const L = r.cum[r.entry];
    for (let s = 0; s <= 14; s += 7) entries.push(routePoint(r, L - s));
  }
  const vis = new Uint8Array(G.n), cand = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const i = z * G.w + x;
    if (G.solid[i] || !G.moves[i]) continue;
    const ex = x + 0.5, ez = z + 0.5, d = Math.hypot(ex - P.x, ez - P.z);
    if (d > R || d < 3) continue;
    if (clearLine(ex, G.height[i] + EYE, ez, P.x, ty, P.z)) vis[i] = 1;
  }
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const i = z * G.w + x;
    if (!vis[i] || !standable(i)) continue;
    const ex = x + 0.5, ez = z + 0.5, d = Math.hypot(ex - P.x, ez - P.z);
    const cov = coverStep(i, vis);
    const fit = d < 6 ? 0.3 : d < 10 ? 0.8 : d <= 22 ? 1 : 1 - Math.min(0.7, (d - 22) / 12);
    const tSide = nav.dT[i] < nav.dCT[i] ? 0.4 : 0;
    cand.push({ i, x: ex, z: ez, y: G.height[i], d, cov, score: (cov >= 0 ? 2 : 0) + fit * 1.5 + tSide + (opts.inSite === false && site.inZone[i] ? -0.5 : 0) });
  }
  cand.sort((a, b) => b.score - a.score);
  const pre = cand.slice(0, 60);
  for (const c of pre) {
    let e = 0;
    for (const p of entries) if (clearLine(p.x, p.y + EYE, p.z, c.x, c.y + CHEST, c.z)) e++;
    c.score -= e * 0.7;
    c.ang = Math.atan2(c.z - P.z, c.x - P.x);
  }
  pre.sort((a, b) => b.score - a.score);
  const out = [];
  for (const c of pre) {
    if (out.length >= n) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 5 || Math.abs(Math.atan2(Math.sin(o.ang - c.ang), Math.cos(o.ang - c.ang))) < 0.45)) continue;
    out.push({ x: c.x, z: c.z, y: c.y, d: c.d, score: +c.score.toFixed(2), coverPt: c.cov >= 0 ? { x: cx(c.cov), z: cz(c.cov) } : null, look: { x: P.x, y: P.y + HEAD - 0.4, z: P.z } });
  }
  return out;
}

// Where CTs gather to retake a site: on each of their routes in, the first point (walking back from the
// site) that can't be seen from around the bomb.
export function retakePoints(nav, siteKey, P) {
  const site = nav.sites[siteKey], out = [];
  for (const r of site.ctRoutes) {
    const L = r.cum[r.entry];
    let pick = null;
    for (let s = 4; s <= Math.min(40, L - 2); s += 1.5) {
      const p = routePoint(r, L - s);
      if (G.clear[p.i] < 0.9) continue;
      if (!clearLine(P.x, P.y + EYE, P.z, p.x, p.y + HEAD, p.z)) { pick = p; break; }
    }
    if (!pick) pick = routePoint(r, Math.max(0, L - 12));
    out.push({ x: pick.x, z: pick.z, y: pick.y, route: r, look: { x: r.mouth.x, y: r.mouth.y + HEAD, z: r.mouth.z } });
  }
  return out;
}

// Utility for an execute down a route, worked out a step at a time (each yield is one lineup solve, so a
// brain can spread it over frames): smokes that cut the CTs' long sightlines onto the entrance, a pop flash
// over the mouth and a molotov on the closest hiding spot, each with the spot to throw it from.
const segDist = (px, pz, ax, az, bx, bz) => {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
};
export function* routeUtilityJob(nav, route) {
  if (route.util) return route.util;
  const m = siteMouth(nav, route), util = { smokes: [], flash: null, molly: null };
  const ex = m.x + m.dir.x * 2.5, ez = m.z + m.dir.z * 2.5;
  const holds = topHolds(m, 14).filter((h) => h.d > 9);
  let lines = holds.map((h) => ({ ax: h.x, az: h.z, w: Math.max(0.5, h.score) }));
  const cand = [];
  for (let z = Math.floor(m.z - 26); z <= m.z + 26; z++) for (let x = Math.floor(m.x - 26); x <= m.x + 26; x++) {
    const i = cellAt(x + 0.5, z + 0.5);
    if (i < 0 || !openish(i)) continue;
    const px = cx(i), pz = cz(i), d = Math.hypot(px - m.x, pz - m.z);
    // out on the site, not in the doorway: the Ts need to walk out and see the close angles
    if (d < 8 || d > 28 || (px - m.x) * m.dir.x + (pz - m.z) * m.dir.z < 4) continue;
    if (Math.abs(floorOf(i) - m.y) > 3.5) continue;
    cand.push({ x: px, z: pz, y: floorOf(i) });
  }
  const targets = [];
  for (let k = 0; k < 2 && lines.length; k++) {
    let best = null, bw = 0;
    for (const c of cand) {
      let w = 0;
      for (const l of lines) if (segDist(c.x, c.z, l.ax, l.az, ex, ez) < 3.2) w += l.w;
      w *= 0.75 + Math.min(1, Math.hypot(c.x - ex, c.z - ez) / 16) * 0.5;      // further out leaves the entry clear
      if (w > bw) { bw = w; best = c; }
    }
    if (!best || (k > 0 && bw < targets[0].w * 0.3)) break;
    targets.push({ ...best, w: bw });
    lines = lines.filter((l) => segDist(best.x, best.z, l.ax, l.az, ex, ez) >= 3.2);
  }
  yield;
  // throw spots: the stage first (hidden), then its slots, then points on the way to the mouth
  const st = route.stage, spots = [{ x: st.x, z: st.z, y: st.y }];
  for (const s of st.slots.slice(1, 3)) spots.push({ x: s.x, z: s.z, y: floorAt(s.x, s.z) });
  const Lm = route.cum[route.mouth.k];
  for (let s = Math.min(st.s - 4, 24); s >= 2; s -= 4) { const p = routePoint(route, Lm - s); if (G.clear[p.i] >= 0.5) spots.push({ x: p.x, z: p.z, y: p.y }); }
  const solveFrom = function* (type, target, mode, tol) {
    for (const sp of spots.slice(0, 10)) {
      if (Math.hypot(sp.x - target.x, sp.z - target.z) > 42) continue;
      const sol = solveThrow(type, sp, target, { mode, tol });
      yield;
      if (sol && sol.spread < 2.5) return { type, target, from: sp, sol };
    }
    return null;
  };
  for (const t of targets) { const r = yield* solveFrom('smoke', t, 'ground', 1.6); if (r) util.smokes.push(r); }
  // pop flash: somewhere past the mouth that the CTs holding it can see and the waiting Ts can't
  const waitPts = [st, ...st.slots.slice(1, 4).map((q) => ({ x: q.x, z: q.z, y: floorAt(q.x, q.z) })), routePoint(route, Lm - 10)];
  const fc = [];
  const fHolds = topHolds(m, 8);
  // how long a CT at h watching the mouth would be blinded by a flash at (x, y, z) (grenades.js rules)
  const blindAt = (h, x, y, z) => {
    const ex = h.x, ey = h.y + EYE, ez = h.z, d = Math.hypot(ex - x, ey - y, ez - z);
    if (d > 26 || !clearLine(x, y + 0.1, z, ex, ey, ez)) return 0;
    const lx = m.x - ex, ly = m.y + HEAD - ey, lz = m.z - ez, ll = Math.hypot(lx, ly, lz) || 1;
    const dot = ((x - ex) * lx + (y - ey) * ly + (z - ez) * lz) / ((d || 1) * ll);
    return 4.2 * (dot > 0.5 ? 1 : dot > 0 ? 0.6 : 0.25) * (1 - d / 26 * 0.6);
  };
  const pts = [];
  for (const d of [2.5, 4, 6, 8]) for (const side of [0, -2, 2]) pts.push([m.x + m.dir.x * d - m.dir.z * side, m.z + m.dir.z * d + m.dir.x * side]);
  // out towards where they hold from, so it pops in front of their faces
  for (const h of fHolds.slice(0, 5)) for (const f of [0.35, 0.55, 0.75]) pts.push([m.x + (h.x - m.x) * f, m.z + (h.z - m.z) * f]);
  for (const [fx, fz] of pts) for (const hh of [1.8, 2.6, 3.4]) {
    const fi = cellAt(fx, fz);
    if (fi < 0 || G.solid[fi]) continue;
    const roof = world.roof[fi], fy = roof > 0 ? Math.min(G.height[fi] + hh, roof - 0.5) : G.height[fi] + hh;
    if (fy < G.height[fi] + 1.4) continue;
    let blind = 0, own = 0;
    for (const h of fHolds) blind += Math.min(3, blindAt(h, fx, fy, fz));
    for (const w of waitPts) if (clearLine(w.x, w.y + EYE, w.z, fx, fy, fz)) own++;
    if (blind > 1) fc.push({ x: fx, y: fy, z: fz, score: blind - own * 2 });
  }
  fc.sort((p, q) => q.score - p.score);
  for (const c of fc.slice(0, 4)) {
    util.flash = yield* solveFrom('flash', c, 'air', 1.8);
    if (util.flash) break;
  }
  // no clean pop spot (low ceilings): bounce it in, it goes off on the floor just past the door
  if (!util.flash) util.flash = yield* solveFrom('flash', { x: m.x + m.dir.x * 3.5, y: m.y, z: m.z + m.dir.z * 3.5 }, 'ground', 1.8);
  const close = m.holds.close[0];
  if (close) util.molly = yield* solveFrom('molotov', { x: close.x, y: close.y, z: close.z }, 'ground', 1.4);
  route.util = util;
  return util;
}

// Run a job generator to the end right away (tools, or when there was no time to spread it out)
export function finishJob(job) { let r; do r = job.next(); while (!r.done); return r.value; }

export { G as navGrid, cellAt as navCell };
