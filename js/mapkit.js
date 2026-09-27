import * as THREE from '../lib/three.module.min.js';
import { MAT } from './world.js';
import { GeoBuilder } from './geom.js';
import { posterAtlas } from './textures.js';
import { surf } from './mapassets.js';

// Facade kit: turns the grid's flat wall faces into buildings. Every run of wall facing open
// ground is dressed deterministically (hash of its position) according to the map's style:
// plinths, cornices and parapets, corner quoins, windows (frames, shutters, grilles, sills),
// doors and shopfronts, drainpipes, AC units, lamps, cables strung across streets, posters,
// rooftop clutter and sand/grime drifts along the foot of the walls.
// Nothing here touches collision: ground-level parts stay within 0.3 m of the wall (the
// player's radius is 0.35 m), everything deeper is above head height.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Style presets. Probabilities are per window / door slot / run.
const STYLES = {
  desert: {
    win: { w: [0.8, 1.1], h: [1.1, 1.5], gap: [2.4, 4.4], shutClosed: 0.35, shutOpen: 0.3, grille: 0.35, bricked: 0.08, arch: 0.12, first: 3.7, floor: 3.3 },
    door: { every: [7, 13], w: [1.1, 1.4], h: [2.2, 2.5], arch: 0.3, metal: 0.2, gate: 0.06 },
    parapet: 0.55, quoins: true, band: 0.45, plinth: 0.65, pipes: 0.35, ac: 0.3, lamps: 0.25, cables: 0.45, shop: 0.18,
    posters: 0.03, rooftop: 0.55, drift: 0.85, lamp: 'wall_lamp', shutterTints: [0xffffff, 0x9fb8c8, 0xb8c89f, 0xd8c0a0, 0x8aa0b8],
    awnings: [0x9a3b2c, 0x2f6d8a, 0x8a6a2a, 0x3f6f3a],
  },
  medina: {
    win: { w: [0.9, 1.2], h: [1.4, 1.8], gap: [2.6, 4.2], shutClosed: 0.3, shutOpen: 0.4, grille: 0.25, bricked: 0.04, arch: 0.45, first: 3.8, floor: 3.3 },
    door: { every: [6, 11], w: [1.2, 1.5], h: [2.3, 2.7], arch: 0.6, metal: 0.12, gate: 0.05 },
    parapet: 0.7, quoins: false, band: 0.7, tileBand: true, plinth: 0.8, pipes: 0.25, ac: 0.25, lamps: 0.35, cables: 0.4, shop: 0.25,
    balcony: 0.28, plants: 0.35, posters: 0.02, rooftop: 0.6, drift: 0.35, lamp: 'lantern', shutterTints: [0x7fa8c8, 0x6f9a7a, 0xffffff, 0xc8a878, 0x5f7fa8],
    awnings: [0x2f7d6a, 0xb0442f, 0x7a3a8a, 0x2f5c9a, 0xc08a2a],
  },
  industrial: {
    win: { w: [2.2, 3.4], h: [0.9, 1.2], gap: [4.5, 7], strip: true, first: 4.6, floor: 3.6 },
    door: { every: [10, 18], w: [3.4, 4.2], h: [3.4, 4.0], rollup: 0.6, metal: 0.4 },
    parapet: 0.25, quoins: false, band: 0.3, plinth: 0.9, pipes: 0.5, ducts: 0.3, vents: 0.18, lamps: 0.25, cameras: 0.1, ladders: 0.08,
    hazard: 0.35, cables: 0.1, posters: 0.015, rooftop: 0.6, drift: 0.5, grime: true, lamp: 'security_light',
  },
  facility: {
    win: { w: [1.6, 2.6], h: [0.8, 1.0], gap: [5, 8], strip: true, first: 5.2, floor: 4 },
    door: { every: [12, 20], w: [1.3, 1.5], h: [2.3, 2.4], metal: 1 },
    parapet: 0.2, quoins: false, band: 0.5, plinth: 1, pipes: 0.45, ducts: 0.3, vents: 0.22, lamps: 0.3, cameras: 0.12, ladders: 0.05,
    hazard: 0.6, cables: 0.05, posters: 0, rooftop: 0.5, drift: 0.4, grime: true, lamp: 'wall_light',
  },
};

export function buildKit(ctx) {
  const { def, T } = ctx;
  const st = STYLES[T.facade];
  if (!st) return;
  const low = ctx.quality === 'low';
  const runs = findRuns(ctx);
  const K = kitTools(ctx, st);
  for (const r of runs) {
    if (r.rf > 0) { interiorRun(K, r); continue; }
    facadeRun(K, r, low);
  }
  if (!low) { rooftops(K, runs); cables(K, runs); }
  ledges(K);
  if (T.ceilingLights) ceilingLights(K);
  drifts(K, runs);
  patches(K);
  if (!low) rubble(K, runs);
  K.finish();
}

// ---------- wall runs ----------
// A run is a straight stretch of wall facing open ground with the same floor level, wall height,
// wall surface and roof state in front of it.
function findRuns({ def, wall, base, roof, inb, I }) {
  const { w, h } = def, runs = [];
  DIRS.forEach(([dx, dz]) => {
    const lines = dx ? w : h, len = dx ? h : w;
    for (let L = 0; L < lines; L++) {
      let cur = null;
      for (let a = 0; a <= len; a++) {
        const x = dx ? L : a, z = dx ? a : L, nx = x + dx, nz = z + dz;
        let ok = a < len && inb(x, z) && wall(x, z) && inb(nx, nz) && !wall(nx, nz);
        let nb = 0, rf = 0, H = 0, wm = 0;
        if (ok) { nb = base(nx, nz); rf = roof(nx, nz); H = def.wallH[I(x, z)]; wm = def.wallMat[I(x, z)]; }
        if (cur && (!ok || Math.abs(nb - cur.nb) > 0.3 || H !== cur.H || wm !== cur.wm || (rf > 0) !== (cur.rf > 0) || a - cur.a1 > 1)) { runs.push(cur); cur = null; }
        if (!ok) continue;
        if (!cur) cur = { dx, dz, line: L, a0: a, a1: a, nb, nbMax: nb, H, wm, rf };
        else { cur.a1 = a; cur.nb = Math.min(cur.nb, nb); cur.nbMax = Math.max(cur.nbMax, nb); }
      }
      if (cur) runs.push(cur);
    }
  });
  for (const r of runs) {
    r.len = r.a1 - r.a0 + 1;
    r.plane = r.line + ((r.dx || r.dz) > 0 ? 1 : 0);
    r.s0 = r.a0; r.s1 = r.a1 + 1;
    r.ry = Math.atan2(r.dx, r.dz);
    r.tall = r.H - r.nb;
  }
  return runs;
}

