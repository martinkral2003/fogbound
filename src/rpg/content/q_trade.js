// Trading: finite stock that restocks over time, shop gold budgets, buy-back of sold items. Prices come from Items.buyPrice/sellValue (per unit)
// modified by Skills.perkMods(a).tradePct (fraction, or percent if > 1) and the player's reputation. Shop roles: smith alchemist inn fence general.
import { emit } from '../core.js';
import * as Items from '../items.js';
import * as Skills from '../skills.js';
import { rec, mkItem, mkUid, npcById } from './qutil.js';

const RESTOCK = 240;           // seconds between restocks
const BUYBACK_MAX = 16;
const ACCEPT = {
  smith: (it) => !!it.slot || /sword|axe|mace|dagger|spear|twohand|bow|crossbow|staff|shield|ammo|arrow|bolt/.test(it.kind || ''),
  alchemist: (it) => /potion|scroll|food|misc|herb|reagent/.test(it.kind || '') || !!it.spell,
  inn: (it) => /food|potion/.test(it.kind || ''),
  fence: () => true, general: () => true,
};

function fallbackStock(st, role) {
  const mk = (d, q) => mkItem(st, d, { qty: q });
  if (role === 'alchemist') return [mk('healthPotion', 6), mk('manaPotion', 4)];
  if (role === 'inn') return [mk('bread', 8), mk('healthPotion', 2)];
  if (role === 'fence') return [mk('lockpick', 6), mk('healthPotion', 2)];
  return [mk('healthPotion', 3)];
}
function rollStock(st, role) {
  let list = null;
  try { if (typeof Items.shopStock === 'function') list = Items.shopStock(role, st.rng); } catch (e) { list = null; }
  return (list && list.length ? list : fallbackStock(st, role)).filter(Boolean);
}

export function shopOf(st, npc) {
  const key = npc.npcId;
  if (!st.quests.shops[key]) {
    const cap = npc.shopGold || 400;
    st.quests.shops[key] = { key, role: npc.role, stock: rollStock(st, npc.role), gold: cap, cap, next: st.t + RESTOCK, bought: 0 };
  }
  return st.quests.shops[key];
}

export function restock(st) {
  for (const key of Object.keys(st.quests.shops)) {
    const s = st.quests.shops[key];
    if (st.t < s.next) continue;
    s.next = st.t + RESTOCK;
    const fresh = rollStock(st, s.role);
    // keep a few resold items; replace the rest with fresh stock (finite: stock empties as the player buys)
    const resold = s.stock.filter((e) => e.resold).slice(-4);
    s.stock = [...fresh, ...resold];
    s.gold = Math.min(s.cap, s.gold + Math.round(s.cap * 0.5));
  }
}

const frac = (v) => (Math.abs(v) > 1.5 ? v / 100 : v);
export function priceMods(st, a) {
  let tp = 0;
  try { tp = frac((Skills.perkMods(a) || {}).tradePct || 0); } catch (e) { tp = 0; }
  const rp = Math.min(0.1, rec(st, a.id).rep * 0.004);
  return { buy: Math.max(0.5, (1 - tp) * (1 - rp)), sell: Math.min(1.8, (1 + tp) * (1 + rp)) };
}
export function isHostile(st, a) { return !!(a.hostile || a.hostileFlag || (a.combatUntil || 0) > st.t); }
const unitBuy = (it, npc) => Math.max(1, Math.round(Items.buyPrice(it, npc)));
const unitSell = (it, npc) => Math.max(0, Math.round(Items.sellValue(it, npc)));

const resolve = (st, id) => (typeof id === 'number' ? st.byId.get(id) : npcById(st, id));

export function tradeList(st, npcId, a) {
  const npc = resolve(st, npcId); if (!npc || !npc.role) return { stock: [], buys: false };
  const pl = a || st.player, m = priceMods(st, pl), shop = shopOf(st, npc);
  return {
    npc: npc.name, npcId: npc.id, role: npc.role, buys: true, gold: shop.gold, hostile: isHostile(st, pl), nextRestock: Math.max(0, Math.round(shop.next - st.t)),
    stock: shop.stock.map((it) => ({ item: it, price: Math.max(1, Math.round(unitBuy(it, npc) * m.buy)), qty: it.qty || 1, resold: !!it.resold })),
  };
}
export function sellPrice(st, a, npcId, item) {
  const npc = resolve(st, npcId); if (!npc) return 0;
  return Math.round(unitSell(item, npc) * priceMods(st, a).sell);
}
export function canSell(st, npcId, item) {
  const npc = resolve(st, npcId); if (!npc || !npc.role) return false;
  return !item.questItem && (ACCEPT[npc.role] || ACCEPT.general)(item);
}

