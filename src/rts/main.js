// FOGBOUND: DOMINION entry. Loaded on demand by src/main.js (dynamic import, like the Hero mode).
// Skirmish setup -> staged loading -> createRts -> renderer (render.js, falling back to render_stub.js) + controls + UI -> fixed 30 Hz loop.
import { createRts, step } from './core.js';
import { SIM_DT, FACTIONS } from './consts.js';
import { createControls } from './controls.js';

const $ = (id) => document.getElementById(id);

function ensureDom() {
  if (!document.querySelector('link[href*="rts.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../rts.css', import.meta.url).href; document.head.appendChild(l); }
  if (!$('gl')) { const c = document.createElement('canvas'); c.id = 'gl'; c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block'; document.body.prepend(c); }
  if (!$('loading')) {
    const d = document.createElement('div'); d.id = 'loading'; d.className = 'hidden';
    d.innerHTML = '<div class="menuBox small"><h2>FOGBOUND</h2><div id="loadText">Raising the island...</div><div class="lbar"><i id="loadBar"></i></div></div>';
    document.body.appendChild(d);
    if (!document.querySelector('link[href*="style.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../style.css', import.meta.url).href; document.head.appendChild(l); }
  }
}

async function loadRenderer(canvas, st, local) {
  try {
    const m = await import('./render.js');
    if (m.createRtsRenderer) return await m.createRtsRenderer(canvas, st, local);
  } catch (e) { console.warn('[rts] render.js unavailable, using the placeholder renderer:', e && e.message); }
  const s = await import('./render_stub.js');
  return s.createRtsRenderer(canvas, st, local);
}

export async function startRtsMode({ params = new URLSearchParams(location.search) } = {}) {
  ensureDom();
  const menu = $('menu'); if (menu) menu.classList.add('hidden');
  let ui = null, uiMod = null;
  try { uiMod = await import('./ui/index.js'); } catch (e) { console.warn('[rts] UI module unavailable:', e && e.message); }
  // 1) skirmish setup screen (skipped with ?start=N)
  let opts;
  if (params.has('start') || params.has('faction')) {
    opts = { faction: Number(params.get('start') ?? params.get('faction')) || 0, ai: Number(params.get('ai') ?? 3), difficulty: params.get('diff') || 'normal', seed: Number(params.get('seed')) || 1337 };
  } else if (uiMod && uiMod.showSetup) opts = await uiMod.showSetup(params);
  else opts = { faction: 0, ai: 3, difficulty: 'normal', seed: 1337 };
  const loading = $('loading'), loadText = $('loadText'), loadBar = $('loadBar');
  loading.classList.remove('hidden');
  const perf = params.has('perf'), T0 = performance.now();
  const stage = async (label, pct, fn) => {
    loadText.textContent = label; loadBar.style.width = pct + '%';
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const t = performance.now(), out = await fn();
    if (perf) console.log('[perf]', label, Math.round(performance.now() - t), 'ms (total', Math.round(performance.now() - T0), ')');
    return out;
  };
  const local = Math.max(0, Math.min(3, opts.faction | 0));
  const others = [0, 1, 2, 3].filter((i) => i !== local), nAi = Math.max(0, Math.min(3, opts.ai));
  const auto = params.has('auto');
  const st = await stage('Raising the island...', 10, () => createRts({ seed: opts.seed, humans: auto ? [] : [local], ai: auto ? [0, 1, 2, 3] : others.slice(0, nAi), difficulty: opts.difficulty }));
  const game = {
    st, local, auto, paused: false, userPaused: false, speed: Number(params.get('speed')) || 1, acc: 0, endShown: false, opts,
    setSpeed(dir) { const s = [1, 2, 3]; const i = Math.max(0, s.indexOf(game.speed)); game.speed = s[Math.max(0, Math.min(2, i + dir))]; if (game.ui && game.ui.toast) game.ui.toast('Game speed ' + game.speed + 'x'); },
    togglePause() { game.userPaused = !game.userPaused; game.paused = game.userPaused; if (game.ui && game.ui.setPaused) game.ui.setPaused(game.paused); },
    quit() { location.reload(); },
  };
  game.renderer = await stage('Shaping the terrain...', 35, () => loadRenderer($('gl'), st, local));
  game.controls = createControls($('gl'), game);
  await stage('Raising the banners...', 65, () => { if (uiMod && uiMod.createRtsUI) { game.ui = uiMod.createRtsUI(game); game.controls.ui = game.ui; } });
  await stage('Lighting the fog...', 85, () => { game.controls.update(0.016, game.renderer); game.renderer.frame(st, 1, 0.016, game.controls.view()); });
  if (game.renderer.resize) addEventListener('resize', () => game.renderer.resize());
  const blur = () => { if (!game.paused && !game.over) { game.paused = true; game.blurPaused = true; if (game.ui && game.ui.setPaused) game.ui.setPaused(true); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) blur(); });
  window.__rts = { st, controls: game.controls, renderer: game.renderer, ui: game.ui, game };
  loading.classList.add('hidden');
  game.last = performance.now();
  requestAnimationFrame((t) => loop(game, t));
  return game;
}

function loop(game, now) {
  requestAnimationFrame((t) => loop(game, t));
  const { st, renderer, controls, ui } = game;
  const dt = Math.max(0, Math.min(0.1, (now - game.last) / 1000)); game.last = Math.max(game.last, now);
  controls.update(dt, renderer);
  if (!game.paused && !st.over) {
    game.acc += dt * game.speed;
    let steps = 0;
    while (game.acc >= SIM_DT && steps < 5) {
      for (const e of st.ents) { e.ox = e.x; e.oz = e.z; }
      const inputs = {};
      if (!game.auto && st.teams[game.local].alive) inputs[game.local] = { cmds: controls.takeCmds() }; else controls.takeCmds();
      step(st, SIM_DT, inputs);
      game.acc -= SIM_DT; steps++;
      if (st.events.length) { const ev = st.events.splice(0); try { renderer.handleEvents(ev); } catch (e) { console.error(e); } if (ui) ui.handleEvents(ev); }
    }
    if (steps === 5) game.acc = 0;
  }
  const alpha = game.paused || st.over ? 1 : Math.min(1, game.acc / SIM_DT);
  renderer.frame(st, alpha, dt, controls.view());
  if (ui) ui.update(dt);
  if (!game.endShown && ui && ui.showEnd) {
    const me = st.teams[game.local];
    if (st.over || (!me.alive && !game.auto)) { game.endShown = true; game.over = true; ui.showEnd(st.over || { winner: -1, reason: 'defeat' }); }
  }
}
export { FACTIONS };
