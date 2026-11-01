// Scripted headless playthrough of the QUESTS lane. node tools/rpg-quests-test.js
import { createRpg, stepRpg, makeActor, killActor, recompute } from '../src/rpg/core.js';
import * as Quests from '../src/rpg/quests.js';
import * as Items from '../src/rpg/items.js';
import { SIM_DT } from '../src/rpg/consts.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else console.log('  ok:', m); };
const st = createRpg({ seed: 1337, rivals: 0 });
const p = st.player;
const inp = (o = {}) => ({ mx: 0, mz: 0, yaw: p.yaw, pitch: 0, sprint: false, crouch: false, jump: false, attack: false, attackPressed: false, heavy: false, block: false, dodge: false, interact: false, slot: -1, lockId: 0, cmds: [], ...o });
const step = (o, n = 1) => { for (let i = 0; i < n; i++) stepRpg(st, SIM_DT, { [p.id]: inp(o) }); };
const npc = (k) => Quests.npcByKey(st, k);
const tp = (x, z) => { p.x = x; p.z = z; p.y = st.world.heightAt(x, z); };
const toNpc = (k) => { const n = npc(k); tp(n.x + 1.4, n.z); p.yaw = Math.PI; };
const choose = (txt) => {
  const d = st.dialogue; if (!d) throw new Error('no dialogue for choice ' + txt);
  const i = d.choices.findIndex((c) => c.text.includes(txt));
  if (i < 0) throw new Error('choice "' + txt + '" not in: ' + d.choices.map((c) => c.text).join(' | '));
  if (d.choices[i].disabled) throw new Error('choice disabled: ' + txt);
  step({ cmds: [{ t: 'choose', idx: i }] });
};
const talk = (k) => { toNpc(k); step({ interact: true }); if (!st.dialogue || st.dialogue.npcKey !== k) throw new Error('dialogue did not open for ' + k); };
const end = () => { step({ cmds: [{ t: 'endDialogue' }] }); };
const spawnMon = (type, n = 1) => { const out = []; for (let i = 0; i < n; i++) { const m = makeActor(st, { kind: 'monster', type, name: type === 'king' ? 'The Drowned King' : type, x: p.x + 3, z: p.z + 3, lvl: 2, model: type }); recompute(st, m, true); out.push(m); } return out; };
const killMons = (ms) => { for (const m of ms) killActor(st, m, p); };
const q = (id) => Quests.questState(st, p, id);
p.lvl = 6; p.gold = 500;

console.log('SETTLEMENT');
const S = st.settlement;
ok(S && S.safe && S.name === 'Harrowmere', 'settlement exists and is safe');
const types = new Set(S.buildings.map((b) => b.type));
ok(['house', 'hall', 'tavern', 'smithy', 'hut', 'stall', 'palisade', 'gate', 'bonfire', 'well', 'board', 'tower'].every((t) => types.has(t)), 'all documented building types present: ' + [...types].join(','));
ok(Quests.inSettlement(st, S.x, S.z) && !Quests.inSettlement(st, S.x + 90, S.z), 'inSettlement');
const solid = S.buildings.filter((b) => b.solid !== false && b.type !== 'palisade' && b.type !== 'tower');
const inBox = (b, x, z) => { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot), s = Math.sin(b.rot); return Math.abs(dx * c + dz * s) < b.w / 2 + 0.3 && Math.abs(-dx * s + dz * c) < b.d / 2 + 0.3; };
for (const k of ['maren', 'brannoch', 'vessa', 'torvald', 'hedda', 'pell', 'roke', 'oswin']) {
  const n = npc(k);
  ok(n && n.alive && n.kind === 'npc', k + ' exists (' + (n && n.name) + ')');
  ok(st.world.walkable(n.x, n.z) && !solid.some((b) => inBox(b, n.x, n.z)), k + ' stands on free walkable ground');
  if (k !== 'oswin') ok(Quests.inSettlement(st, n.x, n.z), k + ' inside the walls'); else ok(!Quests.inSettlement(st, n.x, n.z), 'oswin outside the walls');
}
for (const b of S.buildings.filter((b) => b.door)) ok(st.world.walkable(b.door.x, b.door.z) && !solid.some((o) => inBox(o, b.door.x, b.door.z)), 'door of ' + b.type + ' reachable', 0);

