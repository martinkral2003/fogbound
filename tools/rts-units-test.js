// Headless tests of the RTS UNITS lane (roster, orders, combat, generals, upgrades, neutrals, perf). node tools/rts-units-test.js
import { createRts, step } from '../src/rts/core.js';
import { SIM_DT } from '../src/rts/consts.js';
import * as Units from '../src/rts/units.js';
import * as Combat from '../src/rts/combat.js';
import * as Buildings from '../src/rts/buildings.js';

const st = createRts({ seed: 1337, humans: [0, 1, 2, 3] });
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL:', msg); } };
const CX = 0, CZ = -40;
function flat(x0, z0) {
  for (let r = 0; r < 60; r += 3) for (let a = 0; a < 6.28; a += 0.5) { const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r; let good = true; for (let dx = -14; dx <= 14 && good; dx += 7) for (let dz = -14; dz <= 14; dz += 7) if (!st.world.walkable(x + dx, z + dz)) good = false; if (good) return { x, z }; }
  return { x: x0, z: z0 };
}
const P = flat(CX, CZ);
function reset() {
  for (const e of st.ents) if (e.kind === 'unit') { e.alive = false; }
  st.ents = st.ents.filter((e) => e.kind !== 'unit'); st.projs.length = 0;
  for (const t of st.teams) { t.generals = []; t.pop = { mil: 0, work: 0 }; t.mana = 100; }
  st.events.length = 0; st.over = null; st.loot = [];
}
const run = (sec, cb) => { for (let i = 0; i < sec * 30; i++) { step(st, SIM_DT, {}); st.events.length = 0; if (cb && cb(i)) return i * SIM_DT; } return sec; };
function group(type, team, n, x, z, o = {}) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Units.spawn(st, type, team, x + (i % 5) * 1.4, z + Math.floor(i / 5) * 1.4, { noPop: true, ...o }));
  return out;
}
const alive = (a) => a.filter((u) => u.alive).length;
const sumHp = (a) => Math.round(a.reduce((s, u) => s + (u.alive ? u.hp : 0), 0));
function battle(label, tA, nA, tB, nB, sec = 60, gapm = 26, oa = {}, ob = {}) {
  reset();
  const A = group(tA, 0, nA, P.x - gapm / 2, P.z, oa), B = group(tB, 1, nB, P.x + gapm / 2, P.z, ob);
  for (const u of A) u.orders = [{ type: 'amove', x: P.x + 20, z: P.z }], u.order = u.orders[0];
  for (const u of B) u.orders = [{ type: 'amove', x: P.x - 20, z: P.z }], u.order = u.orders[0];
  const t = run(sec, () => !alive(A) || !alive(B));
  const a = alive(A), b = alive(B);
  console.log(`${label.padEnd(44)} ${String(nA).padStart(2)} v ${String(nB).padStart(2)} -> ${a} v ${b} left in ${t.toFixed(0)}s  winner ${a > b ? 'A' : b > a ? 'B' : 'draw'}`);
  return { a, b, A, B };
}
console.log('--- roster'); {
  let n = 0; const per = {};
  for (const id in Units.ROSTER) { const d = Units.ROSTER[id]; n++; per[d.faction] = (per[d.faction] || 0) + 1; ok(d.hp > 0 && d.atk && d.speed > 0 && d.cost && d.needs !== undefined, 'def shape ' + id); }
  console.log('units', n, JSON.stringify(per));
  for (const f of ['necro', 'orc', 'demon', 'cult']) { const mil = Units.list(f).filter((d) => d.role !== 'worker' && d.role !== 'general'); ok(mil.length >= 7, f + ' has 7 military'); ok(Units.list(f).filter((d) => d.role === 'general').length === 3, f + ' 3 generals'); }
  console.log('upgrade lines', Object.keys(Units.UNIT_UPGRADES).length); ok(Object.keys(Units.UNIT_UPGRADES).length >= 30, 'upgrade lines'); ok(Units.def('imp').id === 'demon_imp', 'alias');
}
console.log('--- battles');
battle('grunts vs skeletons', 'orc_grunt', 20, 'necro_skeleton', 20);
battle('skeleton vs grunt (equal gold ~ 1.3x)', 'necro_skeleton', 26, 'orc_grunt', 20);
const sp = battle('spear-throwers vs wolf riders (spear>cav)', 'orc_spearthrower', 10, 'orc_wolfrider', 7); ok(sp.a >= sp.b, 'spears beat cavalry');
const cv = battle('wolf riders vs skeleton archers (cav>ranged)', 'orc_wolfrider', 6, 'necro_archer', 10); ok(cv.a >= cv.b, 'cavalry beats ranged');
const hv = battle('trolls vs spear-throwers (heavy>spears)', 'orc_troll', 3, 'orc_spearthrower', 10); ok(hv.a >= hv.b, 'heavy beats spears');
battle('skeleton archers vs zealots (ranged>light)', 'necro_archer', 12, 'cult_zealot', 10, 60, 30);
const fl = battle('imps vs grunts (melee cannot hit fliers)', 'demon_imp', 10, 'orc_grunt', 10); ok(fl.a >= fl.b, 'imps untouchable by grunts');
battle('fire archers vs imps (AA)', 'demon_firearcher', 8, 'demon_imp', 10, 40);
battle('crossbows vs bone golems (pierce>heavy)', 'cult_crossbow', 12, 'necro_golem', 3, 60, 30);
battle('pit lord vs 10 legionaries', 'demon_pitlord', 1, 'demon_legionary', 10, 60, 20);
battle('flagellants vs skeleton horde', 'cult_flagellant', 10, 'necro_skeleton', 16, 40, 22);
battle('wall-top archers vs grunts', 'necro_archer', 10, 'orc_grunt', 10, 60, 30, { layer: 'wall' });
console.log('--- wall-top range'); {
  reset();
  const a = group('necro_archer', 0, 1, P.x, P.z, { layer: 'wall' })[0], b = group('necro_archer', 0, 1, P.x, P.z + 4)[0];
  const e = group('orc_grunt', 1, 2, P.x + 19.5, P.z);
  e[1].x = P.x + 19.5; e[1].z = P.z + 4; for (const g of e) g.stance = 'hold';
  run(6);
  ok(a.atk.range * 1.25 > 17, 'wall range'); console.log('wall archer targets', e.some((g) => g.hp < g.maxHp), ' (range 17 x1.25 = 21 vs 19.5 m)');
}
console.log('--- veterancy'); {
  reset();
  const z = group('cult_zealot', 0, 1, P.x, P.z, { scale: 3 })[0]; const v = group('necro_skeleton', 1, 25, P.x + 3, P.z);
  for (const s of v) s.stance = 'hold';
  z.orders = [{ type: 'amove', x: P.x + 5, z: P.z }]; z.order = z.orders[0];
  run(120, () => z.vet >= 3 || !z.alive);
  console.log('zealot vet', z.vet, 'xp', Math.round(z.xp), 'dmg', z.atk.dmg.toFixed(1), 'maxHp', z.maxHp, 'alive', z.alive); ok(z.vet >= 2 || !z.alive, 'vet gain');
}
console.log('--- generals'); {
  reset();
  const t = st.teams[0], g = Units.spawnGeneral(st, 0, 0, P.x, P.z);
  ok(g && g.general && t.generals.length === 1 && g.points === 1, 'general spawn');
  Combat.gainXp(st, g, 130); ok(g.lvl === 2, 'general level up ' + g.lvl);
  step(st, SIM_DT, { 0: { cmds: [{ t: 'general', op: 'skill', gen: g.id, skill: 'raise_dead' }] } }); ok(g.skills.raise_dead === 1, 'learn skill');
  const e = group('orc_grunt', 1, 3, P.x + 6, P.z);
  step(st, SIM_DT, { 0: { cmds: [{ t: 'ability', ids: [g.id], id: 'raise_dead', x: P.x + 3, z: P.z }] } }); run(1);
  const sk = st.ents.filter((u) => u.alive && u.team === 0 && u.type === 'necro_skeleton').length; ok(sk >= 3, 'raise dead summoned ' + sk);
  t.generals.length === 1 && g.gear === null && Units.equipGeneral(st, g, 'iron_helm'); ok(g.armor > 10, 'gear armor ' + g.armor);
  const g1 = Units.spawnGeneral(st, 0, 1, P.x, P.z), g2 = Units.spawnGeneral(st, 0, 2, P.x, P.z), g3 = Units.spawnGeneral(st, 0, 0, P.x, P.z);
  ok(g1 && g2 && !g3 && t.generals.length === 3, 'cap 3 generals');
  Combat.damage(st, e[0], g, 99999, {}); ok(!g.alive && g.reviveT > 0, 'general dies'); const rt = g.reviveT;
  t.res.gold = 1000; t.res.souls = 100;
  step(st, SIM_DT, { 0: { cmds: [{ t: 'general', op: 'revive', gen: g.id }] } });
  const dt = run(30, () => g.alive); ok(g.alive && dt < rt, `general revived ${dt.toFixed(1)}s (timer ${rt})`); console.log('general revived after', dt.toFixed(1), 's, lvl', g.lvl, 'hp', Math.round(g.hp), '/', g.maxHp);
}
console.log('--- pop cap'); {
  reset(); const t = st.teams[0]; t.pop.mil = 50; t.popMax = 200;
  ok(Units.canTrain(st, 0, 'necro_skeleton') === 'Military limit', 'cap 50 enforced'); t.pop.mil = 49; ok(Units.canTrain(st, 0, 'necro_golem') === 'Military limit', 'popCost 2 over cap'); ok(Units.canTrain(st, 0, 'necro_skeleton') === null, 'room for 1');
  t.pop.mil = 0; const u = Units.spawn(st, 'necro_golem', 0, P.x, P.z); ok(t.pop.mil === 2, 'spawn adds popCost'); Combat.damage(st, null, u, 99999); ok(t.pop.mil === 0, 'death frees pop');
}
console.log('--- neutrals'); {
  reset();
  const home = { x: P.x, z: P.z };
  const w = group('wild_wolf', -1, 3, P.x, P.z, { neutral: true, home });
  const h = group('orc_grunt', 0, 1, P.x + 10, P.z)[0]; h.stance = 'hold'; h.hp = h.maxHp = 5000;
  run(4); ok(w.some((n) => n.tgt === h.id), 'neutral aggro'); ok(h.hp < h.maxHp, 'neutral hits');
  h.alive = false; h.hp = 0; run(20);
  ok(w.every((n) => Math.hypot(n.x - home.x, n.z - home.z) < 6), 'neutrals return home');
  const d = group('wild_deer', -1, 1, P.x, P.z, { neutral: true, home })[0]; ok(d.neutral && d.def.bounty.blood > 0, 'deer');
  const m = Units.spawn(st, 'skeleton', -1, P.x, P.z, { neutral: true }); ok(m, 'MONSTERS alias skeleton');
  const m2 = Units.spawn(st, 'orcRaider', -1, P.x, P.z, { neutral: true }); ok(m2.maxHp > 100, 'MONSTERS id orcRaider');
}
console.log('--- upgrades'); {
  reset(); const t = st.teams[1], g = group('orc_grunt', 1, 1, P.x, P.z)[0]; const d0 = g.atk.dmg, a0 = g.armor;
  t.up.orc_brute_w = 2; t.up.orc_brute_a = 1; Units.applyUpgrades(st, t);
  ok(g.atk.dmg > d0 * 1.2 && g.armor > a0, `upgrades apply dmg ${d0}->${g.atk.dmg.toFixed(1)} armor ${a0}->${g.armor}`); t.up = {};
}
console.log('--- orders, garrison, buildings'); {
  reset();
  const k = st.teams[2].keep, us = group('demon_legionary', 2, 6, k.x + 10, k.z + 10);
  step(st, SIM_DT, { 2: { cmds: [{ t: 'order', ids: us.map((u) => u.id), order: { type: 'move', x: k.x + 20, z: k.z + 20 } }] } }); run(8);
  ok(us.every((u) => Math.hypot(u.x - (k.x + 20), u.z - (k.z + 20)) < 5), 'move order with formation');
  step(st, SIM_DT, { 2: { cmds: [{ t: 'garrison', ids: [us[0].id], bld: k.id }] } }); run(10);
  console.log('garrisoned', us[0].garrison === k.id, 'inside', (k.garrison || []).length);
  step(st, SIM_DT, { 2: { cmds: [{ t: 'ungarrison', bld: k.id }] } }); ok(!us[0].garrison, 'ungarrison');
  const sp = group('necro_skeleton', 0, 1, k.x - 12, k.z)[0];
  const gr = group('orc_grunt', 1, 8, k.x - 14, k.z + 4);
  const h0 = k.hp; step(st, SIM_DT, { 1: { cmds: [{ t: 'order', ids: gr.map((u) => u.id), order: { type: 'attack', target: k.id } }] } }); run(10);
  ok(k.hp < h0, `grunts damage keep ${Math.round(h0 - k.hp)}`); sp.alive = false;
  step(st, SIM_DT, { 1: { cmds: [{ t: 'order', ids: gr.map((u) => u.id), order: { type: 'patrol', x: k.x - 30, z: k.z } }, { t: 'order', ids: gr.map((u) => u.id), order: { type: 'hold' }, queue: true }, { t: 'setStance', ids: gr.map((u) => u.id), stance: 'defensive' }] } }); run(3);
  ok(gr[0].stance === 'defensive', 'stance'); step(st, SIM_DT, { 1: { cmds: [{ t: 'order', ids: gr.map((u) => u.id), order: { type: 'stop' } }] } }); ok(!gr[0].order, 'stop');
}
console.log('--- ability smoke (every ability, 12 s)'); {
  const ids = Object.keys(Units.ROSTER).filter((i) => Units.ROSTER[i].abilities.length);
  for (const id of ids) {
    reset(); const d = Units.ROSTER[id], f = ['necro', 'orc', 'demon', 'cult'].indexOf(d.faction);
    const A = group(id, f, 3, P.x - 6, P.z); const B = group('wild_ogre', 1 === f ? 0 : 1, 3, P.x + 6, P.z, {});
    B.forEach((b) => { b.team = f === 1 ? 0 : 1; b.neutral = false; });
    for (const u of A.concat(B)) { u.orders = [{ type: 'amove', x: P.x, z: P.z }]; u.order = u.orders[0]; }
    run(12);
    const used = A.some((u) => u.abilities.some((a) => a.cd > 0)) || A.some((u) => !u.alive);
    if (!used) console.log('  note: ability not triggered for', id);
  }
}
console.log('--- performance'); {
  reset();
  const types = ['orc_grunt', 'necro_skeleton', 'demon_legionary', 'cult_zealot', 'necro_archer', 'cult_crossbow', 'orc_wolfrider', 'demon_imp'];
  for (let i = 0; i < 300; i++) { const team = i % 2; const u = Units.spawn(st, types[(i >> 1) % 8], team, P.x + (team ? 20 : -20) + (i % 15) * 1.1, P.z - 12 + Math.floor(i / 20) * 1.6, { noPop: true }); u.orders = [{ type: 'amove', x: P.x + (team ? -30 : 30), z: P.z }]; u.order = u.orders[0]; }
  let tu = 0, tc = 0, n = 0;
  for (let i = 0; i < 600; i++) {
    st.t += SIM_DT; st.tick++;
    let s = performance.now(); Units.update(st, SIM_DT); tu += performance.now() - s;
    s = performance.now(); Combat.update(st, SIM_DT); tc += performance.now() - s; n++;
    st.events.length = 0;
    if (i === 599) console.log('alive after 20 s', st.ents.filter((e) => e.alive).length);
  }
  console.log(`300 units: Units.update ${(tu / n).toFixed(2)} ms + Combat.update ${(tc / n).toFixed(2)} ms per step`);
  ok((tu + tc) / n < 6, 'perf budget');
}
console.log(fails ? `${fails} FAILURES` : 'ALL OK');
process.exit(fails ? 1 : 0);
