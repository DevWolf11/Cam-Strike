// One bot: what it sees and hears, how it aims and fights, how it moves. Its team brain (botteam.js) decides
// where it should be and what its job is; this file makes it carry that out like a player would: crosshair
// on the corner before it opens, a reaction and a flick that land a little off and settle, a stop before the
// shot, short bursts at range, back into cover to reload.

import { PLAYER, GRENADES } from './config.js';
import * as W from './world.js';
import { solveThrow, coverSpot, EYE, HEAD } from './botnav.js';
import { stepNade } from './nadephys.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
// hitbox heights follow a crouch (head centre / top of the body box)
const headH = (e) => PLAYER.headY - (PLAYER.headY - PLAYER.crouchHeadY) * (e.duck || 0);
const bodyH = (e) => PLAYER.bodyTop - (PLAYER.bodyTop - PLAYER.crouchBodyTop) * (e.duck || 0);

// How far each kind of sound carries (m) before difficulty; walls cut it to 60%
const NADE_SOUND = new Set(['bounce', 'smoke', 'flash', 'he', 'molotov']);
export const HEAR = { step: 15, shot: 45, reload: 9, pin: 9, bounce: 12, land: 10, plant: 16, defuse: 16, knife: 7, smoke: 25, flash: 35, he: 50, molotov: 25, misc: 10 };

// ---------------------------------------------------------------- setup
function persona() {
  return {
    aggression: Math.random(),            // swings wide, chases, takes duels
    crouchSpray: Math.random() < 0.45,    // drops into a crouch to spray at range
    crouchHold: Math.random() < 0.35,     // holds angles crouched where the cover allows
    strafeGap: rand(0.22, 0.42),          // ADAD rhythm
  };
}

export function initBotRound(a, g) {
  a.persona ||= persona();
  a.ai = {
    D: g.diff, order: null, orderId: 0,
    cmd: { x: 0, z: 0, speed: 0, stop: false, crouch: false, aimed: false, jump: false },
    path: null, pi: 0, goalKey: '', stuckT: 0, stuckN: 0, lastX: a.pos.x, lastZ: a.pos.z, arrived: false, arrivedT: 0,
    senseT: Math.random() * 0.1, mem: new Map(), target: null, tVisT: -9, lostE: null, lostT: -9,
    heard: null, hurtBy: null, hurtT: -9, hurtFrom: null,
    reactT: 0, errY: 0, errP: 0, trY: 0, trP: 0, aimHead: false, disciplined: true,
    burst: 0, pauseT: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0, cover: null, coverT: -9,
    flash: null, avoid: null, scan: Math.random() * 6, preaim: null, preaimT: 0, preaimSkill: true,
    nade: null, waitT: rand(0, 0.5), shiftT: rand(5, 10), killT: -9,
  };
}

// The brain hands out jobs through this (a new object = a new job)
export function setOrder(a, o) {
  if (!a.ai) return;
  a.ai.order = o;
  a.ai.orderId++;
  a.ai.preaimSkill = Math.random() < a.ai.D.preaim;
  a.ai.arrivedT = 0;
}

// ---------------------------------------------------------------- senses
// how far a weapon is worth taking a duel at (further away we call them out but keep moving)
const RANGE = { pistol: 38, smg: 45, shotgun: 22, rifle: 80, sniper: 150, knife: 30, nade: 60 };

function sense(a, g) {
  const ai = a.ai, D = ai.D, brain = g.brains?.[a.team];
  const blind = a.blindT > 0.3;
  const half = D.fov * 0.5 * DEG;
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  const range = RANGE[a.weapon] ?? 80;
  let best = null, bestS = Infinity;
  for (const e of g.agents) {
    if (!e.alive || e.team === a.team) continue;
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 125) continue;
    const cosA = (dx * fx + dz * fz) / (d || 1);
    const shotBy = ai.hurtBy === e && g.time - ai.hurtT < 0.5;
    // far away a player is a few pixels: only noticed close to where you're looking
    const cone = Math.cos(half * Math.max(0.14, Math.min(1, 1 - (d - 30) / 95)));
    if (blind || (cosA < cone && d > 2.5 && e !== ai.target && !shotBy)) continue;
    const vis = W.hasLOS(a.pos.x, a.eyeY, a.pos.z, e.pos.x, e.pos.y + headH(e) - 0.05, e.pos.z) ||
                W.hasLOS(a.pos.x, a.eyeY, a.pos.z, e.pos.x, e.pos.y + bodyH(e) - 0.4, e.pos.z);
    if (!vis) continue;
    const m = ai.mem.get(e) || {};
    const fresh = g.time - (m.seenT ?? -99) > 4;
    m.x = e.pos.x; m.y = e.pos.y; m.z = e.pos.z; m.t = m.seenT = g.time; m.seen = true;
    ai.mem.set(e, m);
    brain?.spotted(a, e, fresh);
    if (e === ai.target) ai.tVisT = g.time;
    if (d > range && !shotBy && e !== ai.target) continue;
    // who to shoot: whoever is nearest the crosshair, close, and shooting at us
    let score = Math.acos(Math.max(-1, Math.min(1, cosA))) * 1.5 + d / 30;
    if (e === ai.target) score -= 0.6;
    if (shotBy) score -= 0.4;
    if (score < bestS) { bestS = score; best = e; }
  }
  if (best && best !== ai.target) acquire(a, g, best);
  else if (!best && ai.target && (!ai.target.alive || g.time - ai.tVisT > 1.4)) loseTarget(a, g);
}

