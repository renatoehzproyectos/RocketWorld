import { UU_TO_M } from './coords.js';
// Ciudad mediterránea procedural: chunks con culling manual (instancing + LOD por distancia).
// Espacio three (m). La arena de RocketSim ocupa x∈[-82,82], z∈[-102,102].
const CHUNK = 82;                   // m por chunk
const BLOCK = 44, ROAD = 12;        // paso de calle y ancho de calle
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function createWorld(scene, collision) {
  const R = rng(1337), tmp = new THREE.Object3D();
  const chunks = new Map();   // "i,j" -> { group, box, parts:{houses,props,palms}, lod }
  const getChunk = (x, z) => {
    const i = Math.floor(x / CHUNK), j = Math.floor(z / CHUNK), k = i + ',' + j;
    if (!chunks.has(k)) chunks.set(k, { i, j, houses: [], palms: [], roofs: [], doors: [], group: new THREE.Group() });
    return chunks.get(k);
  };

  // ---- Cielo / niebla / luces
  const SKY_TOP = new THREE.Color(0x2a6fc4), SKY_HOR = new THREE.Color(0xcfe6f2);
  scene.background = SKY_HOR.clone();
  scene.fog = new THREE.Fog(0xcfe6f2, 140, 620);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY_TOP }, hor: { value: SKY_HOR } },
    vertexShader: 'varying float h;void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top,hor;varying float h;void main(){gl_FragColor=vec4(mix(hor,top,pow(clamp(h,0.,1.),.55)),1.);}',
  }));
  scene.add(dome);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb59b7a, 0.75));
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.95); sun.position.set(-60, 90, -40); scene.add(sun);

  // ---- Terreno: arena/desierto + mar al este
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1400), new THREE.MeshLambertMaterial({ color: 0xd9c49a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(-350, 0, 0); scene.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: 0x1d8fb8, fog: true }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(150, -0.6, 0); scene.add(sea);

  // ---- Calles (1 malla estática por eje, dentro del área jugable + margen)
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e2c8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const XMIN = -110, XMAX = 110, ZMIN = -130, ZMAX = 130;
  const roadsX = [], roadsZ = [];                          // centros de calle
  for (let x = -BLOCK * 2; x <= BLOCK * 2; x += BLOCK) roadsX.push(x);
  for (let z = -BLOCK * 3; z <= BLOCK * 3; z += BLOCK) roadsZ.push(z);
  const flat = (w, d, x, z, mat, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); };
  roadsX.forEach(x => { flat(ROAD, ZMAX - ZMIN, x, 0, roadMat, 0.02); flat(.4, ZMAX - ZMIN, x, 0, lineMat, 0.03); });
  roadsZ.forEach(z => { flat(XMAX - XMIN, ROAD, 0, z, roadMat, 0.021); flat(XMAX - XMIN, .4, 0, z, lineMat, 0.031); });

  // ---- Manzanas con casas blancas
  const palmSpots = [];
  const cellsX = [], cellsZ = [];
  for (let i = -3; i <= 2; i++) cellsX.push(i * BLOCK + BLOCK / 2);
  for (let j = -4; j <= 3; j++) cellsZ.push(j * BLOCK + BLOCK / 2);
  const inner = BLOCK - ROAD - 3;                          // lado útil de la manzana
  for (const cx of cellsX) for (const cz of cellsZ) {
    if (Math.abs(cx) < 14 && Math.abs(cz) < 14) continue;  // plaza central libre para arrancar
    const n = 2 + Math.floor(R() * 3);                     // 2-4 casas por manzana
    for (let k = 0; k < n; k++) {
      const w = 8 + R() * 10, d = 8 + R() * 10, h = 4 + R() * 7 + (R() < .15 ? 8 : 0);
      const ox = (R() - .5) * (inner - w), oz = (R() - .5) * (inner - d);
      const x = cx + ox, z = cz + oz;
      // evita solaparse mucho con otra casa de la misma manzana
      const c = getChunk(x, z);
      if (c.houses.some(q => Math.abs(q.x - x) < (q.w + w) / 2 + 1 && Math.abs(q.z - z) < (q.d + d) / 2 + 1)) continue;
      c.houses.push({ x, z, w, d, h });
      collision.add((x - w / 2) * 50, (x + w / 2) * 50, (-z - d / 2) * 50, (-z + d / 2) * 50, h * 50);
    }
    // 4 palmeras en las esquinas de la acera
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      if (R() < .75) palmSpots.push({ x: cx + sx * (BLOCK / 2 - ROAD / 2 - .8), z: cz + sz * (BLOCK / 2 - ROAD / 2 - .8) });
    });
  }
  palmSpots.forEach(p => getChunk(p.x, p.z).palms.push(p));

  // ---- Fondo lejano: casas/edificios en anillo (LOD más bajo: cajas sin puertas, sin colisión)
  for (let a = 0; a < 140; a++) {
    const ang = R() * Math.PI * 2, r = 150 + R() * 450;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    if (x > 120) continue;                                  // mar al este
    getChunk(x, z).houses.push({ x, z, w: 10 + R() * 14, d: 10 + R() * 14, h: 5 + R() * 20, far: true });
  }

  // ---- Construcción de InstancedMesh por chunk
  const houseGeo = new THREE.BoxGeometry(1, 1, 1); houseGeo.translate(0, .5, 0);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1); roofGeo.translate(0, .5, 0);
  const whites = [0xf6f3ec, 0xffffff, 0xece6da, 0xf2efe8];
  const houseMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xd8d2c4 });
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x2b6fb3 });
  const trunkGeo = new THREE.CylinderGeometry(.18, .28, 7, 5); trunkGeo.translate(0, 3.5, 0);
  const crownGeo = new THREE.ConeGeometry(2.6, 1.6, 6); crownGeo.translate(0, 7.4, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a }), crownMat = new THREE.MeshLambertMaterial({ color: 0x3d8a3d });
  const col = new THREE.Color();

  const all = [];
  chunks.forEach(c => {
    const near = c.houses.filter(h => !h.far), far = c.houses.filter(h => h.far);
    const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(n, 1)); m.count = n; m.frustumCulled = false; c.group.add(m); return m; };
    const hs = mk(houseGeo, houseMat, c.houses.length), rs = mk(roofGeo, roofMat, near.length), ds = mk(houseGeo, doorMat, near.length);
    c.houses.forEach((h, idx) => {
      tmp.position.set(h.x, 0, h.z); tmp.rotation.set(0, 0, 0); tmp.scale.set(h.w, h.h, h.d); tmp.updateMatrix(); hs.setMatrixAt(idx, tmp.matrix);
      hs.setColorAt && hs.setColorAt(idx, col.setHex(whites[(R() * whites.length) | 0]));
    });
    near.forEach((h, idx) => {
      tmp.position.set(h.x, h.h, h.z); tmp.scale.set(h.w + .5, .5, h.d + .5); tmp.updateMatrix(); rs.setMatrixAt(idx, tmp.matrix);
      tmp.position.set(h.x, 0, h.z + h.d / 2 + .02); tmp.scale.set(1.6, 2.4, .1); tmp.updateMatrix(); ds.setMatrixAt(idx, tmp.matrix);
    });
    // las casas lejanas dibujan solo el cuerpo; roofs/doors limitados a las cercanas
    c.parts = { houses: hs, detail: [rs, ds] };
    if (c.palms.length) {
      const tr = mk(trunkGeo, trunkMat, c.palms.length), cr = mk(crownGeo, crownMat, c.palms.length);
      c.palms.forEach((p, idx) => { tmp.position.set(p.x, 0, p.z); tmp.rotation.set(0, R() * 6.28, 0); tmp.scale.setScalar(.8 + R() * .5); tmp.updateMatrix(); tr.setMatrixAt(idx, tmp.matrix); cr.setMatrixAt(idx, tmp.matrix); });
      c.parts.palms = [tr, cr];
    }
    c.box = new THREE.Box3(new THREE.Vector3(c.i * CHUNK, 0, c.j * CHUNK), new THREE.Vector3((c.i + 1) * CHUNK, 30, (c.j + 1) * CHUNK));
    c.center = c.box.getCenter(new THREE.Vector3());
    scene.add(c.group); all.push(c);
  });

  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  const stats = { chunks: all.length, visible: 0, tris: 0 };
  return {
    stats, chunkCount: all.length, houseCount: collision.boxes.length, palmCount: palmSpots.length,
    update(camera, carPos) {
      pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
      dome.position.copy(camera.position);
      let vis = 0;
      for (const c of all) {
        const dist = Math.hypot(c.center.x - carPos.x, c.center.z - carPos.z);
        const show = frustum.intersectsBox(c.box) || dist < CHUNK * 1.2;   // el entorno inmediato siempre vive
        c.group.visible = show; if (!show) continue; vis++;
        const detailOn = dist < 160, palmsOn = dist < 220;                 // LOD por distancia
        c.parts.detail.forEach(m => m.visible = detailOn);
        if (c.parts.palms) c.parts.palms.forEach(m => m.visible = palmsOn);
      }
      stats.visible = vis;
    },
  };
}
