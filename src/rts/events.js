// WORLD lane: timed events (Dread Moon, plague, meteors, comet of souls, Great Beast, convoys), death hooks, Sunken Temple ritual.
import { emit } from './core.js';
import * as Combat from './combat.js';
import { DREAD, DREAD_TIMES, BEAM_TIME, RITUAL_TIME } from './world_data.js';
import { announce, nearestUnit, grant, grantAll, dropLoot, unitsNear, wx } from './neutrals.js';
import { newSite, makeSiteNode } from './wx_sites.js';
import { rotK } from './wx_place.js';

export function init(st) {
  const q0 = Math.floor(st.rng() * 4);
  const sched = [];
  DREAD_TIMES.forEach((t) => sched.push({ at: t, type: 'dread' }));
  [360, 840, 1320, 1800].forEach((t, i) => sched.push({ at: t + Math.floor(st.rng() * 40), type: 'plague', q: (q0 + i) % 4 }));
  [660, 1140, 1620].forEach((t, i) => sched.push({ at: t, type: 'meteor', q: (q0 + 2 + i) % 4 }));
  sched.push({ at: 780, type: 'comet', q: (q0 + 1) % 4 }, { at: 1020, type: 'beast' }, { at: 540, type: 'convoy' }, { at: 1200, type: 'convoy' });
  sched.sort((a, b) => a.at - b.at);
  st.events2 = { sched, dread: false, dreadUntil: 0, plagues: [], impacts: [], log: [], beam: false };
  st.temple = { open: false, holder: -1, t: 0, need: RITUAL_TIME, contested: false, beam: false, guardian: 0 };
}
const log = (st, type, extra) => { st.events2.log.push({ t: Math.round(st.t), type, ...extra }); };

