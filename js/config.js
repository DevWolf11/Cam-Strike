// Game-wide tuning. Everything balance-related lives here so it can be tweaked in one place.

export const TEAM = { T: 'T', CT: 'CT' };

export const RULES = {
  playersPerTeam: 5,
  roundsToWin: 8,          // first to 8 (max 15 rounds)
  freezeTime: 6,           // seconds frozen in spawn at round start (buy time)
  buyTimeAfterFreeze: 15,  // extra seconds you can still buy while in spawn
  roundTime: 115,          // 1:55
  bombTimer: 40,
  plantTime: 3.2,
  defuseTime: 10,
  defuseTimeKit: 5,
  roundEndDelay: 5,
  bombRadius: 22,          // meters - lethal close, falls off
  bombDamage: 500,
};

export const ECON = {
  startMoney: 800,
  maxMoney: 16000,
  winReward: 3250,
  winBombReward: 3500,     // T win by detonation / CT win by defuse
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
  plantBonus: 800,         // every T gets this if the bomb was planted, even on a loss
  armorPrice: 1000,        // kevlar + helmet
  kitPrice: 400,           // CT defuse kit
};

export const PLAYER = {
  eyeHeight: 1.62,
  radius: 0.35,
  jumpSpeed: 5.2,
  gravity: 16,
  headRadius: 0.2,
  headY: 1.66,
  bodyHalf: 0.3,
  bodyTop: 1.46,
  maxHp: 100,
};

// The five weapons. Slot order = key/buy order.
// spread values are radians (cone half-angle), recoil is pitch kick per shot (radians).
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P-9 Pistol', slot: 1, price: 200, kill: 300,
    damage: 32, headMult: 4, armorPen: 0.55, pellets: 1, range: 45, falloff: 0.5,
    rpm: 380, auto: false, mag: 12, reserve: 48, reload: 2.1,
    spread: 0.006, moveSpread: 0.03, spraySpread: 0.006, recoil: 0.018, recoilYaw: 0.004,
    speed: 5.9, color: 0x2a2a2a, len: 0.28,
  },
  smg: {
    id: 'smg', name: 'Viper SMG', slot: 2, price: 1250, kill: 600,
    damage: 26, headMult: 4, armorPen: 0.6, pellets: 1, range: 35, falloff: 0.55,
    rpm: 850, auto: true, mag: 30, reserve: 120, reload: 2.4,
    spread: 0.012, moveSpread: 0.018, spraySpread: 0.0025, recoil: 0.011, recoilYaw: 0.006,
    speed: 5.8, color: 0x3b3b44, len: 0.48,
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher 12G', slot: 3, price: 1100, kill: 900,
    damage: 24, headMult: 2, armorPen: 0.5, pellets: 9, range: 18, falloff: 0.15,
    rpm: 70, auto: false, mag: 8, reserve: 32, reload: 3.0,
    spread: 0.075, moveSpread: 0.02, spraySpread: 0, recoil: 0.06, recoilYaw: 0.01,
    speed: 5.4, color: 0x5a3b22, len: 0.62,
  },
  rifle: {
    id: 'rifle', name: 'AR-47 Rifle', slot: 4, price: 2700, kill: 300,
    damage: 36, headMult: 4, armorPen: 0.78, pellets: 1, range: 80, falloff: 0.9,
    rpm: 600, auto: true, mag: 30, reserve: 90, reload: 2.5,
    spread: 0.0035, moveSpread: 0.055, spraySpread: 0.0032, recoil: 0.016, recoilYaw: 0.008,
    speed: 5.3, color: 0x4a3420, len: 0.7,
  },
  sniper: {
    id: 'sniper', name: 'Longshot .338', slot: 5, price: 4750, kill: 100,
    damage: 115, headMult: 4, armorPen: 0.97, pellets: 1, range: 200, falloff: 1,
    rpm: 41, auto: false, mag: 5, reserve: 30, reload: 3.6,
    spread: 0.09, scopedSpread: 0.0008, moveSpread: 0.12, spraySpread: 0, recoil: 0.07, recoilYaw: 0.0,
    speed: 4.7, scopedSpeed: 2.6, zoomFov: 22, scoped: true, color: 0x2e4a2e, len: 0.95,
  },
};

export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'];

export const DIFFICULTY = {
  easy:   { reaction: [0.55, 0.9],  aimError: 0.09,  turnRate: 3.2, burst: [2, 4], fov: 100 },
  normal: { reaction: [0.32, 0.6],  aimError: 0.055, turnRate: 5.0, burst: [3, 6], fov: 115 },
  hard:   { reaction: [0.18, 0.35], aimError: 0.03,  turnRate: 8.0, burst: [4, 9], fov: 130 },
};

export const BOT_NAMES = {
  T: ['Viper', 'Jackal', 'Scorch', 'Dune', 'Rook', 'Havoc', 'Mako', 'Cinder'],
  CT: ['Falcon', 'Atlas', 'Ghost', 'Sentry', 'Bishop', 'Nova', 'Ranger', 'Echo'],
};
