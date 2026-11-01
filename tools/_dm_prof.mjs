import { createGame, step } from '../src/sim.js';
import { SIM_DT } from '../src/data.js';
const st = createGame({ seed: 1, humans: [0] });
const NONE = [{}, {}, {}, {}];
for (let m = 0; m < 6; m++) { const t0 = Date.now(); for (let i = 0; i < 300; i++) step(st, SIM_DT, NONE); console.log('10s sim:', Date.now() - t0, 'ms ents', st.ents.length, 'waves', st.horde.waves.length); }
