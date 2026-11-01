// FOGBOUND: HERO items. Catalogue, rarity/affixes, derived stats, inventory/equipment ops, containers, corpses.
// Data lives in items/{catalog,catalog2,affixes,uniques}.js; construction in items/make.js; stats in items/derived.js;
// loot tables + shops in items/loot.js; prices/upgrade/tooltips in items/econ.js. All re-exported from here.
//
// DERIVED STAT FORMULAS. AB = Skills.attrBonus({attrs: A}) (A = attribute + equipped bonus); M(k) = Skills.perkModsFrac(a)[k] (fractions); bonus.k = sum over equipped items.
//   maxHp      = (AB.maxHp [50+5*vit] + lvl*8 + bonus.hp) * (1 + M(hpPct))
//   maxStamina = (AB.maxStamina [60+4*dex] + lvl*2 + bonus.stamina) * (1 + M(staminaPct))
//   maxMana    = (AB.maxMana [20+2*int] + lvl*3 + bonus.mana) * (1 + M(manaPct))
//   armor %    = min(75, (sum item.armor (-5%/unmet attr point, max -50%) + bonus.armor) * (1 + M(armorPct)))   [damage absorbed; perk armorPct is resolved by Skills from item.armorClass]
//   res[t]     = clamp(sum item.res[t] + (t != physical ? bonus.resAll + 100*M(resAll) : 0) + raw perk res<Type>, -100, 80)   [percent]
//   carry      = AB.carry [40+3*str] + bonus.carry + perk.carryBonus; hardCap = carry*1.5 (cannot pick up beyond); weightMul 1 up to carry, then linearly to 0.4 at hardCap
//   moveSpeed  = 3.6 * (1 + bonus.moveSpeed + M(moveSpeedPct)) * (1 - min(.3, sum item.movePen * (1+heavyMovePenaltyPct/100))) * weightMul
//   dmgMul     = (1 + attrDmg) * (1 + bonus.dmgPct + M(dmgPct)) * max(.4, 1 - .04*unmet weapon req points); attrDmg = AB.meleeDmgPct/100 (melee), AB.bowDmgPct/100 (bows), 0 (staff)
//                NOT included (COMBAT must apply from Skills.perkMods(a), percent points): meleeDmgPct, bowDmgPct (skill part), staminaRegenPct (perk part)
//   spellMul   = 1 + AB.spellDmgPct/100 + bonus.spellDmgPct + M(spellDmgPct)
//   atkSpeed   = (1 + AB.attackSpeedPct/100 + bonus.atkSpeed + M(attackSpeedPct)) * max(.6, 1 - .02*unmet req points)   [multiplies weapon.speed]
//   critChance = min(.6, .05 + AB.critPct/100 + bonus.critPct + M(critPct)); critMul = 1.5 + M(critDmgPct)
//   staminaRegen = 14*(1 + AB.staminaRegenPct/100)*(1 - min(.5, sum item.stamPen)) + bonus.staminaRegen   [per s; perk staminaRegenPct applied by combat]
//   manaRegen = 2*(1 + AB.manaRegenPct/100 + M(manaRegenPct)) + bonus.manaRegen; hpRegen = AB.hpRegen*0.6*(1 + M(hpRegenPct)) + bonus.hpRegen; lifesteal = min(.5, bonus.lifesteal + M(lifesteal))
//   staminaCostMul = max(.3, 1 + M(staminaCostPct)) (signed: negative = cheaper; combat multiplies weapon.stam/block/dodge costs by it)
//   light = 2 + offhand.light (torch 12, lantern 18) + bonus.light      block = {absorb 0..0.95 (shield.block or weapon-based + M(blockEfficiency)), stamMul, shield, parryWindow}
//   weapon = {dmg:[min,max] raw item damage, speed, reach, stam, dtype, kind, twoHanded, poise, backstab, cleave, slayer, ranged?{draw (already /drawSpeed),projSpeed,range}, ammoKind}
//   Final melee hit = rand(weapon.dmg) * d.dmgMul * (1 + perkMods.meleeDmgPct/100) (* crit d.critMul ...). Ranged hit adds the loaded ammo's dmgAdd (see ammoFor/consumeAmmo).
// bonus keys: str dex int vit hp stamina mana armor moveSpeed dmgPct spellDmgPct critPct atkSpeed lifesteal hpRegen staminaRegen manaRegen light carry sneak resAll.
// Item uids are unique strings; stackable items (item.stack) merge by def (+keyId). Gold lives in a.gold; items of kind 'gold' convert to a.gold on pickup.
import { SLOTS } from './consts.js';
import { derived, weightOf, perkModsSafe, deficitOf } from './items/derived.js';
import { ITEMS } from './items/catalog.js';
import './items/catalog2.js';
import { makeItem, cloneItem, RARITIES, newUid } from './items/make.js';
import { UNIQUES, UNIQUE_IDS } from './items/uniques.js';
import * as Combat from './combat.js';

