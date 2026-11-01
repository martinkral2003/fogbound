import { createGame, step } from './sim.js';
import { createAI, aiInput } from './ai.js';
import { createRenderer } from './render.js';
import { createControls } from './controls.js';
import { createUI } from './ui.js';
import { BACKGROUNDS, SIM_DT, SKILLS, DIFFICULTY, DIFF_IDS } from './data.js';
import { classCards, esc } from './hud_state.js';
import { createSession } from './net.js';

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
// v0.7 MQTT multiplayer (src/net.js): host gets a 4-letter room code, friend types it in and joins. Deterministic
// lockstep - see net.js's header comment for the protocol and its one known caveat (slow drift, mitigated not fixed).
let mpSession = null;
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const roomCode = () => Array.from({ length: 4 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join('');
function mpStatus(text) { const el = $('mpStatus'); if (el) el.textContent = text; }
// the client-side half of net.js's drift mitigation: snap this tab's own copies of the 4 heroes to the host's authoritative values
function applySync(session, m) {
  if (!game || !game.st || session.host || !m || !m.heroes) return;
  for (const h of m.heroes) { const team = game.st.teams[h.team]; if (team && team.hero) { team.hero.x = h.x; team.hero.z = h.z; if (team.hero.hp > 0 && h.hp > 0) team.hero.hp = h.hp; } }
}
function hostOnline() {
  const code = roomCode();
  mpSession = createSession();
  mpStatus(`Room code: ${code} - tell your friend to type this in and press Join. Waiting...`);
  mpSession.connect(code, true, {
    onJoin: () => {
      mpStatus('Friend joined - starting...');
      const factions = matchMode === 'war' ? (mySide === 0 ? [0, 0, 1, 1] : [1, 1, 0, 0]) : undefined;
      const gopts = { seed: Math.floor(Math.random() * 1e9), bgs: [selected, (selected + 1) % 4, (selected + 2) % 4, (selected + 3) % 4], diff, factions, humans: [0, 1] };
      mpSession.startGame(gopts);
      start(gopts.bgs[0], { session: mpSession, localTeam: 0, ...gopts });
    },
    onError: (e) => mpStatus('Connection error: ' + (e && e.message)),
    onSync: (m) => applySync(mpSession, m),
  });
}
function joinOnline() {
  const code = (($('roomCode') || {}).value || '').trim().toUpperCase();
  if (!code) { mpStatus('Enter the room code your friend gave you first.'); return; }
  mpSession = createSession();
  mpStatus(`Joining ${code}...`);
  mpSession.connect(code, false, {
    onStart: (m) => { mpStatus('Starting...'); start(m.bgs[1], { session: mpSession, localTeam: 1, ...m }); },
    onError: (e) => mpStatus('Connection error: ' + (e && e.message)),
    onSync: (m) => applySync(mpSession, m),
  });
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
  if ($('hostBtn')) $('hostBtn').onclick = hostOnline;
  if ($('joinBtn')) $('joinBtn').onclick = joinOnline;
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
// `online`, when present (set by hostOnline/joinOnline): {session, localTeam, seed, bgs, diff, factions, humans} -
// both peers MUST call start() with the exact same {seed,bgs,diff,factions,humans} (that object came from the
// host's 'start' broadcast) or their simulations will not match (see src/net.js's header comment).
async function start(bg, online) {
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
  const auto = online ? false : params.has('auto');
  const factions = online ? online.factions : (matchMode === 'war' ? (mySide === 0 ? [0, 0, 1, 1] : [1, 1, 0, 0]) : undefined);
  const seed = online ? online.seed : (Number(params.get('seed')) || 1337);
  const humans = online ? online.humans : (auto ? [] : [0]);
  const bgs = online ? online.bgs : undefined;
  const st = await stage('Opening the gates...', 8, () => createGame({ seed, humans, bg, bgs, diff, factions }));
  game = {
    st, local: online ? online.localTeam : 0, auto, paused: false, speed: Number(params.get('speed')) || 1, endShown: false,
    ais: st.teams.map((t) => createAI(st, t.id)),
    online: online ? { session: online.session, humanTeams: online.humans, simTick: 0, stalled: false, syncT: 0 } : null,
    togglePause() { this.paused = !this.paused; $('pause').classList.toggle('hidden', !this.paused); },
  };
  if (game.online) game.online.session.beginLockstep(online.localTeam, online.humans);
  if (params.has('t')) st.t = Number(params.get('t'));
  const ff = online ? 0 : (Number(params.get('ff')) || 0);
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
      if (game.online) {
        const on = game.online;
        on.session.queueLocalInput(controls.input); // always publish on schedule, even while stalled below (see src/net.js)
        if (on.session.hasTick(on.simTick, on.humanTeams)) {
          on.stalled = false;
          const inputs = on.session.inputsAt(on.simTick, st.teams, on.humanTeams, (id) => aiInput(st, game.ais[id], SIM_DT));
          step(st, SIM_DT, inputs);
          on.simTick++;
          controls.clearEdges();
          if (st.events.length) { renderer.handleEvents(st.events); ui.handleEvents(st.events); st.events.length = 0; }
          if (on.session.host && (on.syncT += SIM_DT) >= 3) { // periodic drift correction - see src/net.js's determinism note
            on.syncT = 0;
            on.session.publishSync(st.teams.slice(0, 4).map((t) => ({ team: t.id, x: t.hero.x, z: t.hero.z, hp: t.hero.hp })));
          }
        } else on.stalled = true;
      } else {
        const inputs = st.teams.map((t, k) => (k === game.local && !game.auto && !game.spectate ? controls.input : aiInput(st, game.ais[k], SIM_DT)));
        step(st, SIM_DT, inputs);
        controls.clearEdges();
        if (st.events.length) { renderer.handleEvents(st.events); ui.handleEvents(st.events); st.events.length = 0; }
      }
      acc -= SIM_DT; steps++;
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
