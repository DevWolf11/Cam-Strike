# Cam-Strike

A tactical first-person shooter in the spirit of Counter-Strike, built to run in a mobile browser (Android Chrome) and installable as an app. Play solo against bots or online with friends. No build step and no downloads beyond the page itself: plain HTML + JavaScript modules + [three.js](https://threejs.org) (vendored in `lib/`, so it also works offline).

▶ Play now: https://devwolf11.github.io/Cam-Strike/ (works on most browsers; on your phone, use "Add to Home screen" to play full screen like an app)

## Game modes

- **Competitive:** 5v5 bomb defusal, first to 8 rounds, friendly fire on.
- **Custom:** pick the team sizes (1 to 10 players per side), rounds to win, starting money, round length and whether friendly fire is on.

You play one of the players; every other slot is a bot.

**Terrorists** win a round by planting the bomb at **site A or B** and letting it detonate (40s), or by eliminating every Counter-Terrorist. **Counter-Terrorists** win by defusing the bomb (10s, 5s with a kit), eliminating the Terrorists before they plant, or running out the clock.

## Online multiplayer (play with friends)

1. Open the game and type your name under **Play with friends**.
2. One person taps **Host a game**. They get a 5-letter **room code** and a **Copy invite link** button to send to friends.
3. Friends open the invite link (or type the code and tap **Join**). Everyone picks a team in the lobby.
4. The host picks the map, chooses whether bots fill the empty slots, and taps **Start match**. The mode and rules come from the host's menu (Competitive or Custom).

Up to 10 people can play together, and bots fill the rest of each team if you like. After the match the host can take everyone **back to the lobby** for a rematch. If a friend drops out mid-match, a bot takes over their player.

How it works: it's peer-to-peer over WebRTC ([PeerJS](https://peerjs.com), vendored in `lib/`). There's no game server to run. The host's device runs the real match (bots, damage, money, rounds). Each friend's device predicts their own movement and shots so controls feel instant, and draws everyone else slightly behind (interpolation). Hits from friends are lag-compensated on the host. PeerJS's free public server only introduces the players to each other. Game traffic goes directly between devices, or through PeerJS's free relay when a mobile network blocks direct connections.

Things to know:
- The host must keep the game open in the foreground. If the host switches apps, the match freezes for everyone, and if the host leaves, the match ends.
- Movement is trusted from each player's device, so it's meant for friends, not strangers.
- Online play needs the hosted version (GitHub Pages or any web server), not a local `file://` copy.
- For testing with your own signaling server, add `?peer=host:port` to the URL. It points the game at a self-hosted [PeerJS server](https://github.com/peers/peerjs-server).

## Maps

Four maps modeled on the CS2 classics. Each has a 1m grid with real floor heights (stairs, ramps, raised sites, jumpable crates, low cover you can shoot over) and indoor areas with ceilings. Detail includes doors, windows, awnings, lamps, cars, containers, barrels and silos. The HUD shows the callout for where you're standing.

| Map | Layout |
|---|---|
| **Dust II** | Raised T spawn, Long A through long doors with Pit, Catwalk climbing out of Mid, Xbox, Mid doors, upper and lower tunnels to B, B doors, raised A site with ramps |
| **Mirage** | T spawn east, Palace and A ramp to A, Connector and Jungle, raised CT Window over Mid, Apartments and Short to B, Market |
| **Cache** | Container yard: Quad and Truck on A, Squeaky, Highway, Garage, White box in Mid, Z connector, Checkers, Sun room, B heaven |
| **Nuke** | Two levels: the main level sits 2.4m up and B is a real lower floor, reached by Ramp room, the CT decon ramp and the vent from A. A is a tall hall with a Heaven catwalk. Outside yard with silos, Lobby, Hut, Squeaky |

## Graphics

Everything is generated in code, with no image files: textures are painted onto canvases when the map loads, and the sky, clouds and effects are built the same way.

- **Lighting:** a sun that casts real shadows (drawn once per match, since the map never moves), a sky dome with drifting clouds and a sun glow, a distant skyline for each map (desert town, industrial yard, power plant), filmic tone mapping and ambient occlusion baked into the map.
- **Materials:** 512px textures with matching bump maps, so mortar lines, cobbles, planks and corrugated metal catch the light. Walls have a stone base band, and the maps carry posters, graffiti, drainpipes, AC units and rubble.
- **Effects:** bullet holes, blood splatter and scorch marks that stay on walls and floors until the round ends, sparks and debris on impact, ejected shell casings, and starburst muzzle flashes that light up nearby walls. Smoke, fire and explosions are camera-facing billboards drawn in one batch per kind, with their textures generated from noise when the match loads:
  - **Smoke grenades** vent for about a second and a half. Lit, lumpy puffs burst out of the canister, slow down, pile up against walls and fill the space: a dome about 4 m wide and 5 m tall, the same size as the cloud that blocks sight. If you stand inside, the view greys out, but not your own gun.
  - **HE grenades and the bomb** explode as a white flash, then a churning fireball (an animated flipbook going from white-hot to orange to soot). The fireball cools into grey-brown smoke that rises and spreads, while a ring of dust rolls out along the ground, and sparks, debris, a scorch mark and camera shake follow.
  - **Molotovs** splash, then a burning pool spreads from where the bottle broke. Flame tongues and low flames keep springing up across it, with a flickering orange glow that lights the walls, dark smoke, embers and a charred patch. Smoke puts it out.
  - **Flashbangs** give a white glare that swells and vanishes in a blink, a hard light on everything around, sparks and a wisp of smoke.
  - Thrown grenades tumble in the air and roll to a stop.
- **Weapons:** every gun is modelled from real-style side profiles with rounded edges and turned barrels. That means a stamped receiver with rivets and a curved 30-round magazine on the AR-47, a roller-lock SMG with an integral suppressor, a pump shotgun with a vent rib, a thumbhole sniper with a turreted scope, and a pistol with slide serrations. Knives and grenades get the same treatment. In first person, steel, wood and polymer use physically based materials that reflect the map's sky, and your hands have real fingers wrapped around the grip and handguard.
- **Animation:**
  - Your gun sways behind your aim, kicks back with spring recoil, rises when drawn, tilts and slaps in a new magazine when reloading, dips when you land, trails your jumps, and bobs in a figure-8 in step with your footsteps. Every motion is spring-based and frame-rate independent, so it feels the same at 30 and 60 fps.
  - The gun is lit by the map's sun and darkens when you step into shade.
  - Other players' legs move the way they're actually going (strafe, backpedal), and they lean into runs, kick when firing and reach for the magazine when reloading.

**Graphics quality** (in the menu):

| Setting | What you get |
|---|---|
| **Low** | No shadows or bump maps, 256px textures, reduced resolution. For older phones |
| **Medium** | Sun shadows, bump maps, full detail, native resolution (default) |
| **High** | Softer and sharper shadows, sharper texture filtering, higher resolution |

On every setting the game watches its frame rate. If your device can't keep up (below about 45 fps), it lowers the render resolution a step at a time, and raises it again when there's headroom. Add `?fixedres` to the URL to turn this off.

## Weapons and equipment

| Slot | Weapon | Price | Notes |
|---|---|---|---|
| 1 | Viper SMG | $1250 | 850 rpm, forgiving on the move, $600 kill reward |
| 1 | Breacher 12G | $1100 | Shotgun, 9 pellets, $900 kill reward |
| 1 | AR-47 Rifle | $2700 | One-shot headshot, recoil climbs while spraying |
| 1 | Longshot .338 | $4750 | Scoped sniper, one-shot body kill |
| 2 | P-9 Pistol | $200 | Everyone spawns with one |
| 3 | Knife | free | 40 damage, 180 from behind (backstab), fastest movement, $1500 kill reward |
| 4 | Grenades (max 4) | | **HE** $300 (up to 125 damage in a 9m blast), **Flashbang** $200 (blinds anyone looking at it within 26m, max 2), **Smoke** $300 (18s cloud that blocks vision for players *and* bots), **Molotov** $400 (8s fire zone, 4.2m wide, 55 damage per second, put out by smoke) |

A full-strength throw carries a grenade about 35m; the underhand lob is for short, precise tosses. Also available: Kevlar + Helmet ($1000) and a Defuse Kit ($400, CT only). Headshots do 4× damage. You're most accurate standing still, and the crosshair shows your current spread.

### Weapon models and first-person arms

Every gun, all four grenades, the classic knife and the C4 are real textured 3D models (MP5SD, Remington 870, AK-47, AWP-style bolt rifle, Glock 17, M67, M84, M18, a bottle molotov, an M9-style bayonet and a C4 bundle). The guns, grenades and C4 each have two versions: a detailed one with physically based materials for first person, and a low-poly one (a few thousand triangles, one small texture) that characters carry, that lies on the ground and that you see flying through the air. The knife and molotov are small enough to use one model for both. The molotov's rag burns in your hand and trails flames in flight. The Karambit, Butterfly and Bayonet knife styles are still built in code.

In first person you hold them with a pair of rigged arms. Each frame, both hands are placed on the gun with two-bone IK (shoulder, elbow, wrist). Because the hand targets are attached to the gun, the hands follow every sway, recoil kick, reload tilt and knife swing. A wrist can't roll against the forearm without the skin pinching into a thin neck, so most of each hand's roll is carried by the forearm, as it is in a real arm.

The grips are fitted to each model rather than posed by hand. The pistol grips and handguards were measured from the models (their cross-sections, as solid ellipses). When you draw a weapon, each hand slides along its palm until the palm rests on the grip, then every finger closes joint by joint until it touches: the whole finger curls together first, as a real hand closes, then the outer joints keep wrapping. So the right hand wraps the pistol grip with the index finger on the trigger, the left hand cradles the handguard from below with its fingers up the far side, and the pistol is held two-handed in a thumbs-forward grip, with the support hand wrapped around the shooting hand. The knife sits in a hammer grip, knuckles toward the edge. Its idle, draw and two slashes are motion-captured from an animated knife model: the knife's path is replayed in view space and our own arms grip and follow it, so they match every other weapon. Swings alternate the two slashes, and a new swing blends in from wherever the knife is. Grenades sit in the fist with the thumb over the spoon. The throw winds up, whips forward, follows through, and then the next grenade is drawn. If the models can't load, the game falls back to its built-in guns and hands.

### Skins and agents

In **Loadout & skins** you can give every gun and the knife one of 12 skins (the skin's pattern is painted over the model's own texture, so the metal parts keep their shading and gold skins turn metallic), from Factory New up to Covert (Desert Storm, Tiger Tooth, Crimson Web, Neon Rider, Dragon Scale, Nebula, Gilded and more). You can also pick a knife style (Classic, Karambit, Butterfly, Bayonet) and an agent outfit for each team (T: Phoenix, Elite Crew, Separatist, Guerrilla; CT: SWAT, SAS, GIGN, SEAL). A live 3D preview shows the result. Bots roll random outfits and skins.

### Friendly fire and teamkills

Every living teammate has their name and a team-coloured marker above their head, dimmed when they're behind a wall, so a friend coming round a corner is easy to tell apart. With friendly fire on, your bullets, knife and grenades hurt teammates at half damage. Bots won't fire through a teammate who's in the way, but grenades and stray sprays can still cause accidents. **Kill a teammate** and you lose your guns and grenades on the spot and pay a $300 penalty. For the rest of that round and the next 2 rounds you have **only the knife**, can't buy and earn no money.

## Bots

Bots see within a field of view with real line of sight (smokes block it). They hear gunshots and footsteps, need time to react, and aim with an error that tightens over time. They fire in bursts and strafe between bursts, and a flashbang blinds them. Terrorists pick a site, split across routes, smoke and flash the entrances on the execute, plant, then guard the bomb. Counter-Terrorists hold both sites and mid, rotate on callouts, throw HE and molotovs at enemies who break line of sight, and retake and defuse after a plant. Difficulty (Easy, Normal, Hard) changes reaction time, aim, turn speed, field of view and how often they use grenades.

Characters are real, fully textured and skinned models, one per outfit:

| Team | Outfit | Model |
|---|---|---|
| T | Phoenix | ski mask and street clothes (`thug.glb`) |
| T | Elite Crew | MM-14 digital camo with a face wrap (`rebel.glb`) |
| T | Separatist | balaclava and plate carrier (`terrorista.glb`) |
| T | Guerrilla | woodland gear, helmet and balaclava (`militia.glb`) |
| CT | SWAT | police gear and gas mask (`swat_gasmask.glb`) |
| CT | SAS | urban camo and goggles (`swat_spec.glb`) |
| CT | GIGN | blue uniform and helmet (`swat_blue.glb`) |
| CT | SEAL | olive tactical gear, headset and sunglasses (`tactical.glb`) |

They move with **motion capture**, from Mixamo's "Pro Rifle Pack":
- Walking and running in 8 directions are blended by speed and direction. Walking cycles are matched to the movement speed so feet don't slide. The captured run is a quick jog, so at full speed the run cycle uses a longer stride (about 3 steps a second instead of 5) to keep the legs from looking frantic.
- There are also an idle stance, a mid-air pose for jumps, and a kneel while planting or defusing.
- The clips are stored as trajectories of the game's own joints (`assets/anims/locomotion.json`, 76 KB), not as bone rotations, so the same data drives every character regardless of how its skeleton is built.
- The rifle pack's bladed stance is mostly turned back toward the aim. The direction clips are picked at a matching offset, so the feet still step along the real travel direction.
- There's a full crouching set too: a kneel when still, and crouch-walks in 8 directions.
- The upper body stays on the aim: the gun is shouldered and pointed where the player looks, and it moves with the captured torso.
- **Turning in place:** a character standing still keeps its feet planted while the torso twists toward the aim. Past about 50° the feet step round to catch up, leading with the foot on the turning side.

`js/skinned.js` fits whichever model the outfit uses to those joints every frame. That fit:
- aims the hips, spine and head, keeping each model's natural neck lean;
- uses two-bone IK for the arms and legs, so the hands really hold the gun;
- rolls the feet heel-to-toe from the captured toe positions;
- curls the fingers into a grip.

Without the motion data, a procedural walk cycle takes over. Any character with a Mixamo-named skeleton can be dropped in by adding it to `MODELS` in `js/skinned.js` and pointing an outfit at it. Each model was converted to a single skinned mesh of about 14–16k triangles with compressed textures (0.5–1.8 MB each). The SEAL and Separatist models use one texture atlas each, so each character is a single draw call. The SEAL model's Character Creator skeleton was renamed to Mixamo bone names. The Separatist model came without a skeleton; it was rigged by copying the skeleton and skin weights of a Mixamo-rigged SWAT model onto it. If a model can't load, that outfit borrows another character's model, and if none load, the game uses built-in procedural characters.

On death they become **ragdolls** (verlet physics). A body falls with the force of the hit and has full collision:
- it slides along walls, stops at ceilings, and lands on stairs, crates and ledges instead of passing through them;
- bodies pile on top of each other;
- living players shove bodies aside as they walk through them;
- explosions throw bodies, and bullets passing through a body jolt it.

## Sound

The game uses real recordings, all public domain (CC0). They are cut, cleaned (rumble filtered, faded, levelled) and packed into one 440 KB file (`assets/audio/sfx.mp3`, with offsets in `sfx.json`), which loads with the game:

- **Guns:** each gun has its own shots, two recordings each, picked at random with slight pitch changes so sprays don't sound mechanical: a 9 mm Glock, a suppressed H&K for the integrally suppressed SMG, a Mossberg pump shotgun, an AK and a big bolt-action rifle. The shotgun pumps and the sniper works its bolt after every shot.
- **Handling:** reloads play in steps that line up with the reload animation: magazine out, magazine in, then the bolt or slide, or shells one at a time and then the pump. There's also a dry-fire click, a draw sound, knife slashes, stabs and scrapes, a grenade pin, the throw, and metal clinks when a grenade bounces.
- **World:** footsteps, landing, bullet impacts and the odd ricochet, shell casings tinkling on the floor, and bullets whizzing past your head. The HE blast has a low thump, the flashbang has a sharp crack followed by an ear-ringing tone and muffled hearing, the smoke grenade hisses, and the molotov has glass breaking, then a whoosh and the roar of the fire for as long as it burns. The bomb's blast is the biggest of all.
- **Mixing:** far sounds get quieter and duller, and more of them is reverb (a generated room echo). Sounds behind walls are muffled, left and right are panned, a compressor keeps many overlapping shots from clipping, and a voice limit drops the quietest sounds first when it gets busy. Other players' reloads and footsteps are audible nearby, like in CS.
- **Beeps:** the bomb beep, round jingles and hit markers are synthesized. If the sound file can't load, a small synthesizer plays every sound instead.

## Controls

**Touch (Android phone or tablet, in landscape):**
- Left thumb: a movement joystick appears wherever you touch.
- Drag anywhere on the right to look.
- Hold the red button to fire, and keep dragging on it to aim while you shoot. There's a second fire button on the left.
- The weapon bar at the bottom switches between primary, pistol, knife and each grenade type. With a grenade out, fire throws it and the scope button lobs it underhand.
- Hold **USE** (it appears on a site or at the bomb) to plant or defuse.
- The **crouch** button (the down arrow next to jump) toggles crouching.
- **Controls scale with the screen.** Tablets get proportionally bigger buttons and minimap. **Controls size** and **Minimap size** sliders are in the menu and the pause screen. **Move & resize buttons** lets you drag any control anywhere and resize each one; the layout is saved on your device.
- Aim assist (on by default for touch) slows your look over an enemy and gently pulls toward them while you move or shoot.

**Crouching:**
- You move at a third of the speed, and crouch-walking makes no footstep sound.
- Your spread is about 30% tighter.
- Your eye line and hitboxes drop, so you can hide behind low cover.
- Lag compensation rewinds the crouch along with your position.
- Bots aim at a crouched player's real head height, and some of them crouch to spray at range.

**Keyboard + mouse:** WASD move, mouse look (click to capture), left click fire or throw, right click scope or lob, `R` reload, hold `E` plant/defuse, `Space` jump, `Shift` walk, hold `C` or `Ctrl` crouch, `1` primary, `2` pistol, `3` knife, `4` grenades (press again to cycle), `Q` last weapon, `B` buy, `Tab` scoreboard, `Esc` pause.

## Run it

It must be served over HTTP, because ES modules don't load from `file://`:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

### Play on Android via GitHub Pages

The included workflow (`.github/workflows/pages.yml`) deploys every push to `main` (Settings → Pages → Source: **GitHub Actions**). Open the Pages URL in Chrome on Android, then **⋮ → Install app** to play fullscreen in landscape and offline.

For a real APK, paste the Pages URL into [PWABuilder](https://www.pwabuilder.com) to generate an Android package (Trusted Web Activity), or wrap the folder with Capacitor.

## Code layout

| File | What it does |
|---|---|
| `index.html`, `css/style.css` | DOM for the HUD, menus, loadout, layout editor and touch controls |
| `js/main.js` | Boot, menus, renderer, main loop, pause, PWA install |
| `js/config.js` | **All tuning:** weapons, grenades, economy, rules, bot difficulty |
| `js/world.js` | Active map grid: collision with floor heights, bullet raycasts, line of sight and smoke, A* pathfinding |
| `js/maps/*.js` | Map layouts written with a small builder (`dsl.js`): floors, walls, stairs, crates, roofs, zones, callouts, props and bot tactics |
| `js/mapmesh.js`, `js/textures.js`, `js/geom.js` | Turn a map into merged meshes (about 20 draw calls) with procedural textures and bump maps, baked ambient occlusion, sun shadows, windows, doors, posters and props |
| `js/sky.js` | Sky dome (gradient, sun, clouds from a prebaked noise texture) and the distant skyline |
| `js/game.js` | Round flow, economy, shooting and hitboxes, knife, grenades, friendly fire and teamkill punishment, bomb |
| `js/grenades.js` | Grenade physics and effects: HE, flashbang, smoke, molotov |
| `js/bot.js` | Bot AI: perception, aiming, combat, grenade use, team strategy, buying |
| `js/character.js` | Character skeleton, outfits, aim poses, ragdoll physics, procedural fallback models |
| `js/mocap.js` | Loads the motion-capture locomotion and blends walk/run/idle/jump/crouch by speed and direction |
| `js/skinned.js` | Loads the skinned character models and fits them to the skeleton each frame (aim + two-bone IK, finger grip) |
| `js/weapons3d.js` | Loads the gun, grenade, knife and C4 models (built-in fallbacks), knives, weapon skins |
| `js/knifeanim.js` | The knife's first-person idle, slash and draw motion (sampled from the animated knife model) |
| `js/fparms.js` | Rigged first-person arms: IK hand placement on each gun, finger grips |
| `js/agent.js` | Per-player state: inventory, health and money |
| `js/player.js` | First-person camera, movement, viewmodels, aim assist, spectating |
| `js/hud.js`, `js/layout.js`, `js/loadout.js` | HUD and buy menu, adaptive and editable touch layout, loadout screen |
| `js/net.js` | Online play: host and client over PeerJS, lobby, snapshots, events, pings |
| `js/netgame.js` | A friend's copy of the match: local prediction, interpolation, applying host snapshots and events |
| `js/effects.js` | Pooled effects: tracers, muzzle flashes and light, impact sparks and debris, bullet-hole/blood/scorch decals, shell casings, explosions, dust motes, camera shake |
| `js/input.js`, `js/audio.js` | Touch/keyboard/mouse input; sound (sprite loading, distance, walls, reverb, mixing) |
| `js/particles.js` | Billboard particles (smoke, flames, fireballs) and their generated textures |
| `tools/mapcheck.mjs` | Dev tool: `node tools/mapcheck.mjs out/` checks every map's paths and renders top-down PNGs |

three.js r170 (including its GLTFLoader and SkeletonUtils add-ons in `lib/addons/`) and PeerJS 1.5.5 are vendored under the MIT license (`lib/three.LICENSE`, `lib/peerjs.LICENSE`). The SWAT, SAS and GIGN models and the locomotion animations (Pro Rifle Pack) come from Adobe Mixamo. The other character models were converted and optimised for the game. Some are licensed under [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/):

- Phoenix: ["terrorist"](https://skfb.ly/6AnKG) by DJMaesen. Rigged with Mixamo.
- Elite Crew: ["Ukrainian Soldier"](https://skfb.ly/ot9Ny) by doctortex. Rigged with Mixamo.
- Separatist: ["Terrorista"](https://skfb.ly/6xsAy) by jeferson. Rigged for the game.
- SEAL: ["Soldier Full Tactical Gear (LowPolyGameReady)"](https://skfb.ly/pMDAV) by DanlyVostok.

The Guerrilla model (`militia.glb`) is free to use without attribution.

Weapon and first-person arm models, converted and optimised for the game (`assets/weapons/`), licensed under [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) unless noted:

- Viper SMG: ["MP5SD"](https://skfb.ly/oyUN9) by ecler
- Breacher 12G: ["Remington 870 Shotgun"](https://skfb.ly/o9MZx) by Milin Andrei
- AR-47 Rifle: ["AK 47 PBR"](https://skfb.ly/6YAOL) by ErhanMatur
- Longshot .338: ["AWP"](https://skfb.ly/6Z8yp) by Rifeor
- P-9 Pistol: ["Glock 17 Pistol | Low Poly Game Ready 3D Model"](https://sketchfab.com/3d-models/glock-17-pistol-low-poly-game-ready-3d-model-6ca031e39a274fe39416b1e21bedd76c) by JaNaZa_ZaIb, under the Sketchfab Standard license
- HE grenade: ["M67"](https://skfb.ly/oDYJJ) by Firewarden
- Flashbang: ["M84 Stun Grenade 'Flashbang'"](https://skfb.ly/6RKVO) by Vanillatography
- Smoke grenade: ["M18 Smoke Grenade"](https://skfb.ly/6Soqp) by Vanillatography
- C4: ["Simple C4- Bomb"](https://skfb.ly/6zLxq) by Blender3D
- First-person arms: ["First Person arms"](https://skfb.ly/6WwNn) by DJMaesen
- Classic knife and its motion: ["knife Animated"](https://skfb.ly/6XZJB) by DJMaesen (the knife mesh and the knife's path through the idle, slash and draw clips; the model's own arms aren't used)
- Molotov: ["Molotov Cocktail"](https://sketchfab.com/3d-models/molotov-cocktail-e57a0fd669974a3dab7d3919bda9032c) by LiliumLetifer (the bottle's brand label was painted out and the model's flame sprites were left out; the flames are the game's own)

Sound effects, all CC0 (public domain), from [Freesound](https://freesound.org) and [Kenney](https://kenney.nl):
- **Gunshots:** "9mm pistol shot" by michorvath, "Glock 19X" and "Heckler & Koch MP7 Suppressed" by areniporgen, "silenced pistol shot" by Clutvh, "Mossberg 500A - 1 shot and pump" by AnthonyChan0, "shotgun shoot" by MrGungus, two AK-47 recordings by serøutōnin--deprivəd, "FPS Sniper Shot" by qubodup, "Rifle Gun Shot 02" by LilMati.
- **Handling:** "Assault Rifle Reload" by qubodup, "pistol reload sound" by GFL7, "shell load" by CeebFrack, "SXP_SHOTGUN_RACK_01" by dasBUTCHER84, "22 Bolt" by Danwardvs, "9mm Handgun Being Dry Fired" by serøutōnin--deprivəd, "Unholster Gun" by qubodup.
- **Knife:** "Clean fast Swoosh" by Danjocross, "FX - Swoosh - Knife (High Pitch)" by bolkmar, "Large Swede Stab with Whoosh" by minituffy.
- **Grenades and fire:** "Grenade Explosion SFX" by unfa, "CTS 7290" (flashbang) by areniporgen, "Gas Grenade" by Themiwa100, "Breaking Glass #3" by abstraktgeneriert, "Flame Burst" and "Flame Loop" by magnuswaker, "low mid afar explosion 1" by Logicogonist.
- **World:** "bullet ricochet" by aust_paul, ".30 Shell Bouncing" by Danwardvs, "Fly-by whiz SFX" by modusmogulus, "FPS Footsteps Loop" by qubodup, "jump_land" by nhill2003, "Videogame Menu BUTTON CLICK" by Christopherderp.
- **Kenney packs:** "Impact Sounds" and "RPG Audio" (metal clinks, body hits, the grenade pin and the knife draw).
