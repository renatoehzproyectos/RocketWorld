# RocketWorld (v0.1 — milestone jugable)

Sin build ni Node: archivos estáticos + ES modules.

    python3 -m http.server 8000     # dentro de esta carpeta
    # abrir http://localhost:8000 en Chrome (necesita internet para three.js r128 por CDN)

## Controles
WASD/flechas conducir · Espacio salto (doble = flip) · Shift boost infinito · Ctrl/X derrape ·
Q/E air-roll · C cámara chase/aérea · R reiniciar. En móvil: joystick + botones.

## Arquitectura (v0.2)
- `dist/` — RocketSim WASM + adaptador (baseline probado). La arena de fútbol ya no se renderiza.
- `src/main.js` — loop 120 Hz + **origen flotante**: el coche se devuelve al centro de la arena al pasar de 2600 uu y el origen del mundo (double) absorbe el desplazamiento → mundo infinito.
- `src/tiles.js` — TileManager propio: streaming por anillos, LOD por distancia, presupuesto de tiles/frame, descarga con histéresis. Instancias en **pools** (4 draw calls para toda la ciudad).
- `src/procgen.js` — proveedor de tiles determinista (contrato `genTile(i,j) → {houses, palms}`; sustituible por un cargador 3D Tiles real).
- `src/terrain.js` — suelo/calles/costa/mar en shader por posición de mundo, cielo y cordillera lejana.
- `src/collision.js` — colisión por tile (solo LOD0), separada del visual.
- `src/camera.js`, `src/input.js`, `src/vehicle.js`.

## Mundo real 3D Tiles (v0.3)
Botón ⚙ → elige fuente (Google Photorealistic 3D Tiles con API key de Google Maps, o Cesium ion con token), pega la clave y pulsa Aplicar.
- `src/tileset.js` — runtime 3D Tiles propio: box/sphere/region, SSE, REPLACE/ADD, tilesets externos, glb/b3dm/cmpt + Draco, cola priorizada, caché LRU, materiales Basic (luz horneada), origen flotante ENU.
- `src/geo.js` — WGS84 / ENU. Sin clave se usa la ciudad procedural.
- Google exige mostrar atribución (se muestra abajo a la derecha) y su logotipo según sus términos.

## Limitaciones
- El techo de RocketSim (~41 m) sigue activo: está dentro del WASM. Quitarlo requiere recompilar RocketSim sin arena.
- Con 3D Tiles reales no hay colisión con edificios (la malla fotogramétrica no es sólida para RocketSim): el coche conduce sobre un plano y el mundo sube/baja bajo él ("seguir el terreno").
- Probado en Node con tilesets sintéticos; no con servidores reales de Google/Cesium ni en navegador.
