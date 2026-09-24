import * as THREE from '../lib/three.module.min.js';

// Merges many small geometries (boxes, cylinders...) into one BufferGeometry with
// per-vertex colors, so a whole character or a map's props costs a single draw call.
export class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.ind = []; this.count = 0; }

  add(geo, matrix, color = 0xffffff, uvScale = 1) {
    const g = geo.index ? geo : geo;
    const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const c = new THREE.Color(color ?? 0xffffff), vc = color === null ? g.attributes.color : null;   // null = keep the geometry's own colors
    const v = new THREE.Vector3();
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z);
      if (t) this.uv.push(t.getX(i) * uvScale, t.getY(i) * uvScale); else this.uv.push(0, 0);
      if (vc) this.col.push(vc.getX(i), vc.getY(i), vc.getZ(i)); else this.col.push(c.r, c.g, c.b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.ind.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.ind.push(base + i);
    this.count += p.count;
    return this;
  }

  box(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    return this.add(BOX(w, h, d), m, color);
  }

  cyl(r0, r1, h, x, y, z, color, seg = 10, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    return this.add(new THREE.CylinderGeometry(r0, r1, h, seg), m, color);
  }

  sphere(r, x, y, z, color, seg = 8, sy = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1, sy, 1));
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)), m, color);
  }

  // Any geometry with position, Euler rotation and (optionally non-uniform) scale
  geo(geometry, x, y, z, color, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, uvScale = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    return this.add(geometry, m, color, uvScale);
  }

  ellipsoid(rx, ry, rz, x, y, z, color, seg = 12, erx = 0, ery = 0, erz = 0) {
    return this.geo(SPHERE(seg), x, y, z, color, erx, ery, erz, rx, ry, rz);
  }

  capsule(r, len, x, y, z, color, rx = 0, ry = 0, rz = 0, seg = 8) {
    return this.geo(CAPSULE(r, len, seg), x, y, z, color, rx, ry, rz);
  }

  // Capsule spanning two points [x, y, z]
  segment(a, b, r, color, seg = 6) {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = new THREE.Vector3().subVectors(Bv, A), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(A.add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    return this.add(CAPSULE(r, len, seg), m, color);
  }

  // Rounded box (bevelled on every edge)
  rbox(w, h, d, r, x, y, z, color, rx = 0, ry = 0, rz = 0) {
    return this.geo(RBOX(w, h, d, r), x, y, z, color, rx, ry, rz, 1, 1, 1, 4);
  }

  // Revolved profile. pts = [[radius, height], ...] around the local Y axis, then placed/rotated/scaled.
  lathe(pts, x, y, z, color, seg = 12, rx = 0, ry = 0, rz = 0, sx = 1, sz = 1) {
    const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(1e-4, r), h)), seg);
    return this.geo(g, x, y, z, color, rx, ry, rz, sx, 1, sz);
  }

  // Revolved part along a gun's barrel axis (-Z). pts = [[radius, distance forward], ...]
  barrel(pts, y, color, seg = 12, x = 0) {
    return this.lathe(pts, x, y, 0, color, seg, -Math.PI / 2);
  }

  // Side-profile extrusion. pts = [[u, v], ...] outline; extruded `t` thick along u x v, centered.
  // Default axes suit guns: u = forward (-Z), v = up (+Y), thickness across X.
  profile(pts, t, color, { u = [0, 0, -1], v = [0, 1, 0], at = [0, 0, 0], bevel = 0, holes = [], uvScale = 4, curve = 4 } = {}) {
    const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(([a, b]) => new THREE.Vector2(a, b))));
    const depth = Math.max(0.0005, t - bevel * 2);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: curve });
    g.translate(0, 0, -depth / 2);
    const U = new THREE.Vector3(...u), Vv = new THREE.Vector3(...v), W = new THREE.Vector3().crossVectors(U, Vv);
    const m = new THREE.Matrix4().makeBasis(U, Vv, W).setPosition(at[0], at[1], at[2]);
    this.add(g, m, color, uvScale);
    g.dispose();
    return this;
  }

  // Raw quad (4 corners, counter-clockwise when seen from the front).
  // shades: optional per-corner brightness multipliers (fake ambient occlusion).
  quad(a, b, c, d, color, uvs = [0, 0, 1, 0, 1, 1, 0, 1], shades = null) {
    const base = this.count;
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    const k = new THREE.Color(color);
    [a, b, c, d].forEach((p, i) => {
      this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      const s = shades ? shades[i] : 1;
      this.col.push(k.r * s, k.g * s, k.b * s);
    });
    this.ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.ind, 1) : new THREE.Uint16BufferAttribute(this.ind, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const boxCache = new Map();
function BOX(w, h, d) {
  const k = `${w},${h},${d}`;
  let g = boxCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); boxCache.set(k, g); }
  return g;
}

const sphereCache = new Map();
function SPHERE(seg) {
  let g = sphereCache.get(seg);
  if (!g) { g = new THREE.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.66))); sphereCache.set(seg, g); }
  return g;
}
const capCache = new Map();
function CAPSULE(r, len, seg) {
  const k = `${r},${len},${seg}`;
  let g = capCache.get(k);
  if (!g) { g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, seg); capCache.set(k, g); }
  return g;
}
const rboxCache = new Map();
function RBOX(w, h, d, r) {
  const k = `${w},${h},${d},${r}`;
  let g = rboxCache.get(k);
  if (!g) {
    r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const iw = w / 2 - r, ih = h / 2 - r;
    const s = new THREE.Shape([new THREE.Vector2(-iw, -ih), new THREE.Vector2(iw, -ih), new THREE.Vector2(iw, ih), new THREE.Vector2(-iw, ih)]);
    const depth = Math.max(0.0005, d - r * 2);
    g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 2 });
    g.translate(0, 0, -depth / 2);
    rboxCache.set(k, g);
  }
  return g;
}
