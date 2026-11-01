// XP curve and kill-XP values (pure functions, no state). Tuning notes:
// xpNeed(l) = XP to go from level l to l+1 (cumulative: L5 421, L10 2402, L15 6680, L20 13807). Full table: node tools/rpg-skills-test.js
// Target: ~20 min average match (about 40 monster kills, 1-2 rivals, a few quests) -> level 10-12; great play -> 15+.
import { MONSTERS, TIER_MUL } from '../../data.js';

export const xpNeed = (lvl) => Math.round(20 * Math.pow(Math.max(1, lvl), 1.5) + 20);

// victim: actor. Monsters use MONSTERS[victim.type].xp * tier multiplier * (1 + 6%/level above 1); bosses x3.
// A victim may carry an explicit `xpValue` (number) that overrides everything (quests/flow can use it).
export function xpValue(v) {
  if (!v) return 0;
  if (typeof v.xpValue === 'number') return Math.round(v.xpValue);
  const lvl = Math.max(1, v.lvl || 1);
  if (v.kind === 'rival' || v.kind === 'player') return Math.round(110 + 40 * lvl + (v.kills || 0) * 12);
  if (v.kind === 'npc') return 5;
  const def = (v.type && MONSTERS[v.type]) || null;
  const base = def ? def.xp : 8 + lvl * 4;
  const tier = v.tier || 1;
  if ((def && def.boss) || v.boss) return Math.round(base * 2.5); // bosses: flat, huge (Drowned King = 1000)
  const x = base * (TIER_MUL[Math.min(4, Math.max(0, tier))] || 1) * (1 + 0.06 * (lvl - 1));
  return Math.max(1, Math.round(x));
}
