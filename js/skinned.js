import * as THREE from '../lib/three.module.min.js';
import { GLTFLoader } from '../lib/addons/GLTFLoader.js';
import { clone as cloneSkinned } from '../lib/addons/SkeletonUtils.js';
import { loadMocap } from './mocap.js';

// Skinned character driven by the game's procedural skeleton.
// The game (pose + ragdoll) computes 15 joint positions; this fits a Mixamo-rigged
// mesh to them every frame: hips/spine/neck are aimed, arms and legs are solved with
// two-bone IK using the model's own bone lengths, so any Mixamo character drops in.

// Character models, one per outfit (converted from FBX/OBJ: one skinned mesh with Mixamo bone names,
// ~14-16k tris, compressed textures, 0.5-1.8MB each)
export const MODELS = {
  swat_gasmask: 'assets/models/swat_gasmask.glb',
  swat_spec: 'assets/models/swat_spec.glb',
  swat_blue: 'assets/models/swat_blue.glb',
  rebel: 'assets/models/rebel.glb',
  thug: 'assets/models/thug.glb',
  militia: 'assets/models/militia.glb',
  tactical: 'assets/models/tactical.glb',
  terrorista: 'assets/models/terrorista.glb',
};
const HIP_HEIGHT = 0.93;                 // our skeleton's hip height when standing
const protos = {};
let loading = null;

// Loads every model once; resolves when all have finished (an outfit whose model failed borrows another)
export function loadCharacterModel() {
  if (!loading) {
    const loader = new GLTFLoader();
    loading = Promise.all([loadMocap(), ...Object.entries(MODELS).map(([id, url]) => loader.loadAsync(url)
      .then((g) => { protos[id] = prepare(g); })
      .catch((e) => console.warn(`Character model ${id} unavailable`, e)))])
      .then(() => protos);
  }
  return loading;
}
export const modelFor = (outfit) => (protos[outfit.model] ? outfit.model : Object.keys(protos)[0] ?? null);

const boneName = (n) => n.replace(/^mixamorig:?/, '').replace(/_\d+$/, '');   // loaders suffix duplicate names with _1, _2...
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();

// Orientation of a frame whose Y is `primary` and X is `secondary` (made orthogonal)
function frameQuat(primary, secondary, out) {
  const y = _a.copy(primary).normalize();
  const x = _b.copy(secondary).addScaledVector(y, -secondary.dot(y));
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0).addScaledVector(y, -y.x);
  x.normalize();
  const z = _c.crossVectors(x, y);
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}

const SEGMENTS = {
  // bone: [candidate child bones that define its direction, rest reference for the secondary axis]
  Hips: [['Spine'], 'right'], Spine: [['Spine1', 'Spine2', 'Neck'], 'right'], Spine1: [['Spine2', 'Neck'], 'right'], Spine2: [['Neck'], 'right'],
  Neck: [['Head'], 'right'], Head: [['HeadTop_End'], 'right', 'Neck'],
  LeftArm: [['LeftForeArm'], 'back'], LeftForeArm: [['LeftHand'], 'back'], RightArm: [['RightForeArm'], 'back'], RightForeArm: [['RightHand'], 'back'],
  LeftUpLeg: [['LeftLeg'], 'fwd'], LeftLeg: [['LeftFoot'], 'fwd'], RightUpLeg: [['RightLeg'], 'fwd'], RightLeg: [['RightFoot'], 'fwd'],
  LeftFoot: [['LeftToeBase'], 'right'], RightFoot: [['RightToeBase'], 'right'],
};
const SPINE = ['Spine', 'Spine1', 'Spine2'];

