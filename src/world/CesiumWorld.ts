/**
 * CHUNK 02 — Cesium minimum (world / terrain layer)
 *
 * Does NOT replace Three.js vehicle rendering (CHUNK 00).
 * RocketSim physics stays on the Three.js gameplay path.
 *
 * Cesium provides the large-scale globe / future 3D Tiles coastal city.
 * Loaded via global `Cesium` from /cesium/Cesium.js (public assets).
 */

export interface CesiumWorldOptions {
  container: HTMLElement;
  active?: boolean;
}

declare const Cesium: any;

export class CesiumWorld {
  readonly viewer: any;
  active: boolean;

  constructor(opts: CesiumWorldOptions) {
    if (typeof Cesium === 'undefined') {
      throw new Error(
        'Cesium global missing — ensure /cesium/Cesium.js is loaded'
      );
    }

    this.active = opts.active !== false;

    const imagery = new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      maximumLevel: 18,
    });

    this.viewer = new Cesium.Viewer(opts.container, {
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: false,
      shouldAnimate: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    });

    this.viewer.imageryLayers.removeAll();
    this.viewer.imageryLayers.addImageryProvider(imagery);

    // Costa del Sol–ish viewpoint (reference: coastal Mediterranean town)
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-4.95, 36.48, 1200),
      orientation: {
        heading: Cesium.Math.toRadians(20),
        pitch: Cesium.Math.toRadians(-35),
        roll: 0,
      },
    });

    this.viewer.scene.globe.enableLighting = true;
    this.viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#87b8d8');
    this.viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#c4a574');

    this.viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    );

    const credit = this.viewer.cesiumWidget.creditContainer as HTMLElement;
    if (credit) credit.style.display = 'none';
  }

  requestRender() {
    if (this.active) this.viewer.scene.requestRender();
  }

  setActive(on: boolean) {
    this.active = on;
    const el = this.viewer.container as HTMLElement;
    el.style.visibility = on ? 'visible' : 'hidden';
  }

  destroy() {
    this.viewer.destroy();
  }
}
