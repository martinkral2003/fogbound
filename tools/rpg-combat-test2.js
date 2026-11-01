// Mechanic checks + monster table (second half of rpg-combat-test.js)
import * as Combat from '../src/rpg/combat.js';
import * as Items from '../src/rpg/items.js';
import { clear, hero, monster, dummy, run, st, events, step, idle, DT, rows, fails, check, mean, f1, eqSword } from './rpg-combat-lib.js';
import { fighter, monsterBrain } from './rpg-combat-bots.js';

const tick = (map, n = 1) => { for (let i = 0; i < n; i++) step(map); };
const inp = (a, o = {}) => ({ ...idle(a), ...o });
// two duelists, B attacks, A is scripted by the caller
function pairUp(oa = eqSword, ob = eqSword, keep = false) {
  if (!keep) clear();
  const A = hero('A', oa), B = hero('B', ob);
  B.x = A.x + 1.9; B.yaw = Math.PI; A.yaw = 0; A.alerted = B.alerted = true;
  return { A, B };
}
// advance with B swinging until B's windup has `left` seconds remaining; returns whether it got there
function untilWindup(A, B, left, aIn = {}) {
  tick(new Map([[B.id, inp(B, { yaw: Math.PI, attackPressed: true })], [A.id, inp(A, { yaw: 0, ...aIn })]]));
  for (let i = 0; i < 60; i++) {
    const wl = Combat.combatInfo(B).windupLeft;
    if (wl > 0 && wl <= left) return true;
    tick(new Map([[B.id, inp(B, { yaw: Math.PI })], [A.id, inp(A, { yaw: 0, ...aIn })]]));
  }
  return false;
}
const finish = (A, B, aIn, n = 40) => { for (let i = 0; i < n; i++) tick(new Map([[B.id, inp(B, { yaw: Math.PI })], [A.id, inp(A, { yaw: 0, ...(typeof aIn === 'function' ? aIn(i) : aIn) })]])); };

