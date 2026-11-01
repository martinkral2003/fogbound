// FOGBOUND: HERO core simulation. State shape, actors, movement on the island terrain, collisions, the step order.
// Subsystems live in items.js, combat.js, skills.js, quests.js, flow.js (see README.md for the contract). No DOM, no Three.
import { generateWorld } from '../world.js';
import { mulberry32, clamp, TAU, angDiff } from '../util.js';
import { SLOTS, QUICK_SLOTS, PHYS, IDLE_INPUT, DTYPES } from './consts.js';
import * as Items from './items.js';
import * as Combat from './combat.js';
import * as Skills from './skills.js';
import * as Quests from './quests.js';
import * as Flow from './flow.js';

// radii of static obstacles by prop type (trees, rocks, ruins block movement)
const PROP_R = { deadtree: 0.45, pine: 0.55, rock: 0.9, crag: 1.4, grave: 0.45, pillar: 0.8, stump: 0.4, log: 0.0 };

// ---------------------------------------------------------------- creation
export function createRpg(opts = {}) {
  const seed = opts.seed ?? 1337;
  const world = opts.world || generateWorld(seed);
  const st = {
    mode: 'rpg', seed, world, rng: mulberry32(seed * 31 + 7), t: 0, tick: 0, nextId: 1,
    actors: [], byId: new Map(), player: null,
    groundItems: [],   // {id, x, z, item, born}
    containers: [],    // {id, x, z, kind:'chest'|'crate'|'corpse', tier, locked, items:[], opened, name}
    projs: [],         // owned by combat.js
    npcs: [],          // actors of kind 'npc' (also in actors)
    settlement: null,  // set by Quests.buildSettlement: {name, x, z, r, safe:true, buildings:[{type,x,z,rot,w,d,h}], ...}
    quests: null,      // owned by quests.js
    dialogue: null,    // owned by quests.js: {npcId, node, ...} while a conversation is open
    zone: null,        // owned by flow.js: the closing Dread Fog
    match: { state: 'lobby', alive: 0, total: 0, winner: 0, kills: [] }, // owned by flow.js
    events: [],        // drained by the client each frame
    statics: [], grid: new Map(),
    rivalCount: opts.rivals ?? 9,
  };
  buildStatics(st);
  Flow.populate(st);                    // monsters, containers, rivals, spawn points, zone
  Quests.buildSettlement(st);           // settlement + NPCs (+ statics for its buildings)
  buildStatics(st);                     // rebuild so settlement buildings collide
  if (opts.human !== false) spawnPlayer(st, opts.player || {});
  return st;
}

export function spawnPlayer(st, o = {}) {
  const sp = Flow.spawnPoint(st, 'player');
  const a = makeActor(st, { kind: 'player', name: o.name || 'You', x: sp.x, z: sp.z, yaw: sp.yaw, lvl: 1, ...o });
  Items.starterKit(a, o.kit || 'wanderer');
  recompute(st, a, true);
  st.player = a;
  return a;
}

export function makeActor(st, o = {}) {
  const a = {
    id: st.nextId++, kind: o.kind || 'monster', name: o.name || 'Nobody', type: o.type || null, team: o.team ?? 0, model: o.model || 'human',
    x: o.x || 0, z: o.z || 0, y: 0, vy: 0, vx: 0, vz: 0, yaw: o.yaw || 0, pitch: 0, onGround: true, jumpT: 0,
    radius: o.radius ?? 0.45, height: o.height ?? 1.8, scale: o.scale ?? 1,
    lvl: o.lvl || 1, xp: 0, attrs: { str: 10, dex: 10, int: 10, vit: 10, ...(o.attrs || {}) }, points: { attr: 0, skill: 0 }, skills: {}, perks: {},
    hp: 100, maxHp: 100, stamina: 100, maxStamina: 100, mana: 40, maxMana: 40, gold: o.gold || 0,
    equip: Object.fromEntries(SLOTS.map((s) => [s, null])), inv: [], quick: new Array(QUICK_SLOTS).fill(null),
    res: Object.fromEntries(DTYPES.map((d) => [d, 0])), status: [], d: null, // d = derived stats from Items.derived (see README)
    cs: { state: 'idle', t: 0, kind: null, combo: 0, hitSet: null, blocking: false, parryT: 0, inv: 0, stagger: 0, drawT: 0, lock: 0, spell: null },
    alive: true, ai: o.ai || null, loot: o.loot || null, bounty: o.bounty || 0, hostileTo: o.hostileTo || null, kills: 0, ...(o.extra || {}),
  };
  a.y = st.world.heightAt(a.x, a.z);
  st.actors.push(a); st.byId.set(a.id, a);
  if (a.kind === 'npc') st.npcs.push(a);
  return a;
}

