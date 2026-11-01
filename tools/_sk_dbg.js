import { createGame, step, simApi } from '../src/sim.js';
import { SIM_DT, MONSTERS } from '../src/data.js';
const st = createGame({ humans: [], bg: 'hunter', seed: 11 });
const team = st.teams[0], h = team.hero;
const camp = { id: -1, x: h.x, z: h.z, tier: 1, mons: 0, respT: 0, boss: false };
const MON = Object.keys(MONSTERS).find((k) => MONSTERS[k].hp && !MONSTERS[k].boss);
const d = simApi.spawnMonster(st, MON, 1, h.x + 7, h.z, camp);
console.log(MON, d.hp, d.maxHp, d.r, h.x, h.z, 'ents', st.ents.length);
d.hp = d.maxHp = 1e6; d.spd = 0; d.aggro = 0;
team.kit.slots[0] = 'powershot';
const blank = () => ({ mx: 0, mz: 0, aimX: h.x + 7, aimZ: h.z, atk: false, casts: [], charge: false, tele: false, repair: false, cmds: [] });
const inputs = st.teams.map(blank); inputs[0].casts = [0];
let n = 0;
for (let i = 0; i < 40; i++) { try { step(st, SIM_DT, i === 0 ? inputs : st.teams.map(blank)); } catch (e) { console.log('ERR', e.message); break; } if (i === 3) console.log('projs', st.projs.length, JSON.stringify(st.projs[0] && {x:st.projs[0].x,z:st.projs[0].z,dmg:st.projs[0].dmg})); for (const e of st.events) if (e.type==='dmg') n++; st.events.length = 0; }
console.log('hp', d.hp, 'alive', d.alive, 'dmgevents', n, 'cd', team.cd.powershot, 'hx', h.x, h.z, 'd', d.x, d.z);
