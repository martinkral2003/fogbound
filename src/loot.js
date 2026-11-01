// Loot + champion generation (pure functions, no DOM, no sim state). `rng` is a () => [0,1) function (st.rng).
// v0.5 (COMBAT lane): 4 slots, ONE stat per item, 3 tiers = 3 colours.
// Item shape: { slot:'weapon'|'helmet'|'armor'|'amulet', stat:'dmg'|'hp'|'spd'|'cdr', val (percent), tier:0..2, name, score,
//               rarity (= tier, colour index into RARITY), affixes: [] (compat: always empty) }
import { RARITY, GEAR_NAMES, STAT_INFO, SLOT_STATS, ITEM_SLOTS, DROP, MON_AFFIXES, MONSTERS } from './data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

export const tierColor = (tier) => RARITY[clamp(tier | 0, 0, 2)].css;
export const itemName = (slot, stat, tier) => {
  const n = GEAR_NAMES[slot] && GEAR_NAMES[slot][stat];
  return (n && n[clamp(tier, 0, 2)]) || (slot === 'amulet' ? 'Charm' : slot === 'helmet' ? 'Helm' : slot === 'weapon' ? 'Sword' : 'Armour');
};
export const baseName = (slot, tier) => itemName(slot, (SLOT_STATS[slot] || ['dmg'])[0], tier); // compat

// how good an item is: higher tier always wins, then stat value x stat weight (used to compare items with DIFFERENT stats)
export function itemScore(it) {
  if (!it || !it.stat) return 0;
  const w = (STAT_INFO[it.stat] && STAT_INFO[it.stat].w) || 1;
  return (it.tier | 0) * 100 + Math.round((it.val || 0) * w * 10) / 10;
}
/** Auto-equip rule: an item replaces the worn one when the slot is empty, or it has the SAME stat and a higher value, or a DIFFERENT stat and a higher score (tier first). */
export function betterThan(it, cur) {
  if (!it || !it.stat) return false;
  if (!cur || !cur.stat) return true;
  if (it.stat === cur.stat) return (it.val || 0) > (cur.val || 0);
  return itemScore(it) > itemScore(cur) + 0.01;
}
export const sellValue = (it) => (it && it.stat ? DROP.sell[clamp(it.tier | 0, 0, 2)] || 4 : 5);
export const statText = (stat, val) => (STAT_INFO[stat] ? STAT_INFO[stat].text.replace('{v}', String(val)) : String(stat));
export const itemText = (it) => (it && it.stat ? statText(it.stat, it.val) : '');
export function affixText(a) { return a && a.id ? statText(a.id, a.v) : ''; } // compat for old UI code (items have no affixes any more)

/** Build one item. tier 0..2 (white/blue/gold); stat optional (else rolled from the slot's stat list). */
export function makeGear(rng, slot, tier, stat) {
  tier = clamp(tier | 0, 0, 2);
  if (!ITEM_SLOTS.includes(slot)) slot = 'weapon';
  const names = GEAR_NAMES[slot];
  if (!stat || !names[stat]) stat = pick(rng, SLOT_STATS[slot]);
  if (!names[stat]) stat = Object.keys(names)[0];
  const base = STAT_INFO[stat].vals[tier];
  const val = Math.max(1, Math.round(base * (0.9 + rng() * 0.2)));
  const it = { slot, stat, val, tier, rarity: tier, affixes: [], name: itemName(slot, stat, tier) };
  it.score = itemScore(it);
  return it;
}
// compat for old callers (towns shop, wc_util, horde loot): old tier 1..4 and rarity 0..4 map to the new tiers 0..2
export function makeItem(rng, slot, tier, rarity) {
  const t = clamp(Math.round(((tier || 1) - 1) * 0.5 + (rarity || 0) * 0.5), 0, 2);
  return makeGear(rng, slot, t);
}

/** Tier roll: weights white/blue/gold from DROP.tierOdds; `luck` (0..1.5) pushes towards blue and gold. min/max clamp the result. */
export function rollTier(rng, luck = 0, min = 0, max = 2) {
  const o = DROP.tierOdds, w = [o[0], o[1] * (1 + 2.2 * luck), o[2] * (1 + 5 * luck)];
  let r = rng() * (w[0] + w[1] + w[2]), t = 0;
  for (; t < 2; t++) { r -= w[t]; if (r <= 0) break; }
  return clamp(t, min, max);
}
export const rollRarity = (rng, luck) => rollTier(rng, luck); // compat

// o: { elite:0..2, chest, boss, slot, danger:0..1.3, empty:[slots the hero has empty], tierMin, stat }
// `tier` is the monster/camp tier 1..4 (higher = better odds)
export function rollItem(rng, tier = 1, o = {}) {
  let slot = o.slot;
  if (!slot) {
    if (o.empty && o.empty.length && rng() < DROP.empty) slot = pick(rng, o.empty);
    else { const r = rng(); slot = r < 0.3 ? 'weapon' : r < 0.55 ? 'armor' : r < 0.78 ? 'helmet' : 'amulet'; }
  }
  const dn = clamp(o.danger || 0, 0, 1.3);
  const luck = (tier - 1) * 0.08 + (o.elite ? 0.35 : 0) + (o.chest ? 0.2 : 0) + dn * 0.35 + (o.boss ? 1 : 0);
  const min = o.boss ? 2 : Math.max(o.tierMin || 0, o.elite ? 1 : 0);
  return makeGear(rng, slot, rollTier(rng, luck, min), o.stat);
}
// boss loot: always gold tier
export function rollBossItem(rng, slot) { return makeGear(rng, slot || pick(rng, ITEM_SLOTS), 2); }

// champion (elite 1) in camps of tier 2+: 1-2 behaviour affixes (no immunities, no damage types)
export function rollChampion(rng, key) {
  const ids = Object.keys(MON_AFFIXES), n = rng() < 0.55 ? 1 : 2, aff = [];
  while (aff.length < n) {
    const id = pick(rng, ids);
    if (!aff.includes(id)) aff.push(id);
  }
  const d = MONSTERS[key];
  return { affixes: aff, title: aff.map((id) => MON_AFFIXES[id].name).join(' ') + ' ' + (d ? d.name : key) };
}

// potions live in team.pots (gear.js); they are never items on the ground
export const makePotion = (k = 'heal') => ({ kind: 'potion', k, name: k, rarity: 0, tier: 1 });
export function consumableValue(it) { return it && it.kind === 'potion' ? 12 : 5; }
