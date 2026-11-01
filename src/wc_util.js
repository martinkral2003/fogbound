// Shared helpers of the WORLD CONTENT lane (dungeons.js, pois.js). Sim-side only, no DOM/Three. See src/V3.md.
// Cross-lane calls are optional and defensive: perks.grantXP (HERO lane), research.addPoints (TOWER lane), perks.reroll (HERO lane).
import { simApi } from './sim.js';
import { ITEM_SLOTS } from './data.js';
import * as loot from './loot.js';
import * as perks from './perks.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const msg = (st, text, kind = 'info', team) => simApi.ev(st, team === undefined ? { type: 'msg', text, kind } : { type: 'msg', text, kind, team });

// XP through the HERO lane when it exists (so perk/level hooks fire), else the sim's own giveXP (hero within 50 m + servants within 32 m)
export function grantXP(st, teamId, amt, reason, x, z) {
  if (!(amt > 0) || teamId < 0) return;
  const team = st.teams[teamId];
  if (x === undefined && team.hero) { x = team.hero.x; z = team.hero.z; }
  if (typeof perks.grantXP === 'function') { try { perks.grantXP(st, teamId, amt, reason, x, z); return; } catch (e) { /* fall through */ } }
  simApi.giveXP(st, teamId, x, z, amt);
}

// research points through the TOWER lane when it exists, else a plain counter on team.res (same shape as V3.md)
export function addResearch(st, teamId, n) {
  return false; // v0.4: research is gone (kept as a no-op for dungeon / POI rewards that still call it)
}

// one legendary-rarity item on the ground at (x, z)
export function dropLegendary(st, x, z) {
  const slots = ITEM_SLOTS && ITEM_SLOTS.length ? ITEM_SLOTS : ['weapon', 'armor', 'charm'];
  const slot = slots[Math.floor(st.rng() * slots.length) % slots.length];
  let it = null;
  try { it = loot.makeItem(st.rng, slot, 4, 4); } catch (e) { it = null; }
  if (!it && loot.rollBossItem) it = loot.rollBossItem(st.rng, slot);
  if (it) simApi.dropItem(st, x, z, it);
}

// nearest walkable point to (x, z) within a few rings (world.walkable may be missing or coarse)
export function walkableNear(st, x, z) {
  const w = st.world;
  if (!w.walkable || w.walkable(x, z)) return [x, z];
  for (let r = 2; r <= 12; r += 2) for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (w.walkable(px, pz)) return [px, pz];
  }
  return [x, z];
}

// alive entity of team near a point (hero first)
export function teamNear(st, teamId, x, z, r) {
  const t = st.teams[teamId], h = t && t.hero;
  if (h && h.alive && Math.hypot(h.x - x, h.z - z) <= r) return h;
  for (const e of st.ents) if (e.alive && e.kind === 'unit' && e.team === teamId && !e.temp && Math.hypot(e.x - x, e.z - z) <= r) return e;
  return null;
}

// a camp record for guard monsters that never respawn (campsUpdate skips c.noResp)
export function makeCamp(st, x, z, tier, types, extra = {}) {
  const camp = Object.assign({ id: st.camps.length, x, z, tier, types, biome: 0, mons: 0, respT: 0, boss: false, noResp: true }, extra);
  st.camps.push(camp);
  return camp;
}

// champion-style flavour for hand-made bosses (mirrors applyChampion in sim.js; recalc() then picks up eliteHp/eliteDmg/affRes)
export function bossFlavor(e, o) {
  e.elite = 2; e.title = o.title; e.eliteHp = o.hp; e.eliteDmg = o.dmg; e.affixes = (o.affixes || []).slice(); e.affRes = e.affRes || {};
  if (o.scale) e.r *= o.scale;
  for (const id of e.affixes) {
    if (id === 'fast') { e.spd *= 1.35; e.cd *= 0.78; }
    else if (id === 'fire') { e.dtype = 'fire'; e.affRes.fire = 75; }
    else if (id === 'frozen') { e.affRes.cold = 75; e.auraT = 0; }
    else if (id === 'thorns') e.thorns = 0.15;
    else if (id === 'storm') { e.dtype = 'lightning'; e.affRes.lightning = 75; }
  }
  e.xpV *= 3; e.goldV *= 3;
  simApi.recalc(e);
  e.hp = e.maxHp;
}

// true when a hero or non-temporary servant of any team is within r of (x, z)
export function anyTeamWithin(st, x, z, r) {
  for (const e of st.ents) if (e.alive && e.team >= 0 && (e.kind === 'hero' || (e.kind === 'unit' && !e.temp)) && Math.abs(e.x - x) < r && Math.abs(e.z - z) < r && Math.hypot(e.x - x, e.z - z) < r) return true;
  return false;
}
