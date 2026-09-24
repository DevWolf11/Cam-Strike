import * as THREE from '../lib/three.module.min.js';
import { WEAPONS } from './config.js';
import { input, consume } from './input.js';
import { weaponMesh } from './weapons3d.js';
import * as W from './world.js';

const BASE_FOV = 78;
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
    this.vmScene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5a45, 2.2));
    const dl = new THREE.DirectionalLight(0xffe2b0, 1.3); dl.position.set(1, 2, 1); this.vmScene.add(dl);
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
    const vm = this.vm, w = a.w;
    vm.visible = !(a.scoped && w.zoomFov);
    this.kick = Math.max(0, this.kick - dt * 9);
    this.switchT = Math.max(0, this.switchT - dt);
    const moving = Math.min(1, (a.speed || 0) / 5);
    this.bob += dt * (6 + moving * 5) * (moving > 0.05 ? 1 : 0.3);
    const bx = Math.sin(this.bob) * 0.012 * moving, by = Math.abs(Math.cos(this.bob)) * 0.012 * moving;
    let rotX = this.kick * 0.12, rotY = 0, rotZ = 0, posZ = this.kick * 0.05, posY = -this.switchT * 0.9, posX = 0;
    if (a.reloadT > 0) { const dip = Math.sin(Math.min(1, 1 - a.reloadT / w.reload) * Math.PI); rotX -= dip * 0.7; posY -= dip * 0.12; }
    if (a.actionT > 0) {
      const t = a.actionT;
      if (this.vmKind === 'knife') { const s = Math.sin(t * Math.PI); rotY = s * 0.9; rotZ = -s * 0.6; posX = -s * 0.12; posZ = -s * 0.1; }
      if (this.vmKind === 'nade') { const s = t < 0.5 ? t * 2 : 1 - (t - 0.5) * 2; posY += s * 0.12; posZ += t < 0.5 ? s * 0.12 : -s * 0.2; rotX -= s * 0.6; }
    }
    if (a.throwing) { posY -= 0.05; }
    vm.position.set(bx + posX, by + posY, posZ);
    vm.rotation.set(rotX, rotY, rotZ);
    if (this.vmKind === 'nade' && a.nades[a.nadeSel] <= 0 && !a.throwing) vm.visible = false;
    this.vmCamera.aspect = this.camera.aspect;
    this.vmCamera.updateProjectionMatrix();
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
