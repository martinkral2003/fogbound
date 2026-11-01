// WORLD lane headless test. node tools/rts-world-test.js [seeds=8]
import { createRts, step } from '../src/rts/core.js';
import { generateWorld } from '../src/world.js';
import * as WorldX from '../src/rts/world_x.js';
import * as Units from '../src/rts/units.js';
import { reachMap } from '../src/rts/wx_place.js';
import { killQuiet } from '../src/rts/neutrals.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL', msg); } };
const nSeeds = +process.argv[2] || 8;
const DT = 1 / 30;
const byKind = (st, k) => st.neutral.filter((s) => s.kind === k);

console.log('== populate, fairness, reachability');
let st1 = null;
for (let seed = 1; seed <= nSeeds; seed++) {
  const world = generateWorld(seed);
  const st = createRts({ seed, humans: [0], world });
  st.ents = st.ents.filter((e) => e.team >= 0); st.neutral.length = 0;
  const t0 = performance.now();
  WorldX.populate(st);
  const dt = performance.now() - t0;
  if (seed === 1) st1 = st;
  const counts = {};
  for (const s of st.neutral) counts[s.kind] = (counts[s.kind] || 0) + 1;
  const reach = reachMap(st);
  const bad = st.neutral.filter((s) => s.kind !== 'pickup' && s.kind !== 'caravan' && !reach(s.x, s.z)).length;
  // fairness: nearest site of each kind per start quadrant
  let worst = 0; const w = st.world;
  for (const kind of Object.keys(counts)) {
    if (['camp', 'temple', 'caravan', 'pickup', 'soulpool'].includes(kind)) continue;
    const d = [0, 1, 2, 3].map((q) => Math.min(...byKind(st, kind).map((s) => Math.hypot(s.x - w.hearts[q].x, s.z - w.hearts[q].z))));
    worst = Math.max(worst, Math.max(...d) - Math.min(...d));
  }
  const onNode = st.neutral.filter((s) => s.kind !== 'pickup' && s.kind !== 'camp').filter((s) => st.nodes.some((n) => n.id !== (s.node && s.node.id) && Math.hypot(n.x - s.x, n.z - s.z) < 4)).length;
  console.log(`seed ${seed}: populate ${Math.round(dt)} ms | sites ${Object.entries(counts).map(([k, v]) => k + ':' + v).join(' ')} | unreachable ${bad} | fairness spread ${worst.toFixed(2)} m | on-node ${onNode} | neutral units ${st.ents.filter((e) => e.team < 0).length}`);
  ok(bad === 0, 'unreachable sites');
  ok(worst < 0.5, 'fairness spread');
  ok(dt < 1000, 'populate time');
  ok((counts.village || 0) === 12 && (counts.leyline || 0) >= 4, 'expected counts');
}

console.log('== capture / income / mana / vision');
{
  const st = st1, t = st.teams[0];
  const vil = byKind(st, 'village').find((s) => s.quad === 0), ley = byKind(st, 'leyline').find((s) => s.quad === 0), bea = byKind(st, 'beacon').find((s) => s.quad === 0);
  const mk = (s) => { for (let i = 0; i < 3; i++) Units.spawn(st, 'necro_skeleton', 0, s.x + i, s.z + 1); for (const id of s.guards) { const u = st.byId.get(id); if (u) killQuiet(st, u); } };
  for (const s of [vil, ley, bea]) mk(s);
  const g0 = t.res.gold, m0 = t.mana;
  for (let i = 0; i < 30 * 40; i++) { st.t += DT; WorldX.update(st, DT); st.events.length = 0; }
  console.log(`village owner ${vil.owner} ley owner ${ley.owner} beacon owner ${bea.owner} | gold +${(t.res.gold - g0).toFixed(1)} blood ${t.res.blood.toFixed(1)} mana +${(t.mana - m0).toFixed(1)} | vision sources ${WorldX.worldVision(st, 0).length}`);
  ok(vil.owner === 0 && ley.owner === 0 && bea.owner === 0, 'sites captured');
  ok(t.res.gold > g0 + 5, 'village income');
  ok(WorldX.worldVision(st, 0).some((v) => v.kind === 'beacon'), 'beacon vision');
  const d = WorldX.describe(st, vil.id); ok(d && d.actions.length >= 2, 'describe');
  console.log('  rates', JSON.stringify(WorldX.rates(st, 0)), '| mods', JSON.stringify(WorldX.mods(st, st.ents.find((e) => e.team === 0))));
  // ally + levy command
  const v2 = byKind(st, 'village').find((s) => s.quad === 1 && s.ti === 0);
  t.res.gold = 500; WorldX.command(st, 0, { t: 'allyVillage', site: v2.id }); ok(v2.owner === 0 && v2.allied, 'ally village');
  v2.levyT = 0; v2.levyReady = true; const n0 = st.ents.length; WorldX.command(st, 0, { t: 'levy', site: v2.id }); console.log('  levy spawned', st.ents.length - n0);
  // mercenaries
  const mc = byKind(st, 'mercs').find((s) => s.quad === 0); Units.spawn(st, 'necro_skeleton', 0, mc.x, mc.z); t.res.gold = 500; const n1 = st.ents.length;
  WorldX.command(st, 0, { t: 'hireMerc', camp: mc.id, unit: 'wx_merc_pike' }); ok(st.ents.length - n1 === 2, 'hire merc');
}

