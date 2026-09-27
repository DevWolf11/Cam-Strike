import * as THREE from '../lib/three.module.min.js';
import { MAT } from './world.js';
import { GeoBuilder } from './geom.js';
import { signTexture, siteDecal, radialTex } from './textures.js';
import { makePhotoSky, makeSkyline } from './sky.js';
import { surfMaterial, propModel, loadProp } from './mapassets.js';
import { SKIES } from './maps/skies.js';
import { buildKit } from './mapkit.js';
import { PROP_TRIS } from './maps/propsizes.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CHUNK = 48, PROP_CHUNK = 80;     // meters: static geometry is split so off-screen parts are culled

// A GeoBuilder split into square chunks by position (same drawing API)
class Chunked {
  constructor() { this.parts = new Map(); this.count = 0; }
  at(x, z) {
    const k = Math.floor(x / CHUNK) * 1000 + Math.floor(z / CHUNK);
    let b = this.parts.get(k);
    if (!b) this.parts.set(k, (b = new GeoBuilder()));
    this.count++;
    return b;
  }
  quad(a, b, c, d, ...r) { this.at((a.x + c.x) / 2, (a.z + c.z) / 2).quad(a, b, c, d, ...r); return this; }
  box(w, h, d, x, y, z, ...r) { this.at(x, z).box(w, h, d, x, y, z, ...r); return this; }
  wbox(w, h, d, x, y, z, ...r) { this.at(x, z).wbox(w, h, d, x, y, z, ...r); return this; }
  cyl(r0, r1, h, x, y, z, ...r) { this.at(x, z).cyl(r0, r1, h, x, y, z, ...r); return this; }
  wcyl(r0, r1, h, x, y, z, ...r) { this.at(x, z).wcyl(r0, r1, h, x, y, z, ...r); return this; }
  sphere(rad, x, y, z, ...r) { this.at(x, z).sphere(rad, x, y, z, ...r); return this; }
  lathe(pts, x, y, z, ...r) { this.at(x, z).lathe(pts, x, y, z, ...r); return this; }
  beam(a, b, ...r) { this.at((a[0] + b[0]) / 2, (a[2] + b[2]) / 2).beam(a, b, ...r); return this; }
  // One geometry per chunk for heavy builders (worth culling); light ones merge into one mesh
  // so they cost a single draw call.
  build(minTris = 12000) {
    const parts = [...this.parts.values()].filter((b) => b.count);
    const tris = parts.reduce((n, b) => n + b.ind.length / 3, 0);
    if (tris >= minTris) return parts.map((b) => b.build());
    const all = new GeoBuilder();
    for (const b of parts) {
      const base = all.count;
      all.pos.push(...b.pos); all.nor.push(...b.nor); all.uv.push(...b.uv); all.col.push(...b.col);
      for (const i of b.ind) all.ind.push(base + i);
      all.count += b.count;
    }
    return [all.build()];
  }
}