function loseTarget(a, g) {
  const ai = a.ai;
  if (ai.target && !ai.target.alive) ai.killT = g.time;
  ai.lostE = ai.target; ai.lostT = g.time;
  ai.target = null; ai.cover = null; ai.burst = 0;
  a.scoped = false;
}

// Where we'd aim on an enemy: head or chest, trailing a moving target a little
function aimPoint(a, e, ai, lag = true) {
  const L = lag ? ai.D.trackLag : 0;
  const x = e.pos.x - (e.vx || 0) * L, z = e.pos.z - (e.vz || 0) * L;
  const y = e.pos.y + (ai.aimHead ? headH(e) - 0.04 : bodyH(e) - 0.32);
  const dx = x - a.pos.x, dz = z - a.pos.z, dist = Math.hypot(dx, dz);
  return { x, y, z, dist, yaw: yawTo(dx, dz), pitch: Math.atan2(y - a.eyeY, dist) };
}

// A new enemy in sight: react (slower for wide flicks, faster for the corner we were aiming at),
// then flick to them, landing off by a share of the flick that settles over time
function acquire(a, g, e) {
  const ai = a.ai, D = ai.D;
  const again = (ai.lostE === e && g.time - ai.lostT < 1.5) || ai.target === e;
  ai.target = e; ai.tVisT = g.time;
  const P = aimPoint(a, e, ai, false);
  const theta = Math.hypot(wrap(P.yaw - a.yaw) * Math.cos(P.pitch), P.pitch - a.pitch);
  const pre = ai.preaim && Math.hypot(ai.preaim.x - e.pos.x, ai.preaim.z - e.pos.z) < 3.5;
  const heard = ai.heard && g.time - ai.heard.t < 3 && Math.hypot(ai.heard.x - e.pos.x, ai.heard.z - e.pos.z) < 7;
  let react = rand(D.reaction[0], D.reaction[1]) + D.reactAngle * theta;
  if (pre || heard) react *= 0.8;
  if (again) react *= 0.45;
  if (a.blindT > 0) react += a.blindT * 0.6;
  ai.reactT = react;
  ai.aimHead = Math.random() < D.headPct * (P.dist < 8 ? 0.6 : 1);
  const e0 = D.flick * theta * rand(0.6, 1.3) + D.tremor;
  const ph = Math.random() * TAU;
  ai.errY = e0 * Math.cos(ph); ai.errP = e0 * Math.sin(ph) * 0.55;
  ai.burst = 0; ai.pauseT = 0;
  ai.disciplined = Math.random() < D.discipline;
  ai.cover = null;
}

// Sounds: footsteps, shots, reloads, grenades, the bomb. Called by game.noise for every bot.
export function hearNoise(b, g, src, kind, radius, pos) {
  const ai = b.ai;
  if (!ai || !b.alive || (src && src.team === b.team)) return;
  const R = radius * ai.D.hearing;
  const d = Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z);
  if (d > R) return;
  const open = W.hasLOS(b.pos.x, b.eyeY, b.pos.z, pos.x, (pos.y || 0) + 1.2, pos.z, false);
  if (!open && d > R * 0.6) return;                       // walls muffle it
  const err = d * (open ? 0.03 : 0.08);                   // you can tell the direction better than the distance
  const hx = pos.x + (Math.random() - 0.5) * 2 * err, hz = pos.z + (Math.random() - 0.5) * 2 * err;
  ai.heard = { x: hx, y: pos.y || 0, z: hz, t: g.time, kind, d };
  // a grenade bouncing or going off tells you where the grenade is, not where its thrower stands
  if (src && !NADE_SOUND.has(kind)) {
    const m = ai.mem.get(src) || {};
    if (!(g.time - (m.seenT ?? -99) < 0.5)) { m.x = hx; m.y = pos.y || 0; m.z = hz; m.t = g.time; m.seen = false; }
    ai.mem.set(src, m);
  }
  g.brains?.[b.team]?.heard(b, src, hx, hz, kind);
}

