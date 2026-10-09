import { geodeticToECEF, enuBasis, moveGeodetic, rad } from './geo.js';
// Runtime 3D Tiles propio (1.0/1.1): bounding volumes box/sphere/region, SSE por geometricError, refinamiento REPLACE/ADD,
// tilesets externos, glb/b3dm/cmpt (+Draco), cola priorizada con concurrencia limitada, caché LRU y origen flotante ENU.
const V3 = THREE.Vector3, Y2Z = new THREE.Matrix4().makeRotationX(Math.PI / 2), DOWN = new V3(0, -1, 0);
const dirScale = (e, x, y, z, o) => o.set(e[0] * x + e[4] * y + e[8] * z, e[1] * x + e[5] * y + e[9] * z, e[2] * x + e[6] * y + e[10] * z);
// Resuelve `uri` contra `base` heredando los parámetros de query de la base que la URI no trae (p. ej. `session` de Google),
// igual que CesiumJS. Se copian en crudo para no recodificar el token.
function inherit(uri, base) {
  const b = new URL(base, location.href), u = new URL(uri, b); let h = u.href;
  if (u.hostname !== b.hostname || !b.search) return h;
  const have = new Set([...u.searchParams.keys()]);
  for (const raw of b.search.slice(1).split('&')) {
    let k; try { k = decodeURIComponent(raw.split('=')[0]); } catch (_) { continue; }
    if (raw && !have.has(k)) { h += (h.includes('?') ? '&' : '?') + raw; have.add(k); }
  }
  return h;
}
const isJson = u => /\.json(\?|$)/i.test(u || '');

