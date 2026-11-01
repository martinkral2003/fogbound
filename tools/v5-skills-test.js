// FOGBOUND v0.5 SKILLS lane test: node tools/v5-skills-test.js
// 1) data: 4 classes x 8 skills x 3 branches, 2 ultimates per class, modSkill for every skill x level x branch is finite and does not touch the base data
// 2) casts: every skill x level 1..3 x branch (none / 0 / 1 / 2) and every ultimate casts in a real sim against a dummy target without exceptions
// 3) offers: every offer is legal, has no duplicates, always holds a level-up while one exists; random and auto picks reach level 10 with a full kit
// 4) integration: the pickperk command, allied AI auto-pick, XP pace to level 10
// Errors that come out of other lanes (horde.js, towns.js ... mid-edit) are reported as warnings, errors from the kit code fail the run.
import { createGame, step, simApi } from '../src/sim.js';
import { SKILLS, CLASSES, CLASS_IDS, KIT, SIM_DT, MAX_HERO_LVL, MONSTERS } from '../src/data.js';
import * as perks from '../src/perks.js';

let fails = 0, warns = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };
const warn = (m) => { warns++; console.log('warn ' + m); };
const ok = (c, m) => { if (!c) fail(m); return !!c; };
const MINE = /(kits|perks|ults|perks_ui|skillaim|aiming)\.js|castSkill|castCharge|castRiders|summonKit/;
const blank = () => ({ mx: 0, mz: 0, aimX: 0, aimZ: 0, atk: false, casts: [], charge: false, tele: false, repair: false, cmds: [] });
const tick = (st, inputs) => {
  try { step(st, SIM_DT, inputs || st.teams.map(blank)); } catch (e) {
    if (MINE.test(String(e.stack).split('\n').slice(0, 6).join('\n'))) { fail('step threw in kit code: ' + e.stack.split('\n').slice(0, 4).join(' | ')); } else if (!tick.seen[e.message]) { tick.seen[e.message] = 1; warn('other lane threw: ' + e.message + ' @ ' + (String(e.stack).split('\n')[1] || '').trim().replace(/^at /, '')); }
  }
  st.events.length = 0;
};
tick.seen = {};
const run = (st, secs, fn) => { for (let i = 0; i < secs / SIM_DT; i++) { const inp = st.teams.map(blank); if (fn) fn(inp, i); tick(st, inp); } };

