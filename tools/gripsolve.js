// Grip solver for the first-person arms (offline tool, not loaded by the game).
//
// Hands are fitted to each gun by measurement instead of by eye:
//  - the gun's real triangle mesh becomes a signed distance field (SDF) in the gun's own space;
//  - the arm's real skin is skinned on the CPU, so penetration and gaps are measured on the skin;
//  - landmarks (trigger face, the top-back of the grip, the handguard) come from the gun's geometry.
// The solve moves each wrist (position and orientation) and closes the fingers against the SDF, and
// the result is baked into assets/weapons/grips.json, which the game applies as-is.
//
// Run it inside the game page (it uses the live arms, gun and view-model placement): see
// tools/README.md.
import * as THREE from '../lib/three.module.min.js';

// ---------------------------------------------------------------- signed distance field of a gun
// Voxelise the gun's surface at `res` metres, flood-fill the outside from the grid boundary (whatever
// isn't outside or surface is inside), then an exact Euclidean distance transform to the surface.
export function gunSDF(gun, res = 0.002, pad = 0.04) {
  gun.updateMatrixWorld(true);
  const inv = gun.matrixWorld.clone().invert(), tris = [];
  const box = new THREE.Box3();
  gun.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index, M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const P = []; for (let i = 0; i < pos.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(M); P.push(v); box.expandByPoint(v); }
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) tris.push(idx ? [P[idx.getX(i)], P[idx.getX(i + 1)], P[idx.getX(i + 2)]] : [P[i], P[i + 1], P[i + 2]]);
  });
  box.expandByScalar(pad);
  const o = box.min.clone(), nx = Math.ceil((box.max.x - o.x) / res) + 1, ny = Math.ceil((box.max.y - o.y) / res) + 1, nz = Math.ceil((box.max.z - o.z) / res) + 1;
  const N = nx * ny * nz, I = (x, y, z) => (z * ny + y) * nx + x;
  const surf = new Uint8Array(N);
  // surface: sample every triangle densely enough that no voxel it crosses is skipped
  const a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [A, B, C] of tris) {
    const L = Math.max(A.distanceTo(B), B.distanceTo(C), C.distanceTo(A)), n = Math.max(1, Math.ceil(L / (res * 0.5)));
    for (let i = 0; i <= n; i++) {
      a.lerpVectors(A, B, i / n); b.lerpVectors(A, C, i / n);
      for (let j = 0; j <= i; j++) {
        p.lerpVectors(a, b, i ? j / i : 0);
        const x = Math.round((p.x - o.x) / res), y = Math.round((p.y - o.y) / res), z = Math.round((p.z - o.z) / res);
        surf[I(x, y, z)] = 1;
      }
    }
  }
  // outside: flood from the boundary through non-surface voxels
  const out = new Uint8Array(N), q = new Int32Array(N); let qh = 0, qt = 0;
  const push = (x, y, z) => { const k = I(x, y, z); if (!surf[k] && !out[k]) { out[k] = 1; q[qt++] = k; } };
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) { push(0, y, z); push(nx - 1, y, z); }
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) { push(x, 0, z); push(x, ny - 1, z); }
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { push(x, y, 0); push(x, y, nz - 1); }
  while (qh < qt) {
    const k = q[qh++], x = k % nx, y = ((k / nx) | 0) % ny, z = (k / (nx * ny)) | 0;
    if (x > 0) push(x - 1, y, z); if (x < nx - 1) push(x + 1, y, z);
    if (y > 0) push(x, y - 1, z); if (y < ny - 1) push(x, y + 1, z);
    if (z > 0) push(x, y, z - 1); if (z < nz - 1) push(x, y, z + 1);
  }
  // squared distance (in voxels) to the nearest surface voxel: Felzenszwalb's separable transform
  const INF = 1e20, d = new Float64Array(N);
  for (let k = 0; k < N; k++) d[k] = surf[k] ? 0 : INF;
  const maxn = Math.max(nx, ny, nz), f = new Float64Array(maxn), g1 = new Float64Array(maxn), v = new Int32Array(maxn), zz = new Float64Array(maxn + 1);
  const pass = (n, get, set) => {
    for (let i = 0; i < n; i++) f[i] = get(i);
    let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF;
    for (let qq = 1; qq < n; qq++) {
      let s = ((f[qq] + qq * qq) - (f[v[k]] + v[k] * v[k])) / (2 * qq - 2 * v[k]);
      while (s <= zz[k]) { k--; s = ((f[qq] + qq * qq) - (f[v[k]] + v[k] * v[k])) / (2 * qq - 2 * v[k]); }
      k++; v[k] = qq; zz[k] = s; zz[k + 1] = INF;
    }
    k = 0;
    for (let qq = 0; qq < n; qq++) { while (zz[k + 1] < qq) k++; g1[qq] = (qq - v[k]) * (qq - v[k]) + f[v[k]]; }
    for (let i = 0; i < n; i++) set(i, g1[i]);
  };
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) { const base = I(0, y, z); pass(nx, (i) => d[base + i], (i, val) => { d[base + i] = val; }); }
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) { const base = I(x, 0, z); pass(ny, (i) => d[base + i * nx], (i, val) => { d[base + i * nx] = val; }); }
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const base = I(x, y, 0); pass(nz, (i) => d[base + i * nx * ny], (i, val) => { d[base + i * nx * ny] = val; }); }
  const sdf = new Float32Array(N);
  for (let k = 0; k < N; k++) { const dist = Math.sqrt(d[k]) * res; sdf[k] = surf[k] ? 0 : out[k] ? dist : -dist; }
  const inside = qt < N ? N - qt - surf.reduce((s, x) => s + x, 0) : 0;
  return { o, res, nx, ny, nz, sdf, stats: { tris: tris.length, cells: N, inside } };
}

