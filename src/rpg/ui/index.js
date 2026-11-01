// FOGBOUND: HERO UI integration. createRpgUI(root, game) -> {update, handleEvents, isModalOpen, toggle, open, close, keyHandler}
// game = {st, queue(cmd), player(), toast(text, kind), controls, onNewMatch, onSpectate, onResume, onSettings}
// Panels are DOM modules exporting create<Name>Panel(ctx) -> {el, update(dt), open(), close(), isOpen(), keyHandler?(e)}. Missing files never break the UI.
import { h, loadSettings, saveSettings } from './dom.js';

const MINE = [
  ['hud', './hud.js', 'createHud'], ['hudtop', './hudtop.js', 'createHudTop'], ['minimap', './minimap.js', 'createMinimap'],
  ['map', './map.js', 'createMapPanel'], ['dialogue', './dialogue.js', 'createDialoguePanel'], ['journal', './journal.js', 'createJournalPanel'],
  ['pause', './endscreens.js', 'createPausePanel'], ['death', './endscreens.js', 'createDeathPanel'], ['victory', './endscreens.js', 'createVictoryPanel'],
];
const OTHER = [
  ['inventory', './inventory.js', 'createInventoryPanel'], ['character', './character.js', 'createCharacterPanel'], ['skills', './skills.js', 'createSkillsPanel'],
  ['loot', './loot.js', 'createLootPanel'], ['trade', './trade.js', 'createTradePanel'],
];
const EXCL = ['inventory', 'character', 'skills', 'journal', 'map', 'pause'];       // only one of these at a time
const MODALS = ['inventory', 'character', 'skills', 'journal', 'map', 'loot', 'trade', 'dialogue', 'pause', 'death', 'victory'];
const HOTKEYS = { KeyI: 'inventory', KeyU: 'character', KeyK: 'skills', KeyJ: 'journal', KeyM: 'map' };

