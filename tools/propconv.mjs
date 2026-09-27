// Poly Haven glTF (1k) -> compact game GLB: one node, bottom-centred, simplified,
// colour + normal maps only (resized), quantized. Writes assets/props/<name>.glb and props.json.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, join, flatten, clearNodeTransform, transformMesh, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

// Usage: RAW=<dir with Poly Haven 1k glTF folders> OUT=assets/props node tools/propconv.mjs [names...]
// Needs @gltf-transform/core, functions, extensions and meshoptimizer (npm), and python3 with Pillow + numpy.
const RAW = process.env.RAW, OUT = process.env.OUT;
// name: [source id, triangle target, colour px, normal px, extra]
const PROPS = {
  barrel_red:      ['Barrel_01', 500, 256, 256],
  barrel_blue:     ['Barrel_02', 500, 256, 256],
  barrel_steel:    ['barrel_03', 500, 256, 256],
  crate_long:      ['wooden_crate_01', 700, 512, 256],
  crate_big:       ['wooden_crate_02', 700, 512, 256],
  cardboard:       ['cardboard_box_01', 400, 256, 128],
  jersey_barrier:  ['concrete_road_barrier', 900, 512, 256],
  barrier_low:     ['concrete_road_barrier_02', 900, 512, 256],
  covered_car:     ['covered_car', 2800, 512, 256, { recolor: [0.93, 0.82, 0.66], err: 0.01 }],
  utility_box:     ['utility_box_01', 600, 256, 128],
  utility_box_w:   ['utility_box_02', 700, 256, 128],
  power_box:       ['power_box_01', 700, 256, 128, { err: 0.08 }],
  street_lamp:     ['street_lamp_01', 900, 256, 128, { err: 0.05 }],
  wall_lamp:       ['street_lamp_02', 420, 256, 128, { err: 0.06 }],
  hydrant:         ['fire_hydrant', 600, 256, 128, { nodes: /^fire_hydrant(_cap_01)?_aged$/, err: 0.05 }],
  trash_can:       ['metal_trash_can', 700, 256, 128, { nodes: /^metal_trash_can_rust/, err: 0.05 }],
  tyre:            ['old_tyre', 500, 256, 128],
  shutter_door:    ['rollershutter_door', 600, 512, 256, { nodes: /^rollershutter_door$/ }],
  shutter_door_g:  ['rollershutter_door', 600, 512, 256, { nodes: /graffiti/ }],
  shutter_window:  ['rollershutter_window_01', 600, 512, 256, { nodes: /01$/ }],
  shutter_window_g:['rollershutter_window_01', 600, 512, 256, { nodes: /graffiti/ }],
  iron_gate:       ['large_iron_gate', 2000, 512, 256, { err: 0.05 }],
  jerrycan:        ['metal_jerrycan', 500, 256, 128],
  plastic_drum:    ['industrial_pastic_container', 700, 256, 128, { nodes: /^industrial_pastic_container(_lid_a)?$/, err: 0.06 }],
  cement_bag:      ['cement_bag', 300, 256, 128],
  pot_clay:        ['planter_pot_clay', 400, 256, 128],
  pot_ceramic:     ['ceramic_pot', 700, 256, 128],
  planter_box:     ['planter_box_01', 800, 256, 128],
  picnic_table:    ['wooden_picnic_table', 1500, 512, 256],
  bench:           ['painted_wooden_bench', 630, 256, 128],
  chair:           ['plastic_monobloc_chair_01', 800, 256, 128],
  table:           ['wooden_table_02', 196, 256, 128],
  security_light:  ['security_light', 400, 256, 128, { err: 0.06 }],
  camera:          ['security_camera_01', 400, 256, 128, { err: 0.06 }],
  wall_light:      ['industrial_wall_lamp', 260, 256, 128, { err: 0.06 }],
  hang_lamp:       ['hanging_industrial_lamp', 450, 256, 128, { err: 0.05 }],
  vent_fan:        ['modular_airduct_circular_01', 500, 256, 128, { nodes: /rectangular_vent_fan$/, err: 0.06 }],
  pipes:           ['modular_industrial_pipes_01', 1500, 256, 128, { err: 0.06 }],
  manhole:         ['water_manhole_cover', 300, 256, 128],
  bucket:          ['wooden_bucket_01', 500, 256, 128],
  lantern:         ['wooden_lantern_01', 400, 256, 128, { err: 0.06 }],
  shelves:         ['steel_frame_shelves_01', 2000, 512, 256, { scale: 0.1 }],
  generator:       ['portable_generator', 1500, 256, 128, { err: 0.08 }],
  metal_rack:      ['worn_metal_rack', 1200, 256, 128, { err: 0.06 }],
  sacks:           ['compost_bags', 1000, 256, 128, { nodes: /floorstacked$/ }],
  sack:            ['compost_bags', 400, 256, 128, { nodes: /_floor$/ }],
  boulder:         ['namaqualand_boulder_02', 1500, 512, 256, { err: 0.08 }],
  fire_pit:        ['stone_fire_pit', 1200, 256, 128],
  tool_chest:      ['metal_tool_chest', 800, 256, 128, { err: 0.06 }],
};

