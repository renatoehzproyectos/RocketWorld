/**
 * CHUNK 16 — Visual polish toward reference image.
 * Light-weight only: sky dome, sea, car ground blob shadow.
 * No full-screen bloom (GPU budget rule).
 */

declare const THREE: any;

/** Gradient sky dome (coastal Mediterranean) */
export function addSkyDome(scene: any): any {
  const geo = new THREE.SphereGeometry(800, 24, 12);
  // Invert so we see inside
  geo.scale(-1, 1, 1);
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, '#4a8ec8'); // zenith
  gr.addColorStop(0.45, '#87b8d8');
  gr.addColorStop(0.72, '#c5ddf0');
  gr.addColorStop(1, '#e8d5b5'); // horizon warm
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'SkyDome';
  mesh.frustumCulled = false;
  scene.add(mesh);
  scene.background = null; // dome provides sky
  return mesh;
}

/** Expanded sea plane with slight transparency */
export function addSea(scene: any): any {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2e7aab,
    roughness: 0.35,
    metalness: 0.15,
    transparent: true,
    opacity: 0.85,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(20, -1.5, -200);
  sea.name = 'Sea';
  scene.add(sea);

  // Bright horizon strip
  const horizon = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 40),
    new THREE.MeshBasicMaterial({
      color: 0xd0e8f8,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
  );
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.set(20, -1.2, -80);
  scene.add(horizon);
  return sea;
}

/** Soft blob shadow under the car (follows vehicle root) */
export class CarShadow {
  readonly mesh: any;
  private readonly _v = new THREE.Vector3();

  constructor(scene: any) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.18)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  /** carPos in Three.js meters; heightAboveGround in m */
  update(carPos: { x: number; y: number; z: number }, onGround: boolean) {
    this.mesh.position.set(carPos.x, 0.05, carPos.z);
    const h = Math.max(0, carPos.y);
    const k = Math.min(1, h / 12);
    this.mesh.material.opacity = onGround ? 0.65 : 0.65 * (1 - k * 0.85);
    const s = 1 + k * 1.4;
    this.mesh.scale.set(s, s, 1);
  }
}
