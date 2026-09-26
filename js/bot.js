import { PLAYER, WEAPONS } from './config.js';
import * as W from './world.js';

// target heights follow a crouch (hitbox head centre / body-box top)
const headH = (e) => PLAYER.headY - (PLAYER.headY - PLAYER.crouchHeadY) * (e.duck || 0);
const bodyH = (e) => PLAYER.bodyTop - (PLAYER.bodyTop - PLAYER.crouchBodyTop) * (e.duck || 0);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const HEAD_PROB = { easy: 0.12, normal: 0.3, hard: 0.5 };
const T_ = (g) => g.mapDef.tactics;

// ---------------- Economy ----------------
export function botBuy(a, g) {
  if (a.punishedActive) return;
  if (!a.primary) {
    if (a.money >= 5750 && Math.random() < 0.2) g.buy(a, 'sniper');
    else if (a.money >= 3700 || (a.money >= 2700 && Math.random() < 0.5)) g.buy(a, 'rifle');
    else if (a.money >= 2250 && g.round > 1) g.buy(a, Math.random() < 0.6 ? 'smg' : 'shotgun');
  }
  if (a.armor < 60 && a.money >= 1000 && (a.primary || a.money >= 2000)) g.buy(a, 'armor');
  if (a.team === 'CT' && !a.hasKit && a.money >= 400 && Math.random() < 0.5) g.buy(a, 'kit');
  // utility with what's left
  const prefs = a.team === 'T' ? ['smoke', 'flash', 'molotov', 'he'] : ['he', 'flash', 'molotov', 'smoke'];
  for (const n of prefs) if (a.money >= 700 && Math.random() < 0.55) g.buy(a, n);
  a.equip(a.bestWeapon());
}

// ---------------- Round setup ----------------
export function initBotRound(a, g) {
  const plan = g.tPlan, T = T_(g);
  if (g._holdsRound !== g.round) {
    const sites = T.ctHolds.filter((x) => x.site !== 'MID');
    for (let i = sites.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sites[i], sites[j]] = [sites[j], sites[i]]; }
    g._holds = [...T.ctHolds.filter((x) => x.site === 'MID'), ...sites];
    g._holdsI = 0;
    g._holdsRound = g.round;
  }
  let hold = null;
  if (a.team === 'CT') {
    const list = g._holds;
    // hand out holds from the end (sites first, mid last), then wrap for big teams
    hold = list[list.length - 1 - (g._holdsI % list.length)];
    g._holdsI++;
  }
  a.ai = {
    path: null, pi: 0, goalKey: '', stuckT: 0, lastX: a.pos.x, lastZ: a.pos.z,
    target: null, reactT: 0, errYaw: 0, errPitch: 0, aimHead: false,
    lastSeen: null, heard: null, hurtBy: null,
    burst: 0, pauseT: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0,
    thinkT: Math.random() * 0.1,
    waitT: a.team === 'T' ? rand(0, 2.5) : rand(0, 1),
    route: a.team === 'T' ? pick(T.tRoutes[plan.site]) : null,
    routeDone: false,
    sitePoint: W.randomPointInZone(plan.site),
    plantSpot: pick(T.plantSpots[plan.site]),
    hold, rotator: Math.random() < 0.5 || hold?.site === 'MID',
    postPt: null, postLook: null, scan: Math.random() * 6,
    nade: null, usedUtility: false, combatNade: false, lookAwayT: 0,
    offset: { x: rand(-1.5, 1.5), z: rand(-1.5, 1.5) },
  };
  // bigger teams share hold spots: spread the extras around the spot
  if (hold && g._holdsI > g._holds.length) a.ai.holdPos = { x: hold.pos.x + a.ai.offset.x, z: hold.pos.z + a.ai.offset.z };
}

