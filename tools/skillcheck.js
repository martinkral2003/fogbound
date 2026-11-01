// Headless check that every skill (and every ultimate) can be cast without errors. node tools/skillcheck.js
// v4: skills are classless; each background's pool lists every skill, so cast the full pool of each background once.
import { createGame, step } from '../src/sim.js';
import { BACKGROUNDS, SKILLS, SIM_DT } from '../src/data.js';

let failures = 0;
const blank = () => ({ mx: 0, mz: 0, aimX: 0, aimZ: 0, atk: false, casts: [], charge: false, tele: false, repair: false, cmds: [] });
const run = (st, secs, fn) => { for (let i = 0; i < secs / SIM_DT; i++) { const inp = st.teams.map(blank); if (fn) fn(inp); step(st, SIM_DT, inp); st.events.length = 0; } };
for (const bgi of [0]) {
  for (const id of BACKGROUNDS[bgi].pool.concat(Object.keys(SKILLS).filter((k) => SKILLS[k].ult))) {
    const st = createGame({ humans: [], bg: bgi }), team = st.teams[0], h = team.hero, s = SKILLS[id];
    h.lvl = 5;
    let n = 0;
    for (const e of st.ents) if (e.kind === 'mon' && e.alive && n < 4) { e.x = e.ox = h.x + 6 + n; e.z = e.oz = h.z + n - 1.5; e.home = { x: e.x, z: e.z }; n++; }
    try {
      const aim = (inp) => { inp.aimX = h.x + 7; inp.aimZ = h.z; };
      if (s.ult) {
        team.sk.known.push(id); team.sk.ults = [id]; team.sk.ult = id;
        run(st, 1.6, (inp) => { aim(inp[0]); inp[0].charge = true; });
        run(st, 0.2, (inp) => aim(inp[0]));
        run(st, 1);
        console.log(`ult   ${id.padEnd(12)} ${s.kind.padEnd(6)} ${team.chCd > 0 ? 'cast ok' : 'NOT CAST'}`);
        if (!(team.chCd > 0)) failures++;
      } else {
        team.sk.slots[0] = id; if (!team.sk.known.includes(id)) team.sk.known.push(id);
        run(st, 0.1, (inp) => { inp[0].aimX = h.x + 7; inp[0].aimZ = h.z; inp[0].casts = [0]; });
        run(st, 1.3);
        console.log(`skill ${id.padEnd(12)} ${s.type.padEnd(8)} ${(team.cd[id] || 0) > 0 ? 'cast ok' : 'not cast (needs a target/servant)'}`);
      }
    } catch (e) { failures++; console.log(`${id}: ERROR ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
  }
}
console.log(failures ? failures + ' FAILURES' : 'no skill errors');
process.exit(failures ? 1 : 0);
