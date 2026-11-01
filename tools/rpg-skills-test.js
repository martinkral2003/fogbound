// Headless test of the SKILLS lane. node tools/rpg-skills-test.js
import { createRpg, makeActor } from '../src/rpg/core.js';
import * as S from '../src/rpg/skills.js';
import { MAX_LVL } from '../src/rpg/consts.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL:', msg); } };
const st = createRpg({ seed: 7, rivals: 0, human: false });
const mk = (o = {}) => makeActor(st, { kind: 'rival', name: 'T', ...o });
const take = (n) => { const e = st.events.filter((x) => x.type === n); return e; };

// ---------------------------------------------------------------- XP table
console.log('== XP table (xpNeed, cumulative, total learning points, attr points)');
let cum = 0, lp = 0;
const cumAt = {};
for (let l = 1; l < MAX_LVL; l++) {
  cum += S.xpNeed(l); lp += 1 + ([4, 9, 14].includes(l) ? 1 : 0);
  cumAt[l + 1] = cum;
  console.log(`  L${l} -> L${l + 1}: need ${String(S.xpNeed(l)).padStart(5)}  cum ${String(cum).padStart(6)}  skillPts ${lp}  attrPts ${3 * l}`);
}
const lvlFor = (xp) => { let l = 1; while (l < MAX_LVL && xp >= cumAt[l + 1]) l++; return l; };

console.log('== kill XP (xpValue)');
const samples = [
  ['skeleton t1 L1', { kind: 'monster', type: 'skeleton', lvl: 1, tier: 1 }], ['wolf t2 L3', { kind: 'monster', type: 'wolf', lvl: 3, tier: 2 }],
  ['troll t3 L5', { kind: 'monster', type: 'troll', lvl: 5, tier: 3 }], ['crypt t3 L6', { kind: 'monster', type: 'crypt', lvl: 6, tier: 3 }],
  ['king boss L10', { kind: 'monster', type: 'king', lvl: 10, tier: 4 }], ['rival L5', { kind: 'rival', lvl: 5, kills: 1 }], ['rival L12', { kind: 'rival', lvl: 12, kills: 3 }],
  ['unknown monster', { kind: 'monster', type: 'zzz', lvl: 2 }], ['npc', { kind: 'npc', lvl: 1 }], ['explicit', { kind: 'monster', xpValue: 77 }],
];
for (const [n, v] of samples) console.log('  ' + n.padEnd(18), S.xpValue(v));
ok(S.xpValue(null) === 0, 'xpValue(null)');
ok(S.xpValue({ kind: 'monster', type: 'king', lvl: 1, tier: 1 }) > 10 * S.xpValue({ kind: 'monster', type: 'skeleton', lvl: 1, tier: 1 }), 'boss huge');

// average-match estimate: 20 min = 28 monsters mixed tiers (avg level rising), 2 rivals, 3 quests of 90 xp
const est = (monsters, rivals, quests, boss) => {
  let xp = quests * 90;
  const types = ['skeleton', 'wolf', 'ghoul', 'orcRaider', 'skelArcher', 'wraith', 'bogBeast', 'crypt', 'troll'];
  for (let i = 0; i < monsters; i++) xp += S.xpValue({ kind: 'monster', type: types[i % types.length], lvl: 1 + Math.floor(i / 6), tier: 1 + (i % 3) });
  for (let i = 0; i < rivals; i++) xp += S.xpValue({ kind: 'rival', lvl: 4 + 2 * i, kills: i });
  if (boss) xp += S.xpValue({ kind: 'monster', type: 'king', lvl: 8, tier: 4 });
  return xp;
};
for (const [n, m, r, q, b] of [['casual 20 min', 28, 1, 2, false], ['average 20 min', 40, 2, 3, false], ['strong 25 min', 60, 4, 5, false], ['great 30 min + boss', 80, 6, 6, true]]) {
  const x = est(m, r, q, b); console.log(`  ${n.padEnd(22)} ${String(x).padStart(6)} xp -> level ${lvlFor(x)}`);
}
ok(lvlFor(est(40, 2, 3, false)) >= 9 && lvlFor(est(40, 2, 3, false)) <= 13, 'average match lands near level 10-12');
ok(lvlFor(est(80, 6, 6, true)) >= 15, 'great match reaches 15+');

