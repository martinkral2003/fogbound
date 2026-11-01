// FOGBOUND: DOMINION towers (WALLS lane): arrow / cannon / magic / ballista / watchtower turrets, standalone or on walls.
// A tower is a building with `turret` {kind,cd,target,scan}. Garrisoned or stationed ranged units add damage and range.
import * as Fire from './siege_proj.js';
import * as Magic from './magic.js';
import { emit } from './core.js';
import { TURRETS, TURRET_ALIAS, TOWER_TIERS, SCHOOL_BOLT } from './wdata.js';
import { allied } from './nav.js';

const operational = (b) => b.hp > 0 && (b.state === 'ready' || b.state === 'burning' || b.state === 'upgrading');
export const specOf = (b) => TURRETS[TURRET_ALIAS[b.turret && b.turret.kind] || (b.turret && b.turret.kind)] || null;

// number of friendly ranged defenders inside / on top of this tower
export function crew(st, b) {
  let n = 0;
  if (b.garrison) for (const id of b.garrison) { const u = st.byId.get(id); if (u && u.alive && (u.role === 'ranged' || u.role === 'caster' || u.role === 'general')) n++; }
  for (const u of st.ents) if (u.alive && u.layer === 'wall' && u.wallNode === b.id && (u.role === 'ranged' || u.role === 'caster')) n++;
  return Math.min(8, n);
}
export function stats(st, b) {
  const s = specOf(b); if (!s) return null;
  const tt = TOWER_TIERS[b.towerTier || 0], c = crew(st, b);
  return { spec: s, crew: c, dmg: s.dmg * tt.dmg * (1 + s.garrisonDmg * c) * (b.dmgMul || 1), range: s.range * tt.range + s.garrisonRange * c + (b.h || 8) * 0.25, cd: s.cd };
}

function pickTarget(st, b, S) {
  const r2 = S.range * S.range, minR2 = (S.spec.minRange || 0) ** 2;
  let best = null, bs = -1e9;
  for (const e of st.ents) {
    if (!e.alive || e.hp <= 0 || e.team === b.team || allied(st, b.team, e.team)) continue;
    const dx = e.x - b.x, dz = e.z - b.z, d2 = dx * dx + dz * dz;
    if (d2 > r2 || d2 < minR2) continue;
    const air = e.flying || e.role === 'flyer';
    if (air && !S.spec.hitsAir) continue;
    if (e.stealth && d2 > 144) continue;
    let sc = -Math.sqrt(d2);
    const big = e.role === 'siege' || e.role === 'heavy' || e.general || e.maxHp > 600;
    if (S.spec.prio === 'siege' && e.role === 'siege') sc += 60;
    else if (S.spec.prio === 'big' && big) sc += 40 + e.maxHp * 0.02;
    else if (e.role === 'siege') sc += 25; // everybody dislikes rams at the gate
    if (e.order && e.order.type === 'attack' && e.order.target === b.id) sc += 15;
    if (sc > bs) { bs = sc; best = e; }
  }
  return best;
}

export function update(st, dt) {
  for (const b of st.blds) {
    if (!b.turret || !operational(b)) continue;
    const T = b.turret;
    if (T.cd > 0) T.cd -= dt;
    T.scan -= dt;
    const S = stats(st, b); if (!S) continue;
    const tgt = T.target ? st.byId.get(T.target) : null;
    if (!tgt || !tgt.alive || tgt.hp <= 0 || Math.hypot(tgt.x - b.x, tgt.z - b.z) > S.range + 1) { T.target = 0; }
    if (!T.target && T.scan <= 0) { T.scan = 0.25; const t = pickTarget(st, b, S); if (t) T.target = t.id; }
    if (!T.target || T.cd > 0) continue;
    const e = st.byId.get(T.target);
    shoot(st, b, e, S);
    T.cd = S.cd * (b.rateMul ? 1 / b.rateMul : 1);
  }
  Fire.update(st, dt);
}

function shoot(st, b, e, S) {
  const sp = S.spec, team = st.teams[b.team];
  const from = { x: b.x, y: (b.y || st.world.heightAt(b.x, b.z)) + (b.h || 8) * 0.9, z: b.z };
  const lead = sp.kind === 'cannon' ? 0.5 : 0;
  const to = { x: e.x + Math.cos(e.face || 0) * (e.speed || 0) * lead * 0.5, y: (e.y || 0) + 1, z: e.z + Math.sin(e.face || 0) * (e.speed || 0) * lead * 0.5 };
  let dmg = S.dmg, kind = sp.proj;
  if (sp.kind === 'ballista' && (e.role === 'siege' || e.role === 'heavy' || e.general || e.maxHp > 500)) dmg *= sp.bigMul;
  if (sp.kind === 'cannon' && e.role === 'siege') dmg *= sp.siegeMul;
  if (sp.kind === 'magic') {
    if (Magic.towerCast && Magic.towerCast(st, b, e)) return; // the magic lane handled this cast (school spell)
    kind = SCHOOL_BOLT[team.faction.school] || 'bolt';
    if (team.mana >= 2) team.mana -= 2; else dmg *= 0.6;
  }
  Fire.fire(st, { kind, srcRef: b, team: b.team, from, to, speed: sp.speed, arc: sp.kind === 'cannon' ? 5 : sp.kind === 'arrow' ? 2.5 : 0, dmg, splash: sp.splash || 0, dtype: sp.dtype, tgtId: e.id, hitsAir: sp.hitsAir,
    unitMul: 1, bldMul: 0.5 });
}