function prepare(g) {
  const root = g.scene;
  root.updateMatrixWorld(true);
  const bones = {};
  root.traverse((o) => { if (o.isBone && !bones[boneName(o.name)]) bones[boneName(o.name)] = o; });
  const P = (n) => bones[n].getWorldPosition(new THREE.Vector3());
  const up = new THREE.Vector3().subVectors(P('Neck'), P('Hips')).normalize();
  const right = new THREE.Vector3().subVectors(P('RightArm'), P('LeftArm')).normalize();
  const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
  const refs = { right, fwd, back: fwd.clone().negate() };
  const rest = {};
  for (const [n, [kids, ref, from]] of Object.entries(SEGMENTS)) {
    const child = kids.find((k) => bones[k]);
    if (!bones[n] || (!child && !from)) continue;
    // the head is aimed along neck->head (matching how the game drives it)
    const dir = from ? new THREE.Vector3().subVectors(P(n), P(from)) : new THREE.Vector3().subVectors(P(child), P(n));
    const q = bones[n].getWorldQuaternion(new THREE.Quaternion());
    const f = frameQuat(dir, refs[ref], new THREE.Quaternion());
    rest[n] = { worldQ: q, frameInv: f.invert() };
  }
  // the neck leans forward in every real body: remember the neck->head direction in the torso's frame,
  // so the head keeps that lean instead of being tipped back (faces looking up)
  const torsoInv = frameQuat(new THREE.Vector3().subVectors(P('Neck'), P('Hips')), right, new THREE.Quaternion()).invert();
  const neckLean = new THREE.Vector3().subVectors(P('Head'), P('Neck')).normalize().applyQuaternion(torsoInv);
  const scale = HIP_HEIGHT / Math.max(1e-3, (P('LeftUpLeg').y + P('RightUpLeg').y) / 2 - Math.min(P('LeftFoot').y, P('RightFoot').y) * 0 );
  const len = (a, b) => P(a).distanceTo(P(b)) * scale;
  root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; } });
  // finger curl axes: rigs orient finger bones differently (some mirror the left hand), so work out
  // in world space which way bends each finger toward the palm. The palm normal comes from the
  // knuckles (works for T-poses and relaxed poses alike); without finger bones, assume palms down.
  const curl = [];
  for (const side of ['Left', 'Right']) {
    const palm = new THREE.Vector3(0, -1, 0);
    if (bones[`${side}Hand`] && bones[`${side}HandIndex1`] && bones[`${side}HandPinky1`]) {
      const h = P(`${side}Hand`);
      palm.crossVectors(P(`${side}HandIndex1`).sub(h), P(`${side}HandPinky1`).sub(h)).normalize();
      if (side === 'Left') palm.negate();
    }
    const down = palm;
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) for (let k = 1; k <= 3; k++) {
      const n = `${side}Hand${f}${k}`, next = bones[`${side}Hand${f}${k + 1}`];
      if (!bones[n] || !next) continue;
      const d = new THREE.Vector3().subVectors(P(`${side}Hand${f}${k + 1}`), P(n)).normalize();
      const axis = new THREE.Vector3().crossVectors(d, down);
      if (axis.lengthSq() < 1e-4) continue;
      axis.normalize().applyQuaternion(bones[n].getWorldQuaternion(new THREE.Quaternion()).invert());
      curl.push([n, axis, f === 'Thumb' ? (k === 1 ? 0 : 0.45) : k === 1 ? 0.9 : 1.1]);
    }
  }
  return {
    scene: root, rest, scale, curl, neckLean, spine: SPINE.filter((b) => bones[b]),
    armLen: [len('LeftArm', 'LeftForeArm'), len('LeftForeArm', 'LeftHand')],
    legLen: [len('LeftUpLeg', 'LeftLeg'), len('LeftLeg', 'LeftFoot')],
    footLift: P('LeftFoot').y * scale,       // ankle height above the sole in the bind pose
  };
}

// ---------- one character instance ----------
export class SkinnedBody {
  constructor(outfit) {
    const P = (this.P = protos[modelFor(outfit)]);
    this.root = cloneSkinned(P.scene);
    this.root.scale.setScalar(P.scale);
    this.b = {};
    this.root.traverse((o) => { if (o.isBone && !this.b[boneName(o.name)]) this.b[boneName(o.name)] = o; });
    // curl the fingers into a grip once; they never change
    for (const [n, axis, angle] of P.curl) if (angle && this.b[n]) this.b[n].rotateOnAxis(axis, angle);
  }

  // Aim a bone so its segment points along `dir`, with `ref` fixing the roll
  aim(name, dir, ref) {
    const bone = this.b[name], r = this.P.rest[name];
    if (!bone || !r) return;
    frameQuat(dir, ref, _q).multiply(r.frameInv).multiply(r.worldQ);          // desired world rotation
    bone.parent.getWorldQuaternion(_q2);
    bone.quaternion.copy(_q2.invert().multiply(_q));
    bone.updateWorldMatrix(false, false);      // children refresh lazily via getWorld*()
  }

