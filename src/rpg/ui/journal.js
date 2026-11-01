// Quest journal (key J): active / completed / failed quests, objectives with progress, reward, giver, track toggle (tracked quest shows in the HUD tracker).
import { h, esc } from './dom.js';
import { call } from './sim.js';

const TABS = [['active', 'Active'], ['done', 'Completed'], ['failed', 'Failed']];

export function createJournalPanel(ctx) {
  const el = h('div', 'rpg-jrn rpg-modal rpg-hidden');
  const frame = h('div', 'rpg-jrn-frame rpg-gothic', el);
  const head = h('div', 'rpg-jrn-head', frame);
  h('h2', 'rpg-h', head, 'Journal');
  const tabs = h('div', 'rpg-jrn-tabs', head);
  const x = h('button', 'rpg-btn', head, '✕ Close (J)'); x.onclick = () => ctx.ui.close('journal');
  const body = h('div', 'rpg-jrn-body', frame);
  const list = h('div', 'rpg-jrn-list', body), detail = h('div', 'rpg-jrn-detail', body);
  let open = false, tab = 'active', sel = null, sig = '', data = { active: [], done: [], failed: [] };
  const tabBtns = TABS.map(([k, label]) => { const b = h('button', 'rpg-jrn-tab', tabs, label); b.onclick = () => { tab = k; sel = null; sig = ''; render(); }; return [k, b, label]; });

  function render() {
    for (const [k, b, label] of tabBtns) { b.classList.toggle('on', k === tab); b.textContent = label + ' (' + (data[k] || []).length + ')'; }
    const arr = data[tab] || [];
    if (!arr.find((q) => q.id === sel)) sel = arr.length ? arr[0].id : null;
    list.textContent = '';
    if (!arr.length) h('div', 'rpg-jrn-empty', list, tab === 'active' ? 'No active quests. Speak to the people of Harrowmere.' : 'Nothing here yet.');
    for (const q of arr) {
      const r = h('div', 'rpg-jrn-q' + (q.id === sel ? ' on' : '') + (ctx.tracked === q.id ? ' tracked' : ''), list);
      h('span', 'rpg-jrn-qt', r, q.title); if (q.state === 'ready') h('em', '', r, 'ready to turn in'); if (ctx.tracked === q.id) h('b', '', r, '◆');
      r.onclick = () => { sel = q.id; sig = ''; render(); };
    }
    const q = arr.find((z) => z.id === sel);
    detail.textContent = '';
    if (!q) return;
    h('h3', 'rpg-jrn-title', detail, q.title);
    if (q.giver) h('div', 'rpg-jrn-giver', detail, 'Given by ' + q.giver);
    h('p', 'rpg-jrn-desc', detail, q.desc || '');
    if (q.objectives && q.objectives.length) {
      h('div', 'rpg-jrn-lh', detail, 'Objectives');
      for (const o of q.objectives) {
        const r = h('div', 'rpg-jrn-obj' + (o.done ? ' done' : ''), detail);
        h('span', 'rpg-jrn-ck', r, o.done ? '✓' : '○'); h('span', 'rpg-jrn-ot', r, o.text);
        if (o.goal > 1) { h('span', 'rpg-jrn-op', r, (o.progress | 0) + ' / ' + o.goal); const bar = h('div', 'rpg-jrn-bar', r); h('i', '', bar).style.width = Math.min(100, (o.progress / o.goal) * 100) + '%'; }
      }
    } else if (q.state === 'ready') h('div', 'rpg-jrn-obj', detail, 'Return to the quest giver to claim your reward.');
    if (q.reward) { h('div', 'rpg-jrn-lh', detail, 'Reward'); h('div', 'rpg-jrn-rew', detail, '✦ ' + (typeof q.reward === 'string' ? q.reward : JSON.stringify(q.reward))); }
    if (tab === 'active') {
      const b = h('button', 'rpg-btn gold rpg-jrn-track', detail, ctx.tracked === q.id ? '◆ Tracked (click to untrack)' : '◇ Track this quest');
      b.onclick = () => { ctx.tracked = ctx.tracked === q.id ? null : q.id; sig = ''; render(); };
    }
  }
  function refresh(force) {
    const st = ctx.st(), p = ctx.player(); if (!st || !p) return;
    const j = call('Quests', 'journal', st, p.id) || {};
    const d = { active: j.active || [], done: j.done || [], failed: j.failed || [] };
    const s = JSON.stringify(d) + tab + sel + ctx.tracked;
    if (force || s !== sig) { sig = s; data = d; render(); }
  }
  return {
    el, open() { open = true; el.classList.remove('rpg-hidden'); if (!ctx.tracked) { const st = ctx.st(), j = call('Quests', 'journal', st, ctx.player().id); if (j && j.active && j.active[0]) ctx.tracked = j.active[0].id; } refresh(true); },
    close() { open = false; el.classList.add('rpg-hidden'); }, isOpen: () => open, update() { if (open) refresh(false); },
    keyHandler(e) { if (open && e.code === 'KeyJ') { ctx.ui.close('journal'); return true; } return false; },
  };
}
