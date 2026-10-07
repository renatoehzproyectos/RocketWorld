/**
 * CHUNK 03 — Vehicle visual
 * Proven Fennec load + material assignment (orange body, wheels, glass).
 */

import { UU_TO_M } from '../core/coords';

declare const THREE: any;

export interface VehicleHitbox {
  x: number;
  y: number;
  z: number;
}

function loadTex(url: string, srgb = true): any {
  const t = new THREE.TextureLoader().load(url);
  if (srgb && 'encoding' in t) t.encoding = THREE.sRGBEncoding ?? 3001;
  t.flipY = false;
  return t;
}

export class VehicleRenderer {
  readonly root: any;
  private placeholder: any;
  private model: any = null;
  private readonly L: number;
  private readonly W: number;
  private readonly H: number;
  readonly hitboxUU: VehicleHitbox;

  constructor(scene: any, hitbox: VehicleHitbox) {
    this.hitboxUU = hitbox;
    this.L = hitbox.x * UU_TO_M;
    this.W = hitbox.y * UU_TO_M;
    this.H = hitbox.z * UU_TO_M;

    this.root = new THREE.Group();
    scene.add(this.root);

    const mat = new THREE.MeshStandardMaterial({
      color: 0xff4a00,
      metalness: 0.2,
      roughness: 0.35,
    });
    this.placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(this.L, this.H, this.W),
      mat
    );
    this.placeholder.position.y = this.H * 0.5;
    this.root.add(this.placeholder);
  }

  setTransform(position: { x: number; y: number; z: number }, quaternion: any) {
    this.root.position.set(position.x, position.y, position.z);
    this.root.quaternion.copy(quaternion);
  }

  async loadGlb(url: string): Promise<boolean> {
    try {
      const gltf: any = await new Promise((resolve, reject) => {
        new THREE.GLTFLoader().load(url, resolve, undefined, reject);
      });
      const source = gltf.scene;

      const bodyNormal = loadTex('/assets/Chassis_Grain_N.webp', false);
      const wheelMap = loadTex('/assets/Alpha_D.webp', true);
      const wheelNormal = loadTex('/assets/Alpha_N.webp', false);

      source.traverse((child: any) => {
        if (!child.isMesh) return;
        const name = Array.isArray(child.material)
          ? child.material.map((m: any) => m.name).join(' ')
          : child.material?.name || '';

        if (/Window/i.test(name)) {
          child.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
        } else if (/Headlight/i.test(name)) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0xf4fbff,
            emissive: 0x9ff0ff,
            emissiveIntensity: 1.6,
            roughness: 0.1,
          });
        } else if (/Alpha/i.test(name)) {
          child.material = new THREE.MeshStandardMaterial({
            map: wheelMap,
            normalMap: wheelNormal,
            color: 0x050506,
            roughness: 0.4,
            metalness: 0.4,
          });
        } else if (/Dieci/i.test(name)) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x1a1a1c,
            roughness: 0.9,
            metalness: 0,
          });
        } else if (/Body/i.test(name)) {
          child.material = new THREE.MeshPhysicalMaterial({
            normalMap: bodyNormal,
            normalScale: new THREE.Vector2(0.5, 0.5),
            color: 0xff4a00,
            emissive: 0x2a0a00,
            roughness: 0.3,
            metalness: 0.15,
            clearcoat: 1.0,
            clearcoatRoughness: 0.08,
          });
        } else {
          child.material = new THREE.MeshStandardMaterial({
            normalMap: bodyNormal,
            color: 0x1a1a1d,
            roughness: 0.32,
            metalness: 0.3,
          });
        }
      });

      const box = new THREE.Box3().setFromObject(source);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = (this.L * 0.98) / size.x;
      source.scale.setScalar(scale);
      source.rotation.x = Math.PI / 2;
      source.position.set(
        -center.x * scale,
        center.z * scale,
        -box.min.y * scale - this.H * 0.48
      );
      this.root.add(source);
      this.model = source;
      this.placeholder.visible = false;
      return true;
    } catch (e) {
      console.warn('[VehicleRenderer] GLB load failed:', url, e);
      return false;
    }
  }
}
