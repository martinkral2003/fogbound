// COMBAT lane test: scripted duels + mechanic checks + balance table. node tools/rpg-combat-test.js
import * as Combat from '../src/rpg/combat.js';
import { boot, clear, hero, monster, dummy, run, st, events, step, idle, DT, rows, fails, check, mean, f1, eqSword } from './rpg-combat-lib.js';
import { fighter, monsterBrain } from './rpg-combat-bots.js';

const t0 = Date.now();
boot();
console.log('arena ready in', Date.now() - t0, 'ms');

// ---------------------------------------------------------------- duels
function duel(label, mk, N = 6) {
  const ttk = [], wins = [0, 0], hpLeft = [], took = [0, 0];
  for (let i = 0; i < N; i++) {
    clear();
    const { A, B, botA, botB } = mk(i);
    if (Math.hypot(A.x - B.x, A.z - B.z) < 0.5) B.x = A.x + 2.4;
    A.yaw = 0; B.yaw = Math.PI;
    const t = run(new Map([[A, botA], [B, botB]]), () => !A.alive || !B.alive, 90);
    ttk.push(t);
    for (const e of st.events) if (e.type === 'hit') { if (e.tgt === A.id) took[0] += e.amt; else if (e.tgt === B.id) took[1] += e.amt; }
    if (A.alive && !B.alive) { wins[0]++; hpLeft.push(A.hp / A.maxHp); } else if (B.alive && !A.alive) { wins[1]++; hpLeft.push(B.hp / B.maxHp); }
  }
  rows.push([label, f1(mean(ttk)) + ' s', `${wins[0]}-${wins[1]}`, hpLeft.length ? Math.round(mean(hpLeft) * 100) + '% hp left' : '-']);
  return { ttk: mean(ttk), wins, ratio: took[0] / Math.max(1, took[1]) };
}
const pair = (kitA, kitB, cfgA, cfgB, oa = {}, ob = {}) => () => {
  const A = hero('A', { kit: kitA, ...oa, dx: 0 }), B = hero('B', { kit: kitB, ...ob, dx: 2.4 });
  return { A, B, botA: fighter(() => B, cfgA), botB: fighter(() => A, cfgB) };
};
const swordPair = (cA, cB) => () => {
  const A = hero('A', eqSword), B = hero('B', eqSword);
  return { A, B, botA: fighter(() => B, cA), botB: fighter(() => A, cB) };
};

console.log('\n== duels (6 runs each) ==');
const mirror = duel('sword vs sword, both swing only', swordPair({ gap: 0.1 }, { gap: 0.1 }));
const defv = duel('sword parry-bot(A) vs swing-only(B)', swordPair({ def: 'parry', skill: 0.9 }, { gap: 0.1 }));
duel('sword block-bot(A) vs swing-only(B)', swordPair({ def: 'block', skill: 0.9 }, { gap: 0.1 }));
duel('sword dodge-bot(A) vs swing-only(B)', swordPair({ def: 'dodge', skill: 0.8, aggr: true }, { gap: 0.1 }));
duel('both skilled (block/parry mix)', swordPair({ def: 'parry', skill: 0.7 }, { def: 'block', skill: 0.7 }));
check('mirror swing-only duel lasts 8-35 s', mirror.ttk >= 8 && mirror.ttk <= 35, f1(mirror.ttk) + ' s');
check('parrying bot takes less damage per damage dealt than a swing-only mirror', defv.ratio < mirror.ratio * 0.8 || defv.ratio < 0.8, `A/B damage taken: ${defv.ratio.toFixed(2)} vs mirror ${mirror.ratio.toFixed(2)}`);

duel('axe(A, heavy) vs sword blocker(B)', () => {
  const A = hero('A', { kit: 'wanderer', equip: ['axe_1', 'chest_leather'], noShield: true }), B = hero('B', eqSword);
  return { A, B, botA: fighter(() => B, { heavy: 0.5 }), botB: fighter(() => A, { def: 'block', skill: 1 }) };
});
duel('dagger(A) vs sword(B)', () => {
  const A = hero('A', { kit: 'rogue' }), B = hero('B', eqSword);
  return { A, B, botA: fighter(() => B, { gap: 0.05, circle: true }), botB: fighter(() => A, { gap: 0.1 }) };
});
duel('archer(A, kiting) vs melee(B)', () => {
  const A = hero('A', { kit: 'ranger', dx: 0 }), B = hero('B', eqSword);
  B.x = A.x + 14;
  return { A, B, botA: fighter(() => B, { kite: 9 }), botB: fighter(() => A, { gap: 0.1 }) };
}, 6);
duel('mage firebolt(A) vs melee(B)', () => {
  const A = hero('A', { kit: 'mage', skills: { destruction: 5 } }), B = hero('B', eqSword);
  A.quick[5] = 'spell:firebolt'; B.x = A.x + 14;
  return { A, B, botA: fighter(() => B, { cast: 5 }), botB: fighter(() => A, { gap: 0.1 }) };
});
await import('./rpg-combat-test2.js');