// ---------------------------------------------------------------- grantXp / attributes
console.log('== grantXp + attributes');
{
  const a = mk(); st.events.length = 0;
  S.grantXp(st, a, S.xpNeed(1) + S.xpNeed(2) + 5);
  ok(a.lvl === 3 && a.xp === 5, 'multi level-up carry ' + a.lvl + '/' + a.xp);
  ok(a.points.attr === 6 && a.points.skill === 2, 'points after 2 levels');
  ok(take('levelup').length === 2, 'two levelup events');
  S.grantXp(st, a, 1e9); ok(a.lvl === MAX_LVL, 'cap at MAX_LVL');
  ok(a.points.skill === (MAX_LVL - 1) + 3 && a.points.attr === 3 * (MAX_LVL - 1), 'total points at 20: ' + JSON.stringify(a.points));
  ok(a.perks.levels.length === 4, 'milestone perks recorded ' + a.perks.levels);
  const lv = a.lvl; S.grantXp(st, a, 100); ok(a.lvl === lv, 'no overflow'); S.grantXp(st, a, -5); S.grantXp(st, null, 5); S.grantXp(st, a, NaN);
  const b = mk(); ok(!S.spendAttr(b, 'str'), 'spendAttr with no points fails');
  b.points.attr = 2; ok(S.spendAttr(b, 'str') && b.attrs.str === 11 && b.points.attr === 1, 'spendAttr ok');
  ok(!S.spendAttr(b, 'luck'), 'unknown attr'); b.attrs.dex = S.MAX_ATTR; ok(!S.spendAttr(b, 'dex'), 'attr cap');
  const ab = S.attrBonus(mk({ attrs: { str: 14, dex: 10, int: 10, vit: 12 } }));
  console.log('  attrBonus str14 vit12:', JSON.stringify(ab));
  ok(ab.maxHp === 110 && ab.carry === 82 && ab.meleeDmgPct === 10, 'attrBonus numbers');
}

// ---------------------------------------------------------------- tree sanity
console.log('== trees');
for (const id of S.SKILL_IDS) {
  const sk = S.SKILLS[id]; ok(sk.ranks.length === 5, id + ' has 5 ranks');
  for (let r = 1; r <= 5; r++) { const d = S.describeSkill(id, r); ok(d && d.effects.length > 0 && d.cost.costGold > 0, id + ' describe ' + r); }
}
const d = S.describeSkill('block', 3);
console.log('  describe block r3:', JSON.stringify(d));
ok(S.describeSkill('nope', 1) === null, 'describeSkill unknown');
ok(S.describeSkill('block', 99).rank === 5 && S.describeSkill('block', 0).rank === 1, 'describeSkill clamps rank');
let allGold = 0, allLp = 0; for (let r = 1; r <= 5; r++) { allGold += S.costFor('onehand', r).costGold; allLp += S.costFor('onehand', r).costPoints; }
console.log('  one tree total cost:', allGold, 'gold,', allLp, 'learning points');

