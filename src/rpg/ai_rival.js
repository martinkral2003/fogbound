// FLOW: rival hero brain. Produces the same input struct as the human. Modes: zone, flee, fight, loot, hunt, rest, roam.
import { blank, dist, distXZ, yawTo, hpFrac, isHero } from './ai_util.js';
import { DIFF, power, groupPower, fight } from './ai_fight.js';
import { manageGear, usePotion, potionCount, findLoot, safeLimit, templeOpen } from './ai_loot.js';
import { moveTo, interactWith, sprint } from './ai_move.js';
import { getNav } from './flow/nav.js';

const THINK = 0.3;
const AGGR = { aggressive: 1.4, opportunist: 2.0, looter: 2.8, cautious: 3.5 };   // power ratio needed to start a hero fight
const HUNT = { aggressive: 0.9, opportunist: 1.2, looter: 1.6, cautious: 1.9 };    // ... to hunt a monster camp
const RADIUS = { looter: 120, cautious: 85, opportunist: 75, aggressive: 65 };

export function rivalInput(st, a, heroes, dt) {
  const inp = blank(a), ai = a.ai;
  if (!ai.ignore) { ai.ignore = {}; ai.tries = {}; ai.mode = 'loot'; ai.gearT = 2 + (a.id % 5); }
  const P = DIFF[ai.difficulty] || DIFF.normal;
  ai.thinkT = (ai.thinkT ?? (a.id % 10) * 0.03) - dt;
  const cs = a.cs.state;
  if (cs === 'stagger') return inp;
  // container opened by us: take everything and close
  if (a.openC) { inp.cmds.push({ t: 'lootAll', container: a.openC }, { t: 'closeContainer' }); ai.ignore[a.openC] = st.t + 400; ai.cur = null; return inp; }
  if (ai.thinkT <= 0) { ai.thinkT = THINK; think(st, a, heroes, P); }
  ai.gearT -= dt;
  if (ai.gearT <= 0) { ai.gearT = 3 + st.rng() * 2; manageGear(st, a, inp); }
  usePotion(st, a, inp);
  act(st, a, inp, P);
  return inp;
}

// ---------------------------------------------------------------- decision
function threatsOf(st, a) {
  const out = [];
  for (const m of st.actors) {
    if (!m.alive || m === a) continue;
    if (m.kind === 'monster' && m.ai && m.ai.target === a.id && m.ai.state === 'chase' && dist(m, a) < 32) out.push(m);
  }
  return out;
}

