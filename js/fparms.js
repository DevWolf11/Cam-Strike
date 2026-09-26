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
  // elbow bending toward `pole`, fingers curled by curl(finger, joint) radians
  hand(s, wrist, fwd, palm, pole, curl) {
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
    for (const c of R.curl) { c.bone.quaternion.copy(c.rest); const ang = curl(c.f, c.k); if (ang) c.bone.rotateOnAxis(c.axis, ang); }
  }

  dispose() { this.root.removeFromParent(); }
}

const nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const sub = (a, b, k = 1) => a.map((x, i) => x - b[i] * k);
// Where each hand goes, in the gun's own space (origin = right-hand grip, -Z = barrel, +Y = up):
// wrist position, hand direction (wrist -> knuckles), palm facing, elbow pole (view-space offset) and finger curl
export function handSpec(id, kind, meta, fore) {
  // right hand wraps the grip: knuckles forward along its right side, palm facing into it
  const g = nrm(meta ? [0, meta.grip[1], meta.grip[0]] : kind === 'pistol' ? [0, -0.92, 0.38] : kind === 'rifle' ? [0, -0.9, 0.42] : [0, -1, 0.1]);
  const f0 = nrm(sub([0, 0, -1], g, -g[2]));                   // forward, square to the grip
  const fwdR = nrm([f0[0] - 0.32, f0[1], f0[2]]);
  const palmR = [-1, 0, 0];
  const hold = kind === 'knife' || kind === 'nade';
  const R = {
    // (a grenade sits higher, on top of the fist, so its body shows)
    wrist: (kind === 'nade' ? [0.03, -0.04, 0.0] : [0.03, 0, -0.025]).map((x, i) => x + g[i] * 0.045 - fwdR[i] * 0.075),
    fwd: fwdR, palm: palmR, pole: [0.3, -0.35, 0.25],
    // the thumb swings out of the palm to lie along the far side; the index finger rests on the trigger
    curl: (f, k) => (f === 'thumb' ? [-0.4, 0.2, 0.1][k - 1] : f === 'point' && !hold ? [0.8, 0.7, 0.4][k - 1] : [1.15, 1.2, 0.8][k - 1]),
  };
  let L;
  if (kind === 'rifle' || kind === 'sniper' || (meta && meta.fore)) {
    const [fu, fv] = meta?.fore || fore;
    const F = [0, fv, -fu];
    // cradled from below: the back of the hand runs across under the handguard toward the right,
    // fingers wrap up its right side, the thumb lies along its left side
    const fwdL = nrm([0.9, 0.2, -0.4]), palmL = nrm([0.2, 1, 0]);
    L = { wrist: F.map((x, i) => x - fwdL[i] * 0.06 - palmL[i] * 0.04), fwd: fwdL, palm: palmL, pole: [-0.35, -0.3, 0.25],
      // the thumb is swung out of the palm (negative curl) so it lies forward along the handguard
      curl: (f, k) => (f === 'thumb' ? [-0.7, 0.1, 0.1][k - 1] : [1.1, 1.2, 0.8][k - 1]) };
  } else {
    // pistol (held one-handed, CS 1.6 style), knife, grenade, bomb: the left hand rests low and out of the way
    L = { view: { wrist: [-0.26, -0.42, -0.22], fwd: [0.2, 0.3, -1], palm: [1, 0, 0], pole: [-0.6, -0.8, 0.1] }, curl: (f, k) => (f === 'thumb' ? 0.2 : 0.6) };
  }
  return { R, L };
}