export function createRpgUI(root, game) {
  if (!document.querySelector('link[href*="rpg.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../../rpg.css', import.meta.url).href; document.head.appendChild(l); }
  const host = h('div', 'rpg-root', root);
  const settings = loadSettings();
  const pending = [];
  const P = {};              // loaded panel objects by name
  let curSt = null, deathT = 0, spectating = false, dialogueOpenedBy = null;

  const ctx = {
    st: () => game.st, player: () => (game.player ? game.player() : game.st && game.st.player), root: host, game, settings, ui: null,
    cmd: (c) => { if (game.queue) game.queue(c); },
    stats: { looted: 0 }, tracked: null,
    toast: (t, kind) => { if (P.hudtop) P.hudtop.toast(t, kind); else pending.push([t, kind]); },
    saveSettings: () => { saveSettings(settings); if (game.onSettings) game.onSettings(settings); },
    get spectating() { return spectating; },
  };

  function load([name, path, fn]) {
    import(path).then((m) => {
      if (typeof m[fn] !== 'function') return;
      const p = (name === 'hud' || name === 'hudtop' || name === 'minimap') ? m[fn](ctx, host) : m[fn](ctx);
      if (p && p.el && !p.el.parentNode) host.appendChild(p.el);
      P[name] = p;
      if (name === 'hudtop') for (const [t, k] of pending.splice(0)) p.toast(t, k);
    }).catch((e) => { if (!/Failed to fetch|Cannot find|404|Unexpected token '<'/.test(String(e && e.message))) console.warn('[rpg-ui] ' + name + ':', e); });
  }
  for (const spec of MINE) load(spec);
  for (const spec of OTHER) load(spec);

  const isOpen = (n) => !!(P[n] && P[n].isOpen && P[n].isOpen());
  function open(name, arg) {
    const p = P[name]; if (!p) return false;
    if (EXCL.includes(name)) for (const o of EXCL) if (o !== name && isOpen(o)) close(o);
    if (!isOpen(name)) p.open(arg);
    return true;
  }
  function close(name) {
    const p = P[name]; if (!p || !isOpen(name)) return;
    p.close();
    if (name === 'loot') ctx.cmd({ t: 'closeContainer' });
    if ((name === 'dialogue' || name === 'trade') && game.st && game.st.dialogue && !isOpen(name === 'trade' ? 'dialogue' : 'trade')) ctx.cmd({ t: 'endDialogue' });
    if (name === 'pause' && game.onResume) game.onResume();
  }
  function toggle(name) { if (isOpen(name)) close(name); else open(name); }
  const isModalOpen = () => MODALS.some(isOpen);
  const anyBlocking = () => ['dialogue', 'trade', 'loot', 'pause', 'death', 'victory'].some(isOpen);

  function closeTop() {
    for (const n of ['pause', 'victory', 'death', 'trade', 'dialogue', 'loot', 'map', 'journal', 'skills', 'character', 'inventory']) {
      if (isOpen(n)) { if (n === 'death' || n === 'victory') return false; close(n); return true; }
    }
    return false;
  }

  function keyHandler(e) {
    if (e.type && e.type !== 'keydown') return false;
    const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return false;
    for (const n of MODALS) { const p = P[n]; if (p && p.keyHandler && isOpen(n) && p.keyHandler(e)) return true; }
    if (e.code === 'Escape') { if (closeTop()) return true; if (isOpen('death') || isOpen('victory')) return true; open('pause'); return true; }
    const pl = ctx.player();
    if (!pl || !pl.alive || e.ctrlKey || e.altKey || e.metaKey) return false;
    const n = HOTKEYS[e.code];
    if (n && !(anyBlocking() && !isOpen(n))) { if (!P[n]) return false; toggle(n); return true; }
    if (e.code === 'KeyN' && P.minimap) { settings.northUp = !settings.northUp; ctx.saveSettings(); ctx.toast(settings.northUp ? 'Minimap: north up' : 'Minimap: rotates with you'); return true; }
    return false;
  }

  function autoPanels(st, p) {
    // dialogue / trade / trainer follow st.dialogue
    const d = st.dialogue;
    if (d) {
      const want = d.trade ? 'trade' : d.trainer ? 'skills' : 'dialogue';
      if (want !== dialogueOpenedBy) {
        if (dialogueOpenedBy && isOpen(dialogueOpenedBy)) { const w = dialogueOpenedBy; P[w].close(); }
        if (want !== 'dialogue' && P.dialogue) { if (!isOpen('dialogue')) P.dialogue.open(); }   // keep the conversation box visible behind the sub-panel
        if (want === 'dialogue') open('dialogue'); else if (!open(want, d)) open('dialogue');
        dialogueOpenedBy = want;
      }
    } else if (dialogueOpenedBy) {
      for (const n of ['dialogue', 'trade']) if (isOpen(n)) P[n].close();
      if (dialogueOpenedBy === 'skills' && isOpen('skills')) P.skills.close();
      dialogueOpenedBy = null;
    }
    // loot follows p.openC
    if (p.openC && !isOpen('loot') && P.loot) { const c = st.containers.find((q) => q.id === p.openC); if (c) open('loot', c); }
    else if (!p.openC && isOpen('loot')) P.loot.close();
  }

  function update(dt) {
    const st = game.st; if (!st) return;
    const p = ctx.player();
    if (st !== curSt) { curSt = st; spectating = false; deathT = 0; ctx.stats = { looted: 0 }; for (const n of MODALS) if (isOpen(n)) P[n].close(); if (P.hud) P.hud.reset && P.hud.reset(); }
    if (p) {
      if (p.alive) { deathT = 0; if (isOpen('death')) P.death.close(); spectating = false; autoPanels(st, p); }
      else {
        for (const n of ['loot', 'trade', 'dialogue', 'inventory', 'character', 'skills']) if (isOpen(n)) P[n].close();
        deathT += dt;
        const over = st.match && st.match.state === 'over';
        if (over && st.match.winner === p.id) { if (!isOpen('victory')) open('victory'); }
        else if (!spectating && deathT > 1.6 && !isOpen('death') && !isOpen('pause')) open('death');
      }
      if (p.alive && st.match && st.match.state === 'over' && st.match.winner === p.id && !isOpen('victory')) { if (!deathT) { deathT = -1; open('victory'); } }
    }
    for (const k of ['hud', 'hudtop', 'minimap']) if (P[k]) P[k].update(dt);
    for (const n of MODALS) if (P[n] && P[n].update && (P[n].alwaysUpdate || isOpen(n))) P[n].update(dt);
  }

  function handleEvents(events) {
    const st = game.st, p = ctx.player();
    for (const e of events || []) {
      if (e.type === 'pickup' && p && e.actor === p.id) ctx.stats.looted += (e.qty || 1) > 0 ? 1 : 0;
      for (const k of ['hud', 'hudtop', 'minimap']) if (P[k] && P[k].handleEvent) P[k].handleEvent(e, st, p);
      for (const n of MODALS) if (P[n] && P[n].handleEvent) P[n].handleEvent(e, st, p);
    }
  }

  const ui = {
    update, handleEvents, isModalOpen, toggle, open, close, keyHandler, panels: P, settings, ctx,
    setSpectating(v) { spectating = !!v; if (v && isOpen('death')) P.death.close(); },
    get spectating() { return spectating; },
  };
  ctx.ui = ui;
  return ui;
}