// Somebody threw a grenade: work out where it goes off. Teammates know their own flashes are coming and
// turn away; enemies who see it flying might. Anyone about to be standing in a molotov or next to an HE moves.
export function botsSeeThrow(g, d) {
  const n = { type: d.type, pos: { x: d.pos.x, y: d.pos.y, z: d.pos.z }, vel: { x: d.vel.x, y: d.vel.y, z: d.vel.z }, t: 0 };
  const fuse = GRENADES[d.type].fuse;
  let T = 0;
  while (n.t < fuse && T < 3) { stepNade(n, 1 / 60); T += 1 / 60; }
  const P = n.pos, at = g.time + T;
  for (const b of g.agents) {
    if (!b.isBot || !b.alive || !b.ai) continue;
    const ai = b.ai, dist = Math.hypot(b.pos.x - P.x, b.pos.z - P.z);
    const mate = b.team === d.agent.team;
    if (d.type === 'flash') {
      if (dist > 26 || !W.hasLOS(b.pos.x, b.eyeY, b.pos.z, P.x, P.y, P.z, false)) continue;
      let p = mate ? 0.85 : 0;
      if (!mate) {
        // does it see the grenade coming? (in view now)
        const dx = d.pos.x - b.pos.x, dz = d.pos.z - b.pos.z, dd = Math.hypot(dx, dz) || 1;
        const inView = (dx * -Math.sin(b.yaw) + dz * -Math.cos(b.yaw)) / dd > Math.cos(ai.D.fov * 0.5 * DEG);
        if (inView && W.hasLOS(b.pos.x, b.eyeY, b.pos.z, d.pos.x, d.pos.y, d.pos.z)) p = ai.D.dodgeFlash;
      }
      if (Math.random() < p) ai.flash = { x: P.x, y: P.y, z: P.z, from: at - 0.4, to: at + 0.2 };
    } else if ((d.type === 'molotov' && dist < 5.5) || (d.type === 'he' && dist < 5 && !mate)) {
      ai.avoid = { x: P.x, z: P.z, r: d.type === 'molotov' ? 5.5 : 5, until: at + (d.type === 'molotov' ? 0.6 : 0) };
    }
  }
}

// ---------------------------------------------------------------- aiming
function turnTo(a, wy, wp, dt, rate, gain) {
  const dy = wrap(wy - a.yaw), dp = wp - a.pitch;
  const f = Math.min(1, dt * gain), max = rate * dt;
  let sy = dy * f, sp = dp * f;
  const m = Math.hypot(sy, sp);
  if (m > max) { sy *= max / m; sp *= max / m; }
  a.yaw = wrap(a.yaw + sy);
  a.pitch = Math.max(-1.3, Math.min(1.3, a.pitch + sp));
}
function lookAtPoint(a, x, y, z, dt, rate, gain) {
  const dx = x - a.pos.x, dz = z - a.pos.z;
  turnTo(a, yawTo(dx, dz), Math.atan2(y - a.eyeY, Math.max(0.5, Math.hypot(dx, dz))), dt, rate, gain);
}
// steady hands aren't perfectly steady: a small wandering offset
function tremor(ai, dt) {
  const k = 6, sig = ai.D.tremor * Math.sqrt(2 * k), sq = Math.sqrt(dt);
  ai.trY += -ai.trY * k * dt + sig * sq * gauss();
  ai.trP += -ai.trP * k * dt + sig * sq * gauss() * 0.7;
}

// Is a teammate standing in the line of fire before the target?
function teammateInLine(a, g, tx, tz, dist) {
  if (!g.rules.friendlyFire) return false;
  const dx = (tx - a.pos.x) / (dist || 1), dz = (tz - a.pos.z) / (dist || 1);
  for (const m of g.agents) {
    if (m === a || !m.alive || m.team !== a.team) continue;
    const mx = m.pos.x - a.pos.x, mz = m.pos.z - a.pos.z, along = mx * dx + mz * dz;
    if (along < 0 || along > dist) continue;
    if (Math.abs(mx * dz - mz * dx) < 0.75 && Math.abs(m.pos.y - a.pos.y) < 1.6) return true;
  }
  return false;
}

// bullets per burst and the pause after it, by weapon and range (taps far, sprays close)
function burstLen(w, d) {
  if (w.id === 'smg') return d < 15 ? 14 : d < 25 ? 6 : 3;
  return d < 10 ? 10 : d < 18 ? 6 : d < 30 ? 3 : Math.random() < 0.4 ? 2 : 1;
}
function burstPause(w, d) { return d < 10 ? rand(0.05, 0.14) : rand(0.2, 0.36) + (d > 30 ? 0.14 : 0); }

