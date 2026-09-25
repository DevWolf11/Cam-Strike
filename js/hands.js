import * as THREE from '../lib/three.module.min.js';
import { GeoBuilder } from './geom.js';

// First-person hands and sleeves. Coordinates are in the gun's frame: x right, y up, -z forward.
// 'grip': right hand around a pistol grip at the origin (index finger on the trigger).
// 'fore': left hand cupping a handguard whose axis passes through the origin.
// 'hold': right hand closed around a knife handle or grenade.

const cache = new Map();
function handGeo(pose) {
  if (cache.has(pose)) return cache.get(pose);
  const g = new GeoBuilder(), C = 0xffffff;
  const finger = (pts, r) => { for (let i = 0; i < pts.length - 1; i++) g.segment(pts[i], pts[i + 1], r, C, 6); };
  if (pose === 'fore') {
    g.rbox(0.05, 0.024, 0.085, 0.01, 0.004, -0.04, 0.004, C);                                     // palm under the handguard
    [-0.03, -0.01, 0.01, 0.029].forEach((z, i) => {
      const r = 0.0092 - i * 0.0004, s = i === 3 ? 0.85 : 1;
      finger([[0.022, -0.042, z], [0.037, -0.022, z], [0.038, 0.004 * s, z * 0.98], [0.026, 0.022 * s, z * 0.95]], r);
    });
    finger([[-0.016, -0.045, 0.034], [-0.034, -0.018, 0.012], [-0.034, 0.006, -0.018], [-0.026, 0.014, -0.036]], 0.0105);   // thumb
    g.rbox(0.05, 0.05, 0.05, 0.016, -0.008, -0.052, 0.045, C);                                    // heel of the hand / wrist
  } else {
    // closed hand around a vertical handle on the origin
    g.rbox(0.026, 0.078, 0.066, 0.011, 0.028, -0.04, 0.014, C);                                   // back of the hand
    [-0.03, -0.052, -0.073].forEach((y, i) => {
      const r = 0.0093 - i * 0.0005;
      finger([[0.03, y, -0.016], [0.016, y, -0.03], [-0.008, y, -0.03], [-0.02, y + 0.002, -0.012]], r);
    });
    if (pose === 'grip') finger([[0.028, -0.008, -0.016], [0.02, -0.007, -0.033], [0.007, -0.014, -0.04]], 0.0092);   // trigger finger
    else finger([[0.03, -0.008, -0.016], [0.016, -0.008, -0.03], [-0.008, -0.008, -0.03], [-0.02, -0.006, -0.012]], 0.0093);
    finger([[0.02, -0.024, 0.032], [-0.004, 0.002, 0.024], [-0.02, 0.006, 0.0], [-0.022, 0.004, -0.018]], 0.0105);      // thumb over the top
    g.rbox(0.05, 0.05, 0.05, 0.018, 0.032, -0.046, 0.05, C);                                     // wrist
  }
  const geo = g.build();
  cache.set(pose, geo);
  return geo;
}

// Tapered sleeve from the wrist back toward the camera, with a glove cuff
const sleeveCache = new Map();
function sleeveGeo(len) {
  if (sleeveCache.has(len)) return sleeveCache.get(len);
  const g = new GeoBuilder();
  g.lathe([[0.001, -0.004], [0.031, 0.0], [0.034, 0.03], [0.041, len * 0.5], [0.047, len * 0.85], [0.05, len], [0.001, len + 0.004]], 0, 0, 0, 0xffffff, 12);
  for (const y of [len * 0.35, len * 0.62]) g.lathe([[0.0425, y], [0.045, y + 0.006], [0.0425, y + 0.012]], 0, 0, 0, 0xd8d8d8, 12); // fabric folds
  const geo = g.build();
  sleeveCache.set(len, geo);
  return geo;
}
const cuffGeo = new THREE.CylinderGeometry(0.036, 0.034, 0.05, 12);
const watchGeo = (() => { const g = new GeoBuilder(); g.lathe([[0.001, -0.012], [0.039, -0.012], [0.039, 0.012], [0.001, 0.012]], 0, 0, 0, 0x202020, 14); g.cyl(0.016, 0.016, 0.01, 0.0, 0, -0.037, 0x2a2a2a, 12, Math.PI / 2); return g.build(); })();

const _q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
// Returns a group: hand + cuff + sleeve. wrist = where the sleeve starts, dir = direction the forearm runs (toward the elbow)
export function armMesh(pose, mats, { wrist, dir, len = 0.42, watch = false }) {
  const grp = new THREE.Group();
  const hand = new THREE.Mesh(handGeo(pose), mats.glove);
  grp.add(hand);
  const d = new THREE.Vector3(...dir).normalize();
  _q.setFromUnitVectors(Y, d);
  const sleeve = new THREE.Mesh(sleeveGeo(len), mats.sleeve);
  sleeve.position.set(...wrist).addScaledVector(d, 0.03); sleeve.quaternion.copy(_q);
  const cuff = new THREE.Mesh(cuffGeo, mats.glove);
  cuff.position.set(...wrist).addScaledVector(d, 0.015); cuff.quaternion.copy(_q);
  grp.add(sleeve, cuff);
  if (watch) { const w = new THREE.Mesh(watchGeo, mats.watch); w.position.set(...wrist).addScaledVector(d, 0.07); w.quaternion.copy(_q); grp.add(w); }
  return grp;
}
