// MAGIC lane: persistent area effects in st.zones (owner: MAGIC).
// zone = {id, kind:'plague'|'totem'|'storm'|'hellfire'|'aura'|'gate'|'bloodrain'|'sanctuary'|'prison'|'flame'|'telegraph'|'fire', spell, x,z,r, born, until, team, dps, heal, slow, dtype, bldDps, buff, every, next, pow, follow(caster id)}
import { emit } from './core.js';
import * as Fx from './magic_fx.js';
import { SPELLS } from './magic_data.js';

const TICK = 0.5;

export function createZone(st, o) {
  const z = { id: st.nextId++, born: st.t, next: st.t + (o.every || TICK), pow: 1, ...o };
  z.until = st.t + (o.dur || 5);
  st.zones.push(z);
  emit(st, { type: 'zone', id: z.id, kind: z.kind, spell: z.spell, x: z.x, z: z.z, r: z.r, dur: o.dur || 5, team: z.team });
  return z;
}

function dmgTick(st, z, dt) {
  const src = Fx.spellSrc(z.team, z.x, z.z);
  if (z.dps) for (const u of Fx.foes(st, z.team, z.x, z.z, z.r)) Fx.hurt(st, src, u, z.dps * dt * z.pow, z.dtype || 'dark');
  if (z.bldDps) for (const b of Fx.bldFoes(st, z.team, z.x, z.z, z.r)) { Fx.hurt(st, src, b, z.bldDps * dt * z.pow, z.dtype || 'fire', true); if (z.ignite) Fx.ignite(st, b); }
  if (z.slow) for (const u of Fx.foes(st, z.team, z.x, z.z, z.r)) Fx.slow(st, u, z.slow, 1.2);
  if (z.heal) for (const u of Fx.friends(st, z.team, z.x, z.z, z.r)) Fx.heal(st, u, z.heal * dt * z.pow);
  if (z.buff) for (const u of Fx.friends(st, z.team, z.x, z.z, z.r)) Fx.buff(st, u, z.buff.id, 1.2, z.buff);
}
function storm(st, z) {
  const a = st.rng() * Math.PI * 2, d = Math.sqrt(st.rng()) * z.r, x = z.x + Math.cos(a) * d, zz = z.z + Math.sin(a) * d;
  const src = Fx.spellSrc(z.team, x, zz);
  for (const u of Fx.foes(st, z.team, x, zz, z.strikeR)) Fx.hurt(st, src, u, z.strike * z.pow, 'lightning');
  for (const b of Fx.bldFoes(st, z.team, x, zz, z.strikeR)) Fx.hurt(st, src, b, z.strike * (z.bldStrike || 1) * z.pow, 'lightning', true);
  emit(st, { type: 'bolt', spell: z.spell, x0: x, z0: zz + 0.01, x1: x, z1: zz, sky: true });
}
function gate(st, z) {
  const names = z.unit || ['imp'];
  Fx.summon(st, z.team, names, 1, z.x, z.z, 2.5, 35, { fromGate: z.id });
  emit(st, { type: 'bolt', spell: z.spell, x0: z.x, z0: z.z, x1: z.x, z1: z.z, gate: true });
}

export function impact(st, z) {
  const sp = SPELLS[z.spell];
  if (!sp) return;
  const src = Fx.spellSrc(z.team, z.x, z.z);
  for (const u of Fx.foes(st, z.team, z.x, z.z, z.r)) {
    const f = 1 - 0.4 * (Math.hypot(u.x - z.x, u.z - z.z) / z.r);
    Fx.hurt(st, src, u, sp.dmg * z.pow * f, sp.dtype);
  }
  for (const b of Fx.bldFoes(st, z.team, z.x, z.z, z.r)) { Fx.hurt(st, src, b, sp.dmg * (sp.bld || 0.5) * z.pow, sp.dtype, !!sp.siege); if (sp.ignite) Fx.ignite(st, b); }
  emit(st, { type: 'impact', spell: z.spell, x: z.x, z: z.z, r: z.r, team: z.team });
  if (sp.ignite) createZone(st, { kind: 'fire', spell: z.spell, x: z.x, z: z.z, r: z.r * 0.7, dur: 6, team: z.team, dps: 14, dtype: 'fire', bldDps: 4, ignite: true, pow: z.pow });
}

export function update(st, dt) {
  const zs = st.zones;
  for (let i = zs.length - 1; i >= 0; i--) {
    const z = zs[i];
    if (!z.spell) continue; // zones of other lanes
    if (z.follow) { const c = st.byId.get(z.follow); if (c && c.alive !== false && c.hp > 0) { z.x = c.x; z.z = c.z; } else z.until = 0; }
    if (st.t < z.until) {
      if (st.t >= z.next) {
        const dtt = z.every || TICK;
        z.next += dtt;
        if (z.next < st.t) z.next = st.t + dtt;
        if (z.kind === 'storm') storm(st, z); else if (z.kind === 'gate') gate(st, z); else if (z.kind !== 'telegraph') dmgTick(st, z, dtt);
      }
    } else {
      if (z.kind === 'telegraph') impact(st, z);
      zs.splice(i, 1);
    }
  }
}
