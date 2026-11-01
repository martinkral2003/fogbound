// Item construction: makeItem(defId, opts, rng). Merges catalogue defs, uniques and rolled affixes.
import { ITEMS } from './catalog.js';
import './catalog2.js';
import { UNIQUES } from './uniques.js';
import { rollAffixes, affixName } from './affixes.js';

export const RARITIES = [
  { id: 0, name: 'Common', color: '#d8dccf', valueMul: 1 }, { id: 1, name: 'Magic', color: '#e8d870', valueMul: 1.6 }, { id: 2, name: 'Rare', color: '#6fd870', valueMul: 2.6 },
  { id: 3, name: 'Epic', color: '#6aa8ff', valueMul: 4 }, { id: 4, name: 'Legendary', color: '#c070ff', valueMul: 7 },
];

let uidCounter = 1;
export const newUid = () => 'i' + uidCounter++;
export const isEquippable = (it) => !!it.slot;
export const resolveDef = (id) => ITEMS[id] || null;

export function makeItem(defId, opts = {}, rng = Math.random) {
  let base, uq = null;
  if (typeof defId === 'string' && defId.startsWith('unique:')) { uq = UNIQUES[defId.slice(7)]; if (!uq) throw new Error('unknown unique ' + defId); base = ITEMS[uq.base]; }
  else base = ITEMS[defId];
  if (!base) throw new Error('unknown item def ' + defId);
  const item = structuredClone(base);
  item.res = item.res || {}; item.bonus = item.bonus || {}; item.req = item.req || {};
  if (uq) {
    const { base: _b, ...o } = uq; for (const [k, v] of Object.entries(o)) item[k] = (v && typeof v === 'object' && !Array.isArray(v) && (k === 'bonus' || k === 'res')) ? { ...(item[k] || {}), ...v } : structuredClone(v);
    item.unique = defId.slice(7);
  }
  item.baseId = base.id; item.def = uq ? defId : base.id; item.baseName = item.name;
  item.uid = newUid(); item.stack = !!base.stack; item.qty = item.stack ? Math.max(1, Math.round(opts.qty || 1)) : 1;
  item.slot = item.slot || null; item.kind = item.kind || null; item.plus = 0; item.affixes = [];
  let rarity = uq ? 4 : (item.slot ? (opts.rarity | 0) : 0);
  rarity = Math.max(0, Math.min(4, rarity)); item.rarity = rarity;
  if (!uq && rarity > 0 && item.slot && !opts.noAffix) {
    item.affixes = rollAffixes(item, base, rarity, rng);
    item.name = affixName(item.baseName, item.affixes, rarity, base, rng);
    item.value = Math.round(item.value * RARITIES[rarity].valueMul * (1 + 0.1 * item.affixes.length));
  }
  if (item.kind === 'key') { item.keyId = opts.keyId ?? item.keyId; if (opts.name) item.name = opts.name; }
  if (opts.locked) item.locked = true;
  if (item.dmg || item.armor) item.base0 = { dmg: item.dmg ? [item.dmg[0], item.dmg[1]] : null, armor: item.armor || 0, value: item.value };
  return item;
}

// a fresh copy of an item with a new uid (used when splitting stacks)
export function cloneItem(it, qty) { const c = structuredClone(it); c.uid = newUid(); if (qty != null) c.qty = qty; return c; }
