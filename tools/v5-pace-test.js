// COMBAT lane pace test (v0.5): time-to-kill and damage taken for every class vs imp / hellhound / brute / elite brute / mini-boss / boss at hero levels 1, 5, 10.
// Asserts the targets from data.js PACE.ttk (V5.md): imp dies in 1-2 basic hits, a champion brute in 5-8 s with a decent kit, a mini-boss ~12-18 s, a boss 20-40 s with all abilities,
// and a hero survives 4 imps for 10 s without fighting back. Prints a table. node tools/v5-pace-test.js [--quiet]
import { createGame, step, simApi } from '../src/sim.js';
import { generateWorld } from '../src/world.js';
import { SIM_DT, MONSTERS, PACE, MONSTER_GROWTH, DUNGEON, SKILLS } from '../src/data.js';
import { makeGear, rollChampion } from '../src/loot.js';
import * as perks from '../src/perks.js';
import * as gear from '../src/gear.js';

const QUIET = process.argv.includes('--quiet');
const SEED = 21;
const DT = SIM_DT;
const fails = [];
const warns = [];
const rows = [];
const pick = (...keys) => keys.find((k) => MONSTERS[k]);
const E = { imp: pick('imp', 'ghoul'), hound: pick('hellhound', 'wolf'), brute: pick('brute', 'crypt'), warlock: pick('warlock', 'wraith'), mini: pick('crypt', 'brute'), boss: pick('demonLord', 'king') };
// scenario by hero level: minute of the match (time growth), tier of the standard / elite monsters
const LEVELS = [{ L: 1, min: 0, tier: 1, eliteTier: 2 }, { L: 5, min: 6, tier: 2, eliteTier: 2 }, { L: 10, min: 14, tier: 2, eliteTier: 3 }];

const world = generateWorld(SEED);

function arena(st) { // an open walkable disc far from towns
  const w = st.world, towns = (w.sites && w.sites.towns) || [];
  let best = null, bs = -1;
  for (let x = -120; x <= 120; x += 12) for (let z = -120; z <= 120; z += 12) {
    let ok = true, wk = 0;
    for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.283; if (w.walkable(x + Math.cos(a) * 24, z + Math.sin(a) * 24)) wk++; else ok = false; }
    if (!ok || !w.walkable(x, z)) continue;
    const dt = Math.min(1e9, ...towns.map((t) => Math.hypot(t.x - x, t.z - z))), sc = Math.min(dt, 140) + wk;
    if (sc > bs) { bs = sc; best = { x, z }; }
  }
  return best || { x: 0, z: 0 };
}

function newGame(L, min) {
  const st = createGame({ seed: SEED, world, humans: [0], bgs: [0, 1, 2, 3] });
  if (st.horde) st.horde.ready = false;     // no demon waves in the arena
  for (const c of st.camps) { c.noResp = true; c.mons = 999; }
  for (let i = st.ents.length - 1; i >= 0; i--) { const e = st.ents[i]; if (e.kind !== 'hero') { st.ents.splice(i, 1); st.byId.delete(e.id); } }
  st.timeMul = 1 + MONSTER_GROWTH * min;
  for (const team of st.teams.slice(0, 4)) {
    const h = team.hero;
    for (let l = 2; l <= L; l++) { h.lvl = l; if (perks.onHeroLevel) perks.onHeroLevel(st, team, l); let g = 0; while (team.kit && team.kit.offers.length && g++ < 6) if (!perks.autoPick(st, team)) break; }
    h.lvl = L;
    // a decent gear set for the level (what a few minutes of drops give)
    const give = (slot, tier, stat) => gear.takeItem(st, h, makeGear(st.rng, slot, tier, stat));
    if (L >= 5) { give('weapon', 1, 'dmg'); give('armor', 0, 'hp'); give('helmet', 0, 'hp'); }
    if (L >= 10) { give('weapon', 2, 'dmg'); give('armor', 1, 'hp'); give('helmet', 1, 'cdr'); give('amulet', 1, 'dmg'); }
    simApi.recalc(h); h.hp = h.maxHp;
  }
  return st;
}

