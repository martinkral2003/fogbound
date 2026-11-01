// FOGBOUND: DOMINION core simulation (RTS). State, creation, command dispatch, step order, kill hooks. See README.md.
import { generateWorld } from '../world.js';
import { mulberry32 } from '../util.js';
import { FACTIONS, RES, START_RES, CAPS, SIM_DT } from './consts.js';
import * as Units from './units.js';
import * as Combat from './combat.js';
import * as Econ from './econ.js';
import * as Buildings from './buildings.js';
import * as Walls from './walls.js';
import * as Siege from './siege.js';
import * as Magic from './magic.js';
import * as WorldX from './world_x.js';
import * as AI from './ai.js';
import * as Nav from './nav.js';

const MODULES = () => [Units, Buildings, Econ, Walls, Siege, Magic, WorldX, Combat];

export function createRts(opts = {}) {
  const seed = opts.seed ?? 1337;
  const world = opts.world || generateWorld(seed);
  const humans = opts.humans ?? [0];
  const aiTeams = opts.ai ?? [0, 1, 2, 3].filter((i) => !humans.includes(i));
  const st = {
    mode: 'rts', seed, world, rng: mulberry32(seed * 17 + 3), t: 0, tick: 0, nextId: 1,
    teams: [], ents: [], blds: [], nodes: [], projs: [], zones: [], events: [], neutral: [], byId: new Map(), nav: null,
    weather: { kind: 'clear', t: 0 }, over: null, difficulty: opts.difficulty || 'normal',
  };
  for (const f of FACTIONS) {
    st.teams.push({
      id: f.id, faction: f, human: humans.includes(f.id), name: f.lord, res: { ...START_RES }, cap: { ...CAPS }, pop: { mil: 0, work: 0 }, popMax: 10,
      mana: 0, manaMax: 100, manaRegen: 0.5, generals: [], tech: {}, up: {}, spells: {}, alive: true, ai: null,
      stats: { kills: 0, lost: 0, gathered: Object.fromEntries(RES.map((r) => [r, 0])) },
    });
  }
  st.nav = Nav.create(st);
  Econ.populateNodes(st);
  WorldX.populate(st);
  for (const t of st.teams) {
    const h = world.hearts[t.id];
    t.base = { x: h.x, z: h.z, rot: h.rot };
    t.keep = Buildings.create(st, 'keep', t.id, h.x, h.z, h.rot, { instant: true });
    const ax = -Math.sign(h.x), az = -Math.sign(h.z);
    for (let i = 0; i < 6; i++) Units.spawn(st, workerType(t), t.id, h.x + ax * 8 + (i % 3) * 1.6, h.z + az * 8 + Math.floor(i / 3) * 1.6);
    Units.spawnGeneral(st, t.id, 0, h.x + ax * 12, h.z + az * 12);
    if (aiTeams.includes(t.id)) t.ai = AI.create(st, t.id, opts.difficulty || 'normal');
  }
  Nav.rebuild(st);
  return st;
}
const workerType = (t) => t.faction.key + '_worker';

export function emit(st, e) { st.events.push(e); }
export const hostile = (a, b) => a && b && a.team !== b.team;
export function entsNear(st, x, z, r, filter) {
  const out = [], r2 = r * r;
  for (const e of st.ents) if (e.alive && (e.x - x) ** 2 + (e.z - z) ** 2 <= r2 && (!filter || filter(e))) out.push(e);
  return out;
}

// ---------------------------------------------------------------- kills (the ONLY way to kill)
export function killEnt(st, e, killer) {
  if (!e.alive) return;
  e.alive = false; e.hp = 0;
  emit(st, { type: 'death', id: e.id, kind: 'unit', unit: e.type, team: e.team, x: e.x, z: e.z });
  const t = st.teams[e.team];
  if (t) { t.stats.lost++; Units.onDeath && Units.onDeath(st, e, killer); }
  if (killer && st.teams[killer.team]) st.teams[killer.team].stats.kills++;
  Econ.onDeath(st, e, killer);
}
export function killBld(st, b, killer) {
  if (b.state === 'ruin') return;
  b.hp = 0; b.state = 'ruin';
  emit(st, { type: 'death', id: b.id, kind: 'bld', bld: b.type, team: b.team, x: b.x, z: b.z });
  Buildings.onDestroyed && Buildings.onDestroyed(st, b, killer);
  Nav.dirty(st);
  if (b.type === 'keep') eliminate(st, b.team);
}
function eliminate(st, teamId) {
  const t = st.teams[teamId];
  if (!t.alive) return;
  t.alive = false;
  emit(st, { type: 'announce', text: t.faction.lord + ' has fallen!' });
  for (const e of st.ents) if (e.team === teamId && e.alive) { e.alive = false; e.hp = 0; }
  const left = st.teams.filter((q) => q.alive);
  if (left.length <= 1 && !st.over) st.over = { winner: left[0] ? left[0].id : -1, reason: 'domination' };
}

// ---------------------------------------------------------------- the step
export function step(st, dt = SIM_DT, inputs = {}) {
  if (st.over) { st.t += dt; return; }
  st.t += dt; st.tick++;
  for (const t of st.teams) {
    if (!t.alive) continue;
    const inp = inputs[t.id] || { cmds: [] };
    if (t.ai) { const c = AI.update(st, t.ai, dt); if (c && c.length) inp.cmds = (inp.cmds || []).concat(c); }
    for (const cmd of inp.cmds || []) for (const m of MODULES()) if (m.command && m.command(st, t.id, cmd)) break;
  }
  Buildings.update(st, dt);
  Econ.update(st, dt);
  Units.update(st, dt);
  Combat.update(st, dt);
  Walls.update(st, dt);
  Siege.update(st, dt);
  Magic.update(st, dt);
  WorldX.update(st, dt);
  if (st.tick % 30 === 0) st.ents = st.ents.filter((e) => e.alive || st.t - (e.diedAt ?? (e.diedAt = st.t)) < 4);
}
