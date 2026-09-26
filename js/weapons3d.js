import * as THREE from '../lib/three.module.min.js';
import { GeoBuilder } from './geom.js';
import { makeCanvasTexture } from './textures.js';
import { GLTFLoader } from '../lib/addons/GLTFLoader.js';

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
function skinTexture(skin) {
  rs = 7 + skin.length * 13;
  return makeCanvasTexture(128, PAINT[skin] || PAINT.factory);
}
const skinTexCache = new Map();
const skinTex = (skin) => skinTexCache.get(skin) || skinTexCache.set(skin, skinTexture(skin)).get(skin);
export function skinMaterial(skin = 'factory') {
  if (!skinMats.has(skin)) {
    const t = skinTex(skin);
    const shiny = skin === 'gold' || skin === 'ice' || skin === 'neon';
    const mat = shiny
      ? new THREE.MeshPhongMaterial({ map: t, vertexColors: true, shininess: 80, specular: 0x666655 })
      : new THREE.MeshLambertMaterial({ map: t, vertexColors: true });
    skinMats.set(skin, mat);
  }
  return skinMats.get(skin);
}


// ---------------- Models ----------------
// Origin = where the right hand grips. Barrel points to -Z, up is +Y.
// Parts are built from side profiles (extruded with rounded edges) and turned parts (lathes),
// and grouped by surface so each gets a fitting material:
//   paint = skinnable body, metal = steel, poly = polymer/rubber, wood, lens = glass.
const GUNMETAL = 0x2c2e31, BLUED = 0x1f2124, POLY = 0x1b1b1c, WOOD = 0xa8683a, WOOD_DK = 0x7a4a26, LENS = 0x1c3550, BRASS = 0xc9a043;

// Where the muzzle is relative to the grip: [up, forward]
export const MUZZLE = { pistol: [0.063, 0.18], smg: [0.056, 0.54], shotgun: [0.07, 0.67], rifle: [0.056, 0.75], sniper: [0.06, 1.0] };

function parts() {
  const B = { paint: new GeoBuilder(), metal: new GeoBuilder(), poly: new GeoBuilder(), wood: new GeoBuilder(), lens: new GeoBuilder() };
  return B;
}
// shorthands: u = forward distance from the grip, v = height, x = sideways
const bx = (b, w, h, d, u, v, col, x = 0, rx = 0) => b.box(w, h, d, x, v, -u, col, rx);
const xcyl = (b, r, len, u, v, x, col, seg = 10) => b.cyl(r, r, len, x, v, -u, col, seg, 0, 0, Math.PI / 2);   // cylinder across X
const ycyl = (b, r, len, u, v, x, col, seg = 10) => b.cyl(r, r, len, x, v, -u, col, seg);                     // cylinder vertical

// Banana/curved magazine: arc around center (cu, cv) of radius R from angle a0 sweeping `span` downwards
function curvedMag(b, col, { cu, cv, R, a0 = Math.PI, span, hw, t, bevel = 0.003, taper = 1 }) {
  const outer = [], inner = [], n = 10;
  for (let i = 0; i <= n; i++) {
    const a = a0 + span * (i / n), w = hw * (1 + (taper - 1) * (i / n));
    outer.push([cu + Math.cos(a) * (R + w), cv + Math.sin(a) * (R + w)]);
    inner.push([cu + Math.cos(a) * (R - w), cv + Math.sin(a) * (R - w)]);
  }
  b.profile([...outer, ...inner.reverse()], t, col, { bevel });
}
function triggerGroup(b, col, u0 = 0.005, w = 0.07, depth = 0.042, t = 0.01) {
  const u1 = u0 + w;
  b.profile([[u0, 0.002], [u1, 0.002], [u1, -0.01], [u1 - 0.016, -depth], [u0 + 0.014, -depth], [u0, -depth + 0.012]], t, col, {
    holes: [[[u0 + 0.009, -0.004], [u0 + 0.012, -depth + 0.012], [u0 + 0.018, -depth + 0.007], [u1 - 0.019, -depth + 0.007], [u1 - 0.009, -0.012], [u1 - 0.009, -0.004]]],
  });
  const tu = u0 + w * 0.45;
  b.profile([[tu, 0], [tu + 0.008, 0], [tu + 0.006, -0.018], [tu - 0.001, -0.028], [tu - 0.004, -0.025], [tu + 0.001, -0.016]], 0.006, col);
}
function pistolGrip(b, col, { u = 0, top = 0.004, len = 0.105, rake = 0.035, fw = 0.042, t = 0.032 } = {}) {
  b.profile([[u - 0.028, top], [u + fw - 0.03, top], [u + fw - 0.036, top - len * 0.45], [u + fw - 0.036 - rake * 0.8, top - len], [u - 0.03 - rake, top - len - 0.004], [u - 0.036 - rake * 0.8, top - len + 0.012], [u - 0.034, top - len * 0.4]], t, col, { bevel: 0.006 });
}

