// MAP lane test (v0.5 compact map): node tools/v5-map-test.js [seeds=1,2,3,4,5,6,7,8] [--astar] [--quick]
// Per seed: generation time, world size consistency, world.sites shape (towns / capital / start village / demon gates / lord / frontPath / gateRoutes /
// lairs / dungeons / pois / waystones / heroSpawns), only allowed POI types, gate spacing, SW/NE geography, start-village safety, reachability of EVERY site from
// every hero spawn (nav flood fill) + A* travel times between all towns (<= 45 s on foot at 8 m/s), front path continuity and order, determinism.
// Exits non-zero on failure.
import { generateWorld } from '../src/world.js';
import { WORLD } from '../src/data.js';
import { createNav, floodReach, cellOf, findPath } from '../src/nav.js';

const args = process.argv.slice(2);
const seeds = (args.find((a) => !a.startsWith('--')) || '1,2,3,4,5,6,7,8').split(',').map(Number);
const doAstar = !args.includes('--quick');
let fails = 0;
const fail = (m) => { fails++; console.log('  FAIL', m); };
const POI_OK = new Set(['cage', 'hoard', 'watchtower', 'caravan']);
const SPEED = 8;   // slowest hero (soldier) in m/s
const pathLen = (p, sx, sz) => { let L = 0, px = sx, pz = sz; for (const q of p) { L += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; } return L; };