// trilinear SDF lookup at a gun-space point (outside the grid: far away)
export function sdfAt(S, p) {
  const fx = (p.x - S.o.x) / S.res, fy = (p.y - S.o.y) / S.res, fz = (p.z - S.o.z) / S.res;
  if (fx < 0 || fy < 0 || fz < 0 || fx >= S.nx - 1 || fy >= S.ny - 1 || fz >= S.nz - 1) return 1;
  const x = fx | 0, y = fy | 0, z = fz | 0, u = fx - x, v = fy - y, w = fz - z, nx = S.nx, nxy = S.nx * S.ny, k = z * nxy + y * nx + x, D = S.sdf;
  const c00 = D[k] * (1 - u) + D[k + 1] * u, c10 = D[k + nx] * (1 - u) + D[k + nx + 1] * u;
  const c01 = D[k + nxy] * (1 - u) + D[k + nxy + 1] * u, c11 = D[k + nxy + nx] * (1 - u) + D[k + nxy + nx + 1] * u;
  return (c00 * (1 - v) + c10 * v) * (1 - w) + (c01 * (1 - v) + c11 * v) * w;
}

// ---------------------------------------------------------------- the arm's skin
// Vertices of one side's hand and forearm, grouped by the bone that drives them most. `pad` marks the
// ones on the gripping side of each finger segment (facing the way that segment closes).
export function handSkin(arms, s) {
  let mesh = null; arms.root.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  const bones = mesh.skeleton.bones.map((b) => b.name.replace(/_\d+$/, ''));
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, nrm = mesh.geometry.attributes.normal;
  const groups = {}, verts = [];
  for (let i = 0; i < si.count; i++) {
    let best = 0, bw = -1; for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; best = si.getComponent(i, j); } }
    const name = bones[best];
    if (!name.startsWith(s + '_') || name === `${s}_arm`) continue;
    (groups[name] || (groups[name] = [])).push(verts.length);
    verts.push({ i, bone: name });
  }
  // gripping side: in the rest pose, the vertex normal points the way the segment curls (toward the palm)
  const rest = arms.rest[s], tmp = new THREE.Vector3(), n = new THREE.Vector3();
  arms.root.updateMatrixWorld(true);
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const palmN = new THREE.Vector3();
  { const P = (b) => arms.b[b].getWorldPosition(new THREE.Vector3()), wr = P(`${s}_wrist`);
    palmN.crossVectors(P(`${s}_point1`).sub(wr), P(`${s}_pink1`).sub(wr)).normalize(); if (s === 'L') palmN.negate(); }
  for (const v of verts) {
    n.fromBufferAttribute(nrm, v.i).applyMatrix3(nm).normalize();
    v.pad = n.dot(palmN) > 0.35;
  }
  return { mesh, verts, groups, pos: new Float32Array(verts.length * 3), tmp, rest };
}