function gunParts(id, skinned) {
  const B = parts();
  const P = (base) => (skinned ? 0xffffff : base);
  const { paint, metal, poly, wood, lens } = B;
  switch (id) {
    case 'rifle': {   // AR-47: stamped receiver, wood furniture, banana mag
      paint.profile([[-0.05, 0.004], [0.075, 0.004], [0.08, -0.004], [0.2, -0.004], [0.215, 0.008], [0.225, 0.012], [0.225, 0.078], [-0.05, 0.078]], 0.044, P(GUNMETAL), { bevel: 0.003 });
      paint.profile([[-0.054, 0.076], [0.2, 0.076], [0.2, 0.09], [0.185, 0.099], [-0.02, 0.099], [-0.054, 0.088]], 0.04, P(GUNMETAL), { bevel: 0.006 });   // dust cover
      for (const [ru, rv] of [[0.205, 0.018], [0.205, 0.062], [0.165, 0.066], [-0.03, 0.018], [0.0, 0.062], [0.1, 0.012]]) for (const sx of [-0.0235, 0.0235]) metal.sphere(0.0032, sx, rv, -ru, BLUED, 6); // rivets
      for (const sx of [-0.0226, 0.0226]) paint.rbox(0.004, 0.034, 0.1, 0.0015, sx, 0.036, -0.135, P(0x26272a));                                     // magwell dimples
      paint.box(0.012, 0.004, 0.2, 0, 0.1, -0.085, P(GUNMETAL));                                                                                     // dust cover rib
      metal.profile([[0.2, 0.076], [0.262, 0.076], [0.262, 0.099], [0.232, 0.106], [0.2, 0.1]], 0.03, BLUED, { bevel: 0.003 });                          // rear sight block
      bx(metal, 0.022, 0.006, 0.05, 0.225, 0.108, BLUED);                                                                                                // sight leaf
      metal.barrel([[0.0125, 0.24], [0.0125, 0.66], [0.0112, 0.66], [0.0112, 0.7]], 0.055, BLUED);                                                          // barrel
      wood.profile([[0.262, 0.018], [0.44, 0.02], [0.452, 0.03], [0.452, 0.07], [0.262, 0.073], [0.252, 0.062], [0.252, 0.028]], 0.052, WOOD, { bevel: 0.011 }); // lower handguard
      for (const gu of [0.3, 0.33, 0.36]) bx(poly, 0.054, 0.003, 0.012, gu, 0.022, 0x3a2412);                                                           // finger grooves
      wood.profile([[0.275, 0.076], [0.44, 0.076], [0.44, 0.1], [0.295, 0.104], [0.275, 0.096]], 0.034, WOOD, { bevel: 0.008 });                          // upper handguard
      bx(metal, 0.056, 0.058, 0.012, 0.257, 0.046, BLUED);                                                                                              // retainer band
      metal.barrel([[0.0105, 0.27], [0.0105, 0.465]], 0.09, BLUED);                                                                                      // gas tube
      metal.profile([[0.445, 0.038], [0.49, 0.038], [0.49, 0.1], [0.462, 0.103], [0.445, 0.096]], 0.03, BLUED, { bevel: 0.003 });                         // gas block
      metal.barrel([[0.016, 0.605], [0.016, 0.648]], 0.055, BLUED);                                                                                      // front sight base
      metal.profile([[0.614, 0.06], [0.642, 0.06], [0.642, 0.108], [0.632, 0.12], [0.624, 0.12], [0.614, 0.108]], 0.022, BLUED, { bevel: 0.002 });        // front sight tower
      metal.barrel([[0.0165, 0.695], [0.0165, 0.742], [0.0125, 0.75]], 0.055, BLUED);                                                                    // slant brake
      bx(poly, 0.02, 0.008, 0.03, 0.728, 0.072, 0x0a0a0a);
      curvedMag(metal, 0x2b2622, { cu: 0.52, cv: 0.004, R: 0.38, span: 0.62, hw: 0.036, t: 0.03, taper: 1.12 });                                        // 30 rd mag
      for (let k = 0; k < 3; k++) { const a = Math.PI + 0.2 + k * 0.13; bx(metal, 0.034, 0.012, 0.004, 0.52 + Math.cos(a) * 0.38, 0.004 + Math.sin(a) * 0.38, 0x221e1b, 0, 0); }
      pistolGrip(wood, WOOD_DK, { top: 0.006, len: 0.1 });
      triggerGroup(metal, BLUED, 0.0, 0.072);
      bx(metal, 0.004, 0.014, 0.13, 0.085, 0.056, BLUED, 0.024, -0.1);                                                                                  // selector lever
      xcyl(metal, 0.006, 0.026, 0.175, 0.07, 0.03, BLUED, 8);                                                                                           // charging handle
      wood.profile([[-0.048, 0.074], [-0.33, 0.058], [-0.338, 0.05], [-0.338, -0.068], [-0.325, -0.078], [-0.2, -0.046], [-0.09, -0.004], [-0.048, 0]], 0.042, WOOD, { bevel: 0.007 }); // stock
      metal.profile([[-0.352, 0.06], [-0.338, 0.06], [-0.338, -0.078], [-0.352, -0.082]], 0.046, BLUED, { bevel: 0.002 });                               // butt plate
      break;
    }
    case 'smg': {     // Viper: MP5-style roller-delayed SMG with integral suppressor
      paint.profile([[-0.06, 0.012], [0.2, 0.012], [0.222, 0.032], [0.222, 0.086], [-0.06, 0.086]], 0.046, P(0x2a2b2e), { bevel: 0.009 });
      metal.barrel([[0.012, 0.21], [0.012, 0.345]], 0.078, BLUED, 10, -0.004);                                                                          // cocking tube
      xcyl(metal, 0.005, 0.03, 0.31, 0.08, -0.03, BLUED, 8); metal.sphere(0.007, -0.045, 0.08, -0.31, BLUED, 8);                                        // cocking handle
      poly.profile([[0.2, 0.022], [0.36, 0.026], [0.372, 0.036], [0.372, 0.08], [0.2, 0.086]], 0.054, POLY, { bevel: 0.013 });                          // handguard
      for (const gu of [0.24, 0.28, 0.32]) bx(poly, 0.058, 0.03, 0.006, gu, 0.055, 0x111112);
      metal.barrel([[0.011, 0.37], [0.011, 0.42]], 0.056, BLUED);
      poly.barrel([[0.018, 0.415], [0.024, 0.425], [0.024, 0.53], [0.02, 0.54], [0.006, 0.54]], 0.056, 0x151516, 14);                                 // suppressor
      metal.geo(new THREE.TorusGeometry(0.017, 0.0035, 6, 14), 0, 0.108, -0.352, BLUED);                                                             // front sight hood
      bx(metal, 0.012, 0.022, 0.014, 0.352, 0.094, BLUED);
      xcyl(metal, 0.015, 0.03, -0.035, 0.103, 0, BLUED, 12); bx(metal, 0.022, 0.018, 0.02, -0.035, 0.09, BLUED);                                        // drum rear sight
      paint.profile([[0.09, 0.014], [0.185, 0.014], [0.185, -0.024], [0.09, -0.024]], 0.036, P(0x2a2b2e), { bevel: 0.003 });                           // magwell
      curvedMag(metal, 0x222325, { cu: 1.0, cv: 0.0, R: 0.862, span: 0.2, hw: 0.019, t: 0.022, bevel: 0.002 });
      poly.profile([[-0.05, 0.014], [0.09, 0.014], [0.09, -0.004], [-0.05, -0.004]], 0.04, POLY, { bevel: 0.004 });                                     // trigger housing
      pistolGrip(poly, POLY, { top: 0.0, len: 0.1, t: 0.034 });
      triggerGroup(poly, POLY, 0.004, 0.068, 0.04, 0.012);
      bx(metal, 0.004, 0.012, 0.02, 0.0, 0.03, BLUED, 0.024);                                                                                           // selector
      for (const sx of [-0.018, 0.018]) metal.barrel([[0.005, -0.3], [0.005, -0.06]], 0.052, BLUED, 8, sx);                                            // stock rails
      poly.profile([[-0.33, 0.078], [-0.298, 0.078], [-0.298, -0.03], [-0.33, -0.042]], 0.048, POLY, { bevel: 0.007 });                                 // butt pad
      bx(metal, 0.046, 0.03, 0.02, -0.07, 0.052, BLUED);
      break;
    }
    case 'shotgun': { // Breacher 12G: pump action with vent rib
      paint.profile([[-0.05, 0.0], [0.02, -0.006], [0.18, -0.006], [0.18, 0.086], [0.0, 0.092], [-0.05, 0.083]], 0.05, P(0x2d2e30), { bevel: 0.004 });
      bx(poly, 0.004, 0.028, 0.07, 0.09, 0.06, 0x0a0a0a, 0.026);                                                                                       // ejection port
      metal.barrel([[0.0145, 0.18], [0.0145, 0.66], [0.0158, 0.66], [0.0158, 0.672]], 0.068, BLUED);
      bx(metal, 0.008, 0.006, 0.48, 0.42, 0.086, BLUED);                                                                                              // vent rib
      metal.sphere(0.0035, 0, 0.092, -0.662, BRASS, 6);                                                                                               // bead sight
      metal.barrel([[0.0152, 0.18], [0.0152, 0.56], [0.0125, 0.575]], 0.028, BLUED);                                                                   // magazine tube
      bx(metal, 0.02, 0.06, 0.016, 0.555, 0.048, BLUED);                                                                                             // barrel clamp
      wood.profile([[0.24, 0.008], [0.44, 0.008], [0.452, 0.018], [0.452, 0.052], [0.44, 0.062], [0.24, 0.062], [0.228, 0.05], [0.228, 0.02]], 0.058, WOOD, { bevel: 0.011 }); // pump
      for (let k = 0; k < 7; k++) bx(poly, 0.062, 0.03, 0.004, 0.26 + k * 0.026, 0.035, 0x2a1a0c);                                                    // pump grooves
      triggerGroup(metal, BLUED, 0.01, 0.07);
      wood.profile([[-0.04, 0.08], [-0.36, 0.07], [-0.366, 0.06], [-0.366, -0.08], [-0.345, -0.09], [-0.15, -0.052], [-0.03, -0.024], [-0.0, -0.006]], 0.044, WOOD, { bevel: 0.008 });
      poly.profile([[-0.392, 0.072], [-0.366, 0.072], [-0.366, -0.092], [-0.392, -0.096]], 0.048, 0x141414, { bevel: 0.006 });                          // recoil pad
      break;
    }
    case 'sniper': {  // Longshot .338: thumbhole chassis, heavy barrel, big scope
      paint.profile([
        [0.46, 0.045], [0.46, -0.02], [0.42, -0.035], [0.12, -0.035], [0.085, -0.02], [0.045, -0.02], [0.035, -0.11], [0.0, -0.122], [-0.032, -0.112],
        [-0.06, -0.06], [-0.14, -0.07], [-0.4, -0.1], [-0.43, -0.1], [-0.44, -0.082], [-0.44, 0.07], [-0.428, 0.088], [-0.2, 0.094], [-0.12, 0.078], [-0.06, 0.042], [0.12, 0.04],
      ], 0.056, P(0x3d5a3a), { bevel: 0.008, holes: [[[-0.11, -0.03], [-0.08, -0.05], [-0.05, -0.048], [-0.042, -0.02], [-0.055, 0.012], [-0.1, 0.004]]] });
      metal.barrel([[0.024, -0.09], [0.024, 0.2], [0.02, 0.21]], 0.062, BLUED);                                                                         // action
      xcyl(metal, 0.0055, 0.05, -0.03, 0.066, 0.04, BLUED, 8); metal.sphere(0.011, 0.068, 0.066, 0.03, BLUED, 10);                                      // bolt handle + knob
      metal.barrel([[0.02, 0.2], [0.018, 0.5], [0.0155, 0.9], [0.0155, 0.93]], 0.062, BLUED);                                                          // heavy barrel
      for (let k = 0; k < 4; k++) bx(poly, 0.006, 0.004, 0.2, 0.62, 0.062 + (k % 2 ? 0.015 : -0.015), 0x0e0f10, k < 2 ? 0.014 : -0.014);          // flutes
      metal.barrel([[0.022, 0.93], [0.022, 1.0], [0.012, 1.0]], 0.062, BLUED);                                                                          // brake
      for (const bu of [0.95, 0.975]) bx(poly, 0.046, 0.012, 0.008, bu, 0.062, 0x050505);
      poly.barrel([[0.001, -0.205], [0.026, -0.2], [0.026, -0.14], [0.017, -0.11], [0.017, 0.12], [0.024, 0.165], [0.031, 0.2], [0.031, 0.262], [0.001, 0.262]], 0.138, 0x121314, 16); // scope
      lens.barrel([[0.0005, 0.263], [0.027, 0.263]], 0.138, LENS, 16);
      lens.barrel([[0.0005, -0.206], [0.022, -0.206]], 0.138, LENS, 16);
      ycyl(poly, 0.012, 0.026, 0.0, 0.165, 0, 0x121314, 12); xcyl(poly, 0.012, 0.026, 0.0, 0.138, 0.028, 0x121314, 12);                               // turrets
      for (const ru of [-0.07, 0.08]) { metal.geo(new THREE.TorusGeometry(0.02, 0.005, 6, 16), 0, 0.138, -ru, BLUED); bx(metal, 0.018, 0.04, 0.016, ru, 0.1, BLUED); }
      metal.profile([[0.08, -0.03], [0.15, -0.03], [0.15, -0.085], [0.08, -0.085]], 0.042, 0x222325, { bevel: 0.004 });                               // magazine
      triggerGroup(metal, BLUED, 0.04, 0.055, 0.035);
      for (const sx of [-0.016, 0.016]) metal.barrel([[0.005, 0.3], [0.005, 0.55]], -0.045, BLUED, 8, sx);                                              // folded bipod
      bx(metal, 0.05, 0.016, 0.03, 0.43, -0.04, BLUED);
      poly.profile([[-0.462, 0.072], [-0.44, 0.072], [-0.44, -0.084], [-0.462, -0.088]], 0.058, 0x141414, { bevel: 0.006 });
      break;
    }
    case 'pistol':
    default: {       // P-9: polymer frame, steel slide
      paint.profile([[-0.036, 0.045], [0.168, 0.045], [0.175, 0.053], [0.172, 0.077], [0.16, 0.083], [-0.03, 0.083], [-0.037, 0.075]], 0.028, P(0x2b2c2f), { bevel: 0.004 });
      for (let k = 0; k < 6; k++) for (const sx of [-0.0155, 0.0155]) bx(poly, 0.002, 0.03, 0.003, -0.025 + k * 0.007, 0.063, 0x0d0d0e, sx);           // serrations
      bx(poly, 0.012, 0.004, 0.05, 0.075, 0.084, 0x0b0b0c, 0.004);                                                                                   // ejection port
      metal.barrel([[0.0075, 0.16], [0.0075, 0.177]], 0.063, BLUED);
      poly.barrel([[0.0045, 0.1775], [0.0001, 0.178]], 0.063, 0x020202, 8);
      poly.profile([[-0.035, 0.046], [0.16, 0.046], [0.16, 0.028], [0.085, 0.026], [0.08, 0.0], [0.07, -0.012], [0.035, -0.014], [0.03, 0.005], [0.022, 0.022], [-0.035, 0.025]], 0.026, POLY, {
        bevel: 0.003, holes: [[[0.036, 0.018], [0.07, 0.018], [0.068, 0.0], [0.06, -0.006], [0.04, -0.006]]],
      });
      poly.profile([[-0.04, 0.03], [0.024, 0.025], [0.02, -0.02], [0.006, -0.092], [-0.036, -0.097], [-0.047, -0.086], [-0.042, 0.0], [-0.052, 0.024]], 0.03, POLY, { bevel: 0.006 });
      for (let k = 0; k < 5; k++) for (const sx of [-0.019, 0.019]) bx(poly, 0.002, 0.004, 0.035, -0.012, -0.012 - k * 0.013, 0x101011, sx);          // grip texture
      bx(metal, 0.034, 0.008, 0.052, -0.012, -0.098, BLUED);                                                                                          // mag base
      metal.profile([[0.052, 0.018], [0.058, 0.018], [0.058, 0.004], [0.052, -0.004], [0.049, 0.002]], 0.006, BLUED);                                  // trigger
      bx(metal, 0.018, 0.009, 0.01, -0.024, 0.088, BLUED); bx(metal, 0.005, 0.009, 0.006, 0.16, 0.088, BLUED);                                          // sights
      metal.sphere(0.0018, 0, 0.09, -0.157, 0xf2f2f2, 6); metal.sphere(0.0016, -0.006, 0.089, 0.023, 0xf2f2f2, 6); metal.sphere(0.0016, 0.006, 0.089, 0.023, 0xf2f2f2, 6);
      metal.profile([[-0.046, 0.058], [-0.036, 0.058], [-0.036, 0.074], [-0.044, 0.076]], 0.01, BLUED);                                                // hammer
      break;
    }
  }
  return B;
}

