import * as THREE from '../lib/three.module.min.js';
import { RULES, ECON, WEAPONS, BOT_NAMES, PLAYER, DIFFICULTY } from './config.js';
import * as MAP from './map.js';
import { Agent } from './agent.js';
import { Effects } from './effects.js';
import * as SFX from './audio.js';
import { initBotRound, updateBot, botBuy } from './bot.js';

const _v = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const other = (t) => (t === 'T' ? 'CT' : 'T');

export function aimDir(yaw, pitch, out = new THREE.Vector3()) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
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

export class Game {
  constructor(scene, camera, opts) {
    this.scene = scene; this.camera = camera; this.opts = opts;
    this.diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
    this.effects = new Effects(scene);
    this.listeners = [];
    this.time = 0;
    this.agents = [];
    this.player = new Agent('You', opts.team, false);
    this.agents.push(this.player);
    for (const team of ['T', 'CT']) {
      const names = shuffle([...BOT_NAMES[team]]);
      const n = team === opts.team ? RULES.playersPerTeam - 1 : RULES.playersPerTeam;
      for (let i = 0; i < n; i++) this.agents.push(new Agent(names[i], team, true));
    }
    for (const a of this.agents) scene.add(a.mesh);
    this.player.mesh.visible = false;

    this.score = { T: 0, CT: 0 };
    this.lossStreak = { T: 0, CT: 0 };
    this.round = 0;
    this.phase = 'freeze';
    this.timer = 0;
    this.matchWinner = null;

    // Bomb
    const bm = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.26), new THREE.MeshLambertMaterial({ color: 0x3a3a2a }));
    body.position.y = 0.07; bm.add(body);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), new THREE.MeshLambertMaterial({ color: 0x223322 }));
    pad.position.set(-0.05, 0.15, 0); bm.add(pad);
    this.bombLed = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    this.bombLed.position.set(0.12, 0.16, 0); bm.add(this.bombLed);
    bm.visible = false; scene.add(bm);
    this.bombMesh = bm;
    this.bomb = {};

    this.startRound();
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data) { for (const f of this.listeners) f(type, data); }

  get teams() {
    return { T: this.agents.filter((a) => a.team === 'T'), CT: this.agents.filter((a) => a.team === 'CT') };
  }
  alive(team) { return this.agents.filter((a) => a.alive && a.team === team); }

  // ---------------- Round flow ----------------
  startRound() {
    this.round++;
    this.phase = 'freeze';
    this.timer = RULES.freezeTime;
    this.buyUntil = RULES.buyTimeAfterFreeze;
    for (const team of ['T', 'CT']) {
      const spawns = shuffle([...MAP.SPAWNS[team]]);
      this.agents.filter((a) => a.team === team).forEach((a, i) => {
        a.resetForRound(spawns[i % spawns.length], team === 'T' ? 0 : Math.PI);
        a.vx = a.vz = 0; a.recoilP = a.recoilY = 0; a.stepAcc = 0;
      });
    }
    this.player.mesh.visible = false;
    const ts = this.alive('T');
    this.bomb = {
      state: 'carried', carrier: ts[Math.floor(Math.random() * ts.length)], pos: new THREE.Vector3(), site: null,
      timer: 0, plantP: 0, planter: null, plantTouched: false, defuseP: 0, defuser: null, defuseTouched: false, beepT: 0,
    };
    this.bombMesh.visible = false;
    this.planted = false;
    this.tPlan = { site: Math.random() < 0.5 ? 'A' : 'B', executeAt: RULES.roundTime - (12 + Math.random() * 18) };
    this.intel = { hot: null, hotT: -99 };
    for (const a of this.agents) if (a.isBot) { botBuy(a, this); initBotRound(a, this); }
    this.emit('roundStart', { round: this.round });
    SFX.roundStart();
  }

  endRound(winner, reason, how = 'elim') {
    if (this.phase === 'end' || this.phase === 'over') return;
    this.phase = 'end';
    this.timer = RULES.roundEndDelay;
    this.score[winner]++;
    const loser = other(winner);
    const lossPay = Math.min(ECON.lossBase + ECON.lossStep * this.lossStreak[loser], ECON.lossMax);
    this.lossStreak[loser] = Math.min(this.lossStreak[loser] + 1, 4);
    this.lossStreak[winner] = Math.max(0, this.lossStreak[winner] - 1);
    for (const a of this.agents) {
      if (a.team === winner) a.money += (how === 'bomb' || how === 'defuse') ? ECON.winBombReward : ECON.winReward;
      else a.money += lossPay + (a.team === 'T' && this.planted ? ECON.plantBonus : 0);
      a.money = Math.min(a.money, ECON.maxMoney);
    }
    if (this.score[winner] >= RULES.roundsToWin) this.matchWinner = winner;
    this.emit('roundEnd', { winner, reason });
    SFX.roundEnd(winner === this.player.team);
  }

  get canBuy() {
    const p = this.player;
    if (!p.alive || !MAP.inZone(p.team, p.pos.x, p.pos.z)) return false;
    return this.phase === 'freeze' || (this.phase === 'live' && RULES.roundTime - this.timer < this.buyUntil);
  }

  buy(agent, item) {
    if (item === 'armor') {
      if (agent.armor >= 100 && agent.helmet) return false;
      if (agent.money < ECON.armorPrice) return false;
      agent.money -= ECON.armorPrice; agent.armor = 100; agent.helmet = true; return true;
    }
    if (item === 'kit') {
      if (agent.team !== 'CT' || agent.hasKit || agent.money < ECON.kitPrice) return false;
      agent.money -= ECON.kitPrice; agent.hasKit = true; return true;
    }
    const w = WEAPONS[item];
    if (!w || agent.money < w.price) return false;
    if (agent.inv[item] && agent.inv[item].reserve >= w.reserve) { agent.equip(item); return false; }
    agent.money -= w.price;
    agent.give(item);
    return true;
  }

  // ---------------- Movement ----------------
  moveAgent(a, wishX, wishZ, maxSpeed, dt, jump = false) {
    if (a.vx === undefined) a.vx = a.vz = 0;
    const tvx = wishX * maxSpeed, tvz = wishZ * maxSpeed;
    const accel = a.onGround ? ((wishX || wishZ) ? 38 : 26) : 5;
    const dvx = tvx - a.vx, dvz = tvz - a.vz, dl = Math.hypot(dvx, dvz), mx = accel * dt;
    if (dl > mx) { a.vx += dvx / dl * mx; a.vz += dvz / dl * mx; } else { a.vx = tvx; a.vz = tvz; }
    const ox = a.pos.x, oz = a.pos.z;
    a.pos.x += a.vx * dt; a.pos.z += a.vz * dt;
    MAP.resolveCircle(a.pos, PLAYER.radius);
    if (dt > 0) { a.vx = (a.pos.x - ox) / dt; a.vz = (a.pos.z - oz) / dt; }
    if (jump && a.onGround) { a.vy = PLAYER.jumpSpeed; a.onGround = false; }
    if (!a.onGround || a.pos.y > 0) {
      a.vy -= PLAYER.gravity * dt; a.pos.y += a.vy * dt;
      if (a.pos.y <= 0) { a.pos.y = 0; a.vy = 0; a.onGround = true; }
    }
    const sp = Math.hypot(a.vx, a.vz);
    a.speed = sp;
    a.moving = Math.max(0, Math.min(1, (sp - 1.4) / 3.6));
    // footsteps (running only, like CS)
    a.stepAcc = (a.stepAcc || 0) + sp * dt;
    if (a.stepAcc > 2.3) {
      a.stepAcc = 0;
      if (sp > 3.2 && a.onGround) {
        if (a === this.player) SFX.step(0.05);
        else if (this.player.alive || true) { const s = this.soundFrom(a.pos); if (s.dist < 18) SFX.step(0.18 / (1 + s.dist * 0.25), s.pan); }
        this.noise(a, 12);
      }
    }
  }

  soundFrom(p) {
    const c = this.camera;
    const dx = p.x - c.position.x, dz = p.z - c.position.z;
    const dist = Math.hypot(dx, dz);
    const yaw = c.rotation.y;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw); // camera right vector
    const pan = dist > 0.1 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) : 0;
    return { dist, pan };
  }

  // Let bots of the other team hear something at `a`'s position
  noise(a, radius) {
    for (const b of this.agents) {
      if (!b.isBot || !b.alive || b.team === a.team) continue;
      const d = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
      if (d < radius) b.ai.heard = { x: a.pos.x, z: a.pos.z, t: this.time };
    }
  }

  // ---------------- Weapons ----------------
  spreadOf(a) {
    const w = a.w;
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
    const n = Math.min(w.mag - inv.mag, inv.reserve);
    inv.mag += n; inv.reserve -= n;
  }

  muzzlePos(a, out) {
    if (a === this.player && this.muzzleOverride) return out.copy(this.muzzleOverride);
    aimDir(a.yaw, a.pitch, _d);
    return out.set(a.pos.x + _d.x * 0.75 + Math.cos(a.yaw) * 0.12, a.eyeY - 0.28 + _d.y * 0.6, a.pos.z + _d.z * 0.75 - Math.sin(a.yaw) * 0.12);
  }

  fire(a) {
    if (!a.alive || this.phase === 'freeze' || this.phase === 'over') return false;
    if (a.fireCd > 0 || a.reloadT > 0 || (this.bomb.planter === a && this.bomb.plantP > 0) || (this.bomb.defuser === a && this.bomb.defuseP > 0)) return false;
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
    const baseYaw = a.yaw + (a.recoilY || 0), basePitch = a.pitch + (a.recoilP || 0);
    const muzzle = this.muzzlePos(a, new THREE.Vector3());
    let anyHit = false, anyHead = false;
    for (let p = 0; p < w.pellets; p++) {
      const r = spread * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
      aimDir(baseYaw + Math.cos(th) * r, basePitch + Math.sin(th) * r, _d);
      const hit = this.traceShot(a, _o, _d, 250);
      const end = _v.copy(_o).addScaledVector(_d, hit.dist);
      if (hit.agent) {
        const dmg = this.damageFor(w, hit.dist);
        this.effects.puff(end, 0x9a1010, 0.25, 0.3, 0.2);
        this.applyDamage(hit.agent, a, w.id, dmg, hit.head);
        anyHit = true; anyHead = anyHead || hit.head;
      } else if (hit.dist < 250) {
        this.effects.puff(end, hit.ny ? 0xcbb48a : 0xd9c7a0, 0.18, 0.4, 0.3);
      }
      if (p < 3) this.effects.tracer(muzzle, end);
    }
    // recoil (aim punch that recovers automatically)
    const k = a.sprayIdx < 10 ? 1 : 0.35;
    a.recoilP = (a.recoilP || 0) + w.recoil * k * (0.85 + Math.random() * 0.3);
    a.recoilY = (a.recoilY || 0) + (Math.random() - 0.5) * 2 * w.recoilYaw * (a.sprayIdx > 4 ? 2 : 0.6);
    a.sprayIdx++;
    a.lastShot = this.time;
    this.effects.flash(muzzle, w.id === 'shotgun' || w.id === 'sniper' ? 0.7 : 0.45);
    if (a === this.player) {
      SFX.gunshot(w.id, 0, 0);
      if (anyHit) anyHead ? SFX.headshot() : SFX.hitmarker();
      this.emit('shot', { hit: anyHit, head: anyHead });
    } else {
      const s = this.soundFrom(a.pos);
      SFX.gunshot(w.id, s.dist, s.pan);
    }
    this.noise(a, 40);
    a.spotted = Math.max(a.spotted, 1.2); // firing reveals you on the enemy radar briefly
    if (inv.mag === 0 && inv.reserve > 0) a.autoReload = 0.25;
    return true;
  }

  damageFor(w, dist) {
    const f = dist < w.range ? 1 - (1 - w.falloff) * (dist / w.range) : w.falloff;
    return w.damage * f;
  }

  traceShot(shooter, o, d, maxDist) {
    const wall = MAP.raycast(o.x, o.y, o.z, d.x, d.y, d.z, maxDist);
    let best = wall.dist, agent = null, head = false;
    for (const b of this.agents) {
      if (!b.alive || b.team === shooter.team) continue;
      // cheap reject
      const dx = b.pos.x - o.x, dz = b.pos.z - o.z;
      const along = dx * d.x + dz * d.z;
      if (along < 0 || along > best + 1) continue;
      _v.set(b.pos.x, b.pos.y + PLAYER.headY, b.pos.z);
      let t = raySphere(o, d, _v, PLAYER.headRadius);
      if (t < best) { best = t; agent = b; head = true; }
      t = rayAABB(o, d, b.pos.x - PLAYER.bodyHalf, b.pos.y, b.pos.z - PLAYER.bodyHalf, b.pos.x + PLAYER.bodyHalf, b.pos.y + PLAYER.bodyTop, b.pos.z + PLAYER.bodyHalf);
      if (t < best) { best = t; agent = b; head = false; }
    }
    return { dist: best, agent, head, ny: agent ? 0 : wall.ny };
  }

  applyDamage(victim, attacker, weaponId, dmg, head) {
    if (!victim.alive) return;
    const w = WEAPONS[weaponId];
    if (head) dmg *= w ? w.headMult : 1;
    const armored = head ? (victim.helmet && victim.armor > 0) : victim.armor > 0;
    if (armored && w) {
      const dh = dmg * w.armorPen;
      victim.armor = Math.max(0, victim.armor - (dmg - dh) * 0.5);
      dmg = dh;
    }
    dmg = Math.round(dmg);
    victim.hp -= dmg;
    if (victim === this.player) { SFX.hurt(); this.emit('hurt', { from: attacker, dmg }); }
    if (victim.isBot && attacker) {
      victim.ai.heard = { x: attacker.pos.x, z: attacker.pos.z, t: this.time };
      victim.ai.hurtBy = attacker;
    }
    if (victim.hp <= 0) this.kill(victim, attacker, weaponId, head);
  }

  kill(victim, attacker, weaponId, head) {
    victim.alive = false; victim.hp = 0; victim.deaths++;
    victim.scoped = false; victim.deathT = 0;
    if (attacker && attacker !== victim && attacker.team !== victim.team) {
      attacker.kills++;
      const w = WEAPONS[weaponId];
      if (w) attacker.money = Math.min(ECON.maxMoney, attacker.money + w.kill);
    }
    if (victim === this.player) { this.player.mesh.visible = true; }
    if (this.bomb.carrier === victim) {
      this.bomb.state = 'dropped'; this.bomb.carrier = null;
      this.bomb.pos.set(victim.pos.x, 0, victim.pos.z);
      this.bombMesh.visible = true; this.bombMesh.position.copy(this.bomb.pos);
      this.emit('msg', { text: 'The bomb has been dropped!', team: 'T' });
    }
    this.emit('kill', { killer: attacker, victim, weapon: weaponId, head });
  }

  // ---------------- Bomb ----------------
  plantSite(a) {
    if (this.bomb.carrier !== a || this.phase !== 'live' || !a.alive) return null;
    if (MAP.inZone('A', a.pos.x, a.pos.z)) return 'A';
    if (MAP.inZone('B', a.pos.x, a.pos.z)) return 'B';
    return null;
  }

  // Call every frame while the agent holds "use" at a site.
  tryPlant(a, dt) {
    const site = this.plantSite(a);
    if (!site || !a.onGround) return false;
    const b = this.bomb;
    if (b.planter !== a) { b.planter = a; b.plantP = 0; }
    b.plantTouched = true;
    b.plantP += dt;
    if (b.plantP >= RULES.plantTime) {
      b.state = 'planted'; b.carrier = null; b.site = site; b.timer = RULES.bombTimer; b.beepT = 0;
      b.pos.set(a.pos.x, 0, a.pos.z);
      this.bombMesh.visible = true; this.bombMesh.position.copy(b.pos);
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
    return a.alive && a.team === 'CT' && b.state === 'planted' && (this.phase === 'planted') &&
      Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 1.9 && (!b.defuser || b.defuser === a);
  }

  tryDefuse(a, dt) {
    if (!this.canDefuse(a) || !a.onGround) return false;
    const b = this.bomb;
    if (b.defuser !== a) { b.defuser = a; b.defuseP = 0; if (a === this.player || a.team === this.player.team) this.emit('msg', { text: `${a === this.player ? 'You are' : a.name + ' is'} defusing${a.hasKit ? ' (with kit)' : ''}...` }); }
    b.defuseTouched = true;
    b.defuseP += dt;
    if (b.defuseP >= (a.hasKit ? RULES.defuseTimeKit : RULES.defuseTime)) {
      b.state = 'defused';
      b.defuser = null;
      this.emit('msg', { text: 'The bomb has been defused!', big: true });
      this.endRound('CT', 'Bomb defused', 'defuse');
    }
    return true;
  }

  explode() {
    const b = this.bomb;
    b.state = 'exploded'; this.bombMesh.visible = false;
    this.effects.explode(_v.copy(b.pos).setY(1));
    SFX.explosion(this.soundFrom(b.pos).dist);
    this.emit('explode');
    for (const a of this.agents) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
      if (d < RULES.bombRadius) {
        const dmg = RULES.bombDamage * Math.pow(1 - d / RULES.bombRadius, 2);
        a.hp -= Math.round(dmg * (a.armor > 0 ? 0.8 : 1));
        if (a === this.player) this.emit('hurt', { from: null, dmg });
        if (a.hp <= 0) this.kill(a, null, 'bomb', false);
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
      if (this.timer <= 0) { this.phase = 'live'; this.timer = RULES.roundTime; this.emit('live'); }
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
      b.timer -= dt;
      b.beepT -= dt;
      const interval = b.timer > 20 ? 1 : b.timer > 10 ? 0.5 : b.timer > 5 ? 0.25 : 0.12;
      if (b.beepT <= 0) {
        b.beepT = interval;
        const s = this.soundFrom(b.pos);
        if (s.dist < 60) SFX.beep(b.timer < 10);
        this.bombLed.visible = true;
      } else if (b.beepT < interval * 0.6) this.bombLed.visible = false;
      if (b.timer <= 0) this.explode();
    }

    // weapons timers
    for (const a of this.agents) {
      if (!a.alive) continue;
      if (a.fireCd > 0) a.fireCd -= dt;
      if (a.reloadT > 0) { a.reloadT -= dt; if (a.reloadT <= 0) { a.reloadT = 0; this.finishReload(a); } }
      if (a.autoReload > 0) { a.autoReload -= dt; if (a.autoReload <= 0) { a.autoReload = 0; this.reload(a); } }
      const idle = this.time - (a.lastShot || 0) > (60 / a.w.rpm) * 1.1 + 0.06;
      if (idle) {
        a.sprayIdx = Math.max(0, a.sprayIdx - dt * 18);
        const k = Math.min(1, dt * 7);
        a.recoilP = (a.recoilP || 0) * (1 - k); a.recoilY = (a.recoilY || 0) * (1 - k);
      }
      if (a.spotted > 0) a.spotted -= dt;
    }

    for (const a of this.agents) if (a.isBot) updateBot(a, this, dt);

    // keep agents from overlapping
    const al = this.agents.filter((a) => a.alive);
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const p = al[i].pos, q = al[j].pos;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), min = PLAYER.radius * 2;
      if (d < min && d > 1e-4) {
        const push = (min - d) / 2, nx = dx / d, nz = dz / d;
        p.x -= nx * push; p.z -= nz * push; q.x += nx * push; q.z += nz * push;
        MAP.resolveCircle(p, PLAYER.radius); MAP.resolveCircle(q, PLAYER.radius);
      }
    }

    // bomb pickup
    if (b.state === 'dropped') {
      for (const a of this.agents) {
        if (!a.alive || a.team !== 'T') continue;
        if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 1.2) {
          b.state = 'carried'; b.carrier = a; this.bombMesh.visible = false;
          this.emit('msg', { text: a === this.player ? 'You picked up the bomb' : `${a.name} picked up the bomb`, team: 'T' });
          break;
        }
      }
    }
    // cancel plant/defuse that was not continued this frame
    if (!b.plantTouched) { b.planter = null; b.plantP = 0; }
    if (!b.defuseTouched) { b.defuser = null; b.defuseP = 0; }
    b.plantTouched = b.defuseTouched = false;

    // win conditions
    if (this.phase === 'live' || this.phase === 'planted') {
      const t = this.alive('T').length, ct = this.alive('CT').length;
      if (ct === 0) this.endRound('T', 'Counter-Terrorists eliminated');
      else if (t === 0 && this.phase === 'live') this.endRound('CT', 'Terrorists eliminated');
    }

    for (const a of this.agents) a.updateMesh(dt);
    if (b.state === 'dropped') this.bombMesh.rotation.y += dt;
    this.effects.update(dt);
  }
}
