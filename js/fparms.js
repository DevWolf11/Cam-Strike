import * as THREE from '../lib/three.module.min.js';
import { GLTFLoader } from '../lib/addons/GLTFLoader.js';
import { clone as cloneSkinned } from '../lib/addons/SkeletonUtils.js';

// First-person arms: a rigged pair of arms ("First Person arms" by DJMaesen, CC BY 4.0) anchored
// at the shoulders in view space. Every frame each hand is put on the gun with two-bone IK
// (shoulder -> elbow -> wrist), the wrist is turned to match the grip and the fingers curl around
// it. Since the targets come from the gun, sway, recoil, reloads and swings all carry the hands.

const URL = 'assets/weapons/arms.glb';
let proto = null, loading = null;
export function loadArms() {
  if (!loading) {
    loading = new GLTFLoader().loadAsync(URL).then((g) => { proto = g.scene; })
      .catch((e) => console.warn('First-person arms unavailable, using simple hands', e));
  }
  return loading;
}
export const armsReady = () => !!proto;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _hs = new THREE.Vector3();
// Orientation of a frame whose Y is `primary` and X is `secondary` (made orthogonal)
function frameQuat(primary, secondary, out) {
  const y = _a.copy(primary).normalize();
  const x = _b.copy(secondary).addScaledVector(y, -secondary.dot(y));
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0).addScaledVector(y, -y.x);
  x.normalize();
  _m.makeBasis(x, y, _c.crossVectors(x, y));
  return out.setFromRotationMatrix(_m);
}
const FINGERS = ['point', 'middle', 'ring', 'pink', 'thumb'];
const TWIST_TO_FOREARM = 0.8;

export class FPArms {
  // parent: the view-space scene; material tint from the outfit's sleeve colour
  constructor(parent, sleeveColor, opts = {}) {
    this.root = cloneSkinned(proto);
    this.root.rotation.y = Math.PI;             // the model reaches along +Z; the view looks down -Z
    this.root.scale.setScalar(opts.scale ?? 0.0098);   // model units are ~cm; a touch bigger than life, like most viewmodels
    this.root.position.set(...(opts.pos || [0, -0.35, -0.02]));
    // where the shoulders sit in view space: low and a bit inward, so the arms rise from the bottom
    // of the screen instead of crossing it at eye level
    this.anchor = opts.anchor || null;
    parent.add(this.root);
    this.b = {};
    this.root.traverse((o) => {
      if (o.isBone) this.b[o.name.replace(/_\d+$/, '')] = o;
      if (o.isMesh) {
        o.frustumCulled = false;
        const m = o.material.clone();
        if (sleeveColor != null) m.color = new THREE.Color(sleeveColor).lerp(new THREE.Color(0xffffff), 0.55);
        o.material = m;
      }
    });
    this.root.updateMatrixWorld(true);
    this.rl = {};   // rest local rotations
    for (const [n, bone] of Object.entries(this.b)) this.rl[n] = bone.quaternion.clone();
    // rest data, in the view-space scene (the root never moves)
    const P = (n) => this.b[n].getWorldPosition(new THREE.Vector3());
    const Q = (n) => this.b[n].getWorldQuaternion(new THREE.Quaternion());
    this.rest = {};
    for (const s of ['L', 'R']) {
      const sh = P(`${s}_arm`), el = P(`${s}_elbow`), wr = P(`${s}_wrist`);
      const dir = _a.subVectors(wr, sh).normalize();
      const pole = el.clone().sub(sh); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const frameInv = (d, ref) => frameQuat(d, ref, new THREE.Quaternion()).invert();
      // palm normal from the knuckles (sign per side), hand forward = wrist -> middle knuckle
      const hf = P(`${s}_middle1`).sub(wr).normalize();
      const palm = new THREE.Vector3().crossVectors(P(`${s}_point1`).sub(wr), P(`${s}_pink1`).sub(wr)).normalize();
      if (s === 'L') palm.negate();
      const curl = [];
      for (const f of FINGERS) for (let k = 1; k <= 3; k++) {
        const n = `${s}_${f}${k}`, next = this.b[`${s}_${f}${k + 1}`];
        if (!this.b[n] || !next) continue;
        const d = next.getWorldPosition(new THREE.Vector3()).sub(P(n)).normalize();
        const ax = new THREE.Vector3().crossVectors(d, palm);
        if (ax.lengthSq() < 1e-6) continue;
        ax.normalize().applyQuaternion(Q(n).invert());
        curl.push({ bone: this.b[n], axis: ax, rest: this.b[n].quaternion.clone(), f, k });
      }
      this.rest[s] = {
        sh, len: [el.distanceTo(sh), wr.distanceTo(el)],
        arm: { q: Q(`${s}_arm`), inv: frameInv(_b.subVectors(el, sh), pole) },
        elbow: { q: Q(`${s}_elbow`), inv: frameInv(_b.subVectors(wr, el), pole) },
        wrist: { q: Q(`${s}_wrist`), inv: frameInv(hf, palm) },
        thumb: { q: Q(`${s}_thumb1`), inv: frameInv(P(`${s}_thumb2`).sub(P(`${s}_thumb1`)), palm) },
        curl,
      };
    }
  }