// ---------------------------------------------------------------- builds
console.log('== builds: perkMods at levels 5/10/15 (autoLevel, weapon matching the build)');
const gear = { warrior: { weapon: { kind: 'sword' }, chest: { weight: 8 } }, brute: { weapon: { kind: 'twohand' }, chest: { weight: 8 }, legs: { weight: 6 } }, ranger: { weapon: { kind: 'bow' }, chest: { weight: 2, armorClass: 'light' } }, mage: { weapon: { kind: 'staff' } }, rogue: { weapon: { kind: 'dagger' }, chest: { weight: 2 } } };
const show = (m) => Object.entries(m).filter(([k, v]) => v && !/^(oneHandDmgPct|twoHandDmgPct|bowSkillDmgPct|armorPctLight|armorPctHeavy)$/.test(k) && v !== 1).map(([k, v]) => k + '=' + (Math.round(v * 100) / 100)).join(' ');
for (const build of ['warrior', 'brute', 'ranger', 'mage', 'rogue']) {
  const a = mk({ attrs: S.startingAttrs(build) }); a.build = build; a.skills = S.startingSkills(build); Object.assign(a.equip, gear[build]);
  for (const L of [5, 10, 15]) {
    S.grantXp(st, a, cumAt[L] - ((a.xpTotal) || 0) + 1);
    const m = S.perkMods(a);
    console.log(`  ${build} L${a.lvl} skills ${JSON.stringify(a.skills)} pts ${JSON.stringify(a.points)}\n     ${show(m)}`);
    ok(a.lvl === L, build + ' reached ' + L + ' got ' + a.lvl);
  }
  ok(a.points.skill <= 2, build + ' spends skill points (left ' + a.points.skill + ')'); ok(a.points.attr === 0, build + ' spends attribute points');
  const sp = S.knownSpells(a); console.log('     spells:', sp.join(','));
}

// ---------------------------------------------------------------- perkMods specifics
console.log('== perkMods specifics');
{
  const a = mk(); const m0 = S.perkMods(a);
  ok(m0.sneakMul === 1 && m0.dmgPct === 0 && m0.parryWindow === 0, 'blank mods');
  a.skills = { block: 3 }; const m3 = S.perkMods(a); ok(Math.abs(m3.parryWindow - 0.06) < 1e-9 && m3.blockEfficiency === 20, 'block r3 parry window ' + m3.parryWindow);
  a.skills = { block: 5 }; ok(S.perkMods(a).counterDmgPct === 30, 'block r5 counter');
  a.skills = { archery: 5 }; a.equip.weapon = { kind: 'sword' }; ok(S.perkMods(a).bowDmgPct === 0 && S.perkMods(a).moveWhileDraw === 0, 'archery perks inert with a sword (cache keyed on gear)');
  a.equip.weapon = { kind: 'bow' }; const mb = S.perkMods(a); ok(mb.bowDmgPct === 31 && mb.moveWhileDraw === 0.5, 'archery r5 with bow ' + mb.bowDmgPct);
  ok(S.perkMods(a) === mb, 'cache returns same object when nothing changed');
  a.skills = { archery: 4 }; ok(S.perkMods(a).moveWhileDraw === 0, 'cache invalidated by skill change (hash)');
  a.skills = { twohand: 5 }; a.equip.weapon = { kind: 'twohand' }; ok(S.perkMods(a).cleave === 1 && S.perkMods(a).meleeDmgPct === 32, 'twohand r5');
  a.skills = { stealth: 5 }; ok(Math.abs(S.perkMods(a).sneakMul - 0.59049) < 1e-6, 'sneakMul multiplies');
  a.skills = { lockpicking: 5 }; const ml = S.perkMods(a); ok(ml.lockTier === 3 && ml.lockpick <= 0.85 && ml.lockpick >= 0.7, 'lockpicking ' + ml.lockpick + '/' + ml.lockTier);
  a.skills = { lightArmor: 5, heavyArmor: 5 }; a.equip.chest = { weight: 2 }; a.equip.legs = { weight: 9 }; const ma = S.perkMods(a);
  ok(Math.abs(ma.armorPct - (24 * 1 + 31 * 1) / 5) < 1e-9, 'armour scales per piece ' + ma.armorPct);
  a.lvl = 12; a.skills = {}; ok(S.perkMods(a).dmgPct === 3 && S.perkMods(a).resAll === 2, 'level perks fold in at lvl 10');
  const m2 = S.perkMods({}); ok(m2 && m2.sneakMul === 1, 'perkMods on junk actor does not throw');
  for (const k of Object.keys(S.perkMods(mk()))) ok(Number.isFinite(S.perkMods(mk())[k]), 'finite ' + k);
}

