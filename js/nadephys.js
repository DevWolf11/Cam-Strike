// Grenade flight, shared by the game (grenades.js) and the bots' lineup solver (botnav.js). There is
// one implementation, so a computed lineup lands exactly where the real throw does. The physics runs in
// fixed 1/180 s steps whatever the frame rate, so a throw flies the same on every device.
import { GRENADES } from './config.js';
import { pointBlocked } from './world.js';

export const NADE_GRAVITY = 16;
const H = 1 / 180;                   // physics step (three per frame at 60 fps)
export const THROW_DELAY = 0.25;     // pin pulled -> grenade leaves the hand (game.throwNade)

// Where a throw starts and how fast it goes: from the eye along yaw/pitch, power 0..1 (lob .. full throw),
// plus half the thrower's own velocity. Writes into out.pos / out.vel (anything with x, y, z).
export function launch(x, eyeY, z, yaw, pitch, power, vx, vz, out) {
  const cp = Math.cos(pitch);
  const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
  const speed = 9 + 15 * power;      // up to 24 m/s: a full throw carries ~35 m
  out.pos.x = x + dx * 0.4; out.pos.y = eyeY - 0.1 + dy * 0.4; out.pos.z = z + dz * 0.4;
  out.vel.x = dx * speed + vx * 0.5; out.vel.y = dy * speed + 2.0; out.vel.z = dz * speed + vz * 0.5;
  return out;
}

// One physics step. Returns whether it's resting/rolling on the ground.
function substep(n, onBounce) {
  const P = n.pos, V = n.vel;
  V.y -= NADE_GRAVITY * H;
  const nx = P.x + V.x * H, ny = P.y + V.y * H, nz = P.z + V.z * H;
  if (!pointBlocked(nx, ny, nz)) { P.x = nx; P.y = ny; P.z = nz; }
  else {
    // find which axis we hit and bounce off it
    let bounced = false;
    if (pointBlocked(nx, P.y, P.z)) { V.x *= -0.45; bounced = true; }
    if (pointBlocked(P.x, P.y, nz)) { V.z *= -0.45; bounced = true; }
    if (pointBlocked(P.x, ny, P.z)) {
      const floorHit = V.y < 0;
      V.y *= -0.35; V.x *= 0.7; V.z *= 0.7; bounced = true;
      if (floorHit && n.type === 'molotov') { n.burst = true; return false; }
    }
    if (!bounced) { V.x *= -0.3; V.y *= -0.3; V.z *= -0.3; }
    if (onBounce) onBounce(n);
  }
  // rolls to a stop on the ground
  const onGround = Math.abs(V.y) < 0.4 && pointBlocked(P.x, P.y - 0.08, P.z);
  if (onGround) { const k = 1 - H * 2.5; V.x *= k; V.z *= k; }
  return onGround;
}

// Advance a grenade { type, pos, vel, t } by a frame of dt. onBounce(n) runs after each bounce (sound, spin).
// A molotov bursts on its first floor hit (t jumps to 99). Returns whether it is resting/rolling on the ground.
export function stepNade(n, dt, onBounce = null) {
  n.t += dt;
  n.acc = (n.acc || 0) + dt;
  let onGround = false;
  while (n.acc >= H - 1e-9) {
    n.acc -= H;
    onGround = substep(n, onBounce);
    if (n.burst) { n.t = 99; n.acc = 0; break; }
  }
  return onGround;
}

// Simulate a whole throw to detonation. Returns { x, y, z, t } where it goes off, or null if it never does.
// trace (optional array) receives [x, y, z] once per frame for drawing the arc.
const _n = { type: '', pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, t: 0, acc: 0, burst: false };
export function simulateThrow(type, x, eyeY, z, yaw, pitch, power, vx = 0, vz = 0, dt = 1 / 60, trace = null) {
  const fuse = GRENADES[type].fuse;
  _n.type = type; _n.t = 0; _n.acc = 0; _n.burst = false;
  launch(x, eyeY, z, yaw, pitch, power, vx, vz, _n);
  if (pointBlocked(_n.pos.x, _n.pos.y, _n.pos.z)) return null;        // starts inside a wall
  for (let f = 0; f < 600; f++) {
    stepNade(_n, dt);
    if (trace) trace.push([_n.pos.x, _n.pos.y, _n.pos.z]);
    if (_n.t >= fuse) return { x: _n.pos.x, y: _n.pos.y, z: _n.pos.z, t: _n.burst ? (f + 1) * dt : _n.t };
  }
  return null;
}
