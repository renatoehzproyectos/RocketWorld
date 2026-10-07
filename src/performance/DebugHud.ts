/**
 * CHUNK 19 — Debug / profiling overlay (toggle with F3).
 */

export class DebugHud {
  private el: HTMLDivElement;
  visible = false;
  private frames = 0;
  private fps = 0;
  private fpsT = performance.now();
  private frameStart = 0;
  private frameMs = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'debugHud';
    this.el.style.cssText = `
      position:fixed;top:8px;left:8px;z-index:20;
      font:12px/1.45 ui-monospace,monospace;color:#c8e6c9;
      background:rgba(0,0,0,0.55);padding:8px 10px;border-radius:6px;
      pointer-events:none;white-space:pre;display:none;
      text-shadow:0 1px 2px #000;
    `;
    document.body.appendChild(this.el);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.visible = !this.visible;
        this.el.style.display = this.visible ? 'block' : 'none';
      }
    });
  }

  beginFrame(now: number) {
    this.frameStart = now;
  }

  tick(now: number) {
    this.frameMs = now - this.frameStart;
    this.frames++;
    if (now - this.fpsT >= 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.fpsT = now;
    }
  }

  update(info: {
    speedMs: number;
    boost: number;
    grounded: boolean;
    pos: { x: number; y: number; z: number };
    physicsSteps?: number;
    physicsMode?: string;
    tilesActive?: number;
    tilesBuilt?: number;
    tilesDisposed?: number;
    pixelRatio?: number;
    tileRadius?: number;
  }) {
    if (!this.visible) return;
    let mem = '';
    const perf = performance as any;
    if (perf && perf.memory) {
      const u = perf.memory.usedJSHeapSize / 1048576;
      const t = perf.memory.totalJSHeapSize / 1048576;
      mem = `Heap      ${u.toFixed(1)} / ${t.toFixed(1)} MB\n`;
    }
    this.el.textContent =
      `RocketWorld DBG (F3)\n` +
      `FPS        ${this.fps}  (${this.frameMs.toFixed(1)} ms)\n` +
      `Speed      ${info.speedMs.toFixed(1)} m/s\n` +
      `Boost      ${info.boost.toFixed(0)}\n` +
      `Ground     ${info.grounded ? 'Y' : 'N'}\n` +
      `Pos UU     ${info.pos.x.toFixed(0)}, ${info.pos.y.toFixed(0)}, ${info.pos.z.toFixed(0)}\n` +
      `Phys       ${info.physicsMode ?? '-'}  steps ${info.physicsSteps ?? '-'}\n` +
      `Tiles      active ${info.tilesActive ?? '-'}  built ${info.tilesBuilt ?? '-'}  disposed ${info.tilesDisposed ?? '-'}\n` +
      `Quality    pr ${info.pixelRatio?.toFixed(2) ?? '-'}  tileR ${info.tileRadius ?? '-'}\n` +
      mem;
  }
}