// ---------------------------------------------------------------- spells
console.log('== spell unlocks');
{
  const a = mk(); ok(S.knownSpells(a).join() === 'mend', 'everyone knows mend only');
  a.skills = { destruction: 2 }; ok(S.knownSpells(a).join() === 'mend,firebolt,frostshard', 'destruction 2: ' + S.knownSpells(a));
  a.skills = { destruction: 5, restoration: 5, stealth: 4 }; const k = S.knownSpells(a);
  for (const sp of ['firebolt', 'frostshard', 'arc', 'venom', 'nova', 'stoneskin', 'drain', 'bonewarden', 'blink', 'mend']) ok(k.includes(sp), 'knows ' + sp);
  ok(new Set(k).size === k.length && k.length === 10, 'all 10 spells, no dupes');
}

// ---------------------------------------------------------------- trainer flow
console.log('== trainers + learning');
{
  const npc = makeActor(st, { kind: 'npc', name: 'Brannoch', x: 100, z: 100 }); npc.role = 'warrior';
  const mage = makeActor(st, { kind: 'npc', name: 'Ysolde', x: 100, z: 100 }); mage.role = 'mage';
  const gen = makeActor(st, { kind: 'npc', name: 'Odo', x: 100, z: 100 }); gen.role = 'general';
  const merchant = makeActor(st, { kind: 'npc', name: 'Merchant', x: 100, z: 100 }); merchant.role = 'smith';
  const p = mk({ kind: 'player', x: 101, z: 100 }); p.gold = 1000; p.points.skill = 6; p.lvl = 3;
  st.events.length = 0;
  ok(!S.learnSkill(st, p, 'onehand', 999999), 'no such npc'); ok(!S.learnSkill(st, p, 'onehand', merchant.id), 'not a trainer');
  ok(!S.learnSkill(st, p, 'destruction', npc.id), 'warrior does not teach destruction');
  p.x = 120; ok(!S.learnSkill(st, p, 'onehand', npc.id), 'too far'); p.x = 101;
  ok(S.learnSkill(st, p, 'onehand', npc.id) && p.skills.onehand === 1, 'learn rank 1');
  ok(p.gold === 1000 - 40 && p.points.skill === 5 && npc.gold === 40, 'cost paid: gold ' + p.gold + ' pts ' + p.points.skill);
  ok(S.learnSkill(st, p, 'onehand', npc.id) && p.skills.onehand === 2, 'rank 2 at level 3');
  const c3 = S.canLearn(p, 'onehand'); ok(!c3.ok && /level 6/.test(c3.reason), 'rank 3 needs level 6: ' + c3.reason);
  ok(!S.learnSkill(st, p, 'onehand', npc.id) && p.skills.onehand === 2, 'blocked by level');
  const cb = S.canLearn(p, 'block'); ok(cb.ok, 'block rank 1 open'); S.learnSkill(st, p, 'block', npc.id);
  p.lvl = 6; p.points.skill = 10; p.gold = 5000;
  const cb3 = S.canLearn(p, 'block'); ok(cb3.ok, 'block r2'); S.learnSkill(st, p, 'block', npc.id);
  p.attrs.str = 12; const ct = S.canLearn(p, 'twohand'); ok(ct.ok, 'twohand r1 ok at str 12: ' + ct.reason); p.attrs.str = 10;
  const ct2 = S.canLearn(p, 'twohand'); ok(!ct2.ok && /STR 12/.test(ct2.reason), 'str requirement: ' + ct2.reason);
  const ch = S.canLearn(Object.assign(mk(), { lvl: 20, points: { attr: 0, skill: 20 }, gold: 9999 }), 'heavyArmor'); ok(!ch.ok, 'heavyArmor r1 needs STR 12');
  const dd = mk({ attrs: { str: 10, dex: 10, int: 16, vit: 10 } }); dd.lvl = 20; dd.points.skill = 30; dd.gold = 99999; dd.skills = { destruction: 3 };
  const c4 = S.canLearn(dd, 'destruction'); ok(!c4.ok && /Restoration/.test(c4.reason), 'cross-skill prerequisite: ' + c4.reason);
  dd.skills.restoration = 1; ok(S.canLearn(dd, 'destruction').ok, 'prerequisite met');
  // gold / points shortage
  const poor = mk(); poor.lvl = 5; poor.gold = 10; poor.points.skill = 3; ok(/gold/.test(S.canLearn(poor, 'onehand').reason), 'needs gold');
  poor.gold = 500; poor.points.skill = 0; ok(/learning point/.test(S.canLearn(poor, 'onehand').reason), 'needs points');
  // max rank
  const mx = mk(); mx.skills = { onehand: 5 }; mx.lvl = 20; const cm = S.canLearn(mx, 'onehand'); ok(!cm.ok && cm.reason === 'Already mastered', 'max rank');
  ok(!S.canLearn(mx, 'bogus').ok, 'bogus skill');
  // role caps
  const g = mk({ kind: 'player', x: 100, z: 100 }); g.lvl = 20; g.gold = 9999; g.points.skill = 30;
  ok(S.learnSkill(st, g, 'athletics', gen.id) && S.learnSkill(st, g, 'athletics', gen.id) && S.learnSkill(st, g, 'athletics', gen.id), 'general teaches athletics 1-3');
  ok(!S.learnSkill(st, g, 'athletics', gen.id) && g.skills.athletics === 3, 'general capped at rank 3');
  // trainerOffers
  const offs = S.trainerOffers('mage'); console.log('  mage offers:', offs.length, JSON.stringify(offs[0]));
  ok(offs.length === 10 && offs.every((o) => o.costGold > 0 && o.costPoints > 0), 'mage offers 2 trees x 5 ranks');
  ok(S.trainerOffers('nobody').length === 0, 'unknown role empty');
  const offA = S.trainerOffers('warrior', p); console.log('  warrior offers for player:', offA.map((o) => o.skill + o.rank + (o.ok ? '+' : '-')).join(' '));
  ok(offA.every((o) => o.rank === (p.skills[o.skill] || 0) + 1), 'next-rank offers only');
  ok(S.learnSkill(st, p, 'athletics', 4242) === false, 'bad npc id');
  ok(take('msg').length > 0, 'player gets msg events on failure');
}