// Skin the hand's vertices into gun space (call after posing the hand)
const _v = new THREE.Vector3(), _gi = new THREE.Matrix4();
export function skinInto(H, gun, only) {
  _gi.copy(gun.matrixWorld).invert().multiply(H.mesh.matrixWorld);
  const list = only ? only : H.verts.keys();
  for (const k of list) {
    H.mesh.getVertexPosition(H.verts[k].i, _v).applyMatrix4(_gi);
    H.pos[k * 3] = _v.x; H.pos[k * 3 + 1] = _v.y; H.pos[k * 3 + 2] = _v.z;
  }
}

// How well a posed hand sits on the gun (all distances in mm)
export function gripMetrics(H, S) {
  const p = new THREE.Vector3(), seg = {};
  let pen = 0, maxPen = 0, sumPen = 0;
  for (let k = 0; k < H.verts.length; k++) {
    p.set(H.pos[k * 3], H.pos[k * 3 + 1], H.pos[k * 3 + 2]);
    const d = sdfAt(S, p) * 1000, v = H.verts[k];
    if (d < -1) { pen++; sumPen -= d; maxPen = Math.max(maxPen, -d); }
    const g = seg[v.bone] || (seg[v.bone] = { min: Infinity, pad: Infinity, n: 0 });
    g.min = Math.min(g.min, d); if (v.pad) g.pad = Math.min(g.pad, d); g.n++;
  }
  const r = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
  const segs = {}; for (const b in seg) segs[b.slice(2)] = { min: r(seg[b].min), pad: r(seg[b].pad) };
  return { penetrating: pen, of: H.verts.length, maxDepth: r(maxPen), meanDepth: r(pen ? sumPen / pen : 0), segs };
}

// ---------------------------------------------------------------- landmarks
// The trigger face, from the gun's side silhouette (read off the SDF: a cell is solid if any voxel across
// the gun at that height and depth is): the trigger guard's opening is a hole in the silhouette near the
// grip; the trigger is the first solid met going back from the opening's front edge, a little below the
// opening's middle.
export function findTrigger(S, debug = false) {
  const r = S.res, z0 = Math.max(-0.14, S.o.z), y0 = Math.max(-0.08, S.o.y);
  const NZ = Math.min(Math.round((0.06 - z0) / r), S.nz - 1 - Math.round((z0 - S.o.z) / r)), NY = Math.min(Math.round((0.07 - y0) / r), S.ny - 1 - Math.round((y0 - S.o.y) / r));
  const occ = new Uint8Array(NZ * NY), gz = Math.round((z0 - S.o.z) / r), gy = Math.round((y0 - S.o.y) / r);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NZ; i++) {
    const base = ((gz + i) * S.ny + gy + j) * S.nx;
    for (let x = 0; x < S.nx; x++) if (S.sdf[base + x] <= r * 0.5) { occ[j * NZ + i] = 1; break; }
  }
  // background connected to the border is outside; other background components are holes
  const lab = new Int32Array(NZ * NY).fill(-1), holes = [];
  const flood = (s, id) => { const st = [s]; lab[s] = id; const cells = [];
    while (st.length) { const k = st.pop(); cells.push(k); const i = k % NZ, j = (k / NZ) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NZ || b >= NY) continue; const n = b * NZ + a; if (!occ[n] && lab[n] < 0) { lab[n] = id; st.push(n); } } }
    return cells; };
  for (let i = 0; i < NZ; i++) for (const j of [0, NY - 1]) { const k = j * NZ + i; if (!occ[k] && lab[k] < 0) flood(k, 0); }
  for (let j = 0; j < NY; j++) for (const i of [0, NZ - 1]) { const k = j * NZ + i; if (!occ[k] && lab[k] < 0) flood(k, 0); }
  let id = 1;
  for (let k = 0; k < NZ * NY; k++) if (!occ[k] && lab[k] < 0) {
    const cells = flood(k, id++); if (cells.length * r * r < 0.00006) continue;
    let zmin = 1, zmax = -1, ymin = 1, ymax = -1; for (const c of cells) { const z = z0 + (c % NZ) * r, y = y0 + ((c / NZ) | 0) * r; zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
    holes.push({ id: id - 1, n: cells.length, zmin, zmax, ymin, ymax });
  }
  // the trigger guard: the biggest hole just in front of the grip (the origin). A trigger that splits
  // the opening leaves a sliver behind it; the front part is the one the finger goes into.
  const cand = holes.filter((h) => h.zmax < 0.02 && h.zmax > -0.1 && h.ymax > -0.03 && h.ymin < 0.05 && h.n * r * r < 0.0025);
  if (!cand.length) return null;
  cand.sort((a, b) => b.n - a.n);
  const h = cand[0], yRow = h.ymin + (h.ymax - h.ymin) * 0.55, j = Math.round((yRow - y0) / r);
  let face = null, entered = false;
  for (let i = Math.round((h.zmin - z0) / r); i < NZ; i++) {
    const k = j * NZ + i;
    if (lab[k] === h.id) { entered = true; continue; }
    if (entered && occ[k]) { face = z0 + i * r; break; }
  }
  const ascii = [];
  if (debug) for (let jj = NY - 1; jj >= 0; jj -= 2) { let row = ''; for (let i = 0; i < NZ; i += 2) { const k = jj * NZ + i; row += occ[k] ? '#' : lab[k] === h.id ? 'o' : lab[k] > 0 ? ',' : '.'; } ascii.push(row); }
  return face == null ? null : { face: [0, yRow, face], hole: h, ascii };
}

