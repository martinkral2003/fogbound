// node tools/v4-towns-test.js : TOWNS lane (src/towns.js): populations, safe zones, shop buy/sell, town states (v5: no trainer, board or quests). Exits non-zero on failure.
import { createGame, step, damage, simApi } from '../src/sim.js';
import { SIM_DT, TOWN, MONSTERS } from '../src/data.js';
import * as T from '../src/towns.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const blank = () => ({ mx: 0, mz: 0, aimX: 0, aimZ: 0, atk: false, casts: [], charge: false, tele: false, repair: false, cmds: [] });
function run(st, secs, perStep) {
  for (let i = 0; i < secs / SIM_DT; i++) {
    const inputs = st.teams.map(() => blank());
    if (perStep) perStep(inputs, i);
    step(st, SIM_DT, inputs);
    st.events.length = 0;
  }
}
const cmd = (st, c, team = 0) => { const inputs = st.teams.map(() => blank()); inputs[team].cmds.push(c); step(st, SIM_DT, inputs); st.events.length = 0; };
const place = (st, team, x, z) => { const h = st.teams[team].hero; h.x = h.ox = x; h.z = h.oz = z; h.dest = null; h.hp = h.maxHp; };
const evs = (st, fn) => { const all = []; const orig = st.events.length; fn(); return all; };
const inputsWith = (st, team, c) => { const inputs = st.teams.map(() => blank()); inputs[team].cmds.push(c); return inputs; };
function stepCollect(st, inputs) { step(st, SIM_DT, inputs); const out = st.events.slice(); st.events.length = 0; return out; }

const st = createGame({ seed: 5, humans: [0] });
const team = st.teams[0], hero = team.hero;
ok(Array.isArray(st.towns) && st.towns.length >= 3, 'st.towns built (' + (st.towns && st.towns.length) + ')');
ok(st.towns.every((t) => t.state === 'safe' && t.services && t.stock.length > 0 && t.npcs.length > 0 && t.lay && t.safeR >= TOWN.safeMin), 'every town has services, stock, npcs, layout');
const start = T.startTownOf(st), capital = T.capitalOf(st), village = st.towns.find((t) => t.kind === 'village') || start;
ok(start && start.start, 'a start village exists: ' + (start && start.name));
ok(capital && capital.kind === 'capital' && capital.stock.length > village.stock.length, 'capital has the bigger shop');
ok(st.towns.every((t) => !t.npcs.some((n) => n.role === 'board' || n.role === 'trainer')), 'v5: no board or trainer NPCs');
ok(start.npcs.some((n) => n.role === 'merchant'), 'start village has a merchant');
ok(JSON.stringify(st.towns).length > 1000, 'towns are JSON-able');
ok(!team.tut && (!team.quests || team.quests.active.length === 0), 'v5: no tutorial quest chain');
ok(st.teams[4] && st.teams[4].id === 4, 'team 4 exists');

// ---- guard spawning (lazy: only when a hero comes close)
const far = st.towns.find((t) => t !== start && Math.hypot(t.x - hero.x, t.z - hero.z) > T.townById(st, start.id).r + TOWN.activate + 60);
if (far) ok(!far.active && far.guards.length === 0, 'far town has no guards yet');
place(st, 0, start.x + start.safeR * 0.5, start.z);
run(st, 1);
const K = TOWN.kinds[start.kind];
ok(start.active && start.guards.length === K.guards + K.archers + K.captains, `start town spawned ${start.guards.length} guards`);
const g0 = st.byId.get(start.guards[0]);
ok(g0 && g0.team === 4 && g0.guard && g0.town === start.id && g0.alive, 'guards are team-4 sim units flagged guard/town');
ok(T.townDefenders(st, start.id).length === start.guards.length, 'townDefenders lists them');
for (const t of st.towns) if (t.kind === 'capital') { place(st, 0, t.x + 2, t.z); run(st, 1); const kk = TOWN.kinds.capital; ok(t.guards.length === kk.guards + kk.archers + kk.captains && kk.guards >= 10, `capital garrison ${t.guards.length} (10 guards + captains)`); place(st, 0, start.x, start.z); }
// patrols move
{ const g = st.byId.get(start.guards[0]); const x0 = g.x, z0 = g.z; run(st, 40); ok(Math.hypot(g.x - x0, g.z - z0) > 1 || start.guards.some((id) => { const e = st.byId.get(id); return Math.hypot(e.x - e.ox, e.z - e.oz) > 0; }), 'guards patrol'); }

