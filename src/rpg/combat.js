// FOGBOUND: HERO combat facade (owner: COMBAT agent). Implementation lives in src/rpg/combat/*.js:
//   common (sides, truce, helpers) | damage (pipeline, block/parry, stagger) | status (DoT/CC/buffs/regen) | melee (swings, combo, heavy, backstab)
//   ranged (bows, projectiles) | spells (10 spells, summons) | monsters (MONSTER_MOVES) | input (state machine, dodge, block, combatInfo)
// Extra exports beyond the README: startAttack/setBlock/startDodge helpers, removeStatus, hasStatus, PARRY_WINDOW, DODGE, WEAPON_KINDS.
export { moveMul, handleInput, updateCombat, combatInfo, DODGE, startDodge } from './combat/input.js';
export { applyDamage, staggerActor, PARRY_WINDOW } from './combat/damage.js';
export { addStatus, removeStatus, updateStatus } from './combat/status.js';
export { stepProjectiles } from './combat/ranged.js';
export { SPELLS, castSpell } from './combat/spells.js';
export { MONSTER_MOVES } from './combat/monsters.js';
export { WEAPON_KINDS, startMelee as startAttack } from './combat/melee.js';
export { hasStatus, isHostile } from './combat/common.js';

// setBlock(a, on): helper for scripted actors (the normal path is input.block)
export function setBlock(a, on) { if (!a.alive) return; a.cs.blocking = !!on; }
