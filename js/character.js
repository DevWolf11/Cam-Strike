import * as THREE from '../lib/three.module.min.js';
import { GeoBuilder } from './geom.js';
import { world, isWall, cellOf } from './world.js';
import { fabricTex } from './textures.js';
import { SkinnedBody, modelFor } from './skinned.js';

// ---------------- Outfits ----------------
// Each team has several looks; bots get a random one, the player picks in the Loadout menu.
export const OUTFITS = {
  T: [
    { name: 'Phoenix', model: 'thug', desc: 'Ski mask, street clothes', shirt: 0x8a6a45, sleeve: 0x7a5c3a, pants: 0x3f3a33, boots: 0x1c1a18, gloves: 0x222020, skin: 0xb88a64, vest: 0x5a4a35, head: 'balaclava', headColor: 0x222222, accent: 0xb3242a },
    { name: 'Elite Crew', model: 'rebel', desc: 'Digital camo, face wrap', shirt: 0x5a6a3a, sleeve: 0x4a5a30, pants: 0x3a4a66, boots: 0x3a2a1a, gloves: 0x5a4030, skin: 0xc49a74, vest: 0x2a2a2a, head: 'bandana', headColor: 0xa02828, accent: 0xd8b040 },
    { name: 'Separatist', model: 'vanguard', desc: 'Armoured, grey', shirt: 0x6a6e72, sleeve: 0x5a5e62, pants: 0x4a5040, boots: 0x222222, gloves: 0x303030, skin: 0xa87a58, vest: 0x40443a, head: 'gasmask', headColor: 0x2a2e2a, accent: 0x6a8a3a },
    { name: 'Guerrilla', model: 'militia', desc: 'Woodland gear, balaclava', shirt: 0x4f5f2f, sleeve: 0x3f4f25, pants: 0x5a4a2f, boots: 0x2a2014, gloves: 0x3a3020, skin: 0x8a5a3a, vest: 0x3a3a22, head: 'cap', headColor: 0x6a5a30, accent: 0xc86a1e },
  ],
  CT: [
    { name: 'SWAT', model: 'swat_gasmask', desc: 'Police, gas mask', shirt: 0x2f4f7a, sleeve: 0x284470, pants: 0x283246, boots: 0x151515, gloves: 0x1a1a1a, skin: 0xd0a782, vest: 0x1f2630, head: 'helmet', headColor: 0x1f2a38, accent: 0x6fa8ff },
    { name: 'SAS', model: 'swat_spec', desc: 'Urban camo, goggles', shirt: 0x26282c, sleeve: 0x202226, pants: 0x222428, boots: 0x111111, gloves: 0x151515, skin: 0xd8b090, vest: 0x303238, head: 'gasmask', headColor: 0x18191c, accent: 0x9a2020 },
    { name: 'GIGN', model: 'swat_blue', desc: 'Blue uniform, helmet', shirt: 0x1f3050, sleeve: 0x1a2a48, pants: 0x1c2638, boots: 0x121212, gloves: 0x2a2a2a, skin: 0xc8a080, vest: 0x2a3348, head: 'visor', headColor: 0x2a3040, accent: 0xe0e0e0 },
    { name: 'SEAL', model: 'swat_spec', tint: [0x4c5c40, 0.45], desc: 'Woodland camo, goggles', shirt: 0x4a5448, sleeve: 0x40483e, pants: 0x3c4436, boots: 0x2a241c, gloves: 0x3a3428, skin: 0xb88a68, vest: 0x5a5a44, head: 'nvg', headColor: 0x3a4232, accent: 0x7a8a5a },
  ],
};

let MAT = null;
const mat = () => (MAT ||= new THREE.MeshLambertMaterial({ vertexColors: true, map: fabricTex() }));
const Y = new THREE.Vector3(0, 1, 0);

// Limb definitions: [name, jointA, jointB, rest length]
const LIMBS = [
  ['torso', 'pelvis', 'neck', 0.53],
  ['head', 'neck', 'head', 0.2],
  ['uarmL', 'shL', 'elL', 0.28], ['farmL', 'elL', 'haL', 0.27],
  ['uarmR', 'shR', 'elR', 0.28], ['farmR', 'elR', 'haR', 0.27],
  ['thighL', 'hipL', 'knL', 0.44], ['shinL', 'knL', 'ftL', 0.44],
  ['thighR', 'hipR', 'knR', 0.44], ['shinR', 'knR', 'ftR', 0.44],
];
const JOINTS = ['pelvis', 'neck', 'head', 'shL', 'shR', 'elL', 'elR', 'haL', 'haR', 'hipL', 'hipR', 'knL', 'knR', 'ftL', 'ftR'];

