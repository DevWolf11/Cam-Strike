import * as THREE from '../lib/three.module.min.js';

// Grid-based map. Each cell is CELL x CELL meters. 0 = floor, 1 = wall, 2 = crate.
export const CELL = 2;
export const W = 40;
export const H = 40;
export const CRATE_H = 2.1;
const FLOOR = 0, WALL = 1, CRATE = 2;

export const grid = new Uint8Array(W * H).fill(WALL);
const wallHeight = new Float32Array(W * H);

const idx = (x, z) => z * W + x;
export const cellAt = (x, z) => (x < 0 || z < 0 || x >= W || z >= H) ? WALL : grid[idx(x, z)];
export const isSolidCell = (x, z) => cellAt(x, z) !== FLOOR;

function carve(x0, z0, x1, z1) {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[idx(x, z)] = FLOOR;
}
function setCell(x, z, v) { grid[idx(x, z)] = v; }

// ---- Layout (loosely inspired by a classic desert map) ----
carve(16, 2, 23, 7);    // CT spawn
carve(24, 4, 27, 7);    // CT -> A
carve(28, 2, 37, 11);   // A site
carve(12, 4, 15, 7);    // CT -> B
carve(2, 2, 11, 11);    // B site
carve(19, 8, 20, 10);   // Mid doors
carve(18, 11, 21, 31);  // Mid
carve(22, 16, 30, 18);  // Short A (catwalk)
carve(28, 12, 30, 15);
carve(34, 12, 37, 31);  // Long A
carve(24, 32, 37, 35);
carve(2, 12, 5, 31);    // B tunnels
carve(2, 32, 15, 35);
carve(6, 22, 17, 23);   // Upper tunnel (mid -> B)
carve(14, 32, 25, 37);  // T spawn
setCell(34, 26, WALL); setCell(35, 26, WALL); setCell(34, 27, WALL); setCell(35, 27, WALL); // long doors

const crates = [
  [31, 5], [32, 5], [31, 6], [32, 6], [35, 9], [29, 9], [36, 3],       // A site
  [6, 5], [7, 5], [6, 6], [7, 6], [3, 9], [10, 3], [9, 9],             // B site
  [21, 26], [18, 15], [37, 22], [34, 17], [5, 26], [2, 16],            // lanes
  [17, 35], [22, 34], [16, 2], [23, 2], [26, 17], [12, 22],
];
for (const [x, z] of crates) setCell(x, z, CRATE);

// Deterministic height variation for the skyline
for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  wallHeight[idx(x, z)] = 4 + Math.floor((n - Math.floor(n)) * 3) * 0.8;
}

// ---- Coordinates helpers ----
export const c2w = (cx, cz) => ({ x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL });
export const w2c = (x) => Math.floor(x / CELL);

export const ZONES = {
  A:  { x0: 29, z0: 3, x1: 37, z1: 10, name: 'A' },
  B:  { x0: 2, z0: 3, x1: 10, z1: 10, name: 'B' },
  T:  { x0: 14, z0: 32, x1: 25, z1: 37, name: 'T' },
  CT: { x0: 16, z0: 2, x1: 23, z1: 7, name: 'CT' },
};
export function inZone(zone, x, z) {
  const Z = ZONES[zone], cx = w2c(x), cz = w2c(z);
  return cx >= Z.x0 && cx <= Z.x1 && cz >= Z.z0 && cz <= Z.z1;
}

export const SPAWNS = {
  T: [[16, 36], [18, 36], [20, 36], [22, 36], [24, 36]].map(([x, z]) => c2w(x, z)),
  CT: [[17, 4], [19, 4], [20, 6], [22, 4], [18, 6]].map(([x, z]) => c2w(x, z)),
};

// Tactical points used by the bot AI (cell coords -> world)
const P = (x, z) => c2w(x, z);
export const TACTICS = {
  entrances: {
    A: [P(35.5, 12), P(29, 12), P(27, 5.5)],
    B: [P(3.5, 12), P(12, 5.5)],
  },
  ctHolds: [
    { site: 'A', pos: P(33, 4), watch: P(35.5, 14) },
    { site: 'A', pos: P(29, 3), watch: P(29, 14) },
    { site: 'B', pos: P(8, 3), watch: P(3.5, 14) },
    { site: 'B', pos: P(10, 9), watch: P(3.5, 13) },
    { site: 'MID', pos: P(19.5, 6), watch: P(19.5, 14) },
  ],
  tRoutes: {
    A: [P(35.5, 24), P(25, 17)],
    B: [P(3.5, 24), P(10, 22.5)],
  },
  plantSpots: { A: [P(33, 7), P(30, 4), P(34, 5)], B: [P(4, 6), P(8, 7), P(5, 4)] },
};