function kitTools(ctx, st) {
  const { S, details, glow, place, hash, T } = ctx;
  const TR = T.trim || {};
  const trim = (k, dflt) => TR[k] || dflt || T.walls[0];
  const posters = new GeoBuilder();
  const strips = new Map();             // surface -> { pos, uv, col, ind }
  const K = {
    st, ctx, T, TR, trim, hash, details, glow, place, S,
    R: (r, k) => hash(r.line * 3.1 + r.dx * 17 + r.dz * 29, r.a0 * 1.7 + r.a1 * 0.3, k),
    rng: (v, a) => v[0] + (v[1] - v[0]) * a,
    // world [x, z] of a point on run r at along-coordinate s, offset o outward from the wall plane
    P: (r, s, o) => (r.dx ? [r.plane + r.dx * o, s] : [s, r.plane + r.dz * o]),
    // axis-aligned textured box in the run's frame: width along the wall, height, depth outward (centre at o)
    box(r, b, s, y, o, wa, hh, dd, col = 0xffffff) {
      const [x, z] = K.P(r, s, o);
      if (r.dx) b.wbox(dd, hh, wa, x, y, z, col); else b.wbox(wa, hh, dd, x, y, z, col);
    },
    dbox(r, s, y, o, wa, hh, dd, col) { const [x, z] = K.P(r, s, o); if (r.dx) details.box(dd, hh, wa, x, y, z, col); else details.box(wa, hh, dd, x, y, z, col); },
    model(r, name, s, y, o, extra = 0, sc = 1) { const [x, z] = K.P(r, s, o); place(name, x, y, z, r.ry + extra, sc); },
    poster(r, s, y, k) {
      const gfx = k >= 4, col = k % 4, pw = gfx ? 1.4 : 0.8, ph = gfx ? 0.7 : 1.05, row = gfx ? 0 : 0.5;
      const a = K.P(r, s - pw / 2, 0.012), b = K.P(r, s + pw / 2, 0.012), V = ctx.V, u0 = col / 4, u1 = u0 + 0.25;
      // left-to-right as seen from the front of the wall
      const [pa, pb] = (r.dz > 0 || r.dx < 0) ? [a, b] : [b, a];
      posters.quad(V(pa[0], y, pa[1]), V(pb[0], y, pb[1]), V(pb[0], y + ph, pb[1]), V(pa[0], y + ph, pa[1]), 0xffffff, [u0, row, u1, row, u1, row + 0.5, u0, row + 0.5], [1, 1, 1, 1]);
    },
    // soft alpha strip on the ground along a run (sand drifts, grime)
    strip(name, r, width, alpha, col = 0xffffff, lift = 0.012) {
      if (!strips.has(name)) strips.set(name, { pos: [], uv: [], col: [], ind: [], n: 0 });
      const sb = strips.get(name), c = new THREE.Color(col);
      const step = 0.5, y = r.nb + lift;
      for (let s = r.s0; s < r.s1 - 1e-6; s += step) {
        const s2 = Math.min(r.s1, s + step);
        const w1 = width * (0.55 + 0.9 * hash(Math.floor(s * 2), r.line, 91 + r.dx * 3 + r.dz)), w2 = width * (0.55 + 0.9 * hash(Math.floor(s2 * 2), r.line, 91 + r.dx * 3 + r.dz));
        const q = [K.P(r, s, 0.0), K.P(r, s2, 0.0), K.P(r, s2, w2), K.P(r, s, w1)];
        const al = [alpha, alpha, 0, 0];
        const b0 = sb.n;
        q.forEach(([x, z], k) => { sb.pos.push(x, y, z); sb.uv.push(x, z); sb.col.push(c.r, c.g, c.b, al[k]); });
        // wind so the strip faces up
        const up = (r.dz > 0 || r.dx < 0);
        if (up) sb.ind.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2); else sb.ind.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
        sb.n += 4;
      }
    },
    // soft irregular blob of another surface on the floor (breaks up large uniform areas)
    blob(name, x, y, z, rad, alpha, col = 0xffffff) {
      if (!strips.has(name)) strips.set(name, { pos: [], uv: [], col: [], ind: [], n: 0 });
      const sb = strips.get(name), c = new THREE.Color(col), n = 14, b0 = sb.n;
      sb.pos.push(x, y, z); sb.uv.push(x, z); sb.col.push(c.r, c.g, c.b, alpha);
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, rr = rad * (0.6 + 0.55 * hash(x * 3 + k, z * 7, 7));
        const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        sb.pos.push(px, y, pz); sb.uv.push(px, pz); sb.col.push(c.r, c.g, c.b, 0);
      }
      for (let k = 0; k < n; k++) sb.ind.push(b0, b0 + 1 + ((k + 1) % n), b0 + 1 + k);
      sb.n += n + 1;
    },
    finish() {
      if (posters.count) {
        const m = new THREE.Mesh(posters.build(), new THREE.MeshLambertMaterial({ map: posterAtlas(), vertexColors: true, transparent: true, alphaTest: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
        ctx.extra.push(m);
      }
      for (const [name, sb] of strips) {
        if (!sb.n) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(sb.pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(sb.uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(sb.col, 4));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(sb.n).fill(0).flatMap(() => [0, 1, 0]), 3));
        g.setIndex(sb.ind);
        const sf = name === 'grime' ? null : surf(name);
        const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, color: name === 'grime' ? 0x1e1a16 : 0xffffff });
        if (sf) { const apply = () => { mat.map = sf.map; mat.needsUpdate = true; }; if (sf.map) apply(); else sf.ready.then(apply); }
        ctx.extra.push(new THREE.Mesh(g, mat));
      }
    },
  };
  return K;
}

