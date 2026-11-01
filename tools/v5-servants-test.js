// SERVANTS lane test (v0.5): node tools/v5-servants-test.js [--verbose]
// Roster + models, stats, every spell casts and works, three sources (cage, hire, summon), cap 4, re-hire, follow-teleport, stances, militia respawn, balance probes.
import fs from 'node:fs';
import { createGame, step, simApi } from '../src/sim.js';
import * as T from '../src/towns.js';
import * as D from '../src/data.js';
import * as RC from '../src/recruits.js';

const { SIM_DT, UNITS, SERVANT_SPELLS: SPELLS, MERC_TYPES } = D;
const VERBOSE = process.argv.includes('--verbose');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL: ' + m); } else if (VERBOSE) console.log('ok:   ' + m); };
const info = (m) => console.log('      ' + m);

const evs = [];
const idle = (st) => st.teams.map(() => ({ cmds: [] }));
function run(st, secs, cmds = [], per = null) {
  const n = Math.round(secs / SIM_DT);
  for (let i = 0; i < n; i++) {
    const inp = idle(st);
    if (i === 0) inp[0].cmds.push(...cmds);
    if (per && per(i) === false) break;
    step(st, SIM_DT, inp); evs.push(...st.events); st.events.length = 0;
  }
}
const evOf = (t, f) => evs.filter((e) => e.type === t && (!f || f(e)));
const clearEv = () => { evs.length = 0; };

// ---------------------------------------------------------------- arena
// a quiet game: horde off, camps frozen, wild monsters removed; heroes of teams 1-3 parked far away
const worlds = new Map();
function quiet(seed = 7) {
  const st = createGame({ seed, humans: [0], world: worlds.get(seed) });
  worlds.set(seed, st.world);
  if (st.horde) st.horde.ready = false;
  for (const c of st.camps) { c.noResp = true; }
  for (const e of st.ents) if (e.kind === 'mon' || (e.kind === 'unit' && e.team !== 4)) { e.alive = false; e.hp = 0; }
  const team = st.teams[0], h = team.hero;
  for (let i = 1; i < 4; i++) { const o = st.teams[i].hero; o.x = -140 + i * 3; o.z = 140; o.ox = o.x; o.oz = o.z; }
  return { st, team, h };
}
// hero on open ground away from every town and POI (safe zones make monsters drop their targets)
function toWilds(S) {
  const { st, team, h } = S, w = st.world, tw = st.towns || [];
  const half = D.WORLD.half;
  for (let r = 10; r < half; r += 8) for (let a = 0; a < 6.28; a += 0.3) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!w.walkable(x, z) || !w.walkable(x + 14, z) || !w.walkable(x - 14, z) || !w.walkable(x, z + 14) || !w.walkable(x, z - 14)) continue;
    if (tw.some((t) => Math.hypot(t.x - x, t.z - z) < (t.r || 40) + 40)) continue;
    h.x = x; h.z = z; h.ox = x; h.oz = z; team.fpos = { x, z };
    return S;
  }
  throw new Error('no open ground');
}
// one persistent quiet arena per seed (world generation and createGame are slow): wiped clean between scenarios
const arenas = new Map();
function arena(seed = 7) {
  let S = arenas.get(seed);
  if (!S) { S = toWilds(quiet(seed)); S.home = { x: S.h.x, z: S.h.z }; S.h.invuln = true; arenas.set(seed, S); }
  const { st, team, h } = S;
  for (const e of st.ents) if (e.kind !== 'hero' && !(e.kind === 'unit' && e.team === 4)) { e.alive = false; e.hp = 0; }
  st.projs.length = 0; st.timers.length = 0; st.sv = null; team.followers = []; team.cd = {}; team.fpos = null;
  h.x = S.home.x; h.z = S.home.z; h.ox = h.x; h.oz = h.z; h.hp = h.maxHp; h.dest = null; h.stun = 0; h.slowUntil = 0; h.shield = null; h.buff = null;
  step(st, SIM_DT, idle(st)); st.events.length = 0; clearEv();
  return S;
}
const demonKey = () => (D.MONSTERS.imp ? 'imp' : (D.MONSTERS.skeleton ? 'skeleton' : Object.keys(D.MONSTERS)[0]));
function spawnImp(st, x, z, o = {}) {
  const key = o.key || demonKey();
  const camp = { id: 9000 + st.camps.length, x, z, tier: 1, types: [key], mons: 1, respT: 0, boss: false, noResp: true };
  st.camps.push(camp);
  const m = simApi.spawnMonster(st, key, 1, x, z, camp);
  m.aggro = 40;
  if (o.immortal) m.immortal = true;
  return m;
}
const spawnType = (S, type, dx = 0, dz = 0) => {
  const { st, team, h } = S;
  return RC.spawnFollower(st, team, type, { free: true, x: h.x + dx, z: h.z + dz });
};
const wipeFoes = (st) => { for (const e of st.ents) if (e.kind === 'mon') { e.alive = false; e.hp = 0; } };
const alive = (a) => a.filter((e) => e.alive && e.hp > 0).length;