// Build each limb's geometry in its local frame: +Y from joint A (0) to B (len),
// +X = body right. For upward limbs (torso/head) front is -Z; for arms/legs (pointing down) front is +Z.
// Shapes are rounded (lathes, ellipsoids, bevelled boxes) so silhouettes read as people, not blocks.
const CAP = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.56);   // helmet / cap dome
function limbGeo(name, o) {
  const g = new GeoBuilder();
  const L = LIMBS.find((l) => l[0] === name)[3];
  const dk = (c, k) => shadeHex(c, k);
  switch (name) {
    case 'torso': {
      g.ellipsoid(0.158, 0.11, 0.1, 0, 0.075, 0.01, o.pants, 12);                                       // hips
      g.lathe([[0.14, 0.12], [0.146, 0.22], [0.156, 0.3]], 0, 0, 0, o.shirt, 12, 0, 0, 0, 1.1, 0.76);  // abdomen
      g.lathe([[0.155, 0.28], [0.17, 0.36], [0.18, 0.43], [0.168, 0.48], [0.12, 0.525], [0.05, 0.555], [0.001, 0.56]], 0, 0, 0, o.shirt, 12, 0, 0, 0, 1.15, 0.72); // chest
      g.lathe([[0.158, 0.165], [0.166, 0.172], [0.166, 0.212], [0.158, 0.22]], 0, 0, 0, 0x2a2622, 12, 0, 0, 0, 1.1, 0.8); // belt
      g.rbox(0.055, 0.04, 0.012, 0.004, 0, 0.192, -0.135, 0xa89060);                                    // buckle
      // plate carrier
      g.rbox(0.3, 0.27, 0.055, 0.02, 0, 0.375, -0.13, o.vest, -0.04);
      g.rbox(0.3, 0.3, 0.055, 0.02, 0, 0.38, 0.115, o.vest);
      g.lathe([[0.16, 0.24], [0.165, 0.25], [0.165, 0.32], [0.16, 0.33]], 0, 0, 0, dk(o.vest, 0.9), 12, 0, 0, 0, 1.12, 0.8); // cummerbund
      for (const x of [-0.115, 0.115]) g.rbox(0.07, 0.03, 0.27, 0.01, x, 0.515, -0.005, dk(o.vest, 0.85), 0.05);   // shoulder straps
      for (const x of [-0.092, 0, 0.092]) {                                                              // magazine pouches
        g.rbox(0.078, 0.1, 0.05, 0.012, x, 0.3, -0.175, dk(o.vest, 0.8));
        g.rbox(0.05, 0.03, 0.03, 0.006, x, 0.36, -0.172, 0x2a2a2a);
      }
      g.rbox(0.17, 0.065, 0.03, 0.01, 0, 0.44, -0.165, dk(o.vest, 0.75));                               // admin pouch
      g.rbox(0.07, 0.045, 0.008, 0.003, 0.05, 0.445, -0.182, o.accent);                                  // patch
      g.rbox(0.075, 0.14, 0.05, 0.012, -0.11, 0.4, 0.16, 0x2b2d2a);                                      // radio
      g.capsule(0.005, 0.16, -0.13, 0.55, 0.16, 0x151515, 0, 0, 0.12, 5);                                // antenna
      g.rbox(0.09, 0.12, 0.06, 0.015, 0.12, 0.2, 0.1, dk(o.vest, 0.8));                                  // dump pouch
      g.lathe([[0.075, 0.52], [0.08, 0.54], [0.07, 0.565]], 0, 0, 0, o.shirt, 12, 0, 0, 0, 1.1, 0.95);   // collar
      break;
    }
    case 'head': {
      const hc = 0.15;
      g.lathe([[0.05, 0.0], [0.052, 0.06], [0.056, 0.1]], 0, 0, 0, o.skin, 12);                             // neck
      const face = () => {
        g.ellipsoid(0.091, 0.106, 0.102, 0, hc + 0.012, 0.005, o.skin, 14);                                 // cranium
        g.ellipsoid(0.07, 0.056, 0.075, 0, hc - 0.052, -0.018, o.skin, 12);                                 // jaw
        g.rbox(0.022, 0.042, 0.03, 0.009, 0, hc - 0.01, -0.098, dk(o.skin, 0.95), 0.25);                   // nose
        for (const x of [-0.092, 0.092]) g.ellipsoid(0.012, 0.028, 0.02, x, hc, 0.008, dk(o.skin, 0.92), 8); // ears
        eyes(g, hc, o);
      };
      const helmet = (col) => {
        g.geo(CAP, 0, hc + 0.005, 0.004, col, 0, 0, 0, 0.12, 0.118, 0.13);
        g.lathe([[0.121, hc - 0.005], [0.124, hc + 0.004], [0.118, hc + 0.012]], 0, 0, 0, dk(col, 0.8), 12, 0, 0, 0, 1, 1.07);
        for (const x of [-0.104, 0.104]) g.cyl(0.036, 0.036, 0.03, x, hc - 0.012, 0.004, 0x1e1f1e, 12, 0, 0, Math.PI / 2);  // headset cups
        g.segment([0.1, hc - 0.03, -0.02], [0.05, hc - 0.07, -0.09], 0.005, 0x1a1a1a);                          // boom mic
        g.rbox(0.05, 0.04, 0.03, 0.008, 0, hc + 0.075, -0.115, 0x2a2a2a, -0.4);                                   // NVG shroud
        for (const x of [-0.09, 0.09]) g.rbox(0.012, 0.03, 0.08, 0.004, x * 1.18, hc + 0.05, 0.02, 0x2a2a2a);      // side rails
      };
      if (o.head === 'balaclava') {
        face();
        g.ellipsoid(0.098, 0.116, 0.108, 0, hc + 0.004, 0.004, o.headColor, 14);
        g.ellipsoid(0.077, 0.06, 0.081, 0, hc - 0.052, -0.02, o.headColor, 12);
        g.lathe([[0.058, 0.0], [0.06, 0.08]], 0, 0, 0, o.headColor, 12);
        g.rbox(0.105, 0.034, 0.02, 0.01, 0, hc + 0.012, -0.096, o.skin);                                       // eye window
        eyes(g, hc, o, -0.004);
      } else if (o.head === 'gasmask') {
        g.ellipsoid(0.098, 0.116, 0.108, 0, hc + 0.004, 0.004, o.headColor, 14);                              // hood
        g.ellipsoid(0.078, 0.062, 0.082, 0, hc - 0.05, -0.02, o.headColor, 12);
        g.lathe([[0.058, 0.0], [0.06, 0.08]], 0, 0, 0, o.headColor, 12);
        g.ellipsoid(0.075, 0.075, 0.045, 0, hc - 0.012, -0.085, 0x121416, 14);                                  // faceplate
        for (const x of [-0.033, 0.033]) { g.cyl(0.026, 0.026, 0.014, x, hc + 0.012, -0.118, 0x0c0e10, 14, Math.PI / 2); g.cyl(0.02, 0.02, 0.016, x, hc + 0.012, -0.12, 0x5a7a90, 14, Math.PI / 2); }
        g.lathe([[0.001, 0.0], [0.034, 0.0], [0.036, 0.006], [0.036, 0.05], [0.03, 0.056], [0.001, 0.056]], 0, hc - 0.065, -0.12, 0x2a2a2a, 14, -Math.PI / 2 + 0.3); // filter
        for (const sx of [-1, 1]) g.segment([sx * 0.07, hc + 0.02, -0.07], [sx * 0.095, hc + 0.06, 0.05], 0.007, 0x151515);                                            // straps
      } else if (o.head === 'bandana' || o.head === 'cap') {
        face();
        g.ellipsoid(0.094, 0.1, 0.104, 0, hc + 0.025, 0.008, 0x2a1e14, 14);                                  // hair
        const capCol = o.head === 'cap' ? o.headColor : 0x2e2c2a;
        g.geo(CAP, 0, hc + 0.035, 0.004, capCol, 0, 0, 0, 0.1, 0.09, 0.108);
        g.geo(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, -0.9, 1.8), 0, hc + 0.04, -0.07, dk(capCol, 0.9), 0.12, Math.PI, 0, 0.085, 0.008, 0.1); // brim
        if (o.head === 'bandana') g.ellipsoid(0.079, 0.052, 0.086, 0, hc - 0.05, -0.022, o.headColor, 12);  // face bandana
        else g.ellipsoid(0.074, 0.05, 0.08, 0, hc - 0.058, -0.02, 0x2a1e14, 12);                             // beard
      } else {
        face();
        g.ellipsoid(0.074, 0.05, 0.08, 0, hc - 0.056, -0.022, 0x1b1c1e, 12);                                // face wrap
        helmet(o.headColor);
        if (o.head === 'visor') g.geo(new THREE.SphereGeometry(1, 16, 8, -Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.3, Math.PI * 0.35), 0, hc, 0.0, 0x22303c, 0, 0, 0, 0.125, 0.13, 0.13);
        if (o.head === 'helmet') { g.rbox(0.17, 0.035, 0.03, 0.012, 0, hc + 0.05, -0.11, 0x3a4a5a); for (const x of [-0.04, 0.04]) g.cyl(0.018, 0.018, 0.01, x, hc + 0.05, -0.126, 0x6a8aa8, 12, Math.PI / 2); }  // goggles
        if (o.head === 'nvg') for (const x of [-0.028, 0.028]) g.cyl(0.016, 0.018, 0.07, x, hc + 0.09, -0.14, 0x111111, 12, 1.2);                                       // NVG tubes flipped up
      }
      break;
    }
    case 'uarmL': case 'uarmR': {
      const side = name === 'uarmL' ? -1 : 1;
      g.ellipsoid(0.068, 0.075, 0.072, 0, 0.035, 0, o.sleeve, 12);                                           // deltoid
      g.lathe([[0.058, 0.0], [0.059, 0.12], [0.052, 0.24], [0.049, L]], 0, 0, 0, o.sleeve, 12);
      g.rbox(0.014, 0.075, 0.065, 0.006, side * 0.057, 0.12, 0, dk(o.sleeve, 0.85));                          // sleeve pocket
      g.rbox(0.006, 0.035, 0.045, 0.002, side * 0.066, 0.12, 0, side < 0 ? o.accent : dk(o.sleeve, 0.7));    // flag patch
      break;
    }
    case 'farmL': case 'farmR': {
      g.ellipsoid(0.052, 0.05, 0.052, 0, 0.0, 0, o.sleeve, 10);                                              // elbow
      g.lathe([[0.051, 0.0], [0.053, 0.06], [0.046, 0.16], [0.04, 0.2]], 0, 0, 0, o.sleeve, 12);
      g.lathe([[0.043, 0.19], [0.045, 0.2], [0.041, 0.22]], 0, 0, 0, o.gloves, 12);                           // glove cuff
      g.rbox(0.042, 0.085, 0.078, 0.016, 0, L * 0.93, 0.004, o.gloves);                                       // fist
      g.rbox(0.03, 0.03, 0.07, 0.01, 0, L * 0.93 + 0.045, 0.01, dk(o.gloves, 0.9));                          // knuckles
      g.segment([name === 'farmL' ? 0.024 : -0.024, L * 0.86, 0.03], [name === 'farmL' ? 0.028 : -0.028, L * 0.97, 0.035], 0.012, o.gloves); // thumb
      break;
    }
    case 'thighL': case 'thighR': {
      const side = name === 'thighL' ? -1 : 1;
      g.lathe([[0.086, 0.0], [0.09, 0.08], [0.082, 0.25], [0.067, 0.42], [0.063, L]], 0, 0, 0, o.pants, 12, 0, 0, 0, 1, 1.05);
      g.rbox(0.022, 0.11, 0.1, 0.01, side * 0.085, 0.25, 0.0, dk(o.pants, 0.85));                             // cargo pocket
      if (side > 0) {                                                                                          // drop-leg holster
        g.rbox(0.035, 0.15, 0.075, 0.012, 0.1, 0.17, 0.0, 0x222320);
        g.rbox(0.03, 0.06, 0.03, 0.008, 0.1, 0.07, -0.02, 0x151515);
        for (const y of [0.2, 0.3]) g.lathe([[0.084, y], [0.086, y + 0.012]], 0, 0, 0, 0x222320, 12);
      }
      break;
    }
    case 'shinL': case 'shinR': {
      g.ellipsoid(0.066, 0.06, 0.066, 0, 0.0, 0, o.pants, 10);                                                // knee
      g.rbox(0.1, 0.1, 0.05, 0.022, 0, 0.035, 0.058, dk(o.vest, 0.7));                                        // knee pad (front = +Z)
      g.lathe([[0.062, 0.02], [0.066, 0.12], [0.056, 0.26], [0.05, 0.32]], 0, 0, 0, o.pants, 12, 0, 0, 0, 1, 1.08);
      g.lathe([[0.056, 0.29], [0.06, 0.38], [0.061, 0.41]], 0, 0, 0, o.boots, 12);                             // boot upper
      g.profile([[-0.066, 0.36], [0.03, 0.37], [0.11, 0.405], [0.165, 0.425], [0.172, 0.448], [-0.07, 0.448], [-0.075, 0.42]], 0.1, o.boots, { u: [0, 0, 1], v: [0, 1, 0], bevel: 0.022, uvScale: 1 });
      g.profile([[-0.074, 0.44], [0.178, 0.44], [0.172, 0.468], [-0.07, 0.468]], 0.106, 0x151515, { u: [0, 0, 1], v: [0, 1, 0], bevel: 0.004, uvScale: 1 }); // sole
      for (let k = 0; k < 3; k++) g.rbox(0.07, 0.006, 0.012, 0.002, 0, 0.37 + k * 0.018, 0.055 + k * 0.02, dk(o.boots, 0.7), 0.5);   // laces
      break;
    }
  }
  return g.build();
}
function eyes(g, hc, o, dz = 0) {
  for (const x of [-0.033, 0.033]) {
    g.ellipsoid(0.013, 0.009, 0.006, x, hc + 0.012, -0.092 + dz, 0xe8e4dc, 8);
    g.ellipsoid(0.006, 0.006, 0.004, x, hc + 0.012, -0.097 + dz, 0x2a1e14, 8);
    g.rbox(0.03, 0.007, 0.008, 0.003, x, hc + 0.034, -0.095 + dz, shadeHex(o.skin, 0.55));    // brows
  }
  if (!dz) g.rbox(0.032, 0.005, 0.005, 0.002, 0, hc - 0.048, -0.089, shadeHex(o.skin, 0.7)); // mouth
}
function shadeHex(hex, k) { const c = new THREE.Color(hex).multiplyScalar(k); return c.getHex(); }

