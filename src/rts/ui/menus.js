// FOGBOUND: DOMINION menus: pause (stops the sim), settings (localStorage), help, end screens (victory/defeat + stats table).
import { h, esc, fmtTime, fmtNum, cssColor, saveSettings } from './dom.js';
import { RES, RES_ICONS } from '../consts.js';

const HELP = [
  ['Camera', 'Edge-pan / arrows / WASD (when nothing is selected) · wheel zoom · Q/E or middle-drag rotate · Space = jump to general · ` territory overlay'],
  ['Select', 'Click · drag box · Shift add/remove · double-click = all of type on screen · Ctrl+1-9 set group, 1-9 recall (twice = centre) · Ctrl+A all military · . idle workers · Tab cycle'],
  ['Orders', 'Right-click: smart command (move / attack / gather / repair / garrison / rally) · Shift queue · Ctrl+right-click bombard · double right-click run · A attack-move · P patrol · H hold · S stop · G guard'],
  ['Build', 'Select workers, B for the build menu. Drag walls in a line, Shift = ring, Ctrl = gate in the middle, Z/X rotate · V demolish · hold the repair order on damaged buildings'],
  ['Game', 'Esc menu/cancel · + / - speed · F1 help · F2 general · F3 technologies · F4 objectives'],
];

export function createMenus(ui, root) {
  const pause = h('div', 'rts-overlay hidden', root), box = h('div', 'menuBox small rts-menu', pause);
  const settingsBox = h('div', 'menuBox small rts-menu hidden', pause);
  const helpBox = h('div', 'menuBox rts-help hidden', pause);
  const endEl = h('div', 'rts-overlay hidden', root);
  h('h2', '', box, 'Paused');
  const b1 = h('button', 'btn gold', box, 'Resume'), b2 = h('button', 'btn', box, 'Settings'), b3 = h('button', 'btn', box, 'How to play'), b4 = h('button', 'btn', box, 'Abandon match');
  b1.onclick = () => ui.game.togglePause(); b2.onclick = () => show('settings'); b3.onclick = () => show('help'); b4.onclick = () => { if (confirm('Abandon this match?')) ui.game.quit(); };
  function show(w) { box.classList.toggle('hidden', w !== 'menu'); settingsBox.classList.toggle('hidden', w !== 'settings'); helpBox.classList.toggle('hidden', w !== 'help'); }
  // settings
  h('h2', '', settingsBox, 'Settings');
  const S = ui.settings;
  const row = (label, input) => { const r = h('label', 'srow', settingsBox); h('span', '', r, label); r.appendChild(input); return r; };
  const slider = (key, min, max, step) => { const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = S[key]; i.oninput = () => { S[key] = +i.value; saveSettings(S); }; return i; };
  row('Edge-pan (0 = off)', slider('edgePan', 0, 2, 1)); row('Camera speed', slider('camSpeed', 0.4, 2.5, 0.1)); row('Sound volume', slider('volume', 0, 1, 0.1));
  const inv = document.createElement('input'); inv.type = 'checkbox'; inv.checked = !!S.invertRotate; inv.onchange = () => { S.invertRotate = inv.checked; saveSettings(S); }; row('Invert Q/E rotation', inv);
  const ws = document.createElement('select'); for (const [v, t] of [['auto', 'Only with nothing selected'], ['always', 'Always (conflicts with A/S orders)'], ['off', 'Off (arrows only)']]) { const o = document.createElement('option'); o.value = v; o.textContent = t; ws.appendChild(o); } ws.value = S.wasd; ws.onchange = () => { S.wasd = ws.value; saveSettings(S); }; row('WASD camera', ws);
  const back = h('button', 'btn', settingsBox, 'Back'); back.onclick = () => show('menu');
  // help
  h('h2', '', helpBox, 'How to play');
  for (const [k, v] of HELP) { const p = h('p', '', helpBox); h('b', '', p, k + ': '); p.appendChild(document.createTextNode(v)); }
  const hb = h('button', 'btn', helpBox, 'Back'); hb.onclick = () => show(ui.game.paused ? 'menu' : 'none');
  let helpOnly = false;
  function openHelp() { helpOnly = !ui.game.paused; pause.classList.remove('hidden'); show('help'); }
  function closeHelp() { if (helpOnly) { pause.classList.add('hidden'); helpOnly = false; } else show('menu'); }
  hb.onclick = closeHelp;
  return {
    setPaused(p) { if (p) { show('menu'); pause.classList.remove('hidden'); } else { pause.classList.add('hidden'); helpOnly = false; } },
    keyHandler(e) {
      if (e.code === 'F1') { if (!helpBox.classList.contains('hidden')) closeHelp(); else openHelp(); return true; }
      if (ui.game.paused && !ui.game.endShown) { if (e.code === 'Escape') { if (!settingsBox.classList.contains('hidden') || !helpBox.classList.contains('hidden')) closeHelp(); else if (ui.game.blurPaused) { ui.game.paused = false; ui.game.blurPaused = false; ui.setPaused(false); } else ui.game.togglePause(); } return true; }
      if (helpOnly && e.code === 'Escape') { closeHelp(); return true; }
      return false;
    },
    update() {},
    showEnd(over) {
      const st = ui.st, me = ui.team, win = over.winner === me.id;
      endEl.classList.remove('hidden'); endEl.textContent = '';
      const bx = h('div', 'menuBox rts-end', endEl);
      const t = h('h2', '', bx, win ? 'Victory' : 'Defeat'); t.style.color = win ? '#e0bb5c' : '#d8503c';
      const w = over.winner >= 0 ? st.teams[over.winner] : null;
      h('p', '', bx, (win ? 'The island kneels to you. ' : w ? `${w.faction.name} rule the island. ` : 'Your realm has fallen. ') + ({ domination: 'Every rival keep has fallen.', ritual: 'The ritual at the Sunken Temple was completed.', defeat: 'Your keep was destroyed.' }[over.reason] || '') + ` Match time ${fmtTime(st.t)}.`);
      let html = '<table class="endt"><tr><th>Lord</th><th>Kills</th><th>Lost</th><th>Units</th><th>Buildings</th>' + RES.map((r) => `<th title="gathered">${RES_ICONS[r]}</th>`).join('') + '<th></th></tr>';
      for (const tm of st.teams) {
        const units = st.ents.filter((u) => u.alive && u.team === tm.id).length, blds = st.blds.filter((b) => b.team === tm.id && b.state !== 'ruin').length;
        html += `<tr class="${tm.alive ? '' : 'dead'}"><td style="color:${cssColor(tm.faction.color)}">${esc(tm.faction.name)}${tm.id === me.id ? ' (you)' : ''}</td><td>${tm.stats.kills}</td><td>${tm.stats.lost}</td><td>${units}</td><td>${blds}</td>${RES.map((r) => `<td>${fmtNum((tm.stats.gathered && tm.stats.gathered[r]) || 0)}</td>`).join('')}<td>${tm.alive ? '' : '✝'}</td></tr>`;
      }
      const tb = h('div', '', bx); tb.innerHTML = html + '</table>';
      const rw = h('div', 'row center', bx);
      const again = h('button', 'btn gold', rw, 'New match'); again.onclick = () => ui.game.quit();
      const watch = h('button', 'btn', rw, 'Keep watching'); watch.onclick = () => { endEl.classList.add('hidden'); ui.game.paused = false; ui.game.spectate = true; ui.game.speed = Math.max(ui.game.speed, 2); };
    },
  };
}
