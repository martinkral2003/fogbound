// HORDE lane test: node tools/v4-horde-test.js   (exits non-zero on failure)
import { createGame, step, simApi, damage } from '../src/sim.js';
import { SIM_DT, HORDE } from '../src/data.js';
import * as horde from '../src/horde.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const NONE = [{}, {}, {}, {}];
const evs = [];
let smiters = [];  // test heroes that fight: [team, dps, range]
const mk = (seed = 1) => { smiters = []; seek.clear(); evs.length = 0; return createGame({ seed, humans: [0] }); };
function run(st, sec, until) {
  const n = Math.round(sec / SIM_DT);
  for (let i = 0; i < n; i++) {
    for (const [k, dps, rng] of smiters) smite(st, k, dps, rng);
    step(st, SIM_DT, NONE);
    for (const e of st.events) evs.push(e);
    st.events.length = 0;
    if (until && until()) return true;
    if (st.over) return until ? !!until() : true;
  }
  return false;
}
const first = (type, f = () => true) => evs.find((e) => e.type === type && f(e));
const count = (type, f = () => true) => evs.filter((e) => e.type === type && f(e)).length;
const tough = (st) => { for (const t of st.teams) if (t.hero) { t.hero.hp = 1e9; t.hero.maxHp = 1e9; } };
const place = (st, k, x, z) => { const h = st.teams[k].hero; h.x = h.ox = x; h.z = h.oz = z; h.hp = 1e9; h.maxHp = 1e9; };
const parkHeroes = (st) => { st.teams.forEach((t, i) => { if (t.hero) place(st, i, -380 + i * 4, 380); }); };
const slay = (st, k, dps, range) => { smiters = smiters.filter((q) => q[0] !== k); smiters.push([k, dps, range]); };
function smite(st, k, dps, range) {
  const h = st.teams[k].hero; if (!h) return;
  h.maxHp = 1e9; if (h.alive) h.hp = 1e9;
  if (!h.alive) return;
  let best = null, bd = range;
  for (const e of st.ents) { if (e.kind !== 'mon' || !e.alive || e.hp <= 0 || (seek.has(k) && e.hz !== 'occupy')) continue; const d = Math.hypot(e.x - h.x, e.z - h.z) - e.r; if (d < bd) { bd = d; best = e; } }
  if (best) damage(st, h, best, dps * SIM_DT);
  else if (seek.has(k)) { // walk to the nearest orc (reclaim tests)
    let nb = null, nd = 160;
    for (const e of st.ents) { if (e.kind !== 'mon' || !e.alive || e.hz !== 'occupy') continue; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < nd) { nd = d; nb = e; } }
    if (nb) { h.x = h.ox = nb.x - 3; h.z = h.oz = nb.z; }
  }
}
const seek = new Set();
const strip = (st, tw) => { for (const g of tw.guards.slice()) { const e = st.byId.get(g); if (e) { e.hp = 0; simApi.kill(st, e, null); } } tw.guards = []; tw.maxGuards = 0; tw.gq = []; };
const garrison = (st, c) => c.ids.filter((id) => { const m = st.byId.get(id); return m && m.alive; }).length;
const capOf = (st) => st.towns.find((t) => t.kind === 'capital');