// ---------------------------------------------------------------- solver
// A compact CMA-ES (Hansen): minimises f over R^n from x0 with per-dimension step sizes.
export function cmaes(f, x0, sd, { iters = 120, lambda, seed = 1 } = {}) {
  const n = x0.length; lambda = lambda || 4 + Math.floor(3 * Math.log(n)); const mu = lambda >> 1;
  let rs = seed; const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const w = []; for (let i = 0; i < mu; i++) w.push(Math.log(mu + 0.5) - Math.log(i + 1)); const ws = w.reduce((a, b) => a + b); for (let i = 0; i < mu; i++) w[i] /= ws;
  const mueff = 1 / w.reduce((a, b) => a + b * b, 0);
  const cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n), cs = (mueff + 2) / (n + mueff + 5), c1 = 2 / ((n + 1.3) ** 2 + mueff);
  const cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff)), damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs;
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  let m = x0.slice(), sigma = 1; const pc = new Array(n).fill(0), ps = new Array(n).fill(0);
  let C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  let B = C.map((r) => r.slice()), D = new Array(n).fill(1);
  const eig = () => {   // Jacobi eigen-decomposition of the symmetric C
    const A = C.map((r) => r.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 50; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j]; if (off < 1e-18) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-15) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    B = V; D = A.map((r, i) => Math.sqrt(Math.max(1e-20, r[i])));
  };
  let best = { x: x0.slice(), f: f(x0) }, evals = 1;
  for (let it = 0; it < iters; it++) {
    const pop = [];
    for (let k = 0; k < lambda; k++) {
      const z = Array.from({ length: n }, gauss), y = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) y[i] += B[i][j] * D[j] * z[j];
      const x = m.map((mi, i) => mi + sigma * sd[i] * y[i]), fx = f(x); evals++;
      pop.push({ x, y, fx }); if (fx < best.f) best = { x: x.slice(), f: fx };
    }
    pop.sort((a, b) => a.fx - b.fx);
    const yw = new Array(n).fill(0); for (let i = 0; i < mu; i++) for (let d = 0; d < n; d++) yw[d] += w[i] * pop[i].y[d];
    m = m.map((mi, d) => mi + sigma * sd[d] * yw[d]);
    // C^(-1/2) yw
    const t1 = new Array(n).fill(0); for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < n; i++) s += B[i][j] * yw[i]; t1[j] = s / D[j]; }
    const cinv = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cinv[i] += B[i][j] * t1[j];
    for (let d = 0; d < n; d++) ps[d] = (1 - cs) * ps[d] + Math.sqrt(cs * (2 - cs) * mueff) * cinv[d];
    const psn = Math.sqrt(ps.reduce((a, b) => a + b * b, 0)), hs = psn / Math.sqrt(1 - (1 - cs) ** (2 * (it + 1))) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
    for (let d = 0; d < n; d++) pc[d] = (1 - cc) * pc[d] + hs * Math.sqrt(cc * (2 - cc) * mueff) * yw[d];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let rmu = 0; for (let k = 0; k < mu; k++) rmu += w[k] * pop[k].y[i] * pop[k].y[j];
      C[i][j] = (1 - c1 - cmu) * C[i][j] + c1 * (pc[i] * pc[j] + (1 - hs) * cc * (2 - cc) * C[i][j]) + cmu * rmu;
    }
    sigma *= Math.exp((cs / damps) * (psn / chiN - 1));
    if (it % 5 === 4) eig();
    if (sigma < 1e-3) break;
  }
  return { x: best.x, f: best.f, evals };
}

