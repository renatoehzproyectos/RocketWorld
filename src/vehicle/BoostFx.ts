/**
 * Proven boost trail (game.js "Gold Rush" style).
 * Visual only — RocketSim owns boost amount / active flag.
 */

import { UU_TO_M } from '../core/coords';

declare const THREE: any;

const TRAIL_N = 150;
const TRAIL_LIFE = 0.5;
const TRAIL_RATE = 260;
const SIZE0 = 22 * UU_TO_M;
const SIZE1 = 105 * UU_TO_M;

export class BoostFx {
  private readonly boostFx: any;
  private readonly boostLight: any;
  private boostLevel = 0;
  private readonly trail: {
    sp: any;
    age: number;
    vx: number;
    vy: number;
    vz: number;
    rot: number;
  }[] = [];
  private trailIdx = 0;
  private spawnAcc = 0;
  private side = 1;
  private havePrev = false;
  private readonly _prevP = new THREE.Vector3();
  private readonly _curP = new THREE.Vector3();
  private readonly _bwd = new THREE.Vector3();
  private readonly _side = new THREE.Vector3();
  private readonly _tmpC = new THREE.Color();
  private readonly cYoung = new THREE.Color(0xffe27a);
  private readonly cMid = new THREE.Color(0xffae00);
  private readonly cOld = new THREE.Color(0xff5a00);

  constructor(carMesh: any, hitboxUU: { x: number; y: number; z: number }, scene: any) {
    this.boostFx = new THREE.Group();
    this.boostFx.position.set(
      -hitboxUU.x * 0.5 * UU_TO_M,
      -hitboxUU.z * 0.1 * UU_TO_M,
      0
    );
    carMesh.add(this.boostFx);

    this.boostLight = new THREE.PointLight(0xffb020, 0, 14, 1.6);
    carMesh.add(this.boostLight);

    const trailTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0.0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(255,255,255,0.9)');
      gr.addColorStop(0.65, 'rgba(255,255,255,0.28)');
      gr.addColorStop(1.0, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();

    for (let i = 0; i < TRAIL_N; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: trailTex,
          blending: THREE.NormalBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0,
        })
      );
      sp.visible = false;
      scene.add(sp);
      this.trail.push({ sp, age: TRAIL_LIFE, vx: 0, vy: 0, vz: 0, rot: 0 });
    }
  }

  update(active: boolean, dt: number) {
    this.boostLevel += ((active ? 1 : 0) - this.boostLevel) * Math.min(dt * 14, 1);
    this.boostLight.intensity = this.boostLevel * 3;

    this.boostFx.updateWorldMatrix(true, false);
    this.boostFx.getWorldPosition(this._curP);

    if (active) {
      this._bwd.set(-1, 0, 0).transformDirection(this.boostFx.parent.matrixWorld);
      this._side.set(0, 0, 1).transformDirection(this.boostFx.parent.matrixWorld);
      if (!this.havePrev) this._prevP.copy(this._curP);
      this.spawnAcc += TRAIL_RATE * dt;
      const n = Math.min(Math.floor(this.spawnAcc), 10);
      this.spawnAcc -= n;
      for (let i = 0; i < n; i++) {
        const p = this.trail[this.trailIdx++ % TRAIL_N];
        const t = (i + 1) / (n + 1);
        p.sp.position.lerpVectors(this._prevP, this._curP, t);
        p.sp.position.x += (Math.random() - 0.5) * 0.15;
        p.sp.position.y += (Math.random() - 0.5) * 0.1;
        p.sp.position.z += (Math.random() - 0.5) * 0.15;
        // Drift slightly backward
        p.vx = this._bwd.x * (2 + Math.random() * 4) + this._side.x * this.side * 0.8;
        p.vy = this._bwd.y * (2 + Math.random() * 4) + 0.5;
        p.vz = this._bwd.z * (2 + Math.random() * 4) + this._side.z * this.side * 0.8;
        p.age = 0;
        p.rot = Math.random() * 6.28;
        p.sp.visible = true;
        this.side = -this.side;
      }
      this._prevP.copy(this._curP);
      this.havePrev = true;
    } else {
      this.havePrev = false;
    }

    for (const p of this.trail) {
      if (p.age >= TRAIL_LIFE) {
        if (p.sp.visible) p.sp.visible = false;
        continue;
      }
      p.age += dt;
      const t = p.age / TRAIL_LIFE;
      p.sp.position.x += p.vx * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      const sc = SIZE0 + (SIZE1 - SIZE0) * t;
      p.sp.scale.set(sc, sc, 1);
      if (t < 0.35) this._tmpC.copy(this.cYoung).lerp(this.cMid, t / 0.35);
      else this._tmpC.copy(this.cMid).lerp(this.cOld, (t - 0.35) / 0.65);
      p.sp.material.color.copy(this._tmpC);
      p.sp.material.rotation = p.rot + t * 1.5;
      p.sp.material.opacity = 0.5 * Math.min(t * 12, 1) * Math.pow(1 - t, 0.9);
      if (p.age >= TRAIL_LIFE) p.sp.visible = false;
    }
  }
}