export function removeActor(st, a) {
  const i = st.actors.indexOf(a); if (i >= 0) st.actors.splice(i, 1);
  st.byId.delete(a.id);
  const j = st.npcs.indexOf(a); if (j >= 0) st.npcs.splice(j, 1);
}

// recompute derived stats after equipment / attributes / perks change. full=true also refills the bars.
export function recompute(st, a, full = false) {
  const d = Items.derived(a);
  a.d = d;
  a.maxHp = d.maxHp; a.maxStamina = d.maxStamina; a.maxMana = d.maxMana;
  for (const k of DTYPES) a.res[k] = d.res[k] || 0;
  if (full) { a.hp = a.maxHp; a.stamina = a.maxStamina; a.mana = a.maxMana; }
  else { a.hp = Math.min(a.hp, a.maxHp); a.stamina = Math.min(a.stamina, a.maxStamina); a.mana = Math.min(a.mana, a.maxMana); }
}

export function emit(st, e) { st.events.push(e); }
export const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- statics (trees, rocks, ruins, settlement buildings)
function buildStatics(st) {
  st.statics.length = 0; st.grid.clear();
  for (const p of st.world.props) {
    const r = PROP_R[p.t];
    if (!r) continue;
    st.statics.push({ x: p.x, z: p.z, r: r * (p.s || 1), t: 'c' });
  }
  if (st.settlement) for (const b of st.settlement.buildings || []) {
    if (b.solid === false) continue;
    st.statics.push({ x: b.x, z: b.z, w: b.w, d: b.d, rot: b.rot || 0, c: Math.cos(b.rot || 0), s: Math.sin(b.rot || 0), t: 'b' });
  }
  for (const s of st.statics) {
    const rr = s.t === 'c' ? s.r : Math.hypot(s.w, s.d) / 2;
    const i0 = Math.floor((s.x - rr) / 8), i1 = Math.floor((s.x + rr) / 8), j0 = Math.floor((s.z - rr) / 8), j1 = Math.floor((s.z + rr) / 8);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = i * 4096 + j; let l = st.grid.get(k); if (!l) st.grid.set(k, (l = [])); l.push(s); }
  }
}

function collideStatics(st, a) {
  const i = Math.floor(a.x / 8), j = Math.floor(a.z / 8);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const l = st.grid.get((i + di) * 4096 + (j + dj));
    if (!l) continue;
    for (const s of l) {
      if (s.t === 'c') {
        const dx = a.x - s.x, dz = a.z - s.z, d = Math.hypot(dx, dz), m = s.r + a.radius;
        if (d < m && d > 1e-6) { a.x = s.x + (dx / d) * m; a.z = s.z + (dz / d) * m; }
      } else {
        const dx = a.x - s.x, dz = a.z - s.z, lx = dx * s.c + dz * s.s, lz = -dx * s.s + dz * s.c, hw = s.w / 2, hd = s.d / 2;
        const cx = clamp(lx, -hw, hw), cz = clamp(lz, -hd, hd);
        let nx = lx - cx, nz = lz - cz, d = Math.hypot(nx, nz), pen;
        if (d >= a.radius) continue;
        if (d < 1e-5) { const px = hw - Math.abs(lx), pz = hd - Math.abs(lz); if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; pen = a.radius + px; } else { nx = 0; nz = Math.sign(lz) || 1; pen = a.radius + pz; } }
        else { nx /= d; nz /= d; pen = a.radius - d; }
        a.x += (nx * s.c - nz * s.s) * pen; a.z += (nx * s.s + nz * s.c) * pen;
      }
    }
  }
}

