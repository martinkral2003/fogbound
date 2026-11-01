// Loot tables, rarity rolls and shop stock. No dependency on items.js (only make.js) to avoid import cycles.
import { ITEMS } from './catalog.js';
import './catalog2.js';
import { makeItem } from './make.js';
import { UNIQUE_IDS } from './uniques.js';

// rarity weights by effective loot tier (row 0 = nothing special ... row 4 = offering crates)
const RAR_ROWS = [[100, 0, 0, 0, 0], [70, 24, 5.5, 0.5, 0], [40, 36, 17, 6.5, 0.5], [15, 30, 30, 20, 5], [0, 5, 30, 40, 25]];
// material tier weights (0 rusty/cloth ... 4 ancient/dark) by effective tier
const MAT_ROWS = [[100, 0, 0, 0, 0], [45, 40, 13, 2, 0], [12, 38, 33, 15, 2], [2, 15, 33, 35, 15], [0, 2, 18, 45, 35]];
const lerpRow = (rows, t) => { t = Math.max(0, Math.min(rows.length - 1.001, t)); const i = Math.floor(t), f = t - i; return rows[i].map((v, k) => v + (rows[i + 1][k] - v) * f); };
const wpick = (w, rng) => { let s = 0; for (const v of w) s += v; let r = rng() * s; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; } return w.length - 1; };
const ri = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));
const pickOf = (arr, rng) => arr[Math.floor(rng() * arr.length)];

export function rollRarity(rng, tier = 1, boost = 0) { return wpick(lerpRow(RAR_ROWS, tier + boost), rng); }
export function rollMatTier(rng, tier = 1, boost = 0) { return wpick(lerpRow(MAT_ROWS, tier + boost), rng); }

const WEAPON_KINDS = [['sword', 5], ['axe', 4], ['mace', 3], ['dagger', 3], ['spear', 3], ['twohand', 2], ['bow', 3], ['crossbow', 1.5], ['staff', 2]];
const ARMOR_BY_MAT = [['cloth', 'leather'], ['leather', 'studded'], ['studded', 'mail'], ['mail', 'plate'], ['plate', 'dark']];
const ARM_SLOTS = ['head', 'chest', 'legs', 'boots', 'hands'];
const JEWELS = Object.keys(ITEMS).filter((k) => /^(amulet|ring)_/.test(k));
const POOLS = {
  potion: ['healthPotion', 'healthPotion', 'healthPotionM', 'staminaPotion', 'manaPotion', 'antidote', 'bandage', 'healthPotionL', 'manaPotionM', 'staminaPotionM', 'resistPotion'],
  food: ['bread', 'cookedMeat', 'cookedMeat', 'roastBoar', 'stew', 'ale'],
  junk: ['boneDice', 'crowFeather', 'rustyShackles', 'brokenFlask', 'tarnishedLocket', 'candleStub'],
  valuable: ['silverGoblet', 'jewelChalice', 'ruby', 'ancientCoin', 'ivoryIdol', 'sealRing'],
  ammo: ['arrow', 'arrow', 'arrowIron', 'arrowBarbed', 'arrowFire', 'bolt', 'bolt', 'boltIron', 'boltBarbed'],
  scroll: Object.keys(ITEMS).filter((k) => k.startsWith('scroll_')),
  tool: ['lockpick', 'lockpick', 'torch', 'lantern'],
  ingredient: ['nightshade', 'bogMoss', 'wolfPelt', 'trollHide', 'wraithDust', 'ghoulClaw'],
};
const QTY = { ammo: [6, 20], potion: [1, 2], food: [1, 3], tool: [1, 3], junk: [1, 2], ingredient: [1, 3], valuable: [1, 1], scroll: [1, 1] };