// ---------- open-air facades ----------
function facadeRun(K, r, low) {
  const { st, S, trim } = K;
  const wallS = K.T.walls[r.wm] || K.T.walls[0];
  const metalWall = /corrugated|metal_sheet|factory_panel|container/.test(wallS);
  const tall = r.tall, len = r.len;
  if (tall < 2.2) { if (!metalWall) K.box(r, S(trim('cap', wallS)), r.s0 + len / 2, r.H + 0.04, 0.02, len, 0.08, 0.3); return; }

  // plinth / base course
  if (!metalWall && K.R(r, 1) < st.plinth && tall > 3) {
    const bh = 0.45 + K.R(r, 2) * 0.35;
    K.box(r, S(trim('base', 'stone_rubble')), r.s0 + len / 2, r.nb + bh / 2, 0.035, len, bh, 0.07);
  }
  // hazard / grime band at the foot of industrial walls
  if (st.hazard && K.R(r, 3) < st.hazard && tall > 3) hazardBand(K, r);

  // cornice + parapet along the top
  const cap = S(trim('cornice', wallS));
  if (!metalWall) {
    K.box(r, cap, r.s0 + len / 2, r.H - 0.22, 0.07, len, 0.28, 0.14);
    K.box(r, cap, r.s0 + len / 2, r.H - 0.04, 0.11, len + 0.1, 0.08, 0.22);
    if (tall > 4 && K.R(r, 4) < st.parapet) {
      const ph = 0.5 + K.R(r, 5) * 0.5;
      K.box(r, S(wallS), r.s0 + len / 2, r.H + ph / 2, -0.14, len, ph, 0.28);
      K.box(r, cap, r.s0 + len / 2, r.H + ph + 0.04, -0.12, len + 0.06, 0.08, 0.36);
      if (K.T.facade === 'desert' && K.R(r, 6) < 0.12) {
        // crenellated top: small merlons along the parapet
        for (let s = r.s0 + 0.5; s < r.s1 - 0.4; s += 1.2) K.box(r, S(wallS), s, r.H + ph + 0.25, -0.14, 0.6, 0.42, 0.28);
      }
    }
  } else {
    // metal buildings: flashing trim on top and a gutter
    K.box(r, S('rusty'), r.s0 + len / 2, r.H - 0.1, 0.06, len + 0.05, 0.2, 0.12, 0x9a9a9a);
    K.dbox(r, r.s0 + len / 2, r.H - 0.32, 0.14, len, 0.1, 0.12, 0x5d6166);
  }
  // string course between floors
  if (!metalWall && tall > 6 && K.R(r, 7) < st.band) {
    const y = r.nb + st.win.floor + 0.15;
    if (st.tileBand && K.R(r, 8) < 0.6) K.box(r, S('tile_pattern'), r.s0 + len / 2, y + 0.1, 0.03, len, 0.42, 0.06);
    else K.box(r, cap, r.s0 + len / 2, y, 0.05, len, 0.14, 0.1);
  }
  // corner quoins at the run ends where the building turns a convex corner
  if (st.quoins && !metalWall && tall > 3 && !low) {
    for (const end of [0, 1]) {
      const cellA = end ? r.a1 : r.a0, side = end ? 1 : -1;
      const cx = r.dx ? r.line : cellA + side, cz = r.dx ? cellA + side : r.line;
      if (K.ctx.wall(cx, cz)) continue;          // wall continues around an inside corner
      for (let y = r.nb + 0.35, k = 0; y < r.H - 0.5; y += 0.36, k++) {
        const qw = k % 2 ? 0.42 : 0.6;
        K.box(r, S(trim('quoin', 'sandstone')), end ? r.s1 - qw / 2 : r.s0 + qw / 2, y, 0.03, qw, 0.32, 0.06);
      }
    }
  }
  // pilasters on long industrial walls
  if (metalWall || K.T.facade === 'facility') {
    for (let s = r.s0 + 4; s < r.s1 - 2; s += 6) K.box(r, S(trim('pilaster', 'concrete_wall')), s, r.nb + tall / 2, 0.08, 0.4, tall, 0.16);
  }

  // slots along the run: doors / shopfronts on the ground floor, windows above
  const slots = [];
  const mark = (s0, s1) => slots.push([s0, s1]);
  const free = (s0, s1) => s0 >= r.s0 + 0.5 && s1 <= r.s1 - 0.5 && slots.every(([a, b]) => s1 < a - 0.3 || s0 > b + 0.3);
  const flatFloor = r.nbMax - r.nb < 0.05;

  if (flatFloor && tall > 3) {
    let s = r.s0 + 1.5 + K.R(r, 10) * 4;
    let k = 0;
    while (s < r.s1 - 1.5) {
      const a = K.hash(Math.floor(s * 3), r.line, 20 + k);
      if (st.shop && a < st.shop && len >= 6) {
        const sw = 2.1;
        if (free(s - sw / 2 - 0.3, s + sw / 2 + 0.3)) { shopfront(K, r, s); mark(s - sw / 2 - 0.3, s + sw / 2 + 0.3); }
      } else if (st.door.rollup && a < st.door.rollup && tall > 4.5 && len >= 6) {
        const dw = K.rng(st.door.w, K.hash(s, r.line, 21)), dh = Math.min(tall - 1, K.rng(st.door.h, K.hash(s, r.line, 22)));
        if (free(s - dw / 2, s + dw / 2)) { rollupDoor(K, r, s, dw, dh); mark(s - dw / 2 - 0.3, s + dw / 2 + 0.3); }
      } else {
        const dw = st.door.w[0] + (st.door.w[1] - st.door.w[0]) * K.hash(s, r.line, 23), dh = Math.min(tall - 0.6, K.rng(st.door.h, K.hash(s, r.line, 24)));
        if (free(s - dw / 2 - 0.25, s + dw / 2 + 0.25)) { door(K, r, s, dw, dh); mark(s - dw / 2 - 0.25, s + dw / 2 + 0.25); }
      }
      s += K.rng(st.door.every, K.hash(s, r.line, 25));
      k++;
    }
  }

  // windows by floor
  const W = st.win;
  for (let fl = 0, y = r.nb + W.first; y + K.rng(W.h, 1) / 2 + 0.5 < r.H; fl++, y += W.floor) {
    let s = r.s0 + 1.1 + K.R(r, 30 + fl) * 1.2;
    while (s < r.s1 - 0.8) {
      const ww = K.rng(W.w, K.hash(s, r.line, 31 + fl)), wh = K.rng(W.h, K.hash(s, r.line, 32 + fl));
      const s0 = s - ww / 2 - 0.2, s1 = s + ww / 2 + 0.2;
      const clear = s0 >= r.s0 + 0.4 && s1 <= r.s1 - 0.4 && (fl > 0 || slots.every(([a, b]) => s1 < a || s0 > b || y - wh / 2 > r.nb + 3.1));
      if (clear) {
        if (W.strip) stripWindow(K, r, s, y, ww, wh);
        else window_(K, r, s, y, ww, wh, fl);
      }
      s += ww + K.rng(W.gap, K.hash(s, r.line, 33 + fl));
    }
  }

  if (low) return;
  // wall clutter: drainpipes, AC units, lamps, posters, boxes
  const along = (k) => r.s0 + 0.7 + K.R(r, k) * Math.max(0.1, len - 1.4);
  const clearAt = (s, hw) => slots.every(([a, b]) => s + hw < a || s - hw > b);
  if (tall > 4 && K.R(r, 40) < st.pipes) {
    const s = K.R(r, 41) < 0.5 ? r.s0 + 0.35 : r.s1 - 0.35;
    drainpipe(K, r, s, metalWall);
  }
  if (st.ac && tall > 5 && K.R(r, 42) < st.ac && len > 3) {
    const n = 1 + Math.floor(K.R(r, 43) * Math.min(3, len / 5));
    for (let k = 0; k < n; k++) {
      const s = along(44 + k), y = r.nb + 2.6 + Math.floor(K.R(r, 50 + k) * Math.max(1, (tall - 3.6) / 3.3)) * 3.3;
      if (y + 1 < r.H - 0.4) acUnit(K, r, s, y, K.R(r, 55 + k));
    }
  }
  if (st.lamps && tall > 3.6 && K.R(r, 60) < st.lamps && len > 2) {
    const s = along(61);
    if (clearAt(s, 0.4)) {
      if (st.lamp === 'wall_lamp') { K.model(r, 'wall_lamp', s, r.nb + 2.2, 0.02); glowAt(K, r, s, r.nb + 3.25, 0.62); }
      else if (st.lamp === 'lantern') { K.dbox(r, s, r.nb + 3.05, 0.25, 0.05, 0.05, 0.5, 0x2a2a2a); K.model(r, 'lantern', s, r.nb + 2.6, 0.45); glowAt(K, r, s, r.nb + 2.8, 0.45); }
      else { K.model(r, st.lamp, s, r.nb + 3.4, 0.0); glowAt(K, r, s, r.nb + 3.55, 0.25); }
    }
  }
  if (st.cameras && tall > 4 && K.R(r, 62) < st.cameras) K.model(r, 'camera', r.s0 + 0.6, r.nb + 3.6, 0.0, 0);
  if (st.vents && tall > 4 && K.R(r, 63) < st.vents) {
    const s = along(64);
    if (clearAt(s, 0.4)) K.model(r, 'vent_fan', s, r.nb + 2.8 + K.R(r, 65) * Math.max(0, tall - 4.5), 0.0);
  }
  if (st.ducts && tall > 5 && len > 5 && K.R(r, 66) < st.ducts) duct(K, r);
  if (st.ladders && tall > 4.5 && K.R(r, 67) < st.ladders) { const s = along(68); if (clearAt(s, 0.5)) ladder(K, r, s); }
  if (st.posters && tall > 3) {
    for (let s = r.s0 + 0.8; s < r.s1 - 0.8; s += 1.6) {
      const k = K.hash(Math.floor(s), r.line, 70 + r.dx + r.dz * 2);
      if (k < st.posters * 1.6 && clearAt(s, 0.8)) K.poster(r, s, r.nb + (k < st.posters * 0.8 ? 1.5 : 1.0), Math.floor(K.hash(s, r.line, 71) * 8));
    }
  }
  // electricity meter boxes with conduit up the wall
  if (!metalWall && tall > 3.5 && K.R(r, 72) < 0.18) {
    const s = along(73);
    if (clearAt(s, 0.3)) {
      K.dbox(r, s, r.nb + 1.45, 0.07, 0.38, 0.52, 0.14, 0xb8b6ae);
      K.dbox(r, s, r.nb + 1.45, 0.145, 0.3, 0.36, 0.01, 0x55585a);
      K.dbox(r, s + 0.1, r.nb + 1.71 + (tall - 2.2) / 2, 0.03, 0.04, tall - 2, 0.04, 0x3a3c3e);
    }
  }
}

