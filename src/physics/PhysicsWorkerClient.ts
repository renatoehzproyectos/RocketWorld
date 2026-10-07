/**
 * CHUNK 06 — Main-thread client for physics.worker
 * Falls back to main-thread Module if Worker fails (CHUNK 00 safety).
 */

import type { WorkerIn, WorkerOut } from './physics.worker';
import { loadRocketSimModule, type RocketSimModule } from './rocketsimAdapter';

export interface PackedCarState {
  tick: number;
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  rot: number[];
  boost: number;
  isOnGround: boolean;
  isSupersonic: boolean;
}

export class PhysicsWorkerClient {
  private worker: Worker | null = null;
  private mainModule: RocketSimModule | null = null;
  private mode: 'worker' | 'main' = 'main';
  carId = 0;
  hitbox = { x: 118, y: 84, z: 36 };
  private pendingStep: {
    resolve: (s: PackedCarState) => void;
    reject: (e: Error) => void;
  } | null = null;
  private tick = 0;
  private lastState: PackedCarState | null = null;

  async init(): Promise<{ mode: 'worker' | 'main' }> {
    // Try worker first
    try {
      this.worker = new Worker(
        new URL('./physics.worker.ts', import.meta.url),
        { type: 'module' }
      );
      const ready = await new Promise<WorkerOut>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Worker INIT timeout')), 15000);
        this.worker!.onmessage = (ev: MessageEvent<WorkerOut>) => {
          if (ev.data.type === 'READY' || ev.data.type === 'ERROR') {
            clearTimeout(t);
            resolve(ev.data);
          }
        };
        this.worker!.onerror = (e) => {
          clearTimeout(t);
          reject(e.error || new Error('Worker error'));
        };
        const msg: WorkerIn = {
          type: 'INIT',
          wasmJsUrl: `${location.origin}/wasm/rocketsim.js`,
        };
        this.worker!.postMessage(msg);
      });

      if (ready.type === 'ERROR') throw new Error(ready.message);
      if (ready.type !== 'READY') throw new Error('Unexpected worker reply');

      this.carId = ready.carId;
      this.hitbox = ready.hitbox;
      this.mode = 'worker';

      this.worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
        const d = ev.data;
        if (d.type === 'STATE' && this.pendingStep) {
          const st: PackedCarState = {
            tick: d.tick,
            pos: d.pos,
            vel: d.vel,
            rot: d.rot,
            boost: d.boost,
            isOnGround: d.isOnGround,
            isSupersonic: d.isSupersonic,
          };
          this.lastState = st;
          this.pendingStep.resolve(st);
          this.pendingStep = null;
        } else if (d.type === 'ERROR' && this.pendingStep) {
          this.pendingStep.reject(new Error(d.message));
          this.pendingStep = null;
        }
      };

      console.log('[PhysicsWorkerClient] Worker mode OK');
      return { mode: 'worker' };
    } catch (e) {
      console.warn('[PhysicsWorkerClient] Worker failed, main-thread fallback:', e);
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }
    }

    // Fallback — proven main-thread path
    this.mainModule = await loadRocketSimModule();
    this.mainModule.init();
    this.mainModule.createArena();
    this.carId = this.mainModule.addCar(0);
    this.mainModule.setCarState(this.carId, 0, 0, 50, 0, 0, 0);
    this.mainModule.setCarBoost(this.carId, 100);
    const hb = this.mainModule.getOctaneHitboxSize();
    this.hitbox = { x: hb.x, y: hb.y, z: hb.z };
    this.mode = 'main';
    console.log('[PhysicsWorkerClient] Main-thread mode OK');
    return { mode: 'main' };
  }

  setControls(
    throttle: number,
    steer: number,
    pitch: number,
    yaw: number,
    roll: number,
    jump: boolean,
    boost: boolean,
    handbrake: boolean
  ) {
    if (this.mode === 'worker' && this.worker) {
      const msg: WorkerIn = {
        type: 'INPUT',
        carId: this.carId,
        throttle,
        steer,
        pitch,
        yaw,
        roll,
        jump,
        boost,
        handbrake,
      };
      this.worker.postMessage(msg);
      return;
    }
    this.mainModule!.setCarControls(
      this.carId,
      throttle,
      steer,
      pitch,
      yaw,
      roll,
      jump,
      boost,
      handbrake
    );
  }

  /** Step physics N ticks; returns packed state */
  async step(steps: number): Promise<PackedCarState> {
    this.tick += steps;
    if (this.mode === 'worker' && this.worker) {
      return new Promise<PackedCarState>((resolve, reject) => {
        this.pendingStep = { resolve, reject };
        const msg: WorkerIn = { type: 'STEP', steps, tick: this.tick };
        this.worker!.postMessage(msg);
      });
    }
    this.mainModule!.step(steps);
    const cs = this.mainModule!.getCarState(this.carId)!;
    const rot: number[] = new Array(9);
    for (let i = 0; i < 9; i++) rot[i] = cs.rot.get(i);
    if (typeof cs.rot.delete === 'function') cs.rot.delete();
    const st: PackedCarState = {
      tick: this.tick,
      pos: { x: cs.pos.x, y: cs.pos.y, z: cs.pos.z },
      vel: { x: cs.vel.x, y: cs.vel.y, z: cs.vel.z },
      rot,
      boost: cs.boost,
      isOnGround: !!cs.isOnGround,
      isSupersonic: !!cs.isSupersonic,
    };
    this.lastState = st;
    return st;
  }

  get last() {
    return this.lastState;
  }

  get physicsMode() {
    return this.mode;
  }
}
