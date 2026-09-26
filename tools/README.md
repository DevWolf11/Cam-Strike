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
