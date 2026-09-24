import * as THREE from '../lib/three.module.min.js';
import { WEAPONS, PLAYER, PRIMARIES, NADE_ORDER, GRENADES } from './config.js';
import { Character } from './character.js';
import { weaponMesh } from './weapons3d.js';

let nextId = 1;

export class Agent {
  constructor(scene, name, team, isBot, { outfit = 0, loadout = {}, money = 800 } = {}) {
    this.id = nextId++;
    this.name = name; this.team = team; this.isBot = isBot;
    this.loadout = loadout;          // { skins: {rifle: 'tiger'}, knifeType, knifeSkin }
    this.pos = new THREE.Vector3();
    this.vx = 0; this.vz = 0; this.vy = 0; this.onGround = true; this.speed = 0; this.moving = 0;
    this.yaw = 0; this.pitch = 0; this.recoilP = 0; this.recoilY = 0;
    this.hp = 100; this.armor = 0; this.helmet = false; this.hasKit = false;
    this.money = money;
    this.kills = 0; this.deaths = 0; this.teamkills = 0;
    this.alive = true;
    this.inv = {};                    // gun id -> { mag, reserve }
    this.nades = { he: 0, flash: 0, smoke: 0, molotov: 0 };
    this.nadeSel = 'he';
    this.weapon = 'pistol'; this.prevWeapon = 'knife';
    this.fireCd = 0; this.reloadT = 0; this.sprayIdx = 0; this.lastShot = -9;
    this.scoped = false; this.actionT = 0; this.blindT = 0; this.stepAcc = 0;
    this.punished = 0; this.punishedActive = false;
    this.spotted = 0; this.roundsPlayed = 0;
    this.char = new Character(scene, team, outfit);
    this.setWeaponMesh();
  }

  get eyeY() { return this.pos.y + PLAYER.eyeHeight; }
  get w() { return this.weapon === 'nade' ? NADE_W : WEAPONS[this.weapon]; }
  get primary() { return PRIMARIES.find((k) => this.inv[k]) || null; }
  get nadeCount() { return NADE_ORDER.reduce((s, k) => s + this.nades[k], 0); }
  get firstNade() { return NADE_ORDER.find((k) => this.nades[k] > 0) || null; }
  has(slot) {
    if (slot === 'knife') return true;
    if (slot === 'nade') return this.nadeCount > 0;
    return !!this.inv[slot];
  }

  give(id) {
    const w = WEAPONS[id];
    if (PRIMARIES.includes(id)) for (const k of PRIMARIES) delete this.inv[k];
    this.inv[id] = { mag: w.mag, reserve: w.reserve };
    this.equip(id);
  }

  equip(id, nadeType) {
    if (id === 'nade') {
      const t = nadeType && this.nades[nadeType] > 0 ? nadeType : (this.weapon === 'nade' ? nextNade(this) : (this.nades[this.nadeSel] > 0 ? this.nadeSel : this.firstNade));
      if (!t) return false;
      const changed = this.weapon !== 'nade' || this.nadeSel !== t;
      this.nadeSel = t;
      if (!changed) return false;
    } else if (!this.has(id) || this.weapon === id) return false;
    if (this.weapon !== id) this.prevWeapon = this.weapon;
    this.weapon = id; this.reloadT = 0; this.scoped = false; this.sprayIdx = 0; this.actionT = 0;
    this.fireCd = Math.max(this.fireCd, id === 'knife' ? 0.2 : 0.4);
    this.setWeaponMesh();
    return true;
  }

  bestWeapon() { return this.primary || (this.inv.pistol ? 'pistol' : 'knife'); }

  setWeaponMesh() {
    const id = this.weapon === 'nade' ? this.nadeSel : this.weapon;
    this.char.setGun(weaponMesh(id, this.loadout));
  }

  resetForRound(spawn, yaw) {
    const survived = this.alive && this.roundsPlayed > 0;
    this.roundsPlayed++;
    if (!survived) { this.inv = {}; this.armor = 0; this.helmet = false; this.hasKit = false; this.nades = { he: 0, flash: 0, smoke: 0, molotov: 0 }; }
    this.punishedActive = this.punished > 0;
    if (this.punishedActive) { this.punished--; this.inv = {}; this.nades = { he: 0, flash: 0, smoke: 0, molotov: 0 }; }
    else if (!this.inv.pistol) this.inv.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
    for (const k in this.inv) { this.inv[k].mag = WEAPONS[k].mag; this.inv[k].reserve = WEAPONS[k].reserve; }
    this.weapon = this.bestWeapon(); this.prevWeapon = 'knife';
    this.setWeaponMesh();
    this.hp = 100; this.alive = true; this.vy = 0; this.onGround = true; this.vx = this.vz = 0;
    this.pos.set(spawn.x, spawn.y || 0, spawn.z); this.yaw = yaw; this.pitch = 0;
    this.fireCd = 0; this.reloadT = 0; this.sprayIdx = 0; this.scoped = false; this.spotted = 0;
    this.recoilP = this.recoilY = 0; this.actionT = 0; this.blindT = 0; this.autoReload = 0;
    this.char.visible = true;
    this.spawnSeq = (this.spawnSeq || 0) + 1;
  }

  // Strip to knife only (teamkill punishment)
  strip() {
    this.inv = {}; this.nades = { he: 0, flash: 0, smoke: 0, molotov: 0 };
    this.weapon = 'knife'; this.scoped = false; this.reloadT = 0;
    this.setWeaponMesh();
  }

  updateMesh(dt, planting) {
    if (!this.alive) { this.char.updateRagdoll(dt); return; }
    const w = this.w;
    const kind = planting ? 'bomb' : this.weapon === 'nade' ? 'nade' : w.kind || 'rifle';
    this.char.pose(this, dt, kind, w.len || 0.5, this.actionT);
  }
}

// Pseudo-weapon stats while holding a grenade
const NADE_W = { id: 'nade', name: 'Grenade', kind: 'nade', rpm: 60, speed: 6.0, len: 0.1, spread: 0, moveSpread: 0, spraySpread: 0, auto: false };

function nextNade(a) {
  const i = NADE_ORDER.indexOf(a.nadeSel);
  for (let k = 1; k <= NADE_ORDER.length; k++) { const t = NADE_ORDER[(i + k) % NADE_ORDER.length]; if (a.nades[t] > 0) return t; }
  return null;
}

export { GRENADES };
