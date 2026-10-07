import { InstancedPool, mergeColored } from './pools.js';
import { genTile, T } from './procgen.js';
// TileManager: streaming por anillos alrededor del coche, LOD por distancia (aprox. de screen-space error),
// presupuesto de construcción por frame y descarga con histéresis. Coordenadas ABSOLUTAS en metros (double);
// la escena se mueve con root.position = -origin (origen flotante).
export function createTiles(scene, collision, { radius = 8, budget = 3 } = {}) {
  const LOD0 = 2, root = new THREE.Group(); scene.add(root);
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
  const trunk = new THREE.CylinderGeometry(.18, .28, 7, 5); trunk.translate(0, 3.5, 0);
  const crown = new THREE.ConeGeometry(2.6, 1.6, 6); crown.translate(0, 7.4, 0);
  const palmGeo = mergeColored([[trunk, 0x7a5a3a], [crown, 0x3d8a3d]]);
  const bodies = new InstancedPool(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), 4500, true);
  const roofs = new InstancedPool(box, new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }), 900);
  const doors = new InstancedPool(box, new THREE.MeshLambertMaterial({ color: 0x2b6fb3 }), 900);
  const palms = new InstancedPool(palmGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), 1500);
  const pools = [bodies, roofs, doors, palms]; pools.forEach(p => root.add(p.mesh));
  const tiles = new Map(), queue = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  let lastKey = '', pending = 0;
  const release = t => { t.b.forEach(i => bodies.release(i)); t.r.forEach(i => roofs.release(i)); t.d.forEach(i => doors.release(i)); t.p.forEach(i => palms.release(i)); collision.removeTile(t.key); };
  function build(i, j, lod) {
    const key = i + ',' + j, old = tiles.get(key); if (old) release(old);
    const g = genTile(i, j), t = { key, i, j, lod, b: [], r: [], d: [], p: [] }, boxes = [];
    for (const h of g.houses) {
      const s = bodies.alloc(); if (s < 0) break;
      bodies.set(s, m.compose(pos.set(h.x, 0, h.z), q.identity(), sc.set(h.w, h.h, h.d)), col.setHex(h.c)); t.b.push(s);
      if (lod === 0) {
        const r = roofs.alloc(); if (r >= 0) { roofs.set(r, m.compose(pos.set(h.x, h.h, h.z), q.identity(), sc.set(h.w + .5, .5, h.d + .5))); t.r.push(r); }
        const d = doors.alloc(); if (d >= 0) { doors.set(d, m.compose(pos.set(h.x, 0, h.z + h.d / 2 + .02), q.identity(), sc.set(1.6, 2.4, .1))); t.d.push(d); }
        boxes.push({ minX: (h.x - h.w / 2) * 50, maxX: (h.x + h.w / 2) * 50, minY: -(h.z + h.d / 2) * 50, maxY: -(h.z - h.d / 2) * 50, top: h.h * 50 });
      }
    }
    if (lod === 0) {
      for (const p of g.palms) { const s = palms.alloc(); if (s < 0) break; palms.set(s, m.compose(pos.set(p.x, 0, p.z), q.setFromEuler(e.set(0, p.r, 0)), sc.setScalar(p.s))); t.p.push(s); }
      collision.setTile(key, i, j, boxes);
    }
    tiles.set(key, t);
  }
  function update(ax, az, ox, oz, all = false) {
    root.position.set(-ox, 0, -oz);
    const ci = Math.floor(ax / T), cj = Math.floor(az / T), k = ci + ',' + cj;
    if (k !== lastKey || pending > 0) {
      lastKey = k; queue.length = 0;
      for (const [key, t] of tiles) if (Math.max(Math.abs(t.i - ci), Math.abs(t.j - cj)) > radius + 1) { release(t); tiles.delete(key); }
      for (let di = -radius; di <= radius; di++) for (let dj = -radius; dj <= radius; dj++) {
        if (di * di + dj * dj > radius * radius) continue;
        const ch = Math.max(Math.abs(di), Math.abs(dj)), want = ch <= LOD0 ? 0 : 1, t = tiles.get((ci + di) + ',' + (cj + dj));
        if (!t || t.lod !== want) queue.push({ i: ci + di, j: cj + dj, want, ch });
      }
      queue.sort((a, b) => a.ch - b.ch); pending = queue.length;
    }
    const n = all ? queue.length : Math.min(budget, queue.length);
    for (let x = 0; x < n; x++) { const j = queue[x]; build(j.i, j.j, j.want); }
    queue.splice(0, n); pending = queue.length;
    pools.forEach(p => p.flush());
  }
  return {
    update, prime(ax, az, ox, oz) { update(ax, az, ox, oz, true); },
    stats: () => ({ tiles: tiles.size, pending, houses: bodies.used, palms: palms.used }),
  };
}
