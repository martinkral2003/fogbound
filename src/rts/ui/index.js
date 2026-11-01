// FOGBOUND: DOMINION UI root: composes top bar, selection panel, command card, minimap, alerts, panels, menus. Entry: createRtsUI(game), showSetup().
import { h } from './dom.js';
import { createTooltip, createCommandCard } from './cmdcard.js';
import { createSelPanel } from './selpanel.js';
import { createTopbar } from './topbar.js';
import { createMinimap } from './minimap.js';
import { createAlerts } from './alerts.js';
import { createPanels } from './panels.js';
import { createMenus } from './menus.js';
import { templeState, safe } from './adapt.js';
import * as Buildings from '../buildings.js';
export { showSetup } from './setup.js';

export function createRtsUI(game) {
  const st = game.st, ctl = game.controls;
  let root = document.getElementById('rtsRoot');
  if (!root) { root = h('div', 'rts-root', document.body); root.id = 'rtsRoot'; }
  root.textContent = '';
  const ui = {
    game, st, ctl, root, team: st.teams[game.local], settings: ctl.settings, page: null, sub: 0, cardDirty: true, mmPings: [], edgePings: [], templeInfo: null,
    setPage(p) { ui.page = p; ui.sub = 0; ui.cardDirty = true; ui.tip.hide(); },
    toast(t, k, p) { ui.alerts && ui.alerts.toast(t, k || 'info', p); },
    cardTitle(card) { return card.page ? (card.page === 'spells' ? 'Spells' : card.page === 'build' ? 'Build' : 'Build · ' + card.page.split(':')[1]) : ''; },
    techName(id) { const T = Buildings.TECHS; return T && T[id] ? T[id].name : null; },
    modeChanged() { ui.cardDirty = true; hint(); },
    togglePanel(n) { ui.panels.toggle(n); },
    markGeneral() { ui.panels.markGeneral(); },
    setPaused(p) { ui.menus.setPaused(p); },
    showEnd(over) { ui.menus.showEnd(over); },
    minimapOrder(x, z, shift) {
      const us = ctl.selUnits();
      if (us.length) { ctl.issue({ type: ctl.mode && ctl.mode.kind === 'amove' ? 'amove' : 'move', x, z }, shift); ctl.ping(x, z, 'move'); }
      else for (const b of ctl.selBlds()) ctl.queueCmd({ t: 'rally', bld: b.id, x, z });
    },
  };
  ui.tip = createTooltip(root);
  ui.top = createTopbar(ui, root);
  ui.mm = createMinimap(ui, root);
  ui.sel = createSelPanel(ui, root);
  ui.card = createCommandCard(ui, root);
  ui.alerts = createAlerts(ui, root);
  ui.panels = createPanels(ui, root);
  ui.menus = createMenus(ui, root);
  const dragEl = h('div', 'rts-drag hidden', root), hintEl = h('div', 'rts-hint hidden', root);
  const HINTS = { amove: 'Attack-move: click a point or enemy', move: 'Move: click a point', patrol: 'Patrol: click the far point', guard: 'Guard: click a friendly unit or building', attackground: 'Bombard: click the ground', rally: 'Rally point: click the ground or a resource', ability: 'Ability: click a target', cast: 'Spell: click a target', repair: 'Repair: click a damaged building', demolish: 'Demolish: click one of your buildings' };
  function hint() {
    const m = ctl.mode; let t = '';
    if (ctl.build && ctl.build.active) { const w = ctl.build.type && (Buildings.def(ctl.build.type, ui.team) || {}).wall; t = w ? 'Click or drag to build · Shift = ring · Ctrl = gate · Z/X rotate · Right-click cancel' : 'Click to build · Shift keeps placing · Z/X rotate · Right-click cancel'; }
    else if (m) t = HINTS[m.kind] || ''; if (t && m && m.kind !== 'build') t += ' · Right-click/Esc cancel';
    hintEl.textContent = t; hintEl.classList.toggle('hidden', !t);
  }
  ui.keyHandler = (e) => {
    if (ui.menus.keyHandler(e)) return true;
    if (ui.panels.keyHandler(e)) return true;
    if (e.code === 'Escape' && ui.page) { ui.setPage(ui.page.includes(':') ? ui.page.split(':')[0] : null); return true; }
    if (e.code === 'Escape' && ui.panels.anyOpen()) { ui.panels.closeAll(); return true; }
    return false;
  };
  ui.cardKey = (letter, e) => (e.shiftKey && letter === 'V') ? false : ui.card.key(letter, e) || (letter === 'V' && !e.ctrlKey && (ctl.setMode('demolish'), true)) || (letter === 'B' && ctl.selUnits().some((u) => u.role === 'worker') && (ui.setPage('build'), true));
  ui.cardNumber = (n, e) => false;
  ui.update = function update(dt) {
    ui.templeInfo = safe(() => templeState(st), null);
    ui.top.update(dt); ui.sel.update(dt); ui.card.update(dt); ui.mm.update(dt); ui.alerts.update(dt); ui.panels.update(dt); ui.menus.update(dt);
    const d = ctl.drag;
    if (d && d.box) { dragEl.classList.remove('hidden'); dragEl.style.left = Math.min(d.x0, d.x1) + 'px'; dragEl.style.top = Math.min(d.y0, d.y1) + 'px'; dragEl.style.width = Math.abs(d.x1 - d.x0) + 'px'; dragEl.style.height = Math.abs(d.y1 - d.y0) + 'px'; } else dragEl.classList.add('hidden');
    if (ctl.build && ctl.build.active) { const inf = ctl.build.info; const extra = inf && inf.total > 1 ? ` — ${inf.count}/${inf.total} pieces` + (inf.reason ? ' · ' + inf.reason : '') : inf && inf.reason ? ' — ' + inf.reason : ''; if (hintEl._x !== extra) { hintEl._x = extra; hint(); hintEl.textContent += extra; } }
    root.classList.toggle('placing', !!(ctl.mode || (ctl.build && ctl.build.active)));
    if (ui.ctl.canvas) ui.ctl.canvas.style.cursor = ctl.mode || (ctl.build && ctl.build.active) ? 'crosshair' : '';
  };
  ui.handleEvents = (evs) => ui.alerts.handleEvents(evs);
  ctl.ui = ui; game.ui = ui;
  ui.toast(`${ui.team.faction.lord} rises. Raise your keep, gather, and conquer.`, 'big');
  return ui;
}
