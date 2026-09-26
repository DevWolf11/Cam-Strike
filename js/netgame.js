import * as THREE from '../lib/three.module.min.js';
import { Game, aimDir } from './game.js';
import { WEAPONS, GRENADES } from './config.js';
import * as W from './world.js';
import { surfKind } from './effects.js';
import { setRagdollPushers, ragdollBlast } from './character.js';
import * as SFX from './audio.js';
import { grenadeObject } from './weapons3d.js';

const INTERP = 0.1;                 // render remote players this far behind the host
const _d = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3();
const lerpAngle = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

// A friend's copy of the match. The host runs the real game; this mirror predicts the local
// player (movement, shooting feel) and draws everyone else from the host's snapshots.
export class ClientGame extends Game {
  constructor(scene, camera, opts, net) {
    super(scene, camera, opts);
    this.net = net;
    this.grenades.visualOnly = true;
    this.buf = new Map();
    this.fly = new Map();
    this.hostTime = 0;
    this.useFrame = false; this.useHeld = false;
    this.lastHostW = null;
    const p = this.player, orig = p.equip.bind(p);
    p.equip = (...args) => { const r = orig(...args); if (r) p.equipAt = this.time; return r; };
  }

  // The host decides rounds, damage and bots; these become no-ops or requests.
  startRound() {
    this.phase = 'freeze'; this.timer = this.rules.freezeTime;
    this.bomb = { state: 'none', carrier: null, pos: new THREE.Vector3(), site: null, timer: 0, plantP: 0, planter: null, defuseP: 0, defuser: null, beepT: 0 };
    this.tPlan = { site: 'A', executeAt: 0 }; this.intel = { hot: null, hotT: -99 };
  }
  noise() {}
  endRound() {}
  applyDamage(victim, attacker, weaponId, dmg) {
    if (weaponId === 'fall' && victim === this.player) this.net.send({ t: 'act', a: 'fall', dmg });
  }
  buy(agent, item) {
    if (agent !== this.player) return false;
    this.net.send({ t: 'act', a: 'buy', item });
    SFX.buy();
    return false;
  }
  reload(a) {
    if (a !== this.player) return false;
    const inv = a.inv[a.weapon], w = a.w;
    if (!inv || a.reloadT > 0 || inv.mag >= w.mag || inv.reserve <= 0) return false;
    a.reloadT = w.reload; a.scoped = false;
    SFX.reload();
    this.net.send({ t: 'act', a: 'reload' });
    return true;
  }
  tryPlant(a) { if (a !== this.player || !this.plantSite(a) || !a.onGround) return false; this.useFrame = true; return true; }
  tryDefuse(a) { if (a !== this.player || !this.canDefuse(a) || !a.onGround) return false; this.useFrame = true; return true; }