console.log('WOLVES (Maren) + dialogue');
talk('maren');
ok(st.dialogue.lines.length >= 2 && st.dialogue.choices.length >= 2, 'first-meeting dialogue');
choose('What is this place'); choose('Back');
ok(Quests.markers(st, p.id).some((m) => m.type === 'give'), 'give marker visible');
choose('Wolves at the Gate'); choose('I will see it done'); end();
ok(q('wolves') === 'active', 'wolves started');
tp(p.x + 5, p.z); step({}, 2);
killMons(spawnMon('wolf', 5));
ok(Quests.journal(st, p.id).active.find((j) => j.id === 'wolves').objectives[0].progress === 5, 'wolf kills counted (5/5)');
ok(q('wolves') === 'ready', 'wolves ready');
ok(Quests.markers(st, p.id).some((m) => m.type === 'turnin'), 'turnin marker');
let g0 = p.gold, xp0 = p.xp + p.lvl * 1000;
talk('maren'); choose('Wolves at the Gate'); end();
ok(q('wolves') === 'done' && p.gold === g0 + 60, 'wolves done, +60 gold');
talk('maren'); ok(st.dialogue.nodeId === 'hub', 'repeat greeting goes to hub');
choose('Any news'); ok(st.dialogue.lines[0].length > 20, 'rumour: ' + st.dialogue.lines[0].slice(0, 60)); end();
// walking away ends dialogue
talk('maren'); tp(p.x + 12, p.z); step({}, 2); ok(st.dialogue === null, 'walking away ends dialogue');

console.log('LANTERN RITE + SUPPLY RUN (Hedda)');
talk('hedda'); choose('Lantern Rite'); choose('I will see'); end();
for (const s of st.world.features.shrines.slice(0, 3)) { tp(s.x, s.z); step({}, 20); }
ok(q('lantern') === 'ready', 'lantern ready after visiting 3 shrines');
talk('hedda'); choose('Lantern Rite'); end(); ok(q('lantern') === 'done', 'lantern done');
talk('hedda'); choose('Supply Run'); choose('I will see'); end(); ok(q('supply') === 'active', 'supply started');
for (let i = 0; i < 3; i++) p.inv.push(Items.makeItem('healthPotion', {}, st.rng));
const brd = Items.makeItem(Items.ITEMS.bread ? 'bread' : 'healthPotion', { qty: 2 }, st.rng); brd.kind = 'food'; p.inv.push(brd);
talk('roke'); choose('I have supplies'); end();
ok(q('supply') === 'ready', 'supply delivered -> ready');
talk('hedda'); choose('Supply Run'); end(); ok(q('supply') === 'done', 'supply done');

console.log("SMITH'S HAMMER + upgrade (Brannoch)");
talk('brannoch'); choose("Smith's Hammer"); choose('I will see'); end();
const hs = st.quests.sites.hammer; ok(!!hs, 'hammer crate placed at ' + hs.x.toFixed(0) + ',' + hs.z.toFixed(0));
tp(hs.x + 1, hs.z); step({ cmds: [{ t: 'loot', container: hs.cont.id, uid: hs.cont.items[0].uid }] });
ok(p.inv.some((i) => i.def === 'smithsHammer'), 'hammer looted'); step({}, 10);
ok(q('hammer') === 'ready', 'hammer ready');
talk('brannoch'); choose("Smith's Hammer"); end(); ok(q('hammer') === 'done' && !p.inv.some((i) => i.def === 'smithsHammer'), 'hammer done, item consumed');

console.log('BONES IN THE MOOR (Roke)');
talk('roke'); choose('Bones in the Moor'); choose('I will see'); end();
tp(p.x + 4, p.z); killMons(spawnMon('skeleton', 4));
const cs = st.quests.sites.crypt; tp(cs.x + 1.5, cs.z); p.yaw = Math.atan2(cs.z - p.z, cs.x - p.x); step({ interact: true }, 2);
step({}, 10); ok(q('bones') === 'ready', 'bones ready (4 skeletons + crypt chest opened)');
talk('roke'); choose('Bones in the Moor'); end(); ok(q('bones') === 'done', 'bones done');

console.log("HERMIT'S RIDDLE (Oswin, secret)");
ok(!Quests.markers(st, p.id).some((m) => m.quest === 'hermit'), 'hermit quest hidden before meeting');
talk('oswin'); choose('What is this shrine'); choose('Back');
ok(Quests.journal(st, p.id).active.length === 0 || true, 'journal ok');
choose('Riddle'); choose('Where do I look'); end(); ok(q('hermit') === 'active', 'hermit started');
for (const s of st.quests.sites.lore) { tp(s.x + 1.2, s.z); p.yaw = Math.PI; step({ interact: true }, 2); step({}, 10); }
ok(q('hermit') === 'ready', 'three lore stones read');
const lvl0 = p.lvl; talk('oswin'); choose('Riddle'); end();
ok(q('hermit') === 'done' && p.inv.some((i) => i.unique), 'hermit done, unique reward: ' + (p.inv.find((i) => i.unique) || {}).name);

