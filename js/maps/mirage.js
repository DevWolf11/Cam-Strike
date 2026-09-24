import { makeMap, P, MAT } from './dsl.js';

// Mirage-style layout. T spawn east, CT spawn west, A south-west, B north-west,
// mid running east-west with a raised CT window overlooking it.
export default function mirage() {
  const m = makeMap({
    id: 'mirage', name: 'Mirage', w: 128, h: 128,
    theme: {
      ground: 'cobble', walls: ['plaster', 'stone', 'plaster_pink', 'metal', 'brick'],
      sky: ['#4f8fcf', '#9cc4e8', '#f0dcc0'], fog: 0xe6d6bf, fogNear: 55, fogFar: 170,
      sun: 0xfff0d0, sunPos: [-40, 90, 50], hemi: [0xfff6ea, 0x8c7560], hemiI: 1.8, sunI: 1.6, wallH: 7, windows: true,
    },
  });

  // ---------- T spawn ----------
  m.floor(100, 50, 122, 80, 0);
  m.crates(104, 54, 105, 55, 1).crates(118, 74, 119, 75, 2).barrel(121, 52).barrel(121, 53);
  m.prop('tree', 112, 64).prop('pot', 102, 78).prop('pot', 120, 60);

  // ---------- Mid ----------
  m.floor(84, 58, 99, 70, 0);                              // top mid
  m.floor(48, 58, 83, 70, 0);                              // mid
  m.floor(44, 60, 47, 68, 0);                              // under window
  m.crates(70, 60, 71, 61, 1).crates(60, 67, 61, 68, 1).crates(88, 68, 89, 69, 2);
  m.prop('awning', 76, 58.2, { w: 8, d: 2, y: 3.4, color: 0x2f7d6a });
  m.prop('awning', 90, 69.8, { w: 6, d: 2, y: 3.4, color: 0xb0442f });
  // Window room (CT sniper nest, raised 3.3m) overlooking mid
  m.floor(32, 56, 43, 70, 3.3, MAT.WOOD).roofed(32, 56, 43, 70, 6.2);
  m.block(44, 60, 44, 68, 3.3 + 1.0, MAT.LOWWALL);         // window sill
  m.stairs(24, 62, 31, 68, 'e', 0.9, 3.3).roofed(24, 62, 31, 68, 6.2);

  // ---------- CT spawn ----------
  m.floor(6, 48, 23, 82, 0.9);
  m.crates(8, 50, 9, 51, 1).crates(20, 78, 21, 79, 1).barrel(7, 80).barrel(8, 80);
  m.prop('tree', 14, 64).prop('pot', 22, 50);

  // ---------- Connector + Jungle (mid -> A) ----------
  m.stairs(52, 71, 58, 86, 's', 0, 0.9).roofed(52, 71, 58, 86, 3.4);
  m.floor(40, 87, 58, 94, 0.9).roofed(46, 87, 58, 94, 3.6);
  for (const z of [74, 80, 86]) m.prop('lamp', 55, z, { y: 3.3 });

  // ---------- A site ----------
  m.floor(8, 88, 39, 120, 0.9);
  m.floor(10, 83, 22, 87, 0.9);                            // CT -> A (ticket booth side)
  m.wall(18, 90, 20, 92, 1);                               // ticket booth
  m.crates(26, 100, 27, 101, 1).crates(28, 100, 28, 100, 2);            // firebox / triple
  m.crates(14, 106, 16, 107, 1).crates(16, 108, 16, 109, 2);            // tetris
  m.block(30, 110, 36, 110, 0.9 + 1.1, MAT.LOWWALL);                    // sandwich
  m.block(30, 114, 30, 118, 0.9 + 1.1, MAT.LOWWALL);
  m.crates(36, 92, 37, 93, 1).barrel(9, 118).barrel(10, 118).barrel(38, 119);
  m.prop('awning', 24, 119.8, { w: 10, d: 2, y: 4.2, color: 0x7a3a8a });

  // ---------- T ramp / A main / Palace ----------
  m.floor(100, 81, 114, 95, 0);                            // T ramp
  m.floor(60, 96, 114, 104, 0);                            // A main
  m.stairs(40, 96, 59, 104, 'w', 0, 0.9);                  // A ramp up into site
  m.crates(80, 98, 81, 99, 1).barrel(112, 102).barrel(113, 102);
  m.floor(100, 105, 120, 118, 0);                          // palace entrance
  m.stairs(86, 106, 99, 113, 'w', 0, 2.1).roofed(86, 106, 99, 113, 5);
  m.floor(62, 106, 85, 113, 2.1, MAT.TILES).roofed(62, 106, 85, 113, 5);
  m.wall(70, 108, 70, 108, 2).wall(78, 111, 78, 111, 2);   // palace pillars
  m.floor(42, 106, 61, 112, 2.1, MAT.TILES).roofed(50, 106, 61, 112, 5);
  for (const x of [66, 74, 82]) m.prop('lamp', x, 109.5, { y: 4.8 });

  // ---------- B apartments ----------
  m.floor(104, 20, 116, 49, 0);                            // T apps (outside)
  m.stairs(96, 20, 103, 27, 'w', 0, 2.4).roofed(96, 20, 103, 27, 5.4);
  m.floor(62, 20, 95, 27, 2.4, MAT.WOOD).roofed(62, 20, 95, 27, 5.4);
  m.floor(46, 14, 61, 30, 2.4, MAT.TILES).roofed(46, 14, 61, 30, 5.4);
  m.stairs(39, 18, 45, 26, 'e', 0, 2.4).roofed(39, 18, 45, 26, 5.4);
  for (const x of [68, 78, 88]) m.prop('lamp', x, 23.5, { y: 5.1 });
  m.crates(50, 16, 51, 17, 1).crates(58, 28, 59, 29, 1);

  // ---------- Short (catwalk) mid -> B ----------
  m.stairs(58, 44, 66, 57, 'n', 0, 1.2);
  m.floor(46, 36, 66, 43, 1.2);
  m.stairs(39, 36, 45, 43, 'e', 0, 1.2);
  m.block(46, 43, 57, 43, 1.2 + 1.0, MAT.LOWWALL);

  // ---------- B site + market ----------
  m.floor(8, 8, 38, 40, 0);
  m.block(10, 10, 14, 12, 1.3, MAT.HIDDEN);
  m.prop('car', 12.5, 11.5, { rot: Math.PI / 2, color: 0xd8d0c0 });  // van
  m.crates(26, 18, 27, 19, 1).crates(20, 30, 21, 31, 1).crates(21, 32, 21, 32, 2);
  m.block(30, 34, 36, 34, 1.1, MAT.LOWWALL);
  m.barrel(36, 10).barrel(36, 11).barrel(9, 38);
  m.prop('tree', 30, 12).prop('pot', 24, 9).prop('awning', 18, 8.2, { w: 8, d: 2, y: 3.8, color: 0x2f5c9a });
  m.floor(12, 41, 26, 43, 0).roofed(12, 41, 26, 47, 3.6);   // market
  m.stairs(12, 44, 26, 47, 's', 0, 0.9);
  m.prop('lamp', 19, 44, { y: 3.4 });

  m.prop('sign', 83.99, 64, { text: 'A', arrow: 's', y: 2.2, face: 'w' });
  m.prop('sign', 100.01, 30, { text: 'B', arrow: 'w', y: 2.2, face: 'e' });

  // ---------- Zones & callouts ----------
  m.zone('T', 100, 50, 122, 80).zone('CT', 6, 48, 23, 82).zone('A', 10, 90, 37, 118).zone('B', 10, 10, 36, 38);
  m.callout('Window', 32, 56, 44, 70).callout('Top Mid', 84, 58, 99, 70).callout('Mid', 44, 58, 83, 70)
    .callout('Connector', 52, 71, 58, 86, 'A').callout('Jungle', 40, 87, 58, 94, 'A').callout('Ticket Booth', 10, 83, 22, 92, 'A')
    .callout('Tetris', 12, 104, 18, 110, 'A').callout('Firebox', 24, 98, 30, 103, 'A').callout('A Site', 8, 88, 39, 120, 'A')
    .callout('A Ramp', 40, 96, 59, 104, 'A').callout('A Main', 60, 96, 114, 104, 'A').callout('Palace', 42, 105, 120, 118, 'A')
    .callout('T Ramp', 100, 81, 114, 95).callout('T Spawn', 100, 50, 122, 80).callout('CT Spawn', 6, 48, 31, 82)
    .callout('T Apartments', 104, 20, 116, 49, 'B').callout('Apartments', 46, 14, 103, 30, 'B').callout('Short', 39, 36, 66, 57, 'B')
    .callout('Market', 12, 41, 26, 47, 'B').callout('B Site', 8, 8, 38, 40, 'B');

  m.tactics = {
    ctHolds: [
      { site: 'A', pos: P(12, 96), watch: P(42, 100) },
      { site: 'A', pos: P(22, 112), watch: P(42, 109) },
      { site: 'B', pos: P(14, 30), watch: P(40, 22) },
      { site: 'B', pos: P(26, 12), watch: P(42, 40) },
      { site: 'MID', pos: P(38, 63), watch: P(84, 64) },
      { site: 'A', pos: P(30, 92), watch: P(56, 90) },
      { site: 'B', pos: P(33, 28), watch: P(40, 22) },
    ],
    tRoutes: { A: [P(80, 100), P(66, 109)], B: [P(80, 23), P(62, 52)] },
    plantSpots: { A: [P(22, 104), P(32, 106), P(20, 114)], B: [P(20, 24), P(28, 28), P(16, 16)] },
    entrances: { A: [P(42, 100), P(44, 109), P(40, 90)], B: [P(40, 22), P(40, 39), P(19, 42)] },
    smokes: { A: [P(20, 88), P(34, 96)], B: [P(20, 38), P(30, 20)] },
  };
  return m;
}
