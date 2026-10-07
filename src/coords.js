// RocketSim (Z-up, uu) -> three.js (Y-up, m). Idéntico al baseline probado.
export const UU_TO_M = 1 / 50;
export const TICK_RATE = 120, TICK_TIME = 1 / TICK_RATE;
export function rsToThree(x, y, z, out) { out.x = x * UU_TO_M; out.y = z * UU_TO_M; out.z = -y * UU_TO_M; return out; }
const m = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
// rot9 = [forward, right, up] en espacio RocketSim
export function rotToQuat(r, q) {
  X.set(r[0], r[2], -r[1]); Y.set(r[3], r[5], -r[4]); Z.set(r[6], r[8], -r[7]);
  m.makeBasis(X, Y, Z); return q.setFromRotationMatrix(m);
}
