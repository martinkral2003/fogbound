// HUD text feeds: toasts / message log (bottom-right), kill feed (right), announcement banner (top centre), level-up flourish.
import { h, rarityColor, esc, setCls } from './dom.js';
import { call } from './sim.js';

export function createFeed(ctx, root) {
  const log = h('div', 'rpg-log', root);
  const kills = h('div', 'rpg-killfeed', root);
  const banner = h('div', 'rpg-banner rpg-hidden', root);
  const bTitle = h('div', 'rpg-banner-t', banner), bSub = h('div', 'rpg-banner-s', banner);
  const items = []; // {el, t, life}
  const kitems = [];
  const queue = []; let bannerT = 0, lastAnnounce = -9;

  function toast(text, kind, color, life = 6) {
    if (!text) return;
    const last = items[items.length - 1];
    if (last && last.text === text && last.t < 1.5) { last.t = 0; last.el.classList.remove('rpg-fade'); void last.el.offsetWidth; last.el.classList.add('rpg-fade'); return; }
    const el = h('div', 'rpg-toast ' + (kind || '') + ' rpg-fade', log);
    el.textContent = text; if (color) el.style.setProperty('--tc', color);
    items.push({ el, t: 0, life, text });
    while (items.length > 6) items.shift().el.remove();
  }
  function announce(title, sub, cls) { queue.push({ title, sub: sub || '', cls: cls || '' }); }
  function nm(st, id) { const a = st.byId && st.byId.get(id); return a ? a.name : '?'; }

  function handleEvent(e, st, p) {
    const mine = !p || e.actor === undefined || e.actor === p.id;
    switch (e.type) {
      case 'msg': if (mine) toast(e.text, e.kind); break;
      case 'pickup': if (mine) toast('Picked up ' + e.name, 'pick', rarityColor(e.rarity)); break;
      case 'levelup': if (mine) { announce('Level ' + e.lvl, 'Your power grows. Spend your points (U / K).', 'level'); toast('You reached level ' + e.lvl, 'big'); } break;
      case 'quest': if (mine && !/start/i.test(String(e.state))) {
        let title = e.title || e.id; const j = call('Quests', 'journal', st, p && p.id);
        if (j) { const q = [...(j.active || []), ...(j.done || [])].find((x) => x.id === e.id); if (q) title = q.title; }
        const s = String(e.state || '');
        toast((/done|complete/i.test(s) ? 'Quest complete: ' : /fail/i.test(s) ? 'Quest failed: ' : /abandon/i.test(s) ? 'Quest abandoned: ' : /ready/i.test(s) ? 'Quest ready to turn in: ' : /obj|update|progress/i.test(s) ? 'Quest updated: ' : 'New quest: ') + title, 'quest');
      } break;
      case 'announce': lastAnnounce = performance.now(); announce(e.text, e.sub || '', e.cls || 'fog'); break;
      case 'zone':
        if (performance.now() - lastAnnounce > 1500 && e.state === 'shrinking') announce('The Fog tightens', 'Stage ' + (e.stage || '') + ': the safe circle is closing.', 'fog');
        break;
      case 'death': {
        if (e.kind === 'npc') break;
        const v = st.byId && st.byId.get(e.actor), k = e.killer ? st.byId.get(e.killer) : null;
        const involvesHero = e.kind === 'rival' || e.kind === 'player' || (k && k.kind === 'player');
        if (!involvesHero) break;
        const rec = (st.match && st.match.kills || []).slice().reverse().find((r) => r.victim === e.actor);
        const w = rec && rec.weapon ? (typeof rec.weapon === 'string' ? rec.weapon : rec.weapon.name) : (e.weapon || '');
        const row = h('div', 'rpg-kill rpg-fade', kills);
        const me = p && (e.killer === p.id), dead = p && e.actor === p.id;
        row.innerHTML = (k ? '<b class="' + (me ? 'me' : '') + '">' + esc(k.name) + '</b>' : '<b class="fog">The Fog</b>') + ' <i>' + (k ? 'slew' : 'claimed') + '</i> <b class="' + (dead ? 'me' : '') + '">' + esc(v ? v.name : e.name) + '</b>' + (w ? ' <small>with ' + esc(w) + '</small>' : '');
        kitems.push({ el: row, t: 0 }); while (kitems.length > 5) kitems.shift().el.remove();
      } break;
      default: break;
    }
  }

  function update(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]; it.t += dt;
      if (it.t > it.life - 1) it.el.style.opacity = Math.max(0, it.life - it.t).toFixed(2);
      if (it.t > it.life) { it.el.remove(); items.splice(i, 1); }
    }
    for (let i = kitems.length - 1; i >= 0; i--) {
      const it = kitems[i]; it.t += dt;
      if (it.t > 9) it.el.style.opacity = Math.max(0, 10 - it.t).toFixed(2);
      if (it.t > 10) { it.el.remove(); kitems.splice(i, 1); }
    }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.add('rpg-hidden'); else banner.style.opacity = Math.min(1, bannerT).toFixed(2); }
    if (bannerT <= 0 && queue.length) {
      const q = queue.shift();
      bTitle.textContent = q.title; bSub.textContent = q.sub; banner.className = 'rpg-banner rpg-fade ' + q.cls; banner.style.opacity = 1; bannerT = 4.2;
    }
    setCls(log, 'rpg-hidden', false);
  }
  return { toast, announce, handleEvent, update };
}
