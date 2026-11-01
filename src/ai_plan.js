// FOGBOUND v0.5 ALLIES: what the allied group is doing. chooseGoal() returns a goal object every think:
//   { kind, key, x, z, r (arrive radius), focus(e)->bool (foes fought at any distance), leash {x,z,r}, sites (gates may be attacked), siteOk(b), still, moving, on(st,ai,team,h,S) }
// Priority: defend the assaulted town > an assigned side event > open a nearby cage > shop > accompany the human (or the lead ally) > lead the group
// (objective: stage, then assault a gate / the Demon Lord when strong enough) > filler (clear a camp, open a chest, patrol a town).
import { fightRatio } from './ai_combat.js';
import { objectiveOf, humanTeam, leadTeam, towns, nearestTown, monsNear, heroesOf, gatesOf } from './ai_world.js';
import { wantsTown, cageNear } from './ai_kit.js';

export const goalFoesOf = (g) => g.focus || null;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const blk = (st, ai, key) => (ai.black[key] || 0) > st.t;

// ---- is the human actually playing the objective? (moved or fought lately, or is next to it). Otherwise the allies carry on without him.
const HUM = new WeakMap();
function humanActive(st, humanT, obj) {
  const hh = humanT.hero;
  let m = HUM.get(st);
  if (!m) HUM.set(st, m = { x: hh.x, z: hh.z, tMove: st.t, n: -1 });
  if (m.n !== st.stepN) {
    m.n = st.stepN;
    if (Math.hypot(hh.x - m.x, hh.z - m.z) > 4) { m.x = hh.x; m.z = hh.z; m.tMove = st.t; }
  }
  if (st.t < 40 || st.t - m.tMove < 22 || st.t - hh.lastHit < 15) return true;
  return obj.x !== undefined && Math.hypot(hh.x - obj.x, hh.z - obj.z) < 45;
}

// formation slot around the anchor: a stable ring (left / right / behind), ranged heroes stand a bit further out
function slotAround(st, team, h, anchor) {
  const ids = [1, 2, 3, 0].filter((i) => st.teams[i] && i !== anchor.team && !st.teams[i].human);
  const k = Math.max(0, ids.indexOf(team.id));
  const a = k * 2.094 + 0.7, r = (h.ranged ? 11 : 8) + k;
  return { x: anchor.x + Math.cos(a) * r, z: anchor.z + Math.sin(a) * r };
}

