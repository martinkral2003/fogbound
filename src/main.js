import { createGame, step } from './sim.js';
import { createAI, aiInput } from './ai.js';
import { createRenderer } from './render.js';
import { createControls } from './controls.js';
import { createUI } from './ui.js';
import { BACKGROUNDS, SIM_DT, SKILLS, DIFFICULTY, DIFF_IDS } from './data.js';
import { classCards, esc } from './hud_state.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let selected = 0, diff = 'normal';
try { diff = localStorage.getItem('fogbound.diff') || 'normal'; } catch (e) { /* storage unavailable */ }
if (params.has('diff') && DIFFICULTY[params.get('diff')]) diff = params.get('diff');
if (!DIFFICULTY[diff]) diff = 'normal';
// v0.7: competitive mode (2 heroes per faction, heroes on the rival faction are real enemies) - 'coop' keeps today's game unchanged
let matchMode = params.get('mode') === 'war' ? 'war' : 'coop', mySide = Number(params.get('side')) || 0;
function buildWar() {
  const mBox = $('matchRow'); if (!mBox) return;
  mBox.querySelectorAll('button').forEach((b) => { b.classList.toggle('sel', b.dataset.m === matchMode); b.onclick = () => { matchMode = b.dataset.m; mBox.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b)); $('sideRow').classList.toggle('hidden', matchMode !== 'war'); }; });
  $('sideRow').classList.toggle('hidden', matchMode !== 'war');
  $('sideRow').querySelectorAll('button').forEach((b) => { b.classList.toggle('sel', +b.dataset.s === mySide); b.onclick = () => { mySide = +b.dataset.s; $('sideRow').querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b)); }; });
}
function buildDiff() { // difficulty buttons (easy / normal / hard / nightmare), remembered in localStorage
  const box = $('diffBtns'); if (!box) return;
  box.innerHTML = DIFF_IDS.map((id) => `<button class="btn mode${id === diff ? ' sel' : ''}" data-d="${id}">${DIFFICULTY[id].name}</button>`).join('');
  const info = () => { const el = $('diffInfo'); if (el) el.textContent = DIFFICULTY[diff].desc; };
  box.querySelectorAll('button').forEach((b) => { b.onclick = () => { diff = b.dataset.d; try { localStorage.setItem('fogbound.diff', diff); } catch (e) { /* ignore */ } box.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b)); info(); }; });
  info();
}
try { selected = Number(localStorage.getItem('fogbound.bg') || 0) || 0; } catch (e) { /* storage unavailable */ }
let game = null;

// ---------------------------------------------------------------- menu (v0.5: pick 1 of 4 classes, one line of kit preview, a big Start)
function buildMenu() {
  const cards = classCards();
  $('cards').innerHTML = cards.map((b) => `
    <div class="card" data-id="${b.id}" style="--c:${b.css}">
      <div class="em">${b.emblem}</div>
      <h3>${esc(b.name)}</h3><div class="t">${esc(b.title)}</div>
      <div class="sk3">${b.skills.map((k) => `<span title="${esc(k.name)}: ${esc(k.desc || '')}">${esc(k.icon || '✦')}</span>`).join('')}</div>
    </div>`).join('');
  document.querySelectorAll('.card').forEach((el) => { el.onclick = () => select(+el.dataset.id); el.ondblclick = () => start(+el.dataset.id); });
  select(selected);
  buildDiff();
  buildWar();
  $('startBtn').onclick = () => start(selected);
}
function select(id) {
  selected = id;
  try { localStorage.setItem('fogbound.bg', String(id)); } catch (e) { /* ignore */ }
  document.querySelectorAll('.card').forEach((el) => el.classList.toggle('sel', +el.dataset.id === id));
  const c = classCards().find((q) => q.id === id) || classCards()[0];
  if (!c) return;
  $('selInfo').innerHTML = `<b style="color:${c.css}">${esc(c.name)}</b>: ${esc(c.line)}${' <span style="color:var(--dim)">No skill at the start: you choose your skills on each level-up (up to level 15).</span>'}`;
}