// ---------------- Poses ----------------
const HAND_POSES = {
  rifle:  { R: [0.14, 1.3, -0.26], L: null },
  pistol: { R: [0.07, 1.38, -0.48], L: [-0.02, 1.37, -0.45] },
  knife:  { R: [0.22, 1.12, -0.34], L: [-0.24, 1.02, -0.12] },
  nade:   { R: [0.24, 1.62, 0.06], L: [-0.18, 1.2, -0.3] },
  bomb:   { R: [0.1, 0.4, -0.35], L: [-0.1, 0.4, -0.35] },
};

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

// ---------------- Ragdoll collision ----------------
const RADIUS = { head: 0.12, neck: 0.08, pelvis: 0.12, shL: 0.08, shR: 0.08, hipL: 0.09, hipR: 0.09, knL: 0.07, knR: 0.07, ftL: 0.06, ftR: 0.06, elL: 0.055, elR: 0.055, haL: 0.05, haR: 0.05 };
const RAGDOLLS = new Set();
let LIVING = [];
// The game hands in the living players each frame so walking through a body shoves it
export function setRagdollPushers(agents) { LIVING = agents; }
// Blast every body within `radius` of (x, y, z) outward
export function ragdollBlast(x, y, z, radius, strength) {
  const c = new THREE.Vector3(x, y, z);
  for (const ch of RAGDOLLS) {
    const pel = ch.rag?.pts.pelvis?.p;
    if (!pel) continue;
    const d = pel.distanceTo(c);
    if (d > radius) continue;
    const k = strength * (1 - d / radius);
    const v = new THREE.Vector3().subVectors(pel, c).setY(0).normalize().multiplyScalar(k);
    v.y = k * 0.8;
    ch.nudge(c, v, radius);
    ch.nudge(pel, v.multiplyScalar(0.6));
  }
}
// A bullet travelling from `a` to `b` hits the first body joint it passes close to
const _seg = new THREE.Vector3(), _rel = new THREE.Vector3();
export function ragdollShot(a, b, power) {
  _seg.subVectors(b, a);
  const len = _seg.length();
  if (len < 1e-3) return;
  _seg.divideScalar(len);
  for (const ch of RAGDOLLS) {
    const R = ch.rag;
    if (!R) continue;
    for (const k in R.pts) {
      const q = R.pts[k];
      _rel.subVectors(q.p, a);
      const t = _rel.dot(_seg);
      if (t < 0 || t > len) continue;
      if (_rel.addScaledVector(_seg, -t).lengthSq() > (q.r + 0.04) ** 2) continue;
      ch.nudge(q.p, _seg.clone().multiplyScalar(power), 0.45);
      return;
    }
  }
}

