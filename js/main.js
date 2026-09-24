import * as THREE from '../lib/three.module.min.js';
import { Game } from './game.js';
import { PlayerController } from './player.js';
import { HUD } from './hud.js';
import { input, initInput, consume, resetInput, releasePointer } from './input.js';
import { initAudio } from './audio.js';
import { MAP_LIST, getMap } from './maps/index.js';
import { renderMinimap } from './mapmesh.js';
import { layout, applyLayout, openEditor } from './layout.js';
import { openLoadout } from './loadout.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const QUALITY = { low: 0.6, medium: 1, high: 1.5 };
const DEFAULTS = {
  sens: 1, difficulty: 'normal', quality: 'medium', aimAssist: true, uiScale: 1, mapScale: 1,
  mode: 'competitive', map: 'dust2',
  custom: { tCount: 5, ctCount: 5, roundsToWin: 8, startMoney: 800, roundTime: 115, friendlyFire: true },
  loadout: { skins: {}, knifeType: 'classic', knifeSkin: 'factory' }, outfit: { T: 0, CT: 0 },
};
const settings = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('camstrike') || '{}');
    return { ...DEFAULTS, ...s, custom: { ...DEFAULTS.custom, ...(s.custom || {}) }, loadout: { ...DEFAULTS.loadout, ...(s.loadout || {}) }, outfit: { ...DEFAULTS.outfit, ...(s.outfit || {}) } };
  } catch { return structuredClone(DEFAULTS); }
}
function save() { try { localStorage.setItem('camstrike', JSON.stringify(settings)); } catch { /* storage unavailable */ } }

// ---------- Menu wiring ----------
$('sens').value = $('pauseSens').value = settings.sens;
$('uiScale').value = $('pauseUi').value = settings.uiScale;
$('mapScale').value = $('pauseMap').value = settings.mapScale;
$('difficulty').value = settings.difficulty; $('quality').value = settings.quality; $('aimAssist').checked = settings.aimAssist;
input.sens = settings.sens; layout.uiScale = settings.uiScale; layout.mapScale = settings.mapScale;

function setMode(mode) {
  settings.mode = mode;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.mode === mode));
  $('customPanel').classList.toggle('hidden', mode !== 'custom');
  save();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
setMode(settings.mode);

// map cards with real minimap thumbnails
$('mapPick').innerHTML = MAP_LIST.map((m) => `<button class="map-card" data-map="${m.id}"><canvas></canvas><b>${m.name}</b><small>${m.blurb}</small></button>`).join('');
document.querySelectorAll('.map-card').forEach((card) => {
  const c = card.querySelector('canvas'), img = renderMinimap(getMap(card.dataset.map), 200);
  c.width = c.height = 200; c.getContext('2d').drawImage(img, 0, 0);
  card.addEventListener('click', () => { settings.map = card.dataset.map; save(); markMap(); });
});
function markMap() { document.querySelectorAll('.map-card').forEach((c) => c.classList.toggle('on', c.dataset.map === settings.map)); }
markMap();

