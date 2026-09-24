import * as THREE from '../lib/three.module.min.js';
import { Game, buildRoster } from './game.js';
import { ClientGame } from './netgame.js';
import { NetHost, NetClient } from './net.js';
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
  name: 'Player' + Math.floor(100 + Math.random() * 900),
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
// The sun never moves and the map never changes, so its shadow map is drawn once per match
renderer.shadowMap.autoUpdate = false;
const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 260);
let scene = null, game = null, ctrl = null, hud = null, paused = false, running = false, lastTeam = 'T';
// Dynamic resolution: if the device can't hold ~45 fps the render resolution drops in steps
// (down to half), and climbs back when there's headroom again.
let dynScale = 1, frameAvg = 1 / 60, perfT = -2;
const dynRes = !new URLSearchParams(location.search).has('fixedres');
function adaptResolution(rawDt) {
  frameAvg += (Math.min(rawDt, 0.2) - frameAvg) * 0.05;
  perfT += rawDt;
  if (perfT < 1.5) return;
  let next = dynScale;
  if (frameAvg > 1 / 44 && dynScale > 0.5) next = Math.max(0.5, dynScale * 0.87);
  else if (frameAvg < 1 / 57 && dynScale < 1) next = Math.min(1, dynScale * 1.08);
  if (next !== dynScale) { dynScale = next; perfT = 0; resize(); }
  else perfT = 1;       // keep checking every ~0.5s once settled
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const q = QUALITY[settings.quality] || 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * q * (w * h > 1.2e6 ? 0.8 : 1) * dynScale);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  $('rotate').classList.toggle('hidden', !(input.touch && h > w && running));
  applyLayout();
}
window.addEventListener('resize', resize);
initInput(canvas, $('touch'));

// Shared setup for solo, host and client matches
function beginMatch(makeGame) {
  Object.assign(settings, { difficulty: $('difficulty').value, quality: $('quality').value, aimAssist: $('aimAssist').checked });
  save();
  initAudio();
  goFullscreen();
  disposeScene();
  const q = settings.quality;
  renderer.shadowMap.enabled = q !== 'low';
  renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  scene = new THREE.Scene();
  game = makeGame(scene);
  renderer.shadowMap.needsUpdate = true;
  game.effects.precompile(renderer, camera);
  perfT = -2; frameAvg = 1 / 60;          // grace period while shaders compile
  ctrl = new PlayerController(game, camera, settings);
  hud = new HUD(game, ctrl, { matchOver });
  window.__game = game; window.__ctrl = ctrl; window.__renderer = renderer;
  for (const id of ['menu', 'over', 'lobby']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !input.touch);
  resetInput();
  running = true; paused = false; input.enabled = true;
  resize();
}

// Match options chosen in the menu (shared by solo and hosted games)
function matchOpts(extra = {}) {
  const custom = settings.mode === 'custom';
  return {
    difficulty: $('difficulty').value, mode: settings.mode, map: settings.map,
    ...(custom ? { tCount: C.tCount, ctCount: C.ctCount, roundsToWin: C.roundsToWin, startMoney: C.startMoney, roundTime: C.roundTime, friendlyFire: C.friendlyFire } : {}),
    ...extra,
  };
}

function startMatch(team) {
  lastTeam = team;
  beginMatch((sc) => new Game(sc, camera, { ...matchOpts(), team, quality: $('quality').value, loadout: settings.loadout, outfit: settings.outfit }));
}

function matchOver(winner) {
  const won = winner === game.player.team;
  $('overTitle').textContent = won ? 'Victory' : 'Defeat';
  $('overTitle').style.color = won ? '#8fe07a' : '#ff4a3a';
  $('overScore').textContent = `${game.mapDef.name} · Terrorists ${game.score.T} - ${game.score.CT} Counter-Terrorists · K/D ${game.player.kills}/${game.player.deaths}`;
  $('again').textContent = net ? 'Back to lobby' : 'Play again';
  $('again').classList.toggle('hidden', net?.role === 'client');
  $('overWait').classList.toggle('hidden', net?.role !== 'client');
  $('over').classList.remove('hidden');
  releasePointer();
}

function quitToMenu() {
  if (net) { net.close(); net = null; }
  running = false; paused = false; input.enabled = false;
  for (const id of ['pause', 'over', 'hud', 'touch', 'buy', 'scoreboard', 'lobby']) $(id).classList.add('hidden');
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
    for (const m of mats) { if (m.map?.userData.owned) m.map.dispose(); m.dispose(); }
  });
  scene = game = ctrl = hud = null;
  if (net) net.game = null;
}

function setPaused(p) {
  paused = p;
  $('pause').classList.toggle('hidden', !p);
  $('quit').textContent = net ? 'Leave match' : 'Quit to menu';
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
$('again').onclick = () => {
  if (net?.role === 'host') { net.backToLobby(); stopMatchToLobby(); }
  else startMatch(lastTeam);
};
$('toMenu').onclick = quitToMenu;
$('resume').onclick = () => setPaused(false);
$('quit').onclick = quitToMenu;
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) return;
  if (input.expectUnlock) { input.expectUnlock = false; return; }
  if (running && !paused && game && game.phase !== 'over') setPaused(true);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && running && !net && game?.phase !== 'over') setPaused(true); });

