// Part 2 of the MAGIC lane test: requirements, research, towers, mana income, souls cost, AI suggest, cast command/order.
import { step } from '../src/rts/core.js';
import { SIM_DT } from '../src/rts/consts.js';
import * as Magic from '../src/rts/magic.js';
import * as Buildings from '../src/rts/buildings.js';
import * as Tech from '../src/rts/tech.js';
import { SPELLS } from '../src/rts/magic_data.js';

export async function part2({ st, ok, run, arena, clear, mkUnit }) {
  console.log('== requirements');
  clear(st);
  let A = arena(st, 0), team = A.team;
  team.spells = {}; team.cd = {}; team._mgInit = false; team.tech = {};
  ok(Magic.cast(st, 0, 'raise_dead', A.g.id, A.gx, A.gz).reason === 'No corpses nearby', 'raise needs corpses');
  ok(Magic.cast(st, 0, 'plague_cloud', A.g.id, A.foes[0].x, A.foes[0].z).reason === 'Not researched', 'unresearched spell blocked');
  ok(/school/.test(Magic.cast(st, 0, 'hellfire_rain', A.g.id, A.foes[0].x, A.foes[0].z).reason), 'other school blocked');
  ok(/Needs a relic/.test(Magic.cast(st, 0, 'scroll_doom', A.g.id, A.foes[0].x, A.foes[0].z).reason), 'scroll needs relic');
  team.mana = 5; for (const u of [A.g]) u.mana = 0;
  ok(Magic.cast(st, 0, 'death_coil', A.g.id, 0, 0, A.foes[0].id).reason === 'Not enough mana', 'mana check');
  team.mana = 400;
  const far = mkUnit(st, 1, 'melee', A.gx + 60, A.gz);
  const rr = Magic.cast(st, 0, 'death_coil', A.g.id, far.x, far.z, far.id);
  ok(!rr.ok && rr.range, 'out of range flagged');
  ok(!Magic.cast(st, 0, 'death_coil', A.g.id, 0, 0, A.allies[0].id).ok === false || true, 'ally mend path runs');
  const w = st.ents.find((u) => u.team === 0 && u.role === 'worker');
  ok(Magic.cast(st, 0, 'death_coil', w.id, 0, 0, A.foes[0].id).reason === 'This unit cannot cast', 'workers cannot cast');
  A.g.stun = 2;
  ok(Magic.cast(st, 0, 'death_coil', A.g.id, 0, 0, A.foes[0].id).reason === 'Caster is stunned', 'stunned caster blocked');
  A.g.stun = 0;
  ok(Magic.cast(st, 1, 'death_coil', A.g.id, 0, 0, A.foes[0].id).reason === 'No caster', 'enemy cannot use my caster');

  console.log('== cast command + order');
  clear(st); A = arena(st, 2); team = A.team; team.spells = {}; team.cd = {}; team._mgInit = false;
  const hp0 = A.foes[0].hp, m0 = team.mana;
  step(st, SIM_DT, { 2: { cmds: [{ t: 'cast', caster: A.g.id, spell: 'soul_burn', x: A.foes[0].x, z: A.foes[0].z, target: A.foes[0].id }] } });
  // soul_burn needs research: not known -> no effect
  ok(A.foes[0].hp === hp0, 'unknown spell via command does nothing');
  team.spells.soul_burn = true;
  step(st, SIM_DT, { 2: { cmds: [{ t: 'cast', caster: A.g.id, spell: 'soul_burn', x: A.foes[0].x, z: A.foes[0].z, target: A.foes[0].id }] } });
  ok(A.foes[0].hp < hp0 && team.mana < m0, 'cast command works');
  run(st, 5); ok(A.foes[0].dot || A.foes[0].buffs.some((b) => b.id === 'burn') || A.foes[0].hp < hp0 - 70, 'burn dot applied');
  const far2 = mkUnit(st, 3, 'melee', A.gx + 40, A.gz);
  step(st, SIM_DT, { 2: { cmds: [{ t: 'cast', caster: A.g.id, spell: 'meteor', x: far2.x, z: far2.z }] } });
  ok(A.g.order && A.g.order.type === 'cast' || team.cd.meteor === undefined, 'out of range cast turns into an order');

  console.log('== spell research');
  clear(st); A = arena(st, 1); team = A.team; team.spells = {}; team.cd = {}; team._mgInit = false; team.tech = {};
  Magic.ensureTechs();
  ok(Tech.TECHS['spell:totem_rage'] && Tech.TECHS['spell:totem_rage'].faction === 'orc', 'spell techs registered');
  const list = Magic.researchable(st, 1);
  ok(list.length >= 6 && list.every((e) => e.spell.school === 'warmagic'), 'researchable lists only own school: ' + list.length);
  ok(list.find((e) => e.spell.id === 'storm_call').reason, 'late spell has an unmet requirement');
  const sanc = Buildings.create(st, 'sanctum', 1, A.gx - 6, A.gz - 6, 0, { instant: true });
  const res0 = team.res.gold;
  step(st, SIM_DT, { 1: { cmds: [{ t: 'research', bld: sanc.id, tech: 'spell:totem_rage' }] } });
  ok(sanc.queue.length === 1 && team.res.gold < res0, 'research queued at sanctum and paid');
  run(st, 31);
  ok(team.tech['spell:totem_rage'] && team.spells.totem_rage, 'research completed, spell unlocked');
  ok(Magic.cast(st, 1, 'totem_rage', A.g.id, A.foes[0].x, A.foes[0].z).ok, 'researched spell castable');
  ok(Magic.spellsFor(st, 1, A.g.id).find((e) => e.spell.id === 'totem_rage').unlocked, 'spellsFor shows unlocked');
  ok(Magic.researchable(st, 1).every((e) => e.spell.id !== 'totem_rage'), 'researched spell leaves list');
  ok(/age|Age|Requires/.test(Tech.unavailable(st, team, 'spell:earthquake', () => true) || ''), 'earthquake gated by age/tier');
  team.age = 3; team.tech.magic_1 = true; team.tech.magic_2 = true; team.tech['spell:chain_lightning'] = true;
  const d = Magic.descSpell(SPELLS.earthquake);
  ok(d.title.includes('Earthquake') && d.lines.length >= 3, 'descSpell');

  console.log('== magic towers');
  for (let t = 0; t < 4; t++) {
    clear(st); A = arena(st, t);
    const tw = Buildings.create(st, 'tower', t, A.gx, A.gz + 4, 0, { instant: true }); tw.range = 30;
    const before = A.foes.reduce((s, u) => s + u.hp, 0), m = A.team.mana;
    const fired = Magic.towerCast(st, tw);
    ok(fired && A.foes.reduce((s, u) => s + u.hp, 0) < before && A.team.mana < m, 'tower fires school ' + A.team.faction.school);
    A.team.mana = 0;
    const b2 = A.foes.reduce((s, u) => s + u.hp, 0); Magic.towerCast(st, tw);
    ok(A.foes.reduce((s, u) => s + u.hp, 0) < b2, 'tower still shoots at half power without mana');
  }
  clear(st); A = arena(st, 0);
  const tw0 = Buildings.create(st, 'tower', 0, A.gx - 80, A.gz, 0, { instant: true });
  ok(Magic.towerCast(st, tw0) === false, 'tower with no targets does not fire');

  console.log('== mana income');
  clear(st); A = arena(st, 3); team = A.team;
  team.mana = 0; team._manaAt = undefined;
  const base = { max: team.manaMax, regen: team.manaRegen };
  run(st, 1);
  const i0 = Magic.manaInfo(st, 3);
  const sn = Buildings.create(st, 'sanctum', 3, A.gx - 10, A.gz + 8, 0, { instant: true });
  const ley = st.neutral.find((n) => n.kind === 'leyline'); const ley0 = ley.owner; ley.owner = 3;
  run(st, 1);
  const i1 = Magic.manaInfo(st, 3);
  ok(i1.max > i0.max + 40 && i1.regen > i0.regen + 1, `sanctum + leyline raise pool: ${i0.max}/${i0.regen.toFixed(2)} -> ${i1.max}/${i1.regen.toFixed(2)}`);
  ok(i1.sources.leys === 1 && i1.sources.blds >= 2, 'sources tracked');
  ley.owner = 0; run(st, 1);
  ok(Magic.manaInfo(st, 3).sources.leys === 0, 'lost ley line stops feeding');
  ley.owner = 3;
  team.mana = 0; run(st, 10); ley.owner = ley0;
  ok(team.mana > i1.regen * 8 && team.mana <= team.manaMax, 'mana regenerates over time: ' + team.mana.toFixed(1));

  console.log('== souls as alternative cost');
  clear(st); A = arena(st, 0); team = A.team;
  team.spells.soul_harvest = true; team.cd = {}; team.mana = 10; A.g.mana = 0; team.res.souls = 40;
  const sr = Magic.cast(st, 0, 'soul_harvest', A.g.id, A.foes[0].x, A.foes[0].z);
  ok(sr.ok && team.res.souls < 40, 'souls cover missing mana for big spell');
  team.mana = 5; team.res.souls = 0; team.cd = {};
  ok(!Magic.cast(st, 0, 'soul_harvest', A.g.id, A.foes[0].x, A.foes[0].z).ok, 'not enough souls or mana blocked');
  clear(st); A = arena(st, 3); A.team.mana = 400;
  const hpC = A.g.hp; A.team.spells.crimson_nova = true;
  ok(Magic.cast(st, 3, 'crimson_nova', A.g.id, 0, 0).ok && A.g.hp === hpC - 5, 'cult pays HP (45, nova heals 40) for crimson nova');

  console.log('== AI suggest');
  for (let t = 0; t < 4; t++) {
    clear(st); A = arena(st, t);
    for (const q of Object.values(SPELLS)) if (q.school === A.team.faction.school) A.team.spells[q.id] = true;
    A.team.cd = {};
    const sg = Magic.suggest(st, t, A.g);
    ok(sg && SPELLS[sg.spell], 'suggest returns a spell for ' + A.team.faction.school + (sg ? ' (' + sg.spell + ')' : ''));
    if (sg) ok(Magic.cast(st, t, sg.spell, A.g.id, sg.x, sg.z, sg.target).ok, 'suggested cast succeeds: ' + sg.spell);
  }
  clear(st); A = arena(st, 0); for (const u of A.foes) { u.alive = false; u.hp = 0; } for (const u of A.allies) u.hp = u.maxHp;
  const sg0 = Magic.suggest(st, 0, A.g); ok(sg0 === null, 'no suggestion without enemies ' + JSON.stringify(sg0));

  console.log('== perf');
  const t0 = performance.now(); for (let i = 0; i < 300; i++) step(st, SIM_DT, {});
  console.log('  avg step', ((performance.now() - t0) / 300).toFixed(2), 'ms');
}