export class Tileset3D {
  constructor(scene, camera, o = {}) {
    Object.assign(this, { scene, camera, maxSSE: o.sse ?? 16, maxTiles: o.maxTiles ?? 300, maxReq: o.maxReq ?? 6, maxBytes: o.maxBytes ?? 500e6, lowMem: !!o.lowMem });
    this.onEvent = o.onEvent || (() => {}); this.errSeen = {};
    this.bytes = 0; this.evicted = 0; this.maxTex = o.maxTex ?? 120; this.texCount = 0; this.sseBase = this.maxSSE; this.sseCur = this.maxSSE; this.sseDyn = o.sseDyn ?? 48; this.minTex = o.minTex ?? 500;
    this.root = new THREE.Group(); scene.add(this.root);
    this.anchor = { lat: 0, lon: 0, h: 0 }; this.P0 = new V3(); this.M = new THREE.Matrix4(); this._T = new THREE.Matrix4();
    this.frame = 0; this.loaded = new Set(); this.queue = []; this.active = 0; this.sel = []; this.rootTile = null;
    this.vOff = 0; this.oy = 0; this.hasGround = false; this.disposed = false; this.copyright = ''; this.lastError = '';
    this.frustum = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._c = new V3(); this._c2 = new V3(); this._s = new THREE.Sphere(); this.k = 1000;
    this.gltf = new THREE.GLTFLoader(); this.ray = new THREE.Raycaster();
    if (THREE.DRACOLoader) { this.draco = new THREE.DRACOLoader(); this.draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/gltf/'); this.gltf.setDRACOLoader(this.draco); }
  }
  // ---------- arranque ----------
  async init(cfg) {
    this.setAnchor(cfg.lat * rad, cfg.lon * rad, 0);
    let url;
    if (cfg.provider === 'google') {
      this.key = String(cfg.key || '').replace(/["'\s]/g, '');
      if (/^eyJ/.test(this.key)) throw new Error('Ese es un token de Cesium ion (empieza por eyJ), no una key de Google. Cambia «Fuente del mundo» a una opción de Cesium ion'); url = 'https://tile.googleapis.com/v1/3dtiles/root.json'; }
    else {
      const tok = String(cfg.key || '').replace(/^\s*bearer\s+/i, '').replace(/["'\s]/g, '');
      const id = cfg.provider === 'ion-osm' ? 96188 : cfg.provider === 'ion-google' ? 2275207 : parseInt(String(cfg.asset).replace(/\D/g, ''), 10);
      if (!Number.isFinite(id)) throw new Error('ID de asset de Cesium ion no válido (solo números)');
      if (/^AIza/.test(tok)) throw new Error('Esa clave es de Google (empieza por AIza). Elige «Google Photorealistic 3D Tiles» o pega un token de Cesium ion (empieza por eyJ)');
      const r = await fetch(`https://api.cesium.com/v1/assets/${id}/endpoint`, { headers: { Authorization: 'Bearer ' + tok } });
      if (!r.ok) {
        let m = ''; try { const j = await r.json(); m = j.message || j.code || ''; } catch (_) {}
        throw new Error(`Cesium ion HTTP ${r.status}${m ? ' — ' + m : ''} (asset ${id}). Comprueba: token completo de ion con permiso assets:read, y que el asset esté añadido a «My Assets» de tu cuenta`);
      }
      const ep = await r.json();
      if (ep.externalType || ep.options?.url) {                       // p. ej. Google Photorealistic servido vía ion: viene la URL y la key de Google
        url = ep.options.url; const ok = ep.options.key || ep.options.apiKey; if (ok) this.key = ok;
        if (/tile\.googleapis\.com/.test(url) === false && ep.accessToken) this.token = ep.accessToken;
      } else { this.token = ep.accessToken; url = ep.url; }
      if (!url) throw new Error('Cesium ion no devolvió URL del tileset (tipo de asset no soportado: ' + (ep.type || '?') + ')');
    }
    try {                                   // la key/token puede venir embebida en la URL del root: hay que propagarla a las URLs hijas
      const u = new URL(url, location.href), k = u.searchParams.get('key'), at = u.searchParams.get('access_token');
      if (k && !this.key) this.key = k; if (at && !this.token) this.token = at;
    } catch (_) {}
    const json = await this.fetchJSON(url);
    if (!json.root) throw new Error('tileset.json sin "root"');
    this.rootTile = this.makeTile(json.root, null, url);
  }
  auth(u) {                                   // añade key/token SIN reescribir la query (URLSearchParams recodifica el token `session` de Google → 400)
    const x = new URL(u, location.href); let h = x.href;
    const add = (n, v) => { h += (h.includes('?') ? '&' : '?') + n + '=' + encodeURIComponent(v); };
    if (x.hostname === 'tile.googleapis.com' && this.key && !x.searchParams.has('key')) add('key', this.key);
    if (this.token && x.hostname.endsWith('cesium.com') && !x.searchParams.has('access_token')) add('access_token', this.token);
    return h;
  }
  async fetchJSON(url) {
    const r = await fetch(this.auth(url));
    if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? `HTTP ${r.status}: clave/token inválido, sin permiso o API no habilitada (Google: «Map Tiles API» + facturación activa; ion: token con assets:read y asset en My Assets)` : `HTTP ${r.status}`);
    return r.json();
  }
  // ---------- árbol ----------
  makeTile(j, parent, baseUrl) {
    const local = j.transform ? new THREE.Matrix4().fromArray(j.transform) : new THREE.Matrix4();
    const uri = j.content?.uri ?? j.content?.url, abs = uri ? inherit(uri, baseUrl) : null;
    const t = { parent, children: [], uri: abs, external: !!abs && isJson(abs), state: 0, queued: false, ge: j.geometricError ?? 0, selFrame: -1, protectFrame: -1,
      refine: (j.refine || parent?.refine || 'REPLACE').toUpperCase(), world: parent ? parent.world.clone().multiply(local) : local, center: new V3(), radius: 0,
      holder: null, meshes: null, bytes: 0, copyright: '', prio: 0, qf: 0, retryAt: 0, needed: false };
    this.bound(t, j.boundingVolume);
    for (const c of j.children || []) t.children.push(this.makeTile(c, t, baseUrl));
    return t;
  }
  bound(t, bv) {
    const e = t.world.elements, c = t.center;
    if (bv?.box) {
      const b = bv.box, u = dirScale(e, b[3], b[4], b[5], new V3()), v = dirScale(e, b[6], b[7], b[8], new V3()), w = dirScale(e, b[9], b[10], b[11], new V3());
      c.set(b[0], b[1], b[2]).applyMatrix4(t.world); t.radius = Math.sqrt(u.lengthSq() + v.lengthSq() + w.lengthSq());
    } else if (bv?.sphere) {
      const s = bv.sphere; c.set(s[0], s[1], s[2]).applyMatrix4(t.world);
      t.radius = s[3] * Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
    } else if (bv?.region) {
      const [w, s, ea, n, h0, h1] = bv.region; geodeticToECEF((s + n) / 2, (w + ea) / 2, (h0 + h1) / 2, c); const p = new V3();
      for (const la of [s, n]) for (const lo of [w, ea]) for (const h of [h0, h1]) t.radius = Math.max(t.radius, c.distanceTo(geodeticToECEF(la, lo, h, p)));
    } else if (t.parent) { c.copy(t.parent.center); t.radius = t.parent.radius; }
  }
  // ---------- marco local (origen flotante) ----------
  setAnchor(lat, lon, h) { Object.assign(this.anchor, { lat, lon, h }); this.rebase(); }
  shift(dE, dN) { moveGeodetic(this.anchor, dE, dN); this.rebase(); }
  rebase() {
    const { lat, lon, h } = this.anchor, P = geodeticToECEF(lat, lon, h, this.P0), [E, N, U] = enuBasis(lat, lon);
    this.M.set(E.x, E.y, E.z, -E.dot(P), U.x, U.y, U.z, -U.dot(P), -N.x, -N.y, -N.z, N.dot(P), 0, 0, 0, 1);   // ECEF -> three (x=E, y=U, z=-N)
    for (const t of this.loaded) this.place(t);
  }
  place(t) {
    const h = t.holder; h.matrix.copy(this.M).multiply(t.world);
    const r = h.userData.rtc; if (r) h.matrix.multiply(this._T.makeTranslation(r[0], r[1], r[2]));
    h.matrix.multiply(Y2Z); h.updateMatrixWorld(true);
  }
  setVOff(y) { this.vOff = y; this.root.position.y = y - this.oy; this.root.updateMatrixWorld(true); }
  setOY(v) { if (v !== this.oy) { this.oy = v; this.setVOff(this.vOff); } }   // desplazamiento vertical del origen (vuelo por encima del techo de RocketSim)
  local(t, out) { out.copy(t.center).applyMatrix4(this.M); out.y += this.vOff - this.oy; return out; }
  // ---------- recorrido ----------
  update(renderer) {
    if (!this.rootTile || this.disposed) return;
    const f = ++this.frame, cam = this.camera;
    this._pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this._pm);
    this.k = renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360));
    this.sel.length = 0; this.visit(this.rootTile, f);
    // Solo los tiles seleccionados se renderizan. protectFrame evita evicción del padre, no lo muestra (evita solapamiento).
    for (const t of this.loaded) t.holder.visible = t.selFrame === f;
    if (f % 10 === 0) {                      // histéresis: umbrales separados para subir/bajar SSE (evita oscilación)
      const p = this.sel.length / this.maxTex;
      if (p > 0.90) this.sseCur = Math.min(this.sseCur * 1.04, Math.max(this.sseBase, this.sseDyn));
      else if (p < 0.50 && this.sseCur > this.sseBase) this.sseCur = Math.max(this.sseBase, this.sseCur * 0.96);
    }
    this.pump(f);
    if (f % 15 === 0) this.evict(f);
    if (f % 30 === 0) { const set = new Set(); this.sel.forEach(t => t.copyright && t.copyright.split(';').forEach(s => s.trim() && set.add(s.trim()))); this.copyright = [...set].join(' · '); }
  }
  inView(t) { const c = this.local(t, this._c2); this._s.center.copy(c); this._s.radius = t.radius; return this.frustum.intersectsSphere(this._s); }
  dist(t) { return Math.max(this.local(t, this._c2).distanceTo(this.camera.position) - t.radius, 0.01); }
  visit(t, f) {
    const c = this.local(t, this._c); this._s.center.copy(c); this._s.radius = t.radius;
    if (!this.frustum.intersectsSphere(this._s)) return;
    const dist = Math.max(c.distanceTo(this.camera.position) - t.radius, 0.01), content = !!t.uri && !t.external, kids = t.children;
    if (t.external && t.state !== 2) { this.request(t, dist, f, true); return; }
    // Umbral de refinamiento con histéresis: refinar solo por encima de thrHi; volver al padre solo por debajo de thrLo
    const base = this.sseCur * (1 + dist / 400);
    const thrHi = base, thrLo = base * 0.72;
    const sse = t.ge * this.k / dist;
    const wasRefined = t._refined === true;
    const refine = !content || (kids.length > 0 && (wasRefined ? sse > thrLo : sse > thrHi));
    if (!refine || !kids.length) { t._refined = false; if (content) this.select(t, dist, f); return; }
    if (t.refine === 'ADD') { if (content) this.select(t, dist, f); for (const k of kids) this.visit(k, f); return; }
    // REPLACE: el padre permanece visible y protegido hasta que TODOS los hijos necesarios estén listos para render
    if (content && t.state === 2) {
      let ok = true; for (const k of kids) if (!this.ready(k, 0)) { ok = false; this.prefetch(k, f, 0); }
      if (!ok) { t._refined = false; this.select(t, dist, f); return; }
      // Hijos listos: marcar padre como protegido (no evictar) y no mostrarlo; los hijos cubren la región
      t._refined = true; t.protectFrame = f;
    } else if (content) { this.request(t, dist, f, true); return; }
    for (const k of kids) this.visit(k, f);
  }
  select(t, dist, f) {
    if (t.state === 2) { t.selFrame = f; this.sel.push(t); }
    else this.request(t, dist, f, true);
    // Proteger ancestros: no deben evictarse mientras un descendiente está seleccionado
    for (let p = t.parent; p; p = p.parent) p.protectFrame = f;
  }
  ready(k, d) {
    if (d > 6) return true;
    // Fuera de vista ampliada (radio +10 %): se considera listo para no bloquear el refinamiento del padre
    const c = this.local(k, this._c2); this._s.center.copy(c); this._s.radius = k.radius * 1.1;
    if (!this.frustum.intersectsSphere(this._s)) return true;
    if (k.external) return k.state === 2 && k.children.every(c => this.ready(c, d + 1));
    if (k.uri) return k.state === 2;                 // fallido (3) o pendiente → el padre sigue visible (sin huecos)
    return k.children.every(c => this.ready(c, d + 1));
  }
  prefetch(k, f, d) {
    if (d > 6) return;
    const c = this.local(k, this._c2); this._s.center.copy(c); this._s.radius = k.radius * 1.1;
    if (!this.frustum.intersectsSphere(this._s)) return;
    if (k.uri && !(k.external && k.state === 2)) { if (k.state !== 2) this.request(k, this.dist(k), f, true); if (!k.external) return; }
    for (const c of k.children) this.prefetch(c, f, d + 1);
  }
  // ---------- red ----------
  request(t, dist, f, needed = false) {   // needed=true: hace falta para mostrar algo; false: precarga
    if (t.state === 3 && performance.now() > t.retryAt) t.state = 0;
    if (t.state !== 0) return; if (t.qf !== f) t.needed = false; t.needed = t.needed || needed; t.prio = dist; t.qf = f;
    if (!t.queued) { t.queued = true; this.queue.push(t); }
  }
  pump(f) {
    const q = this.queue;
    for (let i = q.length - 1; i >= 0; i--) if (f - q[i].qf > 5) { q[i].queued = false; q.splice(i, 1); }
    q.sort((a, b) => (b.needed - a.needed) || (a.prio - b.prio));
    let i = 0;
    while (this.active < this.maxReq && i < q.length) {
      const t = q[i];
      if (t.state !== 0) { q.splice(i, 1); t.queued = false; continue; }
      if (!t.external) {
        const used = this.texCount + this.active;
        if (used >= this.maxTex) { if (!t.needed || !this.evictOne(f)) { i++; continue; } }   // lleno: solo lo necesario, expulsando algo antiguo
      }
      q.splice(i, 1); t.queued = false; this.load(t);
    }
  }
  load(t) {
    t.state = 1; this.active++;
    fetch(this.auth(t.uri)).then(async r => { if (!r.ok) { let b = ''; try { b = (await r.text()).replace(/\s+/g, ' ').slice(0, 110); } catch (_) {} throw new Error('HTTP ' + r.status + (b ? ' ' + b : '')); } return r.arrayBuffer(); })
      .then(buf => this.parse(t, buf))
      .catch(e => { t.state = 3; t.retryAt = performance.now() + 8000; this.lastError = e.message; this.failed = (this.failed || 0) + 1; console.warn('3D Tiles:', e);
        const k = String(e.message).slice(0, 50), c = this.errSeen[k] = (this.errSeen[k] || 0) + 1; if (c <= 3 || c % 25 === 0) this.onEvent('tile-error', `${e.message} (x${c}) ${String(t.uri).replace(/^https?:\/\/[^/]+/, '').slice(0, 70)}`); })
      .finally(() => { this.active--; });
  }
  extract(buf, out = []) {
    const dv = new DataView(buf), tag = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (tag === 'glTF') out.push({ glb: buf, rtc: null });
    else if (tag === 'b3dm') {
      const fj = dv.getUint32(12, true), fb = dv.getUint32(16, true), bj = dv.getUint32(20, true), bb = dv.getUint32(24, true); let rtc = null;
      if (fj) { try { rtc = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 28, fj))).RTC_CENTER || null; } catch (_) {} }
      out.push({ glb: buf.slice(28 + fj + fb + bj + bb), rtc });
    } else if (tag === 'cmpt') { const n = dv.getUint32(12, true); let off = 16; for (let i = 0; i < n; i++) { const len = dv.getUint32(off + 8, true); this.extract(buf.slice(off, off + len), out); off += len; } }
    return out;
  }
  async parse(t, buf) {
    if (this.disposed) return;
    if (new Uint8Array(buf, 0, 1)[0] === 0x7b) {                       // '{' -> tileset externo
      const json = JSON.parse(new TextDecoder().decode(buf)); if (!json.root) throw new Error('tileset externo sin root');
      t.children = [this.makeTile(json.root, t, t.uri)]; t.state = 2; return;
    }
    const parts = this.extract(buf); if (!parts.length) throw new Error('contenido no soportado');
    const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.visible = false; t.meshes = []; t.bytes = 0; t.tex = 0;
    for (const p of parts) {
      const gltf = await new Promise((res, rej) => this.gltf.parse(p.glb, '', res, rej));
      if (p.rtc) holder.userData.rtc = p.rtc; if (gltf.asset?.copyright) t.copyright = gltf.asset.copyright;
      gltf.scene.traverse(o => {                                        // iluminación horneada: MeshBasicMaterial (mucho más barato)
        if (!o.isMesh) return; const old = o.material, map = old.map || null;
        o.material = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : (old.color || 0xffffff), vertexColors: !!o.geometry.attributes.color, side: old.side });
        if (map) {
          t.tex++;
          if (this.lowMem) { map.generateMipmaps = false; map.minFilter = THREE.LinearFilter; }
          map.onUpdate = () => { const im = map.image; if (im && im.close) im.close(); };   // libera la copia en RAM tras subir a la GPU
        }
        old.dispose && old.dispose(); t.meshes.push(o);
        for (const a of Object.values(o.geometry.attributes)) t.bytes += a.array.byteLength;
        if (map?.image?.width) t.bytes += map.image.width * map.image.height * (this.lowMem ? 4 : 5.3);
      });
      holder.add(gltf.scene);
    }
    if (this.disposed) { this.freeHolder(holder, t.meshes); return; }
    t.holder = holder; this.root.add(holder); t.state = 2; t.loadedFrame = this.frame; this.bytes += t.bytes; this.texCount += t.tex; this.loaded.add(t); this.place(t);
  }
  // ---------- caché ----------
  freeHolder(h, meshes) { h.parent && h.parent.remove(h); (meshes || []).forEach(m => { m.geometry.dispose(); m.material.map && m.material.map.dispose(); m.material.dispose(); }); }
  free(t) { this.bytes -= t.bytes; this.texCount -= t.tex || 0; this.freeHolder(t.holder, t.meshes); t.holder = null; t.meshes = null; t.state = 0; t._refined = false; this.loaded.delete(t); }
  // Uso reciente: selección, carga o protección como fallback de refinamiento
  _use(t) { return Math.max(t.selFrame || 0, t.loadedFrame || 0, t.protectFrame || 0); }
  evictOne(f) {                              // expulsa el tile oculto menos usado (nunca uno visible/protegido reciente)
    let best = null, bu = Infinity;
    for (const t of this.loaded) {
      const u = this._use(t);
      if (u >= f - 90) continue;             // ~1.5 s de gracia para seleccionados y padres-fallback
      if (u < bu) { bu = u; best = t; }
    }
    if (!best) return false; this.free(best); this.evicted++; return true;
  }
  evict(f) {
    if (this.loaded.size <= this.maxTiles && this.bytes <= this.maxBytes) return;
    if (this.texCount <= this.minTex) return;                 // mínimo de texturas: por debajo no se limpia nada
    const c = [...this.loaded].filter(t => this._use(t) < f - 120).sort((a, b) => this._use(a) - this._use(b));
    for (const t of c) { if (this.texCount - (t.tex || 0) < this.minTex) break; if (this.loaded.size <= this.maxTiles * .85 && this.bytes <= this.maxBytes * .85) break; this.free(t); this.evicted++; }
  }
  // ---------- terreno ----------
  // Altura (y mundo) del suelo bajo (x,z). Solo cuenta el tile MÁS FINO que recibe el rayo: un tile grosero (cuya esfera también
  // contiene al coche) puede estar cientos de metros más abajo y enterraría el mapa.
  sampleGround(x, z) {
    const cand = [];
    for (const t of this.sel) { if (!t.meshes) continue; const c = this.local(t, this._c2); if (Math.hypot(c.x - x, c.z - z) < t.radius + 5) cand.push(t); }
    this.lastCand = cand.length; if (!cand.length) return null;
    cand.sort((a, b) => a.ge - b.ge);
    const OFFS = [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]], ray = this.ray; ray.far = 9000;
    const cast = (t, dx, dz) => { ray.set(new V3(x + dx, 4000, z + dz), DOWN); const h = ray.intersectObjects(t.meshes, false); return h.length ? h[0].point.y : null; };
    let tile = null;                                                  // un solo tile para todos los rayos: mezclar LODs daba saltos de ±300–1000 m
    for (const t of cand) { for (const [dx, dz] of OFFS) if (cast(t, dx, dz) !== null) { tile = t; break; } if (tile) break; }
    if (!tile) return null; this.lastTile = tile.ge;
    let best = null; for (const [dx, dz] of OFFS) { const y = cast(tile, dx, dz); if (y !== null) best = best === null ? y : Math.min(best, y); }
    return best;
  }
  stats() { return { tex: this.texCount, maxTex: this.maxTex, sse: Math.round(this.sseCur), mb: Math.round(this.bytes / 1e6), evicted: this.evicted, loaded: this.loaded.size, pending: this.queue.length + this.active, visible: this.sel.length, failed: this.failed || 0 }; }
  dispose() { this.disposed = true; for (const t of [...this.loaded]) this.free(t); this.scene.remove(this.root); this.draco && this.draco.dispose(); }
}
