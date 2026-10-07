# RocketWorld (v0.1 — milestone jugable)

Sin build ni Node: archivos estáticos + ES modules.

    python3 -m http.server 8000     # dentro de esta carpeta
    # abrir http://localhost:8000 en Chrome (necesita internet para three.js r128 por CDN)

## Controles
WASD/flechas conducir · Espacio salto (doble = flip) · Shift boost infinito · Ctrl/X derrape ·
Q/E air-roll · C cámara chase/aérea · R reiniciar. En móvil: joystick + botones.

## Arquitectura
- `dist/` — RocketSim WASM + adaptador (del baseline probado, sin cambios).
- `src/coords.js` — conversión RS→three (X, Z→Y, -Y→Z; 1 uu = 1/50 m).
- `src/main.js` — arranque en orden probado, loop fijo a 120 Hz con interpolación.
- `src/world.js` — ciudad procedural: chunks con InstancedMesh, culling manual por frustum y LOD por distancia.
- `src/collision.js` — colisión de edificios separada del mesh visual (AABB + spatial hash).
- `src/camera.js`, `src/input.js`, `src/vehicle.js`.

## Estado frente a los chunks del MASTER
01 bootstrap ✅ · 03 vehículo ✅ · 04/05 RocketSim ✅ (baseline) · 08 controles ✅ · 09 colisión ✅ (JS) ·
10 manzana ✅ · 12 LOD/culling ✅ · 14 vegetación ✅ · 15 cámara ✅ · 18 móvil ✅ (básico) · 19 profiling ✅ (HUD + resolución dinámica)
Pendientes: 02 Cesium, 06/07 physics worker, 11/13 tiles y streaming reales, 16 pulido, 17 compresión, 20 release.

## Limitaciones conocidas
- El WASM solo expone la arena de fútbol de RocketSim (no acepta mallas propias). El área jugable
  es ese rectángulo (~164×205 m, techo ~41 m) con paredes invisibles; fuera se ve el paisaje lejano.
- Los edificios se resuelven en JS vía `setCarState` (empujan y rebotan); los techos se pueden pisar.
- El render no se pudo probar en un navegador dentro del sandbox; la física y la colisión sí se probaron headless.
