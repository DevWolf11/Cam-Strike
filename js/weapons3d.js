import * as THREE from '../lib/three.module.min.js';
import { GeoBuilder } from './geom.js';
import { makeCanvasTexture } from './textures.js';

// ---------------- Skins ----------------
export const SKINS = [
  { id: 'factory', name: 'Factory New', rarity: 'Default', color: '#9aa4ae' },
  { id: 'desert', name: 'Desert Storm', rarity: 'Consumer', color: '#b0c3d9' },
  { id: 'urban', name: 'Urban Grid', rarity: 'Consumer', color: '#b0c3d9' },
  { id: 'jungle', name: 'Jungle Canopy', rarity: 'Industrial', color: '#5e98d9' },
  { id: 'carbon', name: 'Carbon Weave', rarity: 'Industrial', color: '#5e98d9' },
  { id: 'tiger', name: 'Tiger Tooth', rarity: 'Mil-Spec', color: '#4b69ff' },
  { id: 'ice', name: 'Glacier', rarity: 'Mil-Spec', color: '#4b69ff' },
  { id: 'crimson', name: 'Crimson Web', rarity: 'Restricted', color: '#8847ff' },
  { id: 'neon', name: 'Neon Rider', rarity: 'Restricted', color: '#8847ff' },
  { id: 'dragon', name: 'Dragon Scale', rarity: 'Classified', color: '#d32ce6' },
  { id: 'galaxy', name: 'Nebula', rarity: 'Classified', color: '#d32ce6' },
  { id: 'gold', name: 'Gilded', rarity: 'Covert', color: '#eb4b4b' },
];

let rs = 7;
const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
const PAINT = {
  factory(ctx, s) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, s, s); },
  desert(ctx, s) { blotches(ctx, s, ['#c8b088', '#a88c5c', '#8a6e46', '#d8c8a0'], 26); },
  jungle(ctx, s) { blotches(ctx, s, ['#4a5a30', '#2f3f22', '#6a7a40', '#3a2a1a'], 26); },
  urban(ctx, s) {
    const n = 16, cs = s / n, cols = ['#6a6e72', '#8a8e92', '#4a4e52', '#a0a4a8'];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { ctx.fillStyle = cols[Math.floor(rnd() * 4)]; ctx.fillRect(x * cs, y * cs, cs, cs); }
  },
  carbon(ctx, s) {
    ctx.fillStyle = '#1a1a1c'; ctx.fillRect(0, 0, s, s);
    const n = 16, cs = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const g = ctx.createLinearGradient(x * cs, y * cs, x * cs + cs, y * cs + cs);
      const on = (x + y) % 2;
      g.addColorStop(0, on ? '#3a3a40' : '#222226'); g.addColorStop(1, on ? '#18181c' : '#2e2e34');
      ctx.fillStyle = g; ctx.fillRect(x * cs, y * cs, cs, cs);
    }
  },
  tiger(ctx, s) {
    ctx.fillStyle = '#e08a1e'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#1a120a';
    for (let i = 0; i < 12; i++) { const y = rnd() * s; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(s * 0.3, y - 20 + rnd() * 40, s * 0.6, y + 10, s, y + rnd() * 20); ctx.lineTo(s, y + 6 + rnd() * 8); ctx.bezierCurveTo(s * 0.6, y + 16, s * 0.3, y + 10, 0, y + 8); ctx.fill(); }
  },
  ice(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#dff4ff'); g.addColorStop(1, '#5aa8e0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 30; i++) { ctx.beginPath(); const x = rnd() * s, y = rnd() * s; ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 60); ctx.stroke(); }
  },
  crimson(ctx, s) {
    ctx.fillStyle = '#7a0a10'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6;
    const cx = s / 2, cy = s / 2;
    for (let r = 12; r < s; r += 18) { ctx.beginPath(); for (let a = 0; a <= 12; a++) { const t = a / 12 * Math.PI * 2; const px = cx + Math.cos(t) * r, py = cy + Math.sin(t) * r; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); }
    for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(t) * s, cy + Math.sin(t) * s); ctx.stroke(); }
  },
  neon(ctx, s) {
    ctx.fillStyle = '#12061e'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = i % 2 ? '#ff2fd0' : '#20e8ff'; ctx.lineWidth = 5;
      ctx.beginPath(); for (let x = 0; x <= s; x += 8) { const y = i * s / 8 + Math.sin(x / 18 + i) * 10; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    }
  },
  dragon(ctx, s) {
    ctx.fillStyle = '#5a0a06'; ctx.fillRect(0, 0, s, s);
    const n = 10, cs = s / n;
    for (let y = 0; y < n + 1; y++) for (let x = 0; x < n + 1; x++) {
      const ox = (y % 2) * cs / 2;
      const g = ctx.createRadialGradient(x * cs + ox, y * cs, 2, x * cs + ox, y * cs, cs * 0.7);
      g.addColorStop(0, '#ffb020'); g.addColorStop(0.6, '#d8401a'); g.addColorStop(1, '#3a0604');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x * cs + ox, y * cs, cs * 0.62, 0, Math.PI); ctx.fill();
    }
  },
  galaxy(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#1a0a3a'); g.addColorStop(0.5, '#4a1a7a'); g.addColorStop(1, '#0a1a4a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) { const x = rnd() * s, y = rnd() * s, r = 20 + rnd() * 40; const gg = ctx.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, 'rgba(255,120,220,0.45)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gg; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`; ctx.fillRect(rnd() * s, rnd() * s, 1.5, 1.5); }
  },
  gold(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#fff2a8'); g.addColorStop(0.3, '#d4a520'); g.addColorStop(0.55, '#fff0a0'); g.addColorStop(0.8, '#b8860b'); g.addColorStop(1, '#f0d060');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(120,80,10,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, 6 + rnd() * 14, 0, Math.PI * 1.2); ctx.stroke(); }
  },
};
function blotches(ctx, s, cols, n) {
  ctx.fillStyle = cols[0]; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = cols[1 + Math.floor(rnd() * (cols.length - 1))];
    ctx.beginPath();
    const x = rnd() * s, y = rnd() * s, r = 8 + rnd() * 22;
    for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2, rr = r * (0.6 + rnd() * 0.6); const px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.fill();
  }
}