// solid: inside a wall cell, below that cell's floor, or above its ceiling
function solidAt(x, y, z) {
  const cx = cellOf(x), cz = cellOf(z);
  if (isWall(cx, cz)) return true;
  const i = cz * world.w + cx;
  if (y < world.height[i]) return true;
  const rf = world.roof[i];
  return rf > 0 && y > rf;
}
function solidR(x, y, z, r) {
  return solidAt(x - r, y, z) || solidAt(x + r, y, z) || solidAt(x, y, z - r) || solidAt(x, y, z + r) || solidAt(x, y - r, z);
}
function collidePoint(q, friction) {
  const p = q.p, o = q.o, r = q.r;
  const cx = cellOf(p.x), cz = cellOf(p.z);
  if (!isWall(cx, cz)) {
    const i = cz * world.w + cx, fl = world.height[i], rf = world.roof[i];
    // floor: only when arriving from above (otherwise it's the side of a raised block, handled below)
    if (p.y - r < fl && o.y - r >= fl - 0.08) {
      p.y = fl + r;
      if (friction) { o.x += (p.x - o.x) * 0.25; o.z += (p.z - o.z) * 0.25; if (o.y < p.y) o.y = p.y - (o.y - p.y) * 0.2; }
      return;
    }
    if (rf > 0 && p.y + r > rf && o.y + r <= rf + 0.08) { p.y = rf - r; if (o.y > p.y) o.y = p.y; return; }   // ceiling
  }
  if (!solidR(p.x, p.y, p.z, r)) return;
  // wall / block side: slide along whichever axis is still free, bounce a little on the blocked one
  const vx = p.x - o.x, vz = p.z - o.z;
  if (!solidR(p.x, p.y, o.z, r)) { p.z = o.z; o.z = p.z + vz * 0.3; }
  else if (!solidR(o.x, p.y, p.z, r)) { p.x = o.x; o.x = p.x + vx * 0.3; }
  else if (!solidR(o.x, p.y, o.z, r)) { p.x = o.x; p.z = o.z; }
  else { p.copy(o); p.y += 0.02; }        // wedged: step back where we were and float up
}
// living players shove body points out of their way (capsule around each player)
function pushByLiving(R) {
  const pel = R.pts.pelvis.p;
  for (const a of LIVING) {
    if (!a.alive) continue;
    const dx0 = pel.x - a.pos.x, dz0 = pel.z - a.pos.z;
    if (dx0 * dx0 + dz0 * dz0 > 4) continue;
    for (const k in R.pts) {
      const p = R.pts[k].p;
      if (p.y < a.pos.y - 0.1 || p.y > a.pos.y + 1.8) continue;
      const dx = p.x - a.pos.x, dz = p.z - a.pos.z, d2 = dx * dx + dz * dz, rr = 0.3 + R.pts[k].r;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-3, push = (rr - d) * 0.5;
      p.x += dx / d * push; p.z += dz / d * push;
      if (p.y < a.pos.y + 0.25) p.y += push * 0.3;           // feet slide a body instead of burying it
    }
  }
}
// bodies pile on top of each other instead of overlapping
function collideBodies(self, R) {
  for (const other of RAGDOLLS) {
    if (other === self || !other.rag) continue;
    const O = other.rag.pts;
    if (O.pelvis.p.distanceToSquared(R.pts.pelvis.p) > 4) continue;
    for (const k in R.pts) {
      const a = R.pts[k];
      for (const m of ['pelvis', 'neck', 'head', 'shL', 'shR', 'hipL', 'hipR', 'knL', 'knR']) {
        const b = O[m];
        _v.subVectors(a.p, b.p);
        const d2 = _v.lengthSq(), rr = a.r + b.r;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        a.p.addScaledVector(_v, (rr - d) / d * 0.7);
        if (other.rag.asleep) { other.rag.asleep = false; other.rag.still = 0; }
      }
    }
  }
}

