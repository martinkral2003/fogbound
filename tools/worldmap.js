// Shaded-relief PNG of the generated island: node tools/worldmap.js [seed] [out.png] [px per metre]
// Colours: water blue, unwalkable (steep) grey, walkable by height; roads brown; markers for features.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { generateWorld } from '../src/world.js';
import { WORLD } from '../src/data.js';
import { createNav, floodReach, cellOf } from '../src/nav.js';

const seed = +process.argv[2] || 1337, out = process.argv[3] || 'worldmap.png', S = +process.argv[4] || 2;
const w = generateWorld(seed);
const nav = createNav(w), reach = floodReach(nav, w.sites.heroSpawns[0].x, w.sites.heroSpawns[0].z);
const CX = +process.env.CX || 0, CZ = +process.env.CZ || 0, HALF = +process.env.HALF || WORLD.half, H = HALF, size = Math.round(HALF * 2 * S);
const CT = +process.env.CONTOUR || 4;
const px = new Uint8Array(size * size * 3);
const put = (i, j, r, g, b) => { if (i < 0 || j < 0 || i >= size || j >= size) return; const k = (j * size + i) * 3; px[k] = r; px[k + 1] = g; px[k + 2] = b; };
for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
  const x = i / S - H + CX, z = j / S - H + CZ, h = w.heightAt(x, z);
  if (h < 0.4) { put(i, j, 20, 45, 70); continue; }
  const sh = Math.max(0.5, Math.min(1.5, 1 + (w.heightAt(x - 1.5, z - 1.5) - w.heightAt(x + 1.5, z + 1.5)) * 0.12));
  const t = Math.min(1, h / 22);
  let r = 70 + 150 * t, g = 110 + 100 * t, b = 60 + 130 * t;
  if (!w.walkable(x, z)) { r = 95 + 40 * t; g = 85 + 40 * t; b = 85 + 40 * t; }
  if (process.env.REACH && !nav.terr[cellOf(x, z)] && !reach[cellOf(x, z)]) { r = 255; g = 40; b = 40; }
  put(i, j, Math.min(255, r * sh), Math.min(255, g * sh), Math.min(255, b * sh));
  const gr = Math.hypot(w.heightAt(x + 1, z) - w.heightAt(x - 1, z), w.heightAt(x, z + 1) - w.heightAt(x, z - 1)) / 2;
  if (gr > 0.05 && Math.abs(h - Math.round(h / CT) * CT) < Math.max(0.01, gr * 0.5 / S)) put(i, j, 30, 30, 30); // contours (CONTOUR env, default 4 m)
}
const dot = (x, y, r, c) => { for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (di * di + dj * dj <= r * r) put(Math.round((x - CX + H) * S) + di, Math.round((y - CZ + H) * S) + dj, ...c); };
for (const pl of w.roadLines || []) for (let k = 0; k < pl.length; k++) dot(pl[k][0], pl[k][1], 1, [190, 120, 40]);
const f = w.features;
for (const c of f.camps) dot(c.x, c.z, 4, [255, 40, 40]);
for (const c of f.chests) dot(c.x, c.z, 3, [0, 255, 255]);
for (const s of f.shrines) dot(s.x, s.z, 3, [60, 255, 60]);
const S4 = w.sites;
for (const p of S4.frontPath) dot(p[0], p[1], 2, [255, 255, 255]);
for (const g of S4.demon.gates) dot(g.x, g.z, g.main ? 7 : 5, [255, 80, 0]);
for (const c of S4.demon.camps) dot(c.x, c.z, 3, [200, 0, 0]);
dot(S4.demon.lord.x, S4.demon.lord.z, 7, [255, 0, 255]);
for (const k of Object.values(S4.gateRoutes || {})) for (const p of k) dot(p[0], p[1], 1, [255, 200, 120]);
for (const t of S4.towns) dot(t.x, t.z, t.kind === 'capital' ? 12 : t.kind === 'town' ? 8 : 6, t.start ? [80, 255, 80] : [250, 250, 120]);
for (const d of S4.dungeons) dot(d.x, d.z, 5, d.theme === 'sunken' ? [0, 255, 200] : [160, 90, 255]);
for (const l of S4.lairs) dot(l.x, l.z, 4, [255, 120, 0]);
for (const p of S4.pois) dot(p.x, p.z, 2, [255, 255, 0]);
for (const q of S4.waystones) dot(q.x, q.z, 3, [60, 160, 255]);
for (const h of S4.heroSpawns) dot(h.x, h.z, 2, [0, 255, 0]);
// PNG encode
const raw = Buffer.alloc((size * 3 + 1) * size);
for (let j = 0; j < size; j++) { raw[j * (size * 3 + 1)] = 0; Buffer.from(px.buffer, j * size * 3, size * 3).copy(raw, j * (size * 3 + 1) + 1); }
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out);
