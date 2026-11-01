// FOGBOUND: DOMINION top bar: 5 resources with income/min, population, mana, age, clock, game speed, menu; objective chips (temple ritual, Dread Moon).
import { h, esc, fmtTime, fmtNum, cssColor } from './dom.js';
import { rates, templeState, AGE_NAMES, ageOf, manaInfo } from './adapt.js';
import { RES, RES_ICONS, RES_NAMES } from '../consts.js';

export function createTopbar(ui, root) {
  const el = h('div', 'rts-top ui', root);
  const res = h('div', 'rt-res panel', el);
  const cells = {};
  for (const r of RES) {
    const c = h('div', 'rt-cell r-' + r, res); c.dataset.res = r;
    h('i', 'ri r-' + r, c, RES_ICONS[r]);
    cells[r] = { v: h('b', '', c, '0'), d: h('small', '', c, ''), el: c };
    c.addEventListener('mouseenter', (e) => ui.tip.show(resTip(r), e.clientX + 12, e.clientY + 90));
    c.addEventListener('mouseleave', () => ui.tip.hide());
  }
  const pop = h('div', 'rt-pop panel', el);
  const popMil = h('span', 'pp', pop), popWork = h('span', 'pp', pop), popGen = h('span', 'pp', pop), popHouse = h('span', 'pp', pop);
  const mana = h('div', 'rt-mana panel', el); const manaBar = h('i', '', mana); const manaTxt = h('span', '', mana);
  const mid = h('div', 'rt-info panel', el);
  const age = h('span', 'age', mid), clock = h('span', 'clock', mid), spd = h('span', 'spd', mid), pause = h('button', 'btn small mn', mid, '☰');
  pause.title = 'Menu (Esc)'; pause.onclick = () => ui.game.togglePause();
  const obj = h('div', 'rt-obj', el);
  function resTip(r) {
    const rt = rates(ui.st, ui.team.id), inc = rt.income || {}, up = rt.upkeep || {};
    const lines = [`Income ${Math.round(inc[r] || 0)}/min`]; if (up[r]) lines.push(`Upkeep -${Math.round(up[r])}/min`); lines.push(`Net ${Math.round(rt[r] || 0)}/min`);
    if (ui.team.stats && ui.team.stats.gathered) lines.push(`Gathered in total: ${fmtNum(ui.team.stats.gathered[r] || 0)}`);
    return { title: RES_NAMES[r], lines };
  }
  let timer = 0;
  function chip(cls, text, title) { const c = h('div', 'chipx ' + cls, obj, text); if (title) c.title = title; return c; }
  return {
    el,
    update(dt) {
      const st = ui.st, t = ui.team; timer -= dt;
      if (timer > 0) return; timer = 0.25;
      const rt = rates(st, t.id);
      for (const r of RES) {
        const c = cells[r], v = Math.floor(t.res[r] || 0); c.v.textContent = fmtNum(v);
        const d = Math.round(rt[r] || 0); c.d.textContent = (d >= 0 ? '+' : '') + d + '/m'; c.d.className = d < 0 ? 'neg' : '';
        c.el.classList.toggle('starve', r === 'blood' && !!rt.starving);
      }
      const cap = t.cap || { mil: 50, work: 24, gen: 3 }, p = t.pop || { mil: 0, work: 0 };
      const gens = (t.generals || []).filter((id) => { const g = st.byId.get(id); return g && g.alive; }).length;
      popMil.textContent = `⚔ ${p.mil}/${cap.mil}`; popWork.textContent = `⚒ ${p.work}/${cap.work}`; popGen.textContent = `♛ ${gens}/${cap.gen}`;
      popHouse.textContent = `⌂ ${p.mil + p.work}/${t.popMax}`; popHouse.classList.toggle('warn', p.mil + p.work >= t.popMax);
      const mi = manaInfo(st, t.id), mv = mi ? mi.mana ?? t.mana : t.mana, mm = mi ? mi.max ?? t.manaMax : t.manaMax;
      manaBar.style.width = Math.min(100, (mv / (mm || 1)) * 100) + '%'; manaTxt.textContent = `✺ ${Math.floor(mv)}/${Math.floor(mm)}`;
      age.textContent = AGE_NAMES[ageOf(t)] || ''; clock.textContent = fmtTime(st.t); spd.textContent = ui.game.speed > 1 ? ui.game.speed + 'x' : '';
      // objectives
      obj.textContent = '';
      const T = templeState(st), e2 = st.events2;
      if (e2 && e2.dread) chip('dread', '☾ Dread Moon ' + fmtTime(Math.max(0, e2.dreadUntil - st.t)), 'Monsters rage; souls are doubled.');
      else if (e2 && e2.sched) { const nx = e2.sched.find((q) => q.type === 'dread' && q.at > st.t); if (nx && nx.at - st.t < 120) chip('dread soon', '☾ Dread Moon in ' + fmtTime(nx.at - st.t), 'Prepare your walls.'); }
      if (T && T.beam && !T.open) chip('temple', '✹ Temple beam lit', 'Slay the guardian of the Sunken Temple to open it.');
      if (T && T.open) {
        const holder = T.holder >= 0 ? st.teams[T.holder] : null;
        chip('temple ritual' + (T.contested ? ' cont' : ''), `✹ Ritual ${Math.round(T.t)}/${T.need}s ${holder ? '· ' + holder.faction.name : ''}${T.contested ? ' (contested)' : ''}`, 'Hold the temple until the ritual completes.');
        if (holder) obj.lastChild.style.borderColor = cssColor(holder.faction.color);
      }
    },
  };
}
