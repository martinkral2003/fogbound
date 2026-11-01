// FOGBOUND: DOMINION magic (MAGIC lane). Facade: schools/spells, mana, casting, zones, spell research, tower casting, AI suggestions.
// Files: magic_data(+2).js spells, magic_mana.js, magic_fx.js helpers, magic_effects.js, magic_zones.js, magic_cast.js, magic_ai.js.
// Contract extras (documented in the report): events heal{tgt,amt,x,z} bolt{spell,x0,z0,x1,z1} zone{id,kind,x,z,r,dur} impact{spell,x,z,r};
// st.reveals[{team,x,z,r,until}], st.magicCorpses, unit fields shield/shieldUntil, dot, thralled, buffs[{id,until,src:'magic',dmg,spd,as,armor,take}], stunUntil.
import { killEnt, emit } from './core.js';
import { SPELLS, SCHOOLS, SPELL_LIST } from './magic_data.js';
import * as Mana from './magic_mana.js';
import * as Fx from './magic_fx.js';
import * as Zones from './magic_zones.js';
import * as C from './magic_cast.js';
import * as MAI from './magic_ai.js';

export { SPELLS, SCHOOLS, SPELL_LIST };
export const cast = C.cast, inRange = C.inRange, spellsFor = C.spellsFor, descSpell = C.descSpell, researchable = C.researchable;
export const onResearched = C.onResearched, grantSpell = C.grantSpell, techInfo = C.techInfo, ensureTechs = C.ensureTechs, isKnown = C.isKnown, initTeam = C.initTeam;
export const suggest = MAI.suggest, towerCast = MAI.towerCast, manaInfo = (st, teamId) => Mana.info(st, st.teams[teamId]);
export { teleport } from './magic_effects.js';
export const createZone = Zones.createZone;
try { C.ensureTechs(); } catch (e) { /* retried lazily */ }

// ---------------------------------------------------------------- commands
export function command(st, teamId, cmd) {
  if (cmd.t !== 'cast') return false;
  const caster = st.byId.get(cmd.caster);
  const team = st.teams[teamId];
  if (!caster || caster.team !== teamId || !SPELLS[cmd.spell]) return true;
  const r = C.cast(st, teamId, cmd.spell, caster, cmd.x, cmd.z, cmd.target);
  if (!r.ok && r.range && caster.kind === 'unit') {
    const order = { type: 'cast', spell: cmd.spell, x: cmd.x, z: cmd.z, target: cmd.target, since: st.t };
    if (cmd.queue) caster.orders.push(order); else caster.orders = [order];
    caster.order = caster.orders[0];
  } else if (!r.ok && team.human) emit(st, { type: 'msg', team: teamId, kind: 'warn', text: r.reason });
  return true;
}

// processor for {type:'cast'} orders (the UNITS lane only stores them): when the cast order is current, cast; if out of range, insert a move
// order to just inside range and retry (max 5 tries).
function castOrders(st, u) {
  const o = u.order;
  if (!o || o.type !== 'cast' || u.stun > 0) return;
  const r = C.cast(st, u.team, o.spell, u, o.x, o.z, o.target);
  if (r.range && (o.tries = (o.tries || 0) + 1) <= 5) {
    const tg = o.target ? st.byId.get(o.target) : null, tx = tg ? tg.x : o.x, tz = tg ? tg.z : o.z, sp = SPELLS[o.spell];
    const d = Math.hypot(tx - u.x, tz - u.z) || 1, back = Math.max(0, d - sp.range * 0.8);
    u.orders.unshift({ type: 'move', x: u.x + ((tx - u.x) / d) * back, z: u.z + ((tz - u.z) / d) * back });
    u.order = u.orders[0];
    return;
  }
  if (r.reason === 'Caster is busy') return;
  if (u.order === o) { u.orders.shift(); u.order = u.orders[0] || null; }
}

// ---------------------------------------------------------------- per-tick
function perEnt(st, u, dt) {
  if (u.buffs && u.buffs.length || u.stunUntil || u.rootUntil) Fx.expire(st, u);
  if (u.mana !== undefined) Mana.updateUnit(u, dt);
  else if (u.role === 'general' || u.role === 'caster') Mana.unitPool(u);
  if (u.dot) {
    if (st.t >= u.dot.until) u.dot = null;
    else if (st.t >= (u.dot.next || 0)) { u.dot.next = st.t + 0.5; Fx.hurt(st, Fx.spellSrc(u.dot.team, u.x, u.z), u, u.dot.dps * 0.5, u.dot.dtype); }
  }
  if (u.shieldUntil) {
    if (st.t >= u.shieldUntil || !(u.shield > 0)) {
      const b = u.shieldBurst; u.shield = 0; u.shieldUntil = 0; u.shieldBurst = null;
      if (b && u.alive) {
        const src = Fx.spellSrc(b.team, u.x, u.z);
        for (const f of Fx.foes(st, b.team, u.x, u.z, b.r)) Fx.hurt(st, src, f, b.dmg, 'dark');
        emit(st, { type: 'impact', spell: 'martyr_blessing', x: u.x, z: u.z, r: b.r, team: b.team });
      }
    }
  }
  if (u.expireAt && st.t >= u.expireAt && u.alive) { u.noSouls = true; killEnt(st, u, null); }
  if (u.order && u.order.type === 'cast') castOrders(st, u);
}
export function update(st, dt) {
  C.ensureTechs();
  for (const t of st.teams) {
    if (!t.alive) continue;
    C.initTeam(t);
    Mana.updateTeam(st, t, dt);
    for (const k in t.tech) if (t.tech[k] && k.startsWith('spell:') && !t.spells[k.slice(6)]) t.spells[k.slice(6)] = true;
  }
  Fx.scanCorpses(st);
  for (const u of st.ents) if (u.alive) perEnt(st, u, dt);
  Zones.update(st, dt);
  if (st.reveals && st.reveals.length) st.reveals = st.reveals.filter((r) => r.until > st.t);
}
