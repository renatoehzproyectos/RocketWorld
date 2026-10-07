/**
 * ROCKETWORLD — main loop
 *
 * Why this project exists:
 *   Playable aerial rocket-car over a Mediterranean coastal city
 *   (reference composition: silver car, boost flames, white houses, palms, sea).
 *
 * Architecture (MASTER + CHUNK 00):
 *   RocketSim WASM  → physics authority
 *   Three.js        → vehicle / gameplay renderer (proven)
 *   Cesium          → large-world / tiles layer (added next, does not replace vehicle)
 */

import { UU_TO_M } from './core/coords';
import { PhysicsBridge } from './physics/PhysicsBridge';
import { PhysicsWorkerClient } from './physics/PhysicsWorkerClient';
import {
  buildArenaVisuals,
  getCollisionManifest,
} from './physics/CollisionWorld';
import { VehicleRenderer } from './vehicle/VehicleRenderer';
import { BoostFx } from './vehicle/BoostFx';
import { ImpactFx } from './vehicle/ImpactFx';
import { InputManager } from './input/InputManager';
import { CameraManager } from './camera/CameraManager';
import { CesiumWorld } from './world/CesiumWorld';
import { buildPalms } from './world/Vegetation';
import { TileGrid } from './world/TileGrid';
import {
  addSkyDome,
  addSea,
  CarShadow,
} from './world/VisualPolish';
import { DebugHud } from './performance/DebugHud';
import { QualityScaler } from './performance/QualityScaler';

declare const THREE: any;

const TICK_RATE = 120;
const TICK_TIME = 1 / TICK_RATE;

