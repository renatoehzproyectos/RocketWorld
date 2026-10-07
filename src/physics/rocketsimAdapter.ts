/**
 * RocketSim JS adapter contract — matches public/wasm/rocketsim.js exactly.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rot9 {
  get(i: number): number;
  size(): number;
  delete(): void;
}

export interface CarState {
  id: number;
  pos: Vec3;
  vel: Vec3;
  angVel: Vec3;
  rot: Rot9;
  boost: number;
  isOnGround: boolean;
  hasJumped: boolean;
  hasDoubleJumped: boolean;
  hasFlipped: boolean;
  isFlipping: boolean;
  isJumping: boolean;
  isSupersonic: boolean;
}

export interface BallState {
  pos: Vec3;
  vel: Vec3;
  angVel: Vec3;
  rot: Rot9;
  radius: number;
}

export interface HitboxSize {
  x: number;
  y: number;
  z: number;
}

export interface RocketSimModule {
  memory: WebAssembly.Memory;
  wasmMemory: WebAssembly.Memory;
  init(): void;
  createArena(): void;
  addCar(team: number): number;
  setCarControls(
    id: number,
    throttle: number,
    steer: number,
    pitch: number,
    yaw: number,
    roll: number,
    jump: boolean,
    boost: boolean,
    handbrake: boolean
  ): void;
  step(n?: number): void;
  getBallState(): BallState;
  getCarState(id: number): CarState | null;
  setCarState(
    id: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number
  ): void;
  resetBall(): void;
  setBallState(
    x: number,
    y: number,
    z: number,
    vx?: number,
    vy?: number,
    vz?: number
  ): void;
  setCarPose(
    id: number,
    x: number,
    y: number,
    z: number,
    yaw?: number,
    vx?: number,
    vy?: number,
    vz?: number
  ): void;
  setCarBoost(id: number, boost: number): void;
  getOctaneHitboxSize(): HitboxSize;
  getBallStatePtr(): number;
  getCarStatePtr(id: number): number;
}

export async function loadRocketSimModule(): Promise<RocketSimModule> {
  const url = '/wasm/rocketsim.js';
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (!head || !head.ok) {
    throw new Error(
      'rocketsim.js not found at public/wasm/rocketsim.js — copy the proven dist files'
    );
  }
  const mod = await import(/* @vite-ignore */ url);
  const factory = (mod as any).default ?? (mod as any).RocketSimModule ?? mod;
  const Module = await factory();
  return Module as RocketSimModule;
}
