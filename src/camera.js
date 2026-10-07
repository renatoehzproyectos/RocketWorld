import { UU_TO_M } from './coords.js';
// Cámara chase suavizada + modo aéreo (C). Trabaja en espacio three (m).
export function createCamera(camera) {
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), fwd = new THREE.Vector3(1, 0, 0);
  let heading = new THREE.Vector3(1, 0, 0), mode = 0, ready = false, fov = 80;
  const tgt = new THREE.Vector3(), want = new THREE.Vector3();
  return {
    toggle() { mode = (mode + 1) % 2; },
    get mode() { return mode; },
    update(dt, carPos, carQuat, velThree, speedMS, onGround, colliders) {
      fwd.set(1, 0, 0).applyQuaternion(carQuat);
      // rumbo: en el suelo sigue el frente del coche; en el aire, la dirección de movimiento si es significativa
      const dir = new THREE.Vector3(fwd.x, 0, fwd.z);
      if (!onGround && Math.hypot(velThree.x, velThree.z) > 6) dir.set(velThree.x, 0, velThree.z);
      if (dir.lengthSq() < 1e-4) dir.copy(heading);
      dir.normalize();
      if (!ready) heading.copy(dir);
      const k = 1 - Math.exp(-dt * (onGround ? 5 : 2.5)); heading.lerp(dir, k).normalize();
      const dist = mode === 0 ? 7.5 : 16, h = mode === 0 ? 2.8 : 11;
      want.copy(carPos).addScaledVector(heading, -dist); want.y = carPos.y + h;
      tgt.copy(carPos).addScaledVector(heading, mode === 0 ? 5 : 2); tgt.y = carPos.y + 1.0;
      if (!ready) { pos.copy(want); look.copy(tgt); ready = true; }
      const kp = 1 - Math.exp(-dt * 8); pos.lerp(want, kp); look.lerp(tgt, 1 - Math.exp(-dt * 12));
      // cámara nunca bajo el suelo ni dentro de un edificio
      pos.y = Math.max(pos.y, 1.0);
      if (colliders) { const b = colliders(pos.x * 50, -pos.z * 50, pos.y * 50); if (b) pos.y = b + 1.5; }
      camera.position.copy(pos); camera.lookAt(look);
      const f = 78 + Math.min(speedMS / 46, 1) * 18; fov += (f - fov) * Math.min(1, dt * 4);
      if (Math.abs(camera.fov - fov) > .05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    },
  };
}
