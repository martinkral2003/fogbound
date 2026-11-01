import { createGame, step } from '../src/sim.js';
import { generateWorld } from '../src/world.js';
const w = generateWorld(7);
let st = createGame({seed:7, world:w});
if (st.horde) st.horde.ready=false;
let t=Date.now(); for(let i=0;i<150;i++) step(st,1/30,st.teams.map(()=>({cmds:[]}))); console.log('150 steps no horde', Date.now()-t);
console.log(st.ents.length, st.blds.length);
