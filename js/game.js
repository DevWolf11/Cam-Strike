import * as THREE from '../lib/three.module.min.js';
import { RULES, ECON, WEAPONS, GRENADES, BOT_NAMES, PLAYER, DIFFICULTY, MAX_NADES } from './config.js';
import * as W from './world.js';
import { getMap } from './maps/index.js';
import { buildMap } from './mapmesh.js';
import { Agent } from './agent.js';
import { Effects } from './effects.js';
import { Grenades } from './grenades.js';
import * as SFX from './audio.js';
import { initBotRound, updateBot, botBuy } from './bot.js';
import { weaponMesh, SKINS, KNIVES } from './weapons3d.js';
import { OUTFITS } from './character.js';

const _v = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const other = (t) => (t === 'T' ? 'CT' : 'T');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function aimDir(yaw, pitch, out = new THREE.Vector3()) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : Infinity;
}
function rayAABB(o, d, minX, minY, minZ, maxX, maxY, maxZ) {
  let t0 = 0, t1 = Infinity;
  for (const [oo, dd, mn, mx] of [[o.x, d.x, minX, maxX], [o.y, d.y, minY, maxY], [o.z, d.z, minZ, maxZ]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < mn || oo > mx) return Infinity; continue; }
    let a = (mn - oo) / dd, b = (mx - oo) / dd;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  return t0 > 0 ? t0 : Infinity;
}
function randomLoadout() {
  const skins = {};
  for (const id of ['pistol', 'smg', 'shotgun', 'rifle', 'sniper']) skins[id] = Math.random() < 0.55 ? pick(SKINS).id : 'factory';
  return { skins, knifeType: pick(KNIVES).id, knifeSkin: Math.random() < 0.6 ? pick(SKINS).id : 'factory' };
}

export class Game {
  // opts: { team, difficulty, mode, map, tCount, ctCount, roundsToWin, startMoney, friendlyFire, roundTime, loadout, outfit, quality }
  constructor(scene, camera, opts) {
    this.scene = scene; this.camera = camera; this.opts = opts;
    this.rules = { ...RULES };
    const custom = opts.mode === 'custom';
    if (custom) {
      for (const k of ['roundsToWin', 'startMoney', 'friendlyFire', 'roundTime']) if (opts[k] !== undefined) this.rules[k] = opts[k];
    }
    this.counts = custom ? { T: opts.tCount, CT: opts.ctCount } : { T: RULES.playersPerTeam, CT: RULES.playersPerTeam };
    this.diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
    this.mapDef = getMap(opts.map || 'dust2');
    W.setMap(this.mapDef);
    this.mapObjs = buildMap(scene, this.mapDef, opts.quality);
    this.effects = new Effects(scene);
    this.grenades = new Grenades(this);
    this.listeners = [];
    this.time = 0;
    this.agents = [];
    const money = this.rules.startMoney;
    this.player = new Agent(scene, 'You', opts.team, false, { outfit: opts.outfit?.[opts.team] ?? 0, loadout: opts.loadout || {}, money });
    this.agents.push(this.player);
    for (const team of ['T', 'CT']) {
      const names = shuffle([...BOT_NAMES[team]]);
      const n = this.counts[team] - (team === opts.team ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const name = i < names.length ? names[i] : `${names[i % names.length]} ${Math.floor(i / names.length) + 1}`;
        this.agents.push(new Agent(scene, name, team, true, { outfit: Math.floor(Math.random() * OUTFITS[team].length), loadout: randomLoadout(), money }));
      }
    }
    this.score = { T: 0, CT: 0 };
    this.lossStreak = { T: 0, CT: 0 };
    this.round = 0; this.phase = 'freeze'; this.timer = 0; this.matchWinner = null;

    this.bombMesh = weaponMesh('bomb');
    this.bombLed = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    this.bombLed.position.set(0.08, 0.07, 0.04); this.bombMesh.add(this.bombLed);
    this.bombMesh.visible = false; scene.add(this.bombMesh);
    this.bomb = {};
    this.startRound();
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data) { for (const f of this.listeners) f(type, data); }
  alive(team) { return this.agents.filter((a) => a.alive && a.team === team); }
  teamOf(team) { return this.agents.filter((a) => a.team === team); }