// ---------------------------------------------------------------- one hand
const FING = ['point', 'middle', 'ring', 'pink', 'thumb'];
const rotV = (v, axis, a) => v.clone().applyAxisAngle(axis, a);

// Solves one hand on a gun. `spec` is the game's hand spec (gun space): its wrist, fwd and palm are the
// starting guess, its pole, thumb/index aims and fixed curls are kept. Options:
//   trigger: gun-space point the index pad should rest on (the index is then aimed, not closed shut)
//   other:   capsules of the other hand (world space) this hand must not pass through
//   foreZ:   gun-space z the palm should be centred on (support hand on a handguard)
//   thumbAxis: gun-space direction an aimed thumb should lie along (thumbs-forward pistol grip)
//   palmBox: gun-space box the palm's centre should be in (the handguard mark, a bottle's body, a handle)
//   palmAxis: gun-space direction the palm should face (up, for a hand cradling a handguard)
//   fwdAxis: gun-space direction the fingers should point from the wrist (forward, round a grenade)
//   visible: gun-space points the player must be able to see past the hand (along a grenade's body)
// The fingers also prefer a closed power-grip curl (they still stop where the skin meets the gun), so a
// hand wraps what it holds instead of pressing flat against its side.
export class HandSolver {
  constructor(arms, gun, S, s, spec, opts = {}) {
    Object.assign(this, { A: arms, gun, S, s, spec, opts });
    this.H = handSkin(arms, s);
    this.M = gun.matrixWorld.clone(); this.Mi = this.M.clone().invert();
    const R = arms.rest[s];
    this.chains = {}; for (const f of FING) this.chains[f] = [1, 2, 3].map((k) => R.curl.find((c) => c.f === f && c.k === k)).filter(Boolean);
    const G = this.H.groups, V = this.H.verts;
    this.segVerts = {}; for (const f of FING) for (let k = 1; k <= 3; k++) this.segVerts[f + k] = G[`${s}_${f}${k}`] || [];
    this.palmVerts = [...(G[`${s}_palm`] || []), ...(G[`${s}_wrist`] || []).filter((k) => V[k].pad)];
    this.all = V.map((_, k) => k);
    this.aimThumb = !!spec.thumbDir; this.aimIndex = !!opts.trigger;
    // parameters: wrist offset (cm), hand turn (rad), thumb aim (yaw, pitch), index aim (yaw, pitch), and
    // where the (off-screen) shoulder sits (cm): the forearm's line comes from it, so it sets the wrist bend
    this.anchor0 = (opts.anchor || arms.anchor[s]).slice();
    this.n = 6 + (this.aimThumb ? 2 : 0) + (this.aimIndex ? 2 : 0) + 3;
    this.sd = [0.8, 0.8, 0.8, 0.12, 0.12, 0.12, ...(this.aimThumb ? [0.2, 0.2] : []), ...(this.aimIndex ? [0.2, 0.2] : []), 8, 8, 8];
    const fwd0 = new THREE.Vector3(...spec.fwd).normalize();
    this.base = { wrist: new THREE.Vector3(...spec.wrist), fwd: fwd0, palm: new THREE.Vector3(...spec.palm).normalize(),
      thumb: spec.thumbDir ? new THREE.Vector3(...spec.thumbDir).normalize() : null,
      index: spec.pointDir ? new THREE.Vector3(...spec.pointDir).normalize() : fwd0.clone() };
    this.p = new THREE.Vector3();
    // the hand's line in the forearm's frame when the wrist is at rest (neutral): bend is measured from it
    const wb = arms.b[`${s}_wrist`], keep = wb.quaternion.clone();
    wb.quaternion.copy(arms.rl[`${s}_wrist`]); arms.b[`${s}_arm`].updateWorldMatrix(true, true);
    this.neutral = this.handLine();
    wb.quaternion.copy(keep); arms.b[`${s}_arm`].updateWorldMatrix(true, true);
  }

