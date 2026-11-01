// TRADE window (st.dialogue.trade): merchant stock (buy) next to your inventory (sell), haggling info, optional Training tab (st.dialogue.trainer).
import * as Items from '../items.js';
import * as Quests from '../quests.js';
import * as Skills from '../skills.js';
import { h, clear, num, rarityColor, glyphOf, itemName, statBrief, createTip, promptQty } from './itemui.js';

let canSellFn = null;
import('../content/q_trade.js').then((m) => { canSellFn = m.canSell || null; }).catch(() => {});

export function createTradePanel(ctx) {
  const S = { open: false, npcId: 0, tab: 'trade', sig: '' };
  const tip = createTip(ctx.root);
  const titleEl = h('h2'), subEl = h('span', { class: 'rpg-iw-hint' }), tabsEl = h('div', { class: 'rpg-tabs rpg-tr-tabs' });
  const buyEl = h('div', { class: 'rpg-il-scroll rpg-tr-list' }), sellEl = h('div', { class: 'rpg-il-scroll rpg-tr-list' }), trainEl = h('div', { class: 'rpg-il-scroll rpg-tr-list rpg-hidden' });
  const buyHead = h('div', { class: 'rpg-sub' }), sellHead = h('div', { class: 'rpg-sub' }), infoEl = h('div', { class: 'rpg-tr-info' });
  const youGold = h('b', { class: 'rpg-gold' }), merGold = h('b', { class: 'rpg-gold' });
  const el = h('div', { class: 'rpg-iw rpg-modal rpg-gothic rpg-trade rpg-hidden' },
    h('div', { class: 'rpg-iw-head' }, titleEl, subEl, h('span', { class: 'rpg-tr-gold' }, 'You ', h('span', { class: 'rpg-coin' }), youGold), h('span', { class: 'rpg-tr-gold' }, 'Merchant ', h('span', { class: 'rpg-coin' }), merGold),
      h('button', { class: 'rpg-x', text: '×', title: 'Close (Esc)', on: { click: () => (ctx.ui && ctx.ui.close ? ctx.ui.close('trade') : close()) } })),
    infoEl, tabsEl,
    h('div', { class: 'rpg-iw-body rpg-tr-body' }, h('div', { class: 'rpg-tr-col' }, buyHead, buyEl), h('div', { class: 'rpg-tr-col' }, sellHead, sellEl), trainEl));
  ctx.root.appendChild(el);
  const P = () => ctx.player(), st = () => ctx.st();
  const npc = () => st().byId && st().byId.get(S.npcId);
  const list = () => { try { return Quests.tradeList(st(), S.npcId) || { stock: [] }; } catch (e) { return { stock: [] }; } };
  const sellPrice = (a, it) => { try { if (Quests.tradeSellPrice) return Quests.tradeSellPrice(st(), a, S.npcId, it); } catch (e) { /* fall through */ } return Items.sellValue ? Items.sellValue(it, npc()) : Math.round((it.value || 1) * 0.4); };
  const wanted = (it) => { try { return canSellFn ? canSellFn(st(), S.npcId, it) : true; } catch (e) { return true; } };

  function buy(e) {
    const a = P(), it = e.item, have = it.qty || 1, afford = Math.floor((a.gold || 0) / Math.max(1, e.price)), max = Math.min(have, afford);
    if (afford < 1) { ctx.toast('Not enough gold (' + num(e.price) + ' needed).', 'warn'); return; }
    if (have > 1 && max > 1) promptQty(ctx.root, 'Buy ' + it.name + ' @ ' + num(e.price) + ' g', max, 'Buy', (q) => ctx.cmd({ t: 'buy', npc: S.npcId, uid: it.uid, qty: q }));
    else ctx.cmd({ t: 'buy', npc: S.npcId, uid: it.uid, qty: 1 });
  }
  function sell(it, price) {
    const have = it.qty || 1;
    if (have > 1) promptQty(ctx.root, 'Sell ' + it.name + ' @ ' + num(price) + ' g', have, 'Sell', (q) => ctx.cmd({ t: 'sell', uid: it.uid, npc: S.npcId, qty: q }));
    else ctx.cmd({ t: 'sell', uid: it.uid, npc: S.npcId, qty: 1 });
  }
  function row(it, price, label, dis, onGo, note) {
    const r = h('div', { class: 'rpg-row' + (dis ? ' rpg-faded' : '') }, h('span', { class: 'rpg-ico', text: glyphOf(it), style: 'color:' + rarityColor(it) }),
      h('span', { class: 'rpg-c-name' }, h('span', { class: 'rpg-nm', style: 'color:' + rarityColor(it), text: itemName(it) + ((it.qty || 1) > 1 ? '  ×' + it.qty : '') }), h('small', { text: note || statBrief(it) })),
      h('span', { class: 'rpg-c-n ' + (dis === 'poor' ? 'rpg-poor' : 'rpg-gold'), text: num(price) }),
      h('button', { class: 'rpg-btn', text: label, disabled: dis === 'blocked' ? true : null, on: { click: (ev) => { ev.stopPropagation(); onGo(); } } }));
    r.addEventListener('dblclick', onGo);
    r.addEventListener('mouseenter', (e) => tip.show(P(), it, e)); r.addEventListener('mousemove', (e) => tip.move(e)); r.addEventListener('mouseleave', () => tip.hide());
    return r;
  }
  function renderTrade(a) {
    const L = list(), stock = L.stock || [];
    clear(buyEl); clear(sellEl);
    buyHead.textContent = 'For sale (' + stock.length + ')'; sellHead.textContent = 'Your goods — sell';
    if (!stock.length) buyEl.append(h('div', { class: 'rpg-empty', text: 'Sold out.' }));
    for (const e of stock) { const poor = (a.gold || 0) < e.price; buyEl.append(row(e.item, e.price, 'Buy', poor ? 'poor' : '', () => buy(e), e.resold ? 'sold back to the merchant' : null)); }
    const mine = a.inv.filter((it) => it.kind !== 'gold'); let n = 0;
    const val = (it) => (wanted(it) && !it.questItem ? 1e6 : 0) + sellPrice(a, it) * (it.qty || 1);
    for (const it of mine.slice().sort((p, q) => val(q) - val(p))) {
      const w = wanted(it), p = sellPrice(a, it); n++;
      sellEl.append(row(it, p, 'Sell', w && !it.questItem ? '' : 'blocked', () => sell(it, p), w ? (it.qty > 1 ? 'each ' + num(p) + ' g' : statBrief(it)) : 'the merchant does not buy this'));
    }
    if (!n) sellEl.append(h('div', { class: 'rpg-empty', text: 'Nothing to sell.' }));
    merGold.textContent = L.gold != null ? num(L.gold) : '—'; merGold.parentNode.classList.toggle('rpg-hidden', L.gold == null);
    clear(infoEl);
    const f = stock.find((e) => Items.buyPrice && e.item.value); let b = 1;
    if (f) try { b = f.price / Math.max(1, Items.buyPrice(f.item, npc())); } catch (e) { b = 1; }
    const sm = mine.find((it) => (it.value || 0) > 4); let s = 1;
    if (sm) try { s = sellPrice(a, sm) / Math.max(1, Items.sellValue(sm, npc())); } catch (e) { s = 1; }
    const pct = (v) => (v >= 1 ? '+' : '−') + Math.abs(Math.round((v - 1) * 100)) + '%';
    infoEl.append(h('span', { text: 'Haggling: buying ' + pct(b) + ', selling ' + pct(s) + ' vs. base prices' }));
    if (L.nextRestock != null) infoEl.append(h('span', { text: 'Restock in ' + Math.floor(L.nextRestock / 60) + 'm ' + (L.nextRestock % 60) + 's' }));
    if (L.hostile) infoEl.append(h('span', { class: 'rpg-poor', text: 'The merchant will not deal with a brawler.' }));
    const m = npc(); titleEl.textContent = (L.npc || (m && m.name) || 'Merchant'); subEl.textContent = (m && m.title) || L.role || '';
  }
  function renderTrain(a) {
    clear(trainEl);
    const d = st().dialogue, role = Skills.npcRole ? Skills.npcRole(npc()) : null;
    const offers = (Skills.trainerOffers && role ? Skills.trainerOffers(role, a) : (d && d.offers) || []);
    trainEl.append(h('div', { class: 'rpg-sub', text: 'Training — ' + num((a.points && a.points.skill) || 0) + ' learning points' }));
    if (!offers.length) trainEl.append(h('div', { class: 'rpg-empty', text: 'Nothing to teach you right now.' }));
    for (const o of offers) {
      const sk = Skills.SKILLS[o.skill], ok = o.ok !== false;
      const r = h('div', { class: 'rpg-row' + (ok ? '' : ' rpg-faded') }, h('span', { class: 'rpg-ico', text: '✦', style: 'color:#e0bb5c' }),
        h('span', { class: 'rpg-c-name' }, h('span', { class: 'rpg-nm', text: (sk ? sk.name : o.skill) + ' ' + o.rank + ' — ' + o.name }), h('small', { class: ok ? '' : 'rpg-poor', text: ok ? 'Ready to learn' : o.reason || '' })),
        h('span', { class: 'rpg-c-n rpg-gold', text: num(o.costGold) + ' g' }), h('span', { class: 'rpg-c-n', text: o.costPoints + ' pt' }),
        h('button', { class: 'rpg-btn rpg-primary', text: 'Learn', disabled: ok ? null : true, title: ok ? '' : o.reason, on: { click: () => ctx.cmd({ t: 'learn', skill: o.skill, npc: S.npcId }) } }));
      trainEl.append(r);
    }
  }
  function renderTabs(hasTrain) {
    clear(tabsEl); tabsEl.classList.toggle('rpg-hidden', !hasTrain);
    if (!hasTrain) { S.tab = 'trade'; return; }
    for (const [id, label] of [['trade', 'Trade'], ['train', 'Training']]) tabsEl.append(h('button', { class: 'rpg-tab' + (S.tab === id ? ' rpg-on' : ''), text: label, on: { click: () => { S.tab = id; render(true); } } }));
  }
  function render(force) {
    const a = P(), s = st(), d = s.dialogue; if (!a) return;
    if (d && d.npcId) S.npcId = d.npcId;
    const hasTrain = !!(d && d.trainer);
    const sig = [S.npcId, S.tab, hasTrain, a.gold, a.inv.map((i) => i.uid + ':' + (i.qty || 1)).join(','), Math.floor(s.t / 5), JSON.stringify(a.skills), a.points && a.points.skill].join('|');
    if (!force && sig === S.sig) return;
    S.sig = sig; tip.hide(); youGold.textContent = num(a.gold || 0);
    renderTabs(hasTrain);
    el.classList.toggle('rpg-train-on', hasTrain && S.tab === 'train');
    const tr = hasTrain && S.tab === 'train';
    buyEl.parentNode.classList.toggle('rpg-hidden', tr); sellEl.parentNode.classList.toggle('rpg-hidden', tr); trainEl.classList.toggle('rpg-hidden', !tr);
    infoEl.classList.toggle('rpg-hidden', tr);
    renderTrade(a); if (hasTrain) renderTrain(a);
  }
  function open(d) { S.open = true; S.npcId = (d && d.npcId) || (st().dialogue && st().dialogue.npcId) || 0; S.tab = 'trade'; el.classList.remove('rpg-hidden'); render(true); }
  function close() { S.open = false; el.classList.add('rpg-hidden'); tip.hide(); }
  return { el, open, close, isOpen: () => S.open, update() { if (S.open) render(false); } };
}
