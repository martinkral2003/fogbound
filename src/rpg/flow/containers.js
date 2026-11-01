// FLOW: chests, ruin caches, shrines and ground pickups scattered over the island.
import * as Items from '../items.js';
import { TAU } from '../../util.js';
import { getNav } from './nav.js';

// safe item creation: the Items agent may not define every id yet
export function mk(st, defId, opts = {}) {
  try { if (Items.ITEMS && !Items.ITEMS[defId]) return null; return Items.makeItem(defId, opts, st.rng); } catch (e) { return null; }
}
function defsWhere(fn) { const out = []; for (const k of Object.keys(Items.ITEMS || {})) { try { if (fn(Items.ITEMS[k], k)) out.push(k); } catch (e) { /* ignore */ } } return out; }
export function pick(st, arr) { return arr.length ? arr[Math.floor(st.rng() * arr.length)] : null; }

// random walkable point on the main land mass between radii (from the island centre), away from a list of points
export function landPoint(st, rMin, rMax, avoid = [], minDist = 12) {
  const nav = getNav(st);
  for (let t = 0; t < 80; t++) {
    const a = st.rng() * TAU, r = rMin + st.rng() * (rMax - rMin), x = Math.cos(a) * r, z = Math.sin(a) * r;
    const i = Math.floor((x + 200) / 4), j = Math.floor((z + 200) / 4);
    if (i < 0 || j < 0 || i > 99 || j > 99) continue;
    const k = j * 100 + i; if (!nav.open[k] || nav.comp[k] !== nav.main) continue;
    if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < minDist)) continue;
    return { x, z };
  }
  return null;
}

export function addContainer(st, o) {
  const c = { id: st.nextId++, x: o.x, z: o.z, kind: o.kind || 'chest', tier: o.tier || 1, locked: !!o.locked, keyId: o.keyId, items: o.items || [], opened: false, name: o.name || 'Chest', ...(o.extra || {}) };
  st.containers.push(c); return c;
}

function chestLoot(st, tier) {
  let items = [];
  try { items = Items.rollLoot('chest', st.rng, tier) || []; } catch (e) { items = []; }
  if (!items.length) { const p = mk(st, 'healthPotion', { qty: 1 }); if (p) items.push(p); }
  return items;
}

// guaranteed-ish gear so heroes can kit up before the fog and the duels
const WKINDS = ['sword', 'axe', 'mace', 'dagger', 'spear', 'twohand', 'bow', 'staff', 'sword', 'axe'];
const ARM = [['leather', 'studded'], ['studded', 'mail'], ['mail', 'plate', 'dark']];
const ASLOTS = ['head', 'chest', 'legs', 'boots', 'hands'];
function gearFor(st, tier) {
  const out = [], t = Math.max(1, Math.min(3, tier));
  if (st.rng() < 0.55) {
    const k = pick(st, WKINDS), lvl = Math.min(4, t + (st.rng() < 0.4 ? 1 : 0));
    const w = mk(st, k + '_' + lvl, { rarity: st.rng() < 0.2 * t ? 1 + Math.floor(st.rng() * 2) : 0 }); if (w) out.push(w);
    if (k === 'bow') { const ar = mk(st, 'arrow', { qty: 25 }); if (ar) out.push(ar); }
  }
  for (let i = 0; i < (t >= 2 ? 2 : 1); i++) if (st.rng() < 0.6) { const m = pick(st, ARM[t - 1]), sl = pick(st, ASLOTS); const it = mk(st, sl + '_' + m, {}); if (it) out.push(it); }
  if (st.rng() < 0.2) { const sh = mk(st, 'shield_' + Math.min(3, t), {}); if (sh) out.push(sh); }
  const pot = mk(st, 'healthPotion', { qty: 1 + Math.floor(st.rng() * 2) }); if (pot && st.rng() < 0.6) out.push(pot);
  return out;
}
const REGION_NAME = ['Weathered Chest', 'Old Chest', 'Iron-bound Chest', 'Gilded Coffer'];