// generate one item from a pool name. `rar`: number | undefined (roll)
export function genFromPool(pool, rng, tier = 1, o = {}) {
    if (pool === 'weapon' || pool === 'armor' || pool === 'shield' || pool === 'jewel' || pool === 'gear') {
    if (pool === 'gear') pool = pickOf(['weapon', 'armor', 'armor', 'shield', 'jewel'], rng);
    let id;
    const mt = o.mat ?? rollMatTier(rng, tier, (o.boost || 0) * 0.6);
    if (pool === 'weapon') { const k = WEAPON_KINDS[wpick(WEAPON_KINDS.map((x) => x[1]), rng)][0]; id = `${k}_${mt}`; }
    else if (pool === 'shield') id = `shield_${mt}`;
    else if (pool === 'jewel') id = pickOf(o.minJewel ? JEWELS.filter((j) => (ITEMS[j].tier || 0) >= o.minJewel) : JEWELS, rng);
    else { const mats = ARMOR_BY_MAT[mt]; id = `${pickOf(ARM_SLOTS, rng)}_${pickOf(mats, rng)}`; }
    let rar = o.rar ?? rollRarity(rng, tier, (o.boost || 0) * 0.6);
    if (rar === 4 && rng() < 0.3) return makeItem('unique:' + pickOf(UNIQUE_IDS, rng), {}, rng);
    return makeItem(id, { rarity: rar }, rng);
  }
  const list = POOLS[pool]; if (!list) throw new Error('unknown pool ' + pool);
  const id = pickOf(list, rng), q = QTY[pool] || [1, 1];
  return makeItem(id, { qty: ITEMS[id].stack ? ri(rng, ITEMS[id].ammoKind ? QTY.ammo : q) : 1 }, rng);
}

