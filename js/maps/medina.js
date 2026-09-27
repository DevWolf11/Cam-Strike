import { makeMap, P, MAT } from './dsl.js';

// Medina: a whitewashed old quarter at golden hour (the palace / window / apartments layout,
// rebuilt bigger and denser). T spawn east, CT spawn west, A south-west, B north-west,
// mid running east-west under a raised CT window.
export default function medina() {
  const m = makeMap({
    id: 'medina', name: 'Medina', w: 160, h: 160,
    theme: {
      sky: 'golden', skyRot: -30, facade: 'medina', skyline: 'desert', skylineOpacity: 0.45,
      floors: {
        [MAT.GROUND]: 'cobble', [MAT.PLATFORM]: 'patio', [MAT.SAND]: 'sirocco_sand', [MAT.TILES]: 'tile_pattern',
        [MAT.ASPHALT]: 'asphalt', [MAT.CONCRETE]: 'concrete_floor', [MAT.METAL]: 'diamond_plate', [MAT.WOOD]: 'wood',
        [MAT.PAVE]: 'patio', [MAT.STONE]: 'pavement_red', [MAT.DIRT]: 'sirocco_sand', [MAT.GRASS]: 'grass',
      },
      // 0 white plaster, 1 beige plaster, 2 red plaster, 3 rubble stone, 4 damaged plaster, 5 sandstone
      walls: ['plaster_white', 'plaster_beige', 'plaster_red', 'stone_rubble', 'plaster_damaged', 'sandstone'],
      trim: {
        cornice: 'plaster_white', sill: 'sandstone', base: 'stone_rubble', drift: 'sirocco_sand', coping: 'sandstone',
        roofTop: 'plaster_beige', lintel: 'plaster_white', lowwall: 'plaster_white', ledge: 'stone_rubble', frame: 'wood',
        doorframe: 'sandstone', infill: 'stone_rubble', arch: 'sandstone', ceiling: 'planks_blue', skirting: 'tile_pattern',
        patches: { cobble: 'sirocco_sand', patio: 'cobble', pavement_red: 'sirocco_sand' }, patchDensity: 0.18,
      },
      tints: [0xffffff, 0xfff2e2, 0xf6e6d2, 0xeef2f6, 0xffe8d6, 0xf2ead8, 0xe8eef0, 0xfff8ee],
      surfTint: { pavement_red: 0xf4e4d0 },
      fogNear: 90, fogFar: 300, bounce: 0xb09078, dust: 0xc4b294, wallH: 7.5, sunI: 2.4, hemiI: 2.0, indoor: 0.9,
    },
  });
  const OLD = [0, 0, 0, 1, 1, 2, 3, 4, 5];

  m.lots(0, 0, 159, 159, { h: [6, 11], mats: OLD, min: 6, max: 12, seed: 23 });
  m.building(0, 0, 159, 2, 13, 3).building(0, 157, 159, 159, 13, 3).building(0, 0, 2, 159, 13, 3).building(157, 0, 159, 159, 13, 3);

  // =====================================================================
  // T SPAWN (east)
  // =====================================================================
  m.floor(126, 62, 152, 100, 0, MAT.GROUND);
  m.paint(130, 66, 148, 96, MAT.PAVE);
  m.block(135, 76, 141, 82, 0.45, MAT.GRASS);                      // fountain garden
  m.palm(137, 78, 7.6).palm(140, 81, 6.8);
  m.building(146, 88, 152, 94, 4.5, 1);
  m.crates(128, 64, 129, 65, 1).crates(150, 64, 151, 65, 2).crates(128, 96, 129, 97, 1);
  m.model('barrel_blue', 151.4, 72.5).model('barrel_steel', 151.4, 73.4);
  m.model('covered_car', 131.5, 88.5, { rot: 0.15 });
  m.model('pot_ceramic', 142.5, 75.3, { solid: false }).model('pot_ceramic', 134.3, 83.6, { solid: false, rot: 1 });
  m.prop('awning', 138, 62.4, { w: 8, d: 1.8, y: 3.4, color: 0x2f7d6a });

  // =====================================================================
  // MID + WINDOW
  // =====================================================================
  m.floor(106, 72, 125, 88, 0, MAT.GROUND);                        // top mid
  m.floor(60, 72, 105, 88, 0, MAT.GROUND);                         // mid
  m.paint(64, 76, 104, 84, MAT.PAVE);
  m.floor(55, 75, 59, 85, 0, MAT.GROUND);                          // under window
  m.crates(88, 74, 89, 75, 1).crates(75, 84, 76, 85, 1).crates(110, 86, 111, 87, 2);
  m.model('barrel_red', 104.5, 73.5).model('cement_bag', 61.5, 86.3, { solid: false, rot: 0.3 });
  m.prop('awning', 96, 72.3, { w: 8, d: 1.8, y: 3.4, color: 0x2f7d6a });
  m.prop('awning', 114, 87.7, { w: 7, d: 1.8, y: 3.4, color: 0xb0442f, ry: Math.PI });
  // window room (raised 3.4 m) with a sill over mid
  m.floor(40, 71, 53, 87, 3.4, MAT.WOOD).roofed(40, 71, 53, 87, 6.6);
  m.block(54, 75, 54, 85, 3.4 + 1.0, MAT.LOWWALL);
  m.stairs(30, 76, 39, 84, 'e', 0.9, 3.4, MAT.WOOD).roofed(30, 76, 39, 84, 6.6);
  m.arch(107.5, 80, 'x', 17, 8.2);

  // =====================================================================
  // CT SPAWN (west, 0.9 m)
  // =====================================================================
  const CT = 0.9;
  m.floor(8, 60, 29, 102, CT, MAT.PAVE);
  m.paint(12, 66, 25, 96, MAT.GROUND);
  m.palm(18, 80, 7.2).palm(22, 72, 6.5);
  m.crates(10, 62, 11, 63, 1).crates(26, 98, 27, 99, 1).crates(9, 100, 9, 100, 2);
  m.model('barrel_steel', 9.5, 98.5).model('barrel_blue', 10.4, 98.6);
  m.model('bench', 16.5, 61.3).model('pot_ceramic', 28.2, 62.4, { solid: false });

  // =====================================================================
  // CONNECTOR + JUNGLE (mid -> A)
  // =====================================================================
  m.stairs(65, 89, 72, 107, 's', 0, CT, MAT.STONE).roofed(65, 89, 72, 107, 4.4);
  for (const z of [93, 101]) m.prop('lamp', 68.5, z, { y: 4.3, hang: true });
  m.floor(50, 108, 72, 117, CT, MAT.STONE).roofed(58, 108, 72, 117, 4.6);
  m.crates(51, 108, 52, 109, 1);
  m.arch(68.5, 88.5, 'z', 8, 7.2);

  // =====================================================================
  // A SITE (south-west, 0.9 m) + CT approach
  // =====================================================================
  m.floor(12, 103, 28, 109, CT, MAT.PAVE);                          // CT -> A
  m.floor(10, 110, 49, 150, CT, MAT.GROUND);
  m.paint(14, 114, 46, 146, MAT.PAVE);
  m.building(22, 112, 25, 116, 3.4, 1);                              // ticket booth
  m.crates(33, 125, 34, 126, 1).crates(35, 125, 35, 125, 2);         // firebox / triple
  m.crates(17, 132, 19, 133, 1).crates(19, 134, 19, 135, 2);         // stacked boxes
  m.block(37, 138, 45, 138, CT + 1.1, MAT.LOWWALL);                  // sandwich
  m.block(37, 142, 37, 148, CT + 1.1, MAT.LOWWALL);
  m.crates(44, 114, 45, 115, 1);
  m.model('barrel_red', 11.5, 148.5).model('barrel_blue', 12.4, 148.3).model('barrel_steel', 47.5, 149.3);
  m.model('covered_car', 28.5, 143.5, { rot: Math.PI / 2 + 0.2 });
  m.prop('awning', 30, 149.6, { w: 10, d: 1.8, y: CT + 3.4, color: 0x7a3a8a, ry: Math.PI });
  m.palm(13, 120, 6.4);

  // =====================================================================
  // T RAMP / A MAIN / PALACE
  // =====================================================================
  m.floor(126, 101, 142, 119, 0, MAT.GROUND);                       // T ramp
  m.floor(75, 120, 142, 130, 0, MAT.GROUND);                        // A main
  m.paint(80, 122, 138, 128, MAT.STONE);
  m.stairs(50, 120, 74, 130, 'w', 0, CT, MAT.STONE);                // A ramp up into the site
  m.crates(100, 121, 101, 122, 1).crates(128, 102, 129, 103, 1);
  m.model('barrel_steel', 141.5, 128.5).model('barrel_red', 140.6, 129.2);
  m.model('cement_bag', 76.4, 129.3, { rot: 2.2, solid: false });
  // palace: a raised arcade from the T side overlooking A
  const PL = 2.4;
  m.floor(126, 131, 150, 148, 0, MAT.GROUND);                       // palace yard
  m.stairs(108, 132, 125, 141, 'w', 0, PL, MAT.TILES).roofed(108, 132, 125, 141, 6.4);
  m.floor(78, 132, 107, 141, PL, MAT.TILES).roofed(78, 132, 107, 141, 6.4);
  m.building(88, 134, 88, 134, 6.4, 5).building(98, 138, 98, 138, 6.4, 5);   // palace pillars
  m.floor(50, 132, 77, 140, PL, MAT.TILES).roofed(64, 132, 77, 140, 6.4);
  for (const x of [84, 94, 104]) m.prop('lamp', x + 0.5, 136.5, { y: 6.2, hang: true });
  m.model('pot_ceramic', 55.5, 133.4, { solid: false }).model('pot_ceramic', 55.5, 139.5, { solid: false, rot: 2 });
  m.palm(145, 143, 7).palm(132, 146, 6.2);

  // =====================================================================
  // B APARTMENTS (north)
  // =====================================================================
  m.floor(130, 25, 146, 61, 0, MAT.GROUND);                         // T apartments yard
  m.crates(131, 30, 132, 31, 1).crates(144, 52, 145, 53, 1);
  m.model('covered_car', 139.5, 40.5, { rot: 0.05 });
  const AP = 3.0;
  m.stairs(120, 25, 129, 34, 'w', 0, AP, MAT.WOOD).roofed(120, 25, 129, 34, 6.6);
  m.floor(78, 25, 119, 34, AP, MAT.WOOD).roofed(78, 25, 119, 34, 6.6);
  m.floor(58, 18, 77, 38, AP, MAT.TILES).roofed(58, 18, 77, 38, 6.6);
  m.building(66, 24, 67, 31, 6.6, 0);                               // apartment dividing wall
  m.stairs(49, 23, 57, 33, 'e', 0, AP, MAT.WOOD).roofed(49, 23, 57, 33, 6.6);
  for (const x of [86, 100, 112]) m.prop('lamp', x + 0.5, 29.5, { y: 6.4, hang: true });
  m.crates(60, 20, 61, 21, 1).crates(74, 35, 75, 36, 1);
  m.model('table', 70.5, 21.5, { solid: false }).model('chair', 69.4, 21.3, { rot: 1.5, solid: false });

  // =====================================================================
  // SHORT (mid -> B) + B SITE + MARKET
  // =====================================================================
  const SH = 1.5;
  m.stairs(73, 55, 83, 71, 'n', 0, SH, MAT.STONE);
  m.floor(58, 45, 83, 54, SH, MAT.STONE);
  m.stairs(49, 45, 57, 54, 'e', 0, SH, MAT.STONE);
  m.model('barrel_blue', 82.5, 45.5);
  // B site
  m.floor(10, 10, 48, 50, 0, MAT.GROUND);
  m.paint(14, 14, 44, 46, MAT.PAVE);
  m.model('covered_car', 15.5, 13.5, { rot: Math.PI / 2 });           // parked van spot
  m.crates(32, 22, 33, 23, 1).crates(24, 38, 25, 39, 1).crates(25, 40, 25, 40, 2);
  m.block(38, 44, 46, 44, 1.1, MAT.LOWWALL);
  m.model('barrel_red', 46.5, 12.5).model('barrel_steel', 46.5, 13.4).model('barrel_blue', 11.5, 48.5);
  m.model('bench', 30.5, 11.3).model('pot_clay', 29.3, 11.2, { solid: false }).model('planter_box', 36.5, 11.3, { solid: false });
  m.palm(38, 16, 6.6);
  m.prop('awning', 24, 10.4, { w: 8, d: 1.8, y: 3.8, color: 0x2f5c9a });
  // market: covered passage from CT down into B
  m.floor(15, 51, 32, 54, 0, MAT.TILES).roofed(15, 51, 32, 59, 4.4);
  m.stairs(15, 55, 32, 59, 's', 0, CT, MAT.TILES);
  m.prop('lamp', 23.5, 55, { y: 4.3, hang: true });
  m.crates(16, 52, 17, 53, 1);
  m.arch(23.5, 50.5, 'z', 18, 7.4);

  m.prop('sign', 105.99, 80, { text: 'A', arrow: 's', y: 2.2, face: 'w' });
  m.prop('sign', 125.01, 37, { text: 'B', arrow: 'w', y: 2.2, face: 'e' });

  // ---------- zones & callouts ----------
  m.zone('T', 128, 64, 150, 98).zone('CT', 10, 62, 27, 100).zone('A', 14, 114, 46, 146).zone('B', 12, 12, 46, 48);
  m.callout('T Spawn', 126, 62, 152, 100).callout('Top Mid', 106, 72, 125, 88).callout('Mid', 55, 72, 105, 88)
    .callout('Window', 40, 71, 54, 87).callout('Window Stairs', 30, 76, 39, 84).callout('CT Spawn', 8, 60, 29, 102)
    .callout('Connector', 65, 89, 72, 107, 'A').callout('Jungle', 50, 108, 72, 117, 'A').callout('Booth', 12, 103, 28, 116, 'A')
    .callout('A Site', 10, 110, 49, 150, 'A').callout('A Ramp', 50, 120, 74, 130, 'A').callout('A Main', 75, 120, 142, 130, 'A')
    .callout('T Ramp', 126, 101, 142, 119).callout('Palace', 52, 131, 150, 148, 'A')
    .callout('T Apartments', 130, 25, 146, 61, 'B').callout('Apartments', 49, 18, 129, 38, 'B').callout('Short', 49, 45, 83, 71, 'B')
    .callout('Market', 15, 51, 32, 59, 'B').callout('B Site', 10, 10, 48, 50, 'B');

  m.tactics = {
    ctHolds: [
      { site: 'A', pos: P(15, 118), watch: P(50, 125) },
      { site: 'A', pos: P(27, 140), watch: P(52, 136) },
      { site: 'A', pos: P(38, 112), watch: P(66, 112) },
      { site: 'B', pos: P(18, 38), watch: P(50, 28) },
      { site: 'B', pos: P(34, 16), watch: P(52, 49) },
      { site: 'MID', pos: P(47, 79), watch: P(106, 80) },
      { site: 'B', pos: P(42, 30), watch: P(52, 28) },
    ],
    tRoutes: { A: [P(100, 125), P(82, 136)], B: [P(100, 29), P(78, 60)] },
    plantSpots: { A: [P(28, 128), P(40, 132), P(24, 142)], B: [P(24, 30), P(34, 34), P(20, 20)] },
    entrances: { A: [P(50, 125), P(52, 136), P(50, 112)], B: [P(50, 28), P(50, 49), P(23, 51)] },
    smokes: { A: [P(24, 108), P(42, 118)], B: [P(24, 48), P(38, 26)] },
  };
  return m;
}