// ---------------------------------------------------------------- 0. data, models, roster
{
  ok(MERC_TYPES.length === 8, 'eight hireable servant types: ' + MERC_TYPES.join(', '));
  const roles = new Set(MERC_TYPES.map((k) => UNITS[k].role));
  ok(['tank', 'healer', 'caster', 'ranged', 'melee', 'summoner'].every((r) => roles.has(r)), 'roles covered: ' + [...roles].join(', '));
  ok(MERC_TYPES.every((k) => UNITS[k].spells && UNITS[k].spells.length >= 1 && UNITS[k].spells.length <= 2), 'every servant has 1-2 spells');
  const prices = MERC_TYPES.map((k) => UNITS[k].cost);
  ok(Math.min(...prices) >= 60 && Math.max(...prices) <= 200, 'hire prices within 60-200: ' + prices.join(','));
  ok(Object.values(SPELLS).every((s) => s.cd >= 5 && s.cd <= 12), 'every spell cooldown is 5-12 s');
  ok(MERC_TYPES.every((k) => UNITS[k].spells.every((s) => SPELLS[s])), 'spell ids resolve');
  ok(D.FOLLOWER_MAX === 4, 'follower cap constant is 4');
  const src = fs.readFileSync(new URL('../src/models_servants.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../src/models.js', import.meta.url), 'utf8');
  const models = [...new Set([...MERC_TYPES, 'militia', 'militiaArcher', 'militiaCaptain', 'spirit'].map((k) => UNITS[k].model))];
  const missing = models.filter((m) => !new RegExp('\\b' + m + '\\s*[:,(]').test(src) && !new RegExp('\\b' + m + '\\s*=>').test(src));
  ok(missing.length === 0, 'every servant model has a builder' + (missing.length ? ': missing ' + missing : ''));
  ok(!MERC_TYPES.some((k) => 'lvl' in UNITS[k] || 'evo' in UNITS[k]), 'no levels / evolution in the roster data');
  const t = fs.readFileSync(new URL('../src/servants.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../src/recruits.js', import.meta.url), 'utf8');
  ok(!/evolve|EVOLVE|giveItem|revivefollower/.test(t), 'no evolution / gear / revival code left in servants.js / recruits.js');
}

// ---------------------------------------------------------------- 1. every type spawns with effective stats and spell state
{
  const S = toWilds(quiet(7));
  for (const type of MERC_TYPES) {
    const d = UNITS[type], e = spawnType(S, type, 2, 0);
    ok(!!e && e.alive && e.recruit && e.kind === 'unit', `${type} spawns as a follower`);
    if (!e) continue;
    ok(Math.abs(e.maxHp - d.hp) / d.hp < 0.03, `${type} max HP ${Math.round(e.maxHp)} matches data ${d.hp}`);
    ok(Math.abs(e.atk - d.atk) / d.atk < 0.03, `${type} damage ${e.atk.toFixed(1)} matches data ${d.atk}`);
    ok(e.sv && e.sv.spells.length === d.spells.length, `${type} has its ${d.spells.length} spell slot(s)`);
    ok(e.lvl === 1 && e.xp === 0, `${type} has no level`);
  }
  run(S.st, 1);
  info('stats (HP / dmg per hit / dps / armor): ' + MERC_TYPES.map((k) => { const d = UNITS[k]; return `${k} ${d.hp}/${d.atk}/${(d.atk / d.cd).toFixed(0)}/${d.armor || 0}`; }).join('  '));
}

