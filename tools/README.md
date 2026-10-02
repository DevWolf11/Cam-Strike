# Tools

## First-person grips (`gripsolve.js`, `solve-grips.mjs`)

How each hand holds each weapon is solved, not posed by hand, and baked into `assets/weapons/grips.json`.

- **The gun:** its real triangle mesh is turned into a signed distance field in the gun's own space, at 1.5–2 mm resolution.
- **The hand:** its real skin is skinned on the CPU, so contact and penetration are measured on the skin itself.
- **The solve:** for each hand, CMA-ES moves the wrist (position and orientation), aims the thumb and trigger finger, and places the off-screen shoulder the arm comes from. For every candidate, the fingers close joint by joint until their skin touches the gun (or, for the support hand, the other hand).
- **The score** it minimises adds up:
  - skin inside the gun;
  - a palm that doesn't touch;
  - fingertips that don't touch;
  - the index pad's distance to the trigger face, which is found automatically from the gun's side silhouette;
  - a wrist bent more than 35° from neutral;
  - a few grip-style preferences: fingers wrap, pistol thumbs point forward, and the support hand sits at the model's handguard mark.

To re-solve after changing a model or its first-person placement, serve the repo root on port 8765, then run:

```
node tools/solve-grips.mjs            # every weapon
node tools/solve-grips.mjs pistol     # just one
```

This needs Playwright. A weapon missing from `grips.json` is fitted at draw time instead, using the older ellipse fitter in `js/fparms.js`.

## Map assets (`fetch_textures.py`, `propconv.mjs`, `skyconv.py`)

All map textures, props and skies are CC0 from [Poly Haven](https://polyhaven.com), fetched through its public API (no login).

- **Textures:** `python3 tools/fetch_textures.py` downloads each surface's colour (1024 px) and OpenGL normal map (512 px). The real-world tile size of each one (from the asset's dimensions) goes into `SURF` in `js/mapassets.js`, and a per-surface gain (`GAIN`) brings every photo's average albedo into a realistic range.
- **Props:** download the 1k glTF of each model (`/files/<id>` → `gltf.1k`), then `RAW=<dir> OUT=assets/props node tools/propconv.mjs`. It keeps only the chosen nodes (for assets that ship several variants side by side), bakes node transforms, bottom-centres the prop, drops the roughness/metal/AO maps, simplifies to a triangle budget with meshoptimizer, shrinks the textures and quantizes the vertices. Afterwards regenerate `js/maps/propsizes.js` from `assets/props/props.json` (sizes are used for collision footprints).
- **Skies:** download a 2k `.hdr` of a "pure sky" HDRI, then `python3 tools/skyconv.py <file>.hdr`. It tone-maps the upper hemisphere into a 2048 px JPG and measures the sun's azimuth, elevation and colour, which go into `js/maps/skies.js` so the in-game sun and shadows match the photo.

## Bot map analysis (`botnavcheck.mjs`)

`node tools/botnavcheck.mjs [outDir] [mapId,...] [--big] [--lineups]` runs the bots' map analysis (`js/botnav.js`) on every map. It prints the routes each side takes to each site, where they enter it, the staging spots and how long the analysis took. It also draws each map with:
- T routes in orange/red and CT routes in blue;
- each entrance as a ring with an arrow for the way in;
- the CT holds (green rifle, purple sniper, cyan close, white anchors) with lines to the entrance they watch;
- T staging spots in yellow and plant spots as red crosses.

With `--lineups` it also solves each route's execute utility and draws the smokes, flashes and molotovs with their flight paths. `--big` draws at double scale and writes a close-up of each site.
