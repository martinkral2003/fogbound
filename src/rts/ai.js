// FOGBOUND: DOMINION AI lords (AI lane). AI.create(st, teamId, difficulty) / AI.update(st, ai, dt) -> command array (same commands a human issues).
// Facade over ai_*.js: ai_info (lane adapters) ai_scan (world snapshot) ai_build/ai_train (placement, production) ai_eco/ai_work (economy)
// ai_def (walls, towers, defence) ai_army (composition, waves, siege, generals, raids) ai_persona (personalities, difficulty).
import { SIM_DT } from './consts.js';
import { PERSONAS, DIFFS, HARD_BONUS, pickPersona } from './ai_persona.js';
import { scan } from './ai_scan.js';
import * as Eco from './ai_eco.js';
import * as Work from './ai_work.js';
import * as Def from './ai_def.js';
import * as Army from './ai_army.js';

export function create(st, teamId, difficulty = 'normal', persona) {
  const D = DIFFS[difficulty] || DIFFS.normal;
  const p = pickPersona(st, teamId, persona);
  return {
    team: teamId, difficulty: DIFFS[difficulty] ? difficulty : 'normal', persona: p, P: PERSONAS[p], D, t: 0, acc: 0, round: 0, s: null, bud: {}, busy: new Set(), knownB: new Set(),
    noSpot: {}, badNode: {}, nBuilt: {}, born: {}, crewed: {}, save: null, saveUntil: 0, log: [], stats: { cmds: 0, ms: 0, rounds: 0 },
    wall: null, army: null, squads: [], target: null, wave: { state: 'build', n: 0, since: 0 }, scout: null, lastRetreat: -999,
  };
}
export function update(st, ai, dt) {
  ai.t += dt; ai.acc += dt;
  const team = st.teams[ai.team];
  if (ai.difficulty === 'hard') for (const r in HARD_BONUS) if (HARD_BONUS[r]) team.res[r] += HARD_BONUS[r] * dt * (ai.t < 600 ? 1 : 0.6);
  // stagger rounds between teams; react faster when a threat is known
  const iv = ai.D.react * (ai.s && ai.s.threat ? 0.5 : 1);
  if (ai.acc < iv) return [];
  ai.acc = 0; ai.round++;
  const t0 = performance.now();
  const cmds = [];
  try { think(st, ai, cmds); } catch (e) { ai.err = (ai.err || 0) + 1; ai.lastErr = e && e.stack ? e.stack : String(e); if (ai.err < 3) console.error('[AI ' + ai.team + ']', ai.lastErr); }
  ai.stats.cmds += cmds.length; ai.stats.ms += performance.now() - t0; ai.stats.rounds++;
  return cmds;
}
function think(st, ai, cmds) {
  const s = scan(st, ai);
  ai.bud = { ...s.team.res };
  ai.busy.clear();
  if (!s.keep) return;
  // order matters: earlier steps get first call on the budget
  Def.react(st, ai, cmds); // pull army home / gate control when attacked
  Eco.trainWorkers(st, ai, cmds);
  Eco.houses(st, ai, cmds);
  Eco.resumeBuilds(st, ai, cmds);
  if (s.workers.length >= 9) Work.dropoffs(st, ai, cmds);
  Eco.buildOrder(st, ai, cmds);
  Def.build(st, ai, cmds); // walls, gates, towers
  Army.update(st, ai, cmds); // generals, composition, upgrades, waves
  Eco.research(st, ai, cmds);
  Work.repairs(st, ai, cmds);
  Work.assign(st, ai, cmds);
  Work.trade(st, ai, cmds);
}
// short human-readable state for tools/logs
export function describe(st, ai) {
  const s = ai.s;
  return { persona: ai.persona, diff: ai.difficulty, wave: ai.wave.state, target: ai.target, workers: s ? s.workers.length : 0, mil: s ? s.mil.length : 0, err: ai.err || 0 };
}
export { SIM_DT };