function glowAt(K, r, s, y, o) {
  const [x, z] = K.P(r, s, o);
  K.glow.box(0.12, 0.08, 0.12, x, y, z, 0xffe8b0);
}

function window_(K, r, s, y, ww, wh, fl) {
  const { st, S, trim } = K, W = st.win, low = K.ctx.quality === 'low';
  const h = K.hash(s * 1.3, r.line + fl * 7, 34);
  const frameS = S(trim('frame', 'wood')), sill = S(trim('sill', 'plaster_white')), shut = S('door_wood');
  const tint = st.shutterTints[Math.floor(K.hash(s, r.line, 35) * st.shutterTints.length)];
  const arch = K.hash(s, r.line, 36) < W.arch;
  if (h < W.bricked) {
    // bricked-up window: sill, lintel and an infill patch
    K.box(r, S(trim('infill', 'sandbrick')), s, y, 0.015, ww, wh, 0.03);
    K.box(r, sill, s, y - wh / 2 - 0.05, 0.06, ww + 0.25, 0.1, 0.12);
    return;
  }
  // glass: dark interior with a sky reflection gradient, some with curtains drawn
  glass(K, r, s, y, ww, wh);
  // frame, mullions
  const f = 0.08;
  K.box(r, frameS, s - ww / 2 + f / 2, y, 0.05, f, wh, 0.1, tint);
  K.box(r, frameS, s + ww / 2 - f / 2, y, 0.05, f, wh, 0.1, tint);
  K.box(r, frameS, s, y + wh / 2 - f / 2, 0.05, ww, f, 0.1, tint);
  K.box(r, frameS, s, y - wh / 2 + f / 2, 0.05, ww, f, 0.1, tint);
  if (!low) { K.box(r, frameS, s, y, 0.035, 0.04, wh - f, 0.05, tint); if (wh > 1.2) K.box(r, frameS, s, y + wh * 0.18, 0.035, ww - f, 0.04, 0.05, tint); }
  // sill and lintel / arch
  K.box(r, sill, s, y - wh / 2 - 0.05, 0.08, ww + 0.28, 0.1, 0.16);
  if (arch) archOver(K, r, s, y + wh / 2, ww, trim('sill', 'plaster_white'));
  else K.box(r, sill, s, y + wh / 2 + 0.1, 0.05, ww + 0.34, 0.2, 0.1);
  const k = K.hash(s, r.line, 37);
  if (k < W.shutClosed) {
    // closed louvred shutters
    for (const side of [-1, 1]) K.box(r, shut, s + side * ww / 4, y, 0.09, ww / 2 - 0.02, wh - 0.04, 0.04, tint);
    K.dbox(r, s, y, 0.115, 0.02, wh - 0.1, 0.01, 0x2a2a2a);
  } else if (k < W.shutClosed + W.shutOpen) {
    // shutters swung open flat against the wall
    for (const side of [-1, 1]) K.box(r, shut, s + side * (ww * 0.75 + 0.05), y, 0.035, ww / 2, wh, 0.04, tint);
  }
  if (!low && K.hash(s, r.line, 38) < W.grille) {
    const n = Math.max(3, Math.round(ww / 0.14));
    for (let i = 1; i < n; i++) K.dbox(r, s - ww / 2 + i * ww / n, y, 0.13, 0.018, wh, 0.018, 0x26282a);
    for (const yy of [-wh / 3, wh / 3]) K.dbox(r, s, y + yy, 0.13, ww, 0.022, 0.02, 0x26282a);
  }
  // potted plant on the sill / balcony
  if (st.balcony && fl >= 0 && K.hash(s, r.line, 39) < st.balcony && ww > 0.95) balcony(K, r, s, y - wh / 2, ww, tint);
  else if (st.plants && K.hash(s, r.line, 40) < st.plants) K.model(r, 'pot_clay', s + (K.hash(s, r.line, 41) - 0.5) * ww * 0.5, y - wh / 2, 0.12, 0, 0.9);
}

