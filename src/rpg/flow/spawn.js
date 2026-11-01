// FLOW: spread-out coastal spawn points + the rival heroes.
import * as Items from '../items.js';
import * as Skills from '../skills.js';
import { makeActor, recompute } from '../core.js';
import { TAU } from '../../util.js';
import { getNav } from './nav.js';

export function computeSpawns(st, count = 48) {
  const w = st.world, nav = getNav(st), pts = [];
  const a0 = st.rng() * TAU;
  for (let k = 0; k < count; k++) {
    const ang = a0 + (k / count) * TAU + (st.rng() - 0.5) * 0.05;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    for (let r = 215; r > 60; r -= 1) {
      const x = dx * r, z = dz * r;
      if (!w.walkable(x, z)) continue;
      // step ~7 m inland and require the main land mass
      const xi = dx * (r - 7), zi = dz * (r - 7);
      const i = Math.floor((xi + 200) / 4), j = Math.floor((zi + 200) / 4);
      const kk = j * 100 + i;
      if (!w.walkable(xi, zi) || !nav.open[kk] || nav.comp[kk] !== nav.main) continue;
      // keep ruined strongholds / settlement free of spawns
      if (w.hearts.some((h) => Math.hypot(h.x - xi, h.z - zi) < 28)) continue;
      if (w.features.camps.some((c) => Math.hypot(c.x - xi, c.z - zi) < 42)) continue;
      pts.push({ x: xi, z: zi, yaw: Math.atan2(-zi, -xi), taken: false }); break;
    }
  }
  // enforce >= 60 m separation (drop the closer of any pair)
  const out = [];
  for (const p of pts) if (out.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= 62)) out.push(p);
  st.flow.spawns = out;
  // shuffle so the human does not always start at the same angle
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(st.rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function spawnPoint(st, who) {
  const sp = st.flow.spawns;
  if (typeof who === 'number' && sp[who % sp.length]) { const p = sp[who % sp.length]; p.taken = true; return { x: p.x, z: p.z, yaw: p.yaw }; }
  let p = sp.find((q) => !q.taken) || sp[0]; p.taken = true;
  return { x: p.x, z: p.z, yaw: p.yaw };
}

// --------------------------------------------------------------------- rivals
export const ARCHETYPES = {
  warrior: { attrs: { str: 14, dex: 10, int: 6, vit: 17 }, build: 'warrior', model: 'human' },
  brute:   { attrs: { str: 17, dex: 8, int: 5, vit: 19 }, build: 'brute', model: 'human' },
  ranger:  { attrs: { str: 9, dex: 16, int: 8, vit: 15 }, build: 'ranger', model: 'human' },
  mage:    { attrs: { str: 6, dex: 9, int: 17, vit: 14 }, build: 'mage', model: 'human' },
  rogue:   { attrs: { str: 10, dex: 16, int: 8, vit: 14 }, build: 'rogue', model: 'human' },
};
const NAMES = ['Gorran Ashfist', 'Vess Nightfeather', 'Mordrek the Pale', 'Ezekar', 'Hild Ironbrow', 'Sable of the Mire', 'Tolven Gaunt', 'Ysolde Crowe', 'Brann Cindermaw', 'Kestrel Voss', 'Orlaith Dunmoor', 'Dagan the Hollow'];
const ARCH = ['warrior', 'brute', 'ranger', 'mage', 'rogue'];
const PERS = ['aggressive', 'cautious', 'looter', 'opportunist'];

export function createRivals(st, count, difficulty = 'normal') {
  const names = NAMES.slice(); for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(st.rng() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  for (let i = 0; i < count; i++) {
    const arch = ARCH[i % ARCH.length], def = ARCHETYPES[arch], sp = spawnPoint(st, 'rival');
    const a = makeActor(st, { kind: 'rival', name: names[i % names.length] + (i >= names.length ? ' II' : ''), model: def.model, x: sp.x, z: sp.z, yaw: sp.yaw, lvl: 1, team: 10 + i, attrs: { ...def.attrs }, gold: 0 });
    a.archetype = arch;
    try { Items.starterKit(a, arch); } catch (e) { /* ignore */ }
    a.points.attr += 2; // a head start in the attribute the build prefers
    recompute(st, a, true);
    try { if (Skills.autoLevel) Skills.autoLevel(a, def.build); } catch (e) { /* ignore */ }
    recompute(st, a, true);
    const pers = PERS[Math.floor(st.rng() * PERS.length)];
    a.ai = { role: 'rival', personality: pers, difficulty, state: 'scavenge', t: st.rng() * 2, react: 0, path: null, pathT: 0, goal: null, target: 0, stuckT: 0, lx: a.x, lz: a.z, lastHp: a.hp, hitAt: -99, home: { x: a.x, z: a.z }, bravery: pers === 'aggressive' ? 1.25 : pers === 'cautious' ? 0.75 : 1 };
  }
}
