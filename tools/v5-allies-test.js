// ALLIES lane test: 4 allied AI heroes play a full match vs the demons on several seeds.
//   node tools/v5-allies-test.js [seeds=1,2,3] [minutes=20] [easy|normal|hard] [--det] [--quiet]
// Fails (exit 1) on: any exception, a hero idle > 30 s, a hero below level 6 or with fewer than 4 skills at the end. Reports win/loss and times.
import { runMatch, townStates, gateCounts } from './match.js';
import { allyReport } from '../src/ai.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const seeds = (args[0] || '1,2,3').split(',').map(Number), minutes = +args[1] || 20, diff = args[2] || 'normal';
let fail = 0;
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const summary = [];
for (const seed of seeds) {
  const T0 = performance.now();
  const { st, stats } = runMatch({ seed, maxMin: minutes, diff, quiet: true });
  const rep = allyReport(st), won = st.over && st.over.reason === 'gates', lost = st.over && st.over.reason === 'capital';
  const end = st.over ? `${won ? 'WIN' : lost ? 'LOSS' : 'OVER'} (${st.over.reason}) at ${(st.t / 60).toFixed(1)} min` : `no result by ${minutes} min`;
  const g = gateCounts(st);
  console.log(`seed ${seed} ${diff}: ${end} | towns ${townStates(st)} gates ${g.closed}c/${g.open}o | levels ${rep.map((r) => r.lvl).join('/')} skills ${rep.map((r) => r.skills).join('/')} deaths ${stats.deaths.join('/')} kills ${stats.kills.join('/')} idle ${rep.map((r) => r.idleMax).join('/')}s | ai ${(stats.aiTotal / stats.n * 1000).toFixed(0)}us/step worst ${(stats.aiWorst * 1000).toFixed(0)}us | ${((performance.now() - T0) / 1000).toFixed(0)}s wall`);
  if (stats.exceptions) bad(`seed ${seed}: ${stats.exceptions} step exceptions`);
  for (const r of rep) {
    if (r.stat && r.stat.errors) bad(`seed ${seed} hero ${r.team}: ${r.stat.errors} AI exceptions`);
    if (r.idleMax > 30) bad(`seed ${seed} hero ${r.team} (${r.bg}) idled ${r.idleMax} s`);
    if (r.lvl < 6) bad(`seed ${seed} hero ${r.team} (${r.bg}) only level ${r.lvl}`);
    if (r.skills < 4) bad(`seed ${seed} hero ${r.team} (${r.bg}) has ${r.skills} skills: ${r.kit}`);
  }
  summary.push({ seed, won: !!won, lost: !!lost, t: st.over ? st.t / 60 : null });
  if (flags.has('--det')) {
    const again = runMatch({ seed, maxMin: Math.min(minutes, 6), diff, quiet: true });
    const first = runMatch({ seed, maxMin: Math.min(minutes, 6), diff, quiet: true });
    const sig = (s) => JSON.stringify(allyReport(s).map((r) => [r.x, r.z, r.lvl, r.hp, r.gold]));
    if (sig(again.st) !== sig(first.st)) bad(`seed ${seed}: not deterministic`);
  }
}
const w = summary.filter((s) => s.won).length, l = summary.filter((s) => s.lost).length;
console.log(`RESULT ${diff}: ${w} wins, ${l} losses, ${summary.length - w - l} unfinished of ${summary.length}; win times ${summary.filter((s) => s.won).map((s) => s.t.toFixed(1)).join(', ') || '-'} min; ${fail ? fail + ' FAILURES' : 'all checks passed'}`);
process.exit(fail ? 1 : 0);
