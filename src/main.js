import RocketSimModule from '../dist/rocketsim.js';
import { UU_TO_M, TICK_TIME, rsToThree, rotToQuat } from './coords.js';
import { createInput } from './input.js';
import { createVehicle } from './vehicle.js';
import { createCollision } from './collision.js';
import { createWorld } from './world.js';
import { createCamera } from './camera.js';

const $ = id => document.getElementById(id), status = t => $('status').textContent = t;
const rot9 = r => { const a = new Array(9); for (let i = 0; i < 9; i++) a[i] = r.get(i); return a; };
const coarse = matchMedia('(pointer:coarse)').matches;

async function boot() {
  // 1) Física primero (orden probado: WASM -> init -> arena -> coche -> mundo)
  status('Cargando RocketSim…');
  const RS = await RocketSimModule();
  RS.init(); RS.createArena();
  const carId = RS.addCar(0);
  const SPAWN = { x: 0, y: 0, z: 40 };
  const spawn = () => { RS.setCarPose(carId, SPAWN.x, SPAWN.y, SPAWN.z, Math.PI / 2, 0, 0, 0); };
  spawn();
  const hb = RS.getOctaneHitboxSize();

  // 2) Renderer (opciones de bajo consumo del baseline)
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true });
  let pr = coarse ? 1 : Math.min(devicePixelRatio, 1.5);
  const resize = () => { renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(80, 1, 0.3, 1400);
  addEventListener('resize', resize); resize();

  // 3) Mundo + colisión + vehículo
  status('Construyendo ciudad…');
  const collision = createCollision();
  const world = createWorld(scene, collision);
  const vehicle = createVehicle(scene, hb);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.7, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
  const camCtl = createCamera(camera);
  const input = createInput();

  // Estado interpolado
  const carPosPrev = new THREE.Vector3(), carPosCurr = new THREE.Vector3(), carPos = new THREE.Vector3();
  const qPrev = new THREE.Quaternion(), qCurr = new THREE.Quaternion(), vel3 = new THREE.Vector3();
  let st = RS.getCarState(carId);
  const read = () => {
    st = RS.getCarState(carId);
    carPosPrev.copy(carPosCurr); rsToThree(st.pos.x, st.pos.y, st.pos.z, carPosCurr);
    qPrev.copy(qCurr); rotToQuat(rot9(st.rot), qCurr); if (qPrev.dot(qCurr) < 0) qCurr.set(-qCurr.x, -qCurr.y, -qCurr.z, -qCurr.w);
  };
  read(); carPosPrev.copy(carPosCurr); qPrev.copy(qCurr);

  let acc = 0, last = performance.now(), hudT = 0, perfT = 0, ema = 16, hitFlash = 0, boostUsed = 0;
  const hud = $('hud');
  const cameraBox = (x, y, z) => { for (const b of collision.boxes) if (x > b.minX && x < b.maxX && y > b.minY && y < b.maxY && z < b.top + 100) return b.top + 100; return 0; };

  $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 600);

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min((now - last) / 1000, 0.1); last = now;
    ema += (dt * 1000 - ema) * 0.05;
    acc += dt;
    if (input.takeCamToggle()) camCtl.toggle();
    if (input.takeReset()) { spawn(); read(); carPosPrev.copy(carPosCurr); qPrev.copy(qCurr); }
    const ctl = input.poll();
    RS.setCarControls(carId, ctl.throttle, ctl.steer, ctl.pitch, ctl.yaw, ctl.roll, ctl.jump, ctl.boost, ctl.handbrake);

    let ticks = 0;
    while (acc >= TICK_TIME && ticks < 8) {
      RS.step(1); acc -= TICK_TIME; ticks++;
    }
    if (acc > TICK_TIME * 8) acc = 0;
    if (ticks > 0) {
      let s = RS.getCarState(carId);
      let { pos: p, vel: v } = s, dirty = false;
      // Boost infinito (mismo empuje que el baseline: 991.667 uu/s², tope 2300 uu/s)
      if (ctl.boost) {
        const d = ticks * TICK_TIME, r = rot9(s.rot);
        let nx = v.x + r[0] * 991.667 * d, ny = v.y + r[1] * 991.667 * d, nz = v.z + r[2] * 991.667 * d;
        const sp = Math.hypot(nx, ny, nz); if (sp > 2300) { const k = 2300 / sp; nx *= k; ny *= k; nz *= k; }
        v = { x: nx, y: ny, z: nz }; dirty = true;
      }
      // Colisión con edificios (capa JS sobre la física)
      const hit = collision.resolve(p, v, 70, hb.z * 0.5);
      if (hit) { p = { x: hit.x, y: hit.y, z: hit.z }; v = { x: hit.vx, y: hit.vy, z: hit.vz }; dirty = true; if (hit.hit) hitFlash = Math.max(hitFlash, hit.hit); }
      if (dirty) RS.setCarState(carId, p.x, p.y, p.z, v.x, v.y, v.z);
      read();
    }
    const alpha = Math.min(Math.max(acc / TICK_TIME, 0), 1);
    carPos.lerpVectors(carPosPrev, carPosCurr, alpha);
    const vehQ = vehicle.group.quaternion.copy(qPrev).slerp(qCurr, alpha);
    vehicle.group.position.copy(carPos);
    const speedUU = Math.hypot(st.vel.x, st.vel.y, st.vel.z);
    vehicle.update(dt, ctl.boost);
    shadow.position.set(carPos.x, 0.05, carPos.z); const hgt = Math.max(carPos.y, 0.3); shadow.scale.setScalar(Math.max(.4, 1.3 - hgt / 25)); shadow.material.opacity = Math.max(.08, .38 - hgt / 40);

    rsToThree(st.vel.x, st.vel.y, st.vel.z, vel3); vel3.multiplyScalar(50); // m/s
    camCtl.update(dt, carPos, vehQ, vel3, speedUU * UU_TO_M, st.isOnGround, cameraBox);
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    world.update(camera, carPos);

    // PerformanceManager: resolución dinámica cada 2 s
    perfT += dt; if (perfT > 2) {
      perfT = 0; const maxPr = coarse ? 1 : Math.min(devicePixelRatio, 1.5);
      if (ema > 24 && pr > 0.6) { pr = Math.max(0.6, pr - 0.1); resize(); }
      else if (ema < 14 && pr < maxPr) { pr = Math.min(pr + 0.1, maxPr); resize(); }
    }
    renderer.render(scene, camera);

    hudT += dt; if (hudT > 0.15) {
      hudT = 0;
      hud.textContent = `${Math.round(speedUU * 0.036)} km/h · ${st.isOnGround ? 'suelo' : 'aire'}\n${(1000 / ema).toFixed(0)} fps · res ${pr.toFixed(1)}\nchunks ${world.stats.visible}/${world.chunkCount} · edificios ${world.houseCount} · calls ${renderer.info.render.calls}`;
    }
  }
  requestAnimationFrame(frame);
  window.RW = { RS, scene, camera, renderer, world, collision };
}
boot().catch(e => { console.error(e); status('Error: ' + e.message); });
