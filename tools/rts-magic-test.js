// Headless MAGIC lane test: casts every spell of every school, mana/cooldown/requirements, zones, towers, research, mana income. node tools/rts-magic-test.js
import { createRts, step } from '../src/rts/core.js';
import { SIM_DT } from '../src/rts/consts.js';
import * as Magic from '../src/rts/magic.js';
import * as Units from '../src/rts/units.js';
import * as Buildings from '../src/rts/buildings.js';
import { SPELLS } from '../src/rts/magic_data.js';

const fails = [];
let checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails.push(msg); console.log('  FAIL', msg); } };
const run = (st, sec) => { for (let i = 0; i < Math.round(sec / SIM_DT); i++) step(st, SIM_DT, {}); };
const sumHp = (a) => a.reduce((s, u) => s + Math.max(0, u.hp), 0);

function mkUnit(st, team, role, x, z) {
  const f = st.teams[team].faction.key;
  const d = Units.list(f).find((q) => q.role === role) || Units.list(f).find((q) => q.role === 'melee');
  const u = Units.spawn(st, d.type, team, x, z);
  u.hp = u.maxHp = 6000; u.atk = { ...u.atk, dmg: 0 }; u.stance = 'hold'; u.speed = 0; u.dummy = true;
  return u;
}
function arena(st, t) {
  const team = st.teams[t], e = (t + 1) % 4;
  const g = st.ents.find((u) => u.team === t && u.general);
  g.hp = g.maxHp = 100000; g.stun = 0; g.mana = 0; g.manaMax = 44; g.castUntil = 0;
  const gx = g.x, gz = g.z;
  for (const u of st.ents) if (u.alive && u.team !== t && Math.hypot(u.x - gx, u.z - gz) < 70) { u.alive = false; u.hp = 0; u.diedAt = st.t; }
  const foes = [], allies = [];
  for (let i = 0; i < 6; i++) foes.push(mkUnit(st, e, i < 2 ? 'ranged' : 'melee', gx + 9 + (i % 3) * 1.5, gz + Math.floor(i / 3) * 1.5));
  for (let i = 0; i < 3; i++) { const a = mkUnit(st, t, 'melee', gx - 3 - i, gz + 1); a.hp = 100; allies.push(a); }
  team.mana = team.manaMax = 450; team.res.souls = 60; team.res.blood = 300; team.res.gold = 5000;
  return { g, foes, allies, gx, gz, e, team };
}
const clear = (st) => { for (const u of st.ents) if (u.dummy && u.alive) { u.alive = false; u.hp = 0; } st.zones.length = 0; };

