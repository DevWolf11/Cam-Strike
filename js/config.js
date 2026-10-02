// Game-wide tuning. Everything balance-related lives here so it can be tweaked in one place.

export const TEAM = { T: 'T', CT: 'CT' };

// Competitive defaults. Custom mode overrides some of these from the menu.
export const RULES = {
  playersPerTeam: 5,
  roundsToWin: 8,          // first to 8 (max 15 rounds)
  freezeTime: 6,
  buyTimeAfterFreeze: 20,
  roundTime: 115,
  bombTimer: 40,
  plantTime: 3.2,
  defuseTime: 10,
  defuseTimeKit: 5,
  roundEndDelay: 5,
  bombRadius: 22,
  bombDamage: 500,
  friendlyFire: true,
  ffDamage: 0.5,           // teammates take half damage from you
  teamkillPunishRounds: 2, // knife only, no buying, no money for this many rounds after a teamkill
  startMoney: 800,
};

export const MODES = {
  competitive: { name: 'Competitive', desc: '5v5 · first to 8 · friendly fire on' },
  custom: { name: 'Custom', desc: 'Your team sizes, money, rules' },
};

export const ECON = {
  maxMoney: 16000,
  winReward: 3250,
  winBombReward: 3500,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
  plantBonus: 800,
  armorPrice: 1000,
  kitPrice: 400,
  teamkillPenalty: 300,
};

export const PLAYER = {
  eyeHeight: 1.62,
  radius: 0.35,
  jumpSpeed: 5.9,          // jump apex ~1.08m: enough to hop onto a 1m crate
  gravity: 16,
  headRadius: 0.2,
  headY: 1.66,
  bodyHalf: 0.3,
  bodyTop: 1.46,
  // crouched: eye, head-hitbox centre and body-box top, move speed factor, spread factor
  crouchEye: 1.15, crouchHeadY: 1.2, crouchBodyTop: 1.02, crouchSpeed: 0.34, crouchSpread: 0.72,
  maxHp: 100,
};

// Guns. slot 1 = primary, slot 2 = pistol.
// spread values are radians (cone half-angle), recoil is pitch kick per shot (radians).
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P-9 Pistol', slot: 2, price: 200, kill: 300, kind: 'pistol',
    damage: 32, headMult: 4, armorPen: 0.55, pellets: 1, range: 45, falloff: 0.5,
    rpm: 380, auto: false, mag: 12, reserve: 48, reload: 2.1,
    spread: 0.006, moveSpread: 0.03, spraySpread: 0.006, recoil: 0.018, recoilYaw: 0.004,
    speed: 5.9, len: 0.18, impulse: 2,
  },
  smg: {
    id: 'smg', name: 'Viper SMG', slot: 1, price: 1250, kill: 600, kind: 'rifle',
    damage: 26, headMult: 4, armorPen: 0.6, pellets: 1, range: 35, falloff: 0.55,
    rpm: 850, auto: true, mag: 30, reserve: 120, reload: 2.4,
    spread: 0.012, moveSpread: 0.018, spraySpread: 0.0025, recoil: 0.011, recoilYaw: 0.006,
    speed: 5.8, len: 0.52, impulse: 2,
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher 12G', slot: 1, price: 1100, kill: 900, kind: 'rifle',
    damage: 24, headMult: 2, armorPen: 0.5, pellets: 9, range: 18, falloff: 0.15,
    rpm: 70, auto: false, mag: 8, reserve: 32, reload: 3.0,
    spread: 0.075, moveSpread: 0.02, spraySpread: 0, recoil: 0.06, recoilYaw: 0.01,
    speed: 5.4, len: 0.64, impulse: 5,
  },
  rifle: {
    id: 'rifle', name: 'AR-47 Rifle', slot: 1, price: 2700, kill: 300, kind: 'rifle',
    damage: 36, headMult: 4, armorPen: 0.78, pellets: 1, range: 80, falloff: 0.9,
    rpm: 600, auto: true, mag: 30, reserve: 90, reload: 2.5,
    spread: 0.0035, moveSpread: 0.055, spraySpread: 0.0032, recoil: 0.016, recoilYaw: 0.008,
    speed: 5.3, len: 0.72, impulse: 3,
  },
  sniper: {
    id: 'sniper', name: 'Longshot .338', slot: 1, price: 4750, kill: 100, kind: 'rifle',
    damage: 115, headMult: 4, armorPen: 0.97, pellets: 1, range: 200, falloff: 1,
    rpm: 41, auto: false, mag: 5, reserve: 30, reload: 3.6,
    spread: 0.09, scopedSpread: 0.0008, moveSpread: 0.12, spraySpread: 0, recoil: 0.07, recoilYaw: 0.0,
    speed: 4.7, scopedSpeed: 2.6, zoomFov: 22, scoped: true, len: 0.95, impulse: 7,
  },
  knife: {
    id: 'knife', name: 'Knife', slot: 3, price: 0, kill: 1500, kind: 'knife',
    damage: 40, backstab: 180, headMult: 1.5, armorPen: 0.85, range: 1.9, rpm: 150, auto: true,
    speed: 6.4, impulse: 2.5, melee: true,
  },
};

