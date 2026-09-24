// Pure world logic (no three.js): the active map's grid, collision, bullet raycasts,
// line of sight and A* navigation. Cells are 1m. Every walkable cell has a floor height,
// so stairs, platforms, crates and low cover all fall out of the same data.

export const CELL = 1;
export const STEP = 0.45;       // max height an agent can walk up without jumping
export const MAT = {
  GROUND: 0, CRATE: 1, LOWWALL: 2, CONTAINER: 3, PLATFORM: 4, TILES: 5, ASPHALT: 6,
  CONCRETE: 7, METAL: 8, HIDDEN: 9, WOOD: 10, SAND: 11,
};

export const world = {
  map: null, w: 0, h: 0,
  solid: null, height: null, roof: null,
  smokes: [],               // active smoke clouds { x, z, r, t } (maintained by grenades.js)
};

export function setMap(def) {
  world.map = def;
  world.w = def.w; world.h = def.h;
  world.solid = def.solid; world.height = def.height; world.roof = def.roof;
  world.smokes = [];
  buildNavCosts();
}

const idx = (x, z) => z * world.w + x;
export const inBounds = (x, z) => x >= 0 && z >= 0 && x < world.w && z < world.h;
export const isWall = (x, z) => !inBounds(x, z) || world.solid[idx(x, z)] === 1;
export const floorH = (x, z) => (isWall(x, z) ? 99 : world.height[idx(x, z)]);
export const cellOf = (v) => Math.floor(v / CELL);

// ---------- Zones ----------
export function inZone(zone, x, z) {
  const Z = world.map.zones[zone];
  if (!Z) return false;
  const cx = cellOf(x), cz = cellOf(z);
  return cx >= Z.x0 && cx <= Z.x1 && cz >= Z.z0 && cz <= Z.z1;
}
export function calloutAt(x, z) {
  const cx = cellOf(x), cz = cellOf(z);
  for (const c of world.map.callouts) if (cx >= c.x0 && cx <= c.x1 && cz >= c.z0 && cz <= c.z1) return c;
  return null;
}

// ---------- Movement / collision ----------
// Ground height under a circle: the highest walkable cell it overlaps.
export function groundAt(x, z, r = 0.3) {
  let g = 0;
  const x0 = cellOf(x - r), x1 = cellOf(x + r), z0 = cellOf(z - r), z1 = cellOf(z + r);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    if (isWall(cx, cz)) continue;
    // only count cells the circle really overlaps
    const px = Math.max(cx, Math.min(x, cx + 1)), pz = Math.max(cz, Math.min(z, cz + 1));
    if ((px - x) ** 2 + (pz - z) ** 2 > r * r) continue;
    g = Math.max(g, world.height[idx(cx, cz)]);
  }
  return g;
}

// Push a circle at height y out of every cell it cannot stand in. Mutates pos.
export function resolveCircle(pos, r, y = pos.y || 0) {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const x0 = cellOf(pos.x - r), x1 = cellOf(pos.x + r), z0 = cellOf(pos.z - r), z1 = cellOf(pos.z + r);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      if (!isWall(cx, cz) && world.height[idx(cx, cz)] <= y + STEP) continue;
      const px = Math.max(cx, Math.min(pos.x, cx + 1)), pz = Math.max(cz, Math.min(pos.z, cz + 1));
      const dx = pos.x - px, dz = pos.z - pz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) {
        const l = pos.x - cx, rr = cx + 1 - pos.x, t = pos.z - cz, b = cz + 1 - pos.z, m = Math.min(l, rr, t, b);
        if (m === l) pos.x = cx - r; else if (m === rr) pos.x = cx + 1 + r; else if (m === t) pos.z = cz - r; else pos.z = cz + 1 + r;
      } else {
        const d = Math.sqrt(d2), push = r - d;
        pos.x += (dx / d) * push; pos.z += (dz / d) * push;
      }
      moved = true;
    }
    if (!moved) break;
  }
}

// Point collision used by ragdolls and grenades: returns true if the point is inside geometry.
export function pointBlocked(x, y, z) {
  const cx = cellOf(x), cz = cellOf(z);
  if (isWall(cx, cz)) return true;
  if (y < world.height[idx(cx, cz)]) return true;
  const rf = world.roof[idx(cx, cz)];
  return rf > 0 && y > rf;
}