async function main() {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas #c not found');

  const statusEl = document.getElementById('status');
  const loaderEl = document.getElementById('loader');
  const loaderMsg = document.getElementById('loaderMsg');
  const errorEl = document.getElementById('error');
  const setStatus = (msg: string) => {
    if (statusEl) statusEl.textContent = msg;
    if (loaderMsg) loaderMsg.textContent = msg;
    console.log('[RocketWorld]', msg);
  };
  const hideLoader = () => {
    if (loaderEl) loaderEl.classList.add('hide');
  };
  const showError = (msg: string) => {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.add('show');
    }
    if (loaderEl) loaderEl.classList.add('hide');
  };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'low-power',
    alpha: false,
    stencil: false,
    depth: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1);
  if ('outputEncoding' in renderer) {
    renderer.outputEncoding = THREE.sRGBEncoding ?? 3001;
  }

  const isMobile =
    'ontouchstart' in window ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  const quality = new QualityScaler(!!isMobile);
  quality.apply(renderer);

  const scene = new THREE.Scene();
  // CHUNK 16 — coastal sky, haze, sea (reference image)
  addSkyDome(scene);
  scene.fog = new THREE.FogExp2(0x9ecce8, 0.0038);
  addSea(scene);

  scene.add(new THREE.HemisphereLight(0xfff8f0, 0xc4a574, 0.8));
  const dirLight = new THREE.DirectionalLight(0xfff2dd, 1.0);
  dirLight.position.set(50, 70, 25);
  scene.add(dirLight);
  const fill = new THREE.DirectionalLight(0xa8d4f0, 0.28);
  fill.position.set(-30, 20, -40);
  scene.add(fill);

  const camMgr = new CameraManager(
    window.innerWidth / window.innerHeight,
    'aerial'
  );

  buildArenaVisuals(scene);
  const tileGrid = new TileGrid(scene, {
    tileSize: 24,
    radius: 2,
    lookAheadMeters: 48,
  });
  // Seed tiles around origin
  tileGrid.update(0, 0, 0, 1);
  buildPalms(scene, 100); // CHUNK 14 instanced
  console.log('[RocketWorld] Collision manifest:', getCollisionManifest());

  window.addEventListener('resize', () => {
    camMgr.onResize(window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  setStatus('Loading RocketSim WASM (worker preferred)…');
  const physics = new PhysicsWorkerClient();
  const { mode: physicsMode } = await physics.init();
  setStatus(`Physics: ${physicsMode}`);

  const hb = physics.hitbox;
  const vehicle = new VehicleRenderer(scene, hb);
  await vehicle.loadGlb('/assets/fennec.glb');

  // Proven visual FX from rocketprismas (boost trail + landing sparks)
  const boostFx = new BoostFx(vehicle.root, hb, scene);
  const impactFx = new ImpactFx(scene);
  const carShadow = new CarShadow(scene);

  const bridge = new PhysicsBridge();
  const input = new InputManager();
  const debugHud = new DebugHud();
  // Seed bridge with one step
  const seed = await physics.step(1);
  bridge.pushPacked(seed);

  // CHUNK 02 — Cesium world layer (toggle with C; does not replace vehicle path)
  let cesium: CesiumWorld | null = null;
  const cesiumEl = document.getElementById('cesiumContainer');
  try {
    if (cesiumEl && typeof (window as any).Cesium !== 'undefined') {
      cesium = new CesiumWorld({ container: cesiumEl, active: false });
      console.log('[RocketWorld] Cesium world layer ready (press C to toggle)');
    }
  } catch (e) {
    console.warn('[RocketWorld] Cesium init skipped:', e);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && !e.repeat && cesium && cesiumEl) {
      const next = !cesium.active;
      cesium.setActive(next);
      cesiumEl.style.display = next ? 'block' : 'none';
      // When viewing globe, hide gameplay canvas dimming optional
      canvas.style.opacity = next ? '0' : '1';
      canvas.style.pointerEvents = next ? 'none' : 'auto';
      if (next) cesium.requestRender();
      setStatus(next ? 'Cesium globe (world layer)' : 'RocketSim + Three.js gameplay');
    }
  });

  let accumulator = 0;
  let last = performance.now();
  let frames = 0;
  let stepping = false;
  let lastSteps = 0;
  let fpsTime = last;
  let fps = 0;

  function frame(now: number) {
    debugHud.beginFrame(now);
    const frameDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    accumulator += frameDt;

    frames++;
    if (now - fpsTime >= 1000) {
      fps = frames;
      frames = 0;
      fpsTime = now;
      quality.onFps(fps, renderer);
    }

    const c = input.poll();
    physics.setControls(
      c.throttle,
      c.steer,
      c.pitch,
      c.yaw,
      c.roll,
      c.jump,
      c.boost,
      c.handbrake
    );

    let steps = 0;
    while (accumulator >= TICK_TIME && steps < 8) {
      accumulator -= TICK_TIME;
      steps++;
    }
    // Batch steps async — render uses last bridge sample (1-frame lag OK)
    if (steps > 0 && !stepping) {
      stepping = true;
      physics
        .step(steps)
        .then((st) => {
          bridge.pushPacked(st);
          lastSteps = steps;
        })
        .catch((e) => console.warn('[physics]', e))
        .finally(() => {
          stepping = false;
        });
    }

    const alpha = Math.min(1, accumulator / TICK_TIME);
    const pose = bridge.sample(alpha);
    vehicle.setTransform(pose.position, pose.quaternion);

    // CHUNK 11–13: stream tiles by car position + look-ahead
    const fwd = bridge.forwardXY;
    // RocketSim forward XY → Three (X, Z roughly): coords map X→X, Y→Z
    tileGrid.update(pose.position.x, pose.position.z, fwd.x, fwd.y, now);

    // Visual FX (physics-driven flags only — never feed particles back into RocketSim)
    boostFx.update(c.boost && bridge.boost > 0.5, frameDt);
    impactFx.update(bridge.isOnGround, bridge.carPosUU, bridge.velUU, frameDt);
    carShadow.update(pose.position, bridge.isOnGround);

    camMgr.update(
      bridge.carPosUU,
      bridge.forwardXY,
      bridge.upZ,
      bridge.isOnGround,
      c.boost,
      frameDt
    );

    const speed = bridge.speedUU * UU_TO_M;
    if (statusEl) {
      statusEl.textContent = `FPS ${fps} | ${speed.toFixed(1)} m/s | boost ${bridge.boost.toFixed(0)} | tiles ${tileGrid.stats.active} | ${physicsMode}`;
    }

    debugHud.tick(now);
    debugHud.update({
      speedMs: speed,
      boost: bridge.boost,
      grounded: bridge.isOnGround,
      pos: bridge.carPosUU,
      physicsSteps: lastSteps,
      physicsMode,
      tilesActive: tileGrid.stats.active,
      tilesBuilt: tileGrid.stats.built,
      tilesDisposed: tileGrid.stats.disposed,
      pixelRatio: quality.pixelRatio,
      tileRadius: quality.tileRadius,
    });

    renderer.render(scene, camMgr.camera);
    requestAnimationFrame(frame);
  }

  setStatus(`RocketWorld [${physicsMode}] · WASD · Shift · F3 · C`);
  hideLoader();
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  const errorEl = document.getElementById('error');
  if (errorEl) {
    errorEl.textContent = 'Failed to start: ' + String(err?.message || err);
    errorEl.classList.add('show');
  }
  const loaderEl = document.getElementById('loader');
  if (loaderEl) loaderEl.classList.add('hide');
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = String(err);
});
