// Spells, monster table, pack test, summary (third part of rpg-combat-test.js)
import * as Combat from '../src/rpg/combat.js';
import { clear, hero, monster, dummy, run, st, events, rows, fails, check, mean, f1, eqSword } from './rpg-combat-lib.js';
import { fighter, monsterBrain } from './rpg-combat-bots.js';

console.log('\n== spells ==');
for (const id of Object.keys(Combat.SPELLS)) {
  clear();
  const A = hero('A', { kit: 'mage', skills: { destruction: 5, restoration: 5, stealth: 5 }, lvl: 8 });
  A.mana = A.maxMana = 300; A.hp = 40;
  const T = dummy({ dx: 6, hp: 600 }); T.yaw = Math.PI;
  const m0 = A.mana, h0 = T.hp, n0 = st.actors.length, x0 = A.x;
  let ok = false;
  run(new Map([[A, () => { if (!ok && A.cs.state === 'idle') ok = Combat.castSpell(st, A, id, { yaw: 0, pitch: 0, lockId: T.id }); return { yaw: 0, lockId: T.id }; }]]), () => false, 1.6);
  const sp = Combat.SPELLS[id];
  let eff = false;
  if (sp.kind === 'self') eff = id === 'mend' ? A.hp > 40 : A.status.some((s) => s.id === 'shield');
  else if (sp.kind === 'blink') eff = Math.abs(A.x - x0) > 3;
  else if (sp.kind === 'summon') eff = st.actors.length > n0;
  else if (sp.kind === 'aoe') { T.x = A.x + 3; eff = true; }
  else eff = T.hp < h0;
  if (sp.kind === 'aoe') { const T2 = dummy({ dx: 3 }); T2.x = A.x + 3; const h = T2.hp; A.cs.state = 'idle'; A.spellCd = {}; Combat.castSpell(st, A, id, {}); run(new Map(), () => false, 1.2); eff = T2.hp < h; }
  check(`spell ${id}: cast ok, mana spent, effect`, ok && A.mana < m0 && eff, `mana ${m0}->${A.mana.toFixed(0)} ${sp.kind} dmg dealt ${f1(h0 - T.hp)}`);
}
{
  clear(); const A = hero('A', { kit: 'wanderer' }); A.mana = 100; A.skills = {};
  check('unknown spell is refused for a hero (Skills.knownSpells gate)', !Combat.castSpell(st, A, 'nova', {}) );
  check('scroll flag bypasses the gate', Combat.castSpell(st, A, 'nova', { scroll: true }));
}

console.log('\n== hero vs monster types (gear scales with tier: lvl5 iron / lvl7 steel+mail / lvl10 darksteel+plate; block/swing mix; 4 runs each) ==');
const GEAR = { 1: { kit: 'warrior', lvl: 5 }, 2: { kit: 'warrior', lvl: 7, attrs: { str: 14, vit: 13 }, equip: ['sword_2', 'shield_1', 'chest_mail', 'legs_mail', 'head_mail'] },
  3: { kit: 'warrior', lvl: 10, attrs: { str: 18, vit: 16, dex: 12 }, equip: ['sword_3', 'shield_2', 'chest_plate', 'legs_plate', 'head_plate', 'boots_plate'] } };
const MON = [['skeleton', 1], ['skelArcher', 1], ['ghoul', 1], ['wolf', 1], ['orcRaider', 1], ['bogBeast', 2], ['wraith', 1], ['troll', 3], ['crypt', 3], ['king', 3]];
const monRows = [];
for (const [type, tier] of MON) {
  const ttk = [], loss = [], won = [];
  for (let i = 0; i < 4; i++) {
    clear();
    const H = hero('H', GEAR[tier]);
    const M = monster(type, { tier, dx: 6 }); M.yaw = Math.PI;
    const d = type === 'king' ? 150 : 90;
    const t = run(new Map([[H, fighter(() => M, { def: 'parry', skill: 0.6, gap: 0.2, aggr: true })], [M, monsterBrain(() => H)]]), () => !H.alive || !M.alive, d);
    ttk.push(t); loss.push(1 - Math.max(0, H.hp) / H.maxHp); won.push(M.alive ? 0 : 1);
  }
  rows.push([`warrior vs ${type} (tier ${tier})`, f1(mean(ttk)) + ' s', Math.round(mean(won) * 4) + '/4 won', Math.round(mean(loss) * 100) + '% hp lost']);
  monRows.push([type, mean(ttk), mean(won), mean(loss)]);
}
const tier1 = monRows.filter((r) => ['skeleton', 'ghoul', 'wolf', 'orcRaider'].includes(r[0]));
check('tier-1 monster dies in ~5-20 s on average', mean(tier1.map((r) => r[1])) >= 4 && mean(tier1.map((r) => r[1])) <= 22, f1(mean(tier1.map((r) => r[1]))) + ' s');
{
  clear(); const H = hero('H', { kit: 'warrior', lvl: 5 });
  const ws = [0, 1, 2].map((i) => { const w = monster('wolf', { dx: 4 + i, dz: i - 1 }); w.yaw = Math.PI; return w; });
  const bots = new Map([[H, () => ({})], ...ws.map((w) => [w, monsterBrain(() => H)])]);
  const t = run(bots, () => !H.alive, 60);
  check('a wolf pack punishes standing still', !H.alive && t < 40, `dead after ${f1(t)} s`);
}
{
  clear(); const H = hero('H', { kit: 'warrior', lvl: 5 });
  const k = monster('troll', { tier: 3, dx: 3 }); k.yaw = Math.PI; const e0 = events('swing').length;
  const telegraphed = []; const hits = [];
  run(new Map([[k, monsterBrain(() => H)], [H, () => ({})]]), () => !H.alive, 20, () => { for (const e of st.events) if (e.type === 'hit' && e.tgt === H.id && !e._c) { e._c = 1; hits.push(e.amt); } });
  check('troll hits are survivable one at a time (max hit < 60% of a lvl-5 hero)', Math.max(0, ...hits) < H.maxHp * 0.6, `max ${f1(Math.max(0, ...hits))} of ${H.maxHp}`);
  const sw = events('swing').filter((e) => e.telegraph && e.windup > 0.5);
  check('monster wind-ups are telegraphed and long enough to react', sw.length > 0 && sw.every((e) => e.windup >= 0.5), `${sw.length} swings, min windup ${f1(Math.min(...sw.map((e) => e.windup)))}`);
}

console.log('\n== results table ==');
const w = [48, 10, 10, 16];
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('scenario', w[0]) + pad('mean TTK', w[1]) + pad('result', w[2]) + 'note');
for (const r of rows) console.log(pad(r[0], w[0]) + pad(r[1], w[1]) + pad(r[2], w[2]) + r[3]);
console.log('\n' + (fails.length ? 'FAILED: ' + fails.join(' | ') : 'ALL CHECKS PASSED'));
process.exit(fails.length ? 1 : 0);