// Builds every static mesh for a map. Returns the list of objects added to the scene.
// Surfaces are photographic textures (see mapassets.js) with UVs in meters; the facade kit
// (mapkit.js) dresses walls and rooftops; props are real models drawn as instanced meshes.
export function buildMap(scene, def, quality = 'medium') {
  const { w, h } = def, T = def.theme, TR = T.trim || {};
  const INDOOR = T.indoor ?? 0.72;       // brightness of roofed areas (they only get sky light)
  const I = (x, z) => z * w + x;
  const inb = (x, z) => x >= 0 && z >= 0 && x < w && z < h;
  const wall = (x, z) => !inb(x, z) || def.solid[I(x, z)] === 1;
  const hgt = (x, z) => (wall(x, z) ? 99 : def.height[I(x, z)]);
  const base = (x, z) => (wall(x, z) ? 0 : def.base[I(x, z)]);
  const roof = (x, z) => (wall(x, z) ? 0 : def.roof[I(x, z)]);
  const wallTop = (x, z) => (inb(x, z) ? def.wallH[I(x, z)] : T.wallH ?? 6);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const added = [];
  const builders = new Map();
  const S = (name) => { if (!builders.has(name)) builders.set(name, new Chunked()); return builders.get(name); };
  const details = new Chunked(), glow = new Chunked();
  const hash = (x, z, k = 0) => { const n = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return n - Math.floor(n); };
  const inst = new Map();
  // Queue an instance of a prop model. ry rotates around Y; s scales uniformly.
  const place = (model, x, y, z, ry = 0, s = 1, color) => {
    const key = `${model}|${Math.floor(x / PROP_CHUNK)},${Math.floor(z / PROP_CHUNK)}`;      // regrouped below if light
    if (!inst.has(key)) inst.set(key, []);
    const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), ry), V(s, s, s));
    inst.get(key).push({ m, color });
  };

  const wallSurf = (wm) => T.walls[wm] || T.walls[0];
  const floorSurf = (m) => (m === MAT.CRATE ? 'crate' : m === MAT.CONTAINER ? 'container_grey' : m === MAT.LOWWALL ? (TR.lowwall || T.walls[0]) : (T.floors[m] || T.floors[MAT.GROUND]));
  const sideSurf = (m) => (m === MAT.CRATE ? 'crate' : m === MAT.CONTAINER ? 'container_grey' : m === MAT.LOWWALL ? (TR.lowwall || T.walls[0]) : m === MAT.METAL ? (T.floors[MAT.METAL] || TR.ledge || T.walls[0]) : (TR.ledge || T.walls[0]));
  const cellColor = (i) => def.color.get(i) ?? 0xffffff;

  // Vertical face on the edge of cell (x, z) toward (dx, dz). UVs in meters: u along the edge, v = height.
  const face = (b, x, z, dx, dz, y0, y1, color, shadeBot = 0.62, shadeTop = 1) => {
    const cx = x + 0.5 + dx * 0.5, cz = z + 0.5 + dz * 0.5, ex = dz, ez = -dx;
    const p0 = [cx - ex * 0.5, cz - ez * 0.5], p1 = [cx + ex * 0.5, cz + ez * 0.5];
    const u0 = p0[0] * ex + p0[1] * ez, u1 = u0 + 1;
    b.quad(V(p0[0], y0, p0[1]), V(p1[0], y0, p1[1]), V(p1[0], y1, p1[1]), V(p0[0], y1, p0[1]), color, [u0, y0, u1, y0, u1, y1, u0, y1], [shadeBot, shadeBot, shadeTop, shadeTop]);
  };

  // ---------- floors & raised blocks ----------
  const aoCorner = (x, z, y) => {
    let n = 0;
    for (const [ox, oz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const cx = x + ox, cz = z + oz; if (wall(cx, cz) || hgt(cx, cz) > y + 0.3) n++; }
    return 1 - 0.13 * n;
  };
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (wall(x, z)) continue;
    const i = I(x, z), m = def.mat[i];
    const top = m === MAT.HIDDEN ? def.base[i] : def.height[i];
    const topM = m === MAT.HIDDEN ? (def.floorMat?.[i] ?? MAT.GROUND) : m;
    const indoor = def.roof[i] > 0 ? INDOOR : 1;
    const tn = floorSurf(topM), col = topM === MAT.CONTAINER ? cellColor(i) : 0xffffff;
    const s = [aoCorner(x, z + 1, top), aoCorner(x + 1, z + 1, top), aoCorner(x + 1, z, top), aoCorner(x, z, top)].map((v) => v * indoor);
    S(tn).quad(V(x, top, z + 1), V(x + 1, top, z + 1), V(x + 1, top, z), V(x, top, z), col, [x, z + 1, x + 1, z + 1, x + 1, z, x, z], s);
    if (m === MAT.HIDDEN) continue;
    // sides toward lower neighbours
    const cur = def.height[i];
    if (cur <= 0) continue;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (wall(nx, nz)) continue;
      const nh = def.mat[I(nx, nz)] === MAT.HIDDEN ? def.base[I(nx, nz)] : hgt(nx, nz);
      if (nh >= cur - 1e-3) continue;
      const ind = def.roof[I(nx, nz)] > 0 || def.roof[i] > 0 ? INDOOR : 1;
      face(S(sideSurf(m)), x, z, dx, dz, nh, cur, m === MAT.CONTAINER ? cellColor(i) : 0xffffff, 0.7 * ind, ind);
      if (m === MAT.CONTAINER && quality !== 'low' && cur - nh > 2) {
        // container door bars
        const cx = x + 0.5 + dx * 0.52, cz = z + 0.5 + dz * 0.52;
        if (hash(x, z, dx * 3 + dz) < 0.3) details.box(dx ? 0.03 : 0.05, cur - nh - 0.3, dz ? 0.03 : 0.05, cx, (nh + cur) / 2, cz, 0x2c2c2c);
      }
    }
  }

  // ---------- walls ----------
  const tints = T.tints || [0xffffff];
  const exposedCell = new Uint8Array(w * h);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (!wall(x, z) || !inb(x, z)) continue;
    const i = I(x, z), H = def.wallH[i], tn = wallSurf(def.wallMat[i]), tc = tints[def.tint?.[i] ?? 0] ?? 0xffffff;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (!inb(nx, nz)) continue;
      if (wall(nx, nz)) {
        // step between wall blocks of different heights (building silhouettes)
        const nH = def.wallH[I(nx, nz)];
        if (nH < H - 0.05) face(S(tn), x, z, dx, dz, nH, H, tc, 0.85, 1);
        continue;
      }
      exposedCell[i] = 1;
      const nb = base(nx, nz), nr = roof(nx, nz), ind = nr > 0 ? INDOOR : 1;
      const top = nr > 0 ? Math.min(H, nr + 0.01) : H;
      face(S(tn), x, z, dx, dz, nb, top, tc, 0.5 * ind, ind);
    }
  }
  // wall tops, merged along rows
  const capSurf = (i) => TR.roofTop || wallSurf(def.wallMat[i]);
  for (let z = 0; z < h; z++) {
    let x = 0;
    while (x < w) {
      if (!wall(x, z)) { x++; continue; }
      const i = I(x, z), H = def.wallH[i], cs = capSurf(i);
      let x1 = x;
      while (x1 + 1 < w && wall(x1 + 1, z) && def.wallH[I(x1 + 1, z)] === H && capSurf(I(x1 + 1, z)) === cs) x1++;
      S(cs).quad(V(x, H, z + 1), V(x1 + 1, H, z + 1), V(x1 + 1, H, z), V(x, H, z), 0xffffff, [x, z + 1, x1 + 1, z + 1, x1 + 1, z, x, z], [0.85, 0.85, 0.85, 0.85]);
      x = x1 + 1;
    }
  }

  // ---------- roofs: ceilings, lintels over doorways, roof tops ----------
  const ceilName = TR.ceiling || 'ceiling', lintel = TR.lintel || T.walls[0];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (wall(x, z)) continue;
    const rf = roof(x, z);
    if (rf <= 0) continue;
    const cs = 0.8 * Math.max(1, INDOOR);
    S(ceilName).quad(V(x, rf, z), V(x + 1, rf, z), V(x + 1, rf, z + 1), V(x, rf, z + 1), 0xffffff, [x, z, x + 1, z, x + 1, z + 1, x, z + 1], [cs, cs, cs, cs]);
    const topY = Math.max(T.wallH ?? 6, rf + 0.6);
    S(TR.roofTop || T.walls[0]).quad(V(x, topY, z + 1), V(x + 1, topY, z + 1), V(x + 1, topY, z), V(x, topY, z), 0xffffff, [x, z + 1, x + 1, z + 1, x + 1, z, x, z], [0.85, 0.85, 0.85, 0.85]);
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (wall(nx, nz)) continue;
      const nr = roof(nx, nz);
      if (nr > 0 && Math.abs(nr - rf) < 0.05) continue;
      const y1 = nr > rf ? nr : topY;
      face(S(lintel), x, z, dx, dz, rf, y1, 0xffffff, nr > 0 ? INDOOR : 0.8, nr > 0 ? INDOOR : 1);
      if (nr > 0 && nr < rf) continue;
      face(S(lintel), nx, nz, -dx, -dz, rf, y1, 0xffffff, INDOOR, INDOOR);
    }
  }

  // ---------- facade kit, rooftops, ground dressing ----------
  const ctx = { def, T, quality, S, details, glow, place, hash, wall, hgt, base, roof, wallTop, inb, I, V, exposedCell, extra: [] };
  buildKit(ctx);

  // ---------- props ----------
  for (const p of def.props) addProp(p);
  function addProp(p) {
    const y = p.y ?? def.base[I(Math.floor(p.x), Math.floor(p.z))] ?? 0;
    const d = details;
    switch (p.type) {
      case 'model': place(p.model, p.x, y, p.z, p.rot || 0, p.scale || 1, p.color); break;
      case 'barrel': place(['barrel_red', 'barrel_blue', 'barrel_steel'][Math.floor(hash(p.x, p.z) * 3)], p.x, y, p.z, hash(p.x, p.z, 3) * 6.28); break;
      case 'car': place('covered_car', p.x, y, p.z, p.rot || 0); break;
      case 'doors': {
        // wooden gate: posts + lintel beam, two leaves swung open against the walls. axis = passage direction.
        const span = p.span || 3, alongX = p.axis === 'x', hw = span / 2, wood = S('wood'), door = S('door_wood');
        const post = (o) => (alongX ? wood.wbox(0.3, 3.3, 0.3, p.x, y + 1.65, p.z + o) : wood.wbox(0.3, 3.3, 0.3, p.x + o, y + 1.65, p.z));
        post(-hw - 0.05); post(hw + 0.05);
        if (alongX) wood.wbox(0.34, 0.34, span + 0.8, p.x, y + 3.3, p.z); else wood.wbox(span + 0.8, 0.34, 0.34, p.x, y + 3.3, p.z);
        for (const sg of [-1, 1]) {
          const lw = hw - 0.12;
          if (alongX) door.wbox(lw, 2.9, 0.07, p.x + lw / 2 + 0.18, y + 1.5, p.z + sg * (hw - 0.1), p.color ?? 0xffffff);
          else door.wbox(0.07, 2.9, lw, p.x + sg * (hw - 0.1), y + 1.5, p.z + lw / 2 + 0.18, p.color ?? 0xffffff);
        }
        break;
      }
      case 'beam': {
        const len = p.len || 6;
        if (p.axis === 'x') S('wood').wbox(len, 0.35, 0.35, p.x, p.y, p.z); else S('wood').wbox(0.35, 0.35, len, p.x, p.y, p.z);
        break;
      }
      case 'lamp': {
        const ly = p.y ?? y + 3;
        if (p.hang) place('hang_lamp', p.x, ly - 1.05, p.z, 0, 0.8); else place('wall_light', p.x, ly - 0.2, p.z, p.ry || 0);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex('rgba(255,230,170,0.5)', 'rgba(255,200,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.position.set(p.x, ly - (p.hang ? 0.95 : 0.1), p.z); s.scale.setScalar(2.0); scene.add(s); added.push(s);
        break;
      }
      case 'sign': {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshLambertMaterial({ map: signTexture(p.text, p.arrow), transparent: true, depthWrite: false }));
        mesh.position.set(p.x, p.y ?? y + 2, p.z);
        mesh.rotation.y = { e: Math.PI / 2, w: -Math.PI / 2, n: Math.PI, s: 0 }[p.face] ?? 0;
        scene.add(mesh); added.push(mesh);
        break;
      }
      case 'palm': case 'tree': palm(p.x, y, p.z, p.h || 6 + hash(p.x, p.z) * 2.5); break;
      case 'arch': {
        // segmental stone arch: voussoirs from jamb to jamb, spandrel fill up to the top
        const st = S(p.surf || TR.arch || TR.cornice || T.walls[0]), span = p.span, hw = span / 2, spring = p.spring ?? p.top - hw * 0.55 - 0.5;
        const alongX = p.axis === 'x', dep = p.depth ?? 1, n = 11;
        const put = (a, yy, ww, hh) => (alongX ? st.wbox(dep, hh, ww, p.x, yy, p.z + a) : st.wbox(ww, hh, dep, p.x + a, yy, p.z));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n, a0 = Math.PI * (1 - t0), a1 = Math.PI * (1 - t1);
          const x0 = Math.cos(a0) * hw, x1 = Math.cos(a1) * hw, y0 = spring + Math.sin(a0) * hw * 0.55, y1 = spring + Math.sin(a1) * hw * 0.55;
          const mid = (x0 + x1) / 2, ybot = Math.min(y0, y1);
          put(mid, (ybot + p.top) / 2, Math.abs(x1 - x0) + 0.02, p.top - ybot);
        }
        for (const sd of [-1, 1]) put(sd * (hw + 0.2), (y + p.top) / 2, 0.4, p.top - y);
        break;
      }
      case 'awning': {
        const aw = p.w || 6, ad = p.d || 2, col = p.color ?? 0x9a3b2c, n = Math.max(2, Math.round(aw / 0.6));
        const ry = p.ry || 0, c = Math.cos(ry), sn = Math.sin(ry);
        for (let k = 0; k < n; k++) { const o = -aw / 2 + (k + 0.5) * aw / n; d.box(aw / n, 0.035, ad, p.x + o * c, p.y, p.z - o * sn, k % 2 ? col : 0xe8e0d0, 0.18, ry, 0); }
        break;
      }
      case 'truckcab': {
        // cab-over truck: painted body, dark glass, bumper, wheels
        const r = p.rot || 0, cs = Math.cos(r), sn = Math.sin(r), body = S('rusty');
        const at = (lx, lz) => [p.x + lx * cs + lz * sn, p.z - lx * sn + lz * cs];
        const put = (b, w2, h2, d2, lx, ly, lz, col) => { const [x, z] = at(lx, lz); b.wbox(w2, h2, d2, x, y + ly, z, col, r); };
        put(body, 2.5, 1.9, 1.9, 0, 1.55, 0, p.color ?? 0xc84a3a);
        put(body, 2.3, 0.7, 0.06, 0, 2.05, 0.96, 0x2a3440);
        put(body, 2.6, 0.3, 0.3, 0, 0.55, 1.0, 0x3a3c3e);
        for (const lx of [-1.05, 1.05]) { const [x, z] = at(lx, 0.1); d.cyl(0.5, 0.5, 0.35, x, y + 0.5, z, 0x1a1a1a, 14, 0, r, Math.PI / 2); }
        break;
      }
      case 'forklift': {
        const r = p.rot || 0, cs = Math.cos(r), sn = Math.sin(r), body = S('rusty');
        const at = (lx, lz) => [p.x + lx * cs + lz * sn, p.z - lx * sn + lz * cs];
        const put = (b, w2, h2, d2, lx, ly, lz, col) => { const [x, z] = at(lx, lz); b.wbox(w2, h2, d2, x, y + ly, z, col, r); };
        put(body, 1.2, 1.1, 2.0, 0, 0.75, 0, 0xe0b030);
        put(body, 1.1, 0.08, 1.0, 0, 2.15, 0.25, 0x333333);
        for (const lx of [-0.5, 0.5]) { put(body, 0.08, 2.1, 0.08, lx, 1.2, -0.2, 0x333333); put(body, 0.08, 2.1, 0.08, lx, 1.2, 0.7, 0x333333); }
        for (const lx of [-0.4, 0.4]) { put(body, 0.1, 2.6, 0.1, lx, 1.3, -1.05, 0x2a2a2a); put(body, 0.12, 0.05, 1.1, lx * 0.8, 0.12, -1.6, 0x4a4a4a); }
        for (const [lx, lz] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) { const [x, z] = at(lx, lz); d.cyl(0.3, 0.3, 0.22, x, y + 0.3, z, 0x151515, 12, 0, r, Math.PI / 2); }
        break;
      }
      case 'silo': {
        const m = S(p.surf || 'painted_concrete');
        m.wcyl(p.r, p.r, p.h, p.x, p.y + p.h / 2, p.z, 0xd8dcdf, 28);
        m.wcyl(p.r * 0.2, p.r, p.r * 0.45, p.x, p.y + p.h + p.r * 0.225, p.z, 0xd8dcdf, 28);
        for (let k = 0; k < 4; k++) details.cyl(p.r + 0.06, p.r + 0.06, 0.22, p.x, p.y + 2 + k * 3.6, p.z, 0x6a6e72, 28);
        break;
      }
    }
  }

  // Date palm: curved segmented trunk + drooping fronds (alpha-tested leaf cards)
  function palm(px, py, pz, ph) {
    const lean = hash(px, pz, 2) * 0.35, dir = hash(px, pz, 4) * 6.28;
    const bark = S('palm_bark');
    let x = px, z = pz, yy = py;
    const segs = 7;
    for (let k = 0; k < segs; k++) {
      const t0 = k / segs, t1 = (k + 1) / segs, len = ph / segs;
      const off = (t) => lean * t * t * ph * 0.35;
      const x1 = px + Math.cos(dir) * off(t1), z1 = pz + Math.sin(dir) * off(t1);
      const mx = (x + x1) / 2, mz = (z + z1) / 2, r0 = 0.24 - 0.08 * t0, r1 = 0.24 - 0.08 * t1;
      const tilt = Math.atan2(Math.hypot(x1 - x, z1 - z), len);
      bark.wcyl(r1, r0, len * 1.02, mx, yy + len / 2, mz, 0xffffff, 9, Math.sin(dir) * tilt, 0, -Math.cos(dir) * tilt);
      x = x1; z = z1; yy += len;
    }
    const fr = S('palm_frond');
    const n = 11;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + hash(px, pz, k) * 0.4, droop = 0.25 + hash(px, pz, 20 + k) * 0.55, L = 2.6 + hash(px, pz, 40 + k) * 0.8;
      frond(fr, x, yy - 0.1, z, a, droop, L);
    }
    details.sphere(0.32, x, yy - 0.15, z, 0x6a5232, 7);
  }
  // A frond is a bent strip of 3 quads, textured with the leaf card
  function frond(b, x, y, z, a, droop, L) {
    const ca = Math.cos(a), sa = Math.sin(a), wdt = 0.55;
    const px = -sa * wdt, pz = ca * wdt;
    let prev = null, prevT = 0;
    for (let k = 0; k <= 3; k++) {
      const t = k / 3, r = L * t, yy = y + Math.sin(0.5 - droop * t * 2.2) * r * 0.6 - droop * t * t * 1.2;
      const cx = x + ca * r, cz = z + sa * r, wk = 1 - t * 0.6;
      const cur = [V(cx - px * wk, yy, cz - pz * wk), V(cx + px * wk, yy, cz + pz * wk)];
      if (prev) b.quad(prev[0], prev[1], cur[1], cur[0], 0xffffff, [0, prevT, 1, prevT, 1, t, 0, t], [0.9, 0.9, 1, 1]);
      prev = cur; prevT = t;
    }
  }

  // Bomb site floor decals
  for (const k of ['A', 'B']) {
    const Z = def.zones[k];
    if (!Z) continue;
    const cx = Math.round((Z.x0 + Z.x1) / 2), cz = Math.round((Z.z0 + Z.z1) / 2);
    let sx = cx, sz = cz;
    const FLOORISH = [MAT.GROUND, MAT.CONCRETE, MAT.TILES, MAT.ASPHALT, MAT.METAL, MAT.WOOD, MAT.PLATFORM, MAT.PAVE, MAT.STONE, MAT.SAND, MAT.DIRT];
    const flat = (x, z) => {
      const h0 = hgt(x, z);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const cx2 = x + dx, cz2 = z + dz;
        if (wall(cx2, cz2) || Math.abs(hgt(cx2, cz2) - h0) > 0.01 || !FLOORISH.includes(def.mat[I(cx2, cz2)])) return false;
      }
      return true;
    };
    outer: for (let r = 0; r < 10; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, z = cz + dz;
      if (!wall(x, z) && flat(x, z)) { sx = x; sz = z; break outer; }
    }
    const dcl = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshLambertMaterial({ map: siteDecal(k), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    dcl.rotation.x = -Math.PI / 2; dcl.position.set(sx + 0.5, hgt(sx, sz) + 0.02, sz + 0.5);
    dcl.receiveShadow = quality !== 'low';
    scene.add(dcl); added.push(dcl);
  }

  // ---------- meshes ----------
  const shadows = quality !== 'low';
  for (const [name, b] of builders) {
    if (!b.count) continue;
    const mat = name === 'palm_frond' ? frondMaterial() : name === 'palm_bark' ? barkMaterial() : surfMaterial(name, quality, { tint: T.surfTint?.[name] });
    for (const geo of b.build()) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mesh.receiveShadow = shadows;
      if (name === 'palm_frond') mesh.customDepthMaterial = frondDepth();
      scene.add(mesh); added.push(mesh);
    }
  }
  const detailMat = new THREE.MeshLambertMaterial({ vertexColors: true, shadowSide: THREE.DoubleSide });
  for (const geo of details.build()) { const m = new THREE.Mesh(geo, detailMat); m.castShadow = m.receiveShadow = shadows; scene.add(m); added.push(m); }
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  for (const geo of glow.build()) { const m = new THREE.Mesh(geo, glowMat); scene.add(m); added.push(m); }
  for (const o of ctx.extra) { o.receiveShadow = shadows; scene.add(o); added.push(o); }

  // instanced prop models
  let alive = true;
  added.dispose = () => { alive = false; };
  // prop instances: keep the quadrant split only where a model has enough triangles to matter
  const byModel = new Map();
  for (const [key, list] of inst) { const name = key.split('|')[0]; if (!byModel.has(name)) byModel.set(name, []); byModel.get(name).push(list); }
  const groups = [];
  for (const [name, lists] of byModel) {
    const n = lists.reduce((k, l) => k + l.length, 0), tris = (PROP_TRIS[name] || 800) * n;
    if (tris > 15000) for (const l of lists) groups.push([name, l]); else groups.push([name, lists.flat()]);
  }
  for (const [name, list] of groups) {
    const addInst = (model) => {
      for (const part of model.parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        list.forEach((it, k) => { im.setMatrixAt(k, it.m); if (it.color !== undefined) im.setColorAt(k, new THREE.Color(it.color)); });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = shadows; im.receiveShadow = shadows;
        im.userData.shared = true;           // geometry/material belong to the prop cache
        im.name = name;
        scene.add(im); added.push(im);
      }
    };
    const model = propModel(name);
    if (model) addInst(model);
    else loadProp(name).then((md) => { if (alive) addInst(md); });
  }

  // Base ground far below everything so there are never holes to the void
  const gb = new GeoBuilder();
  gb.quad(V(-100, -0.02, h + 100), V(w + 100, -0.02, h + 100), V(w + 100, -0.02, -100), V(-100, -0.02, -100), 0xd0d0d0, [-100, h + 100, w + 100, h + 100, w + 100, -100, -100, -100]);
  const ground = new THREE.Mesh(gb.build(), surfMaterial(T.floors[MAT.GROUND], quality, { tint: T.surfTint?.[T.floors[MAT.GROUND]] }));
  ground.receiveShadow = shadows;
  scene.add(ground); added.push(ground);

  // ---------- sky, fog and light ----------
  const sky0 = SKIES[T.sky] || SKIES.clear, rot = (T.skyRot || 0) * Math.PI / 180;
  const az = sky0.az * Math.PI / 180 + rot, el = (T.sunEl ?? sky0.el) * Math.PI / 180;
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
  const sky = makePhotoSky(T, sky0, rot);
  scene.add(sky); added.push(sky);
  if (T.skyline) { const sl = makeSkyline(T, def, sky0); scene.add(sl); added.push(sl); }
  const hor = new THREE.Color().setRGB(...sky0.horizon, THREE.SRGBColorSpace);
  const fogCol = T.fog !== undefined ? new THREE.Color(T.fog) : hor;
  scene.background = fogCol.clone();
  scene.fog = new THREE.Fog(fogCol, T.fogNear ?? 70, T.fogFar ?? 240);
  const skyCol = new THREE.Color().setRGB(...sky0.zenith, THREE.SRGBColorSpace).lerp(new THREE.Color(0xffffff), 0.35);
  const hemi = new THREE.HemisphereLight(T.hemi?.[0] ?? skyCol, T.hemi?.[1] ?? T.bounce ?? 0x8a7a66, (T.hemiI ?? 1.5) * (shadows ? 0.9 : 1.05));
  const sunCol = T.sun !== undefined ? new THREE.Color(T.sun) : new THREE.Color().setRGB(...sky0.sun.map((v) => 0.55 + 0.45 * v));
  const sun = new THREE.DirectionalLight(sunCol, (T.sunI ?? 2.2) * (shadows ? 1 : 0.7));
  const center = new THREE.Vector3(w / 2, 0, h / 2);
  sun.position.copy(center).addScaledVector(sunDir, 200);
  sun.target.position.copy(center);
  if (shadows) {
    // The map never moves, so the shadow map is rendered once (renderer.shadowMap.autoUpdate = false).
    // Fit the shadow frustum to the map's bounds as seen from the sun.
    sun.castShadow = true;
    const size = quality === 'high' ? 4096 : 2048;
    sun.shadow.mapSize.set(size, size);
    const view = new THREE.Matrix4().lookAt(sun.position, sun.target.position, new THREE.Vector3(0, 1, 0));
    const inv = view.clone().transpose(), box = new THREE.Box3();          // rotation only: inverse = transpose
    let maxH = 0; for (let i = 0; i < w * h; i++) if (def.solid[i]) maxH = Math.max(maxH, def.wallH[i]);
    for (const cx of [0, w]) for (const cz of [0, h]) for (const cy of [0, maxH + 18]) box.expandByPoint(V(cx, cy, cz).sub(center).applyMatrix4(inv));
    const half = Math.max(-box.min.x, box.max.x, -box.min.y, box.max.y) + 2;      // frustum is centred on the map centre
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 420 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  }
  sun.userData.sun = true;
  scene.add(hemi, sun, sun.target); added.push(hemi, sun, sun.target);
  return added;
}

