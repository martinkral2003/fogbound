// Three full AI-only matches (seeds 1-3) with the outcome per seed: node tools/v5-matches.mjs [easy|normal|hard|nightmare]  (~30-60 s per seed)
import { createGame, step } from '../src/sim.js';
import { createAI, aiInput } from '../src/ai.js';
import { SIM_DT } from '../src/data.js';
const diff = process.argv[2] || 'normal';
for (const seed of [1, 2, 3]) {
  const st = createGame({ seed, humans: [], diff });
  const ais = st.teams.filter((t) => t.id < 4).map((t) => createAI(st, t.id));
  let row = '';
  for (let i = 0; i < 24 * 60 / SIM_DT && !st.over; i++) {
    step(st, SIM_DT, st.teams.map((t) => (t.id < 4 ? aiInput(st, ais[t.id], SIM_DT) : {}))); st.events.length = 0;
    if (i % (4 * 60 * 30) === 0 && i) { const g = st.horde.gates; row += ` | ${(st.t / 60).toFixed(0)}m gates ${g.filter((x) => x.closed).length}/${g.length} towns ${st.towns.map((t) => t.state[0]).join('')} L${st.teams.slice(0, 4).map((t) => t.hero.lvl).join('')}`; }
  }
  const g = st.horde.gates;
  console.log(`seed ${seed} ${diff}: ${st.over ? st.over.reason : 'no end'} at ${(st.t / 60).toFixed(1)}m, gates closed ${g.filter((x) => x.closed).length}/${g.length}, lord ${st.horde.lord && st.horde.lord.state}${row}`);
}