function archOver(K, r, s, y, ww, surfName) {
  // semicircular arch from segments + keystone
  const n = 9, R = ww / 2 + 0.08, b = K.S(surfName);
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (i + 0.5) / n, x = Math.cos(a) * R, yy = Math.sin(a) * R * 0.75;
    K.box(r, b, s + x, y + yy, 0.05, 0.22, 0.14, 0.1);
  }
  K.dbox(r, s, y + R * 0.3, 0.008, ww * 0.8, R * 0.5, 0.016, 0x151a20);
}

function balcony(K, r, s, y, ww, tint) {
  const bw = ww + 1.2, bd = 0.9, wood = K.S('wood');
  K.box(r, K.S(K.trim('sill', 'plaster_white')), s, y - 0.08, bd / 2, bw, 0.16, bd);
  // corbels
  for (const side of [-1, 1]) K.box(r, K.S(K.trim('sill', 'plaster_white')), s + side * (bw / 2 - 0.2), y - 0.35, 0.25, 0.14, 0.4, 0.5);
  // railing: posts + rail (wrought iron)
  const n = Math.round(bw / 0.13);
  for (let i = 0; i <= n; i++) K.dbox(r, s - bw / 2 + i * bw / n, y + 0.5, bd - 0.04, 0.02, 0.9, 0.02, 0x222426);
  for (const side of [-1, 1]) K.dbox(r, s + side * bw / 2, y + 0.5, bd / 2, 0.02, 0.9, bd, 0x222426);
  K.dbox(r, s, y + 0.96, bd - 0.04, bw, 0.04, 0.05, 0x222426);
  if (K.hash(s, r.line, 42) < 0.6) K.model(r, 'pot_clay', s - bw / 2 + 0.3, y, bd - 0.25, 0, 1.2);
  if (K.hash(s, r.line, 43) < 0.35) K.box(r, wood, s + bw / 2 - 0.4, y + 0.4, bd - 0.1, 0.5, 0.05, 0.05, tint);
}

function door(K, r, s, dw, dh) {
  const { st, S, trim } = K;
  const y0 = r.nb, h = K.hash(s, r.line, 26);
  const stone = S(trim('doorframe', trim('sill', 'plaster_white')));
  const tint = (st.shutterTints || [0xffffff])[Math.floor(K.hash(s, r.line, 27) * (st.shutterTints || [1]).length)];
  const gate = st.door.gate || 0;
  if (gate && h < gate && r.len > 5) {
    // big iron gate in a stone frame
    K.dbox(r, s, y0 + 1.46, 0.01, 2.9, 2.9, 0.02, 0x121416);
    K.model(r, 'iron_gate', s, y0, 0.06);
    K.box(r, stone, s, y0 + 3.05, 0.1, 3.5, 0.3, 0.2);
    return;
  }
  if (h < gate + (st.door.metal || 0)) {
    if (K.T.facade === 'facility' || K.T.facade === 'industrial') {
      // painted steel door with a small window and kick plate
      const col = [0x6a7078, 0x8a3a2a, 0x3a5a7a, 0xa08a3a][Math.floor(K.hash(s, r.line, 28) * 4)];
      K.box(r, S('rusty'), s, y0 + dh / 2, 0.03, dw, dh, 0.06, col);
      K.dbox(r, s, y0 + dh * 0.72, 0.065, dw * 0.35, dh * 0.2, 0.01, 0x1b2026);
      K.dbox(r, s + dw * 0.35, y0 + dh * 0.45, 0.08, 0.05, 0.16, 0.05, 0x999999);
      K.box(r, S(trim('frame', 'concrete_wall')), s, y0 + dh + 0.08, 0.05, dw + 0.3, 0.16, 0.1, 0xb0b0b0);
      for (const sd of [-1, 1]) K.box(r, S(trim('frame', 'concrete_wall')), s + sd * (dw / 2 + 0.07), y0 + dh / 2, 0.05, 0.14, dh, 0.1, 0xb0b0b0);
      if (K.hash(s, r.line, 29) < 0.6) glowAt(K, r, s, y0 + dh + 0.35, 0.12);
      return;
    }
    K.model(r, K.hash(s, r.line, 28) < 0.4 ? 'shutter_door_g' : 'shutter_door', s, y0, 0.0, 0, Math.min(1.3, dw / 1.08));
    return;
  }
  // wooden door with a stone frame (arched in some styles)
  const arch = K.hash(s, r.line, 30) < st.door.arch;
  K.dbox(r, s, y0 + dh / 2, 0.008, dw, dh, 0.016, 0x16130f);
  K.box(r, S('door_wood'), s, y0 + dh / 2, 0.035, dw - 0.08, dh - 0.04, 0.05, tint);
  K.box(r, S('door_wood'), s, y0 + dh / 2, 0.064, 0.03, dh - 0.1, 0.01, 0x777777);
  K.dbox(r, s + dw * 0.32, y0 + dh * 0.47, 0.08, 0.06, 0.06, 0.04, 0x8a7440);
  for (const sd of [-1, 1]) K.box(r, stone, s + sd * (dw / 2 + 0.08), y0 + dh / 2, 0.06, 0.18, dh, 0.12);
  if (arch) {
    archOver(K, r, s, y0 + dh, dw, trim('doorframe', trim('sill', 'plaster_white')));
  } else K.box(r, stone, s, y0 + dh + 0.14, 0.07, dw + 0.5, 0.28, 0.14);
  K.box(r, stone, s, y0 + 0.025, 0.14, dw + 0.4, 0.05, 0.28);       // threshold (flat, walk-over)
  if (K.hash(s, r.line, 31) < 0.3) K.model(r, 'wall_light', s + dw / 2 + 0.4, y0 + dh + 0.1, 0.0);
}

function shopfront(K, r, s) {
  const { st } = K, y0 = r.nb;
  K.dbox(r, s, y0 + 0.95, 0.008, 2.1, 1.85, 0.016, 0x15171a);
  K.model(r, K.hash(s, r.line, 50) < 0.45 ? 'shutter_window_g' : 'shutter_window', s, y0 + 0.05, 0.0);
  K.box(r, K.S(K.trim('sill', 'plaster_white')), s, y0 + 2.05, 0.08, 2.5, 0.2, 0.16);
  // awning
  const col = st.awnings[Math.floor(K.hash(s, r.line, 51) * st.awnings.length)], n = 6, aw = 2.8, ad = 1.4;
  for (let k = 0; k < n; k++) {
    const ss = s - aw / 2 + (k + 0.5) * aw / n, [x, z] = K.P(r, ss, ad / 2 + 0.05);
    const tilt = 0.32;
    if (r.dx) K.details.box(ad, 0.03, aw / n, x, y0 + 2.62, z, k % 2 ? col : 0xe8e0d0, 0, 0, -r.dx * tilt);
    else K.details.box(aw / n, 0.03, ad, x, y0 + 2.62, z, k % 2 ? col : 0xe8e0d0, r.dz * tilt, 0, 0);
  }
  // shop sign board
  K.box(r, K.S('wood'), s, y0 + 3.1, 0.05, 2.2, 0.45, 0.06, [0xd0c0a0, 0x7a9aba, 0xa0c090][Math.floor(K.hash(s, r.line, 52) * 3)]);
}

