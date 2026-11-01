// MAGIC lane: casting pipeline, availability, research tree, UI descriptions (owner: MAGIC).
import { emit } from './core.js';
import * as Tech from './tech.js';
import { SPELLS, SCHOOLS, schoolOf, AGE_NAMES } from './magic_data.js';
import * as Mana from './magic_mana.js';
import * as Fx from './magic_fx.js';
import { EFFECTS } from './magic_effects.js';

const SOUL_MANA = 5; // 1 soul substitutes this much missing mana for big spells (cost.mana >= 70)
const ent = (st, c) => (c && typeof c === 'object' ? c : st.byId.get(c));

// ---------------------------------------------------------------- tech registration: 'spell:<id>' techs researched at sanctum/library via the generic research command
let registered = false;
export function ensureTechs() {
  if (registered) return true;
  let T;
  try { T = Tech.TECHS; } catch (e) { return false; }
  if (!T) return false;
  const keyOf = { necromancy: 'necro', warmagic: 'orc', infernal: 'demon', blood: 'cult' };
  for (const s of Object.values(SPELLS)) {
    if (!s.research || T['spell:' + s.id]) continue;
    const needs = [];
    if (s.age >= 1) needs.push('magic_' + s.age);
    if (s.req && SPELLS[s.req] && SPELLS[s.req].research) needs.push('spell:' + s.req);
    T['spell:' + s.id] = { id: 'spell:' + s.id, name: s.name, age: s.age + 1, faction: keyOf[s.school] || 'all', at: ['sanctum', 'library'], cost: { ...s.research.cost }, time: s.research.time, needs, effects: {}, desc: s.desc, school: s.school, spell: s.id };
  }
  registered = true;
  return true;
}
export const ageOf = (team) => Tech.ageOf(team);

export function initTeam(team) {
  if (team._mgInit) return;
  team._mgInit = true;
  if (!team.cd) team.cd = {};
  const school = schoolOf(team);
  for (const s of Object.values(SPELLS)) if (s.school === school && s.start) team.spells[s.id] = true;
}
export function grantSpell(st, teamId, id) {
  const t = st.teams[teamId], s = SPELLS[id];
  if (!t || !s) return false;
  initTeam(t); t.spells[id] = true;
  emit(st, { type: 'msg', team: teamId, kind: 'info', text: 'Learned ' + s.name });
  return true;
}
export function onResearched(st, teamId, techId) {
  if (typeof techId === 'string' && techId.startsWith('spell:')) return grantSpell(st, teamId, techId.slice(6));
  return false;
}

// ---------------------------------------------------------------- availability
export function isKnown(team, s) { return !!(s && (team.spells[s.id] || team.tech['spell:' + s.id] || (s.start && s.school === schoolOf(team)))); }
export function availability(st, team, s, caster) {
  if (!s) return 'Unknown spell';
  if (s.school !== 'neutral' && s.school !== schoolOf(team)) return 'Not your school of magic';
  if (!isKnown(team, s)) return s.scroll ? 'Needs a relic scroll' : 'Not researched';
  const rdy = (team.cd[s.id] || 0) - st.t;
  if (rdy > 0) return 'Cooling down (' + Math.ceil(rdy) + 's)';
  return null;
}
function affordFail(team, s, caster) {
  const c = s.cost, bld = caster.kind === 'bld';
  let m = c.mana || 0;
  const have = team.mana + (caster.mana || 0);
  if (m > have + 1e-6) {
    const miss = m - have, souls = Math.ceil(miss / SOUL_MANA);
    if (!(m >= 70 && (team.res.souls || 0) - (c.souls || 0) >= souls)) return 'Not enough mana';
  }
  if ((team.res.souls || 0) < (c.souls || 0)) return 'Not enough souls';
  if ((team.res.blood || 0) < (c.blood || 0)) return 'Not enough blood';
  if (c.hp && !bld && caster.hp <= c.hp + 5) return 'Too wounded';
  return null;
}
function pay(st, team, s, caster) {
  const c = s.cost, bld = caster.kind === 'bld';
  let m = c.mana || 0;
  const have = team.mana + (caster.mana || 0);
  if (m > have) { const souls = Math.ceil((m - have) / SOUL_MANA); team.res.souls -= souls; m = Math.max(0, m - souls * SOUL_MANA); }
  Mana.payMana(team, caster, Math.min(m, have));
  if (c.souls) team.res.souls -= c.souls;
  if (c.blood) team.res.blood -= c.blood;
  if (c.hp) { if (bld) team.res.blood = Math.max(0, team.res.blood - c.hp * 0.5); else caster.hp -= c.hp; }
}