// ---- Collision ----
export function isSolidAt(x, z) { return isSolidCell(w2c(x), w2c(z)); }

// Push a circle (pos.x, pos.z, r) out of all solid cells. Mutates pos.
export function resolveCircle(pos, r) {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const cx0 = w2c(pos.x - r), cx1 = w2c(pos.x + r);
    const cz0 = w2c(pos.z - r), cz1 = w2c(pos.z + r);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      if (!isSolidCell(cx, cz)) continue;
      const minX = cx * CELL, maxX = minX + CELL, minZ = cz * CELL, maxZ = minZ + CELL;
      const px = Math.max(minX, Math.min(pos.x, maxX));
      const pz = Math.max(minZ, Math.min(pos.z, maxZ));
      let dx = pos.x - px, dz = pos.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) { // center inside the cell: push out along the shortest axis
        const l = pos.x - minX, rr = maxX - pos.x, t = pos.z - minZ, b = maxZ - pos.z;
        const m = Math.min(l, rr, t, b);
        if (m === l) pos.x = minX - r; else if (m === rr) pos.x = maxX + r;
        else if (m === t) pos.z = minZ - r; else pos.z = maxZ + r;
      } else {
        const d = Math.sqrt(d2), push = r - d;
        pos.x += (dx / d) * push; pos.z += (dz / d) * push;
      }
      moved = true;
    }
    if (!moved) break;
  }
}

// ---- Raycast (bullets / line of sight) ----
// Direction must be normalized. Returns { dist, nx, ny, nz } of first static hit, or dist = maxDist.
export function raycast(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist, nx = 0, ny = 0, nz = 0;
  if (dy < -1e-6) { const t = -oy / dy; if (t < best) { best = t; ny = 1; } }

  let cx = w2c(ox), cz = w2c(oz);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(dx) < 1e-9 ? Infinity : CELL / Math.abs(dx);
  const tDeltaZ = Math.abs(dz) < 1e-9 ? Infinity : CELL / Math.abs(dz);
  let tMaxX = Math.abs(dx) < 1e-9 ? Infinity : ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx));
  let tMaxZ = Math.abs(dz) < 1e-9 ? Infinity : ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz));
  let t = 0, lastAxis = -1;
  while (t < best) {
    const c = cellAt(cx, cz);
    if (c === WALL && t > 0) {
      if (lastAxis === 0) return { dist: t, nx: -stepX, ny: 0, nz: 0 };
      return { dist: t, nx: 0, ny: 0, nz: -stepZ };
    }
    if (c === CRATE) {
      const tExit = Math.min(tMaxX, tMaxZ, best);
      const yIn = oy + dy * t, yOut = oy + dy * tExit;
      if (yIn < CRATE_H) {
        if (lastAxis === 0) return { dist: t, nx: -stepX, ny: 0, nz: 0 };
        return { dist: t, nx: 0, ny: 0, nz: -stepZ };
      }
      if (yOut < CRATE_H) { const tc = (CRATE_H - oy) / dy; if (tc < best) return { dist: tc, nx: 0, ny: 1, nz: 0 }; }
    }
    if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; cx += stepX; lastAxis = 0; }
    else { t = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; lastAxis = 1; }
    if (cx < -1 || cz < -1 || cx > W || cz > H) break;
  }
  return { dist: best, nx, ny, nz };
}

export function hasLOS(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const d = Math.hypot(dx, dy, dz);
  if (d < 0.01) return true;
  return raycast(ax, ay, az, dx / d, dy / d, dz / d, d).dist >= d - 0.05;
}

// ---- Navigation (A* on the grid) ----
const neighborCost = new Float32Array(W * H);
for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
  let n = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (isSolidCell(x + dx, z + dz)) n++;
  neighborCost[idx(x, z)] = n > 0 ? 0.6 : 0; // prefer staying off walls
}

