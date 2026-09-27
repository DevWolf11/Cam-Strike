import { makeMap, P, MAT } from './dsl.js';

// Sirocco: a sun-baked desert town (the classic long-A / mid / tunnels-to-B layout, rebuilt
// bigger and denser). North is -z. T spawn south on a raised plateau, CT spawn north-centre,
// A site north-east (raised), B site north-west.
export default function sirocco() {
  const m = makeMap({
    id: 'sirocco', name: 'Sirocco', w: 160, h: 160,
    theme: {
      sky: 'clear', skyRot: 70, facade: 'desert', skyline: 'desert', skylineOpacity: 0.5,
      floors: {
        [MAT.GROUND]: 'sirocco_ground', [MAT.PLATFORM]: 'pavement_red', [MAT.SAND]: 'sirocco_sand', [MAT.TILES]: 'patio',
        [MAT.ASPHALT]: 'asphalt', [MAT.CONCRETE]: 'concrete_floor', [MAT.METAL]: 'diamond_plate', [MAT.WOOD]: 'wood',
        [MAT.PAVE]: 'pavement_red', [MAT.STONE]: 'patio', [MAT.DIRT]: 'sirocco_sand', [MAT.GRASS]: 'grass',
      },
      // wall surfaces by index: 0 sandstone blocks, 1 beige plaster, 2 clay plaster, 3 corrugated sheds,
      // 4 sandstone brick, 5 damaged plaster, 6 rubble stone
      walls: ['sandstone', 'plaster_beige', 'adobe', 'corrugated', 'sandbrick', 'plaster_damaged', 'stone_rubble'],
      trim: {
        cornice: 'sandstone', sill: 'plaster_white', base: 'stone_rubble', quoin: 'sandstone', drift: 'sirocco_sand',
        coping: 'sandstone', roofTop: 'plaster_beige', lintel: 'sandstone', lowwall: 'sandbrick', ledge: 'sandbrick',
        frame: 'wood', doorframe: 'sandstone', infill: 'sandbrick', arch: 'sandstone', ceiling: 'ceiling', skirting: 'stone_rubble',
        patches: { sirocco_ground: 'sirocco_sand', sirocco_sand: 'sirocco_ground', pavement_red: 'sirocco_sand', cobble: 'sirocco_sand' }, patchDensity: 0.25,
      },
      fogNear: 90, fogFar: 300, bounce: 0xa89070, dust: 0xd0b88a, wallH: 7, sunI: 2.6, hemiI: 2.2, indoor: 0.85,
      tints: [0xffffff, 0xf4e8d8, 0xe6dccb, 0xfff2de, 0xddd3c4, 0xf2e2ca, 0xfaf4ea, 0xe9d9bf],
      surfTint: { cobble: 0xe2d2b4, pavement_red: 0xf0e2cc },
    },
  });
  const TOWN = [0, 0, 1, 1, 2, 4, 5];

  // ---------- the town mass: varied building lots everywhere, carved below ----------
  m.lots(0, 0, 159, 159, { h: [5.5, 10], mats: TOWN, min: 6, max: 13, seed: 7 });
  m.building(0, 0, 159, 2, 12, 6).building(0, 157, 159, 159, 12, 6).building(0, 0, 2, 159, 12, 6).building(157, 0, 159, 159, 12, 6);

  // =====================================================================
  // T SPAWN: raised plateau (1.2 m) with a hut, a well and parked trucks
  // =====================================================================
  const TS = 1.2;
  m.floor(58, 134, 110, 152, TS, MAT.SAND);
  m.paint(66, 134, 102, 146, MAT.GROUND);
  m.building(64, 146, 71, 152, 4.5, 2);                       // hut
  m.building(96, 147, 104, 152, 5, 1);
  m.crates(60, 136, 61, 137, 1).crates(60, 138, 60, 138, 2).crates(107, 149, 108, 150, 1).crates(88, 150, 89, 151, 2);
  m.model('covered_car', 80.5, 148.5, { rot: Math.PI / 2 - 0.1 });
  m.model('barrel_red', 106.5, 136.5).model('barrel_steel', 107.4, 137.3).model('barrel_blue', 59.6, 150.5);
  m.model('bucket', 72.6, 150.4, { solid: false }).model('jerrycan', 73.3, 150.6, { rot: 0.4, solid: false });
  m.model('fire_pit', 92.5, 141.5, { solid: false });
  m.palm(76, 138, 7.5).palm(95, 137, 6.8).palm(62, 145, 6.2);
  m.prop('awning', 84, 151.4, { w: 6, d: 1.6, y: TS + 2.7, color: 0x9a3b2c });

  // T ramp down into top mid, and the narrow 'suicide' side path
  m.stairs(72, 126, 84, 133, 's', 0, TS, MAT.GROUND);
  m.stairs(64, 128, 67, 133, 's', 0, TS, MAT.STONE);
  m.floor(64, 112, 67, 127, 0, MAT.STONE).floor(68, 112, 69, 116, 0, MAT.STONE);
  m.model('barrel_blue', 64.6, 121.5, { solid: false, scale: 0.9 });

  // =====================================================================
  // MID
  // =====================================================================
  m.floor(70, 108, 86, 125, 0, MAT.GROUND);                    // top mid
  m.floor(71, 52, 85, 107, 0, MAT.GROUND);                     // mid
  m.paint(74, 60, 82, 104, MAT.PAVE);
  m.crates(76, 74, 77, 75, 1).crates(78, 74, 78, 74, 2);        // mid crates (the "box")
  m.crates(71, 96, 71, 97, 1);
  m.model('barrel_steel', 84.5, 118.5).model('barrel_red', 84.5, 119.4).model('cement_bag', 71.6, 112.5, { solid: false, rot: 1.4 });
  m.model('tyre', 85.2, 101.3, { solid: false, rot: 1.2 });
  m.prop('awning', 78, 108.3, { w: 8, d: 1.8, y: 3.3, color: 0x2f6d8a });
  // mid doors to CT mid
  m.floor(75, 40, 80, 51, 0, MAT.STONE);
  m.prop('doors', 78, 45.5, { axis: 'z', span: 6, y: 0 });
  m.roofed(75, 43, 80, 48, 4.6);
  m.arch(78, 51.5, 'z', 6, 6.4);

  // lower tunnels: covered passage from mid west toward the tunnels
  m.floor(26, 84, 70, 90, 0, MAT.CONCRETE).roofed(26, 84, 69, 90, 3.6);
  m.floor(66, 84, 70, 90, 0, MAT.CONCRETE);
  for (const x of [32, 42, 52, 62]) m.prop('lamp', x + 0.5, 87.5, { y: 3.55, hang: true });
  m.crates(40, 89, 41, 90, 1).crates(56, 84, 56, 85, 1);
  m.arch(70.5, 87.5, 'x', 7, 6.4);

  // =====================================================================
  // CT SPAWN + CT MID
  // =====================================================================
  m.floor(62, 8, 97, 30, 0, MAT.PAVE);
  m.paint(66, 12, 92, 26, MAT.GROUND);
  m.block(70, 14, 76, 18, 0.45, MAT.GRASS);                    // raised planter with palms
  m.palm(72, 15, 7.2).palm(75, 17, 6.4);
  m.building(84, 10, 88, 13, 4, 4);                             // well house
  m.model('covered_car', 90.5, 21.5, { rot: 0.2 }).model('covered_car', 64.8, 11.5, { rot: Math.PI / 2 + 0.1 });
  m.crates(94, 9, 95, 10, 1).crates(62, 27, 63, 28, 1).crates(63, 29, 63, 29, 2);
  m.model('barrel_blue', 96.3, 28.4).model('barrel_steel', 95.4, 28.6);
  m.model('bench', 80.5, 9.3, { rot: 0 }).model('table', 67.5, 22.5, { solid: false }).model('chair', 66.4, 22.4, { rot: 1.4, solid: false }).model('chair', 68.6, 22.8, { rot: -1.6, solid: false });
  m.floor(56, 31, 90, 39, 0, MAT.GROUND);                       // CT mid
  m.paint(60, 32, 88, 38, MAT.PAVE);
  m.model('barrel_red', 88.5, 38.3).model('jerrycan', 89.4, 38.4, { solid: false });

  // =====================================================================
  // B DOORS, B WINDOW, B SITE
  // =====================================================================
  m.floor(46, 32, 57, 38, 0, MAT.STONE);                        // B doors passage
  m.roofed(48, 32, 53, 38, 4.3);
  m.prop('doors', 51, 35.5, { axis: 'x', span: 7, y: 0 });
  // B window room (raised 1.2 m) looks into the site through a sill
  m.floor(47, 20, 55, 28, TS, MAT.WOOD).roofed(47, 20, 55, 28, 4.6);
  m.stairs(50, 29, 54, 31, 'n', 0, TS, MAT.STONE).roofed(50, 29, 54, 31, 4.6);
  m.block(46, 21, 46, 27, TS + 1.05, MAT.LOWWALL);
  // B site
  m.floor(8, 8, 45, 49, 0, MAT.GROUND);
  m.paint(10, 20, 44, 48, MAT.SAND);
  m.block(10, 9, 26, 18, 0.9, MAT.PLATFORM);                    // back platform
  m.stairs(10, 19, 26, 21, 'n', 0, 0.9, MAT.PLATFORM);
  m.building(9, 8, 14, 12, 6, 4);                               // back-plat corner hut
  m.floor(15, 8, 26, 8, 0.9, MAT.PLATFORM);
  m.model('covered_car', 33.5, 38.5, { rot: 0.35 });
  m.crates(30, 12, 31, 13, 2).crates(32, 12, 32, 12, 1).crates(22, 26, 23, 27, 1).crates(12, 34, 13, 35, 1).crates(12, 36, 12, 36, 2);
  m.crates(38, 44, 39, 45, 1).crates(40, 44, 40, 44, 2);
  m.model('barrel_red', 43.5, 9.5).model('barrel_steel', 43.6, 10.5).model('barrel_blue', 9.5, 47.4);
  m.model('sacks', 18.5, 44.7, { rot: 0.2, solid: false }).model('cement_bag', 20.2, 45.1, { rot: 1.2, solid: false });
  m.model('cement_bag', 44.2, 40.3, { rot: -1.5, solid: false });
  m.prop('awning', 32, 8.4, { w: 7, d: 1.8, y: 3.7, color: 0x3b6e8f });
  m.palm(40, 18, 6.6);

  // =====================================================================
  // TUNNELS
  // =====================================================================
  m.floor(14, 50, 25, 73, 0, MAT.CONCRETE).roofed(14, 52, 25, 73, 3.6);        // B tunnel exit
  m.floor(14, 74, 25, 102, 0, MAT.CONCRETE).roofed(14, 74, 25, 100, 3.6);      // upper tunnels
  m.crates(22, 60, 23, 61, 1).crates(15, 79, 16, 80, 1).crates(22, 92, 23, 92, 1);
  for (const z of [56, 66, 78, 90]) m.prop('lamp', 19.5, z + 0.5, { y: 3.55, hang: true });
  m.arch(20, 49.5, 'z', 12, 7);
  // outside tunnels: dusty yard with a ruined wall line
  m.floor(8, 103, 32, 146, 0, MAT.SAND);
  m.floor(33, 131, 45, 146, 0, MAT.SAND);
  m.stairs(46, 136, 57, 147, 'e', 0, TS, MAT.SAND);
  m.building(18, 114, 21, 126, 3.2, 6);                          // ruined wall in the yard
  m.building(10, 132, 14, 137, 4, 2);
  m.crates(26, 106, 27, 107, 1).crates(9, 120, 10, 121, 2).crates(30, 140, 31, 141, 1);
  m.model('barrel_red', 31.5, 104.5).model('tyre', 12.5, 108.5, { solid: false }).model('tyre', 13.2, 109.1, { rot: 1, solid: false });
  m.model('boulder', 24.5, 140.8, { rot: 0.6 });
  m.palm(38, 142, 6.9).palm(12, 144, 7.4);
  m.arch(20, 102.5, 'z', 12, 7);

  // =====================================================================
  // CATWALK (short A)
  // =====================================================================
  m.floor(86, 70, 101, 80, 0, MAT.GROUND);                        // catwalk base off mid
  m.stairs(94, 49, 103, 69, 'n', 0, 2.8, MAT.STONE);
  m.floor(94, 37, 103, 48, 2.8, MAT.STONE);
  m.floor(95, 30, 107, 36, 2.8, MAT.STONE);
  m.model('barrel_steel', 100.5, 77.5).model('barrel_blue', 101.3, 78.4);
  m.crates(86, 71, 87, 72, 1);

  // =====================================================================
  // LONG A
  // =====================================================================
  m.floor(111, 132, 142, 148, TS, MAT.SAND);                      // outside long
  m.floor(111, 134, 118, 146, TS, MAT.GROUND);                   // link from T spawn
  m.paint(120, 134, 140, 146, MAT.GROUND);
  m.crates(138, 145, 139, 146, 1).crates(140, 145, 140, 145, 2);
  m.model('barrel_red', 141.4, 133.5).model('covered_car', 124.5, 145.2, { rot: Math.PI / 2 });
  m.floor(127, 118, 133, 131, TS, MAT.STONE);                    // long doors
  m.roofed(127, 121, 133, 127, 4.6);
  m.prop('doors', 130.5, 124, { axis: 'z', span: 7, y: TS });
  m.floor(122, 52, 141, 117, TS, MAT.GROUND);                    // long
  m.paint(126, 60, 138, 116, MAT.SAND);
  m.building(122, 88, 125, 117, 7.5, 0);                          // long corner building (west side)
  m.raise(122, 72, 124, 78, 2.6, MAT.CONTAINER, 0x2f5f8a);        // the blue container
  m.crates(138, 98, 139, 99, 1).crates(139, 60, 140, 61, 1);
  m.model('barrel_steel', 140.5, 84.5).model('barrel_red', 140.5, 85.4);
  m.model('covered_car', 131.5, 108.5, { rot: -0.15 });
  // pit (lower, east of long) with stairs back up at its south end
  m.floor(142, 44, 153, 68, 0, MAT.SAND);
  m.stairs(142, 69, 153, 72, 's', 0, TS, MAT.SAND);
  m.floor(142, 73, 153, 76, TS, MAT.SAND);
  m.model('boulder', 147.5, 51.5, { rot: 1.1 }).crates(150, 46, 151, 47, 1);
  m.model('tyre', 144.5, 62.5, { solid: false, rot: 0.3 });
  // A ramp
  m.stairs(122, 38, 141, 51, 'n', TS, 2.8, MAT.STONE);

  // =====================================================================
  // A SITE (raised 2.8 m)
  // =====================================================================
  const AS = 2.8;
  m.floor(108, 8, 153, 37, AS, MAT.GROUND);
  m.paint(112, 12, 150, 34, MAT.PAVE);
  m.crates(123, 18, 125, 20, 1).crates(126, 18, 127, 19, 2);      // site boxes
  m.crates(136, 26, 137, 27, 1);
  m.block(110, 30, 116, 30, AS + 1.1, MAT.LOWWALL);               // short wall by the catwalk entrance
  m.crates(146, 9, 147, 10, 1);                                   // corner nook boxes
  m.model('barrel_red', 151.5, 25.5).model('barrel_blue', 152.2, 26.4).model('barrel_steel', 151.4, 27.3);
  m.model('covered_car', 140.5, 14.5, { rot: 0.1 });
  m.building(128, 8, 135, 11, 8, 1);                               // back-site building bay
  m.prop('awning', 131.5, 12.4, { w: 7, d: 1.6, y: AS + 3.2, color: 0x8f6a2a });
  m.palm(117, 12, 7.6);
  // CT ramp from CT spawn up to A
  m.stairs(98, 12, 107, 26, 'e', 0, AS, MAT.STONE);
  m.floor(98, 27, 107, 29, AS, MAT.STONE);
  m.arch(103, 19.5, 'x', 15, 9.6);

  // signs
  m.prop('sign', 70.01, 100, { text: 'A', arrow: 'e', y: 2.2, face: 'e' });
  m.prop('sign', 85.99, 96, { text: 'B', arrow: 'w', y: 2.2, face: 'w' });

  // ---------- zones & callouts ----------
  m.zone('T', 60, 136, 108, 150).zone('CT', 64, 10, 95, 28).zone('A', 112, 10, 150, 34).zone('B', 10, 10, 44, 48);
  m.callout('T Spawn', 58, 134, 110, 152).callout('T Ramp', 72, 126, 84, 133).callout('Side Path', 64, 116, 67, 133)
    .callout('Top Mid', 70, 108, 86, 125).callout('Mid', 71, 52, 85, 107).callout('Mid Crates', 75, 72, 80, 77)
    .callout('Mid Doors', 75, 40, 80, 51).callout('CT Mid', 56, 31, 90, 39).callout('CT Spawn', 62, 8, 97, 30)
    .callout('Lower Tunnel', 26, 84, 70, 90, 'B').callout('Upper Tunnel', 14, 74, 25, 102, 'B').callout('Tunnel Exit', 14, 50, 25, 73, 'B')
    .callout('Outside Tunnels', 8, 103, 45, 146, 'B').callout('B Doors', 46, 32, 57, 38, 'B').callout('B Window', 46, 20, 55, 31, 'B')
    .callout('Back Platform', 10, 8, 26, 21, 'B').callout('B Car', 30, 35, 37, 42, 'B').callout('B Site', 8, 8, 45, 49, 'B')
    .callout('Catwalk', 86, 30, 107, 80, 'A').callout('Outside Long', 111, 132, 142, 148, 'A').callout('Long Doors', 127, 118, 133, 131, 'A')
    .callout('Long', 122, 52, 141, 117, 'A').callout('Blue', 121, 70, 126, 80, 'A').callout('Pit', 142, 44, 153, 76, 'A')
    .callout('A Ramp', 122, 38, 141, 51, 'A').callout('A Corner', 145, 8, 153, 14, 'A').callout('A Site', 108, 8, 153, 37, 'A')
    .callout('CT Ramp', 98, 12, 107, 29);

  m.tactics = {
    ctHolds: [
      { site: 'A', pos: P(131, 30), watch: P(131, 55) },
      { site: 'A', pos: P(113, 16), watch: P(99, 42) },
      { site: 'A', pos: P(146, 22), watch: P(131, 50) },
      { site: 'B', pos: P(18, 13), watch: P(19, 52) },
      { site: 'B', pos: P(42, 24), watch: P(20, 50) },
      { site: 'B', pos: P(50, 24), watch: P(20, 40) },
      { site: 'MID', pos: P(77, 36), watch: P(78, 70) },
    ],
    tRoutes: { A: [P(131, 100), P(96, 75)], B: [P(19, 88), P(50, 87)] },
    plantSpots: { A: [P(128, 22), P(138, 15), P(118, 30)], B: [P(18, 28), P(30, 24), P(36, 44)] },
    entrances: { A: [P(131, 49), P(104, 33), P(106, 20)], B: [P(19, 51), P(52, 35)] },
    smokes: { A: [P(106, 20), P(120, 22)], B: [P(52, 35), P(42, 34)] },
  };
  return m;
}