// ---------------------------------------------------------------- range / target
export function inRange(st, caster, spell, x, z, target) {
  const s = typeof spell === 'string' ? SPELLS[spell] : spell;
  caster = ent(st, caster);
  if (!s || !caster) return false;
  if (s.target === 'self' || s.target === 'none') return true;
  const tx = target && target.x !== undefined ? target.x : x, tz = target && target.z !== undefined ? target.z : z;
  const slack = (target && (target.r || Math.max(target.w || 0, target.d || 0) * 0.5)) || 0;
  return Math.hypot(caster.x - tx, caster.z - tz) <= s.range + slack + 0.5;
}
function resolveTarget(st, team, s, caster, x, z, tid) {
  let t = tid ? st.byId.get(tid) : null;
  if (s.target === 'unit') {
    if (!t && x !== undefined) {
      let bd = 3.5;
      for (const e of st.ents) if (e.alive && e.hp > 0) { const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; t = e; } }
    }
    if (!t || t.kind !== 'unit' || !t.alive || t.hp <= 0) return { err: 'Needs a unit target' };
    const ally = t.team === team.id;
    if (s.tgt === 'enemy' && ally) return { err: 'Needs an enemy target' };
    if (s.tgt === 'ally' && !ally) return { err: 'Needs a friendly target' };
    if (s.tgt === 'any' && ally && !Fx.isUndead(t)) return { err: 'Only undead can be mended' };
    return { t, x: t.x, z: t.z };
  }
  if (s.target === 'building') {
    if (!t || t.kind !== 'bld' || t.team === team.id || t.state === 'ruin') {
      t = null; let bd = 5;
      if (x !== undefined) for (const b of st.blds) if (b.team !== team.id && b.state !== 'ruin' && !b.trap) { const d = Math.hypot(b.x - x, b.z - z) - Math.max(b.w, b.d) * 0.5; if (d < bd) { bd = d; t = b; } }
    }
    if (!t) return { err: 'Needs an enemy building' };
    return { t, x: t.x, z: t.z };
  }
  if (s.target === 'self' || s.target === 'none') return { t: null, x: caster.x, z: caster.z };
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { err: 'Needs a target point' };
  return { t: null, x, z };
}

// ---------------------------------------------------------------- the cast. Returns {ok, reason, range?:true when the caster must walk closer}
export function cast(st, teamId, spellId, casterRef, x, z, targetId) {
  ensureTechs();
  const team = st.teams[teamId], s = SPELLS[spellId], caster = ent(st, casterRef);
  const fail = (reason, extra) => ({ ok: false, reason, ...extra });
  if (!team || !team.alive || !s) return fail('Unknown spell');
  initTeam(team);
  if (!caster || caster.team !== teamId) return fail('No caster');
  if (caster.kind === 'unit') {
    if (!caster.alive || caster.hp <= 0) return fail('Caster is dead');
    if (caster.stun > 0) return fail('Caster is stunned');
    if (caster.role !== 'general' && caster.role !== 'caster') return fail('This unit cannot cast');
  } else if (caster.kind === 'bld') {
    if (caster.state === 'ruin' || caster.state === 'building') return fail('Building not ready');
  } else return fail('No caster');
  const av = availability(st, team, s, caster);
  if (av) return fail(av);
  if (caster.castUntil > st.t) return fail('Caster is busy');
  const tg = resolveTarget(st, team, s, caster, x, z, targetId && (targetId.id || targetId));
  if (tg.err) return fail(tg.err);
  if (!inRange(st, caster, s, tg.x, tg.z, tg.t)) return fail('Out of range', { range: true });
  if (s.kind === 'raise' && !Fx.corpsesNear(st, tg.x, tg.z, s.radius).length) return fail('No corpses nearby');
  if (s.kind === 'sacrifice' && (!tg.t || tg.t === caster || tg.t.general)) return fail('Cannot sacrifice that');
  if (s.kind === 'thrall' && (tg.t.general || tg.t.thralled)) return fail('Cannot be enthralled');
  const af = affordFail(team, s, caster);
  if (af) return fail(af);
  Mana.unitPool(caster);
  const c = { spell: s, team, caster, x: tg.x, z: tg.z, target: tg.t, pow: Fx.powerOf(st, caster, team), st_t: st.t };
  pay(st, team, s, caster);
  team.cd[s.id] = st.t + s.cd;
  caster.castUntil = st.t + 0.5;
  emit(st, { type: 'cast', caster: caster.id, spell: s.id, x: tg.x, z: tg.z, radius: s.radius || 0, school: s.school, kind: s.kind, team: teamId, target: tg.t ? tg.t.id : 0 });
  const eff = EFFECTS[s.kind];
  const ok = eff ? !!Fx.safe(() => eff(st, c), false) : false;
  return { ok: true, effect: ok };
}