export function chooseGoal(st, ai, team, h, S, cur) {
  const P = ai.P, obj = objectiveOf(st), plan = ai.plan;
  const humanT = humanTeam(st), lead = leadTeam(st);
  const ord = st.orders && st.orders.kind !== 'free' && humanT ? st.orders : null; // co-op order from the human (orders.js)
  const hActive = humanT && (humanActive(st, humanT, obj) || (ord && ord.kind === 'follow'));
  let anchor = null;
  if (humanT && hActive) anchor = humanT.hero;
  else if (lead && lead !== team) anchor = lead.hero;
  // roles while a human plays: ally 0 escorts him, ally 1 pushes the objective on its own, ally 2 clears camps / guards towns on its own.
  // Without a human (or when he stands idle) everybody groups around the lead ally as before.
  const aiIds = [1, 2, 3, 0].filter((i) => st.teams[i] && !st.teams[i].human);
  const role = humanT && hActive ? Math.max(0, aiIds.indexOf(team.id)) : 0;
  const escort = !(humanT && hActive) || !!(ord && ord.kind === 'follow'); // with a human playing nobody escorts him unless ordered: allies run their own errands (objective / camps / towns)
  const near = anchor ? dist(h, anchor) : 0;
  const around = anchor && escort ? anchor : h;

  // ---- 00. the capital fell: get out of the city (no fighting in the ruins), then the objective takes over (search the ruins / destroy the fortress)
  if (obj.id === 'escape' && obj.x !== undefined) return { kind: 'flee', key: 'escape', x: obj.x, z: obj.z, r: 14, moving: true };
  // ---- 000. orders from the human: attack here / gather on me (follow is handled below through the escort rule)
  if (ord && ord.kind === 'attack') {
    const ox = ord.x, oz = ord.z;
    if (st.t - ord.t > 6 && dist(h, { x: ox, z: oz }) < 9 && !S.threats.length) plan.orderDone = ord.t; // arrived and nothing left to fight: go back to normal behaviour
    if (plan.orderDone !== ord.t) return { kind: 'order', key: 'ord-atk' + Math.round(ord.t), x: ox, z: oz, r: 8, focus: (e) => e.kind === 'mon' && Math.hypot(e.x - ox, e.z - oz) < 42, sites: true, siteOk: () => true };
  }
  if (ord && ord.kind === 'gather') {
    const gx = humanT.hero.x, gz = humanT.hero.z;
    return { kind: 'gather', key: 'ord-gat', x: gx, z: gz, r: 5 + (aiIds.indexOf(team.id) + 1) * 1.5, still: dist(h, humanT.hero) < 12, focus: (e) => e.kind === 'mon' && Math.hypot(e.x - gx, e.z - gz) < 26 };
  }
  // ---- 0. strike force: raids keep the objective on 'defend' for most of the match, so two strong heroes (the lead + the next AI hero) go for a vulnerable gate
  // anyway (unless the capital is the town under attack): otherwise the demons are never pushed back and the match stalls.
  if (obj.kind === 'defend' && st.t > 360 && !blk(st, ai, 'strike')) {
    const capId = st.world && st.world.sites ? st.world.sites.capital : -1, alive = heroesOf(st).filter((t) => !t.hero.dead && t.hero.alive);
    const myRank = alive.filter((t) => !t.human).findIndex((t) => t.id === team.id);
    const lvl = alive.reduce((a, t) => a + t.hero.lvl, 0) / Math.max(1, alive.length);
    const gate = myRank >= 0 && myRank < 2 && obj.id !== capId && lvl >= 7 ? gatesOf(st).filter((g) => g.vuln).sort((a, b) => dist(a, h) - dist(b, h))[0] : null;
    if (gate) return assaultGoal(st, ai, team, h, S, { kind: 'gate', id: gate.id, x: gate.x, z: gate.z }, plan);
  }
  // ---- 1. defend the town under assault: everybody goes, human or not
  if (obj.kind === 'defend' && obj.x !== undefined && !blk(st, ai, 'def')) {
    const tn = towns(st, true).find((t) => t.id === obj.id) || nearestTown(st, obj.x, obj.z);
    const R = ((tn && (tn.t || tn).r) || 30);
    const c = { x: obj.x, z: obj.z };
    ai.stat.defends += cur && cur.kind === 'defend' ? 0 : 1;
    return { kind: 'defend', key: 'def' + obj.id, x: c.x, z: c.z, r: Math.max(8, R * 0.35), focus: (e) => e.kind === 'mon' && Math.hypot(e.x - c.x, e.z - c.z) < R + 45 };
  }
  // ---- 2. a timed side event: the nearest ally takes it when a human plays (without one the whole group goes, see below)
  if (obj.kind === 'event' && obj.x !== undefined && humanT && !blk(st, ai, 'ev')) {
    const mine = dist(h, obj);
    let rank = 0;
    for (const t of heroesOf(st)) if (t !== team && !t.human && t.hero.alive && dist(t.hero, obj) < mine - 1) rank++;
    if (rank === 0 && mine < 220) return eventGoal(st, obj);
  }
  // ---- 3. calm side jobs close to the group: free a prisoner, shop
  if (!S.threats.length) {
    const cage = !blk(st, ai, 'cage') ? cageNear(st, h, 30) : null;
    if (cage && dist(cage, around) < 45) {
      return { kind: 'cage', key: 'cage' + cage.id, x: cage.x, z: cage.z, r: 2.5, still: true,
        on: (st2, ai2, team2, h2) => { ai2.cmds.push({ t: 'poi', id: cage.id }); plan.cageT = plan.cageT || st2.t; if (st2.t - plan.cageT > 6) { ai2.black.cage = st2.t + 120; plan.cageT = 0; ai2.stat.cages++; } } };
    }
    if (!blk(st, ai, 'shop') && obj.kind !== 'lord' && wantsTown(st, team)) {
      const tn = nearestTown(st, around.x, around.z);
      if (tn && tn.d < 55 && Math.hypot(h.x - tn.t.x, h.z - tn.t.z) < 120) {
        return { kind: 'shop', key: 'shop' + tn.t.id, x: tn.t.x, z: tn.t.z, r: Math.max(6, (tn.t.r || 30) * 0.5), still: true,
          on: (st2, ai2) => { plan.shopT = plan.shopT || st2.t; if (st2.t - plan.shopT > 7) { ai2.black.shop = st2.t + 100; plan.shopT = 0; } } };
      }
    }
  }
  // ---- 4. accompany the anchor (the human while he plays; else the lead ally)
  if (anchor && escort && !(obj.kind === 'event' && !humanT && obj.x !== undefined)) {
    const s = slotAround(st, team, h, anchor);
    const grp = 1 + S.heroes.filter((a) => dist(a, h) < 30).length;
    const g = { kind: 'follow', key: 'fol', x: s.x, z: s.z, r: Math.max(10, P.leash * 0.5), moving: true, leash: { x: anchor.x, z: anchor.z, r: P.leash + 14 } };
    if (obj.kind === 'gate' || obj.kind === 'lord') { // beside the human, attack a gate when 2+ heroes are here and it has few defenders
      g.sites = true;
      g.siteOk = (b) => grp >= 2 && S.foes.filter((f) => Math.hypot(f.e.x - b.x, f.e.z - b.z) < 26).length <= 6 && dist(b, anchor) < 40;
    }
    if (near > 130 && !S.threats.length) { g.x = anchor.x; g.z = anchor.z; g.r = 16; } // far behind (respawned): catch up
    return g;
  }
  // ---- 5. on our own: the objective (ally 1 and the lead), or camps / towns (ally 2)
  if (role >= 1) return fillerGoal(st, ai, team, h, S);
  if (obj.kind === 'event' && obj.x !== undefined) return eventGoal(st, obj);
  if ((obj.kind === 'gate' || obj.kind === 'lord') && obj.x !== undefined) return assaultGoal(st, ai, team, h, S, obj, plan);
  return fillerGoal(st, ai, team, h, S);
}

