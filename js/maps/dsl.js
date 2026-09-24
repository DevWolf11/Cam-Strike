import { MAT } from '../world.js';

// Tiny builder for grid maps. Everything starts as wall; you carve floors, raise blocks,
// add stairs and roofs, then describe zones, callouts, props and bot tactics.
// Coordinates are in cells (1 cell = 1 meter), rectangles are inclusive.
export function makeMap({ id, name, w, h, theme }) {
  const N = w * h;
  const m = {
    id, name, w, h, theme,
    solid: new Uint8Array(N).fill(1),
    height: new Float32Array(N),
    base: new Float32Array(N),         // natural floor height (under crates/props)
    roof: new Float32Array(N),
    mat: new Uint8Array(N),
    wallMat: new Uint8Array(N),
    wallH: new Float32Array(N).fill(theme.wallH ?? 6),
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
    each(x0, z0, x1, z1, (i) => { if (m.solid[i]) m.base[i] = 0; m.solid[i] = 0; m.height[i] = hgt; m.mat[i] = mat; if (color !== undefined) m.color.set(i, color); });
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
  return m;
}

// Point in cell coordinates -> world meters (cell center)
export const P = (x, z) => ({ x: x + 0.5, z: z + 0.5 });
export { MAT };
