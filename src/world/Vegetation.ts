/**
 * CHUNK 14 — Instanced palms / vegetation (lightweight).
 */

declare const THREE: any;

function seeded(i: number) {
  const x = Math.sin(i * 91.3 + 17.2) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Instanced palm trunks + simple canopy spheres.
 * Hundreds of instances, few draw calls.
 */
export function buildPalms(scene: any, count = 120): any {
  const root = new THREE.Group();
  root.name = 'Vegetation';
  scene.add(root);

  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 5);
  const leafGeo = new THREE.SphereGeometry(1, 5, 3);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x6b4f2a,
    roughness: 1,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x2f6b3a,
    roughness: 0.9,
  });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
  trunks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  leaves.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    // Cluster around city block + scatter on hills
    const cluster = seeded(i) > 0.35;
    const x = cluster
      ? 4 + seeded(i + 1) * 48
      : -20 + seeded(i + 2) * 90;
    const z = cluster
      ? 4 + seeded(i + 3) * 40
      : -30 - seeded(i + 4) * 50;
    const h = 2.6 + seeded(i + 5) * 2.2;
    const lean = (seeded(i + 6) - 0.5) * 0.25;

    dummy.position.set(x, h * 0.5, z);
    dummy.rotation.set(lean, seeded(i + 7) * Math.PI * 2, lean * 0.5);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x + lean * 0.5, h + 0.3, z);
    dummy.rotation.set(0, seeded(i + 8) * 6, 0);
    const ls = 0.9 + seeded(i + 9) * 0.6;
    dummy.scale.set(ls, ls * 0.4, ls);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  root.add(trunks);
  root.add(leaves);

  return root;
}
