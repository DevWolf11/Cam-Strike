import * as THREE from '../lib/three.module.min.js';

// Shader sky dome (gradient + sun + drifting procedural clouds) and a distant skyline ring.
// Both follow the camera / sit outside the map, cost two draw calls, and never touch the fog.

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;            // always at the far plane
}`;
const SKY_FS = `
uniform vec3 uTop, uMid, uHorizon, uSunCol, uSunDir, uCloud;
uniform float uTime, uClouds;
uniform sampler2D uCloudTex;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uMid, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(uHorizon, col, smoothstep(-0.02, 0.18, h));
  // sun disc + glow
  float s = max(dot(d, uSunDir), 0.0), s2 = s * s, s4 = s2 * s2, s8 = s4 * s4, s24 = s8 * s8 * s8;
  col += uSunCol * (smoothstep(0.9993, 0.9996, s) * 4.0 + s24 * 0.35 + s4 * 0.08);
  // clouds: a prebaked tiling noise texture projected on a virtual plane above (one fetch per pixel)
  if (h > 0.02) {
    vec2 uv = d.xz / (h + 0.12) * 0.22 + vec2(uTime * 0.0016, uTime * 0.0006);
    float c = texture2D(uCloudTex, uv).r;
    c = smoothstep(0.42, 0.78, c) * uClouds * smoothstep(0.02, 0.25, h);
    vec3 cc = mix(uCloud, vec3(1.0), 0.35 + 0.65 * s4 * s2);
    col = mix(col, cc, c * 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Tileable value-noise fbm baked once into a small canvas (cheap on mobile GPUs)
let cloudTex = null;
function cloudTexture() {
  if (cloudTex) return cloudTex;
  const N = 256, img = new Float32Array(N * N);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let o = 0, amp = 0.5, cells = 4; o < 5; o++, amp *= 0.5, cells *= 2) {
    const g = Array.from({ length: cells * cells }, rnd), cs = N / cells;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / cs, fy = y / cs, ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const at = (i, j) => g[((j % cells) * cells) + (i % cells)];
      const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
      img[y * N + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
    }
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d'), id = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const v = Math.max(0, Math.min(255, img[i] * 255)); id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  ctx.putImageData(id, 0, 0);
  cloudTex = new THREE.CanvasTexture(cv);
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  return cloudTex;
}

export function makeSky(theme, sunDir) {
  const c = (hex) => new THREE.Color(hex);
  const [top, mid, horizon] = theme.sky.map(c);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uTop: { value: top }, uMid: { value: mid }, uHorizon: { value: horizon },
      uSunCol: { value: c(theme.sun || 0xffffff) }, uSunDir: { value: sunDir.clone().normalize() },
      uCloud: { value: c(theme.cloud || 0xf4f0ea) }, uTime: { value: 0 }, uClouds: { value: theme.clouds ?? 0.6 },
      uCloudTex: { value: cloudTexture() },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 12), mat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); mat.uniforms.uTime.value = performance.now() / 1000; };
  return sky;
}

// ---------- distant skyline ----------
let rs = 3;
const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);

function skylineTexture(style, color) {
  const W = 2048, H = 256;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  rs = style.length * 97 + 11;
  ctx.fillStyle = color;
  const base = H - 4;
  // far hills
  ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(0, base);
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, base - 40 - Math.sin(x * 0.004) * 22 - Math.sin(x * 0.013 + 1) * 12);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  ctx.globalAlpha = 1;
  let x = 0;
  while (x < W) {
    const bw = 30 + rnd() * 90, bh = 30 + rnd() * 90;
    if (style === 'desert') {
      ctx.fillRect(x, base - bh, bw, bh + 4);
      if (rnd() < 0.3) { ctx.beginPath(); ctx.arc(x + bw / 2, base - bh, bw * 0.3, Math.PI, 0); ctx.fill(); }       // dome
      if (rnd() < 0.12) { ctx.fillRect(x + bw * 0.4, base - bh - 70, 10, 70); ctx.beginPath(); ctx.arc(x + bw * 0.4 + 5, base - bh - 70, 8, Math.PI, 0); ctx.fill(); } // minaret
      if (rnd() < 0.2) ctx.fillRect(x + 6, base - bh - 8, bw - 12, 8);                                               // parapet
      if (rnd() < 0.15) { ctx.fillRect(x + bw, base - 110, 5, 110); for (let k = 0; k < 6; k++) { ctx.save(); ctx.translate(x + bw + 2, base - 110); ctx.rotate(-1.3 + k * 0.5); ctx.fillRect(0, -2, 34, 4); ctx.restore(); } } // palm
    } else if (style === 'industrial') {
      ctx.fillRect(x, base - bh * 0.7, bw, bh * 0.7 + 4);
      if (rnd() < 0.25) { ctx.fillRect(x + bw * 0.3, base - bh - 90, 12, 90 + bh * 0.3); }                            // smokestack
      if (rnd() < 0.12) { const cx = x + bw / 2; ctx.fillRect(cx, base - 190, 6, 190); ctx.fillRect(cx - 80, base - 190, 140, 6); ctx.fillRect(cx - 70, base - 190, 3, 40); } // crane
      if (rnd() < 0.3) { ctx.beginPath(); ctx.moveTo(x, base - bh * 0.7); ctx.lineTo(x + bw / 2, base - bh * 0.7 - 20); ctx.lineTo(x + bw, base - bh * 0.7); ctx.fill(); } // gable roof
    } else {
      // power plant: cooling towers, pylons
      if (rnd() < 0.18) {
        const tw = 110, th = 150;
        ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + tw * 0.3, base - th * 0.6, x + tw * 0.18, base - th);
        ctx.lineTo(x + tw * 0.82, base - th); ctx.quadraticCurveTo(x + tw * 0.7, base - th * 0.6, x + tw, base); ctx.fill();
        x += tw + 20; continue;
      }
      ctx.fillRect(x, base - bh * 0.6, bw, bh * 0.6 + 4);
      if (rnd() < 0.25) { const px = x + bw; ctx.fillRect(px, base - 120, 4, 120); ctx.fillRect(px - 20, base - 110, 44, 3); ctx.fillRect(px - 14, base - 95, 32, 3); }
    }
    x += bw + rnd() * 30;
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function makeSkyline(theme, def) {
  const style = theme.skyline || (theme.ground === 'concrete' ? 'industrial' : 'desert');
  const tint = new THREE.Color(theme.sky[2]).lerp(new THREE.Color(theme.sky[1]), 0.35).multiplyScalar(0.82);
  const tex = skylineTexture(style, '#' + tint.getHexString());
  tex.repeat.set(3, 1);
  const r = Math.max(def.w, def.h) * 0.95 + 20;
  const geo = new THREE.CylinderGeometry(r, r, 40, 48, 1, true);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.set(def.w / 2, 16, def.h / 2);
  ring.renderOrder = -9;
  return ring;
}
