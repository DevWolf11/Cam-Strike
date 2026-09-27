import * as THREE from '../lib/three.module.min.js';
import { loadSky } from './mapassets.js';

// Photographic sky dome (an equirect panorama of a real sky, CC0 from Poly Haven) and a faint
// distant skyline ring. Both follow the camera / sit outside the map and cost two draw calls.

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;            // always at the far plane
}`;
const SKY_FS = `
uniform sampler2D uSky;
uniform float uRot, uRows, uBright;
uniform vec3 uHaze;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float phi = atan(d.z, d.x) - uRot;
  float el = asin(clamp(d.y, -1.0, 1.0));
  // the panorama keeps rows from +90 deg down to (90 - uRows * 180) deg
  float t = (1.5707963 - el) / (uRows * 3.14159265);
  vec2 uv = vec2(fract(phi / 6.2831853 + 0.5), 1.0 - clamp(t, 0.0, 0.999));
  vec3 col = texture2D(uSky, uv).rgb * uBright;
  // blend into the fog colour at the horizon so distant walls melt into the sky
  col = mix(uHaze, col, smoothstep(-0.02, 0.16, d.y));
  gl_FragColor = vec4(col, 1.0);      // already sRGB: no colour-space conversion
}`;

export function makePhotoSky(theme, sky0, rot) {
  const tex = new THREE.Texture();
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uSky: { value: tex }, uRot: { value: rot }, uRows: { value: sky0.rows }, uBright: { value: theme.skyBright ?? 1 },
      uHaze: { value: theme.fog !== undefined ? new THREE.Color(theme.fog).convertLinearToSRGB() : new THREE.Color(...sky0.horizon) },
    },
  });
  loadSky(theme.sky || 'clear').then((t) => {
    // no mipmaps: the longitude wrap (atan seam) would otherwise pick the smallest mip and draw a line
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 1;
    t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    mat.uniforms.uSky.value = t;
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), mat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); };
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

export function makeSkyline(theme, def, sky0) {
  const style = theme.skyline;
  const hor = new THREE.Color().setRGB(...sky0.horizon, THREE.SRGBColorSpace);
  const tint = hor.clone().multiplyScalar(theme.skylineShade ?? 0.72);
  const tex = skylineTexture(style, '#' + tint.getHexString());
  tex.repeat.set(3, 1);
  const r = Math.max(def.w, def.h) * 0.95 + 20;
  const geo = new THREE.CylinderGeometry(r, r, 40, 48, 1, true);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: theme.skylineOpacity ?? 0.8, side: THREE.BackSide, depthWrite: false, fog: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.set(def.w / 2, 16, def.h / 2);
  ring.renderOrder = -9;
  return ring;
}
