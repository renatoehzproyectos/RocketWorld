# RocketWorld

Playable aerial rocket-car over a Mediterranean coastal city.

- **Physics:** RocketSim WASM (worker + main-thread fallback)
- **Gameplay render:** Three.js r128 + Fennec + boost/impact FX
- **World layer:** Cesium (toggle **C**)
- **City:** tiled streaming blocks + instanced palms
- **Mobile:** virtual stick + buttons

## Deploy to Vercel

### Option A — CLI
```bash
npm i -g vercel
cd rocketworld
vercel
```

### Option B — Git
1. Push this folder to GitHub
2. Import the repo in https://vercel.com/new
3. Framework: **Other** · Build: `npm run build` · Output: `dist`
4. Deploy

`vercel.json` already sets WASM headers and static output.

## Local

```bash
npm install
npm run dev
npm run release
npm run preview
```

## Controls

| Input | Action |
|-------|--------|
| WASD / stick | Drive |
| Space / JUMP | Jump |
| Shift / BOOST | Boost |
| X / BRAKE | Handbrake |
| F3 | Debug HUD |
| C | Cesium globe |

## Why

Reference vision: rocket car boosting over white coastal villas, palms, and the sea — with real RocketSim physics.
