// Fallback state for rpg-ui-test.html when the real sim modules fail to load (they are being rewritten by other lanes). UI-B test helper only.
import { generateWorld } from '../../world.js';

export function createMockRpg(seed = 1337) {
  const world = generateWorld(seed);
  const mk = (id, o) => ({ id, kind: 'monster', name: 'Ghoul', lvl: 3, x: 0, z: 0, y: 0, yaw: 0, hp: 80, maxHp: 100, stamina: 100, maxStamina: 100, mana: 40, maxMana: 60, alive: true, status: [], radius: 0.5, height: 1.8, kills: 0, ...o });
  const h = world.hearts[0];
  const p = mk(1, { kind: 'player', name: 'You', lvl: 4, x: h.x + 8, z: h.z + 8, yaw: Math.PI / 4, hp: 118, maxHp: 140, maxMana: 70, mana: 70, xp: 120, gold: 85, points: { attr: 3, skill: 1 }, cs: { state: 'idle' } });
  p.quick = ['u1', 'spell:firebolt', 'u2', null, 'spell:mend', null, null, null];
  p.inv = [
    { uid: 'u1', def: 'healthPotion', name: 'Healing Draught', kind: 'potion', stack: true, qty: 3, rarity: 0 },
    { uid: 'u2', def: 'bow', name: 'Hunter\'s Bow', kind: 'bow', slot: 'weapon', qty: 1, rarity: 2 },
  ];
  p.equip = { weapon: null }; p.d = { weapon: {} };
  p.cd = { firebolt: 3.4 };
  const actors = [p];
  const npc = mk(2, { kind: 'npc', name: 'Brannoch', type: 'smith', x: p.x + 1.5, z: p.z + 0.5, lvl: 5, hp: 100 });
  const rival = mk(3, { kind: 'rival', name: 'Sir Valdric', lvl: 5, x: p.x + 20, z: p.z + 10 });
  const ghoul = mk(4, { kind: 'monster', name: 'Ghoul', lvl: 3, x: p.x + 12, z: p.z + 3, hp: 54, maxHp: 90 });
  actors.push(npc, rival, ghoul);
  const st = {
    mode: 'rpg', seed, world, t: 0, tick: 0, actors, byId: new Map(actors.map((a) => [a.id, a])), player: p, npcs: [npc],
    groundItems: [{ id: 1, x: p.x + 2, z: p.z - 1, item: { name: 'Rusty Sword', rarity: 1, kind: 'sword' } }],
    containers: [{ id: 5, x: p.x - 2, z: p.z + 3, kind: 'chest', tier: 2, locked: false, items: [], name: 'Old Chest' }],
    settlement: { name: 'Harrowmere', x: h.x + 20, z: h.z + 20, r: 24, safe: true, buildings: [] },
    quests: null, dialogue: null, events: [], projs: [],
    zone: { cx: 20, cz: -10, r: 230, fromR: 230, toR: 170, stage: 1, stages: 5, state: 'waiting', t: 0, nextAt: 240, dps: 2 },
    match: { state: 'running', alive: 8, total: 10, winner: 0, kills: [], placements: {}, calmUntil: 45 },
  };
  return st;
}
export function stepMock(st, dt) { st.t += dt; st.tick++; }
export function nearestMock(st, a) {
  let best = null, bd = 1e9;
  const t = (type, target, x, z) => { const d = Math.hypot(x - a.x, z - a.z); if (d < 2.7 && d < bd) { bd = d; best = { type, target }; } };
  for (const c of st.containers) t('container', c, c.x, c.z);
  for (const g of st.groundItems) t('item', g, g.x, g.z);
  for (const n of st.npcs) t('npc', n, n.x, n.z);
  return best;
}