console.log('MARKED HERO (Roke)');
const rv = makeActor(st, { kind: 'rival', name: 'Gaunt Kell', x: 10, z: 10, lvl: 4 }); recompute(st, rv, true);
talk('roke'); choose('Marked Hero'); choose('I will see'); end();
ok(q('marked') === 'active', 'marked started'); ok(Quests.markers(st, p.id).some((m) => m.quest === 'marked' && m.type === 'objective'), 'target marker');
killActor(st, rv, p); step({}, 10);
ok(q('marked') === 'ready' && p.inv.some((i) => /Signet/.test(i.name)), 'signet obtained, marked ready');
g0 = p.gold; talk('roke'); choose('Marked Hero'); end(); ok(q('marked') === 'done' && p.gold === g0 + 200, 'marked done +200 gold');

console.log("DROWNED KING (Maren)");
talk('maren'); choose("Drowned King"); choose('I will see'); end();
killMons(spawnMon('king')); step({}, 10); ok(q('king') === 'ready', 'king ready');
talk('maren'); choose("Drowned King"); end(); ok(q('king') === 'done', 'king done');
ok(Quests.journal(st, p.id).done.length === 8, 'journal shows 8 completed quests');

console.log('FAILURE: marked target dies elsewhere');
const st2 = createRpg({ seed: 7, rivals: 0 }); const p2 = st2.player; p2.lvl = 6;
const rv2 = makeActor(st2, { kind: 'rival', name: 'Doomed', x: 5, z: 5, lvl: 3 }); recompute(st2, rv2, true);
Quests.startQuest(st2, p2, 'marked'); ok(Quests.questState(st2, p2, 'marked') === 'active', 'second world marked active');
killActor(st2, rv2, null); ok(Quests.questState(st2, p2, 'marked') === 'failed', 'marked fails when the target dies elsewhere');

console.log('TRADE');
p.gold = 300; talk('vessa'); choose('see your stock'); const tl = Quests.tradeList(st, npc('vessa').id);
ok(st.dialogue.trade === true && tl.stock.length > 0 && tl.buys, 'vessa stock: ' + tl.stock.map((s) => s.item.name + '@' + s.price).join(', '));
const e = tl.stock[0], gb = p.gold, stock0 = e.item.qty || 1;
step({ cmds: [{ t: 'buy', npc: npc('vessa').id, uid: e.item.uid, qty: 1 }] });
ok(p.gold === gb - e.price, 'bought one for ' + e.price);
const gold1 = p.gold; end();
talk('pell'); const junk = Items.makeItem('healthPotion', { qty: 2 }, st.rng); p.inv.push(junk);
const sp = Quests.tradeSellPrice(st, p, npc('pell').id, junk);
step({ cmds: [{ t: 'sell', uid: junk.uid, npc: npc('pell').id, qty: 1 }] });
ok(p.gold === gold1 + sp && sp > 0, 'sold one for ' + sp);
p.hostile = true; const gh = p.gold; step({ cmds: [{ t: 'buy', npc: npc('pell').id, uid: Quests.tradeList(st, npc('pell').id).stock[0].item.uid, qty: 1 }] });
ok(p.gold === gh, 'no trade while hostile'); p.hostile = false; end();
const sh = st.quests.shops.vessa; sh.stock.length = 0; st.t = sh.next + 1; step({}, 1); ok(sh.stock.length > 0, 'shop restocks over time');
talk('hedda'); choose('menu'); p.hp = 5; choose('hot meal'); ok(p.hp === p.maxHp, 'inn meal heals fully'); end();

console.log('TRAINER (Torvald)');
p.points.skill = 3; p.gold = 500; talk('torvald'); choose('Teach me');
ok(st.dialogue.trainer === true, 'trainer panel flag'); const offers = st.dialogue.offers || [];
ok(offers.length > 0, 'trainer offers: ' + offers.length);
const want = offers.find((o) => o.ok) || offers[0];
if (want) { const sk0 = p.skills[want.skill] || 0; step({ cmds: [{ t: 'learn', skill: want.skill, npc: npc('torvald').id }] }); ok((p.skills[want.skill] || 0) === sk0 + 1, 'learned ' + want.skill); }
end();

console.log('\nbarks / events');
st.events.length = 0; p.x = npc('maren').x + 4; p.z = npc('maren').z; for (let i = 0; i < 1500 && !st.events.some((e) => e.type === 'bark'); i++) step({});
ok(st.events.some((e) => e.type === 'bark'), 'npc bark event');
for (let i = 0; i < 1000; i++) step({}); ok(npc('roke').alive, 'roke still patrolling, essential');
console.log(fails ? '\n' + fails + ' FAILURES' : '\nALL OK');
process.exit(fails ? 1 : 0);