if (WORLD.size !== 300 || WORLD.half !== 150 || WORLD.navN * WORLD.navCell !== WORLD.size || WORLD.infN * WORLD.infCell !== WORLD.size) fail('WORLD constants inconsistent ' + JSON.stringify(WORLD));
let maxGen = 0;
for (const seed of seeds) {
  const t0 = performance.now(), c0 = process.cpuUsage();
  const w = generateWorld(seed);
  const tGen = performance.now() - t0, cpu = process.cpuUsage(c0), tCpu = (cpu.user + cpu.system) / 1000;
  maxGen = Math.max(maxGen, tGen);
  const nav = createNav(w);
  const S = w.sites, f = w.features, D = S.demon;
  console.log(`seed ${seed}: gen ${tGen | 0} ms (attempt ${w.info.attempt}, flip ${w.info.flip}) | towns ${S.towns.length} gates ${D.gates.length} front ${S.frontPath.length} pts (${S.frontLen | 0} m) | lairs ${S.lairs.length} dungeons ${S.dungeons.length} pois ${S.pois.length} waystones ${S.waystones.length} | camps ${f.camps.length} chests ${f.chests.length} shrines ${f.shrines.length} props ${w.props.length}`);
  if (w.info.attempt >= 13) fail('generation fell back to the last attempt');
  if (tGen > 1000) fail('generation too slow (ms): ' + (tGen | 0));
  if (w.size !== WORLD.size || w.half !== WORLD.half || w.info.size !== WORLD.size) fail('world.size/half mismatch');

  // ---- world bounds: everything inside the island
  const all = [...S.towns, ...S.waystones, ...S.lairs, ...S.dungeons, ...S.pois, ...D.gates, ...f.camps, ...f.chests, ...f.shrines, ...S.heroSpawns, D.lord];
  for (const p of all) if (Math.abs(p.x) > WORLD.half - 6 || Math.abs(p.z) > WORLD.half - 6) { fail(`site outside the island ${p.x | 0},${p.z | 0}`); break; }
  for (const p of S.frontPath) if (Math.abs(p[0]) > WORLD.half || Math.abs(p[1]) > WORLD.half) { fail('front path outside the world'); break; }

  // ---- demon data
  if (D.gates.length < 2 || D.gates.length > 3) fail('want 2-3 gates, got ' + D.gates.length);
  if (S.orc !== D) fail('sites.orc must alias sites.demon');
  if (D.gates.filter((g) => g.main).length !== 1) fail('want exactly one main gate');
  const ids = new Set();
  for (const g of D.gates) {
    if (!(g.x > 20 && g.z < -20)) fail(`gate ${g.key} not in the NE: ${g.x | 0},${g.z | 0}`);
    if (!w.walkable(g.x, g.z)) fail('gate not on walkable ground ' + g.key);
    if (ids.has(g.id)) fail('duplicate gate id'); ids.add(g.id);
    if (!(g.tier >= 1 && g.tier <= 4)) fail('gate tier');
  }
  let dmin = 1e9, dmax = 0;
  for (let i = 0; i < D.gates.length; i++) for (let j = i + 1; j < D.gates.length; j++) { const d = Math.hypot(D.gates[i].x - D.gates[j].x, D.gates[i].z - D.gates[j].z); dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); }
  if (D.gates.length > 1 && (dmin < 52 || dmax > 135)) fail(`gate spacing ${dmin | 0}-${dmax | 0} m (want ~60-80 between neighbours)`);
  if (!(D.lord.x > 70 && D.lord.z < -70)) fail('Demon Lord not in the NE corner: ' + [D.lord.x | 0, D.lord.z | 0]);
  const main = D.gates.find((g) => g.main);
  const dMain = Math.hypot(main.x - D.lord.x, main.z - D.lord.z);
  if (dMain < 40 || dMain > 130) fail('main gate to lord distance ' + (dMain | 0));
  if (!D.landsPoly || D.landsPoly.length < 4 || D.lands[2] <= D.lands[0]) fail('demon lands polygon missing');
  if (!D.camps.length || !D.warcamp || !D.warlord) fail('deprecated orc-shaped data missing');
  console.log(`  gates: ${D.gates.map((g) => `${g.key}(${g.x | 0},${g.z | 0}) t${g.tier}`).join(' ')} | spacing ${dmin | 0}-${dmax | 0} m | lord ${D.lord.x | 0},${D.lord.z | 0} (${dMain | 0} m behind the main gate)`);

  // ---- towns
  const town = (id) => S.towns.find((t) => t.id === id);
  const cap = town(S.capital), start = town(S.startTown);
  if (S.towns.length < 5 || S.towns.length > 8) fail('want 5-8 towns, got ' + S.towns.length);
  if (S.towns.filter((t) => t.kind === 'capital').length !== 1 || !cap || cap.kind !== 'capital') fail('want exactly one capital');
  if (!start || !start.start || start.kind === 'capital') fail('start village missing');
  if (cap && !(cap.x < -60 && cap.z > 60)) fail('capital not in the SW: ' + (cap && [cap.x | 0, cap.z | 0]));
  const hill = w.spots.capitalHill; let top = -99; for (let k = 0; k < 8; k++) top = Math.max(top, w.heightAt(hill.x + Math.cos(k * 0.785) * 8, hill.z + Math.sin(k * 0.785) * 8));
  if (top < 6) fail('capital citadel not elevated');
  if (cap && Math.hypot(cap.x - hill.x, cap.z - hill.z) > 8) fail('capital is not on its citadel plateau');
  for (const t of S.towns) {
    const ws = S.waystones.find((q) => q.id === t.wsId);
    if (!ws || ws.townId !== t.id) fail('waystone link of town ' + t.name);
    if (!w.walkable(t.x, t.z)) fail('town not on walkable ground ' + t.name);
    const R6 = t.r * (t.kind === 'capital' ? 0.7 : 0.6);
    let mn = 99, mx = -99;
    for (let k = 0; k < 12; k++) { const h = w.heightAt(t.x + Math.cos(k * 0.5236) * R6, t.z + Math.sin(k * 0.5236) * R6); mn = Math.min(mn, h); mx = Math.max(mx, h); }
    if (mx - mn > 3.2) fail(`town ${t.name} ground not flat (${(mx - mn).toFixed(1)} m)`);
  }
  if (S.towns.filter((t) => t.x < 0 && t.z > 0).length < 1) fail('no town in the SW');
  const gateWs = S.waystones.filter((q) => q.gate);
  if (gateWs.length !== D.gates.length) fail('want one gate-approach waystone per gate, got ' + gateWs.length);
  if (S.waystones.length < S.towns.length + D.gates.length + 3) fail('too few waystones: ' + S.waystones.length);
  if (S.heroSpawns.length !== 4) fail('heroSpawns != 4');
  for (let i = 0; i < S.heroSpawns.length; i++) {
    const a = S.heroSpawns[i];
    if (!w.walkable(a.x, a.z)) fail('heroSpawn not walkable');
    if (start && Math.hypot(a.x - start.x, a.z - start.z) > 30) fail('heroSpawn far from start village');
    for (let j = 0; j < i; j++) if (Math.hypot(a.x - S.heroSpawns[j].x, a.z - S.heroSpawns[j].z) < 4) fail('heroSpawns overlap');
  }
  if (w.heroSpawns !== S.heroSpawns && JSON.stringify(w.heroSpawns) !== JSON.stringify(S.heroSpawns)) fail('world.heroSpawns differs from sites.heroSpawns');

  // ---- counts and types
  const poiCount = {};
  for (const p of S.pois) { poiCount[p.type] = (poiCount[p.type] || 0) + 1; if (!POI_OK.has(p.type)) fail('forbidden poi type ' + p.type); }
  if ((poiCount.cage || 0) < 3) fail('want >= 3 cages'); if ((poiCount.hoard || 0) < 1) fail('want >= 1 hoard'); if ((poiCount.watchtower || 0) < 2) fail('want >= 2 watchtowers');
  const sunk = S.dungeons.filter((d) => d.theme === 'sunken');
  if (sunk.length !== 1 || sunk[0].quadrant !== -1 || Math.hypot(sunk[0].x, sunk[0].z) > 5) fail('want exactly one central sunken dungeon');
  if (S.dungeons.length < 6 || S.dungeons.length > 8) fail('dungeons 6-8 (incl. sunken): ' + S.dungeons.length);
  const themes = new Set(S.dungeons.map((d) => d.theme)); if (themes.size < 3) fail('dungeon themes < 3');
  if (S.lairs.length < 4) fail('lairs < 4: ' + S.lairs.length);
  if (f.camps.length < 18 || f.chests.length < 16 || f.shrines.length < 5) fail('wild camps/chests/shrines too few');
  if (f.shrines.filter((s) => s.kind === 'heal').length < 3) fail('want >= 3 healing shrines');
  console.log('  pois', Object.entries(poiCount).map(([k, v]) => k + v).join(' '), '| dungeons', S.dungeons.map((d) => d.theme + d.tier).join(','), '| heal shrines', f.shrines.filter((s) => s.kind === 'heal').length);

  // ---- start village is safe: nothing hostile within 40 m
  if (start) {
    const near = [...f.camps.map((c) => ['camp', c]), ...S.lairs.map((c) => ['lair', c]), ...D.gates.map((c) => ['gate', c]), ...S.dungeons.map((c) => ['dungeon', c])];
    for (const [k, c] of near) if (Math.hypot(c.x - start.x, c.z - start.z) < 40) fail(`${k} ${c.x | 0},${c.z | 0} within 40 m of the start village`);
    console.log(`  nearest wild camp to the start village: ${Math.min(...f.camps.map((c) => Math.hypot(c.x - start.x, c.z - start.z))) | 0} m, nearest dungeon ${Math.min(...S.dungeons.map((c) => Math.hypot(c.x - start.x, c.z - start.z))) | 0} m`);
  }
  for (const t of S.towns) for (const c of f.camps) if (Math.hypot(c.x - t.x, c.z - t.z) < t.r) fail(`camp inside ${t.name}`);

  // ---- reachability of every site from every hero spawn (nav flood)
  const everything = [
    ...S.towns.map((t) => ['town ' + t.name, t.x, t.z]), ...S.waystones.map((s) => ['waystone ' + s.id, s.x, s.z]), ...D.gates.map((s) => ['gate ' + s.key, s.x, s.z]),
    ['lord', D.lord.x, D.lord.z], ...D.camps.map((s) => ['demon camp', s.x, s.z]),
    ...S.lairs.map((s) => ['lair', s.x, s.z]), ...S.dungeons.map((s) => ['dungeon ' + s.theme, s.x, s.z]), ...S.pois.map((s) => ['poi ' + s.type, s.x, s.z]),
    ...f.camps.map((s) => ['camp', s.x, s.z]), ...f.chests.map((s) => ['chest', s.x, s.z]), ...f.shrines.map((s) => ['shrine', s.x, s.z]), ['boss', f.boss.x, f.boss.z],
  ];
  let unreach = 0;
  for (const hs of S.heroSpawns) {
    const reach = floodReach(nav, hs.x, hs.z);
    for (const [label, x, z] of everything) {
      const c = cellOf(x, z);
      if (nav.terr[c] || !reach[c]) { unreach++; if (unreach < 8) console.log(`  unreachable from a hero spawn: ${label} at ${x.toFixed(0)},${z.toFixed(0)}`); }
    }
  }
  if (unreach) fail(`${unreach} unreachable site/spawn pairs`);
  for (const [label, x, z] of everything) if (!w.walkable(x, z) && !label.startsWith('waystone')) { fail(`${label} at ${x.toFixed(0)},${z.toFixed(0)} is not on walkable ground`); break; }

  // ---- front path: continuity, ends, towns in falling order, capital last
  const fp = S.frontPath;
  let maxStep = 0;
  for (let i = 1; i < fp.length; i++) maxStep = Math.max(maxStep, Math.hypot(fp[i][0] - fp[i - 1][0], fp[i][1] - fp[i - 1][1]));
  if (maxStep > 24) fail('front path has a gap of ' + maxStep.toFixed(0) + ' m');
  if (Math.hypot(fp[0][0] - main.x, fp[0][1] - main.z) > 10) fail('front path does not start at the main gate');
  const last = fp[fp.length - 1];
  if (cap && Math.hypot(last[0] - cap.x, last[1] - cap.z) > 12) fail('front path does not end at the capital');
  let badPath = 0;
  for (let i = 0; i < fp.length; i++) if (nav.terr[cellOf(fp[i][0], fp[i][1])]) badPath++;
  if (badPath) fail(badPath + ' front path points on blocked terrain');
  const onPath = S.frontStops.filter((s) => s.off < 25);
  if (onPath.length < 3) fail('front path passes only ' + onPath.length + ' towns');
  if (onPath.length && onPath[onPath.length - 1].townId !== S.capital) fail('capital is not the last town on the front path');
  for (let i = 1; i < onPath.length; i++) if (onPath[i].dist <= onPath[i - 1].dist) fail('front stops not increasing');
  console.log('  front order:', onPath.map((s) => town(s.townId).name + '@' + s.dist).join(' > '), `| len ${S.frontLen | 0} m, max step ${maxStep.toFixed(1)}`);
  if (S.frontLen < 150 || S.frontLen > 500) fail('front path length ' + S.frontLen);
  for (const g of D.gates) if (!g.main && !(S.gateRoutes[g.key] && S.gateRoutes[g.key].length > 2)) fail('no road from the ' + g.key + ' gate');

  // ---- A*: travel times between all towns and from the start to every gate (the slowest hero walks 8 m/s)
  if (doAstar) {
    let worst = 0, wl = '', bad = 0, t = 0, n = 0;
    const pts = [...S.towns.map((q) => [q.name, q.x, q.z]), ...D.gates.map((g) => ['gate ' + g.key, g.x, g.z]), ['lord', D.lord.x, D.lord.z]];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const [la, ax, az] = pts[i], [lb, bx, bz] = pts[j], ta = performance.now();
      const p = findPath(nav, 0, ax, az, bx, bz, 60000);
      t += performance.now() - ta; n++;
      const e = p[p.length - 1];
      if (!e || Math.hypot(e.x - bx, e.z - bz) > 4) { bad++; if (bad < 5) console.log('  A* did not reach', la, '->', lb); continue; }
      const sec = pathLen(p, ax, az) / SPEED;
      const towns2 = !la.startsWith('gate') && la !== 'lord' && !lb.startsWith('gate') && lb !== 'lord';
      if (towns2 && sec > worst) { worst = sec; wl = la + ' -> ' + lb; }
      if (towns2 && sec > 45) fail(`towns ${la} -> ${lb} take ${sec | 0} s on foot (> 45)`);
    }
    if (bad) fail(bad + ' A* routes failed');
    const sg = findPath(nav, 0, S.heroSpawns[0].x, S.heroSpawns[0].z, main.x, main.z, 60000);
    console.log(`  A*: ${n} routes, avg ${(t / n).toFixed(1)} ms | longest town-to-town walk ${worst | 0} s (${wl}) | start -> main gate ${(pathLen(sg, S.heroSpawns[0].x, S.heroSpawns[0].z) / SPEED) | 0} s`);
  }

  // ---- determinism (same seed, same layout), once per run
  if (seed === seeds[0]) {
    const w2 = generateWorld(seed), S2 = w2.sites;
    if (JSON.stringify(S2.towns) !== JSON.stringify(S.towns) || JSON.stringify(S2.demon.gates) !== JSON.stringify(D.gates) || JSON.stringify(S2.frontPath) !== JSON.stringify(S.frontPath)) fail('generation is not deterministic');
  }
}
// ---- the layout class is the same for every seed but the seeds really differ
{
  const a = generateWorld(seeds[0]).sites, b = generateWorld(seeds[seeds.length - 1] + 100).sites;
  const dm = Math.hypot(a.towns[1].x - b.towns[1].x, a.towns[1].z - b.towns[1].z);
  console.log(`seed variation: town 1 moves ${dm | 0} m between seeds, demon gates stay NE (${a.demon.gates[0].x | 0},${a.demon.gates[0].z | 0} / ${b.demon.gates[0].x | 0},${b.demon.gates[0].z | 0})`);
}
console.log(`max generation ${maxGen | 0} ms`);
console.log(fails ? `\n${fails} FAILURES` : '\nOK');
process.exit(fails ? 1 : 0);