function rollupDoor(K, r, s, dw, dh) {
  const y0 = r.nb;
  K.box(r, K.S('shutter'), s, y0 + dh / 2, 0.04, dw, dh, 0.06);
  K.box(r, K.S('rusty'), s, y0 + dh + 0.25, 0.18, dw + 0.3, 0.5, 0.36, 0x8a8a8a);
  for (const sd of [-1, 1]) K.dbox(r, s + sd * (dw / 2 + 0.06), y0 + dh / 2, 0.06, 0.12, dh, 0.12, 0x44474a);
  // hazard stripes on the jambs
  for (const sd of [-1, 1]) for (let y = y0 + 0.1; y < y0 + 1.2; y += 0.3) K.dbox(r, s + sd * (dw / 2 + 0.06), y + 0.07, 0.125, 0.13, 0.14, 0.01, 0xd8a820);
  if (K.hash(s, r.line, 53) < 0.4) { K.model(r, K.st.lamp === 'wall_light' ? 'wall_light' : 'security_light', s, y0 + dh + 0.65, 0.18); glowAt(K, r, s, y0 + dh + 0.6, 0.35); }
}

function stripWindow(K, r, s, y, ww, wh) {
  K.dbox(r, s, y, 0.008, ww, wh, 0.016, 0x1a2129);
  const n = Math.max(2, Math.round(ww / 0.9));
  for (let i = 0; i <= n; i++) K.dbox(r, s - ww / 2 + i * ww / n, y, 0.04, 0.06, wh, 0.07, 0x5a5f64);
  K.dbox(r, s, y + wh / 2 + 0.03, 0.04, ww + 0.06, 0.06, 0.08, 0x5a5f64);
  K.dbox(r, s, y - wh / 2 - 0.04, 0.07, ww + 0.1, 0.08, 0.14, 0x6a6f74);
}

function hazardBand(K, r) {
  // black/yellow chevrons along the foot of the wall
  const len = r.len, y = r.nb + 0.3;
  for (let s = r.s0 + 0.1; s < r.s1 - 0.1; s += 0.5) K.dbox(r, s + 0.125, y, 0.012, 0.25, 0.3, 0.02, 0xd8a820);
  K.dbox(r, r.s0 + len / 2, y, 0.009, len, 0.3, 0.018, 0x1e1e1e);
}

function drainpipe(K, r, s, metal) {
  const col = metal ? 0x7a7e82 : 0x8a7a64, top = r.H - 0.25, bot = r.nb + 0.25, [x, z] = K.P(r, s, 0.1);
  K.details.cyl(0.055, 0.055, top - bot, x, (top + bot) / 2, z, col, 7);
  K.details.box(0.18, 0.2, 0.18, x, top, z, col);
  const [x2, z2] = K.P(r, s, 0.2);
  K.details.box(0.12, 0.12, 0.12, x2, bot, z2, col);
  for (let y = bot + 1; y < top; y += 1.6) K.details.box(r.dx ? 0.12 : 0.16, 0.04, r.dx ? 0.16 : 0.12, x, y, z, 0x4a4c4e);
}

function duct(K, r) {
  // horizontal round duct along the wall on brackets, with joint collars every 1.5 m
  const y = r.nb + 3.4 + K.R(r, 80) * Math.max(0, r.tall - 4.6), o = 0.34, s0 = r.s0 + 0.8, s1 = r.s1 - 0.8, len = s1 - s0;
  if (len < 2) return;
  const [x, z] = K.P(r, (s0 + s1) / 2, o), b = K.S('rusty'), col = 0xc8ccd0;
  if (r.dx) b.wcyl(0.2, 0.2, len, x, y, z, col, 10, Math.PI / 2, 0, 0); else b.wcyl(0.2, 0.2, len, x, y, z, col, 10, 0, 0, Math.PI / 2);
  for (let s = s0 + 0.2; s < s1; s += 1.5) {
    const [cx, cz] = K.P(r, s, o);
    if (r.dx) K.details.cyl(0.215, 0.215, 0.06, cx, y, cz, 0x7a7e82, 10, Math.PI / 2, 0, 0); else K.details.cyl(0.215, 0.215, 0.06, cx, y, cz, 0x7a7e82, 10, 0, 0, Math.PI / 2);
    K.dbox(r, s, y + 0.23, o / 2, 0.04, 0.04, o, 0x44474a);
  }
}

function ladder(K, r, s) {
  // steel wall ladder: two rails and rungs, with stand-off brackets
  const y0 = r.nb + 0.3, y1 = r.H - 0.2, o = 0.18, col = 0x5a5e62;
  for (const sd of [-0.22, 0.22]) K.dbox(r, s + sd, (y0 + y1) / 2, o, 0.05, y1 - y0, 0.05, col);
  for (let y = y0 + 0.2; y < y1; y += 0.3) K.dbox(r, s, y, o, 0.44, 0.03, 0.03, col);
  for (let y = y0 + 0.5; y < y1; y += 2) for (const sd of [-0.22, 0.22]) K.dbox(r, s + sd, y, o / 2, 0.04, 0.04, o, col);
}

// interiors (faces under a roof): skirting, lights, pipes
function interiorRun(K, r) {
  const len = r.len;
  if (r.rf - r.nb < 2) return;
  K.box(r, K.S(K.trim('skirting', K.trim('base', 'stone_rubble'))), r.s0 + len / 2, r.nb + 0.12, 0.02, len, 0.24, 0.04);
  if (K.st.pipes && K.R(r, 90) < 0.3 && len > 4) {
    const y = r.rf - 0.35;
    const [x0, z0] = K.P(r, r.s0 + len / 2, 0.12);
    if (r.dx) K.details.cyl(0.07, 0.07, len, x0, y, z0, 0x6a6e72, 8, Math.PI / 2, 0, 0);
    else K.details.cyl(0.07, 0.07, len, x0, y, z0, 0x6a6e72, 8, 0, 0, Math.PI / 2);
  }
}