// ---------- palm materials (canvas textures, drawn once) ----------
let _frond = null, _frondDepth = null, _bark = null;
function frondTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // rib along v (bottom = base of the frond), leaflets angled outward
  for (let k = 0; k < 60; k++) {
    const t = k / 60, y = 250 - t * 245, len = 58 * Math.sin(Math.min(1, t * 1.25 + 0.05) * Math.PI * 0.95) + 6;
    for (const s of [-1, 1]) {
      g.strokeStyle = `hsl(${88 + rnd() * 18}, ${38 + rnd() * 18}%, ${22 + rnd() * 14}%)`;
      g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * len * 0.5, y - 10, 64 + s * len, y - 26 - rnd() * 8); g.stroke();
    }
  }
  g.strokeStyle = '#6b6a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 256); g.lineTo(64, 4); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.shared = true;
  return t;
}
function frondMaterial() {
  return (_frond ||= new THREE.MeshLambertMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true }));
}
function frondDepth() {
  return (_frondDepth ||= new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: frondMaterial().map, alphaTest: 0.45, side: THREE.DoubleSide }));
}
function barkMaterial() {
  if (_bark) return _bark;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#6e5a42'; g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 8) {
    g.fillStyle = `rgba(40,30,20,${0.45 + rnd() * 0.2})`; g.fillRect(0, y, 64, 3);
    for (let x = 0; x < 64; x += 8) { g.fillStyle = `rgba(160,130,95,${rnd() * 0.35})`; g.fillRect(x + ((y / 8) % 2) * 4, y + 3, 6, 4); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1.5); t.userData.shared = true;
  return (_bark = new THREE.MeshLambertMaterial({ map: t, vertexColors: true }));
}

