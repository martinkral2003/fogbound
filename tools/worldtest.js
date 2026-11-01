import { generateWorld } from '../src/world.js';
import { createNav, floodReach, cellOf, findPath } from '../src/nav.js';
// node tools/worldtest.js [seed]   -> ASCII map + checks for one seed (default 1337)
// node tools/worldtest.js all       -> seeds 1-8 summary: reachability from EVERY heart, timings, relief, forts, roads
if (process.argv[2] === 'all') {
  let totalBad = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const t0 = performance.now(), w = generateWorld(seed), t1 = performance.now(), nav = createNav(w), f = w.features;
    let bad = 0;
    for (const h of w.hearts) {
      const reach = floodReach(nav, h.x, h.z);
      for (const arr of [f.nodes, f.camps, f.chests, f.shrines, w.hearts]) for (const p of arr) if (!reach[cellOf(p.x, p.z)]) bad++;
    }
    let peak = 0; for (const v of w.hgrid) peak = Math.max(peak, v);
    let roadLen = 0; for (const r of w.roads) roadLen += Math.hypot(r[2] - r[0], r[3] - r[1]);
    const forts = w.forts.filter((q) => !q.knoll);
    // every ramp: walkable along its centre line, slope <= 0.6
    let rampBad = 0, maxSlope = 0;
    for (const q of forts) for (let t = q.R; t <= q.R + q.L; t += 1) { const x = q.x + q.dx * t, z = q.z + q.dz * t; if (!w.walkable(x, z)) rampBad++; maxSlope = Math.max(maxSlope, Math.abs(w.heightAt(x + q.dx, z + q.dz) - w.heightAt(x, z))); }
    const onHill = f.camps.filter((c) => c.fort).length;
    totalBad += bad;
    console.log(`seed ${seed}: gen ${(t1 - t0) | 0} ms | unreachable ${bad} | peak ${peak.toFixed(1)} m | camps on hill forts ${onHill}/${f.camps.length} | road ${roadLen.toFixed(0)} m | ramp cells blocked ${rampBad}, max ramp slope ${maxSlope.toFixed(2)}`);
  }
  console.log('total unreachable', totalBad);
  process.exit(0);
}
const t0 = performance.now();
const w = generateWorld(+process.argv[2] || 1337);
const t1 = performance.now();
const nav = createNav(w);
const t2 = performance.now();
console.log('gen ms', (t1 - t0) | 0, 'nav ms', (t2 - t1) | 0, 'props', w.props.length);
let land = 0; for (let i = 0; i < w.walk.length; i++) land += w.walk[i];
console.log('walkable %', ((land / w.walk.length) * 100).toFixed(1));
const f = w.features;
console.log('nodes', f.nodes.length, 'camps', f.camps.length, 'chests', f.chests.length, 'shrines', f.shrines.length);
for (const h of w.hearts) console.log('heart', h.team, w.heightAt(h.x, h.z).toFixed(2), w.walkable(h.x, h.z));
const reach = floodReach(nav, w.hearts[0].x, w.hearts[0].z);
let bad = 0;
for (const [k, arr] of Object.entries({ nodes: f.nodes, camps: f.camps, chests: f.chests, shrines: f.shrines })) {
  for (const p of arr) {
    const ok = reach[cellOf(p.x, p.z)];
    if (!ok) { bad++; console.log('UNREACHABLE', k, p.type || '', p.x.toFixed(0), p.z.toFixed(0), 'h', w.heightAt(p.x, p.z).toFixed(2)); }
  }
}
for (const h of w.hearts) if (!reach[cellOf(h.x, h.z)]) { bad++; console.log('heart unreachable', h.team); }
console.log('unreachable', bad);
const tt = performance.now();
const p = findPath(nav, 0, w.hearts[0].x, w.hearts[0].z, w.hearts[2].x, w.hearts[2].z);
console.log('path NW->SE waypoints', p.length, 'ms', (performance.now() - tt).toFixed(1));
// height range & ascii map
let mn = 99, mx = -99; for (const v of w.hgrid) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
console.log('h range', mn.toFixed(1), mx.toFixed(1));
let s = '';
for (let j = 0; j < 40; j++) { let row = ''; for (let i = 0; i < 80; i++) {
  const x = (i / 80) * 400 - 200 + 2.5, z = (j / 40) * 400 - 200 + 5;
  let ch = w.heightAt(x, z) < 0.4 ? '~' : !w.walkable(x, z) ? '#' : ' .:+'[Math.min(3, Math.floor(w.heightAt(x, z) / 2.5))];
  for (const n of f.nodes) if (Math.abs(n.x - x) < 2.6 && Math.abs(n.z - z) < 5) ch = n.type === 'mine' ? 'M' : 'O';
  for (const c of f.camps) if (Math.abs(c.x - x) < 2.6 && Math.abs(c.z - z) < 5) ch = 'c';
  for (const h of w.hearts) if (Math.abs(h.x - x) < 2.6 && Math.abs(h.z - z) < 5) ch = 'H';
  row += ch; } s += row + '\n'; }
console.log(s);