// ---------- rooftops ----------
function rooftops(K, runs) {
  const { ctx } = K, st = K.st, used = new Set();
  for (const r of runs) {
    if (r.rf > 0 || r.tall < 4 || r.len < 4 || K.R(r, 100) > st.rooftop) continue;
    const n = 1 + Math.floor(K.R(r, 101) * Math.min(3, r.len / 6));
    for (let k = 0; k < n; k++) {
      const s = r.s0 + 1 + K.R(r, 102 + k) * (r.len - 2), depth = 1.6 + K.R(r, 110 + k) * 2.5;
      const [x, z] = K.P(r, s, -depth), cx = Math.floor(x), cz = Math.floor(z), key = cx + ',' + cz;
      if (used.has(key)) continue;
      // must sit on the same building top, clear of other buildings' faces
      let ok = true;
      for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) if (!ctx.wall(cx + dx, cz + dz) || Math.abs(ctx.wallTop(cx + dx, cz + dz) - r.H) > 0.01) { ok = false; break; }
      if (!ok) continue;
      used.add(key);
      const kind = K.R(r, 120 + k), y = r.H, ry = r.ry;
      if (K.T.facade === 'desert' || K.T.facade === 'medina') {
        if (kind < 0.3) waterTank(K, x, y, z, K.R(r, 130 + k));
        else if (kind < 0.5) { K.S('rusty').wbox(0.9, 0.62, 0.7, x, y + 0.34, z, 0xd6d6cf); K.details.cyl(0.24, 0.24, 0.03, x, y + 0.66, z, 0x2a2c2e, 12); }
        else if (kind < 0.65) dish(K, x, y, z, ry);
        else if (kind < 0.8) antenna(K, x, y, z);
        else chimney(K, x, y, z);
      } else {
        if (kind < 0.35) K.place('vent_fan', x, y + 0.02, z, ry, 1.6);
        else if (kind < 0.6) { K.S('rusty').wbox(1.6, 1.2, 1.2, x, y + 0.6, z, 0xa8aaac); K.details.box(1.2, 0.08, 0.9, x, y + 1.24, z, 0x3a3c3e); }
        else if (kind < 0.8) waterTank(K, x, y, z, 0.2);
        else antenna(K, x, y, z);
      }
    }
  }
}
function waterTank(K, x, y, z, a) {
  const white = a < 0.5, r = 0.55 + a * 0.3;
  if (white) { K.S('grey_plaster').wcyl(r, r, 1.3, x, y + 0.75, z, 0xf0f0ea, 14); K.details.cyl(r * 0.3, r * 0.3, 0.12, x, y + 1.45, z, 0x444444, 10); }
  else K.S('rusty').wcyl(r, r, 1.1, x, y + 0.75, z, 0xb0b0b0, 14, 0, 0, Math.PI / 2);
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.details.box(0.06, 0.2, 0.06, x + ox * r * 0.6, y + 0.1, z + oz * r * 0.6, 0x3a3a3a);
}
function dish(K, x, y, z, ry) {
  K.details.box(0.06, 0.8, 0.06, x, y + 0.4, z, 0x666666);
  K.details.lathe([[0.01, 0], [0.25, 0.04], [0.42, 0.12], [0.45, 0.14]], x, y + 0.85, z, 0xe8e8e2, 14, -1.0, ry, 0);
}
function antenna(K, x, y, z) {
  K.details.cyl(0.02, 0.03, 3.2, x, y + 1.6, z, 0x555555, 5);
  for (let k = 0; k < 4; k++) K.details.box(1.1 - k * 0.2, 0.02, 0.02, x, y + 2.2 + k * 0.28, z, 0x555555, 0, k * 0.2, 0);
}
function chimney(K, x, y, z) {
  K.S(K.trim('cornice', K.T.walls[0])).wbox(0.6, 1.2, 0.6, x, y + 0.6, z);
  K.details.box(0.72, 0.08, 0.72, x, y + 1.24, z, 0x5a5048);
}

// ---------- cables strung across streets ----------
function cables(K, runs) {
  const { ctx } = K, st = K.st;
  if (!st.cables) return;
  for (const r of runs) {
    if (r.rf > 0 || r.tall < 4.5 || K.R(r, 140) > st.cables) continue;
    const s = r.s0 + 0.5 + K.R(r, 141) * (r.len - 1), y = Math.min(r.H - 0.4, r.nb + 4.4 + K.R(r, 142) * 1.5);
    // march across the street until we hit the facing wall
    let d = 0, hit = false;
    for (d = 1; d < 18; d++) {
      const [x, z] = K.P(r, s, d - 0.5), cx = Math.floor(x), cz = Math.floor(z);
      if (ctx.wall(cx, cz)) { hit = ctx.wallTop(cx, cz) > y + 0.3; break; }
      if (ctx.roof(cx, cz) > 0 && ctx.roof(cx, cz) < y + 0.5) break;
      if (ctx.hgt(cx, cz) > y - 2.3) break;
    }
    if (!hit || d < 3) continue;
    const n = K.R(r, 143) < 0.35 ? 2 : 1;
    for (let c = 0; c < n; c++) {
      const [ax, az] = K.P(r, s + c * 0.3, 0.05), [bx, bz] = K.P(r, s + c * 0.3 + (K.R(r, 144) - 0.5) * 2, d - 1.05);
      const sag = 0.35 + d * 0.05 + c * 0.2, seg = 10, y2 = y - K.R(r, 145) * 0.6 + c * 0.25;
      let px = ax, py = y + c * 0.25, pz = az;
      for (let k = 1; k <= seg; k++) {
        const t = k / seg, qx = ax + (bx - ax) * t, qz = az + (bz - az) * t, qy = (y + c * 0.25) + (y2 - y) * t - sag * 4 * t * (1 - t);
        K.details.beam([px, py, pz], [qx, qy, qz], 0.025, 0x151515);
        px = qx; py = qy; pz = qz;
      }
    }
  }
}

// ---------- ledges: coping stones on raised platform edges ----------
function ledges(K) {
  const { ctx } = K, { def, I } = ctx, TR = K.TR;
  const name = TR.coping || TR.cornice;
  if (!name) return;
  const b = K.S(name);
  for (let z = 0; z < def.h; z++) for (let x = 0; x < def.w; x++) {
    if (ctx.wall(x, z)) continue;
    const i = I(x, z), m = def.mat[i], hh = def.height[i];
    if (hh < 0.5 || ![MAT.GROUND, MAT.PLATFORM, MAT.PAVE, MAT.STONE, MAT.TILES, MAT.CONCRETE, MAT.SAND, MAT.DIRT].includes(m)) continue;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (ctx.wall(nx, nz)) continue;
      const nm = def.mat[I(nx, nz)];
      const nh = nm === MAT.HIDDEN ? def.base[I(nx, nz)] : def.height[I(nx, nz)];
      if (hh - nh < 0.5) continue;
      const cx = x + 0.5 + dx * 0.42, cz = z + 0.5 + dz * 0.42;
      if (dx) b.wbox(0.26, 0.1, 1.0, cx, hh + 0.02, cz); else b.wbox(1.0, 0.1, 0.26, cx, hh + 0.02, cz);
    }
  }
}