  // ---------------- Round flow ----------------
  startRound() {
    this.round++;
    this.phase = 'freeze';
    this.timer = this.rules.freezeTime;
    this.grenades.clear();
    const zc = (k) => { const Z = this.mapDef.zones[k]; return { x: (Z.x0 + Z.x1) / 2, z: (Z.z0 + Z.z1) / 2 }; };
    for (const team of ['T', 'CT']) {
      const members = this.teamOf(team);
      const spawns = shuffle(W.spawnPoints(team, members.length));
      const me = zc(team), them = zc(other(team));
      const yaw = Math.atan2(-(them.x - me.x), -(them.z - me.z));
      members.forEach((a, i) => {
        const s = spawns[i % spawns.length];
        a.resetForRound({ x: s.x, y: W.groundAt(s.x, s.z), z: s.z }, yaw);
      });
    }
    this.player.char.visible = false;
    const ts = this.alive('T');
    this.bomb = {
      state: ts.length ? 'carried' : 'none', carrier: ts.length ? pick(ts) : null, pos: new THREE.Vector3(), site: null,
      timer: 0, plantP: 0, planter: null, plantTouched: false, defuseP: 0, defuser: null, defuseTouched: false, beepT: 0,
    };
    this.bombMesh.visible = false;
    this.planted = false;
    this.tPlan = { site: Math.random() < 0.5 ? 'A' : 'B', executeAt: this.rules.roundTime - (12 + Math.random() * 18) };
    this.intel = { hot: null, hotT: -99 };
    this._holdsRound = -1;
    for (const a of this.agents) if (a.isBot) { botBuy(a, this); initBotRound(a, this); }
    this.emit('roundStart', { round: this.round });
    SFX.roundStart();
  }

  endRound(winner, reason, how = 'elim') {
    if (this.phase === 'end' || this.phase === 'over') return;
    this.phase = 'end';
    this.timer = this.rules.roundEndDelay;
    this.score[winner]++;
    const loser = other(winner);
    const lossPay = Math.min(ECON.lossBase + ECON.lossStep * this.lossStreak[loser], ECON.lossMax);
    this.lossStreak[loser] = Math.min(this.lossStreak[loser] + 1, 4);
    this.lossStreak[winner] = Math.max(0, this.lossStreak[winner] - 1);
    for (const a of this.agents) {
      if (a.team === winner) this.addMoney(a, (how === 'bomb' || how === 'defuse') ? ECON.winBombReward : ECON.winReward);
      else this.addMoney(a, lossPay + (a.team === 'T' && this.planted ? ECON.plantBonus : 0));
    }
    if (this.score[winner] >= this.rules.roundsToWin) this.matchWinner = winner;
    this.emit('roundEnd', { winner, reason });
    SFX.roundEnd(winner === this.player.team);
  }

  addMoney(a, amt) {
    if (a.punishedActive) return;
    a.money = Math.max(0, Math.min(ECON.maxMoney, a.money + amt));
  }

  get canBuy() { return this.canBuyAgent(this.player); }
  canBuyAgent(a) {
    if (!a.alive || a.punishedActive || !W.inZone(a.team, a.pos.x, a.pos.z)) return false;
    return this.phase === 'freeze' || (this.phase === 'live' && this.rules.roundTime - this.timer < this.rules.buyTimeAfterFreeze);
  }