// ---------------------------------------------------------------- movement
function moveActor(st, a, inp, dt) {
  const w = st.world, d = a.d || { moveSpeed: PHYS.walk };
  const sprinting = inp.sprint && a.stamina > 4 && (inp.mx || inp.mz) && a.cs.state === 'idle' && !inp.crouch;
  let speed = d.moveSpeed * Combat.moveMul(a) * (sprinting ? PHYS.sprintMul : 1) * (inp.crouch ? PHYS.crouchMul : 1);
  if (a.status.some((s) => s.id === 'slow')) speed *= 0.6;
  if (a.status.some((s) => s.id === 'root' || s.id === 'stun')) speed = 0;
  const ml = Math.hypot(inp.mx, inp.mz), tx = ml > 0.01 ? (inp.mx / Math.max(1, ml)) * speed : 0, tz = ml > 0.01 ? (inp.mz / Math.max(1, ml)) * speed : 0;
  const k = Math.min(1, PHYS.accel * dt);
  a.vx += (tx - a.vx) * k; a.vz += (tz - a.vz) * k;
  // dodge / knockback impulses are added to vx,vz by combat.js and decay through the same smoothing: combat sets a.imp = {vx,vz,t}
  let vx = a.vx, vz = a.vz;
  if (a.imp && a.imp.t > 0) { vx += a.imp.vx; vz += a.imp.vz; a.imp.t -= dt; }
  a.moving = ml > 0.01 && speed > 0; a.sprinting = !!sprinting && a.moving; a.crouching = !!inp.crouch;
  if (sprinting) a.stamina = Math.max(0, a.stamina - 9 * dt);
  const ox = a.x, oz = a.z;
  let nx = a.x + vx * dt, nz = a.z + vz * dt;
  if (!w.walkable(nx, nz)) { if (w.walkable(nx, a.z)) nz = a.z; else if (w.walkable(a.x, nz)) nx = a.x; else { nx = a.x; nz = a.z; } }
  // steep slopes block uphill movement
  if (w.slopeAt(nx, nz) > 1.05 && w.heightAt(nx, nz) > a.y + 0.25) { nx = ox; nz = oz; }
  a.x = nx; a.z = nz;
  collideStatics(st, a);
  if (!w.walkable(a.x, a.z)) { a.x = ox; a.z = oz; }
  // vertical: follow terrain, jump with gravity
  const gy = w.heightAt(a.x, a.z);
  if (inp.jump && a.onGround && a.stamina > 8 && a.cs.state === 'idle') { a.vy = PHYS.jumpV; a.onGround = false; a.stamina -= 8; }
  if (!a.onGround || a.y > gy + 0.05) { a.vy -= PHYS.gravity * dt; a.y += a.vy * dt; if (a.y <= gy) { a.y = gy; a.vy = 0; a.onGround = true; } else a.onGround = false; }
  else { a.y = gy; a.vy = 0; a.onGround = true; }
  // facing: the player/AI input yaw is where the actor looks; movement-facing is the client's business
  if (inp.yaw !== undefined && a.cs.state !== 'dead') a.yaw = inp.yaw;
  a.pitch = inp.pitch || 0;
}

function separate(st) {
  const A = st.actors;
  for (let i = 0; i < A.length; i++) {
    const p = A[i]; if (!p.alive) continue;
    for (let j = i + 1; j < A.length; j++) {
      const q = A[j]; if (!q.alive) continue;
      const dx = q.x - p.x, dz = q.z - p.z, m = (p.radius + q.radius) * PHYS.actorSeparation;
      if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
      const d = Math.hypot(dx, dz);
      if (d >= m || d < 1e-5) continue;
      const push = (m - d) * 0.5, nx = dx / d, nz = dz / d;
      if (p.kind !== 'npc') { p.x -= nx * push; p.z -= nz * push; }
      if (q.kind !== 'npc') { q.x += nx * push; q.z += nz * push; }
    }
  }
}

// ---------------------------------------------------------------- interaction
// returns {type:'container'|'item'|'npc', target} nearest within range and roughly in front of the actor
export function nearestInteractable(st, a) {
  let best = null, bd = 1e9;
  const test = (type, target, x, z, bonus = 0) => {
    const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz);
    if (d > PHYS.interactRange + bonus) return;
    const off = Math.abs(angDiff(a.yaw, Math.atan2(dz, dx)));
    if (off > 1.6 && d > 1.2) return;
    const s = d + off * 0.8;
    if (s < bd) { bd = s; best = { type, target }; }
  };
  for (const c of st.containers) if (!c.removed) test('container', c, c.x, c.z);
  for (const g of st.groundItems) test('item', g, g.x, g.z);
  for (const n of st.npcs) if (n.alive) test('npc', n, n.x, n.z, 0.6);
  return best;
}

