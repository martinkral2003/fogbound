// v0.5 servants: unit creation extras (stats, spell state) and the per-step behaviour hook called from sim.js unitUpdate.
// Sim-side only (no DOM/Three). No levels, XP, evolution or gear any more: a servant is its type (see units_data.js) plus its auto-cast spells (servant_spells.js).
// Uses simApi at call time (circular import with sim.js).
import * as D from './data.js';
import * as RC from './recruits.js';
import * as SP from './servant_spells.js';

const { UNITS } = D;

// extra fields merged into the agent by sim.js spawnUnit (this spread comes last, so `base` here replaces the default one).
// Entries with `eff` hold EFFECTIVE stats: divide out COMBAT.unitHp / unitDmg, which recalc() multiplies back in.
export function unitExtra(d, rf) {
  const C = D.COMBAT || {};
  const out = {
    role: d.role || 'melee', kite: d.kite || 0, vision: 0, bldMul: 0,
    sv: { spells: (d.spells || []).map((id) => ({ id, cd: 1.5 + rf() * 3.5 })), spT: rf() * 0.3, busy: null, gcd: 0 },
  };
  if (d.eff) out.base = { hp: d.hp / (C.unitHp || 1), atk: d.atk / (C.unitDmg || 1), armor: d.armor || 0, res: d.res };
  return out;
}

// per-step hook (sim.js unitUpdate). Returns true when the servant is busy (dashing, whirling): the normal AI is skipped this step.
export function tick(st, u, dt) {
  if (!u.sv) return false;
  if (u.recruit) RC.tickRecruit(st, u, dt);
  if (!u.alive) return false;
  return SP.tick(st, u, dt) === true;
}

// legacy hooks still called from sim.js (siege servants and building multipliers are gone with the base-building game)
export const siegeTarget = () => null;
export const bldMulOf = () => 0;
// followers never walk to ground items (gear is for heroes)
export const followerWants = () => false;
export const servantCount = (st, teamId) => { let n = 0; for (const e of st.ents) if (e.kind === 'unit' && e.team === teamId && e.alive && !e.temp && !e.guard) n++; return n; };

export const roleIcon = (type, role) => (UNITS[type] && UNITS[type].icon) || (D.ROLE_INFO[role] && D.ROLE_INFO[role].icon) || '•';
