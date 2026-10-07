/**
 * CHUNK 10 — First Mediterranean city block (visual).
 * Composition toward the reference: white houses, roads, hillside, horizon.
 * Collision remains RocketSim arena until custom meshes can be injected.
 */

declare const THREE: any;

function seeded(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function buildCityBlock(scene: any): any {
  const root = new THREE.Group();
  root.name = 'CityBlock';
  scene.add(root);

  const white = new THREE.MeshStandardMaterial({
    color: 0xf4f1ea,
    roughness: 0.88,
    metalness: 0.02,
  });
  const whiteAlt = new THREE.MeshStandardMaterial({
    color: 0xe8e4dc,
    roughness: 0.9,
    metalness: 0.02,
  });
  const roof = new THREE.MeshStandardMaterial({
    color: 0xd9d2c5,
    roughness: 0.95,
  });
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a4a,
    roughness: 0.95,
  });
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0xc8c4bc,
    roughness: 0.9,
  });
  const dirtMat = new THREE.MeshStandardMaterial({
    color: 0xc4a574,
    roughness: 1,
  });
  const greenMat = new THREE.MeshStandardMaterial({
    color: 0x6a8f4e,
    roughness: 1,
  });

  // Hillside terrain patch (elevated zone)
  const hill = new THREE.Mesh(
    new THREE.CylinderGeometry(55, 70, 8, 24),
    dirtMat
  );
  hill.position.set(25, -3.5, 25);
  hill.scale.set(1, 1, 0.7);
  root.add(hill);

  // Grass patches
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Mesh(
      new THREE.CircleGeometry(3 + seeded(i) * 5, 8),
      greenMat
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set(
      5 + seeded(i + 1) * 50,
      0.03,
      5 + seeded(i + 2) * 40
    );
    root.add(g);
  }

  // Main roads (curved-ish layout via segments)
  const roadSpecs = [
    { x: 20, z: 8, w: 48, d: 5, rot: 0 },
    { x: 20, z: 28, w: 48, d: 4.5, rot: 0 },
    { x: 12, z: 18, w: 5, d: 36, rot: 0 },
    { x: 32, z: 18, w: 5, d: 36, rot: 0 },
    { x: 40, z: 18, w: 4, d: 28, rot: 0.15 },
  ];
  for (const r of roadSpecs) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), roadMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = r.rot;
    mesh.position.set(r.x, 0.04, r.z);
    root.add(mesh);
  }

  // White villas — denser grid with variation
  let n = 0;
  for (let gx = 0; gx < 6; gx++) {
    for (let gz = 0; gz < 5; gz++) {
      if (seeded(n + 50) < 0.15) {
        n++;
        continue; // gaps for streets / yards
      }
      const x = 6 + gx * 7 + (seeded(n) - 0.5) * 1.5;
      const z = 6 + gz * 7 + (seeded(n + 3) - 0.5) * 1.5;
      const w = 3.2 + seeded(n + 1) * 2.5;
      const d = 3.5 + seeded(n + 2) * 2.8;
      const floors = 1 + Math.floor(seeded(n + 4) * 3);
      const h = 2.4 * floors + seeded(n + 5) * 0.8;
      const mat = seeded(n + 6) > 0.5 ? white : whiteAlt;

      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      body.position.set(x, h / 2, z);
      root.add(body);

      // Flat roof slab
      const rf = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.3, 0.15, d + 0.3),
        roof
      );
      rf.position.set(x, h + 0.08, z);
      root.add(rf);

      // Small terrace / pool hint on some
      if (seeded(n + 7) > 0.7) {
        const pool = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.08, 0.8),
          new THREE.MeshStandardMaterial({
            color: 0x3a9ecc,
            roughness: 0.2,
            metalness: 0.1,
          })
        );
        pool.position.set(x + w * 0.35, 0.06, z + d * 0.35);
        root.add(pool);
      }

      // Curb
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(w + 1.5, 0.12, d + 1.5),
        curbMat
      );
      curb.position.set(x, 0.06, z);
      root.add(curb);

      n++;
    }
  }

  // Distant hillside houses (impostor boxes — low cost)
  for (let i = 0; i < 40; i++) {
    const x = -30 + seeded(i + 200) * 100;
    const z = -40 - seeded(i + 201) * 60;
    const s = 2 + seeded(i + 202) * 3;
    const h = 2 + seeded(i + 203) * 4;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(s, h, s * 0.9),
      seeded(i) > 0.5 ? white : whiteAlt
    );
    m.position.set(x, h / 2 + seeded(i + 204) * 3, z);
    root.add(m);
  }

  // Sea / horizon band
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 300),
    new THREE.MeshBasicMaterial({
      color: 0x3d8fbf,
      transparent: true,
      opacity: 0.75,
    })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(20, -1.2, -160);
  root.add(sea);

  // Far terrain band
  const farLand = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 120),
    new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 1 })
  );
  farLand.rotation.x = -Math.PI / 2;
  farLand.position.set(10, -0.8, -90);
  root.add(farLand);

  return root;
}
