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
import { createLog, bindLogUI, redact } from './debuglog.js';

const $ = id => document.getElementById(id), status = t => $('status').textContent = t;
const rot9 = r => { const a = new Array(9); for (let i = 0; i < 9; i++) a[i] = r.get(i); return a; };
const coarse = matchMedia('(pointer:coarse)').matches;
const RECENTER = 2600;           // uu: al pasar de aquí se devuelve el coche al centro de la arena (origen flotante)

const log = createLog();
async function boot() {
  log.ev('arranque', 'boot() iniciado');
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
    log.ev('ajustes', `proveedor=${s.provider} clave=${redact(s.key)} asset=${s.asset || '-'} lat=${s.lat} lon=${s.lon} sse=${s.sse} maxTex=${s.maxTex} seguir=${s.follow}`);
    if (ts) { ts.dispose(); ts = null; }
    cfg = s; hStable = null; hs = []; hFine = false;
    if (!s.key || (s.provider === 'ion-custom' && !s.asset)) { setProc(); return; }
    tiles.setEnabled(false); terrain.setGroundVisible(false);
    camera.near = 0.5; camera.far = coarse ? 6000 : 15000; camera.updateProjectionMatrix(); scene.fog.near = coarse ? 1200 : 2500; scene.fog.far = coarse ? 5500 : 12000;
    follow = s.follow; vTarget = 0;
    const t = new Tileset3D(scene, camera, { onEvent: (t, m) => log.ev(t, m), sse: s.sse, maxTiles: Math.round(s.maxTex * 1.15) + 20, maxReq: coarse ? 4 : 8, maxBytes: coarse ? 240e6 : 700e6, lowMem: coarse, maxTex: s.maxTex, sseDyn: s.sseDyn });
    try { await t.init(s); ts = t; log.ev('3dtiles', 'tileset raíz cargado OK'); ui.status('Conectado. Cargando tiles…'); }
    catch (e) { console.error(e); log.ev('3dtiles-init-ERROR', e.message); t.dispose(); setProc(); ui.status('Error: ' + e.message + '\nMostrando ciudad procedural.', true); }
  };
  // Filtro del suelo: mediana de las últimas 9 medidas de h (altura del suelo en el marco del tileset, independiente de vOff).
  // Robusta a atípicos de ±300–1000 m (tiles groseros, azoteas) y sin depender del primer dato.
  let hStable = null, hs = [], hOut = 0, hFine = false, hSkip = 0;
  const FINE_GE = 12;      // solo tiles con error geométrico ≤ 12 m miden el suelo; uno grosero puede estar 750 m más arriba/abajo
  const feedGround = (h, ge) => {
    ts.lastH = h;
    const fine = ge <= FINE_GE;
    if (!fine && hFine) { if (hSkip++ % 20 === 0) log.ev('g-descartado', `tile grosero (ge=${ge.toFixed(0)} m) h=${h.toFixed(1)}: ignorado, ya hay suelo fino (${hStable === null ? '-' : hStable.toFixed(1)})`); return; }
    if (fine && !hFine) { hFine = true; hs = []; hStable = null; log.ev('suelo-fino', `primer tile fino (ge=${ge.toFixed(1)} m): se descarta la alineación grosera`); }
    hs.push(h); if (hs.length > 9) hs.shift();
    const srt = [...hs].sort((x, y) => x - y), med = srt[srt.length >> 1];
    if (Math.abs(h - med) > 25 && (hOut++ % 6 === 0)) log.ev('g-atipico', `h=${h.toFixed(1)} vs mediana ${med.toFixed(1)} (n=${hs.length}, tile ge=${ge.toFixed(1)})`);
    if (hStable === null) { ts.hasGround = true; ts.setVOff(-med); log.ev('suelo-inicial', `h=${med.toFixed(1)} → vOff=${(-med).toFixed(1)} (tile ge=${ge.toFixed(1)})`); }
    else if (Math.abs(med - hStable) > 30) { log.ev('suelo-cambio', `mediana ${hStable.toFixed(1)} → ${med.toFixed(1)} (salto grande: recolocación inmediata)`); ts.setVOff(-med); }
    hStable = med; vTarget = -med;
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

  { const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
    log.setEnv([`UA: ${navigator.userAgent}`, `pantalla ${innerWidth}x${innerHeight} dpr ${devicePixelRatio} · res inicial ${pr} · táctil ${coarse} · núcleos ${navigator.hardwareConcurrency} · RAM ~${navigator.deviceMemory || '?'} GB`,
      `GPU: ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?'} · maxTextura ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} · three r${THREE.REVISION}`,
      `ajustes guardados: proveedor=${ui.get().provider} clave=${redact(ui.get().key)} lat=${ui.get().lat} lon=${ui.get().lon} sse=${ui.get().sse} maxTex=${ui.get().maxTex} seguir=${ui.get().follow}`].join('\n')); }
  bindLogUI(log); log.ev('arranque', 'mundo listo');
  if (ui.get().key) applySettings(ui.get());

  let acc = 0, last = performance.now(), hudT = 0, perfT = 0, ema = 16, clock = 0;
  const hud = $('hud');
  let boots = 1, ctxLost = false, selZero = false, blocked = 0;
  try { boots = (+sessionStorage.getItem('rw.boots') || 0) + 1; sessionStorage.setItem('rw.boots', boots); } catch (_) {}
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); ctxLost = true; log.ev('WEBGL', 'CONTEXTO PERDIDO'); });
  renderer.domElement.addEventListener('webglcontextrestored', () => { ctxLost = false; log.ev('WEBGL', 'contexto restaurado'); });
  $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 600);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1); last = now; ema += (dt * 1000 - ema) * 0.05; acc += dt; clock += dt;
    if (input.takeCamToggle()) camCtl.toggle();
    if (input.takeReset()) { log.ev('reset', 'R: coche al origen'); AO = 0; oy = 0; spawn(); readCurr(); readQ(); carPrev.copy(carCurr); qPrev.copy(qCurr); }
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
        log.ev('recentrado', `E${(sx * UU_TO_M).toFixed(1)}m N${(sy * UU_TO_M).toFixed(1)}m → origen (${ox.toFixed(0)}, ${oz.toFixed(0)})`);
        if (ts) ts.shift(sx * UU_TO_M, sy * UU_TO_M);          // RS x = Este, RS y = Norte
      }
      // Techo de RocketSim (2044 uu) esquivado: cerca del techo se baja el coche 1000 uu en la física y se sube el mundo lo mismo; al descender, al revés.
      const sz = p.z > 1800 ? 1000 : (AO > 0 && p.z < 300 ? -1000 : 0);
      if (sz) { log.ev('altura', `origen vertical ${sz > 0 ? '+' : '-'}1000uu → AO=${AO + sz}`); p.z -= sz; AO += sz; oy = AO * UU_TO_M; dirty = true; camCtl.shift(0, 0, -sz * UU_TO_M); }
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
      if ((follow || !ts.hasGround) && groundT > 0.25 && oy === 0) {      // la 1.ª alineación se hace siempre; luego solo si «seguir terreno»
        groundT = 0; const g = ts.sampleGround(carPos.x, carPos.z);
        if (g !== null) { ts.lastG = g; feedGround(g - ts.vOff, ts.lastTile); if (ts.gNullLogged) ts.gNullLogged = false; }   // h = altura del suelo en el marco del tileset (no depende de vOff)
        else if (!ts.gNullLogged) { ts.gNullLogged = true; log.ev('suelo', `sin medida de suelo (candidatos=${ts.lastCand}, visibles=${ts.sel.length})`); }
      }
      if (ts.hasGround) ts.setVOff(ts.vOff + (vTarget - ts.vOff) * (1 - Math.exp(-dt / 0.35)));
      ts.update(renderer);
    } else { tiles.update(carPos.x + ox, carPos.z + oz, ox, oz); tiles.setOffsetY(oy); }
    terrain.update(camera, ox, oz, clock, oy);

    perfT += dt; if (perfT > 2) { perfT = 0;
      if (ema > 24 && pr > 0.6) { pr = Math.max(0.6, pr - 0.1); resize(); } else if (ema < 14 && pr < maxPr) { pr = Math.min(pr + 0.1, maxPr); resize(); } }
    renderer.render(scene, camera);
    {
      const zs = ts ? ts.stats() : null, heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, inf = renderer.info;
      if (zs) { if (zs.pending > 0 && ts.active === 0) { if (++blocked === 90) log.ev('COLA-BLOQUEADA', `pend=${zs.pending} act=0 durante 90 frames · tex ${zs.tex}/${zs.maxTex} · cargados ${zs.loaded}`); } else blocked = 0; }
      if (zs) { if (zs.visible === 0 && !selZero) { selZero = true; log.ev('SIN-TILES', `0 visibles (cargados=${zs.loaded}, pend=${zs.pending}, vOff=${ts.vOff.toFixed(1)}, g=${ts.lastG === undefined ? '-' : ts.lastG.toFixed(1)}, cam.y=${camera.position.y.toFixed(1)})`); } else if (zs.visible > 0 && selZero) { selZero = false; log.ev('tiles-vuelven', `${zs.visible} visibles`); } }
      log.frame([now, dt * 1000, 1000 / ema, carPos.x, carPos.y, carPos.z, speedUU * 0.036, st.isOnGround ? 1 : 0, ox, oz, AO, camera.position.x, camera.position.y, camera.position.z,
        zs && zs.loaded, zs && zs.tex, zs && zs.visible, zs && zs.pending, ts && ts.active, zs && zs.failed, zs && zs.sse, ts && ts.vOff, ts && ts.lastG, ts && ts.lastCand, zs && zs.mb, zs && zs.evicted,
        inf.render.calls, inf.render.triangles, inf.memory.textures, inf.memory.geometries, heap, ts && ts.hasGround ? 1 : 0, pr, ts && ts.lastH, ts && hStable]);
    }
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
