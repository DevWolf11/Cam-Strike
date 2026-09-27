import * as THREE from '../lib/three.module.min.js';
import { GLTFLoader } from '../lib/addons/GLTFLoader.js';

// Photographic map assets (all CC0 from Poly Haven): tiling surface textures, prop models and
// sky panoramas. Everything a map needs is preloaded before the match so the level never pops in;
// anything requested later still loads lazily.

// Surface name -> real-world width of one texture tile in meters (UVs are generated in meters).
export const SURF = {
  sirocco_ground: 2, sirocco_sand: 2.53, sandstone: 3, plaster_beige: 3, adobe: 2, sandbrick: 2,
  pavement_red: 2.15, patio: 2.15, cobble: 1.6, tile_pattern: 2.15, plaster_white: 2.23,
  plaster_damaged: 1.85, stone_rubble: 2.12, plaster_red: 2, asphalt: 3, concrete_floor: 3, concrete_wall: 2,
  factory_brick: 1.5, corrugated: 2.7, metal_sheet_red: 2, container_grey: 1.94, block_wall: 2, diamond_plate: 0.5,
  rusty: 1, concrete_light: 2.71, factory_panel: 3, grey_plaster: 1,
  anti_skid: 1.8, grass: 1, wood: 1.5, door_wood: 1, shutter: 1.9, roof_clay: 2.5, crate: 1,
};
// Brightness gain per surface (linear), bringing each photo's average albedo into a realistic,
// consistent range (measured: e.g. clay plaster averages 0.11, sandstone 0.30).
const GAIN = {
  adobe: 2.5, plaster_beige: 2.0, plaster_damaged: 1.45, sandstone: 1.2, stone_rubble: 1.2, sirocco_sand: 1.45,
  pavement_red: 1.9, patio: 1.05, cobble: 1.3, concrete_floor: 2.0, concrete_wall: 2.4, concrete_light: 1.1, asphalt: 1.25,
  block_wall: 3.0, corrugated: 2.0, factory_brick: 1.2, factory_panel: 1.25, metal_sheet_red: 2.2, diamond_plate: 1.0,
  grey_plaster: 1.3, wood: 1.6, door_wood: 1.5, crate: 2.0,
  tile_pattern: 2.4, plaster_red: 1.6, plaster_white: 0.95, shutter: 1.3, roof_clay: 1.8,
  anti_skid: 1.4, container_grey: 0.85, sirocco_ground: 0.95,
};
// Normal map strength per surface (default 1)
const NSCALE = { sirocco_sand: 0.7, plaster_beige: 0.8, plaster_white: 0.8, concrete_floor: 0.7, asphalt: 0.8, grass: 1.3, cobble: 1.3 };
// Large-scale brightness variation per surface (breaks up visible tiling). Default 0.18.
const MACRO = { container_grey: 0.1, crate: 0.08, diamond_plate: 0.12, door_wood: 0.08, shutter: 0.1 };

export { SKIES } from './maps/skies.js';

const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const pending = new Map();          // url -> promise
const surfTex = new Map();          // name -> { map, normal }
const models = new Map();           // prop name -> { parts: [{ geometry, material }], size }
let propMeta = null;
let maxAniso = 4;
export function setAnisotropy(n) { maxAniso = Math.max(1, Math.min(8, n || 4)); }

function loadTex(url, color) {
  if (!pending.has(url)) {
    pending.set(url, new Promise((res) => {
      const t = texLoader.load(url, () => res(t), undefined, () => { console.warn('texture failed', url); res(t); });
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAniso;
      t.userData.shared = true;
    }));
  }
  return pending.get(url);
}

// Colour + normal texture pair for a surface (starts loading if needed; usable immediately)
export function surf(name) {
  let s = surfTex.get(name);
  if (!s) {
    s = { size: SURF[name] || 2, map: null, normal: null, ready: null };
    const col = loadTex(`assets/textures/${name}_col.jpg`, true), nrm = loadTex(`assets/textures/${name}_nrm.jpg`, false);
    s.ready = Promise.all([col, nrm]);
    // TextureLoader returns the texture synchronously through the promise executor
    col.then((t) => { s.map = t; }); nrm.then((t) => { s.normal = t; });
    surfTex.set(name, s);
  }
  return s;
}

async function propMetaLoad() {
  if (!propMeta) propMeta = fetch('assets/props/props.json').then((r) => r.json()).catch(() => ({}));
  return propMeta;
}

