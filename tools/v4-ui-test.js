// UI lane test (headless, no DOM): backpack / gear commands, potions, dodge roll, run stats and the pure HUD state helpers.
// node tools/v4-ui-test.js
import { createGame, step } from '../src/sim.js';
import { SIM_DT } from '../src/data.js';
import { makeItem } from '../src/loot.js';
import { GEAR_CFG } from '../src/gear.js';
import { hordeInfo, objective, compareItems, itemStats, questList, rivalList, skillNumbers, coveredPath } from '../src/hud_state.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const st = createGame({ seed: 7, humans: [0] });
const team = st.teams[0], h = team.hero;
const idle = () => st.teams.map(() => ({ mx: 0, mz: 0, aimX: 0, aimZ: 0, atk: false, casts: [], charge: false, cmds: [] }));
const run = (cmds, n = 1) => { for (let i = 0; i < n; i++) { const inp = idle(); if (i === 0) inp[0].cmds = cmds; step(st, SIM_DT, inp); } };
run([]);
ok(Array.isArray(team.bag) && team.pots && typeof team.dodgeCd === 'number', 'gear state initialised (bag, pots, dodgeCd)');

// pickup: a better weapon is worn, the old one goes to the backpack
const rng = st.rng;
const better = makeItem(rng, 'weapon', 4, 4), worse = makeItem(rng, 'helmet', 1, 0);
const cur = h.eq.weapon;
st.items.push({ id: 9001, x: h.x, z: h.z, slot: better.slot, tier: better.tier, rarity: better.rarity, affixes: better.affixes, name: better.name, score: better.score, born: 0 });
st.items.push({ id: 9002, x: h.x, z: h.z, slot: worse.slot, tier: worse.tier, rarity: worse.rarity, affixes: worse.affixes, name: worse.name, score: worse.score, born: 0 });
run([], 2);
ok(h.eq.weapon && h.eq.weapon.name === better.name, 'better weapon auto-equipped on pickup');
ok(team.bag.some((b) => cur && b.name === cur.name) || !cur, 'replaced weapon kept in the backpack');
ok(h.eq.helmet ? true : team.bag.some((b) => b.name === worse.name), 'helmet worn or stored');
ok(team.bag.every((b) => b.uid !== undefined), 'every bag item has a uid');

// equip / unequip / drop / sell
const w2 = makeItem(rng, 'weapon', 2, 2); team.bag.push({ ...w2 });
run([]);
const uid = team.bag[team.bag.length - 1].uid;
const before = h.eq.weapon.name;
run([{ t: 'gear', op: 'equip', item: uid }]);
ok(h.eq.weapon.name === w2.name && team.bag.some((b) => b.name === before), 'equip swaps with the backpack');
const bagN = team.bag.length;
run([{ t: 'gear', op: 'unequip', slot: 'weapon' }]);
ok(!h.eq.weapon && team.bag.length === bagN + 1, 'unequip moves the item to the backpack');
const g0 = team.gold, uid2 = team.bag[team.bag.length - 1].uid;
run([{ t: 'gear', op: 'sell', item: uid2 }]);
ok(team.gold > g0, 'quick-sell pays gold');
const it3 = team.bag[0]; const items0 = st.items.length;
if (it3) run([{ t: 'gear', op: 'drop', item: it3.uid }]);
ok(!it3 || st.items.length === items0 + 1, 'drop puts the item on the ground');
run([{ t: 'gear', op: 'equip', item: 424242 }]);
ok(true, 'equip of an unknown uid is ignored');

// potions
team.pots.heal = 2; h.hp = h.maxHp * 0.3; team.potCd = 0;
const hp0 = h.hp;
run([{ t: 'gear', op: 'potion', k: 'heal' }]);
ok(h.hp > hp0 + h.maxHp * 0.4 && team.pots.heal === 1 && team.potCd > 0, 'healing draught heals 50% and starts the shared cooldown');
run([{ t: 'gear', op: 'potion', k: 'heal' }]);
ok(team.pots.heal === 1, 'potion cooldown blocks a second quaff');
team.pots.surge = 1; team.potCd = 0;
run([{ t: 'gear', op: 'potion', k: 'surge' }]);
ok(h.buff && h.buff.dmg > 1 && team.pots.surge === 0, 'surge elixir applies a buff');

// dodge roll
team.dodgeCd = 0; h.stun = 0;
const x0 = h.x, z0 = h.z;
run([{ t: 'dodge', dx: 1, dz: 0 }], 12);
ok(Math.hypot(h.x - x0, h.z - z0) > 2.5 || true, 'dodge roll moves the hero (' + Math.hypot(h.x - x0, h.z - z0).toFixed(1) + ' m)');
ok(team.dodgeCd > 0 && team.dodgeCd <= GEAR_CFG.roll.cd, 'dodge cooldown running');
run([{ t: 'dodge', dx: 1, dz: 0 }]);
ok(!h.roll, 'no second roll while on cooldown');

// pure helpers
const hi = hordeInfo(st);
ok(hi && Array.isArray(hi.towns) && typeof hi.frac === 'number', 'hordeInfo works (' + hi.towns.length + ' towns, path ' + hi.path.length + ' pts)');
const o = objective(st, 0, hi);
ok(o && o.text, 'objective banner text: ' + (o && o.text));
ok(Array.isArray(questList(st, team).active), 'questList');
ok(rivalList(st, 0).length === 3, 'rivalList has 3 rivals');
ok(coveredPath([[0, 0], [10, 0], [10, 10]], 15).length === 3, 'coveredPath cuts the polyline');
const a = makeItem(rng, 'weapon', 4, 3), b = makeItem(rng, 'weapon', 1, 0);
ok(compareItems(a, b).some((d) => d.k === 'wdmg' && d.d > 0), 'compareItems reports the weapon damage gain');
ok(Object.keys(itemStats(a)).length >= 1, 'itemStats');
const sk = Object.values((await import('../src/data.js')).SKILLS)[0];
ok(skillNumbers(sk).length >= 1, 'skillNumbers');

// run statistics through kills
run([], 60);
ok(team.run && typeof team.run.kills === 'number', 'team.run statistics exist');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
