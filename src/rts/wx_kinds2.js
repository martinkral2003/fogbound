// WORLD lane: more site kinds (ruins, mercenaries, trader, shrines, cursed groves, hidden veins, portals, fog banks) + altar rite + hiring.
import { emit } from './core.js';
import { spawnN, grant, canPay, pay, announce, unitsNear, nearestUnit, killQuiet, dropLoot } from './neutrals.js';
import { makeSiteNode, guardsFor } from './wx_sites.js';

const alive = (st, ids) => { let n = 0; for (const id of ids) { const u = st.byId.get(id); if (u && u.alive) n++; } return n; };
const teamsIn = (st, s, r) => { let team = -1, n = 0, multi = false; for (const e of st.ents) { if (!e.alive || e.team < 0 || e.garrison || (e.x - s.x) ** 2 + (e.z - s.z) ** 2 > r * r) continue; if (team === -1) team = e.team; else if (team !== e.team) multi = true; n++; } return { team, n, multi }; };
export const buffOf = (st, team, name) => { const t = st.teams[team]; return !!(t && t.wxBuffs && t.wxBuffs[name] > st.t); };
export function setBuff(st, team, name, secs) { const t = st.teams[team]; (t.wxBuffs || (t.wxBuffs = {}))[name] = st.t + secs; }

export function step(st, s, dt) {
  switch (s.kind) {
    case 'ruin':
      if (s.state === 'guarded' && alive(st, s.guards) === 0) {
        s.state = 'cleared'; dropLoot(st, s.x, s.z, { relic: s.relic, res: { gold: 60 + 40 * s.tier } });
        const who = nearestUnit(st, s.x, s.z, 30); announce(st, `The ${s.name} is cleared - a relic lies in the dust.`, who ? who.team : undefined);
      }
      break;
    case 'mercs': case 'trader':
      for (const o of s.offers) if (o.have < o.stock) { o.t = (o.t || 0) + dt; if (o.t >= o.refill) { o.have++; o.t = 0; } }
      break;
    case 'shrine': {
      s.cd = Math.max(0, s.cd - dt);
      const p = teamsIn(st, s, 4.5);
      if (s.cd > 0 || p.team < 0 || p.multi) { s.act = 0; break; }
      s.act += dt;
      if (s.act >= 3) {
        s.act = 0; s.cd = 180; setBuff(st, p.team, s.buff, 75);
        if (s.buff === 'heal') for (const u of st.ents) if (u.alive && u.team === p.team) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.4);
        emit(st, { type: 'neutral', what: 'shrine', id: s.id, team: p.team, x: s.x, z: s.z });
        announce(st, `The hermit blesses ${st.teams[p.team].faction.name}: ${s.buff}.`, p.team);
      }
      break;
    }
    case 'grove': {
      s.cd = Math.max(0, s.cd - dt);
      const w = unitsNear(st, s.x, s.z, s.r, (e) => e.team >= 0 && e.role === 'worker');
      s.ambushT = w.length ? s.ambushT + dt * Math.min(3, w.length) : Math.max(0, s.ambushT - dt);
      if (s.ambushT >= 25 && s.cd <= 0) {
        s.ambushT = 0; s.cd = 100;
        for (const k of ['wraith', 'ghoul', 'ghoul']) spawnN(st, k, -1, s.x + (st.rng() - 0.5) * 8, s.z + (st.rng() - 0.5) * 8, { site: s.id, aggro: 16, after: { alert: 1 } });
        if (w.length) announce(st, 'The grove stirs - the dead rise among the trees!', w[0].team);
      }
      break;
    }
    case 'vein':
      if (!s.revealed) {
        const u = nearestUnit(st, s.x, s.z, 7);
        if (u) {
          s.revealed = true; const p = s.pending;
          s.node = makeSiteNode(st, p.rtype, p.res, p.x, p.z, p.amount, { name: p.name, slots: 6 });
          emit(st, { type: 'neutral', what: 'vein', id: s.id, team: u.team, x: s.x, z: s.z });
          announce(st, `${st.teams[u.team].faction.name} uncovered a hidden vein of gold!`, u.team);
        }
      }
      break;
    case 'portal': portalStep(st, s, dt); break;
    case 'fogbank': {
      const d = s.drift, a = d.a + st.t / 90, nx = d.x0 + Math.sin(a) * 9, nz = d.z0 + Math.cos(a * 0.8) * 9;
      if (st.world.walkable(nx, nz)) { s.x = nx; s.z = nz; }
      break;
    }
    default: break;
  }
}

