import { createGame, step } from '../src/sim.js';
import * as RC from '../src/recruits.js';
const st = createGame({ seed: 7, humans: [0] });
const team = st.teams[0];
console.log('towns', (st.towns||[]).length, 'ents', st.ents.length);
const e = RC.spawnFollower(st, team, 'knight');
console.log(e && e.maxHp, e && e.atk, e && e.armor);
for (let i=0;i<60;i++) step(st, 1/30, st.teams.map(()=>({cmds:[]})));
console.log('ok', st.t);
