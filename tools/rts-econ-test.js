// Headless test of the RTS ECON lane. node tools/rts-econ-test.js [seed]
import { createRts, step } from '../src/rts/core.js';
import { SIM_DT, RES } from '../src/rts/consts.js';
import * as Econ from '../src/rts/econ.js';
import * as Units from '../src/rts/units.js';
import * as Buildings from '../src/rts/buildings.js';

const seed = +process.argv[2] || 1337;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const run = (st, secs, inputs) => { for (let i = 0; i < secs / SIM_DT; i++) step(st, SIM_DT, i === 0 && inputs ? inputs : {}); };
const st = createRts({ seed, humans: [0] });
const W = st.world;

// ---- node fairness per start region
console.log('\n== nodes', st.nodes.length);
const kinds = {}; for (const n of st.nodes) kinds[n.rtype] = (kinds[n.rtype] || 0) + 1;
console.log(JSON.stringify(kinds));
for (const t of st.teams) {
  const h = W.hearts[t.id], mine = st.nodes.filter((n) => n.region === t.id);
  const by = {}; for (const n of mine) (by[n.rtype] = by[n.rtype] || []).push(Math.hypot(n.x - h.x, n.z - h.z));
  console.log('team', t.id, Object.entries(by).map(([k, a]) => k + ' x' + a.length + ' avg ' + (a.reduce((s, v) => s + v, 0) / a.length).toFixed(0) + 'm').join(' | '));
}
const counts = st.teams.map((t) => st.nodes.filter((n) => n.region === t.id).length);
ok(Math.max(...counts) - Math.min(...counts) <= 2, 'region node counts balanced ' + counts);
ok(st.nodes.every((n) => W.walkable(n.x, n.z) && st.byId.get(n.id) === n), 'all nodes walkable + registered');
// reachability: flood fill on 2 m grid from team 0 heart
{
  const H = 200, seen = new Set(), q = [[W.hearts[0].x, W.hearts[0].z]]; const key = (x, z) => Math.round((x + H) / 2) * 400 + Math.round((z + H) / 2);
  seen.add(key(q[0][0], q[0][1]));
  while (q.length) { const [x, z] = q.pop(); for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const nx = x + dx, nz = z + dz, k = key(nx, nz); if (!seen.has(k) && W.walkable(nx, nz)) { seen.add(k); q.push([nx, nz]); } } }
  const bad = st.nodes.filter((n) => !seen.has(key(n.x, n.z)));
  ok(bad.length === 0, 'all nodes reachable from team 0 heart' + (bad.length ? ' (unreachable: ' + bad.map((n) => n.rtype + '@' + n.x.toFixed(0) + ',' + n.z.toFixed(0)).join(' ') + ')' : ''));
}

// ---- gathering rates: 6 workers per node type, one team at a time on separate teams' nodes
console.log('\n== gather rates (6 workers per type, 120 s)');
function rateTest(rtype, teamId) {
  const s = createRts({ seed, humans: [0], ai: [] });
  const t = s.teams[teamId], h = s.world.hearts[teamId];
  const nodes = s.nodes.filter((n) => n.rtype === rtype && n.region === teamId);
  const node = nodes.sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0];
  if (!node) return null;
  const ws = s.ents.filter((e) => e.team === teamId && e.role === 'worker');
  const res0 = t.res[node.res], a0 = node.amount;
  run(s, 1, { [teamId]: { cmds: [{ t: 'order', ids: ws.map((w) => w.id), order: { type: 'gather', node: node.id } }] } });
  run(s, 120);
  const got = t.res[node.res] - res0, dist = Math.hypot(node.x - h.x, node.z - h.z);
  return { got, perMinPerWorker: got / 2 / ws.length, depleted: a0 - node.amount, dist, node };
}
for (const [rt, team] of [['tree', 0], ['quarry', 0], ['mine', 0], ['bloodwell', 0], ['herd', 0], ['tree', 2], ['quarry', 2]]) {
  const r = rateTest(rt, team);
  if (!r) { console.log(rt, 'team', team, 'no node'); continue; }
  console.log(rt.padEnd(10), 'team', team, 'dist', r.dist.toFixed(0) + 'm', 'deposited', r.got, ' per worker/min', r.perMinPerWorker.toFixed(1), ' node lost', r.depleted.toFixed(0));
  ok(r.got > 0 && r.perMinPerWorker > 10 && r.perMinPerWorker < 90, rt + ' team ' + team + ' rate sane');
}