const idle = { mx: 0, mz: 0, atk: false, casts: [], charge: false, cmds: [] };
function control(st, team, h, tgt, basicOnly) {
  const dx = tgt.x - h.x, dz = tgt.z - h.z, d = Math.hypot(dx, dz) || 1;
  const inp = { mx: 0, mz: 0, aimX: tgt.x, aimZ: tgt.z, atk: true, casts: [], hold: {}, charge: false, cmds: [] };
  const reach = h.range + h.r + tgt.r;
  if (h.ranged) { // kite: back away on a curve (strafe) when the enemy is close, close in when it is far
    if (d < 7) { const c = Math.cos(0.9), sn = Math.sin(0.9); inp.mx = (-dx * c - -dz * sn) / d; inp.mz = (-dx * sn + -dz * c) / d; } else if (d > reach * 0.85) { inp.mx = dx / d; inp.mz = dz / d; }
  } else if (d > reach * 0.8) { inp.mx = dx / d; inp.mz = dz / d; }
  // telegraphs: walk out of a blast ring that is about to land (a player sees the ring for ~1 s) and roll if it is imminent
  for (const tm of st.timers) {
    if (tm.type !== 'blast' || tm.team >= 0) continue;
    const dd = Math.hypot(h.x - tm.x, h.z - tm.z);
    if (dd > tm.r + 1.5) continue;
    const ax = (h.x - tm.x) / (dd || 1), az = (h.z - tm.z) / (dd || 1);
    inp.mx = ax; inp.mz = az;
    if (tm.t - st.t < 0.45 && dd < tm.r) inp.cmds.push({ t: 'dodge', dx: ax, dz: az });
    break;
  }
  if (!basicOnly) {
    inp.casts = [0, 1, 2];
    const ult = team.kit && team.kit.slots[3] && simApiUlt(team);
    if (ult && team.chCd <= 0 && d < ult.range) inp.charge = !(h.charging && h.chargeT >= 0.7); // hold ~0.7 s, release at the target
    else if (h.charging) inp.charge = false;
  }
  return inp;
}
let SK = null;
const simApiUlt = (team) => { const id = team.kit && team.kit.slots[3]; return id && SK && SK[id] && SK[id].ult ? SK[id] : null; };

// run one fight; enemies = [{key, tier, champ}] spawned on a ring at `dist` m. Returns {ttk, hits, taken (fraction of max HP), alive, left}
function fight(st, ti, enemies, o = {}) {
  const team = st.teams[ti], h = team.hero, A = o.arena;
  st.zones.length = 0; st.projs.length = 0; st.timers.length = 0; st.items.length = 0; st.events.length = 0; // nothing may leak from the previous fight
  for (let i = st.ents.length - 1; i >= 0; i--) { const e = st.ents[i]; if (e.kind !== 'hero') { st.ents.splice(i, 1); st.byId.delete(e.id); } }
  h.burnUntil = 0; h.psnUntil = 0; h.slowUntil = 0; h.debuff = null; h.hid = 0;
  const camp = { id: st.camps.length, x: A.x, z: A.z, tier: 1, types: [], biome: 0, mons: 0, respT: 0, boss: false, noResp: true };
  st.camps.push(camp);
  for (const t of st.teams.slice(0, 4)) if (t.id !== ti) { t.hero.x = A.x + 200; t.hero.z = A.z + 200; t.hero.ox = t.hero.x; t.hero.oz = t.hero.z; }
  h.x = A.x; h.z = A.z; h.ox = h.x; h.oz = h.z; h.alive = true; h.dead = false; h.hp = h.maxHp; h.stun = 0; h.shield = null; h.buff = null; h.inv = 0; h.lastHit = -99; h.charging = false; h.chargeT = 0;
  team.cd = {}; team.chCd = 0; team.potCd = 0; team.dodgeCd = 0;
  const ents = [];
  enemies.forEach((en, i) => {
    const a = (i / enemies.length) * 6.283, r = o.dist || 12;
    const m = simApi.spawnMonster(st, en.key, en.tier, A.x + Math.cos(a) * r, A.z + Math.sin(a) * r, camp, en.champ || null);
    m.home = { x: A.x, z: A.z }; m.aggro = 40; ents.push(m);
    if (en.mini) { m.elite = 2; m.eliteHp = DUNGEON.bossHp[Math.min(3, en.tier)]; m.eliteDmg = DUNGEON.bossDmg[Math.min(3, en.tier)]; simApi.recalc(m); m.hp = m.maxHp; } // like dungeons.js bossFlavor
  });
  let taken = 0, hits = 0, t = 0;
  const maxT = o.maxT || 90;
  while (t < maxT) {
    const alive = ents.filter((m) => m.alive);
    if (!alive.length) break;
    if (!h.alive) break;
    let tgt = alive[0], bd = 1e9; for (const m of alive) { const d = Math.hypot(m.x - h.x, m.z - h.z); if (d < bd) { bd = d; tgt = m; } }
    const inp = o.passive ? idle : control(st, team, h, tgt, o.basicOnly);
    const inputs = st.teams.map((tm) => (tm.id === ti ? inp : idle));
    step(st, DT, inputs);
    t += DT;
    for (const e of st.events) {
      if (e.type === 'dmg' && !e.dot) { if (e.kind === 'hero' && e.team === ti) taken += e.amt; else if (e.kind === 'mon') hits++; }
      else if (e.type === 'dmg' && e.kind === 'hero' && e.team === ti) taken += e.amt;
    }
    st.events.length = 0;
    if (o.passive && t >= (o.secs || 10)) break;
  }
  const left = ents.filter((m) => m.alive).length;
  for (const m of ents) if (m.alive) { m.alive = false; m.hp = 0; }
  return { ttk: t, hits, taken: taken / h.maxHp, alive: h.alive, left, hp: h.hp / h.maxHp, maxHp: h.maxHp };
}
const champ = (key) => { const c = rollChampion(() => 0.5, key); c.affixes = []; c.title = 'Elite ' + MONSTERS[key].name; return c; }; // an affix-less champion: the plain x eliteHp / eliteDmg brute