const only = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
fs.mkdirSync(OUT, { recursive: true });
const metaPath = path.join(OUT, 'props.json');
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};

function resize(buf, px, kind, recolor) {
  const py = `
import sys, io
from PIL import Image
im = Image.open(io.BytesIO(sys.stdin.buffer.read()))
alpha = im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 250
im = im.convert('RGBA' if alpha else 'RGB')
rc = ${JSON.stringify(recolor || 0)}
if rc and ${JSON.stringify(kind)} == 'd':
    import numpy as np
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    l = a @ np.array([0.299, 0.587, 0.114])
    l = (l - l.mean()) * 1.3 + 0.62
    im = Image.fromarray((np.clip(l[..., None] * np.array(rc), 0, 1) * 255).astype(np.uint8))
s = min(${px}, max(im.size))
if max(im.size) > s: im = im.resize((s, s * im.size[1] // im.size[0]) if im.size[0] >= im.size[1] else (s * im.size[0] // im.size[1], s), Image.LANCZOS)
o = io.BytesIO()
if alpha: im.save(o, 'PNG', optimize=True); sys.stdout.write('P')
else: im.save(o, 'JPEG', quality=${kind === 'n' ? 88 : 82}, optimize=True); sys.stdout.write('J')
sys.stdout.flush()
sys.stdout.buffer.write(o.getvalue())`;
  const r = spawnSync('python3', ['-c', py], { input: buf, maxBuffer: 64 << 20 });
  if (r.status) throw new Error(r.stderr.toString());
  return { png: r.stdout[0] === 80, data: r.stdout.subarray(1) };
}

const tris = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

for (const [name, [src, target, dpx, npx, opt = {}]] of Object.entries(PROPS)) {
  if (only.length && !only.includes(name)) continue;
  const dir = path.join(RAW, src);
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.gltf'));
  const doc = await io.read(path.join(dir, file));
  const root = doc.getRoot();
  for (const e of root.listExtensionsUsed()) if (/variants|texture_transform/.test(e.extensionName)) e.dispose();
  const before = tris(doc);

  // bake every node transform into its mesh, then gather all primitives under one node
  await doc.transform(flatten());
  const scene = root.listScenes()[0];
  for (const n of root.listNodes()) if (n.getMesh() && opt.nodes && !opt.nodes.test(n.getName())) n.dispose();
  const meshNodes = root.listNodes().filter((n) => n.getMesh());
  const seen = new Set();
  for (const n of meshNodes) {
    let m = n.getMesh();
    if (seen.has(m)) { m = m.clone(); n.setMesh(m); }
    seen.add(m);
    clearNodeTransform(n);
  }
  const main = doc.createMesh(name), node = doc.createNode(name).setMesh(main);
  for (const n of meshNodes) { for (const p of n.getMesh().listPrimitives()) if (!(opt.dropMat && opt.dropMat.test(p.getMaterial()?.getName() || ''))) main.addPrimitive(p); n.dispose(); }
  for (const s of root.listScenes()) for (const c of s.listChildren()) c.dispose();
  scene.addChild(node);

  // materials: colour + normal only; the game lights with Lambert/Phong
  for (const m of root.listMaterials()) {
    m.setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    m.setMetallicFactor(0).setRoughnessFactor(1);
  }
  await doc.transform(prune(), dedup(), join({ keepNamed: false }), weld());
  const ratio = Math.min(1, target / tris(doc));
  if (ratio < 0.98) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: opt.err ?? 0.03, lockBorder: false }));

  // bottom-centre the prop
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of main.listPrimitives()) {
    const a = p.getAttribute('POSITION'), v = [];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } }
  }
  const k = opt.scale || 1, off = [-(mn[0] + mx[0]) / 2 * k, -mn[1] * k, -(mn[2] + mx[2]) / 2 * k];
  transformMesh(main, [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, off[0], off[1], off[2], 1]);
  for (let i = 0; i < 3; i++) { mn[i] *= k; mx[i] *= k; }

  // textures: shrink (colour dpx, normal npx)
  const slot = new Map();
  for (const m of root.listMaterials()) {
    if (m.getBaseColorTexture()) slot.set(m.getBaseColorTexture(), 'd');
    if (m.getNormalTexture()) slot.set(m.getNormalTexture(), 'n');
  }
  for (const t of root.listTextures()) {
    const kind = slot.get(t) || 'd', r = resize(Buffer.from(t.getImage()), kind === 'n' ? npx : dpx, kind, opt.recolor);
    t.setImage(new Uint8Array(r.data)).setMimeType(r.png ? 'image/png' : 'image/jpeg').setURI(`${name}_${kind}${r.png ? '.png' : '.jpg'}`);
  }
  await doc.transform(prune(), dedup(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  const outFile = path.join(OUT, `${name}.glb`);
  await io.write(outFile, doc);
  const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map((v) => +v.toFixed(3));
  const prims = main.listPrimitives().length;
  meta[name] = { src, size, tris: Math.round(tris(doc)), prims, kb: Math.round(fs.statSync(outFile).size / 1024) };
  console.log(name.padEnd(16), `${Math.round(before)} -> ${meta[name].tris} tris, ${prims} prims, ${meta[name].kb} KB, size ${size.join(' x ')}`);
}
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
