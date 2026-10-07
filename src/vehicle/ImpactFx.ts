/**
 * Proven hit sparks + fire burst frames (game.js).
 * Triggers on hard ground landings / speed impacts (visual only).
 */

import { rsToThreeInto } from '../core/coords';

declare const THREE: any;

const SPARK_POOL = 12;
const FX_COLS = 26;
const FX_W = 578;
const FX_H = 292;
const FX_CELL = FX_W / FX_COLS;
const FX_Y0 = 47;
const FX_HH = 28;
const FX_FRAMES = 17;

export class ImpactFx {
  private readonly sparks: {
    sprite: any;
    life: number;
    maxLife: number;
    baseScale: number;
    rotSpeed: number;
    vx: number;
    vy: number;
    vz: number;
  }[] = [];
  private readonly bursts: { sp: any; t: any; life: number; max: number; size: number }[] = [];
  private burstIdx = 0;
  private sparkIdx = 0;
  private readonly sparkLight: any;
  private sparkLightLife = 0;
  private wasOnGround = true;
  private readonly _p = { x: 0, y: 0, z: 0 };

  constructor(scene: any) {
    const loader = new THREE.TextureLoader();
    const sparkTex = loader.load('/assets/spark.webp');
    if ('encoding' in sparkTex) sparkTex.encoding = THREE.sRGBEncoding ?? 3001;

    const baseMat = new THREE.SpriteMaterial({
      map: sparkTex,
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });

    for (let i = 0; i < SPARK_POOL; i++) {
      const s = new THREE.Sprite(baseMat.clone());
      s.visible = false;
      s.scale.set(0.01, 0.01, 1);
      scene.add(s);
      this.sparks.push({
        sprite: s,
        life: 0,
        maxLife: 0.42,
        baseScale: 5,
        rotSpeed: 0,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }

    for (let i = 0; i < 4; i++) {
      const t = loader.load('/assets/fx_sheet.png');
      if ('encoding' in t) t.encoding = THREE.sRGBEncoding ?? 3001;
      t.repeat.set(FX_CELL / FX_W, FX_HH / FX_H);
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: t,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 1,
        })
      );
      sp.visible = false;
      scene.add(sp);
      this.bursts.push({ sp, t, life: 0, max: 0.5, size: 4 });
    }

    this.sparkLight = new THREE.PointLight(0xffcc66, 0, 18, 2);
    scene.add(this.sparkLight);
  }

  /** Call each frame with physics ground flag and car pos (UU) + vertical speed UU */
  update(
    onGround: boolean,
    carPosUU: { x: number; y: number; z: number },
    velUU: { x: number; y: number; z: number },
    dt: number
  ) {
    // Landing impact: was airborne, now grounded, with downward speed
    if (onGround && !this.wasOnGround) {
      const impact = Math.abs(velUU.z);
      if (impact > 200) {
        const intensity = Math.min(1.5, impact / 1200);
        this.spawnAt(carPosUU.x, carPosUU.y, carPosUU.z, intensity);
      }
    }
    // High horizontal scrape while grounded
    if (onGround) {
      const hs = Math.hypot(velUU.x, velUU.y);
      if (hs > 1800 && Math.random() < dt * 8) {
        this.spawnSpark(
          carPosUU.x + (Math.random() - 0.5) * 40,
          carPosUU.y + (Math.random() - 0.5) * 40,
          carPosUU.z + 5,
          0.4
        );
      }
    }
    this.wasOnGround = onGround;

    this.sparkLightLife = Math.max(0, this.sparkLightLife - dt);
    if (this.sparkLightLife <= 0) this.sparkLight.intensity = 0;
    else this.sparkLight.intensity *= Math.max(0, 1 - dt * 6);

    for (const sp of this.sparks) {
      if (sp.life <= 0) {
        if (sp.sprite.visible) sp.sprite.visible = false;
        continue;
      }
      sp.life -= dt;
      sp.sprite.position.x += sp.vx * dt;
      sp.sprite.position.y += sp.vy * dt;
      sp.sprite.position.z += sp.vz * dt;
      sp.vy -= 9 * dt;
      const t = 1 - Math.max(sp.life, 0) / sp.maxLife;
      const fade = t < 0.18 ? 1 : Math.pow(1 - (t - 0.18) / 0.82, 1.4);
      sp.sprite.material.opacity = fade;
      const sc = sp.baseScale * (0.55 + t * 1.2) * UU_SCALE;
      sp.sprite.scale.set(sc, sc, 1);
      sp.sprite.material.rotation += sp.rotSpeed * dt;
      if (sp.life <= 0) sp.sprite.visible = false;
    }

    for (const b of this.bursts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.sp.visible = false;
        continue;
      }
      const f = Math.min(FX_FRAMES - 1, Math.floor((1 - b.life / b.max) * FX_FRAMES));
      b.t.offset.set((f * FX_CELL) / FX_W, 1 - (FX_Y0 + FX_HH) / FX_H);
      b.sp.scale.set(b.size * (FX_CELL / FX_HH), b.size, 1);
      b.sp.material.opacity = 0.85 * Math.min(1, (b.life / b.max) * 2.2);
    }
  }

  private spawnAt(x: number, y: number, z: number, intensity: number) {
    const n = Math.min(SPARK_POOL, 4 + Math.floor(intensity * 6));
    for (let i = 0; i < n; i++) {
      this.spawnSpark(x, y, z, intensity);
    }
    this.spawnBurst(x, y, z, intensity);
    rsToThreeInto(x, y, z, this._p);
    this.sparkLight.position.set(this._p.x, this._p.y + 0.5, this._p.z);
    this.sparkLight.intensity = 4 * intensity;
    this.sparkLightLife = 0.25 * intensity;
  }

  private spawnSpark(x: number, y: number, z: number, intensity: number) {
    const sp = this.sparks[this.sparkIdx++ % SPARK_POOL];
    rsToThreeInto(x, y, z, this._p);
    sp.sprite.position.set(this._p.x, this._p.y + 0.05, this._p.z);
    sp.life = sp.maxLife * (0.7 + Math.random() * 0.4);
    sp.baseScale = 3 + intensity * 4;
    sp.rotSpeed = (Math.random() - 0.5) * 12;
    sp.vx = (Math.random() - 0.5) * 8 * intensity;
    sp.vy = 2 + Math.random() * 6 * intensity;
    sp.vz = (Math.random() - 0.5) * 8 * intensity;
    sp.sprite.visible = true;
    sp.sprite.material.opacity = 1;
  }

  private spawnBurst(x: number, y: number, z: number, intensity: number) {
    const b = this.bursts[this.burstIdx++ % this.bursts.length];
    rsToThreeInto(x, y, z, this._p);
    b.sp.position.set(this._p.x, this._p.y + 0.2, this._p.z);
    b.size = 1.8 + intensity * 2.0;
    b.life = b.max;
    b.sp.visible = true;
  }
}

// Local scale helper (spark sizes in approximate meters)
const UU_SCALE = 1 / 50;