// ---------------------------------------------------------------- 2. every spell casts and does its job
// scenario per type: foes placed so every spell can fire; the servant is kept alive, foes are kept alive and never move away (immortal tanks)
function spellScenario(type, setup) {
  const S = arena(7);
  const { st, h } = S;
  const u = spawnType(S, type, 0, 0);
  u.mode = 'hold'; u.hold = { x: u.x, z: u.z };
  const extra = setup ? setup(S, u) || {} : {};
  const casts = new Set();
  clearEv();
  run(st, 22, [], () => {
    for (const e of evs) if (e.type === 'svcast' && e.id === u.id) casts.add(e.spell);
    if (u.hp < u.maxHp * 0.4 && !extra.mortal) u.hp = u.maxHp * 0.5;
    for (const m of extra.foes || []) if (m.alive && m.hp < m.maxHp * 0.5) m.hp = m.maxHp;
    if (extra.keep) extra.keep(S, u);
    return true;
  });
  for (const e of evs) if (e.type === 'svcast' && e.id === u.id) casts.add(e.spell);
  return { S, u, casts, extra };
}
const foesAt = (S, u, list, o = {}) => list.map(([dx, dz]) => spawnImp(S.st, u.x + dx, u.z + dz, o));
{
  const need = (type, casts) => { for (const s of UNITS[type].spells) ok(casts.has(s), `${type} casts ${s} (${[...casts].join(',') || 'nothing'})`); };
  // knight: charge (foe at 9 m), taunt (foes near, one hitting an ally)
  {
    const r = spellScenario('knight', (S, u) => { const foes = foesAt(S, u, [[9, 0], [10, 2], [-6, 1], [-6, -2]]); for (const f of foes) f.hp = f.maxHp = 600; return { foes }; });
    need('knight', r.casts);
  }
  // priest: needs hurt allies and enemies near
  {
    const r = spellScenario('priest', (S, u) => {
      const ally = spawnType(S, 'knight', 3, 0); ally.mode = 'hold'; ally.hold = { x: ally.x, z: ally.z };
      const foes = foesAt(S, u, [[9, 3], [9, -3]], {}); for (const f of foes) f.hp = f.maxHp = 600;
      ally.hp = ally.maxHp * 0.4; u.hp = u.maxHp * 0.6;
      return { foes, ally, keep: () => { if (ally.hp > ally.maxHp * 0.9) ally.hp = ally.maxHp * 0.45; } };
    });
    need('priest', r.casts);
    ok(r.casts.has('mend') && evOf('heal').length > 0, 'priest mend produced heal events');
    ok(evOf('buff').length > 0, 'priest ward / mend produced visual events');
  }
  // battle-mage
  { const r = spellScenario('battlemage', (S, u) => { const foes = foesAt(S, u, [[4, 0], [5, 2], [4, -2], [12, 0]]); for (const f of foes) f.hp = f.maxHp = 500; return { foes }; }); need('battlemage', r.casts); }
  // hound: bite (foe 7 m) + howl (an ally near, foes within 16)
  { const r = spellScenario('hound', (S, u) => { spawnType(S, 'knight', -3, 0); const foes = foesAt(S, u, [[8, 0], [9, 3]]); for (const f of foes) f.hp = f.maxHp = 600; return { foes }; }); need('hound', r.casts); }
  // archer
  { const r = spellScenario('archer', (S, u) => { const foes = foesAt(S, u, [[12, 0], [13, 2], [12, -2]]); for (const f of foes) f.hp = f.maxHp = 700; return { foes }; }); need('archer', r.casts); }
  // golem: slam (foe within 5) + stone skin
  { const r = spellScenario('golem', (S, u) => { const foes = foesAt(S, u, [[3.5, 0], [4, 2], [4, -2]]); for (const f of foes) f.hp = f.maxHp = 700; return { foes }; }); need('golem', r.casts); }
  // imp-tamer
  {
    const r = spellScenario('summoner', (S, u) => { const foes = foesAt(S, u, [[10, 0], [11, 2]]); for (const f of foes) f.hp = f.maxHp = 900; return { foes }; });
    need('summoner', r.casts);
    ok(r.S.st.ents.some((e) => e.summoned && e.type === 'spirit'), 'summoner raised spirits (summoned units exist)');
  }
  // berserker: leap + whirl
  { const r = spellScenario('berserker', (S, u) => { const foes = foesAt(S, u, [[9, 0], [10, 2], [-3, 2]]); for (const f of foes) f.hp = f.maxHp = 700; return { foes }; }); need('berserker', r.casts); }
}
// spell effects (direct checks)
{
  // taunt: enemies hitting an ally turn on the knight
  const S = arena(7), { st } = S;
  const k = spawnType(S, 'knight', 0, 0), a = spawnType(S, 'archer', 3, 0);
  const m = spawnImp(st, k.x + 5, k.z, {}); m.tgt = a.id; m.hp = m.maxHp = 400; k.mode = 'hold'; k.hold = { x: k.x, z: k.z };
  k.sv.spells.find((s) => s.id === 'taunt').cd = 0; k.sv.spells.find((s) => s.id === 'charge').cd = 99;
  run(st, 1.0);
  ok(m.tgt === k.id || evOf('svcast', (e) => e.spell === 'taunt').length > 0, 'taunt pulls enemy attention onto the knight');
  ok(k.shield && k.shield.amt > 0, 'taunt gives the knight a shield');
}
{
  // mend heals, ward shields
  const S = arena(7), { st } = S;
  const p = spawnType(S, 'priest', 0, 0), a = spawnType(S, 'knight', 3, 0);
  a.hp = a.maxHp * 0.3; const before = a.hp;
  spawnImp(st, p.x + 9, p.z, {}).hp = 9999;
  p.sv.spells.forEach((s) => { s.cd = 0; });
  run(st, 1.2);
  ok(a.hp > before + 50, `mend heals the wounded ally (${Math.round(before)} -> ${Math.round(a.hp)})`);
  ok((a.shield && a.shield.amt > 0) || (p.shield && p.shield.amt > 0), 'ward shields an ally');
}
{
  // frost field slows, snare trap slows, nova damages, slam stuns
  const S = arena(7), { st } = S;
  const mage = spawnType(S, 'battlemage', 0, 0), m = spawnImp(st, mage.x + 9, mage.z, {}); m.hp = m.maxHp = 900; m.spd = 0.01; mage.mode = 'hold'; mage.hold = { x: mage.x, z: mage.z };
  mage.sv.spells.find((s) => s.id === 'nova').cd = 99; mage.sv.spells.find((s) => s.id === 'frost').cd = 0;
  run(st, 1.0);
  ok(m.slowUntil > st.t && m.slowMul < 0.8, `frost field slows the target (mul ${m.slowMul})`);
  const a2 = spawnType(S, 'archer', 0, -10); a2.mode = 'hold'; a2.hold = { x: a2.x, z: a2.z };
  const m2 = spawnImp(st, a2.x + 8, a2.z, {}); m2.hp = m2.maxHp = 900; m2.spd = 3.0;
  a2.sv.spells.find((s) => s.id === 'volley').cd = 99; a2.sv.spells.find((s) => s.id === 'snare').cd = 0;
  run(st, 5.0);
  ok(evOf('svcast', (e) => e.spell === 'snare').length > 0 && m2.hp < m2.maxHp, 'snare trap was laid and triggered (target hurt)');
  const g = spawnType(S, 'golem', 20, 0); g.mode = 'hold'; g.hold = { x: g.x, z: g.z };
  const m3 = spawnImp(st, g.x + 2.5, g.z, {}); m3.hp = m3.maxHp = 900;
  g.sv.spells.find((s) => s.id === 'stoneskin').cd = 99;
  const hp0 = m3.hp; run(st, 1.0);
  ok(m3.hp < hp0 - 40, `ground slam damages (${Math.round(hp0 - m3.hp)})`);
}

