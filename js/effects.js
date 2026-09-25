import * as THREE from '../lib/three.module.min.js';
import { puffTex, flashTex, decalAtlas, radialTex } from './textures.js';
import * as W from './world.js';
import { ragdollShot } from './character.js';

// Pooled short-lived visual effects. Everything is preallocated so combat never allocates
// meshes or materials: sprites for flashes/smoke, two point clouds for sparks and debris,
// instanced decals (bullet holes, blood, scorch marks) and instanced shell casings.

// Surface codes shared with the network layer: 0 miss, 1 agent, 2 floor, 3..6 wall (+x,-x,+z,-z), 7 ceiling
export function surfKind(hit) {
  if (hit.ny > 0.5) return 2;
  if (hit.ny < -0.5) return 7;
  if (hit.nx > 0.5) return 3;
  if (hit.nx < -0.5) return 4;
  if (hit.nz > 0.5) return 5;
  if (hit.nz < -0.5) return 6;
  return 3;
}
const NORMALS = [null, null, [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]];

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1), _rq = new THREE.Quaternion();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

class ParticleCloud {
  constructor(scene, n, size, additive) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3).fill(-999); this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.base = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, map: radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), alphaTest: additive ? 0 : 0.2 }));
    this.pts.frustumCulled = false; this.pts.visible = false;
    this.alive = 0; this.additive = additive;
    scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, life, r, g, b) {
    const i = this.i++ % this.n, k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.base[k] = r; this.base[k + 1] = g; this.base[k + 2] = b;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.life[i] = this.max[i] = life;
    this.alive = Math.max(this.alive, life); this.pts.visible = true;
  }
  update(dt, grav) {
    if (this.alive <= 0) return;
    this.alive -= dt;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[k + 1] = -999; continue; }
      this.vel[k + 1] -= grav * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = this.additive ? this.life[i] / this.max[i] : 1;
      this.col[k] = this.base[k] * f; this.col[k + 1] = this.base[k + 1] * f; this.col[k + 2] = this.base[k + 2] * f;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.geometry.attributes.color.needsUpdate = true;
    if (this.alive <= 0) this.pts.visible = false;
  }
}