// ---------------- Perception ----------------
function perceive(a, g) {
  const ai = a.ai, diff = g.diff;
  if (a.blindT > 0.4) { ai.target = null; return; }
  const fovCos = Math.cos((diff.fov / 2) * Math.PI / 180);
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  let best = null, bestScore = Infinity;
  for (const e of g.agents) {
    if (!e.alive || e.team === a.team) continue;
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 90) continue;
    const inFov = (dx * fx + dz * fz) / (d || 1) > fovCos || d < 4 || ai.hurtBy === e || e === ai.target;
    if (!inFov) continue;
    const vis = W.hasLOS(a.pos.x, a.eyeY, a.pos.z, e.pos.x, e.pos.y + headH(e) - 0.04, e.pos.z) ||
                W.hasLOS(a.pos.x, a.eyeY, a.pos.z, e.pos.x, e.pos.y + bodyH(e) - 0.36, e.pos.z);
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
      ai.combatNade = Math.random() < diff.nadeChance * 0.5;
    }
    ai.lastSeen = { x: best.pos.x, z: best.pos.z, t: g.time };
    best.spotted = Math.max(best.spotted, 1.5);
    if (a.team === 'CT') {
      const c = W.calloutAt(best.pos.x, best.pos.z);
      if (c?.site) { g.intel.hot = c.site; g.intel.hotT = g.time; }
    }
  } else ai.target = null;
  ai.hurtBy = null;
}

// Is a teammate standing in the line of fire before the target?
function teammateInLine(a, g, tx, tz, dist) {
  if (!g.rules.friendlyFire) return false;
  const dx = (tx - a.pos.x) / dist, dz = (tz - a.pos.z) / dist;
  for (const m of g.agents) {
    if (m === a || !m.alive || m.team !== a.team) continue;
    const mx = m.pos.x - a.pos.x, mz = m.pos.z - a.pos.z, along = mx * dx + mz * dz;
    if (along < 0 || along > dist) continue;
    if (Math.abs(mx * dz - mz * dx) < 0.75 && Math.abs(m.pos.y - a.pos.y) < 1.6) return true;
  }
  return false;
}

// ---------------- Path following ----------------
function steerTo(a, goal, g) {
  const ai = a.ai;
  const key = goal.x.toFixed(1) + ',' + goal.z.toFixed(1);
  if (ai.goalKey !== key || !ai.path) {
    // spread path searches over frames so a whole team repathing never causes a hitch
    if (g.pathBudget <= 0) return { x: 0, z: 0, dist: 99, wait: true };
    g.pathBudget--;
    ai.path = W.findPath(a.pos, goal) || [{ x: goal.x, z: goal.z }];
    ai.pi = 0; ai.goalKey = key; ai.stuckT = 0;
  }
  const dg = Math.hypot(goal.x - a.pos.x, goal.z - a.pos.z);
  if (dg < 0.7) return null;
  let wp = ai.path[ai.pi];
  while (wp && Math.hypot(wp.x - a.pos.x, wp.z - a.pos.z) < 0.7 && ai.pi < ai.path.length - 1) wp = ai.path[++ai.pi];
  if (!wp) wp = goal;
  const dx = wp.x - a.pos.x, dz = wp.z - a.pos.z, d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d, dist: dg };
}
function stuckCheck(a, dt, moving) {
  const ai = a.ai;
  ai.stuckT += dt;
  if (ai.stuckT > 1) {
    if (moving && Math.hypot(a.pos.x - ai.lastX, a.pos.z - ai.lastZ) < 0.4) ai.path = null;
    ai.stuckT = 0; ai.lastX = a.pos.x; ai.lastZ = a.pos.z;
  }
}

