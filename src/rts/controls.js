// FOGBOUND: DOMINION RTS controls: camera (edge-pan, WASD/arrows, wheel zoom, Q/E rotate, middle-drag), mouse + keyboard dispatch.
// Selection lives in ui/ctl_select.js, orders in ui/ctl_orders.js, building placement in ui/ctl_build.js. Commands accumulate in ctl.cmds
// (drained by main.js each sim step via takeCmds()).
import { installSelect } from './ui/ctl_select.js';
import { installOrders } from './ui/ctl_orders.js';
import { loadSettings, clamp } from './ui/dom.js';

let installBuild = null;
try { installBuild = (await import('./ui/ctl_build.js')).installBuild; } catch (e) { console.warn('[rts] build tools unavailable:', e && e.message); }

export function createControls(canvas, game) {
  const { st } = game;
  const ctl = {
    st, game, canvas, renderer: game.renderer, local: game.local, ui: null, settings: loadSettings(),
    cam: { x: 0, z: 0, yaw: 0, pitch: 0.95, dist: 70 }, distT: 70, camT: null,
    sel: [], info: null, selVer: 0, mode: null, hover: 0, cmds: [], pings: [], keys: new Set(), mouse: { x: -1, y: -1, in: false },
    drag: null, showTerritory: false, fogOn: true, now: 0,
  };
  const team = st.teams[ctl.local];
  const home = (team && (team.keep || team.base)) || { x: 0, z: 0 };
  ctl.cam.x = home.x; ctl.cam.z = home.z;
  installSelect(ctl); installOrders(ctl);
  if (installBuild) ctl.build = installBuild(ctl);

  ctl.takeCmds = () => { const c = ctl.cmds; ctl.cmds = []; return c; };
  ctl.centerOn = (x, z) => { ctl.camT = { x, z }; };
  ctl.setSettings = (s) => { Object.assign(ctl.settings, s); };
  ctl.jumpGeneral = () => {
    const gs = (team.generals || []).map((id) => st.byId.get(id)).filter((g) => g && g.alive);
    if (!gs.length) { ctl.centerOn(home.x, home.z); return; }
    ctl.genIdx = ((ctl.genIdx ?? -1) + 1) % gs.length; const g = gs[ctl.genIdx]; ctl.centerOn(g.x, g.z);
    if (ctl.sel.length === 0 || ctl.sel.length === 1) ctl.select([g], false);
  };

  // ---------------------------------------------------------------- per-frame camera update
  function groundDirs() {
    // forward/right in world space derived from yaw (camera looks toward -(sin yaw, cos yaw))
    const y = ctl.cam.yaw; return { fx: -Math.sin(y), fz: -Math.cos(y), rx: Math.cos(y), rz: -Math.sin(y) };
  }
  ctl.update = function update(dt, renderer) {
    if (renderer) ctl.renderer = renderer;
    ctl.now += dt;
    const c = ctl.cam, s = ctl.settings, k = ctl.keys, d = groundDirs();
    let mx = 0, mz = 0;
    const wasd = s.wasd === 'always' || (s.wasd === 'auto' && ctl.sel.length === 0 && !ctl.info);
    if (k.has('ArrowLeft') || (wasd && k.has('KeyA'))) mx -= 1;
    if (k.has('ArrowRight') || (wasd && k.has('KeyD'))) mx += 1;
    if (k.has('ArrowUp') || (wasd && k.has('KeyW'))) mz += 1;
    if (k.has('ArrowDown') || (wasd && k.has('KeyS'))) mz -= 1;
    const m = ctl.mouse;
    if (s.edgePan && m.in && !ctl.drag && !ctl.midDrag && document.hasFocus()) {
      const W = innerWidth, H = innerHeight, E = 3;
      if (m.x <= E) mx -= 1; if (m.x >= W - E) mx += 1; if (m.y <= E) mz += 1; if (m.y >= H - E) mz -= 1;
    }
    if (mx || mz) {
      ctl.camT = null;
      const sp = (0.9 + c.dist * 0.014) * 14 * s.camSpeed * (k.has('ShiftLeft') ? 1.8 : 1) * dt, n = Math.hypot(mx, mz) || 1;
      c.x += ((d.rx * mx + d.fx * mz) / n) * sp; c.z += ((d.rz * mx + d.fz * mz) / n) * sp;
    }
    const rot = ((k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0)) * (s.invertRotate ? -1 : 1);
    if (rot) c.yaw += rot * 1.7 * dt;
    if (ctl.camT) { const a = 1 - Math.exp(-dt * 9); c.x += (ctl.camT.x - c.x) * a; c.z += (ctl.camT.z - c.z) * a; if (Math.hypot(ctl.camT.x - c.x, ctl.camT.z - c.z) < 0.3) ctl.camT = null; }
    c.dist += (ctl.distT - c.dist) * (1 - Math.exp(-dt * 10));
    c.pitch = 0.78 + clamp((c.dist - 25) / 115, 0, 1) * 0.34;
    c.x = clamp(c.x, -190, 190); c.z = clamp(c.z, -190, 190);
    ctl.pruneSel();
    for (const p of ctl.pings) p.t += dt; ctl.pings = ctl.pings.filter((p) => p.t < p.life);
    if (ctl.build) ctl.build.update(dt);
    ctl.hoverT = (ctl.hoverT || 0) - dt;
    if (ctl.hoverT <= 0 && m.in && !ctl.drag) { ctl.hoverT = 0.1; const e = ctl.pickAt(m.x, m.y); ctl.hover = e ? e.id : 0; }
  };
  ctl.clearEdges = () => {};
  ctl.view = function view() {
    const selection = new Set(ctl.sel); if (ctl.info) selection.add(ctl.info);
    const rallies = [];
    for (const b of ctl.selBlds()) if (b.rally) rallies.push({ bld: b.id, x0: b.x, z0: b.z, x: b.rally.x, z: b.rally.z });
    return {
      cam: ctl.cam, selection, hover: ctl.hover, ghosts: ctl.build ? ctl.build.ghosts() : [], rallies, pings: ctl.pings,
      drag: ctl.drag && ctl.drag.box ? { x0: ctl.drag.x0, y0: ctl.drag.y0, x1: ctl.drag.x1, y1: ctl.drag.y1 } : null, showTerritory: ctl.showTerritory || !!(ctl.build && ctl.build.active), fogOn: ctl.fogOn,
    };
  };

  // ---------------------------------------------------------------- mouse
  const over = (e) => e.target === canvas;
  const onDown = (e) => {
    ctl.mouse.x = e.clientX; ctl.mouse.y = e.clientY; ctl.mouse.in = true;
    if (!over(e)) return;
    if (e.button === 1) { ctl.midDrag = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
    if (ctl.game.paused) return;
    if (e.button === 0) {
      if (ctl.build && ctl.build.active) { ctl.build.down(e.clientX, e.clientY, e.shiftKey, e.ctrlKey); return; }
      if (ctl.mode) { ctl.drag = null; ctl.targetClick(e.clientX, e.clientY, e.shiftKey); return; }
      ctl.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, box: false };
    }
  };
  const onMove = (e) => {
    ctl.mouse.x = e.clientX; ctl.mouse.y = e.clientY; ctl.mouse.in = true;
    if (ctl.midDrag) {
      const dx = e.clientX - ctl.midDrag.x, dy = e.clientY - ctl.midDrag.y; ctl.midDrag.x = e.clientX; ctl.midDrag.y = e.clientY;
      ctl.cam.yaw += dx * 0.006 * (ctl.settings.invertRotate ? -1 : 1); ctl.distT = clamp(ctl.distT + dy * 0.2, 22, 150); return;
    }
    if (ctl.build && ctl.build.active) ctl.build.move(e.clientX, e.clientY, e.shiftKey, e.ctrlKey);
    if (ctl.drag) { ctl.drag.x1 = e.clientX; ctl.drag.y1 = e.clientY; if (Math.hypot(ctl.drag.x1 - ctl.drag.x0, ctl.drag.y1 - ctl.drag.y0) > 6) ctl.drag.box = true; }
  };
  const onUp = (e) => {
    if (e.button === 1) { ctl.midDrag = null; return; }
    if (e.button === 0) {
      if (ctl.build && ctl.build.active && ctl.build.dragging) { ctl.build.up(e.clientX, e.clientY, e.shiftKey, e.ctrlKey); return; }
      const d = ctl.drag; ctl.drag = null; if (!d) return;
      if (d.box) ctl.boxSelect(d.x0, d.y0, d.x1, d.y1, e.shiftKey); else ctl.clickSelect(d.x0, d.y0, e.shiftKey, ctl.now);
    } else if (e.button === 2 && over(e) && !ctl.game.paused) {
      if (ctl.mode || (ctl.build && ctl.build.active)) { ctl.cancelMode(); return; }
      const dbl = ctl.now - (ctl.lastRight || -9) < 0.3; ctl.lastRight = ctl.now;
      ctl.smartCommand(e.clientX, e.clientY, e.shiftKey, e.ctrlKey, dbl);
    }
  };
  const onWheel = (e) => {
    if (!over(e)) return; e.preventDefault();
    if (ctl.build && ctl.build.active && e.shiftKey) { ctl.build.rotate(e.deltaY > 0 ? 1 : -1); return; }
    ctl.distT = clamp(ctl.distT * (e.deltaY > 0 ? 1.12 : 0.89), 22, 150);
  };
  const onLeave = () => { ctl.mouse.in = false; };
  canvas.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('mouseleave', onLeave);

  // ---------------------------------------------------------------- keyboard
  const typing = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  const onKeyDown = (e) => {
    if (typing(e)) return;
    const code = e.code;
    if (!e.repeat) ctl.keys.add(code); else if (/^(Arrow|Key[QE])/.test(code)) e.preventDefault();
    if (code === 'Tab' || (e.ctrlKey && code === 'KeyA') || code === 'Space' || /^F\d/.test(code)) e.preventDefault();
    if (e.repeat && !/^(Key[ZX])$/.test(code)) return;
    if (ctl.ui && ctl.ui.keyHandler && ctl.ui.keyHandler(e)) { e.preventDefault(); return; }
    if (game.paused) return;
    handleKey(e);
  };
  const onKeyUp = (e) => { ctl.keys.delete(e.code); };
  function handleKey(e) {
    const code = e.code, now = ctl.now, dm = /^Digit([0-9])$/.exec(code);
    if (dm && !(ctl.ui && ctl.ui.cardNumber && ctl.ui.cardNumber(+dm[1], e))) { ctl.groupKey(+dm[1], e.ctrlKey || e.metaKey, e.shiftKey, now); return; }
    if (e.ctrlKey && code === 'KeyA') { ctl.selectAllMilitary(); return; }
    if (e.ctrlKey || e.metaKey) return;
    if (code === 'Escape') { if (!ctl.cancelMode()) ctl.game.togglePause && ctl.game.togglePause(); return; }
    if (code === 'Space' || code === 'Home') { ctl.jumpGeneral(); return; }
    if (code === 'Tab') { if (e.shiftKey) ctl.cycleSelectedTypes(); else if (!ctl.selectIdleWorkers(true)) ctl.cycleSelectedTypes(); return; }
    if (code === 'Period') { ctl.selectIdleWorkers(false); return; }
    if (code === 'Equal' || code === 'NumpadAdd') { ctl.game.setSpeed && ctl.game.setSpeed(1); return; }
    if (code === 'Minus' || code === 'NumpadSubtract') { ctl.game.setSpeed && ctl.game.setSpeed(-1); return; }
    if (code === 'Backquote') { ctl.showTerritory = !ctl.showTerritory; return; }
    if (/^Key[A-Z]$/.test(code) && ctl.ui && ctl.ui.cardKey) ctl.ui.cardKey(code.slice(3), e);
    else if (ctl.ui && ctl.ui.cardKey && /^(BracketLeft|BracketRight|Comma)$/.test(code)) ctl.ui.cardKey(code, e);
  }
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { ctl.keys.clear(); ctl.drag = null; ctl.midDrag = null; });
  ctl.dispose = () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  return ctl;
}
