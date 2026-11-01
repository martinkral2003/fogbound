// FLOW: monster AI. idle/wander near home, aggro (bigger at night), pack alert, leash + heal, telegraphed move choice, ranged kiting, wolf fleeing, boss phases.
import { MONSTERS } from '../data.js';
import { emit } from './core.js';
import { spawnMonster } from './flow/monsters.js';
import { blank, dist, distXZ, yawTo, isHero, isNight, steer, cinfo, monsterMoves, hpFrac } from './ai_util.js';

const THINK = 0.25;

export function monsterInput(st, a, heroes, dt) {
  const inp = blank(a), ai = a.ai, def = MONSTERS[a.type] || { aggro: 10, range: 2, spd: 4 };
  ai.t -= dt; ai.cdT = Math.max(0, (ai.cdT || 0) - dt);
  if (ai.state === 'dead') return inp;
  const cs = a.cs.state;
  // healing while away from the fight
  if (ai.state === 'return' || ai.state === 'idle') { if (a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * (ai.state === 'return' ? 0.08 : 0.02) * dt); }
  // think (target acquisition) at a staggered low rate
  ai.thinkT = (ai.thinkT ?? (a.id % 8) * 0.03) - dt;
  if (ai.thinkT <= 0) { ai.thinkT = THINK; think(st, a, def, heroes); }
  if (ai.boss) bossPhases(st, a);
  if (cs === 'stagger' || cs === 'dead') return inp;
  const tgt = ai.target ? st.byId.get(ai.target) : null;
  switch (ai.state) {
    case 'idle': wander(st, a, inp, dt); break;
    case 'return': {
      const d = steer(st, a, inp, ai.home.x, ai.home.z, 1);
      inp.yaw = yawTo(a, ai.home.x, ai.home.z);
      if (d < 2.5) { ai.state = 'idle'; ai.fleeing = false; }
      break;
    }
    case 'flee': {
      if (!tgt) { ai.state = 'return'; break; }
      const ang = yawTo(a, tgt.x, tgt.z) + Math.PI; inp.mx = Math.cos(ang); inp.mz = Math.sin(ang); inp.yaw = ang;
      ai.fleeT -= dt; if (ai.fleeT <= 0 || hpFrac(a) > 0.6) { ai.state = 'chase'; }
      break;
    }
    case 'chase': engage(st, a, inp, tgt, def, dt); break;
    default: ai.state = 'idle';
  }
  return inp;
}

function think(st, a, def, heroes) {
  const ai = a.ai;
  const hurt = a.hp < (ai.lastHp ?? a.hp) - 0.5; ai.lastHp = a.hp;
  // leash
  const leash = ai.leash || (ai.camp >= 0 ? 24 : 28);
  if (ai.state === 'chase' || ai.state === 'flee') {
    if (distXZ(a, ai.home.x, ai.home.z) > leash) { ai.state = 'return'; ai.target = 0; return; }
    const t = st.byId.get(ai.target);
    if (!t || !t.alive || dist(a, t) > (def.aggro + 14) * 1.8) { ai.target = 0; const n = nearestVisible(st, a, def, heroes, 1.0); if (n) ai.target = n.id; else ai.state = 'return'; }
    if (def.wolfFlee !== false && a.type === 'wolf' && hpFrac(a) < 0.25 && !ai.fled) { ai.fled = true; ai.state = 'flee'; ai.fleeT = 4; }
    return;
  }
  if (ai.state === 'idle' || ai.state === 'return') {
    const t = nearestVisible(st, a, def, heroes, hurt ? 2.2 : 1);
    if (t) { aggro(st, a, t); }
  }
}

function nearestVisible(st, a, def, heroes, mul) {
  const ai0 = a.ai;
  const night = isNight(st) ? 1.35 : 1;
  let best = null, bd = 1e9;
  for (const h of heroes) {
    if (!h.alive) continue;
    const d = dist(a, h);
    const rr0 = Math.hypot(h.x, h.z), reg = rr0 > 150 ? 0.45 : rr0 > 110 ? 0.65 : 1; // coast and outskirts are quiet
    let r = def.aggro * (ai0.boss ? 0.55 : 0.55) * reg * night * mul;
    if (h.crouching) r *= 0.55; else if (h.sprinting) r *= 1.25;
    if (st.settlement && st.settlement.safe && Math.hypot(h.x - st.settlement.x, h.z - st.settlement.z) < st.settlement.r) continue; // monsters do not enter the settlement
    if (d < r && d < bd) { bd = d; best = h; }
  }
  return best;
}