export function findPath(from, to) {
  let sx = w2c(from.x), sz = w2c(from.z), gx = w2c(to.x), gz = w2c(to.z);
  if (isSolidCell(gx, gz)) { const n = nearestFloor(gx, gz); gx = n[0]; gz = n[1]; }
  if (isSolidCell(sx, sz)) { const n = nearestFloor(sx, sz); sx = n[0]; sz = n[1]; }
  const start = idx(sx, sz), goal = idx(gx, gz);
  const g = new Float32Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const open = [start]; g[start] = 0;
  const f = new Float32Array(W * H).fill(Infinity);
  const heur = (i) => { const x = i % W, z = (i / W) | 0; const ddx = Math.abs(x - gx), ddz = Math.abs(z - gz); return Math.max(ddx, ddz) + 0.414 * Math.min(ddx, ddz); };
  f[start] = heur(start);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const x = cur % W, z = (cur / W) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (isSolidCell(nx, nz)) continue;
      if (dx && dz && (isSolidCell(x + dx, z) || isSolidCell(x, z + dz))) continue;
      const ni = idx(nx, nz);
      if (closed[ni]) continue;
      const cost = g[cur] + (dx && dz ? 1.414 : 1) + neighborCost[ni];
      if (cost < g[ni]) {
        g[ni] = cost; came[ni] = cur; f[ni] = cost + heur(ni);
        open.push(ni);
      }
    }
  }
  if (came[goal] === -1 && goal !== start) return [{ x: to.x, z: to.z }];
  const cells = [];
  for (let c = goal; c !== -1; c = came[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => c2w(c % W, (c / W) | 0));
  if (!isSolidAt(to.x, to.z)) pts[pts.length - 1] = { x: to.x, z: to.z };
  return smoothPath(from, pts);
}

function nearestFloor(x, z) {
  for (let r = 1; r < 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++)
    if (!isSolidCell(x + dx, z + dz)) return [x + dx, z + dz];
  return [x, z];
}

function walkable(a, b, r = 0.45) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(d / 0.4);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    if (isSolidAt(x - r, z - r) || isSolidAt(x + r, z - r) || isSolidAt(x - r, z + r) || isSolidAt(x + r, z + r)) return false;
  }
  return true;
}

function smoothPath(from, pts) {
  const out = [];
  let anchor = { x: from.x, z: from.z }, i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !walkable(anchor, pts[j])) j--;
    out.push(pts[j]); anchor = pts[j]; i = j + 1;
  }
  return out;
}

export function randomPointInZone(zone, rng = Math.random) {
  const Z = ZONES[zone];
  for (let tries = 0; tries < 50; tries++) {
    const cx = Z.x0 + Math.floor(rng() * (Z.x1 - Z.x0 + 1));
    const cz = Z.z0 + Math.floor(rng() * (Z.z1 - Z.z0 + 1));
    if (!isSolidCell(cx, cz) && neighborCost[idx(cx, cz)] === 0) return c2w(cx, cz);
  }
  return c2w((Z.x0 + Z.x1) >> 1, (Z.z0 + Z.z1) >> 1);
}

// ---- Procedural textures ----
function canvasTex(size, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function noise(ctx, s, n, alpha, light) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function makeTextures() {
  const sand = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#c9ad7f'; ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 5000, 0.12, false); noise(ctx, s, 3000, 0.1, true);
    ctx.strokeStyle = 'rgba(90,70,40,0.25)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, i * s / 2); ctx.lineTo(s, i * s / 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i * s / 2, 0); ctx.lineTo(i * s / 2, s); ctx.stroke(); }
  });
  const brick = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = '#d8c29a'; ctx.fillRect(0, 0, s, s);
    const rows = 8, bh = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (s / 4);
      for (let b = -1; b < 3; b++) {
        const shade = 190 + Math.floor(Math.random() * 40);
        ctx.fillStyle = `rgb(${shade + 20},${shade},${shade - 40})`;
        ctx.fillRect(b * s / 2 + off + 2, r * bh + 2, s / 2 - 4, bh - 4);
      }
    }
    noise(ctx, s, 4000, 0.12, false);
  });
  const wood = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#9b6a3a'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#8a5c30' : '#a87444'; ctx.fillRect(0, i * s / 8, s, s / 8 - 1); }
    ctx.strokeStyle = '#5e3b1b'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, s - 10, s - 10);
    ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(s - 8, s - 8); ctx.moveTo(s - 8, 8); ctx.lineTo(8, s - 8); ctx.stroke();
    noise(ctx, s, 1500, 0.15, false);
  }, false);
  return { sand, brick, wood };
}

function siteDecal(letter, color) {
  return canvasTex(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = color; ctx.lineWidth = 14; ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color; ctx.font = 'bold 170px Impact, Arial Black, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, s / 2, s / 2 + 8);
  }, false);
}