function interact(st, a) {
  const hit = nearestInteractable(st, a);
  if (!hit) return;
  if (hit.type === 'item') {
    const g = hit.target;
    if (Items.addToInventory(a, g.item)) {
      st.groundItems.splice(st.groundItems.indexOf(g), 1);
      emit(st, { type: 'pickup', actor: a.id, name: g.item.name, rarity: g.item.rarity, x: g.x, z: g.z });
      recompute(st, a);
    } else emit(st, { type: 'msg', actor: a.id, text: 'You cannot carry any more.' });
  } else if (hit.type === 'container') {
    const c = hit.target;
    if (c.locked && !Items.tryUnlock(a, c)) { emit(st, { type: 'msg', actor: a.id, text: 'Locked. You need a lockpick (or the key).' }); return; }
    c.opened = true; a.openC = c.id; emit(st, { type: 'open', actor: a.id, container: c.id });
  } else if (hit.type === 'npc') {
    Quests.startDialogue(st, a, hit.target);
  }
}

// ---------------------------------------------------------------- commands from the UI (inventory, trading, dialogue, skills)
function runCmds(st, a, cmds) {
  if (!cmds || !cmds.length) return;
  for (const c of cmds) {
    switch (c.t) {
      case 'equip': Items.equip(a, c.uid); recompute(st, a); break;
      case 'unequip': Items.unequip(a, c.slot); recompute(st, a); break;
      case 'use': Items.useItem(st, a, c.uid); recompute(st, a); break;
      case 'drop': Items.dropFromInventory(st, a, c.uid, c.qty); recompute(st, a); break;
      case 'quick': if (c.slot >= 0 && c.slot < QUICK_SLOTS) a.quick[c.slot] = c.uid || c.spell || null; break;
      case 'loot': Items.takeFromContainer(st, a, c.container, c.uid); recompute(st, a); break;
      case 'lootAll': Items.takeAllFromContainer(st, a, c.container); recompute(st, a); break;
      case 'closeContainer': a.openC = 0; break;
      case 'buy': Quests.tradeBuy(st, a, c.npc, c.uid, c.qty || 1); recompute(st, a); break;
      case 'sell': Quests.tradeSell(st, a, c.npc, c.uid, c.qty || 1); recompute(st, a); break;
      case 'choose': Quests.dialogueChoose(st, a, c.idx); break;
      case 'endDialogue': Quests.endDialogue(st, a); break;
      case 'attr': Skills.spendAttr(a, c.attr); recompute(st, a); break;
      case 'learn': Skills.learnSkill(st, a, c.skill, c.npc); recompute(st, a); break;
      case 'sheathe': a.sheathed = !a.sheathed; break;
      default: break;
    }
  }
}

// ---------------------------------------------------------------- death
export function killActor(st, a, killer, opts = {}) {
  if (!a.alive) return;
  a.alive = false; a.hp = 0; a.cs.state = 'dead'; a.cs.t = 0; a.diedAt = st.t;
  if (killer && killer !== a) { killer.kills++; }
  emit(st, { type: 'death', actor: a.id, killer: killer ? killer.id : 0, x: a.x, z: a.z, kind: a.kind, name: a.name });
  Items.dropCorpse(st, a);
  if (killer) Skills.grantXp(st, killer, Skills.xpValue(a));
  Quests.onKill(st, killer, a);
  Flow.onDeath(st, a, killer);
}

// ---------------------------------------------------------------- the step
export function stepRpg(st, dt, inputs = {}) {
  st.t += dt; st.tick++;
  const aiInputs = Flow.updateAI(st, dt) || new Map();
  for (const a of st.actors.slice()) {
    if (!a.alive) continue;
    const inp = a.kind === 'player' ? (inputs[a.id] || inputs.player || IDLE_INPUT) : (aiInputs.get(a.id) || IDLE_INPUT);
    runCmds(st, a, inp.cmds);
    if (inp.interact) interact(st, a);
    Combat.handleInput(st, a, inp, dt);
    moveActor(st, a, inp, dt);
    Combat.updateCombat(st, a, dt);
    Combat.updateStatus(st, a, dt);
  }
  Combat.stepProjectiles(st, dt);
  separate(st);
  Quests.update(st, dt);
  Flow.updateZone(st, dt);
  Flow.afterStep(st, dt);
  // corpses/ground items cleanup, so the world does not grow forever
  if (st.groundItems.length > 400) st.groundItems.splice(0, st.groundItems.length - 400);
  if (st.player) st.player.openC = st.player.openC && st.byId.get(st.player.id) && containerNear(st, st.player) ? st.player.openC : 0;
}

function containerNear(st, a) {
  const c = st.containers.find((q) => q.id === a.openC);
  return c && !c.removed && Math.hypot(c.x - a.x, c.z - a.z) < PHYS.interactRange + 2.5;
}