function think(st, a, heroes, P) {
  const ai = a.ai, z = st.zone, m = st.match;
  const me = power(a), pers = ai.personality, myHpF = hpFrac(a);
  ai.me = me;
  const dC = z ? Math.hypot(a.x - z.cx, a.z - z.cz) : 0;
  // --- 1. the fog
  if (z) {
    const curR = z.state === 'shrinking' ? Math.min(z.r, z.toR) : z.r;
    const next = z.state === 'holding' && z.stage < z.stages ? z.toR : null;
    const eta = z.state === 'holding' ? z.nextAt - st.t : 99;
    const nextR = z.state === 'holding' ? (z.stage < z.stages ? 0 : 0) : 0;
    let danger = dC > curR - 6;
    if (!danger && z.state === 'holding' && !z.final) { // anticipate the next shrink
      const nr = (require_next(z)); const travel = Math.max(0, dC - nr + 10) / 5.2;
      const margin = pers === 'cautious' ? 14 : pers === 'opportunist' ? 6 : -4; if (eta < travel + margin && dC > nr - 10) danger = true;
    } else if (!danger && z.state === 'waiting' && st.t > z.nextAt - 25 && dC > 215) danger = true;
    // greedy / slow heroes dawdle a while after the fog passes over them (looters most)
    const bail = pers === 'looter' ? 0.25 : pers === 'aggressive' ? 0.35 : pers === 'opportunist' ? 0.45 : 0.6;
    if (danger && dC > curR && myHpF > bail) {
      if (!ai.outSince) ai.outSince = st.t;
      const grace = pers === 'looter' ? 22 : pers === 'aggressive' ? 15 : pers === 'opportunist' ? 9 : 2;
      if (st.t - ai.outSince < grace * (P.skill > 0.9 ? 0.6 : 1.2)) danger = false;
    } else if (!danger || dC <= curR) ai.outSince = 0;
    if (danger) {
      ai.mode = 'zone';
      const tr = z.state === 'holding' && !z.final ? require_next(z) : curR;
      const ang = ai.finalAng ?? (ai.finalAng = st.rng() * 6.283);
      const rad = Math.max(3, tr * (z.stage >= 4 ? 0.45 : 0.55));
      ai.goal = z.stage >= 4 ? { x: z.cx + Math.cos(ang) * rad * 0.6, z: z.cz + Math.sin(ang) * rad * 0.6 } : { x: z.cx + (dC > 1 ? (a.x - z.cx) / dC : Math.cos(ang)) * rad, z: z.cz + (dC > 1 ? (a.z - z.cz) / dC : Math.sin(ang)) * rad };
      const g = nearestOpen(st, ai.goal.x, ai.goal.z); if (g) ai.goal = g;
      ai.zoneOut = dC > curR;
      const duel = ai.mode === 'fight' && st.byId.get(ai.target) && st.byId.get(ai.target).alive && dist(a, st.byId.get(ai.target)) < 14 && pers !== 'cautious' && z.stage <= 4 && myHpF > 0.4;
      if (!(ai.zoneOut === false && threatsOf(st, a).length) && !duel) return; // fog urgency beats everything unless merely anticipating while hunted
    }
  }
  ai.zoneOut = false;
  // --- 2. threats
  const thr = threatsOf(st, a);
  let hostile = null, hd = 1e9;
  const calm = m.state === 'calm';
  const stg0 = z ? z.stage : 0, awareBase = stg0 >= 4 ? 110 : stg0 >= 3 ? 75 : stg0 >= 2 ? 45 : 34;
  for (const h of heroes) {
    if (h === a || !h.alive) continue;
    const d = dist(a, h), aware = h.crouching ? awareBase * 0.4 : awareBase;
    if (d >= aware) continue;
    const sc = d * (0.5 + hpFrac(h)) ; // prefer close and wounded
    if (sc < hd) { hd = sc; hostile = h; }
  }
  if (hostile) hd = dist(a, hostile);
  const inTruce = (x) => st.settlement && st.settlement.safe && Math.hypot(x.x - st.settlement.x, x.z - st.settlement.z) < st.settlement.r + 4;
  let engageHero = null;
  if (hostile && !calm && !inTruce(hostile) && !inTruce(a)) {
    const hp = power(hostile), ratio = me.p / Math.max(1, hp.p);
    const busy = thr.length > 0 || hostile.cs.state !== 'idle';
    const stg = z ? z.stage : 0, early = Math.max(1, 2.6 - st.t / 330) * (stg >= 3 ? 0.55 : stg >= 2 ? 0.8 : 1); // everyone is cautious about duels in the first minutes
    const need = AGGR[pers] * early / (P.skill > 0.9 ? 1 : 0.9);
    const weak = hpFrac(hostile) < 0.5 || (hostile.kind !== 'player' && hostile.ai && hostile.ai.target && st.byId.get(hostile.ai.target)?.kind === 'monster');
    if (ratio > need || (stg >= 4 && m.alive <= 4) || (stg >= 3 && ratio > 0.8 && pers !== 'cautious') || (pers === 'opportunist' && weak && ratio > 0.8)) engageHero = hostile;
    else if (ratio < 0.5 && hd < 26 && !(stg >= 4)) { ai.mode = 'flee'; ai.fleeFrom = hostile.id; ai.target = 0; return; }
    if (!engageHero && ratio < 1.0 && hd < 14 && hostile.cs.state === 'windup') engageHero = hostile; // cornered
    if (busy && ratio < 0.8 && thr.length) engageHero = null;
  }
  // monsters that are chasing us
  if (thr.length) {
    thr.sort((p, q) => dist(p, a) - dist(q, a));
    const gp = groupPower(thr, a);
    const losing = me.p < gp.p * 1.1 * (ai.bravery || 1) || (myHpF < 0.3 && potionCount(a) === 0);
    const boss = thr.some((t) => t.ai.boss);
    const fastest = Math.max(...thr.map((t) => t.d.moveSpeed)), canRun = a.d.moveSpeed * 1.5 > fastest * 1.05 && a.stamina > 20 && dist(thr[0], a) > 3.5;
    if ((losing || boss) && canRun) { ai.mode = 'flee'; ai.fleeFrom = thr[0].id; ai.fleeUntil = st.t + 6; return; }
    ai.mode = 'fight'; ai.target = (engageHero && dist(a, engageHero) < dist(a, thr[0])) ? engageHero.id : thr[0].id; return;
  }
  if (engageHero) { ai.mode = 'fight'; ai.target = engageHero.id; return; }
  if (ai.mode === 'fight') { ai.mode = 'loot'; ai.target = 0; }
  if (ai.mode === 'flee' && st.t > (ai.fleeUntil || 0)) ai.mode = 'loot';
  if (ai.mode === 'flee') return;
  // --- 3. rest when hurt and no healing
  if (myHpF < 0.55 && potionCount(a) === 0 && !(st.zone && ai.zoneOut)) { ai.mode = 'rest'; return; }
  if (ai.mode === 'rest' && myHpF < 0.85) return;
  // --- 4. loot / hunt / roam
  const loot = findLoot(st, a, RADIUS[pers] || 70);
  const camp = (pers === 'looter' && loot) ? null : pickCamp(st, a, me, pers);
  if (pers === 'aggressive' && camp && (!loot || st.rng() < 0.5)) { ai.mode = 'hunt'; ai.camp = camp; return; }
  if (loot) { ai.mode = 'loot'; ai.cur = loot; return; }
  if (camp) { ai.mode = 'hunt'; ai.camp = camp; return; }
  ai.mode = 'roam';
  if (!ai.goal || distXZ(a, ai.goal.x, ai.goal.z) < 6 || ai.goalMode !== 'roam') {
    const lim = Math.max(20, safeLimit(st)); const nav = getNav(st);
    for (let k = 0; k < 20; k++) {
      const ang = st.rng() * 6.283, r = Math.sqrt(st.rng()) * lim, x0 = (z ? z.cx : 0) + Math.cos(ang) * r; if (Math.hypot(x0, (z ? z.cz : 0) + Math.sin(ang) * r) < 50 && !templeOpen(st, a)) continue; const x = (z ? z.cx : 0) + Math.cos(ang) * r, zz = (z ? z.cz : 0) + Math.sin(ang) * r;
      const i = Math.floor((x + 200) / 4), j = Math.floor((zz + 200) / 4); if (i < 0 || j < 0 || i > 99 || j > 99) continue;
      if (nav.open[j * 100 + i] && nav.comp[j * 100 + i] === nav.main) { ai.goal = { x, z: zz }; ai.goalMode = 'roam'; break; }
    }
  }
}
function require_next(z) { return z.state === "holding" && !z.final ? NEXT_R[z.stage] : z.toR; }
const NEXT_R = [0, 170, 115, 65, 25, 6];