export function populateContainers(st) {
  const w = st.world, f = w.features, placed = [];
  const chests = [];
  const make = (x, z, tier, o = {}) => {
    const locked = o.locked ?? st.rng() < 0.25;
    const c = addContainer(st, { x, z, tier, locked, name: o.name || REGION_NAME[Math.min(3, tier - 1)], items: chestLoot(st, tier).concat(gearFor(st, tier)) });
    if (locked && st.rng() < 0.5) c.keyId = 'key' + c.id;
    placed.push(c); chests.push(c); return c;
  };
  for (const c of f.chests) make(c.x, c.z, Math.min(3, c.tier), {});
  // ruined strongholds (hearts 1..3): loot piles, hearts[0] is the settlement
  for (let hi = 1; hi < w.hearts.length; hi++) {
    const h = w.hearts[hi];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + st.rng() * 0.5, r = 6 + st.rng() * 14, x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
      if (!w.walkable(x, z)) continue;
      make(x, z, 3, { name: k % 3 === 0 ? 'Ruined Cache' : 'Cracked Coffer', locked: st.rng() < 0.3 });
    }
  }
  // ~50 scattered chests: coast tier 1, inland tier 2, near camps tier 3
  const camps = f.camps;
  for (let n = 0; n < 50; n++) {
    const p = landPoint(st, 10, 195, placed, 14); if (!p) continue;
    const r = Math.hypot(p.x, p.z), nearCamp = camps.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 22);
    if (w.hearts.length && Math.hypot(w.hearts[0].x - p.x, w.hearts[0].z - p.z) < 35) continue; // keep the settlement tidy
    make(p.x, p.z, nearCamp ? 3 : r > 150 ? 1 : 2);
  }
  // keys + lockpicks hidden in unlocked chests of equal or lower tier
  const free = chests.filter((c) => !c.locked);
  for (const c of chests) {
    if (!c.keyId) continue;
    const host = pick(st, free.filter((q) => q.tier <= c.tier && q !== c)) || pick(st, free);
    const key = mk(st, 'key', {}); if (key && host) { key.keyId = c.keyId; key.name = 'Key (' + c.name + ')'; host.items.push(key); } else c.keyId = undefined;
  }
  for (let n = 0; n < 16 && free.length; n++) { const lp = mk(st, 'lockpick', { qty: 1 + Math.floor(st.rng() * 2) }); if (lp) pick(st, free).items.push(lp); }
  st.flow.chests = chests.length;
}

// shrines: kind heal / might / swift (features.shrines); effect applied in flow afterStep when a hero opens one
const SHRINE = { heal: 'Shrine of Mending', might: 'Shrine of Might', swift: 'Shrine of the Hunt' };
export function populateShrines(st) {
  for (const s of st.world.features.shrines) addContainer(st, { x: s.x, z: s.z, kind: 'shrine', tier: 1, name: SHRINE[s.kind] || 'Shrine', items: [], extra: { effect: s.kind, readyAt: 0 } });
}

// herbs, spare weapons and arrows lying around
export function populatePickups(st) {
  const herbs = defsWhere((d, k) => /herb|mushroom|root|berry/i.test(k)), weapons = defsWhere((d) => d.slot === 'weapon'), ammo = defsWhere((d) => d.kind === 'arrow' || d.kind === 'bolt'), pots = defsWhere((d) => d.kind === 'potion' || d.kind === 'food');
  const pool = [[herbs, 14], [weapons, 10], [ammo, 12], [pots, 8]];
  const placed = [];
  for (const [defs, n] of pool) {
    if (!defs.length) continue;
    for (let i = 0; i < n; i++) {
      const p = landPoint(st, 12, 200, placed, 8); if (!p) continue; placed.push(p);
      const it = mk(st, pick(st, defs), { qty: 1 + Math.floor(st.rng() * 4), rarity: st.rng() < 0.15 ? 1 : 0, tier: 1 }); if (!it) continue;
      if (!it.stack && it.qty > 1) it.qty = 1;
      st.groundItems.push({ id: st.nextId++, x: p.x, z: p.z, item: it, born: 0 });
    }
  }
}