function eventGoal(st, obj) {
  const c = { x: obj.x, z: obj.z };
  return { kind: 'event', key: 'ev' + obj.id, x: c.x, z: c.z, r: 9, focus: (e) => e.kind === 'mon' && Math.hypot(e.x - c.x, e.z - c.z) < 34, still: false,
    on: (st2, ai2, team2, h2) => { const cg = cageNear(st2, h2, 14); if (cg) ai2.cmds.push({ t: 'poi', id: cg.id }); } };
}

// stage 34 m short of the target, wait for 2+ heroes (and a beatable defence), then go in
function assaultGoal(st, ai, team, h, S, obj, plan) {
  const P = ai.P, key = obj.kind + ':' + (obj.id ?? 0);
  if (plan.key !== key) { for (const k in plan) delete plan[k]; plan.key = key; plan.phase = 'stage'; plan.t0 = st.t; plan.arr = 0; }
  const T = { x: obj.x, z: obj.z };
  const dh = dist(h, T);
  const lordFight = obj.kind === 'lord';
  const Rin = lordFight ? 10 : 9;
  if (plan.phase === 'stage') {
    const k = dh > 1 ? Math.min(1, 34 / dh) : 0;
    const sp = dh > 36 ? { x: T.x + (h.x - T.x) * k, z: T.z + (h.z - T.z) * k } : { x: h.x, z: h.z };
    if (dh <= 44) {
      if (!plan.arr) plan.arr = st.t;
      const alive = heroesOf(st).filter((t) => !t.hero.dead && t.hero.alive);
      const needH = Math.min(2, alive.length);
      const grp = 1 + S.heroes.filter((a) => dist(a, h) < 32).length;
      const def = S.foes.filter((f) => f.e.kind === 'mon' && Math.hypot(f.e.x - T.x, f.e.z - T.z) < 34);
      const ratio = def.length ? fightRatio(st, ai, team, h, def, S) : 9;
      const waited = st.t - plan.arr;
      if ((grp >= needH && ratio >= P.need / P.aggr * (lordFight ? 0.9 : 1)) || (grp >= needH && waited > 70) || waited > 140) { plan.phase = 'assault'; plan.aT = st.t; ai.stat.assaults++; }
    }
    if (plan.phase === 'stage') return { kind: 'stage', key: 'stage' + key, x: sp.x, z: sp.z, r: 10, moving: false, focus: (e) => e.kind === 'mon' && Math.hypot(e.x - sp.x, e.z - sp.z) < 22, still: false };
  }
  return { kind: 'assault', key: 'as' + key, x: T.x, z: T.z, r: Rin, focus: (e) => e.kind === 'mon' && Math.hypot(e.x - T.x, e.z - T.z) < 36, sites: true, siteOk: () => true };
}