export const KNIVES = [
  { id: 'classic', name: 'Classic Knife' },
  { id: 'karambit', name: 'Karambit' },
  { id: 'butterfly', name: 'Butterfly Knife' },
  { id: 'bayonet', name: 'Bayonet' },
];

function knifeParts(type, skinned) {
  const B = parts();
  const { paint, metal, poly } = B;
  const BL = skinned ? 0xffffff : 0xc4c9ce, bev = 0.0016;
  switch (type) {
    case 'karambit': {
      const cu = 0.02, cv = -0.13, R = 0.13, n = 12, span = 1.25, a0 = Math.PI / 2, out = [], inn = [];
      for (let i = 0; i <= n; i++) { const t = i / n, a = a0 - span * t, w = 0.016 * Math.pow(1 - t, 0.75) + 0.0005; out.push([cu + Math.cos(a) * (R + w), cv + Math.sin(a) * (R + w)]); inn.push([cu + Math.cos(a) * (R - w * 0.8), cv + Math.sin(a) * (R - w * 0.8)]); }
      paint.profile([...out, ...inn.reverse()], 0.0045, BL, { bevel: bev });
      poly.profile([[-0.1, 0.014], [0.02, 0.015], [0.024, -0.016], [0.0, -0.02], [-0.035, -0.014], [-0.06, -0.02], [-0.1, -0.016]], 0.024, POLY, { bevel: 0.005 });
      metal.geo(new THREE.TorusGeometry(0.026, 0.006, 8, 18), 0, -0.002, 0.125, 0x3a3c40, 0, Math.PI / 2, 0);                                           // finger ring
      for (const u of [-0.07, -0.02]) xcyl(metal, 0.004, 0.026, u, 0, 0, 0x9a9ea2, 8);
      break;
    }
    case 'butterfly': {
      paint.profile([[0.012, 0.012], [0.165, 0.012], [0.205, 0.004], [0.17, -0.01], [0.04, -0.012], [0.012, -0.012]], 0.004, BL, { bevel: bev });
      for (const sx of [-0.009, 0.009]) {
        metal.profile([[-0.11, 0.014], [0.012, 0.014], [0.016, 0.0], [0.012, -0.014], [-0.11, -0.014], [-0.116, 0.0]], 0.008, sx < 0 ? 0x2f3134 : 0x5a5e62, {
          at: [sx, 0, 0], bevel: 0.002, holes: [[[-0.09, 0.005], [-0.06, 0.005], [-0.06, -0.005], [-0.09, -0.005]], [[-0.045, 0.005], [-0.015, 0.005], [-0.015, -0.005], [-0.045, -0.005]]],
        });
      }
      xcyl(metal, 0.0045, 0.026, -0.108, 0.0, 0, 0x8a8e92, 8);
      break;
    }
    case 'bayonet': {
      const top = [[0.02, 0.013]];
      for (let k = 0; k < 7; k++) top.push([0.05 + k * 0.014, 0.013 + (k % 2 ? 0.0 : 0.005)]);          // saw back
      paint.profile([...top, [0.16, 0.014], [0.24, 0.002], [0.2, -0.012], [0.02, -0.016]], 0.005, BL, { bevel: bev });
      bx(poly, 0.0052, 0.003, 0.12, 0.1, -0.002, 0x777b80);                                                                                          // fuller
      metal.profile([[0.008, 0.026], [0.02, 0.026], [0.02, -0.03], [0.008, -0.03]], 0.03, 0x3a3c40, { bevel: 0.003 });                                // guard
      poly.profile([[-0.115, 0.015], [0.008, 0.017], [0.008, -0.019], [-0.02, -0.021], [-0.045, -0.016], [-0.07, -0.021], [-0.115, -0.017]], 0.028, 0x22241f, { bevel: 0.006 });
      for (let k = 0; k < 6; k++) bx(poly, 0.03, 0.036, 0.003, -0.015 - k * 0.016, -0.001, 0x141512);
      metal.barrel([[0.012, -0.13], [0.014, -0.115]], 0, 0x3a3c40, 10);
      break;
    }
    default: {
      paint.profile([[0.014, 0.012], [0.13, 0.014], [0.196, 0.001], [0.165, -0.011], [0.014, -0.016]], 0.0045, BL, { bevel: bev });
      bx(poly, 0.0048, 0.003, 0.09, 0.07, 0.002, 0x7a7e84);
      metal.profile([[0.004, 0.024], [0.014, 0.024], [0.014, -0.026], [0.004, -0.026]], 0.03, 0x2c2e31, { bevel: 0.003 });
      poly.profile([[-0.11, 0.013], [0.004, 0.015], [0.004, -0.018], [-0.022, -0.021], [-0.042, -0.015], [-0.062, -0.021], [-0.085, -0.016], [-0.11, -0.018]], 0.026, POLY, { bevel: 0.006 });
      metal.barrel([[0.011, -0.125], [0.013, -0.11]], 0, 0x3a3c40, 10);
    }
  }
  return B;
}

