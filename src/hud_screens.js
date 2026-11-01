// UI lane v0.5: pause settings and the end screens.
//   Victory "The gates are sealed" / Defeat "The capital has fallen", each with four numbers: demons slain, gates closed, towns saved, time.
// createScreens(ctx) -> { update(dt), handleEvents(events), showEnd() }
import { fmtT, esc, runStats } from './hud_state.js';

export function createScreens({ game, st, team }) {
  const hud = document.getElementById('h5') || document.body;
  const S = { endShown: false, tally: { saved: 0, gates: 0 }, vol: 0.7 };
  try { const v = localStorage.getItem('fogbound.vol'); if (v !== null) S.vol = Math.max(0, Math.min(1, +v)); } catch (e) { /* storage unavailable */ }
  window.__volume = S.vol;

  // ---------------------------------------------------------------- pause menu: volume, quick-cast, zoom
  const pauseBox = document.querySelector('#pause .menuBox');
  if (pauseBox && !document.getElementById('h5Settings')) {
    const sec = document.createElement('div'); sec.id = 'h5Settings';
    sec.innerHTML = `<label>Volume <input type="range" id="h5Vol" min="0" max="100" value="${Math.round(S.vol * 100)}"></label>
      <label>Quick-cast (abilities fire at once, no aiming) <input type="checkbox" id="h5Quick"></label>
      <label>Camera zoom <input type="range" id="h5Zoom" min="16" max="64" value="30"></label>
      <button class="h5-btn" id="h5HelpBtn">Controls (F1)</button>`;
    const first = pauseBox.querySelector('.btn'); pauseBox.insertBefore(sec, first || null);
    sec.querySelector('#h5Vol').oninput = (e) => { S.vol = e.target.value / 100; window.__volume = S.vol; try { localStorage.setItem('fogbound.vol', String(S.vol)); } catch (err) { /* ignore */ } };
    sec.querySelector('#h5Quick').onchange = (e) => { if (game.controls) game.controls.quickCast = e.target.checked; };
    sec.querySelector('#h5Zoom').oninput = (e) => { if (game.controls) game.controls.dist = +e.target.value; };
    sec.querySelector('#h5HelpBtn').onclick = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F1', key: 'F1' }));
  }
  function syncSettings() {
    const q = document.getElementById('h5Quick'); if (q && game.controls) q.checked = !!game.controls.quickCast;
    const z = document.getElementById('h5Zoom'); if (z && game.controls) z.value = Math.round(game.controls.dist);
  }

  // ---------------------------------------------------------------- end screen
  const end = document.createElement('div'); end.id = 'h5End'; end.className = 'hidden'; hud.appendChild(end);
  function showEnd() {
    const o = st.over || { reason: 'capital' }, win = o.reason === 'gates' || o.reason === 'warlord' || o.reason === 'lord';
    const R = runStats(st, team, S.tally);
    const title = win ? 'The fortress is destroyed' : 'The last heroes have fallen';
    const sub = win ? 'The stronghold of the invaders burns. Humanity will rebuild.' : 'The capital is lost and no hero is left to take the fight to the fortress.';
    const stats = [[R.demons, 'Demons slain'], [R.gates, 'Fortress destroyed'], [R.saved, 'Towns saved'], [fmtT(R.time), 'Time']];
    end.className = win ? 'win' : 'lose';
    end.innerHTML = `<div class="box"><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div><div class="grid">${stats.map(([b, a]) => `<div><b>${b}</b><span>${a}</span></div>`).join('')}</div>
      <div class="acts"><button class="h5-btn gold big" id="h5Again">New match</button></div></div>`;
    document.getElementById('h5Again').onclick = () => location.reload();
  }

  function update() {
    if (game.paused) syncSettings();
    if (!S.endShown && st.over) { S.endShown = true; showEnd(); }
  }
  function handleEvents(events) {
    for (const e of events) {
      if (e.type === 'townSaved') S.tally.saved++;
      else if (e.type === 'gateClosed' || e.type === 'gateDown' || (e.type === 'gate' && e.closed)) S.tally.gates++;
    }
  }
  return { update, handleEvents, showEnd };
}