// nothing to lead: clear a camp, open a chest, or walk the towns
function fillerGoal(st, ai, team, h, S) {
  let best = null, bv = 0;
  for (const c of st.camps || []) {
    if (!(c.mons > 0) || blk(st, ai, 'camp' + c.id)) continue;
    const d = Math.hypot(c.x - h.x, c.z - h.z); if (d > 130) continue;
    const v = (20 + 12 * (c.tier || 1)) / (d + 25);
    if (v <= bv) continue;
    const mons = monsNear(st, c.x, c.z, 20);
    if (!mons.length) continue;
    if (fightRatio(st, ai, team, h, mons, S) < ai.P.need * 1.25) { ai.black['camp' + c.id] = st.t + 40; continue; }
    bv = v; best = { kind: 'camp', key: 'camp' + c.id, x: c.x, z: c.z, r: 11, focus: (e) => e.camp === c.id && e.kind === 'mon', still: false, id: c.id };
  }
  for (const c of st.chests || []) {
    if (c.opened || blk(st, ai, 'chest' + c.id)) continue;
    const d = Math.hypot(c.x - h.x, c.z - h.z); if (d > 70) continue;
    const v = 14 / (d + 20);
    if (v > bv) { bv = v; best = { kind: 'chest', key: 'chest' + c.id, x: c.x, z: c.z, r: 1.2, still: true, on: (st2, ai2) => { ai2.black['chest' + c.id] = st2.t + 20; } }; }
  }
  if (best) return best;
  // patrol: the nearest standing town that is not where we already stand, cycling through them
  const list = towns(st); if (!list.length) return { kind: 'idle', key: 'idle', x: h.x, z: h.z, r: 5 };
  if (ai.patrol === undefined) ai.patrol = ai.team % list.length;
  let t = list[ai.patrol % list.length];
  const rr = Math.max(10, (t.r || 30) * 0.6);
  if (dist(t, h) < rr + 3) {
    if (!ai.patrolArr) ai.patrolArr = st.t;
    if (st.t - ai.patrolArr > 10) { ai.patrol = (ai.patrol + 1) % list.length; ai.patrolArr = 0; t = list[ai.patrol % list.length]; }
  }
  return { kind: 'patrol', key: 'pat' + t.id, x: t.x, z: t.z, r: Math.max(10, (t.r || 30) * 0.6) };
}
export { gatesOf };
