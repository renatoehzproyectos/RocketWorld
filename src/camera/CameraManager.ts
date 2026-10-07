/**
 * CHUNK 15 — Camera
 * Chase / air camera that sells scale (reference image: high aerial over coastal city).
 * Units: physics side in RocketSim UU; output applied in Three.js after rsToThreeInto.
 */

import { UU_TO_M, rsToThreeInto } from '../core/coords';

declare const THREE: any;

const DEG = Math.PI / 180;

/** Proven baseline (game.js) — distance/height in UU */
export const CAM_PRESETS = {
  pro: {
    fov: 110,
    distance: 260,
    height: 90,
    angle: -4.0,
    stiffness: 0.45,
    swivel: 4.3,
    transition: 1.3,
  },
  /** Higher / farther — closer to the reference aerial shot */
  aerial: {
    fov: 95,
    distance: 420,
    height: 180,
    angle: -12.0,
    stiffness: 0.35,
    swivel: 3.2,
    transition: 1.0,
  },
  zen: {
    fov: 110,
    distance: 270,
    height: 100,
    angle: -3.0,
    stiffness: 0.35,
    swivel: 4.0,
    transition: 1.2,
  },
} as const;

export type CamPresetName = keyof typeof CAM_PRESETS;

export interface CamConfig {
  fov: number;
  distance: number;
  height: number;
  angle: number;
  stiffness: number;
  swivel: number;
  transition: number;
}

const CAM_MIN_HEIGHT_UU = 50;

function angDiff(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export class CameraManager {
  readonly camera: any;
  private cfg: CamConfig;
  private smoothedYaw = 0;
  private hasYaw = false;
  private lastCarPos = { x: 0, y: 0, z: 0 };
  private hasLast = false;
  private readonly _posUU = { x: 0, y: 0, z: 0 };
  private readonly _three = { x: 0, y: 0, z: 0 };
  private readonly _lookThree = { x: 0, y: 0, z: 0 };
  private airBlend = 0; // 0 ground chase → 1 airborne cinematic

  constructor(aspect: number, preset: CamPresetName = 'aerial') {
    this.cfg = { ...CAM_PRESETS[preset] };
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 4000);
    this.applyFov(aspect);
  }

  setPreset(name: CamPresetName) {
    this.cfg = { ...CAM_PRESETS[name] };
  }

  private applyFov(aspect: number) {
    // Horizontal-ish FOV adaptation (proven project style)
    const effAspect = Math.max(aspect, 0.5);
    this.camera.fov =
      ((2 * Math.atan(Math.tan((this.cfg.fov * DEG) / 2) / effAspect)) / DEG);
    this.camera.updateProjectionMatrix();
  }

  onResize(width: number, height: number) {
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.applyFov(aspect);
  }

  /**
   * @param carPosUU RocketSim position
   * @param forwardUU flat forward on XY plane (RocketSim), length ~1
   * @param upZ RocketSim up.z component (≈1 upright)
   * @param onGround from physics
   * @param boostActive boost for slight FOV punch
   * @param dt seconds
   */
  update(
    carPosUU: { x: number; y: number; z: number },
    forwardUU: { x: number; y: number },
    upZ: number,
    onGround: boolean,
    boostActive: boolean,
    dt: number
  ) {
    dt = Math.min(Math.max(dt, 0), 0.05);

    // Blend toward aerial when airborne (reference image feel)
    const airTarget = onGround ? 0 : 1;
    this.airBlend += (airTarget - this.airBlend) * Math.min(1, dt * 2.5);

    const dist =
      this.cfg.distance * (1 + this.airBlend * 0.55) * (boostActive ? 1.08 : 1);
    const height =
      this.cfg.height * (1 + this.airBlend * 0.85) * (boostActive ? 1.05 : 1);
    const angle = this.cfg.angle - this.airBlend * 8;

    if (!this.hasLast) {
      this.lastCarPos.x = carPosUU.x;
      this.lastCarPos.y = carPosUU.y;
      this.lastCarPos.z = carPosUU.z;
      this.hasLast = true;
    }

    let mx = carPosUU.x - this.lastCarPos.x;
    let my = carPosUU.y - this.lastCarPos.y;
    let moved = Math.hypot(mx, my);
    if (moved > 600) moved = 0;

    const heading = Math.atan2(forwardUU.y, forwardUU.x);
    const unstable = upZ < 0.5 || !onGround;
    let desired = heading;

    if (unstable && moved > 5) {
      desired = Math.atan2(my, mx);
    } else if (moved > 2) {
      // Detect reverse: movement opposite to forward
      const dot = mx * forwardUU.x + my * forwardUU.y;
      if (dot < -0.3 * moved) desired = heading + Math.PI;
    }

    if (!this.hasYaw) {
      this.smoothedYaw = desired;
      this.hasYaw = true;
    }
    const swivel = unstable ? this.cfg.swivel * 0.4 : this.cfg.swivel;
    this.smoothedYaw += angDiff(this.smoothedYaw, desired) * Math.min(1, swivel * dt);

    const cx = Math.cos(this.smoothedYaw);
    const cy = Math.sin(this.smoothedYaw);

    this._posUU.x = carPosUU.x - cx * dist;
    this._posUU.y = carPosUU.y - cy * dist;
    this._posUU.z = Math.max(carPosUU.z + height, CAM_MIN_HEIGHT_UU);

    // Soft follow (stiffness)
    const k = 1 - Math.pow(1 - this.cfg.stiffness, dt * 60);
    // Direct placement with light lag via exponential toward target each frame
    // (simpler than full dual-slot; stable for city scale)
    rsToThreeInto(this._posUU.x, this._posUU.y, this._posUU.z, this._three);
    rsToThreeInto(carPosUU.x, carPosUU.y, carPosUU.z + 30, this._lookThree);

    this.camera.position.x += (this._three.x - this.camera.position.x) * Math.min(1, 0.2 + k);
    this.camera.position.y += (this._three.y - this.camera.position.y) * Math.min(1, 0.2 + k);
    this.camera.position.z += (this._three.z - this.camera.position.z) * Math.min(1, 0.2 + k);

    this.camera.lookAt(this._lookThree.x, this._lookThree.y, this._lookThree.z);
    if (angle !== 0) {
      this.camera.rotateX(-angle * DEG);
    }

    // Boost FOV punch
    const baseFov = this.cfg.fov + this.airBlend * 6 + (boostActive ? 4 : 0);
    const effAspect = Math.max(this.camera.aspect, 0.5);
    this.camera.fov =
      ((2 * Math.atan(Math.tan((baseFov * DEG) / 2) / effAspect)) / DEG);
    this.camera.updateProjectionMatrix();

    this.lastCarPos.x = carPosUU.x;
    this.lastCarPos.y = carPosUU.y;
    this.lastCarPos.z = carPosUU.z;
  }
}
