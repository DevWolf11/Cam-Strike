import * as THREE from '../lib/three.module.min.js';

// Pooled short-lived visual effects.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.puffs = [];
    this.flashes = [];

    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < 40; i++) {
      const g = tracerGeo.clone();
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
      l.frustumCulled = false; l.visible = false;
      scene.add(l); this.tracers.push({ obj: l, t: 0 });
    }
    const puffTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    for (let i = 0; i < 50; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
      s.visible = false; scene.add(s); this.puffs.push({ obj: s, t: 0, life: 0, grow: 0, vy: 0 });
    }
    const flashTex = radialTex('rgba(255,240,180,1)', 'rgba(255,140,20,0)');
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false; scene.add(s); this.flashes.push({ obj: s, t: 0 });
    }
    this.boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0 }));
    this.boom.visible = false; scene.add(this.boom); this.boomT = 0;
    this.ti = this.pi = this.fi = 0;
  }

  tracer(a, b) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    const p = t.obj.geometry.attributes.position;
    // start the tracer a bit ahead of the muzzle so it reads as a streak
    p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
    t.obj.visible = true; t.t = 0.07; t.obj.material.opacity = 0.8;
  }

  puff(pos, color, size = 0.35, life = 0.35, vy = 0.4) {
    const p = this.puffs[this.pi++ % this.puffs.length];
    p.obj.position.copy(pos); p.obj.material.color.setHex(color);
    p.obj.scale.setScalar(size); p.obj.visible = true;
    p.t = p.life = life; p.grow = size * 2.2; p.vy = vy;
  }

  flash(pos, size = 0.45) {
    const f = this.flashes[this.fi++ % this.flashes.length];
    f.obj.position.copy(pos); f.obj.scale.setScalar(size * (0.8 + Math.random() * 0.4));
    f.obj.material.rotation = Math.random() * 6.28;
    f.obj.visible = true; f.t = 0.05;
  }

  explode(pos, scale = 1) {
    this.boom.position.copy(pos); this.boom.visible = true; this.boomT = 1.2; this.boomScale = scale;
    for (let i = 0; i < 16 * scale; i++) {
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8 * scale, Math.random() * 5 * scale, (Math.random() - 0.5) * 8 * scale));
      this.puff(p, i % 2 ? 0x444444 : 0x886655, 2.5 * scale, 2.5 * Math.max(0.5, scale), 1.5);
    }
  }

  update(dt) {
    for (const t of this.tracers) if (t.obj.visible) {
      t.t -= dt; t.obj.material.opacity = Math.max(0, t.t / 0.07) * 0.8;
      if (t.t <= 0) t.obj.visible = false;
    }
    for (const p of this.puffs) if (p.obj.visible) {
      p.t -= dt;
      const k = 1 - p.t / p.life;
      p.obj.material.opacity = Math.max(0, 1 - k) * 0.7;
      p.obj.scale.setScalar(p.grow * (0.45 + k * 0.55));
      p.obj.position.y += p.vy * dt;
      if (p.t <= 0) p.obj.visible = false;
    }
    for (const f of this.flashes) if (f.obj.visible) { f.t -= dt; if (f.t <= 0) f.obj.visible = false; }
    if (this.boom.visible) {
      this.boomT -= dt;
      const k = 1 - this.boomT / 1.2;
      this.boom.scale.setScalar((2 + k * 20) * (this.boomScale || 1));
      this.boom.material.opacity = Math.max(0, 1 - k) * 0.85;
      if (this.boomT <= 0) this.boom.visible = false;
    }
  }
}

function radialTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
