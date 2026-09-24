import { makeMap, P, MAT } from './dsl.js';

// Dust II-style layout. North is -z. T spawn south, CT spawn north-center,
// A site north-east (raised), B site north-west.
export default function dust2() {
  const m = makeMap({
    id: 'dust2', name: 'Dust II', w: 128, h: 128,
    theme: {
      clouds: 0.35, cloud: 0xfff4e4, skyline: 'desert',
      ground: 'sand', walls: ['sandstone', 'plaster', 'sandstone', 'metal', 'brick'],
      sky: ['#5c9ad6', '#a6c8e6', '#ead9b4'], fog: 0xdcceb0, fogNear: 55, fogFar: 170,
      sun: 0xffe2b0, sunPos: [60, 90, 30], hemi: [0xfff4e0, 0x8a7355], hemiI: 1.8, sunI: 1.7, wallH: 6, windows: true,
    },
  });

  // ---------- T side (raised plateau at 0.9m) ----------
  m.floor(44, 108, 86, 122, 0.9);
  m.crates(50, 112, 51, 113, 1).crates(79, 118, 80, 119, 2).crates(81, 118, 81, 118, 1);
  m.barrel(46, 120).barrel(47, 120).barrel(84, 110);
  m.prop('tree', 64, 119).prop('awning', 72, 108, { w: 6, d: 2, y: 3.4, color: 0x9a3b2c });

  // ---------- Mid ----------
  m.stairs(57, 100, 67, 107, 's', 0, 0.9);                 // T ramp down into mid
  m.floor(56, 40, 68, 99, 0);                               // mid
  m.crates(60, 50, 61, 51, 1).crates(62, 50, 62, 50, 2);   // xbox
  m.floor(60, 32, 63, 39, 0);                               // mid doors corridor
  m.prop('doors', 61.5, 36, { axis: 'z', span: 4, y: 0 });
  m.prop('beam', 61.5, 33, { axis: 'x', len: 6, y: 3.6 });
  m.barrel(66, 96).barrel(67, 96).crates(56, 70, 56, 71, 1);

  // ---------- CT spawn + CT mid ----------
  m.floor(52, 6, 78, 24, 0);
  m.floor(46, 25, 72, 31, 0);
  m.wall(64, 12, 65, 13, 1);
  m.crates(54, 8, 55, 9, 1).crates(76, 22, 77, 23, 2).crates(53, 22, 53, 23, 1);
  m.prop('tree', 70, 10).prop('tree', 57, 16);
  m.barrel(71, 30).barrel(72, 30);

  // ---------- B doors + B site ----------
  m.floor(38, 26, 45, 30, 0);
  m.wall(42, 26, 42, 26, 1).wall(42, 30, 42, 30, 1);
  m.prop('doors', 42.5, 28.5, { axis: 'x', span: 3, y: 0 });
  m.floor(6, 6, 38, 40, 0);
  m.block(8, 8, 20, 15, 0.6, MAT.PLATFORM);
  m.stairs(8, 16, 20, 17, 'n', 0, 0.6);
  m.block(26, 28, 28, 32, 1.4, MAT.HIDDEN);
  m.prop('car', 27.5, 30.5, { rot: 0, color: 0x7a2e24 });
  m.crates(30, 10, 31, 11, 2).crates(32, 10, 32, 10, 1).crates(22, 22, 23, 23, 1);
  m.crates(12, 30, 13, 31, 1).crates(12, 32, 12, 32, 2).crates(34, 36, 35, 37, 1);
  m.barrel(36, 8).barrel(36, 9).barrel(7, 38);
  m.prop('awning', 30, 7, { w: 6, d: 2, y: 3.6, color: 0x3b6e8f });

  // ---------- Tunnels ----------
  m.floor(11, 41, 20, 58, 0).roofed(11, 41, 20, 58, 3.4);     // B tunnel exit
  m.floor(11, 59, 20, 82, 0).roofed(11, 59, 20, 82, 3.4);     // upper tunnels
  m.floor(21, 68, 55, 72, 0).roofed(21, 68, 55, 72, 3.2);     // lower tunnels
  m.floor(8, 83, 24, 116, 0).floor(25, 105, 35, 116, 0);      // outside tunnels
  m.stairs(36, 108, 43, 116, 'e', 0, 0.9);
  m.crates(20, 90, 21, 91, 1).crates(9, 100, 10, 101, 2).barrel(33, 106);
  for (const z of [46, 54, 62, 70, 78]) m.prop('lamp', 15.5, z, { y: 3.3 });
  for (const x of [26, 34, 42, 50]) m.prop('lamp', x, 70.5, { y: 3.1 });
  m.crates(18, 62, 19, 63, 1).crates(30, 71, 31, 72, 1);

  // ---------- Catwalk (short A) ----------
  m.floor(69, 58, 80, 64, 0);
  m.stairs(75, 40, 82, 57, 'n', 0, 1.8);
  m.floor(75, 30, 82, 39, 1.8);
  m.floor(76, 24, 85, 29, 1.8);
  m.barrel(80, 61);

  // ---------- Long A ----------
  m.floor(87, 106, 112, 118, 0.9);                            // outside long
  m.floor(101, 95, 104, 105, 0.9);                            // long doors
  m.prop('doors', 102.5, 100.5, { axis: 'z', span: 4, y: 0.9 });
  m.prop('beam', 102.5, 96, { axis: 'x', len: 6, y: 4.2 });
  m.floor(96, 40, 111, 94, 0.9);                              // long
  m.wall(96, 72, 99, 94, 1);                                  // long corner building
  m.block(99, 62, 101, 68, 0.9 + 2.6, MAT.CONTAINER, 0x2f5f8a);
  m.crates(108, 44, 109, 45, 1).barrel(110, 80).barrel(110, 81);
  m.floor(112, 34, 121, 52, 0);                               // pit
  m.stairs(112, 53, 121, 56, 's', 0, 0.9);
  m.crates(118, 36, 119, 37, 1);
  m.stairs(96, 30, 111, 39, 'n', 0.9, 1.8);                   // A ramp

  // ---------- A site (raised 1.8m) ----------
  m.floor(86, 6, 122, 29, 1.8);
  m.crates(100, 14, 103, 17, 1).crates(104, 14, 105, 15, 2);
  m.block(88, 22, 93, 22, 1.8 + 1.1, MAT.LOWWALL);
  m.crates(116, 7, 117, 8, 1);
  m.barrel(120, 20).barrel(121, 20).barrel(121, 21);
  m.stairs(79, 10, 85, 20, 'e', 0, 1.8);                      // CT ramp to A
  m.prop('awning', 112, 26, { w: 8, d: 2, y: 5.4, color: 0x8f6a2a });

  // Signs
  m.prop('sign', 60, 88, { text: 'A', arrow: 'e', y: 2.2, face: 'w', wx: 55.99 });
  m.prop('sign', 68, 84, { text: 'B', arrow: 'w', y: 2.2, face: 'e', wx: 69.01 });

  // ---------- Zones & callouts ----------
  m.zone('T', 44, 108, 86, 122).zone('CT', 52, 6, 78, 24).zone('A', 90, 8, 120, 28).zone('B', 8, 8, 36, 38);
  m.callout('Mid Doors', 60, 32, 63, 39).callout('Xbox', 58, 48, 64, 53).callout('Top Mid', 56, 90, 68, 107)
    .callout('Mid', 56, 40, 68, 99).callout('T Spawn', 44, 108, 86, 122)
    .callout('Upper Tunnels', 11, 59, 20, 82, 'B').callout('Lower Tunnels', 21, 68, 55, 72, 'B')
    .callout('Outside Tunnels', 8, 83, 43, 116, 'B').callout('B Tunnels', 11, 41, 20, 58, 'B')
    .callout('B Platform', 8, 8, 20, 17, 'B').callout('B Site', 6, 6, 38, 40, 'B').callout('B Doors', 38, 26, 45, 30, 'B')
    .callout('CT Spawn', 52, 6, 78, 24).callout('CT Mid', 46, 25, 72, 31)
    .callout('Catwalk', 69, 30, 82, 64, 'A').callout('Goose', 116, 6, 122, 12, 'A').callout('A Site', 86, 6, 122, 29, 'A')
    .callout('A Ramp', 96, 30, 111, 39, 'A').callout('Pit', 112, 34, 121, 56, 'A').callout('Long A', 96, 40, 111, 94, 'A')
    .callout('Long Doors', 100, 95, 105, 105, 'A').callout('Outside Long', 87, 106, 112, 118, 'A').callout('CT Ramp', 79, 10, 85, 20);

  m.tactics = {
    ctHolds: [
      { site: 'A', pos: P(104, 24), watch: P(104, 42) },
      { site: 'A', pos: P(92, 12), watch: P(79, 33) },
      { site: 'B', pos: P(22, 14), watch: P(15, 44) },
      { site: 'B', pos: P(33, 21), watch: P(16, 42) },
      { site: 'MID', pos: P(61, 27), watch: P(62, 60) },
      { site: 'A', pos: P(114, 18), watch: P(104, 40) },
      { site: 'B', pos: P(26, 36), watch: P(15, 42) },
    ],
    tRoutes: { A: [P(103, 80), P(72, 61)], B: [P(15, 72), P(40, 70)] },
    plantSpots: { A: [P(101, 20), P(110, 12), P(95, 25)], B: [P(14, 12), P(24, 20), P(30, 34)] },
    entrances: { A: [P(103, 38), P(80, 31), P(84, 15)], B: [P(15, 41), P(40, 28)] },
    smokes: { A: [P(86, 15), P(96, 16)], B: [P(40, 28), P(33, 26)] },
  };
  return m;
}
