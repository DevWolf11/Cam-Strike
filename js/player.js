import * as THREE from '../lib/three.module.min.js';
import { WEAPONS } from './config.js';
import { input, consume } from './input.js';
import { weaponMesh, MUZZLE, setViewmodelEnv, gunMeta } from './weapons3d.js';
import { FPArms, armsReady, handSpec } from './fparms.js';
import { armMesh } from './hands.js';
import { fabricTex } from './textures.js';
import * as W from './world.js';

const BASE_FOV = 78;
// Left hand position on each long gun's handguard: [forward, height]
const FORE = { smg: [0.3, 0.054], shotgun: [0.34, 0.035], rifle: [0.36, 0.046], sniper: [0.3, 0.004] };
let envTex = null;
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// Where the gun's grip sits in view space, per weapon kind
export const VM = {
  rifle:  { x: 0.19, y: -0.15, z: -0.34, s: 1, rx: 0.06, ry: 0.12, rz: 0.2 },
  pistol: { x: 0.11, y: -0.115, z: -0.3, s: 1, rx: 0.05, ry: 0.1, rz: 0.06 },
  knife:  { x: 0.14, y: -0.12, z: -0.3, s: 1, rx: 0.7, ry: 0.35, rz: -0.25 },
  nade:   { x: 0.15, y: -0.13, z: -0.3, s: 0.9, rx: 0.1, ry: 0.3, rz: 0 },
  sniper: { x: 0.2, y: -0.185, z: -0.36, s: 1, rx: 0.07, ry: 0.1, rz: 0.12 },   // per-weapon override
};