export class Effects {
  constructor(scene, camera = null, opts = {}) {
    this.scene = scene; this.camera = camera;
    this.quality = opts.quality || 'medium';
    const T = opts.theme || {};
    this.dust = T.ground === 'concrete' ? 0xb8b8b0 : T.ground === 'cobble' ? 0xc4b294 : 0xd0b88a;
    this.shake = 0;
    this.tracers = []; this.puffs = []; this.flashes = []; this.fires = [];

    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 40; i++) {
      const l = new THREE.Line(tracerGeo.clone(), tracerMat.clone());
      l.frustumCulled = false; l.visible = false;
      scene.add(l); this.tracers.push({ obj: l, t: 0 });
    }
    const pt = puffTex();
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pt, transparent: true, depthWrite: false }));
      s.visible = false; scene.add(s); this.puffs.push({ obj: s, t: 0, life: 0, grow: 0, vy: 0, vx: 0, vz: 0, op: 0.7, size: 0 });
    }
    const ft = flashTex();
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false; scene.add(s); this.flashes.push({ obj: s, t: 0, life: 0.05 });
    }
    // fireballs for explosions
    const fireTex = radialTex('rgba(255,236,170,1)', 'rgba(255,90,10,0)');
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false; scene.add(s); this.fires.push({ obj: s, t: 0, life: 0, size: 0, vx: 0, vy: 0, vz: 0 });
    }
    this.sparks = new ParticleCloud(scene, 240, 0.07, true);
    this.chips = new ParticleCloud(scene, 200, 0.06, false);

    // decals: one instanced mesh per atlas cell (3 holes, scorch, 4 blood)
    const atlas = decalAtlas();
    const dmat = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.decals = [];
    for (let c = 0; c < 8; c++) {
      const g = new THREE.PlaneGeometry(1, 1), uv = g.attributes.uv;
      const u0 = (c % 4) / 4, v0 = c < 4 ? 0.5 : 0;           // top row = holes/scorch (canvas top = v 1)
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.25, v0 + uv.getY(k) * 0.5);
      const cap = c < 3 ? 48 : c === 3 ? 8 : 14;
      const im = new THREE.InstancedMesh(g, dmat, cap);
      im.count = 0; im.visible = false; im.frustumCulled = false; im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(im); this.decals.push({ im, cap, next: 0 });
    }

    // brass casings
    this.casingMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6), new THREE.MeshLambertMaterial({ color: 0xc9a043, emissive: 0x3a2a08 }), 32);
    this.casingMesh.frustumCulled = false; this.casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 32; i++) this.casingMesh.setMatrixAt(i, HIDE);
    scene.add(this.casingMesh);
    this.casings = Array.from({ length: 32 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), t: 0, rest: false }));
    this.ci = 0;

    // one muzzle light (always present so toggling it never recompiles shaders)
    if (this.quality !== 'low') {
      this.light = new THREE.PointLight(0xffb060, 0, 9, 2);
      this.light.position.set(0, -50, 0); scene.add(this.light); this.lightT = 0;
    }

    // drifting dust motes in the air around the camera
    if (this.quality !== 'low' && camera) {
      const n = 140, p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 20; p[i * 3 + 1] = Math.random() * 6; p[i * 3 + 2] = (Math.random() - 0.5) * 20; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.motes = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.035, color: 0xfff0d0, transparent: true, opacity: 0.45, depthWrite: false, map: radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)') }));
      this.motes.frustumCulled = false; scene.add(this.motes);
    }
    this.ti = this.pi = this.fi = this.bi = 0;
  }

  // Compile every effect shader up front so the first gunshot or explosion doesn't hitch
  precompile(renderer, camera) {
    const objs = [this.tracers[0].obj, this.puffs[0].obj, this.flashes[0].obj, this.fires[0].obj, this.sparks.pts, this.chips.pts, this.decals[0].im, this.casingMesh];
    const was = objs.map((o) => o.visible), cnt = this.decals[0].im.count;
    objs.forEach((o) => { o.visible = true; });
    this.decals[0].im.count = 1;
    try { renderer.compile(this.scene, camera); } catch { /* compile is best-effort */ }
    objs.forEach((o, i) => { o.visible = was[i]; });
    this.decals[0].im.count = cnt;
  }

  // ---------- primitives ----------
  tracer(a, b) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    const p = t.obj.geometry.attributes.position;
    // start a little ahead of the muzzle so it reads as a streak rather than a laser
    _v.subVectors(b, a); const len = _v.length();
    const s = Math.min(0.9, len * 0.3) / (len || 1);
    p.setXYZ(0, a.x + _v.x * s, a.y + _v.y * s, a.z + _v.z * s); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
    t.obj.visible = true; t.t = 0.06; t.obj.material.opacity = 0.9;
  }

  puff(pos, color, size = 0.35, life = 0.35, vy = 0.4, opacity = 0.7, vx = 0, vz = 0) {
    const p = this.puffs[this.pi++ % this.puffs.length];
    p.obj.position.copy(pos); p.obj.material.color.setHex(color);
    p.obj.material.rotation = Math.random() * 6.28;
    p.obj.scale.setScalar(size); p.obj.visible = true;
    p.t = p.life = life; p.grow = size * 2.2; p.vy = vy; p.vx = vx; p.vz = vz; p.op = opacity;
  }

  flash(pos, size = 0.45, life = 0.05) {
    const f = this.flashes[this.fi++ % this.flashes.length];
    f.obj.position.copy(pos); f.obj.scale.setScalar(size * (0.8 + Math.random() * 0.4));
    f.obj.material.rotation = Math.random() * 6.28;
    f.obj.visible = true; f.t = f.life = life;
  }

  pointLight(pos, intensity, t = 0.06) {
    if (!this.light) return;
    if (this.camera && this.camera.position.distanceToSquared(pos) > 900) return;
    this.light.position.copy(pos); this.light.intensity = intensity; this.lightT = t; this.lightI = intensity; this.lightDur = t;
  }

  decal(cell, pos, normal, size, spin = Math.random() * 6.28) {
    const d = this.decals[cell];
    _q.setFromUnitVectors(_z, normal); _rq.setFromAxisAngle(_z, spin); _q.multiply(_rq);
    _v.copy(pos).addScaledVector(normal, 0.012);
    _m.compose(_v, _q, _s.set(size, size, size));
    d.im.setMatrixAt(d.next, _m);
    d.next = (d.next + 1) % d.cap;
    d.im.count = Math.min(d.cap, d.im.count + 1); d.im.visible = true;
    d.im.instanceMatrix.needsUpdate = true;
  }

  clearDecals() {
    for (const d of this.decals) { d.im.count = 0; d.im.visible = false; d.next = 0; }
    for (let i = 0; i < 32; i++) { this.casings[i].t = 0; this.casingMesh.setMatrixAt(i, HIDE); }
    this.casingMesh.instanceMatrix.needsUpdate = true;
  }

  casing(pos, yaw) {
    if (this.camera && this.camera.position.distanceToSquared(pos) > 400) return;
    const c = this.casings[this.ci++ % 32];
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);        // shooter's right
    c.p.copy(pos).addScaledVector(_v.set(rx, 0, rz), 0.05);
    c.v.set(rx * (1.6 + Math.random()) + Math.sin(yaw) * 0.4, 1.8 + Math.random(), rz * (1.6 + Math.random()) + Math.cos(yaw) * 0.4);
    c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); c.w.set(20 * Math.random(), 25, 15 * Math.random());
    c.t = 4; c.rest = false;
  }

  // Bullet impact on the map (kind = surface code)
  impact(end, kind, strong = false) {
    const nn = NORMALS[kind];
    if (!nn) return;
    _n.set(nn[0], nn[1], nn[2]);
    const floor = kind === 2;
    this.puff(_v.copy(end).addScaledVector(_n, 0.08), this.dust, floor ? 0.22 : 0.18, 0.5, 0.35, 0.65);
    const c = new THREE.Color(this.dust);
    for (let k = 0; k < (strong ? 6 : 3); k++) {
      this.chips.emit(end.x + _n.x * 0.03, end.y + _n.y * 0.03, end.z + _n.z * 0.03,
        _n.x * 2 + (Math.random() - 0.5) * 2.4, _n.y * 2 + Math.random() * 2.2, _n.z * 2 + (Math.random() - 0.5) * 2.4, 0.45 + Math.random() * 0.3, c.r * 0.7, c.g * 0.7, c.b * 0.7);
    }
    if (Math.random() < 0.45) for (let k = 0; k < 3; k++) {
      this.sparks.emit(end.x, end.y, end.z, _n.x * 3 + (Math.random() - 0.5) * 5, _n.y * 3 + Math.random() * 3, _n.z * 3 + (Math.random() - 0.5) * 5, 0.12 + Math.random() * 0.12, 1, 0.75, 0.35);
    }
    this.decal(Math.floor(Math.random() * 3), end, _n, 0.2 + Math.random() * 0.06);
  }

  // Hit on a player: blood mist, droplets and a splat on the surface behind them
  blood(end, dir, heavy = false) {
    this.puff(end, 0x8a0c0c, heavy ? 0.35 : 0.25, 0.35, 0.1, 0.8);
    for (let k = 0; k < (heavy ? 10 : 5); k++) {
      this.chips.emit(end.x, end.y, end.z, dir.x * 2.5 + (Math.random() - 0.5) * 2, Math.random() * 1.8, dir.z * 2.5 + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 0.3, 0.45, 0.02, 0.02);
    }
    const hit = W.raycast(end.x, end.y, end.z, dir.x, dir.y - 0.25, dir.z, 3);
    if (hit.dist < 3) {
      const len = Math.hypot(dir.x, dir.y - 0.25, dir.z);
      _v.set(end.x + dir.x / len * hit.dist, end.y + (dir.y - 0.25) / len * hit.dist, end.z + dir.z / len * hit.dist);
      this.decal(4 + Math.floor(Math.random() * 4), _v, _n.set(hit.nx, hit.ny, hit.nz), (heavy ? 1.1 : 0.7) + Math.random() * 0.4);
    }
  }

  // Everything a gunshot draws. ends: [[x, y, z, kind], ...]
  shot(muzzle, weaponId, ends, shooter = null, local = false) {
    for (const [x, y, z, kind] of ends) {
      const end = new THREE.Vector3(x, y, z);
      this.tracer(muzzle, end);
      if (kind === 1) this.blood(end, _n.subVectors(end, muzzle).normalize().clone(), weaponId === 'sniper' || weaponId === 'shotgun');
      else if (kind) this.impact(end, kind, weaponId === 'sniper');
      if (kind !== 1) ragdollShot(muzzle, end, weaponId === 'sniper' ? 5 : weaponId === 'shotgun' ? 2.5 : 1.6);   // shots jolt bodies they pass through
    }
    const big = weaponId === 'shotgun' || weaponId === 'sniper';
    this.flash(muzzle, big ? 0.75 : 0.5);
    this.puff(muzzle, 0xbdbdb8, big ? 0.22 : 0.14, 0.45, 0.5, 0.35);
    this.pointLight(muzzle, big ? 7 : 4.5);
    if (shooter && weaponId !== 'shotgun') this.casing(local && this.camera ? _v.copy(this.camera.position).addScaledVector(_s.set(0, -0.25, 0), 1) : muzzle, shooter.yaw);
  }

  explode(pos, scale = 1) {
    this.flash(pos, 9 * scale, 0.12);
    this.pointLight(pos, 30 * scale, 0.35);
    for (let i = 0; i < 9; i++) {
      const f = this.fires[this.bi++ % this.fires.length];
      f.obj.position.copy(pos).add(_v.set((Math.random() - 0.5) * 2 * scale, Math.random() * 1.2 * scale, (Math.random() - 0.5) * 2 * scale));
      f.vx = (Math.random() - 0.5) * 6 * scale; f.vy = (1 + Math.random() * 3) * scale; f.vz = (Math.random() - 0.5) * 6 * scale;
      f.size = (3 + Math.random() * 3) * scale; f.t = f.life = 0.45 + Math.random() * 0.25; f.obj.visible = true;
    }
    for (let i = 0; i < 14; i++) {
      const p = _v.set(pos.x + (Math.random() - 0.5) * 4 * scale, pos.y + Math.random() * 3 * scale, pos.z + (Math.random() - 0.5) * 4 * scale);
      this.puff(p, i % 3 ? 0x4a4642 : 0x7a6a58, (2.4 + Math.random() * 1.6) * scale * 1.4, 2.4 + Math.random() * 1.4, 1.1, 0.75, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5);
    }
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * 6.28, up = Math.random();
      this.sparks.emit(pos.x, pos.y, pos.z, Math.cos(a) * (4 + Math.random() * 10) * scale, (2 + up * 9) * scale, Math.sin(a) * (4 + Math.random() * 10) * scale, 0.4 + Math.random() * 0.6, 1, 0.6 + Math.random() * 0.3, 0.2);
    }
    const dc = new THREE.Color(this.dust);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * 6.28;
      this.chips.emit(pos.x, pos.y, pos.z, Math.cos(a) * 6 * scale, (3 + Math.random() * 6) * scale, Math.sin(a) * 6 * scale, 0.9 + Math.random() * 0.5, dc.r * 0.55, dc.g * 0.55, dc.b * 0.55);
    }
    const gy = W.groundAt(pos.x, pos.z, 0.05);
    if (pos.y - gy < 2.5) this.decal(3, _v.set(pos.x, gy, pos.z), _n.set(0, 1, 0), 3.5 * Math.max(0.6, scale));
    if (this.camera) {
      const d = this.camera.position.distanceTo(pos);
      this.shake = Math.max(this.shake, Math.min(1, (scale * 22) / (d + 4) - 0.1));
    }
  }

  update(dt) {
    for (const t of this.tracers) if (t.obj.visible) {
      t.t -= dt; t.obj.material.opacity = Math.max(0, t.t / 0.06) * 0.9;
      if (t.t <= 0) t.obj.visible = false;
    }
    for (const p of this.puffs) if (p.obj.visible) {
      p.t -= dt;
      const k = 1 - p.t / p.life;
      p.obj.material.opacity = Math.max(0, 1 - k) * p.op * Math.min(1, k * 8 + 0.3);
      p.obj.scale.setScalar(p.grow * (0.45 + Math.sqrt(k) * 0.55));
      p.obj.position.x += p.vx * dt; p.obj.position.y += p.vy * dt; p.obj.position.z += p.vz * dt;
      p.vx *= 0.97; p.vz *= 0.97;
      if (p.t <= 0) p.obj.visible = false;
    }
    for (const f of this.flashes) if (f.obj.visible) {
      f.t -= dt; f.obj.material.opacity = Math.max(0, f.t / f.life);
      if (f.t <= 0) f.obj.visible = false;
    }
    for (const f of this.fires) if (f.obj.visible) {
      f.t -= dt;
      const k = 1 - f.t / f.life;
      f.obj.scale.setScalar(f.size * (0.4 + k * 0.8));
      f.obj.material.opacity = Math.max(0, 1 - k * k);
      f.obj.material.color.setRGB(1, 1 - k * 0.5, 1 - k * 0.9);
      f.obj.position.x += f.vx * dt; f.obj.position.y += f.vy * dt; f.obj.position.z += f.vz * dt;
      if (f.t <= 0) f.obj.visible = false;
    }
    this.sparks.update(dt, 9.8);
    this.chips.update(dt, 12);
    if (this.light && this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity = Math.max(0, this.lightT / this.lightDur) * this.lightI;
    }
    // casings
    let moved = false;
    for (let i = 0; i < 32; i++) {
      const c = this.casings[i];
      if (c.t <= 0) continue;
      c.t -= dt; moved = true;
      if (c.t <= 0) { this.casingMesh.setMatrixAt(i, HIDE); continue; }
      if (!c.rest) {
        c.v.y -= 11 * dt;
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
        const gy = W.groundAt(c.p.x, c.p.z, 0.02) + 0.006;
        if (c.p.y < gy) {
          c.p.y = gy;
          if (Math.abs(c.v.y) < 1) { c.rest = true; c.r.x = Math.PI / 2; c.r.z = 0; }
          else { c.v.y *= -0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.5); }
        }
      }
      _q.setFromEuler(c.r);
      this.casingMesh.setMatrixAt(i, _m.compose(c.p, _q, _s.set(1, 1, 1)));
    }
    if (moved) this.casingMesh.instanceMatrix.needsUpdate = true;
    // dust motes follow the camera, wrapping inside a box around it
    if (this.motes && this.camera) {
      const p = this.motes.geometry.attributes.position, a = p.array, c = this.camera.position, t = performance.now() / 1000;
      for (let i = 0; i < a.length; i += 3) {
        a[i] += Math.sin(t * 0.3 + i) * 0.05 * dt + 0.08 * dt; a[i + 1] += Math.cos(t * 0.23 + i * 0.7) * 0.04 * dt; a[i + 2] += Math.sin(t * 0.17 + i * 1.3) * 0.05 * dt;
        for (let k = 0; k < 3; k++) {
          const lo = k === 1 ? c.y - 2 : c.getComponent(k) - 10, hi = k === 1 ? c.y + 4 : c.getComponent(k) + 10, span = hi - lo;
          if (a[i + k] < lo) a[i + k] += span; else if (a[i + k] > hi) a[i + k] -= span;
        }
      }
      p.needsUpdate = true;
    }
    this.shake = Math.max(0, this.shake - dt * 1.8);
  }
}