// custom settings
const C = settings.custom;
const bindRange = (id, out, key, fmtFn = (v) => v) => {
  const el = $(id); el.value = C[key]; $(out).textContent = fmtFn(+el.value);
  el.oninput = () => { C[key] = +el.value; $(out).textContent = fmtFn(C[key]); save(); };
};
bindRange('cT', 'oT', 'tCount'); bindRange('cCT', 'oCT', 'ctCount'); bindRange('cR', 'oR', 'roundsToWin');
bindRange('cM', 'oM', 'startMoney', (v) => '$' + v);
bindRange('cRT', 'oRT', 'roundTime', (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`);
$('cFF').checked = C.friendlyFire; $('cFF').onchange = () => { C.friendlyFire = $('cFF').checked; save(); };

const syncSlider = (a, b, key, apply) => {
  const f = (e) => { settings[key] = parseFloat(e.target.value); $(a).value = $(b).value = settings[key]; apply(); save(); };
  $(a).oninput = f; $(b).oninput = f;
};
syncSlider('sens', 'pauseSens', 'sens', () => { input.sens = settings.sens; });
syncSlider('uiScale', 'pauseUi', 'uiScale', () => { layout.uiScale = settings.uiScale; applyLayout(); });
syncSlider('mapScale', 'pauseMap', 'mapScale', () => { layout.mapScale = settings.mapScale; applyLayout(); });

$('openLoadout').onclick = () => openLoadout(settings, save);
const editLayout = () => {
  const wasHidden = { hud: $('hud').classList.contains('hidden'), touch: $('touch').classList.contains('hidden') };
  $('hud').classList.remove('hidden'); $('touch').classList.remove('hidden');
  applyLayout();
  openEditor(() => {
    if (wasHidden.hud) $('hud').classList.add('hidden');
    if (wasHidden.touch) $('touch').classList.add('hidden');
  });
};
$('openLayout').onclick = editLayout;
$('pauseLayout').onclick = editLayout;

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 260);
let scene = null, game = null, ctrl = null, hud = null, paused = false, running = false, lastTeam = 'T';

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const q = QUALITY[settings.quality] || 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * q * (w * h > 1.2e6 ? 0.8 : 1));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  $('rotate').classList.toggle('hidden', !(input.touch && h > w && running));
  applyLayout();
}
window.addEventListener('resize', resize);
initInput(canvas, $('touch'));

function startMatch(team) {
  lastTeam = team;
  Object.assign(settings, { difficulty: $('difficulty').value, quality: $('quality').value, aimAssist: $('aimAssist').checked });
  save();
  initAudio();
  goFullscreen();
  disposeScene();
  scene = new THREE.Scene();
  const custom = settings.mode === 'custom';
  game = new Game(scene, camera, {
    team, difficulty: settings.difficulty, mode: settings.mode, map: settings.map, quality: settings.quality,
    loadout: settings.loadout, outfit: settings.outfit,
    ...(custom ? { tCount: C.tCount, ctCount: C.ctCount, roundsToWin: C.roundsToWin, startMoney: C.startMoney, roundTime: C.roundTime, friendlyFire: C.friendlyFire } : {}),
  });
  ctrl = new PlayerController(game, camera, settings);
  hud = new HUD(game, ctrl, { matchOver });
  window.__game = game; window.__ctrl = ctrl;
  $('menu').classList.add('hidden'); $('over').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !input.touch);
  resetInput();
  running = true; paused = false; input.enabled = true;
  resize();
}

function matchOver(winner) {
  const won = winner === game.player.team;
  $('overTitle').textContent = won ? 'Victory' : 'Defeat';
  $('overTitle').style.color = won ? '#8fe07a' : '#ff4a3a';
  $('overScore').textContent = `${game.mapDef.name} · Terrorists ${game.score.T} - ${game.score.CT} Counter-Terrorists · K/D ${game.player.kills}/${game.player.deaths}`;
  $('over').classList.remove('hidden');
  releasePointer();
}

function quitToMenu() {
  running = false; paused = false; input.enabled = false;
  for (const id of ['pause', 'over', 'hud', 'touch', 'buy', 'scoreboard']) $(id).classList.add('hidden');
  $('scope').classList.add('hidden'); $('flashbang').style.opacity = 0;
  $('menu').classList.remove('hidden');
  disposeScene();
  resize();
}

function disposeScene() {
  if (!scene) return;
  game?.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) m.dispose();
  });
  scene = game = ctrl = hud = null;
}

function setPaused(p) {
  paused = p;
  $('pause').classList.toggle('hidden', !p);
  if (p) { resetInput(); releasePointer(); }
}

async function goFullscreen() {
  if (!input.touch) return;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch { /* not supported (e.g. iOS Safari) */ }
}

document.querySelectorAll('.team-btn').forEach((b) => b.addEventListener('click', () => startMatch(b.dataset.team)));
$('again').onclick = () => startMatch(lastTeam);
$('toMenu').onclick = quitToMenu;
$('resume').onclick = () => setPaused(false);
$('quit').onclick = quitToMenu;
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) return;
  if (input.expectUnlock) { input.expectUnlock = false; return; }
  if (running && !paused && game && game.phase !== 'over') setPaused(true);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && running && game?.phase !== 'over') setPaused(true); });

// ---------- Main loop ----------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!running || !game) return;
  if (consume('pause')) setPaused(!paused);
  const editing = document.body.classList.contains('editing');
  if (!paused && !editing && game.phase !== 'over') {
    ctrl.update(dt);
    game.update(dt);
    hud.update(dt);
  }
  ctrl.render(renderer, scene);
}
requestAnimationFrame(frame);
resize();

// ---------- PWA ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredInstall = e;
  $('installHint').innerHTML = '<button class="menu-btn ghost" id="installBtn">Install as app</button>';
  $('installBtn').onclick = async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('installHint').textContent = ''; };
});
if (input.touch && !window.matchMedia('(display-mode: standalone)').matches) {
  $('installHint').textContent = 'Tip: use "Add to Home screen" in your browser menu to play fullscreen like an app.';
}