function nadeParts(id) {
  const B = parts();
  const { paint, metal, poly, lens } = B;
  const spoon = (h, r) => metal.profile([[-h * 0.2, r + 0.004], [h * 0.95, r + 0.004], [h, r - 0.006], [h * 0.9, r - 0.004], [-h * 0.2, r]], 0.014, 0x6d7074, { u: [0, 1, 0], v: [1, 0, 0], at: [0, 0, 0], bevel: 0.001 });
  const pin = (y, r) => metal.geo(new THREE.TorusGeometry(0.011, 0.0018, 5, 12), -r * 0.2, y, -r - 0.01, 0xb0b4b8, 0, 0, 0);
  if (id === 'he') {
    poly.lathe([[0, -0.046], [0.024, -0.044], [0.038, -0.03], [0.044, -0.008], [0.042, 0.016], [0.032, 0.036], [0.016, 0.046], [0, 0.047]], 0, 0, 0, 0x4a5530, 14);
    metal.lathe([[0.013, 0.044], [0.013, 0.068], [0.009, 0.074], [0.0001, 0.074]], 0, 0, 0, 0x7a7e82, 10);
    spoon(0.07, 0.036); pin(0.064, 0.012);
  } else if (id === 'flash') {
    metal.lathe([[0.0001, -0.056], [0.03, -0.056], [0.032, -0.05], [0.032, 0.046], [0.024, 0.052], [0.0001, 0.052]], 0, 0, 0, 0x8a9096, 14);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; poly.ellipsoid(0.006, 0.01, 0.006, Math.cos(a) * 0.031, -0.012 + (k % 2) * 0.03, Math.sin(a) * 0.031, 0x151515, 6); }
    poly.lathe([[0.0325, 0.02], [0.0325, 0.03]], 0, 0, 0, 0x3a6ab0, 14);
    metal.lathe([[0.012, 0.05], [0.012, 0.07], [0.0001, 0.072]], 0, 0, 0, 0x6a6e72, 8);
    spoon(0.075, 0.032); pin(0.066, 0.012);
  } else if (id === 'smoke') {
    metal.lathe([[0.0001, -0.062], [0.033, -0.062], [0.034, -0.056], [0.034, 0.05], [0.026, 0.058], [0.0001, 0.058]], 0, 0, 0, 0x55624f, 14);
    for (const y of [-0.04, 0.03]) poly.lathe([[0.0348, y], [0.0348, y + 0.008]], 0, 0, 0, 0x1e1e1e, 14);
    poly.lathe([[0.0346, -0.016], [0.0346, 0.012]], 0, 0, 0, 0xd8d0b0, 14);
    metal.lathe([[0.012, 0.056], [0.012, 0.074], [0.0001, 0.076]], 0, 0, 0, 0x6a6e72, 8);
    spoon(0.08, 0.034); pin(0.07, 0.012);
  } else if (id === 'molotov') {
    lens.lathe([[0.0001, -0.07], [0.034, -0.07], [0.039, -0.064], [0.04, 0.018], [0.032, 0.04], [0.014, 0.058], [0.013, 0.1], [0.015, 0.104], [0.0001, 0.104]], 0, 0, 0, 0x5a3a14, 14);
    poly.lathe([[0.0001, -0.066], [0.036, -0.066], [0.037, 0.0], [0.0001, 0.0]], 0, 0, 0, 0x8a4a0a, 12);                      // fuel inside
    paint.rbox(0.03, 0.05, 0.03, 0.008, 0, 0.12, 0, 0xd6c49a, 0.3, 0.4, 0.2);                                                   // rag
    paint.rbox(0.022, 0.035, 0.02, 0.006, 0.01, 0.095, 0.006, 0xc8b688, -0.2, 0.2, 0.3);
    poly.lathe([[0.0405, -0.03], [0.0405, 0.0]], 0, 0, 0, 0xe8e0c8, 14);                                                       // label
  } else if (id === 'bomb') {
    for (let k = 0; k < 4; k++) paint.rbox(0.05, 0.05, 0.22, 0.01, -0.078 + k * 0.052, 0, 0, 0xd8cfa4);                        // explosive sticks
    for (const z of [-0.07, 0.07]) poly.rbox(0.215, 0.056, 0.02, 0.006, 0, 0, z, 0x2a2a28);                                    // tape
    poly.rbox(0.13, 0.03, 0.1, 0.006, -0.02, 0.04, 0.0, 0x2e3a2e);                                                             // detonator box
    lens.rbox(0.07, 0.006, 0.03, 0.002, -0.03, 0.056, -0.02, 0x3aff6a);                                                         // screen
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) metal.rbox(0.014, 0.006, 0.012, 0.002, 0.015 + c * 0.017, 0.056, 0.0 + r * 0.015 + 0.012, 0xc8c8c0);
    const wire = (col, x0, z0, x1, z1) => { const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); poly.capsule(0.003, L, (x0 + x1) / 2, 0.03, (z0 + z1) / 2, col, Math.PI / 2, Math.atan2(dx, dz), 0, 5); };
    wire(0xd02020, -0.08, 0.04, 0.08, 0.06); wire(0x2040d0, -0.06, -0.05, 0.09, -0.03); wire(0xe0c020, 0.05, 0.05, 0.1, -0.04);
    metal.cyl(0.002, 0.002, 0.08, 0.06, 0.08, -0.04, 0x1a1a1a, 5);                                                               // antenna
  }
  return B;
}

