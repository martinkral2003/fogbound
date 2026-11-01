// Headless test of the RTS BUILDINGS lane. node tools/rts-buildings-test.js
import { createRts, step, killBld } from '../src/rts/core.js';
import { SIM_DT, RES } from '../src/rts/consts.js';
import * as B from '../src/rts/buildings.js';
import * as Prod from '../src/rts/production.js';
import * as Units from '../src/rts/units.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } };
const st = createRts({ seed: 1337, humans: [0], ai: [] });
const run = (sec) => { for (let i = 0; i < sec / SIM_DT; i++) step(st, SIM_DT, {}); };
const rich = (t) => { for (const r of RES) t.res[r] = 99999; };
const send = (team, cmd) => step(st, SIM_DT, { [team]: { cmds: [cmd] } });

function findSpot(team, type, minR = 14) {
  const t = st.teams[team], k = t.keep;
  for (let r = minR; r < 60; r += 3) for (let a = 0; a < 6.28; a += 0.3) {
    const x = k.x + Math.cos(a) * r, z = k.z + Math.sin(a) * r;
    if (!B.canPlace(st, team, type, x, z, a)) return { x, z, rot: a };
  }
  return null;
}

// ---- 1. canPlace for every type, every faction
console.log('== canPlace near keep (before / after Cursed Age + prerequisites)');
for (const t of st.teams) {
  const fk = t.faction.key, list = B.availableFor(fk);
  const first = [], later = [];
  for (const d of list) { const s = findSpot(t.id, d.id); first.push(d.id + ':' + (s ? 'ok' : B.canPlace(st, t.id, d.id, t.keep.x + 14, t.keep.z + 14, 0))); }
  console.log(fk, first.join(' | '));
  ok(list.length >= 18, fk + ' has >= 18 building types, got ' + list.length);
}

// ---- 2. construct everything for each faction with direct addProgress
console.log('== construct all');
for (const t of st.teams) {
  rich(t); t.age = 3;
  const list = B.availableFor(t.faction.key).filter((d) => d.id !== 'keep');
  // satisfy dependencies by ordering: keep building until nothing new fits
  let placed = 0;
  for (let pass = 0; pass < 4; pass++) for (const d of list) {
    if (B.count(st, t.id, d.id) >= (d.limit || 1)) continue;
    const s = findSpot(t.id, d.id);
    if (!s) continue;
    const b = B.place(st, t.id, d.id, s.x, s.z, s.rot, []);
    if (typeof b === 'string') { ok(false, 'place ' + d.id + ': ' + b); continue; }
    ok(b.state === 'building' && b.hp < b.maxHp * 0.2, d.id + ' starts as a scaffold at ~10% hp');
    for (let i = 0; i < 400 && b.state === 'building'; i++) B.addProgress(st, b, 1);
    ok(b.state === 'ready', d.id + ' completes');
    placed++;
  }
  run(1);
  const missing = list.filter((d) => !B.count(st, t.id, d.id)).map((d) => d.id);
  console.log(t.faction.key, 'placed', placed, 'missing:', missing.join(',') || 'none', '| popMax', t.popMax, '| cells', B.territory.cellsOwned(st, t.id));
  ok(!missing.length, t.faction.key + ' missing ' + missing);
}

// ---- 3. production, pop caps
console.log('== production');
{
  const t = st.teams[0], keep = t.keep;
  rich(t);
  for (let i = 0; i < 13; i++) { const sp = findSpot(0, 'house', 12 + i); const h = sp && B.place(st, 0, 'house', sp.x, sp.z, sp.rot, []); if (h && typeof h !== 'string') B.addProgress(st, h, 999); }
  run(1);
  console.log('after houses popMax', t.popMax);
  ok(t.popMax >= 74, 'houses raise popMax');
  const ids = Prod.trainableIds(st, keep);
  console.log('keep trains', ids.join(','));
  const worker = ids.find((i) => /worker/.test(i)) || t.faction.key + '_worker';
  let q = 0, why;
  for (let i = 0; i < 80; i++) {
    run(0.1);
    while (keep.queue.length >= Prod.MAX_QUEUE) { run(Units.def(worker).time ? Units.def(worker).time : 25); }
    why = Prod.queueTrain(st, 0, keep, worker, 1);
    if (why) break; q++;
  }
  run(120);
  console.log('workers queued', q, 'stop reason:', why, '| pop', JSON.stringify(t.pop), 'popMax', t.popMax);
  ok(t.pop.work <= t.cap.work, 'worker cap respected: ' + t.pop.work);
  ok(t.pop.work === t.cap.work || /limit|houses/.test(why), 'worker cap reached or limited');
  // military
  const bar = st.blds.find((b) => b.team === 0 && b.type === 'barracks');
  const mids = Prod.trainableIds(st, bar);
  console.log('barracks trains', mids.join(',') || '(none: roster not available yet)');
  if (mids.length) {
    let n = 0, w2;
    for (let i = 0; i < 140; i++) { if (bar.queue.length >= Prod.MAX_QUEUE) run(30); w2 = Prod.queueTrain(st, 0, bar, mids[0], 1); if (w2) break; n++; }
    run(300);
    console.log('military queued', n, 'stop:', w2, 'pop', JSON.stringify(t.pop));
    ok(t.pop.mil <= t.cap.mil, 'military cap respected: ' + t.pop.mil);
  }
  const gids = Prod.trainableIds(st, keep).filter((i) => /general/.test(i));
  if (gids.length) {
    let g = 0, gw; for (const gid of gids.concat(gids)) { gw = Prod.queueTrain(st, 0, keep, gid, 1); if (!gw) g++; run(120); }
    console.log('generals queued', g, 'stop:', gw, 'generals', t.generals.length);
    ok(t.generals.length <= 3, 'general cap');
  }
  // time + cancel refund
  const before = t.res.gold;
  Prod.queueTrain(st, 0, keep, worker, 1);
  console.log('queue head time', keep.queue[0] && keep.queue[0].total.toFixed(1), 's');
  send(0, { t: 'cancelTrain', bld: keep.id, idx: 0 });
  ok(t.res.gold >= before - 1, 'cancel refunds');
  send(0, { t: 'rally', bld: keep.id, x: keep.x + 5, z: keep.z + 5 });
  ok(keep.rally && keep.rally.x === keep.x + 5, 'rally set');
}

