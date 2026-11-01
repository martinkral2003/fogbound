// QUESTS lane helpers: item construction that survives a missing def, inventory matching, quest-record access.
import * as Items from '../items.js';

let qUid = 1;

// make an item from an Items def; if the def does not exist (yet) fabricate a plain quest/misc item so quests never crash
export function mkItem(st, defId, opts = {}) {
  try {
    if (Items.ITEMS && Items.ITEMS[defId]) {
      const it = Items.makeItem(defId, opts, st.rng);
      if (it) { if (opts.name) it.name = opts.name; if (opts.quest) it.questItem = true; return it; }
    }
  } catch (e) { /* fall through */ }
  const f = FALLBACK[defId] || {};
  return {
    uid: 'q' + (qUid++), def: defId, name: opts.name || f.name || defId, slot: f.slot || null, kind: f.kind || 'misc', rarity: opts.rarity ?? f.rarity ?? 0,
    affixes: [], qty: opts.qty || 1, stack: !!f.stack, weight: f.weight ?? 0.2, value: f.value ?? 10, questItem: !!(opts.quest || f.quest), ...(f.extra || {}),
  };
}

const FALLBACK = {
  healthPotion: { name: 'Healing Draught', kind: 'potion', value: 30, stack: true, weight: 0.3, extra: { heal: 60 } },
  manaPotion: { name: 'Mana Draught', kind: 'potion', value: 30, stack: true, weight: 0.3, extra: { mana: 50 } },
  bread: { name: 'Black Bread', kind: 'food', value: 4, stack: true, weight: 0.3, extra: { heal: 12 } },
  lockpick: { name: 'Lockpick', kind: 'lockpick', value: 12, stack: true, weight: 0.05 },
  smithsHammer: { name: "Brannoch's War-Hammer", kind: 'misc', value: 0, weight: 2, rarity: 2, quest: true },
  rivalSignet: { name: "Rival's Signet", kind: 'misc', value: 0, weight: 0.1, rarity: 2, quest: true },
  cryptRelic: { name: 'Crypt Relic', kind: 'misc', value: 40, weight: 0.5, rarity: 1, quest: true },
  wolfPelt: { name: 'Wolf Pelt', kind: 'misc', value: 8, stack: true, weight: 0.8 },
};

// an item matches a spec: 'defId' | 'kind:potion' | {def, kind}
export function itemMatches(it, spec) {
  if (!it) return false;
  if (typeof spec === 'string') {
    if (spec.startsWith('kind:')) return it.kind === spec.slice(5);
    return it.def === spec;
  }
  if (spec.def && it.def !== spec.def) return false;
  if (spec.kind && it.kind !== spec.kind) return false;
  return true;
}
export function countItems(a, spec) { let n = 0; for (const it of a.inv) if (itemMatches(it, spec)) n += it.qty || 1; return n; }
export function takeItems(a, spec, qty) {
  let left = qty;
  for (const it of a.inv.slice()) {
    if (left <= 0) break;
    if (!itemMatches(it, spec)) continue;
    const q = it.qty || 1;
    if (q <= left) { a.inv.splice(a.inv.indexOf(it), 1); left -= q; } else { it.qty = q - left; left = 0; }
  }
  return qty - left;
}
export function giveItem(a, item) {
  if (Items.addToInventory(a, item) === false) { a.inv.push(item); }
  return item;
}

// per-player quest record
export function rec(st, id) {
  if (!st.quests) st.quests = { players: {}, shops: {}, nextCheck: 0, lore: [] };
  let r = st.quests.players[id];
  if (!r) r = st.quests.players[id] = { active: {}, done: {}, failed: {}, flags: {}, met: {}, rep: 0, visited: [], lore: [] };
  return r;
}

export function nearest(st, x, z, list) {
  let best = null, bd = 1e12;
  for (const p of list) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
export function npcById(st, key) { return st.npcs.find((n) => n.npcId === key || n.id === key) || null; }
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const mkUid = () => 'q' + (qUid++);
