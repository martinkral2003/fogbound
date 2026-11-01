// Headless smoke test of the RTS core + all lanes. node tools/rtstest.js
import { createRts, step } from '../src/rts/core.js';
import { SIM_DT } from '../src/rts/consts.js';

const t0 = performance.now();
const st = createRts({ seed: 1337, humans: [0] });
console.log('created in', Math.round(performance.now() - t0), 'ms | teams', st.teams.length, 'units', st.ents.length, 'blds', st.blds.length, 'nodes', st.nodes.length);
const t = st.teams[0];
const workers = st.ents.filter((e) => e.team === 0 && e.role === 'worker');
console.log('team 0 workers', workers.length, 'generals', t.generals.length, 'pop', JSON.stringify(t.pop), 'keep', t.keep && t.keep.type);
// order the workers to move 12 m
const g = st.ents.find((e) => e.team === 0 && e.general);
const x0 = g.x, z0 = g.z;
step(st, SIM_DT, { 0: { cmds: [{ t: 'order', ids: [g.id], order: { type: 'move', x: g.x + 12, z: g.z + 6 } }] } });
for (let i = 0; i < 150; i++) step(st, SIM_DT, {});
console.log('general moved', Math.hypot(g.x - x0, g.z - z0).toFixed(1), 'm (expect ~13 or until blocked)');
let a = 0; for (let i = 0; i < 300; i++) { const s = performance.now(); step(st, SIM_DT, {}); a += performance.now() - s; }
console.log('avg step', (a / 300).toFixed(3), 'ms | events drained', st.events.length);
