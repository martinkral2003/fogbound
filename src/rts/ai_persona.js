// AI lane: personalities (rusher / boomer / turtle / raider) and difficulty levels.
// HARD_BONUS: the only declared cheat - tiny per-second resource trickle for 'hard' AIs (applied in ai.js, scaled by dt).
export const HARD_BONUS = { gold: 0.35, timber: 0.35, stone: 0.25, blood: 0.25, souls: 0 };

// workers: worker target; prod: military production buildings wanted by minute; wallAt/towerAt: seconds; attackAt: earliest first wave (s);
// wave: min army units for a wave; aggr 0-1 (willingness to fight on at bad odds); siege: siege units wanted before sieging walls; ageAt: seconds
export const PERSONAS = {
  rusher: { workers: 14, prod: 2, wallAt: 600, towers: 2, attackAt: 270, wave: 10, aggr: 0.8, siege: 0, ageAt: 420, raid: 0, scout: 60,
    mix: { melee: 5, ranged: 2, cavalry: 2, heavy: 1, siege: 0.5, caster: 0.3, flyer: 1 } },
  boomer: { workers: 24, prod: 3, wallAt: 420, towers: 4, attackAt: 540, wave: 22, aggr: 0.5, siege: 2, ageAt: 270, raid: 0, scout: 150,
    mix: { melee: 4, ranged: 3, cavalry: 1, heavy: 2, siege: 1.4, caster: 1, flyer: 1 } },
  turtle: { workers: 20, prod: 2, wallAt: 150, towers: 8, attackAt: 660, wave: 20, aggr: 0.35, siege: 3, ageAt: 330, raid: 0, scout: 240,
    mix: { melee: 3, ranged: 4, cavalry: 0.5, heavy: 2, siege: 2, caster: 1.2, flyer: 0.6 } },
  raider: { workers: 16, prod: 2, wallAt: 540, towers: 2, attackAt: 420, wave: 18, aggr: 0.65, siege: 1, ageAt: 360, raid: 1, scout: 90,
    mix: { melee: 3, ranged: 2, cavalry: 4, heavy: 0.6, siege: 0.6, caster: 0.6, flyer: 2 } },
};
export const PERSONA_IDS = Object.keys(PERSONAS);

// react: seconds between decision rounds; skip: chance a build/train action is dropped (inefficiency); delay: multiplies attack timing;
// waveMul: multiplies wave size; micro: 0 none, 1 retreat wounded, 2 + focus-fire + kiting; cap: max aggression multiplier
export const DIFFS = {
  easy: { react: 1.4, skip: 0.35, delay: 1.7, waveMul: 1.5, micro: 0, cap: 0.6, workerMul: 0.75, upgrades: 0.4 },
  normal: { react: 0.7, skip: 0.1, delay: 1.0, waveMul: 1.0, micro: 1, cap: 1.0, workerMul: 1.0, upgrades: 1.0 },
  hard: { react: 0.35, skip: 0, delay: 0.8, waveMul: 0.85, micro: 2, cap: 1.2, workerMul: 1.0, upgrades: 1.2 },
};

export function pickPersona(st, teamId, forced) {
  if (forced && PERSONAS[forced]) return forced;
  // a seeded shuffle shared by all AI teams of this match, so lords get different personalities
  if (!st.aiPersonaBag || !st.aiPersonaBag.length) {
    const bag = PERSONA_IDS.slice();
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(st.rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    st.aiPersonaBag = bag;
  }
  return st.aiPersonaBag.pop();
}
