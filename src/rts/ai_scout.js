// AI lane: scouting (one fast unit tours enemy approaches), raiders (hit-and-run on workers), neutral structure capture.
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const mv = (cmds, ids, x, z, queue) => cmds.push({ t: 'order', ids, order: { type: 'move', x, z }, queue: !!queue });

function fastest(us, n) { return us.slice().sort((a, b) => (b.speed || 0) - (a.speed || 0)).slice(0, n); }

export function scout(st, ai, cmds) {
  const s = ai.s, P = ai.P;
  if (ai.scout) {
    const u = st.byId.get(ai.scout.id);
    if (!u || !u.alive) { ai.scout.dead = true; if (st.t - ai.scout.t0 > 20) ai.scoutDone = (ai.scoutDone || 0) + 1; ai.scout = null; return; }
    if (!u.order && st.t - ai.scout.t0 > 8) { ai.scout = null; ai.scoutDone = (ai.scoutDone || 0) + 1; }
    return;
  }
  if (s.t < P.scout || (ai.scoutDone || 0) >= (ai.D.micro ? 3 : 1) || s.mil.length < 3 || ai.alert || st.t - (ai.scoutLast || -999) < 150) return;
  const pool = s.mil.filter((u) => u.role !== 'siege' && !u.garrison && (!ai.raid || !ai.raid.ids.has(u.id)));
  const u = fastest(pool, 1)[0];
  if (!u) return;
  ai.scoutLast = st.t;
  ai.scout = { id: u.id, t0: st.t };
  // tour: the nearest enemy approach, then the next one, then home
  const enemies = st.teams.filter((t) => t.alive && t.id !== ai.team).sort((a, b) => dist(a.base, s.home) - dist(b.base, s.home));
  const h = s.home;
  let first = true;
  for (const e of enemies.slice(0, 2)) {
    const k = e.base, d = dist(k, h), f = Math.max(0, 1 - 42 / d); // stop ~42 m short of the keep
    mv(cmds, [u.id], h.x + (k.x - h.x) * f + 12, h.z + (k.z - h.z) * f - 12, !first); first = false;
    mv(cmds, [u.id], h.x + (k.x - h.x) * f - 12, h.z + (k.z - h.z) * f + 12, true);
  }
  mv(cmds, [u.id], h.x, h.z, true);
}
export function raid(st, ai, cmds) {
  const s = ai.s, P = ai.P;
  if (!P.raid) return;
  let R = ai.raid;
  if (R) {
    const us = [...R.ids].map((id) => st.byId.get(id)).filter((u) => u && u.alive);
    for (const id of [...R.ids]) { const u = st.byId.get(id); if (!u || !u.alive) R.ids.delete(id); }
    const hurt = us.filter((u) => u.hp < u.maxHp * 0.45).length;
    const foes = s.enemy.filter((e) => e.role !== 'worker' && us.length && dist(e, us[0]) < 30).length;
    if (us.length < 3 || hurt > us.length * 0.4 || foes > us.length * 1.3 || st.t - R.t0 > 120) {
      const rp = s.home;
      cmds.push({ t: 'order', ids: us.map((u) => u.id), order: { type: 'move', x: rp.x, z: rp.z } });
      ai.raid = null; ai.raidLast = st.t;
      return;
    }
    if (st.t - (R.last || 0) > 4 && s.enemyW.length) {
      R.last = st.t;
      let best = null, bd = 1e9;
      for (const w of s.enemyW) { const d = dist(w, us[0]); if (d < bd) { bd = d; best = w; } }
      if (best) cmds.push({ t: 'order', ids: us.map((u) => u.id), order: { type: 'amove', x: best.x, z: best.z } });
    }
    return;
  }
  if (s.t < P.scout + 90 || s.mil.length < 8 || ai.alert || st.t - (ai.raidLast || -999) < 90) return;
  const pool = fastest(s.mil.filter((u) => u.role !== 'siege' && !u.garrison && (!ai.scout || ai.scout.id !== u.id)), Math.min(10, Math.floor(s.mil.length * 0.5)));
  if (pool.length < 5) return;
  // go for the enemy whose workers we last saw (or nearest enemy economy edge)
  const e = st.teams.filter((t) => t.alive && t.id !== ai.team).sort((a, b) => dist(a.base, s.home) - dist(b.base, s.home))[0];
  if (!e) return;
  const k = e.base, h = s.home, d = dist(k, h), f = 1 - 32 / d;
  ai.raid = { ids: new Set(pool.map((u) => u.id)), t0: st.t, last: st.t, team: e.id };
  cmds.push({ t: 'order', ids: pool.map((u) => u.id), order: { type: 'amove', x: h.x + (k.x - h.x) * f + 14, z: h.z + (k.z - h.z) * f - 14 } });
  ai.log.push([Math.round(st.t), 'raid', e.id, pool.length]);
}
// capture / claim neutral structures (villages, altars, leylines, relics ruins) with a small detachment when safe
export function neutrals(st, ai, cmds) {
  const s = ai.s;
  if (st.t - (ai.lastNeu || 0) < 20 || ai.alert || s.mil.length < 6 || !st.neutral || !st.neutral.length) return;
  ai.lastNeu = st.t;
  const ex = new Set([...(ai.scout ? [ai.scout.id] : []), ...(ai.raid ? [...ai.raid.ids] : [])]);
  let best = null, bd = 100;
  for (const n of st.neutral) {
    if (n.owner !== undefined && n.owner !== -1 && n.owner !== null) continue;
    if (n.hostile || n.ruin === false || (ai.nCap && st.t - (ai.nCap[n.id] || -999) < 120)) continue;
    const d = dist(n, s.home);
    if (d < bd) { bd = d; best = n; }
  }
  if (!best) return;
  (ai.nCap || (ai.nCap = {}))[best.id] = st.t;
  const pool = s.mil.filter((u) => !ex.has(u.id) && u.role !== 'siege' && !u.garrison && !u.order).slice(0, 6);
  if (pool.length < 4) return;
  cmds.push({ t: 'order', ids: pool.map((u) => u.id), order: { type: 'amove', x: best.x, z: best.z } });
  cmds.push({ t: 'order', ids: pool.map((u) => u.id), order: { type: 'move', x: s.home.x + 10, z: s.home.z + 10 }, queue: true });
}
