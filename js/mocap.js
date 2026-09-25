// Motion-captured locomotion (Mixamo "Pro Rifle Pack"), stored as joint trajectories of the game's
// skeleton: assets/anims/locomotion.json holds, per clip, the 15 pose joints + toes + chest for every
// frame (game frame: facing -Z, metres, feet on y=0, root motion removed so walk/run cycles loop in place).
// Driving joints rather than bones keeps it independent of each character's rig: the skinned fitter
// (skinned.js) maps these joints onto any model, and the ragdoll takes over from the same joints.

const URL = 'assets/anims/locomotion.json';
const STANCE_UNDO = 0.8;          // how much of the clips' bladed rifle stance to turn back toward the aim
let DATA = null, loading = null;

export function loadMocap() {
  if (!loading) {
    loading = fetch(URL).then((r) => r.json()).then((j) => {
      const J = j.joints, S = J.length * 3, clips = {};
      for (const [id, c] of Object.entries(j.clips)) {
        const raw = Uint8Array.from(atob(c.data), (ch) => ch.charCodeAt(0));
        const q = new Int16Array(raw.buffer), d = new Float32Array(q.length);
        for (let i = 0; i < q.length; i++) d[i] = q[i] / 1000;
        clips[id] = { ...c, d, dur: c.n / j.fps, stride: c.speed * c.n / j.fps };
      }
      const idx = Object.fromEntries(J.map((k, i) => [k, i * 3]));
      // locomotion clips sorted by travel angle (0 = forward, clockwise toward the right)
      const ring = (g) => Object.values(clips).filter((c) => c.gait === g)
        .map((c) => ({ c, ang: Math.atan2(c.dir[0], -c.dir[1]) })).sort((a, b) => a.ang - b.ang);
      // Rifle-pack clips stand bladed (whole body ~50deg off the aim line). Most of that turn is undone
      // at runtime: the pose is rotated back by `stance`, and direction clips are picked at the travel
      // angle rotated the other way, so the feet still step along the real travel direction.
      // Standing and crouching clips are bladed differently, so each layer has its own angle.
      const stanceOf = (c) => {
        let hx = 0, hz = 0;
        for (let f = 0; f < c.n; f++) { const o = f * S; hx += c.d[o + idx.hipR] - c.d[o + idx.hipL]; hz += c.d[o + idx.hipR + 2] - c.d[o + idx.hipL + 2]; }
        const a = -STANCE_UNDO * Math.atan2(-hz, hx);
        return { cs: Math.cos(a), sn: Math.sin(a) };
      };
      const stand = stanceOf(clips.idle), crouch = stanceOf(clips.crouch);
      // where the chest pivot (neck joint) rests in the standing idle, after turning the stance back
      const id = clips.idle;
      let nx = 0, ny = 0, nz = 0;
      for (let f = 0; f < id.n; f++) { const o = f * S + idx.neck; nx += id.d[o]; ny += id.d[o + 1]; nz += id.d[o + 2]; }
      nx /= id.n; ny /= id.n; nz /= id.n;
      DATA = {
        clips, S, idx, joints: J, walk: ring('walk'), run: ring('run'), cwalk: ring('cwalk'), stand, crouch,
        restNeck: [nx * stand.cs + nz * stand.sn, ny, -nx * stand.sn + nz * stand.cs],
        tmp: new Float32Array(S),
      };
    }).catch((e) => console.warn('Mocap unavailable, using procedural motion', e));
  }
  return loading;
}
export const mocapReady = () => !!DATA;
export const MOCAP_JOINTS = () => DATA.idx;
export const MOCAP_REST_NECK = () => DATA.restNeck;

// acc += w * clip(u), u = normalized cycle time in [0, 1)
function add(acc, clip, u, w) {
  if (w <= 1e-4) return;
  const f = (((u % 1) + 1) % 1) * clip.n, i0 = Math.floor(f) % clip.n, i1 = (i0 + 1) % clip.n, t = f - Math.floor(f);
  const d = clip.d, S = DATA.S, a = i0 * S, b = i1 * S;
  for (let k = 0; k < S; k++) acc[k] += w * (d[a + k] + (d[b + k] - d[a + k]) * t);
}

