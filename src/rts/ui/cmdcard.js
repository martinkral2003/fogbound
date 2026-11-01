// FOGBOUND: DOMINION command card widget (bottom right, 5x3 grid) + shared tooltip.
import { h, esc } from './dom.js';
import { computeCard } from './cards.js';

export function createTooltip(root) {
  const el = h('div', 'rts-tip hidden', root);
  return {
    show(tip, x, y) {
      if (!tip) { el.classList.add('hidden'); return; }
      el.innerHTML = `<b>${esc(tip.title || '')}</b>${(tip.lines || []).map((l) => `<p>${esc(l)}</p>`).join('')}${tip.cost ? `<div class="tc">${tip.cost}</div>` : ''}${tip.req ? `<div class="tr">${esc(tip.req)}</div>` : ''}${tip.hk ? `<kbd>${esc(tip.hk)}</kbd>` : ''}`;
      el.classList.remove('hidden');
      const r = el.getBoundingClientRect();
      el.style.left = Math.max(6, Math.min(innerWidth - r.width - 6, x - r.width + 20)) + 'px';
      el.style.top = Math.max(6, y - r.height - 10) + 'px';
    },
    hide() { el.classList.add('hidden'); },
    el,
  };
}

export function createCommandCard(ui, root) {
  const el = h('div', 'rts-card panel ui', root);
  const head = h('div', 'cc-title', el);
  const grid = h('div', 'cc-grid', el);
  const btns = [];
  let card = { slots: [] }, sigs = [], timer = 0, lastVer = -1, tipSlot = -1;
  for (let i = 0; i < 15; i++) {
    const b = h('button', 'cc empty', grid);
    b.addEventListener('click', (e) => { const s = card.slots[i]; if (s) { run(s, e); } });
    b.addEventListener('mouseenter', (e) => { tipSlot = i; showTip(i, e); });
    b.addEventListener('mousemove', (e) => showTip(i, e));
    b.addEventListener('mouseleave', () => { tipSlot = -1; ui.tip.hide(); });
    btns.push(b);
  }
  function showTip(i, e) { const s = card.slots[i]; if (!s || !s.tip) { ui.tip.hide(); return; } ui.tip.show(Object.assign({}, s.tip, { hk: s.hk }), e.clientX + 16, e.clientY); }
  function run(s, e) {
    if (!s.enabled && s.reason) { ui.toast(s.reason, 'warn'); return; }
    if (!s.enabled) return;
    try { s.run && s.run(e); } catch (err) { console.error(err); }
    ui.cardDirty = true; ui.tip.hide();
  }
  function paint() {
    card = computeCard({ ctl: ui.ctl, st: ui.st, team: ui.team, ui });
    head.textContent = card.page ? (card.slots.some(Boolean) ? '' : '') + ui.cardTitle(card) : ui.cardTitle(card);
    el.classList.toggle('hidden', !card.slots.some(Boolean));
    card.slots.forEach((s, i) => {
      const b = btns[i], sig = s ? [s.id, s.label, s.cost, s.enabled, s.active, s.cdText, s.badge, s.hk, s.glyph].join('|') : '';
      if (sigs[i] === sig) return; sigs[i] = sig;
      b.className = 'cc' + (s ? '' : ' empty') + (s && !s.enabled ? ' off' : '') + (s && s.active ? ' active' : '') + (s && s.badge === 'auto' ? ' auto' : '');
      b.innerHTML = s ? `<span class="g">${esc(s.glyph || '•')}</span><span class="hk">${esc(s.hk || '')}</span><span class="lb">${esc(s.label || '')}</span>${s.cost ? `<span class="cs">${s.cost}</span>` : ''}${s.cdText ? `<span class="cd">${s.cdText}</span>` : ''}${s.badge && s.badge !== 'auto' && s.badge !== 'stance' ? `<span class="bd">${esc(s.badge)}</span>` : ''}` : '';
    });
    if (tipSlot >= 0) { const s = card.slots[tipSlot]; if (!s) ui.tip.hide(); }
  }
  return {
    el,
    update(dt) {
      timer -= dt;
      if (timer <= 0 || ui.ctl.selVer !== lastVer || ui.cardDirty) { timer = 0.2; lastVer = ui.ctl.selVer; ui.cardDirty = false; paint(); }
    },
    key(letter, e) {
      const s = card.slots.find((q) => q && q.hk === letter);
      if (!s) return false;
      run(s, e); return true;
    },
    keyExact(hk, e) { const s = card.slots.find((q) => q && q.hk === hk); if (!s) return false; run(s, e); return true; },
  };
}
