// ECON lane: market trade, sacrifice and soul gain rules.
import { RES } from './consts.js';
import { killEnt, emit } from './core.js';
import * as Units from './units.js';
import * as Buildings from './buildings.js';
import { ECON, SOULS, SOUL_SITE_RE, MARKET_RE } from './econ_data.js';

const defOf = (type) => { try { return Units.def(type) || {}; } catch (e) { return {}; } };

// ---- market: price multipliers drift around 1 (mean reverting random walk, driven by st.rng)
export function market(st) {
  if (!st.market) st.market = { price: Object.fromEntries(RES.map((r) => [r, 1])), next: ECON.priceDriftEvery };
  return st.market;
}
export function prices(st) { const m = market(st); return Object.fromEntries(RES.map((r) => [r, ECON.baseValue[r] * m.price[r]])); }
export function tickMarket(st, dt) {
  const m = market(st);
  if (st.t < m.next) return;
  m.next = st.t + ECON.priceDriftEvery;
  for (const r of RES) if (r !== 'souls') m.price[r] = Math.min(2, Math.max(0.5, m.price[r] + (1 - m.price[r]) * 0.08 + (st.rng() - 0.5) * 0.06));
}
export function hasMarket(st, teamId) { return st.blds.some((b) => b.team === teamId && b.state === 'ready' && MARKET_RE.test(b.type)); }
export function trade(st, teamId, give, get, amount, addRes) {
  const t = st.teams[teamId], m = market(st);
  amount = Math.floor(+amount || 0);
  const msg = (text) => emit(st, { type: 'msg', team: teamId, text, kind: 'warn' });
  if (!RES.includes(give) || !RES.includes(get) || give === get || give === 'souls' || get === 'souls') { msg('Souls cannot be traded'); return true; }
  if (!hasMarket(st, teamId)) { msg('You need a Market to trade'); return true; }
  amount = Math.min(amount, ECON.tradeMax, Math.floor(t.res[give]));
  if (amount < 1) return true;
  const out = Math.floor(amount * (ECON.baseValue[give] * m.price[give]) / (ECON.baseValue[get] * m.price[get]) * (1 - ECON.marketFee));
  if (out < 1) { msg('Trade too small'); return true; }
  t.res[give] -= amount; addRes(st, t, get, out);
  m.price[give] = Math.max(0.5, m.price[give] * (1 - ECON.tradeImpact * amount));
  m.price[get] = Math.min(2, m.price[get] * (1 + ECON.tradeImpact * out));
  emit(st, { type: 'msg', team: teamId, text: 'Traded ' + amount + ' ' + give + ' for ' + out + ' ' + get, kind: 'info' });
  return true;
}

// ---- souls
export function soulValue(u) {
  const d = defOf(u.type), tier = d.tier || u.tier || 1, pop = u.popCost != null ? u.popCost : d.popCost != null ? d.popCost : 1;
  const base = SOULS.tierValue[u.general ? 'general' : u.role] != null ? SOULS.tierValue[u.general ? 'general' : u.role] : 1.5;
  return base * (1 + 0.25 * (tier - 1)) * Math.max(1, Math.sqrt(pop)) * (1 + 0.1 * ((u.vet || 1) - 1));
}
function sites(st, x, z) {
  const owners = new Set();
  for (const b of st.blds) if (b.state === 'ready' && b.hp > 0 && SOUL_SITE_RE.test(b.type) && Math.hypot(b.x - x, b.z - z) < SOULS.siteRadius) owners.add(b.team);
  let haunted = false;
  for (const n of st.nodes) if (n.rtype === 'graveyard' && Math.hypot(n.x - x, n.z - z) < n.r + 12) { haunted = true; break; }
  return { owners, haunted };
}
export function soulsOnDeath(st, v, killer, addRes) {
  if (v.sacrificed || v.deserted || v.kind !== 'unit') return;
  const val = soulValue(v), k = killer && killer.team != null && st.teams[killer.team] && killer.team !== v.team ? killer.team : -1;
  const { owners, haunted } = sites(st, v.x, v.z);
  const share = new Map();
  if (k >= 0) share.set(k, val * SOULS.killerShare * (owners.has(k) ? SOULS.siteBonus : 1) * (haunted ? SOULS.hauntBonus : 1));
  for (const q of owners) if (q !== k) share.set(q, (share.get(q) || 0) + val * SOULS.siteShare);
  for (const [q, s] of share) {
    const t = st.teams[q]; if (!t || !t.alive) continue;
    const amt = s * (t.faction.key === 'necro' ? SOULS.necroBonus : 1);
    addRes(st, t, 'souls', amt);
    if (amt >= 0.5) emit(st, { type: 'gather', unit: killer ? killer.id : 0, res: 'souls', amt: Math.round(amt * 10) / 10, x: v.x, z: v.z, team: q });
  }
}
export function sacrifice(st, teamId, ids, addRes) {
  const t = st.teams[teamId], mult = SOULS.sacrifice[t.faction.key] || 1;
  let n = 0, souls = 0, blood = 0;
  for (const id of (ids || []).slice(0, 25)) {
    const u = st.byId.get(id);
    if (!u || !u.alive || u.team !== teamId || u.kind !== 'unit' || u.general) continue;
    const d = defOf(u.type), cost = d.cost || {};
    const s = Math.max(1, soulValue(u) * mult * 0.9), bl = ((cost.blood || 0) + (cost.gold || 0) * 0.2 + (cost.timber || 0) * 0.1) * SOULS.sacrificeBlood + (u.role === 'worker' ? 6 : 8);
    u.sacrificed = true; killEnt(st, u, null);
    addRes(st, t, 'souls', s); addRes(st, t, 'blood', bl); souls += s; blood += bl; n++;
    emit(st, { type: 'gather', unit: id, res: 'souls', amt: Math.round(s * 10) / 10, x: u.x, z: u.z, team: teamId });
  }
  if (n) emit(st, { type: 'msg', team: teamId, text: 'Sacrificed ' + n + ' for ' + Math.round(souls) + ' souls, ' + Math.round(blood) + ' blood', kind: 'info' });
  return n > 0 || true;
}
void Buildings;
