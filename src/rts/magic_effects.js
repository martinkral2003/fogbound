// MAGIC lane: instant spell effects by `kind` (owner: MAGIC). Each effect(st, c) with c = {spell, team(obj), caster, x, z, target(ent|bld|null), pow}.
import { emit, killEnt } from './core.js';
import * as Fx from './magic_fx.js';
import { createZone } from './magic_zones.js';

const center = (c) => (c.spell.target === 'self' ? { x: c.caster.x, z: c.caster.z } : { x: c.x, z: c.z });
const src = (c, p) => (c.caster && c.caster.alive !== false ? c.caster : Fx.spellSrc(c.team.id, p.x, p.z));
const tid = (c) => c.team.id;

function kill(st, c, u, sp) {
  if (u.alive) return;
  if (sp.soulsPerKill) c.team.res.souls = (c.team.res.souls || 0) + sp.soulsPerKill;
  if (sp.manaPerKill) c.team.mana = Math.min(c.team.manaMax, c.team.mana + sp.manaPerKill);
  if (sp.soulOnKill) c.team.res.souls = (c.team.res.souls || 0) + sp.soulOnKill;
}

function aoe(st, c) {
  const sp = c.spell, p = center(c), s = src(c, p);
  let n = 0;
  if (sp.dmg || sp.stun || sp.slow) {
    for (const u of Fx.foes(st, tid(c), p.x, p.z, sp.radius)) {
      const f = 1 - 0.3 * (Math.hypot(u.x - p.x, u.z - p.z) / sp.radius);
      if (sp.dmg) Fx.hurt(st, s, u, sp.dmg * c.pow * f, sp.dtype);
      if (u.alive) { if (sp.stun) Fx.stun(st, u, sp.stun); if (sp.slow) Fx.slow(st, u, sp.slow.amt, sp.slow.dur); } else kill(st, c, u, sp);
      n++;
    }
    if (sp.dmg) for (const b of Fx.bldFoes(st, tid(c), p.x, p.z, sp.radius)) { Fx.hurt(st, s, b, sp.dmg * (sp.bld === undefined ? 0.5 : sp.bld) * c.pow, sp.dtype, !!sp.siege); if (sp.ignite) Fx.ignite(st, b); n++; }
  }
  if (sp.heal) for (const u of Fx.friends(st, tid(c), p.x, p.z, sp.radius)) n += Fx.heal(st, u, sp.heal * c.pow) > 0 ? 1 : 0;
  return true;
}