// Two neighbouring direction clips of one gait for travel angle `ang`
function ringPair(ring, ang) {
  const n = ring.length;
  let i = 0;
  while (i < n && ring[i].ang <= ang) i++;
  const lo = ring[(i - 1 + n) % n], hi = ring[i % n];
  let span = hi.ang - lo.ang; if (span <= 0) span += Math.PI * 2;
  let t = ang - lo.ang; if (t < 0) t += Math.PI * 2;
  return [lo.c, hi.c, Math.min(1, t / span)];
}

// Blended locomotion pose. st = per-character state (phases, smoothed weights).
// move: {speed, dx, dz (unit travel dir in body frame), air (0/1), crouch (0/1)}. Returns Float32Array or null.
export function sampleLocomotion(st, dt, move) {
  if (!DATA) return null;
  const { clips } = DATA;
  const acc = st.acc || (st.acc = new Float32Array(DATA.S));
  acc.fill(0);
  const ease = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);
  st.move = ease(st.move ?? 0, Math.min(1, Math.max(0, (move.speed - 0.15) / 0.9)), 9);
  st.air = ease(st.air ?? 0, move.air, 10);
  st.crouch = ease(st.crouch ?? 0, move.crouch, 8);
  // standing: walk <-> run by speed; the cycle length blends too so the feet don't slide
  const W = clips['walk forward'], R = clips['run forward'], C = clips['cwalk forward'];
  const g = Math.min(1, Math.max(0, (move.speed - W.speed) / (R.speed - W.speed)));
  const stride = W.stride + (R.stride - W.stride) * g;
  st.ph = ((st.ph ?? Math.random()) + dt * move.speed / stride) % 1;
  st.cph = ((st.cph ?? Math.random()) + dt * move.speed / C.stride) % 1;
  st.idle = ((st.idle ?? Math.random()) + dt / clips.idle.dur) % 1;
  st.airT = ((st.airT ?? 0) + dt / clips.air.dur) % 1;
  st.crT = ((st.crT ?? 0) + dt / clips.crouch.dur) % 1;
  const ground = 1 - st.air;
  const layer = (stance, w, fill) => {
    if (w <= 1e-4) return;
    const T = DATA.tmp; T.fill(0);
    // travel direction as the un-turned clips see it: R(-stance) * (dx, dz), R = rotation about +Y
    const { cs, sn } = stance;
    const cx = move.dx * cs - move.dz * sn, cz = move.dx * sn + move.dz * cs;
    fill(T, Math.atan2(cx, -cz));
    // turn the layer back toward the aim: R(stance) (x' = x cos + z sin, z' = -x sin + z cos)
    for (let k = 0; k < DATA.S; k += 3) { const x = T[k], y = T[k + 1], z = T[k + 2]; acc[k] += w * (x * cs + z * sn); acc[k + 1] += w * y; acc[k + 2] += w * (-x * sn + z * cs); }
  };
  layer(DATA.stand, ground * (1 - st.crouch), (T, ang) => {
    for (const [ring, gw] of [[DATA.walk, 1 - g], [DATA.run, g]]) {
      if (gw <= 0) continue;
      const [a, b, t] = ringPair(ring, ang);
      add(T, a, st.ph + a.phase0, st.move * gw * (1 - t));
      add(T, b, st.ph + b.phase0, st.move * gw * t);
    }
    add(T, clips.idle, st.idle, 1 - st.move);
  });
  layer(DATA.crouch, ground * st.crouch, (T, ang) => {
    const [a, b, t] = ringPair(DATA.cwalk, ang);
    add(T, a, st.cph + a.phase0, st.move * (1 - t));
    add(T, b, st.cph + b.phase0, st.move * t);
    add(T, clips.crouch, st.crT, 1 - st.move);
  });
  layer(DATA.stand, st.air, (T) => add(T, clips.air, st.airT, 1));
  return acc;
}
