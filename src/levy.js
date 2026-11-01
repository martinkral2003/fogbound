// v0.6 the levy: the free peoples' soldiers. A reserve of recruits (st.levy.reserve) is turned into SQUADS of militia (team 4) that march to towns under attack,
// ring the capital during its siege and otherwise patrol between the standing towns. Your actions change the reserve:
//   + clearing a monster camp, saving a town, killing an elite, closing / destroying the fortress heart;   - a town falling, a hero dying, the capital falling.
// So a hero who keeps the wilds clear and the towns alive is rewarded with more squads, one who loses towns finds the roads empty. Sim only.
import { simApi } from './sim.js';
import { LEVY } from './data.js';
import { gateList } from './horde.js';

const hyp = Math.hypot;
let acc = 0;

export function init(st) { st.levy = { reserve: LEVY.start, squads: [], nextId: 1, gained: 0, lost: 0, deployed: 0, fallen: 0, lastAssaultT: 0 }; }
const L = (st) => st.levy || (st.levy = { reserve: LEVY.start, squads: [], nextId: 1, gained: 0, lost: 0, deployed: 0, fallen: 0, lastAssaultT: 0 });
/** add (or remove, n < 0) soldiers from the reserve */
export function addReserve(st, n, why) {
  const l = L(st), before = l.reserve;
  l.reserve = Math.max(0, Math.min(LEVY.max, l.reserve + n));
  if (n > 0) l.gained += l.reserve - before; else l.lost += before - l.reserve;
  if (Math.abs(n) >= 8) st.events.push({ type: 'msg', text: (n > 0 ? `+${Math.round(n)} soldiers answer the call` : `${Math.round(-n)} soldiers lost`) + (why ? ` (${why})` : ''), kind: n > 0 ? 'info' : 'warn' });
}

const standing = (st) => (st.towns || []).filter((t) => t.state !== 'fallen');
const nearestStanding = (st, x, z) => { let b = null, bd = 1e9; for (const t of standing(st)) { const d = hyp(t.x - x, t.z - z); if (d < bd) { bd = d; b = t; } } return b; };

export function onKill(st, t) {
  if (!t) return;
  if (t.kind === 'hero') { addReserve(st, -LEVY.heroDeath); return; }
  if (t.kind !== 'mon') return;
  if (t.hgate !== undefined || t.hz === 'gate') { addReserve(st, LEVY.fortress, 'the fortress heart falls'); return; }
  if (t.elite) addReserve(st, LEVY.elite);
  const camp = t.camp !== undefined ? st.camps[t.camp] : null;
  if (camp && !camp.noResp && !camp.horde && camp.mons <= 1) addReserve(st, LEVY.camp, 'camp cleared');
}

function spawnSquad(st, from, dest, mode, size, townId) {
  const l = L(st), ids = [];
  const comp = []; for (let i = 0; i < size; i++) comp.push(i === 0 && size >= 6 ? 'militiaCaptain' : i % 3 === 2 ? 'militiaArcher' : 'militia');
  comp.forEach((key, i) => {
    const a = (i / size) * 6.283, x = from.x + Math.cos(a) * 3.5, z = from.z + Math.sin(a) * 3.5;
    const e = simApi.spawnUnit(st, key, 4, x, z, { guard: true });
    if (!e) return;
    e.mode = 'amove'; e.dest = { x: dest.x, z: dest.z }; e.path = null; e.tg = 'levy'; e.squad = l.nextId; e.tierMul = 1 + 0.25 * Math.min(1, st.t / 900); simApi.recalc(e); e.hp = e.maxHp;
    ids.push(e.id);
  });
  if (!ids.length) return null;
  const sq = { id: l.nextId++, ids, mode, x: dest.x, z: dest.z, townId: townId || 0, t: st.t };
  l.squads.push(sq); l.reserve -= ids.length; l.deployed += ids.length;
  st.events.push({ type: 'squad', x: from.x, z: from.z, n: ids.length, mode });
  return sq;
}
const order = (st, sq, x, z) => { sq.x = x; sq.z = z; for (const id of sq.ids) { const u = st.byId.get(id); if (u && u.alive) { u.mode = 'amove'; u.dest = { x, z }; u.path = null; u.tgt = 0; } } };

