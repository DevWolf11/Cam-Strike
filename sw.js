// Offline cache: the whole game is static files, so cache-first works well.
const CACHE = 'camstrike-v13';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './lib/three.module.min.js', './lib/peerjs.min.js',
  './lib/addons/GLTFLoader.js', './lib/addons/SkeletonUtils.js', './lib/addons/BufferGeometryUtils.js',
  './assets/models/swat_gasmask.glb', './assets/models/swat_spec.glb', './assets/models/swat_blue.glb', './assets/models/rebel.glb', './assets/models/thug.glb', './assets/models/militia.glb', './assets/models/tactical.glb', './assets/models/terrorista.glb',
  './assets/weapons/rifle.glb', './assets/weapons/rifle_w.glb', './assets/weapons/smg.glb', './assets/weapons/smg_w.glb', './assets/weapons/shotgun.glb', './assets/weapons/shotgun_w.glb', './assets/weapons/sniper.glb', './assets/weapons/sniper_w.glb', './assets/weapons/pistol.glb', './assets/weapons/pistol_w.glb', './assets/weapons/he.glb', './assets/weapons/he_w.glb', './assets/weapons/flash.glb', './assets/weapons/flash_w.glb', './assets/weapons/smoke.glb', './assets/weapons/smoke_w.glb', './assets/weapons/bomb.glb', './assets/weapons/bomb_w.glb', './assets/weapons/arms.glb', './assets/weapons/knife.glb', './assets/weapons/molotov.glb',
  './js/main.js', './js/fparms.js', './js/knifeanim.js', './js/particles.js', './assets/audio/sfx.mp3', './assets/audio/sfx.json', './js/game.js', './js/world.js', './js/mapmesh.js', './js/agent.js', './js/character.js', './js/bot.js',
  './js/player.js', './js/hud.js', './js/input.js', './js/audio.js', './js/effects.js', './js/config.js', './js/geom.js',
  './js/textures.js', './js/sky.js', './js/skinned.js', './js/mocap.js', './assets/anims/locomotion.json', './js/hands.js', './js/weapons3d.js', './js/grenades.js', './js/layout.js', './js/loadout.js', './js/net.js', './js/netgame.js',
  './js/maps/index.js', './js/maps/dsl.js', './js/maps/dust2.js', './js/maps/mirage.js', './js/maps/cache.js', './js/maps/nuke.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first (so updates show up), falling back to cache when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