  // Two-bone IK: from the bone's current position reach `target`, bending toward `pole`
  limb(upper, lower, lens, target, pole, fallbackRef) {
    if (!this.b[upper] || !this.b[lower]) return;
    const A = this.b[upper].getWorldPosition(_d);
    const T = _e.copy(target);
    const toT = new THREE.Vector3().subVectors(T, A);
    const [l1, l2] = lens;
    const dist = THREE.MathUtils.clamp(toT.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    const dir = toT.normalize();
    const n = new THREE.Vector3().subVectors(pole, A);
    n.addScaledVector(dir, -n.dot(dir));
    if (n.lengthSq() < 1e-6) n.copy(fallbackRef).addScaledVector(dir, -fallbackRef.dot(dir));
    n.normalize();
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const E = A.clone().addScaledVector(dir, a).addScaledVector(n, h);
    const T2 = A.clone().addScaledVector(dir, dist);
    // the secondary axis is the direction the joint bends toward (elbows back, knees forward)
    this.aim(upper, E.clone().sub(A), n);
    this.aim(lower, T2.sub(E), n);
  }

  fit(J, toes = null) {
    const P = this.P;
    const up = new THREE.Vector3().subVectors(J.neck, J.pelvis);
    const right = new THREE.Vector3().subVectors(J.shR, J.shL);
    const hipRight = new THREE.Vector3().subVectors(J.hipR, J.hipL);
    const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
    const hipFwd = new THREE.Vector3().crossVectors(up, hipRight).normalize();   // knees point where the hips face
    // hips follow the pelvis, the spine bends toward the chest
    const hips = this.b.Hips;
    hips.parent.updateWorldMatrix(true, false);
    hips.position.copy(hips.parent.worldToLocal(J.pelvis.clone()));
    const hipsUp = up.clone().normalize().lerp(new THREE.Vector3(0, 1, 0), 0.5);
    this.aim('Hips', hipsUp, hipRight);
    // spread the twist between hips and shoulders over the spine instead of snapping at the waist
    const hr = _e.copy(hipRight).normalize(), sr = right.clone().normalize();
    P.spine.forEach((s, i) => { const k = (i + 1) / P.spine.length; this.aim(s, up, hr.clone().multiplyScalar(1 - k).addScaledVector(sr, k)); });
    // head: the model's own neck lean (in the torso frame), turned by however far the game's head
    // joint is tilted from the torso axis (aim pitch, ragdoll flop)
    const upN = _a.copy(up).normalize();
    _q.setFromUnitVectors(upN, _b.subVectors(J.head, J.neck).normalize());
    const neckDir = P.neckLean.clone().applyQuaternion(frameQuat(up, right, _q2)).applyQuaternion(_q);
    this.aim('Neck', neckDir, right);
    this.aim('Head', neckDir, right);
    // arms: the wrist sits a little behind the grip point
    const back = fwd.clone().negate();
    for (const [s, el, ha] of [['Left', 'elL', 'haL'], ['Right', 'elR', 'haR']]) {
      const wrist = J[ha].clone().addScaledVector(_a.subVectors(J[ha], J[el]).normalize(), -0.07);
      this.limb(`${s}Arm`, `${s}ForeArm`, P.armLen, wrist, J[el].clone().addScaledVector(back, 0.05), back);
    }
    for (const [s, kn, ft] of [['Left', 'knL', 'ftL'], ['Right', 'knR', 'ftR']]) {
      const ankle = J[ft].clone(); ankle.y += Math.max(0, P.footLift - 0.05);
      this.limb(`${s}UpLeg`, `${s}Leg`, P.legLen, ankle, J[kn].clone().addScaledVector(hipFwd, 0.2), hipFwd);
      // heel-toe roll from the motion capture
      const foot = this.b[`${s}Foot`];
      if (toes && foot && P.rest[`${s}Foot`]) this.aim(`${s}Foot`, new THREE.Vector3().subVectors(toes[s[0]], J[ft]), hipRight);
    }
  }

  dispose() { this.root.removeFromParent(); }
}
