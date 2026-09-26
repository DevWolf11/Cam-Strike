import * as THREE from '../lib/three.module.min.js';

// Billboard particles for smoke, fire and explosions: one instanced quad per system, camera-facing in the
// vertex shader, with flipbook animation (blending between frames), per-particle colour, rotation and
// size, scene fog and tone mapping. Normal-blended systems (smoke) are depth-sorted every frame.

// ---------- procedural textures ----------
// Value noise + fBm on a tileable lattice
function makeNoise(seed = 1) {
  const P = 64, g = new Float32Array(P * P);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < g.length; i++) { s = (s * 16807) % 2147483647; g[i] = s / 2147483647; }
  const at = (x, y) => g[(((y % P) + P) % P) * P + (((x % P) + P) % P)];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y, oct = 4) => { let t = 0, amp = 0.5, f = 1; for (let o = 0; o < oct; o++) { t += amp * n(x * f, y * f); f *= 2.03; amp *= 0.5; } return t / (1 - Math.pow(0.5, oct)); };
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// generated once per page (they take a few hundred ms), shared by every match
const texCache = new Map();
const cached = (key, make) => { if (!texCache.has(key)) texCache.set(key, make()); return texCache.get(key); };
function atlasTexture(W, H, fill) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
  fill(img.data, W, H);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}

// Smoke puffs: 2x2 variants of a lumpy, self-shadowed cloud ball, lit from above
export function smokeAtlas() { return cached('smokeAtlas', () => smokeAtlas_()); }
function smokeAtlas_() {
  const S = 128, fbm = makeNoise(7);
  return atlasTexture(S * 2, S * 2, (d, W) => {
    for (let v = 0; v < 4; v++) {
      const ox = (v % 2) * S, oy = Math.floor(v / 2) * S, sx = v * 17.3, sy = v * 5.1;
      const dens = new Float32Array(S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const px = x / S - 0.5, py = y / S - 0.5, r = Math.hypot(px, py) * 2;
        const n = fbm(px * 4 + sx, py * 4 + sy, 5);
        dens[y * S + x] = sstep(1.0, 0.25, r + (n - 0.5) * 0.9) * (0.55 + 0.45 * fbm(px * 9 + sy, py * 9 + sx, 3));
      }
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = y * S + x, a = dens[i];
        // light from above-left: brighter where the density falls off toward the light
        const gx = (dens[y * S + Math.min(S - 1, x + 1)] - dens[y * S + Math.max(0, x - 1)]);
        const gy = (dens[Math.min(S - 1, y + 1) * S + x] - dens[Math.max(0, y - 1) * S + x]);
        const lit = 0.78 + 1.6 * (gy * 0.85 + gx * 0.3) - 0.18 * (y / S - 0.5);
        const c = Math.max(0.45, Math.min(1.08, lit)) * 235;
        const o = ((oy + y) * W + ox + x) * 4;
        d[o] = c; d[o + 1] = c; d[o + 2] = c * 0.98; d[o + 3] = Math.min(255, a * 1.5 * 255);
      }
    }
  });
}

// Flame tongues: a 4x4 flipbook (64x128 frames) of a flickering flame rising from its base
export function flameAtlas() { return cached('flameAtlas', () => flameAtlas_()); }
function flameAtlas_() {
  const FW = 64, FH = 128, fbm = makeNoise(3);
  return atlasTexture(FW * 4, FH * 4, (d, W) => {
    for (let f = 0; f < 16; f++) {
      const ox = (f % 4) * FW, oy = Math.floor(f / 4) * FH, t = f / 16;
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const u = x / FW - 0.5, h = 1 - y / FH;                       // h: 0 at the base, 1 at the tip
        // flowing noise: sampled lower as time goes on so the detail rises; loops over the 16 frames
        const ph = t * Math.PI * 2;
        const n = fbm(u * 3 + Math.cos(ph) * 0.6, h * 2.2 - t * 3.2 + Math.sin(ph) * 0.6, 4);
        const sway = (fbm(h * 1.5 - t * 2, 7.7, 2) - 0.5) * 0.35 * h;
        const width = 0.62 * Math.pow(1 - h, 0.5) * (0.75 + 0.5 * n);
        const edge = 1 - Math.abs(u - sway) / Math.max(0.02, width);
        let I = sstep(0, 0.55, edge) * sstep(1.0, 0.35, h + (n - 0.5) * 0.5) * sstep(0, 0.08, h);
        I = Math.pow(I, 0.8);
        const o = ((oy + y) * W + ox + x) * 4;
        // yellow core -> orange -> deep red edges
        d[o] = 255 * Math.min(1, 0.6 + I * 0.75);
        d[o + 1] = 255 * Math.min(1, Math.pow(I, 1.8) * 0.78);
        d[o + 2] = 255 * Math.min(1, Math.pow(I, 5) * 0.4);
        d[o + 3] = 255 * Math.min(1, I * 1.25);
      }
    }
  });
}