  handLine() {   // wrist -> middle knuckle, in the forearm bone's frame
    const A = this.A, s = this.s, Wp = (n) => A.b[n].getWorldPosition(new THREE.Vector3());
    const q = A.b[`${s}_elbow`].getWorldQuaternion(new THREE.Quaternion()).invert();
    return Wp(`${s}_middle1`).sub(Wp(`${s}_wrist`)).normalize().applyQuaternion(q);
  }

  // hand pose (gun space) for a parameter vector
  decode(x) {
    const B = this.base, r = new THREE.Vector3(x[3], x[4], x[5]), ang = r.length();
    const q = ang > 1e-9 ? new THREE.Quaternion().setFromAxisAngle(r.clone().divideScalar(ang), ang) : new THREE.Quaternion();
    const fwd = B.fwd.clone().applyQuaternion(q), palm = B.palm.clone().applyQuaternion(q);
    let i = 6; const aim = (d0) => {
      const d = d0.clone().applyQuaternion(q), side = new THREE.Vector3().crossVectors(palm, d).normalize();
      const out = rotV(rotV(d, palm, x[i]), side, x[i + 1]); i += 2; return out.normalize(); };
    const thumbDir = this.aimThumb ? aim(B.thumb) : null, pointDir = this.aimIndex ? aim(B.index) : null;
    const anchor = this.anchor0.map((a, k) => a + x[i + k] * 0.01);
    return { wrist: B.wrist.clone().add(new THREE.Vector3(x[0], x[1], x[2]).multiplyScalar(0.01)), fwd, palm, thumbDir, pointDir, anchor };
  }

  sdfOf(list) { let m = Infinity; for (const k of list) { const d = this.dist(k); if (d < m) m = d; } return m; }
  // signed distance (mm) of a skinned vertex to the gun, and to the other hand's capsules
  dist(k) {
    const P = this.H.pos, p = this.p.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
    let d = sdfAt(this.S, p) * 1000;
    if (this.opts.other) {
      const w = p.clone().applyMatrix4(this.M);
      for (const c of this.opts.other) {
        const ab = c.q.clone().sub(c.p), t = Math.max(0, Math.min(1, w.clone().sub(c.p).dot(ab) / ab.lengthSq()));
        const e = (w.distanceTo(c.p.clone().addScaledVector(ab, t)) - c.r) * 1000; if (e < d) d = e;
      }
    }
    return d;
  }