// ---------------------------------------------------------------- fighting
function fight(a, g, dt, cmd) {
  const ai = a.ai, D = ai.D, e = ai.target, w = a.w;
  const visible = g.time - ai.tVisT < 0.16;
  const P = aimPoint(a, e, ai);
  cmd.aimed = true;
  if (a.weapon === 'nade' && !a.throwing) a.equip(a.bestWeapon());

  // ---- aim
  if (ai.reactT > 0) ai.reactT -= dt;                 // not reacting yet: the view stays where it was
  else if (visible) {
    const k = Math.exp(-dt / D.settle);
    ai.errY *= k; ai.errP *= k;
    tremor(ai, dt);
    const c = D.recoilComp;
    turnTo(a, P.yaw + ai.errY + ai.trY - a.recoilY * c, P.pitch + ai.errP + ai.trP - a.recoilP * c, dt, D.turnRate, 20);
  } else {
    // lost sight: crosshair stays where they were last seen, at head height
    const m = ai.mem.get(e);
    if (m) lookAtPoint(a, m.x, m.y + headH(e), m.z, dt, D.turnRate, 10);
  }

  // ---- knife: close in and slash
  if (w.melee) {
    cmd.x = -Math.sin(a.yaw); cmd.z = -Math.cos(a.yaw); cmd.speed = w.speed;
    if (P.dist < 1.8 && ai.reactT <= 0) g.fire(a);
    return;
  }
  const inv = a.inv[a.weapon];
  // empty and they're close: the pistol is quicker than a reload
  if (inv && inv.mag === 0 && a.weapon !== 'pistol' && a.inv.pistol?.mag > 0 && P.dist < 14 && a.reloadT > 0.6) a.equip('pistol');
  if (w.scoped && !a.scoped && a.reloadT <= 0 && P.dist > 7) a.scoped = true;

  // ---- back into cover to reload, or when hurt and losing
  const reloading = a.reloadT > 0 || (inv && inv.mag === 0 && inv.reserve > 0);
  const losing = a.hp < 30 && e.hp > 45 && a.persona.aggression < 0.65;
  const holding = ai.order?.type === 'hold' && ai.arrived;
  if ((reloading || losing) && visible && P.dist > 4) {
    if (!ai.cover || g.time - ai.coverT > 1.2) {
      ai.cover = coverSpot(a.pos, [{ x: e.pos.x, y: e.eyeY, z: e.pos.z }], 7, false);
      ai.coverT = g.time;
    }
    if (ai.cover) {
      const dx = ai.cover.x - a.pos.x, dz = ai.cover.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { cmd.x = dx / d; cmd.z = dz / d; cmd.speed = a.w.speed; }
      if (!reloading) return;
    }
  }
  if (inv && inv.mag === 0 && inv.reserve > 0 && a.reloadT <= 0) g.reload(a);

  // ---- stop before shooting (rifles and snipers are wild on the move)
  const runGun = (w.id === 'smg' && P.dist < 15) || (w.id === 'shotgun' && P.dist < 10) || (w.id === 'pistol' && P.dist < 8) || P.dist < 4;
  const wantStill = !runGun && ai.disciplined;
  if (wantStill && a.speed > 1.25) cmd.stop = true;
  const steady = !wantStill || a.speed < 1.4;

  // ---- pull the trigger
  const shotYaw = a.yaw + a.recoilY, shotPitch = a.pitch + a.recoilP;
  const err = Math.hypot(wrap(shotYaw - P.yaw) * Math.cos(P.pitch), shotPitch - P.pitch);
  const tol = Math.atan((ai.aimHead ? 0.17 : 0.26) / Math.max(0.5, P.dist)) * D.trigger + 0.001;
  const blocked = teammateInLine(a, g, P.x, P.z, P.dist);
  let shooting = false;
  if (visible && ai.reactT <= 0 && !blocked && steady && a.reloadT <= 0 && !a.throwing) {
    if (ai.pauseT > 0) ai.pauseT -= dt;
    else if (err < tol) {
      shooting = true;
      a.crouching = a.persona.crouchSpray && P.dist > 12 && (w.id === 'rifle' || w.id === 'smg');
      if (g.fire(a)) {
        if (!w.auto) { ai.pauseT = w.id === 'pistol' ? rand(0.08, 0.2) + P.dist * 0.004 : w.id === 'sniper' ? rand(0.1, 0.3) : rand(0.1, 0.25); ai.burst = 0; }
        else if (++ai.burst >= burstLen(w, P.dist)) { ai.burst = 0; ai.pauseT = burstPause(w, P.dist); }
      }
    }
  }
  if (!shooting && ai.pauseT <= 0 && err > tol * 3) a.crouching = holding && a.persona.crouchHold && !ai.order?.low;

  // ---- feet: ADAD between bursts up close, otherwise stand (holding) or keep moving to where we're going
  if (cmd.stop || (cmd.x || cmd.z)) return;
  if (!holding && P.dist < 16 && !a.scoped && (ai.pauseT > 0 || ai.reactT > 0 || err > tol * 2 || runGun)) {
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) { ai.strafe = -ai.strafe; ai.strafeT = a.persona.strafeGap * rand(0.7, 1.4); }
    cmd.x = Math.cos(a.yaw) * ai.strafe; cmd.z = -Math.sin(a.yaw) * ai.strafe; cmd.speed = a.w.speed;
    if ((w.id === 'shotgun' && P.dist > 7) || (w.id === 'smg' && P.dist > 12)) { cmd.x -= Math.sin(a.yaw) * 0.8; cmd.z -= Math.cos(a.yaw) * 0.8; }
    const l = Math.hypot(cmd.x, cmd.z) || 1; cmd.x /= l; cmd.z /= l;
  } else if (!visible && !holding) {
    // they ducked out of sight: carry on with the job (carefully), crosshair still on them
    const o = ai.order, goal = o?.type === 'defuse' || o?.type === 'pickup' ? g.bomb.pos : o?.pos;
    if (goal) navigate(a, g, goal, cmd, P.dist < 20 ? 'walk' : 'run');
  }
}

