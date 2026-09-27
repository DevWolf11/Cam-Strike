import { MAT } from '../world.js';
import { PROP_SIZE } from './propsizes.js';
import { resolveTheme } from './skies.js';

// Tiny builder for grid maps. Everything starts as wall; you carve floors, raise blocks,
// add stairs and roofs, then describe zones, callouts, props and bot tactics.
// Coordinates are in cells (1 cell = 1 meter), rectangles are inclusive.
export function makeMap({ id, name, w, h, theme }) {
  const N = w * h;
  const m = {
    id, name, w, h, theme: resolveTheme(theme),
    solid: new Uint8Array(N).fill(1),
    height: new Float32Array(N),
    base: new Float32Array(N),         // natural floor height (under crates/props)
    roof: new Float32Array(N),
    mat: new Uint8Array(N),
    wallMat: new Uint8Array(N),
    wallH: new Float32Array(N).fill(theme.wallH ?? 6),
    tint: new Uint8Array(N),           // per-building colour variation index (theme.tints)
    floorMat: new Uint8Array(N),       // floor surface under invisible prop blocks
    color: new Map(),
    zones: {}, callouts: [], props: [], tactics: {},
  };
  const each = (x0, z0, x1, z1, fn) => {
    for (let z = Math.max(0, z0); z <= Math.min(h - 1, z1); z++)
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) fn(z * w + x, x, z);
  };
  m.each = each;
  m.floor = (x0, z0, x1, z1, hgt = 0, mat = MAT.GROUND) => {
    each(x0, z0, x1, z1, (i) => { m.solid[i] = 0; m.height[i] = hgt; m.base[i] = hgt; m.mat[i] = mat; m.color.delete(i); });
    return m;
  };
  m.wall = (x0, z0, x1, z1, wmat = 0, wh) => {
    each(x0, z0, x1, z1, (i) => { m.solid[i] = 1; m.wallMat[i] = wmat; if (wh) m.wallH[i] = wh; });
    return m;
  };
  // A raised walkable-or-not block (crate, container, low wall, platform...)
  m.block = (x0, z0, x1, z1, hgt, mat = MAT.CRATE, color) => {
    each(x0, z0, x1, z1, (i) => { if (m.solid[i]) m.base[i] = 0; else if (mat === MAT.HIDDEN && m.mat[i] !== MAT.HIDDEN) m.floorMat[i] = m.mat[i]; m.solid[i] = 0; m.height[i] = hgt; m.mat[i] = mat; if (color !== undefined) m.color.set(i, color); });
    return m;
  };
  // Raise relative to what's already there
  m.raise = (x0, z0, x1, z1, dh, mat = MAT.CRATE, color) => {
    each(x0, z0, x1, z1, (i) => { if (!m.solid[i]) { m.height[i] += dh; m.mat[i] = mat; if (color !== undefined) m.color.set(i, color); } });
    return m;
  };
  m.paint = (x0, z0, x1, z1, mat) => { each(x0, z0, x1, z1, (i) => { if (!m.solid[i]) m.mat[i] = mat; }); return m; };
  // Stairs rising in direction dir ('n' = toward smaller z, 's', 'e' = larger x, 'w')
  m.stairs = (x0, z0, x1, z1, dir, h0, h1, mat = MAT.CONCRETE) => {
    const len = dir === 'n' || dir === 's' ? z1 - z0 + 1 : x1 - x0 + 1;
    const step = (h1 - h0) / len;
    if (Math.abs(step) > 0.45) throw new Error(`${id}: stairs too steep at ${x0},${z0} (${step.toFixed(2)})`);
    each(x0, z0, x1, z1, (i, x, z) => {
      const k = dir === 'n' ? z1 - z : dir === 's' ? z - z0 : dir === 'e' ? x - x0 : x1 - x;
      m.solid[i] = 0; m.height[i] = m.base[i] = h0 + step * (k + 1); m.mat[i] = mat; m.color.delete(i);
    });
    return m;
  };
  m.roofed = (x0, z0, x1, z1, rh) => { each(x0, z0, x1, z1, (i) => { m.roof[i] = rh; }); return m; };
  m.wallHeight = (x0, z0, x1, z1, wh) => { each(x0, z0, x1, z1, (i) => { m.wallH[i] = wh; }); return m; };
  m.zone = (name, x0, z0, x1, z1) => { m.zones[name] = { x0, z0, x1, z1, name }; return m; };
  m.callout = (name, x0, z0, x1, z1, site = null) => { m.callouts.push({ name, x0, z0, x1, z1, site }); return m; };
  m.prop = (type, x, z, opts = {}) => { m.props.push({ type, x, z, ...opts }); return m; };
  // Barrels/props that also block movement: collision is an invisible raised cell
  m.barrel = (x, z, color) => {
    const base = m.height[z * w + x];
    m.block(x, z, x, z, base + 1.1, MAT.HIDDEN);
    m.props.push({ type: 'barrel', x: x + 0.5, z: z + 0.5, y: base, color });
    return m;
  };
  // Crates sit on whatever floor is there: dh = 1 (jumpable) or 2 (stacked)
  m.crates = (x0, z0, x1, z1, dh = 1) => m.raise(x0, z0, x1, z1, dh, MAT.CRATE);
  // A building block: solid, with its own height and wall surface index
  m.building = (x0, z0, x1, z1, hgt, wmat = 0, tint) => {
    const t = tint ?? Math.floor(((Math.sin(x0 * 12.9898 + z0 * 78.233 + x1 * 3.1 + z1 * 7.7) * 43758.5453) % 1 + 1) % 1 * 8);
    each(x0, z0, x1, z1, (i) => { m.solid[i] = 1; m.wallMat[i] = wmat; m.wallH[i] = hgt; m.tint[i] = t; });
    return m;
  };
  // Fill a rectangle of the solid mass with building lots of varied height and wall surface
  // (recursive splits, deterministic from seed). Carving floors afterwards reveals their facades.
  m.lots = (x0, z0, x1, z1, { h = [5, 9], mats = [0], min = 5, max = 12, seed = 1, step = 0.5 } = {}) => {
    let st = seed * 9301 + 49297;
    const rnd = () => ((st = (st * 16807) % 2147483647) / 2147483647);
    const split = (a0, b0, a1, b1) => {
      const wx = a1 - a0 + 1, wz = b1 - b0 + 1;
      if ((wx <= max && wz <= max && (rnd() < 0.5 || (wx < min * 2 && wz < min * 2))) || (wx < min * 2 && wz < min * 2)) {
        const hh = Math.round((h[0] + rnd() * (h[1] - h[0])) / step) * step;
        m.building(a0, b0, a1, b1, hh, mats[Math.floor(rnd() * mats.length)]);
        return;
      }
      if (wx >= wz && wx >= min * 2) { const c = a0 + min + Math.floor(rnd() * (wx - min * 2 + 1)); split(a0, b0, c - 1, b1); split(c, b0, a1, b1); }
      else if (wz >= min * 2) { const c = b0 + min + Math.floor(rnd() * (wz - min * 2 + 1)); split(a0, b0, a1, c - 1); split(a0, c, a1, b1); }
      else { const c = a0 + min + Math.floor(rnd() * Math.max(1, wx - min * 2 + 1)); split(a0, b0, Math.min(a1, c - 1), b1); if (c <= a1) split(c, b0, a1, b1); }
    };
    split(x0, z0, x1, z1);
    return m;
  };
  // Stone arch spanning a passage (visual). axis: direction of travel through it ('x' or 'z').
  m.arch = (x, z, axis, span, top, opts = {}) => { m.props.push({ type: 'arch', x, z, axis, span, top, ...opts }); return m; };
  // Palm tree with a trunk that blocks its cell
  m.palm = (x, z, hgt) => {
    const i = z * w + x, b0 = m.height[i];
    m.props.push({ type: 'palm', x: x + 0.5, z: z + 0.5, y: b0, h: hgt });
    m.block(x, z, x, z, b0 + 4, MAT.HIDDEN);
    return m;
  };
  // Model standing flush against the wall next to open cell (cx, cz), facing out into the cell
  m.wallModel = (model, cx, cz, opts = {}) => {
    const size = PROP_SIZE[model];
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h || !m.solid[nz * w + nx]) continue;
      const off = 0.5 - size[2] * (opts.scale || 1) / 2 - 0.02;
      return m.model(model, cx + 0.5 + dx * off, cz + 0.5 + dz * off, { rot: Math.atan2(-dx, -dz), ...opts });
    }
    throw new Error(`${id}: no wall next to ${cx},${cz} for ${model}`);
  };
  // Real prop model (assets/props). x, z are world meters (cell + 0.5 = centre); rot in radians.
  // solid: cells under the footprint become invisible blocks as tall as the prop (bullets and players stop).
  m.model = (model, x, z, { rot = 0, y, solid = true, h, scale = 1, color } = {}) => {
    const size = PROP_SIZE[model];
    if (!size) throw new Error(`${id}: unknown prop ${model}`);
    const ci = Math.floor(z) * w + Math.floor(x);
    const base = y ?? (m.solid[ci] ? 0 : m.height[ci]);
    m.props.push({ type: 'model', model, x, z, y: base, rot, scale, color });
    if (solid) {
      const hx = size[0] * scale / 2, hz = size[2] * scale / 2, c = Math.cos(rot), sn = Math.sin(rot);
      const ex = Math.abs(c) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(c) * hz;
      const top = base + (h ?? size[1] * scale);
      let any = false;
      const mark = (i) => { if (!m.solid[i] && m.height[i] < top) { if (m.mat[i] !== MAT.HIDDEN) { m.base[i] = m.height[i]; m.floorMat[i] = m.mat[i]; } m.height[i] = top; m.mat[i] = MAT.HIDDEN; } any = true; };
      each(Math.floor(x - ex), Math.floor(z - ez), Math.floor(x + ex), Math.floor(z + ez), (i, cx, cz) => {
        // cell centre inside the (rotated) footprint, shrunk a little so thin props don't swallow cells
        const dx = cx + 0.5 - x, dz = cz + 0.5 - z, lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        if (Math.abs(lx) <= hx + 0.05 && Math.abs(lz) <= hz + 0.05) mark(i);
      });
      if (!any) mark(ci);
    }
    return m;
  };
  return m;
}

// Point in cell coordinates -> world meters (cell center)
export const P = (x, z) => ({ x: x + 0.5, z: z + 0.5 });
export { MAT };