// Decide where the bot wants to be (no enemy visible).
function task(a, g) {
  const ai = a.ai, b = g.bomb, T = T_(g);
  const res = { goal: null, look: null, action: null };
  const timeLeft = g.phase === 'live' ? g.timer : 0;

  if (a.team === 'T') {
    if (b.state === 'dropped') {
      let nearest = null, nd = Infinity;
      for (const t of g.alive('T')) if (t.isBot) { const d = Math.hypot(t.pos.x - b.pos.x, t.pos.z - b.pos.z); if (d < nd) { nd = d; nearest = t; } }
      if (nearest === a) { res.goal = b.pos; return res; }
    }
    if (['planted', 'defused', 'exploded'].includes(b.state)) {
      if (!ai.postPt) { ai.postPt = W.randomPointInZone(b.site || g.tPlan.site); ai.postLook = pick(T.entrances[b.site || g.tPlan.site]); }
      res.goal = ai.postPt; res.look = ai.postLook; return res;
    }
    const executing = timeLeft < g.tPlan.executeAt || timeLeft < 45;
    if (!ai.routeDone && ai.route) {
      const d = Math.hypot(ai.route.x - a.pos.x, ai.route.z - a.pos.z);
      if (d < 3 && executing) ai.routeDone = true;
      else if (timeLeft < 30) ai.routeDone = true;
      else {
        res.goal = { x: ai.route.x + ai.offset.x * 0.6, z: ai.route.z + ai.offset.z * 0.6 };
        const s = g.mapDef.zones[g.tPlan.site];
        res.look = { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 };
        return res;
      }
    }
    if (b.carrier === a) {
      res.goal = ai.plantSpot;
      const site = g.plantSite(a);
      if (site && (Math.hypot(ai.plantSpot.x - a.pos.x, ai.plantSpot.z - a.pos.z) < 1.4 || timeLeft < 12)) res.action = 'plant';
      return res;
    }
    res.goal = ai.sitePoint;
    if (!ai.siteLook) ai.siteLook = pick(T.entrances[g.tPlan.site]);
    res.look = ai.siteLook;
    return res;
  }

  // CT
  if (b.state === 'planted') {
    let nearest = null, nd = Infinity;
    for (const c of g.alive('CT')) if (c.isBot) { const d = Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z); if (d < nd) { nd = d; nearest = c; } }
    if (nearest === a) {
      res.goal = b.pos;
      if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 1.4) res.action = 'defuse';
      return res;
    }
    if (!ai.postPt) { ai.postPt = W.randomPointInZone(b.site); ai.postLook = pick(T.entrances[b.site]); }
    res.goal = ai.postPt; res.look = ai.postLook;
    return res;
  }
  const hold = ai.hold;
  const committed = ai.rotateSite && g.time - ai.rotateAt < 25;
  if (!committed && g.intel.hot && g.time - g.intel.hotT < 10 && ai.rotator && hold.site !== g.intel.hot) {
    if (ai.rotateSite !== g.intel.hot) { ai.rotateSite = g.intel.hot; ai.rotateAt = g.time; ai.rotatePt = W.randomPointInZone(g.intel.hot); ai.rotateLook = pick(T.entrances[g.intel.hot]); }
  }
  if (ai.rotateSite) { res.goal = ai.rotatePt; res.look = ai.rotateLook; return res; }
  res.goal = ai.holdPos || hold.pos; res.look = hold.watch;
  return res;
}

// T bots smoke/flash the site entrances during the execute, once a spot is in throwing range
function planUtility(a, g) {
  const ai = a.ai;
  if (ai.usedUtility) return;
  const spots = T_(g).smokes?.[g.tPlan.site];
  const type = a.nades.smoke > 0 ? 'smoke' : a.nades.flash > 0 ? 'flash' : null;
  if (!spots?.length || !type) { ai.usedUtility = true; return; }
  for (const s of spots) {
    const d = Math.hypot(s.x - a.pos.x, s.z - a.pos.z);
    const y = W.groundAt(s.x, s.z);
    if (d < 8 || d > 32 || !W.hasLOS(a.pos.x, a.eyeY, a.pos.z, s.x, y + 1.2, s.z, false)) continue;
    ai.usedUtility = true;
    if (Math.random() > g.diff.nadeChance) return;
    ai.nade = { type, x: s.x, z: s.z, y: y + 0.5, t: 0 };
    return;
  }
}

