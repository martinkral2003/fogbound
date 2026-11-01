// FOGBOUND: HERO settlement, NPCs, dialogue, quests and trading (QUESTS lane). Facade over src/rpg/content/*.
// Exports (README): buildSettlement startDialogue dialogueChoose endDialogue update onKill tradeBuy tradeSell tradeList inSettlement journal markers
// Extras: startQuest abandonQuest questState npcByKey tradeSellPrice.
import { makeActor, recompute, emit } from './core.js';
import * as Items from './items.js';
import { layoutSettlement } from './content/settlement.js';
import { NPCS, NPC_BY_KEY } from './content/npcs.js';
import { QUESTS } from './content/quests.js';
import { rec, mkItem, npcById } from './content/qutil.js';
import * as P from './content/q_progress.js';
import * as D from './content/q_dialogue.js';
import * as T from './content/q_trade.js';
import { placeSites } from './content/q_sites.js';

export const inSettlement = (st, x, z) => !!st.settlement && Math.hypot(x - st.settlement.x, z - st.settlement.z) <= st.settlement.r;
export const npcByKey = (st, key) => npcById(st, key);
export const questState = P.qstate;
export const startQuest = P.startQuest;
export const abandonQuest = P.abandon;
export const journal = P.journal;
export const markers = P.markers;
export const tradeSellPrice = T.sellPrice;
export const startDialogue = D.startDialogue;
export const dialogueChoose = D.dialogueChoose;
export const endDialogue = D.endDialogue;
export const tradeBuy = T.tradeBuy;
export const tradeSell = T.tradeSell;
export const tradeList = (st, npcId) => T.tradeList(st, npcId, st.player);

function makeNpc(st, def, x, z, yaw) {
  const a = makeActor(st, {
    kind: 'npc', name: def.name, type: 'npc_' + def.key, model: 'human', team: 99, x, z, yaw, lvl: def.lvl || 5, gold: def.gold || 0, radius: 0.5,
    extra: { npcId: def.key, title: def.title, role: def.role, act: def.act, look: def.look, essential: true, invulnerable: true, trainer: def.key === 'torvald', trainerRole: def.key === 'torvald' ? 'master' : undefined, shopGold: def.gold || 0, barks: def.barks, home: { x, z, yaw }, nextBark: 15 + st.rng() * 30, phase: st.rng() * 6 },
  });
  a.attrs.vit = 40; recompute(st, a, true);
  a.hp = a.maxHp = 9999;
  return a;
}

export function buildSettlement(st) {
  const L = layoutSettlement(st.world);
  st.settlement = { name: 'Harrowmere', x: L.x, z: L.z, r: L.r, wallR: L.wallR, safe: true, phi: L.phi, buildings: L.buildings, gates: L.gates, bonfire: L.bonfire, board: L.board, spots: L.spots };
  st.quests = { players: {}, shops: {}, sites: {}, lore: [], nextPoll: 0 };
  for (const def of NPCS) {
    if (def.outside) continue;
    const sp = L.spots[def.key]; if (!sp) continue;
    const look = sp.lookAt || { x: L.x, z: L.z };
    const a = makeNpc(st, def, sp.x, sp.z, Math.atan2(look.z - sp.z, look.x - sp.x));
    if (sp.loop) a.loop = sp.loop;
  }
  placeSites(st, L, (def, x, z, yaw) => makeNpc(st, def, x, z, yaw));
}

function animateNpc(st, n, dt) {
  const talking = st.dialogue && st.dialogue.npcId === n.id;
  if (talking) { n.moving = false; return; }
  if (n.talkT > 0) n.talkT -= dt;
  n.phase += dt;
  if (n.act === 'patrol' && n.loop && n.talkT <= 0) {
    const tgt = n.loop[(n.leg || 0) % n.loop.length], dx = tgt.x - n.x, dz = tgt.z - n.z, d = Math.hypot(dx, dz);
    if (n.pauseT > 0) { n.pauseT -= dt; n.moving = false; } else if (d < 0.3) { n.leg = (n.leg || 0) + 1; n.pauseT = 4 + st.rng() * 4; n.moving = false; } else {
      const s = Math.min(d, 1.6 * dt); n.x += (dx / d) * s; n.z += (dz / d) * s; n.yaw = Math.atan2(dz, dx); n.moving = true;
      n.y = st.world.heightAt(n.x, n.z);
    }
  } else if (n.talkT <= 0 && n.home) { n.yaw = n.home.yaw; n.moving = false; }
  n.working = n.act === 'work' && n.talkT <= 0;
}

export function update(st, dt) {
  if (!st.quests) return;
  T.restock(st);
  D.dialogueTick(st);
  const p = st.player;
  for (const n of st.npcs) {
    animateNpc(st, n, dt);
    n.hp = n.maxHp;
    if (p && n.alive && n.barks && st.t >= n.nextBark) {
      n.nextBark = st.t + 18 + st.rng() * 30;
      if (Math.hypot(p.x - n.x, p.z - n.z) < 12 && !st.dialogue) {
        const text = n.barks[Math.floor(st.rng() * n.barks.length)];
        n.bark = { text, until: st.t + 4 };
        emit(st, { type: 'bark', actor: n.id, npc: n.id, name: n.name, text, x: n.x, z: n.z });
      }
    }
  }
  if (p && p.alive && st.t >= st.quests.nextPoll) { st.quests.nextPoll = st.t + 0.25; P.poll(st, p); }
}

export function onKill(st, killer, victim) {
  if (!st.quests) return;
  P.onKill(st, killer, victim);
  if (victim.kind === 'npc') emit(st, { type: 'announce', text: victim.name + ' has fallen.' });
}
