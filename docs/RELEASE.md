# CHUNK 20 — Release

## Build
```bash
cd /tmp/rocketworld
npm install
npm run release   # or: npm run build
npm run preview   # local production server
```

## Dist layout (~28 MB with Cesium)
- `index.html` — loader + error screens
- `assets/` — game JS + textures + fennec.glb
- `wasm/` — rocketsim.js + rocketsim.wasm
- `cesium/` — optional globe layer (toggle C)
- `collision/` — manifest

## Deploy
Upload `dist/` to any static host (Netlify, Cloudflare Pages, S3, nginx).
WASM requires correct MIME `application/wasm` (most hosts set this automatically).

## Controls
Desktop: WASD · Space · Shift · F3 · C
Mobile: virtual stick + JUMP / BOOST / BRAKE
