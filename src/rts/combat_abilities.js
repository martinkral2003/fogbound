// UNITS lane: ability execution (unit abilities + general skills), auto-cast AI for units, death blasts, charm. Data in combat_abil_data.js.
// Public: cast(st,u,ab,tx,tz,target), orderStep (the 'ability' order), update (per unit per tick), onDeath, endCharm, ABIL.
import { emit, killEnt } from './core.js';
import { ABIL } from './combat_abil_data.js';
import * as C from './combat.js';
import * as Units from './units.js';
import { forNear, gap } from './units_grid.js';
import { stepMove } from './units_move.js';
import { validT } from './orders_target.js';

export { ABIL };
const abOf = (u, id) => u.abilities.find((a) => a.id === id);

function mana(st, u, D) {
  if (!D.mana) return true;
  const t = st.teams[u.team];
  if (!t || t.mana < D.mana) return false;
  t.mana -= D.mana;
  return true;
}
const allies = (st, u, x, z, r, fn) => forNear(st, x, z, r, (e) => { if (e.team === u.team && e.hp > 0) fn(e); return false; });

export function cast(st, u, ab, tx, tz, target) {
  const D = ABIL[ab.id];
  if (!D || ab.cd > 0) return false;
  if (u.silence > st.t && D.type !== 'explode') return false;
  const pw = 1 + 0.3 * ((ab.lvl || 1) - 1);
  const tgt = target && validT(target) ? target : null;
  if ((D.tgt === 'unit') && (!tgt || tgt.kind !== 'unit')) return false;
  if (D.range && D.tgt !== 'self' && D.tgt !== 'none') { const px = tgt ? tgt.x : tx, pz = tgt ? tgt.z : tz; if (Math.hypot(px - u.x, pz - u.z) > D.range + 1.5) return false; }
  if (!mana(st, u, D)) return false;
  const cx = D.tgt === 'self' || D.tgt === 'none' ? u.x : tgt ? tgt.x : tx, cz = D.tgt === 'self' || D.tgt === 'none' ? u.z : tgt ? tgt.z : tz;
  switch (D.type) {
    case 'aoe': {
      C.splash(st, u, u.team, cx, cz, D.radius, D.dmg * pw, {
        dtype: D.dtype, bldMul: D.bld, falloff: 0.35, srcUnit: u,
        after: (e) => { if (D.stun) C.addStatus(st, e, 'stun', D.stun, 0, u); if (D.slow) C.addStatus(st, e, 'slow', D.dur || 3, D.slow, u); if (D.burn) C.addStatus(st, e, 'burn', D.burn.dur, D.burn.dps * pw, u); },
      });
      if (D.selfHeal) C.heal(st, u, D.selfHeal * pw);
      break;
    }
    case 'drain': {
      const got = C.damage(st, u, tgt, D.dmg * pw, { dtype: D.dtype, srcUnit: u });
      C.heal(st, u, got * (D.lifesteal == null ? 1 : D.lifesteal));
      break;
    }
    case 'heal': {
      if (D.radius > 0) allies(st, u, cx, cz, D.radius, (e) => { if (e.kind === 'unit' && e.role !== 'siege') C.heal(st, e, D.heal * pw); });
      else if (tgt && tgt.team === u.team) C.heal(st, tgt, D.heal * pw);
      else return false;
      break;
    }
    case 'buff': {
      const b = D.buff, dur = D.dur * (1 + 0.1 * (pw - 1) / 0.3 * 0.3);
      if (D.radius > 0) allies(st, u, u.x, u.z, D.radius, (e) => { if (e.role !== 'worker') C.addBuff(st, e, b, dur); });
      C.addBuff(st, u, b, dur);
      break;
    }
    case 'charge': C.addBuff(st, u, D.buff, D.dur); break;
    case 'summon': {
      const n = Math.round(D.n * (1 + 0.25 * (pw - 1) / 0.3 * 0.3));
      for (let i = 0; i < n; i++) {
        const a = st.rng() * 6.283, r = 1 + st.rng() * 2.2;
        const s = Units.spawn(st, D.unit, u.team, cx + Math.cos(a) * r, cz + Math.sin(a) * r, { noPop: true, ttl: D.ttl });
        if (s) s.summoner = u.id;
      }
      break;
    }
    case 'explode': {
      u.exploded = true;
      C.splash(st, u, u.team, u.x, u.z, D.radius, D.dmg, { dtype: D.dtype, bldMul: D.bld, falloff: 0.4, srcUnit: u });
      if (D.heal) allies(st, u, u.x, u.z, D.radius + 2, (e) => { if (e !== u) C.heal(st, e, D.heal); });
      emit(st, { type: 'cast', caster: u.id, spell: D.id, x: u.x, z: u.z });
      killEnt(st, u, null);
      return true;
    }
    case 'charm': {
      if (tgt.def.boss || tgt.general || tgt.charm) return false;
      tgt.charm = { until: st.t + D.dur, back: tgt.team };
      tgt.team = u.team; tgt.tgt = 0; tgt.orders = []; tgt.order = null; tgt.path = null;
      break;
    }
    case 'dispel': {
      forNear(st, u.x, u.z, D.radius, (e) => {
        if (e.team === u.team || e.hp <= 0) return false;
        for (let i = e.buffs.length - 1; i >= 0; i--) { const b = e.buffs[i]; if (!b.dps && b.spd !== 0 && (b.dmg > 1 || b.spd > 1 || b.armor > 0 || b.as > 1 || b.regen > 0 || b.take < 1)) e.buffs.splice(i, 1); }
        C.addStatus(st, e, 'silence', D.dur, 0, u);
        if (e.tags && e.tags.summoned) C.damage(st, u, e, D.dmg * 4, { dtype: D.dtype, srcUnit: u });
        else if (e.role === 'caster') C.damage(st, u, e, D.dmg, { dtype: D.dtype, srcUnit: u });
        return false;
      });
      break;
    }
    default: return false;
  }
  ab.cd = D.cd;
  emit(st, { type: 'cast', caster: u.id, spell: D.id, x: cx, z: cz });
  return true;
}
export function endCharm(st, u) {
  if (!u.charm) return;
  u.team = u.charm.back; u.charm = null; u.tgt = 0; u.orders = []; u.order = null;
}
export function onDeath(st, u, killer) {
  const d = u.def.deathBlast;
  if (d && !u.exploded && !(u.ttl !== undefined)) {
    u.exploded = true;
    C.splash(st, u, u.team, u.x, u.z, d.radius, d.dmg, { dtype: d.dtype, falloff: 0.4, bldMul: 0.5, srcUnit: u });
    if (d.heal) allies(st, u, u.x, u.z, d.radius + 2, (e) => { if (e !== u) C.heal(st, e, d.heal); });
    emit(st, { type: 'cast', caster: u.id, spell: 'death_blast', x: u.x, z: u.z });
  }
  if (u.charm) u.team = u.charm.back;
}
export function orderStep(st, u, o, dt, done) {
  const ab = abOf(u, o.id), D = ABIL[o.id];
  if (!ab || !D) return done();
  const t = o.target ? st.byId.get(o.target) : null;
  if (D.tgt === 'self' || D.tgt === 'none') { cast(st, u, ab, u.x, u.z, null); return done(); }
  const px = t ? t.x : o.x, pz = t ? t.z : o.z;
  if (!Number.isFinite(px)) return done();
  if (Math.hypot(px - u.x, pz - u.z) > (D.range || 1) * 0.9) { stepMove(st, u, px, pz, dt, { arrive: (D.range || 1) * 0.8 }); return; }
  cast(st, u, ab, px, pz, t); done();
}
// ---------------------------------------------------------------- per-unit tick: cooldowns, passives, auto-cast
export function update(st, u, dt) {
  const A = u.abilities;
  if (!A.length) return;
  for (const ab of A) { if (ab.cd > 0) ab.cd -= dt; }
  if (u.stun > 0 || u.garrison) return;
  for (const ab of A) {
    const D = ABIL[ab.id];
    if (D.type === 'aura') {
      ab.acc = (ab.acc || 0) + dt;
      if (ab.acc >= 0.5) {
        ab.acc = 0;
        forNear(st, u.x, u.z, D.radius, (e) => { if (e.team !== u.team && e.hp > 0 && !e.fly) C.addStatus(st, e, 'poison', D.dur, D.dmg, u); return false; });
      }
    }
  }
  if (((st.tick + u.id) % 6) !== 0 || u.noAuto) return;
  for (const ab of A) {
    const D = ABIL[ab.id];
    if (ab.cd > 0 || D.type === 'aura') continue;
    if (D.auto === false && !(u.general && st.teams[u.team] && st.teams[u.team].ai)) continue;
    if (auto(st, u, ab, D)) break;
  }
}
function curT(st, u) { const t = u.tgt ? st.byId.get(u.tgt) : null; return validT(t) && t.team !== u.team ? t : null; }
function countEnemies(st, u, x, z, r) { let n = 0; forNear(st, x, z, r, (e) => { if (e.team !== u.team && e.hp > 0) n++; return false; }); return n; }
function auto(st, u, ab, D) {
  const t = curT(st, u);
  switch (D.type) {
    case 'heal': {
      let best = null, br = 0.72;
      forNear(st, u.x, u.z, D.range, (e) => { if (e.team === u.team && e.hp > 0 && e.hp / e.maxHp < br && e.role !== 'siege') { br = e.hp / e.maxHp; best = e; } return false; });
      return best ? cast(st, u, ab, best.x, best.z, best) : false;
    }
    case 'buff': {
      if (!t || u.buffs.some((b) => b.id === D.buff.id)) return false;
      if (D.radius > 0) { let n = 0; allies(st, u, u.x, u.z, D.radius, (e) => { if (e.tgt) n++; }); if (n < 3) return false; }
      else if (gap(u, t) > 5 || u.hp < u.maxHp * 0.4) return false;
      return cast(st, u, ab, u.x, u.z, null);
    }
    case 'aoe':
      if (!t) return false;
      if (D.tgt === 'self') return countEnemies(st, u, u.x, u.z, D.radius) >= 2 || (t.kind === 'bld' && gap(u, t) < D.radius * 0.7) ? cast(st, u, ab, u.x, u.z, null) : false;
      return t.kind === 'unit' && Math.hypot(t.x - u.x, t.z - u.z) <= D.range ? cast(st, u, ab, t.x, t.z, t) : false;
    case 'drain': return t && t.kind === 'unit' && Math.hypot(t.x - u.x, t.z - u.z) <= D.range ? cast(st, u, ab, t.x, t.z, t) : false;
    case 'charm': return t && t.kind === 'unit' && !t.def.boss && !t.general && t.maxHp >= 120 && Math.hypot(t.x - u.x, t.z - u.z) <= D.range ? cast(st, u, ab, t.x, t.z, t) : false;
    case 'summon': return t && Math.hypot(t.x - u.x, t.z - u.z) < 20 ? cast(st, u, ab, u.x + (t.x - u.x) * 0.25, u.z + (t.z - u.z) * 0.25, null) : false;
    case 'charge': {
      if (!t || t.kind !== 'unit') return false;
      const d = Math.hypot(t.x - u.x, t.z - u.z);
      return d > 8 && d < D.range ? cast(st, u, ab, t.x, t.z, t) : false;
    }
    case 'explode': {
      const n = countEnemies(st, u, u.x, u.z, D.radius * 0.7);
      return (n >= 2 || (n >= 1 && u.hp < u.maxHp * 0.3) || (t && t.kind === 'bld' && gap(u, t) < 1.5)) ? cast(st, u, ab, u.x, u.z, null) : false;
    }
    case 'dispel': {
      let hit = 0;
      forNear(st, u.x, u.z, D.radius, (e) => { if (e.team !== u.team && e.hp > 0 && (e.role === 'caster' || (e.tags && e.tags.summoned) || e.buffs.length > 1)) hit++; return false; });
      return hit >= 1 && t ? cast(st, u, ab, u.x, u.z, null) : false;
    }
    default: return false;
  }
}