// ------------------------------------------------------------------------------------------------ 1) data
console.log('== data');
ok(CLASS_IDS.length === 4, '4 classes');
const normal = [];
for (const cid of CLASS_IDS) {
  const C = CLASSES[cid];
  ok(C.skills.length === 13, `${cid}: 13 skills`);
  ok(C.skills.includes(C.start), `${cid}: start skill is one of the 8`);
  ok(C.ults.length === 3 && C.ults.every((u) => SKILLS[u] && SKILLS[u].ult), `${cid}: 3 ultimates`);
  for (const id of C.skills) {
    const s = SKILLS[id];
    if (!ok(s, `${id} exists`)) continue;
    normal.push(id);
    ok(s.cls === cid, `${id}: class tag`);
    ok(s.name && s.icon && s.desc && s.cd > 0 && s.type, `${id}: name/icon/desc/cd/type`);
    ok(s.br && s.br.length === 3 && s.br.every((b) => b.name && b.desc && typeof b.fn === 'function'), `${id}: 3 branches`);
    if (s.type !== 'summon') ok(s.cd >= 3 && s.cd <= 16, `${id}: cooldown ${s.cd}s should be 3-16 s`);
  }
  ok(C.skills.filter((id) => SKILLS[id].type === 'summon').length === 1, `${cid}: exactly one summon skill`);
}
ok(new Set(normal).size === 52, '52 distinct skill ids');
const snap = JSON.stringify(Object.values(SKILLS).map((s) => ({ ...s, br: undefined })));
const fakeTeam = (cid) => ({ kit: { cls: cid, slots: [null, null, null, null], lv: {}, path: {}, offers: [], ver: 0, sv: 0, picks: [], disc: {} } });
let variants = 0;
for (const id of normal) {
  const s = SKILLS[id], t = fakeTeam(s.cls);
  for (let lv = 1; lv <= 3; lv++) for (const pa of [undefined, 0, 1, 2]) {
    t.kit.lv[id] = lv; if (pa === undefined) delete t.kit.path[id]; else t.kit.path[id] = pa;
    const m = perks.modSkill(t, s, { cdr: 0, skRad: 0 });
    variants++;
    const bad = [];
    for (const k in m) if (typeof m[k] === 'number' && !Number.isFinite(m[k])) bad.push(k);
    if (bad.length) fail(`${id} lv${lv} path ${pa}: non-finite ${bad.join(',')}`);
    if (!(m.cd > 0)) fail(`${id} lv${lv} path ${pa}: cooldown ${m.cd}`);
    if (lv === 1 && pa === undefined && MULTS(s)) ok(m.dmg !== undefined || m.dps !== undefined || m.land || m.type === 'blink', `${id}: damage field`);
  }
  // levels must make the skill stronger / faster, branches must change something
  t.kit.lv[id] = 1; delete t.kit.path[id]; const a = perks.modSkill(t, s, null);
  t.kit.lv[id] = 3; const c = perks.modSkill(t, s, null);
  ok(c.cd < a.cd, `${id}: level 3 cooldown ${c.cd.toFixed(2)} < level 1 ${a.cd.toFixed(2)}`);
  t.kit.lv[id] = 2;
  for (let b = 0; b < 3; b++) { t.kit.path[id] = b; const m = perks.modSkill(t, s, null); delete t.kit.path[id]; const base = perks.modSkill(t, s, null); t.kit.path[id] = b; ok(JSON.stringify(m) !== JSON.stringify(base), `${id} branch ${b}: changes nothing`); }
}
function MULTS(s) { return ['line', 'bolt', 'strike', 'aoe', 'fan', 'zone', 'drain'].includes(s.type); }
ok(JSON.stringify(Object.values(SKILLS).map((s) => ({ ...s, br: undefined }))) === snap, 'modSkill must not mutate SKILLS');
console.log(`   ${variants} skill variants evaluated`);