  // pose the arm, then close each finger until its skin touches (bisection on the closing amount)
  pose(P) {
    const A = this.A, s = this.s, h = this.spec, M = this.M;
    const W = (v) => v.clone().applyMatrix4(M), D = (v) => v.clone().transformDirection(M);
    const curls = {};
    for (const f of FING) curls[f] = (h.fixed?.[f] || h.start?.[f] || [0, 0, 0]).slice();
    const w = W(P.wrist);
    A.anchor = { ...A.anchor, [s]: P.anchor };
    A.hand(s, w, D(P.fwd), D(P.palm), w.clone().add(new THREE.Vector3(...h.pole)), (f, k) => curls[f][k - 1] || 0, P.thumbDir && D(P.thumbDir), P.pointDir && D(P.pointDir));
    A.b[`${s}_arm`].updateWorldMatrix(true, true);
    const MAX = { thumb: [1.1, 1.1, 0.9], other: [1.6, 1.8, 1.4] };
    for (const f of FING) {
      if (h.fixed?.[f]) continue;
      const ch = this.chains[f], from = (f === 'thumb' && P.thumbDir) || (f === 'point' && P.pointDir) ? 1 : 0;
      const max = f === 'thumb' ? MAX.thumb : MAX.other, wgt = f === 'thumb' ? [1, 0.9, 0.7] : [1, 1.15, 0.85];
      const segs = [1, 2, 3].map((k) => this.segVerts[f + k]);
      const set = (i, a) => { const c = ch[i]; c.bone.quaternion.copy(c.rest); c.bone.rotateOnAxis(c.axis, a); c.bone.updateWorldMatrix(false, true); };
      const touch = (j0) => {   // does a segment from j0 on make new contact?
        for (let j = j0; j < 3; j++) { skinInto(this.H, this.gun, segs[j]); for (const k of segs[j]) if (!base.has(k) && this.dist(k) < 0.4) return true; }
        return false;
      };
      const ang = curls[f];
      for (let i = from; i < 3; i++) set(i, ang[i]);
      const base = new Set(); for (let j = from; j < 3; j++) { skinInto(this.H, this.gun, segs[j]); for (const k of segs[j]) if (this.dist(k) < 0.4) base.add(k); }
      // 1) the whole finger closes together until any part touches
      const at = (t) => ang.map((a, i) => (i < from ? a : Math.min(max[i], a + t * wgt[i] * 1.8)));
      let lo = 0, hi = 1;
      at(1).forEach((a, i) => { if (i >= from) set(i, a); });
      if (touch(from)) {
        for (let it = 0; it < 7; it++) { const mid = (lo + hi) / 2; at(mid).forEach((a, i) => { if (i >= from) set(i, a); }); if (touch(from)) hi = mid; else lo = mid; }
      } else lo = 1;
      const a1 = at(lo); a1.forEach((a, i) => { if (i >= from) set(i, a); });
      // 2) the joints past the one that touched keep closing until they touch too
      let hitJ = 3; for (let j = from; j < 3; j++) { skinInto(this.H, this.gun, segs[j]); if (segs[j].some((k) => !base.has(k) && this.dist(k) < 1.2)) { hitJ = j; break; } }
      for (let i = hitJ + 1; i < 3; i++) {
        let l = a1[i], u = max[i]; set(i, u);
        if (touch(i)) { for (let it = 0; it < 6; it++) { const mid = (l + u) / 2; set(i, mid); if (touch(i)) u = mid; else l = mid; } a1[i] = l; } else a1[i] = u;
        set(i, a1[i]);
      }
      curls[f] = a1.map((a) => +a.toFixed(3));
    }
    skinInto(this.H, this.gun);
    return curls;
  }

