import { createGame, step } from '../src/sim.js';
import { SIM_DT } from '../src/data.js';
const mins = +process.argv[2] || 6;
const st = createGame({ seed: 1337, humans: [0] });
let ex = 0;
for (let i = 0; i < mins * 60 / SIM_DT && !st.over; i++) {
  const inputs = st.teams.map((t, k) => (t.id < 4 ? { mx: Math.cos(st.t * 0.05 + k), mz: Math.sin(st.t * 0.05 + k), aimX: 0, aimZ: 0, attack: i % 40 < 20, cmds: [] } : {}));
  try { step(st, SIM_DT, inputs); } catch (e) { ex++; if (ex < 4) console.error(e); if (ex > 20) break; }
  st.events.length = 0;
}
console.log('t', (st.t / 60).toFixed(1), 'exceptions', ex, 'over', st.over, 'ents', st.ents.length, 'gold', st.teams.map((t) => Math.round(t.gold)).join(','));
if (ex) process.exit(1);
