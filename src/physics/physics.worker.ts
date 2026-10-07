/**
 * CHUNK 06 — Physics worker (module worker)
 * Loads proven rocketsim.js factory off the main thread.
 */

/// <reference lib="webworker" />

export type WorkerIn =
  | { type: 'INIT'; wasmJsUrl: string }
  | {
      type: 'INPUT';
      carId: number;
      throttle: number;
      steer: number;
      pitch: number;
      yaw: number;
      roll: number;
      jump: boolean;
      boost: boolean;
      handbrake: boolean;
    }
  | { type: 'STEP'; steps: number; tick: number }
  | { type: 'RESET'; carId: number };

export type WorkerOut =
  | { type: 'READY'; carId: number; hitbox: { x: number; y: number; z: number } }
  | {
      type: 'STATE';
      tick: number;
      pos: { x: number; y: number; z: number };
      vel: { x: number; y: number; z: number };
      rot: number[];
      boost: number;
      isOnGround: boolean;
      isSupersonic: boolean;
    }
  | { type: 'ERROR'; message: string };

declare const self: DedicatedWorkerGlobalScope;

let Module: any = null;
let carId = 0;

function packState(tick: number): WorkerOut {
  const cs = Module.getCarState(carId);
  if (!cs) return { type: 'ERROR', message: 'getCarState null' };
  const rot: number[] = new Array(9);
  for (let i = 0; i < 9; i++) rot[i] = cs.rot.get(i);
  if (typeof cs.rot.delete === 'function') cs.rot.delete();
  return {
    type: 'STATE',
    tick,
    pos: { x: cs.pos.x, y: cs.pos.y, z: cs.pos.z },
    vel: { x: cs.vel.x, y: cs.vel.y, z: cs.vel.z },
    rot,
    boost: cs.boost,
    isOnGround: !!cs.isOnGround,
    isSupersonic: !!cs.isSupersonic,
  };
}

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'INIT') {
      const mod = await import(/* @vite-ignore */ msg.wasmJsUrl);
      const factory =
        (mod as any).default ?? (mod as any).RocketSimModule ?? mod;
      Module = await factory();
      Module.init();
      Module.createArena();
      carId = Module.addCar(0);
      Module.setCarState(carId, 0, 0, 50, 0, 0, 0);
      Module.setCarBoost(carId, 100);
      const hb = Module.getOctaneHitboxSize();
      const out: WorkerOut = {
        type: 'READY',
        carId,
        hitbox: { x: hb.x, y: hb.y, z: hb.z },
      };
      self.postMessage(out);
      return;
    }

    if (!Module) {
      self.postMessage({ type: 'ERROR', message: 'Not initialized' });
      return;
    }

    if (msg.type === 'INPUT') {
      Module.setCarControls(
        msg.carId,
        msg.throttle,
        msg.steer,
        msg.pitch,
        msg.yaw,
        msg.roll,
        msg.jump,
        msg.boost,
        msg.handbrake
      );
      return;
    }

    if (msg.type === 'STEP') {
      Module.step(msg.steps);
      self.postMessage(packState(msg.tick));
      return;
    }

    if (msg.type === 'RESET') {
      Module.setCarState(msg.carId, 0, 0, 50, 0, 0, 0);
      Module.setCarBoost(msg.carId, 100);
      self.postMessage(packState(0));
      return;
    }
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      message: String(err?.message || err),
    });
  }
};