// ---- storage distance effect
{
  const s = createRts({ seed, humans: [0], ai: [] });
  const t = s.teams[0], node = s.nodes.find((n) => n.rtype === 'tree' && n.region === 0);
  const w = s.ents.find((e) => e.team === 0 && e.role === 'worker');
  const r0 = t.res.timber;
  run(s, 1, { 0: { cmds: [{ t: 'order', ids: [w.id], order: { type: 'gather', node: node.id } }] } }); run(s, 90);
  const far = t.res.timber - r0;
  // a storehouse next to the grove
  const sh = Buildings.create(s, 'storehouse', 0, node.x + 5, node.z + 5, 0, { instant: true });
  const r1 = t.res.timber; run(s, 90); const nearGot = t.res.timber - r1;
  console.log('\nstorage effect: keep-only', far, 'per 90s | storehouse by grove', nearGot, 'per 90s', 'store:', sh.type);
  ok(nearGot >= far, 'storehouse near the grove increases yield');
}

// ---- idle detection + build + auto gather
{
  const s = createRts({ seed, humans: [0], ai: [] });
  const t = s.teams[0], node = s.nodes.find((n) => n.rtype === 'tree' && n.region === 0);
  run(s, 0.5);
  ok(t.idle && t.idle.length === 6, 'idle list has 6 workers: ' + (t.idle && t.idle.length));
  const ws = s.ents.filter((e) => e.team === 0 && e.role === 'worker').slice(0, 3);
  const b = Buildings.create(s, 'storehouse', 0, node.x + 6, node.z + 2, 0, { instant: false });
  run(s, 1, { 0: { cmds: [{ t: 'order', ids: ws.map((w) => w.id), order: { type: 'build', bld: b.id } }] } });
  run(s, 60);
  ok(b.state === 'ready' || b.progress >= 1, 'workers finished building (' + b.state + ' ' + (b.progress || 0).toFixed(2) + ')');
  run(s, 20);
  ok(ws.some((w) => w.order && w.order.type === 'gather'), 'workers auto-gather after building a camp ' + ws.map((w) => (w.order && w.order.type) + '/' + (w.w && w.w.s) + '/' + w.x.toFixed(0) + ',' + w.z.toFixed(0)).join(' ') + ' node ' + node.x.toFixed(0) + ',' + node.z.toFixed(0) + ' amt ' + node.amount.toFixed(0));
}

// ---- depletion + regrowth
{
  const s = createRts({ seed, humans: [0], ai: [] });
  const tr = s.nodes.find((n) => n.rtype === 'tree'), q = s.nodes.find((n) => n.rtype === 'quarry');
  tr.amount = 100; q.amount = 100; run(s, 1);
  tr.amount = 0; run(s, 1); ok(tr.depleted, 'tree depletes');
  run(s, 400); ok(!tr.depleted && tr.amount > 0, 'tree regrows after depletion (' + tr.amount.toFixed(0) + ')');
  q.amount = 0; run(s, 100); ok(q.depleted && q.amount === 0, 'quarry stays depleted');
}

// ---- upkeep / starvation
{
  const s = createRts({ seed, humans: [0], ai: [] });
  const t = s.teams[0], h = s.world.hearts[0];
  for (let i = 0; i < 30; i++) Units.spawn(s, 'necro_skeleton', 0, h.x + 10 + (i % 6), h.z + 10 + Math.floor(i / 6), { role: 'melee' });
  run(s, 2);
  const rt = Econ.rates(s, 0); console.log('\nupkeep/min with 30 soldiers + 6 workers:', rt.upkeep.blood.toFixed(1), 'net', JSON.stringify(Object.fromEntries(RES.map((r) => [r, +rt[r].toFixed(1)]))));
  ok(rt.upkeep.blood > 5, 'upkeep computed');
  const b0 = t.res.blood; run(s, 60); ok(t.res.blood < b0, 'blood drains from upkeep (' + b0 + ' -> ' + t.res.blood + ')');
  t.res.blood = 0; t.econ.frac.blood = 0;
  const n0 = s.ents.filter((e) => e.alive && e.team === 0 && e.role === 'melee').length;
  run(s, 60); const n1 = s.ents.filter((e) => e.alive && e.team === 0 && e.role === 'melee').length;
  ok(t.econ.starving && n1 < n0, 'starvation causes desertion (' + n0 + ' -> ' + n1 + ')');
}

