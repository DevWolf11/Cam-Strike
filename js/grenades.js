import * as THREE from '../lib/three.module.min.js';
import { GRENADES } from './config.js';
import { world, pointBlocked, hasLOS, groundAt } from './world.js';
import { grenadeObject } from './weapons3d.js';
import { glowTex } from './particles.js';
import * as SFX from './audio.js';
import { ragdollBlast } from './character.js';


const _lp = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// Thrown projectiles and their lingering effects (smoke clouds, fire patches).
export class Grenades {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.flying = [];
    this.smokes = [];
    this.fires = [];
    this.glowTex = glowTex();
    this.visualOnly = false;      // network clients only draw; the host decides damage
  }

  // Launch from an agent's eye along yaw/pitch. power 0..1 (short lob vs long throw)
  throw(a, type, power = 1) {
    const dir = new THREE.Vector3(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch));
    const speed = 9 + 15 * power;           // up to 24 m/s: a full throw carries ~35m
    const pos = new THREE.Vector3(a.pos.x, a.eyeY - 0.1, a.pos.z).addScaledVector(dir, 0.4);
    const vel = dir.multiplyScalar(speed).add(new THREE.Vector3(a.vx * 0.5, 2.0, a.vz * 0.5));
    const mesh = grenadeObject(type);
    mesh.position.copy(pos); this.scene.add(mesh);
    this.flying.push({ type, pos, vel, t: 0, owner: a, mesh, still: 0, spin: new THREE.Vector3(8 + Math.random() * 4, (Math.random() - 0.5) * 6, 5 + Math.random() * 3), bounceT: 0 });
    const s = a === this.g.player ? null : this.g.soundFrom(a.pos, 1.4);
    if (!s || s.dist < 12) SFX.throwWhoosh(s);
    a.nades[type]--;
  }

  update(dt) {
    // --- projectiles ---
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const n = this.flying[i], def = GRENADES[n.type];
      n.t += dt;
      const sub = 3, h = dt / sub;
      for (let s = 0; s < sub; s++) {
        n.vel.y -= 16 * h;
        const nx = n.pos.x + n.vel.x * h, ny = n.pos.y + n.vel.y * h, nz = n.pos.z + n.vel.z * h;
        if (!pointBlocked(nx, ny, nz)) { n.pos.set(nx, ny, nz); continue; }
        // find which axis we hit and bounce off it
        let bounced = false;
        if (pointBlocked(nx, n.pos.y, n.pos.z)) { n.vel.x *= -0.45; bounced = true; }
        if (pointBlocked(n.pos.x, n.pos.y, nz)) { n.vel.z *= -0.45; bounced = true; }
        if (pointBlocked(n.pos.x, ny, n.pos.z)) {
          const floorHit = n.vel.y < 0;
          n.vel.y *= -0.35; n.vel.x *= 0.7; n.vel.z *= 0.7; bounced = true;
          if (floorHit && n.type === 'molotov') { n.t = 99; break; }
        }
        if (!bounced) { n.vel.multiplyScalar(-0.3); }
        const v = n.vel.length();
        if (v > 1.2 && n.t - n.bounceT > 0.06) { n.bounceT = n.t; const s = this.g.soundFrom(n.pos, 0); SFX.nadeBounce(s.dist, s.pan, v, s.occl); }
        n.spin.multiplyScalar(0.55);
      }
      n.mesh.position.copy(n.pos);
      // tumbles in the air, rolls to a stop on the ground
      const onGround = Math.abs(n.vel.y) < 0.4 && pointBlocked(n.pos.x, n.pos.y - 0.08, n.pos.z);
      if (onGround) { n.spin.multiplyScalar(Math.max(0, 1 - dt * 6)); n.vel.x *= Math.max(0, 1 - dt * 2.5); n.vel.z *= Math.max(0, 1 - dt * 2.5); }
      n.mesh.rotation.x += dt * n.spin.x; n.mesh.rotation.y += dt * n.spin.y; n.mesh.rotation.z += dt * n.spin.z;
      // a molotov's rag burns in flight: small flames shed from the neck trail behind it
      if (n.type === 'molotov' && (n.fl = (n.fl || 0) - dt) <= 0) {
        n.fl = 0.03; n.mesh.updateMatrixWorld(); n.mesh.localToWorld(_lp.set(0, 0.155, 0));
        this.g.effects.flame({ x: _lp.x, y: _lp.y, z: _lp.z, vy: 0.4, size: 0.13 + Math.random() * 0.06, life: 0.2 + Math.random() * 0.1, fadeIn: 0.03, fadeOut: 0.12, alpha: 0.85 });
      }
      if (n.t >= def.fuse && !this.visualOnly) { this.detonate(n); this.scene.remove(n.mesh); this.flying.splice(i, 1); }
    }

    // --- smoke clouds ---
    const E = this.g.effects, blocked = (x, y, z) => pointBlocked(x, y, z);
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const grow = Math.min(1, s.t / 1.3), fade = s.t > s.dur - 2 ? Math.max(0, (s.dur - s.t) / 2) : 1;
      s.w.r = GRENADES.smoke.radius * grow * (fade > 0.3 ? 1 : fade / 0.3);
      // the canister vents for the first 1.4 s: puffs burst out, slow down, pile up against walls and
      // fill the space (a dome ~4 m wide and ~5 m tall, matching the cloud that blocks sight)
      const N = E.quality === 'low' ? 30 : 46, want = Math.min(N, Math.floor(s.t / 1.4 * N));
      while (s.n < want) {
        const k = s.n++, a = k * 2.399 + Math.random() * 0.5, el = Math.acos(1 - Math.random() * 0.85);   // more sideways than up
        const sp = (k % 4 === 0 ? 1.5 : 5.5) + Math.random() * 4.5, h = Math.sin(el), up = Math.cos(el);    // every 4th fills the core
        const shade = 0.78 + Math.random() * 0.12, c = Math.round(shade * 255);
        E.smokePuff({ x: s.x, y: s.y + 0.4, z: s.z, vx: Math.cos(a) * h * sp, vy: up * sp * 0.75, vz: Math.sin(a) * h * sp,
          drag: 2.1, lift: 0.04, wander: 0.35, collide: blocked, size: 1.2, grow: 3.4, maxSize: (3.6 + Math.random() * 1.6) * (N < 40 ? 1.15 : 1),
          life: s.dur - s.t + Math.random() * 1.2, alpha: 0.93, fadeIn: 0.15, fadeOut: 2.6, spin: (Math.random() - 0.5) * 0.12 }, (c << 16) | (c << 8) | Math.round(c * 0.97));
      }
      if (s.t >= s.dur) {
        world.smokes.splice(world.smokes.indexOf(s.w), 1);
        this.smokes.splice(i, 1);
      }
    }

    // --- fires ---
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt; f.tick -= dt;
      const put = world.smokes.some((s) => s.r > 1 && Math.hypot(s.x - f.x, s.z - f.z) < s.r + f.r * 0.5);
      const fade = f.t > f.dur - 1 ? Math.max(0, f.dur - f.t) : 1;
      // the burning pool spreads from where the bottle broke; flames keep springing up across it
      const spread = Math.min(f.r, 0.7 + f.t * 9);
      f.acc += dt * (28 + 72 * (spread / f.r) ** 2) * fade;
      while (f.acc >= 1) {
        f.acc--;
        const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * spread, x = f.x + Math.cos(a) * rr, z = f.z + Math.sin(a) * rr;
        const gy = groundAt(x, z, f.y + 0.4);
        if (Math.abs(gy - f.y) > 0.6 || pointBlocked(x, gy + 0.2, z)) continue;
        const edge = 1 - 0.5 * rr / f.r, low = Math.random() < 0.35, w = (low ? 0.9 + Math.random() * 0.5 : 0.5 + Math.random() * 0.55) * edge;
        // tall tongues plus low, wide ones that make a burning carpet between them
        E.flame({ x, y: gy - 0.08, z, vy: 0.3 + Math.random() * 0.3, size: w, aspect: low ? 1.1 : 2, grow: -0.15, life: 0.5 + Math.random() * 0.4, fadeIn: 0.08, fadeOut: 0.25, alpha: low ? 0.55 : 0.7 });
      }
      f.glow.material.opacity = (0.32 + Math.sin(f.t * 17) * 0.05 + Math.sin(f.t * 7.3) * 0.05) * fade * Math.min(1, spread / f.r * 1.5);
      f.glow.scale.setScalar(spread * 2.4);
      E.glowLight(_lp.set(f.x, f.y + 0.9, f.z), (6 + Math.sin(f.t * 21) * 1.2 + Math.sin(f.t * 9) * 1.2) * fade);
      // smoke and embers rising off the flames
      f.smokeT = (f.smokeT || 0) - dt;
      if (f.smokeT <= 0 && fade > 0.2) {
        f.smokeT = 0.14;
        const a = Math.random() * 6.283, rr = Math.random() * spread * 0.8, x = f.x + Math.cos(a) * rr, z = f.z + Math.sin(a) * rr;
        E.smokePuff({ x, y: f.y + 1.2, z, vy: 1.6 + Math.random(), vx: (Math.random() - 0.5) * 0.5, vz: (Math.random() - 0.5) * 0.5, drag: 0.3,
          size: 1.1, grow: 1.1, life: 2.4 + Math.random(), alpha: 0.4, fadeIn: 0.4, fadeOut: 1.4 }, 0x2c2926);
        E.sparks.emit(x, f.y + 0.3, z, (Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.6, 1, 0.55, 0.15);
      }
      if (f.snd) { f.sndT = (f.sndT || 0) - dt; if (f.sndT <= 0) { f.sndT = 0.15; f.snd.set(this.g.soundFrom(f, 0.5), fade); } }
      if (f.tick <= 0 && !this.visualOnly) {
        f.tick = 0.25;
        for (const a of this.g.agents) {
          if (!a.alive || Math.hypot(a.pos.x - f.x, a.pos.z - f.z) > f.r || Math.abs(a.pos.y - f.y) > 1.2) continue;
          this.g.applyDamage(a, f.owner, 'molotov', GRENADES.molotov.dps * 0.25, false, null);
        }
      }
      if (f.t >= f.dur || put) {
        if (f.snd) f.snd.stop();
        if (put) { const s = this.g.soundFrom(f, 0.5); SFX.smokePop(s.dist, s.pan, s.occl); }
        this.scene.remove(f.glow); f.glow.material.dispose();
        this.fires.splice(i, 1);
      }
    }
  }

  // Host: apply the grenade's gameplay effect, then show it everywhere.
  detonate(n) {
    const g = this.g, P = n.pos;
    if (n.type === 'he') {
      const def = GRENADES.he;
      for (const a of g.agents) {
        if (!a.alive) continue;
        const d = Math.hypot(a.pos.x - P.x, a.pos.y + 1 - P.y, a.pos.z - P.z);
        if (d > def.radius || !hasLOS(P.x, P.y + 0.2, P.z, a.pos.x, a.pos.y + 1.1, a.pos.z, false)) continue;
        const dmg = def.damage * Math.pow(1 - d / def.radius, 1.1);
        const dir = new THREE.Vector3(a.pos.x - P.x, 0.6, a.pos.z - P.z).normalize().multiplyScalar(6);
        g.applyDamage(a, n.owner, 'he', dmg, false, dir);
      }
    } else if (n.type === 'flash') {
      for (const a of g.agents) {
        if (!a.alive) continue;
        const ex = a.pos.x, ey = a.eyeY, ez = a.pos.z;
        const d = Math.hypot(ex - P.x, ey - P.y, ez - P.z);
        if (d > GRENADES.flash.radius || !hasLOS(P.x, P.y + 0.1, P.z, ex, ey, ez)) continue;
        // how directly the victim is looking at the flash
        const fx = -Math.sin(a.yaw) * Math.cos(a.pitch), fy = Math.sin(a.pitch), fz = -Math.cos(a.yaw) * Math.cos(a.pitch);
        const dot = ((P.x - ex) * fx + (P.y - ey) * fy + (P.z - ez) * fz) / (d || 1);
        const facing = dot > 0.5 ? 1 : dot > 0 ? 0.6 : 0.25;
        const t = 4.2 * facing * (1 - d / GRENADES.flash.radius * 0.6);
        if (t < 0.3) continue;
        a.blindT = Math.max(a.blindT || 0, t);
        if (a === g.player) SFX.ringing(t);
        if (a.human) g.emit('flashed', { agent: a, t });
        if (n.owner && n.owner !== a && a.team !== n.owner.team && a.isBot) a.ai.heard = { x: n.owner.pos.x, z: n.owner.pos.z, t: g.time };
      }
    }
    const fx = this.fx(n.type, P.x, P.y, P.z, n.owner);
    g.emit('fxDetonate', { type: n.type, x: P.x, y: P.y, z: P.z, owner: n.owner });
    return fx;
  }

  // Visuals + sound of a detonation (runs on host and clients)
  fx(type, x, y, z, owner = null) {
    const g = this.g, P = new THREE.Vector3(x, y, z), snd = g.soundFrom(P, 0.3);
    if (type === 'he') {
      g.effects.explode(P.clone(), 0.55);
      ragdollBlast(P.x, P.y, P.z, GRENADES.he.radius, 5.5);
      SFX.heBoom(snd.dist, snd.pan, snd.occl);
    } else if (type === 'flash') {
      g.effects.flashBurst(P.clone().setY(P.y + 0.15));
      SFX.flashBang(snd.dist, snd.pan, snd.occl);
    } else if (type === 'smoke') {
      SFX.smokePop(snd.dist, snd.pan, snd.occl);
      const gy = groundAt(P.x, P.z, P.y + 0.3);
      const w = { x: P.x, y: gy + 1.5, z: P.z, r: 0 };
      world.smokes.push(w);
      this.smokes.push({ x: P.x, y: gy, z: P.z, t: 0, dur: GRENADES.smoke.duration, n: 0, w });
    } else if (type === 'molotov') {
      SFX.fireWhoosh(snd.dist, snd.pan, snd.occl);
      const gy = groundAt(P.x, P.z, P.y + 0.3), r = GRENADES.molotov.radius;
      g.effects.decal(3, _lp.set(P.x, gy, P.z), _up, r * 1.7);
      // splash of burning fuel
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * 6.283, v = 2 + Math.random() * 4;
        g.effects.flame({ x: P.x, y: gy, z: P.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 1.5, drag: 3, size: 0.8 + Math.random() * 0.5, life: 0.5, fadeOut: 0.3 });
      }
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(P.x, gy + 0.04, P.z); glow.renderOrder = 1;
      this.scene.add(glow);
      const fire = { x: P.x, y: gy, z: P.z, r, t: 0, dur: GRENADES.molotov.duration, tick: 0, acc: 0, glow, owner, snd: SFX.fireLoop() };
      if (fire.snd) fire.snd.set(snd, 1);
      this.fires.push(fire);
    }
  }

  inFire(a) {
    return this.fires.find((f) => Math.hypot(a.pos.x - f.x, a.pos.z - f.z) < f.r + 0.6 && Math.abs(a.pos.y - f.y) < 1.2) || null;
  }

  clear() {
    for (const n of this.flying) this.scene.remove(n.mesh);
    for (const f of this.fires) { this.scene.remove(f.glow); f.glow.material.dispose(); if (f.snd) f.snd.stop(); }
    this.flying = []; this.smokes = []; this.fires = [];
    world.smokes.length = 0;
  }
}