export class Character {
  constructor(scene, team, outfitIndex = 0) {
    this.scene = scene;
    const list = OUTFITS[team];
    const i = Number.isFinite(+outfitIndex) ? +outfitIndex : 0;
    this.outfit = list[((i % list.length) + list.length) % list.length];
    this.group = new THREE.Group();
    if (modelFor(this.outfit)) {
      // skinned model; the torso "limb" survives only as an invisible carrier for attachments (bomb pack)
      this.body = new SkinnedBody(this.outfit);
      this.group.add(this.body.root);
      const carrier = new THREE.Object3D(); carrier.matrixAutoUpdate = false; this.group.add(carrier);
      this.limbs = [{ name: 'torso', a: 'pelvis', b: 'neck', len: LIMBS[0][3], mesh: carrier }];
    } else {
      this.limbs = LIMBS.map(([name, a, b, len]) => {
        const mesh = new THREE.Mesh(limbGeo(name, this.outfit), mat());
        mesh.matrixAutoUpdate = false; mesh.receiveShadow = true;
        this.group.add(mesh);
        return { name, a, b, len, mesh };
      });
    }
    this.J = Object.fromEntries(JOINTS.map((k) => [k, new THREE.Vector3()]));
    this.gun = null;
    const pack = new GeoBuilder().box(0.26, 0.3, 0.12, 0, 0.35, 0.2, 0x3a3a2a).box(0.16, 0.08, 0.02, 0, 0.42, 0.265, 0x223322).box(0.03, 0.03, 0.01, 0.06, 0.42, 0.27, 0xff2020);
    this.pack = new THREE.Mesh(pack.build(), mat());
    this.pack.visible = false;
    this.limbs[0].mesh.add(this.pack);
    const shadowGeo = new THREE.CircleGeometry(0.45, 14);
    this.shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.shadow);
    this.phase = Math.random() * 6;
    this.rag = null;
    scene.add(this.group);
  }

  set visible(v) { this.group.visible = v; }
  get visible() { return this.group.visible; }

  setGun(obj) {
    if (this.gun) this.group.remove(this.gun);
    this.gun = obj;
    if (obj) { obj.matrixAutoUpdate = true; this.group.add(obj); }
  }

  // ---- alive: procedural pose from agent state ----
  pose(a, dt, kind = 'rifle', gunLen = 0.7, action = 0) {
    if (this.rag) { this.rag = null; RAGDOLLS.delete(this); }
    const J = this.J, speed = a.speed ?? 0;
    this.phase += dt * (3 + speed * 1.6) * (speed > 0.3 ? 1 : 0);
    const ph = this.phase, sw = Math.min(1, speed / 4.5);
    const bob = Math.abs(Math.sin(ph)) * 0.035 * sw;
    const air = a.onGround === false ? 1 : 0;
    const crouch = (a.crouch || 0) * 0.35;
    const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
    // movement direction in the body frame (forward = -Z): legs swing that way, so strafing
    // and backpedalling look right instead of moonwalking
    let mx = (a.vx || 0) * cy - (a.vz || 0) * sy, mz = (a.vx || 0) * sy + (a.vz || 0) * cy;
    const ml = Math.hypot(mx, mz);
    if (ml > 0.3) { mx /= ml; mz /= ml; } else { mx = 0; mz = -1; }
    this.mdx = (this.mdx ?? 0) + (mx - (this.mdx ?? 0)) * Math.min(1, dt * 10);
    this.mdz = (this.mdz ?? -1) + (mz - (this.mdz ?? -1)) * Math.min(1, dt * 10);
    const dl = Math.hypot(this.mdx, this.mdz) || 1, dx = this.mdx / dl, dz = this.mdz / dl;
    // firing kick decays fast; reload progress drives the support hand
    this.kick = Math.max(0, (this.kick || 0) - dt * 8);
    const kick = this.kick * this.kick;
    const rl = a.reloadT > 0 && a.w?.reload ? Math.sin(Math.min(1, 1 - a.reloadT / a.w.reload) * Math.PI) : 0;
    // lean into the run and slightly into strafes
    const leanZ = dz * 0.07 * sw, leanX = dx * 0.04 * sw;
    const set = (k, x, y, z) => J[k].set(x, y, z);
    set('pelvis', 0, 0.95 + bob - crouch, 0);
    set('neck', leanX, 1.48 + bob - crouch * 0.9, 0.02 * sw + leanZ + kick * 0.03);
    set('shL', -0.21 + leanX, 1.43 + bob - crouch * 0.9, leanZ + kick * 0.03); set('shR', 0.21 + leanX, 1.43 + bob - crouch * 0.9, leanZ + kick * 0.03);
    set('hipL', -0.11, 0.93 + bob - crouch, 0); set('hipR', 0.11, 0.93 + bob - crouch, 0);
    const leg = (side, p) => {
      const swing = Math.sin(p) * 0.65 * sw + air * 0.3;
      const bend = Math.max(0, Math.cos(p)) * 0.9 * sw + air * 1.1 + crouch * 2.2;
      const hip = J['hip' + side], kn = J['kn' + side], ft = J['ft' + side];
      // thigh swings along the move direction; the knee always folds backwards
      const sx0 = 0.44 * Math.sin(swing) * dx, sy0 = -0.44 * Math.cos(swing), sz0 = 0.44 * Math.sin(swing) * dz;
      kn.set(hip.x + sx0, hip.y + sy0, hip.z + sz0);
      const cb = Math.cos(bend), sb = Math.sin(bend);
      ft.set(kn.x + sx0, kn.y + sy0 * cb + sz0 * sb, kn.z - sy0 * sb + sz0 * cb);
      if (ft.y < 0.05 && !air) ft.y = 0.05;
    };
    leg('L', ph); leg('R', ph + Math.PI);
    // arms / hands follow aim pitch around the chest pivot
    const P = HAND_POSES[kind] || HAND_POSES.rifle;
    const pitch = (a.pitch || 0) + kick * 0.12 - rl * 0.35, cp = Math.cos(pitch), sp = Math.sin(pitch);
    const pivotY = 1.38 + bob - crouch * 0.9;
    const rot = (v, out) => { const y = v[1] - 1.38, z = v[2]; return out.set(v[0] + leanX, pivotY + y * cp - z * sp, y * sp + z * cp + leanZ + kick * 0.06); };
    rot(P.R, J.haR);
    if (P.L) rot(P.L, J.haL);
    else { // support hand on the foregrip
      J.haL.set(J.haR.x - 0.1, J.haR.y + sp * gunLen * 0.45, J.haR.z - cp * gunLen * 0.45);
    }
    if (rl > 0) { J.haL.lerp(_v.set(J.haR.x - 0.06, J.haR.y - 0.22, J.haR.z - 0.1), rl); }     // hand down to the magazine
    if (air) { J.haL.y += 0.05; J.haR.y += 0.03; }
    if (action > 0) {
      if (kind === 'knife') { J.haR.z -= Math.sin(action * Math.PI) * 0.35; J.haR.x -= Math.sin(action * Math.PI) * 0.3; }
      if (kind === 'nade') { J.haR.z -= action * 0.6; J.haR.y -= action * 0.4; }
    }
    // elbows: halfway between shoulder and hand, pushed out and down
    J.elL.lerpVectors(J.shL, J.haL, 0.5).add(_v.set(-0.1, -0.12, 0.06));
    J.elR.lerpVectors(J.shR, J.haR, 0.5).add(_v.set(0.1, -0.12, 0.06));
    const hp = (a.pitch || 0) * 0.5;
    J.head.set(J.neck.x, J.neck.y + 0.2 * Math.cos(hp), J.neck.z - 0.2 * Math.sin(hp));
    // to world
    for (const k of JOINTS) {
      const j = J[k], x = j.x, z = j.z;
      j.set(a.pos.x + x * cy + z * sy, a.pos.y + j.y, a.pos.z - x * sy + z * cy);
    }
    this.place();
    if (this.gun) {
      this.gun.visible = true;
      this.gun.position.copy(J.haR);
      this.gun.rotation.set(kind === 'knife' ? pitch - 0.9 + action * 1.2 : pitch, a.yaw, rl * 0.6, 'YXZ');
    }
    this.shadow.visible = true;
    this.shadow.position.set(a.pos.x, a.pos.y + 0.02, a.pos.z);
  }

  // Place every limb mesh between its two joints
  place() {
    const J = this.J;
    _x.subVectors(J.shR, J.shL).normalize();            // body right
    for (const l of this.limbs) {
      const A = J[l.a], Bj = J[l.b];
      _y.subVectors(Bj, A);
      const len = _y.length() || 1e-3;
      _y.divideScalar(len);
      _z.crossVectors(_x, _y);
      if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
      _z.normalize();
      _a.crossVectors(_y, _z).normalize();                // re-orthogonalized X
      _m.makeBasis(_a, _y, _z);
      const s = l.name === 'head' || l.name === 'torso' ? 1 : len / l.len;
      _m.scale(_b.set(1, s, 1));
      _m.setPosition(A);
      l.mesh.matrix.copy(_m);
      l.mesh.matrixWorldNeedsUpdate = true;
    }
    if (this.body) this.body.fit(J);
  }

  // ---- ragdoll ----
  startRagdoll(vel, impulse, hitPart = 'torso') {
    const J = this.J;
    const pts = {};
    for (const k of JOINTS) {
      const p = J[k].clone();
      const kick = k === 'head' ? (hitPart === 'head' ? 1.4 : 0.6) : ['neck', 'shL', 'shR'].includes(k) ? 1 : ['pelvis', 'hipL', 'hipR'].includes(k) ? 0.6 : 0.4;
      const v = new THREE.Vector3(vel.x + impulse.x * kick, vel.y + impulse.y * kick + 0.4, vel.z + impulse.z * kick);
      pts[k] = { p, o: p.clone().addScaledVector(v, -1 / 60), r: RADIUS[k] || 0.07 };
    }
    const d = (a, b) => ({ a: pts[a], b: pts[b], len: pts[a].p.distanceTo(pts[b].p), min: 0 });
    const cons = [
      d('neck', 'head'), d('neck', 'shL'), d('neck', 'shR'), d('shL', 'shR'), d('pelvis', 'neck'),
      d('pelvis', 'shL'), d('pelvis', 'shR'), d('pelvis', 'hipL'), d('pelvis', 'hipR'), d('hipL', 'hipR'),
      d('hipL', 'shL'), d('hipR', 'shR'), d('hipL', 'shR'), d('hipR', 'shL'), d('head', 'shL'), d('head', 'shR'),
      d('shL', 'elL'), d('elL', 'haL'), d('shR', 'elR'), d('elR', 'haR'),
      d('hipL', 'knL'), d('knL', 'ftL'), d('hipR', 'knR'), d('knR', 'ftR'),
    ];
    // joint limits as minimum distances: knees/elbows can't fold flat, legs can't cross through each other
    for (const [a, b, mn] of [['hipL', 'ftL', 0.5], ['hipR', 'ftR', 0.5], ['shL', 'haL', 0.25], ['shR', 'haR', 0.25], ['head', 'pelvis', 0.62],
      ['knL', 'knR', 0.12], ['ftL', 'ftR', 0.1], ['haL', 'pelvis', 0.15], ['haR', 'pelvis', 0.15], ['knL', 'neck', 0.55], ['knR', 'neck', 0.55]]) cons.push({ a: pts[a], b: pts[b], len: 0, min: mn });
    this.rag = { pts, cons, t: 0, acc: 0, still: 0, asleep: false };
    RAGDOLLS.add(this);
    if (this.gun) this.gun.visible = false;
    this.shadow.visible = false;
  }

  // Push the body (explosions, bullets). v = velocity change in m/s applied to the points near `at`.
  nudge(at, v, radius = 99) {
    const R = this.rag;
    if (!R) return;
    R.asleep = false; R.still = 0;
    for (const k in R.pts) {
      const q = R.pts[k], d = q.p.distanceTo(at);
      if (d > radius) continue;
      const f = radius >= 99 ? 1 : 1 - d / radius;
      q.o.addScaledVector(v, -f / 60);
    }
  }

  updateRagdoll(dt) {
    const R = this.rag;
    if (!R) return;
    if (R.asleep) return;
    R.t += dt; R.acc = Math.min(R.acc + dt, 0.1);
    const step = 1 / 60;
    while (R.acc >= step) {
      R.acc -= step;
      let motion = 0;
      for (const k in R.pts) {
        const q = R.pts[k], p = q.p;
        const vx = (p.x - q.o.x) * 0.99, vy = (p.y - q.o.y) * 0.99, vz = (p.z - q.o.z) * 0.99;
        q.o.copy(p);
        p.x += vx; p.y += vy - 18 * step * step; p.z += vz;
        motion = Math.max(motion, Math.abs(vx) + Math.abs(vy) + Math.abs(vz));
      }
      pushByLiving(R);
      if (R.t < 6) collideBodies(this, R);
      for (let it = 0; it < 6; it++) {
        for (const c of R.cons) {
          _v.subVectors(c.b.p, c.a.p);
          const dist = _v.length() || 1e-4;
          let target = c.len;
          if (c.min) { if (dist >= c.min) continue; target = c.min; }
          const diff = (dist - target) / dist * 0.5;
          c.a.p.addScaledVector(_v, diff); c.b.p.addScaledVector(_v, -diff);
        }
        for (const k in R.pts) collidePoint(R.pts[k], it === 5);
      }
      // sleep once the body has settled (saves CPU with many bodies on the ground)
      if (motion < 0.0012 && R.t > 1) { R.still += step; if (R.still > 0.6) R.asleep = true; } else R.still = 0;
    }
    for (const k of JOINTS) this.J[k].copy(R.pts[k].p);
    this.place();
  }

  dispose() {
    RAGDOLLS.delete(this);
    this.scene.remove(this.group);
    for (const l of this.limbs) l.mesh.geometry?.dispose();
    this.body?.dispose();
    this.pack.geometry.dispose();
  }
}
