// Monster move sets. Every move telegraphs (a visible wind-up) so skill beats stats. Monsters drive the same state machine as heroes:
// the AI sets input.attackPressed (basic move), input.heavy (the type's heavy move) or input.move = '<move id>' plus yaw/lockId.
// Top-level windup/active/recover/range/damageMul/telegraph describe the BASIC move (flat access for ai.js); `moves` has all of them.
// Move fields: windup active recover (s) | reach (hit distance) range (distance the AI should start it at) | arc (rad, total) | aoe (radius around the
// actor, ignores facing) | dmgMul | poise (poise damage) | knock | superArmor (cannot be staggered while winding/active, except by a parry)
// blockable:false (slam) | lunge/lungeT (forward impulse m/s, s) | proj {speed, dtype, color} (ranged move) | status {id,dur,power,chance} | cd (s) | summon n
const M = (o) => ({ telegraph: true, arc: 1.7, dmgMul: 1, poise: 12, knock: 0, cd: 0, ...o });

function type(dmg, poise, basic, extra = {}) {
  const b = M({ id: 'basic', ...basic });
  const moves = { basic: b };
  for (const k of Object.keys(extra)) if (k !== 'blocks') moves[k] = M({ id: k, ...extra[k] });
  return { dmg, poise, blocks: !!extra.blocks, windup: b.windup, active: b.active, recover: b.recover, range: b.range ?? b.reach, damageMul: b.dmgMul, telegraph: b.telegraph, moves };
}

export const MONSTER_MOVES = {
  skeleton: type(9, 36, { windup: 0.55, active: 0.14, recover: 0.65, reach: 2.3, range: 2.0, poise: 9 }),
  skelArcher: type(8, 28, { windup: 0.95, active: 0.05, recover: 0.9, reach: 2, range: 14, proj: { speed: 26, dtype: 'physical', color: 0xe0e0d0 } }),
  ghoul: type(12, 40, { windup: 0.4, active: 0.12, recover: 0.5, reach: 2.2, range: 1.9, status: { id: 'poison', dur: 3, power: 3, chance: 0.35 } },
    { lunge: { windup: 0.6, active: 0.25, recover: 0.8, reach: 3.4, range: 5.5, dmgMul: 1.4, lunge: 9, lungeT: 0.25, cd: 6, poise: 18, status: { id: 'poison', dur: 4, power: 3, chance: 0.6 } } }),
  wolf: type(10, 26, { windup: 0.3, active: 0.1, recover: 0.5, reach: 1.9, range: 1.7, arc: 1.5, poise: 7, status: { id: 'bleed', dur: 3, power: 2.5, chance: 0.3 } },
    { pounce: { windup: 0.5, active: 0.2, recover: 0.9, reach: 2.9, range: 4.5, dmgMul: 1.3, lunge: 11, lungeT: 0.22, cd: 5, knock: 4, poise: 16 } }),
  orcRaider: type(15, 46, { windup: 0.6, active: 0.15, recover: 0.7, reach: 2.5, range: 2.2, poise: 14 },
    { overhead: { windup: 0.95, active: 0.18, recover: 1.0, reach: 2.7, range: 2.4, arc: 1.0, dmgMul: 1.7, poise: 32, knock: 5, cd: 5 } }),
  bogBeast: type(20, 80, { windup: 0.75, active: 0.18, recover: 0.9, reach: 3.1, range: 2.7, arc: 2.0, poise: 20, status: { id: 'poison', dur: 3, power: 3, chance: 0.3 } },
    { slam: { windup: 1.2, active: 0.2, recover: 1.2, reach: 4.6, range: 4.2, aoe: 4.6, dmgMul: 1.35, blockable: false, unparryable: true, knock: 8, cd: 7, poise: 30, superArmor: true,
      status: { id: 'poison', dur: 4, power: 3, chance: 0.6 } } }),
  wraith: type(14, 30, { windup: 0.8, active: 0.05, recover: 1.0, reach: 2, range: 13, proj: { speed: 17, dtype: 'cold', color: 0x9fb8ff }, status: { id: 'slow', dur: 1.8, power: 1, chance: 0.4 } }),
  troll: type(32, 120, { windup: 0.85, active: 0.2, recover: 1.0, reach: 3.4, range: 3.0, arc: 2.0, poise: 22, knock: 4 },
    { overhead: { windup: 1.25, active: 0.22, recover: 1.3, reach: 3.5, range: 3.2, arc: 1.2, dmgMul: 1.7, poise: 40, knock: 8, superArmor: true, cd: 6 } }),
  crypt: type(24, 110, { windup: 0.6, active: 0.15, recover: 0.65, reach: 2.6, range: 2.3, poise: 16 },
    { cleave: { windup: 0.9, active: 0.2, recover: 0.85, reach: 2.9, range: 2.6, arc: 2.4, dmgMul: 1.5, poise: 30, knock: 4, cd: 4 }, blocks: true }),
  king: type(38, 1e9, { windup: 0.9, active: 0.2, recover: 0.9, reach: 4.4, range: 4.0, arc: 2.2, poise: 25, knock: 5 },
    { slam: { windup: 1.4, active: 0.2, recover: 1.3, reach: 6.8, range: 6.0, aoe: 6.8, dmgMul: 1.5, blockable: false, unparryable: true, knock: 9, cd: 8, poise: 40, superArmor: true },
      summon: { windup: 1.6, active: 0.1, recover: 1.0, reach: 0, range: 14, dmgMul: 0, summon: 2, cd: 24, superArmor: true } }),
};

// choose the move a monster should start from its input: input.move (explicit) > heavy (first non-basic ready move) > basic
export function pickMove(st, a, inp) {
  const def = MONSTER_MOVES[a.type];
  if (!def) return null;
  const cd = a.cs.moveCd || (a.cs.moveCd = {});
  const ready = (m) => m && !(cd[m.id] > st.t);
  if (inp.move && ready(def.moves[inp.move])) return def.moves[inp.move];
  if (inp.heavy) {
    const names = Object.keys(def.moves).filter((k) => k !== 'basic' && k !== 'summon');
    for (const k of names) if (ready(def.moves[k])) return def.moves[k];
  }
  return def.moves.basic;
}

export function monsterDamage(a, m) {
  const def = MONSTER_MOVES[a.type], w = a.d && a.d.weapon && a.d.weapon.dmg;
  const base = w ? (w[0] + w[1]) / 2 : (def ? def.dmg : 8) * (1 + 0.06 * ((a.lvl || 1) - 1));
  return base * (a.dmgScale || 1) * m.dmgMul;
}