// ---------------- Materials ----------------
// World (third person, loadout preview) uses cheap Lambert/Phong. The first-person viewmodel uses
// physically based materials with an environment map (see setViewmodelEnv) so steel looks like steel.
let woodTexture = null;
function woodTex() {
  if (woodTexture) return woodTexture;
  woodTexture = makeCanvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#b9b9b9'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const y = rnd() * s, a = 0.05 + rnd() * 0.18;
      ctx.strokeStyle = rnd() < 0.5 ? `rgba(60,30,10,${a})` : `rgba(255,230,200,${a * 0.6})`;
      ctx.lineWidth = 0.5 + rnd() * 2.5;
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 3 + (rnd() - 0.5) * 1.5);
      ctx.stroke();
    }
    for (let k = 0; k < 3; k++) { const x = rnd() * s, y = rnd() * s; const g = ctx.createRadialGradient(x, y, 1, x, y, 10); g.addColorStop(0, 'rgba(50,25,8,0.6)'); g.addColorStop(1, 'rgba(50,25,8,0)'); ctx.fillStyle = g; ctx.fillRect(x - 12, y - 6, 24, 12); }
  });
  return woodTexture;
}

const worldMats = {};
function worldMat(kind, skin) {
  const key = kind === 'paint' ? 'paint:' + skin : kind;
  if (worldMats[key]) return worldMats[key];
  let m;
  if (kind === 'paint') m = skin === 'factory' ? new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 40, specular: 0x2a2a2a }) : skinMaterial(skin);
  else if (kind === 'metal') m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x444444 });
  else if (kind === 'wood') m = new THREE.MeshLambertMaterial({ vertexColors: true, map: woodTex() });
  else if (kind === 'lens') m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 120, specular: 0x888888 });
  else m = new THREE.MeshLambertMaterial({ vertexColors: true });
  return (worldMats[key] = m);
}