function check(name, ok, detail) { if (!ok) fails.push(`${name}: ${detail}`); }
const f1 = (v) => (v == null ? '-' : v.toFixed(1));

console.log(`pace test: enemies ${JSON.stringify(E)} | PACE hero x${PACE.heroHp}/${PACE.heroDmg} mon x${PACE.monHp}/${PACE.monDmg} elite x${PACE.eliteHp} swarm x${PACE.swarmHp}`);
SK = SKILLS;
const table = [];
for (const lv of LEVELS) {
  const st = newGame(lv.L, lv.min), A = arena(st);
  for (let ti = 0; ti < 4; ti++) {
    const team = st.teams[ti], cls = team.bg, h = team.hero;
    const base = { arena: A };
    const dec = lv.L >= 5; // decent kit
    const row = { cls, L: lv.L, hp: Math.round(h.maxHp), kit: team.kit ? team.kit.slots.filter(Boolean).length : 0, atk: +h.atk.toFixed(1) };
    // imp: basic-attack hits to kill one
    const imp = fight(st, ti, [{ key: E.imp, tier: lv.tier }], { ...base, basicOnly: true, dist: 4 });
    row.impHits = imp.hits; row.impT = imp.ttk;
    check(`imp hits ${cls} L${lv.L}`, imp.hits >= 1 && imp.hits <= (lv.L >= 5 ? 2 : 3), `${imp.hits} basic hits (target ${PACE.ttk.impHits.join('-')}${lv.L < 5 ? ', +1 at level 1 for weak hitters' : ''})`);
    // swarm: 8 imps with the full kit
    const sw = fight(st, ti, Array.from({ length: 8 }, () => ({ key: E.imp, tier: lv.tier })), { ...base, dist: 9 });
    row.swarmT = sw.ttk; row.swarmDmg = sw.taken;
    check(`swarm ${cls} L${lv.L}`, sw.alive && sw.left === 0 && sw.ttk <= 14, `8 imps took ${f1(sw.ttk)} s, left ${sw.left}, alive ${sw.alive}`);
    // hound
    const hd = fight(st, ti, [{ key: E.hound, tier: lv.tier }], { ...base, dist: 12 });
    row.houndT = hd.ttk; row.houndDmg = hd.taken;
    // normal brute
    const br = fight(st, ti, [{ key: E.brute, tier: lv.tier }], { ...base, dist: 12 });
    row.bruteT = br.ttk; row.bruteDmg = br.taken;
    // elite (champion) brute
    const el = fight(st, ti, [{ key: E.brute, tier: lv.eliteTier, champ: champ(E.brute) }], { ...base, dist: 12 });
    row.eliteT = el.ttk; row.eliteDmg = el.taken; row.eliteAlive = el.alive;
    const [eLo, eHi] = PACE.ttk.elite;
    if (dec) check(`elite ${cls} L${lv.L}`, el.ttk >= eLo - 1.5 && el.ttk <= eHi + 1.5 && el.left === 0, `${f1(el.ttk)} s (target ${eLo}-${eHi} s +-1.5)`);
    else warns.push(`elite ${cls} L${lv.L}: ${f1(el.ttk)} s (level 1 heroes are not expected to fight champions)`);
    // mini-boss (dungeon boss, elite 2, not boss:true)
    {
      const mb = fight(st, ti, [{ key: E.mini, tier: Math.max(2, lv.tier), mini: true }], { ...base, dist: 12, maxT: 90 });
      row.miniT = mb.ttk; row.miniDmg = mb.taken;
      const [mLo, mHi] = PACE.ttk.miniboss;
      if (lv.L >= 5) check(`miniboss ${cls} L${lv.L}`, mb.left === 0 && mb.ttk >= mLo * 0.5 && mb.ttk <= mHi * 1.5, `${f1(mb.ttk)} s (target ${mLo}-${mHi} s, band x0.5..x1.5)`);
    }
    // boss
    const bo = fight(st, ti, [{ key: E.boss, tier: 1 }], { ...base, dist: 14, maxT: 120 });
    row.bossT = bo.ttk; row.bossDmg = bo.taken; row.bossWin = bo.left === 0;
    const [bLo, bHi] = PACE.ttk.boss;
    check(`brute ${cls} L${lv.L}`, br.left === 0 && br.ttk <= (lv.L >= 5 ? 5 : 8), `normal brute took ${f1(br.ttk)} s`);
    if (lv.L >= 10) check(`boss ${cls} L${lv.L}`, bo.left === 0 && bo.ttk >= bLo && bo.ttk <= bHi, `${f1(bo.ttk)} s left ${bo.left} (target ${bLo}-${bHi} s)`);
    else if (lv.L >= 5) check(`boss ${cls} L${lv.L}`, bo.left === 0 && bo.ttk <= bHi * 2, `${f1(bo.ttk)} s (level 5 limit ${bHi * 2} s)`);
    // survive 4 imps for 10 s without fighting back
    const sv = fight(st, ti, Array.from({ length: PACE.ttk.surviveImps }, () => ({ key: E.imp, tier: lv.tier })), { ...base, passive: true, secs: PACE.ttk.surviveSecs, dist: 2.5, maxT: 12 });
    row.survive = sv.hp; row.surviveAlive = sv.alive;
    check(`survive ${cls} L${lv.L}`, sv.alive, `died to ${PACE.ttk.surviveImps} imps within ${PACE.ttk.surviveSecs} s (hp left ${(sv.hp * 100).toFixed(0)}%)`);
    table.push(row);
  }
}

