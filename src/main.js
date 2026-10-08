import RocketSimModule from '../dist/rocketsim.js';
import { UU_TO_M, TICK_TIME, rsToThree, rotToQuat } from './coords.js';
import { createInput } from './input.js';
import { createVehicle } from './vehicle.js';
import { createCollision } from './collision.js';
import { createTiles } from './tiles.js';
import { createTerrain } from './terrain.js';
import { createCamera } from './camera.js';
import { Tileset3D } from './tileset.js';
import { initSettings } from './settings.js';

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

  // ---- Modo 3D Tiles (API key en Ajustes) o ciudad procedural
  let ts = null, follow = true, groundT = 0, vTarget = 0, cfg = null;
  const attrib = $('attrib');
  const setProc = () => {
    tiles.setEnabled(true); terrain.setGroundVisible(true); camera.near = 0.3; camera.far = 1400; camera.updateProjectionMatrix();
    scene.fog.near = 140; scene.fog.far = 620; attrib.textContent = '';
  };
  const applySettings = async s => {
    if (ts) { ts.dispose(); ts = null; }
    cfg = s;
    if (!s.key || (s.provider === 'ion-custom' && !s.asset)) { setProc(); return; }
    tiles.setEnabled(false); terrain.setGroundVisible(false);
    camera.near = 0.5; camera.far = coarse ? 6000 : 15000; camera.updateProjectionMatrix(); scene.fog.near = coarse ? 1200 : 2500; scene.fog.far = coarse ? 5500 : 12000;
    follow = s.follow; vTarget = 0;
    const t = new Tileset3D(scene, camera, { sse: s.sse, maxTiles: coarse ? 160 : 380, maxReq: coarse ? 4 : 8, maxBytes: coarse ? 240e6 : 700e6, lowMem: coarse, maxTex: s.maxTex });
    try { await t.init(s); ts = t; ui.status('Conectado. Cargando tiles…'); }
    catch (e) { console.error(e); t.dispose(); setProc(); ui.status('Error: ' + e.message + '\nMostrando ciudad procedural.', true); }
  };
  const ui = initSettings(s => applySettings(s), coarse);

  // Origen flotante: abs(three, m) = local + origin. RocketSim siempre trabaja cerca del centro de la arena.
  let ox = 0, oz = 0, AO = 0, oy = 0;   // AO: altura (uu) que el origen vertical absorbe → el coche puede volar por encima del techo de RocketSim (oy en m)
  const carPrev = new THREE.Vector3(), carCurr = new THREE.Vector3(), carPos = new THREE.Vector3(), qPrev = new THREE.Quaternion(), qCurr = new THREE.Quaternion(), vel3 = new THREE.Vector3();
  let st;
  const readCurr = () => { st = RS.getCarState(carId); rsToThree(st.pos.x, st.pos.y, st.pos.z, carCurr); };
  const readQ = () => { qPrev.copy(qCurr); rotToQuat(rot9(st.rot), qCurr); if (qPrev.dot(qCurr) < 0) qCurr.set(-qCurr.x, -qCurr.y, -qCurr.z, -qCurr.w); };
  const topAt = (x, z) => Math.max(0, collision.topAt((x + ox) * 50, -(z + oz) * 50) - oy);
  readCurr(); readQ(); carPrev.copy(carCurr); qPrev.copy(qCurr);
  tiles.prime(carCurr.x + ox, carCurr.z + oz, ox, oz);     // mundo inicial completo antes del primer frame

  if (ui.get().key) applySettings(ui.get());

  let acc = 0, last = performance.now(), hudT = 0, perfT = 0, ema = 16, clock = 0;
  const hud = $('hud');
  let boots = 1, ctxLost = false;
  try { boots = (+sessionStorage.getItem('rw.boots') || 0) + 1; sessionStorage.setItem('rw.boots', boots); } catch (_) {}
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); ctxLost = true; });
  renderer.domElement.addEventListener('webglcontextrestored', () => { ctxLost = false; });
  $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 600);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1); last = now; ema += (dt * 1000 - ema) * 0.05; acc += dt; clock += dt;
    if (input.takeCamToggle()) camCtl.toggle();
    if (input.takeReset()) { AO = 0; oy = 0; spawn(); readCurr(); readQ(); carPrev.copy(carCurr); qPrev.copy(qCurr); }
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
      const hit = collision.resolve({ x: p.x + OX, y: p.y + OY, z: p.z + AO }, v, 70, hb.z * 0.5);
      if (hit) { p = { x: hit.x - OX, y: hit.y - OY, z: hit.z - AO }; v = { x: hit.vx, y: hit.vy, z: hit.vz }; dirty = true; }
      // Recentrado: la arena de RocketSim es finita; mantenemos al coche en su zona plana y movemos el origen del mundo.
      const sx = Math.abs(p.x) > RECENTER ? p.x : 0, sy = Math.abs(p.y) > RECENTER ? p.y : 0;
      if (sx || sy) {
        p.x -= sx; p.y -= sy; ox += sx * UU_TO_M; oz -= sy * UU_TO_M; dirty = true;
        const dx = -sx * UU_TO_M, dz = sy * UU_TO_M; carPrev.x += dx; carPrev.z += dz; camCtl.shift(dx, dz);
        if (ts) ts.shift(sx * UU_TO_M, sy * UU_TO_M);          // RS x = Este, RS y = Norte
      }
      // Techo de RocketSim (2044 uu) esquivado: cerca del techo se baja el coche 1000 uu en la física y se sube el mundo lo mismo; al descender, al revés.
      const sz = p.z > 1800 ? 1000 : (AO > 0 && p.z < 300 ? -1000 : 0);
      if (sz) { p.z -= sz; AO += sz; oy = AO * UU_TO_M; dirty = true; camCtl.shift(0, 0, -sz * UU_TO_M); }
      if (dirty) RS.setCarState(carId, p.x, p.y, p.z, v.x, v.y, v.z);
      const prevKeep = carCurr.clone(); if (sz) prevKeep.y -= sz * UU_TO_M; if (sx || sy) { prevKeep.x += -sx * UU_TO_M; prevKeep.z += sy * UU_TO_M; }
      carPrev.copy(prevKeep); readCurr(); readQ();
    }
    const alpha = Math.min(Math.max(acc / TICK_TIME, 0), 1);
    carPos.lerpVectors(carPrev, carCurr, alpha);
    const q = vehicle.group.quaternion.copy(qPrev).slerp(qCurr, alpha); vehicle.group.position.copy(carPos);
    const speedUU = Math.hypot(st.vel.x, st.vel.y, st.vel.z); vehicle.update(dt, ctl.boost);
    const hgt = Math.max(carPos.y + oy, 0.3); shadow.position.set(carPos.x, 0.05 - oy, carPos.z); shadow.scale.setScalar(Math.max(.4, 1.3 - hgt / 25)); shadow.material.opacity = Math.max(.08, .38 - hgt / 40);

    rsToThree(st.vel.x, st.vel.y, st.vel.z, vel3); vel3.multiplyScalar(50);
    camCtl.update(dt, carPos, q, vel3, speedUU * UU_TO_M, st.isOnGround, topAt);
    camera.updateMatrixWorld();
    if (ts) {
      groundT += dt;
      ts.setOY(oy);
      if ((follow || !ts.hasGround) && groundT > 0.25 && (oy === 0 || !ts.hasGround)) {   // la 1.ª alineación se hace siempre (aunque oy ≠ 0); luego solo si «seguir terreno» y en suelo
        groundT = 0; const g = ts.sampleGround(carPos.x, carPos.z);
        if (g !== null) { vTarget = ts.vOff - g; ts.lastG = g; if (!ts.hasGround || Math.abs(vTarget - ts.vOff) > 4) { ts.hasGround = true; ts.setVOff(vTarget); } }   // saltos grandes: corrección inmediata (nunca quedarse bajo tierra)
      }
      if (ts.hasGround) ts.setVOff(ts.vOff + (vTarget - ts.vOff) * (1 - Math.exp(-dt / 0.9)));
      ts.update(renderer);
    } else { tiles.update(carPos.x + ox, carPos.z + oz, ox, oz); tiles.setOffsetY(oy); }
    terrain.update(camera, ox, oz, clock, oy);

    perfT += dt; if (perfT > 2) { perfT = 0;
      if (ema > 24 && pr > 0.6) { pr = Math.max(0.6, pr - 0.1); resize(); } else if (ema < 14 && pr < maxPr) { pr = Math.min(pr + 0.1, maxPr); resize(); } }
    renderer.render(scene, camera);
    hudT += dt; if (hudT > 0.15) { hudT = 0; const s = tiles.stats();
      const world = ts ? (() => { const z = ts.stats(); return `3D Tiles ${z.loaded} cargados · tex ${z.tex}/${z.maxTex} · detalle ${z.sse}px (${z.mb} MB, -${z.evicted}) · ${z.visible} vis · ${z.pending} red · fallos ${z.failed} · vOff ${ts.vOff.toFixed(0)}m g ${ts.lastG === undefined ? '–' : ts.lastG.toFixed(0)}${ts.lastError ? ' · ' + ts.lastError : ''}`; })() : `tiles ${s.tiles} (+${s.pending}) · casas ${s.houses} · palmeras ${s.palms}`;
      hud.textContent = `${Math.round(speedUU * 0.036)} km/h · ${st.isOnGround ? 'suelo' : 'aire'} · ${(Math.hypot(carPos.x + ox, carPos.z + oz) / 1000).toFixed(2)} km del origen · alt ${Math.round(carPos.y + oy)} m\n${(1000 / ema).toFixed(0)} fps · res ${pr.toFixed(1)}\n${world} · calls ${renderer.info.render.calls} · tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k`;
      const heap = performance.memory ? ` · heap ${Math.round(performance.memory.usedJSHeapSize / 1e6)} MB` : '';
      hud.textContent += `\narranques ${boots}${ctxLost ? ' · ¡CONTEXTO WEBGL PERDIDO!' : ''}${heap} · tex ${renderer.info.memory.textures} geo ${renderer.info.memory.geometries}`;
      if (ts) attrib.textContent = ts.copyright ? 'Datos: ' + ts.copyright : ''; }
  }
  requestAnimationFrame(frame);
  window.RW = { RS, scene, camera, renderer, tiles, collision };
}
boot().catch(e => { console.error(e); status('Error: ' + e.message); });