// ---------------------------------------------------------------- match
// startup is heavy (island generation, terrain mesh, shader compile): run it in stages behind a loading screen
async function start(bg) {
  $('menu').classList.add('hidden');
  $('loading').classList.remove('hidden');
  const T0 = performance.now(), perf = params.has('perf');
  // let the browser paint the loading screen before each blocking stage
  const stage = async (label, pct, fn) => {
    $('loadText').textContent = label; $('loadBar').style.width = pct + '%';
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const t = performance.now(), out = fn();
    if (perf) console.log('[perf]', label, Math.round(performance.now() - t), 'ms (total', Math.round(performance.now() - T0), ')');
    return out;
  };
  const auto = params.has('auto');
  const factions = matchMode === 'war' ? (mySide === 0 ? [0, 0, 1, 1] : [1, 1, 0, 0]) : undefined;
  const st = await stage('Opening the gates...', 8, () => createGame({ seed: Number(params.get('seed')) || 1337, humans: auto ? [] : [0], bg, diff, factions }));
  game = {
    st, local: 0, auto, paused: false, speed: Number(params.get('speed')) || 1, endShown: false,
    ais: st.teams.map((t) => createAI(st, t.id)),
    togglePause() { this.paused = !this.paused; $('pause').classList.toggle('hidden', !this.paused); },
  };
  if (params.has('t')) st.t = Number(params.get('t'));
  const ff = Number(params.get('ff')) || 0;
  if (ff) await stage('Marching the demons...', 40, () => { for (let i = 0; i < (ff * 60) / SIM_DT; i++) { step(st, SIM_DT, st.teams.map((t, k) => aiInput(st, game.ais[k], SIM_DT))); st.events.length = 0; } });
  game.renderer = await stage('Shaping the land...', 55, () => createRenderer($('gl'), st, 0));
  game.renderer.ping = (x, z) => game.renderer.ringFx && game.renderer.ringFx(x, z, 3, 0xffffff, 0.8);
  game.controls = createControls($('gl'), game);
  game.ui = createUI(game);
  game.ui.toast(st.war ? 'Rivalry: the other banner is a real enemy, not just the demons. Fight them for the towns, or race them to the gates.' : 'Follow the gold arrow. Close the Demon Gates before the capital falls.', 'big');
  $('resumeBtn').onclick = () => game.togglePause();
  $('restartBtn').onclick = () => location.reload();
  document.addEventListener('visibilitychange', () => { if (document.hidden && !game.paused) game.togglePause(); });
  // compile shaders and upload textures now (one real frame) instead of hitching the first seconds of play
  await stage('Lighting the fog...', 85, () => { game.controls.update(0.016, game.renderer); game.renderer.frame(st, 1, 0.016, game.controls.view()); game.controls.clearEdges(); });
  $('hud').classList.remove('hidden');
  $('loading').classList.add('hidden');
  window.__game = game;
  last = performance.now();
  requestAnimationFrame(loop);
}

let last = 0, acc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  // rAF timestamps are frame-start times and can be OLDER than the performance.now() stamp taken at the end of loading:
  // a negative dt there drove the accumulator below zero and froze the sim clock for the first ~second
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = Math.max(last, now);
  const { st, renderer, controls, ui } = game;
  controls.update(dt, renderer);
  if (game.paused) controls.clearEdges();
  else if (!st.over) {
    acc += dt * game.speed;
    let steps = 0;
    while (acc >= SIM_DT && steps < 6) {
      const inputs = st.teams.map((t, k) => (k === game.local && !game.auto && !game.spectate ? controls.input : aiInput(st, game.ais[k], SIM_DT)));
      step(st, SIM_DT, inputs);
      controls.clearEdges();
      acc -= SIM_DT; steps++;
      if (st.events.length) { renderer.handleEvents(st.events); ui.handleEvents(st.events); st.events.length = 0; }
    }
    if (steps === 6) acc = 0;
  }
  const alpha = game.paused || st.over ? 1 : Math.min(1, acc / SIM_DT);
  renderer.frame(st, alpha, dt, controls.view());
  ui.update(dt, renderer);
}

// ---------------------------------------------------------------- mode switch: the Hero (RPG) mode is a separate module graph, loaded only on demand
function setMode(hero) {
  $('menu').classList.toggle('hero', hero); $('heroStart').classList.toggle('hidden', !hero);
  $('modeHero').classList.toggle('sel', hero); $('modeWarlord').classList.toggle('sel', !hero);
}
async function startHero() {
  $('menu').classList.add('hidden');
  try { const m = await import('./rpg/main.js'); await m.startHeroMode({ params }); }
  catch (e) { console.error(e); $('loadText').textContent = 'Failed to load Hero mode: ' + (e && e.message); $('loading').classList.remove('hidden'); }
}
async function startRts() {
  $('menu').classList.add('hidden');
  try { const m = await import('./rts/main.js'); await m.startRtsMode({ params }); }
  catch (e) { console.error(e); $('loadText').textContent = 'Failed to load Dominion mode: ' + (e && e.message); $('loading').classList.remove('hidden'); }
}
if ($('modeRts')) $('modeRts').onclick = startRts;
$('modeWarlord').onclick = () => setMode(false);
$('modeHero').onclick = () => setMode(true);
$('heroBtn').onclick = startHero;
buildMenu();
if (params.has('rts')) startRts();
else if (params.has('hero')) startHero();
else if (params.has('start')) start(Number(params.get('start')) || 0); // ?start=N: skip the menu, background N (0 soldier, 1 hunter, 2 mage, 3 outlaw)