// ---- safe zone
ok(T.isSafeZone(st, start.x, start.z) && !T.isSafeZone(st, start.x + 500, start.z), 'isSafeZone');
ok(T.townAt(st, start.x + 1, start.z) === start, 'townAt');
const mon = simApi.spawnMonster(st, 'wolf', 2, start.x + start.safeR + 20, start.z, st.camps[0]);
place(st, 0, start.x + 4, start.z);
const hp0 = hero.hp;
damage(st, mon, hero, 50);
ok(hero.hp === hp0, 'monsters cannot hurt a hero inside a standing town');
const ally = st.teams[1].hero; place(st, 1, start.x + 6, start.z);
damage(st, hero, ally, 50);
ok(ally.hp === ally.maxHp, 'allied heroes never hurt each other (hostile() is false)');
damage(st, hero, g0, 40);
ok(g0.hp === g0.maxHp, 'a hero cannot hurt the town guard');
mon.x = mon.ox = start.x + 5; mon.z = mon.oz = start.z; mon.home = { x: start.x + start.safeR + 30, z: start.z };
run(st, 0.6);
ok(Math.hypot(mon.x - start.x, mon.z - start.z) >= start.safeR - 0.5, 'a monster inside the safe radius is shoved out');
damage(st, mon, hero, 50, {});
ok(hero.hp === hp0 || hero.hp === hero.maxHp, 'still safe');
place(st, 0, start.x + start.safeR + 8, start.z);
damage(st, mon, hero, 30);
ok(hero.hp < hero.maxHp, 'hero outside the town takes damage');
simApi.kill(st, mon, null); st.events.length = 0;

// ---- NPC interaction
const merch = start.npcs.find((n) => n.role === 'merchant');
place(st, 0, merch.x + 1.5, merch.z);
run(st, 0.5);
ok(team.townNear && team.townNear.role === 'merchant' && team.townNear.town === start.id, 'townNear = merchant in reach');
place(st, 0, start.x + 30, start.z + 30);
run(st, 0.5);
ok(!team.townNear || team.townNear.npc !== merch.id, 'townNear cleared when away');

// ---- shop: buy / sell
place(st, 0, merch.x + 1.5, merch.z);
team.gold = 1000; team.bag.length = 0; team.pots = { heal: 0, surge: 0 };
const idxPotion = start.stock.findIndex((e) => e.item.kind === 'potion'), idxGear = start.stock.findIndex((e) => e.item.slot);
const price = T.buyPrice(start, start.stock[idxPotion]), q0 = start.stock[idxPotion].qty;
cmd(st, { t: 'buy', town: start.id, idx: idxPotion });
ok(team.gold === 1000 - price && team.pots.heal === 1 && start.stock[idxPotion].qty === q0 - 1, 'buy a potion: gold, team.pots, stock');
cmd(st, { t: 'buy', town: start.id, idx: idxPotion });
ok(team.pots.heal === 2, 'potions stack in team.pots');
const gprice = T.buyPrice(start, start.stock[idxGear]);
cmd(st, { t: 'buy', town: start.id, idx: idxGear });
ok(team.bag.length === 1 && team.bag[0].slot && team.bag[0].uid && start.stock[idxGear].qty === 0, 'buy gear: goes to the bag with a uid, sold out');
const gold1 = team.gold;
cmd(st, { t: 'buy', town: start.id, idx: idxGear });
ok(team.gold === gold1, 'sold-out item cannot be bought again');
team.gold = 1;
cmd(st, { t: 'buy', town: start.id, idx: 0 });
ok(team.gold === 1, 'cannot buy without gold');
team.gold = 100;
const item = team.bag[0], val = Math.max(1, Math.round(T.itemValue(item) * TOWN.sellMul));
cmd(st, { t: 'sell', item: item.uid });
ok(team.gold === 100 + val && team.bag.length === 0, `sell gear at 40% (+${val})`);
ok(val <= Math.round(T.itemValue(item) * 0.41), 'sell price is 40% of value');
place(st, 0, start.x + 300, start.z + 300);
const gold2 = (team.gold = 500);
cmd(st, { t: 'buy', town: start.id, idx: 0 });
ok(team.gold === gold2, 'cannot buy from far away');
// full bag
place(st, 0, merch.x + 1.5, merch.z);
team.bag.length = 0; for (let i = 0; i < 24; i++) team.bag.push({ uid: 9000 + i, slot: 'weapon', tier: 1, rarity: 0, affixes: [], name: 'junk', score: 1 });
team.gold = 1000;
cmd(st, { t: 'buy', town: start.id, idx: start.stock.findIndex((e) => e.item.slot && e.qty > 0 && e !== start.stock[idxGear]) });
ok(team.gold === 1000, 'full pack: buy refused, gold kept');
team.bag.length = 0;
// discount from saved towns
start.disc = 0.2;
ok(T.buyPrice(start, { price: 100 }) === 80, 'merchant discount applies'); start.disc = 0;

