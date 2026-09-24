import * as THREE from '../lib/three.module.min.js';
import { WEAPONS } from './config.js';
import { input, consume } from './input.js';
import { weaponMesh } from './weapons3d.js';
import * as W from './world.js';

const BASE_FOV = 78;
const VM_MATS = new Map();
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// Where the gun's grip sits in view space, per weapon kind
const VM = {
  rifle:  { x: 0.15, y: -0.2, z: -0.46, s: 0.85 },
  pistol: { x: 0.14, y: -0.18, z: -0.52, s: 0.78 },
  knife:  { x: 0.17, y: -0.2, z: -0.38, s: 1.1 },
  nade:   { x: 0.17, y: -0.19, z: -0.36, s: 1.2 },
};

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
    this.sleeveMat = new THREE.MeshLambertMaterial({ color: o.sleeve });
    this.gloveMat = new THREE.MeshLambertMaterial({ color: o.gloves });
    this.cuffMat = new THREE.MeshLambertMaterial({ color: o.vest });
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
    const P = VM[kind] || VM.rifle;
    const gun = weaponMesh(id, a.loadout);
    // first-person guns get a specular sheen (world copies stay on cheap Lambert)
    gun.traverse((o) => {
      if (!o.isMesh || !o.material.isMeshLambertMaterial) return;
      const m = o.material;
      o.material = VM_MATS.get(m) || VM_MATS.set(m, new THREE.MeshPhongMaterial({ map: m.map, vertexColors: m.vertexColors, color: m.color, shininess: 45, specular: 0x3a3a36 })).get(m);
    });
    gun.scale.setScalar(P.s);
    gun.position.set(P.x, P.y, P.z);
    gun.rotation.y = 0.05;
    if (kind === 'knife') gun.rotation.set(-0.35, 0.25, -0.2);
    this.vm.add(gun);
    const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); this.vm.add(m); return m; };
    // right hand on the grip + forearm with a cuff
    box(0.075, 0.085, 0.1, this.gloveMat, P.x, P.y - 0.03, P.z + 0.02);
    box(0.085, 0.085, 0.46, this.sleeveMat, P.x + 0.05, P.y - 0.1, P.z + 0.27, 0.32, 0.18);
    box(0.09, 0.09, 0.05, this.cuffMat, P.x + 0.02, P.y - 0.04, P.z + 0.07, 0.32, 0.18);
    // left hand: foregrip for long guns, cupping for pistols, relaxed otherwise
    const len = (WEAPONS[a.weapon]?.len || 0.3) * P.s;
    let lx = P.x - 0.02, ly = P.y - 0.02, lz = P.z - len * 0.5;
    if (kind === 'pistol') { lx = P.x - 0.03; ly = P.y - 0.05; lz = P.z + 0.01; }
    if (kind === 'knife' || kind === 'nade') { lx = P.x - 0.3; ly = P.y - 0.12; lz = P.z + 0.02; }
    box(0.075, 0.075, 0.1, this.gloveMat, lx, ly, lz);
    box(0.085, 0.085, 0.55, this.sleeveMat, lx - 0.13, ly - 0.1, lz + 0.25, 0.3, -0.5);
    this.muzzle.position.set(0, 0.06, -(WEAPONS[a.weapon]?.len || 0.3) * 1.05);
    gun.add(this.muzzle);
    this.vmGun = gun; this.vmKind = kind; this.vmBase = P;
    this.switchT = 0.35;
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
    // sway: the gun lags behind the look direction and springs back
    const dyaw = wrap(a.yaw - S.lastYaw), dpitch = a.pitch - S.lastPitch;
    S.lastYaw = a.yaw; S.lastPitch = a.pitch;
    S.swayX += (Math.max(-0.06, Math.min(0.06, dyaw * 0.5)) - S.swayX) * Math.min(1, dt * 10);
    S.swayY += (Math.max(-0.05, Math.min(0.05, dpitch * 0.5)) - S.swayY) * Math.min(1, dt * 10);
    // spring recoil (kick is an impulse set when you fire)
    if (this.kick > 0) { S.recV += this.kick * (w.id === 'sniper' || w.id === 'shotgun' ? 16 : 9); this.kick = 0; }
    S.recV += (-S.rec * 320 - S.recV * 26) * dt; S.rec += S.recV * dt;
    // landing dip
    if (a.onGround && !S.wasGround) S.landV -= Math.min(1.6, 0.5 + Math.abs(S.lastVy) * 0.12);
    S.wasGround = a.onGround; S.lastVy = a.vy;
    S.landV += (-S.land * 180 - S.landV * 18) * dt; S.land += S.landV * dt;
    // walk bob (figure 8) + idle breathing
    const moving = a.onGround ? Math.min(1, (a.speed || 0) / 5) : 0;
    S.moveAmt += (moving - S.moveAmt) * Math.min(1, dt * 8);
    this.bob += dt * (7 + moving * 4) * (S.moveAmt > 0.05 ? 1 : 0);
    S.breath += dt * 1.6;
    const m = S.moveAmt * (a.scoped ? 0.3 : 1);
    const bx = Math.cos(this.bob) * 0.014 * m, by = -Math.abs(Math.sin(this.bob)) * 0.012 * m + Math.sin(S.breath) * 0.0025;
    // strafe lean
    const rxv = Math.cos(a.yaw) * a.vx - Math.sin(a.yaw) * a.vz;
    S.lean += (-rxv * 0.012 - S.lean) * Math.min(1, dt * 8);

    let rotX = S.rec * 0.2 - S.swayY, rotY = -S.swayX * 1.2, rotZ = S.lean + S.swayX * 0.6;
    let posX = S.swayX * 0.25, posY = S.land * 0.06 - S.swayY * 0.2, posZ = S.rec * 0.07;
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

  render(renderer, scene) {
    // sun direction in view space so the gun is lit from the same side as the world
    this.vmSun.position.copy(this.sunDir).transformDirection(this.camera.matrixWorldInverse).multiplyScalar(5);
    renderer.render(scene, this.camera);
    if (this.vm.visible) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(this.vmScene, this.vmCamera);
      renderer.autoClear = true;
    }
  }
}
