// MAP lane test (v0.4): node tools/v4-map-test.js [seeds=1,2,3,4,5,6] [--astar]
// Per seed: generation time, world.sites shape (towns/capital/start village/orc/frontPath/lairs/dungeons/pois/waystones/heroSpawns), reachability of EVERY
// site from every hero spawn (nav flood fill; A* for a sample), front path continuity and order, capital-vs-orc geography, start village safety,
// poi/dungeon counts, asymmetry sanity. Exits non-zero on failure.
import { generateWorld } from '../src/world.js';
import { createNav, floodReach, cellOf, findPath } from '../src/nav.js';

const args = process.argv.slice(2);
const seeds = (args.find((a) => !a.startsWith('--')) || '1,2,3,4,5,6').split(',').map(Number);
const doAstar = args.includes('--astar');
let fails = 0;
const fail = (m) => { fails++; console.log('  FAIL', m); };
const POI_TYPES = ['altar', 'library', 'graveyard', 'well', 'witch', 'cage', 'hoard', 'bridge', 'cursed', 'watchtower', 'shrine', 'caravan'];

for (const seed of seeds) {
  const t0 = performance.now(), c0 = process.cpuUsage();
  const w = generateWorld(seed);
  const tGen = performance.now() - t0, cpu = process.cpuUsage(c0), tCpu = (cpu.user + cpu.system) / 1000;
  const nav = createNav(w);
  const S = w.sites, f = w.features;
  console.log(`seed ${seed}: gen ${tGen | 0} ms (attempt ${w.info.attempt}, flip ${w.info.flip}) | towns ${S.towns.length} orc camps ${S.orc.camps.length} front ${S.frontPath.length} pts (${S.frontLen | 0} m) | lairs ${S.lairs.length} dungeons ${S.dungeons.length} pois ${S.pois.length} waystones ${S.waystones.length} | camps ${f.camps.length} chests ${f.chests.length} shrines ${f.shrines.length} props ${w.props.length}`);
  if (w.info.attempt >= 13) fail('generation fell back to the last attempt');
  if (tCpu > 6000) fail('generation too slow (cpu ms): ' + tCpu);

  // ---- shape
  const town = (id) => S.towns.find((t) => t.id === id);
  const cap = town(S.capital), start = town(S.startTown);
  if (S.towns.length < 6 || S.towns.length > 8) fail('want 6-8 towns, got ' + S.towns.length);
  if (S.towns.filter((t) => t.kind === 'capital').length !== 1 || !cap || cap.kind !== 'capital') fail('want exactly one capital');
  if (!start || !start.start || start.kind === 'capital') fail('start village missing');
  if (cap && !(cap.x < -80 && cap.z > 80)) fail('capital not in the SW: ' + (cap && [cap.x | 0, cap.z | 0]));
  const wl = S.orc.warlord, wc = S.orc.warcamp;
  if (!(wl.x > 150 && wl.z < -150)) fail('warlord not in the NE: ' + [wl.x | 0, wl.z | 0]);
  if (!(wc.x > 100 && wc.z < -100)) fail('war-camp not in the NE');
  if (cap && Math.hypot(cap.x - wl.x, cap.z - wl.z) < 450) fail('capital too close to the warlord');
  if (S.orc.camps.filter((c) => c.kind === 'warcamp').length !== 1) fail('want one warcamp entry');
  if (S.orc.camps.length < 6) fail('orc camps < 6');
  if (S.orc.camps.some((c) => c.x < 60 || c.z > -60)) fail('orc camp outside the orc lands');
  for (const t of S.towns) {
    const ws = S.waystones.find((q) => q.id === t.wsId);
    if (!ws || ws.townId !== t.id) fail('waystone link of town ' + t.name);
    if (!w.walkable(t.x, t.z)) fail('town not on walkable ground ' + t.name);
    const R6 = t.r * (t.kind === 'capital' ? 0.45 : 0.6);
    let mn = 99, mx = -99;
    for (let k = 0; k < 12; k++) { const h = w.heightAt(t.x + Math.cos(k * 0.5236) * R6, t.z + Math.sin(k * 0.5236) * R6); mn = Math.min(mn, h); mx = Math.max(mx, h); }
    if (mx - mn > 3.2) fail(`town ${t.name} ground not flat (${(mx - mn).toFixed(1)} m)`);
  }
  if (S.waystones.length < S.towns.length + 5) fail('too few waystones: ' + S.waystones.length);
  if (S.heroSpawns.length !== 4) fail('heroSpawns != 4');
  for (let i = 0; i < S.heroSpawns.length; i++) {
    const a = S.heroSpawns[i];
    if (!w.walkable(a.x, a.z)) fail('heroSpawn not walkable');
    if (start && Math.hypot(a.x - start.x, a.z - start.z) > 35) fail('heroSpawn far from start village');
    for (let j = 0; j < i; j++) if (Math.hypot(a.x - S.heroSpawns[j].x, a.z - S.heroSpawns[j].z) < 4) fail('heroSpawns overlap');
  }
  // ---- counts
  const poiCount = {}; for (const p of S.pois) poiCount[p.type] = (poiCount[p.type] || 0) + 1;
  for (const t of POI_TYPES) { if (!poiCount[t]) fail('no poi of type ' + t); else if (poiCount[t] < 2) fail('few pois of type ' + t); }
  const sunk = S.dungeons.filter((d) => d.theme === 'sunken');
  if (sunk.length !== 1 || sunk[0].quadrant !== -1 || Math.hypot(sunk[0].x, sunk[0].z) > 5) fail('want exactly one central sunken dungeon');
  if (S.dungeons.length < 7) fail('dungeons < 7: ' + S.dungeons.length);
  const themes = new Set(S.dungeons.map((d) => d.theme)); if (themes.size < 4) fail('dungeon themes < 4');
  if (S.lairs.length < 8) fail('lairs < 8: ' + S.lairs.length);
  if (f.camps.length < 20 || f.chests.length < 20 || f.shrines.length < 8) fail('wild camps/chests/shrines too few');
  console.log('  pois', Object.entries(poiCount).map(([k, v]) => k + v).join(' '), '| dungeon themes', [...themes].join(','));

  // ---- start village is safe: no wild camps / lairs / orcs / dungeons within 60 m
  if (start) {
    const near = [...f.camps.map((c) => ['camp', c]), ...S.lairs.map((c) => ['lair', c]), ...S.orc.camps.map((c) => ['orc', c]), ...S.dungeons.map((c) => ['dungeon', c])];
    for (const [k, c] of near) if (Math.hypot(c.x - start.x, c.z - start.z) < 60) fail(`${k} ${c.x | 0},${c.z | 0} within 60 m of the start village`);
    console.log(`  nearest wild camp to the start village: ${Math.min(...f.camps.map((c) => Math.hypot(c.x - start.x, c.z - start.z))) | 0} m`);
  }
  for (const t of S.towns) for (const c of f.camps) if (Math.hypot(c.x - t.x, c.z - t.z) < t.r) fail(`camp inside ${t.name}`);

  // ---- reachability of every site from every hero spawn (nav flood)
  const everything = [
    ...S.towns.map((t) => ['town ' + t.name, t.x, t.z]), ...S.waystones.map((s) => ['waystone ' + s.id, s.x, s.z]), ...S.orc.camps.map((s) => ['orc ' + s.kind, s.x, s.z]),
    ['warlord', wl.x, wl.z], ['warcamp', wc.x, wc.z],
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

  // ---- front path: continuity, ends, passes the towns in falling order, capital last
  const fp = S.frontPath;
  let maxStep = 0;
  for (let i = 1; i < fp.length; i++) maxStep = Math.max(maxStep, Math.hypot(fp[i][0] - fp[i - 1][0], fp[i][1] - fp[i - 1][1]));
  if (maxStep > 24) fail('front path has a gap of ' + maxStep.toFixed(0) + ' m');
  if (Math.hypot(fp[0][0] - wc.x, fp[0][1] - wc.z) > 10) fail('front path does not start at the war-camp');
  const last = fp[fp.length - 1];
  if (cap && Math.hypot(last[0] - cap.x, last[1] - cap.z) > 12) fail('front path does not end at the capital');
  let badPath = 0;
  for (let i = 0; i < fp.length; i++) { if (nav.terr[cellOf(fp[i][0], fp[i][1])]) badPath++; }
  if (badPath) fail(badPath + ' front path points on blocked terrain');
  const onPath = S.frontStops.filter((s) => s.off < 25);
  if (onPath.length < 5) fail('front path passes only ' + onPath.length + ' towns');
  if (onPath.length && onPath[onPath.length - 1].townId !== S.capital) fail('capital is not the last town on the front path');
  console.log('  front order:', onPath.map((s) => town(s.townId).name + '@' + s.dist).join(' > '), '| max step', maxStep.toFixed(1));
  for (let i = 1; i < onPath.length; i++) if (onPath[i].dist <= onPath[i - 1].dist) fail('front stops not increasing');
  if (S.frontLen < 600 || S.frontLen > 1500) fail('front path length ' + S.frontLen);

  // ---- asymmetry sanity
  if (S.orc.camps.some((c) => !(c.x > 0 && c.z < 0))) fail('orc camps outside NE quadrant');
  const sw = S.towns.filter((t) => t.x < 0 && t.z > 0).length, ne = S.towns.filter((t) => Math.hypot(t.x - wc.x, t.z - wc.z) < 150).length;
  if (sw < 2) fail('fewer than 2 towns in the SW quadrant');
  if (ne > 0) fail('human town within 150 m of the war-camp');
  const hh = w.spots.capitalHill;
  let top = -99; for (let k = 0; k < 8; k++) top = Math.max(top, w.heightAt(hh.x + Math.cos(k * 0.785) * 10, hh.z + Math.sin(k * 0.785) * 10));
  if (top < 6) fail('capital citadel not elevated');
  console.log(`  towns by quadrant SW ${sw} NE ${ne} | wild camps NE ${f.camps.filter((c) => c.x > 0 && c.z < 0).length} SW ${f.camps.filter((c) => c.x < 0 && c.z > 0).length}`);

  // ---- A* sample (full nav, long routes) from the start village
  if (doAstar) {
    let bad = 0, n = 0, t = 0, worst = 0;
    const hs = S.heroSpawns[0];
    const goals = [['capital', cap.x, cap.z], ['warcamp', wc.x, wc.z], ['warlord', wl.x, wl.z], ['boss', f.boss.x, f.boss.z], ...everything.filter((e, i) => i % 6 === 0)];
    for (const [label, x, z] of goals) {
      const ta = performance.now();
      const p = findPath(nav, 0, hs.x, hs.z, x, z, 90000);
      const dt = performance.now() - ta; t += dt; worst = Math.max(worst, dt); n++;
      const e = p[p.length - 1];
      if (!e || Math.hypot(e.x - x, e.z - z) > 4) { bad++; if (bad < 5) console.log('  A* did not reach', label, x.toFixed(0), z.toFixed(0)); }
    }
    console.log(`  A* from the start village: ${n} routes, ${bad} failed, avg ${(t / n).toFixed(1)} ms, worst ${worst.toFixed(0)} ms`);
    if (bad) fail('A* failures');
  }
}
console.log(fails ? `\n${fails} FAILURES` : '\nOK');
process.exit(fails ? 1 : 0);
