import { RULES, PLAYER } from './config.js';
import * as MAP from './map.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const HEAD_PROB = { easy: 0.12, normal: 0.3, hard: 0.5 };

// ---------------- Economy ----------------
export function botBuy(a, g) {
  if (!a.primary) {
    if (a.money >= 5750 && Math.random() < 0.2) g.buy(a, 'sniper');
    else if (a.money >= 3700 || (a.money >= 2700 && Math.random() < 0.5)) g.buy(a, 'rifle');
    else if (a.money >= 2250 && g.round > 1) g.buy(a, Math.random() < 0.6 ? 'smg' : 'shotgun');
  }
  if (a.armor < 60 && a.money >= 1000 && (a.primary || a.money >= 2000)) g.buy(a, 'armor');
  if (a.team === 'CT' && !a.hasKit && a.money >= 400 && Math.random() < 0.5) g.buy(a, 'kit');
  a.equip(a.primary || 'pistol');
}

// ---------------- Round setup ----------------
export function initBotRound(a, g) {
  const plan = g.tPlan;
  if (g._holdsRound !== g.round) {
    const h = MAP.TACTICS.ctHolds;
    const sites = h.filter((x) => x.site !== 'MID');
    for (let i = sites.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sites[i], sites[j]] = [sites[j], sites[i]]; }
    g._holds = [...h.filter((x) => x.site === 'MID'), ...sites];
    g._holdsRound = g.round;
  }
  a.ai = {
    path: null, pi: 0, goalKey: '', stuckT: 0, lastX: a.pos.x, lastZ: a.pos.z,
    target: null, reactT: 0, errYaw: 0, errPitch: 0, aimHead: false,
    lastSeen: null, heard: null, hurtBy: null,
    burst: 0, pauseT: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0,
    thinkT: Math.random() * 0.1,
    waitT: a.team === 'T' ? rand(0, 2.5) : rand(0, 1),
    route: a.team === 'T' ? pick(MAP.TACTICS.tRoutes[plan.site]) : null,
    routeDone: false,
    sitePoint: MAP.randomPointInZone(plan.site),
    plantSpot: pick(MAP.TACTICS.plantSpots[plan.site]),
    hold: a.team === 'CT' ? (g._holds.pop() || MAP.TACTICS.ctHolds[0]) : null,
    rotator: Math.random() < 0.5,
    postPt: null, postLook: null, scan: Math.random() * 6,
  };
  if (a.ai.hold?.site === 'MID') a.ai.rotator = true;
}

// ---------------- Perception ----------------
function perceive(a, g) {
  const ai = a.ai, diff = g.diff;
  const fovCos = Math.cos((diff.fov / 2) * Math.PI / 180);
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  let best = null, bestScore = Infinity;
  for (const e of g.agents) {
    if (!e.alive || e.team === a.team) continue;
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 90) continue;
    const inFov = (dx * fx + dz * fz) / (d || 1) > fovCos || d < 4 || ai.hurtBy === e || e === ai.target;
    if (!inFov) continue;
    const vis = MAP.hasLOS(a.pos.x, a.eyeY, a.pos.z, e.pos.x, e.pos.y + 1.62, e.pos.z) ||
                MAP.hasLOS(a.pos.x, a.eyeY, a.pos.z, e.pos.x, e.pos.y + 1.1, e.pos.z);
    if (!vis) continue;
    const score = d * (e === ai.target ? 0.6 : 1);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  if (best) {
    if (best !== ai.target) {
      const d = Math.hypot(best.pos.x - a.pos.x, best.pos.z - a.pos.z);
      ai.target = best;
      ai.reactT = rand(diff.reaction[0], diff.reaction[1]) + (d > 40 ? 0.15 : 0);
      const e = diff.aimError * (0.6 + Math.random());
      ai.errYaw = (Math.random() < 0.5 ? -1 : 1) * e;
      ai.errPitch = (Math.random() - 0.3) * e;
      ai.aimHead = Math.random() < (HEAD_PROB[g.opts.difficulty] ?? 0.3);
      ai.burst = Math.round(rand(diff.burst[0], diff.burst[1]));
    }
    ai.lastSeen = { x: best.pos.x, z: best.pos.z, t: g.time };
    best.spotted = Math.max(best.spotted, 1.5);
    if (a.team === 'CT' && best.pos.z < 30) {
      const hot = best.pos.x > 44 ? 'A' : best.pos.x < 36 ? 'B' : null;
      if (hot) { g.intel.hot = hot; g.intel.hotT = g.time; }
    }
  } else {
    ai.target = null;
  }
  ai.hurtBy = null;
}

