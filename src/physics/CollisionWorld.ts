/**
 * CHUNK 09 — Collision world
 *
 * RULE (MASTER): visual meshes are NEVER the physics colliders.
 *
 * RocketSim WASM already owns collision via createArena() (Soccar meshes).
 * This module:
 *  1. Documents the field dimensions that match the WASM arena
 *  2. Builds cheap *visual* proxies so the player sees walls/floor
 *  3. Exposes metadata for future custom collision streaming
 *
 * Do NOT feed these meshes into RocketSim. Physics authority stays in WASM.
 */

import { UU_TO_M } from '../core/coords';

declare const THREE: any;

/** Soccar field half-extents in RocketSim UU (from proven game.js) */
export const FIELD = {
  HALF_X: 4096,
  HALF_Y: 5120,
  CEILING_Z: 2048,
  CORNER_CUT: 1629.174 * Math.SQRT1_2, // ≈ 1152
  GOAL_HALF_WIDTH: 892.755,
  GOAL_HEIGHT: 642.775,
  GOAL_DEPTH: 880,
} as const;

export interface CollisionManifest {
  source: 'rocketsim-arena';
  note: string;
  fieldUU: typeof FIELD;
  visualOnly: string[];
}

/**
 * Build translucent visual proxies for the arena.
 * These are render-only — RocketSim uses its own collision meshes.
 */
export function buildArenaVisuals(scene: any): any {
  const group = new THREE.Group();
  group.name = 'ArenaVisualProxies';
  scene.add(group);

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a2a1a,
    roughness: 0.95,
    metalness: 0,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2a3a4a,
    roughness: 0.8,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const lineMat = new THREE.LineBasicMaterial({ color: 0x4a6a5a });

  // Floor visual (covers field)
  const floorW = FIELD.HALF_X * 2 * UU_TO_M;
  const floorL = FIELD.HALF_Y * 2 * UU_TO_M;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorW, floorL),
    floorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  group.add(floor);

  // Midline
  const midPts = [
    new THREE.Vector3(-FIELD.HALF_X * UU_TO_M, 0.02, 0),
    new THREE.Vector3(FIELD.HALF_X * UU_TO_M, 0.02, 0),
  ];
  group.add(
    new THREE.Line(new THREE.BufferGeometry().setFromPoints(midPts), lineMat)
  );

  // Side walls (X = ±HALF_X) — visual only
  const wallH = FIELD.CEILING_Z * UU_TO_M;
  const sideLen = 2 * (FIELD.HALF_Y - FIELD.CORNER_CUT) * UU_TO_M;
  const sideGeo = new THREE.PlaneGeometry(sideLen, wallH);
  for (const sx of [1, -1]) {
    const w = new THREE.Mesh(sideGeo, wallMat);
    w.position.set(sx * FIELD.HALF_X * UU_TO_M, wallH / 2, 0);
    w.rotation.y = Math.PI / 2;
    group.add(w);
  }

  // End walls (Y = ±HALF_Y) with rough goal cut — visual only
  const endLen = 2 * (FIELD.HALF_X - FIELD.CORNER_CUT) * UU_TO_M;
  const endGeo = new THREE.PlaneGeometry(endLen, wallH);
  for (const sy of [1, -1]) {
    const w = new THREE.Mesh(endGeo, wallMat);
    // RocketSim Y → Three -Z
    w.position.set(0, wallH / 2, -sy * FIELD.HALF_Y * UU_TO_M);
    group.add(w);
  }

  // Grid for scale (smaller than full field for readability near spawn)
  group.add(new THREE.GridHelper(40, 20, 0x334455, 0x223344));

  return group;
}

export function getCollisionManifest(): CollisionManifest {
  return {
    source: 'rocketsim-arena',
    note:
      'Physics collision is owned by RocketSim createArena() (Soccar meshes inside WASM). ' +
      'Three.js meshes in ArenaVisualProxies are render-only and must never be used as colliders.',
    fieldUU: FIELD,
    visualOnly: [
      'floor plane',
      'side walls',
      'end walls',
      'grid helper',
    ],
  };
}