export const GRENADES = {
  he:      { id: 'he', name: 'HE Grenade', price: 300, max: 1, damage: 125, radius: 9, fuse: 1.6, color: 0x3a4a2a },
  flash:   { id: 'flash', name: 'Flashbang', price: 200, max: 2, radius: 26, fuse: 1.5, color: 0x8a9096 },
  smoke:   { id: 'smoke', name: 'Smoke Grenade', price: 300, max: 1, radius: 4.2, duration: 18, fuse: 1.8, color: 0x5a6a5a },
  molotov: { id: 'molotov', name: 'Molotov', price: 400, max: 1, radius: 4.2, duration: 8, dps: 55, fuse: 2.5, color: 0x6a3a14 },
};
export const NADE_ORDER = ['he', 'flash', 'smoke', 'molotov'];
export const MAX_NADES = 4;

export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'];
export const PRIMARIES = ['smg', 'shotgun', 'rifle', 'sniper'];

// Bot skill. Bots aim like players rather than having their accuracy turned down:
//   reaction    seconds before reacting to an enemy that appears, plus reactAngle per radian of flick
//   flick       aim error left after a flick, as a fraction of the flick angle; it shrinks with time constant
//               settle down to tremor (radians): pre-aimed angles are fast and accurate, wide flicks are not
//   trackLag    how far (seconds) the aim trails a strafing target; turnRate caps how fast the view turns (rad/s)
//   recoilComp  share of the recoil pulled down; headPct chance to go for the head; trigger how far off the
//               target (in target radii) they'll still shoot; discipline chance to stop before shooting
//   hearing     scales how far sounds carry for them; preaim chance to have the crosshair on the right corner
//   util        chance to use planned utility; utilAcc aim noise on throws; dodgeFlash chance to look away
export const DIFFICULTY = {
  easy: {
    reaction: [0.4, 0.65], reactAngle: 0.22, flick: 0.14, settle: 0.4, tremor: 0.01, trackLag: 0.2, turnRate: 4.5,
    recoilComp: 0.35, headPct: 0.15, trigger: 1.7, discipline: 0.45, fov: 100, hearing: 0.7, preaim: 0.4,
    util: 0.45, utilAcc: 0.05, dodgeFlash: 0.05, trade: 0.45,
  },
  normal: {
    reaction: [0.27, 0.43], reactAngle: 0.16, flick: 0.09, settle: 0.26, tremor: 0.006, trackLag: 0.14, turnRate: 6.5,
    recoilComp: 0.65, headPct: 0.32, trigger: 1.35, discipline: 0.75, fov: 110, hearing: 0.9, preaim: 0.7,
    util: 0.75, utilAcc: 0.025, dodgeFlash: 0.25, trade: 0.7,
  },
  hard: {
    reaction: [0.18, 0.28], reactAngle: 0.1, flick: 0.05, settle: 0.17, tremor: 0.0035, trackLag: 0.08, turnRate: 9,
    recoilComp: 0.85, headPct: 0.5, trigger: 1.1, discipline: 0.95, fov: 120, hearing: 1, preaim: 0.9,
    util: 0.95, utilAcc: 0.012, dodgeFlash: 0.5, trade: 0.9,
  },
};

export const BOT_NAMES = {
  T: ['Viper', 'Jackal', 'Scorch', 'Dune', 'Rook', 'Havoc', 'Mako', 'Cinder', 'Brick', 'Nomad', 'Rust', 'Talon'],
  CT: ['Falcon', 'Atlas', 'Ghost', 'Sentry', 'Bishop', 'Nova', 'Ranger', 'Echo', 'Warden', 'Specter', 'Ion', 'Aegis'],
};
