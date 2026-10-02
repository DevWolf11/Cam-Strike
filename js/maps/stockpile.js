import { makeMap, P, MAT } from './dsl.js';

// Stockpile: an industrial depot and container yard (the quad / garage / checkers layout,
// rebuilt bigger). T spawn south, CT north, A east, B west, a wide mid with the garage into
// A main and a Z-shaped connector to B.
const RED = 0xc85a40, BLUE = 0x4a80c8, GREEN = 0x5aa860, ORANGE = 0xe88a38, WHITE = 0xe8e8e0, TEAL = 0x48a0a0, YELLOW = 0xe0b83a, GREY = 0xaab0b6;

export default function stockpile() {
  const m = makeMap({
    id: 'stockpile', name: 'Stockpile', w: 160, h: 140,
    theme: {
      sky: 'cumulus', skyRot: 150, facade: 'industrial', skyline: 'industrial', skylineOpacity: 0.55,
      floors: {
        [MAT.GROUND]: 'concrete_floor', [MAT.PLATFORM]: 'concrete_light', [MAT.SAND]: 'sirocco_sand', [MAT.TILES]: 'anti_skid',
        [MAT.ASPHALT]: 'asphalt', [MAT.CONCRETE]: 'concrete_floor', [MAT.METAL]: 'diamond_plate', [MAT.WOOD]: 'wood',
        [MAT.PAVE]: 'concrete_light', [MAT.STONE]: 'concrete_light', [MAT.DIRT]: 'sirocco_sand', [MAT.GRASS]: 'grass',
      },
      // 0 corrugated, 1 factory panel, 2 factory brick, 3 concrete, 4 block wall, 5 red sheet, 6 light concrete
      walls: ['corrugated', 'factory_panel', 'factory_brick', 'concrete_wall', 'block_wall', 'metal_sheet_red', 'concrete_light'],
      trim: {
        cornice: 'concrete_light', sill: 'concrete_light', base: 'concrete_wall', drift: null, coping: 'concrete_light',
        roofTop: 'concrete_floor', lintel: 'concrete_wall', lowwall: 'concrete_light', ledge: 'concrete_wall', frame: 'rusty',
        doorframe: 'concrete_light', infill: 'block_wall', pilaster: 'concrete_wall', ceiling: 'concrete_light', skirting: 'concrete_wall',
        patches: { concrete_floor: 'asphalt', asphalt: 'concrete_floor' }, patchDensity: 0.18,
      },
      tints: [0xffffff, 0xf0f2f4, 0xe6eaee, 0xfaf6f0, 0xe8e4dc, 0xf4f4f4, 0xdde2e6, 0xf8f0e8],
      fogNear: 80, fogFar: 255, bounce: 0x8a8a84, dust: 0xb8b8b0, wallH: 9, sunI: 2.3, hemiI: 2.0, indoor: 1.1, ceilingLights: true,
    },
  });
  const container = (x0, z0, x1, z1, color, stack = 1) => m.raise(x0, z0, x1, z1, 2.6 * stack, MAT.CONTAINER, color);
  const INDUS = [0, 0, 1, 1, 2, 3, 4, 5, 6];

  m.lots(0, 0, 159, 139, { h: [7, 13], mats: INDUS, min: 7, max: 14, seed: 41 });
  m.building(0, 0, 159, 2, 14, 3).building(0, 137, 159, 139, 14, 3).building(0, 0, 2, 139, 14, 3).building(157, 0, 159, 139, 14, 3);

  // =====================================================================
  // T SPAWN (south): truck yard
  // =====================================================================
  m.floor(50, 118, 110, 135, 0, MAT.ASPHALT);
  container(55, 121, 61, 123, RED);
  container(95, 130, 101, 132, BLUE, 2);
  m.crates(72, 125, 73, 126, 1).crates(74, 125, 74, 125, 2);
  m.model('barrel_blue', 108.5, 120.5).model('barrel_red', 108.5, 121.4).model('plastic_drum', 51.5, 133.5);
  m.prop('forklift', 83.5, 130.5);
  m.block(82, 129, 84, 132, 2.2, MAT.HIDDEN);
  m.model('jersey_barrier', 66, 132.5).model('jersey_barrier', 67.6, 132.5);
  m.model('street_lamp', 88.5, 119.5, { solid: false });

  // =====================================================================
  // A MAIN + A SITE (east)
  // =====================================================================
  m.floor(111, 120, 130, 133, 0, MAT.ASPHALT);
  m.floor(120, 55, 138, 119, 0, MAT.ASPHALT);
  container(121, 76, 124, 83, GREEN);
  m.crates(135, 88, 136, 89, 1).crates(135, 90, 135, 90, 2);
  container(133, 105, 137, 111, ORANGE);
  m.model('barrel_steel', 121.5, 113.5).model('barrel_red', 122.4, 113.4);
  m.model('jersey_barrier', 129, 96.5, { rot: Math.PI / 2 }).model('jersey_barrier', 129, 98.1, { rot: Math.PI / 2 });
  m.model('street_lamp', 137.5, 70.5, { solid: false }).model('hydrant', 120.6, 60.5, { solid: false });
  // A site
  m.floor(105, 10, 152, 54, 0, MAT.GROUND);
  m.paint(108, 14, 150, 50, MAT.ASPHALT);
  container(125, 28, 130, 33, BLUE);                                 // quad
  m.raise(125, 28, 127, 30, 2.6, MAT.CONTAINER, RED);               // top of quad
  m.block(140, 13, 143, 22, 3.0, MAT.CONTAINER, WHITE);             // truck trailer
  m.block(140, 23, 143, 25, 2.4, MAT.HIDDEN);
  m.prop('truckcab', 141.5, 24.5);
  m.crates(112, 38, 113, 39, 1).crates(114, 38, 114, 38, 2).crates(146, 48, 147, 49, 1);
  m.block(107, 45, 107, 52, 1.1, MAT.LOWWALL);
  m.model('barrel_blue', 150.5, 11.5).model('barrel_steel', 150.5, 12.4).model('barrel_red', 106.5, 11.5);
  m.model('jersey_barrier', 118, 50.5).model('jersey_barrier', 134, 14.5, { rot: 0.3 });
  m.model('generator', 148.5, 30.5, { rot: -1.5 }).model('crate_long', 113.5, 12.5, { rot: 0.1 });
  m.model('street_lamp', 106.5, 30.5, { solid: false });

  // squeaky: a narrow shed from mid into A
  m.floor(96, 57, 119, 62, 0, MAT.CONCRETE).roofed(99, 57, 119, 62, 4.4);
  m.building(112, 57, 112, 57, 4.4, 3).building(112, 62, 112, 62, 4.4, 3);
  m.prop('doors', 112.5, 59.5, { axis: 'x', span: 4, y: 0, color: 0x9098a0 });
  m.prop('lamp', 105.5, 59.5, { y: 4.3, hang: true });
  // highway: CT -> A back road
  m.floor(92, 10, 104, 28, 0, MAT.ASPHALT);
  m.model('covered_car', 97.5, 18.5, { rot: 0.1 });

  // =====================================================================
  // CT SPAWN (north) + CT MID
  // =====================================================================
  m.floor(57, 8, 91, 30, 0, MAT.ASPHALT);
  m.paint(60, 10, 88, 16, MAT.PAVE);
  container(60, 10, 65, 12, TEAL);
  m.crates(87, 25, 88, 26, 1);
  m.model('barrel_blue', 58.5, 28.5).model('barrel_steel', 59.4, 28.6);
  m.model('shelves', 72.5, 9.3).model('shelves', 73.7, 9.3).model('tool_chest', 75.5, 9.3, { solid: false });
  m.floor(70, 31, 88, 49, 0, MAT.GROUND);
  // two containers staggered across CT mid: no straight sightline from spawn to spawn
  container(70, 36, 81, 37, BLUE);
  container(77, 43, 88, 44, RED);
  m.model('jersey_barrier', 74, 42.5).model('jersey_barrier', 75.6, 42.5);

  // =====================================================================
  // MID
  // =====================================================================
  m.floor(65, 50, 95, 117, 0, MAT.GROUND);
  m.paint(70, 55, 90, 112, MAT.ASPHALT);
  m.crates(78, 80, 79, 81, 1).crates(80, 80, 80, 80, 2);           // white box
  container(68, 95, 70, 102, WHITE);
  container(88, 62, 92, 64, RED);
  m.crates(90, 107, 91, 108, 1);
  m.model('barrel_red', 94.5, 51.5).model('plastic_drum', 66.5, 114.5);
  m.model('street_lamp', 66.5, 70.5, { solid: false });
  // garage (roofed) from mid into A main
  m.floor(96, 88, 113, 105, 0, MAT.CONCRETE).roofed(96, 88, 113, 105, 5);
  m.floor(114, 92, 119, 100, 0, MAT.CONCRETE).roofed(114, 92, 119, 100, 5);
  m.crates(100, 90, 101, 91, 1).crates(110, 103, 111, 104, 1);
  m.model('metal_rack', 97.5, 88.4).model('metal_rack', 99, 88.4).model('shelves', 104.5, 88.3);
  m.model('generator', 108.5, 96.5, { rot: 1.2 });
  m.model('barrel_steel', 112.5, 89.5).model('barrel_blue', 112.5, 90.4);
  m.prop('lamp', 104.5, 96.5, { y: 4.8, hang: true });
  m.prop('lamp', 111.5, 100.5, { y: 4.8, hang: true });

  // =====================================================================
  // Z CONNECTOR (mid -> B)
  // =====================================================================
  m.floor(47, 65, 64, 72, 0, MAT.CONCRETE);
  m.floor(40, 55, 48, 72, 0, MAT.CONCRETE);
  m.floor(37, 51, 46, 56, 0, MAT.CONCRETE);
  m.crates(50, 70, 51, 71, 1);
  m.model('cement_bag', 41.5, 71.2, { solid: false, rot: 0.4 }).model('sacks', 44.5, 57.5, { solid: false });

  // =====================================================================
  // B SITE (west) + SUN ROOM + B MAIN + CHECKERS
  // =====================================================================
  m.floor(8, 10, 50, 50, 0, MAT.GROUND);
  m.paint(20, 20, 46, 46, MAT.ASPHALT);
  m.block(8, 10, 19, 19, 1.5, MAT.PLATFORM);                        // B heaven
  m.stairs(20, 10, 23, 19, 'w', 0, 1.5, MAT.METAL);
  container(30, 25, 34, 29, GREEN).crates(35, 27, 36, 28, 1);       // headshot box
  container(15, 38, 17, 45, ORANGE);
  m.crates(42, 15, 43, 16, 1).crates(45, 45, 46, 46, 2);
  m.model('barrel_red', 49.4, 47.5).model('barrel_blue', 49.4, 46.6);
  m.model('jersey_barrier', 26, 48.5).model('generator', 10.5, 48.5, { rot: 0.6 });
  m.floor(51, 15, 56, 33, 0, MAT.TILES).roofed(51, 15, 56, 33, 4.4);   // sun room
  m.prop('lamp', 53.5, 24, { y: 4.3, hang: true });
  m.floor(15, 51, 33, 74, 0, MAT.GROUND);                            // B main
  m.crates(17, 60, 18, 61, 1);
  m.model('barrel_steel', 32.4, 52.5).model('barrel_steel', 32.4, 53.4);
  m.floor(15, 75, 33, 116, 0, MAT.TILES).roofed(15, 75, 33, 116, 4.6);  // checkers
  for (const z of [80, 90, 100, 110]) m.prop('lamp', 24.5, z + 0.5, { y: 4.5, hang: true });
  m.crates(16, 86, 17, 87, 1).crates(31, 104, 32, 105, 1);
  // T side B
  m.floor(10, 117, 49, 133, 0, MAT.ASPHALT);
  container(12, 120, 15, 126, BLUE);
  m.model('covered_car', 38.5, 125.5, { rot: Math.PI / 2 }).model('jersey_barrier', 46, 131.5);

  // yard clutter
  m.wallModel('utility_box_w', 60, 135).model('barrier_low', 90.5, 124.5).model('barrier_low', 92.1, 124.5);
  m.wallModel('cardboard', 98, 105, { solid: false }).wallModel('cardboard', 99, 105, { solid: false, scale: 0.85 }).wallModel('crate_big', 101, 105);
  m.wallModel('power_box', 105, 40, { y: 1.2, solid: false }).wallModel('utility_box_w', 70, 8).wallModel('crate_big', 98, 10);
  m.wallModel('sack', 30, 10, { solid: false }).model('barrier_low', 44.5, 64.5, { rot: Math.PI / 2 });
  m.prop('sign', 64.99, 75, { text: 'B', arrow: 'w', y: 2.4, face: 'w' });
  m.prop('sign', 95.01, 75, { text: 'A', arrow: 'e', y: 2.4, face: 'e' });

  // ---------- zones & callouts ----------
  m.zone('T', 52, 120, 108, 133).zone('CT', 60, 10, 88, 28).zone('A', 108, 14, 148, 50).zone('B', 10, 12, 48, 48);
  m.callout('Squeaky', 99, 57, 119, 62, 'A').callout('Garage', 96, 88, 119, 105, 'A').callout('Highway', 92, 10, 104, 28)
    .callout('Quad', 124, 27, 131, 34, 'A').callout('Truck', 139, 12, 144, 26, 'A').callout('A Site', 105, 10, 152, 54, 'A')
    .callout('A Main', 111, 55, 138, 133, 'A').callout('CT Spawn', 57, 8, 91, 30).callout('CT Mid', 70, 31, 88, 49)
    .callout('White Box', 76, 78, 82, 83).callout('Mid', 65, 50, 95, 116).callout('T Spawn', 50, 118, 110, 135)
    .callout('Z Connector', 37, 51, 64, 72, 'B').callout('Sun Room', 51, 15, 56, 33, 'B').callout('Headshot', 28, 23, 37, 31, 'B')
    .callout('B Heaven', 8, 10, 23, 19, 'B').callout('B Site', 8, 10, 50, 50, 'B').callout('Checkers', 15, 75, 33, 116, 'B')
    .callout('B Main', 15, 51, 33, 74, 'B').callout('T Side B', 10, 117, 49, 133, 'B');

  m.tactics = {
    ctHolds: [
      { site: 'A', pos: P(112, 22), watch: P(128, 58) },
      { site: 'A', pos: P(146, 42), watch: P(128, 60) },
      { site: 'A', pos: P(110, 50), watch: P(104, 60) },
      { site: 'B', pos: P(25, 20), watch: P(24, 55) },
      { site: 'B', pos: P(44, 38), watch: P(42, 54) },
      { site: 'B', pos: P(12, 14), watch: P(24, 52) },
      { site: 'MID', pos: P(85, 35), watch: P(80, 80) },
    ],
    tRoutes: { A: [P(128, 100), P(105, 96)], B: [P(24, 95), P(55, 68)] },
    plantSpots: { A: [P(122, 38), P(135, 30), P(115, 20)], B: [P(28, 36), P(38, 18), P(22, 42)] },
    entrances: { A: [P(128, 54), P(106, 59), P(100, 22)], B: [P(24, 51), P(42, 52), P(51, 25)] },
    smokes: { A: [P(104, 20), P(115, 54)], B: [P(51, 25), P(33, 50)] },
  };
  return m;
}