const skinMats = new Map();
export function skinMaterial(skin = 'factory') {
  if (!skinMats.has(skin)) {
    rs = 7 + skin.length * 13;
    const t = makeCanvasTexture(128, PAINT[skin] || PAINT.factory);
    const shiny = skin === 'gold' || skin === 'ice' || skin === 'neon';
    const mat = shiny
      ? new THREE.MeshPhongMaterial({ map: t, vertexColors: true, shininess: 80, specular: 0x666655 })
      : new THREE.MeshLambertMaterial({ map: t, vertexColors: true });
    skinMats.set(skin, mat);
  }
  return skinMats.get(skin);
}

// ---------------- Models ----------------
// Origin = grip (where the right hand holds it). Barrel points to -Z.
// Painted parts use the skin; metal/grip parts stay dark.
const DARK = 0x1c1c1e, MET = 0x2e3034;
export function gunGeometry(id, skinned) {
  const g = new GeoBuilder();
  const P = (base) => (skinned ? 0xffffff : base);   // painted part color
  switch (id) {
    case 'pistol':
      g.box(0.045, 0.05, 0.22, 0, 0.075, -0.07, P(0x3a3c40));      // slide
      g.box(0.04, 0.035, 0.18, 0, 0.035, -0.05, P(0x2a2a2a));      // frame
      g.box(0.04, 0.12, 0.05, 0, -0.04, 0.02, DARK, -0.2);           // grip
      g.box(0.012, 0.03, 0.05, 0, 0.0, -0.06, MET);                  // trigger guard
      g.box(0.02, 0.02, 0.02, 0, 0.107, -0.17, MET).box(0.03, 0.02, 0.015, 0, 0.107, 0.03, MET); // sights
      g.cyl(0.012, 0.012, 0.02, 0, 0.075, -0.185, 0x0a0a0a, 8, Math.PI / 2);
      break;
    case 'smg':
      g.box(0.05, 0.08, 0.3, 0, 0.05, -0.1, P(0x3b3b44));
      g.cyl(0.018, 0.018, 0.16, 0, 0.06, -0.33, MET, 8, Math.PI / 2);
      g.cyl(0.028, 0.028, 0.12, 0, 0.06, -0.44, DARK, 10, Math.PI / 2); // suppressor
      g.box(0.04, 0.12, 0.05, 0, -0.04, 0.0, DARK, -0.25);
      g.box(0.035, 0.18, 0.05, 0, -0.08, -0.14, MET, 0.1);           // mag
      g.box(0.03, 0.04, 0.2, 0, 0.04, 0.14, P(0x2a2a30));            // folding stock
      g.box(0.02, 0.03, 0.12, 0, 0.1, -0.1, MET);                    // rail
      break;
    case 'shotgun':
      g.box(0.055, 0.08, 0.26, 0, 0.05, -0.06, P(0x3a3a3a));
      g.cyl(0.02, 0.02, 0.5, 0, 0.075, -0.42, MET, 10, Math.PI / 2);
      g.cyl(0.017, 0.017, 0.4, 0, 0.035, -0.36, MET, 10, Math.PI / 2);   // tube mag
      g.box(0.06, 0.05, 0.16, 0, 0.035, -0.34, P(0x5a3b22));             // pump
      g.box(0.05, 0.11, 0.3, 0, -0.01, 0.2, P(0x5a3b22), 0.12);           // stock
      g.box(0.04, 0.1, 0.05, 0, -0.04, 0.02, DARK, -0.2);
      break;
    case 'rifle':
      g.box(0.055, 0.085, 0.34, 0, 0.05, -0.08, P(0x3a3a38));            // receiver
      g.box(0.05, 0.06, 0.24, 0, 0.045, -0.35, P(0x6a4020));             // handguard
      g.cyl(0.014, 0.014, 0.34, 0, 0.06, -0.58, MET, 8, Math.PI / 2);    // barrel
      g.cyl(0.01, 0.01, 0.22, 0, 0.095, -0.36, MET, 6, Math.PI / 2);     // gas tube
      g.box(0.02, 0.05, 0.02, 0, 0.095, -0.7, MET);                        // front sight
      g.box(0.03, 0.05, 0.02, 0, 0.1, -0.02, MET);                         // rear sight
      g.box(0.04, 0.11, 0.05, 0, -0.04, 0.02, DARK, -0.25);               // grip
      g.box(0.035, 0.12, 0.06, 0, -0.06, -0.14, MET, 0.25).box(0.035, 0.1, 0.06, 0, -0.14, -0.18, MET, 0.55); // curved mag
      g.box(0.05, 0.1, 0.28, 0, 0.0, 0.22, P(0x6a4020), 0.12);           // stock
      g.box(0.052, 0.12, 0.04, 0, -0.03, 0.36, DARK);
      g.cyl(0.02, 0.016, 0.05, 0, 0.06, -0.77, 0x0a0a0a, 8, Math.PI / 2); // muzzle brake
      break;
    case 'sniper':
      g.box(0.055, 0.08, 0.36, 0, 0.05, -0.06, P(0x2e4a2e));
      g.cyl(0.018, 0.018, 0.62, 0, 0.065, -0.54, MET, 10, Math.PI / 2);
      g.cyl(0.028, 0.02, 0.07, 0, 0.065, -0.88, 0x0a0a0a, 10, Math.PI / 2);
      g.cyl(0.03, 0.03, 0.32, 0, 0.15, -0.06, 0x111111, 12, Math.PI / 2);   // scope
      g.cyl(0.04, 0.03, 0.06, 0, 0.15, -0.24, 0x111111, 12, Math.PI / 2).cyl(0.036, 0.03, 0.05, 0, 0.15, 0.12, 0x111111, 12, Math.PI / 2);
      g.box(0.02, 0.05, 0.02, 0, 0.11, -0.14, MET).box(0.02, 0.05, 0.02, 0, 0.11, 0.02, MET);   // rings
      g.box(0.06, 0.13, 0.34, 0, -0.01, 0.26, P(0x2e4a2e), 0.08);
      g.box(0.05, 0.05, 0.12, 0, 0.08, 0.24, P(0x2e4a2e));                // cheek rest
      g.box(0.04, 0.11, 0.05, 0, -0.04, 0.03, DARK, -0.25);
      g.box(0.04, 0.02, 0.02, 0.04, 0.07, 0.04, MET);                      // bolt
      g.box(0.012, 0.012, 0.22, 0.02, 0.0, -0.45, MET, 0.05).box(0.012, 0.012, 0.22, -0.02, 0.0, -0.45, MET, 0.05); // bipod
      g.box(0.04, 0.06, 0.07, 0, -0.03, -0.1, MET);                        // mag
      break;
  }
  return g.build();
}