const vmMats = {};
let vmEnv = null;
function vmMat(kind, skin) {
  const key = kind === 'paint' ? 'paint:' + skin : kind;
  if (vmMats[key]) return vmMats[key];
  const S = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, envMap: vmEnv, ...o });
  let m;
  if (kind === 'paint') {
    const metallic = { factory: 0.6, gold: 1, ice: 0.5, carbon: 0.2 }[skin] ?? 0.15;
    const rough = { factory: 0.42, gold: 0.22, ice: 0.18, neon: 0.3, carbon: 0.35 }[skin] ?? 0.5;
    m = S({ map: skin === 'factory' ? null : skinTex(skin), metalness: metallic, roughness: rough });
  } else if (kind === 'metal') m = S({ metalness: 0.85, roughness: 0.34 });
  else if (kind === 'wood') m = S({ map: woodTex(), metalness: 0, roughness: 0.55 });
  else if (kind === 'lens') m = S({ metalness: 0.3, roughness: 0.05 });
  else m = S({ metalness: 0.0, roughness: 0.62 });
  return (vmMats[key] = m);
}
export function setViewmodelEnv(tex) {
  vmEnv = tex;
  for (const m of [...Object.values(vmMats), ...modelVmMats]) { m.envMap = tex; m.needsUpdate = true; }
}