function fire(st, e) {
  const ev = st.events2;
  switch (e.type) {
    case 'dread': ev.dread = true; ev.dreadUntil = st.t + DREAD.dur; st.time.forced = true;
      for (const u of st.ents) if (u.alive && u.team < 0 && u.aggro) { u.aggro0 = u.aggro; u.aggro *= DREAD.aggro; }
      announce(st, 'The Dread Moon rises! The wild things rage.'); emit(st, { type: 'weather', kind: 'dread' }); log(st, 'dread'); break;
    case 'plague': {
      const [x, z] = rotK(-70, -105, e.q);
      ev.plagues.push({ x, z, r: 24, until: st.t + 110, q: e.q });
      announce(st, 'A plague spreads near ' + st.teams[e.q].faction.name + ' lands - workers sicken!'); emit(st, { type: 'neutral', what: 'plague', x, z }); log(st, 'plague', { q: e.q }); break;
    }
    case 'meteor': {
      const [x, z] = rotK(-62, -58, e.q);
      for (let i = 0; i < 12; i++) ev.impacts.push({ at: st.t + 4 + i * 2 + st.rng() * 1.5, x: x + (st.rng() - 0.5) * 56, z: z + (st.rng() - 0.5) * 56 });
      announce(st, 'Meteors streak across the sky!'); log(st, 'meteor', { q: e.q }); break;
    }
    case 'comet': {
      const [x, z] = rotK(0, -72, e.q);
      const s = newSite(st, 'soulpool', 'comet', x, z, { name: 'Comet of Souls', r: 9, pool: 600, rate: 30, until: st.t + 240 });
      announce(st, 'A Comet of Souls has fallen near the temple!'); emit(st, { type: 'neutral', what: 'comet', id: s.id, x, z }); log(st, 'comet', { x, z }); break;
    }
    case 'beast': {
      const b = st.byId.get(wx(st).behemoth);
      if (b && b.alive) { b.dormant = false; b.aggro = 22; announce(st, 'The Great Behemoth awakens and rampages across the island!'); emit(st, { type: 'neutral', what: 'beast', id: b.id, x: b.x, z: b.z }); }
      log(st, 'beast'); break;
    }
    case 'convoy':
      for (const s of st.neutral) if (s.kind === 'caravan' && s.state !== 'moving') s.respawnAt = 0;
      announce(st, 'A grand supply convoy sets out between the strongholds.'); log(st, 'convoy'); break;
    default: break;
  }
}
export function update(st, dt) {
  const ev = st.events2;
  while (ev.sched.length && st.t >= ev.sched[0].at) fire(st, ev.sched.shift());
  const nx = ev.sched.find((e) => e.type === 'dread');
  if (nx && !ev.warned && nx.at - st.t < DREAD.warn && !ev.dread) { ev.warned = true; announce(st, 'The Dread Moon will rise soon...'); }
  if (ev.dread && st.t >= ev.dreadUntil) {
    ev.dread = false; ev.warned = false; st.time.forced = false;
    for (const u of st.ents) if (u.aggro0) { u.aggro = u.aggro0; u.aggro0 = 0; }
    announce(st, 'The Dread Moon sets.');
  }
  while (ev.impacts.length && st.t >= ev.impacts[0].at) impact(st, ev.impacts.shift());
  if (!ev.beam && st.t >= BEAM_TIME) { ev.beam = true; st.temple.beam = true; announce(st, 'A beam of light rises from the Sunken Temple!'); }
}
function impact(st, p) {
  if (!st.world.walkable(p.x, p.z)) return;
  emit(st, { type: 'fire', x: p.x, z: p.z }); emit(st, { type: 'neutral', what: 'meteor', x: p.x, z: p.z });
  const src = { id: 0, team: -1, x: p.x, z: p.z };
  for (const u of unitsNear(st, p.x, p.z, 4.5)) { try { Combat.damage(st, src, u, 120, { dtype: 'fire', splash: true }); } catch (e) { u.hp -= 100; } }
  for (const b of st.blds) if (b.state !== 'ruin' && (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 36) { try { Combat.damage(st, src, b, 140, { dtype: 'fire' }); } catch (e) { b.hp -= 140; } }
  if (st.rng() < 0.45) newSite(st, 'soulpool', 'crater', p.x, p.z, { name: 'Soul Crater', r: 6, pool: 70, rate: 12, until: st.t + 300 });
  else makeSiteNode(st, 'quarry', 'stone', p.x, p.z, 300, { name: 'Meteor Ore', slots: 3, crater: true });
}
function pools(st, dt) {
  for (let i = st.neutral.length - 1; i >= 0; i--) {
    const s = st.neutral[i];
    if (s.kind !== 'soulpool') continue;
    if (s.pool <= 0 || st.t >= s.until) { st.neutral.splice(i, 1); st.byId.delete(s.id); continue; }
    let team = -1, multi = false;
    for (const u of unitsNear(st, s.x, s.z, s.r, (e) => e.team >= 0 && !e.garrison)) { if (team < 0) team = u.team; else if (u.team !== team) multi = true; }
    if (team < 0 || multi) continue;
    const g = Math.min(s.pool, s.rate * dt); s.pool -= g; grant(st, team, 'souls', g);
  }
}
function plagueTick(st, dt) {
  const ev = st.events2;
  ev.plagues = ev.plagues.filter((p) => p.until > st.t);
  for (const p of ev.plagues) for (const u of unitsNear(st, p.x, p.z, p.r, (e) => e.team >= 0 && e.role === 'worker')) { try { Combat.damage(st, null, u, 1.2 * dt, { dtype: 'poison' }); } catch (e) { u.hp -= dt; } }
}
// death hooks: scan new 'death' events (tagged so each is processed once)
function deathHooks(st) {
  const E = st.events;
  for (let i = E.length - 1; i >= 0; i--) {
    const e = E[i];
    if (e._wx) break;
    e._wx = true;
    if (e.type !== 'death' || e.kind !== 'unit' || e.sacrificed) continue;
    const v = st.byId.get(e.id), killer = nearestUnit(st, e.x, e.z, 22, (u) => u.team !== e.team);
    let souls = 0;
    for (const s of st.neutral) if (s.kind === 'battlefield' && (s.x - e.x) ** 2 + (s.z - e.z) ** 2 < s.r * s.r) { souls += 3; break; }
    if (st.events2.dread && e.team < 0) souls += 4 * (DREAD.souls - 1);
    if (killer && souls) grant(st, killer.team, 'souls', souls);
    if (e.team < 0 && v && killer) {
      if (v.bounty && !v.herd && !v.bountyPaid) { v.bountyPaid = true; grantAll(st, killer.team, v.bounty, st.events2.dread ? 1.5 : 1); }
      if (v.boss && v.type === 'behemoth') {
        dropLoot(st, e.x, e.z, { res: { gold: 600, stone: 200, souls: 150 }, relic: 'ironheart' });
        announce(st, 'The Great Behemoth has fallen!', killer.team);
      }
    }
  }
}
export function slow(st, dt) {
  deathHooks(st); pools(st, dt); plagueTick(st, dt); temple(st, dt);
}
function temple(st, dt) {
  const T = st.temple, ts = st.neutral.find((s) => s.kind === 'temple');
  if (!ts) return;
  const g = ts.guardian ? st.byId.get(ts.guardian) : null;
  T.guardian = g && g.alive ? g.id : 0;
  if (!T.open && !T.guardian) { T.open = true; announce(st, 'The Temple guardian has fallen! Hold the Sunken Temple to complete the ritual.'); }
  if (!T.open) return;
  let holder = -1, multi = false;
  for (const u of unitsNear(st, ts.x, ts.z, ts.r, (e) => e.team >= 0 && !e.garrison && e.role !== 'worker')) { if (holder < 0) holder = u.team; else if (u.team !== holder) multi = true; }
  T.contested = multi;
  if (multi) return;
  if (holder < 0) { T.t = Math.max(0, T.t - 0.5 * dt); if (T.t === 0) T.holder = -1; return; }
  if (!st.teams[holder].alive) return;
  if (T.holder !== holder) { T.holder = holder; T.t = 0; announce(st, `${st.teams[holder].faction.name} began the ritual at the Sunken Temple! Stop them!`, holder); }
  const before = T.t; T.t += dt;
  for (const m of [T.need / 2, T.need - 30]) if (before < m && T.t >= m) announce(st, `The ritual is ${Math.round(T.t / T.need * 100)}% complete!`);
  if (T.t >= T.need && !st.over) { st.over = { winner: holder, reason: 'ritual' }; announce(st, `${st.teams[holder].faction.name} completed the ritual!`); }
}
export function command(st, teamId, cmd) { return false; }
export const templeState = (st) => ({ ...st.temple });
