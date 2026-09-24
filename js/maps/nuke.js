import { makeMap, P, MAT } from './dsl.js';

// Nuke-style facility. The main level sits at 2.4m so the B site can be a real lower
// floor (0m) reached by ramp room, the CT decon ramp and a vent from A.
// A is a tall roofed hall with a heaven catwalk. Outside yard has the silos.
const L = 2.4;
const YELLOW = 0xd6a21e, BLUE = 0x2e5f99, GREY = 0x8a9096, RED = 0xa83a2a;

export default function nuke() {
  const m = makeMap({
    id: 'nuke', name: 'Nuke', w: 128, h: 112,
    theme: {
      ground: 'concrete', walls: ['concrete', 'metal', 'panel', 'metal', 'brick'],
      sky: ['#6f9fd0', '#b4d0e8', '#e2e6e6'], fog: 0xcdd6dc, fogNear: 50, fogFar: 160,
      sun: 0xffffff, sunPos: [40, 100, 60], hemi: [0xf0f4ff, 0x6a6a70], hemiI: 1.8, sunI: 1.4, wallH: 10, windows: false,
    },
  });
  const container = (x0, z0, x1, z1, color, stack = 1) => m.raise(x0, z0, x1, z1, 2.6 * stack, MAT.CONTAINER, color);
  const silo = (cx, cz, r) => {
    m.each(cx - r - 1, cz - r - 1, cx + r + 1, cz + r + 1, (i, x, z) => { if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= r * r) { m.solid[i] = 1; m.wallMat[i] = 3; m.wallH[i] = 3; } });
    m.prop('silo', cx, cz, { r: r + 0.75, h: 16, y: L });
  };

  // ---------- T spawn + outside ----------
  m.floor(100, 64, 122, 104, L, MAT.ASPHALT);
  container(104, 68, 109, 70, RED).crates(116, 98, 117, 99, 1).barrel(121, 66).barrel(121, 67);
  m.floor(26, 84, 99, 106, L, MAT.ASPHALT);                        // outside yard
  silo(52, 95, 4); silo(68, 97, 4);
  container(34, 86, 39, 88, BLUE);
  container(82, 100, 87, 102, GREY, 2);
  m.crates(78, 88, 79, 89, 1).crates(90, 92, 91, 93, 1).barrel(97, 86).barrel(98, 86);
  m.floor(10, 71, 25, 100, L, MAT.ASPHALT);                        // garage lane to CT
  container(14, 80, 16, 86, YELLOW);

  // ---------- Lobby, hut, squeaky, main ----------
  m.floor(80, 62, 99, 80, L, MAT.TILES).roofed(80, 62, 99, 80, 6.2);
  m.floor(92, 81, 99, 83, L, MAT.TILES).roofed(92, 81, 99, 83, 6.2);   // lobby -> outside door
  m.crates(82, 64, 83, 65, 1).barrel(98, 78).barrel(98, 79);
  m.floor(76, 52, 82, 61, L, MAT.CONCRETE).roofed(76, 52, 82, 61, 5.4);  // hut
  m.floor(86, 52, 90, 61, L, MAT.METAL).roofed(86, 52, 90, 61, 5.4);    // squeaky
  m.prop('doors', 88, 56.5, { axis: 'z', span: 5, y: L, color: 0x6a7078 });
  m.floor(44, 52, 50, 83, L, MAT.CONCRETE).roofed(44, 52, 50, 83, 5.8);  // A main
  for (const z of [58, 68, 78]) m.prop('lamp', 47, z, { y: L + 3.2 });
  for (const x of [84, 94]) m.prop('lamp', x, 71, { y: 5.9 });

  // ---------- A site hall (roof 9m) with heaven ----------
  m.floor(40, 28, 94, 51, L, MAT.CONCRETE).roofed(40, 28, 94, 51, 9.5);
  m.floor(40, 28, 58, 32, L + 2.8, MAT.METAL);                     // heaven
  m.stairs(59, 28, 66, 32, 'w', L, L + 2.8, MAT.METAL);
  m.block(40, 33, 58, 33, L + 2.8 + 1.0, MAT.LOWWALL);             // heaven railing
  m.floor(40, 33, 40, 33, L + 2.8, MAT.METAL);                     // gap in railing at the corner
  container(62, 38, 65, 42, YELLOW).crates(74, 46, 75, 47, 1).crates(76, 46, 76, 46, 2);
  container(84, 34, 87, 36, BLUE);
  m.barrel(92, 30).barrel(93, 30).barrel(41, 50);
  for (const x of [50, 66, 82]) m.prop('lamp', x, 40, { y: 9.2, hang: true });

  // ---------- CT spawn ----------
  m.floor(6, 6, 30, 70, L);
  m.floor(31, 34, 39, 40, L, MAT.CONCRETE).roofed(31, 34, 39, 40, 5.4);  // CT -> A door
  container(10, 40, 12, 46, GREY).crates(24, 60, 25, 61, 1).barrel(7, 68).barrel(8, 68);
  m.prop('tree', 18, 26).prop('tree', 12, 56);

  // ---------- B site (lower level, 0m) ----------
  m.floor(40, 4, 104, 21, 0, MAT.CONCRETE).roofed(40, 4, 104, 21, 5.2);
  m.stairs(31, 8, 39, 19, 'w', 0, L).roofed(31, 8, 39, 19, 5.2);          // decon ramp from CT
  m.stairs(95, 22, 104, 61, 's', 0, L).roofed(95, 22, 104, 61, 5.4);      // ramp room from lobby
  m.stairs(60, 22, 61, 27, 's', 0, L).roofed(60, 22, 61, 27, 4.6);        // vent A <-> B
  container(56, 8, 59, 11, RED).crates(72, 14, 73, 15, 1).crates(74, 14, 74, 14, 2);
  container(84, 6, 88, 8, BLUE).crates(48, 16, 49, 17, 1);
  m.block(66, 18, 70, 18, 1.1, MAT.LOWWALL);
  m.barrel(102, 5).barrel(103, 5).barrel(41, 5);
  for (const x of [50, 64, 78, 92]) m.prop('lamp', x, 12.5, { y: 5.0, hang: true });
  for (const z of [30, 42, 54]) m.prop('lamp', 99.5, z, { y: 5.2, hang: true });

  m.prop('sign', 79.01, 57, { text: 'A', arrow: 'n', y: L + 2, face: 'e' });
  m.prop('sign', 94.99, 40, { text: 'B', arrow: 'n', y: L + 2, face: 'w' });

  // ---------- Zones & callouts ----------
  m.zone('T', 102, 66, 120, 102).zone('CT', 8, 24, 28, 66).zone('A', 42, 34, 92, 50).zone('B', 42, 6, 92, 20);
  m.callout('Heaven', 40, 28, 66, 33, 'A').callout('A Site', 40, 28, 94, 51, 'A').callout('Hut', 76, 52, 82, 61, 'A')
    .callout('Squeaky', 86, 52, 90, 61, 'A').callout('A Main', 44, 52, 50, 83, 'A').callout('Lobby', 80, 62, 99, 83)
    .callout('Ramp Room', 95, 22, 104, 61, 'B').callout('Vent', 60, 22, 61, 27).callout('Decon', 31, 8, 39, 19, 'B')
    .callout('B Site', 40, 4, 104, 21, 'B').callout('CT Spawn', 6, 6, 39, 70).callout('Garage', 10, 71, 25, 100)
    .callout('Silos', 44, 88, 76, 104).callout('Outside', 26, 84, 99, 106).callout('T Spawn', 100, 64, 122, 104);

  m.tactics = {
    ctHolds: [
      { site: 'A', pos: P(52, 42), watch: P(79, 52) },
      { site: 'A', pos: P(72, 34), watch: P(88, 52) },
      { site: 'A', pos: P(46, 30), watch: P(47, 52) },
      { site: 'B', pos: P(50, 10), watch: P(99, 24) },
      { site: 'B', pos: P(80, 8), watch: P(99, 30) },
      { site: 'MID', pos: P(22, 92), watch: P(60, 90) },
      { site: 'B', pos: P(66, 12), watch: P(99, 22) },
    ],
    tRoutes: { A: [P(79, 66), P(47, 72)], B: [P(99, 50), P(99, 36)] },
    plantSpots: { A: [P(60, 46), P(74, 42), P(54, 44)], B: [P(62, 14), P(78, 12), P(86, 16)] },
    entrances: { A: [P(79, 51), P(88, 51), P(47, 51), P(40, 37)], B: [P(99, 22), P(40, 14), P(60, 21)] },
    smokes: { A: [P(42, 37), P(58, 36)], B: [P(42, 14), P(92, 10)] },
  };
  return m;
}
