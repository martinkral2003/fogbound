// FOGBOUND: DOMINION client: minimap base image (terrain colours + hill shading + water + roads), 400 m island, north (-z) up, west (-x) left.
import { WORLD, BIOME } from '../data.js';
import { BIOME_COL } from '../worldview.js';

export function buildMinimapBase(world, size = 200) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), img = g.createImageData(size, size), H = WORLD.half, S = WORLD.size;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + 0.5) / size * S - H, z = (j + 0.5) / size * S - H, h = world.heightAt(x, z), k = (j * size + i) * 4;
    let r, gg, b;
    if (h < 0.15) { const d = Math.max(0, Math.min(1, -h / 3)); r = 24 - d * 10; gg = 54 - d * 20; b = 66 - d * 18; }
    else {
      const c = BIOME_COL[world.biomeAt(x, z)] || 0x556655; r = (c >> 16) & 255; gg = (c >> 8) & 255; b = c & 255;
      const sh = (world.heightAt(x - 3, z - 3) - world.heightAt(x + 3, z + 3)) * 0.09, hi = Math.min(1, h / 14) * 0.25;
      const m = 0.82 + sh + hi; r *= m; gg *= m; b *= m;
      if (h < 1.2) { r += 30; gg += 26; b += 10; }
      if (world.roadDist && world.roadDist(x, z) < 2.4) { r = r * 0.5 + 100; gg = gg * 0.5 + 86; b = b * 0.5 + 56; }
    }
    img.data[k] = Math.max(0, Math.min(255, r)); img.data[k + 1] = Math.max(0, Math.min(255, gg)); img.data[k + 2] = Math.max(0, Math.min(255, b)); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}
