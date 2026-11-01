// Starter kits and auto-equip helpers (used by rivals/AI and the "equip best" button).
import { SLOTS } from '../consts.js';
import { makeItem } from './make.js';
import { deficitOf } from './derived.js';
import * as Inv from '../items.js';

// kit: attrs baseline (sum 40 like the default 10/10/10/10), equipment, pack, gold, quick slots (pack index / 'spell:id')
export const KITS = {
  wanderer: { attrs: { str: 10, dex: 10, int: 10, vit: 10 }, equip: ['sword_0', 'chest_cloth'], pack: [['healthPotion', 2], ['bandage', 2], ['bread', 2], ['torch', 1]], gold: 10 },
  warrior:  { attrs: { str: 14, dex: 9, int: 5, vit: 12 }, equip: ['sword_1', 'shield_0', 'chest_leather', 'legs_leather', 'boots_leather'], pack: [['healthPotion', 2], ['bandage', 2], ['bread', 2]], gold: 20 },
  ranger:   { attrs: { str: 9, dex: 14, int: 6, vit: 11 }, equip: ['bow_1', 'chest_leather', 'legs_leather', 'boots_leather'], pack: [['arrow', 40], ['arrowIron', 10], ['dagger_0', 1], ['healthPotion', 2], ['bandage', 2], ['cookedMeat', 2]], gold: 15 },
  mage:     { attrs: { str: 7, dex: 9, int: 15, vit: 9 }, equip: ['staff_1', 'chest_robe', 'head_cowl'], pack: [['healthPotion', 1], ['manaPotion', 3], ['scroll_firebolt', 1], ['bread', 2]], gold: 25, spells: ['spell:firebolt'] },
  rogue:    { attrs: { str: 9, dex: 15, int: 6, vit: 10 }, equip: ['dagger_1', 'chest_leather', 'head_cowl'], pack: [['healthPotion', 2], ['lockpick', 5], ['bandage', 2], ['torch', 1]], gold: 30 },
  brute:    { attrs: { str: 16, dex: 7, int: 4, vit: 13 }, equip: ['twohand_1', 'chest_studded'], pack: [['healthPotion', 2], ['roastBoar', 2], ['bandage', 1]], gold: 5 },
};

export function starterKit(a, kit = 'wanderer') {
  const K = KITS[kit] || KITS.wanderer;
  a.attrs = { ...a.attrs, ...K.attrs };
  for (const id of K.equip) { const it = makeItem(id); a.inv.push(it); Inv.equip(a, it.uid); }
  const uids = [];
  for (const [id, qty] of K.pack) { const it = makeItem(id, { qty }); a.inv.push(it); uids.push(it); }
  a.gold = (a.gold || 0) + (K.gold || 0);
  const pots = uids.filter((i) => i.kind === 'potion' || i.kind === 'food');
  let q = 0; for (const it of pots.slice(0, 3)) if (!a.quick[q]) a.quick[q++] = it.uid;
  for (const s of K.spells || []) { while (a.quick[q]) q++; if (q < a.quick.length) a.quick[q++] = s; }
  return a;
}

// rough usefulness of an item for an actor (higher = better); used by equipBest and AI
export function itemScore(a, it) {
  if (!it) return 0;
  const b = it.bonus || {}, df = deficitOf(a, it).deficit, reqMul = Math.max(0.3, 1 - 0.08 * df);
  const resSum = Object.values(it.res || {}).reduce((s, v) => s + v, 0);
  const extras = (b.hp || 0) / 5 + (b.mana || 0) / 10 + (b.stamina || 0) / 8 + resSum / 4 + (b.str || 0) * 2 + (b.dex || 0) * 2 + (b.int || 0) * 2 + (b.vit || 0) * 3 + (b.armor || 0) * 1.5;
  if (it.kind === 'shield') return (it.armor * 1.2 + it.block * 20 + extras) * reqMul;
  if (it.kind === 'torch') return (it.light || 0) * 0.6;
  if (it.slot === 'weapon') {
    const avg = (it.dmg[0] + it.dmg[1]) / 2;
    const noAmmo = it.ammoKind && !a.inv.some((q) => q.ammoKind === it.ammoKind);
    const staff = it.kind === 'staff' ? ((b.spellDmgPct || 0) * 120 + (b.mana || 0) / 4) : 0;
    return (avg * it.speed * (1 + (b.dmgPct || 0) + (b.critPct || 0) * 1.5 + (b.atkSpeed || 0)) * (1 + (b.lifesteal || 0) * 3) + extras / 3 + staff + (it.dtype !== 'physical' ? 2 : 0)) * reqMul * (noAmmo ? 0.1 : 1) * (it.kind === 'staff' ? 0.8 : 1);
  }
  if (it.kind === 'armor') return ((it.armor || 0) * (1 - 0.05 * df) + extras - (it.movePen || 0) * 60) * 1;
  return (b.dmgPct || 0) * 80 + (b.critPct || 0) * 80 + (b.lifesteal || 0) * 100 + extras + (it.armor || 0);
}

// equip the best item per slot from inventory + equipped; two-handers compete with one-hander + offhand
export function equipBest(a) {
  const pool = [...a.inv, ...SLOTS.map((s) => a.equip[s]).filter(Boolean)];
  const best = (slot, list) => list.filter((i) => i.slot === slot).sort((x, y) => itemScore(a, y) - itemScore(a, x))[0] || null;
  const offs = pool.filter((i) => i.slot === 'offhand' && i.kind !== 'torch'), shield = best('offhand', offs);
  const ws = pool.filter((i) => i.slot === 'weapon');
  let bestW = null, bestV = -1;
  for (const w of ws) { const v = itemScore(a, w) + (w.twoHanded ? 0 : (shield ? itemScore(a, shield) * 0.6 : 0)); if (v > bestV) { bestV = v; bestW = w; } }
  const want = {};
  want.weapon = bestW;
  if (bestW && !bestW.twoHanded) want.offhand = shield || best('offhand', pool);
  for (const s of ['head', 'chest', 'legs', 'boots', 'hands', 'amulet', 'ring']) want[s] = best(s, pool);
  for (const [s, it] of Object.entries(want)) { if (it && a.equip[s] !== it && a.inv.includes(it)) Inv.equip(a, it.uid); }
  return a;
}
