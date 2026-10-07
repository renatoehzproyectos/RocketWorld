/**
 * CHUNK 11/12/13 — Spatial tiles + LOD + predictive streaming
 *
 * City is split into a grid of tiles. Only tiles near the vehicle
 * (and along velocity look-ahead) are built/visible. Far tiles use
 * low LOD or are disposed. This is the architecture for growth without
 * one giant mesh; real Cesium 3D Tilesets can replace tile content later.
 */

declare const THREE: any;

export interface TileCoord {
  ix: number;
  iz: number;
}

export interface TileGridOptions {
  tileSize?: number; // meters
  radius?: number; // how many tiles from car to keep (manhattan-ish)
  lookAheadMeters?: number;
}

function seeded(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type LodLevel = 0 | 1; // 0 = high, 1 = low impostor

interface TileEntry {
  key: string;
  ix: number;
  iz: number;
  group: any;
  lod: LodLevel;
  lastUsed: number;
}

function keyOf(ix: number, iz: number) {
  return `${ix},${iz}`;
}

export class TileGrid {
  private readonly root: any;
  private readonly tiles = new Map<string, TileEntry>();
  private readonly tileSize: number;
  private readonly radius: number;
  private readonly lookAhead: number;
  private frame = 0;
  private readonly white: any;
  private readonly whiteAlt: any;
  private readonly roof: any;
  private readonly roadMat: any;
  private readonly dirtMat: any;

  stats = { active: 0, built: 0, disposed: 0 };

  constructor(scene: any, opts: TileGridOptions = {}) {
    this.tileSize = opts.tileSize ?? 24;
    this.radius = opts.radius ?? 2;
    this.lookAhead = opts.lookAheadMeters ?? 40;

    this.root = new THREE.Group();
    this.root.name = 'TileGrid';
    scene.add(this.root);

    this.white = new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.88,
      metalness: 0.02,
    });
    this.whiteAlt = new THREE.MeshStandardMaterial({
      color: 0xe8e4dc,
      roughness: 0.9,
      metalness: 0.02,
    });
    this.roof = new THREE.MeshStandardMaterial({
      color: 0xd9d2c5,
      roughness: 0.95,
    });
    this.roadMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      roughness: 0.95,
    });
    this.dirtMat = new THREE.MeshStandardMaterial({
      color: 0xc4a574,
      roughness: 1,
    });
  }

  /** World (Three.js meters) → tile index */
  worldToTile(x: number, z: number): TileCoord {
    return {
      ix: Math.floor(x / this.tileSize),
      iz: Math.floor(z / this.tileSize),
    };
  }

  /**
   * Call each frame with car position (Three.js meters) and optional
   * forward direction for predictive loading.
   */
  update(
    carX: number,
    carZ: number,
    forwardX = 0,
    forwardZ = 1,
    now = performance.now()
  ) {
    this.frame++;
    const center = this.worldToTile(carX, carZ);

    // Predictive: extra tile along velocity
    const len = Math.hypot(forwardX, forwardZ) || 1;
    const ax = carX + (forwardX / len) * this.lookAhead;
    const az = carZ + (forwardZ / len) * this.lookAhead;
    const ahead = this.worldToTile(ax, az);

    const needed = new Set<string>();
    const r = this.radius;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        needed.add(keyOf(center.ix + dx, center.iz + dz));
        needed.add(keyOf(ahead.ix + dx, ahead.iz + dz));
      }
    }
    // Always keep origin neighborhood (spawn)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        needed.add(keyOf(dx, dz));
      }
    }

    // Build missing
    for (const k of needed) {
      if (this.tiles.has(k)) {
        const t = this.tiles.get(k)!;
        t.lastUsed = now;
        // Distance-based LOD
        const [ix, iz] = k.split(',').map(Number);
        const dist =
          Math.abs(ix - center.ix) + Math.abs(iz - center.iz);
        const want: LodLevel = dist <= 1 ? 0 : 1;
        if (t.lod !== want) {
          this.disposeTile(t);
          this.tiles.delete(k);
          this.buildTile(ix, iz, want, now);
        }
        continue;
      }
      const [ix, iz] = k.split(',').map(Number);
      const dist = Math.abs(ix - center.ix) + Math.abs(iz - center.iz);
      this.buildTile(ix, iz, dist <= 1 ? 0 : 1, now);
    }

    // Evict far tiles
    for (const [k, t] of this.tiles) {
      if (!needed.has(k)) {
        this.disposeTile(t);
        this.tiles.delete(k);
        this.stats.disposed++;
      }
    }

    this.stats.active = this.tiles.size;
  }

  private buildTile(ix: number, iz: number, lod: LodLevel, now: number) {
    const group = new THREE.Group();
    group.name = `tile_${ix}_${iz}_lod${lod}`;
    const ox = ix * this.tileSize + this.tileSize * 0.5;
    const oz = iz * this.tileSize + this.tileSize * 0.5;

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.tileSize * 0.98, this.tileSize * 0.98),
      this.dirtMat
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(ox, 0.01, oz);
    group.add(ground);

    // Road cross on every other tile
    if ((ix + iz) % 2 === 0) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(this.tileSize * 0.9, 4),
        this.roadMat
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(ox, 0.03, oz);
      group.add(road);
    }

    const seedBase = ix * 73856093 + iz * 19349663;
    const houseCount = lod === 0 ? 3 + Math.floor(seeded(seedBase) * 3) : 1;

    for (let i = 0; i < houseCount; i++) {
      const s = seedBase + i * 17;
      const hx = ox + (seeded(s) - 0.5) * this.tileSize * 0.7;
      const hz = oz + (seeded(s + 1) - 0.5) * this.tileSize * 0.7;
      if (lod === 0) {
        const w = 3 + seeded(s + 2) * 3;
        const d = 3 + seeded(s + 3) * 3;
        const floors = 1 + Math.floor(seeded(s + 4) * 3);
        const h = 2.2 * floors;
        const mat = seeded(s + 5) > 0.5 ? this.white : this.whiteAlt;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        body.position.set(hx, h / 2, hz);
        group.add(body);
        const rf = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.25, 0.12, d + 0.25),
          this.roof
        );
        rf.position.set(hx, h + 0.06, hz);
        group.add(rf);
      } else {
        // Low LOD: single box impostor
        const h = 3 + seeded(s + 2) * 4;
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(4, h, 4),
          this.whiteAlt
        );
        body.position.set(hx, h / 2, hz);
        group.add(body);
      }
    }

    this.root.add(group);
    this.tiles.set(keyOf(ix, iz), {
      key: keyOf(ix, iz),
      ix,
      iz,
      group,
      lod,
      lastUsed: now,
    });
    this.stats.built++;
  }

  private disposeTile(t: TileEntry) {
    this.root.remove(t.group);
    t.group.traverse((obj: any) => {
      if (obj.geometry) obj.geometry.dispose();
      // materials shared — do not dispose
    });
  }
}
