import { createGame, step, simApi } from '../src/sim.js';
import * as D from '../src/data.js';
import * as RC from '../src/recruits.js';
const st = createGame({ seed: 7, humans: [0] });
if (st.horde) st.horde.ready = false;
for (const c of st.camps) c.noResp = true;
for (const e of st.ents) if (e.kind === 'mon' || (e.kind === 'unit' && e.team !== 4)) { e.alive = false; e.hp = 0; }
const team = st.teams[0], h = team.hero; h.invuln = true;
const w = st.world;
let found = false;
for (let r = 10; r < 140 && !found; r += 8) for (let a = 0; a < 6.28; a += 0.3) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if ([[0,0],[14,0],[-14,0],[0,14],[0,-14]].every(([dx,dz]) => w.walkable(x+dx, z+dz)) && !st.towns.some(t => Math.hypot(t.x-x,t.z-z) < (t.r||40)+40)) { h.x = x; h.z = z; found = true; break; } }
const idle = () => st.teams.map(() => ({ cmds: [] }));
const type = process.argv[2] || 'knight';
const u = RC.spawnFollower(st, team, type, { free: true, x: h.x, z: h.z });
u.mode = 'hold'; u.hold = { x: u.x, z: u.z };
const foes = [];
for (const [dx, dz] of [[3.5, 0], [4, 2], [4, -2]]) {
  const camp = { id: 9000 + st.camps.length, x: u.x+dx, z: u.z+dz, tier: 1, types: ['imp'], mons: 1, respT: 0, boss: false, noResp: true }; st.camps.push(camp);
  const m = simApi.spawnMonster(st, 'imp', 1, u.x + dx, u.z + dz, camp); m.aggro = 40; m.hp = m.maxHp = 600; foes.push(m);
}
let last = 0;
for (let i = 0; i < 30 * 22; i++) {
  step(st, 1 / 30, idle());
  for (const e of st.events) if (e.type === 'svcast') console.log(st.t.toFixed(1), e.spell);
  st.events.length = 0;
  if (i % 60 === 0) console.log(st.t.toFixed(1), 'cds', u.sv.spells.map(s => s.id + ':' + s.cd.toFixed(1)).join(' '), 'busy', !!u.sv.busy, 'hp', Math.round(u.hp), 'foes', foes.map(f => f.alive ? Math.round(Math.hypot(f.x-u.x,f.z-u.z)) : 'x').join(','), 'tgt', foes.map(f=>f.tgt===u.id?1:0).join(''));
  if (u.hp < u.maxHp * 0.4) u.hp = u.maxHp * 0.5;
}