// ---------------- Path following ----------------
function steerTo(a, goal, dt, g) {
  const ai = a.ai;
  const key = goal.x.toFixed(1) + ',' + goal.z.toFixed(1);
  if (ai.goalKey !== key || !ai.path) {
    ai.path = MAP.findPath(a.pos, goal); ai.pi = 0; ai.goalKey = key; ai.stuckT = 0;
  }
  const dg = Math.hypot(goal.x - a.pos.x, goal.z - a.pos.z);
  if (dg < 0.7) return null;
  let wp = ai.path[ai.pi];
  while (wp && Math.hypot(wp.x - a.pos.x, wp.z - a.pos.z) < 0.7 && ai.pi < ai.path.length - 1) wp = ai.path[++ai.pi];
  if (!wp) wp = goal;
  const dx = wp.x - a.pos.x, dz = wp.z - a.pos.z, d = Math.hypot(dx, dz) || 1;
  // stuck detection -> repath
  ai.stuckT += dt;
  if (ai.stuckT > 1) {
    if (Math.hypot(a.pos.x - ai.lastX, a.pos.z - ai.lastZ) < 0.4) ai.path = null;
    ai.stuckT = 0; ai.lastX = a.pos.x; ai.lastZ = a.pos.z;
  }
  return { x: dx / d, z: dz / d, dist: dg };
}

// Decide where the bot wants to be (no enemy visible).
function task(a, g) {
  const ai = a.ai, b = g.bomb;
  const res = { goal: null, look: null, action: null };
  const timeLeft = g.phase === 'live' ? g.timer : 0;

  if (a.team === 'T') {
    if (b.state === 'dropped') {
      let nearest = null, nd = Infinity;
      for (const t of g.alive('T')) if (t.isBot) { const d = Math.hypot(t.pos.x - b.pos.x, t.pos.z - b.pos.z); if (d < nd) { nd = d; nearest = t; } }
      if (nearest === a) { res.goal = b.pos; return res; }
    }
    if (b.state === 'planted' || b.state === 'defused' || b.state === 'exploded') {
      if (!ai.postPt) {
        ai.postPt = MAP.randomPointInZone(b.site || g.tPlan.site);
        ai.postLook = pick(MAP.TACTICS.entrances[b.site || g.tPlan.site]);
      }
      res.goal = ai.postPt; res.look = ai.postLook; return res;
    }
    const executing = timeLeft < g.tPlan.executeAt || timeLeft < 45;
    if (!ai.routeDone && ai.route) {
      const d = Math.hypot(ai.route.x - a.pos.x, ai.route.z - a.pos.z);
      if (d < 3 && executing) ai.routeDone = true;
      else if (timeLeft < 30) ai.routeDone = true;
      else {
        res.goal = ai.route;
        const s = MAP.ZONES[g.tPlan.site];
        res.look = MAP.c2w((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2);
        return res;
      }
    }
    if (b.carrier === a) {
      res.goal = ai.plantSpot;
      if (g.plantSite(a) && Math.hypot(ai.plantSpot.x - a.pos.x, ai.plantSpot.z - a.pos.z) < 1.4) res.action = 'plant';
      else if (g.plantSite(a) && timeLeft < 12) res.action = 'plant';
      return res;
    }
    res.goal = ai.sitePoint;
    if (!ai.siteLook) ai.siteLook = pick(MAP.TACTICS.entrances[g.tPlan.site]);
    res.look = ai.siteLook;
    return res;
  }

  // CT
  if (b.state === 'planted') {
    let nearest = null, nd = Infinity;
    for (const c of g.alive('CT')) if (c.isBot) { const d = Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z); if (d < nd) { nd = d; nearest = c; } }
    const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    if (nearest === a) {
      res.goal = b.pos;
      if (d < 1.4) res.action = 'defuse';
      return res;
    }
    if (!ai.postPt) { ai.postPt = MAP.randomPointInZone(b.site); ai.postLook = pick(MAP.TACTICS.entrances[b.site]); }
    res.goal = ai.postPt; res.look = ai.postLook;
    return res;
  }
  const hold = ai.hold;
  // Rotate on a callout, but commit to it for a while so bots don't ping-pong between sites
  const committed = ai.rotateSite && g.time - ai.rotateAt < 25;
  if (!committed && g.intel.hot && g.time - g.intel.hotT < 10 && ai.rotator && hold.site !== g.intel.hot) {
    if (ai.rotateSite !== g.intel.hot) { ai.rotateSite = g.intel.hot; ai.rotateAt = g.time; ai.rotatePt = MAP.randomPointInZone(g.intel.hot); ai.rotateLook = null; }
    res.goal = ai.rotatePt; res.look = pick(MAP.TACTICS.entrances[g.intel.hot]);
    ai.rotateLook = ai.rotateLook || res.look; res.look = ai.rotateLook;
    return res;
  }
  if (ai.rotateSite) { res.goal = ai.rotatePt; res.look = ai.rotateLook; return res; }
  res.goal = hold.pos; res.look = hold.watch;
  return res;
}