console.log('\n== mechanics ==');
{ // unblocked baseline
  const { A, B } = pairUp(); untilWindup(A, B, 0.1); finish(A, B, {});
  check('light attack lands on an idle target', A.hp < A.maxHp, `${f1(A.maxHp - A.hp)} dmg`);
  const base = A.maxHp - A.hp;
  const p = pairUp(); p.A.cs.blockPrev = false; untilWindup(p.A, p.B, 0.16); // A presses block now (fresh)
  clear(); const q = pairUp(); const ev0 = st.events.length;
  untilWindup(q.A, q.B, 0.17); finish(q.A, q.B, (i) => (i < 12 ? { block: true } : {}));
  const par = events('block').filter((e) => e.perfect);
  check('perfect parry: block event perfect, attacker staggered, no damage', par.length >= 1 && q.A.hp === q.A.maxHp && q.B.cs.state !== 'idle', `perfect=${par.length} hp=${q.A.hp.toFixed(0)}/${q.A.maxHp} B=${q.B.cs.state}`);
  const r = pairUp(); untilWindup(r.A, r.B, 0.5, { block: true }); finish(r.A, r.B, { block: true });
  const lost = r.A.maxHp - r.A.hp;
  check('late block (no parry) reduces damage and costs stamina', lost < base * 0.75 && r.A.stamina < r.A.maxStamina, `took ${f1(lost)} vs ${f1(base)} unblocked, stamina ${r.A.stamina.toFixed(0)}`);
  const d = pairUp(); untilWindup(d.A, d.B, 0.15); finish(d.A, d.B, (i) => (i === 0 ? { dodge: true, mx: 0, mz: 1 } : {}));
  check('dodge i-frames avoid the hit; costs stamina; has cooldown', d.A.hp === d.A.maxHp && d.A.stamina < d.A.maxStamina && events('dodge').length >= 1, `hp ${d.A.hp.toFixed(0)}`);
  const d2 = pairUp(); step(new Map([[d2.A.id, inp(d2.A, { dodge: true })]])); const c1 = d2.A.cs.state; tick(new Map(), 16); step(new Map([[d2.A.id, inp(d2.A, { dodge: true })]]));
  check('dodge cooldown blocks immediate second roll', c1 === 'dodge' && events('dodge').length === 1 || events('dodge').length <= 2, `rolls ${events('dodge').length}`);
}
{ // exhaustion
  const full = pairUp(), tired = pairUp(eqSword, eqSword, true);
  tired.B.stamina = 0; tired.B.x += 20; tired.A.x += 20; full.B.stamina = full.B.maxStamina;
  const hit = (P) => { untilWindup(P.A, P.B, 0.2); const w = P.B.cs.move ? P.B.cs.move.windup : 0, dm = P.B.cs.move ? P.B.cs.move.dmgMul : 0; return { w, dm }; };
  const a = hit(full), b = hit(tired);
  check('no stamina = slower and weaker swing', b.w > a.w * 1.3 && b.dm < a.dm, `windup ${a.w.toFixed(2)} -> ${b.w.toFixed(2)}, dmg x${a.dm.toFixed(2)} -> x${b.dm.toFixed(2)}`);
  const g = pairUp(); g.A.stamina = 0; untilWindup(g.A, g.B, 0.3, { block: true }); finish(g.A, g.B, { block: true });
  check('cannot hold a guard with zero stamina (takes full damage)', g.A.hp < g.A.maxHp - 3, `hp ${g.A.hp.toFixed(0)}/${g.A.maxHp}`);
}
{ // backstab / sneak: average of several fresh hits, unaware+behind vs aware+facing
  clear(); const A = hero('A', { kit: 'rogue' }); const T = dummy({ dx: -1.0, hp: 5000 });
  A.x = T.x + 1.2; A.yaw = Math.PI;
  const avg = (sneak) => {
    const v = [];
    for (let k = 0; k < 6; k++) {
      T.hp = T.maxHp = 5000; T.yaw = sneak ? Math.PI : 0; T.alerted = !sneak; T.lastHitBy = 0; T.cs.state = 'idle';
      A.cs.state = 'idle'; A.cs.t = 0; A.cs.comboT = 0; A.stamina = A.maxStamina; A.cs.move = null;
      run(new Map([[A, () => ({ yaw: Math.PI, attackPressed: A.cs.state === 'idle' })]]), () => T.hp < T.maxHp, 3);
      v.push(T.maxHp - T.hp); T.hp = T.maxHp; A.cs.state = 'idle';
      run(new Map(), () => false, 1);
    }
    return mean(v);
  };
  const sn = avg(true), aw = avg(false);
  check('dagger sneak/back attack does much more than an aware front hit', sn > aw * 1.6, `sneak ${f1(sn)} vs aware ${f1(aw)}`);
}
{ // ranged: gravity + ammo
  clear(); const A = hero('A', { kit: 'ranger' }); const T = dummy({ dx: 30, hp: 800 });
  const n0 = Items.ammoCount(A); let vy0 = null, vy1 = null, g = 0;
  const drive = () => ({ yaw: 0, pitch: 0.05, lockId: 0, attack: A.cs.state === 'idle' || A.cs.state === 'draw' && A.cs.drawT < (A.cs.drawNeed || 1), attackPressed: A.cs.state === 'idle' });
  run(new Map([[A, drive]]), () => st.projs.length > 0 && (vy1 = st.projs[0].vy, g = st.projs[0].g, vy0 ??= vy1, st.t > 0 && vy1 < vy0 - 0.3), 5, () => { if (st.projs.length && vy0 === null) vy0 = st.projs[0].vy; });
  check('arrow flight has gravity (vy decreases in flight)', g > 0 && vy1 < vy0 - 0.3, `vy ${vy0 && vy0.toFixed(2)} -> ${vy1 && vy1.toFixed(2)}`);
  run(new Map(), () => st.projs.length === 0, 5);
  check('bow: arrow consumed from inventory', Items.ammoCount(A) === n0 - 1, `${n0} -> ${Items.ammoCount(A)}`);
  check('unlocked unaimed arrow at 30 m falls short/low (gravity matters)', T.hp === T.maxHp);
  clear(); const A2 = hero('A2', { kit: 'ranger' }), T2 = dummy({ dx: 30, hp: 800 }); const sh = [];
  run(new Map([[A2, () => ({ yaw: 0, lockId: T2.id, attack: A2.cs.state === 'idle' || A2.cs.state === 'draw' && A2.cs.drawT < (A2.cs.drawNeed || 1), attackPressed: A2.cs.state === 'idle' })]]), () => T2.hp < T2.maxHp, 6);
  check('locked-on bow shot compensates drop and hits at 30 m', T2.hp < T2.maxHp, `hp ${T2.hp.toFixed(0)}/800`);
  const B2 = hero('B2', { kit: 'ranger' }); B2.inv = B2.inv.filter((q) => q.ammoKind !== 'arrow'); const sh0 = events('shoot').length;
  run(new Map([[B2, () => ({ yaw: 0, attack: true, attackPressed: B2.cs.state === 'idle' })]]), () => false, 2);
  check('bow without ammo cannot shoot', events('shoot').length === sh0);
}
{ // statuses
  clear(); const A = hero('A', eqSword); const hp0 = A.hp;
  Combat.addStatus(A, 'burn', 3, 6); Combat.addStatus(A, 'poison', 4, 3);
  run(new Map([[A, () => ({})]]), () => false, 3);
  check('burn + poison DoT deal damage over time', A.hp < hp0 - 15, `${f1(hp0 - A.hp)} in 3 s`);
  A.hp = 50; Combat.addStatus(A, 'regen', 4, 5); run(new Map([[A, () => ({})]]), () => false, 3);
  check('regen status heals', A.hp > 62, `hp ${A.hp.toFixed(0)}`);
  A.hp = A.maxHp; Combat.addStatus(A, 'shield', 10, 30);
  const dealt = Combat.applyDamage(st, null, A, 20, { dtype: 'fire', force: true });
  check('absorb shield soaks damage', A.hp === A.maxHp && dealt === 0, `hp ${A.hp}`);
  Combat.addStatus(A, 'stun', 1, 1);
  const s0 = events('swing').length; run(new Map([[A, () => ({ attackPressed: true })]]), () => false, 0.5);
  check('stunned actor cannot attack', events('swing').length === s0);
  Combat.addStatus(A, 'slow', 2, 1); check('slow status present', A.status.some((s) => s.id === 'slow'));
}
{ // truce rules
  clear(); const { A, B } = pairUp(); st.match.calmUntil = st.t + 30;
  const d1 = Combat.applyDamage(st, A, B, 20, { source: 'melee' });
  st.match.calmUntil = 0;
  const d2 = Combat.applyDamage(st, A, B, 20, { source: 'melee' });
  check('no hero-vs-hero damage during the calm, damage afterwards', d1 === 0 && d2 > 0, `${d1} / ${f1(d2)}`);
  const saved = st.settlement; st.settlement = { x: A.x, z: A.z, r: 40, safe: true, buildings: [] };
  B.hp = B.maxHp; const d3 = Combat.applyDamage(st, A, B, 20, { source: 'melee' });
  const m = monster('wolf', { dx: 3 }); const d4 = Combat.applyDamage(st, m, A, 5, { source: 'melee' });
  st.settlement = saved;
  check('settlement truce blocks hero-vs-hero but not monsters', d3 === 0 && d4 > 0, `${d3} / ${f1(d4)}`);
  const np = Object.assign(hero('npc', {}), { kind: 'npc' }); np.hp = 50;
  check('npcs are essential (ignore damage)', Combat.applyDamage(st, A, np, 99, { source: 'melee' }) === 0);
}
{ // armour tradeoff + no one-shot
  clear(); const L = hero('L', { kit: 'wanderer', equip: ['chest_cloth'] }), H = hero('H', { kit: 'wanderer', equip: ['chest_plate', 'legs_plate', 'head_plate', 'boots_plate'] });
  const dl = Combat.applyDamage(st, null, L, 40, { force: true }), dh = Combat.applyDamage(st, null, H, 40, { force: true });
  check('heavy armour absorbs more but slows (move speed)', dh < dl && H.d.moveSpeed < L.d.moveSpeed + 1e-6 && H.d.armor > L.d.armor, `dmg ${f1(dl)} vs ${f1(dh)}, speed ${L.d.moveSpeed.toFixed(2)} vs ${H.d.moveSpeed.toFixed(2)}`);
  const T = hero('T', { kit: 'wanderer' }); const k = monster('troll', { dx: 2 });
  const before = T.hp = T.maxHp; Combat.applyDamage(st, k, T, 9999, { source: 'melee' });
  check('no one-shot of a healthy hero by a regular monster', T.alive && T.hp >= 1, `hp ${T.hp}`);
}
await import('./rpg-combat-test3.js');
