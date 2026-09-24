# Cam-Strike

A 5v5 tactical first-person shooter in the spirit of Counter-Strike, built to run in a mobile browser (Android Chrome) and installable as an app. No build step and no downloads beyond the page itself: plain HTML + JavaScript modules + [three.js](https://threejs.org) (vendored in `lib/`, so it also works offline).

## The game

- **5v5, bomb defusal.** You play one of the ten; the other nine are bots (4 teammates, 5 enemies).
- **Terrorists** win a round by planting the bomb at **site A or B** and letting it detonate (40s), or by eliminating every Counter-Terrorist.
- **Counter-Terrorists** win by defusing the bomb (10s, 5s with a kit), eliminating the Terrorists before they plant, or running out the 1:55 clock.
- First team to **8 rounds** wins the match.
- **Economy:** money from kills, round wins, loss bonuses (which grow on a losing streak), and a plant bonus. Survivors keep their weapons. Buy during the freeze time or the first 15 seconds while you're in your spawn.
- **Map:** a desert layout loosely inspired by a classic: Long A, Short A (catwalk), Mid with mid doors, B tunnels, an upper tunnel from mid to B, and CT spawn between the sites.

### Weapons

| # | Weapon | Price | Damage | Fire rate | Mag | Notes |
|---|---|---|---|---|---|---|
| 1 | P-9 Pistol | $200 (free default) | 32 | 380 rpm, semi | 12 | Everyone spawns with one |
| 2 | Viper SMG | $1250 | 26 | 850 rpm, auto | 30 | Forgiving while moving, $600 kill reward |
| 3 | Breacher 12G | $1100 | 9 × 24 | 70 rpm | 8 | Shotgun, deadly up close, $900 kill reward |
| 4 | AR-47 Rifle | $2700 | 36 | 600 rpm, auto | 30 | One-shot headshot, recoil climbs while spraying |
| 5 | Longshot .338 | $4750 | 115 | 41 rpm | 5 | Scoped sniper, one-shot body kill |

Plus Kevlar + Helmet ($1000) and a Defuse Kit ($400, CT only). Headshots do 4× damage. Accuracy is best when you stand still. Running, jumping and long sprays all widen the spread, and the crosshair shows it.

### Bots

Bots see within a field of view with real line of sight. They also hear gunshots and footsteps, need time to react, and aim with an error that tightens over time. They fire in bursts and strafe between bursts. Terrorists pick a site, split across two routes, wait for the execute, plant, then guard the bomb. Counter-Terrorists hold both sites and mid, rotate when a teammate spots the push, and retake and defuse after a plant. Difficulty (Easy/Normal/Hard) changes reaction time, aim, turn speed and field of view.

## Controls

**Touch (Android):** play in landscape.
- Left thumb: a movement joystick appears wherever you touch.
- Drag anywhere on the right half to look.
- The big red crosshair button fires. Keep your thumb on it and drag to aim while shooting. There's a second fire button on the left for "claw" grips.
- `R` reloads, `⤒` jumps, `◎` scopes (sniper), and **USE** (appears on a site or near the bomb) plants or defuses while held.
- Tap a weapon on the right to switch. `BUY`, `☰` (scoreboard) and `❚❚` (pause) are top-left.
- Aim assist (on by default for touch) slows your look over an enemy and gently pulls toward them while you move or shoot.

**Keyboard + mouse:** WASD move, mouse look (click to capture), left click fire, right click scope, `R` reload, hold `E` plant/defuse, `Space` jump, `Shift` walk, `1`/`2`/`Q`/wheel switch weapons, `B` buy, `Tab` scoreboard, `Esc` pause.

## Run it

It must be served over HTTP, because ES modules don't load from `file://`:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

To try it on your phone on the same Wi-Fi, open `http://<your-computer-ip>:8000`. Installing as an app and offline play need HTTPS, so use GitHub Pages for those.

### Play on Android via GitHub Pages

1. Merge to `main`.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**. The included workflow (`.github/workflows/pages.yml`) then deploys on every push to `main`.
3. Open `https://<user>.github.io/<repo>/` in Chrome on Android, then **⋮ → Add to Home screen / Install app**. It launches fullscreen in landscape and works offline (service worker).

### Want a real APK?

The game is a standards-compliant PWA, so the easiest route is [PWABuilder](https://www.pwabuilder.com): paste the GitHub Pages URL and it generates a signed Android package (Trusted Web Activity) you can sideload or publish to Google Play. Wrapping it with Capacitor (`npx cap add android`, `webDir: "."`) also works if you want a fully bundled APK.

## Code layout

| File | What it does |
|---|---|
| `index.html`, `css/style.css` | DOM for the HUD, menus, and touch controls |
| `js/main.js` | Boot, renderer, menus, main loop, pause, PWA install |
| `js/config.js` | **All tuning:** weapons, economy, round rules, bot difficulty |
| `js/map.js` | Grid map layout, mesh generation, collision, bullet raycasts, A* pathfinding |
| `js/game.js` | Round flow, economy, shooting and hitboxes (head/body), damage and armor, bomb plant/defuse/explode |
| `js/bot.js` | Bot AI: perception, aiming, combat, team strategy, buying |
| `js/player.js` | First-person camera, movement, viewmodel, aim assist, spectating |
| `js/hud.js` | HUD, minimap, kill feed, buy menu, scoreboard |
| `js/input.js` | Touch joystick, look pad, buttons, keyboard, and mouse |
| `js/audio.js` | Synthesized sound effects (no audio files) |
| `js/effects.js` | Tracers, impacts, muzzle flashes, explosion |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable offline PWA |

three.js r170 is vendored under the MIT license (`lib/three.LICENSE`).
