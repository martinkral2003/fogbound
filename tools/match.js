// Headless AI-only match (all 4 heroes are allied AI heroes vs the demons). One table row per minute, then the end reason.
//   node tools/match.js [seed=1] [maxMinutes=22] [easy|normal|hard] [--quiet] [--every=N]
// Per minute and hero: class, level, kit (slot skills with level), kills, deaths, gold, followers; then towns (s safe, b besieged, f fallen, v saved),
// gates closed/open, front distance and the objective text.
import { createGame, step } from '../src/sim.js';
import { createAI, aiInput, allyReport } from '../src/ai.js';
import { SIM_DT } from '../src/data.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const seed = +args[0] || 1, maxMin = +args[1] || 22, diff = args[2] || 'normal', every = +flags.every || 1;

export function runMatch({ seed, maxMin, diff, quiet = false, every = 1, onMinute, onStep, opts = {} } = {}) {
  const st = createGame({ seed, humans: [], ...opts });
  st.aiDiff = diff;
  const ais = st.teams.filter((t) => t.id < 4).map((t) => createAI(st, t.id, diff));
  const stats = { kills: [0, 0, 0, 0], deaths: [0, 0, 0, 0], worst: 0, total: 0, n: 0, aiTotal: 0, aiWorst: 0, exceptions: 0, townFall: [], gateClosed: [] };
  const rows = [];
  let nextMin = 1;
  for (let i = 0; i < maxMin * 60 / SIM_DT && !st.over; i++) {
    const a0 = performance.now();
    const inputs = st.teams.map((t) => (t.id < 4 ? aiInput(st, ais[t.id], SIM_DT) : {}));
    const a1 = performance.now() - a0; stats.aiTotal += a1; stats.aiWorst = Math.max(stats.aiWorst, a1);
    const t0 = performance.now();
    try { step(st, SIM_DT, inputs); } catch (e) { stats.exceptions++; if (stats.exceptions < 4) console.error('STEP EXCEPTION', e); }
    const dt = performance.now() - t0; stats.worst = Math.max(stats.worst, dt); stats.total += dt; stats.n++;
    for (const e of st.events) {
      if (e.type === 'death' && e.kind === 'hero' && e.team >= 0 && e.team < 4) stats.deaths[e.team]++;
      if (e.type === 'townFallen') stats.townFall.push(`${(st.t / 60).toFixed(1)}m:${e.town}`);
      if (e.type === 'gateClosed') stats.gateClosed.push(`${(st.t / 60).toFixed(1)}m:${e.id ?? ''}`);
      if (e.type === 'kill' && e.team >= 0 && e.team < 4) stats.kills[e.team]++;
    }
    if (onStep) onStep(st, i);
    st.events.length = 0;
    if (st.t >= nextMin * 60) {
      const m = nextMin++;
      const rep = allyReport(st);
      rows.push({ m, rep });
      if (m % every === 0 && !quiet) printRow(st, m, rep, stats);
      if (onMinute) onMinute(st, m, rep);
    }
  }
  return { st, ais, stats, rows };
}

export function townStates(st) { return (st.towns || []).map((t) => (t.state || '?')[0]).join(''); }
export function gateCounts(st) { const g = (st.horde && st.horde.gates) || []; return { closed: g.filter((q) => q.closed).length, open: g.filter((q) => !q.closed).length }; }

function printRow(st, m, rep, stats) {
  const hero = rep.map((r) => `${String(r.bg).slice(0, 3)} L${String(r.lvl).padStart(2)}${r.alive ? ' ' : 'x'} [${r.kit}] k${stats.kills[r.team] || r.kills} d${stats.deaths[r.team]} g${r.gold} f${r.followers} ${r.goal}`).join(' | ');
  const g = gateCounts(st), hd = st.horde ? ` front ${Math.round(st.horde.dist || 0)}` : '';
  console.log(`${String(m).padStart(2)}m ${hero} || T[${townStates(st)}] gates ${g.closed}c/${g.open}o${hd} obj "${st.objective ? st.objective.text : ''}"`);
}

if (process.argv[1] && process.argv[1].split('\\').join('/').endsWith('tools/match.js')) {
  const T0 = performance.now();
  const { st, stats } = runMatch({ seed, maxMin, diff, quiet: !!flags.quiet, every });
  const end = st.over ? `OVER ${(st.t / 60).toFixed(1)}m winner=${st.over.winner} by ${st.over.reason}` : `no winner by ${maxMin}m`;
  const rep = allyReport(st);
  console.log(`seed ${seed} ${diff}: ${end} | deaths ${stats.deaths.join('/')} | levels ${rep.map((r) => r.lvl).join('/')} | skills ${rep.map((r) => r.skills).join('/')} | idleMax ${rep.map((r) => r.idleMax).join('/')}s | sim ${(stats.total / stats.n).toFixed(2)} ms/step worst ${stats.worst.toFixed(1)} | ai ${(stats.aiTotal / stats.n * 1000).toFixed(0)} us/step worst ${(stats.aiWorst * 1000).toFixed(0)} us | exceptions ${stats.exceptions} | wall ${((performance.now() - T0) / 1000).toFixed(0)}s`);
  for (const r of rep) console.log(`  hero ${r.team} ${r.bg}: level-up times (s) ${r.levelT.join(',')} | goals ${Object.entries(r.stat ? r.stat.goals : {}).map(([k, v]) => k + ':' + v).join(' ')} | flees ${r.stat && r.stat.flees} teles ${r.stat && r.stat.teles} dodges ${r.stat && r.stat.dodges} potions ${r.stat && r.stat.potions} hires ${r.stat && r.stat.hires} assaults ${r.stat && r.stat.assaults} errors ${r.stat && r.stat.errors}`);
  if (stats.townFall.length) console.log('towns fell: ' + stats.townFall.join(' '));
  if (stats.gateClosed.length) console.log('gates closed: ' + stats.gateClosed.join(' '));
}
