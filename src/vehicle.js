import { UU_TO_M } from './coords.js';
// Visual del Fennec. Ejes locales: X=adelante, Y=derecha, Z=arriba (igual que baseline).
export function createVehicle(scene, hb) {
  const group = new THREE.Group(); scene.add(group);
  const L = hb.x * UU_TO_M, H = hb.z * UU_TO_M;
  const ph = new THREE.Mesh(new THREE.BoxGeometry(L, hb.y * UU_TO_M, H), new THREE.MeshStandardMaterial({ color: 0xff4a00 }));
  group.add(ph);
  new THREE.GLTFLoader().load('assets/fennec.glb', gltf => {
    const src = gltf.scene;
    src.traverse(c => {
      if (!c.isMesh) return;
      const n = Array.isArray(c.material) ? c.material.map(x => x.name).join(' ') : (c.material?.name || '');
      if (/Window/i.test(n)) c.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
      else if (/Headlight/i.test(n)) c.material = new THREE.MeshStandardMaterial({ color: 0xf4fbff, emissive: 0x9ff0ff, emissiveIntensity: 1.4 });
      else if (/Alpha/i.test(n)) c.material = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: .4, metalness: .5 });
      else if (/Dieci/i.test(n)) c.material = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: .95 });
      else if (/Body/i.test(n)) c.material = new THREE.MeshStandardMaterial({ color: 0xff5a10, roughness: .3, metalness: .25 });
      else c.material = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: .4, metalness: .3 });
    });
    const box = new THREE.Box3().setFromObject(src), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const s = (L * .98) / size.x;
    src.scale.setScalar(s); src.rotation.x = Math.PI / 2;
    src.position.set(-ctr.x * s, ctr.z * s, -box.min.y * s - H * .48);
    group.remove(ph); group.add(src);
  }, undefined, e => console.warn('Fennec no cargó, uso caja', e));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(.28, 1.6, 10), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: .85, depthWrite: false }));
  flame.rotation.z = Math.PI / 2; flame.position.set(-L * .5 - .8, 0, 0); flame.visible = false; group.add(flame);
  const light = new THREE.PointLight(0xffb020, 0, 16, 1.6); light.position.set(-L * .5 - .5, 0, 0); group.add(light);
  let t = 0;
  return {
    group,
    update(dt, boosting) {
      t += dt; flame.visible = boosting;
      if (boosting) { const k = 1 + .25 * Math.sin(t * 60); flame.scale.set(k, 1 + .2 * Math.sin(t * 47), k); }
      light.intensity = boosting ? 2.2 : 0;
    },
  };
}