// ---- 1. state + front-line timeline
{
  const st = mk();
  const h = st.horde;
  ok(h && h.ready && h.len > 300 && h.camps.length >= 5, `st.horde built (path ${Math.round(h.len)} m, ${h.camps.length} camps)`);
  ok(h.warlord && h.warlord.state === 'idle' && h.camps.some((c) => c.kind === 'warcamp'), 'warlord idle in the main war-camp');
  ok(typeof horde.frontPos(st).x === 'number' && Array.isArray(horde.hordeList(st)) && horde.hordeList(st).some((q) => q.type === 'camp'), 'frontPos / hordeList exports');
  parkHeroes(st);
  const d0 = h.dist;
  run(st, 120);
  ok(h.dist > d0 + 5, `front advances (${d0.toFixed(0)} -> ${h.dist.toFixed(0)} m after 120 s)`);
  ok(run(st, 600, () => first('townAttacked', (e) => e.warn && !e.cap)), 'first assault warning fires');
  const w = first('townAttacked', (e) => e.warn);
  ok(w.eta >= 20 && w.size >= 8 && st.t > HORDE.firstFall - 150 && st.t < HORDE.firstFall + 60, `first warning at ${st.t.toFixed(0)} s (eta ${w.eta.toFixed(0)} s, ${w.size} orcs)`);
  ok(first('msg', (e) => /orcs march/i.test(e.text)), 'warning message');
  const act = horde.activeAssaults(st);
  ok(act.some((q) => q.state === 'warning' && !q.hunt >= 0 || q.town === w.town), 'activeAssaults lists it');
  const a = st.horde.assaults.find((q) => q.hunt < 0);
  const mons = a.ids.map((id) => st.byId.get(id));
  ok(mons.every((m) => m && m.team === -1 && m.hz === 'assault' && m.maxHp > 0), 'band = team -1 orcs');
  const kinds = new Set(mons.map((m) => m.type));
  ok(kinds.size >= 2, `mixed roster (${[...kinds].join(', ')})`);
  const tw = st.towns.find((t) => t.id === a.townId);
  const dist0 = Math.hypot(a.x - tw.x, a.z - tw.z);
  run(st, 80);
  ok(Math.hypot(a.x - tw.x, a.z - tw.z) < dist0 - 30 || a.state === 'siege' || a.state === 'done', `band marches on ${tw.name} (${dist0.toFixed(0)} m -> ${Math.hypot(a.x - tw.x, a.z - tw.z).toFixed(0)} m)`);
}

// ---- 2. a defended town holds, an undefended one falls
function townTest(defended, seed) {
  const st = mk(seed);
  parkHeroes(st);
  const h = st.horde;
  const tw = st.towns.find((t) => t.kind === 'village' && t.id !== st.world.sites.startTown) || st.towns[1];
  h.sched.forEach((s) => { s.trig = true; });
  const a = horde.launchAssault(st, tw, { size: 8, tier: 1, warn: 5 });
  if (defended) {
    place(st, 0, tw.x, tw.z); place(st, 1, tw.x + 3, tw.z + 3);
    slay(st, 0, 300, 10); slay(st, 1, 300, 10);
  } else strip(st, tw);
  run(st, defended ? 400 : 700, () => a.state === 'done');
  return { st, a, tw };
}
{
  const { st, a, tw } = townTest(true, 3);
  ok(a.state === 'done' && a.result === 'saved', `defended town is saved (${a.result}, t=${st.t.toFixed(0)}, state ${tw.state})`);
  ok(first('townSaved', (e) => e.town === tw.id), 'townSaved event');
  ok(tw.state === 'safe', 'town back to safe');
  ok(st.horde.stats.townsSaved === 1, 'stats.townsSaved');
}
{
  const { st, a, tw } = townTest(false, 3);
  ok(a.state === 'done' && a.result === 'fallen' && tw.state === 'fallen', `undefended town falls (${a.result}, state ${tw.state}, t=${st.t.toFixed(0)})`);
  ok(first('townFallen', (e) => e.town === tw.id), 'townFallen event');
  ok(count('townFallen', (e) => e.town === tw.id) === 1, 'townFallen emitted once');
  ok((st.horde.occ[tw.id] || []).length > 0, 'orcs occupy the fallen town');
  const occ = st.horde.occ[tw.id].slice();
  place(st, 0, tw.x, tw.z); slay(st, 0, 300, 14);
  run(st, 300, () => tw.state === 'safe');
  ok(tw.state === 'safe' && first('townReclaimed', (e) => e.town === tw.id), `town reclaimed after clearing the occupiers (${occ.length} orcs)`);
}

// ---- 3. destroying a war-camp slows the front
{
  const st = mk(2);
  parkHeroes(st);
  const h = st.horde;
  run(st, 200);
  const rate0 = h.rate;
  const c = h.camps.find((q) => q.kind === 'camp') || h.camps[h.camps.length - 1];
  place(st, 0, c.x, c.z - 20);
  ok(run(st, 30, () => c.armed), 'camp arms when a hero comes close');
  const b = st.byId.get(c.entId);
  ok(b && b.alive && b.type === 'warbanner' && garrison(st, c) >= 4, `banner + garrison spawned (${garrison(st, c)} orcs)`);
  slay(st, 0, 600, 40);
  ok(run(st, 120, () => !c.alive), 'banner can be destroyed');
  ok(first('campDestroyed', (e) => e.id === c.id), 'campDestroyed event');
  ok(h.destroyed === 1 && h.rate < rate0, `front rate drops (${rate0.toFixed(2)} -> ${h.rate.toFixed(2)})`);
  const st2 = mk(2); parkHeroes(st2); run(st2, st.t);
  ok(st.horde.dist < st2.horde.dist - 5, `front is behind an untouched run (${st.horde.dist.toFixed(0)} vs ${st2.horde.dist.toFixed(0)} m)`);
}

