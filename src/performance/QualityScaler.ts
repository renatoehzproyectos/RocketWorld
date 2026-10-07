/**
 * CHUNK 18 — Dynamic resolution / quality for mobile.
 * Drops pixel ratio and tile budget when FPS is low.
 */

export class QualityScaler {
  /** 0.5 .. 1 */
  pixelRatio = 1;
  /** tile radius hint for TileGrid */
  tileRadius = 2;
  private lowFrames = 0;
  private highFrames = 0;

  constructor(private readonly isMobile: boolean) {
    if (isMobile) {
      this.pixelRatio = Math.min(1, window.devicePixelRatio > 2 ? 0.75 : 1);
      this.tileRadius = 1;
    }
  }

  /** Call once per second with measured FPS */
  onFps(fps: number, renderer: any) {
    if (fps < 28) {
      this.lowFrames++;
      this.highFrames = 0;
      if (this.lowFrames >= 2) {
        this.pixelRatio = Math.max(0.5, this.pixelRatio - 0.1);
        this.tileRadius = Math.max(1, this.tileRadius - 1);
        this.lowFrames = 0;
        this.apply(renderer);
      }
    } else if (fps > 50) {
      this.highFrames++;
      this.lowFrames = 0;
      if (this.highFrames >= 4 && this.isMobile) {
        this.pixelRatio = Math.min(1, this.pixelRatio + 0.05);
        this.tileRadius = Math.min(2, this.tileRadius + 1);
        this.highFrames = 0;
        this.apply(renderer);
      }
    } else {
      this.lowFrames = 0;
      this.highFrames = 0;
    }
  }

  apply(renderer: any) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(w, h, false);
  }
}