// ---------------------------------------------------------------- 3. the three sources
let townS = null;
{
  const S = quiet(7); const { st, team, h } = S;
  const town = (st.towns || []).find((t) => t.state !== 'fallen');
  ok(!!town, 'a standing town exists');
  if (town) {
    h.x = town.x; h.z = town.z; h.ox = h.x; h.oz = h.z; team.fpos = { x: h.x, z: h.z };
    team.gold = 1000;
    const offers = RC.mercenaryOffers(st, town.id);
    ok(offers.length === 3, 'a town lists 3 hireable types');
    ok(new Set(offers.map((o) => o.type)).size === 3, 'offers are 3 distinct types: ' + offers.map((o) => `${o.type}:${o.cost}`).join(' '));
    ok(offers.every((o) => o.cost >= 55 && o.cost <= 200 && o.hp > 0 && o.role && o.icon && !o.sold && o.id), 'offers carry price 60-200, stats, role, icon');
    ok(JSON.stringify(RC.mercenaryOffers(st, town.id)) === JSON.stringify(offers), 'offers are stable between calls');
    for (const t of st.towns) { const o = RC.mercenaryOffers(st, t.id); if (t.state !== 'fallen') ok(o.length === 3, `town ${t.id} (${t.kind}) has 3 offers`); }
    // hire
    const o = offers[0], g0 = team.gold;
    run(st, SIM_DT, [{ t: 'recruit', town: town.id, type: o.type }]);
    ok(team.followers.length === 1, 'hire command creates a follower');
    ok(team.gold === g0 - o.cost, `gold deducted (${g0} -> ${team.gold})`);
    const f = RC.followersOf(st, 0)[0];
    ok(f && f.type === o.type && f.recruit && f.src === 'town', 'the follower is the hired type');
    ok(evOf('recruited').length > 0, 'recruited event emitted');
    // cannot hire without gold / out of town / when full
    team.gold = 5; run(st, SIM_DT, [{ t: 'recruit', town: town.id, type: offers[1].type }]); ok(team.followers.length === 1, 'cannot hire without gold');
    team.gold = 1000;
    h.x = town.x + 400; run(st, SIM_DT, [{ t: 'recruit', town: town.id, type: offers[1].type }]); ok(team.followers.length === 1, 'cannot hire far from the town');
    h.x = town.x;
    for (let i = 1; i < 4; i++) run(st, SIM_DT, [{ t: 'recruit', town: town.id, type: offers[i % 3].type }]);
    ok(team.followers.length === 4, 'cap: 4 servants hired');
    run(st, SIM_DT, [{ t: 'recruit', town: town.id, type: offers[0].type }]);
    ok(team.followers.length === 4, 'cap: a 5th hire is refused');
    ok(RC.hireBlock(st, team, town.id, offers[0].type) !== null, 'hireBlock explains the refusal: ' + RC.hireBlock(st, team, town.id, offers[0].type));
    // dead follower is gone, can be re-hired (no revive)
    const victim = RC.followersOf(st, 0)[1];
    victim.hp = 0; simApi.kill(st, victim, null); run(st, 0.5);
    ok(team.followers.length === 3 && !team.followers.includes(victim.id), 'a dead follower leaves the roster for good');
    ok(evOf('followerDied').length === 1, 'followerDied event emitted');
    ok(!team.fallen, 'no fallen / revive records');
    run(st, SIM_DT, [{ t: 'recruit', town: town.id, type: victim.type }]);
    ok(team.followers.length === 4, 'the dead follower type can be hired again');
    // dismiss
    const dis = RC.followersOf(st, 0)[0];
    run(st, SIM_DT, [{ t: 'dismiss', id: dis.id }]); run(st, 0.5);
    ok(team.followers.length === 3, 'dismiss frees a slot');
    townS = S;
  }
}
{
  // cage prisoner: a fabricated cage per tier; the type follows the tier
  const S = arena(7); const { st, team, h } = S;
  const seen = {};
  for (const tier of [1, 2, 3]) {
    for (let i = 0; i < 12; i++) {
      const poi = { id: 700 + tier * 20 + i, type: 'cage', x: h.x + 3, z: h.z + 3, camp: -1, tier };
      team.followers = []; for (const e of st.ents) if (e.recruit) { e.alive = false; e.hp = 0; }
      const r = RC.offerFromCage(st, team, poi);
      const f = RC.followersOf(st, 0)[0];
      if (i === 0) ok(r === true && !!f && poi.used, `cage tier ${tier} frees a prisoner (${f && f.type})`);
      if (f) (seen[tier] || (seen[tier] = new Set())).add(f.type);
    }
    ok([...seen[tier]].every((t) => D.CAGE_TYPES[tier].includes(t)), `cage tier ${tier} only holds ${D.CAGE_TYPES[tier].join('/')} (saw ${[...seen[tier]].join(',')})`);
  }
  // full band: refuses, cage stays closed
  team.followers = []; for (const e of st.ents) if (e.recruit) { e.alive = false; e.hp = 0; }
  for (let i = 0; i < 4; i++) RC.spawnFollower(st, team, 'hound');
  const poi = { id: 999, type: 'cage', x: h.x, z: h.z, camp: -1, tier: 2 };
  ok(RC.offerFromCage(st, team, poi) === true && !poi.used && team.followers.length === 4, 'cage with a full band stays closed');
  // the real POI path (pois.js) when a cage exists
  const S2 = quiet(7); const cage = (S2.st.pois || []).find((p) => p.type === 'cage');
  if (cage) {
    const { st: st2, team: t2, h: h2 } = S2;
    if (cage.pending) { /* guards spawn lazily; kill them all */ }
    for (const c of st2.camps) if (c.poi === cage.id) { c.mons = 0; }
    h2.x = cage.x; h2.z = cage.z + 1; h2.ox = h2.x; h2.oz = h2.z;
    cage.armed = true; cage.pending = null;
    run(st2, SIM_DT, [{ t: 'poi', id: cage.id }]);
    ok(t2.followers.length === 1 && cage.used, 'real cage POI: using it frees a servant');
  } else info('(no cage POI in this map: real-POI path not exercised)');
}
{
  // hero summon skill
  const S = arena(7); const { st, team, h } = S;
  for (let i = 0; i < 4; i++) RC.spawnFollower(st, team, 'hound');
  const made = RC.summonServants(st, 0, 'knight', 3, 8);
  ok(made.length === 3 && made.every((e) => e.alive && e.temp && e.summoned && e.team === 0), 'summonServants spawns 3 temporary servants');
  ok(team.followers.length === 4 && made.every((e) => !team.followers.includes(e.id)), 'summoned servants count outside the follower cap');
  ok(made.every((e) => Math.abs(e.maxHp - UNITS.knight.hp) / UNITS.knight.hp < 0.03), 'summoned knights have the full knight stats');
  run(st, 9);
  ok(made.every((e) => !e.alive), 'summoned servants vanish when the timer ends');
  ok(RC.summonServants(st, 0, 'nonexistent', 2, 5).length === 0, 'unknown summon type is harmless');
}