// acquire a target and alert the pack
function aggro(st, a, t) {
  a.ai.target = t.id; a.ai.state = 'chase';
  for (const m of st.actors) {
    if (m === a || !m.alive || m.kind !== 'monster' || !m.ai || m.ai.state === 'chase' || m.ai.camp !== a.ai.camp || m.ai.camp === -1) continue;
    if (dist(m, a) < 13) { m.ai.target = t.id; m.ai.state = 'chase'; }
  }
}

function wander(st, a, inp, dt) {
  const ai = a.ai;
  ai.wanderT -= dt;
  if (ai.wanderT <= 0) {
    if (ai.wander) { ai.wander = null; ai.wanderT = 2 + st.rng() * 5; }
    else { const ang = st.rng() * 6.283, r = st.rng() * 5; ai.wander = { x: ai.home.x + Math.cos(ang) * r, z: ai.home.z + Math.sin(ang) * r }; ai.wanderT = 3 + st.rng() * 3; }
  }
  if (ai.wander) { const d = steer(st, a, inp, ai.wander.x, ai.wander.z, 0.4); inp.yaw = yawTo(a, ai.wander.x, ai.wander.z); if (d < 0.8) ai.wander = null; }
}

function pickMove(st, a, dist2) {
  const mv = monsterMoves(a.type);
  if (!mv || !mv.length) return null;
  const cd = a.cs.moveCd || {};
  const ok = mv.filter((m) => m.id !== 'basic' ? !(cd[m.id] > st.t) && m.range + 0.8 >= dist2 && dist2 >= (m.id === 'summon' ? 4 : 1.2) : m.range + 0.8 >= dist2);
  const special = ok.filter((m) => m.id !== 'basic');
  if (special.length && st.rng() < 0.55) return special[Math.floor(st.rng() * special.length)];
  return ok.find((m) => m.id === 'basic') || null;
}

function engage(st, a, inp, tgt, def, dt) {
  const ai = a.ai;
  if (!tgt || !tgt.alive) { ai.target = 0; ai.state = 'return'; return; }
  const d = dist(a, tgt), reach = (def.range || 2) + tgt.radius * 0.6;
  const ranged = !!def.ranged;
  inp.yaw = yawTo(a, tgt.x, tgt.z);
  const busy = a.cs.state !== 'idle';
  if (ranged) {
    // keep a comfortable distance, shoot when in range
    if (d < def.range * 0.45) { inp.mx = -Math.cos(inp.yaw); inp.mz = -Math.sin(inp.yaw); }
    else if (d > def.range * 0.85) steer(st, a, inp, tgt.x, tgt.z, 1);
    else { const s = (a.id & 1 ? 1 : -1) * 0.5; inp.mx = Math.cos(inp.yaw + 1.57) * s; inp.mz = Math.sin(inp.yaw + 1.57) * s; }
    if (!busy && ai.cdT <= 0 && d < def.range * 0.95) { inp.attackPressed = true; inp.attack = true; ai.cdT = def.cd * (0.8 + st.rng() * 0.4); }
    return;
  }
  if (d > reach - 0.2) { steer(st, a, inp, tgt.x, tgt.z, 1); inp.yaw = yawTo(a, tgt.x, tgt.z); }
  if (!busy && ai.cdT <= 0 && d < Math.max(reach + 0.5, 6)) {
    const mv = pickMove(st, a, d);
    if (mv) { inp.attackPressed = true; inp.attack = true; inp.move = mv.id; ai.cdT = 0.25 + st.rng() * 0.5; }
  }
}

// ---- boss: The Drowned King -------------------------------------------------------------
function bossPhases(st, a) {
  const ai = a.ai, f = hpFrac(a);
  if (ai.phase === 0 && f < 0.66) {
    ai.phase = 1; emit(st, { type: 'announce', text: 'The Drowned King calls his drowned court!', x: a.x, z: a.z });
    for (let i = 0; i < 3; i++) { const g = spawnMonster(st, i === 2 ? 'skelArcher' : 'skeleton', 2, a.x + Math.cos(i * 2.1) * 6, a.z + Math.sin(i * 2.1) * 6, { camp: -2 }); if (g) { g.ai.home = { x: a.x, z: a.z }; g.ai.state = 'chase'; g.ai.target = ai.target; g.ai.leash = 60; } }
  } else if (ai.phase === 1 && f < 0.33) {
    ai.phase = 2; a.d.moveSpeed *= 1.25; a.d.atkSpeed *= 1.3;
    emit(st, { type: 'announce', text: 'The Drowned King roars in fury!', x: a.x, z: a.z });
  }
}