  set visible(v) { this.root.visible = v; }

  // Set a bone's world rotation to R(frame(dir, ref)) relative to its rest frame
  aim(bone, rest, dir, ref) {
    frameQuat(dir, ref, _q).multiply(rest.inv).multiply(rest.q);
    bone.parent.getWorldQuaternion(_q2);
    bone.quaternion.copy(_q2.invert().multiply(_q));
    bone.updateWorldMatrix(false, true);
  }

  // Put one hand: wrist at `wrist`, hand pointing `fwd` with the palm facing `palm` (all view space),
  // elbow bending toward `pole`, fingers curled by curl(finger, joint) radians; thumbDir (optional)
  // points the thumb's base joint in a given direction, its pad facing the same way as the palm
  hand(s, wrist, fwd, palm, pole, curl, thumbDir) {
    const R = this.rest[s], b = this.b;
    const A = this.anchor ? _hs.set(...this.anchor[s]) : R.sh, [l1, l2] = R.len;
    const toT = _c.subVectors(wrist, A);
    let dist = toT.length();
    // too far to reach: slide the (off-screen) shoulder toward the hand instead of over-stretching
    const reach = (l1 + l2) * 0.97;
    const sh = A.clone();
    if (dist > reach) { sh.addScaledVector(toT.normalize(), dist - reach); dist = reach; }
    b[`${s}_arm`].position.copy(b[`${s}_arm`].parent.worldToLocal(sh.clone()));
    b[`${s}_arm`].updateWorldMatrix(false, true);
    const dir = new THREE.Vector3().subVectors(wrist, sh).normalize();
    dist = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(dist, l1 + l2 - 1e-3));
    const n = new THREE.Vector3().subVectors(pole, sh); n.addScaledVector(dir, -n.dot(dir)).normalize();
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const E = sh.clone().addScaledVector(dir, a).addScaledVector(n, h);
    const W = sh.clone().addScaledVector(dir, dist);
    this.aim(b[`${s}_arm`], R.arm, E.clone().sub(sh), n);
    this.aim(b[`${s}_elbow`], R.elbow, W.clone().sub(E), n);
    this.aim(b[`${s}_wrist`], R.wrist, fwd, palm);
    this.spreadTwist(b[`${s}_elbow`], b[`${s}_wrist`], this.rl[`${s}_wrist`]);
    for (const c of R.curl) { c.bone.quaternion.copy(c.rest); const ang = curl(c.f, c.k); if (ang) c.bone.rotateOnAxis(c.axis, ang); }
    if (thumbDir) this.aim(b[`${s}_thumb1`], R.thumb, thumbDir, palm);
  }

  // The other hand as capsules (finger segments, palm), world space: so one hand can wrap the other
  capsules(s) {
    const out = [], P = (n) => this.b[n].getWorldPosition(new THREE.Vector3());
    for (const f of FINGERS) for (let k = 1; k <= 3; k++) {
      const a = this.b[`${s}_${f}${k}`], b = this.b[`${s}_${f}${k + 1}`];
      if (a && b) out.push({ p: P(`${s}_${f}${k}`), q: P(`${s}_${f}${k + 1}`), r: f === 'thumb' ? 0.0095 : 0.0085 });
    }
    const w = P(`${s}_wrist`);
    for (const f of ['point1', 'middle1', 'ring1', 'pink1']) out.push({ p: w, q: P(`${s}_${f}`), r: 0.014 });
    return out;
  }

  // Fit a hand to the gun: slide it along its palm normal until the palm rests on the grip, then close
  // each finger joint (base to tip) until that part of the finger touches the grip. The grip is described
  // by solid elliptic cylinders measured from the model (h.vol, gun space), so contact is exact and cheap.
  // The hand's pose relative to the gun never changes, so this runs once per weapon draw.
  fit(s, h, M) {
    const caps = h.avoid ? this.capsules(h.avoid) : [];
    const vols = h.vol.map((v) => ({ c: new THREE.Vector3(...v.c).applyMatrix4(M), d: new THREE.Vector3(...v.d).transformDirection(M),
      e1: new THREE.Vector3(...v.e1).transformDirection(M), e2: new THREE.Vector3(...v.e2).transformDirection(M), a: v.a, b: v.b, h: v.h }));
    const q = new THREE.Vector3();
    const q2 = new THREE.Vector3();
    const inside = (p, r) => vols.some((v) => {
      q.subVectors(p, v.c);
      if (Math.abs(q.dot(v.d)) > v.h + r) return false;
      const u = q.dot(v.e1) / (v.a + r), w = q.dot(v.e2) / (v.b + r);
      return u * u + w * w < 1;
    }) || caps.some((c) => {
      q.subVectors(c.q, c.p); q2.subVectors(p, c.p);
      const t = Math.max(0, Math.min(1, q2.dot(q) / Math.max(1e-9, q.lengthSq())));
      return q2.addScaledVector(q, -t).lengthSq() < (c.r + r) * (c.r + r);
    });
    const fwdW = new THREE.Vector3(...h.fwd).transformDirection(M), palmW = new THREE.Vector3(...h.palm).transformDirection(M);
    const thumbW = h.thumbDir ? new THREE.Vector3(...h.thumbDir).transformDirection(M) : undefined;
    const P = (n) => this.b[n].getWorldPosition(new THREE.Vector3());
    const pose = () => {
      const w = new THREE.Vector3(...h.wrist).applyMatrix4(M);
      this.hand(s, w, fwdW, palmW, w.clone().add(new THREE.Vector3(...h.pole)), (f, k) => h.fixed?.[f]?.[k - 1] ?? h.start?.[f]?.[k - 1] ?? 0, thumbW);
      this.b[`${s}_wrist`].updateWorldMatrix(false, true);
    };
    // palm contact (the palm's skin is ~1.2 cm in front of the hand bones)
    pose();
    const pc = P(`${s}_wrist`).lerp(P(`${s}_middle1`).add(P(`${s}_ring1`)).multiplyScalar(0.5), 0.6).addScaledVector(palmW, 0.012);
    const at = (d) => pc.clone().addScaledVector(palmW, d);
    let d = 0;
    if (inside(pc, 0.002)) { while (d > -0.1 && inside(at(d), 0.002)) d -= 0.002; }
    else { while (d < 0.1 && !inside(at(d + 0.002), 0.002)) d += 0.002; if (d >= 0.1) d = 0; }
    h.wrist = h.wrist.map((x, i) => x + h.palm[i] * d);
    pose();
    // close the fingers
    const R = this.rest[s], curls = {};
    for (const f of FINGERS) {
      const chain = [1, 2, 3].map((k) => R.curl.find((c) => c.f === f && c.k === k)).filter(Boolean);
      const ang = chain.map((c) => h.start?.[f]?.[c.k - 1] ?? 0);
      curls[f] = ang;
      if (h.fixed?.[f]) { curls[f] = h.fixed[f]; continue; }
      const set = (i, a) => { const c = chain[i]; c.bone.quaternion.copy(c.rest); c.bone.rotateOnAxis(c.axis, a); c.bone.updateWorldMatrix(false, true); };
      const r = f === 'thumb' ? 0.009 : 0.0075;
      // which sample points along each segment are inside the grip
      const seg = (j) => {
        const a = chain[j].bone.getWorldPosition(new THREE.Vector3()), b = this.b[`${s}_${f}${chain[j].k + 1}`].getWorldPosition(new THREE.Vector3());
        return [0.4, 0.75, 1].map((t) => inside(a.clone().lerp(b, t), r));
      };
      const state = () => chain.map((_, j) => seg(j));
      const before = state();
      // a segment makes new contact when a part of it that was clear comes inside (a part that already
      // overlaps at the start, like a fingertip resting on the grip, doesn't count)
      const contact = (from) => { const st = state(); for (let j = from; j < chain.length; j++) if (st[j].some((t, n) => t && !before[j][n])) return j; return -1; };
      const max = (h.max?.[f] || (f === 'thumb' ? [1.1, 1.1, 0.9] : [1.6, 1.8, 1.4]));
      // 1) close the whole finger together, as a hand closes, until some part of it touches
      const wgt = f === 'thumb' ? [1, 0.9, 0.7] : [1, 1.15, 0.85];
      let hit = -1;
      for (let step = 0; step < 60; step++) {
        const next = ang.map((a, i) => Math.min(max[i], a + 0.03 * wgt[i]));
        if (next.every((a, i) => a === ang[i])) break;
        next.forEach((a, i) => set(i, a));
        hit = contact(0);
        if (hit >= 0) { ang.forEach((a, i) => set(i, a)); break; }
        next.forEach((a, i) => { ang[i] = a; });
      }
      // 2) the joints beyond the touching segment keep closing until they touch too (the finger wraps)
      for (let i = Math.max(0, hit + 1); hit >= 0 && i < chain.length; i++) {
        let a = ang[i];
        while (a < max[i]) { const n = Math.min(max[i], a + 0.03); set(i, n); if (contact(i) >= 0) { set(i, a); break; } a = n; }
        ang[i] = a;
      }
      ang.forEach((a, i) => { ang[i] = +a.toFixed(3); });
    }
    h.curl = (f, k) => curls[f]?.[k - 1] ?? 0;
    h.fitted = true;
  }

  // A wrist can't roll against the forearm without the skin collapsing into a thin "candy wrapper"
  // neck: the roll happens along the forearm. Move most of the wrist's roll about the forearm axis
  // onto the forearm bone (wrist position and world rotation stay the same), so it shows as a gentle
  // twist of the sleeve near the (usually off-screen) elbow instead of a pinch at the wrist.
  spreadTwist(forearm, wrist, restQ) {
    const axis = _a.copy(wrist.position).normalize();                  // forearm axis, forearm space
    const D = _q.copy(wrist.quaternion).multiply(_q2.copy(restQ).invert());   // rest -> now, forearm space
    const tw = 2 * Math.atan2(D.x * axis.x + D.y * axis.y + D.z * axis.z, D.w);
    const T = _q2.setFromAxisAngle(axis, Math.atan2(Math.sin(tw), Math.cos(tw)) * TWIST_TO_FOREARM);
    forearm.quaternion.multiply(T);
    wrist.quaternion.premultiply(T.invert());
    forearm.updateWorldMatrix(false, true);
  }

  dispose() { this.root.removeFromParent(); }
}

const nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const add = (...vs) => vs[0].map((_, i) => vs.reduce((t, v) => t + v[i], 0));
const mul = (v, k) => v.map((x) => x * k);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// What the hands hold, per gun, measured from the models (gun space: origin = where the right hand
// grips, -Z = barrel, +Y = up; metres). Solid elliptic cylinders:
//   grip: the pistol grip, centred t along the grip's slant, offset w toward the back and u sideways,
//         half-width a (across X) and half-depth b (front to back); the hand sits `up` above its centre
//   fore: the handguard / pump the left hand holds: centre c, half-width a, half-height b, half-length h
const GRIPS = {
  rifle:   { grip: { t: 0.05, w: -0.006, u: -0.0035, a: 0.0125, b: 0.021 }, fore: { c: [-0.004, 0.068, -0.322], a: 0.017, b: 0.032, h: 0.07 } },
  smg:     { grip: { t: 0.05, w: -0.0045, u: 0, a: 0.014, b: 0.03 }, fore: { c: [0, 0.1035, -0.302], a: 0.026, b: 0.038, h: 0.05 } },
  shotgun: { grip: { t: 0.045, w: 0.032, u: 0.001, a: 0.015, b: 0.025 }, fore: { c: [0.001, 0.024, -0.406], a: 0.014, b: 0.016, h: 0.05 } },
  sniper:  { grip: { t: 0.05, w: 0.02, u: -0.0115, a: 0.0135, b: 0.028 }, fore: { c: [-0.012, 0.036, -0.35], a: 0.016, b: 0.019, h: 0.06 } },
  pistol:  { grip: { t: 0.045, w: -0.0055, u: 0, a: 0.013, b: 0.0275, up: 0 } },
};

