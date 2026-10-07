/**
 * CHUNK 07 — Physics ↔ renderer bridge.
 * Proven axis mapping only. Interpolates previous/current for smooth visuals.
 */

import {
  rsToThreeInto,
  rsRotToThreeQuat,
  _tmpPos,
} from '../core/coords';
import type { CarState, RocketSimModule } from './rocketsimAdapter';

declare const THREE: any;

export interface RenderPose {
  position: { x: number; y: number; z: number };
  quaternion: any; // THREE.Quaternion
}

function copyCarState(src: CarState, dst: any) {
  dst.pos.x = src.pos.x;
  dst.pos.y = src.pos.y;
  dst.pos.z = src.pos.z;
  dst.vel.x = src.vel.x;
  dst.vel.y = src.vel.y;
  dst.vel.z = src.vel.z;
  // Snapshot rot9 into plain array so embind delete() is safe
  if (!dst.rot) dst.rot = new Array(9);
  for (let i = 0; i < 9; i++) dst.rot[i] = src.rot.get(i);
  if (typeof src.rot.delete === 'function') src.rot.delete();
  dst.boost = src.boost;
  dst.isOnGround = src.isOnGround;
  dst.isSupersonic = src.isSupersonic;
}

export class PhysicsBridge {
  private prev: any = {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    rot: new Array(9).fill(0),
    boost: 0,
    isOnGround: true,
    isSupersonic: false,
  };
  private curr: any = {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    rot: new Array(9).fill(0),
    boost: 0,
    isOnGround: true,
    isSupersonic: false,
  };

  private readonly quatPrev = new THREE.Quaternion();
  private readonly quatCurr = new THREE.Quaternion();
  private readonly quatOut = new THREE.Quaternion();
  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpX = new THREE.Vector3();
  private readonly tmpY = new THREE.Vector3();
  private readonly tmpZ = new THREE.Vector3();
  private readonly posOut = { x: 0, y: 0, z: 0 };

  private hasPrev = false;

  /** Call once per fixed physics step after Module.step() */
  pushState(Module: RocketSimModule, carId: number) {
    const state = Module.getCarState(carId);
    if (!state) return;

    if (!this.hasPrev) {
      copyCarState(state, this.prev);
      copyCarState(state, this.curr);
      this.hasPrev = true;
      return;
    }

    // shift curr → prev, new → curr
    const tmp = this.prev;
    this.prev = this.curr;
    this.curr = tmp;
    copyCarState(state, this.curr);
  }

  /** Packed state from physics worker (CHUNK 06) */
  pushPacked(st: {
    pos: { x: number; y: number; z: number };
    vel: { x: number; y: number; z: number };
    rot: number[];
    boost: number;
    isOnGround: boolean;
    isSupersonic: boolean;
  }) {
    if (!this.hasPrev) {
      Object.assign(this.prev.pos, st.pos);
      Object.assign(this.prev.vel, st.vel);
      for (let i = 0; i < 9; i++) this.prev.rot[i] = st.rot[i];
      this.prev.boost = st.boost;
      this.prev.isOnGround = st.isOnGround;
      this.prev.isSupersonic = st.isSupersonic;
      Object.assign(this.curr.pos, st.pos);
      Object.assign(this.curr.vel, st.vel);
      for (let i = 0; i < 9; i++) this.curr.rot[i] = st.rot[i];
      this.curr.boost = st.boost;
      this.curr.isOnGround = st.isOnGround;
      this.curr.isSupersonic = st.isSupersonic;
      this.hasPrev = true;
      return;
    }
    const tmp = this.prev;
    this.prev = this.curr;
    this.curr = tmp;
    Object.assign(this.curr.pos, st.pos);
    Object.assign(this.curr.vel, st.vel);
    for (let i = 0; i < 9; i++) this.curr.rot[i] = st.rot[i];
    this.curr.boost = st.boost;
    this.curr.isOnGround = st.isOnGround;
    this.curr.isSupersonic = st.isSupersonic;
  }

  /**
   * alpha in [0,1]: 0 = previous physics state, 1 = current
   * Returns pose in Three.js units/orientation.
   */
  sample(alpha: number): RenderPose {
    const a = Math.min(1, Math.max(0, alpha));

    // Position lerp in RocketSim UU, then convert
    const px = this.prev.pos.x + (this.curr.pos.x - this.prev.pos.x) * a;
    const py = this.prev.pos.y + (this.curr.pos.y - this.prev.pos.y) * a;
    const pz = this.prev.pos.z + (this.curr.pos.z - this.prev.pos.z) * a;
    rsToThreeInto(px, py, pz, this.posOut);

    rsRotToThreeQuat(
      THREE,
      this.prev.rot,
      this.quatPrev,
      this.tmpMat,
      this.tmpX,
      this.tmpY,
      this.tmpZ
    );
    rsRotToThreeQuat(
      THREE,
      this.curr.rot,
      this.quatCurr,
      this.tmpMat,
      this.tmpX,
      this.tmpY,
      this.tmpZ
    );
    this.quatOut.copy(this.quatPrev).slerp(this.quatCurr, a);

    return { position: this.posOut, quaternion: this.quatOut };
  }

  get boost() {
    return this.curr.boost;
  }
  get isOnGround() {
    return this.curr.isOnGround;
  }
  get speedUU() {
    const v = this.curr.vel;
    return Math.hypot(v.x, v.y, v.z);
  }

  get velUU() {
    return this.curr.vel as { x: number; y: number; z: number };
  }

  /** Latest car position in RocketSim UU (for camera) */
  get carPosUU() {
    return this.curr.pos as { x: number; y: number; z: number };
  }

  /**
   * Forward on RocketSim XY from rot9 [forward x,y,z].
   * rot layout: forward(3), right(3), up(3)
   */
  get forwardXY() {
    const r = this.curr.rot as number[];
    return { x: r[0] ?? 1, y: r[1] ?? 0 };
  }

  get upZ() {
    const r = this.curr.rot as number[];
    return r[8] ?? 1;
  }
}
