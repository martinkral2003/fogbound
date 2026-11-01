// Prices, smith upgrades, tooltips and comparisons.
import { RARITIES } from './make.js';
import { deficitOf } from './derived.js';

// ---- prices (per single unit; multiply by qty yourself)
export function buyPrice(item, npc) {
  const base = (item.value || 1) * 1.5 * ((npc && npc.margin) || 1);
  return Math.max(1, Math.round(base));
}
export function sellValue(item, npc) {
  let f = 0.35; const role = npc && (npc.role || npc.shop);
  if (role === 'fence') f = item.junk || item.valuable ? 0.6 : 0.45;
  else if (role === 'smith' && (item.slot === 'weapon' || item.kind === 'armor' || item.kind === 'shield')) f = 0.5;
  else if (role === 'alchemist' && (item.kind === 'potion' || item.kind === 'ingredient' || item.kind === 'scroll')) f = 0.5;
  else if (role === 'inn' && item.kind === 'food') f = 0.5;
  else if (item.junk) f = 0.5;
  if (item.kind === 'gold') return 1;
  return Math.max(1, Math.round((item.value || 1) * f));
}

// ---- smith upgrades: +1..+3, +10% weapon damage / armor per step
export const MAX_PLUS = 3;
export const canUpgrade = (it) => !!(it && it.base0 && (it.dmg || it.armor) && (it.plus || 0) < MAX_PLUS);
export function upgradeQuote(it) {
  if (!canUpgrade(it)) return { ok: false, cost: 0, reason: it && (it.plus || 0) >= MAX_PLUS ? 'fully upgraded' : 'cannot be upgraded', item: it };
  const p = it.plus || 0; return { ok: true, cost: Math.round(25 + (it.base0.value || it.value) * 0.2 * Math.pow(p + 1, 1.5)), item: it };
}
// Performs the upgrade (mutates item). If an actor is passed the gold is charged (and the upgrade refused when too poor); otherwise the caller charges `cost`.
export function upgradeItem(it, a) {
  const q = upgradeQuote(it); if (!q.ok) return q;
  if (a && (a.gold || 0) < q.cost) return { ok: false, cost: q.cost, reason: 'not enough gold', item: it };
  if (a) a.gold -= q.cost;
  it.plus = (it.plus || 0) + 1; const m = 1 + 0.1 * it.plus;
  if (it.base0.dmg) it.dmg = [Math.round(it.base0.dmg[0] * m), Math.round(it.base0.dmg[1] * m)];
  if (it.base0.armor) it.armor = +(it.base0.armor * m).toFixed(1);
  it.value = Math.round((it.base0.value || it.value) * (1 + 0.25 * it.plus));
  it.name = it.name.replace(/ \+\d$/, '') + ` +${it.plus}`;
  return { ok: true, cost: q.cost, item: it };
}

// ---- tooltips
const C = { good: '#8fd88f', bad: '#e07a6a', dim: '#9aa090', flavor: '#a8a08a', affix: '#7fb0ff', warn: '#e0bb5c', ink: '#d8dccf' };
const KIND_LABEL = { sword: 'One-handed sword', axe: 'One-handed axe', mace: 'One-handed mace', dagger: 'Dagger', spear: 'Spear', twohand: 'Two-handed weapon', bow: 'Bow', crossbow: 'Crossbow', staff: 'Staff',
  shield: 'Shield', armor: 'Armor', amulet: 'Amulet', ring: 'Ring', torch: 'Light (offhand)', potion: 'Potion', food: 'Food', scroll: 'Scroll', arrow: 'Ammunition', bolt: 'Ammunition', lockpick: 'Tool', key: 'Key', misc: 'Trinket', ingredient: 'Ingredient', gold: 'Gold' };
const STAT_LABEL = { str: 'Strength', dex: 'Dexterity', int: 'Intelligence', vit: 'Vitality', hp: 'Max Health', stamina: 'Max Stamina', mana: 'Max Mana', armor: 'Armor', moveSpeed: 'Movement speed', dmgPct: 'Damage', spellDmgPct: 'Spell damage',
  critPct: 'Critical chance', atkSpeed: 'Attack speed', lifesteal: 'Life steal', hpRegen: 'Health regen/s', staminaRegen: 'Stamina regen/s', manaRegen: 'Mana regen/s', light: 'Light radius', carry: 'Carry weight', sneak: 'Stealth' };
const PCT = new Set(['moveSpeed', 'dmgPct', 'spellDmgPct', 'critPct', 'atkSpeed', 'lifesteal', 'sneak']);
export const rarityColor = (r) => (RARITIES[r] || RARITIES[0]).color;
const sgn = (v) => (v >= 0 ? '+' : '') + v;
export const avgDmg = (it) => (it.dmg ? (it.dmg[0] + it.dmg[1]) / 2 : 0);
export const dpsOf = (it) => avgDmg(it) * (it.speed || 1);

