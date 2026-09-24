import * as THREE from '../lib/three.module.min.js';
import { WEAPONS } from './config.js';
import { input, consume } from './input.js';
import { buildGunMesh } from './agent.js';
import * as MAP from './map.js';

const BASE_FOV = 78;
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class PlayerController {
  constructor(game, camera, settings) {
    this.game = game;
    this.camera = camera;
    this.settings = settings;
    camera.rotation.order = 'YXZ';

    // Viewmodel lives in its own scene, rendered after clearing depth
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(62, camera.aspect, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5a45, 2.2));
    const dl = new THREE.DirectionalLight(0xffe2b0, 1.2); dl.position.set(1, 2, 1); this.vmScene.add(dl);
    this.vm = new THREE.Group();
    this.vmScene.add(this.vm);
    this.vmWeapon = null;
    this.muzzle = new THREE.Object3D();
    this.kick = 0; this.bob = 0; this.switchT = 0;
    this.fireLatch = false;
    this.spec = null; this.deathT = 0;
    this.fovNow = BASE_FOV;
    const tc = game.player.team === 'CT' ? 0x2f4f7a : 0x8a6a45;
    this.sleeveMat = new THREE.MeshLambertMaterial({ color: tc });
    this.gloveMat = new THREE.MeshLambertMaterial({ color: 0x2a2520 });

    game.on((type) => {
      if (type === 'shot') this.kick = 1;
      if (type === 'roundStart') { this.setSpectate(null); this.deathT = 0; }
    });
  }

  buildViewmodel(id) {
    this.vm.clear();
    const gun = buildGunMesh(id);
    const w = WEAPONS[id];
    // gun rests low on the right, angled slightly toward the crosshair
    const gx = 0.15, gy = -0.14, gz = -0.52, sc = id === 'pistol' ? 0.8 : 0.85;
    gun.scale.setScalar(sc);
    gun.position.set(gx, gy, gz);
    gun.rotation.y = 0.06;
    this.vm.add(gun);
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.09), this.gloveMat);
    handR.position.set(gx + 0.004, gy - 0.075, gz - w.len * 0.13 * sc); this.vm.add(handR);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), this.sleeveMat);
    armR.position.set(gx + 0.05, gy - 0.14, gz - w.len * 0.13 * sc + 0.25); armR.rotation.set(0.28, 0.18, 0); this.vm.add(armR);
    const foreZ = gz - (id === 'pistol' ? w.len * 0.1 : w.len * 0.5) * sc;
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.09), this.gloveMat);
    handL.position.set(gx - 0.012, gy - 0.06, foreZ); this.vm.add(handL);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.55), this.sleeveMat);
    armL.position.set(gx - 0.13, gy - 0.15, foreZ + 0.24); armL.rotation.set(0.3, -0.5, 0); this.vm.add(armL);
    this.muzzle.position.set(0, 0.02, -w.len * 0.95);
    gun.add(this.muzzle);
    this.vmGun = gun;
    this.vmWeapon = id;
    this.switchT = 0.35;
  }

  setSpectate(a) {
    if (this.spec) this.spec.mesh.visible = true;
    this.spec = a;
    if (a) a.mesh.visible = false;
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
      if (err < bestErr && MAP.hasLOS(p.pos.x, p.eyeY, p.pos.z, e.pos.x, e.pos.y + 1.25, e.pos.z)) { bestErr = err; best = { ey, ep }; }
    }
    if (!best) return 1;
    const active = input.fire || Math.abs(input.move.x) + Math.abs(input.move.y) > 0.1;
    if (active) {
      const k = Math.min(1, dt * 2.2);
      p.yaw = wrap(p.yaw + wrap(best.ey - p.yaw) * k);
      p.pitch += (best.ep - p.pitch) * k * 0.6;
    }
    return 0.6; // "sticky" slowdown of look sensitivity over targets
  }

  update(dt) {
    const g = this.game, p = g.player, cam = this.camera;
    const frozen = g.phase === 'freeze' || g.phase === 'over';

    if (p.alive) {
      if (this.spec) this.setSpectate(null);
      const w = p.w;
      let sensMul = p.scoped && w.zoomFov ? w.zoomFov / BASE_FOV : 1;
      if (this.settings.aimAssist && input.touch) sensMul *= this.aimAssist(p, dt);
      p.yaw = wrap(p.yaw - input.lookDX * sensMul);
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - input.lookDY * sensMul));
      input.lookDX = input.lookDY = 0;

      if (consume('slot1')) p.equip(p.primary || 'pistol');
      if (consume('slot2')) p.equip('pistol');
      if (consume('next')) p.equip(p.weapon === 'pistol' ? (p.primary || 'pistol') : 'pistol');
      for (const id of Object.keys(WEAPONS)) if (consume('w_' + id)) p.equip(id);
      if (consume('reload')) g.reload(p);
      if (consume('scope') && w.scoped && p.reloadT <= 0) p.scoped = !p.scoped;
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
        if (w.auto || input.touch) g.fire(p);
        else if (!this.fireLatch) g.fire(p);
        this.fireLatch = true;
      } else this.fireLatch = false;

      cam.position.set(p.pos.x, p.eyeY, p.pos.z);
      cam.rotation.set(p.pitch + (p.recoilP || 0), p.yaw + (p.recoilY || 0), 0);
      this.showAgentView(p, dt);
    } else {
      input.lookDX = input.lookDY = 0;
      this.deathT += dt;
      p.mesh.visible = true;
      if (consume('next') || consume('jump') || (input.fire && !this.fireLatch)) this.cycleSpectate();
      this.fireLatch = input.fire;
      if (this.spec && !this.spec.alive) this.setSpectate(null);
      if (!this.spec && this.deathT > 2) this.cycleSpectate();
      if (this.spec) {
        const s = this.spec;
        cam.position.set(s.pos.x, s.eyeY, s.pos.z);
        cam.rotation.set(s.pitch + (s.recoilP || 0), s.yaw + (s.recoilY || 0), 0);
        this.showAgentView(s, dt);
      } else {
        // death cam: drift up and look down at the body
        const k = Math.min(1, this.deathT / 2);
        cam.position.set(p.pos.x, p.eyeY + k * 2.5, p.pos.z);
        cam.rotation.set(-0.3 - k * 0.8, p.yaw, 0);
        this.vm.visible = false;
      }
    }

    // FOV (sniper scope)
    const viewer = this.spec || p;
    const targetFov = viewer.alive && viewer.scoped && viewer.w.zoomFov ? viewer.w.zoomFov : BASE_FOV;
    this.fovNow += (targetFov - this.fovNow) * Math.min(1, dt * 18);
    if (Math.abs(cam.fov - this.fovNow) > 0.01) { cam.fov = this.fovNow; cam.updateProjectionMatrix(); }
  }

  showAgentView(a, dt) {
    if (this.vmWeapon !== a.weapon) this.buildViewmodel(a.weapon);
    const vm = this.vm, w = a.w;
    vm.visible = !(a.scoped && w.zoomFov);
    this.kick = Math.max(0, this.kick - dt * 9);
    this.switchT = Math.max(0, this.switchT - dt);
    const moving = Math.min(1, (a.speed || 0) / 5);
    this.bob += dt * (6 + moving * 5) * (moving > 0.05 ? 1 : 0.3);
    const bx = Math.sin(this.bob) * 0.012 * moving, by = Math.abs(Math.cos(this.bob)) * 0.012 * moving;
    let rotX = this.kick * 0.12, posZ = this.kick * 0.05, posY = -this.switchT * 0.9;
    if (a.reloadT > 0) {
      const t = 1 - a.reloadT / w.reload;
      const dip = Math.sin(Math.min(1, t) * Math.PI);
      rotX -= dip * 0.7; posY -= dip * 0.12;
    }
    vm.position.set(bx, by + posY, posZ);
    vm.rotation.set(rotX, 0, 0);
    // copy camera orientation to viewmodel camera
    this.vmCamera.aspect = this.camera.aspect;
    this.vmCamera.updateProjectionMatrix();
    // muzzle world position (for tracers), mapped from viewmodel space into world space
    if (a === this.game.player) {
      this.muzzle.updateWorldMatrix(true, false);
      const lp = new THREE.Vector3().setFromMatrixPosition(this.muzzle.matrixWorld);
      this.camera.updateMatrixWorld();
      this.game.muzzleOverride = lp.applyMatrix4(this.camera.matrixWorld);
    }
  }

  render(renderer, scene) {
    renderer.render(scene, this.camera);
    if (this.vm.visible) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(this.vmScene, this.vmCamera);
      renderer.autoClear = true;
    }
  }
}