// ---------------- Meshes ----------------
const geoCache = new Map();
function cachedParts(key, fn) {
  if (!geoCache.has(key)) {
    const B = fn(), out = {};
    for (const k in B) if (B[k].count) out[k] = B[k].build();
    geoCache.set(key, out);
  }
  return geoCache.get(key);
}

const NADES = ['he', 'flash', 'smoke', 'molotov', 'bomb'];
// Returns an Object3D for a weapon (mode 'world' for third person/preview, 'vm' for first person)
export function weaponMesh(id, loadout = {}, mode = 'world') {
  if (id !== 'knife' && hasModel(id)) return modelMesh(id, NADES.includes(id) ? 'factory' : loadout.skins?.[id] || 'factory', mode);
  let geos, skin = 'factory';
  if (id === 'knife') {
    const type = loadout.knifeType || 'classic'; skin = loadout.knifeSkin || 'factory';
    if (type === 'classic' && hasModel('knife')) return modelMesh('knife', skin, mode);
    geos = cachedParts(`knife:${type}:${skin !== 'factory'}`, () => knifeParts(type, skin !== 'factory'));
  } else if (NADES.includes(id)) {
    geos = cachedParts(`nade:${id}`, () => nadeParts(id));
  } else {
    skin = loadout.skins?.[id] || 'factory';
    geos = cachedParts(`gun:${id}:${skin !== 'factory'}`, () => gunParts(id, skin !== 'factory'));
  }
  const g = new THREE.Group();
  if (mode === 'vm') { for (const kind in geos) g.add(new THREE.Mesh(geos[kind], vmMat(kind, skin))); return g; }
  // third person: painted body + everything else merged, so each held gun costs two draw calls
  if (geos.paint) g.add(new THREE.Mesh(geos.paint, worldMat('paint', skin)));
  if (!geos.rest) {
    const all = new GeoBuilder(), I = new THREE.Matrix4();
    for (const k of ['metal', 'poly', 'wood', 'lens']) if (geos[k]) all.add(geos[k], I, null);
    if (all.count) geos.rest = all.build();
  }
  if (geos.rest) g.add(new THREE.Mesh(geos.rest, worldMat('metal', skin)));
  return g;
}

// ---------------- Real models ----------------
// Converted from Sketchfab models (credits in the README): one mesh per material, metres,
// origin = right-hand grip, barrel -Z, up +Y (grenades/C4: origin at the centre; the knife: at the guard,
// blade -Z, edge -Y).
// Each has a detailed first-person version (vm) and a low-poly one for third person (w).
const MODEL_IDS = ['rifle', 'smg', 'shotgun', 'sniper', 'pistol', 'he', 'flash', 'smoke', 'bomb'];
// per gun, relative to the grip: muzzle [up, forward], left hand on the handguard [forward, height],
// and the grip's slant (the direction the fingers wrap down along) [back, down]
const MODEL_META = {
  rifle:   { muzzle: [0.0555, 0.602], fore: [0.322, 0.025], grip: [0.028, -0.084] },
  smg:     { muzzle: [0.090, 0.572], fore: [0.302, 0.043], grip: [0.064, -0.1] },
  shotgun: { muzzle: [0.066, 0.686], fore: [0.406, -0.014], grip: [0.068, -0.056] },
  sniper:  { muzzle: [0.061, 0.90], fore: [0.34, -0.009], grip: [0.028, -0.088] },
  pistol:  { muzzle: [0.0515, 0.157], fore: null, grip: [0.031, -0.077] },
};
const models = {};
let modelsLoading = null;
export function loadWeaponModels() {
  if (!modelsLoading) {
    const loader = new GLTFLoader();
    const one = (id, v) => loader.loadAsync(`assets/weapons/${id}${v === 'w' ? '_w' : ''}.glb`)
      .then((g) => { (models[id] || (models[id] = {}))[v] = prepModel(g.scene, v); })
      .catch((e) => console.warn(`Weapon model ${id}/${v} unavailable`, e));
    // the knife is small enough for one file: the same mesh in first and third person
    const knife = loader.loadAsync('assets/weapons/knife.glb')
      .then((g) => {
        models.knife = { vm: prepModel(g.scene, 'vm') }; models.knife.w = prepModel(g.scene.clone(), 'w');
        for (const v of ['vm', 'w']) models.knife[v].traverse((o) => { if (o.isMesh) o.material.userData.skinLift = 0.35; });   // blackened steel
      })
      .catch((e) => console.warn('Knife model unavailable', e));
    modelsLoading = Promise.all([...MODEL_IDS.flatMap((id) => [one(id, 'vm'), one(id, 'w')]), knife]).then(() => {
      for (const id in MODEL_META) if (hasModel(id)) MUZZLE[id] = MODEL_META[id].muzzle;
    });
  }
  return modelsLoading;
}
const hasModel = (id) => !!(models[id] && models[id].vm && models[id].w);
// grip/handguard geometry of the model in use (null for the procedural guns)
export const gunMeta = (id) => (hasModel(id) ? MODEL_META[id] || null : null);