// Where each hand goes, in the gun's own space: wrist position, hand direction (wrist -> knuckles),
// palm facing, elbow pole (view-space offset), and what the hand closes around (vol). The wrist is only a
// first guess: FPArms.fit() slides the hand onto the grip and curls the fingers until they touch it.
// `box` is the model's bounding box in gun space (used for grenades).
export function handSpec(id, kind, meta, box) {
  const G = GRIPS[id];
  // the grip's slant (pointing down the grip), and the across-grip direction toward the back
  const g = nrm(meta?.grip ? [0, meta.grip[1], meta.grip[0]] : kind === 'pistol' ? [0, -0.92, 0.38] : [0, -1, 0.1]);
  const e2 = cross(g, [1, 0, 0]);
  const f0 = nrm(mul(e2, -1));                                    // forward, square to the grip
  let R, L;
  if (kind === 'knife') {
    // the handle runs lengthwise behind the guard (+Z) and lies across the palm like a hammer grip:
    // knuckles toward the edge (-Y), palm against the handle's right side, thumb over the spine
    const fwd = nrm([-0.25, -0.97, -0.24]), palm = [-1, 0, 0], C = [0, 0.002, 0.062];
    R = { vol: [{ c: C, d: [0, 0, 1], e1: [1, 0, 0], e2: [0, 1, 0], a: 0.016, b: 0.018, h: 0.06 }],
      wrist: add(C, [0.045, 0, 0], mul(fwd, -0.06)), fwd, palm, pole: [0.3, -0.35, 0.25], fixed: { thumb: [0.7, 0.5, 0.3] } };   // thumb curled over the fingers by the guard
  } else if (kind === 'nade') {
    // a grenade sits upright in the fist, its body above the thumb
    const bx = box || { min: [-0.03, -0.05, -0.03], max: [0.03, 0.06, 0.03] }, H = meta?.hold;   // (a bottle: its body, not the rag)
    const C = H ? H.c : mul(add(bx.min, bx.max), 0.5), rad = H ? H.r : Math.max(bx.max[0] - bx.min[0], bx.max[2] - bx.min[2]) / 2, hh = H ? H.hh : (bx.max[1] - bx.min[1]) / 2;
    const fwd = nrm([-0.3, -0.25, -0.92]), palm = [-1, 0, 0];
    R = { vol: [{ c: C, d: [0, 1, 0], e1: [1, 0, 0], e2: [0, 0, 1], a: rad, b: rad, h: hh }],
      wrist: add(C, [rad + 0.04, -hh * 0.35, 0], mul(fwd, -0.06)), fwd, palm, pole: [0.3, -0.35, 0.25], fixed: { thumb: [0.6, 0.5, 0.3] } };   // thumb across the front, by the spoon
  } else {
    // right hand wraps the pistol grip: palm against its right side, knuckles forward and wrapping round
    // the front, index finger along the trigger, thumb round the back onto the left side
    const gr = G?.grip || { t: 0.045, w: 0, u: 0, a: 0.013, b: 0.024 };
    const C = add(mul(g, gr.t), mul(e2, gr.w), [gr.u, 0, 0]);
    const fwd = nrm(add(f0, [-0.3, 0, 0])), palm = [-1, 0, 0];
    R = { vol: [{ c: C, d: g, e1: [1, 0, 0], e2, a: gr.a, b: gr.b, h: 0.05 }],
      wrist: add(C, [gr.a + 0.03, 0, 0], mul(fwd, -0.08), mul(g, -(gr.up ?? 0.02))), fwd, palm, pole: [0.3, -0.35, 0.25],
      fixed: { point: [0.75, 0.65, 0.35] }, start: { thumb: [-0.3, 0, 0] } };
    if (G?.fore) {
      // left hand cradles the handguard from below: palm up against it, fingers wrapping up its far
      // side, thumb swung forward along its near side
      const F = G.fore, fwdL = nrm([0.85, 0.2, -0.45]), palmL = nrm([0.12, 1, 0]);
      L = { vol: [{ c: F.c, d: [0, 0, -1], e1: [1, 0, 0], e2: [0, 1, 0], a: F.a, b: F.b, h: F.h }],
        wrist: add(F.c, [0, -F.b - 0.03, 0], mul(fwdL, -0.055)), fwd: fwdL, palm: palmL, pole: [-0.35, -0.3, 0.25],
        start: { thumb: [-0.7, 0, 0] } };
    } else if (kind === 'pistol') {
      // thumbs-forward two-hand grip. The right thumb lies forward along the left side of the frame. The
      // support hand's palm fills the left grip panel below it; its fingers wrap the front strap over the
      // right hand's fingers (fitted against them, so the hands never pass through each other) and its
      // thumb lies forward under the right thumb.
      R.thumbDir = nrm([-0.2, 0.2, -0.96]); R.fixed.thumb = [0, 0.1, 0.05]; delete R.start;
      const fwdL = nrm(add(f0, [0.35, 0.05, 0])), palmL = [1, 0, 0];
      const frame = { c: [0, 0.035, -0.065], d: [0, 0, -1], e1: [1, 0, 0], e2: [0, 1, 0], a: 0.0145, b: 0.036, h: 0.095 };
      L = { vol: [R.vol[0], frame], avoid: 'R', wrist: add(C, [-gr.a - 0.045, -0.008, 0.006], mul(fwdL, -0.06)), fwd: fwdL, palm: palmL,
        pole: [-0.35, -0.35, 0.25], thumbDir: nrm([0.12, 0.12, -0.98]), fixed: { thumb: [0, 0.1, 0.05] } };
    }
  }
  // no support hand: it rests low and out of view
  if (!L) L = { view: { wrist: [-0.26, -0.42, -0.22], fwd: [0.2, 0.3, -1], palm: [1, 0, 0], pole: [-0.6, -0.8, 0.1] }, curl: (f) => (f === 'thumb' ? 0.2 : 0.6) };
  return { R, L };
}
