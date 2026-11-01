// MAGIC lane: mana economy (owner: MAGIC). team.mana/manaMax/manaRegen fed by buildings (provides.mana/manaRegen), held ley lines
// (st.neutral kind 'leyline' owner===team.id), tech (Tech.mod mana/manaRegen), plus small per-unit pools for generals/casters (unit.mana).
import { MANA, MANA_FALLBACK } from './magic_data.js';
import * as Buildings from './buildings.js';
import * as Tech from './tech.js';

const safe = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
const isReady = (b) => b.team >= 0 && b.state !== 'ruin' && b.state !== 'building' && !(b.progress !== undefined && b.progress < 1);

// buildings: {max, regen} contributed by one building
export function bldMana(b) {
  const def = safe(() => Buildings.def(b.type), null);
  const p = b.provides || (def && def.provides) || null;
  if (p && p.mana !== undefined) return { max: p.mana * MANA.perProvide * 60, regen: p.manaRegen !== undefined ? p.manaRegen : p.mana * MANA.perProvide };
  const fb = MANA_FALLBACK[b.type];
  if (fb) return { max: fb, regen: fb * MANA.perProvide };
  return null;
}

// recompute the team's pool limits (cached for 0.5 s of sim time)
export function recompute(st, team) {
  const src = { base: MANA.base, baseRegen: MANA.baseRegen, bld: 0, bldRegen: 0, ley: 0, leyRegen: 0, tech: 0, techRegen: 0, leys: 0, blds: 0 };
  for (const b of st.blds) {
    if (b.team !== team.id || !isReady(b)) continue;
    const m = bldMana(b);
    if (m) { src.bld += m.max; src.bldRegen += m.regen; src.blds++; }
  }
  for (const n of st.neutral || []) {
    if (n.kind === 'leyline' && n.owner === team.id) { src.leys++; src.ley += n.mana || MANA.ley.max; src.leyRegen += n.regen || MANA.ley.regen; }
  }
  src.tech = safe(() => Tech.mod(team, 'mana'), 0);
  src.techRegen = safe(() => Tech.mod(team, 'manaRegen'), 0);
  const max = src.base + src.bld + src.ley + src.tech, regen = src.baseRegen + src.bldRegen + src.leyRegen + src.techRegen;
  team.manaMax = Math.min(MANA.cap, max);
  team.manaRegen = Math.min(MANA.regenCap, regen);
  team._manaSrc = src;
  team._manaAt = st.t;
  return src;
}

export function updateTeam(st, team, dt) {
  if (team._manaAt === undefined || st.t - team._manaAt >= 0.5) recompute(st, team);
  if (team._mana0 === undefined) { team._mana0 = true; team.mana = Math.max(team.mana || 0, Math.min(team.manaMax, 60)); }
  team.mana = Math.min(team.manaMax, team.mana + team.manaRegen * dt);
}

// per-unit pool (generals / caster units). Lazily created; regenerates slowly. Spending drains the unit pool first.
export function unitPool(u) {
  if (u.kind !== 'unit') return null;
  if (u.mana === undefined) {
    const cap = u.role === 'general' ? MANA.unitPool.general + 4 * (u.lvl || 1) : u.role === 'caster' ? MANA.unitPool.caster + 3 * ((u.vet || 1) - 1) : 0;
    if (!cap) return null;
    u.manaMax = cap; u.mana = cap;
  }
  return u;
}
export function updateUnit(u, dt) {
  if (u.mana === undefined || !u.alive) return;
  if (u.mana < u.manaMax) u.mana = Math.min(u.manaMax, u.mana + MANA.unitRegen * dt);
}
// pay `need` mana: unit pool first, remainder from team pool. Returns false (no change) when unaffordable.
export function canPayMana(team, caster, need) {
  const up = caster && caster.mana !== undefined ? caster.mana : 0;
  return team.mana + up >= need - 1e-6;
}
export function payMana(team, caster, need) {
  if (!canPayMana(team, caster, need)) return false;
  const fromUnit = caster && caster.mana !== undefined ? Math.min(caster.mana, need) : 0;
  if (fromUnit > 0) caster.mana -= fromUnit;
  team.mana = Math.max(0, team.mana - (need - fromUnit));
  return true;
}
export function info(st, team) {
  if (!team._manaSrc) recompute(st, team);
  return { mana: team.mana, max: team.manaMax, regen: team.manaRegen, sources: team._manaSrc };
}
