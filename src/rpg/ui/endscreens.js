// Pause menu (controls + settings), death screen (placement, killer, stats; spectate / new match) and victory screen.
import { h, fmtTime, esc, setText } from './dom.js';

function stats(ctx) {
  const st = ctx.st(), p = ctx.player(), m = st.match || {};
  const placement = (m.placements && m.placements[p.id]) || (p.alive ? 1 : Math.max(1, (m.alive || 0) + 1));
  const total = m.total || (m.alive || 0) + 1;
  const end = p.alive ? st.t : (p.diedAt ?? st.t);
  const rec = (m.kills || []).slice().reverse().find((r) => r.victim === p.id);
  const killer = rec && rec.killer ? st.byId.get(rec.killer) : null;
  const w = rec && rec.weapon ? (typeof rec.weapon === 'string' ? rec.weapon : rec.weapon.name) : '';
  return { placement, total, time: end, kills: p.kills | 0, lvl: p.lvl, looted: (ctx.stats && ctx.stats.looted) | 0, killer, weapon: w, gold: p.gold | 0 };
}
function statGrid(parent, s) {
  const g = h('div', 'rpg-end-stats', parent);
  for (const [k, v] of [['Heroes slain', s.kills], ['Level reached', s.lvl], ['Time survived', fmtTime(s.time)], ['Items looted', s.looted]]) { const c = h('div', 'rpg-end-stat', g); h('b', '', c, String(v)); h('span', '', c, k); }
}
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th');

function endPanel(ctx, kind) {
  const el = h('div', 'rpg-end rpg-modal rpg-hidden ' + kind);
  const box = h('div', 'rpg-end-box rpg-gothic', el);
  const title = h('h1', 'rpg-end-title', box), place = h('div', 'rpg-end-place', box), sub = h('div', 'rpg-end-sub', box), grid = h('div', '', box), btns = h('div', 'rpg-end-btns', box);
  let open = false;
  const bar = h('div', 'rpg-spec rpg-hidden'); // shown while spectating (death screen only)
  h('span', '', bar, 'Spectating — the island carries on without you.');
  const nb = h('button', 'rpg-btn gold', bar, 'New match'); nb.onclick = () => ctx.game.onNewMatch && ctx.game.onNewMatch();
  const nb2 = h('button', 'rpg-btn', bar, 'Show results'); nb2.onclick = () => { ctx.ui.setSpectating(false); ctx.ui.open('death'); };
  function fill() {
    const s = stats(ctx);
    grid.textContent = ''; btns.textContent = '';
    if (kind === 'victory') {
      title.textContent = 'Victory'; place.textContent = 'Last hero standing'; sub.textContent = 'The Fog yields. The island is yours.';
    } else {
      title.textContent = 'You Have Fallen'; place.textContent = 'Placed ' + ordinal(s.placement) + ' of ' + s.total;
      const k = s.killer; sub.innerHTML = k ? 'Slain by <b>' + esc(k.name) + '</b>' + (k.kind === 'monster' ? ' (lvl ' + (k.lvl || 1) + ')' : '') + (s.weapon ? ' with <b>' + esc(s.weapon) + '</b>' : '') : 'Claimed by the <b class="fog">Dread Fog</b>';
    }
    statGrid(grid, s);
    if (kind === 'death') { const b = h('button', 'rpg-btn', btns, '◉ Spectate'); b.onclick = () => { ctx.ui.setSpectating(true); if (ctx.game.onSpectate) ctx.game.onSpectate(); }; }
    const n = h('button', 'rpg-btn gold', btns, '↻ New match'); n.onclick = () => ctx.game.onNewMatch && ctx.game.onNewMatch();
  }
  return {
    el, bar, alwaysUpdate: true,
    open() { open = true; fill(); el.classList.remove('rpg-hidden'); bar.classList.add('rpg-hidden'); },
    close() { open = false; el.classList.add('rpg-hidden'); },
    isOpen: () => open,
    update() { if (kind !== 'death') return; const sp = ctx.spectating && !open; bar.classList.toggle('rpg-hidden', !sp); if (sp && !bar.parentNode) ctx.root.appendChild(bar); if (open && !bar.parentNode) ctx.root.appendChild(bar); },
  };
}
export const createDeathPanel = (ctx) => endPanel(ctx, 'death');
export const createVictoryPanel = (ctx) => endPanel(ctx, 'victory');

