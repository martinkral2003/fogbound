// FOGBOUND v0.5 ALLIES: shared helpers for the allied-hero AI (ai.js, ai_*.js). Pure functions, no DOM/Three, no Math.random.
import { mulberry32, clamp } from './util.js';

export { clamp, mulberry32 };
export const TAU = Math.PI * 2;
export const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Difficulty (reaction time, aim error, decision frequency, dodge chance). 'normal' is the reference.
//   think: seconds between decisions (staggered); aimErr: radians of aim jitter; dodge: chance to react to a telegraph; react: seconds before the reaction;
//   aggr: multiplier on how eagerly fights/assaults are taken; need: required fight ratio (time-to-die / time-to-kill) to start an assault;
//   flee: hp fraction at which the hero retreats; potion: hp fraction at which a potion is drunk; sight: metres at which the hero notices demons;
//   leash: metres from the anchor (the human) the hero tends to stay within.
export const DIFF = {
  easy:   { name: 'easy',   think: 0.5,  aimErr: 0.2,   dodge: 0.3,  aggr: 0.75, need: 1.9, flee: 0.25, sight: 32, potion: 0.33, react: 0.55, leash: 28 },
  normal: { name: 'normal', think: 0.36, aimErr: 0.09,  dodge: 0.65, aggr: 1.0,  need: 1.5, flee: 0.2,  sight: 38, potion: 0.4,  react: 0.3,  leash: 25 },
  hard:   { name: 'hard',   think: 0.3,  aimErr: 0.035, dodge: 0.92, aggr: 1.25, need: 1.2, flee: 0.2,  sight: 42, potion: 0.42, react: 0.15, leash: 22 },
};
export function diffOf(v) {
  if (v && typeof v === 'object' && v.think) return v;
  if (typeof v === 'string' && DIFF[v]) return DIFF[v];
  if (v === 0) return DIFF.easy;
  if (v === 2) return DIFF.hard;
  return DIFF.normal;
}

// stable per-run generator: no Math.random anywhere (deterministic per seed)
export function makeRng(st, teamId) { return mulberry32(((st.seed | 0) * 131 + teamId * 977 + 12345) | 0); }

// aim jitter (normal-ish) around a point as seen from the hero
export function jitterAim(rng, h, x, z, err) {
  if (!err) return [x, z];
  const a = (rng() + rng() + rng() - 1.5) * 1.3 * err, ca = Math.cos(a), sa = Math.sin(a);
  const dx = x - h.x, dz = z - h.z;
  return [h.x + dx * ca - dz * sa, h.z + dx * sa + dz * ca];
}

// first defined value from a list of getters (defensive access to other lanes' evolving state)
export function pick(...fns) { for (const f of fns) { try { const v = f(); if (v !== undefined && v !== null) return v; } catch (e) { /* lane not there yet */ } } return undefined; }