// Explosion fireball: a 4x4 flipbook (128px frames) from a white-hot ball through churning orange fire
// to dark, thinning smoke
export function fireballAtlas() { return cached('fireballAtlas', () => fireballAtlas_()); }
function fireballAtlas_() {
  const S = 128, fbm = makeNoise(11);
  return atlasTexture(S * 4, S * 4, (d, W) => {
    for (let f = 0; f < 16; f++) {
      const ox = (f % 4) * S, oy = Math.floor(f / 4) * S, a = f / 15;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const px = x / S - 0.5, py = y / S - 0.5, r = Math.hypot(px, py) * 2;
        const n = fbm(px * 3.5 + a * 1.3, py * 3.5 - a * 1.8, 5), n2 = fbm(px * 7 - a, py * 7 + a * 2, 3);
        const rad = 0.55 + 0.4 * a;
        const body = sstep(rad + 0.15, rad - 0.35, r + (n - 0.5) * 0.7);
        const heat = Math.max(0, body * (1.25 - a * 1.35) - (r * 0.55) + (n2 - 0.5) * 0.6);
        const smoke = body * sstep(0.1, 0.7, a) * (0.5 + n * 0.6);
        const hot = Math.min(1, heat * 1.6);
        const o = ((oy + y) * W + ox + x) * 4;
        // fire colour where hot, sooty brown-grey where cooled
        const sr = 0.18 + 0.1 * n, sg = 0.16 + 0.08 * n, sb = 0.14 + 0.07 * n;
        d[o] = 255 * Math.min(1, sr * (1 - hot) + hot * (1.0));
        d[o + 1] = 255 * Math.min(1, sg * (1 - hot) + hot * (0.35 + 0.6 * hot * hot));
        d[o + 2] = 255 * Math.min(1, sb * (1 - hot) + hot * (0.05 + 0.5 * Math.pow(hot, 4)));
        d[o + 3] = 255 * Math.min(1, Math.max(hot * 1.3, smoke * (1 - a * 0.55)) * sstep(1.05, 0.7, r));
      }
    }
  });
}

// Soft radial glow (for the burning ground under a molotov)
export function glowTex() { return cached('glowTex', () => glowTex_()); }
function glowTex_() {
  return atlasTexture(64, 64, (d) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const r = Math.hypot(x / 64 - 0.5, y / 64 - 0.5) * 2, a = Math.pow(Math.max(0, 1 - r), 1.8), o = (y * 64 + x) * 4;
      d[o] = 255; d[o + 1] = 140; d[o + 2] = 40; d[o + 3] = 255 * a;
    }
  });
}