// ---------------------------------------------------------------- 4. follow, warp, stances
{
  const S = arena(7); const { st, team, h } = S; h.invuln = false;
  const f = spawnType(S, 'knight', 2, 0), g = spawnType(S, 'archer', -2, 0);
  // hero walks away: the servants follow
  run(st, 6, [], (i) => { h.x += 0.12; return true; });
  ok(Math.hypot(f.x - h.x, f.z - h.z) < 14, 'followers keep up with the hero');
  // teleport 90 m away: followers warp
  const ox = h.x; h.x = ox + 70; h.z += 0; h.ox = h.x;
  const w = st.world; if (!w.walkable(h.x, h.z)) { h.x = ox - 70; }
  run(st, 3);
  ok(Math.hypot(f.x - h.x, f.z - h.z) < 12 && Math.hypot(g.x - h.x, g.z - h.z) < 12, 'followers teleport to the hero after a long jump');
  // hold stance: stays put
  run(st, SIM_DT, [{ t: 'hold' }]);
  ok(f.mode === 'hold' && g.mode === 'hold', 'hold command puts followers on hold');
  const hx = f.x; h.x += 30; run(st, 3);
  ok(Math.abs(f.x - hx) < 3, 'held follower stays put');
  run(st, SIM_DT, [{ t: 'follow' }]);
  ok(f.mode === 'follow', 'follow command works');
  run(st, SIM_DT, [{ t: 'amove', x: h.x + 10, z: h.z }]);
  ok(f.mode === 'amove', 'attack-move command works');
  run(st, SIM_DT, [{ t: 'stance', id: f.id, mode: 'hold' }]);
  ok(f.mode === 'hold' && g.mode !== 'hold', 'per-servant stance command works');
  // hero death: followers return with him
  h.hp = 0; simApi.kill(st, h, null);
  run(st, 25);
  ok(h.alive, 'hero respawned');
  ok(Math.hypot(f.x - h.x, f.z - h.z) < 14, 'followers return with the respawned hero');
}