// ---------------------------------------------------------------- moving
// Follow a path to goal. Returns true once there.
function navigate(a, g, goal, cmd, pace = 'run', arriveR = 0.6) {
  const ai = a.ai;
  const dg = Math.hypot(goal.x - a.pos.x, goal.z - a.pos.z);
  if (dg < arriveR) { ai.arrived = true; return true; }
  ai.arrived = false;
  const key = Math.round(goal.x * 4) + ',' + Math.round(goal.z * 4);
  if (ai.goalKey !== key || !ai.path) {
    if (g.pathBudget <= 0) return false;                 // spread searches over frames
    g.pathBudget--;
    ai.path = W.findPath(a.pos, goal) || [{ x: goal.x, z: goal.z }];
    ai.pi = 0; ai.goalKey = key; ai.stuckT = 0;
  }
  let wp = ai.path[ai.pi];
  while (wp && Math.hypot(wp.x - a.pos.x, wp.z - a.pos.z) < 0.6 && ai.pi < ai.path.length - 1) wp = ai.path[++ai.pi];
  if (!wp) wp = goal;
  const dx = wp.x - a.pos.x, dz = wp.z - a.pos.z, d = Math.hypot(dx, dz) || 1;
  // don't walk into a burning molotov: wait for it to go out (unless there's no time for that)
  ai.fireWait = false;
  if (!ai.order?.urgent) for (const f of g.grenades.fires) {
    const ax = a.pos.x + (dx / d) * 1.6, az = a.pos.z + (dz / d) * 1.6;
    if (Math.hypot(ax - f.x, az - f.z) < f.r + 0.5 && Math.abs(a.pos.y - f.y) < 1.5 && Math.hypot(a.pos.x - f.x, a.pos.z - f.z) > f.r) { ai.fireWait = true; return false; }
  }
  cmd.x = dx / d; cmd.z = dz / d;
  cmd.speed = pace === 'walk' ? Math.min(a.w.speed, 2.9) : a.w.speed;
  if (dg < 1.6) cmd.speed *= 0.55;
  // stuck on something: search again, then try hopping over it
  ai.stuckT += 1 / 60;
  if (ai.stuckT > 1) {
    if (Math.hypot(a.pos.x - ai.lastX, a.pos.z - ai.lastZ) < 0.4) { ai.path = null; if (++ai.stuckN > 1) cmd.jump = true; }
    else ai.stuckN = 0;
    ai.stuckT = 0; ai.lastX = a.pos.x; ai.lastZ = a.pos.z;
  }
  return false;
}

// A point about `ahead` m further along our path (for pre-aiming what's about to come into view)
function pathAhead(a, ahead) {
  const ai = a.ai;
  if (!ai.path) return null;
  let px = a.pos.x, pz = a.pos.z, left = ahead;
  for (let i = ai.pi; i < ai.path.length; i++) {
    const q = ai.path[i], d = Math.hypot(q.x - px, q.z - pz);
    if (d >= left) { const t = left / d; return { x: px + (q.x - px) * t, z: pz + (q.z - pz) * t }; }
    left -= d; px = q.x; pz = q.z;
  }
  return { x: px, z: pz };
}

// Which corner is about to open up? The nearest spot we can't see yet but could from a few metres on.
// Spots in view with nobody there count as cleared for the whole team for a while.
function updatePreaim(a, g) {
  const ai = a.ai, spots = ai.order?.preaim, brain = g.brains?.[a.team];
  ai.preaim = null;
  if (!spots?.length || !ai.preaimSkill || !brain) return;
  const ahead = pathAhead(a, 3);
  let best = null, bd = Infinity;
  for (const s of spots) {
    const d = Math.hypot(s.x - a.pos.x, s.z - a.pos.z);
    if (d > 48 || d < 1.5 || brain.isCleared(s)) continue;
    const sy = s.y + HEAD;
    if (W.hasLOS(a.pos.x, a.eyeY, a.pos.z, s.x, sy, s.z)) { brain.clear(s); continue; }
    if (ahead && d < bd && W.hasLOS(ahead.x, W.groundAt(ahead.x, ahead.z) + EYE, ahead.z, s.x, sy, s.z)) { bd = d; best = s; }
  }
  ai.preaim = best;
}