  buy(agent, item) {
    if (agent.punishedActive) return false;
    if (item === 'armor') {
      if ((agent.armor >= 100 && agent.helmet) || agent.money < ECON.armorPrice) return false;
      agent.money -= ECON.armorPrice; agent.armor = 100; agent.helmet = true; return true;
    }
    if (item === 'kit') {
      if (agent.team !== 'CT' || agent.hasKit || agent.money < ECON.kitPrice) return false;
      agent.money -= ECON.kitPrice; agent.hasKit = true; return true;
    }
    const n = GRENADES[item];
    if (n) {
      if (agent.nades[item] >= n.max || agent.nadeCount >= MAX_NADES || agent.money < n.price) return false;
      agent.money -= n.price; agent.nades[item]++;
      if (agent.weapon === 'nade') agent.setWeaponMesh();
      return true;
    }
    const w = WEAPONS[item];
    if (!w || w.melee || agent.money < w.price) return false;
    if (agent.inv[item] && agent.inv[item].reserve >= w.reserve) { agent.equip(item); return false; }
    agent.money -= w.price;
    agent.give(item);
    return true;
  }

  // ---------------- Movement ----------------
  moveAgent(a, wishX, wishZ, maxSpeed, dt, jump = false) {
    const tvx = wishX * maxSpeed, tvz = wishZ * maxSpeed;
    const accel = a.onGround ? ((wishX || wishZ) ? 38 : 26) : 5;
    const dvx = tvx - a.vx, dvz = tvz - a.vz, dl = Math.hypot(dvx, dvz), mx = accel * dt;
    if (dl > mx) { a.vx += dvx / dl * mx; a.vz += dvz / dl * mx; } else { a.vx = tvx; a.vz = tvz; }
    const ox = a.pos.x, oz = a.pos.z;
    a.pos.x += a.vx * dt; a.pos.z += a.vz * dt;
    W.resolveCircle(a.pos, PLAYER.radius, a.pos.y);
    if (dt > 0) { a.vx = (a.pos.x - ox) / dt; a.vz = (a.pos.z - oz) / dt; }
    const ground = W.groundAt(a.pos.x, a.pos.z, PLAYER.radius * 0.7);
    if (jump && a.onGround) { a.vy = PLAYER.jumpSpeed; a.onGround = false; }
    if (a.onGround) {
      if (ground >= a.pos.y - 0.001) a.pos.y = ground;                 // step up / flat
      else if (a.pos.y - ground <= 0.5) a.pos.y = ground;               // walk down stairs
      else { a.onGround = false; a.vy = 0; }                            // walked off a ledge
    }
    if (!a.onGround) {
      a.vy -= PLAYER.gravity * dt;
      a.pos.y += a.vy * dt;
      const cx = W.cellOf(a.pos.x), cz = W.cellOf(a.pos.z);
      const rf = W.inBounds(cx, cz) ? W.world.roof[cz * W.world.w + cx] : 0;
      if (rf > 0 && a.pos.y + 1.8 > rf && a.vy > 0) { a.vy = 0; a.pos.y = rf - 1.8; }
      if (a.pos.y <= ground) {
        const impact = -a.vy;
        a.pos.y = ground; a.vy = 0; a.onGround = true;
        if (impact > 10.5) this.applyDamage(a, null, 'fall', (impact - 10.5) * 11, false, null);
      }
    }
    const sp = Math.hypot(a.vx, a.vz);
    a.speed = sp;
    a.moving = Math.max(0, Math.min(1, (sp - 1.4) / 3.6));
    a.stepAcc += sp * dt;
    if (a.stepAcc > 2.3) {
      a.stepAcc = 0;
      if (sp > 3.2 && a.onGround) {
        if (a === this.player) SFX.step(0.05);
        else { const s = this.soundFrom(a.pos); if (s.dist < 18) SFX.step(0.18 / (1 + s.dist * 0.25), s.pan); }
        this.noise(a, 12);
      }
    }
  }