// ---------- Multiplayer ----------
let net = null, lobbyState = null;
$('mpName').value = settings.name;
$('mpName').oninput = () => { settings.name = $('mpName').value.trim().slice(0, 16) || 'Player'; save(); };
const me = () => ({ name: settings.name, outfit: settings.outfit, loadout: settings.loadout });
const mpStatus = (text, err = false) => { $('mpStatus').textContent = text; $('mpStatus').classList.toggle('err', err); };
$('lbMap').innerHTML = MAP_LIST.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');

$('mpHost').onclick = async () => {
  if (net) return;
  mpStatus('Creating room…');
  try {
    net = new NetHost(me(), { onLobby: renderLobby, onError: (m) => mpStatus(m, true) });
    await net.open();
    net.setSettings({ map: settings.map, mode: settings.mode, fillBots: true, desc: modeDesc() });
    mpStatus('');
    showLobby();
  } catch (e) { net = null; mpStatus(e.message, true); }
};
$('mpJoin').onclick = async () => {
  if (net) return;
  const code = $('mpCode').value.trim();
  if (code.length < 5) { mpStatus('Enter the 5-letter room code from your friend.', true); return; }
  mpStatus('Joining…');
  try {
    net = new NetClient(me(), {
      onLobby: renderLobby,
      onStart: startClientMatch,
      onEnd: () => { stopMatchToLobby(); },
      onClose: (reason) => { net = null; quitToMenu(); mpStatus(reason, true); },
    });
    await net.join(code);
    mpStatus('');
    showLobby();
  } catch (e) { net = null; mpStatus(e.message, true); }
};
$('mpCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('mpJoin').click(); });

function modeDesc() {
  return settings.mode === 'custom' ? `Custom · first to ${C.roundsToWin} · FF ${C.friendlyFire ? 'on' : 'off'}` : 'Competitive · first to 8 · FF on';
}
function inviteLink() { return `${location.origin}${location.pathname}?join=${net.code}`; }

function showLobby() {
  $('menu').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  if (lobbyState) renderLobby(lobbyState);
}
function renderLobby(l) {
  lobbyState = l;
  if (!net) return;
  const host = net.role === 'host', myPid = host ? 'host' : net.pid;
  $('lbCode').textContent = l.code || net.code || '';
  const mapName = MAP_LIST.find((m) => m.id === l.settings.map)?.name || l.settings.map;
  $('lbInfo').textContent = `${mapName} · ${l.settings.desc || ''} · ${l.players.length}/10 players${l.settings.fillBots ? ' · bots fill empty slots' : ''}`;
  for (const t of ['T', 'CT']) {
    $('lb' + t).innerHTML = l.players.filter((p) => p.team === t).map((p) => `<li class="${p.pid === myPid ? 'me' : ''}">${esc(p.name)}${p.pid === 'host' ? '<small>host</small>' : ''}${p.pid === myPid ? '<small>you</small>' : ''}</li>`).join('') || '<li><small>empty</small></li>';
  }
  $('lbHost').classList.toggle('hidden', !host);
  $('lbWait').classList.toggle('hidden', host);
  if (host) { $('lbMap').value = l.settings.map; $('lbBots').checked = l.settings.fillBots !== false; }
}
document.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => net?.setTeam(b.dataset.join)));
$('lbMap').onchange = () => { settings.map = $('lbMap').value; save(); markMap(); net?.setSettings({ map: settings.map }); };
$('lbBots').onchange = () => net?.setSettings({ fillBots: $('lbBots').checked });
$('lbLeave').onclick = () => { quitToMenu(); $('lobby').classList.add('hidden'); };
$('lbCopy').onclick = async () => {
  const link = inviteLink();
  try { await navigator.clipboard.writeText(link); $('lbCopy').textContent = 'Link copied'; }
  catch { prompt('Copy this invite link:', link); }
  setTimeout(() => { $('lbCopy').textContent = 'Copy invite link'; }, 2000);
};
$('lbStart').onclick = () => {
  if (net?.role !== 'host') return;
  const opts = matchOpts({ map: $('lbMap').value, fillBots: $('lbBots').checked });
  const roster = buildRoster(opts, net.humans());
  beginMatch((sc) => new Game(sc, camera, { ...opts, roster, quality: $('quality').value }));
  net.startMatch(game, opts);
};
function startClientMatch(roster, opts) {
  beginMatch((sc) => new ClientGame(sc, camera, { ...opts, roster, quality: $('quality').value }, net));
  net.game = game;
}
function stopMatchToLobby() {
  running = false; paused = false; input.enabled = false;
  for (const id of ['pause', 'over', 'hud', 'touch', 'buy', 'scoreboard']) $(id).classList.add('hidden');
  $('scope').classList.add('hidden'); $('flashbang').style.opacity = 0;
  disposeScene();
  showLobby();
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Invite links: ?join=CODE
const joinCode = new URLSearchParams(location.search).get('join');
if (joinCode) {
  $('mpCode').value = joinCode.toUpperCase().slice(0, 5);
  mpStatus('Enter your name and tap Join to play with your friend.');
  requestAnimationFrame(() => $('mpName').scrollIntoView({ block: 'center' }));
}

// ---------- Main loop ----------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - lastT) / 1000, dt = Math.min(0.05, raw);
  lastT = now;
  if (!running || !game) return;
  if (dynRes && !document.hidden && !paused) adaptResolution(raw);
  if (consume('pause')) setPaused(!paused);
  const editing = document.body.classList.contains('editing');
  // Online the match keeps running while your menu is open (you can't pause your friends)
  if ((!paused || net) && !editing && game.phase !== 'over') {
    ctrl.update(dt);
    game.update(dt);
    hud.update(dt);
  }
  net?.tick(dt);
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