// Where to look when there's no one to shoot
function look(a, g, dt, moving) {
  const ai = a.ai, D = ai.D, o = ai.order, now = g.time;
  const rate = D.turnRate * 0.75;
  if (ai.flash && now >= ai.flash.from && now <= ai.flash.to) {
    turnTo(a, yawTo(a.pos.x - ai.flash.x, a.pos.z - ai.flash.z), -0.2, dt, D.turnRate * 1.3, 14);
    return;
  }
  let tx = null, ty = 0, tz = 0;
  const recent = ai.lostE && now - ai.lostT < 2.5 && ai.mem.get(ai.lostE);
  if (ai.hurtFrom && now - ai.hurtFrom.t < 1.2) { tx = ai.hurtFrom.x; ty = ai.hurtFrom.y + 1.4; tz = ai.hurtFrom.z; }
  else if (recent && ai.lostE.alive) { tx = recent.x; ty = recent.y + HEAD; tz = recent.z; }
  else if (ai.preaim) { tx = ai.preaim.x; ty = ai.preaim.y + HEAD; tz = ai.preaim.z; }
  const heard = !tx && ai.heard && now - ai.heard.t < 2 && ai.heard.d < 30 && ai.heard.kind !== 'shot' ? ai.heard : null;
  if (heard && ai.arrived && o?.look) {
    // steps coming from the angle we hold: stay on it, no wandering; from elsewhere: turn to them
    const hy = yawTo(heard.x - a.pos.x, heard.z - a.pos.z), ly = yawTo(o.look.x - a.pos.x, o.look.z - a.pos.z);
    if (Math.abs(wrap(hy - ly)) < 0.8) { ai.glance = null; ai.glanceT = rand(3, 6); lookAtPoint(a, o.look.x, o.look.y, o.look.z, dt, rate, 8); return; }
    tx = heard.x; ty = heard.y + HEAD; tz = heard.z;
  } else if (heard) { tx = heard.x; ty = heard.y + HEAD; tz = heard.z; }
  if (tx !== null) { /* handled below */ }
  else if (ai.arrived && o?.look) {
    // holding an angle: crosshair on it, drifting a little; nobody stares at one doorway for a minute,
    // so every few seconds attention wanders (another angle, a check behind) and comes back
    ai.scan += dt * 0.7;
    if ((ai.glanceT = (ai.glanceT ?? rand(3, 7)) - dt) < 0) {
      if (!ai.glance) { ai.glance = { yaw: a.yaw + (Math.random() < 0.5 ? 1 : -1) * rand(0.35, 1.4), until: now + rand(0.5, 1.4) * (1.6 - D.preaim) }; }
      if (now > ai.glance.until) { ai.glance = null; ai.glanceT = rand(3, 8) * (0.5 + D.preaim); }
    }
    if (ai.glance) { turnTo(a, ai.glance.yaw, -0.05, dt, rate, 5); return; }
    const l = o.looks && o.looks.length > 1 ? o.looks[Math.floor(ai.scan / 4) % o.looks.length] : o.look;
    const sway = Math.sin(ai.scan * 1.7) * 0.06, bob = Math.sin(ai.scan * 0.9 + 1) * 0.025 * (1.5 - D.preaim);
    const dx = l.x - a.pos.x, dz = l.z - a.pos.z;
    turnTo(a, yawTo(dx, dz) + sway, Math.atan2(l.y - a.eyeY, Math.max(0.5, Math.hypot(dx, dz))) + bob, dt, rate, 6);
    return;
  } else if (moving) {
    const p = pathAhead(a, 4);
    if (p) { tx = p.x; tz = p.z; ty = W.groundAt(p.x, p.z) + HEAD; }
  }
  if (tx === null) { a.pitch += (0 - a.pitch) * Math.min(1, dt * 3); return; }
  lookAtPoint(a, tx, ty, tz, dt, rate, 7);
}