export const KNIVES = [
  { id: 'classic', name: 'Classic Knife' },
  { id: 'karambit', name: 'Karambit' },
  { id: 'butterfly', name: 'Butterfly Knife' },
  { id: 'bayonet', name: 'Bayonet' },
];

export function knifeGeometry(type, skinned) {
  const g = new GeoBuilder();
  const B = skinned ? 0xffffff : 0xb8bcc0;
  switch (type) {
    case 'karambit':
      g.cyl(0.03, 0.03, 0.012, 0, 0.0, 0.07, MET, 12, 0, 0, Math.PI / 2);   // finger ring
      g.box(0.025, 0.035, 0.1, 0, 0, 0.0, DARK);
      for (let k = 0; k < 6; k++) { const a = k / 6 * 1.4; g.box(0.006, 0.028 - k * 0.003, 0.04, 0, -Math.sin(a) * 0.1 + 0.01, -0.05 - Math.cos(a) * 0.03 - k * 0.018, B, -a); }
      break;
    case 'butterfly':
      g.box(0.02, 0.03, 0.12, -0.012, 0, 0.02, DARK).box(0.02, 0.03, 0.12, 0.012, 0, 0.02, 0x3a3a3a);
      g.box(0.006, 0.032, 0.17, 0, 0.004, -0.12, B);
      g.box(0.006, 0.02, 0.04, 0, 0.012, -0.22, B, 0.4);
      break;
    case 'bayonet':
      g.box(0.028, 0.038, 0.12, 0, 0, 0.02, DARK);
      g.box(0.05, 0.05, 0.015, 0, 0.005, -0.045, MET);                      // guard
      g.box(0.007, 0.036, 0.23, 0, 0.004, -0.17, B);
      g.box(0.007, 0.018, 0.05, 0, 0.012, -0.3, B, 0.35);
      break;
    default:
      g.box(0.026, 0.034, 0.11, 0, 0, 0.02, DARK);
      g.box(0.04, 0.04, 0.012, 0, 0.004, -0.04, MET);
      g.box(0.006, 0.032, 0.17, 0, 0.004, -0.13, B);
      g.box(0.006, 0.016, 0.04, 0, 0.012, -0.23, B, 0.3);
  }
  return g.build();
}