export function describeItem(it, a) {
  const lines = [], L = (text, color) => lines.push(color ? { text, color } : { text });
  const rar = RARITIES[it.rarity] || RARITIES[0];
  const sub = [it.slot ? rar.name : null, KIND_LABEL[it.kind] || it.kind, it.cls ? it.cls : null, it.twoHanded && it.kind !== 'twohand' ? 'two-handed' : null].filter(Boolean).join(' - ');
  L(sub, C.dim);
  if (it.dmg) {
    L(`Damage ${it.dmg[0]}-${it.dmg[1]}${it.dtype && it.dtype !== 'physical' ? ' ' + it.dtype : ''}   (${dpsOf(it).toFixed(1)} per sec)`, C.ink);
    L(`Speed ${it.speed.toFixed(2)}   Reach ${it.reach ? it.reach.toFixed(1) + ' m' : 'ranged'}   Stamina ${it.stam}`, C.dim);
    if (it.ranged) L(`Draw ${it.ranged.draw.toFixed(1)} s   Range ${it.ranged.range} m   needs ${it.ammoKind}s`, C.dim);
    if (it.backstab) L(`Backstab x${it.backstab}`, C.dim);
    if (it.slayer) for (const [k, v] of Object.entries(it.slayer)) L(`+${Math.round(v * 100)}% damage to ${k}`, C.good);
  }
  if (it.kind === 'shield') L(`Blocks ${Math.round(it.block * 100)}% of damage`, C.ink);
  if (it.armor) L(`Armor ${it.armor}${it.cls ? ` (${it.cls})` : ''}`, C.ink);
  if (it.light) L(`Light radius ${it.light} m`, C.ink);
  if (it.heal) L(`Restores ${it.heal} health`, C.good);
  if (it.stamina) L(`Restores ${it.stamina} stamina`, C.good);
  if (it.mana && !it.slot) L(`Restores ${it.mana} mana`, C.good);
  if (it.hot) L(`Regenerates ${it.hot.hp} health/s for ${it.hot.dur} s`, C.good);
  if (it.cure) L(`Cures ${it.cure.join(', ')}`, C.good);
  if (it.spell) L(`Casts ${it.spell} once when read`, C.affix);
  if (it.ammoKind && it.dmgAdd != null && it.kind === it.ammoKind) L(`+${it.dmgAdd} damage${it.dtype && it.dtype !== 'physical' ? ' (' + it.dtype + ')' : ''}`, C.good);
  if (it.kind === 'key') L(it.keyId != null ? 'Fits a specific lock' : 'Fits no lock you know', C.dim);
  for (const [k, v] of Object.entries(it.bonus || {})) if (v && STAT_LABEL[k]) L(`${sgn(PCT.has(k) ? Math.round(v * 1000) / 10 : v)}${PCT.has(k) ? '%' : ''} ${STAT_LABEL[k]}`, v > 0 ? C.affix : C.bad);
  for (const [k, v] of Object.entries(it.res || {})) if (v) L(`${sgn(v)}% ${k} resistance`, v > 0 ? C.affix : C.bad);
  if (it.movePen) L(`Slows movement ${(it.movePen * 100).toFixed(1)}%`, C.warn);
  if (it.req && Object.keys(it.req).length) {
    const df = a ? deficitOf(a, it) : { miss: [] }, bad = new Set(df.miss.map((m) => m.attr));
    L('Requires ' + Object.entries(it.req).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(', '), bad.size ? C.bad : C.dim);
    if (bad.size) L('Unmet requirements reduce its effectiveness.', C.bad);
  }
  L(`Weight ${(it.weight * (it.qty || 1)).toFixed(1)}${it.qty > 1 ? ` (x${it.qty})` : ''}   Value ${it.value || 0}`, C.dim);
  if (it.flavor) L('"' + it.flavor + '"', C.flavor);
  if (it.plus) L(`Reinforced +${it.plus}`, C.warn);
  return { title: it.name, color: rar.color, rarity: it.rarity, rarityName: rar.name, subtitle: sub, lines };
}

// deltas vs the item currently equipped in the slot the candidate would take
export function compareItem(a, it) {
  const cur = it.slot ? a.equip[it.slot] : null;
  const dmgDelta = it.dmg ? avgDmg(it) - (cur && cur.dmg ? avgDmg(cur) : 0) : 0;
  const dpsDelta = it.dmg ? dpsOf(it) - (cur && cur.dmg ? dpsOf(cur) : 0) : 0;
  const armorDelta = (it.armor || 0) - (cur ? cur.armor || 0 : 0);
  const weightDelta = (it.weight || 0) - (cur ? cur.weight || 0 : 0);
  const bonusDelta = {};
  for (const k of new Set([...Object.keys(it.bonus || {}), ...Object.keys(cur ? cur.bonus || {} : {})])) { const d = ((it.bonus || {})[k] || 0) - (((cur && cur.bonus) || {})[k] || 0); if (d) bonusDelta[k] = +d.toFixed(3); }
  const resDelta = {};
  for (const k of new Set([...Object.keys(it.res || {}), ...Object.keys(cur ? cur.res || {} : {})])) { const d = ((it.res || {})[k] || 0) - (((cur && cur.res) || {})[k] || 0); if (d) resDelta[k] = d; }
  return { slot: it.slot || null, equipped: cur || null, dmgDelta: +dmgDelta.toFixed(2), dpsDelta: +dpsDelta.toFixed(2), armorDelta: +armorDelta.toFixed(1), weightDelta: +weightDelta.toFixed(1), bonusDelta, resDelta,
    unmet: deficitOf(a, it).miss, better: dpsDelta > 0.01 || armorDelta > 0.01 };
}