// ---- trade
{
  const s = createRts({ seed, humans: [0], ai: [] }), t = s.teams[0];
  t.res.gold = 1000; step(s, SIM_DT, { 0: { cmds: [{ t: 'trade', give: 'gold', get: 'stone', amount: 200 }] } });
  ok(t.res.stone === 150, 'trade refused without a market');
  const h = s.world.hearts[0]; Buildings.create(s, 'market', 0, h.x + 14, h.z + 14, 0, { instant: true });
  const before = Econ.prices(s).stone;
  step(s, SIM_DT, { 0: { cmds: [{ t: 'trade', give: 'gold', get: 'stone', amount: 200 }] } });
  const got = t.res.stone - 150; console.log('\ntrade 200 gold ->', got, 'stone (fee', 15, '%) ; stone price', before.toFixed(2), '->', Econ.prices(s).stone.toFixed(2));
  ok(t.res.gold === 800 && got > 50 && got < 130, 'trade converts with fee');
  step(s, SIM_DT, { 0: { cmds: [{ t: 'trade', give: 'gold', get: 'souls', amount: 10 }] } }); ok(t.res.souls === 0, 'souls not tradeable');
}

// ---- sacrifice + souls on death
{
  const s = createRts({ seed, humans: [0], ai: [] }), h = s.world.hearts[0];
  const us = []; for (let i = 0; i < 5; i++) us.push(Units.spawn(s, 'necro_skeleton', 0, h.x + 8 + i, h.z + 8, { role: 'melee' }));
  const t = s.teams[0], bl0 = t.res.blood;
  step(s, SIM_DT, { 0: { cmds: [{ t: 'sacrifice', ids: us.map((u) => u.id) }] } });
  console.log('\nsacrifice 5: souls', t.res.souls, 'blood +' + (t.res.blood - bl0));
  ok(t.res.souls >= 5 && us.every((u) => !u.alive), 'sacrifice kills units and grants souls');
  // death souls: enemy unit killed by team 0, away from sites vs on an altar
  const kill = (x, z) => { const v = Units.spawn(s, 'orc_grunt', 1, x, z, { role: 'melee' }); const k = Units.spawn(s, 'necro_skeleton', 0, x, z, { role: 'melee' }); const s0 = t.res.souls + t.econ.frac.souls; require_kill(s, v, k); return t.res.souls + t.econ.frac.souls - s0; };
  const base = kill(h.x + 40, h.z + 40);
  Buildings.create(s, 'soul_altar', 0, h.x + 60, h.z + 60, 0, { instant: true });
  const alt = kill(h.x + 61, h.z + 61);
  console.log('souls per kill: open ground', base.toFixed(2), '| next to own soul altar', alt.toFixed(2));
  ok(base > 0 && alt > base, 'souls from kills; more near an altar');
  const other = s.teams[1].res.souls; const v2 = Units.spawn(s, 'orc_grunt', 1, h.x + 61, h.z + 61, { role: 'melee' }); require_kill(s, v2, null);
  ok(s.teams[0].res.souls >= other, 'ownerless death near altar gives souls to site owner');
}
import * as Core from '../src/rts/core.js';
function require_kill(s, v, k) { Core.killEnt(s, v, k); }

// ---- soul wells, farms, passive income
{
  const s = createRts({ seed, humans: [0], ai: [] }), t = s.teams[0], w = s.nodes.find((n) => n.rtype === 'soulwell');
  run(s, 2); const a = t.res.souls;
  Buildings.create(s, 'soul_harvester', 0, w.x + 4, w.z, 0, { instant: true }); run(s, 60);
  console.log('\nsoul well with harvester: +' + (t.res.souls - a) + ' souls / 60 s; amount never depletes', w.amount);
  ok(t.res.souls - a > 10, 'harvested soul well produces souls');
  const g0 = t.res.gold; Econ.addIncome(s, 0, 'gold', 30, 1); ok(t.res.gold - g0 === 30, 'addIncome');
  const b0 = t.res.blood; const h = s.world.hearts[0]; Buildings.create(s, 'blood_farm', 0, h.x + 14, h.z - 14, 0, { instant: true }); run(s, 60);
  ok(t.res.blood > b0 - 5, 'blood farm offsets upkeep');
}

// ---- timing
{
  const s = createRts({ seed, humans: [0] });
  for (const t of s.teams) { const nodes = s.nodes.filter((n) => n.region === t.id); for (const u of s.ents.filter((e) => e.team === t.id && e.role === 'worker')) { const n = nodes[u.id % nodes.length]; u.orders = [{ type: 'gather', node: n.id }]; u.order = u.orders[0]; } }
  const t0 = performance.now(); run(s, 120); console.log('\n120 s of 4 teams gathering:', ((performance.now() - t0) / (120 / SIM_DT)).toFixed(2), 'ms/step');
  console.log('gathered', JSON.stringify(s.teams.map((t) => t.stats.gathered)));
}
console.log(fails ? '\n' + fails + ' FAILED' : '\nALL OK');
process.exit(fails ? 1 : 0);