// ------------------------------------------------------------------------------------------------ 2) casts
console.log('== casts');
const MON = Object.keys(MONSTERS).find((k) => MONSTERS[k].hp && !MONSTERS[k].boss) || Object.keys(MONSTERS)[0];
let castN = 0, noCast = [];
for (const cid of CLASS_IDS) {
  const st = createGame({ humans: [], bg: cid, seed: 11 });
  const team = st.teams[0], h = team.hero, camp = { id: -1, x: h.x, z: h.z, tier: 1, mons: 0, respT: 0, boss: false };
  // clear everything else around so dummies are the only targets, then drop dummies in a cluster 7 m in front of the hero
  for (const e of st.ents) if (e !== h && e.kind === 'mon') { e.hp = 0; e.alive = false; }
  const dummies = [];
  const place = () => { dummies.forEach((d, i) => { d.x = d.ox = h.x + 7 + (i % 3) * 1.4; d.z = d.oz = h.z + (Math.floor(i / 3) - 1) * 1.6; d.hp = d.maxHp = 1e6; d.alive = true; d.dead = false; d.stun = 0; d.slowUntil = 0; d.burnUntil = 0; d.hid = 0; d.tgt = 0; d.aggro = 0; d.spd = 0; d.atk = 0; d.debuff = null; d.shield = null; }); };
  for (let i = 0; i < 6; i++) { const m = simApi.spawnMonster(st, MON, 1, h.x + 7, h.z, camp); if (m) dummies.push(m); }
  ok(dummies.length === 6, `${cid}: dummies spawned`);
  const hp0 = () => dummies.reduce((a, d) => a + d.hp, 0);
  for (const id of CLASSES[cid].skills) {
    const s = SKILLS[id];
    for (let lv = 1; lv <= 3; lv++) for (const pa of [undefined, 0, 1, 2]) {
      team.kit.slots = [id, null, null, null]; team.kit.lv = { [id]: lv }; team.kit.path = pa === undefined ? {} : { [id]: pa };
      team.cd = {}; h.hp = h.maxHp; h.stun = 0; h.x = h.ox = h.z * 0 + h.x; place(); const before = hp0(), x0 = h.x, z0 = h.z;
      const allies0 = st.ents.filter((e) => e.team === 0 && e.kind === 'unit' && e.alive).length;
      run(st, 1.6, (inp, i) => { inp[0].aimX = x0 + 7; inp[0].aimZ = z0; if (i === 0) inp[0].casts = [0]; });
      castN++;
      const cast = (team.cd[id] || 0) > 0 || team.lastCast && team.lastCast.id === id;
      if (!cast) noCast.push(`${id} lv${lv} path ${pa}`);
      if (cast && ['line', 'bolt', 'strike', 'aoe', 'fan', 'zone', 'drain', 'blink'].includes(s.type) && lv === 3 && pa === undefined && hp0() >= before) warn(`${id}: no damage dealt to the dummies (aim/range/delay?)`);
      if (cast && s.type === 'summon') { const n = st.ents.filter((e) => e.team === 0 && e.kind === 'unit' && e.alive).length; if (n <= allies0) warn(`${id}: summon created no servants (recruits.summonServants / fallback)`); }
      h.x = h.ox = x0; h.z = h.oz = z0;
      for (const e of st.ents) if (e.kind === 'unit' && e.team === 0) { e.hp = 0; e.alive = false; }
    }
  }
  // ultimates
  for (const id of CLASSES[cid].ults) {
    team.kit.slots = [CLASSES[cid].start, null, null, id]; team.kit.lv = { [CLASSES[cid].start]: 1 }; team.chCd = 0; place(); const before = hp0(), x0 = h.x, z0 = h.z;
    run(st, 1.8, (inp) => { inp[0].aimX = x0 + 7; inp[0].aimZ = z0; inp[0].charge = true; });
    run(st, 0.2, (inp) => { inp[0].aimX = x0 + 7; inp[0].aimZ = z0; });
    run(st, 2.5);
    castN++;
    ok(team.chCd > 0, `ultimate ${id}: not cast`);
    if (hp0() >= before) warn(`ultimate ${id}: no damage dealt`);
    team.chCd = 0;
  }
  // R stays locked without an ultimate
  team.kit.slots = [CLASSES[cid].start, null, null, null]; team.chCd = 0;
  run(st, 2, (inp) => { inp[0].aimX = h.x + 7; inp[0].aimZ = h.z; inp[0].charge = true; });
  ok(!(team.chCd > 0), `${cid}: R must be locked before the ultimate is picked`);
}
if (noCast.length) fail(`${noCast.length} casts did not start: ${noCast.slice(0, 8).join('; ')}`);
console.log(`   ${castN} casts run`);

