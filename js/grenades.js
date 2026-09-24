import * as THREE from '../lib/three.module.min.js';
import { GRENADES } from './config.js';
import { world, pointBlocked, hasLOS, groundAt } from './world.js';
import { grenadeGeometry } from './weapons3d.js';
import { radialTex } from './textures.js';
import * as SFX from './audio.js';

const plain = new THREE.MeshLambertMaterial({ vertexColors: true });

// Thrown projectiles and their lingering effects (smoke clouds, fire patches).
export class Grenades {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.flying = [];
    this.smokes = [];
    this.fires = [];
    this.smokeTex = radialTex('rgba(210,210,205,1)', 'rgba(210,210,205,0)');
    this.fireTex = radialTex('rgba(255,210,90,1)', 'rgba(255,60,10,0)');
  }

  // Launch from an agent's eye along yaw/pitch. power 0..1 (short lob vs long throw)
  throw(a, type, power = 1) {
    const dir = new THREE.Vector3(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch));
    const speed = 7 + 11 * power;
    const pos = new THREE.Vector3(a.pos.x, a.eyeY - 0.1, a.pos.z).addScaledVector(dir, 0.4);
    const vel = dir.multiplyScalar(speed).add(new THREE.Vector3(a.vx * 0.5, 1.6, a.vz * 0.5));
    const mesh = new THREE.Mesh(grenadeGeometry(type), plain);
    mesh.position.copy(pos); this.scene.add(mesh);
    this.flying.push({ type, pos, vel, t: 0, owner: a, mesh, still: 0 });
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
        if (n.vel.length() > 2) SFX.nadeBounce(this.g.soundFrom(n.pos).dist);
      }
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += dt * 8; n.mesh.rotation.z += dt * 5;
      if (n.t >= def.fuse) { this.detonate(n); this.scene.remove(n.mesh); this.flying.splice(i, 1); }
    }

    // --- smoke clouds ---
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const grow = Math.min(1, s.t / 1.3), fade = s.t > s.dur - 2 ? Math.max(0, (s.dur - s.t) / 2) : 1;
      s.w.r = GRENADES.smoke.radius * grow * (fade > 0.3 ? 1 : fade / 0.3);
      for (const p of s.puffs) {
        p.sprite.position.set(s.x + p.ox * grow, s.y + p.oy * grow + Math.sin(s.t * 0.4 + p.ph) * 0.15, s.z + p.oz * grow);
        p.sprite.scale.setScalar(p.size * (0.4 + 0.6 * grow));
        p.sprite.material.opacity = 0.92 * fade;
      }
      if (s.t >= s.dur) {
        for (const p of s.puffs) this.scene.remove(p.sprite);
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
      for (const p of f.flames) {
        const flick = 0.75 + Math.sin(f.t * 14 + p.ph) * 0.25;
        p.sprite.scale.set(p.size * flick, p.size * 1.6 * flick, 1);
        p.sprite.material.opacity = fade;
      }
      if (f.tick <= 0) {
        f.tick = 0.25;
        SFX.fireCrackle(this.g.soundFrom(f).dist);
        for (const a of this.g.agents) {
          if (!a.alive || Math.hypot(a.pos.x - f.x, a.pos.z - f.z) > f.r || Math.abs(a.pos.y - f.y) > 1.2) continue;
          this.g.applyDamage(a, f.owner, 'molotov', GRENADES.molotov.dps * 0.25, false, null);
        }
      }
      if (f.t >= f.dur || put) {
        for (const p of f.flames) this.scene.remove(p.sprite);
        this.fires.splice(i, 1);
      }
    }
  }

  detonate(n) {
    const g = this.g, P = n.pos, snd = g.soundFrom(P);
    if (n.type === 'he') {
      const def = GRENADES.he;
      g.effects.explode(P.clone(), 0.45);
      SFX.heBoom(snd.dist);
      for (const a of g.agents) {
        if (!a.alive) continue;
        const d = Math.hypot(a.pos.x - P.x, a.pos.y + 1 - P.y, a.pos.z - P.z);
        if (d > def.radius || !hasLOS(P.x, P.y + 0.2, P.z, a.pos.x, a.pos.y + 1.1, a.pos.z, false)) continue;
        const dmg = def.damage * Math.pow(1 - d / def.radius, 1.4);
        const dir = new THREE.Vector3(a.pos.x - P.x, 0.6, a.pos.z - P.z).normalize().multiplyScalar(6);
        g.applyDamage(a, n.owner, 'he', dmg, false, dir);
      }
    } else if (n.type === 'flash') {
      g.effects.flash(P.clone(), 3.5);
      SFX.flashBang(snd.dist);
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
        a.blindMax = Math.max(a.blindT, a.blindMax || 0);
        if (a === g.player) { SFX.ringing(t); g.emit('flashed', { t }); }
        if (n.owner && n.owner !== a && a.team !== n.owner.team && a.isBot) a.ai.heard = { x: n.owner.pos.x, z: n.owner.pos.z, t: g.time };
      }
    } else if (n.type === 'smoke') {
      SFX.smokePop(snd.dist);
      const gy = groundAt(P.x, P.z, 0.2);
      const w = { x: P.x, y: gy + 1.5, z: P.z, r: 0 };
      world.smokes.push(w);
      const puffs = [];
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, rr = 1 + Math.random() * 2.6;
        const mat = new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, color: new THREE.Color().setHSL(0.1, 0.03, 0.55 + Math.random() * 0.15), opacity: 0 });
        const sp = new THREE.Sprite(mat);
        this.scene.add(sp);
        puffs.push({ sprite: sp, ox: Math.cos(a) * rr, oy: -0.6 + Math.random() * 2.6, oz: Math.sin(a) * rr, size: 3.5 + Math.random() * 2.5, ph: Math.random() * 6 });
      }
      this.smokes.push({ x: P.x, y: gy + 1.5, z: P.z, t: 0, dur: GRENADES.smoke.duration, puffs, w });
    } else if (n.type === 'molotov') {
      SFX.fireWhoosh(snd.dist);
      const gy = groundAt(P.x, P.z, 0.2);
      const flames = [];
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * GRENADES.molotov.radius;
        const fx = P.x + Math.cos(a) * rr, fz = P.z + Math.sin(a) * rr;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fireTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        const size = 0.8 + Math.random() * 0.8;
        sp.position.set(fx, groundAt(fx, fz, 0.1) + size * 0.7, fz);
        this.scene.add(sp);
        flames.push({ sprite: sp, size, ph: Math.random() * 6 });
      }
      this.fires.push({ x: P.x, y: gy, z: P.z, r: GRENADES.molotov.radius, t: 0, dur: GRENADES.molotov.duration, tick: 0, flames, owner: n.owner });
    }
  }

  inFire(a) {
    return this.fires.find((f) => Math.hypot(a.pos.x - f.x, a.pos.z - f.z) < f.r + 0.6 && Math.abs(a.pos.y - f.y) < 1.2) || null;
  }

  clear() {
    for (const n of this.flying) this.scene.remove(n.mesh);
    for (const s of this.smokes) for (const p of s.puffs) this.scene.remove(p.sprite);
    for (const f of this.fires) for (const p of f.flames) this.scene.remove(p.sprite);
    this.flying = []; this.smokes = []; this.fires = [];
    world.smokes.length = 0;
  }
}