function prepModel(root, v) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false; o.receiveShadow = false;
    if (v === 'w') {
      // third person: cheap diffuse shading, it's a few pixels tall
      const m = o.material;
      o.material = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, emissive: m.emissive, emissiveMap: m.emissiveMap });
    } else {
      o.material.envMap = vmEnv; o.material.envMapIntensity = 0.9;
      modelVmMats.add(o.material);
    }
  });
  return root;
}
const modelVmMats = new Set();

// Skins on real models: the pattern is projected from three sides in the model's own space
// (no UVs needed) and multiplied with the model's texture, so wear, edges and shading show through.
// Bare metal (high metalness in the model's own maps) keeps most of its finish.
const skinnedMats = new Map();
function skinnedModelMaterial(base, skin, mode) {
  const key = base.uuid + skin;
  if (skinnedMats.has(key)) return skinnedMats.get(key);
  const m = base.clone();
  const tex = skinTex(skin); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const gold = skin === 'gold', lift = (base.userData.skinLift || 0).toFixed(2);   // (a near-black model needs a floor under the pattern)
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSkin = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkPos; varying vec3 vSkNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkPos = position; vSkNrm = normal;');
    const blend = `{
        vec3 w3 = pow(abs(normalize(vSkNrm)), vec3(4.0)); w3 /= (w3.x + w3.y + w3.z);
        vec3 q = vSkPos * 7.0;
        vec3 pat = texture2D(uSkin, q.zy).rgb * w3.x + texture2D(uSkin, q.xz).rgb * w3.y + texture2D(uSkin, q.xy).rgb * w3.z;
        float lum = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), LUM_MIN);
        float amt = SKIN_AMOUNT;
        diffuseColor.rgb = mix(diffuseColor.rgb, pat * (0.3 + lum * 1.8), amt);
        SKIN_EXTRA
      }`;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n#define LUM_MIN ' + lift + '\nuniform sampler2D uSkin; varying vec3 vSkPos; varying vec3 vSkNrm;');
    if (mode === 'vm') {
      // after the metalness map: paint goes on the body, bare steel keeps most of its look
      sh.fragmentShader = sh.fragmentShader.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + blend
        .replace('SKIN_AMOUNT', '1.0 - smoothstep(0.55, 0.95, metalnessFactor) * 0.7')
        .replace('SKIN_EXTRA', gold ? 'metalnessFactor = mix(metalnessFactor, 1.0, amt); roughnessFactor = mix(roughnessFactor, 0.25, amt);' : 'metalnessFactor = mix(metalnessFactor, 0.15, amt); roughnessFactor = mix(roughnessFactor, 0.5, amt);'));
    } else {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + blend.replace('SKIN_AMOUNT', '0.9').replace('SKIN_EXTRA', ''));
    }
  };
  m.customProgramCacheKey = () => 'skin-' + mode + (gold ? 'g' : '') + lift;
  if (mode === 'vm') modelVmMats.add(m);
  skinnedMats.set(key, m);
  return m;
}

function modelMesh(id, skin, mode) {
  const g = models[id][mode === 'vm' ? 'vm' : 'w'].clone();
  if (skin && skin !== 'factory') g.traverse((o) => { if (o.isMesh) o.material = skinnedModelMaterial(o.material, skin, mode); });
  return g;
}

// A thrown grenade: the low-poly model, or the procedural one
const plainNade = new THREE.MeshLambertMaterial({ vertexColors: true });
export function grenadeObject(id) {
  if (hasModel(id)) return modelMesh(id, 'factory', 'w');
  return new THREE.Mesh(grenadeGeometry(id), plainNade);
}

// Thrown grenades in flight: one merged geometry, vertex-colored
const flyCache = new Map();
export function grenadeGeometry(id) {
  if (flyCache.has(id)) return flyCache.get(id);
  const B = nadeParts(id), all = new GeoBuilder(), I = new THREE.Matrix4();
  for (const k in B) if (B[k].count) all.add(B[k].build(), I, null);
  const g = all.build();
  flyCache.set(id, g);
  return g;
}

// Build every model's geometry up front (at match load) so a first buy or pickup never hitches
export function prewarmWeapons() {
  for (const id of ['pistol', 'smg', 'shotgun', 'rifle', 'sniper']) for (const sk of [false, true]) cachedParts(`gun:${id}:${sk}`, () => gunParts(id, sk));
  for (const k of KNIVES) for (const sk of [false, true]) cachedParts(`knife:${k.id}:${sk}`, () => knifeParts(k.id, sk));
  for (const id of NADES) { cachedParts(`nade:${id}`, () => nadeParts(id)); grenadeGeometry(id); }
}