// ---- 4. research ages
console.log('== tech');
{
  const t = st.teams[1]; t.age = 1; t.tech = {}; rich(t);
  const keep = t.keep;
  let r = Prod.queueResearch(st, 1, keep, 'age_iron');
  console.log('age_iron ->', r || 'queued');
  run(70);
  console.log('age now', t.age);
  ok(t.age === 2, 'Iron Age reached');
  r = Prod.queueResearch(st, 1, keep, 'age_cursed');
  run(100);
  console.log('age now', t.age, 'cursed err', r);
  ok(t.age === 3, 'Cursed Age reached');
  { const w1 = Prod.queueTrain(st, 1, keep, 'orc_worker', 1); console.log('orc worker train time', w1 || keep.queue[keep.queue.length - 1].total.toFixed(1) + ' s'); }
  const forge = st.blds.find((b) => b.team === 1 && b.type === 'forge');
  r = Prod.queueResearch(st, 1, forge, 'forge_blade1'); run(45);
  ok(t.tech.forge_blade1 && B.mod(t, 'dmg') > 0, 'forge tech + Tech.mod');
  console.log('available techs', B.techAvailable(st, 1).filter((x) => x.available).length);
}

// ---- 5. demolish, destroy, storage, garrison, burning
console.log('== demolish / destroy / storage');
{
  const t = st.teams[2]; rich(t); t.res.gold = 1000;
  const s = findSpot(2, 'storehouse', 30);
  const house = B.place(st, 2, 'house', s.x, s.z, s.rot, []); B.addProgress(st, house, 999);
  const g0 = t.res.timber;
  send(2, { t: 'demolish', id: house.id });
  ok(house.state === 'ruin' && t.res.timber === g0 + 25, 'demolish refunds 50% (timber +' + (t.res.timber - g0) + ')');
  const sh = B.place(st, 2, 'storehouse', s.x, s.z, s.rot, []); B.addProgress(st, sh, 999);
  const s2 = B.storageFor(st, 2, 'timber', sh.x + 1, sh.z + 1);
  ok(s2 === sh, 'storageFor picks the nearest accepting storehouse');
  ok(B.storageFor(st, 2, 'gold', sh.x, sh.z).type !== 'storehouse', 'storehouse does not take gold');
  ok(B.nearestOwn(st, 2, 'keep', 0, 0) === t.keep, 'nearestOwn keep');
  // unfinished collapse
  const un = B.place(st, 2, 'house', s.x + 8, s.z, s.rot, []);
  if (typeof un !== 'string') { killBld(st, un, null); ok(un.state === 'ruin' && un.collapsed, 'unfinished collapses'); }
  // garrison
  const bar = st.blds.find((b) => b.team === 2 && b.type === 'barracks');
  const u = Units.spawn(st, 'demon_worker', 2, bar.x + 4, bar.z + 4);
  send(2, { t: 'garrison', ids: [u.id], bld: bar.id }); run(0.5);
  ok(u.garrison === bar.id && bar.garrison.includes(u.id), 'garrison near-by unit enters');
  send(2, { t: 'ungarrison', bld: bar.id });
  ok(!u.garrison && !bar.garrison.length, 'ungarrison');
  // burning + ruin
  sh.hp = sh.maxHp * 0.2; run(1);
  ok(sh.state === 'burning', 'burning below 30% hp');
  B.addRepair(st, sh, sh.maxHp); run(1);
  ok(sh.state === 'ready', 'repair extinguishes');
  killBld(st, sh, null);
  ok(sh.state === 'ruin', 'destroyed -> ruin');
  run(65);
  ok(!st.byId.has(sh.id), 'ruin removed after timeout');
  console.log('influence at keep', JSON.stringify(B.influenceAt(st, t.keep.x, t.keep.z).owner), '| outside', B.canPlace(st, 2, 'house', -t.keep.x * 0.3, t.keep.z * 0.3, 0));
}
const t0 = performance.now(); run(30); console.log('30 s of sim:', ((performance.now() - t0) / 900).toFixed(2), 'ms/step avg with', st.blds.length, 'buildings');
console.log(fails ? 'FAILURES: ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