if (!QUIET) {
  const pad = (v, n) => String(v).padStart(n);
  console.log('\nclass   L   HP  atk | imp hits | swarm8 s  dmg% | hound s  dmg% | brute s  dmg% | ELITE s  dmg% | mini s  dmg% | BOSS s  dmg% | 4imps/10s hp left');
  for (const r of table) {
    console.log(`${r.cls.padEnd(7)}${pad(r.L, 2)} ${pad(r.hp, 4)} ${pad(r.atk, 4)} | ${pad(r.impHits, 4)}     | ${pad(f1(r.swarmT), 6)} ${pad((r.swarmDmg * 100).toFixed(0), 4)} | ${pad(f1(r.houndT), 6)} ${pad((r.houndDmg * 100).toFixed(0), 4)} | ${pad(f1(r.bruteT), 6)} ${pad((r.bruteDmg * 100).toFixed(0), 4)} | ${pad(f1(r.eliteT), 6)} ${pad((r.eliteDmg * 100).toFixed(0), 4)} | ${pad(f1(r.miniT), 5)} ${pad((r.miniDmg * 100).toFixed(0), 4)} | ${pad(f1(r.bossT), 5)}${r.bossWin ? ' ' : '!'}${pad((r.bossDmg * 100).toFixed(0), 4)} | ${pad((r.survive * 100).toFixed(0), 4)}%`);
  }
}
for (const w of warns) console.log('warn:', w);
if (fails.length) { console.log(`\n${fails.length} FAILED:`); for (const f of fails) console.log('  FAIL', f); process.exit(1); }
console.log('\nall pace targets met');