export function update(st, dt) {
  const l = L(st);
  onEvents(st);
  acc += dt; if (acc < 2) return; const step = acc; acc = 0;
  const S = standing(st);
  // regeneration: the more towns stand, the more recruits come
  l.reserve = Math.min(LEVY.max, l.reserve + LEVY.regenPerTown * S.length * step);
  // squads: drop the dead, retire squads that lost everyone
  for (let i = l.squads.length - 1; i >= 0; i--) { const sq = l.squads[i]; sq.ids = sq.ids.filter((id) => { const u = st.byId.get(id); return u && u.alive; }); if (!sq.ids.length) { l.fallen++; l.squads.splice(i, 1); } }
  const cap = (st.towns || []).find((t) => t.kind === 'capital');
  const home = cap && cap.state !== 'fallen' ? cap : S[0];
  if (!home) return;
  const size = LEVY.squadSize;
  // 1. towns under attack get a relief squad (not the one being attacked if it is the only base); the capital siege calls everyone
  for (const t of st.towns || []) {
    if (t.state !== 'besieged' || l.reserve < size) continue;
    if (t.id === home.id && cap && st.horde && st.horde.capital.state === 'siege') { if (st.t - (l.capT || 0) >= 8) { l.capT = st.t; spawnSquad(st, home, home, 'relief', size, t.id); } continue; } // the siege calls everyone, a squad every 8 s while the reserve lasts
    if (l.squads.some((sq) => sq.mode === 'relief' && sq.townId === t.id && st.t - sq.t < 90)) continue;
    if (t.id !== home.id) spawnSquad(st, home, t, 'relief', size, t.id);
  }
  // 1.5 offensive muster: once relief/patrol needs are covered (handled above/below) a deep-enough surplus reserve sends a bigger squad
  // at the open gate / fortress heart instead of just patrolling. Size scales with the reserve: good hero play (camps cleared, towns
  // saved) sends a stronger army. Not gated on "nothing besieged": relief squads already spent reserve first this same tick, so only
  // a real surplus clears the threshold.
  if (l.reserve >= LEVY.assaultAt && st.t - l.lastAssaultT >= LEVY.assaultEvery) {
    const open = (typeof gateList === 'function' ? gateList(st) : []).filter((g) => !g.closed);
    const target = open[0] || (st.fortress ? { x: st.fortress.x, z: st.fortress.z } : null);
    if (target) {
      const n = Math.min(LEVY.assaultMaxSize, Math.max(LEVY.assaultSize, Math.round(l.reserve * LEVY.assaultPerReserve)));
      if (l.reserve >= n) { spawnSquad(st, home, target, 'assault', n, -1); l.lastAssaultT = st.t; st.events.push({ type: 'msg', text: `A ${n}-strong muster marches on the ${open[0] ? 'gate' : 'fortress'}!`, kind: 'info' }); }
    }
  }
  // 2. patrol squads while the reserve allows (more reserve = more squads on the roads)
  const wantPatrols = Math.min(LEVY.maxPatrols, Math.floor(l.reserve / LEVY.perPatrol));
  const patrols = l.squads.filter((sq) => sq.mode === 'patrol').length;
  if (patrols < wantPatrols && l.reserve >= size + 10 && S.length > 1) { const to = S[Math.floor(st.rng() * S.length)]; spawnSquad(st, home, to, 'patrol', size, to.id); }
  // 3. squad behaviour: relief squads go back on patrol when the town is safe again, patrols walk on to the next standing town
  for (const sq of l.squads) {
    const lead = sq.ids.map((id) => st.byId.get(id)).find((u) => u && u.alive);
    if (!lead) continue;
    const t = (st.towns || []).find((q) => q.id === sq.townId);
    if (sq.mode === 'relief' && (!t || t.state !== 'besieged') && st.t - sq.t > 25) { sq.mode = 'patrol'; }
    if (sq.mode === 'patrol' && hyp(lead.x - sq.x, lead.z - sq.z) < 14) {
      const pick = S.filter((q) => q.id !== sq.townId);
      const to = pick.length ? pick[Math.floor(st.rng() * pick.length)] : home;
      sq.townId = to.id; order(st, sq, to.x + (st.rng() - 0.5) * 10, to.z + (st.rng() - 0.5) * 10);
    }
    // squads whose town fell fall back to the nearest standing one
    if (t && t.state === 'fallen' && sq.mode !== 'patrol') { const n = nearestStanding(st, lead.x, lead.z); if (n) { sq.mode = 'patrol'; sq.townId = n.id; order(st, sq, n.x, n.z); } }
  }
}
/** { reserve, squads, soldiers } for the HUD: soldiers = alive squad members + the reserve */
export function summary(st) {
  const l = L(st); let alive = 0; for (const sq of l.squads) alive += sq.ids.length;
  return { reserve: Math.round(l.reserve), squads: l.squads.length, soldiers: alive, deployed: l.deployed, gained: Math.round(l.gained), lost: Math.round(l.lost) };
}
/** the town saved bonus (called from the events the horde / towns lanes already emit: see the event loop below) */
export function onEvents(st) { for (const e of st.events) { if (e.type === 'townSaved') addReserve(st, LEVY.saved, 'town saved'); else if (e.type === 'townFallen') addReserve(st, -LEVY.townFallen, 'a town has fallen'); else if (e.type === 'capitalFallen') { L(st).reserve = 0; } } }
