import * as THREE from '../lib/three.module.min.js';
import { SKINS, KNIVES, weaponMesh } from './weapons3d.js';
import { OUTFITS, Character } from './character.js';
import { WEAPONS } from './config.js';

const $ = (id) => document.getElementById(id);
const ITEMS = ['knife', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper'];
let renderer = null;   // one WebGL context for the preview, reused between visits

// Loadout & skins screen with a live 3D preview.
export function openLoadout(settings, save) {
  const lo = settings.loadout || (settings.loadout = { skins: {}, knifeType: 'classic', knifeSkin: 'factory' });
  lo.skins ||= {};
  settings.outfit ||= { T: 0, CT: 0 };
  let sel = 'rifle';
  $('loadout').classList.remove('hidden');

  // ---- 3D preview ----
  const canvas = $('loPreview');
  renderer ||= new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4a35, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 3, 2); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(35, 16 / 10, 0.01, 50);
  let model = null, char = null, t = 0, raf = 0;
  const fake = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, moving: 0, speed: 0, onGround: true };

  function showModel() {
    if (model) scene.remove(model);
    if (char) { char.dispose(); char = null; }
    model = null;
    if (sel.startsWith('agent')) {
      const team = sel.slice(5);
      char = new Character(scene, team, settings.outfit[team]);
      char.setGun(weaponMesh('rifle', lo));
      cam.position.set(0, 1.1, 3.4); cam.lookAt(0, 0.95, 0);
    } else {
      model = weaponMesh(sel, lo);
      const len = sel === 'knife' ? 0.3 : WEAPONS[sel].len;
      model.scale.setScalar(0.9 / Math.max(0.3, len));
      scene.add(model);
      cam.position.set(0, 0.25, 2.2); cam.lookAt(0, 0, 0);
    }
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    t += 1 / 60;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * devicePixelRatio || canvas.height !== h * devicePixelRatio) { renderer.setPixelRatio(devicePixelRatio); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    if (model) model.rotation.set(0.25, Math.PI / 2 + Math.sin(t * 0.6) * 0.9, 0);
    if (char) { fake.yaw = Math.PI + Math.sin(t * 0.5) * 0.9; fake.pitch = Math.sin(t * 0.7) * 0.15; char.pose(fake, 1 / 60, 'rifle', 0.7); }
    renderer.render(scene, cam);
  }

  // ---- lists ----
  function renderLists() {
    $('loWeapons').innerHTML = ITEMS.map((id) => {
      const skin = id === 'knife' ? lo.knifeSkin : lo.skins[id];
      const sk = SKINS.find((s) => s.id === (skin || 'factory'));
      const name = id === 'knife' ? (KNIVES.find((k) => k.id === lo.knifeType)?.name || 'Knife') : WEAPONS[id].name;
      return `<button data-item="${id}" class="${sel === id ? 'on' : ''}"><b>${name}</b><small>${sk.name}</small></button>`;
    }).join('');
    $('loAgents').innerHTML = ['T', 'CT'].map((team) => {
      const o = OUTFITS[team][settings.outfit[team]];
      return `<button data-agent="${team}" class="${team.toLowerCase()} ${sel === 'agent' + team ? 'on' : ''}"><b>${team === 'T' ? 'Terrorist' : 'CT'}</b><small>${o.name}</small></button>`;
    }).join('');
    const kt = $('loKnifeTypes');
    kt.classList.toggle('hidden', sel !== 'knife');
    kt.innerHTML = KNIVES.map((k) => `<button data-knife="${k.id}" class="${lo.knifeType === k.id ? 'on' : ''}">${k.name}</button>`).join('');
    const sk = $('loSkins');
    if (sel.startsWith('agent')) {
      const team = sel.slice(5);
      sk.innerHTML = OUTFITS[team].map((o, i) => `<button class="skin ${settings.outfit[team] === i ? 'on' : ''}" data-outfit="${i}" style="--rar:${team === 'T' ? '#e0a33a' : '#5aa0ff'}"><b>${o.name}</b><small>${o.head}</small></button>`).join('');
    } else {
      const cur = sel === 'knife' ? lo.knifeSkin : lo.skins[sel] || 'factory';
      sk.innerHTML = SKINS.map((s) => `<button class="skin ${cur === s.id ? 'on' : ''}" data-skin="${s.id}" style="--rar:${s.color}"><b>${s.name}</b><small>${s.rarity}</small></button>`).join('');
    }
  }

  const onClick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.item) { sel = b.dataset.item; }
    else if (b.dataset.agent) { sel = 'agent' + b.dataset.agent; }
    else if (b.dataset.knife) { lo.knifeType = b.dataset.knife; }
    else if (b.dataset.skin) { if (sel === 'knife') lo.knifeSkin = b.dataset.skin; else lo.skins[sel] = b.dataset.skin; }
    else if (b.dataset.outfit) { settings.outfit[sel.slice(5)] = +b.dataset.outfit; }
    else return;
    save();
    renderLists(); showModel();
  };
  const body = document.querySelector('#loadout .lo-body');
  body.addEventListener('click', onClick);
  $('loClose').onclick = () => {
    cancelAnimationFrame(raf);
    body.removeEventListener('click', onClick);
    if (char) char.dispose();
    $('loadout').classList.add('hidden');
  };
  renderLists(); showModel(); frame();
}