  soundFrom(p) {
    const c = this.camera;
    const dx = p.x - c.position.x, dz = p.z - c.position.z, dist = Math.hypot(dx, dz);
    const yaw = c.rotation.y, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const pan = dist > 0.1 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) : 0;
    return { dist, pan };
  }

  noise(a, radius) {
    for (const b of this.agents) {
      if (!b.isBot || !b.alive || b.team === a.team) continue;
      if (Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) < radius) b.ai.heard = { x: a.pos.x, z: a.pos.z, t: this.time };
    }
  }

  // ---------------- Weapons ----------------
  spreadOf(a) {
    const w = a.w;
    if (w.melee || w.kind === 'nade') return 0.02;
    let s = (w.scoped && a.scoped) ? w.scopedSpread : w.spread;
    s += a.moving * w.moveSpread;
    if (!a.onGround) s += 0.1;
    s += Math.min(a.sprayIdx, 12) * w.spraySpread;
    return s;
  }

  reload(a) {
    const inv = a.inv[a.weapon], w = a.w;
    if (!inv || a.reloadT > 0 || inv.mag >= w.mag || inv.reserve <= 0) return false;
    a.reloadT = w.reload; a.scoped = false;
    if (a === this.player) { SFX.reload(); this.emit('reload'); }
    return true;
  }
  finishReload(a) {
    const inv = a.inv[a.weapon], w = a.w;
    if (!inv) return;
    const n = Math.min(w.mag - inv.mag, inv.reserve);
    inv.mag += n; inv.reserve -= n;
  }

  muzzlePos(a, out) {
    if (a === this.player && this.muzzleOverride) return out.copy(this.muzzleOverride);
    aimDir(a.yaw, a.pitch, _d);
    return out.copy(a.char.J.haR).addScaledVector(_d, (a.w.len || 0.3) * 0.95);
  }

  busy(a) { return (this.bomb.planter === a && this.bomb.plantP > 0) || (this.bomb.defuser === a && this.bomb.defuseP > 0); }

  fire(a, power = 1) {
    if (!a.alive || this.phase === 'freeze' || this.phase === 'over') return false;
    if (a.fireCd > 0 || a.reloadT > 0 || a.throwing || this.busy(a)) return false;
    if (a.weapon === 'knife') return this.melee(a);
    if (a.weapon === 'nade') return this.throwNade(a, power);
    const inv = a.inv[a.weapon], w = a.w;
    if (!inv) return false;
    if (inv.mag <= 0) {
      if (!this.reload(a) && a === this.player) SFX.click();
      a.fireCd = 0.25;
      return false;
    }
    inv.mag--;
    a.fireCd = 60 / w.rpm;
    const spread = this.spreadOf(a);
    _o.set(a.pos.x, a.eyeY, a.pos.z);
    const baseYaw = a.yaw + a.recoilY, basePitch = a.pitch + a.recoilP;
    const muzzle = this.muzzlePos(a, new THREE.Vector3());
    let anyHit = false, anyHead = false, anyTeam = false;
    for (let p = 0; p < w.pellets; p++) {
      const r = spread * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
      aimDir(baseYaw + Math.cos(th) * r, basePitch + Math.sin(th) * r, _d);
      const hit = this.traceShot(a, _o, _d, 250);
      const end = _v.copy(_o).addScaledVector(_d, hit.dist);
      if (hit.agent) {
        this.effects.puff(end, 0x9a1010, 0.25, 0.3, 0.2);
        const imp = _d.clone().multiplyScalar(w.impulse || 2);
        if (hit.agent.team === a.team) anyTeam = true;
        this.applyDamage(hit.agent, a, w.id, this.damageFor(w, hit.dist), hit.head, imp);
        anyHit = true; anyHead = anyHead || hit.head;
      } else if (hit.dist < 250) {
        this.effects.puff(end, hit.ny ? 0xcbb48a : 0xd9c7a0, 0.18, 0.4, 0.3);
      }
      if (p < 3) this.effects.tracer(muzzle, end);
    }
    const k = a.sprayIdx < 10 ? 1 : 0.35;
    a.recoilP += w.recoil * k * (0.85 + Math.random() * 0.3);
    a.recoilY += (Math.random() - 0.5) * 2 * w.recoilYaw * (a.sprayIdx > 4 ? 2 : 0.6);
    a.sprayIdx++;
    a.lastShot = this.time;
    this.effects.flash(muzzle, w.id === 'shotgun' || w.id === 'sniper' ? 0.7 : 0.45);
    if (a === this.player) {
      SFX.gunshot(w.id, 0, 0);
      if (anyHit && !anyTeam) anyHead ? SFX.headshot() : SFX.hitmarker();
      this.emit('shot', { hit: anyHit, head: anyHead, team: anyTeam });
    } else {
      const s = this.soundFrom(a.pos);
      SFX.gunshot(w.id, s.dist, s.pan);
    }
    this.noise(a, 40);
    a.spotted = Math.max(a.spotted, 1.2);
    if (inv.mag === 0 && inv.reserve > 0) a.autoReload = 0.25;
    return true;
  }

  melee(a) {
    const w = WEAPONS.knife;
    a.fireCd = 60 / w.rpm; a.actionT = 0.001;
    _o.set(a.pos.x, a.eyeY, a.pos.z);
    aimDir(a.yaw, a.pitch, _d);
    let best = null, bestD = Infinity;
    for (const b of this.agents) {
      if (!b.alive || b === a || (b.team === a.team && !this.rules.friendlyFire)) continue;
      _v.set(b.pos.x - _o.x, b.pos.y + 1.2 - _o.y, b.pos.z - _o.z);
      const d = _v.length();
      if (d > w.range + 0.35 || d < 1e-3) continue;
      if (_v.dot(_d) / d < 0.72) continue;
      if (!W.hasLOS(_o.x, _o.y, _o.z, b.pos.x, b.pos.y + 1.2, b.pos.z, false)) continue;
      if (d < bestD) { bestD = d; best = b; }
    }
    if (a === this.player || this.soundFrom(a.pos).dist < 12) SFX.knifeSwing();
    if (best) {
      const fx = -Math.sin(best.yaw), fz = -Math.cos(best.yaw);
      const dx = best.pos.x - a.pos.x, dz = best.pos.z - a.pos.z, dl = Math.hypot(dx, dz) || 1;
      const backstab = (fx * dx + fz * dz) / dl > 0.5;
      this.effects.puff(_v.set(best.pos.x, best.pos.y + 1.2, best.pos.z), 0x9a1010, 0.3, 0.3, 0.2);
      SFX.knifeHit();
      this.applyDamage(best, a, 'knife', backstab ? w.backstab : w.damage, false, _d.clone().multiplyScalar(w.impulse));
      if (a === this.player) this.emit('shot', { hit: true, head: backstab, team: best.team === a.team });
    }
    this.noise(a, 6);
    return true;
  }

  throwNade(a, power = 1) {
    const type = a.nadeSel;
    if (!type || a.nades[type] <= 0) return false;
    a.throwing = { type, power, t: 0.25 };
    a.actionT = 0.001;
    a.fireCd = 0.9;
    if (a === this.player || this.soundFrom(a.pos).dist < 10) SFX.pin();
    return true;
  }

  damageFor(w, dist) {
    const f = dist < w.range ? 1 - (1 - w.falloff) * (dist / w.range) : w.falloff;
    return w.damage * f;
  }

  traceShot(shooter, o, d, maxDist) {
    const wall = W.raycast(o.x, o.y, o.z, d.x, d.y, d.z, maxDist);
    let best = wall.dist, agent = null, head = false;
    const ff = this.rules.friendlyFire;
    for (const b of this.agents) {
      if (!b.alive || b === shooter || (b.team === shooter.team && !ff)) continue;
      const dx = b.pos.x - o.x, dz = b.pos.z - o.z, along = dx * d.x + dz * d.z;
      if (along < -1 || along > best + 1) continue;
      _v.set(b.pos.x, b.pos.y + PLAYER.headY, b.pos.z);
      let t = raySphere(o, d, _v, PLAYER.headRadius);
      if (t < best) { best = t; agent = b; head = true; }
      t = rayAABB(o, d, b.pos.x - PLAYER.bodyHalf, b.pos.y, b.pos.z - PLAYER.bodyHalf, b.pos.x + PLAYER.bodyHalf, b.pos.y + PLAYER.bodyTop, b.pos.z + PLAYER.bodyHalf);
      if (t < best) { best = t; agent = b; head = false; }
    }
    return { dist: best, agent, head, ny: agent ? 0 : wall.ny };
  }

  applyDamage(victim, attacker, weaponId, dmg, head, impulse) {
    if (!victim.alive) return;
    const ff = attacker && attacker !== victim && attacker.team === victim.team;
    if (ff && !this.rules.friendlyFire) return;
    const w = WEAPONS[weaponId];
    if (head && w) dmg *= w.headMult;
    const armored = head ? (victim.helmet && victim.armor > 0) : victim.armor > 0;
    if (armored && weaponId !== 'fall' && weaponId !== 'bomb') {
      const pen = w ? w.armorPen : 0.6;
      const dh = dmg * pen;
      victim.armor = Math.max(0, victim.armor - (dmg - dh) * 0.5);
      dmg = dh;
    }
    if (ff) dmg *= this.rules.ffDamage;
    dmg = Math.max(1, Math.round(dmg));
    victim.hp -= dmg;
    victim.lastImpulse = impulse;
    if (victim === this.player) { SFX.hurt(); this.emit('hurt', { from: attacker, dmg }); }
    if (ff && attacker === this.player) this.emit('msg', { text: `You hit teammate ${victim.name}!`, warn: true });
    if (victim.isBot && attacker && attacker.team !== victim.team) {
      victim.ai.heard = { x: attacker.pos.x, z: attacker.pos.z, t: this.time };
      victim.ai.hurtBy = attacker;
    }
    if (victim.hp <= 0) this.kill(victim, attacker, weaponId, head, impulse);
  }

  kill(victim, attacker, weaponId, head, impulse) {
    victim.alive = false; victim.hp = 0; victim.deaths++;
    victim.scoped = false; victim.throwing = null;
    victim.char.visible = true;
    victim.char.startRagdoll({ x: victim.vx, y: victim.vy, z: victim.vz }, impulse || { x: 0, y: 0, z: 0 }, head ? 'head' : 'torso');
    let teamkill = false;
    if (attacker && attacker !== victim) {
      if (attacker.team !== victim.team) {
        attacker.kills++;
        const reward = WEAPONS[weaponId]?.kill ?? (GRENADES[weaponId] ? 300 : 0);
        this.addMoney(attacker, reward);
      } else {
        teamkill = true;
        attacker.kills--; attacker.teamkills++;
        attacker.money = Math.max(0, attacker.money - ECON.teamkillPenalty);
        attacker.punished = this.rules.teamkillPunishRounds;
        attacker.punishedActive = true;
        if (attacker.alive) attacker.strip();
        this.emit('teamkill', { killer: attacker, victim });
        this.emit('msg', { text: `${attacker === this.player ? 'You' : attacker.name} killed a teammate! Knife only for ${this.rules.teamkillPunishRounds} rounds.`, warn: true });
      }
    }
    if (this.bomb.carrier === victim) {
      this.bomb.state = 'dropped'; this.bomb.carrier = null;
      this.bomb.pos.set(victim.pos.x, victim.pos.y, victim.pos.z);
      this.bombMesh.visible = true; this.bombMesh.position.copy(this.bomb.pos).setY(this.bomb.pos.y + 0.06);
      this.emit('msg', { text: 'The bomb has been dropped!', team: 'T' });
    }
    this.emit('kill', { killer: attacker, victim, weapon: weaponId, head, teamkill });
  }

  // ---------------- Bomb ----------------
  plantSite(a) {
    if (this.bomb.carrier !== a || this.phase !== 'live' || !a.alive) return null;
    if (W.inZone('A', a.pos.x, a.pos.z)) return 'A';
    if (W.inZone('B', a.pos.x, a.pos.z)) return 'B';
    return null;
  }

  tryPlant(a, dt) {
    const site = this.plantSite(a);
    if (!site || !a.onGround) return false;
    const b = this.bomb;
    if (b.planter !== a) { b.planter = a; b.plantP = 0; }
    b.plantTouched = true;
    b.plantP += dt;
    if (b.plantP >= this.rules.plantTime) {
      b.state = 'planted'; b.carrier = null; b.site = site; b.timer = this.rules.bombTimer; b.beepT = 0;
      b.pos.set(a.pos.x, a.pos.y, a.pos.z);
      this.bombMesh.visible = true; this.bombMesh.position.copy(b.pos).setY(b.pos.y + 0.06);
      this.bombMesh.rotation.set(0, a.yaw, 0);
      this.phase = 'planted'; this.planted = true;
      b.planter = null; b.plantP = 0;
      SFX.plantDone();
      this.emit('msg', { text: `Bomb planted at ${site}!`, big: true });
      this.emit('planted', { site });
    }
    return true;
  }

  canDefuse(a) {
    const b = this.bomb;
    return a.alive && a.team === 'CT' && b.state === 'planted' && this.phase === 'planted' &&
      Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 1.9 && Math.abs(a.pos.y - b.pos.y) < 1.2 && (!b.defuser || b.defuser === a);
  }

  tryDefuse(a, dt) {
    if (!this.canDefuse(a) || !a.onGround) return false;
    const b = this.bomb;
    if (b.defuser !== a) { b.defuser = a; b.defuseP = 0; if (a.team === this.player.team) this.emit('msg', { text: `${a === this.player ? 'You are' : a.name + ' is'} defusing${a.hasKit ? ' (with kit)' : ''}...` }); }
    b.defuseTouched = true;
    b.defuseP += dt;
    if (b.defuseP >= (a.hasKit ? this.rules.defuseTimeKit : this.rules.defuseTime)) {
      b.state = 'defused'; b.defuser = null;
      this.emit('msg', { text: 'The bomb has been defused!', big: true });
      this.endRound('CT', 'Bomb defused', 'defuse');
    }
    return true;
  }

  explode() {
    const b = this.bomb;
    b.state = 'exploded'; this.bombMesh.visible = false;
    this.effects.explode(_v.copy(b.pos).setY(b.pos.y + 1));
    SFX.explosion(this.soundFrom(b.pos).dist);
    this.emit('explode');
    for (const a of this.agents) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      if (d < this.rules.bombRadius) {
        const dmg = this.rules.bombDamage * Math.pow(1 - d / this.rules.bombRadius, 2) * (a.armor > 0 ? 0.8 : 1);
        const imp = new THREE.Vector3(a.pos.x - b.pos.x, 2, a.pos.z - b.pos.z).normalize().multiplyScalar(9);
        this.applyDamage(a, null, 'bomb', dmg, false, imp);
      }
    }
    if (this.phase === 'planted') this.endRound('T', 'Target destroyed', 'bomb');
  }

  // ---------------- Main update ----------------
  update(dt) {
    this.time += dt;
    const b = this.bomb;
    if (this.phase === 'freeze') {
      this.timer -= dt;
      if (this.timer <= 0) { this.phase = 'live'; this.timer = this.rules.roundTime; this.emit('live'); }
    } else if (this.phase === 'live') {
      this.timer -= dt;
      if (this.timer <= 0) { this.timer = 0; this.endRound('CT', 'Time ran out - the bomb was not planted'); }
    } else if (this.phase === 'end') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.matchWinner) { this.phase = 'over'; this.emit('matchOver', { winner: this.matchWinner }); }
        else this.startRound();
      }
    }

    if (b.state === 'planted') {
      b.timer -= dt; b.beepT -= dt;
      const interval = b.timer > 20 ? 1 : b.timer > 10 ? 0.5 : b.timer > 5 ? 0.25 : 0.12;
      if (b.beepT <= 0) {
        b.beepT = interval;
        if (this.soundFrom(b.pos).dist < 60) SFX.beep(b.timer < 10);
        this.bombLed.visible = true;
      } else if (b.beepT < interval * 0.6) this.bombLed.visible = false;
      if (b.timer <= 0) this.explode();
    }

    for (const a of this.agents) {
      if (!a.alive) continue;
      if (a.fireCd > 0) a.fireCd -= dt;
      if (a.reloadT > 0) { a.reloadT -= dt; if (a.reloadT <= 0) { a.reloadT = 0; this.finishReload(a); } }
      if (a.autoReload > 0) { a.autoReload -= dt; if (a.autoReload <= 0) { a.autoReload = 0; this.reload(a); } }
      if (a.blindT > 0) a.blindT -= dt;
      if (a.actionT > 0) { a.actionT += dt / 0.35; if (a.actionT >= 1) a.actionT = 0; }
      if (a.throwing) {
        a.throwing.t -= dt;
        if (a.throwing.t <= 0) {
          const type = a.throwing.type;
          this.grenades.throw(a, type, a.throwing.power);
          a.throwing = null;
          if (a.nades[type] <= 0) a.equip(a.firstNade ? 'nade' : (a.prevWeapon !== 'nade' && a.has(a.prevWeapon) ? a.prevWeapon : a.bestWeapon()));
          else a.setWeaponMesh();
        }
      }
      const idle = this.time - a.lastShot > (60 / (a.w.rpm || 60)) * 1.1 + 0.06;
      if (idle) {
        a.sprayIdx = Math.max(0, a.sprayIdx - dt * 18);
        const k = Math.min(1, dt * 7);
        a.recoilP *= 1 - k; a.recoilY *= 1 - k;
      }
      if (a.spotted > 0) a.spotted -= dt;
    }

    this.pathBudget = 2;
    for (const a of this.agents) if (a.isBot) updateBot(a, this, dt);

    // keep agents from overlapping
    const al = this.agents.filter((a) => a.alive);
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const p = al[i].pos, q = al[j].pos;
      if (Math.abs(p.y - q.y) > 1.5) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), min = PLAYER.radius * 2;
      if (d < min && d > 1e-4) {
        const push = (min - d) / 2, nx = dx / d, nz = dz / d;
        p.x -= nx * push; p.z -= nz * push; q.x += nx * push; q.z += nz * push;
        W.resolveCircle(p, PLAYER.radius, p.y); W.resolveCircle(q, PLAYER.radius, q.y);
      }
    }

    if (b.state === 'dropped') {
      for (const a of this.agents) {
        if (!a.alive || a.team !== 'T') continue;
        if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 1.2 && Math.abs(a.pos.y - b.pos.y) < 1.5) {
          b.state = 'carried'; b.carrier = a; this.bombMesh.visible = false;
          this.emit('msg', { text: a === this.player ? 'You picked up the bomb' : `${a.name} picked up the bomb`, team: 'T' });
          break;
        }
      }
    }
    if (!b.plantTouched) { b.planter = null; b.plantP = 0; }
    if (!b.defuseTouched) { b.defuser = null; b.defuseP = 0; }
    b.plantTouched = b.defuseTouched = false;

    if (this.phase === 'live' || this.phase === 'planted') {
      const t = this.alive('T').length, ct = this.alive('CT').length;
      if (ct === 0) this.endRound('T', 'Counter-Terrorists eliminated');
      else if (t === 0 && this.phase === 'live') this.endRound('CT', 'Terrorists eliminated');
    }

    this.grenades.update(dt);
    for (const a of this.agents) {
      a.char.pack.visible = b.carrier === a && a.alive;
      a.updateMesh(dt, a.alive && (b.planter === a && b.plantP > 0 || b.defuser === a && b.defuseP > 0));
    }
    if (b.state === 'dropped') this.bombMesh.rotation.y += dt;
    this.effects.update(dt);
  }

  dispose() {
    this.grenades.clear();
    for (const a of this.agents) a.char.dispose();
  }
}
