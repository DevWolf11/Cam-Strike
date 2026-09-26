// Touch control layout: every control is anchored to a screen corner and sized in "units"
// that scale with the screen (bigger on tablets) times the player's UI scale setting.
// The layout editor lets players drag controls anywhere and resize each one.

const KEY = 'camstrike-layout';
export const CONTROLS = {
  btnFire:   { label: 'Fire', ax: 'r', ay: 'b', dx: 1.35, dy: 2.0, size: 1.5 },
  btnFireL:  { label: 'Left fire', ax: 'l', ay: 'b', dx: 0.95, dy: 2.9, size: 1.0 },
  btnJump:   { label: 'Jump', ax: 'r', ay: 'b', dx: 3.1, dy: 0.8, size: 1.0 },
  btnCrouch: { label: 'Crouch', ax: 'r', ay: 'b', dx: 4.35, dy: 0.8, size: 1.0 },
  btnReload: { label: 'Reload', ax: 'r', ay: 'b', dx: 3.15, dy: 2.05, size: 1.0 },
  btnScope:  { label: 'Scope / lob', ax: 'r', ay: 'b', dx: 1.3, dy: 3.85, size: 1.05 },
  btnUse:    { label: 'Plant / defuse', ax: 'r', ay: 'b', dx: 4.4, dy: 3.3, size: 1.25 },
  btnBuy:    { label: 'Buy', ax: 'l', ay: 'b', dx: 0.75, dy: 1.35, size: 0.8, rect: true },
  btnScore:  { label: 'Scoreboard', ax: 'r', ay: 't', dx: 1.7, dy: 0.45, size: 0.72, rect: true },
  btnPause:  { label: 'Pause', ax: 'r', ay: 't', dx: 0.6, dy: 0.45, size: 0.72, rect: true },
  weapons:   { label: 'Weapons', ax: 'c', ay: 'b', dx: 0, dy: 0.12, size: 1.0, bar: true },
  minimap:   { label: 'Minimap', ax: 'l', ay: 't', dx: 0.15, dy: 0.15, size: 1.0, map: true },
};
const BASE_PX = 58;

let custom = {};
try { custom = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { custom = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(custom)); } catch { /* ignore */ } };

export const layout = { uiScale: 1, mapScale: 1 };

export function unit() {
  // scale with the short side, but don't outgrow the width on squarish tablets
  const w = Math.max(window.innerWidth, window.innerHeight), h = Math.min(window.innerWidth, window.innerHeight);
  return Math.max(0.85, Math.min(2.2, h / 380, w / 740)) * layout.uiScale;
}

export function get(id) { return { ...CONTROLS[id], ...(custom[id] || {}) }; }

