// Proveedor procedural de tiles (sin THREE): determinista por (i,j). Un proveedor 3D Tiles real
// puede sustituir genTile() manteniendo el mismo contrato {houses, palms}.
export const T = 88, BLOCK = 44, ROAD = 12, COAST = 840;
const WHITES = [0xf6f3ec, 0xffffff, 0xece6da, 0xf2efe8, 0xf0e4d0];
function hash(a, b) { let h = (a * 374761393 + b * 668265263 + 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; }
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function genTile(i, j) {
  const R = rng(hash(i, j)), houses = [], palms = [], inner = BLOCK - ROAD - 3;
  for (let bx = 0; bx < 2; bx++) for (let bz = 0; bz < 2; bz++) {
    const m = 2 * i + bx, n = 2 * j + bz, cx = (m + .5) * BLOCK, cz = (n + .5) * BLOCK;
    if (cx > COAST - 20) continue;                                   // costa: sin edificios
    if (R() < .10) continue;                                         // solar vacío
    const down = 1 + 1.8 * Math.max(0, Math.sin(m * .35) * Math.sin(n * .31));   // zonas altas
    const mine = [], cnt = 2 + Math.floor(R() * 3);
    for (let k = 0; k < cnt + 6 && mine.length < cnt; k++) {
      const w = 8 + R() * 10, d = 8 + R() * 10, h = (4 + R() * 7 + (R() < .15 ? 8 : 0)) * down;
      const x = cx + (R() - .5) * (inner - w), z = cz + (R() - .5) * (inner - d);
      if (mine.some(q => Math.abs(q.x - x) < (q.w + w) / 2 + 1 && Math.abs(q.z - z) < (q.d + d) / 2 + 1)) continue;
      mine.push({ x, z, w, d, h, c: WHITES[(R() * WHITES.length) | 0] });
    }
    houses.push(...mine);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      if (R() < .75) palms.push({ x: cx + sx * (BLOCK / 2 - ROAD / 2 - .8), z: cz + sz * (BLOCK / 2 - ROAD / 2 - .8), s: .8 + R() * .5, r: R() * 6.28 });
  }
  return { houses, palms };
}
