import { makeMap, P, MAT } from './dsl.js';

// Cache-style industrial yard: T spawn south, CT north, A east, B west,
// wide mid with a garage into A main and a Z-shaped connector to B.
const RED = 0xa83a2a, BLUE = 0x2e5f99, GREEN = 0x3f7a3a, ORANGE = 0xc86a1e, WHITE = 0xd8d8d0, TEAL = 0x2f7f7f;

export default function cache() {
  const m = makeMap({
    id: 'cache', name: 'Cache', w: 128, h: 112,
    theme: {
      ground: 'concrete', walls: ['concrete', 'metal', 'brick', 'metal', 'brick'],
      sky: ['#7a9cb8', '#b9ccd8', '#dcdcd4'], fog: 0xc8ccc8, fogNear: 50, fogFar: 160,
      sun: 0xfff2e0, sunPos: [50, 80, -40], hemi: [0xeef2f6, 0x6a6a60], hemiI: 1.7, sunI: 1.5, wallH: 7, windows: true,
    },
  });
  const container = (x0, z0, x1, z1, color, stack = 1) => m.raise(x0, z0, x1, z1, 2.6 * stack, MAT.CONTAINER, color);

  // ---------- T spawn ----------
  m.floor(40, 94, 88, 108, 0, MAT.ASPHALT);
  container(44, 96, 49, 98, RED);
  container(76, 104, 81, 106, BLUE, 2);
  m.crates(58, 100, 59, 101, 1).barrel(86, 96).barrel(86, 97).barrel(41, 106);
  m.prop('forklift', 66, 104);

  // ---------- A main ----------
  m.floor(89, 96, 104, 106, 0, MAT.ASPHALT);
  m.floor(96, 44, 110, 95, 0, MAT.ASPHALT);
  container(97, 60, 99, 66, GREEN).crates(108, 70, 109, 71, 1).crates(108, 72, 108, 72, 2);
  container(106, 84, 109, 89, ORANGE);
  m.barrel(97, 90).barrel(98, 90);

  // ---------- A site ----------
  m.floor(84, 8, 122, 43, 0);
  container(100, 22, 104, 26, BLUE);                       // quad
  m.raise(100, 22, 101, 23, 2.6, MAT.CONTAINER, RED);      // top of quad
  m.block(112, 12, 114, 18, 2.9, MAT.CONTAINER, WHITE);    // truck trailer
  m.block(112, 19, 114, 20, 2.3, MAT.HIDDEN);
  m.prop('truckcab', 113.5, 20.5);
  m.crates(90, 30, 91, 31, 1).crates(92, 30, 92, 30, 2).crates(118, 38, 119, 39, 1);
  m.block(86, 36, 86, 42, 1.1, MAT.LOWWALL);
  m.barrel(121, 9).barrel(121, 10).barrel(85, 9);

  // ---------- Squeaky + highway ----------
  m.floor(79, 46, 95, 50, 0, MAT.CONCRETE).roofed(79, 46, 95, 50, 3.4);
  m.wall(90, 46, 90, 46, 1).wall(90, 50, 90, 50, 1);
  m.prop('doors', 90.5, 48.5, { axis: 'x', span: 3, y: 0, color: 0x6a7078 });
  m.floor(74, 8, 83, 22, 0, MAT.ASPHALT);                  // highway

  // ---------- CT ----------
  m.floor(46, 6, 73, 24, 0, MAT.ASPHALT);
  m.floor(56, 25, 70, 39, 0);                               // CT mid
  container(48, 8, 52, 10, TEAL).crates(70, 20, 71, 21, 1).barrel(47, 23).barrel(48, 23);
  m.prop('lamp', 60, 25.2, { y: 4, wall: true });

  // ---------- Mid ----------
  m.floor(52, 40, 76, 93, 0);
  m.crates(62, 64, 63, 65, 1).crates(64, 64, 64, 64, 2);   // white box
  container(54, 76, 56, 82, WHITE);
  container(70, 50, 73, 52, RED);
  m.crates(72, 86, 73, 87, 1);
  m.floor(77, 70, 90, 84, 0, MAT.CONCRETE).roofed(77, 70, 90, 84, 4.2);    // garage
  m.floor(91, 74, 95, 80, 0, MAT.CONCRETE).roofed(91, 74, 95, 80, 4.2);
  m.crates(80, 72, 81, 73, 1).barrel(88, 82).barrel(89, 82);
  m.prop('lamp', 83.5, 77.5, { y: 4.0 });

  // ---------- Z connector ----------
  m.floor(38, 52, 51, 58, 0, MAT.CONCRETE);
  m.floor(32, 44, 39, 58, 0, MAT.CONCRETE);
  m.floor(30, 41, 37, 45, 0, MAT.CONCRETE);
  m.crates(40, 56, 41, 57, 1);

  // ---------- B site + sun room ----------
  m.floor(6, 8, 40, 40, 0);
  m.block(6, 8, 15, 15, 1.2, MAT.PLATFORM);                // B heaven platform
  m.stairs(16, 8, 18, 15, 'w', 0, 1.2);
  container(24, 20, 27, 23, GREEN).crates(28, 22, 29, 23, 1);   // headshot
  container(12, 30, 14, 36, ORANGE);
  m.crates(34, 12, 35, 13, 1).crates(36, 36, 37, 37, 2);
  m.barrel(39, 38).barrel(39, 37);
  m.floor(41, 12, 45, 26, 0, MAT.TILES).roofed(41, 12, 45, 26, 3.4);  // sun room
  m.prop('lamp', 43, 19, { y: 3.3 });

  // ---------- B main / checkers ----------
  m.floor(8, 94, 39, 106, 0, MAT.ASPHALT);
  m.floor(12, 60, 26, 93, 0, MAT.TILES).roofed(12, 60, 26, 93, 3.6);  // checkers
  m.floor(12, 41, 26, 59, 0);                                          // B main
  m.crates(14, 48, 15, 49, 1).barrel(25, 42).barrel(25, 43);
  for (const z of [64, 72, 80, 88]) m.prop('lamp', 19, z, { y: 3.5 });
  container(10, 96, 12, 101, BLUE);

  m.prop('sign', 51.99, 60, { text: 'B', arrow: 'w', y: 2.4, face: 'e' });
  m.prop('sign', 76.01, 60, { text: 'A', arrow: 'e', y: 2.4, face: 'w' });

  // ---------- Zones & callouts ----------
  m.zone('T', 42, 96, 86, 106).zone('CT', 48, 8, 71, 22).zone('A', 88, 12, 118, 40).zone('B', 10, 10, 38, 38);
  m.callout('Squeaky', 79, 46, 95, 50, 'A').callout('Garage', 77, 70, 95, 84, 'A').callout('Highway', 74, 8, 83, 22)
    .callout('Quad', 99, 21, 105, 27, 'A').callout('Truck', 111, 11, 115, 21, 'A').callout('A Site', 84, 8, 122, 43, 'A')
    .callout('A Main', 89, 44, 110, 106, 'A').callout('CT Spawn', 46, 6, 73, 24).callout('CT Mid', 56, 25, 70, 39)
    .callout('White Box', 60, 62, 66, 67).callout('Mid', 52, 40, 76, 93).callout('T Spawn', 40, 94, 88, 108)
    .callout('Z Connector', 30, 41, 51, 58, 'B').callout('Sun Room', 41, 12, 45, 26, 'B').callout('Headshot', 22, 18, 30, 25, 'B')
    .callout('B Heaven', 6, 8, 18, 15, 'B').callout('B Site', 6, 8, 40, 40, 'B').callout('Checkers', 12, 60, 26, 93, 'B')
    .callout('B Main', 12, 41, 26, 59, 'B').callout('T Side B', 8, 94, 39, 106, 'B');

  m.tactics = {
    ctHolds: [
      { site: 'A', pos: P(92, 20), watch: P(103, 46) },
      { site: 'A', pos: P(116, 34), watch: P(103, 48) },
      { site: 'B', pos: P(20, 18), watch: P(19, 44) },
      { site: 'B', pos: P(34, 32), watch: P(34, 44) },
      { site: 'MID', pos: P(63, 30), watch: P(64, 70) },
      { site: 'A', pos: P(88, 38), watch: P(84, 48) },
      { site: 'B', pos: P(10, 12), watch: P(19, 42) },
    ],
    tRoutes: { A: [P(103, 80), P(84, 77)], B: [P(19, 76), P(44, 55)] },
    plantSpots: { A: [P(98, 30), P(108, 24), P(92, 16)], B: [P(22, 28), P(30, 14), P(18, 34)] },
    entrances: { A: [P(103, 44), P(85, 48), P(80, 15)], B: [P(19, 41), P(34, 42), P(40, 20)] },
    smokes: { A: [P(84, 18), P(92, 44)], B: [P(40, 20), P(26, 40)] },
  };
  return m;
}
