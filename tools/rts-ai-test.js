// AI lane test: several seeds / difficulties, asserts no exceptions and checks economy milestones; prints what is missing instead of failing hard
// when other lanes have not landed. node tools/rts-ai-test.js [minutes=12] [seeds=1,2] [difficulties=normal,hard,easy]
import { runMatch } from './rts-match.js';
import * as Walls from '../src/rts/walls.js';
import * as Siege from '../src/rts/siege.js';
import * as Magic from '../src/rts/magic.js';
import * as Econ from '../src/rts/econ.js';
import * as Units from '../src/rts/units.js';

const [minutes = 12, seedArg = '1,2', diffArg = 'normal,hard,easy'] = process.argv.slice(2);
const seeds = seedArg.split(',').map(Number), diffs = diffArg.split(',');
const missing = [];
const need = (m, n, label) => { if (typeof m[n] !== 'function') missing.push(label); };
need(Walls, 'ring', 'Walls.ring'); need(Walls, 'breaches', 'Walls.breaches'); need(Siege, 'pickTarget', 'Siege.pickTarget'); need(Magic, 'suggest', 'Magic.suggest'); need(Econ, 'rates', 'Econ.rates');
if (!Units.ROSTER) missing.push('Units.ROSTER');
let fails = 0, warns = 0;
const warn = (m) => { warns++; console.log('  WARN', m); };
const fail = (m) => { fails++; console.log('  FAIL', m); };
for (const seed of seeds) for (const diff of diffs) {
  console.log(`== seed ${seed} ${diff} ${minutes} min`);
  let res;
  try { res = runMatch(seed, +minutes, diff); } catch (e) { fail('exception: ' + (e.stack || e)); continue; }
  const st = res.st;
  console.log(`  ${st.over ? 'winner T' + st.over.winner + ' ' + st.over.reason : 'no winner'} at ${(st.t / 60).toFixed(1)} min | avg step ${res.avgStep.toFixed(2)} ms`);
  for (const [k, n] of res.lane) warn('other-lane exception x' + n + ': ' + k.slice(0, 160));
  if (res.errs.length) for (const e of res.errs) fail(`AI team ${e.team} threw x${e.n}: ${e.e}`);
  for (const t of st.teams) {
    if (!t.ai) continue;
    const at = (m) => { const r = res.rows.find((q) => q.m === m) || res.rows[res.rows.length - 1]; return r ? { ...r.teams[t.id], m: r.m } : null; };
    const p = at(Math.min(6, Math.floor(st.t / 60)));
    const last = at(Math.floor(st.t / 60));
    const tag = `T${t.id} ${t.ai.persona}`;
    if (!p) continue;
    if (st.t >= 360) {
      if (t.alive && p.pop.work < 12) warn(`${tag}: only ${p.pop.work} workers at minute ${p.m} (want >=12)`);
      if (t.alive && !(p.blds > 3)) warn(`${tag}: only ${p.blds} buildings at minute ${p.m}`);
    }
    if (st.t >= 240 && t.alive) {
      if (!(last.types.house)) warn(`${tag}: no houses`);
      if (!(last.types.barracks)) warn(`${tag}: no barracks`);
    }
    const waves = (t.ai.log || []).filter((l) => l[1] === 'wave').length;
    if (st.t >= (diff === 'easy' ? 20 : 12) * 60 && t.alive && !waves) warn(`${tag}: no attack wave by minute ${(st.t / 60).toFixed(0)} (${t.ai.wave.state})`);
    console.log(`  ${tag} ${t.alive ? 'alive' : 'dead'} W${last.pop.work} M${last.pop.mil} blds ${last.blds} walls ${last.walls} waves ${waves} cmds ${t.ai.stats.cmds} ai ${(t.ai.stats.ms / Math.max(1, t.ai.stats.rounds)).toFixed(2)} ms/round`);
    if (t.ai.stats.ms / Math.max(1, t.ai.stats.rounds) > 2.5) warn(`${tag}: AI too slow`);
  }
}
if (missing.length) console.log('LANES NOT LANDED (AI degrades gracefully):', missing.join(', '));
console.log(fails ? `FAILED (${fails} failures, ${warns} warnings)` : `OK (${warns} warnings)`);
process.exit(fails ? 1 : 0);
