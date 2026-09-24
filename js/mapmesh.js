import * as THREE from '../lib/three.module.min.js';
import { MAT } from './world.js';
import { GeoBuilder } from './geom.js';
import { tex, signTexture, siteDecal, skyTexture, radialTex } from './textures.js';

const WALL_TEX = { sandstone: 'sandstone', plaster: 'plaster', plaster_pink: 'plaster_pink', stone: 'stone', metal: 'corrugated', brick: 'brick', concrete: 'concrete', panel: 'panel' };
const INDOOR = 0.58;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Builds every static mesh for a map. Returns the list of objects added to the scene.
export function buildMap(scene, def, quality = 'medium') {
  const { w, h } = def, T = def.theme;
  const I = (x, z) => z * w + x;
  const inb = (x, z) => x >= 0 && z >= 0 && x < w && z < h;
  const wall = (x, z) => !inb(x, z) || def.solid[I(x, z)] === 1;
  const hgt = (x, z) => (wall(x, z) ? 99 : def.height[I(x, z)]);
  const base = (x, z) => (wall(x, z) ? 0 : def.base[I(x, z)]);
  const roof = (x, z) => (wall(x, z) ? 0 : def.roof[I(x, z)]);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const added = [];
  const builders = new Map();
  const B = (name) => { if (!builders.has(name)) builders.set(name, new GeoBuilder()); return builders.get(name); };
  const details = new GeoBuilder(), glow = new GeoBuilder();
  const hash = (x, z, k = 0) => { const n = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return n - Math.floor(n); };
  const wallTexName = (m) => WALL_TEX[T.walls[m] || T.walls[0]] || 'concrete';
  const topTex = (m) => ({ [MAT.GROUND]: T.ground, [MAT.PLATFORM]: T.ground, [MAT.SAND]: 'sand', [MAT.TILES]: 'tiles', [MAT.ASPHALT]: 'asphalt', [MAT.CONCRETE]: 'concrete', [MAT.METAL]: 'metal', [MAT.WOOD]: 'wood', [MAT.CRATE]: 'crate', [MAT.CONTAINER]: 'container', [MAT.LOWWALL]: wallTexName(0) }[m] || T.ground);
  const sideTex = (m) => (m === MAT.GROUND || m === MAT.PLATFORM || m === MAT.SAND ? wallTexName(0) : topTex(m));
  const cellColor = (i) => def.color.get(i) ?? 0xffffff;

  // Vertical face along an edge. Normal = (dx, 0, dz) of the neighbor direction.
  const face = (b, x, z, dx, dz, y0, y1, color, uMode, shadeBot = 0.62, shadeTop = 1) => {
    const cx = x + 0.5 + dx * 0.5, cz = z + 0.5 + dz * 0.5, ex = dz, ez = -dx;
    const p0 = [cx - ex * 0.5, cz - ez * 0.5], p1 = [cx + ex * 0.5, cz + ez * 0.5];
    let u0, u1, v0, v1;
    if (uMode === 'cell') { u0 = 0; u1 = 1; v0 = 0; v1 = y1 - y0; }
    else if (uMode === 'container') { u0 = (p0[0] + p0[1]) / 2.6; u1 = u0 + 1 / 2.6; v0 = y0 / 2.6; v1 = y1 / 2.6; }
    else { const along = dx !== 0 ? p0[1] : p0[0]; u0 = along / 2 * (dx + dz); u1 = u0 + 0.5; v0 = y0 / 2; v1 = y1 / 2; }
    b.quad(V(p0[0], y0, p0[1]), V(p1[0], y0, p1[1]), V(p1[0], y1, p1[1]), V(p0[0], y1, p0[1]), color, [u0, v0, u1, v0, u1, v1, u0, v1], [shadeBot, shadeBot, shadeTop, shadeTop]);
  };

  // ---------- floors & raised blocks ----------
  const aoCorner = (x, z, y) => {
    let n = 0;
    for (const [ox, oz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const cx = x + ox, cz = z + oz; if (wall(cx, cz) || hgt(cx, cz) > y + 0.3) n++; }
    return 1 - 0.14 * n;
  };
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (wall(x, z)) continue;
    const i = I(x, z), m = def.mat[i];
    const top = m === MAT.HIDDEN ? def.base[i] : def.height[i];
    const topM = m === MAT.HIDDEN ? MAT.GROUND : m;
    const indoor = def.roof[i] > 0 ? INDOOR : 1;
    const tn = topTex(topM), col = topM === MAT.CONTAINER ? cellColor(i) : 0xffffff;
    const uv = tn === 'crate' ? [0, 0, 1, 0, 1, 1, 0, 1] : [x / 2, (z + 1) / 2, (x + 1) / 2, (z + 1) / 2, (x + 1) / 2, z / 2, x / 2, z / 2];
    const s = [aoCorner(x, z + 1, top), aoCorner(x + 1, z + 1, top), aoCorner(x + 1, z, top), aoCorner(x, z, top)].map((v) => v * indoor);
    B(tn).quad(V(x, top, z + 1), V(x + 1, top, z + 1), V(x + 1, top, z), V(x, top, z), col, uv, s);
    if (m === MAT.HIDDEN) continue;
    // sides toward lower neighbors
    const cur = def.height[i];
    if (cur <= 0) continue;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (wall(nx, nz)) continue;
      const nh = def.mat[I(nx, nz)] === MAT.HIDDEN ? def.base[I(nx, nz)] : hgt(nx, nz);
      if (nh >= cur - 1e-3) continue;
      const st = sideTex(m), mode = st === 'crate' ? 'cell' : st === 'container' ? 'container' : 'wall';
      const ind = def.roof[I(nx, nz)] > 0 || def.roof[i] > 0 ? INDOOR : 1;
      face(B(st), x, z, dx, dz, nh, cur, m === MAT.CONTAINER ? cellColor(i) : 0xffffff, mode, 0.7 * ind, ind);
      if (m === MAT.CONTAINER && quality !== 'low') {
        // container door bars / ribs
        const cx = x + 0.5 + dx * 0.52, cz = z + 0.5 + dz * 0.52;
        if (hash(x, z, dx * 3 + dz) < 0.35) details.box(dx ? 0.03 : 0.06, cur - nh - 0.2, dz ? 0.03 : 0.06, cx, (nh + cur) / 2, cz, 0x333333);
      }
    }
  }

  // ---------- walls ----------
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (!wall(x, z) || !inb(x, z)) continue;
    const i = I(x, z), H = def.wallH[i], tn = wallTexName(def.wallMat[i]);
    let exposed = false;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (!inb(nx, nz)) continue;
      if (wall(nx, nz)) {
        const nH = def.wallH[I(nx, nz)];
        if (nH < H - 0.05) face(B(tn), x, z, dx, dz, nH, H, 0xffffff, 'wall', 0.9, 1);
        continue;
      }
      exposed = true;
      const nb = base(nx, nz), nr = roof(nx, nz), ind = nr > 0 ? INDOOR : 1;
      const top = nr > 0 ? Math.min(H, nr + 0.01) : H;
      face(B(tn), x, z, dx, dz, nb, top, 0xffffff, 'wall', 0.55 * ind, ind);
      if (nr > 0 || quality === 'low') continue;
      // cornice along the top edge
      const cx = x + 0.5 + dx * 0.5, cz = z + 0.5 + dz * 0.5;
      details.box(dx ? 0.16 : 1.0, 0.18, dz ? 0.16 : 1.0, cx, H - 0.25, cz, 0xcfc4b0);
      // windows and doors on tall open-air walls
      if (T.windows && H - nb >= 5 && hash(x, z, dx + dz * 2) < 0.12) {
        const ox = cx + dx * 0.02, oz = cz + dz * 0.02, y = nb + 3.3;
        details.box(dx ? 0.05 : 0.9, 1.2, dz ? 0.05 : 0.9, ox, y, oz, 0x1c2430);
        details.box(dx ? 0.1 : 1.1, 0.1, dz ? 0.1 : 1.1, ox + dx * 0.04, y - 0.66, oz + dz * 0.04, 0xa89478);
        details.box(dx ? 0.08 : 1.05, 0.08, dz ? 0.08 : 1.05, ox + dx * 0.03, y + 0.64, oz + dz * 0.03, 0x8a7a60);
        details.box(dx ? 0.07 : 0.06, 1.2, dz ? 0.07 : 0.06, ox + dx * 0.03, y, oz + dz * 0.03, 0x6a5a48);
      } else if (T.windows && H - nb >= 4 && hash(x, z, 9 + dx + dz * 2) < 0.04) {
        const ox = cx + dx * 0.02, oz = cz + dz * 0.02;
        details.box(dx ? 0.06 : 0.95, 2.2, dz ? 0.06 : 0.95, ox, nb + 1.1, oz, 0x5a3a22);
        details.box(dx ? 0.1 : 1.1, 0.12, dz ? 0.1 : 1.1, ox, nb + 2.26, oz, 0x3a2a1a);
        details.box(dx ? 0.1 : 0.06, 0.06, dz ? 0.06 : 0.1, ox + dx * 0.05 + dz * 0.3, nb + 1.05, oz + dz * 0.05 - dx * 0.3, 0xc8a040);
      }
    }
    // wall cap
    if (exposed || x === 0 || z === 0) {
      B(tn).quad(V(x, H, z + 1), V(x + 1, H, z + 1), V(x + 1, H, z), V(x, H, z), 0xffffff, [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5], [0.8, 0.8, 0.8, 0.8]);
    }
  }

  // ---------- roofs: ceilings, lintels over doorways, roof tops ----------
  const ceil = B('ceiling');
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (wall(x, z)) continue;
    const rf = roof(x, z);
    if (rf <= 0) continue;
    ceil.quad(V(x, rf, z), V(x + 1, rf, z), V(x + 1, rf, z + 1), V(x, rf, z + 1), 0xffffff, [x / 2, z / 2, (x + 1) / 2, z / 2, (x + 1) / 2, (z + 1) / 2, x / 2, (z + 1) / 2], [0.7, 0.7, 0.7, 0.7]);
    const topY = Math.max(T.wallH, rf + 0.5);
    B(wallTexName(0)).quad(V(x, topY, z + 1), V(x + 1, topY, z + 1), V(x + 1, topY, z), V(x, topY, z), 0xffffff, [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5], [0.8, 0.8, 0.8, 0.8]);
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (wall(nx, nz)) continue;
      const nr = roof(nx, nz);
      if (nr > 0 && Math.abs(nr - rf) < 0.05) continue;
      // lintel faces the neighbor (outside or differently-roofed room)
      const y1 = nr > rf ? nr : topY;
      face(B(wallTexName(0)), x, z, dx, dz, rf, y1, 0xffffff, 'wall', nr > 0 ? INDOOR : 0.85, nr > 0 ? INDOOR : 1);
      if (nr > 0 && nr < rf) continue;
      // light inner side of the lintel so doorways don't look like holes from inside
      face(B(wallTexName(0)), nx, nz, -dx, -dz, rf, y1, 0xffffff, 'wall', INDOOR, INDOOR);
    }
  }

  // ---------- props ----------
  for (const p of def.props) addProp(p);
  function addProp(p) {
    const y = p.y ?? def.base[I(Math.floor(p.x), Math.floor(p.z))] ?? 0;
    const d = details;
    switch (p.type) {
      case 'barrel': {
        const c = p.color ?? [0x3b5f8a, 0x8a3b2b, 0x3f6b3a, 0x6f6f6f][Math.floor(hash(p.x, p.z) * 4)];
        d.cyl(0.36, 0.36, 1.05, p.x, y + 0.525, p.z, c, 12);
        d.cyl(0.375, 0.375, 0.05, p.x, y + 0.3, p.z, 0x2a2a2a, 12).cyl(0.375, 0.375, 0.05, p.x, y + 0.75, p.z, 0x2a2a2a, 12);
        d.cyl(0.3, 0.3, 0.02, p.x, y + 1.06, p.z, 0x222222, 12);
        break;
      }
      case 'car': {
        const r = p.rot || 0, c = p.color ?? 0x7a2e24;
        const put = (bw, bh, bd, lx, ly, lz, col) => { const cs = Math.cos(r), sn = Math.sin(r); d.box(bw, bh, bd, p.x + lx * cs + lz * sn, y + ly, p.z - lx * sn + lz * cs, col, 0, r, 0); };
        put(1.9, 0.7, 4.3, 0, 0.6, 0, c); put(1.75, 0.62, 2.3, 0, 1.25, 0.2, c); put(1.7, 0.5, 2.25, 0, 1.25, 0.2, 0x1d2a38);
        put(1.95, 0.2, 0.2, 0, 0.45, 2.15, 0x2a2a2a); put(1.95, 0.2, 0.2, 0, 0.45, -2.15, 0x2a2a2a);
        put(0.35, 0.18, 0.05, 0.6, 0.72, -2.17, 0xfff2c0); put(0.35, 0.18, 0.05, -0.6, 0.72, -2.17, 0xfff2c0);
        for (const [lx, lz] of [[0.9, 1.4], [-0.9, 1.4], [0.9, -1.4], [-0.9, -1.4]]) {
          const cs = Math.cos(r), sn = Math.sin(r);
          d.cyl(0.36, 0.36, 0.24, p.x + lx * cs + lz * sn, y + 0.36, p.z - lx * sn + lz * cs, 0x151515, 12, 0, r, Math.PI / 2);
        }
        break;
      }
      case 'truckcab': {
        d.box(2.6, 2.2, 1.8, p.x, y + 1.3, p.z, 0xb03a2e).box(2.4, 0.8, 0.05, p.x, y + 1.9, p.z + 0.92, 0x1d2a38);
        for (const lx of [-1.1, 1.1]) d.cyl(0.45, 0.45, 0.3, p.x + lx, y + 0.45, p.z, 0x151515, 12, 0, 0, Math.PI / 2);
        break;
      }
      case 'forklift': {
        d.box(1.2, 1.2, 2.0, p.x, y + 0.8, p.z, 0xd6a21e).box(1.0, 1.1, 0.9, p.x, y + 1.9, p.z + 0.3, 0x333333);
        d.box(0.1, 2.6, 0.1, p.x - 0.4, y + 1.3, p.z - 1.05, 0x333333).box(0.1, 2.6, 0.1, p.x + 0.4, y + 1.3, p.z - 1.05, 0x333333);
        d.box(0.12, 0.06, 1.1, p.x - 0.3, y + 0.15, p.z - 1.6, 0x555555).box(0.12, 0.06, 1.1, p.x + 0.3, y + 0.15, p.z - 1.6, 0x555555);
        for (const [lx, lz] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) d.cyl(0.28, 0.28, 0.2, p.x + lx, y + 0.28, p.z + lz, 0x151515, 10, 0, 0, Math.PI / 2);
        break;
      }
      case 'doors': {
        // frame + two leaves swung open against the walls. axis = passage direction.
        const span = p.span || 3, col = p.color ?? 0x6b4526, alongX = p.axis === 'x';
        const hw = span / 2;
        const post = (ox) => alongX ? d.box(0.3, 3.2, 0.25, p.x, y + 1.6, p.z + ox, 0x4a3420) : d.box(0.25, 3.2, 0.3, p.x + ox, y + 1.6, p.z, 0x4a3420);
        post(-hw); post(hw);
        if (alongX) d.box(0.3, 0.3, span + 0.5, p.x, y + 3.2, p.z, 0x4a3420); else d.box(span + 0.5, 0.3, 0.3, p.x, y + 3.2, p.z, 0x4a3420);
        for (const sgn of [-1, 1]) {
          const lw = hw - 0.1;
          if (alongX) { d.box(lw, 2.9, 0.08, p.x + lw / 2 + 0.1, y + 1.5, p.z + sgn * (hw - 0.1), col); d.box(lw * 0.8, 0.08, 0.1, p.x + lw / 2 + 0.1, y + 1.2, p.z + sgn * (hw - 0.14), 0x3a2414); }
          else { d.box(0.08, 2.9, lw, p.x + sgn * (hw - 0.1), y + 1.5, p.z + lw / 2 + 0.1, col); d.box(0.1, 0.08, lw * 0.8, p.x + sgn * (hw - 0.14), y + 1.2, p.z + lw / 2 + 0.1, 0x3a2414); }
        }
        break;
      }
      case 'beam': {
        const len = p.len || 6;
        if (p.axis === 'x') d.box(len, 0.35, 0.35, p.x, p.y, p.z, 0x5a3e24); else d.box(0.35, 0.35, len, p.x, p.y, p.z, 0x5a3e24);
        break;
      }
      case 'lamp': {
        const ly = p.y ?? y + 3;
        details.box(0.08, 0.5, 0.08, p.x, ly + 0.3, p.z, 0x222222);
        glow.box(0.5, 0.14, 0.32, p.x, ly, p.z, 0xfff0c0);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex('rgba(255,230,170,0.55)', 'rgba(255,200,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.position.set(p.x, ly - 0.05, p.z); s.scale.setScalar(2.2); scene.add(s); added.push(s);
        break;
      }
      case 'sign': {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshLambertMaterial({ map: signTexture(p.text, p.arrow), transparent: true, depthWrite: false }));
        mesh.position.set(p.x, p.y ?? y + 2, p.z);
        mesh.rotation.y = { e: Math.PI / 2, w: -Math.PI / 2, n: Math.PI, s: 0 }[p.face] ?? 0;
        scene.add(mesh); added.push(mesh);
        break;
      }
      case 'tree': {
        const palm = T.ground === 'sand' || T.ground === 'cobble';
        if (palm) {
          d.cyl(0.14, 0.24, 5.2, p.x, y + 2.6, p.z, 0x7a5a3a, 8, 0.05, 0, 0.04);
          for (let k = 0; k < 7; k++) {
            const a = k / 7 * Math.PI * 2;
            d.box(0.5, 0.06, 2.6, p.x + Math.sin(a) * 1.1, y + 5.0, p.z + Math.cos(a) * 1.1, k % 2 ? 0x4f7a2f : 0x3f6a26, 0.45, a, 0);
          }
        } else {
          d.cyl(0.18, 0.26, 3, p.x, y + 1.5, p.z, 0x5a4230, 8);
          d.sphere(1.6, p.x, y + 3.6, p.z, 0x3f6a2e, 8).sphere(1.2, p.x + 0.8, y + 3.2, p.z + 0.3, 0x4a7a36, 8).sphere(1.1, p.x - 0.6, y + 4.3, p.z - 0.4, 0x365e28, 8);
        }
        break;
      }
      case 'pot': {
        d.cyl(0.35, 0.25, 0.6, p.x, y + 0.3, p.z, 0xa8552f, 10).sphere(0.45, p.x, y + 0.85, p.z, 0x3f6a2e, 8);
        break;
      }
      case 'awning': {
        const aw = p.w || 6, ad = p.d || 2, col = p.color ?? 0x9a3b2c, n = Math.max(2, Math.round(aw / 0.6));
        for (let k = 0; k < n; k++) d.box(aw / n, 0.04, ad, p.x - aw / 2 + (k + 0.5) * aw / n, p.y, p.z, k % 2 ? col : 0xe8e0d0, 0.18, 0, 0);
        break;
      }
      case 'silo': {
        d.cyl(p.r, p.r, p.h, p.x, p.y + p.h / 2, p.z, 0xc8ccd0, 24);
        d.sphere(p.r, p.x, p.y + p.h, p.z, 0xb8bcc0, 16, 0.35);
        for (let k = 0; k < 4; k++) d.cyl(p.r + 0.06, p.r + 0.06, 0.25, p.x, p.y + 2 + k * 3.6, p.z, 0x8a9096, 24);
        break;
      }
    }
  }

  // Bomb site floor decals
  for (const k of ['A', 'B']) {
    const Z = def.zones[k];
    if (!Z) continue;
    const cx = Math.round((Z.x0 + Z.x1) / 2), cz = Math.round((Z.z0 + Z.z1) / 2);
    let sx = cx, sz = cz;
    // pick a flat, open spot near the center
    outer: for (let r = 0; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, z = cz + dz;
      if (!wall(x, z) && [MAT.GROUND, MAT.CONCRETE, MAT.TILES, MAT.ASPHALT, MAT.METAL].includes(def.mat[I(x, z)])) { sx = x; sz = z; break outer; }
    }
    const dcl = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: siteDecal(k), transparent: true, depthWrite: false, fog: true }));
    dcl.rotation.x = -Math.PI / 2; dcl.position.set(sx + 0.5, hgt(sx, sz) + 0.03, sz + 0.5);
    scene.add(dcl); added.push(dcl);
  }

  // ---------- meshes ----------
  for (const [name, b] of builders) {
    if (!b.count) continue;
    const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ map: tex(name), vertexColors: true }));
    scene.add(mesh); added.push(mesh);
  }
  if (details.count) { const m = new THREE.Mesh(details.build(), new THREE.MeshLambertMaterial({ vertexColors: true })); scene.add(m); added.push(m); }
  if (glow.count) { const m = new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true })); scene.add(m); added.push(m); }

  // Base ground far below everything so there are never holes to the void
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(w + 200, h + 200), new THREE.MeshLambertMaterial({ map: tex(T.ground) }));
  ground.material.map = ground.material.map.clone(); ground.material.map.repeat.set((w + 200) / 2, (h + 200) / 2); ground.material.map.needsUpdate = true;
  ground.rotation.x = -Math.PI / 2; ground.position.set(w / 2, -0.02, h / 2);
  scene.add(ground); added.push(ground);

  // Sky, fog and light
  scene.background = skyTexture(T.sky);
  scene.fog = new THREE.Fog(T.fog, T.fogNear, T.fogFar);
  const hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemiI ?? 1.8);
  const sun = new THREE.DirectionalLight(T.sun, T.sunI ?? 1.6);
  sun.position.set(...(T.sunPos || [40, 80, 30]));
  scene.add(hemi, sun); added.push(hemi, sun);
  return added;
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
