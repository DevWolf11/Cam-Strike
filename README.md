# Cam-Strike

A tactical first-person shooter in the spirit of Counter-Strike, built to run in a mobile browser (Android Chrome) and installable as an app. No build step and no downloads beyond the page itself: plain HTML + JavaScript modules + [three.js](https://threejs.org) (vendored in `lib/`, so it also works offline).

## Game modes

- **Competitive:** 5v5 bomb defusal, first to 8 rounds, friendly fire on.
- **Custom:** pick the team sizes (1 to 10 players per side), rounds to win, starting money, round length and whether friendly fire is on.

You play one of the players; every other slot is a bot.

**Terrorists** win a round by planting the bomb at **site A or B** and letting it detonate (40s), or by eliminating every Counter-Terrorist. **Counter-Terrorists** win by defusing the bomb (10s, 5s with a kit), eliminating the Terrorists before they plant, or running out the clock.

## Maps

Four maps modeled on the CS2 classics. Each has a 1m grid with real floor heights (stairs, ramps, raised sites, jumpable crates, low cover you can shoot over) and indoor areas with ceilings. Detail includes doors, windows, awnings, lamps, cars, containers, barrels and silos. The HUD shows the callout for where you're standing.

| Map | Layout |
|---|---|
| **Dust II** | Raised T spawn, Long A through long doors with Pit, Catwalk climbing out of Mid, Xbox, Mid doors, upper and lower tunnels to B, B doors, raised A site with ramps |
| **Mirage** | T spawn east, Palace and A ramp to A, Connector and Jungle, raised CT Window over Mid, Apartments and Short to B, Market |
| **Cache** | Container yard: Quad and Truck on A, Squeaky, Highway, Garage, White box in Mid, Z connector, Checkers, Sun room, B heaven |
| **Nuke** | Two levels: the main level sits 2.4m up and B is a real lower floor, reached by Ramp room, the CT decon ramp and the vent from A. A is a tall hall with a Heaven catwalk. Outside yard with silos, Lobby, Hut, Squeaky |

## Weapons and equipment

| Slot | Weapon | Price | Notes |
|---|---|---|---|
| 1 | Viper SMG | $1250 | 850 rpm, forgiving on the move, $600 kill reward |
| 1 | Breacher 12G | $1100 | Shotgun, 9 pellets, $900 kill reward |
| 1 | AR-47 Rifle | $2700 | One-shot headshot, recoil climbs while spraying |
| 1 | Longshot .338 | $4750 | Scoped sniper, one-shot body kill |
| 2 | P-9 Pistol | $200 | Everyone spawns with one |
| 3 | Knife | free | 40 damage, 180 from behind (backstab), fastest movement, $1500 kill reward |
| 4 | Grenades (max 4) | | **HE** $300 (damage blast), **Flashbang** $200 (blinds anyone looking at it, max 2), **Smoke** $300 (18s cloud that blocks vision for players *and* bots), **Molotov** $400 (7s fire zone, put out by smoke) |

Also available: Kevlar + Helmet ($1000) and a Defuse Kit ($400, CT only). Headshots do 4× damage. You're most accurate standing still, and the crosshair shows your current spread.

### Skins and agents

In **Loadout & skins** you can give every gun and the knife one of 12 skins, from Factory New up to Covert (Desert Storm, Tiger Tooth, Crimson Web, Neon Rider, Dragon Scale, Nebula, Gilded and more). You can also pick a knife style (Classic, Karambit, Butterfly, Bayonet) and an agent outfit for each team (T: Phoenix, Elite Crew, Separatist, Guerrilla; CT: SWAT, SAS, GIGN, SEAL). A live 3D preview shows the result. Bots roll random outfits and skins.

### Friendly fire and teamkills

With friendly fire on, your bullets, knife and grenades hurt teammates at half damage. Bots won't fire through a teammate who's in the way, but grenades and stray sprays can still cause accidents. **Kill a teammate** and you lose your guns and grenades on the spot and pay a $300 penalty. For the rest of that round and the next 2 rounds you have **only the knife**, can't buy and earn no money.

## Bots

Bots see within a field of view with real line of sight (smokes block it). They hear gunshots and footsteps, need time to react, and aim with an error that tightens over time. They fire in bursts and strafe between bursts, and a flashbang blinds them. Terrorists pick a site, split across routes, smoke and flash the entrances on the execute, plant, then guard the bomb. Counter-Terrorists hold both sites and mid, rotate on callouts, throw HE and molotovs at enemies who break line of sight, and retake and defuse after a plant. Difficulty (Easy, Normal, Hard) changes reaction time, aim, turn speed, field of view and how often they use grenades.

Characters are jointed models with walk and aim animation. On death they become **ragdolls** (verlet physics) that fall with the force of the hit and collide with the map.

## Controls

**Touch (Android phone or tablet, in landscape):**
- Left thumb: a movement joystick appears wherever you touch.
- Drag anywhere on the right to look.
- Hold the red button to fire, and keep dragging on it to aim while you shoot. There's a second fire button on the left.
- The weapon bar at the bottom switches between primary, pistol, knife and each grenade type. With a grenade out, fire throws it and the scope button lobs it underhand.
- Hold **USE** (it appears on a site or at the bomb) to plant or defuse.
- **Controls scale with the screen.** Tablets get proportionally bigger buttons and minimap. **Controls size** and **Minimap size** sliders are in the menu and the pause screen. **Move & resize buttons** lets you drag any control anywhere and resize each one; the layout is saved on your device.
- Aim assist (on by default for touch) slows your look over an enemy and gently pulls toward them while you move or shoot.

**Keyboard + mouse:** WASD move, mouse look (click to capture), left click fire or throw, right click scope or lob, `R` reload, hold `E` plant/defuse, `Space` jump, `Shift` walk, `1` primary, `2` pistol, `3` knife, `4` grenades (press again to cycle), `Q` last weapon, `B` buy, `Tab` scoreboard, `Esc` pause.

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
| `js/mapmesh.js`, `js/textures.js`, `js/geom.js` | Turn a map into merged meshes (about 20 draw calls) with procedural textures, fake ambient occlusion, windows, doors and props |
| `js/game.js` | Round flow, economy, shooting and hitboxes, knife, grenades, friendly fire and teamkill punishment, bomb |
| `js/grenades.js` | Grenade physics and effects: HE, flashbang, smoke, molotov |
| `js/bot.js` | Bot AI: perception, aiming, combat, grenade use, team strategy, buying |
| `js/character.js` | Jointed character models, outfits, walk and aim poses, ragdoll physics |
| `js/weapons3d.js` | Gun, knife and grenade models, weapon skins |
| `js/agent.js` | Per-player state: inventory, health and money |
| `js/player.js` | First-person camera, movement, viewmodels, aim assist, spectating |
| `js/hud.js`, `js/layout.js`, `js/loadout.js` | HUD and buy menu, adaptive and editable touch layout, loadout screen |
| `js/input.js`, `js/audio.js`, `js/effects.js` | Touch/keyboard/mouse input, synthesized sounds, tracers and impacts |
| `tools/mapcheck.mjs` | Dev tool: `node tools/mapcheck.mjs out/` checks every map's paths and renders top-down PNGs |

three.js r170 is vendored under the MIT license (`lib/three.LICENSE`).