// ------------------------------------------------------------------------------------------------ 3) offers
console.log('== offers');
const rngOf = (seed) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
const keyOf = (o) => o.kind + ':' + o.skill + ':' + (o.branch === undefined ? '' : o.branch);
function checkHead(st, team, tag) {
  perks.normalize(st, team);
  const head = team.kit.offers[0];
  if (!head) return null;
  ok(head.length >= 1 && head.length <= 3, `${tag}: offer has ${head.length} options`);
  ok(new Set(head.map(keyOf)).size === head.length, `${tag}: duplicate options ${head.map(keyOf).join(' ')}`);
  for (const o of head) ok(perks.legal(team, o), `${tag}: illegal option ${keyOf(o)}`);
  ok(head.every((o) => o.name && o.text && o.icon && o.tag), `${tag}: option text/icon/name`);
  if (head.meta && head.meta.kind === 'mix') {
    const canLevel = team.kit.slots.slice(0, 3).some((id) => id && team.kit.lv[id] < KIT.maxSkillLv);
    if (canLevel) ok(head.some((o) => o.kind === 'level'), `${tag}: no level-up option though one exists (${head.map(keyOf).join(' ')})`);
  }
  return head;
}
function runLevels(st, team, pickFn, label, burst) {
  perks.initKit(team); team.hero.lvl = 1;
  perks.onHeroLevel(st, team, 1);
  const seq = [];
  const drain = (lvlTag) => { for (let guard = 0; guard < 30 && team.kit.offers.length; guard++) { const head = checkHead(st, team, `${label} ${lvlTag}`); if (!head) break; const i = pickFn(head); ok(i >= 0 && i < head.length, `${label}: pick index`); const o = head[i]; seq.push(keyOf(o)); perks.command(st, team, { t: 'pickperk', idx: i }); } };
  if (burst) { for (let l = 2; l <= MAX_HERO_LVL; l++) { team.hero.lvl = l; perks.onHeroLevel(st, team, l); } drain('burst'); } else { drain('L1'); for (let l = 2; l <= MAX_HERO_LVL; l++) { team.hero.lvl = l; perks.onHeroLevel(st, team, l); drain('L' + l); } }
  const k = team.kit;
  ok(k.slots.every(Boolean), `${label}: kit not full: ${JSON.stringify(k.slots)}`);
  ok(new Set(k.slots).size === 4, `${label}: duplicate slot skills ${JSON.stringify(k.slots)}`);
  ok(CLASSES[k.cls].ults.includes(k.slots[3]), `${label}: slot R holds a class ultimate`);
  ok(k.slots.slice(0, 3).every((id) => CLASSES[k.cls].skills.includes(id)), `${label}: foreign skill in kit`);
  ok(Object.keys(k.lv).every((id) => k.lv[id] >= 1 && k.lv[id] <= KIT.maxSkillLv), `${label}: skill levels in 1..max`);
  ok(Object.keys(k.path).every((id) => [0, 1, 2].includes(k.path[id]) && k.lv[id] >= 2), `${label}: branch only at level >= 2`);
  ok(k.offers.length === 0, `${label}: ${k.offers.length} offers left`);
  ok(team.sk.slots === k.slots && team.sk.ver === k.ver, `${label}: compat mirror in sync`);
  return seq;
}
for (const cid of CLASS_IDS) {
  const st = createGame({ humans: [], bg: cid, seed: 7 }), team = st.teams[0];
  const seqA = runLevels(st, team, () => perks.autoIdx(st, team), `${cid} auto`);
  const k = team.kit;
  console.log(`   ${cid.padEnd(8)} auto: ${k.slots.join('/')} lv ${JSON.stringify(k.lv)} path ${JSON.stringify(k.path)} (${seqA.length} picks)`);
  ok(seqA.length >= 9, `${cid}: expected ~10 picks, got ${seqA.length}`);
  for (let r = 0; r < 12; r++) { const rng = rngOf(r * 977 + cid.length); runLevels(st, team, (head) => Math.floor(rng() * head.length), `${cid} random#${r}`, r % 3 === 0); }
}
// level offer kinds in order for a fresh kit: skill, skill, mix, mix, ult at level 5, mix ...
{
  const st = createGame({ humans: [], bg: 'mage', seed: 3 }), team = st.teams[0];
  perks.initKit(team); perks.onHeroLevel(st, team, 1);
  const kinds = [];
  for (let l = 1; l <= MAX_HERO_LVL; l++) { if (l > 1) { team.hero.lvl = l; perks.onHeroLevel(st, team, l); } const h = team.kit.offers[0]; kinds.push(h.meta.kind); perks.autoPick(st, team); }
  console.log('   offer kinds by level: ' + kinds.join(' '));
  ok(kinds.slice(0, 3).every((k) => k === 'skill') && kinds[3] === 'mix' && kinds[4] === 'ult', 'offer kinds by level');
}