// Aim a lob at a ground point. Returns false if it's out of reach.
function aimLob(a, tx, ty, tz) {
  const dx = tx - a.pos.x, dz = tz - a.pos.z, d = Math.hypot(dx, dz), h = ty - a.eyeY;
  if (d > 48) return false;
  a.yaw = Math.atan2(-dx, -dz);
  const v = 24, gr = 16;             // matches a full-power throw (grenades.js)
  // solve v^2 sin(2θ)/g ≈ d with height correction, prefer the low arc
  const disc = v ** 4 - gr * (gr * d * d + 2 * h * v * v);
  a.pitch = disc < 0 ? Math.PI / 4 : Math.atan((v * v - Math.sqrt(disc)) / (gr * d));
  a.pitch = Math.max(-0.3, Math.min(1.1, a.pitch));
  return true;
}

// ---------------- Per-frame update ----------------
export function updateBot(a, g, dt) {
  if (!a.alive) return;
  const ai = a.ai;
  if (g.phase === 'freeze' || g.phase === 'over') { a.moving = 0; g.moveAgent(a, 0, 0, 0, dt); return; }

  ai.thinkT -= dt;
  if (ai.thinkT <= 0) { ai.thinkT = 0.12; perceive(a, g); }

  const diff = g.diff;
  let wishX = 0, wishZ = 0, lookX = null, lookZ = null;

  // Standing in fire: get out first
  const fire = g.grenades.inFire(a);
  if (fire) {
    const dx = a.pos.x - fire.x, dz = a.pos.z - fire.z, d = Math.hypot(dx, dz) || 1;
    g.moveAgent(a, dx / d, dz / d, a.w.speed, dt);
    return;
  }

  // Out of ammo on primary -> pistol -> knife
  const inv = a.inv[a.weapon];
  if (inv && inv.mag === 0 && inv.reserve === 0) a.equip(a.weapon !== 'pistol' && a.inv.pistol ? 'pistol' : 'knife');
  if (a.weapon === 'knife' && !a.throwing && (a.primary || a.inv.pistol) && !a.punishedActive) a.equip(a.bestWeapon());

  // Planned grenade throw (utility)
  if (ai.nade && !ai.target) {
    const n = ai.nade;
    n.t += dt;
    if (a.nades[n.type] <= 0 || n.t > 3) { ai.nade = null; if (a.weapon === 'nade' && !a.throwing) a.equip(a.bestWeapon()); }
    else {
      if (a.weapon !== 'nade' || a.nadeSel !== n.type) a.equip('nade', n.type);
      else if (n.t > 0.45 && !a.throwing && a.fireCd <= 0 && aimLob(a, n.x, n.y, n.z) && g.fire(a, 1)) {
        if (n.type === 'flash') ai.lookAwayT = 2;
        ai.nade = null;
      }
      g.moveAgent(a, 0, 0, 0, dt);
      return;
    }
  }

  const e = ai.target;
  const w = a.w;
  if (e && e.alive && a.blindT < 0.4) {
    // ---- Combat ----
    const aimY = e.pos.y + (ai.aimHead ? headH(e) - 0.02 : bodyH(e) - 0.28);
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, dist = Math.hypot(dx, dz);
    // occasionally lob an HE / molotov at a mid-range enemy
    if (ai.combatNade && !a.throwing && dist > 6 && dist < 30 && (a.nades.he > 0 || a.nades.molotov > 0) && ai.reactT < 0.1) {
      const type = a.nades.molotov > 0 && a.team === 'CT' ? 'molotov' : a.nades.he > 0 ? 'he' : 'molotov';
      ai.nade = { type, x: e.pos.x, z: e.pos.z, y: e.pos.y + 0.3, t: 0.3 };
      ai.combatNade = false;
    }
    if (ai.nade && a.nades[ai.nade.type] > 0) {
      const n = ai.nade; n.t += dt;
      if (a.weapon !== 'nade' || a.nadeSel !== n.type) a.equip('nade', n.type);
      else if (n.t > 0.6 && !a.throwing && a.fireCd <= 0 && aimLob(a, n.x, n.y, n.z) && g.fire(a, 1)) ai.nade = null;
      if (n.t > 3) ai.nade = null;
      g.moveAgent(a, 0, 0, 0, dt);
      return;
    }
    if (a.weapon === 'nade' && !a.throwing) a.equip(a.bestWeapon());

    const wantYaw = Math.atan2(-dx, -dz) + ai.errYaw - a.recoilY * 0.7;
    const wantPitch = Math.atan2(aimY - a.eyeY, dist) + ai.errPitch - a.recoilP * 0.8;
    const decay = Math.exp(-dt * 1.7);
    ai.errYaw *= decay; ai.errPitch *= decay;
    const dyaw = wrap(wantYaw - a.yaw), dp = wantPitch - a.pitch;
    const maxTurn = diff.turnRate * dt;
    a.yaw = wrap(a.yaw + Math.max(-maxTurn, Math.min(maxTurn, dyaw * Math.min(1, dt * 12))));
    a.pitch += Math.max(-maxTurn, Math.min(maxTurn, dp * Math.min(1, dt * 12)));

    if (w.melee) {
      // knife: rush in and slash
      const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
      ai.reactT -= dt;
      if (dist < 1.8 && ai.reactT <= 0) g.fire(a);
      g.moveAgent(a, fx, fz, w.speed, dt);
      return;
    }
    if (w.scoped && !a.scoped && a.reloadT <= 0) a.scoped = true;
    ai.reactT -= dt;
    const errNow = Math.abs(wrap(Math.atan2(-dx, -dz) - a.yaw - a.recoilY)) + Math.abs(Math.atan2(aimY - a.eyeY, dist) - a.pitch - a.recoilP);
    const tol = Math.atan(0.42 / Math.max(dist, 1)) + 0.012;
    let shooting = false;
    const blocked = teammateInLine(a, g, e.pos.x, e.pos.z, dist);
    if (ai.reactT <= 0 && !blocked) {
      if (ai.pauseT > 0) ai.pauseT -= dt;
      else if (errNow < tol * 1.6 && a.moving < 0.35 + (w.id === 'smg' || w.id === 'shotgun' ? 0.5 : 0)) {
        shooting = true;
        // some bots drop into a crouch to spray at range (steadier aim), like players do
        if (ai.crouchRoll === undefined) ai.crouchRoll = Math.random();
        a.crouching = dist > 14 && w.id !== 'sniper' && w.id !== 'shotgun' && ai.crouchRoll < 0.45;
        if (g.fire(a)) {
          if (w.auto) {
            if (--ai.burst <= 0) {
              ai.pauseT = rand(0.15, 0.35) + (dist > 30 ? 0.25 : 0);
              ai.burst = Math.max(1, Math.round(rand(diff.burst[0], diff.burst[1]) * (dist > 30 ? 0.5 : 1)));
            }
          } else a.fireCd += rand(0.05, 0.3) + (w.id === 'sniper' ? 0.2 : 0);
        } else if (a.reloadT > 0) shooting = false;
      }
    }
    let speed = w.speed;
    if (!shooting && w.id !== 'sniper') {
      ai.strafeT -= dt;
      if (ai.strafeT <= 0 || blocked) { ai.strafe = blocked && ai.strafeT > 0 ? ai.strafe : -ai.strafe; ai.strafeT = rand(0.3, 0.8); }
      const rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw), fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
      wishX = rx * ai.strafe; wishZ = rz * ai.strafe;
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
  a.crouching = false; ai.crouchRoll = undefined;       // stand back up once the fight is over
  if (a.weapon === 'nade' && !a.throwing && !ai.nade) a.equip(a.bestWeapon());
  if (inv && inv.mag < w.mag * 0.5 && inv.reserve > 0 && a.reloadT <= 0) g.reload(a);
  if (ai.waitT > 0) { ai.waitT -= dt; g.moveAgent(a, 0, 0, 0, dt); return; }

  ai.utilT = (ai.utilT || 0) - dt;
  if (ai.utilT <= 0 && !ai.nade && !a.throwing) {
    ai.utilT = 0.5;
    if (a.team === 'T' && ai.routeDone && g.bomb.state !== 'planted') planUtility(a, g);
    // enemy just ducked behind cover: flush them out with an HE / molotov
    const ls = ai.lastSeen;
    if (!ai.nade && ls && g.time - ls.t < 2.5 && g.time - ls.t > 0.4 && (a.nades.he > 0 || a.nades.molotov > 0) && !ai.flushed) {
      const d = Math.hypot(ls.x - a.pos.x, ls.z - a.pos.z);
      ai.flushed = true;
      if (d > 6 && d < 28 && Math.random() < g.diff.nadeChance * 0.6) {
        const type = a.nades.molotov > 0 && (a.team === 'CT' || Math.random() < 0.5) ? 'molotov' : a.nades.he > 0 ? 'he' : 'molotov';
        ai.nade = { type, x: ls.x, z: ls.z, y: W.groundAt(ls.x, ls.z) + 0.3, t: 0.2 };
      }
    }
  }
  if (ai.lastSeen && g.time - ai.lastSeen.t < 0.4) ai.flushed = false;

  let speed = w.speed;
  const t = task(a, g);
  let arrived = true;
  if (t.goal) {
    const s = steerTo(a, t.goal, g);
    if (s) {
      arrived = false;
      wishX = s.x; wishZ = s.z;
      if (s.dist < 2) speed *= 0.6;
    }
  }
  stuckCheck(a, dt, !arrived);
  if (a.blindT > 0.4) { wishX = -wishX * 0.5; wishZ = -wishZ * 0.5; }   // blinded: back off
  if (arrived && t.action === 'plant') { g.tryPlant(a, dt); wishX = wishZ = 0; }
  if (t.action === 'defuse' && g.canDefuse(a)) { g.tryDefuse(a, dt); wishX = wishZ = 0; }

  const now = g.time;
  if (ai.lookAwayT > 0) { ai.lookAwayT -= dt; }
  else if (ai.lastSeen && now - ai.lastSeen.t < 3) { lookX = ai.lastSeen.x; lookZ = ai.lastSeen.z; }
  else if (ai.heard && now - ai.heard.t < 2.5) { lookX = ai.heard.x; lookZ = ai.heard.z; }
  else if (arrived && t.look) { lookX = t.look.x; lookZ = t.look.z; }
  let wantYaw;
  if (ai.lookAwayT > 0) wantYaw = a.yaw + Math.PI * dt;           // turn away from our own flash
  else if (lookX !== null) wantYaw = Math.atan2(-(lookX - a.pos.x), -(lookZ - a.pos.z));
  else if (wishX || wishZ) wantYaw = Math.atan2(-wishX, -wishZ);
  else wantYaw = a.yaw;
  if (arrived && lookX !== null && !(ai.lastSeen && now - ai.lastSeen.t < 3)) {
    ai.scan += dt * 0.8;
    wantYaw += Math.sin(ai.scan) * 0.35;
  }
  const dyaw = wrap(wantYaw - a.yaw);
  const maxTurn = diff.turnRate * 0.8 * dt;
  a.yaw = wrap(a.yaw + Math.max(-maxTurn, Math.min(maxTurn, dyaw * Math.min(1, dt * 6))));
  a.pitch += (0 - a.pitch) * Math.min(1, dt * 4);
  g.moveAgent(a, wishX, wishZ, speed, dt);
}