// ---------- Raycast ----------
// Direction must be normalized. Returns { dist, nx, ny, nz } of the first static hit.
export function raycast(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  let hit = { dist: maxDist, nx: 0, ny: 0, nz: 0 };
  if (dy < -1e-6) { const t = -oy / dy; if (t < best) { best = t; hit = { dist: t, nx: 0, ny: 1, nz: 0 }; } }
  let cx = cellOf(ox), cz = cellOf(oz);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const adx = Math.abs(dx), adz = Math.abs(dz);
  const tDX = adx < 1e-9 ? Infinity : CELL / adx, tDZ = adz < 1e-9 ? Infinity : CELL / adz;
  let tMX = adx < 1e-9 ? Infinity : (dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / adx;
  let tMZ = adz < 1e-9 ? Infinity : (dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / adz;
  let t = 0, axis = -1;
  const side = (tt) => (axis === 0 ? { dist: tt, nx: -stepX, ny: 0, nz: 0 } : { dist: tt, nx: 0, ny: 0, nz: -stepZ });
  for (let guard = 0; guard < 2000 && t < best; guard++) {
    if (!inBounds(cx, cz)) return side(t);
    const i = idx(cx, cz);
    if (world.solid[i] === 1) { if (t > 0) return side(t); }
    else {
      const tExit = Math.min(tMX, tMZ, best);
      const yIn = oy + dy * t, yOut = oy + dy * tExit;
      const h = world.height[i];
      if (h > 0) {
        if (yIn < h - 1e-4 && t > 0) return side(t);
        if (yOut < h && dy < 0) { const tc = Math.max(t, (h - oy) / dy); if (tc < best) return { dist: tc, nx: 0, ny: 1, nz: 0 }; }
      }
      const rf = world.roof[i];
      if (rf > 0) {
        if (yIn > rf + 1e-4 && t > 0) return side(t);
        if (yOut > rf && dy > 0) { const tc = Math.max(t, (rf - oy) / dy); if (tc < best) return { dist: tc, nx: 0, ny: -1, nz: 0 }; }
      }
    }
    if (tMX < tMZ) { t = tMX; tMX += tDX; cx += stepX; axis = 0; } else { t = tMZ; tMZ += tDZ; cz += stepZ; axis = 1; }
  }
  return hit;
}

// Does the segment pass through an active smoke cloud?
export function smokeBlocks(ax, ay, az, bx, by, bz) {
  for (const s of world.smokes) {
    if (s.r < 0.5) continue;
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    let k = l2 > 0 ? ((s.x - ax) * vx + (s.z - az) * vz) / l2 : 0;
    k = Math.max(0, Math.min(1, k));
    const px = ax + vx * k, pz = az + vz * k, py = ay + (by - ay) * k;
    if ((px - s.x) ** 2 + (pz - s.z) ** 2 < s.r * s.r && py < s.y + s.r * 0.9) return true;
  }
  return false;
}

export function hasLOS(ax, ay, az, bx, by, bz, smoke = true) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
  if (d < 0.01) return true;
  if (raycast(ax, ay, az, dx / d, dy / d, dz / d, d).dist < d - 0.05) return false;
  return !(smoke && smokeBlocks(ax, ay, az, bx, by, bz));
}

// ---------- Navigation ----------
let navCost = null;
function buildNavCosts() {
  const { w, h } = world;
  navCost = new Float32Array(w * h);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (isWall(x, z)) continue;
    const hh = world.height[idx(x, z)];
    let near = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!canStep(hh, x + dx, z + dz)) near++;
    navCost[idx(x, z)] = near ? 0.8 : 0;
  }
}
export const DROP = 1.6;         // bots will drop down ledges up to this height
const canStep = (fromH, x, z) => !isWall(x, z) && Math.abs(world.height[idx(x, z)] - fromH) <= STEP;
// Directed: climbing is limited by STEP, dropping by DROP
const canMove = (fromH, x, z) => { if (isWall(x, z)) return false; const d = world.height[idx(x, z)] - fromH; return d <= STEP && d >= -DROP; };
export const walkableCell = (x, z) => !isWall(x, z);
// A cell you'd spawn or stand around on (not the top of a crate/container/prop)
const OBSTACLE = new Set([MAT.CRATE, MAT.CONTAINER, MAT.HIDDEN, MAT.LOWWALL]);
export const openCell = (x, z) => !isWall(x, z) && !OBSTACLE.has(world.map.mat[idx(x, z)]) && navCost[idx(x, z)] === 0;

class Heap {
  constructor(score) { this.a = []; this.s = score; }
  push(v) { const a = this.a; a.push(v); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.s[a[p]] <= this.s[a[i]]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && this.s[a[l]] < this.s[a[m]]) m = l; if (r < a.length && this.s[a[r]] < this.s[a[m]]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; }
    }
    return top;
  }
  get size() { return this.a.length; }
}

export function nearestWalkable(cx, cz) {
  if (!isWall(cx, cz)) return [cx, cz];
  for (let r = 1; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++)
    if (!isWall(cx + dx, cz + dz)) return [cx + dx, cz + dz];
  return [cx, cz];
}

// A* scratch buffers, reused between searches (no per-call allocation / GC churn).
let S = null;
function scratch(n) {
  if (!S || S.n !== n) S = { n, g: new Float32Array(n), f: new Float32Array(n), came: new Int32Array(n), stamp: new Uint32Array(n), closed: new Uint32Array(n), gen: 0 };
  S.gen++;
  return S;
}

