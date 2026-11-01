// Headless smoke test of the FOGBOUND: HERO core + subsystems. node tools/rpgtest.js
import { createRpg, stepRpg, nearestInteractable } from '../src/rpg/core.js';
import { SIM_DT } from '../src/rpg/consts.js';

const t0 = performance.now();
const st = createRpg({ seed: 1337, rivals: 0 });
console.log('created in', Math.round(performance.now() - t0), 'ms; actors', st.actors.length, 'statics', st.statics.length, 'player at', st.player.x.toFixed(1), st.player.z.toFixed(1));
const p = st.player;
const inp = (o = {}) => ({ mx: 0, mz: 0, yaw: p.yaw, pitch: 0, sprint: false, crouch: false, jump: false, attack: false, attackPressed: false, heavy: false, block: false, dodge: false, interact: false, slot: -1, lockId: 0, cmds: [], ...o });
const step = (o, n = 1) => { for (let i = 0; i < n; i++) stepRpg(st, SIM_DT, { [p.id]: inp(o) }); };

// walk 3 seconds in a direction, expect to move; check we stay on land
const x0 = p.x, z0 = p.z;
step({ mx: 1, mz: 0, yaw: 0 }, 90);
console.log('walked', Math.hypot(p.x - x0, p.z - z0).toFixed(1), 'm in 3 s (expect ~10); on land:', st.world.walkable(p.x, p.z), 'y=', p.y.toFixed(2));
step({ mx: 1, mz: 0, yaw: 0, sprint: true }, 60);
console.log('sprinted; stamina', p.stamina.toFixed(0), '/', p.maxStamina);
// fight a monster: teleport it next to us
const m = st.actors.find((a) => a.kind === 'monster');
if (m) {
  m.x = p.x + 1.4; m.z = p.z; p.yaw = 0; m.hp = 20;
  const lvl0 = p.lvl, xp0 = p.xp;
  for (let i = 0; i < 20 && m.alive; i++) { step({ attackPressed: true, attack: true, yaw: 0 }); step({}, 20); }
  console.log('monster killed:', !m.alive, '| xp', xp0, '->', p.xp, 'lvl', lvl0, '->', p.lvl);
  const c = st.containers.find((q) => q.kind === 'corpse');
  console.log('corpse container:', !!c, c ? c.items.length + ' items' : '');
}
const ev = {}; for (const e of st.events) ev[e.type] = (ev[e.type] || 0) + 1;
console.log('events', JSON.stringify(ev));
const inter = nearestInteractable(st, p); console.log('nearest interactable', inter ? inter.type : 'none');
let a = 0; for (let i = 0; i < 300; i++) { const t1 = performance.now(); stepRpg(st, SIM_DT, {}); a += performance.now() - t1; }
console.log('avg step', (a / 300).toFixed(3), 'ms');