// ---------------- Per-frame update ----------------
export function updateBot(a, g, dt) {
  if (!a.alive) return;
  const ai = a.ai;
  if (g.phase === 'freeze' || g.phase === 'over') { a.moving = 0; g.moveAgent(a, 0, 0, 0, dt); return; }

  ai.thinkT -= dt;
  if (ai.thinkT <= 0) { ai.thinkT = 0.12; perceive(a, g); }

  const w = a.w, diff = g.diff;
  let wishX = 0, wishZ = 0, lookX = null, lookZ = null, lookY = null;
  let speed = w.speed;

  // Out of ammo on primary -> pistol
  const inv = a.inv[a.weapon];
  if (inv && inv.mag === 0 && inv.reserve === 0 && a.weapon !== 'pistol') a.equip('pistol');

  const e = ai.target;
  if (e && e.alive) {
    // ---- Combat ----
    const aimY = e.pos.y + (ai.aimHead ? 1.64 : 1.18);
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, dist = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dx, -dz) + ai.errYaw - (a.recoilY || 0) * 0.7;
    const wantPitch = Math.atan2(aimY - a.eyeY, dist) + ai.errPitch - (a.recoilP || 0) * 0.8;
    const decay = Math.exp(-dt * 1.7);
    ai.errYaw *= decay; ai.errPitch *= decay;
    const dy = wrap(wantYaw - a.yaw), dp = wantPitch - a.pitch;
    const maxTurn = diff.turnRate * dt;
    a.yaw = wrap(a.yaw + Math.max(-maxTurn, Math.min(maxTurn, dy * Math.min(1, dt * 12))));
    a.pitch += Math.max(-maxTurn, Math.min(maxTurn, dp * Math.min(1, dt * 12)));

    if (w.scoped && !a.scoped && a.reloadT <= 0) a.scoped = true;
    ai.reactT -= dt;
    const errNow = Math.abs(wrap(Math.atan2(-dx, -dz) - a.yaw - (a.recoilY || 0))) + Math.abs(Math.atan2(aimY - a.eyeY, dist) - a.pitch - (a.recoilP || 0));
    const tol = Math.atan(0.42 / Math.max(dist, 1)) + 0.012;
    let shooting = false;
    if (ai.reactT <= 0) {
      if (ai.pauseT > 0) ai.pauseT -= dt;
      else if (errNow < tol * 1.6 && a.moving < 0.35 + (w.id === 'smg' || w.id === 'shotgun' ? 0.5 : 0)) {
        shooting = true;
        if (g.fire(a)) {
          if (w.auto) {
            if (--ai.burst <= 0) {
              ai.pauseT = rand(0.15, 0.35) + (dist > 30 ? 0.25 : 0);
              ai.burst = Math.max(1, Math.round(rand(diff.burst[0], diff.burst[1]) * (dist > 30 ? 0.5 : 1)));
            }
          } else {
            a.fireCd += rand(0.05, 0.3) + (w.id === 'sniper' ? 0.2 : 0);
          }
        } else if (a.reloadT > 0) shooting = false;
      }
    }
    // Movement: strafe while not shooting, stop to shoot accurately
    if (!shooting && w.id !== 'sniper') {
      ai.strafeT -= dt;
      if (ai.strafeT <= 0) { ai.strafe = -ai.strafe; ai.strafeT = rand(0.3, 0.8); }
      const rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
      wishX = rx * ai.strafe; wishZ = rz * ai.strafe;
      // shotguns/smgs push in, everyone backs off while reloading
      const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
      if (a.reloadT > 0) { wishX -= fx * 0.6; wishZ -= fz * 0.6; }
      else if ((w.id === 'shotgun' && dist > 8) || (w.id === 'smg' && dist > 20)) { wishX += fx; wishZ += fz; }
      const l = Math.hypot(wishX, wishZ) || 1; wishX /= l; wishZ /= l;
      speed *= 0.85;
    }
    g.moveAgent(a, wishX, wishZ, a.scoped && w.scopedSpeed ? w.scopedSpeed : speed, dt);
    return;
  }

  // ---- No enemy in sight ----
  if (a.scoped) a.scoped = false;
  if (inv && inv.mag < a.w.mag * 0.5 && inv.reserve > 0 && a.reloadT <= 0) g.reload(a);
  if (ai.waitT > 0) { ai.waitT -= dt; g.moveAgent(a, 0, 0, 0, dt); return; }

  const t = task(a, g);
  let arrived = true;
  if (t.goal) {
    const s = steerTo(a, t.goal, dt, g);
    if (s) {
      arrived = false;
      wishX = s.x; wishZ = s.z;
      // slow down near the destination for tidier stops
      if (s.dist < 2) speed *= 0.6;
    }
  }
  if (arrived && t.action === 'plant') { g.tryPlant(a, dt); wishX = wishZ = 0; }
  if (arrived && t.action === 'defuse') { g.tryDefuse(a, dt); wishX = wishZ = 0; }
  // also plant/defuse when within range even if not perfectly on the goal
  if (!arrived && t.action === 'defuse' && g.canDefuse(a)) { g.tryDefuse(a, dt); wishX = wishZ = 0; }

  // What to look at
  const now = g.time;
  if (ai.lastSeen && now - ai.lastSeen.t < 3) { lookX = ai.lastSeen.x; lookZ = ai.lastSeen.z; lookY = 1.4; }
  else if (ai.heard && now - ai.heard.t < 2.5) { lookX = ai.heard.x; lookZ = ai.heard.z; lookY = 1.4; }
  else if (arrived && t.look) { lookX = t.look.x; lookZ = t.look.z; lookY = 1.5; }
  let wantYaw;
  if (lookX !== null) wantYaw = Math.atan2(-(lookX - a.pos.x), -(lookZ - a.pos.z));
  else if (wishX || wishZ) wantYaw = Math.atan2(-wishX, -wishZ);
  else wantYaw = a.yaw;
  if (arrived && lookX !== null && !(ai.lastSeen && now - ai.lastSeen.t < 3)) {
    ai.scan += dt * 0.8;
    wantYaw += Math.sin(ai.scan) * 0.35; // idle scanning
  }
  const dy = wrap(wantYaw - a.yaw);
  const maxTurn = diff.turnRate * 0.8 * dt;
  a.yaw = wrap(a.yaw + Math.max(-maxTurn, Math.min(maxTurn, dy * Math.min(1, dt * 6))));
  a.pitch += (0 - a.pitch) * Math.min(1, dt * 4);

  g.moveAgent(a, wishX, wishZ, speed, dt);
}