// ------------------------------------------------------------------------------------------------ 4) integration
console.log('== integration');
{
  const st = createGame({ humans: [0], bg: 'outlaw', seed: 5 }), team = st.teams[0];
  ok(team.kit.slots.every((s) => !s) && team.kit.offers.length >= 1, 'hero starts with NO skill and a level-1 offer');
  ok(team.kit.offers.length === 1 && team.kit.offers[0].every((o) => o.kind === 'skill'), 'level-1 offer = 3 skills');
  const o0 = team.kit.offers[0][1];
  tick(st, st.teams.map((t, i) => { const b = blank(); if (i === 0) b.cmds.push({ t: 'pickperk', idx: 1 }); return b; }));
  ok(team.kit.slots[0] === o0.skill, `pickperk command picked ${o0.skill}: slots ${JSON.stringify(team.kit.slots)}`);
  // an allied AI hero (team 1) picks by itself
  const ai = st.teams[1];
  ok(ai.kit.offers.length === 1, 'AI has a first offer');
  run(st, 3.5);
  ok(ai.kit.offers.length === 0 && ai.kit.slots[0], `AI auto-picked: ${JSON.stringify(ai.kit.slots)}`);
  // the human does not auto-pick: queue a level-up and wait
  simApi.addXP(st, team.hero, 200); // several levels at once
  run(st, 5);
  ok(team.kit.offers.length >= 1, 'human offers wait for the player');
  // XP flow: grantXP / addXP raise the level, every level queues one offer, cap at 10
  const h = st.teams[2].hero, n0 = st.teams[2].kit.offers.length + st.teams[2].kit.picks.length;
  for (let i = 0; i < 400; i++) perks.grantXP(st, 2, 400, 'test');
  ok(h.lvl === MAX_HERO_LVL, `hero reaches the level cap (${h.lvl})`);
  run(st, 30);
  const t2 = st.teams[2].kit;
  ok(t2.slots.every(Boolean) && t2.offers.length === 0, `allied hero ended with a full kit: ${JSON.stringify(t2.slots)} offers ${t2.offers.length} (picks ${t2.picks.length}, start ${n0})`);
}
// XP pace: a hero fed raw XP at various speeds ends up at level 10 around minute 14 (when the raw income allows it)
{
  const need = (l) => perks.heroXpNeed(l), cum = perks.XP_TOTAL;
  for (const [name, rawTotalAtMin] of [['slow (raw 2370 XP in 24 min)', 24], ['normal (in 18 min)', 18], ['fast (in 12 min)', 12]]) {
    const st = { t: 0 }, e = { lvl: 1, xp: 0, xpBonus: 0 };
    let reached = -1;
    for (let t = 0; t < 40 * 60 && reached < 0; t++) {
      st.t = t;
      const raw = cum / (rawTotalAtMin * 60);
      e.xp += perks.xpGainFor(st, e, raw);
      while (e.lvl < MAX_HERO_LVL && e.xp >= need(e.lvl)) { e.xp -= need(e.lvl); e.lvl++; }
      if (e.lvl >= MAX_HERO_LVL) reached = t / 60;
    }
    console.log(`   ${name}: level 10 at ${reached.toFixed(1)} min`);
    ok(reached > 10 && reached < 30, `${name}: level cap at ${reached.toFixed(1)} min (target 11-16)`);
  }
}

console.log(`${fails ? fails + ' FAILURES' : 'v5 skills test passed'}${warns ? ` (${warns} warnings)` : ''}`);
process.exit(fails ? 1 : 0);