// Pre-rendered top-down minimap image
export function renderMinimap(def, size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), s = size / Math.max(def.w, def.h);
  ctx.fillStyle = 'rgba(16,16,18,0.88)'; ctx.fillRect(0, 0, size, size);
  for (let z = 0; z < def.h; z++) for (let x = 0; x < def.w; x++) {
    const i = z * def.w + x;
    if (def.solid[i]) continue;
    const m = def.mat[i];
    let col;
    if (m === MAT.CRATE || m === MAT.CONTAINER || m === MAT.HIDDEN || m === MAT.LOWWALL) col = '#5d5246';
    else { const v = Math.min(255, 150 + def.height[i] * 22); col = `rgb(${v | 0},${v * 0.93 | 0},${v * 0.8 | 0})`; }
    ctx.fillStyle = col; ctx.fillRect(x * s, z * s, s + 0.5, s + 0.5);
    if (def.roof[i] > 0) { ctx.fillStyle = 'rgba(40,50,70,0.28)'; ctx.fillRect(x * s, z * s, s + 0.5, s + 0.5); }
  }
  ctx.font = `bold ${Math.floor(s * 9)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const k of ['A', 'B']) {
    const Z = def.zones[k];
    ctx.fillStyle = 'rgba(255,70,50,0.22)';
    ctx.fillRect(Z.x0 * s, Z.z0 * s, (Z.x1 - Z.x0 + 1) * s, (Z.z1 - Z.z0 + 1) * s);
    ctx.fillStyle = '#ff5a40'; ctx.fillText(k, (Z.x0 + Z.x1 + 1) / 2 * s, (Z.z0 + Z.z1 + 1) / 2 * s);
  }
  return c;
}
