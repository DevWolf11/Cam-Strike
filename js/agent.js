import * as THREE from '../lib/three.module.min.js';
import { WEAPONS, PLAYER, ECON } from './config.js';

let nextId = 1;

const TEAM_STYLE = {
  T:  { shirt: 0x8a6a45, pants: 0x4b4033, head: 0x2b2622, accent: 0xb3242a, skin: 0xc49a74 },
  CT: { shirt: 0x2f4f7a, pants: 0x283246, head: 0x1f2a38, accent: 0x6fa8ff, skin: 0xd0a782 },
};

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

// Simple blocky soldier. Origin at feet, faces -Z.
function buildBody(team) {
  const s = TEAM_STYLE[team];
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.86; root.add(hips);

  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.12, 0, 0); legR.position.set(0.12, 0, 0);
  const ll = box(0.17, 0.86, 0.2, s.pants); ll.position.y = -0.43; legL.add(ll);
  const lr = box(0.17, 0.86, 0.2, s.pants); lr.position.y = -0.43; legR.add(lr);
  const bootL = box(0.19, 0.12, 0.28, 0x1b1b1b); bootL.position.set(0, -0.8, -0.04); legL.add(bootL);
  const bootR = bootL.clone(); legR.add(bootR);
  hips.add(legL, legR);

  const torso = box(0.46, 0.6, 0.26, s.shirt); torso.position.y = 0.3; hips.add(torso);
  const vest = box(0.48, 0.36, 0.3, team === 'CT' ? 0x2a3140 : 0x5a4a35); vest.position.y = 0.34; hips.add(vest);
  const band = box(0.47, 0.06, 0.27, s.accent); band.position.y = 0.05; hips.add(band);

  const head = new THREE.Group(); head.position.y = 0.8; hips.add(head);
  const skull = box(0.3, 0.32, 0.3, team === 'CT' ? s.skin : s.head); head.add(skull);
  if (team === 'CT') {
    const helmet = box(0.34, 0.14, 0.34, 0x33402a); helmet.position.y = 0.14; head.add(helmet);
    const visor = box(0.26, 0.06, 0.04, 0x111111); visor.position.set(0, 0.04, -0.16); head.add(visor);
  } else {
    const eyes = box(0.22, 0.06, 0.02, s.skin); eyes.position.set(0, 0.04, -0.155); head.add(eyes);
  }

  // Arms + gun rig pivot at shoulders so the gun aims with pitch
  const arms = new THREE.Group(); arms.position.y = 0.52; hips.add(arms);
  const armL = box(0.12, 0.12, 0.44, s.shirt); armL.position.set(-0.2, -0.08, -0.2); armL.rotation.y = 0.35; arms.add(armL);
  const armR = box(0.12, 0.12, 0.44, s.shirt); armR.position.set(0.18, -0.1, -0.16); arms.add(armR);
  const gun = new THREE.Group(); gun.position.set(0.06, -0.08, -0.4); arms.add(gun);

  root.userData = { hips, legL, legR, arms, gun, head };
  // blob shadow
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.015; root.add(shadow);
  root.userData.shadow = shadow;
  return root;
}

export function buildGunMesh(id) {
  const w = WEAPONS[id], g = new THREE.Group();
  const body = box(0.07, 0.1, w.len, w.color); g.add(body);
  const barrel = box(0.035, 0.035, w.len * 0.45, 0x151515); barrel.position.set(0, 0.02, -w.len * 0.65); g.add(barrel);
  if (id !== 'pistol') { const stock = box(0.06, 0.12, 0.2, w.color); stock.position.set(0, -0.02, w.len * 0.55); g.add(stock); }
  const grip = box(0.06, 0.14, 0.07, 0x1a1a1a); grip.position.set(0, -0.1, w.len * 0.15); g.add(grip);
  if (id === 'rifle' || id === 'smg') { const mag = box(0.05, 0.16, 0.08, 0x222222); mag.position.set(0, -0.12, -w.len * 0.12); mag.rotation.x = id === 'rifle' ? 0.3 : 0; g.add(mag); }
  if (id === 'sniper') { const scope = box(0.06, 0.07, 0.3, 0x111111); scope.position.set(0, 0.09, -0.05); g.add(scope); }
  if (id === 'shotgun') { const pump = box(0.08, 0.07, 0.18, 0x2a1d10); pump.position.set(0, -0.06, -w.len * 0.4); g.add(pump); }
  return g;
}

