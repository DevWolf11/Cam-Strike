import { makeMap, P, MAT } from './dsl.js';

// Reactor: a power plant on two levels (the heaven / ramp / lower-B layout, rebuilt bigger).
// The main level sits at 2.4 m so B can be a real lower floor (0 m), reached by the ramp room,
// the CT decontamination ramp and a vent from A. A is a tall hall with a catwalk (heaven).
const L = 2.4;
const YELLOW = 0xe0b83a, BLUE = 0x4a80c8, GREY = 0xaab0b6, RED = 0xc85a40, WHITE = 0xe8e8e0;

export default function reactor() {
  const m = makeMap({
    id: 'reactor', name: 'Reactor', w: 160, h: 140,
    theme: {
      sky: 'hazy', skyRot: 200, facade: 'facility', skyline: 'powerplant', skylineOpacity: 0.6,
      floors: {
        [MAT.GROUND]: 'concrete_floor', [MAT.PLATFORM]: 'concrete_light', [MAT.SAND]: 'sirocco_sand', [MAT.TILES]: 'anti_skid',
        [MAT.ASPHALT]: 'asphalt', [MAT.CONCRETE]: 'concrete_floor', [MAT.METAL]: 'diamond_plate', [MAT.WOOD]: 'wood',
        [MAT.PAVE]: 'concrete_light', [MAT.STONE]: 'concrete_light', [MAT.DIRT]: 'sirocco_sand', [MAT.GRASS]: 'grass',
      },
      // 0 light concrete, 1 grey plaster, 2 factory panel, 3 concrete, 4 block wall, 5 corrugated, 6 brick
      walls: ['concrete_light', 'grey_plaster', 'factory_panel', 'concrete_wall', 'block_wall', 'corrugated', 'factory_brick'],
      trim: {
        cornice: 'concrete_light', sill: 'concrete_light', base: 'concrete_wall', drift: null, coping: 'concrete_light',
        roofTop: 'concrete_floor', lintel: 'concrete_light', lowwall: 'concrete_light', ledge: 'concrete_wall', frame: 'rusty',
        doorframe: 'concrete_light', infill: 'block_wall', pilaster: 'concrete_wall', ceiling: 'concrete_light', skirting: 'concrete_wall',
        patches: { concrete_floor: 'asphalt', asphalt: 'concrete_floor', concrete_light: 'concrete_floor' }, patchDensity: 0.15,
      },
      tints: [0xffffff, 0xf2f4f6, 0xe8ecef, 0xf6f2ea, 0xe2e6ea, 0xfaf8f4, 0xdfe4e8, 0xf0ece4],
      fogNear: 80, fogFar: 255, bounce: 0x8c8c86, dust: 0xb8b8b0, wallH: 10, sunI: 2.2, hemiI: 2.1, indoor: 1.25, ceilingLights: true,
    },
  });
  const container = (x0, z0, x1, z1, color, stack = 1) => m.raise(x0, z0, x1, z1, 2.6 * stack, MAT.CONTAINER, color);
  const silo = (cx, cz, r) => {
    m.each(cx - r - 1, cz - r - 1, cx + r + 1, cz + r + 1, (i, x, z) => { if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= r * r) { m.solid[i] = 1; m.wallMat[i] = 0; m.wallH[i] = L + 0.4; } });
    m.prop('silo', cx, cz, { r: r + 0.75, h: 20, y: L, surf: 'concrete_light' });
  };
  const PLANT = [0, 0, 1, 2, 3, 4, 5, 6];

  m.lots(0, 0, 159, 139, { h: [9, 15], mats: PLANT, min: 8, max: 16, seed: 77 });
  m.building(0, 0, 159, 2, 16, 3).building(0, 137, 159, 139, 16, 3).building(0, 0, 2, 139, 16, 3).building(157, 0, 159, 139, 16, 3);

  // =====================================================================
  // T SPAWN + OUTSIDE YARD (main level)
  // =====================================================================
  m.floor(125, 80, 152, 130, L, MAT.ASPHALT);
  container(130, 85, 136, 87, RED);
  m.crates(145, 122, 146, 123, 1).crates(147, 122, 147, 122, 2);
  m.model('barrel_blue', 151.5, 84.5).model('barrel_steel', 151.5, 85.4).model('plastic_drum', 126.5, 128.5);
  m.model('jersey_barrier', 140, 110.5).model('jersey_barrier', 141.6, 110.5);
  m.floor(33, 105, 124, 132, L, MAT.ASPHALT);                        // outside yard
  m.paint(40, 108, 118, 129, MAT.GROUND);
  silo(65, 119, 5); silo(86, 121, 5);
  container(44, 108, 50, 110, BLUE);
  container(103, 125, 109, 127, GREY, 2);
  m.crates(98, 110, 99, 111, 1).crates(113, 115, 114, 116, 1);
  m.model('barrel_red', 122.5, 107.5).model('barrel_steel', 122.5, 108.4);
  m.model('street_lamp', 76.5, 106.5, { solid: false }).model('street_lamp', 110.5, 131.5, { solid: false });
  m.model('generator', 36.5, 130.5, { rot: 0.4 });
  m.floor(12, 89, 32, 125, L, MAT.ASPHALT);                          // garage lane to CT
  container(17, 100, 20, 107, YELLOW);
  m.model('covered_car', 26.5, 115.5, { rot: 0.05 });

  // =====================================================================
  // LOBBY, HUT, SQUEAKY, A MAIN
  // =====================================================================
  m.floor(100, 78, 124, 100, L, MAT.TILES).roofed(100, 78, 124, 100, 7);
  m.floor(115, 101, 124, 104, L, MAT.TILES).roofed(115, 101, 124, 104, 7);   // lobby -> yard
  m.building(124, 78, 124, 87, 10, 3).building(124, 93, 124, 100, 10, 3);     // lobby wall with the T-side doorway
  m.crates(102, 80, 103, 81, 1);
  m.model('barrel_steel', 123.4, 97.5).model('barrel_blue', 123.4, 98.4);
  m.model('metal_rack', 110.5, 78.4).model('trash_can', 101.5, 99.3, { solid: false });
  m.floor(95, 65, 102, 77, L, MAT.CONCRETE).roofed(95, 65, 102, 77, 6.2);   // hut
  m.floor(107, 65, 113, 77, L, MAT.METAL).roofed(107, 65, 113, 77, 6.2);    // squeaky
  m.prop('doors', 110, 71.5, { axis: 'z', span: 7, y: L, color: 0x9098a0 });
  m.floor(55, 65, 63, 104, L, MAT.CONCRETE).roofed(55, 65, 63, 104, 6.8);   // A main
  for (const z of [72, 84, 96]) m.prop('lamp', 59.5, z + 0.5, { y: 6.7, hang: true });
  for (const x of [106, 118]) m.prop('lamp', x + 0.5, 89.5, { y: 6.9, hang: true });

  // =====================================================================
  // A HALL (roof 11 m) with heaven
  // =====================================================================
  m.floor(50, 35, 117, 64, L, MAT.CONCRETE).roofed(50, 35, 117, 64, 11);
  m.paint(58, 44, 110, 62, MAT.PAVE);
  const HV = L + 3.2;
  m.floor(50, 35, 73, 40, HV, MAT.METAL);                           // heaven
  m.stairs(74, 35, 83, 40, 'w', L, HV, MAT.METAL);
  m.block(50, 41, 73, 41, HV + 1.0, MAT.LOWWALL);                   // heaven railing
  m.floor(50, 41, 50, 41, HV, MAT.METAL);
  container(78, 49, 82, 54, YELLOW).crates(94, 58, 95, 59, 1).crates(96, 58, 96, 58, 2);
  container(106, 43, 110, 45, BLUE);
  m.model('barrel_red', 116.5, 36.5).model('barrel_steel', 115.6, 36.5).model('plastic_drum', 51.5, 63.4);
  m.model('shelves', 99.5, 35.3).model('shelves', 100.7, 35.3).model('tool_chest', 102.5, 35.3, { solid: false });
  for (const x of [62, 82, 102]) m.prop('lamp', x + 0.5, 50.5, { y: 10.8, hang: true });

  // =====================================================================
  // CT SPAWN (main level) + CT -> A door
  // =====================================================================
  m.floor(8, 8, 38, 88, L, MAT.GROUND);
  m.paint(12, 30, 34, 80, MAT.ASPHALT);
  m.floor(39, 43, 49, 50, L, MAT.CONCRETE).roofed(39, 43, 49, 50, 6.4);
  container(12, 50, 15, 57, GREY).crates(30, 75, 31, 76, 1);
  m.model('barrel_blue', 9.5, 86.5).model('barrel_steel', 10.4, 86.5);
  m.model('jersey_barrier', 22, 64.5).model('jersey_barrier', 23.6, 64.5);
  m.block(18, 30, 24, 36, L + 0.45, MAT.GRASS);
  m.palm(20, 32, 6.4).palm(23, 35, 5.8);
  m.model('street_lamp', 36.5, 20.5, { solid: false });

  // =====================================================================
  // B SITE (lower level, 0 m) + ramps
  // =====================================================================
  m.floor(50, 5, 130, 26, 0, MAT.CONCRETE).roofed(50, 5, 130, 26, 6);
  m.paint(58, 8, 122, 24, MAT.PAVE);
  m.stairs(39, 10, 49, 24, 'w', 0, L, MAT.TILES).roofed(39, 10, 49, 24, 6);   // decon ramp from CT
  m.stairs(120, 27, 130, 77, 's', 0, L, MAT.CONCRETE).roofed(120, 27, 130, 77, 6.2);  // ramp room from lobby
  m.stairs(88, 27, 89, 34, 's', 0, L, MAT.METAL).roofed(88, 27, 89, 34, 5.2);  // vent A <-> B
  container(70, 10, 74, 14, RED).crates(90, 17, 91, 18, 1).crates(92, 17, 92, 17, 2);
  container(105, 7, 110, 9, BLUE).crates(60, 20, 61, 21, 1);
  m.block(82, 22, 87, 22, 1.1, MAT.LOWWALL);
  m.model('barrel_red', 128.5, 6.5).model('barrel_blue', 127.6, 6.5).model('barrel_steel', 51.5, 6.5);
  m.model('generator', 100.5, 24.5, { rot: 3.1 }).model('metal_rack', 118.5, 5.4);
  for (const x of [62, 80, 98, 116]) m.prop('lamp', x + 0.5, 15.5, { y: 5.9, hang: true });
  for (const z of [38, 52, 66]) m.prop('lamp', 125.5, z + 0.5, { y: 6.1, hang: true });

  // plant clutter
  m.wallModel('utility_box_w', 40, 132).model('barrier_low', 100.5, 115.5).model('barrier_low', 102.1, 115.5);
  m.wallModel('power_box', 8, 40, { y: 1.2 + L, solid: false }).wallModel('cardboard', 100, 90, { solid: false }).wallModel('cardboard', 100, 91, { solid: false, scale: 0.9 });
  m.wallModel('crate_big', 130, 15).wallModel('utility_box', 60, 5).wallModel('utility_box_w', 64, 5);
  m.prop('sign', 102.99, 71, { text: 'A', arrow: 'n', y: L + 2, face: 'w' });
  m.prop('sign', 119.01, 50, { text: 'B', arrow: 'n', y: L + 2, face: 'e' });

  // ---------- zones & callouts ----------
  m.zone('T', 127, 82, 150, 128).zone('CT', 10, 30, 36, 84).zone('A', 52, 42, 115, 62).zone('B', 52, 7, 128, 24);
  m.callout('Heaven', 50, 35, 83, 41, 'A').callout('A Site', 50, 35, 117, 64, 'A').callout('Hut', 95, 65, 102, 77, 'A')
    .callout('Squeaky', 107, 65, 113, 77, 'A').callout('A Main', 55, 65, 63, 104, 'A').callout('Lobby', 100, 78, 124, 104)
    .callout('Ramp Room', 120, 27, 130, 77, 'B').callout('Vent', 88, 27, 89, 34).callout('Decon', 39, 10, 49, 24, 'B')
    .callout('B Site', 50, 5, 130, 26, 'B').callout('CT Spawn', 8, 8, 49, 88).callout('Garage', 12, 89, 32, 125)
    .callout('Silos', 55, 110, 95, 130).callout('Outside', 33, 105, 124, 132).callout('T Spawn', 125, 80, 152, 130);

  m.tactics = {
    ctHolds: [
      { site: 'A', pos: P(64, 52), watch: P(98, 64) },
      { site: 'A', pos: P(90, 44), watch: P(110, 64) },
      { site: 'A', pos: P(58, 38), watch: P(59, 66) },
      { site: 'B', pos: P(62, 12), watch: P(124, 28) },
      { site: 'B', pos: P(100, 10), watch: P(124, 34) },
      { site: 'MID', pos: P(28, 115), watch: P(75, 113) },
      { site: 'B', pos: P(82, 14), watch: P(124, 28) },
    ],
    tRoutes: { A: [P(98, 72), P(59, 90)], B: [P(125, 62), P(125, 44)] },
    plantSpots: { A: [P(75, 58), P(92, 52), P(68, 56)], B: [P(78, 18), P(98, 14), P(108, 20)] },
    entrances: { A: [P(98, 64), P(110, 64), P(59, 64), P(50, 46)], B: [P(125, 27), P(49, 17), P(88, 26)] },
    smokes: { A: [P(52, 46), P(72, 45)], B: [P(52, 17), P(118, 13)] },
  };
  return m;
}
