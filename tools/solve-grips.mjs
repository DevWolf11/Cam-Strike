// Solve the first-person grips and bake them into assets/weapons/grips.json.
//
//   python3 -m http.server 8765        (from the repo root, in another terminal)
//   node tools/solve-grips.mjs [ids...] (needs Playwright: npm i -D playwright)
//
// Each hand is solved in the running game (tools/gripsolve.js): the right hand first, then the left
// hand around it. Results for the ids given replace those entries in grips.json; others are kept.
import { chromium } from 'playwright';
import fs from 'fs';

const ALL = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper', 'knife', 'he', 'flash', 'smoke', 'molotov'];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
// more restarts / iterations for a stubborn one: SEEDS=6 ITERS=200 node tools/solve-grips.mjs flash
const SEEDS = [7, 11, 23, 31, 47, 59, 71, 83].slice(0, +(process.env.SEEDS || 3)), ITERS = +(process.env.ITERS || 120);
const OUT = new URL('../assets/weapons/grips.json', import.meta.url);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 300 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto('http://localhost:8765/index.html?fixedres&nobaked');
await page.click('.team-btn.t');
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 120000 });
const file = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT)) : { grips: {} };
for (const id of ids) {
  const res = await page.evaluate(async ([id, SEEDS, ITERS]) => {
    const T = await import('/tools/gripsolve.js'), W = await import('/js/weapons3d.js');
    const NADE = ['he', 'flash', 'smoke', 'molotov'], g = window.__game, p = g.player, c = window.__ctrl; p.money = 16000;
    if (NADE.includes(id)) { p.nades[id] = 1; p.equip('nade', id); } else { if (id !== 'pistol' && id !== 'knife') g.buy(p, id); p.equip(id); }
    p.reloadT = 0; p.actionT = 0; c.switchT = 0; for (let k = 0; k < 5; k++) c.showAgentView(p, 1 / 60);
    // solve against the weapon at rest: no sway or bob, the knife at the start of its idle
    c.vm.position.set(0, 0, 0); c.vm.rotation.set(0, 0, 0);
    if (c.vmKind === 'knife') { Object.assign(c.kAnim, { clip: 'idle', t: 0, blendT: 1 }); c.animKnife(p, 0); }
    const gun = c.vmGun, A = c.arms; c.vm.updateMatrixWorld(true);
    const S = T.gunSDF(gun, id === 'pistol' || id === 'knife' || NADE.includes(id) ? 0.0015 : 0.002), meta = W.gunMeta(id), out = {}, report = {};
    for (const s of ['R', 'L']) {
      if (c.handSpec[s].view) continue;
      const spec = JSON.parse(JSON.stringify(c.handSpec[s])), opts = { anchor: s === 'R' ? [0.2, -0.5, 0.12] : [-0.18, -0.52, 0.05] };
      if (spec.fixed?.thumb && !spec.thumbDir) delete spec.fixed.thumb;   // the thumb closes onto what it holds too
      // grip style, as places in gun space: thumbs-forward on the pistol; the support hand palm-up under
      // the handguard at the model's mark; a grenade in the fist by the lower half of its body (so the body
      // shows above the hand); the knife by its handle
      const inner = { min: [S.o.x + 0.04, S.o.y + 0.04, S.o.z + 0.04], max: [S.o.x + S.nx * S.res - 0.04, S.o.y + S.ny * S.res - 0.04, S.o.z + S.nz * S.res - 0.04] };
      if (id === 'pistol') opts.thumbAxis = [0, 0.1, -1];
      if (s === 'L' && meta?.fore) { const z = -meta.fore[0]; opts.palmBox = { min: [-1, -1, z - 0.03], max: [1, meta.fore[1], z + 0.03] }; opts.palmAxis = [0, 1, 0]; }
      if (id === 'knife') { opts.palmBox = { min: [-1, -1, 0.02], max: [1, 1, 0.13] }; opts.palmAxis = [-1, 0, 0]; }   // hammer grip, palm on the handle's right
      if (NADE.includes(id)) {
        const H = meta?.hold, cy = H ? H.c[1] : (inner.min[1] + inner.max[1]) / 2, hh = H ? H.hh : (inner.max[1] - inner.min[1]) / 2;
        opts.palmBox = { min: [-1, cy - hh * 0.85, -1], max: [1, cy - hh * 0.15, 1] }; opts.palmAxis = [-1, 0, 0]; opts.fwdAxis = [-0.3, -0.25, -0.92];   // in the fist from the right, fingers round its front
        const cx = (inner.min[0] + inner.max[0]) / 2, cz = (inner.min[2] + inner.max[2]) / 2;
        opts.visible = [0, 0.3, 0.6, 0.85].map((k) => [cx, cy + hh * k, cz]);   // and its body is in sight above the fist
      }
      if (s === 'R' && id !== 'knife' && !NADE.includes(id)) { const t = T.findTrigger(S); if (t) opts.trigger = [t.face[0] + 0.002, t.face[1], t.face[2] - 0.004]; }
      if (s === 'L' && out.R) {   // the right hand as solved, posed, so the left hand can wrap around it
        c.handSpec.R = { ...out.R, fitted: true, curl: (f, k) => out.R.curl[f]?.[k - 1] ?? 0 }; A.anchor.R = out.R.anchor;
        c.poseArms(true); A.b.R_arm.updateWorldMatrix(true, true);
        if (spec.avoid) opts.other = A.capsules('R');
      }
      // a few restarts: keep the best
      let sol = null;
      for (const seed of SEEDS) { const r = new T.HandSolver(A, gun, S, s, JSON.parse(JSON.stringify(spec)), opts).solve({ iters: ITERS, seed }); if (!sol || r.end.E < sol.end.E) sol = r; }
      out[s] = sol.grip; report[s] = { start: sol.start, end: sol.end };
    }
    return { out, report };
  }, [id, SEEDS, ITERS]);
  file.grips[id] = res.out;
  console.log(id, JSON.stringify(res.report));
}
file.note = 'Solved by tools/solve-grips.mjs: gun-space wrist, hand axes, thumb/index aims, finger curls and shoulder anchor per hand.';
fs.writeFileSync(OUT, JSON.stringify(file));
await browser.close();
