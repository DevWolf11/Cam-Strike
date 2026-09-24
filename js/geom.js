import * as THREE from '../lib/three.module.min.js';

// Merges many small geometries (boxes, cylinders...) into one BufferGeometry with
// per-vertex colors, so a whole character or a map's props costs a single draw call.
export class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.ind = []; this.count = 0; }

  add(geo, matrix, color = 0xffffff, uvScale = 1) {
    const g = geo.index ? geo : geo;
    const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const c = new THREE.Color(color);
    const v = new THREE.Vector3();
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z);
      if (t) this.uv.push(t.getX(i) * uvScale, t.getY(i) * uvScale); else this.uv.push(0, 0);
      this.col.push(c.r, c.g, c.b);
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
