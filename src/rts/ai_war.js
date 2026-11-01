// AI lane: war - rally, scouting, camp clearing, attack waves (gather -> assault -> retreat), siege target choice, defence pull-back, wounded micro, raids.
import { siegePick, breaches, has, safe } from './ai_info.js';
import { unitPower } from './ai_scan.js';
import * as Scout from './ai_scout.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const centroid = (us) => { let x = 0, z = 0; for (const u of us) { x += u.x; z += u.z; } return { x: x / us.length, z: z / us.length }; };
const order = (cmds, ids, o, queue) => { if (ids.length) cmds.push({ t: 'order', ids, order: o, queue: !!queue }); };

function armyUnits(ai) {
  const s = ai.s, ex = new Set();
  if (ai.scout) ex.add(ai.scout.id);
  if (ai.raid) for (const id of ai.raid.ids) ex.add(id);
  return s.mil.filter((u) => !ex.has(u.id) && !u.garrison);
}
function rallyPoint(st, ai) {
  const h = ai.s.home, a = Math.atan2(-h.z, -h.x);
  return { x: h.x + Math.cos(a) * 20, z: h.z + Math.sin(a) * 20 };
}
function setRallies(st, ai, cmds) {
  const rp = rallyPoint(st, ai);
  for (const type in ai.s.bl) for (const b of ai.s.bl[type].ready) {
    if (ai.rallied.has(b.id) || b.type === 'keep' || !/barrack|archery|stable|workshop|crypt|hall|hellgate|altar|sanctum/.test(b.type)) continue;
    ai.rallied.add(b.id);
    cmds.push({ t: 'rally', bld: b.id, x: rp.x + (st.rng() - 0.5) * 8, z: rp.z + (st.rng() - 0.5) * 8 });
  }
}
// ---------------------------------------------------------------- enemy choice
function pickEnemy(st, ai) {
  const s = ai.s, h = s.home;
  let best = null, bs = 1e9;
  for (const t of st.teams) {
    if (t.id === ai.team || !t.alive) continue;
    const k = t.keep || t.base;
    let sc = Math.hypot(k.x - h.x, k.z - h.z);
    if (ai.grudge[t.id]) sc -= 70;
    sc += (t.stats.lost || 0) * -0.1 + (t.pop.mil || 0) * 1.2; // weaker / bloodied targets first (public stats only)
    if (ai.target === t.id) sc -= 40;
    if (sc < bs) { bs = sc; best = t.id; }
  }
  return best;
}
// where siege should hit: Siege.pickTarget if the lane offers it, else gates/walls on the line to the keep, towers first
function assaultTarget(st, ai, enemyId, from) {
  const pick = siegePick(st, ai.team, enemyId);
  if (pick) { const b = pick.id ? st.byId.get(pick.id) : null; if (b && b.state !== 'ruin') return b; if (pick.x !== undefined && !pick.id) return { id: 0, x: pick.x, z: pick.z, kind: 'bld' }; }
  const et = st.teams[enemyId], keep = et.keep;
  let best = null, bs = 1e9;
  const gaps = breaches(st, enemyId);
  const open = gaps && gaps.some((g) => g.kind === 'gap');
  for (const b of ai.s.enemyBlds) {
    if (b.team !== enemyId || b.state === 'ruin') continue;
    const d = Math.hypot(b.x - from.x, b.z - from.z);
    let sc = d;
    if (b.wall && b.wall.piece === 'gate') sc -= 18;
    if (b.wall && b.wall.piece !== 'tower' && open) sc += 90; // a gap exists: ignore the rest of the wall
    if (b.turret || /tower/.test(b.type)) sc -= 14;
    if (b.type === 'keep') sc += open ? -40 : 40;
    if (sc < bs) { bs = sc; best = b; }
  }
  return best || keep;
}
// ---------------------------------------------------------------- the wave machine
function waveReady(st, ai) {
  const s = ai.s, P = ai.P, D = ai.D;
  if (s.t < P.attackAt * D.delay || s.t - ai.lastRetreat < 60 || ai.alert) return false;
  const units = armyUnits(ai).filter((u) => u.role !== 'siege');
  const need = Math.min(s.team.cap.mil - 6, Math.round(P.wave * D.waveMul));
  if (units.length < need) return (s.team.pop.mil >= s.team.cap.mil - 1 && units.length > 20) || (s.t > 660 * D.delay && units.length >= 10 + 4 * (D.delay > 1.2)); // pressure timer: no AI sits home past ~min 11
  const hasShop = s.bl.siege_workshop && s.bl.siege_workshop.ready.length;
  const walled = s.enemyBlds.filter((b) => b.wall).length > 10;
  if (P.siege > 0 && hasShop && walled && (s.byRole.siege || 0) < Math.min(P.siege, 2) && s.t < P.attackAt * D.delay + 420) return false;
  return true;
}
function startWave(st, ai, cmds) {
  const e = pickEnemy(st, ai);
  if (e == null) return;
  ai.target = e; ai.camp = null;
  const k = st.teams[e].keep || st.teams[e].base, h = ai.s.home;
  const d = Math.hypot(k.x - h.x, k.z - h.z), f = Math.max(0.15, 1 - 70 / d);
  ai.stage = { x: h.x + (k.x - h.x) * f, z: h.z + (k.z - h.z) * f };
  ai.wave = { state: 'gather', n: ai.wave.n + 1, since: st.t, size: 0, weak: 0 };
  const us = armyUnits(ai).concat(ai.s.gens);
  ai.wave.size = us.length;
  order(cmds, us.map((u) => u.id), { type: 'amove', x: ai.stage.x, z: ai.stage.z });
  ai.log.push([Math.round(st.t), 'wave', e, us.length]);
}
function assault(st, ai, cmds) {
  const s = ai.s, W = ai.wave, us = armyUnits(ai);
  if (!us.length) { W.state = 'build'; return; }
  const et = st.teams[ai.target];
  if (!et || !et.alive) { const e = pickEnemy(st, ai); if (e == null) return; ai.target = e; W.state = 'gather'; W.since = st.t; return; }
  const c = centroid(us), keep = et.keep || et.base;
  if (st.t - (W.lastOrder || 0) < 3) return;
  W.lastOrder = st.t;
  const tgt = assaultTarget(st, ai, ai.target, c);
  const siege = us.filter((u) => u.role === 'siege'), rest = us.filter((u) => u.role !== 'siege').concat(s.gens);
  if (tgt && tgt.id) {
    order(cmds, siege.map((u) => u.id), { type: 'attack', target: tgt.id });
    const wallish = tgt.wall && tgt.wall.piece !== 'tower';
    // without siege, heavies/melee hit the chosen gate/wall piece while the rest advance
    if (wallish && !siege.length) order(cmds, rest.filter((u) => u.role === 'heavy' || u.role === 'melee').map((u) => u.id), { type: 'attack', target: tgt.id });
    order(cmds, rest.filter((u) => !(wallish && !siege.length && (u.role === 'heavy' || u.role === 'melee'))).map((u) => u.id), { type: 'amove', x: tgt.type === 'keep' ? tgt.x : (tgt.x + keep.x) / 2, z: tgt.type === 'keep' ? tgt.z : (tgt.z + keep.z) / 2 });
  } else order(cmds, us.concat(s.gens).map((u) => u.id), { type: 'amove', x: keep.x, z: keep.z });
  // retreat check: compare army power near the front with what we see there
  let mine = 0, theirs = 0;
  for (const u of us) if (u.role !== 'siege' && dist(u, c) < 40) mine += unitPower(u);
  for (const e of s.enemy) if (e.role !== 'worker' && dist(e, c) < 48) theirs += unitPower(e);
  for (const b of s.enemyBlds) if (b.team === ai.target && (b.turret || /tower/.test(b.type)) && dist(b, c) < 38) theirs += 9000 * (b.atk ? 1 : 0.6);
  const lim = 0.5 - ai.P.aggr * 0.3 * ai.D.cap;
  W.weak = mine < theirs * lim ? W.weak + 1 : 0;
  if (W.weak >= (ai.difficulty === 'easy' ? 6 : 3) || us.length < W.size * 0.3) retreat(st, ai, cmds, 'weak');
}
function retreat(st, ai, cmds, why) {
  const rp = rallyPoint(st, ai), us = armyUnits(ai).concat(ai.s.gens);
  order(cmds, us.map((u) => u.id), { type: 'move', x: rp.x, z: rp.z });
  ai.wave.state = 'retreat'; ai.wave.since = st.t; ai.lastRetreat = st.t;
  ai.log.push([Math.round(st.t), 'retreat', why, us.length]);
}
// pull the army back to fight raiders at home
function defend(st, ai, cmds) {
  const W = ai.wave, al = ai.alert, s = ai.s;
  if (!al) { if (W.state === 'defend') { W.state = 'build'; } return; }
  const us = armyUnits(ai);
  if (!us.length) return;
  const mine = us.reduce((a, u) => a + (u.role === 'siege' ? 0 : unitPower(u)), 0);
  const serious = al.power > mine * (ai.difficulty === 'hard' ? 0.3 : 0.5);
  const away = dist(centroid(us), s.home) > 80;
  if (W.state === 'attack' && away && (!serious || ai.difficulty === 'easy')) return;
  if (W.state !== 'defend' || st.t - (W.lastDef || 0) > 4) {
    W.lastDef = st.t; if (W.state !== 'defend') ai.log.push([Math.round(st.t), 'defend', al.n]);
    W.state = 'defend';
    order(cmds, us.concat(s.gens).map((u) => u.id), { type: 'amove', x: al.x, z: al.z });
  }
}
function micro(st, ai, cmds) {
  const s = ai.s;
  if (ai.D.micro < 1 || st.t - (ai.lastMicro || 0) < 2) return;
  ai.lastMicro = st.t;
  const rp = rallyPoint(st, ai);
  let n = 0;
  for (const u of s.mil) {
    if (u.role === 'siege') continue;
    const low = u.hp < u.maxHp * 0.22;
    if (low && !ai.hurt.has(u.id) && s.enemy.length && n < 8) { ai.hurt.add(u.id); n++; order(cmds, [u.id], { type: 'move', x: rp.x, z: rp.z }); }
    else if (ai.hurt.has(u.id) && u.hp > u.maxHp * 0.7) { ai.hurt.delete(u.id); }
  }
  if (ai.D.micro >= 2 && ai.wave.state === 'attack' && s.enemy.length) {
    const us = armyUnits(ai).filter((u) => u.role === 'ranged' || u.role === 'caster');
    if (us.length < 3) return;
    const c = centroid(us);
    let best = null, bs = -1e9;
    for (const e of s.enemy) {
      const d = dist(e, c); if (d > 26) continue;
      const sc = (e.role === 'general' ? 40 : e.role === 'caster' ? 30 : e.role === 'ranged' ? 20 : 0) + (1 - e.hp / e.maxHp) * 25 - d;
      if (sc > bs) { bs = sc; best = e; }
    }
    if (best) order(cmds, us.slice(0, 12).map((u) => u.id), { type: 'attack', target: best.id });
  }
}
export function update(st, ai, cmds) {
  const s = ai.s, W = ai.wave;
  if (!ai.rallied) { ai.rallied = new Set(); ai.hurt = new Set(); ai.grudge = {}; ai.cleared = {}; }
  if (s.threat) for (const e of s.enemy) if (e.team !== ai.team && dist(e, s.home) < 55) ai.grudge[e.team] = st.t;
  setRallies(st, ai, cmds);
  Scout.scout(st, ai, cmds); Scout.raid(st, ai, cmds);
  if (W.state === 'build' && !ai.camp) Scout.neutrals(st, ai, cmds);
  defend(st, ai, cmds);
  micro(st, ai, cmds);
  if (W.state === 'defend') return;
  if (W.state === 'build') { if (waveReady(st, ai)) startWave(st, ai, cmds); else camps(st, ai, cmds); }
  else if (W.state === 'gather') {
    const us = armyUnits(ai);
    const near = us.filter((u) => dist(u, ai.stage) < 20).length;
    if (near >= us.length * 0.7 || st.t - W.since > 55) { W.state = 'attack'; W.since = st.t; W.lastOrder = 0; }
  } else if (W.state === 'attack') assault(st, ai, cmds);
  else if (W.state === 'retreat') { if (st.t - W.since > 35 || dist(centroid(armyUnits(ai).concat(s.gens).length ? armyUnits(ai).concat(s.gens) : [s.home]), s.home) < 35) W.state = 'build'; }
}
// ---------------------------------------------------------------- camp clearing (souls / relics) before the first big wave
function camps(st, ai, cmds) {
  const s = ai.s, W = ai.wave;
  if (ai.camp) {
    const us = armyUnits(ai).concat(s.gens);
    const c = ai.camp;
    const clear = !s.neutral.some((e) => dist(e, c) < 24);
    if (!us.length || us.length < c.n0 * 0.55 || (clear && us.filter((u) => dist(u, c) < 14).length >= us.length * 0.5) || st.t - c.t0 > 90 || ai.alert) {
      ai.cleared[c.i] = st.t; ai.camp = null;
      if (c.i === -1) { ai.badNode = {}; if (clear) ai.clearReq = null; }
      const rp = rallyPoint(st, ai); order(cmds, us.map((u) => u.id), { type: 'move', x: rp.x, z: rp.z });
    }
    return;
  }
  if (ai.alert) return;
  const rq = ai.clearReq;
  if (rq && st.t - rq.t < 40 && st.t - (ai.lastClear || -99) > 25) { // monsters sit on one of our resource nodes: clear them with whatever we have
    const f = armyUnits(ai).filter((u) => u.role !== 'siege').concat(s.gens);
    if (s.gens.length ? f.length >= Math.min(5, rq.n + (rq.n > 2 ? 1 : 0)) : f.length >= 5) {
      ai.lastClear = st.t; ai.camp = { i: -1, x: rq.x, z: rq.z, t0: st.t, n0: f.length };
      order(cmds, f.map((u) => u.id), { type: 'amove', x: rq.x, z: rq.z });
      ai.log.push([Math.round(st.t), 'clear', rq.n, f.length]);
      return;
    }
  }
  if (s.t < 150 || st.t - (ai.lastCamp || 0) < 40) return;
  const us = armyUnits(ai).filter((u) => u.role !== 'siege');
  if (us.length < 8) return;
  const feats = (st.world.features && st.world.features.camps) || [];
  let best = null, bs = 1e9;
  feats.forEach((cf, i) => {
    if (cf.temple || st.t - (ai.cleared[i] || -999) < 240) return;
    const d = dist(cf, s.home);
    if (d > 130 || us.length < 8 + 5 * ((cf.tier || 1) - 1)) return;
    if (d < bs) { bs = d; best = { i, x: cf.x, z: cf.z, t0: st.t, n0: us.length }; }
  });
  ai.lastCamp = st.t;
  if (!best) return;
  ai.camp = best;
  order(cmds, us.concat(s.gens).map((u) => u.id), { type: 'amove', x: best.x, z: best.z });
  ai.log.push([Math.round(st.t), 'camp', best.i, us.length]);
}
export { has, safe };