  // Local shot: play everything immediately, let the host decide hits.
  fire(a, power = 1) {
    if (a !== this.player || !a.alive || this.phase === 'freeze' || this.phase === 'over') return false;
    if (a.fireCd > 0 || a.reloadT > 0 || a.throwing) return false;
    const send = (extra) => this.net.send({ t: 'act', a: 'fire', w: a.weapon, ns: a.nadeSel, yaw: a.yaw + a.recoilY, pitch: a.pitch + a.recoilP, power, ...extra });
    if (a.weapon === 'knife') {
      a.fireCd = 60 / WEAPONS.knife.rpm; a.actionT = 0.001;
      SFX.knifeSwing(); send({ yaw: a.yaw, pitch: a.pitch });
      this.emit('shot', { agent: a, hit: false });
      return true;
    }
    if (a.weapon === 'nade') {
      const type = a.nadeSel;
      if (!type || a.nades[type] <= 0) return false;
      a.throwing = { type, power, t: 0.25 }; a.actionT = 0.001; a.fireCd = 0.9;
      SFX.pin(); send({ yaw: a.yaw, pitch: a.pitch });
      return true;
    }
    const inv = a.inv[a.weapon], w = a.w;
    if (!inv) return false;
    if (inv.mag <= 0) { if (!this.reload(a)) SFX.click(); a.fireCd = 0.25; return false; }
    inv.mag--;
    a.fireCd = 60 / w.rpm;
    send();
    const spread = this.spreadOf(a);
    _o.set(a.pos.x, a.eyeY, a.pos.z);
    const muzzle = this.muzzlePos(a, new THREE.Vector3());
    const ends = [];
    for (let p = 0; p < w.pellets; p++) {
      const r = spread * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
      aimDir(a.yaw + a.recoilY + Math.cos(th) * r, a.pitch + a.recoilP + Math.sin(th) * r, _d);
      const hit = W.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, 250);
      const end = _v.copy(_o).addScaledVector(_d, hit.dist);
      ends.push([end.x, end.y, end.z, hit.dist < 250 ? surfKind(hit) : 0]);
    }
    const k = a.sprayIdx < 10 ? 1 : 0.35;
    a.recoilP += w.recoil * k * (0.85 + Math.random() * 0.3);
    a.recoilY += (Math.random() - 0.5) * 2 * w.recoilYaw * (a.sprayIdx > 4 ? 2 : 0.6);
    a.sprayIdx++; a.lastShot = this.time;
    this.effects.shot(muzzle, w.id, ends, a, true);
    SFX.gunshot(w.id, 0, 0);
    this.emit('shot', { agent: a, hit: false });
    if (inv.mag === 0 && inv.reserve > 0) a.autoReload = 0.25;
    return true;
  }

  // ---------------- per-frame ----------------
  update(dt) {
    this.time += dt; this.hostTime += dt;
    setRagdollPushers(this.agents);
    const b = this.bomb, p = this.player;
    if ((this.phase === 'freeze' || this.phase === 'live') && this.timer > 0) this.timer = Math.max(0, this.timer - dt);
    if (b.state === 'planted') {
      b.timer -= dt; b.beepT -= dt;
      const interval = b.timer > 20 ? 1 : b.timer > 10 ? 0.5 : b.timer > 5 ? 0.25 : 0.12;
      if (b.beepT <= 0) { b.beepT = interval; if (this.soundFrom(b.pos).dist < 60) SFX.beep(b.timer < 10); this.bombLed.visible = true; }
      else if (b.beepT < interval * 0.6) this.bombLed.visible = false;
    }
    // local player timers (prediction)
    if (p.alive) {
      if (p.fireCd > 0) p.fireCd -= dt;
      if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) { p.reloadT = 0; this.finishReload(p); } }
      if (p.autoReload > 0) { p.autoReload -= dt; if (p.autoReload <= 0) { p.autoReload = 0; this.reload(p); } }
      if (p.throwing) {
        p.throwing.t -= dt;
        if (p.throwing.t <= 0) {
          const type = p.throwing.type;
          p.nades[type] = Math.max(0, p.nades[type] - 1);
          p.throwing = null;
          if (p.nades[type] <= 0) p.equip(p.firstNade ? 'nade' : (p.prevWeapon !== 'nade' && p.has(p.prevWeapon) ? p.prevWeapon : p.bestWeapon()));
          else p.setWeaponMesh();
        }
      }
      if (this.time - p.lastShot > (60 / (p.w.rpm || 60)) * 1.1 + 0.06) {
        p.sprayIdx = Math.max(0, p.sprayIdx - dt * 18);
        const k = Math.min(1, dt * 7); p.recoilP *= 1 - k; p.recoilY *= 1 - k;
      }
    }
    for (const a of this.agents) {
      if (a.blindT > 0) a.blindT -= dt;
      if (a.actionT > 0) { a.actionT += dt / 0.35; if (a.actionT >= 1) a.actionT = 0; }
    }
    // remote players: interpolate between snapshots
    const rt = this.hostTime - INTERP;
    for (const a of this.agents) {
      if (a === p || !a.alive) continue;
      const buf = this.buf.get(a.nid);
      if (!buf || !buf.length) continue;
      let i = buf.length - 1;
      while (i > 0 && buf[i - 1].t > rt) i--;
      const B = buf[i], A = buf[i - 1] || B;
      const k = B.t > A.t ? Math.max(0, Math.min(1.2, (rt - A.t) / (B.t - A.t))) : 1;
      const ox = a.pos.x, oz = a.pos.z;
      a.pos.set(A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k, A.z + (B.z - A.z) * k);
      a.yaw = lerpAngle(A.yaw, B.yaw, k); a.pitch = A.pitch + (B.pitch - A.pitch) * k;
      const idt = 1 / Math.max(dt, 1e-3), sp = Math.hypot(a.pos.x - ox, a.pos.z - oz) * idt;
      a.vx += ((a.pos.x - ox) * idt - a.vx) * Math.min(1, dt * 10); a.vz += ((a.pos.z - oz) * idt - a.vz) * Math.min(1, dt * 10);
      a.speed += (Math.min(sp, 7) - a.speed) * Math.min(1, dt * 10);
      a.moving = Math.max(0, Math.min(1, (a.speed - 1.4) / 3.6));
      a.stepAcc += a.speed * dt;
      if (a.stepAcc > 2.3) { a.stepAcc = 0; if (a.speed > 3.2) { const s = this.soundFrom(a.pos); if (s.dist < 18) SFX.step(0.18 / (1 + s.dist * 0.25), s.pan); } }
    }
    this.useHeld = this.useFrame; this.useFrame = false;

    this.grenades.update(dt);
    for (const a of this.agents) {
      a.char.pack.visible = b.carrier === a && a.alive;
      a.updateMesh(dt, a.alive && ((b.planter === a && b.plantP > 0) || (b.defuser === a && b.defuseP > 0)));
    }
    if (b.state === 'dropped') this.bombMesh.rotation.y += dt;
    this.effects.update(dt);
  }

  // ---------------- from the host ----------------
  applySnapshot(s) {
    if (Math.abs(this.hostTime - s.ts) > 0.25) this.hostTime = s.ts; else this.hostTime += (s.ts - this.hostTime) * 0.1;
    this.phase = s.ph; this.timer = s.tm; this.round = s.r;
    this.score.T = s.sc[0]; this.score.CT = s.sc[1];
    const A = (n) => (n >= 0 ? this.agents[n] : null);
    const b = this.bomb, sb = s.b;
    if (b.state !== sb.st && (sb.st === 'dropped' || sb.st === 'planted')) this.bombMesh.visible = true;
    if (sb.st !== 'dropped' && sb.st !== 'planted') this.bombMesh.visible = false;
    b.state = sb.st; b.carrier = A(sb.c); b.site = sb.si; b.plantP = sb.pp; b.planter = A(sb.pl); b.defuseP = sb.dp; b.defuser = A(sb.df);
    if (sb.p) { b.pos.set(sb.p[0], sb.p[1], sb.p[2]); this.bombMesh.position.set(sb.p[0], sb.p[1] + 0.06, sb.p[2]); }
    if (b.state === 'planted' && Math.abs(b.timer - sb.tm) > 0.3) b.timer = sb.tm;
    this.planted = b.state === 'planted';
    for (const r of s.a) {
      const [nid, x, y, z, yaw, pitch, alive, hp, armor, w, ns, fl, money, k, d, tk] = r;
      const a = this.agents[nid];
      if (!a) continue;
      a.hp = hp; a.armor = armor; a.money = money; a.kills = k; a.deaths = d; a.teamkills = tk;
      a.hasKit = !!(fl & 8); a.punishedActive = !!(fl & 16); a.helmet = !!(fl & 32);
      if (a === this.player) {
        if (w !== this.lastHostW) { this.lastHostW = w; if (a.alive && w !== a.weapon && this.time - (a.equipAt || 0) > 0.6 && !a.throwing) a.equip(w, ns); }
        continue;
      }
      a.scoped = !!(fl & 1); a.onGround = !!(fl & 2); a.crouching = !!(fl & 64);
      if (a.weapon !== w || (w === 'nade' && a.nadeSel !== ns)) { a.weapon = w; a.nadeSel = ns; a.setWeaponMesh(); }
      if (!alive) continue;
      const buf = this.buf.get(nid) || [];
      buf.push({ t: s.ts, x, y, z, yaw, pitch });
      while (buf.length > 12) buf.shift();
      this.buf.set(nid, buf);
    }
    // my own inventory (don't fight local prediction right after firing / reloading)
    const me = s.me, p = this.player;
    if (me && p.alive && this.time - p.lastShot > 0.4 && p.reloadT <= 0 && !p.throwing) {
      p.inv = me.inv; p.nades = me.nades;
      if (!p.has(p.weapon)) p.equip(p.bestWeapon());
    }
    if (me) { p.punished = me.pun; p.nadeSel = p.weapon === 'nade' ? p.nadeSel : me.ns || p.nadeSel; }
    // flying grenades
    const seen = new Set();
    for (const [id, type, x, y, z] of s.n) {
      seen.add(id);
      let m = this.fly.get(id);
      if (!m) { m = grenadeObject(type); this.scene.add(m); this.fly.set(id, m); }
      m.position.set(x, y, z); m.rotation.x += 0.4;
    }
    for (const [id, m] of this.fly) if (!seen.has(id)) { this.scene.remove(m); this.fly.delete(id); }
  }

  applyEvent(e) {
    const A = (n) => (n >= 0 ? this.agents[n] : null), p = this.player;
    switch (e.e) {
      case 'rs': {
        this.round = e.round; this.phase = 'freeze'; this.timer = this.rules.freezeTime;
        this.grenades.clear();
        this.effects.clearDecals();
        for (const [nid, x, y, z, yaw, seq] of e.sp) {
          const a = this.agents[nid];
          a.resetForRound({ x, y, z }, yaw);
          a.spawnSeq = seq; a.throwing = null;
          this.buf.set(nid, [{ t: this.hostTime - 1, x, y, z, yaw, pitch: 0 }]);
        }
        this.startRound();
        this.bombMesh.visible = false;
        p.char.visible = false;
        this.emit('roundStart', { round: e.round });
        SFX.roundStart();
        break;
      }
      case 'live': this.phase = 'live'; this.timer = this.rules.roundTime; this.emit('live'); break;
      case 're': this.phase = 'end'; this.timer = this.rules.roundEndDelay; this.emit('roundEnd', { winner: e.winner, reason: e.reason }); SFX.roundEnd(e.winner === p.team); break;
      case 'k': {
        const v = A(e.victim), killer = A(e.killer);
        if (!v) break;
        v.alive = false; v.hp = 0; v.scoped = false; v.throwing = null;
        v.char.visible = true;
        v.char.startRagdoll({ x: 0, y: 0, z: 0 }, { x: e.imp[0], y: e.imp[1], z: e.imp[2] }, e.head ? 'head' : 'torso');
        if (e.tk && killer === p) p.strip();
        this.emit('kill', { killer, victim: v, weapon: e.weapon, head: e.head, teamkill: e.tk });
        break;
      }
      case 'm': this.emit('msg', { text: e.text, big: e.big, warn: e.warn, team: e.team }); break;
      case 'hu': if (e.nid === p.nid) { SFX.hurt(); this.emit('hurt', { agent: p, from: A(e.from), dmg: e.dmg }); } break;
      case 'sh':
        if (e.hit && !e.team) e.head ? SFX.headshot() : SFX.hitmarker();
        this.emit('shot', { agent: p, hit: e.hit, head: e.head, team: e.team, confirm: true });
        break;
      case 'fs': {
        const a = A(e.nid);
        if (!a || a === p) break;
        const m = new THREE.Vector3(e.m[0], e.m[1], e.m[2]);
        this.effects.shot(m, e.w, e.e2, a, false);
        a.char.kick = 1;
        const s = this.soundFrom(a.pos);
        SFX.gunshot(e.w, s.dist, s.pan);
        a.spotted = Math.max(a.spotted, 1.2);
        break;
      }
      case 'fm': { const a = A(e.nid); if (a && a !== p) { a.actionT = 0.001; if (this.soundFrom(a.pos).dist < 12) SFX.knifeSwing(); } break; }
      case 'fd': this.grenades.fx(e.type, e.x, e.y, e.z); break;
      case 'fl': if (e.nid === p.nid) { p.blindT = Math.max(p.blindT || 0, e.t); SFX.ringing(e.t); } break;
      case 'pl': SFX.plantDone(); this.emit('planted', { site: e.site }); this.bomb.timer = this.rules.bombTimer; break;
      case 'ex': {
        this.bombMesh.visible = false;
        this.effects.explode(new THREE.Vector3(this.bomb.pos.x, this.bomb.pos.y + 1, this.bomb.pos.z));
        ragdollBlast(this.bomb.pos.x, this.bomb.pos.y + 0.5, this.bomb.pos.z, 22, 11);
        SFX.explosion(this.soundFrom(this.bomb.pos).dist);
        this.bomb.state = 'exploded';
        break;
      }
      case 'mo': this.phase = 'over'; this.matchWinner = e.winner; this.emit('matchOver', { winner: e.winner }); break;
    }
  }

  // State packet for the host (sent ~30x/s)
  stateMsg() {
    const p = this.player;
    return {
      t: 'st', seq: p.spawnSeq, p: [+p.pos.x.toFixed(3), +p.pos.y.toFixed(3), +p.pos.z.toFixed(3)], v: [+p.vx.toFixed(2), +p.vz.toFixed(2), +p.vy.toFixed(2)],
      g: p.onGround ? 1 : 0, yaw: +p.yaw.toFixed(4), pitch: +p.pitch.toFixed(4), w: p.weapon, ns: p.nadeSel, sc: p.scoped ? 1 : 0, use: this.useHeld ? 1 : 0, cr: p.crouching ? 1 : 0,
    };
  }

  dispose() {
    for (const m of this.fly.values()) this.scene.remove(m);
    super.dispose();
  }
}

