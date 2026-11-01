// v0.6 co-op orders: the human hero gives standing orders to the allied AI heroes. Sim only.
//   command { t:'order', kind:'attack'|'gather'|'follow'|'free', x, z }  ->  st.orders = { kind, x, z, t, by }
//   attack = every ally attack-moves to (x, z) and fights there (also breaks buildings: walls, towers, the fortress);  gather = come to the point and hold;
//   follow = escort the human hero;  free = back to their own plan.   ai_plan.js reads st.orders; it expires after ORDER_TTL seconds (gather / attack end when reached).
export const ORDER_KINDS = ['attack', 'gather', 'follow', 'free'];
const ORDER_TTL = { attack: 90, gather: 120, follow: 1e9, free: 0 };

export function command(st, team, c) {
  if (c.t !== 'order') return false;
  if (!team.human || !ORDER_KINDS.includes(c.kind) || !team.hero) return true;
  const h = team.hero;
  const x = Number.isFinite(c.x) ? c.x : h.x, z = Number.isFinite(c.z) ? c.z : h.z;
  st.orders = { kind: c.kind, x, z, t: st.t, by: team.id, until: st.t + ORDER_TTL[c.kind] };
  st.events.push({ type: 'order', kind: c.kind, x, z, team: team.id });
  return true;
}
export function update(st) {
  const o = st.orders;
  if (o && o.kind !== 'free' && st.t > o.until) st.orders = { kind: 'free', x: o.x, z: o.z, t: st.t, by: o.by, until: 0 };
}
/** the active order (not 'free') or null */
export const activeOrder = (st) => (st.orders && st.orders.kind !== 'free' ? st.orders : null);
