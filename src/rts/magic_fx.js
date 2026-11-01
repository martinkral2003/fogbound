// MAGIC lane helpers (owner: MAGIC): targeting queries, damage/heal/buff/status wrappers (defensive vs the UNITS/COMBAT lanes), summons, corpses.
import { emit, killEnt } from './core.js';
import * as Units from './units.js';
import * as Combat from './combat.js';

export const safe = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { if (typeof process !== 'undefined' && process.env && process.env.MAGIC_DEBUG) console.error(e); return d; } };
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const spellSrc = (team, x, z) => ({ id: 0, kind: 'spell', team, x, z, alive: true });

export function foes(st, team, x, z, r, f) {
  const out = [], r2 = r * r;
  for (const e of st.ents) if (e.alive && e.team !== team && !e.garrison && (e.x - x) ** 2 + (e.z - z) ** 2 <= r2 && !e.untargetable && (!f || f(e))) out.push(e);
  return out;
}
export function friends(st, team, x, z, r, f) {
  const out = [], r2 = r * r;
  for (const e of st.ents) if (e.alive && e.team === team && (e.x - x) ** 2 + (e.z - z) ** 2 <= r2 && (!f || f(e))) out.push(e);
  return out;
}
export function bldFoes(st, team, x, z, r) {
  const out = [];
  for (const b of st.blds) if (b.team !== team && b.state !== 'ruin' && b.hp > 0 && !b.trap && Math.hypot(b.x - x, b.z - z) <= r + Math.max(b.w || 0, b.d || 0) * 0.5) out.push(b);
  return out;
}
export function isUndead(u) { return u.team === 0 || /skeleton|ghoul|wraith|lich|bone|undead|zombie/.test(u.type || ''); }

// ---------------------------------------------------------------- power / damage / heal
export function powerOf(st, caster, team) {
  let p = 1;
  if (caster && caster.kind === 'unit') { if (caster.general) p += 0.05 * ((caster.lvl || 1) - 1); else p += 0.04 * ((caster.vet || 1) - 1); }
  if (team && team.tech && team.tech.magic_3) p += 0.1;
  return p;
}
export function hurt(st, src, tgt, amt, dtype, siege) {
  if (!tgt || !(tgt.hp > 0) || amt <= 0) return 0;
  if (tgt.inv || tgt.invulnerable) return 0;
  const o = { dtype, spell: true }; if (siege) o.siege = true; if (dtype === 'fire') o.fire = true;
  return safe(() => Combat.damage(st, src, tgt, amt, o), 0);
}
export function heal(st, tgt, amt) {
  if (!tgt || !tgt.alive || !(tgt.hp > 0)) return 0;
  const add = Math.min(tgt.maxHp - tgt.hp, amt);
  if (add <= 0) return 0;
  tgt.hp += add;
  emit(st, { type: 'heal', tgt: tgt.id, amt: add, x: tgt.x, z: tgt.z });
  return add;
}
export function ignite(st, b) {
  const timber = !b.wall || (b.wall.tier || 0) <= 0 || /timber|palisade|wood|hut|house|farm/.test(b.type || '');
  if (b.burns === false || !timber) return false;
  b.burning = true; if (b.state === 'ready') b.burnT = Math.max(b.burnT || 0, 6);
  emit(st, { type: 'fire', x: b.x, z: b.z });
  return true;
}

// ---------------------------------------------------------------- buffs / statuses. Buff entry on u.buffs: {id, until, src:'magic', dmg, spd, as, armor, take, ...} (multipliers 1.x, armor additive)
export function buff(st, u, id, dur, mods) {
  if (!u || !u.alive) return;
  const m = { id, dur, until: st.t + dur };
  for (const k of ['dmg', 'spd', 'as', 'armor', 'take', 'regen', 'vis', 'root']) if (mods && mods[k] !== undefined) m[k] = mods[k];
  if (Combat.addBuff) { safe(() => Combat.addBuff(st, u, m), 0); if (u.buffs.some((x) => x.id === id)) return; }
  if (!u.buffs) u.buffs = [];
  m.t = dur; m.src = 'magic';
  const i = u.buffs.findIndex((x) => x.id === id);
  if (i >= 0) u.buffs[i] = m; else u.buffs.push(m);
}
export function stun(st, u, dur) {
  if (!u || !u.alive || u.noStun) return;
  if (Combat.addStatus) { safe(() => Combat.addStatus(st, u, 'stun', dur), 0); return; }
  u.stun = Math.max(u.stun || 0, dur); u.stunUntil = Math.max(u.stunUntil || 0, st.t + dur);
}
export function burn(st, u, dps, dur, team) {
  if (Combat.addStatus) { safe(() => Combat.addStatus(st, u, 'burn', dur, dps), 0); return; }
  u.dot = { dps, until: st.t + dur, team, dtype: 'fire' };
}
export function root(st, u, dur) { if (Combat.addStatus) safe(() => Combat.addStatus(st, u, 'root', dur), 0); else buff(st, u, 'root', dur, { spd: 0.001 }); }
export function slow(st, u, amt, dur) { buff(st, u, 'slow', dur, { spd: amt }); }
// fallback expiry, only for buffs/stun this module applied itself when Combat.addBuff/addStatus are missing
export function expire(st, u) {
  if (u.buffs && u.buffs.length) { const keep = u.buffs.filter((b) => !(b.src === 'magic' && b.until <= st.t)); if (keep.length !== u.buffs.length) u.buffs = keep; }
  if (u.stunUntil && st.t >= u.stunUntil) { u.stunUntil = 0; u.stun = 0; }
}

// ---------------------------------------------------------------- summons
export function resolveUnit(st, team, names) {
  const key = team.faction.key;
  const ids = [];
  for (const n of names) { ids.push(key + '_' + n); ids.push(n); }
  const R = Units.ROSTER;
  if (R) for (const id of ids) if (R[id]) return id;
  return ids[0];
}
export function summon(st, teamId, names, n, x, z, spread, life, extra) {
  const team = st.teams[teamId], type = resolveUnit(st, team, names), out = [];
  for (let i = 0; i < n; i++) {
    const a = st.rng() * Math.PI * 2, d = Math.sqrt(st.rng()) * spread;
    let px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (st.world.walkable && !st.world.walkable(px, pz)) { px = x; pz = z; }
    const u = safe(() => Units.spawn(st, type, teamId, px, pz, { ttl: life, life, summoned: true, noPop: true, bornAt: st.t, expireAt: st.t + life + 0.5, noSouls: true, ...extra }), null);
    if (u) out.push(u);
  }
  return out;
}
export function killSummon(st, u) { safe(() => killEnt(st, u, null), 0); u.alive = false; }

// ---------------------------------------------------------------- corpses (dead units are filtered from st.ents after ~4 s, so record them)
export function corpses(st) { return st.magicCorpses || (st.magicCorpses = []); }
export function scanCorpses(st) {
  const c = corpses(st);
  for (const e of st.ents) {
    if (e.alive || e._cps || e.summoned || e.role === 'siege' || e.role === 'flyer') continue;
    e._cps = true; c.push({ x: e.x, z: e.z, team: e.team, type: e.type, t: st.t, role: e.role });
  }
  while (c.length && (st.t - c[0].t > 30 || c.length > 40)) c.shift();
}
export function corpsesNear(st, x, z, r) { return corpses(st).filter((c) => (c.x - x) ** 2 + (c.z - z) ** 2 <= r * r); }
export function removeCorpse(st, c) { const a = corpses(st), i = a.indexOf(c); if (i >= 0) a.splice(i, 1); }