// ---------- billboard system ----------
const VS = `
attribute vec3 iPos;
attribute vec4 iData;     // size, rotation, frame, aspect (height / width)
attribute vec4 iColor;
uniform vec2 uGrid; uniform float uNear;
varying vec2 vUv0; varying vec2 vUv1; varying float vMix; varying vec4 vColor;
#include <fog_pars_vertex>
vec2 cellUv(float f, vec2 uv) {
  f = mod(f, uGrid.x * uGrid.y);
  vec2 c = vec2(mod(f, uGrid.x), floor(f / uGrid.x));
  return (uv + vec2(c.x, uGrid.y - 1.0 - c.y)) / uGrid;
}
void main() {
  vec4 mvPosition = viewMatrix * vec4(iPos, 1.0);
  float c = cos(iData.y), s = sin(iData.y);
  vec2 q = position.xy * vec2(1.0, iData.w);
  q.y += (iData.w - 1.0) * 0.5;               // tall sprites (flames) stand on their base point
  mvPosition.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y) * iData.x;
  gl_Position = projectionMatrix * mvPosition;
  // a big puff right at the camera would cover the screen many times over: fade it out, then drop it
  float dz = -(viewMatrix * vec4(iPos, 1.0)).z;
  if (dz < uNear * 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  float f = floor(iData.z);
  vUv0 = cellUv(f, uv); vUv1 = cellUv(f + 1.0, uv); vMix = iData.z - f;
  vColor = iColor;
  vColor.a *= clamp((dz - uNear * 0.5) / max(uNear, 0.001), 0.0, 1.0);
  #include <fog_vertex>
}`;
const FS = `
uniform sampler2D map; uniform float uEmissive; uniform float uLoop;
varying vec2 vUv0; varying vec2 vUv1; varying float vMix; varying vec4 vColor;
#include <fog_pars_fragment>
void main() {
  vec4 t = mix(texture2D(map, vUv0), texture2D(map, vUv1), vMix);
  gl_FragColor = vec4(t.rgb * vColor.rgb * uEmissive, t.a * vColor.a);
  if (gl_FragColor.a < 0.003) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Billboards {
  // opts: tex, grid [cols, rows], additive, max, emissive, sort
  constructor(scene, opts) {
    this.max = opts.max || 256; this.grid = opts.grid || [1, 1]; this.frames = this.grid[0] * this.grid[1];
    this.sort = !!opts.sort; this.list = [];
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index; g.attributes.position = quad.attributes.position; g.attributes.uv = quad.attributes.uv;
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.pos); g.setAttribute('iData', this.data); g.setAttribute('iColor', this.col);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uGrid: { value: new THREE.Vector2(...this.grid) }, uEmissive: { value: opts.emissive ?? 1 }, uLoop: { value: 0 }, uNear: { value: opts.near ?? 0 } }]),
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    mat.uniforms.map.value = opts.tex;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = opts.renderOrder ?? 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // p: x y z, vx vy vz, size, grow (m/s), maxSize, life, delay, rot, spin, frame0, fps (frames/s; or anim: frames
  // over the whole life), color [r g b], alpha, fadeIn/fadeOut (seconds), drag (1/s), lift (m/s^2), wander (random
  // drift, m/s^2), aspect, collide(x, y, z) -> blocked. q.fade scales the alpha (to fade a whole effect out).
  spawn(p) {
    if (this.list.length >= this.max) this.list.shift();
    const q = Object.assign({ vx: 0, vy: 0, vz: 0, size: 1, grow: 0, life: 1, delay: 0, rot: Math.random() * 6.283, spin: 0, frame0: 0, fps: 0, anim: 0,
      color: [1, 1, 1], alpha: 1, fadeIn: 0.1, fadeOut: 0.4, drag: 0, lift: 0, aspect: 1, t: 0, fade: 1 }, p);
    this.list.push(q);
    return q;
  }

  clear() { this.list.length = 0; this.mesh.geometry.instanceCount = 0; this.mesh.visible = false; }

  update(dt, camera) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const q = L[i];
      if (q.delay > 0) { q.delay -= dt; continue; }
      q.t += dt;
      if (q.t >= q.life) { L.splice(i, 1); continue; }
      const k = Math.max(0, 1 - q.drag * dt);
      q.vx *= k; q.vy = q.vy * k + q.lift * dt; q.vz *= k;
      const nx = q.x + q.vx * dt, ny = q.y + q.vy * dt, nz = q.z + q.vz * dt;
      if (q.collide && q.collide(nx, ny, nz)) { q.vx *= -0.2; q.vz *= -0.2; q.vy *= 0.3; }
      else { q.x = nx; q.y = ny; q.z = nz; }
      q.size += q.grow * dt; q.rot += q.spin * dt;
      if (q.maxSize && q.size > q.maxSize) q.size = q.maxSize;
      if (q.wander) { q.vx += (Math.random() - 0.5) * q.wander * dt; q.vy += (Math.random() - 0.5) * q.wander * 0.4 * dt; q.vz += (Math.random() - 0.5) * q.wander * dt; }
    }
    let n = 0;
    const act = this.sort && camera ? L.filter((q) => q.delay <= 0) : L;
    if (this.sort && camera) {
      const c = camera.position;
      for (const q of act) q.d = (q.x - c.x) ** 2 + (q.y - c.y) ** 2 + (q.z - c.z) ** 2;
      act.sort((a, b) => b.d - a.d);
    }
    const P = this.pos.array, D = this.data.array, C = this.col.array, F = this.frames;
    for (const q of act) {
      if (q.delay > 0 || n >= this.max) continue;
      const a = q.alpha * q.fade * Math.min(1, q.fadeIn > 0 ? q.t / q.fadeIn : 1) * Math.min(1, q.fadeOut > 0 ? (q.life - q.t) / q.fadeOut : 1);
      const fr = q.anim ? Math.min(F - 1.001, q.frame0 + (q.t / q.life) * q.anim) : (q.frame0 + q.t * q.fps) % F;
      P[n * 3] = q.x; P[n * 3 + 1] = q.y; P[n * 3 + 2] = q.z;
      D[n * 4] = q.size; D[n * 4 + 1] = q.rot; D[n * 4 + 2] = fr; D[n * 4 + 3] = q.aspect;
      C[n * 4] = q.color[0]; C[n * 4 + 1] = q.color[1]; C[n * 4 + 2] = q.color[2]; C[n * 4 + 3] = a;
      n++;
    }
    this.mesh.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n) { this.pos.needsUpdate = true; this.data.needsUpdate = true; this.col.needsUpdate = true; }
  }
}
