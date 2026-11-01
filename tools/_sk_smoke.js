import { createGame, step } from '../src/sim.js';
import { SIM_DT } from '../src/data.js';
const st = createGame({ humans: [0], bg: 'mage', seed: 5 });
for (const t of st.teams.slice(0,4)) console.log(t.id, t.bg, JSON.stringify(t.kit.slots), t.kit.offers.length, t.kit.offers[0] && t.kit.offers[0].map((o) => o.kind + ':' + o.skill).join(','));
const blank = () => ({ mx: 0, mz: 0, aimX: 0, aimZ: 0, atk: false, casts: [], charge: false, tele: false, repair: false, cmds: [] });
for (let i = 0; i < 300; i++) { step(st, SIM_DT, st.teams.map(blank)); st.events.length = 0; }
for (const t of st.teams.slice(0,4)) console.log(t.id, t.bg, JSON.stringify(t.kit.slots), t.kit.offers.length);