console.log('== caravan, weather, events over 25 min, temple ritual');
{
  const st = createRts({ seed: 3, humans: [0] });
  const car = byKind(st, 'caravan')[0];
  const kinds = new Set(), evs = [], ann = [];
  let moved = 0, last = null, flips = 0, lastKind = 'clear', night = 0;
  const t0 = performance.now();
  for (let i = 0; i < 25 * 60 * 30; i++) {
    if (i < 30 * 330) step(st, DT, {}); else { st.t += DT; WorldX.update(st, DT); }
    for (const e of st.events) { if (e.type === 'announce') ann.push(Math.round(st.t) + 's ' + e.text); if (e.type === 'weather' && e.kind !== 'lightning') evs.push(e.kind); }
    st.events.length = 0;
    kinds.add(st.weather.kind); if (st.weather.kind !== lastKind) { flips++; lastKind = st.weather.kind; }
    if (st.time.night) night++;
    const wg = car.wagon && st.byId.get(car.wagon);
    if (wg && wg.alive) { if (last) moved += Math.hypot(wg.x - last.x, wg.z - last.z); last = { x: wg.x, z: wg.z }; }
  }
  const dtm = performance.now() - t0;
  console.log(`weather kinds ${[...kinds].join(',')} transitions ${flips} | night fraction ${(night / 45000).toFixed(2)} | caravan state ${car.state} wagon moved ${moved.toFixed(0)} m | WorldX.update avg ${(dtm / 45000).toFixed(3)} ms`);
  console.log('  event log:', st.events2.log.map((l) => l.t + 's ' + l.type).join(', '));
  console.log('  announcements', ann.length, '| first:', ann.slice(0, 6).join(' | '));
  ok(kinds.size >= 3, 'weather variety'); ok(st.events2.log.some((l) => l.type === 'dread') && st.events2.log.some((l) => l.type === 'plague') && st.events2.log.some((l) => l.type === 'meteor'), 'events fired');
  ok(dtm / 45000 < 2, 'update speed');
  // temple ritual win
  const ts = byKind(st, 'temple')[0]; const king = st.byId.get(ts.guardian);
  if (king && king.alive) king.alive = false;
  for (let i = 0; i < 4; i++) Units.spawn(st, 'orc_grunt', 1, ts.x + i, ts.z + 1);
  for (let i = 0; i < 30 * 200 && !st.over; i++) { st.t += DT; WorldX.update(st, DT); st.events.length = 0; }
  console.log('ritual: temple', JSON.stringify(WorldX.templeState(st)), 'over', JSON.stringify(st.over));
  ok(st.over && st.over.reason === 'ritual' && st.over.winner === 1, 'ritual win');
}
console.log(fails ? `${fails} FAILURES` : 'ALL OK');
process.exit(fails ? 1 : 0);