const say = (st, a, t) => emit(st, { type: 'msg', actor: a.id, text: t });

export function tradeBuy(st, a, npcId, uid, qty = 1) {
  const npc = resolve(st, npcId); if (!npc || !npc.role || !npc.alive) return false;
  if (Math.hypot(npc.x - a.x, npc.z - a.z) > 7) { say(st, a, 'You are too far away to trade.'); return false; }
  if (isHostile(st, a)) { say(st, a, npc.name + ' refuses to deal with a brawler.'); return false; }
  const shop = shopOf(st, npc), i = shop.stock.findIndex((e) => e.uid === uid);
  if (i < 0) return false;
  const it = shop.stock[i], have = it.qty || 1, n = Math.max(1, Math.min(qty | 0 || 1, have));
  const cost = Math.max(1, Math.round(unitBuy(it, npc) * priceMods(st, a).buy)) * n;
  if (a.gold < cost) { say(st, a, 'Not enough gold (' + cost + ' needed).'); return false; }
  let given;
  if (n < have) { it.qty = have - n; given = { ...it, uid: mkUid(), qty: n, resold: undefined }; } else { shop.stock.splice(i, 1); given = it; delete given.resold; }
  if (Items.addToInventory(a, given) === false) { // could not carry it: undo
    if (n < have) it.qty = have; else shop.stock.splice(i, 0, it);
    say(st, a, 'You cannot carry that.'); return false;
  }
  a.gold -= cost; shop.gold += cost; shop.bought += n;
  emit(st, { type: 'trade', actor: a.id, npc: npc.id, dir: 'buy', name: given.name, qty: n, gold: cost });
  say(st, a, 'Bought ' + (n > 1 ? n + ' x ' : '') + given.name + ' for ' + cost + ' gold.');
  return true;
}

export function tradeSell(st, a, npcId, uid, qty = 1) {
  const npc = resolve(st, npcId); if (!npc || !npc.role || !npc.alive) return false;
  if (Math.hypot(npc.x - a.x, npc.z - a.z) > 7) { say(st, a, 'You are too far away to trade.'); return false; }
  if (isHostile(st, a)) { say(st, a, npc.name + ' refuses to deal with a brawler.'); return false; }
  const it = a.inv.find((q) => q.uid === uid);
  if (!it) return false; // equipped gear must be unequipped first
  if (it.questItem) { say(st, a, npc.name + ': "That is not yours to sell."'); return false; }
  if (!canSell(st, npc.id, it)) { say(st, a, npc.name + ': "I do not deal in that."'); return false; }
  const shop = shopOf(st, npc), have = it.qty || 1, n = Math.max(1, Math.min(qty | 0 || 1, have));
  const gain = Math.round(unitSell(it, npc) * priceMods(st, a).sell) * n;
  if (shop.gold < gain) { say(st, a, npc.name + ': "I cannot afford that today."'); return false; }
  const taken = Items.removeFromInventory(a, uid, n); if (!taken) return false;
  a.gold += gain; shop.gold -= gain;
  const stock = { ...taken, resold: true, qty: taken.qty || n };
  if (stock.stack) { const e = shop.stock.find((q) => q.def === stock.def && q.stack && q.resold); if (e) e.qty += stock.qty; else shop.stock.push(stock); } else shop.stock.push(stock);
  const rs = shop.stock.filter((e) => e.resold); if (rs.length > BUYBACK_MAX) shop.stock.splice(shop.stock.indexOf(rs[0]), 1);
  emit(st, { type: 'trade', actor: a.id, npc: npc.id, dir: 'sell', name: taken.name, qty: n, gold: gain });
  say(st, a, 'Sold ' + (n > 1 ? n + ' x ' : '') + taken.name + ' for ' + gain + ' gold.');
  return true;
}