// where the first-person arms' shoulders sit in view space: low and a little inward
const ARM_ANCHOR = { R: [0.2, -0.5, 0.12], L: [-0.18, -0.52, 0.05] };
const _hv = new THREE.Vector3(), _hw = new THREE.Vector3(), _hf = new THREE.Vector3(), _hp = new THREE.Vector3(), _hq = new THREE.Vector3();
export class PlayerController {
  constructor(game, camera, settings) {
    this.game = game; this.camera = camera; this.settings = settings;
    camera.rotation.order = 'YXZ';
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(62, camera.aspect, 0.01, 10);
    // viewmodel lights take the map's sky/ground/sun colors; the sun is placed in view space each frame
    const T = game.mapDef.theme;
    this.vmHemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], 1.9);
    this.vmSun = new THREE.DirectionalLight(T.sun, 1.3);
    this.vmScene.add(this.vmHemi, this.vmSun, this.vmSun.target);
    this.sunDir = new THREE.Vector3(...(T.sunPos || [40, 80, 30])).normalize();
    this.anim = { swayX: 0, swayY: 0, rec: 0, recV: 0, land: 0, landV: 0, lastVy: 0, moveAmt: 0, breath: 0, lean: 0, lightT: 0, lit: 1, litNow: 1 };
    this.vm = new THREE.Group();
    this.vmScene.add(this.vm);
    this.vmKey = null;
    this.muzzle = new THREE.Object3D();
    this.kick = 0; this.bob = 0; this.switchT = 0;
    this.fireLatch = false;
    this.spec = null; this.deathT = 0;
    this.fovNow = BASE_FOV;
    const o = game.player.char.outfit;
    this.armMats = {
      glove: new THREE.MeshStandardMaterial({ color: o.gloves, roughness: 0.78, metalness: 0, side: THREE.DoubleSide }),
      sleeve: new THREE.MeshStandardMaterial({ color: o.sleeve, map: fabricTex(), roughness: 0.92, metalness: 0, vertexColors: true, side: THREE.DoubleSide }),
      watch: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.3, metalness: 0.8, vertexColors: true }),
    };
    this.envBuilt = false;
    // rigged first-person arms (fall back to the simple built-in hands if they didn't load)
    this.arms = armsReady() ? new FPArms(this.vmScene, o.sleeve, { anchor: ARM_ANCHOR }) : null;
    game.on((type, d) => {
      if (type === 'shot' && d.agent === game.player && !d.confirm) this.kick = 1;
      if (type === 'roundStart') { this.setSpectate(null); this.deathT = 0; }
    });
  }

  buildViewmodel(a) {
    const id = a.weapon === 'nade' ? a.nadeSel : a.weapon;
    const key = id + JSON.stringify(a.loadout || {});
    if (key === this.vmKey) return;
    this.vmKey = key;
    this.vm.clear();
    const kind = a.weapon === 'nade' ? 'nade' : a.w.kind;
    const P = VM[id] || VM[kind] || VM.rifle;
    const gun = weaponMesh(id, a.loadout, 'vm');
    gun.scale.setScalar(P.s);
    gun.position.set(P.x, P.y, P.z);
    gun.rotation.set(P.rx || 0, P.ry ?? 0.05, P.rz || 0);
    this.vm.add(gun);
    const M = this.armMats, gunId = a.weapon;
    if (this.arms) this.handSpec = handSpec(gunId, kind, gunMeta(gunId), FORE[gunId] || FORE.rifle);
    // hands and sleeves ride on the gun so they follow every animation
    else if (kind === 'knife' || kind === 'nade') {
      gun.add(armMesh('hold', M, { wrist: [0.032, -0.046, 0.05], dir: [0.45, -0.5, 1] }));
    } else {
      const R = armMesh('grip', M, { wrist: [0.032, -0.046, 0.05], dir: [0.3, -0.42, 1] });
      R.rotation.x = -0.3;
      gun.add(R);
      if (kind === 'pistol') {
        const L = armMesh('grip', M, { wrist: [0.032, -0.046, 0.05], dir: [0.3, -0.42, 1], watch: true });
        L.scale.x = -1; L.rotation.set(-0.35, 0.12, 0); L.position.set(-0.012, -0.018, 0.012);
        gun.add(L);
      } else {
        const [fu, fv] = FORE[gunId] || FORE.rifle;
        const L = armMesh('fore', M, { wrist: [-0.01, -0.055, 0.045], dir: [-0.42, -0.5, 1], watch: true });
        L.position.set(0, fv, -fu);
        gun.add(L);
      }
    }
    const mz = MUZZLE[gunId];
    this.muzzle.position.set(0, mz ? mz[0] : 0.06, mz ? -mz[1] : -(WEAPONS[gunId]?.len || 0.3) * 1.05);
    gun.add(this.muzzle);
    this.vmGun = gun; this.vmKind = kind; this.vmBase = P;
    this.switchT = 0.35;
  }

  // Put the rigged arms' hands on the gun (targets are in the gun's own space, see handSpec)
  poseArms(visible) {
    const A = this.arms, H = this.handSpec, gun = this.vmGun;
    A.visible = visible;
    if (!visible || !H) return;
    this.vm.updateMatrixWorld(true);
    const P = (v) => gun.localToWorld(_hv.set(v[0], v[1], v[2])).clone();
    const D = (v) => _hv.set(v[0], v[1], v[2]).transformDirection(gun.matrixWorld).clone();
    for (const s of ['R', 'L']) {
      const h = H[s];
      if (h.view) A.hand(s, _hw.set(...h.view.wrist), _hf.set(...h.view.fwd), _hp.set(...h.view.palm), _hq.set(...h.view.pole), h.curl);
      else { const w = P(h.wrist); A.hand(s, w, D(h.fwd), D(h.palm), w.clone().add(_hq.set(...h.pole)), h.curl); }
    }
  }

  setSpectate(a) {
    if (this.spec) this.spec.char.visible = true;
    this.spec = a;
    if (a) a.char.visible = false;
  }
  cycleSpectate() {
    const g = this.game, p = g.player;
    let list = g.agents.filter((a) => a.alive && a.team === p.team && a !== p);
    if (!list.length) list = g.agents.filter((a) => a.alive && a !== p);
    if (!list.length) { this.setSpectate(null); return; }
    const i = list.indexOf(this.spec);
    this.setSpectate(list[(i + 1) % list.length]);
  }

  aimAssist(p, dt) {
    const g = this.game;
    let best = null, bestErr = 0.075;
    for (const e of g.agents) {
      if (!e.alive || e.team === p.team) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > 45 || d < 1) continue;
      const ey = Math.atan2(-dx, -dz), ep = Math.atan2(e.pos.y + 1.25 - p.eyeY, d);
      const err = Math.abs(wrap(ey - p.yaw)) + Math.abs(ep - p.pitch);
      if (err < bestErr && W.hasLOS(p.pos.x, p.eyeY, p.pos.z, e.pos.x, e.pos.y + 1.25, e.pos.z)) { bestErr = err; best = { ey, ep }; }
    }
    if (!best) return 1;
    if (input.fire || Math.abs(input.move.x) + Math.abs(input.move.y) > 0.1) {
      const k = Math.min(1, dt * 2.2);
      p.yaw = wrap(p.yaw + wrap(best.ey - p.yaw) * k);
      p.pitch += (best.ep - p.pitch) * k * 0.6;
    }
    return 0.6;
  }

  update(dt) {
    const g = this.game, p = g.player, cam = this.camera;
    const frozen = g.phase === 'freeze' || g.phase === 'over';
    if (p.alive) {
      if (this.spec) this.setSpectate(null);
      p.char.visible = false;
      const w = p.w;
      let sensMul = p.scoped && w.zoomFov ? w.zoomFov / BASE_FOV : 1;
      if (this.settings.aimAssist && input.touch && !w.melee) sensMul *= this.aimAssist(p, dt);
      p.yaw = wrap(p.yaw - input.lookDX * sensMul);
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - input.lookDY * sensMul));
      input.lookDX = input.lookDY = 0;

      if (!p.throwing) {
        if (consume('slot1')) p.equip(p.primary || 'pistol');
        if (consume('slot2')) p.equip('pistol');
        if (consume('slot3')) p.equip('knife');
        if (consume('slot4')) p.equip('nade');
        if (consume('next')) p.equip(p.weapon === 'knife' ? p.bestWeapon() : p.prevWeapon && p.has(p.prevWeapon) ? p.prevWeapon : 'knife');
        for (const id of ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'knife']) if (consume('w_' + id)) p.equip(id);
        for (const n of ['he', 'flash', 'smoke', 'molotov']) if (consume('w_' + n)) p.equip('nade', n);
      }
      if (consume('reload')) g.reload(p);
      if (consume('scope')) {
        if (w.scoped && p.reloadT <= 0) p.scoped = !p.scoped;
        else if (p.weapon === 'nade' && !frozen) g.fire(p, 0.35);    // underhand lob
      }
      const jump = consume('jump');

      let busy = false;
      if (input.use && !frozen) {
        if (g.plantSite(p)) busy = g.tryPlant(p, dt);
        else if (g.canDefuse(p)) busy = g.tryDefuse(p, dt);
      }
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      let wx = fx * input.move.y + rx * input.move.x, wz = fz * input.move.y + rz * input.move.x;
      const mag = Math.min(1, Math.hypot(wx, wz));
      if (mag > 0.001) { const l = Math.hypot(wx, wz); wx = wx / l * mag; wz = wz / l * mag; }
      p.crouching = input.crouch;
      let speed = (p.scoped && w.scopedSpeed) ? w.scopedSpeed : w.speed;
      if (input.walk) speed *= 0.52;
      if (frozen || busy) { wx = wz = 0; }
      g.moveAgent(p, wx, wz, speed, dt, jump && !frozen && !busy);

      if (input.fire && !frozen && !busy) {
        if (w.auto || (input.touch && p.weapon !== 'nade')) g.fire(p);
        else if (!this.fireLatch) g.fire(p);
        this.fireLatch = true;
      } else this.fireLatch = false;

      cam.position.set(p.pos.x, p.eyeY, p.pos.z);
      cam.rotation.set(p.pitch + p.recoilP, p.yaw + p.recoilY, 0);
      this.showAgentView(p, dt);
    } else {
      input.lookDX = input.lookDY = 0;
      this.deathT += dt;
      p.char.visible = true;
      if (consume('next') || consume('jump') || (input.fire && !this.fireLatch)) this.cycleSpectate();
      this.fireLatch = input.fire;
      if (this.spec && !this.spec.alive) this.setSpectate(null);
      if (!this.spec && this.deathT > 2.5) this.cycleSpectate();
      if (this.spec) {
        const s = this.spec;
        cam.position.set(s.pos.x, s.eyeY, s.pos.z);
        cam.rotation.set(s.pitch + s.recoilP, s.yaw + s.recoilY, 0);
        this.showAgentView(s, dt);
      } else {
        // death cam: rise up and look down at your ragdoll
        const k = Math.min(1, this.deathT / 2);
        const body = p.char.J.pelvis;
        cam.position.set(body.x + Math.sin(p.yaw) * 2.2 * k, body.y + 1.4 + k * 1.8, body.z + Math.cos(p.yaw) * 2.2 * k);
        cam.lookAt(body.x, body.y, body.z);
        this.vm.visible = false;
      }
    }
    const viewer = this.spec || p;
    const targetFov = viewer.alive && viewer.scoped && viewer.w.zoomFov ? viewer.w.zoomFov : BASE_FOV;
    this.fovNow += (targetFov - this.fovNow) * Math.min(1, dt * 18);
    if (Math.abs(cam.fov - this.fovNow) > 0.01) { cam.fov = this.fovNow; cam.updateProjectionMatrix(); }
  }

  showAgentView(a, dt) {
    this.buildViewmodel(a);
    const vm = this.vm, w = a.w, S = this.anim;
    vm.visible = !(a.scoped && w.zoomFov);
    if (S.agent !== a) { S.agent = a; S.lastYaw = a.yaw; S.lastPitch = a.pitch; S.wasGround = a.onGround; }
    this.switchT = Math.max(0, this.switchT - dt);
    const k = Math.min(1, dt * 60);
    // Springs keep every motion smooth and frame-rate independent (a spring per axis: x'' = k(target - x) - c x')
    const h = Math.min(dt, 1 / 30);   // long frames would make the stiff springs unstable
    const spring = (key, target, kk, c) => { const v = key + 'V', x = S[key] || 0, xv = S[v] || 0; S[v] = xv + ((target - x) * kk - xv * c) * h; S[key] = x + S[v] * h; return S[key]; };
    // sway: the gun lags behind how fast you turn, overshoots a touch and settles
    const idt = 1 / Math.max(dt, 1e-3);
    const dyaw = wrap(a.yaw - S.lastYaw), dpitch = a.pitch - S.lastPitch;
    S.lastYaw = a.yaw; S.lastPitch = a.pitch;
    const clampS = (x, m) => Math.max(-m, Math.min(m, x));
    spring('swayX', clampS(dyaw * idt * 0.009, 0.07), 140, 17);
    spring('swayY', clampS(dpitch * idt * 0.008, 0.05), 140, 17);
    // spring recoil (kick is an impulse set when you fire)
    if (this.kick > 0) { S.recV += this.kick * (w.id === 'sniper' || w.id === 'shotgun' ? 16 : 9); this.kick = 0; }
    S.recV += (-S.rec * 320 - S.recV * 26) * dt; S.rec += S.recV * dt;
    // landing dip; while airborne the gun trails the vertical motion
    if (a.onGround && !S.wasGround) S.landV -= Math.min(1.6, 0.5 + Math.abs(S.lastVy) * 0.12);
    S.wasGround = a.onGround; S.lastVy = a.vy;
    S.landV += (-S.land * 180 - S.landV * 18) * dt; S.land += S.landV * dt;
    const airY = spring('airY', a.onGround ? 0 : clampS(-(a.vy || 0) * 0.004, 0.025), 90, 14);
    // walk bob: a smooth figure-8 (side to side once per stride, a dip on every step) that follows the
    // footstep cadence, with a little roll and yaw so the gun rocks instead of sliding around
    const sp = a.onGround ? (a.speed || 0) : 0;
    S.moveAmt += (Math.min(1, sp / 5.4) - S.moveAmt) * Math.min(1, dt * 6);
    this.bob += dt * Math.PI * (1.2 + sp * 0.33) * (S.moveAmt > 0.02 ? 1 : 0);   // ~2 steps/s walking, ~3 running
    S.breath += dt * 1.6;
    const m = S.moveAmt * (a.scoped ? 0.3 : 1), sb = Math.sin(this.bob), dip = sb * sb;
    const bx = sb * 0.011 * m, by = -dip * 0.011 * m + Math.sin(S.breath) * 0.0022 * (1 - m);
    // strafe lean + inertia: speeding up pulls the gun back, stopping lets it swing forward
    const cyw = Math.cos(a.yaw), syw = Math.sin(a.yaw);
    const rxv = cyw * a.vx - syw * a.vz, fwv = -syw * a.vx - cyw * a.vz;
    S.lean += (-rxv * 0.012 - S.lean) * Math.min(1, dt * 8);
    const inZ = spring('inZ', clampS(fwv * 0.0045, 0.03), 60, 9), inX = spring('inX', clampS(-rxv * 0.0025, 0.018), 60, 9);

    let rotX = S.rec * 0.2 - S.swayY + dip * 0.012 * m, rotY = -S.swayX * 1.2 + sb * 0.008 * m, rotZ = S.lean + S.swayX * 0.6 + sb * 0.014 * m;
    let posX = S.swayX * 0.25 + inX, posY = S.land * 0.06 - S.swayY * 0.2 - m * 0.006 + airY, posZ = S.rec * 0.07 + inZ;
    // draw: rises from below with a twist, eased out
    if (this.switchT > 0) { const e = this.switchT / 0.35, ee = e * e * (3 - 2 * e); posY -= ee * 0.35; rotX -= ee * 0.9; rotZ += ee * 0.5; }
    if (a.reloadT > 0) {
      // reload: tilt the gun, drop the mag side toward you, slap it home near the end
      const r = 1 - a.reloadT / w.reload, dip = Math.sin(Math.min(1, r * 1.15) * Math.PI);
      rotZ += dip * 0.55; rotX -= dip * 0.35; posY -= dip * 0.08; posX -= dip * 0.03;
      if (r > 0.62 && r < 0.78) { const q = Math.sin((r - 0.62) / 0.16 * Math.PI); posY += q * 0.025; rotX += q * 0.12; }
    }
    if (a.actionT > 0) {
      const t = a.actionT;
      if (this.vmKind === 'knife') { const s = Math.sin(t * Math.PI); rotY += s * 0.9; rotZ -= s * 0.6; posX -= s * 0.12; posZ -= s * 0.1; }
      if (this.vmKind === 'nade') { const s = t < 0.5 ? t * 2 : 1 - (t - 0.5) * 2; posY += s * 0.12; posZ += t < 0.5 ? s * 0.12 : -s * 0.2; rotX -= s * 0.6; }
    }
    if (a.throwing) { posY -= 0.05; rotX += 0.25; }
    vm.position.set(bx + posX, by + posY, posZ);
    vm.rotation.set(rotX, rotY, rotZ);
    if (this.vmKind === 'nade' && a.nades[a.nadeSel] <= 0 && !a.throwing) vm.visible = false;
    if (this.arms) this.poseArms(vm.visible);
    this.vmCamera.aspect = this.camera.aspect;
    this.vmCamera.updateProjectionMatrix();
    // viewmodel lighting follows the map: dim it when you stand in shade or indoors
    S.lightT -= dt;
    if (S.lightT <= 0) {
      S.lightT = 0.15;
      const d = this.sunDir, h = W.raycast(a.pos.x, a.eyeY, a.pos.z, d.x, d.y, d.z, 80);
      S.lit = h.dist >= 80 ? 1 : 0;
    }
    S.litNow += (S.lit - S.litNow) * Math.min(1, dt * 5);
    this.vmSun.intensity = 0.25 + S.litNow * 1.6;
    this.vmHemi.intensity = 1.2 + S.litNow * 0.7;
    // camera shake from nearby explosions
    const sh = this.game.effects.shake;
    if (sh > 0) { const t = performance.now() / 1000; this.camera.rotation.x += Math.sin(t * 53) * sh * 0.02; this.camera.rotation.y += Math.sin(t * 47 + 1) * sh * 0.02; this.camera.rotation.z = Math.sin(t * 31) * sh * 0.015; }
    if (a === this.game.player) {
      this.muzzle.updateWorldMatrix(true, false);
      const lp = new THREE.Vector3().setFromMatrixPosition(this.muzzle.matrixWorld);
      this.camera.updateMatrixWorld();
      this.game.muzzleOverride = lp.applyMatrix4(this.camera.matrixWorld);
    }
  }

  // Reflections for the first-person gun: a blurred copy of this map's sky, ground and sun
  buildEnv(renderer) {
    this.envBuilt = true;
    const T = this.game.mapDef.theme, sc = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16), pos = geo.attributes.position, cols = [];
    const top = new THREE.Color(T.sky[0]), hor = new THREE.Color(T.sky[2]), gnd = new THREE.Color(T.hemi[1]).multiplyScalar(0.7), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 10;
      if (y >= 0) c.copy(hor).lerp(top, Math.sqrt(y)); else c.copy(hor).lerp(gnd, Math.min(1, -y * 4));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(T.sun).multiplyScalar(8) }));
    sun.position.copy(this.sunDir).multiplyScalar(8); sc.add(sun);
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(sc, 0.04);
    pm.dispose(); geo.dispose();
    if (envTex) envTex.dispose();
    envTex = rt;
    setViewmodelEnv(rt.texture);
  }

  render(renderer, scene) {
    if (!this.envBuilt) this.buildEnv(renderer);
    // sun direction in view space so the gun is lit from the same side as the world
    this.vmSun.position.copy(this.sunDir).transformDirection(this.camera.matrixWorldInverse).multiplyScalar(5);
    renderer.render(scene, this.camera);
    if (this.vm.visible) {
      renderer.autoClear = false;
      // the last world draw may have left depth writes off (sprites, decals), which makes clearDepth a no-op
      renderer.state.buffers.depth.setMask(true);
      renderer.clearDepth();
      renderer.render(this.vmScene, this.vmCamera);
      renderer.autoClear = true;
    }
  }
}
