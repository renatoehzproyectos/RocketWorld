# CHUNK 17 — Asset compression strategy

Measured sizes (public/):

| Asset | Size | Format | Strategy |
|-------|------|--------|----------|
| fennec.glb | 2.7 MB | GLB | Keep for quality; future: Meshopt + quantize (gltf-transform) target &lt;1 MB |
| rocketsim.wasm | 842 KB | WASM | Already compact native build; no recompress |
| grass_n.webp | 424 KB | WebP | WebP preferred over PNG; optional resize to 512 if mobile-only pack |
| grass_d.webp | 240 KB | WebP | Same |
| ground_d.webp | 196 KB | WebP | Same |
| Chassis_Grain_* | ~276 KB | WebP | Car paint detail — keep |
| Alpha_* wheels | ~176 KB | WebP | Keep |
| fx_sheet.png | 68 KB | PNG | Small atlas; WebP optional |
| spark.webp | 24 KB | WebP | Keep |
| Procedural boost trail | 0 | Canvas | No download |

## Decisions (justified)

1. **Textures → WebP** (already): best size/quality for diffuse/normal in browser without KTX2 pipeline complexity.
2. **No KTX2/Basis yet**: requires transcoder bundle (~extra JS) and build tooling; revisit if GPU memory becomes the bottleneck on mid Android.
3. **GLB vehicle**: single hero asset; Draco/Meshopt deferred until city GLBs dominate download.
4. **WASM**: leave as-is; compression ratio already high.
5. **Runtime budget**: QualityScaler drops pixel ratio + tile radius before aggressive texture downscale.

## Future pipeline (when city assets grow)

```bash
# Example — not required for current release
npx @gltf-transform/cli optimize fennec.glb fennec.min.glb --texture-compress webp
```

## Definition of Done

Each category has an explicit strategy backed by measured sizes above.