export async function loadProp(name) {
  if (models.has(name)) return models.get(name);
  const url = `assets/props/${name}.glb`;
  if (!pending.has(url)) {
    pending.set(url, (async () => {
      const meta = (await propMetaLoad())[name] || {};
      try {
        const g = await gltfLoader.loadAsync(url);
        const parts = [];
        g.scene.updateMatrixWorld(true);
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          // quantized attributes (normalized ints) can't hold world-space values: expand to float first,
          // then bake the node's dequantization transform
          const geo = new THREE.BufferGeometry();
          for (const [k, a] of Object.entries(o.geometry.attributes)) geo.setAttribute(k, toFloat(a));
          if (o.geometry.index) geo.setIndex(o.geometry.index.clone());
          geo.applyMatrix4(o.matrixWorld);
          const src = o.material;
          const mat = new THREE.MeshLambertMaterial({
            map: src.map || null, normalMap: src.normalMap || null, color: src.color ? src.color.clone() : 0xffffff,
            transparent: src.transparent, alphaTest: src.alphaTest || (src.transparent ? 0.3 : 0), side: THREE.DoubleSide,
            emissive: src.emissive ? src.emissive.clone() : 0x000000,
          });
          if (mat.transparent && mat.alphaTest) mat.transparent = false;       // cutout, keeps sorting simple
          if (mat.map) mat.map.anisotropy = maxAniso;
          parts.push({ geometry: geo, material: mat });
        });
        const size = meta.size || (() => { const b = new THREE.Box3().setFromObject(g.scene), v = b.getSize(new THREE.Vector3()); return [v.x, v.y, v.z]; })();
        models.set(name, { parts, size });
      } catch (e) {
        console.warn('prop failed', name, e);
        models.set(name, { parts: [], size: [1, 1, 1] });
      }
      return models.get(name);
    })());
  }
  return pending.get(url);
}
export const propModel = (name) => models.get(name) || null;

function toFloat(a) {
  const n = a.count, k = a.itemSize, out = new Float32Array(n * k), get = [a.getX, a.getY, a.getZ, a.getW];
  for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) out[i * k + c] = get[c].call(a, i);
  return new THREE.BufferAttribute(out, k);
}

// Sky panoramas stay in sRGB end to end (the sky shader writes them straight out), which avoids
// an 8-bit linear round trip that bands smooth gradients on some GPUs.
export function loadSky(name) { return loadTex(`assets/skies/${name}.jpg`, false); }

// Preload everything a map uses. onProgress(0..1) is optional.
export async function loadMapAssets(def, onProgress) {
  const needs = mapNeeds(def);
  const jobs = [
    ...[...needs.surfaces].map((n) => surf(n).ready),
    ...[...needs.props].map((n) => loadProp(n)),
  ];
  if (def.theme.sky) jobs.push(loadSky(def.theme.sky));
  let done = 0;
  await Promise.all(jobs.map((p) => p.then(() => onProgress?.(++done / jobs.length))));
}

// Models the facade kit may place for each style (mapkit.js), so they are preloaded too
const KIT_MODELS = {
  desert: ['wall_lamp', 'wall_light', 'shutter_door', 'shutter_door_g', 'shutter_window', 'shutter_window_g', 'iron_gate', 'pot_clay', 'manhole'],
  medina: ['lantern', 'wall_light', 'shutter_door', 'shutter_door_g', 'shutter_window', 'shutter_window_g', 'iron_gate', 'pot_clay', 'manhole'],
  industrial: ['security_light', 'wall_light', 'camera', 'vent_fan', 'shutter_door', 'shutter_door_g', 'pipes', 'manhole'],
  facility: ['wall_light', 'security_light', 'camera', 'vent_fan', 'pipes', 'manhole'],
};
const PROP_MODELS = { lamp: ['hang_lamp', 'wall_light'], barrel: ['barrel_red', 'barrel_blue', 'barrel_steel'], car: ['covered_car'] };

// Surfaces the facade kit uses directly for each style (besides the theme's trim)
const KIT_SURFS = {
  desert: ['rusty', 'wood', 'door_wood', 'plaster_white', 'sandstone', 'stone_rubble', 'roof_clay'],
  medina: ['rusty', 'wood', 'door_wood', 'plaster_white', 'sandstone', 'stone_rubble', 'tile_pattern', 'roof_clay'],
  industrial: ['rusty', 'shutter', 'grey_plaster', 'concrete_wall', 'concrete_light', 'plaster_white'],
  facility: ['rusty', 'shutter', 'grey_plaster', 'concrete_wall', 'concrete_light', 'plaster_white'],
};
const PROP_SURFS = { doors: ['wood', 'door_wood'], beam: ['wood'], truckcab: ['rusty'], forklift: ['rusty'], arch: [] };

