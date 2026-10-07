// Pool de instancias con lista libre: un draw call por tipo, sin importar cuántos tiles haya.
export class InstancedPool {
  constructor(geo, mat, cap, color = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap); this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.cap = cap; this.free = []; this.high = 0; this.dirty = false;
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    if (color && this.mesh.setColorAt) this.mesh.setColorAt(0, new THREE.Color());
  }
  alloc() { const i = this.free.length ? this.free.pop() : this.high++; if (i >= this.cap) { this.high = this.cap; return -1; } this.mesh.count = this.high; return i; }
  set(i, m, c) { this.mesh.setMatrixAt(i, m); if (c && this.mesh.instanceColor) this.mesh.setColorAt(i, c); this.dirty = true; }
  release(i) { this.mesh.setMatrixAt(i, this.zero); this.free.push(i); this.dirty = true; }
  get used() { return this.high - this.free.length; }
  flush() { if (!this.dirty) return; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; this.dirty = false; }
}
// Fusiona geometrías (con color por vértice) en una sola → 1 draw call por palmera completa.
export function mergeColored(parts) {
  const P = [], N = [], C = [];
  for (const [g, hex] of parts) {
    const ng = g.index ? g.toNonIndexed() : g, c = new THREE.Color(hex);
    P.push(...ng.attributes.position.array); N.push(...ng.attributes.normal.array);
    for (let k = 0; k < ng.attributes.position.count; k++) C.push(c.r, c.g, c.b);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return out;
}