// ---- tables. entry: {w, pool | def, qty:[a,b], rar, mat, boost}. A table: rolls [min,max], gold [min,max], always: entries always given (chance p), entries weighted.
const GEAR = (w, boost = 0) => ({ w, pool: 'gear', boost });
export const TABLES = {
  skeleton:   { rolls: [0, 1], gold: [0, 6], entries: [GEAR(2), { w: 3, pool: 'junk' }, { w: 2, pool: 'ammo' }, { w: 1, def: 'bandage', qty: [1, 2] }] },
  skelArcher: { rolls: [1, 2], gold: [0, 8], entries: [{ w: 5, def: 'arrow', qty: [5, 14] }, { w: 2, def: 'arrowIron', qty: [3, 8] }, { w: 2, pool: 'junk' }, GEAR(1)] },
  ghoul:      { rolls: [0, 2], gold: [0, 10], entries: [{ w: 3, def: 'ghoulClaw', qty: [1, 2] }, { w: 2, pool: 'junk' }, { w: 2, pool: 'food' }, { w: 1, pool: 'potion' }, GEAR(1)] },
  wolf:       { rolls: [1, 2], gold: [0, 0], entries: [{ w: 5, def: 'wolfPelt', qty: [1, 1] }, { w: 3, def: 'cookedMeat', qty: [1, 2] }, { w: 1, def: 'bandage', qty: [1, 1] }] },
  orcRaider:  { rolls: [1, 3], gold: [8, 28], entries: [GEAR(4, 0.3), { w: 3, pool: 'potion' }, { w: 2, pool: 'food' }, { w: 2, pool: 'valuable' }, { w: 1, pool: 'tool' }] },
  bogBeast:   { rolls: [1, 2], gold: [4, 16], entries: [{ w: 4, def: 'bogMoss', qty: [2, 4] }, { w: 3, def: 'nightshade', qty: [1, 3] }, { w: 2, def: 'antidote', qty: [1, 2] }, { w: 2, pool: 'junk' }, GEAR(1, 0.2)] },
  wraith:     { rolls: [1, 2], gold: [6, 20], entries: [{ w: 4, def: 'wraithDust', qty: [1, 3] }, { w: 3, pool: 'scroll' }, { w: 2, pool: 'jewel', boost: 0.4 }, { w: 2, pool: 'potion' }, GEAR(1, 0.5)] },
  troll:      { rolls: [2, 3], gold: [20, 60], entries: [{ w: 4, def: 'trollHide', qty: [1, 2] }, GEAR(4, 0.6), { w: 2, pool: 'valuable' }, { w: 2, pool: 'potion' }, { w: 1, pool: 'scroll' }] },
  crypt:      { rolls: [2, 3], gold: [30, 80], entries: [GEAR(6, 0.9), { w: 2, pool: 'jewel', boost: 0.8 }, { w: 2, pool: 'scroll' }, { w: 2, pool: 'valuable' }, { w: 1, def: 'healthPotionL', qty: [1, 1] }] },
  king:       { rolls: [3, 4], gold: [150, 300], always: [{ pool: 'gear', rar: 3, p: 1 }, { pool: 'gear', rar: 4, p: 0.8 }, { def: 'healthPotionL', qty: [2, 3], p: 1 }], entries: [GEAR(4, 1.2), { w: 2, pool: 'jewel', boost: 1.2, minJewel: 2 }, { w: 2, pool: 'scroll' }, { w: 2, pool: 'valuable' }] },
  chest1:  { rolls: [2, 3], gold: [8, 30], entries: [GEAR(3), { w: 3, pool: 'potion' }, { w: 3, pool: 'food' }, { w: 2, pool: 'ammo' }, { w: 2, pool: 'junk' }, { w: 1, pool: 'tool' }, { w: 1, pool: 'scroll' }] },
  chest2:  { rolls: [2, 4], gold: [20, 70], entries: [GEAR(5), { w: 3, pool: 'potion' }, { w: 2, pool: 'valuable' }, { w: 2, pool: 'scroll' }, { w: 2, pool: 'ammo' }, { w: 1, pool: 'tool' }, { w: 1, pool: 'jewel' }] },
  chest3:  { rolls: [3, 4], gold: [50, 140], entries: [GEAR(6, 0.3), { w: 3, pool: 'potion' }, { w: 3, pool: 'valuable' }, { w: 2, pool: 'scroll' }, { w: 2, pool: 'jewel', boost: 0.4 }, { w: 1, pool: 'ammo' }] },
  supply:  { rolls: [3, 4], gold: [100, 250], tierBump: 1, always: [{ pool: 'gear', rar: 3, p: 1 }, { pool: 'gear', p: 0.7, boost: 1 }, { def: 'healthPotionL', qty: [1, 2], p: 1 }], entries: [GEAR(5, 1), { w: 2, pool: 'jewel', boost: 1, minJewel: 2 }, { w: 2, pool: 'scroll' }, { w: 2, def: 'manaPotionL', qty: [1, 2] }, { w: 1, pool: 'ammo' }] },
  rival:   { rolls: [0, 2], gold: [0, 15], entries: [{ w: 3, pool: 'potion' }, { w: 2, pool: 'food' }, { w: 2, pool: 'ammo' }, { w: 1, pool: 'scroll' }, { w: 1, pool: 'tool' }] },
  camp:    { rolls: [2, 3], gold: [15, 60], entries: [GEAR(4, 0.4), { w: 3, pool: 'potion' }, { w: 2, pool: 'valuable' }, { w: 2, pool: 'food' }, { w: 1, pool: 'scroll' }] },
  shrine:  { rolls: [1, 2], gold: [0, 20], entries: [{ w: 3, pool: 'scroll' }, { w: 3, pool: 'potion' }, { w: 2, pool: 'jewel', boost: 0.4 }] },
};
// aliases and locked variants (locked chests are one effective tier better and always hold a bit of gold)
TABLES.boss = TABLES.king; TABLES.draugr = TABLES.crypt; TABLES.cryptKnight = TABLES.crypt; TABLES.offering = TABLES.supply; TABLES.crate = TABLES.supply;
for (const t of [1, 2, 3]) TABLES[`chest${t}L`] = { ...TABLES[`chest${t}`], rolls: [TABLES[`chest${t}`].rolls[0] + 1, TABLES[`chest${t}`].rolls[1] + 1], tierBump: 0.8, gold: [TABLES[`chest${t}`].gold[0] * 2, TABLES[`chest${t}`].gold[1] * 2] };