// ---- Scene construction ----
export function buildMap(scene) {
  const tex = makeTextures();

  // Floor
  tex.sand.repeat.set(W * CELL / 4, H * CELL / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), new THREE.MeshLambertMaterial({ map: tex.sand }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(W * CELL / 2, 0, H * CELL / 2);
  scene.add(floor);

  // Walls: only faces that border non-wall cells (or shorter walls), merged into one geometry
  const pos = [], uv = [], col = [], ind = [];
  const quad = (ax, az, bx, bz, y0, y1, u0) => {
    const base = pos.length / 3, len = Math.hypot(bx - ax, bz - az);
    pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
    uv.push(u0, y0 / 2, u0 + len / 2, y0 / 2, u0 + len / 2, y1 / 2, u0, y1 / 2);
    const b0 = y0 < 0.1 ? 0.62 : 1, b1 = 1;
    col.push(b0, b0, b0, b0, b0, b0, b1, b1, b1, b1, b1, b1);
    ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (cellAt(x, z) !== WALL) continue;
    const h = wallHeight[idx(x, z)], x0 = x * CELL, x1 = x0 + CELL, z0 = z * CELL, z1 = z0 + CELL;
    const side = (nx, nz) => {
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) return -1;
      const c = cellAt(nx, nz);
      if (c !== WALL) return 0;
      return wallHeight[idx(nx, nz)];
    };
    let s;
    if ((s = side(x, z - 1)) >= 0 && s < h) quad(x1, z0, x0, z0, s, h, x0 / 2); // north face
    if ((s = side(x, z + 1)) >= 0 && s < h) quad(x0, z1, x1, z1, s, h, x0 / 2); // south
    if ((s = side(x - 1, z)) >= 0 && s < h) quad(x0, z0, x0, z1, s, h, z0 / 2); // west
    if ((s = side(x + 1, z)) >= 0 && s < h) quad(x1, z1, x1, z0, s, h, z0 / 2); // east
    // top cap (visible from far away when heights differ)
    const base = pos.length / 3;
    pos.push(x0, h, z0, x0, h, z1, x1, h, z1, x1, h, z0);
    uv.push(0, 0, 0, 1, 1, 1, 1, 0); col.push(0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85);
    ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  wg.setIndex(ind); wg.computeVertexNormals();
  scene.add(new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ map: tex.brick, vertexColors: true })));

  // Crates
  const crateCells = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (cellAt(x, z) === CRATE) crateCells.push([x, z]);
  const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.94, CRATE_H, 1.94), new THREE.MeshLambertMaterial({ map: tex.wood }), crateCells.length);
  const m = new THREE.Matrix4();
  crateCells.forEach(([x, z], i) => {
    const p = c2w(x, z);
    m.makeRotationY(((x * 7 + z * 3) % 5 - 2) * 0.01); m.setPosition(p.x, CRATE_H / 2, p.z);
    cm.setMatrixAt(i, m);
  });
  scene.add(cm);

  // Bombsite markers
  for (const [letter, zone, color] of [['A', ZONES.A, '#ff4a3a'], ['B', ZONES.B, '#ff4a3a']]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: siteDecal(letter, color), transparent: true, depthWrite: false }));
    d.rotation.x = -Math.PI / 2;
    const cx = (zone.x0 + zone.x1 + 1) / 2 * CELL, cz = (zone.z0 + zone.z1 + 1) / 2 * CELL;
    d.position.set(cx + (letter === 'A' ? 2 : -1), 0.02, cz + 2);
    scene.add(d);
  }

  // Sky + light
  const sky = canvasTex(64, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#5f9fd8'); g.addColorStop(0.6, '#a9cbe6'); g.addColorStop(1, '#e8d9b8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }, false);
  scene.background = sky;
  scene.fog = new THREE.Fog(0xd9ccb0, 40, 110);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a7355, 1.9));
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.6);
  sun.position.set(30, 60, 20);
  scene.add(sun);
}

// Pre-rendered top-down minimap image
export function renderMinimap(size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), s = size / W;
  ctx.fillStyle = 'rgba(20,20,20,0.85)'; ctx.fillRect(0, 0, size, size);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const v = cellAt(x, z);
    if (v === WALL) continue;
    ctx.fillStyle = v === CRATE ? '#6b5a44' : '#b8a888';
    ctx.fillRect(x * s, z * s, s + 0.5, s + 0.5);
  }
  ctx.font = `bold ${Math.floor(s * 4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const k of ['A', 'B']) {
    const Z = ZONES[k];
    ctx.fillStyle = 'rgba(255,70,50,0.25)';
    ctx.fillRect(Z.x0 * s, Z.z0 * s, (Z.x1 - Z.x0 + 1) * s, (Z.z1 - Z.z0 + 1) * s);
    ctx.fillStyle = '#ff5a40'; ctx.fillText(k, (Z.x0 + Z.x1 + 1) / 2 * s, (Z.z0 + Z.z1 + 1) / 2 * s);
  }
  return c;
}
