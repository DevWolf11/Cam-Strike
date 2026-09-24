import * as THREE from '../lib/three.module.min.js';
import { GeoBuilder } from './geom.js';
import { groundAt, pointBlocked } from './world.js';

// ---------------- Outfits ----------------
// Each team has several looks; bots get a random one, the player picks in the Loadout menu.
export const OUTFITS = {
  T: [
    { name: 'Phoenix', shirt: 0x8a6a45, sleeve: 0x7a5c3a, pants: 0x3f3a33, boots: 0x1c1a18, gloves: 0x222020, skin: 0xb88a64, vest: 0x5a4a35, head: 'balaclava', headColor: 0x222222, accent: 0xb3242a },
    { name: 'Elite Crew', shirt: 0x5a6a3a, sleeve: 0x4a5a30, pants: 0x3a4a66, boots: 0x3a2a1a, gloves: 0x5a4030, skin: 0xc49a74, vest: 0x2a2a2a, head: 'bandana', headColor: 0xa02828, accent: 0xd8b040 },
    { name: 'Separatist', shirt: 0x6a6e72, sleeve: 0x5a5e62, pants: 0x4a5040, boots: 0x222222, gloves: 0x303030, skin: 0xa87a58, vest: 0x40443a, head: 'gasmask', headColor: 0x2a2e2a, accent: 0x6a8a3a },
    { name: 'Guerrilla', shirt: 0x4f5f2f, sleeve: 0x3f4f25, pants: 0x5a4a2f, boots: 0x2a2014, gloves: 0x3a3020, skin: 0x8a5a3a, vest: 0x3a3a22, head: 'cap', headColor: 0x6a5a30, accent: 0xc86a1e },
  ],
  CT: [
    { name: 'SWAT', shirt: 0x2f4f7a, sleeve: 0x284470, pants: 0x283246, boots: 0x151515, gloves: 0x1a1a1a, skin: 0xd0a782, vest: 0x1f2630, head: 'helmet', headColor: 0x1f2a38, accent: 0x6fa8ff },
    { name: 'SAS', shirt: 0x26282c, sleeve: 0x202226, pants: 0x222428, boots: 0x111111, gloves: 0x151515, skin: 0xd8b090, vest: 0x303238, head: 'gasmask', headColor: 0x18191c, accent: 0x9a2020 },
    { name: 'GIGN', shirt: 0x1f3050, sleeve: 0x1a2a48, pants: 0x1c2638, boots: 0x121212, gloves: 0x2a2a2a, skin: 0xc8a080, vest: 0x2a3348, head: 'visor', headColor: 0x2a3040, accent: 0xe0e0e0 },
    { name: 'SEAL', shirt: 0x4a5448, sleeve: 0x40483e, pants: 0x3c4436, boots: 0x2a241c, gloves: 0x3a3428, skin: 0xb88a68, vest: 0x5a5a44, head: 'nvg', headColor: 0x3a4232, accent: 0x7a8a5a },
  ],
};

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
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
// +X = body right. For upward limbs (torso/head) front is -Z; for legs (pointing down) front is +Z.
function limbGeo(name, o) {
  const g = new GeoBuilder();
  const L = LIMBS.find((l) => l[0] === name)[3];
  switch (name) {
    case 'torso': {
      g.box(0.36, 0.22, 0.22, 0, 0.1, 0, o.pants);                  // hips
      g.box(0.4, 0.06, 0.23, 0, 0.2, 0, 0x2a2622);                    // belt
      g.box(0.07, 0.05, 0.02, 0, 0.2, -0.12, 0xa89060);               // buckle
      g.box(0.42, 0.36, 0.24, 0, 0.38, 0, o.shirt);                   // chest
      g.box(0.44, 0.3, 0.28, 0, 0.36, 0, o.vest);                     // vest
      for (const x of [-0.13, 0, 0.13]) g.box(0.1, 0.12, 0.05, x, 0.3, -0.155, shadeHex(o.vest, 0.8)); // pouches
      g.box(0.44, 0.05, 0.29, 0, 0.5, 0, shadeHex(o.vest, 0.7));
      g.box(0.1, 0.05, 0.3, -0.17, 0.52, 0, shadeHex(o.vest, 0.75)).box(0.1, 0.05, 0.3, 0.17, 0.52, 0, shadeHex(o.vest, 0.75)); // straps
      g.box(0.16, 0.06, 0.16, 0, 0.55, 0, o.shirt);                   // collar
      g.box(0.08, 0.06, 0.02, 0.12, 0.42, -0.15, o.accent);           // patch
      g.box(0.3, 0.26, 0.08, 0, 0.36, 0.17, shadeHex(o.vest, 0.85));  // back panel
      break;
    }
    case 'head': {
      g.box(0.1, 0.1, 0.1, 0, 0.02, 0, o.skin);                        // neck
      const hc = 0.13;                                                  // head center above neck
      if (o.head === 'balaclava') {
        g.box(0.23, 0.26, 0.25, 0, hc, 0, o.headColor);
        g.box(0.18, 0.05, 0.02, 0, hc + 0.04, -0.126, o.skin);        // eye slit
        g.box(0.03, 0.02, 0.01, -0.045, hc + 0.04, -0.137, 0x111111).box(0.03, 0.02, 0.01, 0.045, hc + 0.04, -0.137, 0x111111);
      } else if (o.head === 'bandana') {
        g.box(0.22, 0.25, 0.24, 0, hc, 0, o.skin);
        g.box(0.235, 0.12, 0.25, 0, hc - 0.06, -0.005, o.headColor);  // mask over mouth
        g.box(0.24, 0.07, 0.25, 0, hc + 0.1, 0, 0x333333);             // cap band
        g.box(0.25, 0.06, 0.26, 0, hc + 0.14, 0.0, shadeHex(o.accent, 0.8));
        g.box(0.2, 0.02, 0.1, 0, hc + 0.12, -0.16, shadeHex(o.accent, 0.8)); // brim
        eyes(g, hc, o);
      } else if (o.head === 'cap') {
        g.box(0.22, 0.25, 0.24, 0, hc, 0, o.skin);
        g.box(0.24, 0.1, 0.25, 0, hc + 0.12, 0, o.headColor);
        g.box(0.2, 0.02, 0.12, 0, hc + 0.08, -0.17, o.headColor);
        g.box(0.2, 0.05, 0.02, 0, hc - 0.07, -0.12, 0x2a2016);        // beard
        eyes(g, hc, o);
      } else if (o.head === 'gasmask') {
        g.box(0.23, 0.26, 0.25, 0, hc, 0, o.headColor);
        g.box(0.2, 0.12, 0.06, 0, hc + 0.02, -0.13, 0x111418);
        g.cyl(0.035, 0.035, 0.02, -0.05, hc + 0.04, -0.165, 0x6a8aa0, 8, Math.PI / 2).cyl(0.035, 0.035, 0.02, 0.05, hc + 0.04, -0.165, 0x6a8aa0, 8, Math.PI / 2);
        g.cyl(0.05, 0.045, 0.08, 0, hc - 0.07, -0.17, 0x2a2a2a, 8, Math.PI / 2);   // filter
        g.box(0.26, 0.03, 0.27, 0, hc + 0.1, 0, 0x151515);
      } else {
        // helmet variants
        g.box(0.22, 0.25, 0.24, 0, hc, 0, o.skin);
        g.box(0.2, 0.1, 0.02, 0, hc - 0.05, -0.12, 0x1a1a1a);          // face mask lower
        eyes(g, hc, o);
        g.box(0.26, 0.13, 0.28, 0, hc + 0.1, 0.005, o.headColor);      // helmet shell
        g.box(0.27, 0.05, 0.29, 0, hc + 0.04, 0.005, shadeHex(o.headColor, 0.8));
        if (o.head === 'helmet') g.box(0.2, 0.06, 0.05, 0, hc + 0.1, -0.15, 0x6a7a8a);   // goggles
        if (o.head === 'visor') g.box(0.24, 0.14, 0.03, 0, hc, -0.15, 0x2a3a4a);
        if (o.head === 'nvg') { g.box(0.08, 0.06, 0.08, 0, hc + 0.14, -0.15, 0x111111); g.cyl(0.02, 0.02, 0.06, -0.03, hc + 0.1, -0.2, 0x111111, 6, Math.PI / 2).cyl(0.02, 0.02, 0.06, 0.03, hc + 0.1, -0.2, 0x111111, 6, Math.PI / 2); }
        g.box(0.02, 0.1, 0.02, 0.13, hc + 0.02, 0.02, 0x111111);       // chin strap / radio
      }
      break;
    }
    case 'uarmL': case 'uarmR': {
      g.box(0.13, L, 0.13, 0, L / 2, 0, o.sleeve);
      g.box(0.145, 0.1, 0.145, 0, 0.06, 0, shadeHex(o.vest, 0.9));     // shoulder pad
      if (name === 'uarmL') g.box(0.02, 0.06, 0.1, -0.075, L * 0.5, 0, o.accent);  // armband
      break;
    }
    case 'farmL': case 'farmR': {
      g.box(0.11, L * 0.8, 0.11, 0, L * 0.4, 0, o.sleeve);
      g.box(0.1, 0.12, 0.1, 0, L * 0.9, 0, o.gloves);                  // glove
      break;
    }
    case 'thighL': case 'thighR': {
      g.box(0.16, L, 0.17, 0, L / 2, 0, o.pants);
      g.box(0.05, 0.12, 0.1, name === 'thighL' ? -0.1 : 0.1, L * 0.45, 0, shadeHex(o.pants, 0.75)); // side pocket
      if (name === 'thighR') g.box(0.1, 0.14, 0.06, 0.1, L * 0.3, 0.02, 0x2a2622);                   // holster
      break;
    }
    case 'shinL': case 'shinR': {
      g.box(0.14, L * 0.78, 0.15, 0, L * 0.39, 0, o.pants);
      g.box(0.15, 0.1, 0.05, 0, 0.06, 0.085, shadeHex(o.vest, 0.7));   // knee pad (front = +Z)
      g.box(0.15, 0.16, 0.19, 0, L * 0.86, 0.0, o.boots);
      g.box(0.15, 0.08, 0.26, 0, L - 0.03, 0.05, o.boots);             // boot toe
      break;
    }
  }
  return g.build();
}
function eyes(g, hc, o) {
  g.box(0.035, 0.025, 0.01, -0.045, hc + 0.04, -0.123, 0x151515).box(0.035, 0.025, 0.01, 0.045, hc + 0.04, -0.123, 0x151515);
  g.box(0.16, 0.02, 0.01, 0, hc + 0.075, -0.122, shadeHex(o.skin, 0.6));
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

export class Character {
  constructor(scene, team, outfitIndex = 0) {
    this.scene = scene;
    const list = OUTFITS[team];
    this.outfit = list[((outfitIndex % list.length) + list.length) % list.length];
    this.group = new THREE.Group();
    this.limbs = LIMBS.map(([name, a, b, len]) => {
      const mesh = new THREE.Mesh(limbGeo(name, this.outfit), MAT);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      return { name, a, b, len, mesh };
    });
    this.J = Object.fromEntries(JOINTS.map((k) => [k, new THREE.Vector3()]));
    this.gun = null;
    const pack = new GeoBuilder().box(0.26, 0.3, 0.12, 0, 0.35, 0.2, 0x3a3a2a).box(0.16, 0.08, 0.02, 0, 0.42, 0.265, 0x223322).box(0.03, 0.03, 0.01, 0.06, 0.42, 0.27, 0xff2020);
    this.pack = new THREE.Mesh(pack.build(), MAT);
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
    this.rag = null;
    const J = this.J, moving = a.moving ?? 0, speed = a.speed ?? 0;
    this.phase += dt * (3 + speed * 1.6) * (speed > 0.3 ? 1 : 0);
    const ph = this.phase, sw = Math.min(1, speed / 4.5);
    const bob = Math.abs(Math.sin(ph)) * 0.035 * sw;
    const air = a.onGround === false ? 1 : 0;
    const crouch = (a.crouch || 0) * 0.35;
    // local skeleton (faces -Z)
    const set = (k, x, y, z) => J[k].set(x, y, z);
    set('pelvis', 0, 0.95 + bob - crouch, 0);
    set('neck', 0, 1.48 + bob - crouch * 0.9, 0.02 * sw);
    set('shL', -0.21, 1.43 + bob - crouch * 0.9, 0); set('shR', 0.21, 1.43 + bob - crouch * 0.9, 0);
    set('hipL', -0.11, 0.93 + bob - crouch, 0); set('hipR', 0.11, 0.93 + bob - crouch, 0);
    const leg = (side, p) => {
      const swing = Math.sin(p) * 0.65 * sw + air * 0.3;
      const bend = Math.max(0, Math.cos(p)) * 0.9 * sw + air * 0.9 + crouch * 2.2;
      const hip = J['hip' + side], kn = J['kn' + side], ft = J['ft' + side];
      kn.set(hip.x, hip.y - 0.44 * Math.cos(swing), hip.z - 0.44 * Math.sin(swing));
      ft.set(kn.x, kn.y - 0.44 * Math.cos(swing - bend), kn.z - 0.44 * Math.sin(swing - bend));
      if (ft.y < 0.05 && !air) ft.y = 0.05;
    };
    leg('L', ph); leg('R', ph + Math.PI);
    // arms / hands follow aim pitch around the chest pivot
    const P = HAND_POSES[kind] || HAND_POSES.rifle;
    const pitch = a.pitch || 0, cp = Math.cos(pitch), sp = Math.sin(pitch);
    const pivotY = 1.38 + bob - crouch * 0.9;
    // rotate a hand position (x, y, z) about the chest pivot by the aim pitch
    const rot = (v, out) => { const y = v[1] - 1.38, z = v[2]; return out.set(v[0], pivotY + y * cp - z * sp, y * sp + z * cp); };
    rot(P.R, J.haR);
    if (P.L) rot(P.L, J.haL);
    else { // support hand on the foregrip
      J.haL.set(J.haR.x - 0.1, J.haR.y + sp * gunLen * 0.45, J.haR.z - cp * gunLen * 0.45);
    }
    if (action > 0) {
      if (kind === 'knife') { J.haR.z -= Math.sin(action * Math.PI) * 0.35; J.haR.x -= Math.sin(action * Math.PI) * 0.3; }
      if (kind === 'nade') { J.haR.z -= action * 0.6; J.haR.y -= action * 0.4; }
    }
    // elbows: halfway between shoulder and hand, pushed out and down
    J.elL.lerpVectors(J.shL, J.haL, 0.5).add(_v.set(-0.1, -0.12, 0.06));
    J.elR.lerpVectors(J.shR, J.haR, 0.5).add(_v.set(0.1, -0.12, 0.06));
    J.head.set(0, J.neck.y + 0.2 * Math.cos(pitch * 0.5), J.neck.z - 0.2 * Math.sin(pitch * 0.5));
    // to world
    const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
    for (const k of JOINTS) {
      const j = J[k], x = j.x, z = j.z;
      j.set(a.pos.x + x * cy + z * sy, a.pos.y + j.y, a.pos.z - x * sy + z * cy);
    }
    this.place();
    if (this.gun) {
      this.gun.visible = true;
      this.gun.position.copy(J.haR);
      this.gun.rotation.set(kind === 'knife' ? pitch - 0.9 + action * 1.2 : pitch, a.yaw, 0, 'YXZ');
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
  }

  // ---- ragdoll ----
  startRagdoll(vel, impulse, hitPart = 'torso') {
    const J = this.J;
    const pts = {};
    for (const k of JOINTS) {
      const p = J[k].clone();
      const kick = k === 'head' ? (hitPart === 'head' ? 1.4 : 0.6) : ['neck', 'shL', 'shR'].includes(k) ? 1 : ['pelvis', 'hipL', 'hipR'].includes(k) ? 0.6 : 0.4;
      const v = new THREE.Vector3(vel.x + impulse.x * kick, vel.y + impulse.y * kick + 0.4, vel.z + impulse.z * kick);
      pts[k] = { p, o: p.clone().addScaledVector(v, -1 / 60), r: k === 'head' ? 0.13 : 0.08 };
    }
    const d = (a, b) => ({ a: pts[a], b: pts[b], len: pts[a].p.distanceTo(pts[b].p), min: 0 });
    const cons = [
      d('neck', 'head'), d('neck', 'shL'), d('neck', 'shR'), d('shL', 'shR'), d('pelvis', 'neck'),
      d('pelvis', 'shL'), d('pelvis', 'shR'), d('pelvis', 'hipL'), d('pelvis', 'hipR'), d('hipL', 'hipR'),
      d('hipL', 'shL'), d('hipR', 'shR'), d('hipL', 'shR'), d('hipR', 'shL'), d('head', 'shL'), d('head', 'shR'),
      d('shL', 'elL'), d('elL', 'haL'), d('shR', 'elR'), d('elR', 'haR'),
      d('hipL', 'knL'), d('knL', 'ftL'), d('hipR', 'knR'), d('knR', 'ftR'),
    ];
    // keep knees/elbows from folding flat (minimum distance only)
    for (const [a, b, mn] of [['hipL', 'ftL', 0.5], ['hipR', 'ftR', 0.5], ['shL', 'haL', 0.25], ['shR', 'haR', 0.25], ['head', 'pelvis', 0.6]]) cons.push({ a: pts[a], b: pts[b], len: 0, min: mn });
    this.rag = { pts, cons, t: 0, acc: 0 };
    if (this.gun) this.gun.visible = false;
    this.shadow.visible = false;
  }

  updateRagdoll(dt) {
    const R = this.rag;
    if (!R || R.t > 4) return;
    R.t += dt; R.acc += dt;
    const step = 1 / 60;
    while (R.acc >= step) {
      R.acc -= step;
      for (const k in R.pts) {
        const q = R.pts[k], p = q.p;
        const vx = (p.x - q.o.x) * 0.992, vy = (p.y - q.o.y) * 0.992, vz = (p.z - q.o.z) * 0.992;
        q.o.copy(p);
        p.x += vx; p.y += vy - 18 * step * step; p.z += vz;
        if (pointBlocked(p.x, Math.max(p.y, q.o.y) + 0.3, p.z)) { p.x = q.o.x; p.z = q.o.z; }
      }
      for (let it = 0; it < 6; it++) {
        for (const c of R.cons) {
          _v.subVectors(c.b.p, c.a.p);
          const dist = _v.length() || 1e-4;
          let target = c.len;
          if (c.min) { if (dist >= c.min) continue; target = c.min; }
          const diff = (dist - target) / dist * 0.5;
          c.a.p.addScaledVector(_v, diff); c.b.p.addScaledVector(_v, -diff);
        }
        for (const k in R.pts) {
          const q = R.pts[k], p = q.p;
          const g = groundAt(p.x, p.z, 0.05) + q.r;
          if (p.y < g) {
            p.y = g;
            // friction
            q.o.x += (p.x - q.o.x) * 0.3; q.o.z += (p.z - q.o.z) * 0.3;
          }
        }
      }
    }
    for (const k of JOINTS) this.J[k].copy(R.pts[k].p);
    this.place();
  }

  dispose() {
    this.scene.remove(this.group);
    for (const l of this.limbs) l.mesh.geometry.dispose();
    this.pack.geometry.dispose();
  }
}