// ---------------------------------------------------------------- autoLevel / edge cases
console.log('== autoLevel edge cases');
{
  const a = mk(); S.autoLevel(a, 'warrior'); ok(a.points.attr === 0 && a.points.skill === 0, 'autoLevel with no points is a no-op');
  const b = mk(); b.points = { attr: 12, skill: 5 }; b.lvl = 10; S.autoLevel(b, 'nonexistent-build');
  ok(b.points.attr === 0, 'unknown build falls back to warrior'); console.log('  fallback build skills', JSON.stringify(b.skills), JSON.stringify(b.attrs));
  const c = mk(); c.build = 'mage'; c.skills = S.startingSkills('mage'); S.grantXp(st, c, 1e6);
  ok(c.skills.destruction >= 3 && c.skills.restoration >= 2, 'mage rival levels magic: ' + JSON.stringify(c.skills));
  ok(c.attrs.int > 20, 'mage rival pumps INT ' + c.attrs.int);
  ok(Object.keys(S.startingSkills('mage')).length > 0 && S.startingSkills('zzz') && S.startingSkills('zzz').onehand === 1, 'startingSkills fallback');
  const m = makeActor(st, { kind: 'monster', type: 'skeleton' }); S.grantXp(st, m, 30); ok(m.xp === 30, 'monsters can gain xp too');
}

console.log(fails ? '\n' + fails + ' FAILURES' : '\nALL OK');
process.exit(fails ? 1 : 0);
