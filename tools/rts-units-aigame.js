import { createRts, step } from '../src/rts/core.js';
const st = createRts({ seed: 7, humans: [] });
const t0 = performance.now();
let maxU = 0;
for (let i = 0; i < 30 * 60 * 12; i++) {
  step(st, 1 / 30, {}); st.events.length = 0;
  if (i % 900 === 0) {
    const al = st.ents.filter((e) => e.alive);
    maxU = Math.max(maxU, al.length);
    console.log('min', (st.t / 60).toFixed(1), 'units', al.length, 'neutral', al.filter((e) => e.neutral).length, st.teams.map((t) => `${t.faction.key}:${t.pop.mil}/${t.pop.work} g${t.generals.length} k${t.stats.kills}`).join(' '));
  }
  if (st.over) { console.log('over', JSON.stringify(st.over)); break; }
}
console.log('real ms per step', ((performance.now() - t0) / st.tick).toFixed(2));
