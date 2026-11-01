// MAGIC lane: AI spell suggestion + magic tower casting (owner: MAGIC).
import { emit } from './core.js';
import { SPELLS, SCHOOLS, schoolOf } from './magic_data.js';
import { TOWER_BOLTS } from './magic_data2.js';
import * as Fx from './magic_fx.js';
import * as C from './magic_cast.js';

const valueOf = (u) => (u.general ? 6 : u.role === 'caster' ? 2.5 : u.role === 'siege' ? 2 : u.role === 'heavy' ? 1.6 : u.role === 'worker' ? 0.5 : 1);

// Pick a sensible cast for a caster (unit or building). Returns {spell, x, z, target} or null. Pure: does not cast.
export function suggest(st, teamId, casterRef) {
  C.ensureTechs();
  const team = st.teams[teamId], caster = typeof casterRef === 'object' ? casterRef : st.byId.get(casterRef);
  if (!team || !caster || caster.team !== teamId) return null;
  if (caster.kind === 'unit' && (!caster.alive || caster.stun > 0)) return null;
  const R = 34;
  const enemies = Fx.foes(st, teamId, caster.x, caster.z, R);
  const allies = Fx.friends(st, teamId, caster.x, caster.z, 24);
  const wallFoes = Fx.bldFoes(st, teamId, caster.x, caster.z, 24);
  let best = null, bs = 0;
  const consider = (s, score, x, z, target) => { if (score > bs) { bs = score; best = { spell: s.id, x, z, target: target ? target.id : 0 }; } };
  const reserve = team.mana > team.manaMax * 0.85 ? 0 : 0.15; // keep a little back unless nearly full
  for (const e of C.spellsFor(st, teamId, caster)) {
    const s = e.spell;
    if (!e.ready || !e.affordable) continue;
    if (s.cost.mana > (team.mana + (caster.mana || 0)) * (1 - reserve) + (s.cost.mana >= 70 ? (team.res.souls || 0) * 4 : 0)) continue;
    const inR = (x, z, r = s.range) => Math.hypot(caster.x - x, caster.z - z) <= r + 0.5;
    const k = s.kind, cost = Math.max(10, s.cost.mana);
    if (k === 'aoe' || k === 'zone' || k === 'delay' || k === 'prison' || k === 'flamewall') {
      const harm = k !== 'aoe' || s.dmg || s.stun;
      if (s.zk === 'totem' || s.zk === 'sanctuary' || s.zk === 'bloodrain') { /* support/mixed zones handled below */ }
      if (s.target === 'self' && !s.dmg) { // heal burst
        const hurt = allies.filter((a) => a.hp < a.maxHp * 0.65);
        if (s.heal && hurt.length >= 2 && caster.hp > (s.cost.hp || 0) + 60) consider(s, hurt.length * 12 * (s.heal / 100), caster.x, caster.z);
        continue;
      }
      if (s.zk === 'totem') { if (enemies.length >= 3 && allies.length >= 4) consider(s, allies.length * 2, caster.x + (enemies[0].x - caster.x) * 0.2, caster.z + (enemies[0].z - caster.z) * 0.2); continue; }
      if (s.zk === 'sanctuary') { const hurt = allies.filter((a) => a.hp < a.maxHp * 0.6); if (hurt.length >= 3) consider(s, hurt.length * 4, hurt[0].x, hurt[0].z); continue; }
      if (s.zk === 'bloodrain' || s.zk === 'gate' || s.zk === 'aura') {
        if (s.zk === 'aura') { if (enemies.filter((u) => Math.hypot(u.x - caster.x, u.z - caster.z) < 9).length >= 2) consider(s, 6, caster.x, caster.z); continue; }
      }
      if (!harm && !s.heal) continue;
      let cands = enemies.filter((u) => inR(u.x, u.z)).map((u) => ({ x: u.x, z: u.z }));
      if (s.siege || s.bld >= 1 || k === 'zone' && s.bldDps) cands = cands.concat(wallFoes.filter((b) => inR(b.x, b.z)).map((b) => ({ x: b.x, z: b.z })));
      for (const p of cands) {
        if (s.target === 'self' && !inR(p.x, p.z, s.radius)) continue;
        let n = 0;
        for (const u of enemies) if (Math.hypot(u.x - p.x, u.z - p.z) <= s.radius) n += valueOf(u);
        if (s.bld >= 1 || s.siege || s.bldDps) for (const b of wallFoes) if (Math.hypot(b.x - p.x, b.z - p.z) <= s.radius) n += b.wall ? 0.8 : 1.5;
        for (const a of allies) if (a !== caster && Math.hypot(a.x - p.x, a.z - p.z) <= s.radius + 1 && !s.heal && s.dtype) n -= 1.5; // avoid splash on own troops for ground targeted
        if (n >= 3) consider(s, n * 100 / cost, p.x, p.z);
      }
      if (k === 'delay' || k === 'zone' && s.zk === 'storm') { /* already handled by clusters */ }
    } else if (k === 'bolt' || k === 'chain' || k === 'thrall') {
      if (k === 'bolt' && s.healAlly && !s.dmg) continue;
      const tg = enemies.filter((u) => inR(u.x, u.z, s.range)).sort((a, b) => valueOf(b) * b.hp - valueOf(a) * a.hp)[0];
      if (k === 'bolt' && s.healAlly) {
        const low = allies.filter((a) => a.hp < a.maxHp * 0.45 && Fx.isUndead(a) && a.role !== 'worker' && inR(a.x, a.z)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (low && !(tg && tg.general)) { consider(s, 5, low.x, low.z, low); continue; }
      }
      if (!tg) continue;
      if (k === 'thrall') { const t2 = enemies.filter((u) => !u.general && inR(u.x, u.z) && u.hp > 200).sort((a, b) => b.hp - a.hp)[0]; if (t2) consider(s, t2.hp / 60, t2.x, t2.z, t2); continue; }
      const crowd = k === 'chain' ? enemies.filter((u) => Math.hypot(u.x - tg.x, u.z - tg.z) < s.jumpR).length : 1;
      consider(s, (valueOf(tg) * 2 + crowd * 2) * 40 / cost + (s.dmg >= tg.hp ? 4 : 0), tg.x, tg.z, tg);
    } else if (k === 'buff' || k === 'debuff') {
      if (k === 'debuff') { const g = enemies.filter((u) => inR(u.x, u.z)); const n = g.reduce((a, u) => a + valueOf(u), 0); if (n >= 4) consider(s, n * 90 / cost, g[0].x, g[0].z); continue; }
      const fighting = enemies.some((u) => Math.hypot(u.x - caster.x, u.z - caster.z) < 26);
      const near = allies.filter((a) => Math.hypot(a.x - caster.x, a.z - caster.z) <= s.radius);
      if (fighting && near.length >= 4 && !near.some((a) => a.buffs && a.buffs.some((b) => b.id === s.buff.id))) consider(s, near.length * 80 / cost, caster.x, caster.z);
    } else if (k === 'summon') {
      if (enemies.length >= 2 && (s.n >= 6 ? enemies.length >= 5 : true)) consider(s, 6 + enemies.length, caster.x, caster.z);
    } else if (k === 'raise') {
      const n = Fx.corpsesNear(st, caster.x, caster.z, s.range).length;
      if (n >= 3 && enemies.length) { const c = Fx.corpsesNear(st, caster.x, caster.z, s.range)[0]; consider(s, n * 3, c.x, c.z); }
    } else if (k === 'blast') {
      const b = wallFoes.filter((q) => inR(q.x, q.z)).sort((a, c) => (c.wall && c.wall.piece === 'gate' ? 2 : 1) * c.hp - (a.wall && a.wall.piece === 'gate' ? 2 : 1) * a.hp)[0];
      if (b) consider(s, 7, b.x, b.z, b);
    } else if (k === 'shield') {
      const low = allies.filter((a) => a.general && a.hp < a.maxHp * 0.7 && enemies.length).sort((a, b) => a.hp - b.hp)[0];
      if (low && inR(low.x, low.z)) consider(s, 9, low.x, low.z, low);
    } else if (k === 'sacrifice') {
      if (team.mana < team.manaMax * 0.3 && enemies.length) { const v = allies.filter((a) => !a.general && a !== caster && a.hp < a.maxHp * 0.4 && a.role !== 'worker' && inR(a.x, a.z)).sort((a, b) => a.hp - b.hp)[0]; if (v) consider(s, 5, v.x, v.z, v); }
    }
  }
  return best;
}

// ---------------------------------------------------------------- magic towers (called by the WALLS lane every tower cooldown)
export function towerCast(st, tower) {
  const team = st.teams[tower.team];
  if (!team || !team.alive || tower.state === 'ruin' || tower.state === 'building') return false;
  const school = tower.school || schoolOf(team), bolt = TOWER_BOLTS[school];
  if (!bolt) return false;
  const range = tower.range || (tower.atk && tower.atk.range) || 28;
  const enemies = Fx.foes(st, tower.team, tower.x, tower.z, range);
  let tgt = null, bs = -1;
  for (const u of enemies) { const sc = valueOf(u) * 10 + (1 - Math.hypot(u.x - tower.x, u.z - tower.z) / range) * 5 + (u.hp < u.maxHp * 0.5 ? 2 : 0); if (sc > bs) { bs = sc; tgt = u; } }
  const src = tower;
  let mult = 1;
  for (const n of st.neutral || []) if (n.kind === 'leyline' && n.owner === tower.team && Math.hypot(n.x - tower.x, n.z - tower.z) < 24 + (n.r || 0)) { mult = 1.25; break; }
  if (team.mana >= bolt.mana) team.mana -= bolt.mana; else mult *= 0.5;
  if (!tgt) {
    if (school === 'blood' && bolt.healAlly) { const lo = Fx.friends(st, tower.team, tower.x, tower.z, range * 0.6, (f) => f.hp < f.maxHp * 0.7).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (lo) { Fx.heal(st, lo, bolt.healAlly * mult); emit(st, { type: 'cast', caster: tower.id, spell: 'tower:' + school, x: lo.x, z: lo.z, radius: 0, school, team: tower.team }); return true; }
    }
    if (team.mana >= 0 && mult === 1) team.mana += bolt.mana; // refund: nothing to shoot
    return false;
  }
  emit(st, { type: 'cast', caster: tower.id, spell: 'tower:' + school, x: tgt.x, z: tgt.z, radius: bolt.radius, school, team: tower.team, target: tgt.id });
  emit(st, { type: 'bolt', spell: 'tower:' + school, x0: tower.x, z0: tower.z, x1: tgt.x, z1: tgt.z });
  const dmg = bolt.dmg * mult;
  Fx.hurt(st, src, tgt, dmg, bolt.dtype);
  if (bolt.radius) for (const u of Fx.foes(st, tower.team, tgt.x, tgt.z, bolt.radius)) if (u !== tgt) Fx.hurt(st, src, u, dmg * 0.6, bolt.dtype);
  if (bolt.slow && tgt.alive) Fx.slow(st, tgt, bolt.slow, 2);
  if (bolt.burn && tgt.alive) Fx.burn(st, tgt, 5, 4, tower.team);
  if (bolt.chain) { let cur = tgt, d = dmg * 0.7; const hit = new Set([tgt.id]); for (let i = 0; i < bolt.chain; i++) { const nx = Fx.foes(st, tower.team, cur.x, cur.z, 8, (u) => !hit.has(u.id))[0]; if (!nx) break; hit.add(nx.id); emit(st, { type: 'bolt', spell: 'tower:' + school, x0: cur.x, z0: cur.z, x1: nx.x, z1: nx.z }); Fx.hurt(st, src, nx, d, bolt.dtype); cur = nx; d *= 0.7; } }
  return true;
}