// ---------------- host-side serialization ----------------
export function snapshot(g, flyIds) {
  const A = (a) => (a ? a.nid : -1), b = g.bomb;
  const fx = (v) => +v.toFixed(3);
  return {
    t: 'snap', ts: +g.time.toFixed(3), ph: g.phase, tm: +g.timer.toFixed(2), r: g.round, sc: [g.score.T, g.score.CT],
    b: { st: b.state, c: A(b.carrier), si: b.site, pp: +(b.plantP || 0).toFixed(2), pl: A(b.planter), dp: +(b.defuseP || 0).toFixed(2), df: A(b.defuser), tm: +(b.timer || 0).toFixed(2), p: b.state === 'dropped' || b.state === 'planted' ? [fx(b.pos.x), fx(b.pos.y), fx(b.pos.z)] : null },
    a: g.agents.map((a) => [a.nid, fx(a.pos.x), fx(a.pos.y), fx(a.pos.z), +a.yaw.toFixed(3), +a.pitch.toFixed(3), a.alive ? 1 : 0, Math.max(0, Math.ceil(a.hp)), Math.ceil(a.armor), a.weapon, a.nadeSel,
      (a.scoped ? 1 : 0) | (a.onGround ? 2 : 0) | (a.hasKit ? 8 : 0) | (a.punishedActive ? 16 : 0) | (a.helmet ? 32 : 0) | (a.crouching ? 64 : 0), a.money, a.kills, a.deaths, a.teamkills || 0]),
    n: g.grenades.flying.map((n) => [flyIds(n), n.type, fx(n.pos.x), fx(n.pos.y), fx(n.pos.z)]),
  };
}
export function selfState(a) {
  return { inv: a.inv, nades: a.nades, pun: a.punished, ns: a.nadeSel };
}
export { GRENADES };
