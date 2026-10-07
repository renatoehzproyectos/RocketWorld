import RocketSimModule from '../dist/rocketsim.js';
import { UU_TO_M, TICK_TIME, rsToThree, rotToQuat } from './coords.js';
import { createInput } from './input.js';
import { createVehicle } from './vehicle.js';
import { createCollision } from './collision.js';
import { createTiles } from './tiles.js';
import { createTerrain } from './terrain.js';
import { createCamera } from './camera.js';

const $ = id => document.getElementById(id), status = t => $('status').textContent = t;
const rot9 = r => { const a = new Array(9); for (let i = 0; i < 9; i++) a[i] = r.get(i); return a; };
const coarse = matchMedia('(pointer:coarse)').matches;
const RECENTER = 2600;           // uu: al pasar de aquí se devuelve el coche al centro de la arena (origen flotante)

async function boot() {
  status('Cargando RocketSim…');
  const RS = await RocketSimModule(); RS.init(); RS.createArena();
  const carId = RS.addCar(0);
  const spawn = () => RS.setCarPose(carId, 0, 0, 40, Math.PI / 2, 0, 0, 0);
  spawn(); const hb = RS.getOctaneHitboxSize();

  const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true });
  const maxPr = coarse ? 1 : Math.min(devicePixelRatio, 1.5); let pr = maxPr;
  const camera = new THREE.PerspectiveCamera(80, 1, 0.3, 1400);
  const resize = () => { renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  renderer.outputEncoding = THREE.sRGBEncoding; addEventListener('resize', resize); resize();

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfe6f2); scene.fog = new THREE.Fog(0xcfe6f2, 140, 620);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb59b7a, 0.75));
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.95); sun.position.set(-60, 90, -40); scene.add(sun);

  status('Iniciando streaming de tiles…');
  const collision = createCollision(), tiles = createTiles(scene, collision, { radius: coarse ? 7 : 8, budget: coarse ? 2 : 4 }), terrain = createTerrain(scene);
  const vehicle = createVehicle(scene, hb), camCtl = createCamera(camera), input = createInput();
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.7, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

  // Origen flotante: abs(three, m) = local + origin. RocketSim siempre trabaja cerca del centro de la arena.
  let ox = 0, oz = 0;
  const carPrev = new THREE.Vector3(), carCurr = new THREE.Vector3(), carPos = new THREE.Vector3(), qPrev = new THREE.Quaternion(), qCurr = new THREE.Quaternion(), vel3 = new THREE.Vector3();
  let st;
  const readCurr = () => { st = RS.getCarState(carId); rsToThree(st.pos.x, st.pos.y, st.pos.z, carCurr); };
  const readQ = () => { qPrev.copy(qCurr); rotToQuat(rot9(st.rot), qCurr); if (qPrev.dot(qCurr) < 0) qCurr.set(-qCurr.x, -qCurr.y, -qCurr.z, -qCurr.w); };
  const topAt = (x, z) => collision.topAt((x + ox) * 50, -(z + oz) * 50);
  readCurr(); readQ(); carPrev.copy(carCurr); qPrev.copy(qCurr);
  tiles.prime(carCurr.x + ox, carCurr.z + oz, ox, oz);     // mundo inicial completo antes del primer frame

  let acc = 0, last = performance.now(), hudT = 0, perfT = 0, ema = 16, clock = 0;
  const hud = $('hud');
  $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 600);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1); last = now; ema += (dt * 1000 - ema) * 0.05; acc += dt; clock += dt;
    if (input.takeCamToggle()) camCtl.toggle();
    if (input.takeReset()) { spawn(); readCurr(); readQ(); carPrev.copy(carCurr); qPrev.copy(qCurr); }
    const ctl = input.poll();
    RS.setCarControls(carId, ctl.throttle, ctl.steer, ctl.pitch, ctl.yaw, ctl.roll, ctl.jump, ctl.boost, ctl.handbrake);

    let ticks = 0;
    while (acc >= TICK_TIME && ticks < 8) { RS.step(1); acc -= TICK_TIME; ticks++; }
    if (acc > TICK_TIME * 8) acc = 0;
    if (ticks > 0) {
      const s = RS.getCarState(carId); let p = { x: s.pos.x, y: s.pos.y, z: s.pos.z }, v = { x: s.vel.x, y: s.vel.y, z: s.vel.z }, dirty = false;
      if (ctl.boost) {            // boost infinito (mismo empuje que el baseline)
        const d = ticks * TICK_TIME, r = rot9(s.rot);
        v.x += r[0] * 991.667 * d; v.y += r[1] * 991.667 * d; v.z += r[2] * 991.667 * d;
        const sp = Math.hypot(v.x, v.y, v.z); if (sp > 2300) { const k = 2300 / sp; v.x *= k; v.y *= k; v.z *= k; } dirty = true;
      }
      const OX = ox * 50, OY = -oz * 50;      // origen en uu abs (RocketSim)
      const hit = collision.resolve({ x: p.x + OX, y: p.y + OY, z: p.z }, v, 70, hb.z * 0.5);
      if (hit) { p = { x: hit.x - OX, y: hit.y - OY, z: hit.z }; v = { x: hit.vx, y: hit.vy, z: hit.vz }; dirty = true; }
      // Recentrado: la arena de RocketSim es finita; mantenemos al coche en su zona plana y movemos el origen del mundo.
      const sx = Math.abs(p.x) > RECENTER ? p.x : 0, sy = Math.abs(p.y) > RECENTER ? p.y : 0;
      if (sx || sy) {
        p.x -= sx; p.y -= sy; ox += sx * UU_TO_M; oz -= sy * UU_TO_M; dirty = true;
        const dx = -sx * UU_TO_M, dz = sy * UU_TO_M; carPrev.x += dx; carPrev.z += dz; camCtl.shift(dx, dz);
      }
      if (dirty) RS.setCarState(carId, p.x, p.y, p.z, v.x, v.y, v.z);
      const prevKeep = carCurr.clone(); if (sx || sy) { prevKeep.x += -sx * UU_TO_M; prevKeep.z += sy * UU_TO_M; }
      carPrev.copy(prevKeep); readCurr(); readQ();
    }
    const alpha = Math.min(Math.max(acc / TICK_TIME, 0), 1);
    carPos.lerpVectors(carPrev, carCurr, alpha);
    const q = vehicle.group.quaternion.copy(qPrev).slerp(qCurr, alpha); vehicle.group.position.copy(carPos);
    const speedUU = Math.hypot(st.vel.x, st.vel.y, st.vel.z); vehicle.update(dt, ctl.boost);
    const hgt = Math.max(carPos.y, 0.3); shadow.position.set(carPos.x, 0.05, carPos.z); shadow.scale.setScalar(Math.max(.4, 1.3 - hgt / 25)); shadow.material.opacity = Math.max(.08, .38 - hgt / 40);

    rsToThree(st.vel.x, st.vel.y, st.vel.z, vel3); vel3.multiplyScalar(50);
    camCtl.update(dt, carPos, q, vel3, speedUU * UU_TO_M, st.isOnGround, topAt);
    camera.updateMatrixWorld();
    tiles.update(carPos.x + ox, carPos.z + oz, ox, oz); terrain.update(camera, ox, oz, clock);

    perfT += dt; if (perfT > 2) { perfT = 0;
      if (ema > 24 && pr > 0.6) { pr = Math.max(0.6, pr - 0.1); resize(); } else if (ema < 14 && pr < maxPr) { pr = Math.min(pr + 0.1, maxPr); resize(); } }
    renderer.render(scene, camera);
    hudT += dt; if (hudT > 0.15) { hudT = 0; const s = tiles.stats();
      hud.textContent = `${Math.round(speedUU * 0.036)} km/h · ${st.isOnGround ? 'suelo' : 'aire'} · ${(Math.hypot(carPos.x + ox, carPos.z + oz) / 1000).toFixed(2)} km del origen\n${(1000 / ema).toFixed(0)} fps · res ${pr.toFixed(1)}\ntiles ${s.tiles} (+${s.pending}) · casas ${s.houses} · palmeras ${s.palms} · calls ${renderer.info.render.calls}`; }
  }
  requestAnimationFrame(frame);
  window.RW = { RS, scene, camera, renderer, tiles, collision };
}
boot().catch(e => { console.error(e); status('Error: ' + e.message); });
