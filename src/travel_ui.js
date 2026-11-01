// v0.5 client module "travel_ui" (UI lane): full-screen map (M), waystone teleport UX, minimap overlays, key help (F1 / ?). Map layers: hud_map.js.
// Contract: see src/V3.md. createUi(ctx) -> { update(dt), handleEvents(events), drawMinimap(mx, P, renderer, dt, phase), open }.
// ctx = { game, st, local, ui, renderer }. Everything that other lanes may not have written yet is accessed defensively.
import { WORLD } from './data.js';
import { createMapLayers } from './hud_map.js'; // towns, gates, front line, assaults, allies, events, objective
import { TRAVEL, destinationsOf, canTeleport, waystoneById, homeWaystone, wsName, wsOwner, isHome, isBlocked, cooldownFor } from './travel.js';

export function createView(ctx) { return null; } // no scene objects (waystone markers are drawn by render.js from waypointsOf)

const $ = (id) => document.getElementById(id);
const arr = (a) => (Array.isArray(a) ? a : []);
const GOLD = '#ffe070';
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Key help: 8 lines. Other lanes may append rows before the overlay is first opened: window.__v3help.push({ title, rows: [['K', 'what it does']] })
const HELP = [
  { title: 'Keys', rows: [['W A S D', 'walk (arrow keys too); right-click also walks to the cursor'], ['Left-click', 'attack toward the cursor (hold)'], ['1 2 3 4', 'abilities: hold to aim, release to fire (4 = ultimate from level 5, hold to charge)'], ['Q E R', 'potions: heal, haste, shield'], ['Space', 'dodge roll (Ctrl too)'], ['F', 'shop and hire in a town, use things'], ['C  V  B  N', 'allies: attack where the cursor is / gather on me / follow me / act freely (also the buttons by the allies list)'], ['I  M  H  T', 'gear, map (click a waystone to travel), servants follow/hold, home'], ['Z X  Esc', 'turn camera, pause']] },
];

