// Full map panel (key M): zoom (wheel), pan (drag), legend, zone rings with countdown, discovered features, quest markers, player marker.
import { h, setText, fmtTime } from './dom.js';
import { call } from './sim.js';
import { baseImage, fogCanvas, MAP } from './mapbase.js';
import { drawZone, drawFeatures, drawMarkers, drawPlayer } from './layers.js';

const LEGEND = [['⌂', '#f0f0e0', 'Harrowmere (safe)'], ['◆', '#e0bb5c', 'Gold mine'], ['◆', '#9ad8d0', 'Obelisk'], ['◆', '#c070ff', 'Sunken Temple'], ['☠', '#c08a40', 'Monster camp'],
  ['✝', '#9ad8ff', 'Shrine'], ['■', '#ffe070', 'Chest'], ['✦', '#ff8aff', 'Fog offering'], ['❕', '#ffd966', 'Quest'], ['○', '#e0614c', 'Dread Fog edge']];

export function createMapPanel(ctx) {
  const el = h('div', 'rpg-map rpg-modal rpg-hidden');
  const frame = h('div', 'rpg-map-frame rpg-gothic', el);
  const head = h('div', 'rpg-map-head', frame);
  h('h2', 'rpg-h', head, 'Map of the Fogbound Isle');
  const zinfo = h('div', 'rpg-map-zone', head);
  const close = h('button', 'rpg-btn', head, '✕ Close (M)'); close.onclick = () => ctx.ui.close('map');
  const body = h('div', 'rpg-map-body', frame);
  const wrap = h('div', 'rpg-map-cv', body), cv = h('canvas', '', wrap), g = cv.getContext('2d');
  const side = h('div', 'rpg-map-side', body);
  h('div', 'rpg-map-lh', side, 'Legend');
  for (const [gl, col, txt] of LEGEND) { const r = h('div', 'rpg-map-leg', side); const s = h('b', '', r, gl); s.style.color = col; h('span', '', r, txt); }
  h('div', 'rpg-map-lh', side, 'Controls');
  h('div', 'rpg-map-tip', side, 'Wheel: zoom. Drag: pan. Double-click: centre on yourself. Only places you have explored are revealed.');
  const cur = h('div', 'rpg-map-cur', side);
  let open = false, W = 0, H = 0, k = 1, cx = 0, cz = 0, fit = 1, drag = null, mouse = null;

  function resize() {
    const r = wrap.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(200, Math.floor(r.width)); H = Math.max(200, Math.floor(r.height));
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv._dpr = dpr;
    fit = Math.min(W, H) / (MAP.SIZE + 16); if (k < fit) k = fit;
  }
  const toWorld = (sx, sy) => [cx + (sx - W / 2) / k, cz + (sy - H / 2) / k];
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault(); const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, [wx, wz] = toWorld(sx, sy);
    k = Math.max(fit, Math.min(fit * 7, k * (e.deltaY > 0 ? 0.88 : 1.14))); cx = wx - (sx - W / 2) / k; cz = wz - (sy - H / 2) / k; clampView();
  }, { passive: false });
  wrap.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx, cz }; wrap.classList.add('drag'); });
  addEventListener('mouseup', () => { drag = null; wrap.classList.remove('drag'); });
  addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect(); mouse = [e.clientX - r.left, e.clientY - r.top];
    if (drag) { cx = drag.cx - (e.clientX - drag.x) / k; cz = drag.cz - (e.clientY - drag.y) / k; clampView(); }
  });
  wrap.addEventListener('dblclick', () => { const p = ctx.player(); if (p) { cx = p.x; cz = p.z; clampView(); } });
  function clampView() { const m = MAP.HALF + 20; cx = Math.max(-m, Math.min(m, cx)); cz = Math.max(-m, Math.min(m, cz)); }

  function draw() {
    const st = ctx.st(), p = ctx.player(); if (!st || !p) return;
    const dpr = cv._dpr || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#05080a'; g.fillRect(0, 0, W, H);
    const base = baseImage(st.world, 320), fog = fogCanvas(st.world), S = MAP.SIZE * k;
    const ox = W / 2 - (cx + MAP.HALF) * k, oy = H / 2 - (cz + MAP.HALF) * k;
    g.imageSmoothingEnabled = true; g.drawImage(base, ox, oy, S, S); g.drawImage(fog, ox, oy, S, S);
    g.strokeStyle = '#5a5238'; g.lineWidth = 2; g.strokeRect(ox, oy, S, S);
    const view = { k, local: false, icon: Math.min(1.8, 0.9 + k / fit * 0.2), P: (x, z) => [W / 2 + (x - cx) * k, H / 2 + (z - cz) * k],
      clampTo: (x, y) => ({ x: Math.max(14, Math.min(W - 14, x)), y: Math.max(14, Math.min(H - 14, y)), edge: x < 14 || y < 14 || x > W - 14 || y > H - 14 }) };
    // grid every 100 m
    g.strokeStyle = 'rgba(224,187,92,.12)'; g.lineWidth = 1; g.beginPath();
    for (let v = -200; v <= 200; v += 100) { const [x] = view.P(v, 0), [, y] = view.P(0, v); g.moveTo(x, oy); g.lineTo(x, oy + S); g.moveTo(ox, y); g.lineTo(ox + S, y); }
    g.stroke();
    g.save(); g.beginPath(); g.rect(ox, oy, S, S); g.clip(); drawZone(g, st, view); g.restore();
    drawFeatures(g, st, p, view); drawMarkers(g, st, p, view);
    const [px, py] = view.P(p.x, p.z); drawPlayer(g, px, py, p.yaw, 1.5);
    g.font = '15px Georgia, serif'; g.fillStyle = 'rgba(216,220,207,.8)'; g.textAlign = 'center'; g.fillText('N', W / 2, 16);
    // zone readout
    const z = st.zone;
    if (z) {
      const zi = call('Flow', 'safeZoneInfo', st, p) || {}; const left = zi.countdown ?? zi.timeLeft ?? (z.nextAt !== undefined ? z.nextAt - st.t : 0);
      const state = zi.state || z.state;
      setText(zinfo, (state === 'shrinking' ? 'The Fog is closing in' : left > 0 ? 'Next shrink in ' + fmtTime(left) : 'The Fog holds') + ' · stage ' + (zi.stage ?? z.stage ?? 1) + '/' + (z.stages || 5) + ' · safe radius ' + Math.round(zi.r ?? z.r) + ' m');
    } else setText(zinfo, '');
    const [mx, mz] = mouse && mouse[0] >= 0 && mouse[1] >= 0 && mouse[0] < W && mouse[1] < H ? toWorld(mouse[0], mouse[1]) : [p.x, p.z];
    setText(cur, 'Cursor ' + Math.round(mx) + ', ' + Math.round(mz) + '\nYou ' + Math.round(p.x) + ', ' + Math.round(p.z));
  }

  return {
    el,
    open() {
      open = true; el.classList.remove('rpg-hidden'); resize(); const p = ctx.player();
      k = fit * 1.0; if (p) { cx = 0; cz = 0; } clampView();
    },
    close() { open = false; el.classList.add('rpg-hidden'); },
    isOpen: () => open,
    update() { if (open) draw(); },
    keyHandler(e) { if (e.code === 'KeyM') { ctx.ui.close('map'); return true; } return false; },
  };
}
