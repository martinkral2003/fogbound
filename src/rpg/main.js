// FOGBOUND: HERO entry. Loaded on demand by src/main.js (startHeroMode). Staged loading, fixed 30 Hz sim with interpolation,
// pause on blur, spectate camera, UI integration (src/rpg/ui/index.js when present, else a debug HUD).
import { createRpg, stepRpg } from './core.js';
import { SIM_DT } from './consts.js';
import { createRpgControls } from './controls.js';
import { createRpgRenderer } from './render.js';
import { createDebugHud } from './debughud.js';

const $ = (id) => document.getElementById(id);

export async function startHeroMode({ params = new URLSearchParams(location.search) } = {}) {
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
  const seed = Number(params.get('seed')) || 1337;
  const st = await stage('Raising the island...', 10, () => createRpg({ seed, rivals: params.has('rivals') ? Number(params.get('rivals')) : 9 }));
  const game = {
    st, paused: false, speed: Number(params.get('speed')) || 1, hudMode: 'debug', spectate: false, focus: null, endShown: false, acc: 0,
    ui: null, controls: null, renderer: null, debug: null,
    player() { return st.player; },
    queue(cmd) { if (game.controls) game.controls.queue(cmd); },
    toast(t, kind) { if (game.ui && game.ui.ctx) game.ui.ctx.toast(t, kind); if (game.debug) game.debug.toast(t); },
    onNewMatch() { location.reload(); },
    onSpectate() { game.spectate = true; game.pickSpectateTarget(); if (game.ui && game.ui.setSpectating) game.ui.setSpectating(true); },
    onResume() { game.userPaused = false; },
    onSettings(s) { if (game.controls && s) { if (s.sens) game.controls.cam.sens = 0.0024 * s.sens; if (s.fov && game.renderer) game.renderer.setFov(s.fov); if (s.invertY !== undefined) game.controls.cam.invertY = !!s.invertY; } },
    pickSpectateTarget() {
      const alive = st.actors.filter((a) => a.alive && (a.kind === 'rival' || a.kind === 'player'));
      if (!alive.length) { game.focus = null; return; }
      const p = st.player, i = alive.indexOf(game.focus);
      game.focus = alive[(i + 1) % alive.length];
      if (p && !p.alive && i < 0) alive.sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z)), game.focus = alive[0];
    },
    isPaused() { return game.userPaused || document.hidden || (game.ui && game.ui.panels && game.ui.panels.pause && game.ui.panels.pause.isOpen && game.ui.panels.pause.isOpen()) || false; },
  };
  const canvas = $('gl');
  game.renderer = await stage('Shaping the terrain...', 35, () => createRpgRenderer(canvas, st, game, { maxDpr: 1.5 }));
  game.controls = createRpgControls(canvas, { st, ui: () => game.ui, paused: () => game.isPaused(), noPauseOnUnlock: () => game.spectate && !st.player.alive });
  game.renderer.bindControls(game.controls);
  await stage('Waking the villagers...', 60, async () => {
    // UI agents' DOM screens: loaded defensively, the debug HUD covers for whatever is missing
    let root = $('rpgUiRoot');
    if (!root) { root = document.createElement('div'); root.id = 'rpgUiRoot'; document.body.appendChild(root); }
    try {
      const m = await import('./ui/index.js');
      game.ui = m.createRpgUI(root, { st, queue: game.queue, player: game.player, toast: game.toast, controls: game.controls, onNewMatch: game.onNewMatch, onSpectate: game.onSpectate, onResume: game.onResume, onSettings: game.onSettings });
    } catch (e) { console.warn('[rpg] UI not available, using the debug HUD:', e && e.message); }
    game.debug = createDebugHud(game, document.body);
  });
  await stage('Lighting the fog...', 85, () => { game.controls.update(0.016); game.renderer.frame(st, 1, 0.016, 0, null); });
  const hint = document.createElement('div'); hint.id = 'rpgHint'; hint.textContent = 'Click to capture the mouse';
  hint.style.cssText = 'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);padding:6px 16px;background:rgba(8,10,12,.7);color:#e0bb5c;border:1px solid #6a5a2a;border-radius:6px;font:14px Georgia,serif;pointer-events:none;z-index:6;transition:opacity .4s';
  document.body.appendChild(hint);
  loading.classList.add('hidden');
  window.__rpg = game; window.__game = null;
  game.debug.toast('Landing. The calm lasts 45 seconds.');
  document.addEventListener('keydown', (e) => { if (!st.player.alive && (e.code === 'Tab' || e.code === 'KeyQ') && !e.repeat) { e.preventDefault(); game.pickSpectateTarget(); game.spectate = true; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.ui && game.ui.open && st.player.alive) game.ui.open('pause'); });

  let last = performance.now();
  function snapshot() { for (const a of st.actors) { a.ox = a.x; a.oy = a.y; a.oz = a.z; a.oyaw = a.yaw; } }
  function loop(nowMs) {
    requestAnimationFrame(loop);
    const dt = Math.max(0, Math.min(0.1, (nowMs - last) / 1000)); last = Math.max(last, nowMs);
    const { controls, renderer } = game, ui = game.ui, p = st.player;
    const paused = game.isPaused();
    controls.update(dt);
    if (!paused) {
      game.acc += dt * game.speed;
      let steps = 0;
      while (game.acc >= SIM_DT && steps < 5) {
        snapshot();
        stepRpg(st, SIM_DT, { [p.id]: controls.input, player: controls.input });
        controls.clearEdges();
        game.acc -= SIM_DT; steps++;
        if (st.events.length) { const ev = st.events.splice(0); renderer.handleEvents(ev); if (ui) ui.handleEvents(ev); game.debug.handleEvents(ev); }
      }
      if (steps === 5) game.acc = 0;
    } else controls.clearEdges();
    const alpha = paused ? 1 : Math.min(1, game.acc / SIM_DT);
    // dead: orbit the body, then spectate a rival (Tab / Q cycles)
    if (!p.alive) { if ((game.focus && !game.focus.alive) || (!game.focus && st.t - (p.diedAt || 0) > 3.5 && st.match.state !== 'over')) game.pickSpectateTarget(); }
    else { game.focus = null; game.spectate = false; }
    renderer.frame(st, alpha, dt, st.t, game.focus || p);
    if (ui) ui.update(dt);
    game.debug.update(dt, !!(ui && ui.panels && ui.panels.hud));
    hint.style.opacity = controls.locked || game.isPaused() || (ui && ui.isModalOpen && ui.isModalOpen()) ? 0 : 1;
  }
  requestAnimationFrame(loop);
  if (params.has('spectate')) { game.spectate = true; }
  return game;
}