const CONTROLS = [['W A S D', 'Move'], ['Mouse', 'Look'], ['Shift', 'Sprint'], ['C', 'Crouch'], ['Space', 'Jump'], ['Left Ctrl', 'Dodge roll'], ['LMB', 'Attack (hold + release = heavy)'], ['RMB', 'Block / parry'],
  ['E / F', 'Interact, talk, loot'], ['R', 'Sheathe / draw'], ['1 - 8', 'Quick slots'], ['Tab', 'Lock on'], ['V', 'First / third person'], ['I', 'Inventory'], ['U', 'Character'], ['K', 'Skills'], ['J', 'Journal'], ['M', 'Map'], ['N', 'Minimap rotate'], ['Esc', 'Pause / close']];
const SETTINGS = [['sens', 'Mouse sensitivity', 'range', 0.2, 3, 0.05, (v) => v.toFixed(2) + 'x'], ['fov', 'Field of view', 'range', 50, 110, 1, (v) => v + '°'], ['volume', 'Volume', 'range', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
  ['invertY', 'Invert Y axis', 'check'], ['northUp', 'Minimap: north up', 'check'], ['typewriter', 'Dialogue typewriter', 'check'], ['quality', 'Graphics quality', 'select', ['low', 'medium', 'high']]];

export function createPausePanel(ctx) {
  const el = h('div', 'rpg-pause rpg-modal rpg-hidden');
  const box = h('div', 'rpg-pause-box rpg-gothic', el);
  h('h1', 'rpg-end-title', box, 'Paused');
  const cols = h('div', 'rpg-pause-cols', box);
  const c1 = h('div', 'rpg-pause-col', cols), c2 = h('div', 'rpg-pause-col', cols);
  h('div', 'rpg-map-lh', c1, 'Controls');
  const cl = h('div', 'rpg-ctl', c1);
  for (const [k, v] of CONTROLS) { const r = h('div', 'rpg-ctl-r', cl); h('span', 'rpg-key', r, k); h('span', '', r, v); }
  h('div', 'rpg-map-lh', c2, 'Settings');
  const s = ctx.settings; if (s.typewriter === undefined) s.typewriter = true;
  for (const [key, label, type, a, b, step, fmt] of SETTINGS) {
    const r = h('label', 'rpg-set', c2); h('span', '', r, label);
    if (type === 'range') { const v = h('em', '', r, fmt(+s[key])), i = h('input', '', r); i.type = 'range'; i.min = a; i.max = b; i.step = step; i.value = s[key]; i.oninput = () => { s[key] = +i.value; v.textContent = fmt(s[key]); ctx.saveSettings(); }; }
    else if (type === 'check') { const i = h('input', '', r); i.type = 'checkbox'; i.checked = !!s[key]; i.onchange = () => { s[key] = i.checked; ctx.saveSettings(); }; }
    else { const i = h('select', '', r); for (const o of a) { const op = h('option', '', i, o); op.value = o; } i.value = s[key]; i.onchange = () => { s[key] = i.value; ctx.saveSettings(); }; }
  }
  const btns = h('div', 'rpg-end-btns', c2);
  const res = h('button', 'rpg-btn gold', btns, '▶ Resume'); res.onclick = () => ctx.ui.close('pause');
  const nm = h('button', 'rpg-btn red', btns, '↻ New match'); let armed = 0;
  nm.onclick = () => { if (!armed) { armed = 1; nm.textContent = 'Click again to confirm'; setTimeout(() => { armed = 0; nm.textContent = '↻ New match'; }, 3000); } else { armed = 0; nm.textContent = '↻ New match'; ctx.ui.close('pause'); ctx.game.onNewMatch && ctx.game.onNewMatch(); } };
  let open = false;
  return { el, open() { open = true; el.classList.remove('rpg-hidden'); if (ctx.game.onPause) ctx.game.onPause(); }, close() { open = false; el.classList.add('rpg-hidden'); }, isOpen: () => open };
}