// ---- town states
{
  const s3 = createGame({ seed: 7, humans: [0] }), me = s3.teams[0], town = T.townList(s3).find((t) => t.kind === 'town') || T.townList(s3)[1];
  place(s3, 0, town.x + 3, town.z); run(s3, 1);
  const n0 = town.guards.length;
  ok(n0 > 0, 'town garrison present: ' + n0);
  const ws = s3.waystones.find((w) => w.id === town.wsId);
  ok(T.setTownState(s3, town.id, 'besieged') && town.state === 'besieged', 'setTownState besieged');
  ok(!T.isSafeZone(s3, town.x, town.z), 'no safe zone while besieged');
  const ev0 = []; // townAttacked was emitted
  const m3 = simApi.spawnMonster(s3, 'orcRaider', 2, town.x + 4, town.z, s3.camps[0]); m3.assault = true;
  const hpB = me.hero.hp; damage(s3, m3, me.hero, 30); ok(me.hero.hp < hpB, 'monsters can hurt inside a besieged town');
  me.hero.hp = me.hero.maxHp;
  const def0 = town.def;
  T.damageTown(s3, town.id, town.maxHp * 0.5, m3);
  ok(town.def < def0 && town.state === 'besieged', 'damageTown lowers def (' + town.def.toFixed(2) + ')');
  // saved: hero helps for a while, then the assault ends
  run(s3, 10);
  const goldS = me.gold;
  T.setTownState(s3, town.id, 'safe');
  ok(town.state === 'safe' && town.saved === 1 && town.disc > 0, 'saved: state safe, counter 1, merchant discount');
  ok(me.gold >= goldS + TOWN.save.gold[town.kind], 'helpers are paid (+' + (me.gold - goldS) + ')');
  ok(T.isSafeZone(s3, town.x, town.z), 'safe zone returns');
  // fall
  simApi.kill(s3, m3, null);
  T.setTownState(s3, town.id, 'besieged');
  for (const id of town.guards.slice()) { const e = s3.byId.get(id); e.hp = 0; simApi.kill(s3, e, null); }
  run(s3, 0.6);
  T.damageTown(s3, town.id, 1e9, null);
  ok(town.state === 'fallen' && !town.services.shop && town.stock.length === 0 && town.guards.length === 0, 'walls down + no guards = fallen, services lost');
  ok(town.npcs.every((n) => !n.alive), 'NPCs gone');
  ok(ws && ws.down === true && !T.isWaystoneUsable(s3, town.wsId), 'waystone unusable');
  ok(s3.ents.filter((e) => e.town === town.id && e.alive).length === 0, 'no guard entities left');
  place(s3, 0, town.x + 2, town.z); run(s3, 1);
  ok(!me.townNear, 'no NPC to talk to in a fallen town');
  const g1 = me.gold; cmdBuyFallen();
  function cmdBuyFallen() { const inputs = s3.teams.map(() => blank()); inputs[0].cmds.push({ t: 'buy', town: town.id, idx: 0 }); step(s3, SIM_DT, inputs); }
  ok(me.gold === g1, 'cannot buy in a fallen town');
  ok(!T.isSafeZone(s3, town.x, town.z), 'a fallen town is no safe zone');
  T.setTownState(s3, town.id, 'safe');
  ok(town.state === 'safe' && town.services.shop && town.stock.length > 0 && town.npcs.every((n) => n.alive) && town.reclaimed === 1, 'reclaimed: services back');
  ok(ws.down === false, 'waystone usable again');
  // capital siege uses the same API
  const cap = T.capitalOf(s3); T.setTownState(s3, cap.id, 'siege'); ok(cap.state === 'besieged', "'siege' aliases besieged");
}

// ---- long run: no exceptions, restock, guards respawn
{
  const s4 = createGame({ seed: 11, humans: [0] }), town = T.startTownOf(s4);
  place(s4, 0, town.x + 3, town.z); run(s4, 1);
  const victim = s4.byId.get(town.guards[0]); victim.hp = 0; simApi.kill(s4, victim, null);
  const n = town.guards.length;
  const stock0 = JSON.stringify(town.stock);
  run(s4, TOWN.guardRespawn + 20);
  ok(aliveCount(s4, town) === town.maxGuards, 'a dead guard is replaced after ' + TOWN.guardRespawn + ' s (' + aliveCount(s4, town) + '/' + town.maxGuards + ')');
  run(s4, TOWN.restockT + 5);
  ok(JSON.stringify(town.stock) !== stock0, 'shop restocks');
  function aliveCount(s, t) { return t.guards.filter((id) => s.byId.get(id) && s.byId.get(id).alive).length; }
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
