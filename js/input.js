// Unified input: touch (virtual joystick + look pad + buttons) and keyboard/mouse.
export const input = {
  move: { x: 0, y: 0 },   // x = strafe right, y = forward. Magnitude <= 1
  lookDX: 0, lookDY: 0,   // accumulated radians-ish units since last frame
  fire: false,
  use: false,
  walk: false,
  pressed: new Set(),     // one-shot actions: jump, reload, scope, buy, slot1..5, next, score
  touch: false,
  sens: 1,
  enabled: false,        // true while a match is running
  expectUnlock: false,   // set when we release pointer lock on purpose (menus)
};

export function releasePointer() {
  if (document.pointerLockElement) { input.expectUnlock = true; document.exitPointerLock(); }
}

export function consume(action) {
  if (input.pressed.has(action)) { input.pressed.delete(action); return true; }
  return false;
}

const keys = new Set();
let joy = null;          // { id, ox, oy }
const lookPointers = new Map(); // id -> {x,y}
const btnPointers = new Map();  // id -> btn element
let els = {};

function setHeld(btn, on) {
  const a = btn.dataset.btn;
  btn.classList.toggle('held', on);
  if (a === 'fire' || a === 'fireL') input.fire = on || [...btnPointers.values()].some((b) => b !== btn && (b.dataset.btn === 'fire' || b.dataset.btn === 'fireL'));
  else if (a === 'use') input.use = on;
  else if (on) input.pressed.add(a);
}

export function initInput(canvas, touchLayer) {
  input.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  els = { stick: document.getElementById('stick'), knob: document.getElementById('knob') };

  // ---- Touch / pointer ----
  touchLayer.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    const btn = e.target.closest('[data-btn]');
    if (btn) {
      btnPointers.set(e.pointerId, btn);
      setHeld(btn, true);
      if (btn.dataset.btn === 'fire') lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    if (e.clientX < window.innerWidth * 0.42 && !joy) {
      joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      els.stick.style.display = 'block';
      els.stick.style.left = e.clientX + 'px'; els.stick.style.top = e.clientY + 'px';
      els.knob.style.transform = 'translate(-50%,-50%)';
    } else {
      lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }, { passive: false });

  touchLayer.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    if (joy && e.pointerId === joy.id) {
      const R = 55;
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { // let the stick follow the thumb so it never "sticks"
        joy.ox += dx * (1 - R / d); joy.oy += dy * (1 - R / d);
        dx *= R / d; dy *= R / d;
        els.stick.style.left = joy.ox + 'px'; els.stick.style.top = joy.oy + 'px';
      }
      els.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      input.move.x = dx / R; input.move.y = -dy / R;
      return;
    }
    const lp = lookPointers.get(e.pointerId);
    if (lp) {
      input.lookDX += (e.clientX - lp.x) * 0.0048 * input.sens;
      input.lookDY += (e.clientY - lp.y) * 0.0048 * input.sens;
      lp.x = e.clientX; lp.y = e.clientY;
    }
  }, { passive: false });

  const end = (e) => {
    if (e.pointerType === 'mouse') return;
    if (joy && e.pointerId === joy.id) {
      joy = null; input.move.x = input.move.y = 0; els.stick.style.display = 'none';
    }
    lookPointers.delete(e.pointerId);
    const btn = btnPointers.get(e.pointerId);
    if (btn) { btnPointers.delete(e.pointerId); setHeld(btn, false); }
  };
  touchLayer.addEventListener('pointerup', end);
  touchLayer.addEventListener('pointercancel', end);
  touchLayer.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- Keyboard ----
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.code;
    keys.add(k);
    if (k === 'Space') input.pressed.add('jump');
    if (k === 'KeyR') input.pressed.add('reload');
    if (k === 'KeyB') input.pressed.add('buy');
    if (k === 'KeyQ') input.pressed.add('next');
    if (k === 'KeyE') input.use = true;
    if (k.startsWith('Digit')) input.pressed.add('slot' + k.slice(5));
    if (k === 'Tab') { e.preventDefault(); input.pressed.add('score'); }
    if (k === 'Escape') input.pressed.add('pause');
    updateKeys();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'KeyE') input.use = false;
    if (e.code === 'Tab') input.pressed.add('scoreUp');
    updateKeys();
  });
  window.addEventListener('blur', () => { keys.clear(); input.fire = false; input.use = false; updateKeys(); });

  // ---- Mouse (desktop, also touchscreen laptops where the touch layer covers the canvas) ----
  window.addEventListener('mousedown', (e) => {
    if (!input.enabled || e.target.closest('.overlay, button, select, input, #weapons')) return;
    if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
    if (e.button === 0) input.fire = true;
    if (e.button === 2) input.pressed.add('scope');
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    input.lookDX += e.movementX * 0.0022 * input.sens;
    input.lookDY += e.movementY * 0.0022 * input.sens;
  });
  window.addEventListener('wheel', (e) => { input.pressed.add('next'); });
}

function updateKeys() {
  if (joy) return;
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const l = Math.hypot(x, y) || 1;
  input.move.x = x / l; input.move.y = y / l;
  input.walk = keys.has('ShiftLeft');
}

export function resetInput() {
  input.fire = false; input.use = false; input.lookDX = input.lookDY = 0;
  input.pressed.clear();
}