export { ITEMS, RARITIES, UNIQUES, UNIQUE_IDS, makeItem, derived, weightOf, deficitOf };
export * from './items/loot.js';
export * from './items/econ.js';

const say = (st, a, text) => { if (st && st.events) st.events.push({ type: 'msg', actor: a.id, text }); };
const TWO_H = (it) => !!(it && it.twoHanded);
export const findItem = (a, uid) => a.inv.find((q) => q.uid === uid) || SLOTS.map((s) => a.equip[s]).find((q) => q && q.uid === uid) || null;
export const countItem = (a, defOrKind) => a.inv.reduce((n, q) => (q.def === defOrKind || q.baseId === defOrKind || q.kind === defOrKind ? n + q.qty : n), 0);
export function canCarry(a, item) { const d = a.d || derived(a); return weightOf(a) + (item.weight || 0) * (item.qty || 1) <= d.hardCap; }
const same = (x, y) => x.def === y.def && x.stack && y.stack && (x.keyId ?? null) === (y.keyId ?? null);

export function addToInventory(a, item) {
  if (!item) return false;
  if (item.kind === 'gold') { a.gold = (a.gold || 0) + item.qty; return true; }
  if (!canCarry(a, item)) return false;
  if (item.stack) { const e = a.inv.find((q) => same(q, item)); if (e) { e.qty += item.qty; return true; } }
  a.inv.push(item); return true;
}
function scrubQuick(a) { for (let i = 0; i < a.quick.length; i++) { const q = a.quick[i]; if (q && typeof q === 'string' && !q.startsWith('spell:') && !findItem(a, q)) a.quick[i] = null; } }
export function removeFromInventory(a, uid, qty = 1) {
  const i = a.inv.findIndex((q) => q.uid === uid); if (i < 0) return null;
  const it = a.inv[i]; qty = Math.max(1, Math.round(qty));
  if (it.stack && it.qty > qty) { it.qty -= qty; return cloneItem(it, qty); }
  a.inv.splice(i, 1); scrubQuick(a); return it;
}
// ---- equipment
export function equip(a, uid) {
  const it = a.inv.find((q) => q.uid === uid); if (!it) return { ok: false, reason: 'not in inventory' };
  if (!it.slot) return { ok: false, reason: 'cannot be equipped' };
  const slot = it.slot, freed = [];
  const free = (s) => { const o = a.equip[s]; if (o) { a.equip[s] = null; a.inv.push(o); freed.push(o.name); } };
  if (slot === 'offhand' && TWO_H(a.equip.weapon)) free('weapon');          // shield/torch replaces a two-hander or bow
  if (slot === 'weapon' && TWO_H(it)) free('offhand');                       // two-hander/bow occupies the offhand
  free(slot);
  a.inv.splice(a.inv.indexOf(it), 1); a.equip[slot] = it;
  const df = deficitOf(a, it); const warn = df.deficit ? df.miss.map((m) => `${m.attr.toUpperCase()} ${m.need}`).join(', ') : null;
  return { ok: true, swapped: freed, penalty: warn ? { deficit: df.deficit, miss: df.miss } : null, reason: warn ? 'requires ' + warn : undefined };
}
export function unequip(a, slot) {
  const it = a.equip[slot]; if (!it) return { ok: false, reason: 'empty' };
  a.equip[slot] = null; a.inv.push(it); return { ok: true, item: it };
}
// ---- ammo for bows/crossbows: best-damage matching stack first
export function ammoFor(a) {
  const w = a.equip.weapon; if (!w || !w.ammoKind) return null;
  let best = null; for (const q of a.inv) if (q.ammoKind === w.ammoKind && q.qty > 0 && (!best || (q.dmgAdd || 0) > (best.dmgAdd || 0))) best = q;
  return best;
}
export function ammoCount(a) { const w = a.equip.weapon; return w && w.ammoKind ? a.inv.reduce((n, q) => (q.ammoKind === w.ammoKind ? n + q.qty : n), 0) : 0; }
// remove one projectile; returns {def, dmgAdd, dtype|null} or null when out of ammo
export function consumeAmmo(a) {
  const am = ammoFor(a); if (!am) return null;
  const r = { def: am.def, name: am.name, dmgAdd: am.dmgAdd || 0, dtype: am.dtype || null };
  am.qty--; if (am.qty <= 0) { a.inv.splice(a.inv.indexOf(am), 1); scrubQuick(a); }
  return r;
}
// ---- using items
export function useItem(st, a, uid) {
  const it = a.inv.find((q) => q.uid === uid); if (!it) return { ok: false, reason: 'missing' };
  const hot = (h) => { try { if (Combat.addStatus) Combat.addStatus(a, 'regen', h.dur, h.hp); } catch (e) { /* ignore */ } };
  const d = a.d || derived(a), pot = 1 + (+perkModsSafe(a).potionPct || 0) / 100;
  if (it.slot) { const r = equip(a, uid); if (r.ok) say(st, a, `Equipped ${it.name}.`); return r; }
  switch (it.kind) {
    case 'potion': case 'food': {
      if (a.useCd && st && st.t < a.useCd) return { ok: false, reason: 'too fast' };
      const maxMana = a.maxMana || d.maxMana, maxSt = a.maxStamina || d.maxStamina;
      if (it.heal) a.hp = Math.min(a.maxHp || d.maxHp, a.hp + it.heal * pot);
      if (it.stamina) a.stamina = Math.min(maxSt, a.stamina + it.stamina * pot);
      if (it.mana) a.mana = Math.min(maxMana, a.mana + it.mana * pot);
      if (it.hot) hot(it.hot);
      if (it.cure) a.status = a.status.filter((s) => !it.cure.includes(s.id));
      if (it.buff) { try { Combat.addStatus(a, it.buff.id, it.buff.dur, it.buff.power || 1); } catch (e) { /* ignore */ } }
      a.useCd = (st ? st.t : 0) + 0.7; removeFromInventory(a, uid, 1);
      return { ok: true };
    }
    case 'torch': return equip(a, uid);
    case 'scroll': {
      const sp = Combat.SPELLS && Combat.SPELLS[it.spell], m0 = a.mana;
      if (!sp) { say(st, a, 'The words will not take.'); return { ok: false, reason: 'unknown spell' }; }
      a.mana = Math.max(a.mana, sp.mana || 0);
      const aim = { x: a.x + Math.cos(a.yaw) * 8, z: a.z + Math.sin(a.yaw) * 8, yaw: a.yaw, pitch: a.pitch || 0, scroll: true };
      let ok = false; try { ok = !!Combat.castSpell(st, a, it.spell, aim); } catch (e) { ok = false; }
      a.mana = ok ? Math.min(m0, a.mana) : m0;
      if (ok) { removeFromInventory(a, uid, 1); return { ok: true }; }
      say(st, a, 'The scroll fizzles.'); return { ok: false, reason: 'cast failed' };
    }
    case 'key': say(st, a, 'Use it on the lock it fits.'); return { ok: false, reason: 'key' };
    case 'lockpick': say(st, a, 'Walk up to a locked chest and interact.'); return { ok: false, reason: 'lockpick' };
    default: return { ok: false, reason: 'cannot use' };
  }
}
// quick slot helpers: quick[i] is an item uid, 'spell:<id>' or null. Returns true when an item was used (spells are Combat's job).
export function setQuick(a, slot, uid) { if (slot >= 0 && slot < a.quick.length) a.quick[slot] = uid && (typeof uid === 'string') ? uid : null; }
export function useQuick(st, a, slot) {
  const q = a.quick[slot]; if (!q || q.startsWith('spell:')) return false;
  const it = findItem(a, q); if (!it) { a.quick[slot] = null; return false; }
  if (a.equip[it.slot] === it) return false;
  const r = useItem(st, a, q); return !!r.ok;
}
// ---- ground and containers
export function dropFromInventory(st, a, uid, qty = 1) {
  let it = removeFromInventory(a, uid, qty);
  if (!it) { const s = SLOTS.find((k) => a.equip[k] && a.equip[k].uid === uid); if (!s) return null; it = a.equip[s]; a.equip[s] = null; }
  if (it.kind === 'gold') { a.gold += it.qty; return null; }
  const ang = st.rng() * Math.PI * 2, r = 0.6 + st.rng() * 0.6;
  const g = { id: st.nextId++, x: a.x + Math.cos(ang) * r, z: a.z + Math.sin(ang) * r, item: it, born: st.t };
  st.groundItems.push(g); return g;
}
export function takeFromContainer(st, a, cid, uid) {
  const c = st.containers.find((q) => q.id === cid); if (!c || c.removed || c.locked) return false;
  const i = c.items.findIndex((q) => q.uid === uid); if (i < 0) return false;
  const it = c.items[i];
  if (!addToInventory(a, it)) { say(st, a, 'You cannot carry any more.'); return false; }
  c.items.splice(i, 1);
  if (st && st.events) st.events.push({ type: 'pickup', actor: a.id, name: it.kind === 'gold' ? it.qty + ' gold' : it.name, rarity: it.rarity, x: c.x, z: c.z });
  if (!c.items.length && c.kind === 'corpse') c.removed = true;
  return true;
}
export function takeAllFromContainer(st, a, cid) {
  const c = st.containers.find((q) => q.id === cid); if (!c) return 0;
  let n = 0; for (const it of c.items.slice()) if (takeFromContainer(st, a, cid, it.uid)) n++;
  return n;
}
// unlock: a matching key (consumed) or a lockpick (consumed each attempt, success chance from tier, DEX and perk lockpick). Deterministic per container.
export function tryUnlock(a, c) {
  if (!c.locked) return true;
  const key = c.keyId != null ? a.inv.find((q) => q.kind === 'key' && q.keyId === c.keyId) : null;
  if (key) { removeFromInventory(a, key.uid, 1); c.locked = false; return true; }
  if (c.keyId != null && !c.pickable && c.keyOnly) return false;
  const pick = a.inv.find((q) => q.kind === 'lockpick'); if (!pick) return false;
  const chance = Math.max(0.05, Math.min(0.95, 0.7 - 0.15 * ((c.tier || 1) - 1) + a.attrs.dex * 0.004 + (+perkModsSafe(a).lockpick || 0)));
  c.tries = (c.tries || 0) + 1;
  let h = (c.id * 2654435761 + c.tries * 40503 + (a.id || 0) * 97) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  const roll = (h >>> 0) / 4294967296;
  removeFromInventory(a, pick.uid, 1);
  if (roll < chance) { c.locked = false; return true; }
  return false;
}
// ---- corpses: the dead actor's gear + inventory + gold + a roll on its loot table
export function dropCorpse(st, a) {
  const items = [];
  for (const s of SLOTS) if (a.equip[s]) { items.push(a.equip[s]); a.equip[s] = null; }
  items.push(...a.inv); a.inv = [];
  if (a.gold > 0 && (a.kind === 'player' || a.kind === 'rival')) { items.push(makeItem('goldCoins', { qty: Math.round(a.gold) })); a.gold = 0; }
  const tier = Math.max(1, Math.min(3, 1 + Math.floor((a.lvl || 1) / 6)));
  const table = a.loot || (a.kind === 'rival' || a.kind === 'player' ? 'rival' : null);
  if (table) items.push(...Loot.rollLoot(table, st.rng, tier));
  const c = { id: st.nextId++, x: a.x, z: a.z, kind: 'corpse', tier, locked: false, items, opened: false, name: a.name, removed: !items.length, born: st.t };
  st.containers.push(c);
  if (st.containers.length > 300) { for (let i = st.containers.length - 1; i >= 0 && st.containers.length > 260; i--) if (st.containers[i].removed) st.containers.splice(i, 1); }
  return c;
}
import * as Loot from './items/loot.js';
export * from './items/kits.js';