// ---------------------------------------------------------------- grenades
// Throw ai.nade = { type, target, mode, from?, sol?, deadline, onDone }: walk to the spot, stop, aim the
// lineup (re-solved from exactly where we stand), throw, hold the aim until it leaves the hand.
function throwNade(a, g, dt, cmd) {
  const ai = a.ai, D = ai.D, n = ai.nade;
  n.t = (n.t || 0) + dt;
  const done = (ok, why) => { ai.nade = null; if (a.weapon === 'nade' && !a.throwing) a.equip(a.bestWeapon()); n.onDone?.(ok, why); };
  if (a.nades[n.type] <= 0 && !a.throwing && n.phase !== 'release') return done(false, 'none');
  if (n.t > (n.deadline || 8) && n.phase !== 'release') return done(false, 'late:' + n.phase + (n.from ? ':' + Math.hypot(n.from.x - a.pos.x, n.from.z - a.pos.z).toFixed(0) + 'm' : ''));
  if (!n.phase) n.phase = 'go';
  if (n.phase === 'go') {
    // (someone may be standing on the exact spot: close enough is fine, the lineup is re-solved from here)
    if (n.from && !navigate(a, g, n.from, cmd, Math.hypot(n.from.x - a.pos.x, n.from.z - a.pos.z) < 6 ? 'walk' : 'run', n.t > 6 ? 2.5 : n.t > 3 ? 0.9 : 0.3)) { look(a, g, dt, true); cmd.aimed = true; return; }
    n.phase = 'aim'; n.aimT = 0;
  }
  cmd.stop = true; cmd.aimed = true;
  a.crouching = false;                                   // lineups are thrown standing
  if (n.phase === 'aim') {
    n.aimT += dt;
    if (a.weapon !== 'nade' || a.nadeSel !== n.type) a.equip('nade', n.type);
    if (!n.ready) {
      if (a.speed > 0.2 || a.duck > 0.02) return;
      n.ready = true;
      const here = { x: a.pos.x, y: a.pos.y, z: a.pos.z };
      let sol = n.sol;
      const off = n.from ? Math.hypot(n.from.x - here.x, n.from.z - here.z) : 99;
      if (!sol || off > 0.05) {
        // nudge the lineup for where we really stand; from further off, solve it again
        const planned = sol;
        sol = (sol && off < 0.4 && solveThrow(n.type, here, n.target, { mode: n.mode || 'ground', seed: sol, tol: 2 })) ||
              solveThrow(n.type, here, n.target, { mode: n.mode || 'ground', tol: n.mode === 'air' ? 2.2 : 3, powers: sol ? [sol.power, 1, 0.65] : [1, 0.65] }) ||
              (off < 1 ? planned : null);
      }
      if (!sol) return done(false, 'nosol');
      n.sol = sol;
      n.yaw = sol.yaw + gauss() * D.utilAcc * 0.6;
      n.pitch = sol.pitch + gauss() * D.utilAcc * 0.4;
    }
    turnTo(a, n.yaw, n.pitch, dt, D.turnRate, 12);
    const e = Math.hypot(wrap(n.yaw - a.yaw), n.pitch - a.pitch);
    if (e < 0.004 && a.speed < 0.15 && a.duck < 0.02 && a.fireCd <= 0 && !a.throwing && a.weapon === 'nade' && a.nadeSel === n.type && g.fire(a, n.sol.power)) n.phase = 'release';
    if (n.aimT > 3) return done(false, 'aim');
    return;
  }
  // release: keep the aim until it's out
  turnTo(a, n.yaw, n.pitch, dt, D.turnRate, 12);
  if (!a.throwing) { n.at = { x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw, pitch: a.pitch, eye: a.eyeY }; done(true); }
}

// ---------------------------------------------------------------- the job
function doOrder(a, g, dt, cmd) {
  const ai = a.ai, o = ai.order;
  if (!o) { look(a, g, dt, false); return; }
  let moving = false;
  switch (o.type) {
    case 'plant': {
      const there = navigate(a, g, o.pos, cmd, o.pace || 'run', 0.5);
      if (there || (o.anywhere && g.plantSite(a))) { cmd.x = cmd.z = 0; cmd.stop = true; if (a.speed < 0.5) g.tryPlant(a, dt); }
      else moving = true;
      break;
    }
    case 'defuse': {
      const b = g.bomb;
      const there = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) < 1.1 || (g.canDefuse(a) && !navigate(a, g, b.pos, cmd, 'run', 1.1) && Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) < 1.5);
      if (there) { cmd.x = cmd.z = 0; cmd.stop = true; if (g.canDefuse(a)) g.tryDefuse(a, dt); }
      else { navigate(a, g, b.pos, cmd, 'run', 1.0); moving = true; }
      break;
    }
    default: {
      const goal = o.type === 'pickup' ? g.bomb.pos : o.pos;
      if (goal) {
        const there = navigate(a, g, goal, cmd, o.pace || 'run', o.arrive || 0.6);
        moving = !there;
        if (there) {
          ai.arrivedT += dt;
          a.crouching = !!o.crouch || (o.type === 'hold' && a.persona.crouchHold && !o.low && ai.arrivedT > 1.5);
          // holding: every so often shift a step (a player doesn't stand frozen on one pixel)
          if (o.type === 'hold' && o.coverPt && (ai.shiftT -= dt) <= 0) { ai.shiftT = rand(6, 12); }
        }
      }
    }
  }
  if (moving) {
    if ((ai.preaimT -= dt) <= 0) { ai.preaimT = 0.2; updatePreaim(a, g); }
    a.crouching = false;
  } else ai.preaim = null;
  look(a, g, dt, moving);
}

