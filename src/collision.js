// Colisión por tile, separada del visual. Cajas AABB en uu ABSOLUTOS (espacio RocketSim). Solo existen
// para tiles LOD0 (cerca del coche); el tile del streaming las añade/quita.
const TU = 88 * 50;
export function createCollision() {
  const tiles = new Map();
  const near = (x, y) => {
    const ci = Math.floor(x / TU), cj = Math.floor(-y / TU), out = [];
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) { const t = tiles.get(i + ',' + j); if (t) out.push(t); }
    return out;
  };
  return {
    setTile(key, i, j, boxes) { tiles.set(key, boxes); },
    removeTile(key) { tiles.delete(key); },
    // Altura (m) del techo si el punto (uu abs) está dentro de la huella de un edificio; 0 si no.
    topAt(x, y) { for (const b of near(x, y)) for (const c of b) if (x > c.minX && x < c.maxX && y > c.minY && y < c.maxY) return c.top / 50; return 0; },
    resolve(p, v, radius, halfH) {
      let out = null, x = p.x, y = p.y, z = p.z, vx = v.x, vy = v.y, vz = v.z;
      for (const list of near(x, y)) for (const b of list) {
        const bottom = z - halfH; if (bottom > b.top) continue;
        const cx = Math.max(b.minX, Math.min(x, b.maxX)), cy = Math.max(b.minY, Math.min(y, b.maxY));
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy; if (d2 >= radius * radius) continue;
        if (bottom > b.top - 40 && vz <= 0 && x > b.minX && x < b.maxX && y > b.minY && y < b.maxY) { z = b.top + halfH; if (vz < 0) vz = 0; out = out || {}; continue; }
        let nx, ny, pen;
        if (d2 > 1e-6) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = radius - d; }
        else { const l = x - b.minX, r = b.maxX - x, t = y - b.minY, u = b.maxY - y, mm = Math.min(l, r, t, u); nx = mm === l ? -1 : mm === r ? 1 : 0; ny = mm === t ? -1 : mm === u ? 1 : 0; pen = mm + radius; }
        x += nx * pen; y += ny * pen;
        const vn = vx * nx + vy * ny;
        if (vn < 0) { vx -= 1.35 * vn * nx; vy -= 1.35 * vn * ny; vx *= .92; vy *= .92; }
        out = out || {}; out.hit = Math.max(out.hit || 0, -vn);
      }
      if (!out) return null; out.x = x; out.y = y; out.z = z; out.vx = vx; out.vy = vy; out.vz = vz; return out;
    },
  };
}