function nearestOpen(st, x, z) { const nav = getNav(st); const i = Math.floor((x + 200) / 4), j = Math.floor((z + 200) / 4); if (i >= 0 && j >= 0 && i < 100 && j < 100 && nav.open[j * 100 + i] && nav.comp[j * 100 + i] === nav.main) return { x, z }; return null; }

function pickCamp(st, a, me, pers) {
  let best = null, bs = -1e9; const need = HUNT[pers] || 1.7, lim = safeLimit(st), z = st.zone;
  for (const c of st.flow.camps) {
    const ms = []; for (const id of c.mons) { const m = st.byId.get(id); if (m && m.alive) ms.push(m); }
    if (!ms.length) continue;
    if (z && Math.hypot(c.x - z.cx, c.z - z.cz) > lim) continue;
    if (c.temple && !templeOpen(st, a)) continue;
    const gp = groupPower(ms, a); if (me.p < gp.p * need) continue;
    const d = Math.hypot(c.x - a.x, c.z - a.z), s = c.tier * 4 - d / 12 + (ms.length ? 0 : -20);
    if (s > bs) { bs = s; best = { id: c.id, x: c.x, z: c.z, ids: ms.map((m) => m.id) }; }
  }
  return best;
}

// ---------------------------------------------------------------- action
function act(st, a, inp, P) {
  const ai = a.ai;
  switch (ai.mode) {
    case 'zone': {
      if (!ai.goal) break;
      moveTo(st, a, inp, ai.goal.x, ai.goal.z, { sprint: ai.zoneOut || distXZ(a, ai.goal.x, ai.goal.z) > 18 });
      // swing back if something blocks the way and is adjacent
      break;
    }
    case 'flee': {
      // run away from the centroid of everything hunting us (stable direction), keeping inside the fog
      let cx = 0, cz = 0, n = 0, near = 1e9;
      for (const m of st.actors) {
        if (!m.alive || m === a || (m.kind !== 'monster' && m.id !== ai.fleeFrom)) continue;
        if (m.kind === 'monster' && !(m.ai && m.ai.target === a.id && m.ai.state === 'chase')) continue;
        const d = dist(m, a); if (d > 40) continue; cx += m.x; cz += m.z; n++; if (d < near) near = d;
      }
      if (!n) { ai.mode = 'loot'; break; }
      cx /= n; cz /= n;
      const z = st.zone, away = yawTo(a, cx, cz) + Math.PI;
      let tx = a.x + Math.cos(away) * 22, tz = a.z + Math.sin(away) * 22;
      if (z && z.stage <= 1) { const dc = Math.hypot(tx - z.cx, tz - z.cz); if (dc > safeLimit(st)) { tx = z.cx; tz = z.cz; } } // terrified runners forget the fog later on
      moveTo(st, a, inp, tx, tz, { sprint: true });
      if (near > 32) ai.mode = 'loot';
      break;
    }
    case 'fight': {
      const t = st.byId.get(ai.target);
      if (!t || !t.alive || dist(a, t) > (t.kind === 'monster' ? 55 : 120)) { ai.mode = 'loot'; ai.target = 0; break; }
      fight(st, a, inp, t, P); break;
    }
    case 'loot': {
      const c = ai.cur; if (!c) break;
      if (c.type === 'container' && (c.target.removed || (c.target.kind !== 'shrine' && !c.target.items.length))) { ai.cur = null; ai.thinkT = 0; break; }
      if (c.type === 'item' && !st.groundItems.includes(c.target)) { ai.cur = null; ai.thinkT = 0; break; }
      if (!interactWith(st, a, inp, c)) moveTo(st, a, inp, c.x, c.z, {});
      else if (c.type === 'container' && c.target.kind === 'shrine') ai.ignore[c.target.id] = st.t + 160;
      break;
    }
    case 'hunt': {
      const c = ai.camp; if (!c) break;
      let tgt = null, bd = 1e9;
      for (const id of c.ids) { const m = st.byId.get(id); if (m && m.alive) { const d = dist(a, m); if (d < bd) { bd = d; tgt = m; } } }
      if (!tgt) { ai.mode = 'loot'; break; }
      const ranged = a.d.weapon.ranged || a.d.weapon.kind === 'staff';
      if (bd < (ranged ? 17 : 9)) { fight(st, a, inp, tgt, P); break; }
      moveTo(st, a, inp, tgt.x, tgt.z, {});
      break;
    }
    case 'rest': { inp.crouch = true; break; }
    case 'roam': {
      if (ai.goal) moveTo(st, a, inp, ai.goal.x, ai.goal.z, {});
      break;
    }
    default: break;
  }
}
export { isHero, sprint };