export function grenadeGeometry(id) {
  const g = new GeoBuilder();
  if (id === 'he') { g.sphere(0.045, 0, 0, 0, 0x3a4a2a, 10, 1.25); g.box(0.012, 0.06, 0.02, 0.03, 0.04, 0, 0x777777, 0, 0, 0.3); g.cyl(0.012, 0.012, 0.02, 0, 0.06, 0, 0x777777, 6); }
  else if (id === 'flash') { g.cyl(0.032, 0.032, 0.11, 0, 0, 0, 0x8a9096, 10); g.box(0.012, 0.07, 0.02, 0.034, 0.03, 0, 0x555555); g.cyl(0.034, 0.034, 0.01, 0, 0.05, 0, 0x3a6ab0, 10); }
  else if (id === 'smoke') { g.cyl(0.034, 0.034, 0.12, 0, 0, 0, 0x5a6a5a, 10); g.box(0.012, 0.07, 0.02, 0.036, 0.03, 0, 0x555555); for (const y of [-0.03, 0.02]) g.cyl(0.036, 0.036, 0.008, 0, y, 0, 0x2a2a2a, 10); }
  else if (id === 'molotov') { g.cyl(0.035, 0.04, 0.12, 0, 0, 0, 0x6a3a14, 10); g.cyl(0.014, 0.02, 0.06, 0, 0.09, 0, 0x6a3a14, 8); g.box(0.03, 0.05, 0.03, 0, 0.13, 0, 0xd8c8a0, 0.3); }
  else if (id === 'bomb') { g.box(0.26, 0.1, 0.18, 0, 0, 0, 0x3a3a2a).box(0.12, 0.02, 0.08, -0.04, 0.06, 0, 0x223322).box(0.02, 0.02, 0.02, 0.08, 0.06, 0.04, 0xff2020); for (let i = 0; i < 3; i++) g.cyl(0.018, 0.018, 0.24, 0, 0.0, -0.06 + i * 0.06, 0xb89a5a, 8, 0, 0, Math.PI / 2); }
  return g.build();
}

const plainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const geoCache = new Map();
function cachedGeo(key, fn) { if (!geoCache.has(key)) geoCache.set(key, fn()); return geoCache.get(key); }

// Returns an Object3D for the weapon a player holds (third person or viewmodel).
export function weaponMesh(id, loadout = {}) {
  let geo, mat;
  if (id === 'knife') {
    const type = loadout.knifeType || 'classic', skin = loadout.knifeSkin || 'factory';
    geo = cachedGeo(`knife:${type}:${skin !== 'factory'}`, () => knifeGeometry(type, skin !== 'factory'));
    mat = skin === 'factory' ? plainMat : skinMaterial(skin);
  } else if (['he', 'flash', 'smoke', 'molotov', 'bomb'].includes(id)) {
    geo = cachedGeo(`nade:${id}`, () => grenadeGeometry(id)); mat = plainMat;
  } else {
    const skin = loadout.skins?.[id] || 'factory';
    geo = cachedGeo(`gun:${id}:${skin !== 'factory'}`, () => gunGeometry(id, skin !== 'factory'));
    mat = skin === 'factory' ? plainMat : skinMaterial(skin);
  }
  const m = new THREE.Mesh(geo, mat);
  const g = new THREE.Group(); g.add(m);
  return g;
}