export class Agent {
  constructor(name, team, isBot) {
    this.id = nextId++;
    this.name = name;
    this.team = team;
    this.isBot = isBot;
    this.pos = new THREE.Vector3();
    this.vy = 0;
    this.onGround = true;
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.armor = 0; this.helmet = false; this.hasKit = false;
    this.money = ECON.startMoney;
    this.kills = 0; this.deaths = 0;
    this.alive = true;
    this.inv = {};           // weapon id -> { mag, reserve }
    this.weapon = 'pistol';
    this.fireCd = 0; this.reloadT = 0; this.sprayIdx = 0; this.sprayDecay = 0;
    this.scoped = false;
    this.moving = 0;         // 0..1 how fast we moved last frame (for spread)
    this.walkPhase = 0;
    this.deathT = 0;
    this.spotted = 0;        // time until minimap reveal expires
    this.mesh = buildBody(team);
    this.gunMesh = null;
    this.setWeaponMesh();
  }

  get eyeY() { return this.pos.y + PLAYER.eyeHeight; }
  get w() { return WEAPONS[this.weapon]; }
  get primary() { return ['smg', 'shotgun', 'rifle', 'sniper'].find((k) => this.inv[k]) || null; }

  give(id) {
    const w = WEAPONS[id];
    if (id !== 'pistol') for (const k of ['smg', 'shotgun', 'rifle', 'sniper']) delete this.inv[k];
    this.inv[id] = { mag: w.mag, reserve: w.reserve };
    this.equip(id);
  }

  equip(id) {
    if (!this.inv[id] || (this.weapon === id && this.gunMesh)) return false;
    this.weapon = id; this.reloadT = 0; this.scoped = false; this.fireCd = Math.max(this.fireCd, 0.35); this.sprayIdx = 0;
    this.setWeaponMesh();
    return true;
  }

  setWeaponMesh() {
    const g = this.mesh.userData.gun;
    if (this.gunMesh) g.remove(this.gunMesh);
    this.gunMesh = buildGunMesh(this.weapon);
    g.add(this.gunMesh);
  }

  resetForRound(spawn, yaw) {
    const survived = this.alive && this.roundsPlayed > 0;
    this.roundsPlayed = (this.roundsPlayed || 0) + 1;
    if (!survived) { this.inv = {}; this.armor = 0; this.helmet = false; this.hasKit = false; }
    if (!this.inv.pistol) this.inv.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
    // refill ammo for carried weapons
    for (const k in this.inv) { this.inv[k].mag = WEAPONS[k].mag; this.inv[k].reserve = WEAPONS[k].reserve; }
    this.weapon = this.primary || 'pistol';
    this.setWeaponMesh();
    this.hp = 100; this.alive = true; this.vy = 0; this.onGround = true;
    this.pos.set(spawn.x, 0, spawn.z); this.yaw = yaw; this.pitch = 0;
    this.fireCd = 0; this.reloadT = 0; this.sprayIdx = 0; this.scoped = false; this.deathT = 0; this.spotted = 0;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.userData.hips.rotation.set(0, 0, 0);
    this.mesh.userData.hips.position.y = 0.86;
  }

  // Sync the 3D body with state. dt for animation.
  updateMesh(dt) {
    const m = this.mesh, u = m.userData;
    m.position.copy(this.pos);
    if (!this.alive) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT * 2.2);
      u.hips.rotation.x = k * (Math.PI / 2 - 0.1);
      u.hips.position.y = 0.86 - k * 0.66;
      u.shadow.visible = false;
      return;
    }
    u.shadow.visible = true;
    m.rotation.y = this.yaw;
    this.walkPhase += dt * 10 * this.moving;
    const swing = Math.sin(this.walkPhase) * 0.6 * this.moving;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.arms.rotation.x = this.pitch;
    u.head.rotation.x = this.pitch * 0.5;
  }
}