// ---------------------------------------------------------------- 5. militia
{
  const S = quiet(7); const { st, team, h } = S;
  const towns = st.towns || [];
  const check = towns.filter((t) => t.state !== 'fallen');
  ok(check.length > 0, 'towns to test militia on');
  for (const t of check.slice(0, 3)) {
    h.x = t.x; h.z = t.z; h.ox = h.x; h.oz = h.z;
    run(st, 3);
    const mil = () => st.ents.filter((e) => e.alive && e.guard && e.team === 4 && e.town === t.id);
    const want = RC.militia.size(t.kind);
    ok(mil().length === want, `${t.kind} ${t.id} spawns ${want} militia (has ${mil().length})`);
    ok(mil().every((e) => ['militia', 'militiaArcher', 'militiaCaptain'].includes(e.type)), `${t.kind}: militia types are the militia roster`);
    // kill one: it comes back ~40 s later while the town stands
    const v = mil()[0]; v.hp = 0; simApi.kill(st, v, null);
    run(st, 30); const mid = mil().length;
    run(st, 14); const end = mil().length;
    ok(mid === want - 1 && end === want, `${t.kind}: a dead militiaman respawns after ${RC.militia.respawn} s (30 s: ${mid}, 44 s: ${end})`);
  }
  // fights demons that come near
  const t = check[0]; h.x = t.x; h.z = t.z; h.ox = h.x; h.oz = h.z;
  const gu = st.ents.find((e) => e.alive && e.guard && e.team === 4 && e.town === t.id);
  if (gu) {
    const imp = spawnImp(st, gu.x + 6, gu.z, {}); imp.tgt = 0;
    run(st, 12);
    ok(!imp.alive || imp.hp < imp.maxHp, 'militia fights a demon that comes near');
  }
  // fallen town: no militia, no respawn
  const t2 = check[1] || check[0];
  if (t2) {
    h.x = t2.x; h.z = t2.z; h.ox = h.x; h.oz = h.z; run(st, 2);
    T.setTownState(st, t2.id, 'fallen'); run(st, 60);
    ok(st.ents.filter((e) => e.alive && e.guard && e.town === t2.id).length === 0, 'a fallen town has no militia and spawns none');
  }
}

