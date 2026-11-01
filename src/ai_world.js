// FOGBOUND v0.5 ALLIES: the allied heroes' view of the world. A thin defensive adapter over the sim state (other lanes' data may be missing or
// mid-rewrite): towns, waystones, the current objective, the Demon Gates and the group anchor (the human hero, else the lead ally).
import { d2 } from './ai_util.js';

// ---- towns / waystones
export function towns(st, all = false) {
  const list = st.towns || (st.world.sites && st.world.sites.towns) || [];
  return all ? list : list.filter((t) => t.state !== 'fallen');
}
export function nearestTown(st, x, z, pred) {
  let best = null, bd = 1e9;
  for (const t of towns(st)) { if (pred && !pred(t)) continue; const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } }
  return best ? { t: best, d: bd } : null;
}
export const townAt = (st, x, z, pad = 0) => { for (const t of towns(st)) if (Math.hypot(x - t.x, z - t.z) < (t.r || 30) + pad) return t; return null; };
export function waystones(st, teamId, ex) {
  const out = [];
  for (const w of st.waystones || []) {
    if (w.disc && !w.disc[teamId]) continue;
    if (w.lost || w.fallen || w.down || (ex && ex(w))) continue;
    out.push(w);
  }
  return out;
}
export function nearestWaystone(st, teamId, x, z, ex) {
  let best = null, bd = 1e9;
  for (const w of waystones(st, teamId, ex)) { const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; best = w; } }
  return best ? { w: best, d: bd } : null;
}

// ---- objective (HORDE/DEMONS lane: st.objective = {id,text,kind:'defend'|'gate'|'event'|'lord'|'waiting',n,need,x,z,t}); a stand-in is derived when it is missing
export function objectiveOf(st) {
  const o = st.objective;
  if (o && o.kind && o.x !== undefined) return o;
  const bes = towns(st).find((t) => t.state === 'besieged');
  if (bes) return { kind: 'defend', id: bes.id, x: bes.x, z: bes.z, text: 'Defend ' + (bes.name || 'town'), derived: true };
  const g = gatesOf(st)[0];
  if (g) return { kind: 'gate', id: g.id, x: g.x, z: g.z, text: 'Close the gate', derived: true };
  return { kind: 'waiting', text: '', derived: true };
}
// open Demon Gates (st.horde.gates = [{id,x,z,hp,maxHp,closed,tier}])
export function gatesOf(st) {
  const g = st.horde && st.horde.gates;
  return Array.isArray(g) ? g.filter((q) => !q.closed && !(q.hp <= 0) && q.x !== undefined) : [];
}

// ---- group anchor: the human hero while he plays and moves, else the lead AI hero (lowest team id alive). Public knowledge (the HUD shows the allies).
export function heroesOf(st) {
  const out = [];
  for (const t of st.teams) if (t && t.id < 4 && t.hero && t.alive) out.push(t);
  return out;
}
export function humanTeam(st) { for (const t of st.teams) if (t && t.id < 4 && t.human && t.hero && t.hero.alive && !t.hero.dead) return t; return null; }
export function leadTeam(st) { for (const t of st.teams) if (t && t.id < 4 && !t.human && t.alive && t.hero && t.hero.alive && !t.hero.dead) return t; return null; }
// demons (monsters, team -1) within r of a point; only the ones the hero can see are passed in via `S` by the caller when fog matters
export function monsNear(st, x, z, r) { const out = []; for (const e of st.ents) if (e.alive && e.kind === 'mon' && Math.hypot(e.x - x, e.z - z) < r) out.push(e); return out; }
export { d2 };