export function rollLoot(tableId, rng, tier = 1) {
  const T = TABLES[tableId]; if (!T) return [];
  const tt = Math.max(1, Math.min(3, tier)) + (T.tierBump || 0), out = [];
  const make = (e, w) => {
    if (e.def) return makeItem(e.def, { qty: e.qty ? ri(rng, e.qty) : 1, rarity: e.rar ?? 0 }, rng);
    return genFromPool(e.pool, rng, tt, { boost: e.boost || 0, rar: e.rar, minJewel: e.minJewel });
  };
  for (const e of T.always || []) if (rng() < (e.p ?? 1)) out.push(make(e));
  const n = ri(rng, T.rolls), ws = T.entries.map((e) => e.w);
  for (let i = 0; i < n; i++) out.push(make(T.entries[wpick(ws, rng)]));
  if (T.gold && T.gold[1] > 0) { const g = ri(rng, T.gold); if (g > 0) out.push(makeItem('goldCoins', { qty: Math.round(g * (1 + 0.25 * (tier - 1))) }, rng)); }
  return merge(out);
}
// merge stackable duplicates
function merge(list) {
  const out = [];
  for (const it of list) { const e = it.stack && out.find((q) => q.stack && q.def === it.def && (q.keyId ?? null) === (it.keyId ?? null)); if (e) e.qty += it.qty; else out.push(it); }
  return out;
}

// ---- shops
export function shopStock(role, rng) {
  const S = [], add = (def, qty = 1, o = {}) => S.push(makeItem(def, { qty, ...o }, rng));
  const gen = (pool, tier, o) => S.push(genFromPool(pool, rng, tier, o));
  switch (role) {
    case 'smith':
      for (let i = 0; i < 4; i++) gen('weapon', 1.6, { rar: rng() < 0.7 ? 0 : 1, mat: 1 + Math.floor(rng() * 2) });
      for (let i = 0; i < 4; i++) gen('armor', 1.8, { rar: rng() < 0.7 ? 0 : 1, mat: 1 + Math.floor(rng() * 3) });
      gen('shield', 1.6, { rar: 0, mat: 1 + Math.floor(rng() * 2) });
      if (rng() < 0.5) gen('weapon', 2.5, { rar: 2, mat: 2 });
      add('arrow', 30); add('arrowIron', 15); add('bolt', 20); add('boltIron', 10); add('torch', 3); break;
    case 'alchemist':
      add('healthPotion', 6); add('healthPotionM', 4); add('healthPotionL', 2); add('staminaPotion', 4); add('staminaPotionM', 2); add('manaPotion', 4); add('manaPotionM', 2);
      add('antidote', 4); add('bandage', 8); add('resistPotion', 2);
      for (let i = 0; i < 3; i++) gen('scroll', 1); if (rng() < 0.6) gen('jewel', 2, { rar: 1 }); add('nightshade', 5); add('bogMoss', 5); break;
    case 'fence':
      add('lockpick', 12); for (let i = 0; i < 3; i++) gen('gear', 2, { rar: 2 + (rng() < 0.3 ? 1 : 0), mat: 1 + Math.floor(rng() * 3) });
      gen('scroll', 2); gen('jewel', 2, { rar: 2 }); add('arrowBarbed', 12); add('boltBarbed', 8); add('healthPotionM', 2); break;
    case 'inn':
      add('bread', 8); add('cookedMeat', 6); add('roastBoar', 3); add('stew', 6); add('ale', 10); add('bandage', 3); break;
    default: // general
      add('bread', 6); add('cookedMeat', 5); add('ale', 5); add('healthPotion', 5); add('bandage', 8); add('antidote', 2); add('torch', 4); add('lockpick', 5);
      add('arrow', 40); add('bolt', 25);
      for (let i = 0; i < 2; i++) gen('weapon', 1, { rar: 0, mat: Math.floor(rng() * 2) });
      gen('armor', 1, { rar: 0, mat: Math.floor(rng() * 2) }); gen('armor', 1, { rar: 0, mat: Math.floor(rng() * 2) });
  }
  return S;
}