// ---- 4. capital siege: waves, fall, reclaim window -> defeat
function siegeSetup(seed, bare = true) {
  const st = mk(seed);
  parkHeroes(st);
  const h = st.horde, cap = capOf(st);
  h.sched.forEach((s) => { if (!s.cap) s.trig = true; });
  st.t = HORDE.capitalAt - 100; h.hc = HORDE.capitalAt - 120;
  run(st, 200, () => first('capitalSiege'));
  if (bare) strip(st, cap);
  return { st, h, cap };
}
{
  const { st } = siegeSetup(4, false);
  ok(first('capitalSiege'), `capital siege begins (t=${st.t.toFixed(0)})`);
  ok(run(st, 200, () => count('townAttacked', (e) => e.warn && e.cap) >= 3), `capital waves arrive (${count('townAttacked', (e) => e.warn && e.cap)} warnings)`);
}
{
  const { st, h } = siegeSetup(4);
  ok(run(st, 900, () => first('capitalFallen')), 'undefended capital falls');
  const f = first('capitalFallen');
  ok(f && f.reclaim >= 300 && h.capital.state === 'fallen', `reclaim window ${f && f.reclaim} s`);
  ok(!st.over, 'game not over during the reclaim window');
  ok(run(st, HORDE.capital.reclaim + 60, () => st.over), 'game ends when the window runs out');
  ok(st.over && st.over.reason === 'capital' && st.over.winner === -1, `endGame capital (${JSON.stringify(st.over && { w: st.over.winner, r: st.over.reason })})`);
}
{
  const { st, h, cap } = siegeSetup(5);
  run(st, 1000, () => first('capitalFallen'));
  place(st, 0, cap.x - 25, cap.z); seek.add(0); slay(st, 0, 700, 14);
  ok(run(st, 400, () => h.capital.state === 'held'), `capital reclaimed by killing the occupiers (${h.capital.state})`);
  ok(first('capitalReclaimed') && !st.over, 'capitalReclaimed event, no defeat');
}

// ---- 5. Dread Moon spawns elite assaults
{
  const st = mk(6);
  parkHeroes(st);
  st.horde.sched.forEach((s) => { s.trig = true; });
  st.t = 480 - 30;
  ok(run(st, 60, () => first('hordeHunt')), 'Dread Moon launches an elite hunting band');
  const a = st.horde.assaults.find((q) => q.dread);
  ok(a && a.size >= 10, `band of ${a && a.size}`);
}

// ---- 6. Warlord boss
{
  const st = mk(7);
  parkHeroes(st);
  st.horde.sched.forEach((s) => { s.trig = true; });
  const w = st.horde.warlord;
  place(st, 0, w.x + 25, w.z);
  slay(st, 0, 450, 8);
  ok(run(st, 30, () => w.spawned), 'Warlord spawns when a hero nears');
  const e = st.byId.get(w.id);
  ok(e && e.boss && e.maxHp > 5000, `Warlord entity (hp ${e && Math.round(e.maxHp)})`);
  run(st, 600, () => st.over);
  ok(first('warlordPhase'), 'phase change events (adds / rage)');
  ok(count('telegraph') >= 2, `ground telegraphs (${count('telegraph')})`);
  ok(first('warlordSlain') && st.over && st.over.reason === 'warlord' && st.over.winner === 0, `endGame warlord (${JSON.stringify(st.over && { w: st.over.winner, r: st.over.reason })})`);
  ok(st.items.length >= 2, `legendary loot dropped (${st.items.length} items)`);
  ok((st.teams[0].orbs || 0) >= 1, `orbs awarded (${st.teams[0].orbs})`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