// ---------------------------------------------------------------- UI helpers
export function spellsFor(st, teamId, caster) {
  ensureTechs();
  const team = st.teams[teamId], school = schoolOf(team), out = [];
  initTeam(team);
  for (const s of Object.values(SPELLS)) {
    if (s.school !== school && !(s.school === 'neutral' && isKnown(team, s))) continue;
    const unlocked = isKnown(team, s), cdLeft = Math.max(0, (team.cd[s.id] || 0) - st.t);
    const cr = ent(st, caster);
    const af = unlocked && cr ? affordFail(team, s, cr) : null;
    out.push({ spell: s, unlocked, ready: unlocked && cdLeft <= 0, cdLeft, affordable: !af, reason: unlocked ? af : (s.scroll ? 'Needs a relic scroll' : 'Not researched') });
  }
  return out;
}
export function descSpell(spell) {
  const s = typeof spell === 'string' ? SPELLS[spell] : spell;
  if (!s) return { title: '?', lines: [] };
  const c = s.cost, cost = [];
  if (c.mana) cost.push(c.mana + ' mana'); if (c.souls) cost.push(c.souls + ' souls'); if (c.hp) cost.push(c.hp + ' HP'); if (c.blood) cost.push(c.blood + ' blood');
  const lines = [s.desc, 'Cost: ' + (cost.join(', ') || 'free') + (c.mana >= 70 ? ' (souls can cover missing mana)' : ''), 'Cooldown ' + s.cd + ' s' + (s.range ? ', range ' + s.range + ' m' : '') + (s.radius ? ', radius ' + s.radius + ' m' : '')];
  if (s.dmg) lines.push('Damage ' + s.dmg + ' (' + (s.dtype || 'magic') + ')');
  if (s.age) lines.push('Requires the ' + AGE_NAMES[s.age] + ' and Sanctum tier ' + s.age);
  if (s.req) lines.push('Requires ' + (SPELLS[s.req] ? SPELLS[s.req].name : s.req));
  if (s.research) lines.push('Research: ' + Object.entries(s.research.cost).map(([k, v]) => v + ' ' + k).join(', ') + ', ' + s.research.time + ' s at a Sanctum/Library');
  if (s.scroll) lines.push('Relic scroll: found in ruins.');
  return { title: s.icon + ' ' + s.name + ' (' + SCHOOLS[s.school].name + ')', lines };
}
export function researchable(st, teamId) {
  ensureTechs();
  const team = st.teams[teamId], out = [];
  initTeam(team);
  for (const s of Object.values(SPELLS)) {
    if (s.school !== schoolOf(team) || !s.research || isKnown(team, s)) continue;
    const tech = 'spell:' + s.id;
    const why = Fx.safe(() => Tech.unavailable(st, team, tech, () => true), null);
    out.push({ spell: s, tech, cost: { ...s.research.cost }, time: s.research.time, reason: why });
  }
  return out;
}
export function techInfo(techId) { ensureTechs(); const s = SPELLS[String(techId).replace('spell:', '')]; return s && s.research ? { cost: s.research.cost, time: s.research.time, at: ['sanctum', 'library'] } : null; }
