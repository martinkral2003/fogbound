// FOGBOUND: DOMINION minimap (bottom left): terrain base, vision-limited enemy dots, own units/buildings, neutral sites, camera frustum,
// click/drag = move camera, right-click = order, alert pings. Also owns the coarse local vision grid used for hiding enemies (ui.visible).
import { h, cssColor } from './dom.js';

const S = 224, GN = 100, CELL = 4;

export function createMinimap(ui, root) {
  const wrap = h('div', 'rts-mm panel ui', root);
  const cv = h('canvas', '', wrap), g = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = cv.height = S * dpr; cv.style.width = cv.style.height = S + 'px';
  const bar = h('div', 'mm-bar', wrap);
  const btnT = h('button', 'btn small', bar, 'Territory'), btnF = h('button', 'btn small', bar, 'Fog'); btnF.classList.add('on');
  btnT.onclick = () => { ui.ctl.showTerritory = !ui.ctl.showTerritory; btnT.classList.toggle('on', ui.ctl.showTerritory); };
  btnF.onclick = () => { ui.ctl.fogOn = !ui.ctl.fogOn; btnF.classList.toggle('on', ui.ctl.fogOn); };
  let base = null, timer = 0, drag = false;
  const vis = new Uint8Array(GN * GN);
  const toWorld = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width - 0.5) * 400, z: ((e.clientY - r.top) / r.height - 0.5) * 400 }; };
  const toMap = (x, z) => [(x / 400 + 0.5) * S, (z / 400 + 0.5) * S];
  cv.addEventListener('pointerdown', (e) => {
    if (e.button === 0) { drag = true; cv.setPointerCapture(e.pointerId); const p = toWorld(e); ui.ctl.camT = null; ui.ctl.centerOn(p.x, p.z); }
    else if (e.button === 2) { const p = toWorld(e); ui.minimapOrder(p.x, p.z, e.shiftKey); }
  });
  cv.addEventListener('pointermove', (e) => { if (drag) { const p = toWorld(e); ui.ctl.cam.x = p.x; ui.ctl.cam.z = p.z; ui.ctl.camT = null; } });
  cv.addEventListener('pointerup', () => { drag = false; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  function updateVision() {
    vis.fill(0);
    const st = ui.st, me = ui.team.id;
    const mark = (x, z, r) => {
      const cx = Math.floor((x + 200) / CELL), cz = Math.floor((z + 200) / CELL), rc = Math.ceil(r / CELL), r2 = (r / CELL) ** 2;
      for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) { if (i * i + j * j > r2) continue; const a = cx + i, b = cz + j; if (a >= 0 && b >= 0 && a < GN && b < GN) vis[b * GN + a] = 1; }
    };
    for (const u of st.ents) if (u.alive && u.team === me && !u.garrison) mark(u.x, u.z, u.vision || 20);
    for (const b of st.blds) if (b.team === me && b.state !== 'ruin' && b.state !== 'building') mark(b.x, b.z, b.vision || 18);
  }
  ui.visible = (x, z) => { const rr = ui.game.renderer; if (rr && rr.isVisible && !rr.stub) return !!rr.isVisible(x, z); const t = ui.team.fog; if (t && typeof t.visible === 'function') return !!t.visible(x, z); const a = Math.floor((x + 200) / CELL), b = Math.floor((z + 200) / CELL); return a >= 0 && b >= 0 && a < GN && b < GN && vis[b * GN + a] === 1; };
  ui.visibleEnt = (e) => !ui.ctl.fogOn || e.team === ui.team.id || ui.visible(e.x, e.z);

  function draw() {
    const st = ui.st, me = ui.team.id, r = ui.game.renderer;
    if (!base) { try { base = r.minimapBase ? r.minimapBase(256) : null; } catch (e) { base = null; } if (base && !(base instanceof HTMLCanvasElement) && !(base instanceof HTMLImageElement) && !(typeof ImageBitmap !== 'undefined' && base instanceof ImageBitmap)) base = null; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, S, S);
    g.fillStyle = '#080b0d'; g.fillRect(0, 0, S, S);
    if (base) g.drawImage(base, 0, 0, S, S);
    if (ui.ctl.fogOn) { // darken what we cannot currently see
      g.fillStyle = 'rgba(0,0,0,0.42)';
      for (let b = 0; b < GN; b++) { let a = 0; while (a < GN) { if (vis[b * GN + a]) { a++; continue; } let e = a; while (e < GN && !vis[b * GN + e]) e++; g.fillRect((a / GN) * S, (b / GN) * S, ((e - a) / GN) * S + 0.5, S / GN + 0.5); a = e; } }
    }
    for (const n of st.nodes) { if ((n.amount ?? 1) <= 0) continue; const [x, y] = toMap(n.x, n.z); g.fillStyle = { tree: '#2f6b34', mine: '#e0c04a', quarry: '#9a9aa0', farm: '#b05050', bloodwell: '#c03030', soulwell: '#9a7aff' }[n.rtype] || '#9a9'; g.fillRect(x - 1, y - 1, n.rtype === 'tree' ? 1.5 : 2.5, n.rtype === 'tree' ? 1.5 : 2.5); }
    for (const s of st.neutral || []) { const [x, y] = toMap(s.x, s.z); g.fillStyle = s.owner >= 0 ? cssColor(st.teams[s.owner].faction.color) : 'rgba(232,224,176,0.7)'; g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-1.5, -1.5, 3, 3); g.restore(); }
    const T = ui.templeInfo; if (T && T.beam) { const [x, y] = toMap(0, 0), p = 4 + ((st.t * 6) % 8); g.strokeStyle = 'rgba(160,255,240,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, p, 0, 7); g.stroke(); }
    for (const b of st.blds) {
      if (b.state === 'ruin') continue; if (b.team !== me && !ui.visibleEnt(b)) continue;
      const [x, y] = toMap(b.x, b.z), sz = b.wall ? 1.6 : Math.max(3, Math.min(7, b.w * 0.6));
      g.fillStyle = cssColor(st.teams[b.team].faction.color); g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      if (b.type === 'keep') { g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x - sz / 2 - 1, y - sz / 2 - 1, sz + 2, sz + 2); }
    }
    for (const u of st.ents) {
      if (!u.alive || u.garrison) continue; if (u.team !== me && !ui.visibleEnt(u)) continue;
      const [x, y] = toMap(u.x, u.z); g.fillStyle = u.team >= 0 && u.team < 4 ? cssColor(st.teams[u.team].faction.color) : '#d0c070';
      const s = u.general ? 3.4 : u.team === me ? 2.2 : 2; g.fillRect(x - s / 2, y - s / 2, s, s);
    }
    // camera frustum
    const pts = [[0, 0], [innerWidth, 0], [innerWidth, innerHeight], [0, innerHeight]].map(([sx, sy]) => r.screenToGround(sx, sy));
    if (pts.every(Boolean)) { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1; g.beginPath(); pts.forEach((p, i) => { const [x, y] = toMap(Math.max(-200, Math.min(200, p.x)), Math.max(-200, Math.min(200, p.z))); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.stroke(); }
    else { const [x, y] = toMap(ui.ctl.cam.x, ui.ctl.cam.z); g.strokeStyle = '#fff'; g.strokeRect(x - 12, y - 8, 24, 16); }
    for (const p of ui.mmPings) { const [x, y] = toMap(p.x, p.z), k = p.t / p.life; g.strokeStyle = `rgba(255,${p.kind === 'attack' ? 80 : 220},80,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 3 + k * 16, 0, 7); g.stroke(); }
    g.strokeStyle = 'rgba(224,187,92,0.5)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
  return {
    el: wrap,
    update(dt) {
      for (const p of ui.mmPings) p.t += dt; ui.mmPings = ui.mmPings.filter((p) => p.t < p.life);
      timer -= dt; if (timer > 0) return; timer = 0.1;
      ui.templeInfo = ui.templeInfo || null;
      if (!ui._visT || ui._visT <= 0) { updateVision(); ui._visT = 0.4; } else ui._visT -= 0.1;
      draw();
    },
  };
}
