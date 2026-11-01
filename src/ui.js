// Shell of the DOM interface (v0.5, UI lane): toasts, alerts and the minimap. Everything else (HUD, gear, towns, map, cards) is a v3view module
// (hud_ui.js, towns_ui.js, travel_ui.js, perks_ui.js, recruits_ui.js) created at the bottom through createUisV3.
import { TEAM_COLORS, WORLD } from './data.js';
import { createUisV3 } from './v3view.js';
import { objectiveOf } from './hud_state.js';

const $ = (id) => document.getElementById(id);
const tcss = (t) => (TEAM_COLORS[t] ? TEAM_COLORS[t].css : '#e0a030');

export function createUI(game) {
  const st = game.st, local = game.local, team = st.teams[local];
  const ui = {};
  const MM = 200;
  const pings = [];
  let tMini = 0, tMask = 0, mmBase = null;
  const mm = $('minimap'), mx = mm.getContext('2d');
  const mask = document.createElement('canvas'); mask.width = mask.height = WORLD.infN; const mctx = mask.getContext('2d'); const mdata = mctx.createImageData(WORLD.infN, WORLD.infN);

  ui.toast = function (text, kind = 'info') {
    const box = $('toasts'); if (!box) return;
    const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = text;
    box.appendChild(d); while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => d.remove(), 4900);
  };
  ui.handleEvents = function (events) {
    for (const e of events) {
      if (e.type === 'msg') { if (e.team !== undefined && e.team !== local) continue; ui.toast(String(e.text).replace(/ \(1 \/ 2 \/ 3\)/, ''), e.kind || 'info'); } // the cards say how to pick them
      else if (e.type === 'alert' && e.team === local) pings.push({ x: e.x, z: e.z, t: 0 });
    }
  };

  function drawMinimap(renderer, dt) {
    if (!mmBase) mmBase = renderer.minimapBase(MM);
    tMask -= dt;
    if (tMask <= 0) {
      tMask = 0.25;
      const ex = renderer.explored, vs = renderer.vis, n = WORLD.infN * WORLD.infN;
      for (let i = 0; i < n; i++) mdata.data[i * 4 + 3] = vs[i] ? 0 : ex[i] ? 75 : 215;
      mctx.putImageData(mdata, 0, 0);
    }
    const P = (x) => ((x + WORLD.half) / WORLD.size) * MM;
    mx.imageSmoothingEnabled = true;
    mx.drawImage(mmBase, 0, 0, MM, MM);
    v3.drawMinimap(mx, P, renderer, dt, 'under'); // towns, gates, front line, events (travel_ui.js / hud_map.js)
    for (const e of st.ents) { // visible demons: small red dots; allied heroes: coloured dots
      if (!e.alive) continue;
      if (e.kind === 'hero' && e.team >= 0 && e.team < 4 && e.team !== local) { mx.fillStyle = tcss(e.team); mx.beginPath(); mx.arc(P(e.x), P(e.z), 3, 0, 7); mx.fill(); }
      else if (e.team < 0 && e.kind === 'mon' && renderer.visibleNow(e.x, e.z)) { mx.fillStyle = '#d8402c'; mx.fillRect(P(e.x) - 1, P(e.z) - 1, 2, 2); }
    }
    mx.drawImage(mask, 0, 0, MM, MM);
    v3.drawMinimap(mx, P, renderer, dt, 'over');
    const hero = team.hero;
    if (hero && hero.alive) { mx.fillStyle = '#fff'; mx.strokeStyle = '#000'; mx.lineWidth = 1; mx.beginPath(); mx.arc(P(hero.x), P(hero.z), 3.6, 0, 7); mx.fill(); mx.stroke(); }
    const o = objectiveOf(st, hero); // the current objective: a pulsing gold ring
    if (o.has) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220), x = P(o.x), y = P(o.z);
      mx.strokeStyle = `rgba(255,213,96,${0.6 + 0.4 * pulse})`; mx.lineWidth = 2.2; mx.beginPath(); mx.arc(x, y, 6 + pulse * 3, 0, 7); mx.stroke();
      mx.fillStyle = '#ffd560'; mx.beginPath(); mx.moveTo(x, y - 3.5); mx.lineTo(x + 3.5, y); mx.lineTo(x, y + 3.5); mx.lineTo(x - 3.5, y); mx.closePath(); mx.fill();
    }
    for (let i = pings.length - 1; i >= 0; i--) {
      const p = pings[i]; p.t += dt;
      if (p.t > 4) { pings.splice(i, 1); continue; }
      mx.strokeStyle = `rgba(${p.rgb || '255,70,50'},${1 - p.t / 4})`; mx.lineWidth = 2; mx.beginPath(); mx.arc(P(p.x), P(p.z), 4 + ((p.t * 14) % 14), 0, 7); mx.stroke();
    }
  }
  ui.update = function (dt, renderer) {
    tMini -= dt;
    if (tMini <= 0) { tMini = 0.06; drawMinimap(renderer, 0.06); }
  };
  // modules that live in their own files (travel map, level-up cards, towns, followers, HUD)
  const v3 = createUisV3({ game, st, local, ui, renderer: game.renderer });
  const baseUpdate = ui.update, baseEvents = ui.handleEvents;
  ui.update = (dt, r) => { baseUpdate(dt, r); v3.update(dt); };
  ui.handleEvents = (evs) => { baseEvents(evs); v3.handleEvents(evs); };
  ui.v3 = v3;
  return ui;
}
