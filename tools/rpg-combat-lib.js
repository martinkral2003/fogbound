// Harness for tools/rpg-combat-test.js: arena, actor factories, a tiny sim step (core order minus Flow) and scripted bots.
import { createRpg, makeActor, recompute, removeActor } from '../src/rpg/core.js';
import * as Items from '../src/rpg/items.js';
import * as Combat from '../src/rpg/combat.js';
import { spawnMonster } from '../src/rpg/flow/monsters.js';
import { SIM_DT } from '../src/rpg/consts.js';

export const DT = SIM_DT;
export let st = null;
let arena = { x: 0, z: 0 };

export function boot() {
  st = createRpg({ seed: 1337, rivals: 0, human: false });
  const w = st.world;
  outer: for (let r = 20; r < 200; r += 6) for (let k = 0; k < 24; k++) {
    const x = Math.cos(k * 0.26) * r, z = Math.sin(k * 0.26) * r;
    if (st.settlement && Math.hypot(x - st.settlement.x, z - st.settlement.z) < (st.settlement.r || 40) + 30) continue;
    let ok = true;
    for (let dx = -16; dx <= 16 && ok; dx += 4) for (let dz = -16; dz <= 16; dz += 4) if (!w.walkable(x + dx, z + dz) || w.slopeAt(x + dx, z + dz) > 0.2) { ok = false; break; }
    if (ok) { arena = { x, z }; break outer; }
  }
  clear();
  return st;
}
export function clear() {
  for (const a of st.actors.slice()) removeActor(st, a);
  st.containers.length = 0; st.groundItems.length = 0; st.projs.length = 0; st.events.length = 0;
  if (st.settlement) st.settlement.safe = false;
  st.match.calmUntil = 0; st.match.state = 'running';
}

export function hero(name, o = {}) {
  const a = makeActor(st, { kind: 'player', name, x: arena.x + (o.dx || 0), z: arena.z + (o.dz || 0), yaw: o.yaw || 0, lvl: o.lvl || 5 });
  Items.starterKit(a, o.kit || 'warrior');
  if (o.attrs) Object.assign(a.attrs, o.attrs);
  for (const id of o.equip || []) { const it = Items.makeItem(id); a.inv.push(it); Items.equip(a, it.uid); }
  for (const [id, n] of o.pack || []) a.inv.push(Items.makeItem(id, { qty: n }));
  if (o.skills) Object.assign(a.skills, o.skills);
  if (o.noShield && a.equip.offhand) Items.unequip(a, 'offhand');
  recompute(st, a, true);
  a.alerted = true; a.team = o.team ?? a.id;
  return a;
}
export function monster(type, o = {}) {
  const m = spawnMonster(st, type, o.tier ?? 1, arena.x + (o.dx || 0), arena.z + (o.dz || 0));
  m.ai = null; m.yaw = o.yaw || 0; m.alerted = true;
  return m;
}
export const arenaPos = () => arena;
export function dummy(o = {}) {
  const m = monster('skeleton', o); m.maxHp = m.hp = o.hp || 400; m.ai = null; return m;
}

// ---- simulation: the core step order without Flow/zone/movement collisions
export function step(inputs) {
  st.t += DT; st.tick++;
  for (const a of st.actors.slice()) {
    if (!a.alive) continue;
    const inp = inputs.get(a.id) || null;
    if (inp) {
      Combat.handleInput(st, a, inp, DT);
      const d = a.d || { moveSpeed: 3.6 }, mm = Combat.moveMul(a);
      let sp = d.moveSpeed * mm * (a.status.some((s) => s.id === 'slow') ? 0.6 : 1);
      if (a.status.some((s) => s.id === 'root' || s.id === 'stun')) sp = 0;
      const ml = Math.hypot(inp.mx || 0, inp.mz || 0);
      let vx = ml > 0.01 ? (inp.mx / Math.max(1, ml)) * sp : 0, vz = ml > 0.01 ? (inp.mz / Math.max(1, ml)) * sp : 0;
      if (a.imp && a.imp.t > 0) { vx += a.imp.vx; vz += a.imp.vz; a.imp.t -= DT; }
      a.x += vx * DT; a.z += vz * DT; a.yaw = inp.yaw ?? a.yaw;
    } else if (a.imp && a.imp.t > 0) { a.x += a.imp.vx * DT; a.z += a.imp.vz * DT; a.imp.t -= DT; }
    Combat.updateCombat(st, a, DT);
    Combat.updateStatus(st, a, DT);
  }
  Combat.stepProjectiles(st, DT);
  for (let i = 0; i < st.actors.length; i++) for (let j = i + 1; j < st.actors.length; j++) {
    const p = st.actors[i], q = st.actors[j];
    if (!p.alive || !q.alive) continue;
    const dx = q.x - p.x, dz = q.z - p.z, m = (p.radius + q.radius) * 0.9, d = Math.hypot(dx, dz);
    if (d < m && d > 1e-5) { const k = (m - d) / 2; p.x -= dx / d * k; p.z -= dz / d * k; q.x += dx / d * k; q.z += dz / d * k; }
  }
}
export const idle = (a) => ({ mx: 0, mz: 0, yaw: a.yaw, pitch: 0, sprint: false, crouch: false, jump: false, attack: false, attackPressed: false, heavy: false, block: false, dodge: false, interact: false, slot: -1, lockId: 0, cmds: [] });

// run until done() or maxT seconds. bots: Map actor -> fn(a, st) -> partial input
export function run(bots, done, maxT = 90, each) {
  const t0 = st.t;
  while (st.t - t0 < maxT) {
    const inputs = new Map();
    for (const [a, fn] of bots) if (a.alive) inputs.set(a.id, { ...idle(a), ...fn(a, st) });
    step(inputs);
    if (each) each();
    if (done()) break;
  }
  return st.t - t0;
}
export function events(type) { return st.events.filter((e) => e.type === type); }

// ---- shared reporting
export const rows = [], fails = [];
export const check = (name, ok, info = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!ok) fails.push(name); };
export const mean = (v) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
export const f1 = (x) => x.toFixed(1);
export const eqSword = { kit: 'wanderer', equip: ['sword_1', 'chest_leather'], noShield: true };