// ---------------------------------------------------------------- per frame
export function updateBot(a, g, dt) {
  if (!a.alive || !a.ai) return;
  const ai = a.ai, cmd = ai.cmd;
  if (g.phase === 'freeze' || g.phase === 'over') { a.crouching = false; g.moveAgent(a, 0, 0, 0, dt); return; }
  if ((ai.senseT -= dt) <= 0) { ai.senseT = 0.1; sense(a, g); }
  cmd.x = cmd.z = 0; cmd.speed = a.w.speed; cmd.stop = false; cmd.aimed = false; cmd.jump = false;

  // weapon upkeep
  const inv = a.inv[a.weapon];
  if (inv && inv.mag === 0 && inv.reserve === 0) a.equip(a.weapon !== 'pistol' && a.inv.pistol ? 'pistol' : 'knife');
  if (a.weapon === 'knife' && !a.throwing && (a.primary || a.inv.pistol) && !a.punishedActive) a.equip(a.bestWeapon());
  if (!ai.target && a.weapon === 'pistol' && a.primary) { const p = a.inv[a.primary]; if (p.mag + p.reserve > 0) a.equip(a.primary); }

  // standing in fire (or about to be): get out first
  const fire = g.grenades.inFire(a);
  const av = ai.avoid && g.time < ai.avoid.until + 1.2 ? ai.avoid : null;
  if (fire || (av && Math.hypot(a.pos.x - av.x, a.pos.z - av.z) < av.r)) {
    const src = fire || av, dx = a.pos.x - src.x, dz = a.pos.z - src.z, d = Math.hypot(dx, dz) || 1;
    cmd.x = dx / d; cmd.z = dz / d;
    if (ai.target) fight(a, g, dt, { ...cmd, x: 0, z: 0 });
    else look(a, g, dt, true);
    a.crouching = false;
    g.moveAgent(a, cmd.x, cmd.z, a.w.speed, dt);
    return;
  }

  if (ai.target && a.blindT < 0.4) fight(a, g, dt, cmd);
  else if (ai.nade) throwNade(a, g, dt, cmd);
  else {
    if (a.scoped) a.scoped = false;
    if (ai.waitT > 0) { ai.waitT -= dt; look(a, g, dt, false); }
    else {
      // reload when it's quiet
      const quiet = !ai.lostE || g.time - ai.lostT > 2;
      if (inv && a.reloadT <= 0 && inv.reserve > 0 && ((inv.mag < a.w.mag * 0.5 && quiet) || inv.mag === 0)) g.reload(a);
      doOrder(a, g, dt, cmd);
    }
    if (a.blindT > 0.4 && !ai.order?.urgent) { cmd.x *= -0.4; cmd.z *= -0.4; }       // flashed: back off
  }

  // feet
  if (cmd.stop) {
    const sp = Math.hypot(a.vx, a.vz);
    if (sp > 0.6) g.moveAgent(a, -a.vx / sp, -a.vz / sp, 0.01, dt);        // counter-strafe
    else g.moveAgent(a, 0, 0, 0, dt);
  } else g.moveAgent(a, cmd.x, cmd.z, cmd.speed, dt, cmd.jump);
}

// Damage from someone we may not see: turn towards them
export function botHurt(a, g, attacker) {
  const ai = a.ai;
  if (!ai || !attacker || attacker.team === a.team) return;
  ai.hurtBy = attacker; ai.hurtT = g.time;
  ai.hurtFrom = { x: attacker.pos.x, y: attacker.pos.y, z: attacker.pos.z, t: g.time };
  const m = ai.mem.get(attacker) || {};
  m.x = attacker.pos.x; m.y = attacker.pos.y; m.z = attacker.pos.z; m.t = g.time;
  ai.mem.set(attacker, m);
}

// ---------------------------------------------------------------- buying
// The team brain decides the economy (pistol / eco / force / full) and each bot's utility role.
export function botBuy(a, g, econ = 'full', role = null) {
  if (a.punishedActive) return;
  const m = () => a.money;
  const has = !!a.primary;
  if (econ === 'pistol') {
    if (a.team === 'CT' && role === 'kit') g.buy(a, 'kit');
    const util = role === 'smoke' ? ['smoke', 'flash'] : role === 'flash' ? ['flash', 'flash'] : ['flash', 'he'];
    for (const n of util) if (m() >= GRENADES[n].price) g.buy(a, n);
  } else if (econ === 'eco') {
    if (m() > 3200 && Math.random() < 0.5) g.buy(a, 'flash');
  } else {
    if (!has) {
      if (role === 'awp' && m() >= 4750 + (econ === 'full' ? 1000 : 0)) g.buy(a, 'sniper');
      else if (m() >= 2700 + (econ === 'full' ? 900 : 0) || (econ === 'force' && m() >= 2700)) g.buy(a, 'rifle');
      else if (m() >= 1250 && econ === 'force') g.buy(a, Math.random() < 0.7 ? 'smg' : 'shotgun');
    }
    const util = role === 'smoke' ? ['smoke', 'flash', 'molotov'] : role === 'flash' ? ['flash', 'flash', 'he'] : role === 'molly' ? ['molotov', 'flash'] : ['flash', 'smoke', 'he'];
    // the main grenade for the role comes before armor if money is tight (a smoke wins executes)
    if (econ === 'full' && a.primary && m() < 1000 + GRENADES[util[0]].price && m() >= GRENADES[util[0]].price) g.buy(a, util[0]);
    if (a.armor < 60 && m() >= 1000) g.buy(a, 'armor');
    for (const n of util) if (m() >= GRENADES[n].price) g.buy(a, n);
    if (a.team === 'CT' && !a.hasKit && m() >= 400 && (role === 'kit' || Math.random() < 0.4)) g.buy(a, 'kit');
  }
  a.equip(a.bestWeapon());
}