// Returns a list of {x, z} waypoints (world meters), smoothed.
export function findPath(from, to) {
  const { w, h } = world;
  let [sx, sz] = nearestWalkable(cellOf(from.x), cellOf(from.z));
  let [gx, gz] = nearestWalkable(cellOf(to.x), cellOf(to.z));
  const start = idx(sx, sz), goal = idx(gx, gz);
  const sc = scratch(w * h), gen = sc.gen, g = sc.g, f = sc.f, came = sc.came, stamp = sc.stamp, closed = sc.closed;
  const touch = (i) => { if (stamp[i] !== gen) { stamp[i] = gen; g[i] = Infinity; f[i] = Infinity; came[i] = -1; } };
  const heur = (i) => { const x = i % w, z = (i / w) | 0, a = Math.abs(x - gx), b = Math.abs(z - gz); return Math.max(a, b) + 0.414 * Math.min(a, b); };
  const open = new Heap(f);
  touch(start); g[start] = 0; f[start] = heur(start); open.push(start);
  let found = start === goal;
  while (open.size && !found) {
    const cur = open.pop();
    if (closed[cur] === gen) continue;
    if (cur === goal) { found = true; break; }
    closed[cur] = gen;
    const x = cur % w, z = (cur / w) | 0, hh = world.height[cur];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (!canMove(hh, nx, nz)) continue;
      if (dx && dz && (!canStep(hh, x + dx, z) || !canStep(hh, x, z + dz))) continue;
      const ni = idx(nx, nz);
      if (closed[ni] === gen) continue;
      touch(ni);
      const c = g[cur] + (dx && dz ? 1.414 : 1) + navCost[ni];
      if (c < g[ni]) { g[ni] = c; came[ni] = cur; f[ni] = c + heur(ni); open.push(ni); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let c = goal; c !== -1; c = came[c]) { cells.push(c); if (c === start) break; }
  cells.reverse();
  const pts = cells.map((c) => ({ x: (c % w) + 0.5, z: ((c / w) | 0) + 0.5 }));
  const last = pts[pts.length - 1];
  if (cellOf(to.x) === cellOf(last.x) && cellOf(to.z) === cellOf(last.z)) pts[pts.length - 1] = { x: to.x, z: to.z };
  return smoothPath(from, pts);
}

// Can an agent walk straight from a to b (respecting step heights and clearance)?
export function walkLine(a, b, r = 0.4) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.25));
  let prevH = groundAt(a.x, a.z, 0.05);
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    for (const [ox, oz] of [[0, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) {
      const cx = cellOf(x + ox), cz = cellOf(z + oz);
      if (isWall(cx, cz)) return false;
      const dh = world.height[idx(cx, cz)] - prevH;
      if (dh > STEP || dh < -DROP) return false;
    }
    prevH = world.height[idx(cellOf(x), cellOf(z))];
  }
  return true;
}

function smoothPath(from, pts) {
  const out = [];
  let anchor = { x: from.x, z: from.z }, i = 0;
  while (i < pts.length) {
    let j = Math.min(pts.length - 1, i + 24);
    while (j > i && !walkLine(anchor, pts[j])) j--;
    out.push(pts[j]); anchor = pts[j]; i = j + 1;
  }
  return out;
}

export function randomPointInZone(zone, rng = Math.random) {
  const Z = world.map.zones[zone];
  return randomPointInRect(Z, rng);
}
export function randomPointInRect(Z, rng = Math.random) {
  for (let tries = 0; tries < 80; tries++) {
    const cx = Z.x0 + Math.floor(rng() * (Z.x1 - Z.x0 + 1)), cz = Z.z0 + Math.floor(rng() * (Z.z1 - Z.z0 + 1));
    if (openCell(cx, cz)) return { x: cx + 0.5, z: cz + 0.5 };
  }
  const [cx, cz] = nearestWalkable((Z.x0 + Z.x1) >> 1, (Z.z0 + Z.z1) >> 1);
  return { x: cx + 0.5, z: cz + 0.5 };
}

// Spread-out spawn points inside a zone for n players.
export function spawnPoints(zone, n) {
  const Z = world.map.zones[zone];
  const pts = [];
  for (let z = Z.z0 + 1; z <= Z.z1 - 1; z += 2) for (let x = Z.x0 + 1; x <= Z.x1 - 1; x += 2) {
    if (openCell(x, z)) pts.push({ x: x + 0.5, z: z + 0.5 });
  }
  if (!pts.length) return [randomPointInZone(zone)];
  // take points in a stable but spread order
  const out = [];
  const step = Math.max(1, Math.floor(pts.length / Math.max(n, 1)));
  for (let i = 0; out.length < n && i < pts.length * 2; i += step) out.push(pts[(i + (i / pts.length | 0)) % pts.length]);
  while (out.length < n) out.push(pts[out.length % pts.length]);
  return out;
}
