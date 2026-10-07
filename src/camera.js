// Cámara chase suavizada + modo aéreo (C). Espacio three local (m). topAt(x,z) -> altura (m) del edificio bajo ese punto.
export function createCamera(camera) {
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), fwd = new THREE.Vector3(), heading = new THREE.Vector3(0, 0, -1);
  const want = new THREE.Vector3(), tgt = new THREE.Vector3(), dir = new THREE.Vector3(), probe = new THREE.Vector3();
  let mode = 0, ready = false, fov = 80;
  return {
    toggle() { mode = (mode + 1) % 2; },
    shift(dx, dz) { pos.x += dx; pos.z += dz; look.x += dx; look.z += dz; },   // recentrado del origen flotante
    update(dt, carPos, carQuat, vel, speedMS, onGround, topAt) {
      fwd.set(1, 0, 0).applyQuaternion(carQuat); dir.set(fwd.x, 0, fwd.z);
      if (!onGround && Math.hypot(vel.x, vel.z) > 6) dir.set(vel.x, 0, vel.z);
      if (dir.lengthSq() < 1e-4) dir.copy(heading); dir.normalize();
      if (!ready) heading.copy(dir);
      heading.lerp(dir, 1 - Math.exp(-dt * (onGround ? 5 : 2.5))).normalize();
      const dist = mode === 0 ? 7.5 : 16, h = mode === 0 ? 2.8 : 11;
      want.copy(carPos).addScaledVector(heading, -dist); want.y = carPos.y + h;
      // Colisión de cámara: acortar el brazo hasta salir del edificio (nunca subir cientos de metros)
      for (const t of [1, .85, .7, .55, .4, .25, .1]) {
        probe.lerpVectors(carPos, want, t);
        if (probe.y > topAt(probe.x, probe.z) + .6) { want.copy(probe); break; }
        if (t === .1) { want.copy(probe); want.y = topAt(probe.x, probe.z) + 1; }
      }
      tgt.copy(carPos).addScaledVector(heading, mode === 0 ? 5 : 2); tgt.y = carPos.y + 1.0;
      if (!ready) { pos.copy(want); look.copy(tgt); ready = true; }
      pos.lerp(want, 1 - Math.exp(-dt * 8)); look.lerp(tgt, 1 - Math.exp(-dt * 12));
      pos.y = Math.max(pos.y, 1.0);
      camera.position.copy(pos); camera.lookAt(look);
      const f = 78 + Math.min(speedMS / 46, 1) * 18; fov += (f - fov) * Math.min(1, dt * 4);
      if (Math.abs(camera.fov - fov) > .05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    },
  };
}