// Every surface and prop a map actually uses: floor materials and wall surfaces present in its
// grid, the theme's trim, the facade kit's own surfaces, and placed props.
export function mapNeeds(def) {
  const T = def.theme, TR = T.trim || {}, surfaces = new Set(), props = new Set();
  const add = (n) => { if (n && SURF[n]) surfaces.add(n); };
  const floorOf = (m) => (m === MAT_CRATE ? 'crate' : m === MAT_CONTAINER ? 'container_grey' : m === MAT_LOWWALL ? (TR.lowwall || T.walls[0]) : (T.floors[m] || T.floors[0]));
  const mats = new Set(), wallMats = new Set();
  for (let i = 0; i < def.w * def.h; i++) {
    if (def.solid[i]) wallMats.add(def.wallMat[i]);
    else { mats.add(def.mat[i]); if (def.mat[i] === MAT_HIDDEN) mats.add(def.floorMat?.[i] ?? 0); }
  }
  mats.delete(MAT_HIDDEN);
  for (const m of mats) add(floorOf(m));
  add(T.floors[0]);
  for (const i of wallMats) add(T.walls[i] || T.walls[0]);
  for (const v of Object.values(TR)) if (typeof v === 'string') add(v);
  for (const v of Object.values(TR.patches || {})) add(v);
  if (!TR.ceiling) add('concrete_light');
  for (const n of KIT_SURFS[T.facade] || []) add(n);
  for (const p of def.props) {
    if (p.type === 'model') props.add(p.model);
    for (const n of PROP_MODELS[p.type] || []) props.add(n);
    for (const n of PROP_SURFS[p.type] || []) add(n);
    if (p.surf) add(p.surf);
    if (p.type === 'silo' && !p.surf) add('concrete_light');
  }
  for (const n of KIT_MODELS[T.facade] || []) props.add(n);
  return { surfaces, props };
}
// grid material codes (see world.js MAT; duplicated so this module stays free of game imports)
const MAT_CRATE = 1, MAT_LOWWALL = 2, MAT_CONTAINER = 3, MAT_HIDDEN = 9;

// ---------- materials ----------
// Shared tileable noise used to vary brightness over tens of meters (one texture for every surface)
let macroTex = null;
function macroNoise() {
  if (macroTex) return macroTex;
  const N = 256, img = new Float32Array(N * N);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let o = 0, amp = 0.55, cells = 4; o < 5; o++, amp *= 0.5, cells *= 2) {
    const g = Array.from({ length: cells * cells }, rnd), cs = N / cells;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / cs, fy = y / cs, ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const at = (i, j) => g[((j % cells) * cells) + (i % cells)];
      const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
      img[y * N + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
    }
  }
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { const v = Math.max(0, Math.min(255, img[i] * 255)); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  macroTex = new THREE.DataTexture(data, N, N);
  macroTex.wrapS = macroTex.wrapT = THREE.RepeatWrapping;
  macroTex.magFilter = macroTex.minFilter = THREE.LinearFilter;
  macroTex.needsUpdate = true;
  macroTex.userData.shared = true;
  return macroTex;
}

const matCache = new Map();
// Lambert material for a map surface. UVs are in meters; the texture repeat turns them into tiles.
export function surfMaterial(name, quality = 'medium', opts = {}) {
  const key = `${name}|${quality}|${opts.tint ?? ''}|${opts.side ?? ''}`;
  if (matCache.has(key)) return matCache.get(key);
  const s = surf(name);
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, shadowSide: THREE.DoubleSide, side: opts.side ?? THREE.FrontSide });
  if (opts.tint !== undefined) m.color.set(opts.tint);
  m.color.multiplyScalar(GAIN[name] ?? 1);
  const repeat = 1 / s.size;
  const apply = () => {
    if (s.map) { m.map = s.map; s.map.repeat.set(repeat, repeat); }
    if (s.normal && quality !== 'low') { m.normalMap = s.normal; s.normal.repeat.set(repeat, repeat); const k = NSCALE[name] ?? 1; m.normalScale.set(k, k); }
    m.needsUpdate = true;
  };
  if (s.map) apply(); else s.ready.then(apply);
  const amt = MACRO[name] ?? 0.18;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMacro = { value: macroNoise() };
    sh.uniforms.uMacroAmt = { value: amt };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform sampler2D uMacro; uniform float uMacroAmt;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec2 mp = abs(vWN.y) > 0.6 ? vWP.xz : vec2(vWP.x + vWP.z, vWP.y * 1.3);
        float m1 = texture2D(uMacro, mp * 0.023).r, m2 = texture2D(uMacro, mp * 0.11 + 0.37).r;
        diffuseColor.rgb *= (1.0 + uMacroAmt * (m1 * 1.6 - 0.8)) * (1.0 + uMacroAmt * 0.5 * (m2 * 1.6 - 0.8));
      }`);
  };
  m.customProgramCacheKey = () => 'surf-macro';
  matCache.set(key, m);
  return m;
}
