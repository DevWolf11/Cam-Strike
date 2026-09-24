import * as THREE from '../lib/three.module.min.js';
import { buildMap } from './map.js';
import { Game } from './game.js';
import { PlayerController } from './player.js';
import { HUD } from './hud.js';
import { input, initInput, consume, resetInput, releasePointer } from './input.js';
import { initAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const QUALITY = { low: 0.6, medium: 1, high: 1.5 };

const settings = load();
function load() {
  try { return Object.assign({ sens: 1, difficulty: 'normal', quality: 'medium', aimAssist: true }, JSON.parse(localStorage.getItem('camstrike') || '{}')); }
  catch { return { sens: 1, difficulty: 'normal', quality: 'medium', aimAssist: true }; }
}
function save() { try { localStorage.setItem('camstrike', JSON.stringify(settings)); } catch { /* storage unavailable */ } }

$('sens').value = settings.sens; $('pauseSens').value = settings.sens;
$('difficulty').value = settings.difficulty; $('quality').value = settings.quality; $('aimAssist').checked = settings.aimAssist;
input.sens = settings.sens;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 250);
let scene = null, game = null, ctrl = null, hud = null, paused = false, running = false;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const q = QUALITY[settings.quality] || 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * q * (w * h > 1.2e6 ? 0.8 : 1));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const portrait = input.touch && h > w;
  $('rotate').classList.toggle('hidden', !portrait || !running);
}
window.addEventListener('resize', resize);

initInput(canvas, $('touch'));

function startMatch(team) {
  settings.difficulty = $('difficulty').value;
  settings.quality = $('quality').value;
  settings.aimAssist = $('aimAssist').checked;
  settings.sens = parseFloat($('sens').value);
  input.sens = settings.sens;
  save();
  initAudio();
  goFullscreen();

  scene = new THREE.Scene();
  buildMap(scene);
  game = new Game(scene, camera, { team, difficulty: settings.difficulty });
  ctrl = new PlayerController(game, camera, settings);
  hud = new HUD(game, ctrl, { matchOver });
  window.__game = game; // handy for debugging from the console

  $('menu').classList.add('hidden');
  $('over').classList.add('hidden');
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
  $('overScore').textContent = `Terrorists ${game.score.T} - ${game.score.CT} Counter-Terrorists · K/D ${game.player.kills}/${game.player.deaths}`;
  $('over').classList.remove('hidden');
  releasePointer();
}

function quitToMenu() {
  running = false; paused = false; input.enabled = false;
  $('pause').classList.add('hidden'); $('over').classList.add('hidden');
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  $('buy').classList.add('hidden'); $('scoreboard').classList.add('hidden');
  $('menu').classList.remove('hidden');
  disposeScene();
  resize();
}

function disposeScene() {
  if (!scene) return;
  scene.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) { m.map?.dispose(); m.dispose(); }
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
  } catch { /* not supported (e.g. iOS Safari) - fine */ }
}

document.querySelectorAll('.team-btn').forEach((b) => b.addEventListener('click', () => startMatch(b.dataset.team)));
$('again').onclick = () => { const t = game.player.team; disposeScene(); startMatch(t); };
$('resume').onclick = () => setPaused(false);
$('quit').onclick = quitToMenu;
$('pauseSens').oninput = (e) => { settings.sens = input.sens = parseFloat(e.target.value); $('sens').value = settings.sens; save(); };
$('sens').oninput = (e) => { settings.sens = input.sens = parseFloat(e.target.value); $('pauseSens').value = settings.sens; save(); };
// Esc while the mouse is captured only releases pointer lock (the key never reaches us), so pause then.
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) return;
  if (input.expectUnlock) { input.expectUnlock = false; return; }
  if (running && !paused && game && game.phase !== 'over') setPaused(true);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && running && game?.phase !== 'over') setPaused(true); });

// ---- Main loop ----
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!running || !game) return;
  if (consume('pause')) setPaused(!paused);
  if (!paused && game.phase !== 'over') {
    ctrl.update(dt);
    game.update(dt);
    hud.update(dt);
  }
  ctrl.render(renderer, scene);
}
requestAnimationFrame(frame);
resize();

// ---- PWA ----
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredInstall = e;
  const h = $('installHint');
  h.innerHTML = '<button class="menu-btn ghost" id="installBtn">📲 Install as app</button>';
  $('installBtn').onclick = async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; h.textContent = ''; };
});
if (input.touch && !window.matchMedia('(display-mode: standalone)').matches) {
  $('installHint').textContent = 'Tip: use "Add to Home screen" in your browser menu to play fullscreen like an app.';
}
