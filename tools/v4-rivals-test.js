// RIVALS lane test: node tools/v4-rivals-test.js [seed=1] [minutes=20] [diff=normal]
// 4-AI match: no exceptions, every rival gains levels, nobody idles > 60 s (excluding fights/rest/town business), at least one dungeon cleared
// by a rival (reported as a warning only for matches shorter than 20 min), and the run is deterministic (a second 4-minute run matches the first).
import { createGame, step } from '../src/sim.js';
import { createAI, aiInput, rivalReport } from '../src/ai.js';
import { SIM_DT } from '../src/data.js';

const seed = +process.argv[2] || 1, mins = +process.argv[3] || 20, diff = process.argv[4] || 'normal';
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

function run(seed, mins, diff) {
  const st = createGame({ seed, humans: [] });
  st.aiDiff = diff;
  const ais = st.teams.filter((t) => t.id < 4).map((t) => createAI(st, t.id, diff));
  let exceptions = 0, first = '';
  for (let i = 0; i < mins * 60 / SIM_DT && !st.over; i++) {
    try { step(st, SIM_DT, st.teams.map((t) => (t.id < 4 ? aiInput(st, ais[t.id], SIM_DT) : {}))); }
    catch (e) { exceptions++; if (!first) first = e.stack.split('\n').slice(0, 3).join(' | '); if (exceptions > 5) break; }
    st.events.length = 0;
  }
  return { st, exceptions, first, rep: rivalReport(st) };
}

const A = run(seed, mins, diff);
check(A.exceptions === 0, `no exceptions in ${mins} min (${A.exceptions}${A.first ? ' ' + A.first : ''})`);
for (const r of A.rep) {
  check(r.lvl >= 3, `rival ${r.team} (${r.bg}) reached level ${r.lvl} (>= 3)`);
  check(r.idleMax <= 60, `rival ${r.team} longest idle ${r.idleMax}s (<= 60)`);
}
const cleared = A.rep.reduce((a, r) => a + r.dungeons, 0);
if (mins >= 15) check(cleared >= 1, `rivals cleared ${cleared} dungeons (>= 1)`);
else console.log(`INFO rivals cleared ${cleared} dungeons (match shorter than 15 min)`);
const B = run(seed, 4, diff), C = run(seed, 4, diff);
const sig = (R) => JSON.stringify(R.rep.map((r) => [r.lvl, r.gold, r.x, r.z, r.kills, r.deaths]));
check(sig(B) === sig(C), 'deterministic: two 4-minute runs with the same seed match');
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
