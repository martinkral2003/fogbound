// Shared by the minimap and the full map: terrain base image (hillshade, biomes, roads, water) and the exploration (fog-of-war) grid.
const SIZE = 400, HALF = 200, CELL = 4, GN = 100; // world metres, explore grid 100x100 of 4 m cells
const BIOME_COL = [[78, 100, 69], [103, 108, 69], [91, 82, 50], [78, 96, 96], [90, 95, 99], [47, 80, 64], [110, 96, 72]]; // moor, high, dead, abbey, temple, mire, ridge
const cache = new WeakMap();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function getMapData(world) {
  let d = cache.get(world);
  if (d) return d;
  d = { base: null, baseSize: 0, explored: new Uint8Array(GN * GN), fog: null, fogCtx: null, fogImg: null, dirty: true, lastX: 1e9, lastZ: 1e9, count: 0 };
  cache.set(world, d);
  return d;
}

export function baseImage(world, size = 320) {
  const d = getMapData(world);
  if (d.base && d.baseSize === size) return d.base;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), img = x.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const wx = ((i + 0.5) / size) * SIZE - HALF, wz = ((j + 0.5) / size) * SIZE - HALF, h = world.heightAt(wx, wz), p = (j * size + i) * 4;
    if (h < 0.3) { const k = clamp(1 + h * 0.25, 0.4, 1); img.data[p] = 16 * k + 8; img.data[p + 1] = 34 * k + 8; img.data[p + 2] = 48 * k + 10; img.data[p + 3] = 255; continue; }
    const col = BIOME_COL[world.biomeAt(wx, wz)] || BIOME_COL[0];
    const sh = clamp(0.85 + (world.heightAt(wx - 3, wz - 3) - world.heightAt(wx + 3, wz + 3)) * 0.14, 0.4, 1.6) * (0.9 + clamp(h, 0, 24) * 0.012);
    let r = col[0] * 1.35, g = col[1] * 1.35, b = col[2] * 1.35;
    const sl = world.slopeAt(wx, wz);
    if (sl > 0.9) { const k = clamp((sl - 0.9) * 1.5, 0, 0.7); r += (120 - r) * k; g += (112 - g) * k; b += (108 - b) * k; }
    if (h < 1.1) { r = r * 0.8 + 40; g = g * 0.8 + 38; b = b * 0.8 + 20; } // shoreline sand
    if (world.roadDist && world.roadDist(wx, wz) < 2.2) { r = r * 0.35 + 190 * 0.65; g = g * 0.35 + 150 * 0.65; b = b * 0.35 + 95 * 0.65; }
    img.data[p] = Math.min(255, r * sh); img.data[p + 1] = Math.min(255, g * sh); img.data[p + 2] = Math.min(255, b * sh); img.data[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  d.base = c; d.baseSize = size;
  return c;
}

// mark cells within radius r (m) around (x,z) as explored; call often, it only works when the actor moved
export function explore(world, x, z, r = 45) {
  const d = getMapData(world);
  if (Math.hypot(x - d.lastX, z - d.lastZ) < 2) return d;
  d.lastX = x; d.lastZ = z;
  const cr = Math.ceil(r / CELL), cx = Math.floor((x + HALF) / CELL), cz = Math.floor((z + HALF) / CELL);
  for (let j = cz - cr; j <= cz + cr; j++) for (let i = cx - cr; i <= cx + cr; i++) {
    if (i < 0 || j < 0 || i >= GN || j >= GN) continue;
    const dx = (i + 0.5) * CELL - HALF - x, dz = (j + 0.5) * CELL - HALF - z;
    if (dx * dx + dz * dz <= r * r && !d.explored[j * GN + i]) { d.explored[j * GN + i] = 1; d.dirty = true; d.count++; }
  }
  return d;
}
export function isExplored(world, x, z) {
  const d = getMapData(world), i = Math.floor((x + HALF) / CELL), j = Math.floor((z + HALF) / CELL);
  return i >= 0 && j >= 0 && i < GN && j < GN && d.explored[j * GN + i] === 1;
}
// canvas (100x100) with alpha 0 where explored, dark where not; drawn scaled over the base image
export function fogCanvas(world) {
  const d = getMapData(world);
  if (!d.fog) { d.fog = document.createElement('canvas'); d.fog.width = d.fog.height = GN; d.fogCtx = d.fog.getContext('2d'); d.fogImg = d.fogCtx.createImageData(GN, GN); d.dirty = true; }
  if (d.dirty) {
    const a = d.fogImg.data;
    for (let i = 0; i < GN * GN; i++) { a[i * 4] = 6; a[i * 4 + 1] = 8; a[i * 4 + 2] = 10; a[i * 4 + 3] = d.explored[i] ? 0 : 232; }
    d.fogCtx.putImageData(d.fogImg, 0, 0); d.dirty = false;
  }
  return d.fog;
}
export const MAP = { SIZE, HALF, CELL, GN };