export function createUi(ctx) {
  const { game, st, local } = ctx;
  const team = st.teams[local];
  const renderer = ctx.renderer || game.renderer;
  const S = { open: false, helpOpen: false, sel: 0, t: 0, view: { cx: 0, cz: 0, s: 1 }, drag: null, hover: null, hits: [], fitS: 1, baseSize: 0 };
  const pings = [];           // minimap pings from events { x, z, t, rgb }
  const layers = createMapLayers({ st, local, renderer }); // v0.4 layers (hud_map.js)
  let base = null, baseBusy = false;

  // ---------------------------------------------------------------- data helpers
  const half = () => WORLD.half;
  const N = () => WORLD.infN, C = () => WORLD.infCell;
  const expl = (x, z) => { const ex = renderer.explored, n = N(), c = C(); const i = Math.floor((x + half()) / c), j = Math.floor((z + half()) / c); return i >= 0 && j >= 0 && i < n && j < n ? ex[j * n + i] === 1 : false; };
  // ---------------------------------------------------------------- topbar items + raid banner
  // ---------------------------------------------------------------- map overlay DOM
  const ov = document.createElement('div'); ov.id = 'v3map'; ov.className = 'v3-overlay hidden';
  ov.innerHTML = `
    <canvas id="v3mapCv"></canvas>
    <div class="v3-panel v3-top"><span class="v3-title">Map</span><span class="v3-sub">drag: pan &middot; wheel: zoom &middot; click a gold waystone to travel</span>
      <button class="v3-btn" id="v3mFit" title="Show the whole island">Fit</button><button class="v3-btn" id="v3mHero" title="Centre on your hero">Hero</button><button class="v3-x" id="v3mX" title="Close (M / Esc)">&times;</button></div>
    <div class="v3-panel v3-legend" id="v3mLeg"></div>
    <div class="v3-panel v3-sel hidden" id="v3mSel"></div>
    <div class="v3-tip hidden" id="v3mTip"></div>
    <div class="v3-wait" id="v3mWait">Charting the island&hellip;</div>`;
  document.body.appendChild(ov);
  const cv = $('v3mapCv'), g = cv.getContext('2d');
  const legend = [
    ['<i class="tw">&#9733;</i>', 'Capital: the only safe place (it will fall)'], ['<i class="rg"></i>', 'Town: green standing, orange attacked, grey fallen (not safe)'], ['<i class="gt"></i>', 'Fortress: find it in the ruins and destroy it'],
    ['<i class="dm"></i>', 'Waystone (click to travel)'], ['<i class="po">!</i>', 'Event or dungeon'], ['<i class="fl"></i>', 'Red band = ground the demons hold'], ['<i class="hr"></i>', 'You'],
  ];
  $('v3mLeg').innerHTML = '<div class="v3-hd">Legend</div>' + legend.map(([i, t]) => `<div class="v3-row">${i}<span>${t}</span></div>`).join('');
  const maskC = document.createElement('canvas'); let maskCtx = null, maskData = null, maskT = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(window.innerWidth * dpr); cv.height = Math.round(window.innerHeight * dpr);
    cv.style.width = window.innerWidth + 'px'; cv.style.height = window.innerHeight + 'px';
    cv._dpr = dpr;
    S.fitS = (Math.min(window.innerWidth, window.innerHeight - 70) / WORLD.size) * 0.94;
  }
  function fit() { resize(); S.view.cx = 0; S.view.cz = 0; S.view.s = S.fitS; }
  window.addEventListener('resize', () => { if (S.open) resize(); });

  function ensureBase(cb) {
    if (base) return cb();
    if (baseBusy || !renderer || !renderer.minimapBase) return;
    baseBusy = true; $('v3mWait').classList.remove('hidden');
    setTimeout(() => { try { base = renderer.minimapBase(768); } catch (e) { console.error(e); } baseBusy = false; $('v3mWait').classList.add('hidden'); if (base) cb(); }, 40);
  }

  // ---------------------------------------------------------------- open / close
  function openMap(selId) {
    if (S.open || !game || game.paused) return;
    S.helpOpen = false; $('v3help').classList.add('hidden');
    S.open = true; ov.classList.remove('hidden'); fit();
    const d = destinationsOf(st, local, true);
    S.sel = selId && d.some((x) => x.id === selId) ? selId : 0;
    if (S.sel) { const w = waystoneById(st, S.sel); S.view.cx = w.x * 0.5; S.view.cz = w.z * 0.5; }
    ensureBase(() => {});
    maskT = 0; renderSel();
  }
  function closeMap() { if (!S.open) return; S.open = false; S.drag = null; ov.classList.add('hidden'); $('v3mTip').classList.add('hidden'); }
  $('v3mX').onclick = closeMap;
  $('v3mFit').onclick = fit;
  $('v3mHero').onclick = () => { const h = team.hero; if (h) { S.view.cx = h.x; S.view.cz = h.z; S.view.s = Math.max(S.view.s, S.fitS * 2.2); } };
  if ($('mapBtn')) $('mapBtn').onclick = () => openMap();

  // ---------------------------------------------------------------- help overlay
  const help = document.createElement('div'); help.id = 'v3help'; help.className = 'v3-overlay hidden';
  document.body.appendChild(help);
  function renderHelp() {
    const extra = arr(window.__v3help);
    help.innerHTML = `<div class="v3-panel v3-helpbox"><div class="v3-hd"><span>Controls</span><button class="v3-x" id="v3hX">&times;</button></div><div class="v3-cols">`
      + HELP.concat(extra).map((s) => `<div class="v3-sec"><h4>${esc(s.title)}</h4>${s.rows.map(([k, t]) => `<div class="v3-row"><kbd>${esc(k)}</kbd><span>${esc(t)}</span></div>`).join('')}</div>`).join('')
      + `</div><div class="v3-foot">Follow the gold arrow. Close every Demon Gate before the capital falls.</div></div>`;
    $('v3hX').onclick = () => toggleHelp(false);
  }
  function toggleHelp(on) {
    S.helpOpen = on === undefined ? !S.helpOpen : on;
    if (S.helpOpen) { closeMap(); renderHelp(); }
    help.classList.toggle('hidden', !S.helpOpen);
  }
  help.addEventListener('mousedown', (e) => { if (e.target === help) toggleHelp(false); });

  // ---------------------------------------------------------------- keys (capture phase: runs before controls.js and swallows what the overlays own)
  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); };
    if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) { eat(); if (!e.repeat) { if (S.open) closeMap(); else if (!S.helpOpen) openMap(); } return; }
    if (e.code === 'F1' || (e.code === 'Slash' && e.shiftKey)) { eat(); if (!e.repeat) toggleHelp(); return; }
    if (e.code === 'Escape' && (S.open || S.helpOpen)) { eat(); if (S.open) closeMap(); else toggleHelp(false); return; }
    if (S.open && (e.code === 'Enter' || e.code === 'NumpadEnter')) { eat(); confirmTeleport(); return; }
  }, true);

  // ---------------------------------------------------------------- selection panel + confirm
  function renderSel() {
    const el = $('v3mSel');
    if (!S.sel) { el.classList.add('hidden'); return; }
    const w = waystoneById(st, S.sel);
    if (!w) { el.classList.add('hidden'); return; }
    const chk = canTeleport(st, team, w), home = isHome(st, w, local), blocked = isBlocked(st, w, local);
    const town = arr(st.towns).find((t) => t.wsId === w.id || t.id === w.townId) || null;
    const dist = Math.round(Math.hypot(team.hero.x - w.x, team.hero.z - w.z));
    const cd = Math.round(cooldownFor(st, team, w));
    el.classList.remove('hidden');
    el.innerHTML = `<div class="v3-hd"><span>${esc(wsName(st, w))}${home ? ' (start)' : ''}</span></div>
      <div class="v3-row"><span>${town ? esc(town.kind === 'capital' ? 'Capital' : town.kind === 'town' ? 'Town' : 'Village') + ' · ' + esc(town.state === 'besieged' ? 'under siege' : town.state) : 'Waystone'}</span></div>
      <div class="v3-row"><span>Distance</span><b>${dist} m</b></div>
      <div class="v3-row"><span>Channel</span><b>${TRAVEL.channel} s standing still</b></div>
      <div class="v3-row"><span>Cooldown after</span><b>${home ? 'none' : cd + ' s'}</b></div>
      <button class="v3-btn gold" id="v3mGo" ${chk.ok ? '' : 'disabled'}>Teleport <kbd>Enter</kbd></button>
      <div class="v3-note">${chk.ok ? 'Damage or movement interrupts.' : esc(chk.reason || (blocked ? 'This waystone is down' : ''))}</div>`;
    const go = $('v3mGo'); if (go) go.onclick = confirmTeleport;
  }
  function confirmTeleport() {
    if (!S.sel) return;
    const w = waystoneById(st, S.sel), chk = canTeleport(st, team, w);
    if (!chk.ok) { game.ui.toast(chk.reason, 'warn'); return; }
    game.controls.input.cmds.push({ t: 'tele', ws: w.id });
    game.ui.toast('Channelling to ' + wsName(st, w) + '... stand still', 'info');
    closeMap();
  }

  // ---------------------------------------------------------------- map drawing
  const sx = (x) => window.innerWidth / 2 + (x - S.view.cx) * S.view.s;
  const sz = (z) => window.innerHeight / 2 + (z - S.view.cz) * S.view.s;
  function diamond(x, y, r, fill, stroke, w = 1.5) {
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
    g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.lineWidth = w; g.stroke();
  }
  function label(txt, x, y, col = '#e8ecdf', size = 12) {
    g.font = `${size}px "Palatino Linotype", Palatino, Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(txt, x, y); g.fillStyle = col; g.fillText(txt, x, y);
  }
  function hit(kind, x, y, r, obj, tip) { S.hits.push({ kind, x, y, r, obj, tip }); }

  function drawMap(dt) {
    const dpr = cv._dpr || 1, W = window.innerWidth, Hh = window.innerHeight, s = S.view.s, Hf = half(), now = performance.now() / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#04070a'; g.fillRect(0, 0, W, Hh);
    S.hits.length = 0;
    if (base) { g.imageSmoothingEnabled = true; g.drawImage(base, sx(-Hf), sz(-Hf), WORLD.size * s, WORLD.size * s); }
    // coast frame
    g.strokeStyle = 'rgba(120,140,150,0.25)'; g.lineWidth = 1; g.strokeRect(sx(-Hf), sz(-Hf), WORLD.size * s, WORLD.size * s);
    layers.update(); const T = { x: sx, y: sz, k: s, full: true, now, hit, label };
    layers.draw(g, T, 'under');
    // fog / explored
    const n = N();
    if (!maskCtx || maskC.width !== n) { maskC.width = maskC.height = n; maskCtx = maskC.getContext('2d'); maskData = maskCtx.createImageData(n, n); maskT = 0; }
    maskT -= dt;
    if (maskT <= 0) {
      maskT = 0.4; const ex = renderer.explored, vs = renderer.vis, d = maskData.data;
      for (let i = 0; i < n * n; i++) { d[i * 4 + 3] = vs[i] ? 0 : ex[i] ? 60 : 205; d[i * 4] = 3; d[i * 4 + 1] = 6; d[i * 4 + 2] = 10; }
      maskCtx.putImageData(maskData, 0, 0);
    }
    g.imageSmoothingEnabled = true; g.drawImage(maskC, sx(-Hf), sz(-Hf), WORLD.size * s, WORLD.size * s);
    layers.draw(g, T, 'over');
    // waystones
    const dest = destinationsOf(st, local, true), selId = S.sel;
    for (const d of dest) {
      const x = sx(d.x), y = sz(d.z), sel = d.id === selId, r = sel ? 9 + Math.sin(now * 6) * 1.2 : 7.5;
      const fill = d.blocked ? 'rgba(120,36,30,0.9)' : d.home ? '#fff3b0' : GOLD, stroke = d.blocked ? '#ff7a66' : sel ? '#fff' : '#6a4e10';
      if (sel) { g.beginPath(); g.arc(x, y, r + 7, 0, 7); g.strokeStyle = 'rgba(255,230,120,0.6)'; g.lineWidth = 2; g.stroke(); }
      diamond(x, y, r, fill, stroke, sel ? 2.4 : 1.6);
      hit('ws', x, y, 13, d, `${d.name}${d.home ? ' (start village)' : ''} - ${d.blocked ? 'waystone is down, cannot travel here' : Math.round(d.dist) + ' m' + (d.home ? '' : ', cooldown ' + Math.round(d.cd) + ' s')}`);
    }
    // undiscovered waystones in explored territory: faint hint
    for (const w of arr(st.waystones)) if (!w.disc[local] && expl(w.x, w.z)) { const x = sx(w.x), y = sz(w.z); g.globalAlpha = 0.45; diamond(x, y, 5, 'rgba(0,0,0,0)', '#9aa098', 1.2); g.globalAlpha = 1; hit('ws?', x, y, 8, w, 'Undiscovered waystone - walk close to it'); }
    const h = team.hero;
    if (h && h.alive) {
      const x = sx(h.x), y = sz(h.z);
      g.save(); g.translate(x, y); g.rotate(h.face || 0); g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, 6); g.lineTo(-3, 0); g.lineTo(-6, -6); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#4fe3c1'; g.lineWidth = 2; g.stroke(); g.restore();
      if (team.tele) { g.beginPath(); g.arc(x, y, 12 + 6 * (1 - team.tele.left / team.tele.total), 0, 7); g.strokeStyle = GOLD; g.lineWidth = 2; g.stroke(); }
    }
    // hover highlight handled by the tooltip; draw it
    const hv = S.hover;
    const tip = $('v3mTip');
    if (hv && hv.tip) { tip.textContent = hv.tip; tip.classList.remove('hidden'); tip.style.left = Math.min(W - 280, S.mx + 16) + 'px'; tip.style.top = Math.min(Hh - 40, S.my + 16) + 'px'; }
        else tip.classList.add('hidden');
  }

  // map input
  function pickAt(mx, my) {
    let best = null, bd = 1e9;
    for (const h of S.hits) { const d = Math.hypot(h.x - mx, h.y - my); if (d <= h.r + 3 && d - (h.kind === 'town' ? 0 : 100) < bd) { bd = d - (h.kind === 'town' ? 0 : 100); best = h; } }
    return best;
  }
  cv.addEventListener('mousedown', (e) => { if (e.button === 0 || e.button === 2 || e.button === 1) S.drag = { x: e.clientX, y: e.clientY, cx: S.view.cx, cz: S.view.cz, moved: false, btn: e.button }; });
  window.addEventListener('mousemove', (e) => {
    if (!S.open) return;
    S.mx = e.clientX; S.my = e.clientY;
    if (S.drag) {
      const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) S.drag.moved = true;
      if (S.drag.moved) { S.view.cx = S.drag.cx - dx / S.view.s; S.view.cz = S.drag.cz - dy / S.view.s; cv.style.cursor = 'grabbing'; }
    } else { S.hover = pickAt(e.clientX, e.clientY); cv.style.cursor = S.hover && (S.hover.kind === 'ws') ? 'pointer' : 'grab'; }
  });
  window.addEventListener('mouseup', (e) => {
    if (!S.open || !S.drag) return;
    const d = S.drag; S.drag = null; cv.style.cursor = 'grab';
    if (d.moved || d.btn !== 0) return;
    const h = pickAt(e.clientX, e.clientY);
    if (h && (h.kind === 'ws' || h.kind === 'town')) {
      let id = 0;
      if (h.kind === 'ws') id = h.obj.id; else { const t = h.obj, w = arr(st.waystones).find((q) => q.id === t.wsId || q.townId === t.id); if (w && w.disc && w.disc[local]) id = w.id; }
      if (id) { if (S.sel === id && S.lastClick && performance.now() - S.lastClick < 450) confirmTeleport(); else S.sel = id; S.lastClick = performance.now(); renderSel(); }
    }
  });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = Math.exp(-e.deltaY * 0.0015), ns = Math.max(S.fitS * 0.7, Math.min(S.fitS * 8, S.view.s * k));
    const wx = S.view.cx + (e.clientX - window.innerWidth / 2) / S.view.s, wz = S.view.cz + (e.clientY - window.innerHeight / 2) / S.view.s;
    S.view.s = ns; S.view.cx = wx - (e.clientX - window.innerWidth / 2) / ns; S.view.cz = wz - (e.clientY - window.innerHeight / 2) / ns;
  }, { passive: false });

  // ---------------------------------------------------------------- minimap: click = ping (or open the map on a waystone), overlays
  const mm = $('minimap');
  const mmWorld = (ev) => { const rc = mm.getBoundingClientRect(); return { x: ((ev.clientX - rc.left) / rc.width) * WORLD.size - half(), z: ((ev.clientY - rc.top) / rc.height) * WORLD.size - half(), k: WORLD.size / rc.width }; };
  function mmWs(p) { let best = null, bd = 6 * p.k; for (const d of destinationsOf(st, local, true)) { const dd = Math.hypot(d.x - p.x, d.z - p.z); if (dd < bd) { bd = dd; best = d; } } return best; }
  if (mm) {
    mm.addEventListener('click', (ev) => {
      const p = mmWorld(ev), w = mmWs(p);
      if (w) { openMap(w.id); return; }
      if (ev.shiftKey) { openMap(); return; }
      pings.push({ x: p.x, z: p.z, t: 0, rgb: '255,255,255' });
      if (renderer.ping) renderer.ping(p.x, p.z);
    });
    mm.addEventListener('mousemove', (ev) => { const w = mmWs(mmWorld(ev)); mm.classList.toggle('wpHover', !!w); const t = w ? (w.blocked ? w.name + ' (down)' : 'Open the map: ' + (w.home ? 'Start village' : w.name)) : 'Click: ping · Shift+click: map (M)'; if (mm.title !== t) mm.title = t; });
  }
  /** called by ui.js drawMinimap. phase 'under': before the fog mask (regions, sites); 'over': after it (raid pulses, pings, waystones) */
  function drawMinimap(mx, P, r, dt, phase) {
    const now = Date.now();
    if (phase === 'under') {
      layers.update(); layers.draw(mx, { x: P, y: P, k: 200 / WORLD.size, full: false, now: now / 1000 }, 'under');
      return;
    }
    // over the fog
    layers.draw(mx, { x: P, y: P, k: 200 / WORLD.size, full: false, now: now / 1000 }, 'over');
    for (const d of destinationsOf(st, local, true)) {
      const x = P(d.x), y = P(d.z), rr = d.home ? 4.6 : 3.8;
      mx.beginPath(); mx.moveTo(x, y - rr); mx.lineTo(x + rr, y); mx.lineTo(x, y + rr); mx.lineTo(x - rr, y); mx.closePath();
      mx.fillStyle = d.blocked ? '#8a2a22' : d.home ? '#fff3b0' : GOLD; mx.fill(); mx.strokeStyle = '#000'; mx.lineWidth = 1; mx.stroke();
    }
    if (team.tele) { const h = team.hero; mx.strokeStyle = GOLD; mx.lineWidth = 2; mx.beginPath(); mx.arc(P(h.x), P(h.z), 7 + 3 * Math.sin(now / 120), 0, 7); mx.stroke(); }
    for (let i = pings.length - 1; i >= 0; i--) {
      const p = pings[i]; p.t += dt;
      if (p.t > 2.5) { pings.splice(i, 1); continue; }
      mx.strokeStyle = `rgba(${p.rgb || '255,255,255'},${1 - p.t / 2.5})`; mx.lineWidth = 2; mx.beginPath(); mx.arc(P(p.x), P(p.z), 3 + ((p.t * 16) % 16), 0, 7); mx.stroke();
    }
  }

  // ---------------------------------------------------------------- topbar / banner updates + events
  let tSel = 0;
  const updateTop = () => {};

  function handleEvents(events) {
    const toast = (t, k) => game.ui && game.ui.toast && game.ui.toast(t, k);
    for (const e of events) {
      if (e.type === 'townAttacked' || e.type === 'townFallen' || e.type === 'townSaved') {
        const t = arr(st.towns).find((q) => q.id === e.town); if (t) pings.push({ x: t.x, z: t.z, t: 0, rgb: e.type === 'townSaved' ? '120,255,150' : '255,70,50' });
        if (S.open) renderSel();
      } else if (e.type === 'discover' && (e.team === undefined || e.team === local)) {
        if (e.kind === 'waystone') pings.push({ x: e.x, z: e.z, t: 0, rgb: '255,224,112' });
      }
    }
  }

  return {
    update(dt) {
      updateTop(dt);
      if (S.open) { tSel -= dt; if (tSel <= 0) { tSel = 0.25; renderSel(); } if (base) drawMap(dt); else { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#04070a'; g.fillRect(0, 0, cv.width, cv.height); } }
    },
    handleEvents,
    drawMinimap,
    get open() { return S.open || S.helpOpen; },
    openMap, closeMap,
  };
}
