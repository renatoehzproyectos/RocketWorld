// Capa de colisión de ciudad, separada del mesh visual (regla 3 del MASTER).
// RocketSim WASM solo expone la arena de fútbol, así que los edificios se resuelven en JS
// con cajas AABB simples (en uu, espacio RocketSim) y se aplican con setCarState.
const CELL = 512;
export function createCollision() {
  const boxes = [], grid = new Map();
  const key = (i, j) => i * 100003 + j;
  return {
    boxes,
    // minX,maxX,minY,maxY en uu; top = altura del techo en uu
    add(minX, maxX, minY, maxY, top) {
      const b = { minX, maxX, minY, maxY, top }; boxes.push(b);
      for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++)
        for (let j = Math.floor(minY / CELL); j <= Math.floor(maxY / CELL); j++) {
          const k = key(i, j); (grid.get(k) || grid.set(k, []).get(k)).push(b);
        }
    },
    // Devuelve {x,y,z,vx,vy,vz,hit} corregidos o null si no hay contacto.
    resolve(p, v, radius, halfH) {
      const ci = Math.floor(p.x / CELL), cj = Math.floor(p.y / CELL);
      let out = null, x = p.x, y = p.y, z = p.z, vx = v.x, vy = v.y, vz = v.z;
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const list = grid.get(key(i, j)); if (!list) continue;
        for (const b of list) {
          const bottom = z - halfH;
          if (bottom > b.top) continue;                              // por encima del techo
          const cx = Math.max(b.minX, Math.min(x, b.maxX)), cy = Math.max(b.minY, Math.min(y, b.maxY));
          let dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
          if (d2 >= radius * radius) continue;
          // Aterrizaje sobre el techo: si el coche viene casi desde arriba
          if (bottom > b.top - 40 && vz <= 0 && x > b.minX && x < b.maxX && y > b.minY && y < b.maxY) {
            z = b.top + halfH; if (vz < 0) vz = 0; out = out || {}; continue;
          }
          let nx, ny, pen;
          if (d2 > 1e-6) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = radius - d; }
          else {                                                      // centro dentro de la caja: salir por el lado más cercano
            const l = x - b.minX, r = b.maxX - x, t = y - b.minY, u = b.maxY - y, m = Math.min(l, r, t, u);
            nx = m === l ? -1 : m === r ? 1 : 0; ny = m === t ? -1 : m === u ? 1 : 0; pen = m + radius;
          }
          x += nx * pen; y += ny * pen;
          const vn = vx * nx + vy * ny;
          if (vn < 0) { const e = 0.35; vx -= (1 + e) * vn * nx; vy -= (1 + e) * vn * ny; vx *= 0.92; vy *= 0.92; }
          out = out || {}; out.hit = Math.max(out.hit || 0, -vn);
        }
      }
      if (!out) return null;
      out.x = x; out.y = y; out.z = z; out.vx = vx; out.vy = vy; out.vz = vz; return out;
    },
  };
}