// ---------- ground strips: sand drifts / grime along the foot of walls ----------
function drifts(K, runs) {
  const st = K.st, name = K.TR.drift;
  for (const r of runs) {
    if (r.nbMax - r.nb > 0.05) continue;
    if (r.rf > 0) { if (st.grime) K.strip('grime', r, 0.5, 0.35); continue; }
    if (name && K.R(r, 150) < st.drift) K.strip(name, r, 0.9 + K.R(r, 151) * 0.6, 0.9);
    else if (st.grime) K.strip('grime', r, 0.6, 0.3);
  }
}

// ---------- floor patches: sand / dirt blobs over large uniform floors ----------
function patches(K) {
  const { ctx } = K, { def, I } = ctx, TR = K.TR;
  const map = TR.patches;             // { [floor surface]: patch surface }
  if (!map) return;
  const surfOf = (m) => K.T.floors[m];
  for (let z = 2; z < def.h - 2; z += 3) for (let x = 2; x < def.w - 2; x += 3) {
    const hsh = K.hash(x, z, 160);
    if (hsh > (TR.patchDensity ?? 0.22)) continue;
    const i = I(x, z);
    if (ctx.wall(x, z) || def.roof[i] > 0 || def.mat[i] === MAT.HIDDEN || def.mat[i] === MAT.CRATE || def.mat[i] === MAT.CONTAINER || def.mat[i] === MAT.LOWWALL) continue;
    const name = map[surfOf(def.mat[i])];
    if (!name) continue;
    const h0 = def.height[i], rad = 1.2 + K.hash(x, z, 161) * 2.4;
    let flat = true;
    const R = Math.ceil(rad);
    for (let dz = -R; dz <= R && flat; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > rad * rad) continue;
      if (ctx.wall(x + dx, z + dz) || ctx.roof(x + dx, z + dz) > 0 || Math.abs(ctx.hgt(x + dx, z + dz) - h0) > 0.01) { flat = false; break; }
    }
    if (!flat) continue;
    K.blob(name, x + 0.5 + (K.hash(x, z, 162) - 0.5), h0 + 0.008, z + 0.5 + (K.hash(x, z, 163) - 0.5), rad, 0.75);
  }
}

// ---------- loose rubble at the foot of old walls ----------
function rubble(K, runs) {
  if (K.T.facade !== 'desert' && K.T.facade !== 'medina') return;
  const cols = [0xa89878, 0x8e8068, 0xbfae8c, 0x7c705e];
  for (const r of runs) {
    if (r.rf > 0 || r.nbMax - r.nb > 0.05) continue;
    for (let s = r.s0 + 0.5; s < r.s1 - 0.5; s += 2) {
      if (K.hash(Math.floor(s), r.line, 170 + r.dx * 3 + r.dz) > 0.12) continue;
      for (let k = 0; k < 5; k++) {
        const a = K.hash(s, r.line, 171 + k), b = K.hash(s, r.line, 180 + k), sz = 0.06 + a * 0.13;
        const [x, z] = K.P(r, s + (b - 0.5) * 1.2, 0.08 + a * 0.3);
        K.details.box(sz * 1.5, sz * 0.8, sz, x, r.nb + sz * 0.3, z, cols[k % 4], b * 0.6, a * 6, 0);
      }
    }
  }
}

// wall-mounted AC unit: sheet-metal body, round fan grille, brackets and a drip pipe
function acUnit(K, r, s, y, a) {
  const col = a < 0.5 ? 0xe2e2da : 0xc8c2b4;
  K.box(r, K.S('rusty'), s, y + 0.3, 0.2, 0.82, 0.58, 0.32, col);
  const [x, z] = K.P(r, s - 0.12, 0.365);
  if (r.dx) K.details.cyl(0.2, 0.2, 0.02, x, y + 0.3, z, 0x26282a, 12, 0, 0, Math.PI / 2);
  else K.details.cyl(0.2, 0.2, 0.02, x, y + 0.3, z, 0x26282a, 12, Math.PI / 2, 0, 0);
  for (let k = -2; k <= 2; k++) K.dbox(r, s - 0.12 + k * 0.07, y + 0.3, 0.375, 0.012, 0.38, 0.01, 0x55585a);
  for (const sd of [-1, 1]) K.dbox(r, s + sd * 0.32, y - 0.02, 0.2, 0.04, 0.04, 0.4, 0x44474a);
  K.dbox(r, s + 0.36, y - 0.25, 0.05, 0.025, 0.5, 0.025, 0x3a3c3e);
}

// window glass: a darker lower half (interior) and a lighter reflective upper half; curtains sometimes
function glass(K, r, s, y, ww, wh) {
  const h = K.hash(s * 2.1, r.line, 44), tone = [0x2c3642, 0x3a4652, 0x252d36, 0x44505c][Math.floor(h * 4)];
  K.dbox(r, s, y - wh * 0.2, 0.008, ww, wh * 0.6, 0.016, 0x1a1e24);
  K.dbox(r, s, y + wh * 0.3, 0.009, ww, wh * 0.4, 0.016, tone);
  if (K.hash(s, r.line, 45) < 0.35) {
    const cc = [0xd8cdb8, 0xb86a4a, 0x8a9ab0, 0xe8e0d0, 0x6a8a6a][Math.floor(K.hash(s, r.line, 46) * 5)];
    const half = K.hash(s, r.line, 47) < 0.5;
    K.dbox(r, s + (half ? -ww * 0.25 : 0), y, 0.012, half ? ww * 0.45 : ww * 0.9, wh * 0.92, 0.012, cc);
  }
}

// ---------- ceiling light fittings in roofed areas (unlit glow strips + housings) ----------
function ceilingLights(K) {
  const { ctx } = K, { def, I } = ctx;
  for (let z = 1; z < def.h - 1; z++) for (let x = 1; x < def.w - 1; x++) {
    if ((x % 6) !== 3 || (z % 6) !== 3) continue;
    if (ctx.wall(x, z)) continue;
    const i = I(x, z), rf = def.roof[i];
    if (rf <= 0 || rf - def.height[i] < 3) continue;
    const alongX = K.hash(Math.floor(x / 18), Math.floor(z / 18), 190) < 0.5;
    const cx = x + 0.5, cz = z + 0.5;
    if (alongX) { K.details.box(1.3, 0.08, 0.3, cx, rf - 0.05, cz, 0x55585a); K.glow.box(1.2, 0.02, 0.18, cx, rf - 0.1, cz, 0xf4f2e8); }
    else { K.details.box(0.3, 0.08, 1.3, cx, rf - 0.05, cz, 0x55585a); K.glow.box(0.18, 0.02, 1.2, cx, rf - 0.1, cz, 0xf4f2e8); }
  }
}