function bolt(st, c) {
  const sp = c.spell, u = c.target, s = src(c, u);
  if (!u) return false;
  emit(st, { type: 'bolt', spell: sp.id, x0: c.caster.x, z0: c.caster.z, x1: u.x, z1: u.z });
  if (u.team === tid(c)) { if (sp.healAlly) Fx.heal(st, u, sp.healAlly * c.pow); return true; }
  const k = u.kind === 'bld' ? (sp.bld === undefined ? 0.5 : sp.bld) : 1;
  const dealt = Fx.hurt(st, s, u, sp.dmg * k * c.pow, sp.dtype);
  if (!u.alive && u.kind === 'unit') kill(st, c, u, sp);
  if (sp.drain && dealt > 0) {
    const amt = dealt * sp.drain, got = c.caster.kind === 'unit' ? Fx.heal(st, c.caster, amt) : 0;
    if (amt - got > 1) { const lo = Fx.friends(st, tid(c), c.caster.x, c.caster.z, 9, (f) => f.hp < f.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (lo) Fx.heal(st, lo, amt - got); }
  }
  if (sp.burn && u.alive && u.kind === 'unit') Fx.burn(st, u, sp.burn.dps, sp.burn.dur, tid(c));
  if (sp.manaBurn && u.kind === 'unit') {
    if (u.mana > 0) u.mana = Math.max(0, u.mana - sp.manaBurn);
    if (u.general) { const et = st.teams[u.team]; if (et) et.mana = Math.max(0, et.mana - sp.manaBurn * 0.5); }
  }
  return true;
}

function chain(st, c) {
  const sp = c.spell, hit = new Set(), s = c.caster;
  let cur = c.target, from = { x: s.x, z: s.z }, dmg = sp.dmg * c.pow;
  for (let i = 0; i < sp.jumps && cur; i++) {
    hit.add(cur.id);
    emit(st, { type: 'bolt', spell: sp.id, x0: from.x, z0: from.z, x1: cur.x, z1: cur.z });
    Fx.hurt(st, s, cur, dmg * (cur.kind === 'bld' ? sp.bld : 1), sp.dtype);
    from = { x: cur.x, z: cur.z }; dmg *= sp.falloff;
    let best = null, bd = sp.jumpR;
    for (const u of Fx.foes(st, tid(c), from.x, from.z, sp.jumpR)) { if (hit.has(u.id)) continue; const d = Math.hypot(u.x - from.x, u.z - from.z); if (d < bd) { bd = d; best = u; } }
    cur = best;
  }
  return true;
}

function buffEffect(st, c) {
  const sp = c.spell, p = center(c);
  for (const u of Fx.friends(st, tid(c), p.x, p.z, sp.radius)) Fx.buff(st, u, sp.buff.id, sp.dur, sp.buff);
  return true;
}
function debuff(st, c) {
  const sp = c.spell;
  for (const u of Fx.foes(st, tid(c), c.x, c.z, sp.radius)) Fx.buff(st, u, sp.buff.id, sp.dur, sp.buff);
  return true;
}

function summon(st, c) {
  const sp = c.spell, p = center(c);
  const r = Fx.summon(st, tid(c), sp.unit, sp.n, p.x, p.z, sp.radius || 3, sp.life, { summonSpell: sp.id });
  return r.length > 0;
}
function raise(st, c) {
  const sp = c.spell, list = Fx.corpsesNear(st, c.x, c.z, sp.radius).slice(0, sp.max);
  let n = 0;
  for (const cp of list) { const r = Fx.summon(st, tid(c), sp.unit, 1, cp.x, cp.z, 0.5, sp.life, { summonSpell: sp.id }); if (r.length) { Fx.removeCorpse(st, cp); n++; } }
  return n > 0;
}
function prison(st, c) {
  const sp = c.spell;
  for (const u of Fx.foes(st, tid(c), c.x, c.z, sp.radius, (f) => f.layer !== 'wall')) Fx.root(st, u, sp.dur);
  createZone(st, { kind: 'prison', spell: sp.id, x: c.x, z: c.z, r: sp.radius, dur: sp.dur, team: tid(c), dps: sp.dps, dtype: sp.dtype, pow: c.pow });
  return true;
}
function zone(st, c) {
  const sp = c.spell, p = center(c);
  const o = { kind: sp.zk, spell: sp.id, x: p.x, z: p.z, r: sp.radius, dur: sp.dur, team: tid(c), pow: c.pow };
  for (const k of ['dps', 'heal', 'slow', 'dtype', 'bldDps', 'buff', 'every', 'strike', 'strikeR', 'bldStrike', 'unit', 'ignite']) if (sp[k] !== undefined) o[k] = sp[k];
  if (sp.follow) o.follow = c.caster.id;
  createZone(st, o);
  return true;
}
function flamewall(st, c) {
  const sp = c.spell, dx = c.x - c.caster.x, dz = c.z - c.caster.z, l = Math.hypot(dx, dz) || 1;
  const px = -dz / l, pz = dx / l, half = sp.radius;
  for (let i = 0; i < sp.segs; i++) {
    const f = sp.segs === 1 ? 0 : (i / (sp.segs - 1)) * 2 - 1;
    createZone(st, { kind: 'flame', spell: sp.id, x: c.x + px * half * f, z: c.z + pz * half * f, r: sp.segR, dur: sp.dur, team: tid(c), dps: sp.dps, dtype: sp.dtype, bldDps: 8, ignite: true, pow: c.pow });
  }
  return true;
}
function delay(st, c) {
  const sp = c.spell;
  createZone(st, { kind: 'telegraph', spell: sp.id, x: c.x, z: c.z, r: sp.radius, dur: sp.delay, team: tid(c), pow: c.pow });
  return true;
}
function blast(st, c) {
  const sp = c.spell, b = c.target;
  if (!b) return false;
  const s = src(c, b);
  emit(st, { type: 'bolt', spell: sp.id, x0: c.caster.x, z0: c.caster.z, x1: b.x, z1: b.z });
  Fx.hurt(st, s, b, sp.dmg * c.pow, sp.dtype, true);
  for (const o of Fx.bldFoes(st, tid(c), b.x, b.z, sp.radius)) if (o !== b) Fx.hurt(st, s, o, sp.dmg * sp.splash * c.pow, sp.dtype, true);
  for (const u of Fx.foes(st, tid(c), b.x, b.z, sp.radius)) Fx.hurt(st, s, u, sp.dmg * 0.12 * c.pow, 'physical');
  return true;
}
function sacrifice(st, c) {
  const sp = c.spell, u = c.target;
  if (!u || u.team !== tid(c) || u === c.caster || u.general) return false;
  killEnt(st, u, null);
  c.team.mana = Math.min(c.team.manaMax, c.team.mana + sp.mana * c.pow);
  c.team.res.souls = (c.team.res.souls || 0) + sp.souls;
  for (const f of Fx.friends(st, tid(c), c.caster.x, c.caster.z, sp.radius)) Fx.buff(st, f, sp.buff.id, sp.dur, sp.buff);
  return true;
}
function shield(st, c) {
  const sp = c.spell, u = c.target;
  if (!u || u.team !== tid(c)) return false;
  u.shield = (u.shield || 0) + sp.amount * c.pow; u.shieldUntil = c.st_t + sp.dur; u.shieldBurst = { dmg: sp.burst * c.pow, r: sp.burstR, team: tid(c) };
  Fx.buff(st, u, 'martyr', sp.dur, { armor: 15 });
  return true;
}
function thrall(st, c) {
  const sp = c.spell, u = c.target;
  if (!u || u.team === tid(c) || u.general || u.kind !== 'unit' || u.charm || (u.def && u.def.boss)) return false;
  // same mechanism as the UNITS lane's charm: combat.js reverts u.charm after `until`. Pop stays with popTeam.
  u.charm = { until: c.st_t + sp.dur, back: u.team };
  u.team = c.team.id; u.orders = []; u.order = null; u.tgt = 0; u.path = null; u.thralled = true;
  return true;
}
export function teleport(st, u, x, z) {
  if (st.world.walkable && !st.world.walkable(x, z)) return false;
  u.x = x; u.z = z; u.y = st.world.heightAt(x, z); u.orders = []; u.order = null; u.path = null;
  return true;
}
function tele(st, c) {
  const l = Math.hypot(c.x - c.caster.x, c.z - c.caster.z), k = Math.min(1, c.spell.range / (l || 1));
  const nx = c.caster.x + (c.x - c.caster.x) * k, nz = c.caster.z + (c.z - c.caster.z) * k;
  emit(st, { type: 'bolt', spell: c.spell.id, x0: c.caster.x, z0: c.caster.z, x1: nx, z1: nz, blink: true });
  return c.caster.kind === 'unit' && teleport(st, c.caster, nx, nz);
}
function reveal(st, c) {
  (st.reveals || (st.reveals = [])).push({ team: tid(c), x: c.x, z: c.z, r: c.spell.radius, until: c.st_t + c.spell.dur });
  return true;
}

export const EFFECTS = { aoe, bolt, chain, buff: buffEffect, debuff, summon, raise, prison, zone, flamewall, delay, blast, sacrifice, shield, thrall, teleport: tele, reveal };
