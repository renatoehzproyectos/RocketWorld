// Geodesia WGS84 mínima (doble precisión, radianes). ENU local: E=este, N=norte, U=arriba.
export const rad = Math.PI / 180, A = 6378137, E2 = 0.00669437999014;
export function geodeticToECEF(lat, lon, h, out) {
  const s = Math.sin(lat), c = Math.cos(lat), n = A / Math.sqrt(1 - E2 * s * s);
  return out.set((n + h) * c * Math.cos(lon), (n + h) * c * Math.sin(lon), (n * (1 - E2) + h) * s);
}
export function enuBasis(lat, lon) {
  const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  return [new THREE.Vector3(-so, co, 0), new THREE.Vector3(-sl * co, -sl * so, cl), new THREE.Vector3(cl * co, cl * so, sl)];
}
// Desplaza el ancla dE metros al este y dN al norte sobre el elipsoide (conserva la altura).
export function moveGeodetic(g, dE, dN) {
  const s = Math.sin(g.lat), w = Math.sqrt(1 - E2 * s * s), N = A / w, M = A * (1 - E2) / (w * w * w);
  g.lat += dN / (M + g.h); g.lon += dE / ((N + g.h) * Math.cos(g.lat)); return g;
}