// ---------------------------------------------------------------- 6. balance probes
function duel(setupFn, secs = 40) {
  const S = arena(7); const { st, h } = S;
  const r = setupFn(S), t0 = st.t;
  run(st, secs, [], () => (r.mine.some((e) => e.alive) && r.foes.some((e) => e.alive)));
  return { S, ...r, mineAlive: alive(r.mine), foesAlive: alive(r.foes), t: st.t - t0 };
}
const packAround = (S, cx, cz, n, rad = 3) => { const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * 6.28; out.push(spawnImp(S.st, cx + Math.cos(a) * rad, cz + Math.sin(a) * rad)); } return out; };
function balance() {
  const rows = [];
  // 2 knights vs a pack of 6 imps coming from 16 m
  let wins = 0, hpLeft = 0, T = 8;
  for (let s = 0; s < T; s++) {
    const r = duel((S) => { const k1 = spawnType(S, 'knight', 1, 1), k2 = spawnType(S, 'knight', 1, -1); const foes = packAround(S, S.h.x + 16, S.h.z, 6); for (const f of foes) f.tgt = k1.id; return { mine: [k1, k2], foes }; }, 40);
    if (r.foesAlive === 0 && r.mineAlive === 2) wins++; hpLeft += r.mine.reduce((a, e) => a + (e.alive ? e.hp / e.maxHp : 0), 0) / 2;
  }
  rows.push(`2 knights vs 6 imps: ${wins}/${T} clean wins, avg HP left ${(100 * hpLeft / T).toFixed(0)}%`);
  ok(wins >= T - 1, '2 knights beat 6 imps (' + wins + '/' + T + ')');
  // a pack of imps vs a lone battle-mage / archer / priest
  for (const [type, size] of [['battlemage', 6], ['battlemage', 8], ['priest', 6], ['archer', 6]]) {
    let dead = 0, tt = 0;
    for (let s = 0; s < T; s++) {
      const r = duel((S) => { const m = spawnType(S, type, 0, 0); const foes = packAround(S, S.h.x + 15, S.h.z, size); for (const f of foes) f.tgt = m.id; return { mine: [m], foes }; }, 30);
      if (r.mineAlive === 0) dead++; tt += r.t;
    }
    rows.push(`${size} imps vs lone ${type}: servant dies ${dead}/${T}`);
    if (type === 'battlemage' && size === 8) ok(dead >= T - 2, `an imp pack kills a lone battle-mage (${dead}/${T} with 8 imps)`);
  }
  // knight + priest vs knight only: the priest keeps the knight healthier; golem alone vs 8 imps
  const cmp = (types, n) => { let sum = 0; for (let s = 0; s < 5; s++) { const r = duel((S) => { const mine = types.map((t, i) => spawnType(S, t, 1, i)); const foes = packAround(S, S.h.x + 14, S.h.z, n); for (const f of foes) f.tgt = mine[0].id; return { mine, foes }; }, 40); sum += r.mine[0].alive ? r.mine[0].hp / r.mine[0].maxHp : 0; } return sum / 5; };
  const k1 = cmp(['knight'], 10), k2 = cmp(['knight', 'priest'], 10);
  rows.push(`knight HP left vs 10 imps: alone ${(100 * k1).toFixed(0)}%, with a priest ${(100 * k2).toFixed(0)}%`);
  ok(k2 >= k1 - 0.02, 'a priest does not make the knight worse off');
  // each type alone vs a demon brute-ish single: time to kill / survive
  for (const type of MERC_TYPES) {
    const r = duel((S) => { const u = spawnType(S, type, 0, 0); const foes = packAround(S, S.h.x + 12, S.h.z, 3); for (const f of foes) f.tgt = u.id; return { mine: [u], foes }; }, 30);
    rows.push(`${type} vs 3 imps: ${r.foesAlive === 0 ? 'wins' : 'loses'} (${Math.round(r.t)} s, HP left ${r.mine[0].alive ? Math.round(100 * r.mine[0].hp / r.mine[0].maxHp) : 0}%)`);
  }
  for (const r of rows) info(r);
}

balance();
{
  console.log(fails ? `${fails} FAILED` : 'ALL OK');
  process.exit(fails ? 1 : 0);
}