function portalStep(st, s, dt) {
  s.cd = Math.max(0, s.cd - dt);
  const dst = st.byId.get(s.partner);
  if (!dst) return;
  const here = new Set();
  for (const u of unitsNear(st, s.x, s.z, 4, (e) => e.team >= 0 && !e.garrison && e.layer !== 'wall')) {
    here.add(u.id);
    if (s.cd > 0 || u.stun > 0) continue;
    s.charge[u.id] = (s.charge[u.id] || 0) + dt;
    if (s.charge[u.id] >= 2) {
      const a = st.rng() * 6.28, nx = dst.x + Math.cos(a) * 4, nz = dst.z + Math.sin(a) * 4;
      if (!st.world.walkable(nx, nz)) continue;
      u.x = nx; u.z = nz; u.y = st.world.heightAt(nx, nz); u.path = null; u.wp = null;
      s.cd = 6; dst.cd = 6; delete s.charge[u.id];
      emit(st, { type: 'neutral', what: 'portal', id: s.id, x: s.x, z: s.z, x2: nx, z2: nz });
    }
  }
  for (const id of Object.keys(s.charge)) if (!here.has(+id)) delete s.charge[id];
}

const RITE_SOULS = { necro: 11, orc: 9, demon: 17, cult: 20 };
export function rite(st, teamId, s, cmd) {
  if (!s || s.kind !== 'altar' || s.owner !== teamId || s.rite > 0) return true;
  const t = st.teams[teamId], ids = (cmd.ids || []).slice(0, 3);
  let n = 0;
  for (const id of ids) {
    const u = st.byId.get(id);
    if (!u || !u.alive || u.team !== teamId || u.role === 'general' || (u.x - s.x) ** 2 + (u.z - s.z) ** 2 > 14 * 14) continue;
    killQuiet(st, u); n++;
    emit(st, { type: 'death', id: u.id, kind: 'unit', unit: u.type, team: u.team, x: u.x, z: u.z, sacrificed: true });
  }
  if (!n) return true;
  grant(st, teamId, 'souls', n * (RITE_SOULS[t.faction.key] || 10));
  setBuff(st, teamId, 'frenzy', 60); s.rite = 30;
  announce(st, `${t.faction.name} sacrifices ${n} at the ${s.name}!`, teamId);
  return true;
}
export function hire(st, teamId, s, cmd, kind) {
  const t = st.teams[teamId];
  if (!s || s.kind !== kind) return true;
  const o = s.offers.find((q) => q.unit === cmd.unit);
  if (!o || o.have <= 0 || !canPay(st, teamId, o.cost)) return true;
  if (!unitsNear(st, s.x, s.z, s.r + 14, (e) => e.team === teamId).length) return true;
  if (t.pop.mil + o.n > t.cap.mil) return true;
  pay(st, teamId, o.cost); o.have--;
  for (let i = 0; i < o.n; i++) {
    const u = spawnN(st, o.unit, teamId, s.x + (i - 0.5) * 2.4, s.z + 4, {});
    if (u && t.generals && u.stance == null) u.stance = 'aggressive';
  }
  emit(st, { type: 'neutral', what: 'hire', id: s.id, team: teamId, x: s.x, z: s.z });
  return true;
}
export { guardsFor };