  energy(x) {
    const P = this.decode(x), curls = this.pose(P), s = this.s, o = this.opts, A = this.A;
    let pen = 0; for (const k of this.all) { const d = this.dist(k); if (d < -0.3) pen += (d + 0.3) * (d + 0.3); }
    const palm = this.sdfOf(this.palmVerts);
    let gaps = 0;
    for (const f of FING) {
      if (this.spec.fixed?.[f] || (f === 'point' && this.aimIndex)) continue;
      const g = this.sdfOf(this.segVerts[f + 3].filter((k) => this.H.verts[k].pad)); if (g > 1.5) gaps += (g - 1.5) ** 2;
    }
    let trig = 0;
    if (o.trigger) {
      const pad = this.segVerts.point3.filter((k) => this.H.verts[k].pad), c = new THREE.Vector3();
      for (const k of pad) c.add(this.p.set(this.H.pos[k * 3], this.H.pos[k * 3 + 1], this.H.pos[k * 3 + 2])); c.divideScalar(pad.length || 1);
      trig = (c.distanceTo(new THREE.Vector3(...o.trigger)) * 1000) ** 2;
    }
    let wrap = 0; const WRAP = [0.8, 1.0, 0.7];
    for (const f of ['point', 'middle', 'ring', 'pink']) {
      if (this.spec.fixed?.[f] || (f === 'point' && this.aimIndex)) continue;
      for (let j = 0; j < 3; j++) wrap += Math.max(0, WRAP[j] - curls[f][j]) ** 2;
    }
    let thumb = 0;
    if (o.thumbAxis && this.P0thumb !== false && this.decode(x).thumbDir) thumb = 1 - this.decode(x).thumbDir.dot(new THREE.Vector3(...o.thumbAxis).normalize());
    let pbox = 0, pax = 0;
    if (o.palmBox) {
      const c = [0, 0, 0]; for (const k of this.palmVerts) for (let j = 0; j < 3; j++) c[j] += this.H.pos[k * 3 + j] / this.palmVerts.length;
      for (let j = 0; j < 3; j++) pbox += ((Math.max(0, o.palmBox.min[j] - c[j]) + Math.max(0, c[j] - o.palmBox.max[j])) * 1000) ** 2;
    }
    if (o.palmAxis) pax = 1 - P.palm.dot(new THREE.Vector3(...o.palmAxis).normalize());
    if (o.fwdAxis) pax += 1 - P.fwd.dot(new THREE.Vector3(...o.fwdAxis).normalize());
    // sight lines from the camera (the view's origin) to each point: blocked if skin comes within 8 mm (the
    // skin's vertices are about that far apart)
    let vis = 0;
    if (o.visible) {
      const C = new THREE.Vector3().applyMatrix4(this.Mi), Hp = this.H.pos, n = this.H.verts.length;
      for (const q of o.visible) {
        const dx = q[0] - C.x, dy = q[1] - C.y, dz = q[2] - C.z, L2 = dx * dx + dy * dy + dz * dz;
        for (let k = 0; k < n; k++) {
          const vx = Hp[k * 3] - C.x, vy = Hp[k * 3 + 1] - C.y, vz = Hp[k * 3 + 2] - C.z, t = (vx * dx + vy * dy + vz * dz) / L2;
          if (t <= 0 || t >= 0.97) continue;
          const ex = vx - t * dx, ey = vy - t * dy, ez = vz - t * dz;
          if (ex * ex + ey * ey + ez * ez < 6.4e-5) { vis++; break; }
        }
      }
      vis /= o.visible.length;
    }
    let fore = 0;
    if (o.foreZ != null) {
      let z = 0; for (const k of this.palmVerts) z += this.H.pos[k * 3 + 2]; z /= this.palmVerts.length;
      fore = ((z - o.foreZ) * 1000) ** 2;
    }
    // wrist comfort: how far the wrist bends away from neutral (flexion and sideways deviation)
    const bend = Math.acos(Math.max(-1, Math.min(1, this.handLine().dot(this.neutral)))) * 180 / Math.PI;
    const reg = (x[0] ** 2 + x[1] ** 2 + x[2] ** 2) * 0.2 + (x[3] ** 2 + x[4] ** 2 + x[5] ** 2) * 20;
    // the shoulder stays below the screen, so the arm rises from the bottom as a view model's does (a soft
    // wall), and it may drift a little to ease the wrist
    const an = P.anchor, na = this.n - 3, off = Math.max(0, an[1] + 0.4) * 1000 + Math.max(0, an[2] - 0.2) * 1000;
    const areg = (x[na] ** 2 + x[na + 1] ** 2 + x[na + 2] ** 2) * 0.05 + off * off;
    const E = pen + 3 * Math.max(0, palm - 1) ** 2 + 0.3 * gaps + 2.0 * trig + (o.other ? 50 : 15) * wrap + 300 * thumb + 0.5 * pbox + 80 * pax + 150 * vis + 0.05 * fore + 0.08 * Math.max(0, bend - 45) ** 2 + reg + areg;
    this.last = { E, pen, palm, gaps, wrap, thumb, pbox: Math.sqrt(pbox), pax, vis, trig: Math.sqrt(trig), fore: Math.sqrt(fore), bend, curls, P };
    return E;
  }

  solve(opts = {}) {
    const x0 = new Array(this.n).fill(0), e0 = this.energy(x0), start = this.last;
    const r = cmaes((x) => this.energy(x), x0, this.sd, { iters: opts.iters || 80, seed: opts.seed || 7 });
    this.energy(r.x);
    const L = this.last, P = L.P, a = (v) => (v ? v.toArray().map((u) => +u.toFixed(5)) : undefined);
    return {
      start: { E: e0, pen: start.pen, palm: start.palm, trig: start.trig, bend: start.bend },
      end: { E: L.E, pen: L.pen, palm: L.palm, gaps: L.gaps, wrap: L.wrap, thumb: L.thumb, pbox: L.pbox, pax: L.pax, vis: L.vis, trig: L.trig, fore: L.fore, bend: L.bend }, evals: r.evals,
      grip: { anchor: P.anchor.map((u) => +u.toFixed(4)), wrist: a(P.wrist), fwd: a(P.fwd), palm: a(P.palm), pole: this.spec.pole, thumbDir: a(P.thumbDir), pointDir: a(P.pointDir), curl: L.curls },
    };
  }
}