export function applyLayout() {
  const u = unit();
  document.documentElement.style.setProperty('--u', u.toFixed(3));
  for (const id of Object.keys(CONTROLS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const c = get(id), px = BASE_PX * u;
    const x = c.dx * px, y = c.dy * px;
    el.style.left = el.style.right = el.style.top = el.style.bottom = '';
    if (c.bar) {
      el.style.transform = '';
      if (c.ax === 'c') { el.style.left = `calc(50% + ${x}px)`; el.style.transform = 'translateX(-50%)'; }
      else el.style[c.ax === 'r' ? 'right' : 'left'] = `calc(${x}px + var(--safe-${c.ax === 'r' ? 'r' : 'l'}))`;
      el.style[c.ay === 'b' ? 'bottom' : 'top'] = `${y}px`;
      el.style.setProperty('--wb', c.size.toFixed(2));
      continue;
    }
    if (c.map) {
      const s = 2.55 * px * c.size * layout.mapScale;
      el.style.width = el.style.height = `${s}px`;
      el.style[c.ax === 'r' ? 'right' : 'left'] = `calc(${x}px + var(--safe-${c.ax === 'r' ? 'r' : 'l'}))`;
      el.style[c.ay === 'b' ? 'bottom' : 'top'] = `${y}px`;
      continue;
    }
    const size = px * c.size;
    el.style.width = `${size * (c.rect ? 1.25 : 1)}px`;
    el.style.height = `${size}px`;
    el.style.fontSize = `${size * 0.34}px`;
    // anchor the button's center
    el.style[c.ax === 'r' ? 'right' : 'left'] = `calc(${x - size * (c.rect ? 0.625 : 0.5)}px + var(--safe-${c.ax === 'r' ? 'r' : 'l'}))`;
    el.style[c.ay === 'b' ? 'bottom' : 'top'] = `${y - size / 2}px`;
  }
}

// ---------------- Editor ----------------
export function openEditor(onDone) {
  const ed = document.getElementById('layoutEditor');
  const sizeIn = document.getElementById('leSize'), nameEl = document.getElementById('leName');
  document.body.classList.add('editing');
  ed.classList.remove('hidden');
  let sel = 'btnFire';
  const els = Object.keys(CONTROLS).map((id) => document.getElementById(id)).filter(Boolean);
  const select = (id) => {
    sel = id;
    for (const el of els) el.classList.toggle('le-sel', el.id === id);
    nameEl.textContent = CONTROLS[id].label;
    sizeIn.value = get(id).size;
  };
  select(sel);
  let drag = null;
  const down = (e) => {
    const el = e.target.closest('[id]');
    if (!el || !CONTROLS[el.id] || e.target.closest('#layoutEditor')) return;
    e.preventDefault(); e.stopPropagation();
    select(el.id);
    const r = el.getBoundingClientRect();
    drag = { id: el.id, ox: e.clientX - (r.left + r.width / 2), oy: e.clientY - (r.top + r.height / 2), pid: e.pointerId };
  };
  const move = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    e.preventDefault();
    const c = get(drag.id), u = unit(), px = BASE_PX * u;
    const el = document.getElementById(drag.id), r = el.getBoundingClientRect();
    let cx = e.clientX - drag.ox, cy = e.clientY - drag.oy;
    const W = window.innerWidth, H = window.innerHeight;
    // re-anchor to the nearest corner so layouts survive rotation/resizing
    const ax = cx > W / 2 ? 'r' : 'l', ay = cy > H / 2 ? 'b' : 't';
    let dx, dy;
    if (c.bar && Math.abs(cx - W / 2) < W * 0.15) {
      const top = cy - r.height / 2;
      custom[drag.id] = { ...(custom[drag.id] || {}), ax: 'c', ay, dx: (cx - W / 2) / px, dy: Math.max(0, (ay === 'b' ? H - (top + r.height) : top) / px) };
      applyLayout();
      return;
    }
    if (c.bar || c.map) {
      const left = cx - r.width / 2, top = cy - r.height / 2;
      dx = (ax === 'r' ? W - (left + r.width) : left) / px;
      dy = (ay === 'b' ? H - (top + r.height) : top) / px;
    } else {
      dx = (ax === 'r' ? W - cx : cx) / px;
      dy = (ay === 'b' ? H - cy : cy) / px;
    }
    custom[drag.id] = { ...(custom[drag.id] || {}), ax, ay, dx: Math.max(0, dx), dy: Math.max(0, dy) };
    applyLayout();
  };
  const up = () => { if (drag) { drag = null; save(); } };
  sizeIn.oninput = () => { custom[sel] = { ...(custom[sel] || {}), size: parseFloat(sizeIn.value) }; applyLayout(); save(); };
  document.getElementById('leReset').onclick = () => { custom = {}; save(); applyLayout(); select(sel); };
  document.getElementById('leDone').onclick = () => {
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    for (const el of els) el.classList.remove('le-sel');
    document.body.classList.remove('editing');
    ed.classList.add('hidden');
    onDone?.();
  };
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointermove', move, { capture: true, passive: false });
  window.addEventListener('pointerup', up, true);
}