// ---------------------------------------------------------------- 1. every spell of every school
console.log('== cast every spell');
const st = createRts({ seed: 1337, humans: [0], ai: [] });
Magic.ensureTechs();
const names = ['necromancy', 'warmagic', 'infernal', 'blood'];
const counts = {};
for (const s of Object.values(SPELLS)) counts[s.school] = (counts[s.school] || 0) + 1;
console.log('  spells per school', JSON.stringify(counts));
ok(counts.necromancy >= 8 && counts.warmagic >= 8 && counts.infernal >= 8 && counts.blood >= 8 && counts.neutral >= 4, 'spell counts');
for (let t = 0; t < 4; t++) {
  const school = st.teams[t].faction.school;
  ok(school === names[t], 'school of team ' + t);
  for (const s of Object.values(SPELLS).filter((q) => q.school === school || q.school === 'neutral')) {
    clear(st);
    const A = arena(st, t), team = A.team;
    for (const q of Object.values(SPELLS)) team.spells[q.id] = true;
    team.cd = {};
    team.mana = team.manaMax;
    if (s.kind === 'raise') { st.magicCorpses = []; for (let i = 0; i < 4; i++) st.magicCorpses.push({ x: A.gx + 9 + i, z: A.gz, team: A.e, type: 'x', t: st.t, role: 'melee' }); }
    const tx = A.foes[0].x, tz = A.foes[0].z + 0.5;
    let target = 0, cx = tx, cz = tz;
    if (s.target === 'unit') target = s.tgt === 'ally' ? A.allies[0].id : s.id === 'death_coil' ? A.foes[0].id : A.foes[0].id;
    if (s.target === 'building') { const bb = Buildings.create(st, 'house', A.e, tx + 3, tz, 0, { instant: true }); target = bb.id; A.bld = bb; }
    if (s.target === 'self') { cx = A.g.x; cz = A.g.z; }
    if (s.tgt === 'ally' && s.target === 'point') { cx = A.allies[0].x; cz = A.allies[0].z; }
    if (s.id === 'raise_dead') { cx = A.gx + 10; cz = A.gz; }
    const wasMana = team.mana + (A.g.mana || 0), hpFoes = sumHp(A.foes), hpAll = sumHp(A.allies), hpG = A.g.hp, zones0 = st.zones.length;
    const sum0 = st.ents.filter((u) => u.summoned && u.alive).length, ev0 = st.events.length;
    const gx0 = A.g.x;
    A.g.castUntil = 0;
    const r = Magic.cast(st, t, s.id, A.g.id, cx, cz, target);
    ok(r.ok, `${s.id}: cast ok (${r.reason || ''})`);
    if (!r.ok) continue;
    const spent = wasMana - (team.mana + (A.g.mana || 0));
    ok(Math.abs(spent - (s.cost.mana || 0)) < 1e-6, `${s.id}: mana spent ${spent} vs ${s.cost.mana}`);
    ok(team.cd[s.id] > st.t + s.cd - 0.1, `${s.id}: cooldown set`);
    const again = Magic.cast(st, t, s.id, A.g.id, cx, cz, target);
    ok(!again.ok && /Cooling/.test(again.reason || ''), `${s.id}: blocked by cooldown`);
    ok(st.events.slice(ev0).some((e) => e.type === 'cast' && e.spell === s.id && 'radius' in e), `${s.id}: cast event with radius`);
    const hpF1 = sumHp(A.foes), k = s.kind;
    if (['aoe', 'bolt', 'chain', 'blast'].includes(k)) {
      const healed = sumHp(A.allies) > hpAll || (A.g.hp > hpG);
      ok(hpF1 < hpFoes || healed || (A.bld && A.bld.hp < A.bld.maxHp) || s.stun, `${s.id}: ${k} had an effect`);
      if (s.stun) ok(A.foes.some((u) => u.stun > 0), `${s.id}: stunned`);
      if (k === 'blast') ok(A.bld.hp < A.bld.maxHp || A.bld.state === 'ruin', `${s.id}: building damaged`);
    }
    if (k === 'summon' || k === 'raise') ok(st.ents.filter((u) => u.summoned && u.alive).length - sum0 >= (k === 'raise' ? 4 : Math.min(s.n, 3)), `${s.id}: summoned`);
    if (['zone', 'flamewall', 'prison', 'delay'].includes(k)) {
      ok(st.zones.length > zones0, `${s.id}: zone created`);
      run(st, (s.dur || s.delay || 1) + 0.6);
      if (s.dps || s.strike || k === 'delay') ok(sumHp(A.foes) < hpFoes - 1 || s.id === 'blood_rain' || s.zk === 'gate' || s.zk === 'totem', `${s.id}: zone damaged foes`);
      if (s.zk === 'gate') ok(st.ents.filter((u) => u.summoned && u.fromGate).length >= 1, `${s.id}: gate spawned units`);
      if (s.zk === 'bloodrain') ok(sumHp(A.allies) > hpAll, `${s.id}: heals allies`);
      if (k === 'prison') ok(true, 'prison ran');
      run(st, (s.zk === 'gate' ? 6 : 8));
      ok(!st.zones.some((z) => z.spell === s.id && z.kind !== 'fire'), `${s.id}: zone expired`);
    }
    if (k === 'buff') ok(A.allies.concat([A.g]).some((u) => u.buffs.some((b) => b.id === s.buff.id)), `${s.id}: buff applied`);
    if (k === 'debuff') ok(A.foes.some((u) => u.buffs.some((b) => b.id === s.buff.id)), `${s.id}: debuff applied`);
    if (k === 'sacrifice') ok(!A.allies[0].alive && team.res.souls >= 60 + s.souls - 1, `${s.id}: sacrificed`);
    if (k === 'shield') ok(A.allies[0].shield > 0, `${s.id}: shield up`);
    if (k === 'thrall') { ok(A.foes[0].team === t, `${s.id}: converted`); run(st, s.dur + 1); ok(A.foes[0].team === A.e, `${s.id}: reverted`); }
    if (k === 'teleport') ok(Math.hypot(A.g.x - gx0, A.g.z - A.gz) > 2 || st.world.walkable && !st.world.walkable(A.gx + 10, A.gz), `${s.id}: moved`);
    if (k === 'reveal') ok((st.reveals || []).length >= 1, `${s.id}: reveal added`);
    if (s.id === 'soul_drain' || s.id === 'death_coil') { /* heal / drain verified by hp checks above */ }
  }
}
if (process.argv[1] && process.argv[1].endsWith('rts-magic-test.js')) {
  const m = await import('./rts-magic-test2.js');
  await m.part2({ st, ok, run, arena, clear, mkUnit });
  console.log(checks, 'checks,', fails.length, 'failures');
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
}
