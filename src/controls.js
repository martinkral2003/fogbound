// Keyboard + mouse -> sim input struct + camera/view state. (v0.5, UI lane)
//   WASD / arrows = walk (relative to the camera); RIGHT MOUSE = walk to the cursor (click or hold)
//   LEFT MOUSE   = attack toward the cursor (hold)           1 2 3 = abilities (hold = aim, release = fire; aiming.js), 4 = ultimate (hold = charge)
//   Space / Ctrl = dodge roll (hud_ui.js)                    Q E R  = potions heal / haste / shield (hud_ui.js)       I = gear (hud_ui.js)
//   F = interact (point of interest; merchants: towns_ui.js)   H = servants follow / hold           Shift+RMB = servants attack-move
//   T = teleport to the start village, M = map and F1 = help (travel_ui.js), Z / X = rotate camera, wheel = zoom, Esc = pause.
import { clamp } from './util.js';
import { createAiming } from './aiming.js'; // SKILLS lane: skill aiming (key down = aim, release / click = fire)

// skills 1 2 3 (+ the ultimate on 4, hold = charge) are matched by PHYSICAL key (e.code), so the number row works on any layout (Czech: + ě š č)
const ABILITY = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };
const ULT_KEYS = ['Digit4', 'Numpad4'];

export function createControls(canvas, game) {
  const keys = new Set();
  const edge = [];
  const clicks = [];
  const m = { x: 0, y: 0, over: false, l: false, r: false, mid: false, shift: false };
  let wheel = 0, holding = false;
  const c = {
    yaw: -Math.PI / 2, dist: 30, aim: null, loadout: false, showTerr: false, moveTo: null, moveDir: null, stance: 'follow',
    input: { mx: 0, mz: 0, aimX: 0, aimZ: 0, atk: false, casts: [], charge: false, tele: false, repair: false, cmds: [] },
  };
  // initial yaw looks toward the island centre from the hero's spawn
  const h0 = game.st.teams[game.local].hero;
  c.yaw = Math.atan2(-h0.z, -h0.x);

  const prevent = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1']);
  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (prevent.has(e.code)) e.preventDefault();
    if (!e.repeat) { keys.add(e.code); edge.push(e.code); }
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); });
  window.addEventListener('blur', () => { keys.clear(); m.l = m.r = m.mid = false; holding = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    m.x = e.offsetX; m.y = e.offsetY; m.over = true; m.shift = e.shiftKey;
    if (e.button === 0) { m.l = true; clicks.push('l'); } else if (e.button === 2) { m.r = true; clicks.push(e.shiftKey ? 'rs' : 'r'); } else if (e.button === 1) { m.mid = true; e.preventDefault(); }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) { m.l = false; clicks.push('lu'); } else if (e.button === 2) { m.r = false; holding = false; } else if (e.button === 1) m.mid = false;
  });
  window.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const nx = e.clientX - r.left, ny = e.clientY - r.top;
    if (m.mid) c.yaw += (nx - m.x) * 0.006;
    m.x = nx; m.y = ny; m.over = e.target === canvas;
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); wheel += e.deltaY; }, { passive: false });

  const uiOpen = () => !!(game.ui && game.ui.v3 && game.ui.v3.open);

  c.update = function (dt, renderer) {
    const st = game.st, team = st.teams[game.local], hero = team.hero, inp = c.input;
    // camera: Z / X rotate; middle-drag rotates too, the wheel zooms
    if (keys.has('KeyZ') && !uiOpen()) c.yaw -= 1.8 * dt;
    if (keys.has('KeyX') && !uiOpen()) c.yaw += 1.8 * dt;
    if (wheel) { c.dist = clamp(c.dist * (1 + wheel * 0.0012), 16, 64); wheel = 0; }
    c.showTerr = false;
    if (m.over || !c.aim) c.aim = renderer.screenToGround(m.x, m.y);

    const dx = Math.cos(c.yaw), dz = Math.sin(c.yaw), rx = -dz, rz = dx;
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) { mx += dx; mz += dz; }
    if (keys.has('KeyS') || keys.has('ArrowDown')) { mx -= dx; mz -= dz; }
    if (keys.has('KeyD') || keys.has('ArrowRight')) { mx += rx; mz += rz; }
    if (keys.has('KeyA') || keys.has('ArrowLeft')) { mx -= rx; mz -= rz; }
    if (mx || mz) c.moveTo = null; // the keyboard takes over from a mouse walk
    else if (c.moveTo && hero.alive) { // walk to the clicked point (the point follows the cursor while the button is held)
      if (holding && m.r && m.over && c.aim) c.moveTo = { x: c.aim.x, z: c.aim.z };
      const vx = c.moveTo.x - hero.x, vz = c.moveTo.z - hero.z, d = Math.hypot(vx, vz);
      if (d < 1.1) c.moveTo = null; else { mx = vx / d; mz = vz / d; }
    } else if (!hero.alive) c.moveTo = null;
    c.moveDir = mx || mz ? { x: mx, z: mz } : null;
    inp.mx = mx; inp.mz = mz;
    inp.aimX = c.aim.x; inp.aimZ = c.aim.z;
    inp.atk = m.l && m.over && hero.alive && !c.aimBusy;
    inp.charge = !uiOpen() && hero.alive && !c.aimBusy && ULT_KEYS.some((k) => keys.has(k)); // key 4 = the ultimate: hold to charge, release to fire at the cursor (sim.js heroUpdate)
    inp.tele = false;   // teleporting is the command {t:'tele', ws} (T = start village, M = map, see travel.js)
    inp.repair = false;
    // a lane panel / map / help / shop is open (game.ui.v3.open): no hotkeys, no orders, the hero stands still
    if (uiOpen()) { edge.length = 0; clicks.length = 0; inp.mx = inp.mz = 0; inp.atk = false; c.moveTo = null; c.moveDir = null; }

    for (const code of edge) {
      if (code in ABILITY) { c.skillKey(ABILITY[code], code); continue; }
      switch (code) {
        case 'KeyF': if (team.poiNear) inp.cmds.push({ t: 'poi', id: team.poiNear }); break; // use the point of interest in reach (merchants: towns_ui.js)
        case 'KeyT': inp.cmds.push(team.tele ? { t: 'telecancel' } : { t: 'tele', ws: 'home' }); break; // teleport to the start village (free, channelled); the map is M
        case 'KeyC': case 'KeyV': case 'KeyB': case 'KeyN': { // orders to the allied heroes: C attack where the cursor is, V gather on me, B follow me, N act freely
          const kind = code === 'KeyC' ? 'attack' : code === 'KeyV' ? 'gather' : code === 'KeyB' ? 'follow' : 'free';
          inp.cmds.push({ t: 'order', kind, x: kind === 'attack' && c.aim ? c.aim.x : hero.x, z: kind === 'attack' && c.aim ? c.aim.z : hero.z });
          if (kind === 'attack' && c.aim) renderer.ping(c.aim.x, c.aim.z);
          game.ui.toast({ attack: 'Allies: attack there!', gather: 'Allies: gather on me', follow: 'Allies: follow me', free: 'Allies: act on your own' }[kind], 'info');
          break;
        }
        case 'KeyH': // servants: follow <-> hold
          c.stance = c.stance === 'follow' ? 'hold' : 'follow';
          inp.cmds.push({ t: c.stance });
          game.ui.toast(c.stance === 'follow' ? 'Servants follow you' : 'Servants hold position', 'info');
          break;
        case 'Escape':
          if (c.aimBusy) c.aimCancel();
          else game.togglePause();
          break;
      }
    }
    edge.length = 0;

    for (const b of clicks) {
      if ((b === 'l' || b === 'r' || b === 'rs') && c.aimInput(b === 'l' ? 'l' : 'r')) continue; // a skill is being aimed: LMB fires it, RMB cancels
      if (b === 'rs' && c.aim && hero.alive) { inp.cmds.push({ t: 'amove', x: c.aim.x, z: c.aim.z }); renderer.ping(c.aim.x, c.aim.z); } // Shift+RMB: servants attack-move
      else if (b === 'r' && c.aim && hero.alive) { c.moveTo = { x: c.aim.x, z: c.aim.z }; holding = true; renderer.ping(c.aim.x, c.aim.z); }
    }
    clicks.length = 0;
    c.updateAim(dt, renderer);
  };

  c.view = function () {
    return { yaw: c.yaw, dist: c.dist, aim: c.aim, showTerritory: false };
  };
  c.clearEdges = function () { c.input.casts = []; c.input.cmds = []; c.input.hold = {}; };
  c.input.hold = {}; c.quickCast = false; // quickCast: skills fire instantly at the cursor (no aiming)
  createAiming(game, c, keys, m);
  return c;
}
