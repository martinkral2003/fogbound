// v0.5 DOM module "towns_ui" (UI lane): ONE panel with two tabs when you press F next to a merchant.
//   Shop = potions (and a gear offer or two) with clear prices and big Buy buttons;  Hire = mercenary servants (recruits.mercenaryOffers).
// Opened with F near an NPC (team.townNear from towns.js). While open `open` is true, so controls drop all game input and the hero stands still.
// Commands (game.controls.input.cmds): {t:'buy', town, idx} and {t:'recruit', town, type, offer}.
import * as recruits from './recruits.js';
import { townById, hireOffers, itemStat, itemLine, tierColor, SLOT_GLYPH, esc, arr, POTION_KINDS } from './hud_state.js';

export function createView() { return null; }

const CSS = `
#townPanel { position: fixed; left: 50%; top: 46%; transform: translate(-50%, -50%); width: min(600px, 96vw); max-height: 80vh; display: flex; flex-direction: column; z-index: 9; padding: 14px 16px 12px; border: 1px solid #8a6a22; border-radius: 10px; background: linear-gradient(180deg, rgba(30,27,20,0.98), rgba(9,9,8,0.98)); box-shadow: 0 10px 50px rgba(0,0,0,0.85); color: #e8e4d0; font-family: "Palatino Linotype", Palatino, Georgia, serif; pointer-events: auto; }
#townPanel.hidden { display: none; }
#townPanel .tp-hd { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
#townPanel .tp-hd h3 { margin: 0; flex: 1; font-size: 22px; font-weight: normal; letter-spacing: 2px; color: #ffe6a0; }
#townPanel .tp-hd h3 small { display: block; font-size: 12px; letter-spacing: 1px; color: #9aa090; margin-top: 1px; } #townPanel .tp-hd h3 small .bad { color: #ff8a78; }
#townPanel .tp-gold { font-size: 22px; color: #e0bb5c; display: flex; align-items: center; gap: 7px; } #townPanel .tp-gold i { width: 16px; height: 16px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff1b0, #e0bb5c 55%, #8a6a22); display: inline-block; }
#townPanel .tp-x { background: none; border: 0; color: #9aa090; font-size: 26px; line-height: 1; cursor: pointer; padding: 0 4px; } #townPanel .tp-x:hover { color: #fff; }
#townPanel .tp-tabs { display: flex; gap: 8px; margin-bottom: 10px; }
#townPanel .tp-tab { flex: 1; padding: 9px 12px; text-align: center; font-size: 18px; letter-spacing: 2px; text-transform: uppercase; border: 1px solid #3a4248; border-radius: 6px; background: #151a1e; color: #8e978f; cursor: pointer; }
#townPanel .tp-tab:hover { color: #d8dccf; } #townPanel .tp-tab.on { background: linear-gradient(#4a3a18, #2e2410); border-color: #c8a238; color: #ffe6a0; }
#townPanel .tp-body { overflow: auto; display: flex; flex-direction: column; gap: 8px; min-height: 160px; padding-right: 2px; }
#townPanel .tp-row { display: grid; grid-template-columns: 46px 1fr auto; gap: 12px; align-items: center; padding: 8px 10px; border: 1px solid #333c42; border-left: 4px solid var(--tc, #5a6068); border-radius: 8px; background: rgba(18,22,26,0.85); }
#townPanel .tp-row .ic { width: 46px; height: 46px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 27px; color: var(--tc, #ddd); background: radial-gradient(circle at 35% 30%, #2c3238, #0c0e10 75%); border: 1px solid #3a4248; font-family: "Segoe UI Symbol", "DejaVu Sans", serif; }
#townPanel .tp-row .nm { min-width: 0; } #townPanel .tp-row .nm b { display: block; font-size: 17px; font-weight: normal; color: var(--tc, #e8e4d0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#townPanel .tp-row .nm small { display: block; font-size: 13px; color: #9aa090; line-height: 1.25; } #townPanel .tp-row .nm small em { color: #7fe08a; font-style: normal; }
#townPanel .tp-buy { min-width: 112px; padding: 9px 12px; font: inherit; font-size: 16px; border-radius: 7px; cursor: pointer; border: 1px solid #8a6a22; background: linear-gradient(#4a3a18, #2e2410); color: #ffe6a0; pointer-events: auto; line-height: 1.2; }
#townPanel .tp-buy b { font-weight: normal; color: #e0bb5c; } #townPanel .tp-buy:hover:not(:disabled) { border-color: #ffd560; background: linear-gradient(#5a4820, #382c12); }
#townPanel .tp-buy:disabled { opacity: 0.5; cursor: default; border-color: #4a4538; background: #1a1d20; color: #a09a88; } #townPanel .tp-buy small { display: block; font-size: 11px; color: #ff9a8a; }
#townPanel .tp-empty { color: #8e978f; font-size: 15px; padding: 18px 4px; text-align: center; }
#townPanel .tp-foot { margin-top: 10px; display: flex; justify-content: space-between; font-size: 12px; color: #8e978f; }
#townPanel kbd { font: 11px/1 ui-monospace, Consolas, monospace; background: #1b2126; border: 1px solid #4a535a; border-bottom-width: 2px; border-radius: 4px; padding: 2px 5px; color: #e0e4d8; }
`;

