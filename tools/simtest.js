// Headless smoke run (v0.4): 4 AI-controlled heroes on the island. node tools/simtest.js [minutes=20] [seed=1337]
// Prints one row per minute (hero background/level/gold/followers/deaths), notable messages, and the average step time.
import { createGame, step } from '../src/sim.js';
import { createAI, aiInput } from '../src/ai.js';
import { SIM_DT } from '../src/data.js';
const mins = +process.argv[2] || 20, seed = +process.argv[3] || 1337;
const st = createGame({ seed, humans: [] });
const ais = st.teams.filter((t) => t.id < 4).map((t) => createAI(st, t.id));
let worst = 0, total = 0, n = 0, exceptions = 0;
const msgs = [];
const T0 = performance.now();
for (let i = 0; i < mins * 60 / SIM_DT && !st.over; i++) {
  const inputs = st.teams.map((t) => (t.id < 4 ? aiInput(st, ais[t.id], SIM_DT) : {}));
  const t0 = performance.now();
  try { step(st, SIM_DT, inputs); } catch (e) { exceptions++; if (exceptions < 4) console.error(e); if (exceptions > 20) break; }
  const dt = performance.now() - t0; worst = Math.max(worst, dt); total += dt; n++;
  for (const e of st.events) if (e.type === 'msg' && /slew|fallen|saved|Warlord|capital/i.test(e.text || '')) msgs.push(`[${(st.t / 60).toFixed(1)}m] ${e.text}`);
  st.events.length = 0;
  if (i % (30 * 60) === 0) {
    const row = st.teams.filter((t) => t.id < 4).map((t) => {
      const h = t.hero;
      return `${t.bg.slice(0, 4)} L${String(h.lvl).padStart(2)}${h.dead ? 'x' : ' '} hp${String(Math.round(h.hp)).padStart(4)} g${String(Math.floor(t.gold)).padStart(4)} f${(t.followers || []).length} d${t.heroDeaths} s${t.score | 0}`;
    });
    console.log(`t=${(st.t / 60).toFixed(0).padStart(2)}m ents=${st.ents.length} | ` + row.join(' | '));
  }
}
console.log('msgs:\n' + msgs.slice(0, 40).join('\n'));
console.log('over:', st.over, 'sim time', (st.t / 60).toFixed(1), 'min | wall', ((performance.now() - T0) / 1000).toFixed(1), 's | exceptions', exceptions, '| avg step', (total / n).toFixed(2), 'ms worst', worst.toFixed(1), 'ms');
if (exceptions) process.exit(1);