export function createUi(ctx) {
  const { game, st, local } = ctx;
  const team = st.teams[local];
  if (!team || typeof document === 'undefined') return null;
  const S = { open: false, tab: 'shop', town: null, sig: '' };

  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const panel = document.createElement('div'); panel.id = 'townPanel'; panel.className = 'hidden'; document.body.appendChild(panel);
  const push = (c) => { if (game.controls && game.controls.input) game.controls.input.cmds.push(c); };
  const town = () => (S.town !== null ? townById(st, S.town) : null);
  const hero = () => team.hero;
  const reach = (t) => (t.r || 30) + 14;

  // ---------------------------------------------------------------- rows
  const slotIcon = (it) => (it.kind === 'potion' ? it.icon || '✚' : SLOT_GLYPH[it.slot] || '✦');
  function upgradeNote(it) { // "better than yours" for gear with the one-stat model
    if (!it || it.kind === 'potion' || !it.slot) return '';
    const cur = hero().eq && hero().eq[it.slot], a = itemStat(it), b = itemStat(cur);
    if (!a) return '';
    if (!cur) return '<em>Fills an empty slot</em>';
    return b && b.stat === a.stat ? (a.val > b.val ? '<em>Better than yours</em>' : 'Not better than yours') : '';
  }
  function shopRows(t) {
    const rows = [];
    const stock = arr(t.stock).map((e, idx) => ({ e, idx })).filter((r) => r.e && r.e.item && r.e.item.kind !== 'book');
    stock.sort((a, b) => (b.e.item.kind === 'potion') - (a.e.item.kind === 'potion'));
    for (const { e, idx } of stock) {
      const it = e.item, price = Math.max(1, Math.round(e.price * (1 - (t.disc || 0)))), sold = e.qty !== undefined && e.qty <= 0, afford = team.gold >= price;
      const pk = it.kind === 'potion' ? POTION_KINDS.find((p) => p.k === it.k) : null;
      const col = it.kind === 'potion' ? (pk ? pk.css : '#d8dccf') : tierColor(it);
      const have = it.kind === 'potion' ? ` (you have ${(team.pots && team.pots[it.k]) | 0})` : '';
      const sub = it.kind === 'potion' ? esc(it.desc || (pk && pk.desc) || '') + have : esc(itemLine(it) || 'Gear') + (upgradeNote(it) ? ' · ' + upgradeNote(it) : '');
      rows.push(`<div class="tp-row" style="--tc:${col}"><div class="ic">${esc(slotIcon(it))}</div><div class="nm"><b>${esc(it.name)}</b><small>${sub}</small></div>`
        + `<button class="tp-buy" data-buy="${idx}" ${sold || !afford ? 'disabled' : ''}>${sold ? 'Sold out' : `Buy <b>${price}</b>`}${!sold && !afford ? `<small>need ${price - Math.floor(team.gold)} more</small>` : ''}</button></div>`);
    }
    return rows.length ? rows.join('') : '<div class="tp-empty">The merchant has nothing left to sell.</div>';
  }
  function hireRows(t) {
    const offers = hireOffers(recruits, st, t.id), n = arr(team.followers).length, cap = typeof recruits.followerCap === 'function' ? recruits.followerCap(team) : 4;
    if (!offers.length) return '<div class="tp-empty">No mercenaries are looking for work here.</div>';
    const head = `<div class="tp-empty" style="padding:2px 0 4px;text-align:left">Servants fight beside you. You have <b style="color:#ffe6a0">${n} / ${cap}</b>.</div>`;
    return head + offers.map((o) => {
      let why = o.sold ? 'Hired' : null;
      if (!why && typeof recruits.hireBlock === 'function') { try { why = recruits.hireBlock(st, team, t.id, o.type); } catch (e) { why = null; } }
      if (!why && team.gold < o.cost) why = `need ${o.cost - Math.floor(team.gold)} more`;
      const stats = [o.role || o.label, o.hp ? `${Math.round(o.hp)} HP` : '', o.dmg ? `${Math.round(o.dmg)} dmg` : ''].filter(Boolean).join(' · ');
      return `<div class="tp-row" style="--tc:#8fd0ff"><div class="ic">${esc(o.icon || '⚔')}</div><div class="nm"><b>${esc(o.name)}</b><small>${esc(o.blurb || stats)}${o.blurb && stats ? ' · ' + esc(stats) : ''}</small></div>`
        + `<button class="tp-buy" data-hire="${esc(o.type)}" data-offer="${esc(o.id)}" ${why ? 'disabled' : ''}>${o.sold ? 'Hired' : `Hire <b>${o.cost}</b>`}${why && !o.sold ? `<small>${esc(why)}</small>` : ''}</button></div>`;
    }).join('');
  }
  function render() {
    const t = town();
    if (!t) return;
    const nHire = hireOffers(recruits, st, t.id).length;
    panel.innerHTML = `<div class="tp-hd"><h3>${esc(t.name)}<small>${esc(t.kind === 'capital' ? 'Capital' : t.kind === 'town' ? 'Town' : 'Village')}${t.state === 'besieged' ? ' · <span class="bad">UNDER ATTACK</span>' : ''}</small></h3>`
      + `<span class="tp-gold"><i></i>${Math.floor(team.gold)}</span><button class="tp-x" data-close="1" title="Close (F / Esc)">&times;</button></div>`
      + `<div class="tp-tabs"><div class="tp-tab${S.tab === 'shop' ? ' on' : ''}" data-tab="shop">Shop</div><div class="tp-tab${S.tab === 'hire' ? ' on' : ''}" data-tab="hire">Hire${nHire ? ` (${nHire})` : ''}</div></div>`
      + `<div class="tp-body">${S.tab === 'shop' ? shopRows(t) : hireRows(t)}</div>`
      + `<div class="tp-foot"><span>Potions: keys <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span><span><kbd>F</kbd> or <kbd>Esc</kbd> to leave</span></div>`;
  }
  const sigNow = () => {
    const t = town();
    if (!t) return '';
    return [S.tab, t.state, Math.floor(team.gold), arr(t.stock).map((e) => e.qty).join(''), JSON.stringify(team.pots || {}), arr(team.followers).length, hireOffers(recruits, st, t.id).map((o) => o.id + (o.sold ? 's' : '')).join(','), hero().eq ? Object.keys(hero().eq).map((k) => hero().eq[k] && hero().eq[k].name).join() : ''].join('|');
  };

  // ---------------------------------------------------------------- open / close
  function openAt(near) {
    S.town = near.town; S.open = true; S.sig = '';
    if (!S.tab) S.tab = 'shop';
    panel.classList.remove('hidden');
    render(); S.sig = sigNow();
    if (game.controls && game.controls.input) { game.controls.input.mx = game.controls.input.mz = 0; game.controls.moveTo = null; }
    push({ t: 'stop' });
  }
  function close() { S.open = false; S.town = null; panel.classList.add('hidden'); }

  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) {
      if (S.open) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) close(); return; }
      if (team.townNear && !team.poiNear && team.hero && team.hero.alive && !game.paused && !st.over) {
        e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) openAt(team.townNear);
      }
    } else if (e.code === 'Escape' && S.open) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (S.open && (e.code === 'Digit1' || e.code === 'Digit2')) { e.preventDefault(); e.stopImmediatePropagation(); S.tab = e.code === 'Digit1' ? 'shop' : 'hire'; S.sig = ''; }
  }, true);

  panel.addEventListener('click', (e) => {
    const q = (a) => { const el = e.target.closest('[' + a + ']'); return el && !el.disabled ? el.getAttribute(a) : null; };
    const t = town(); if (!t) return;
    if (q('data-close')) return close();
    const tab = q('data-tab'); if (tab) { S.tab = tab; S.sig = ''; return; }
    const buy = q('data-buy'); if (buy !== null) { push({ t: 'buy', town: t.id, idx: +buy }); return; }
    const hire = q('data-hire'); if (hire !== null) { const b = e.target.closest('[data-hire]'); push({ t: 'recruit', town: t.id, type: hire, offer: b && b.getAttribute('data-offer') }); }
  });

  return {
    get open() { return S.open; },
    update() {
      const h = team.hero;
      if (!S.open) return;
      const t = town();
      if (!t || t.state === 'fallen' || !h || !h.alive || Math.hypot(h.x - t.x, h.z - t.z) > reach(t)) { close(); return; }
      const s = sigNow(); if (s !== S.sig) { S.sig = s; const sc = panel.querySelector('.tp-body'), top = sc ? sc.scrollTop : 0; render(); const b2 = panel.querySelector('.tp-body'); if (b2) b2.scrollTop = top; }
    },
    handleEvents(events) {
      for (const e of events) if ((e.type === 'townFallen' || e.type === 'townAttacked') && S.open && e.town === S.town) S.sig = '';
    },
  };
}
