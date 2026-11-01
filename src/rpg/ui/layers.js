// Map overlay layers shared by minimap and full map. view = {P(x,z)->[sx,sy], k (px per metre), w, h, icon (scale factor), local (minimap rules)}.
import { isExplored } from './mapbase.js';
import { call } from './sim.js';

function glyph(g, s, x, y, col, size) {
  g.font = size + 'px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y);
}
function diamond(g, x, y, r, fill) { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); }

export function drawZone(g, st, view) {
  const z = st.zone; if (!z) return;
  const [cx, cy] = view.P(z.cx, z.cz), R = z.r * view.k;
  g.save();
  // red tint outside the current circle
  g.beginPath(); g.rect(-9999, -9999, 19999, 19999); g.moveTo(cx + R, cy); g.arc(cx, cy, R, 0, Math.PI * 2, true);
  g.fillStyle = 'rgba(150,20,30,.32)'; g.fill('evenodd');
  g.lineWidth = 2; g.strokeStyle = '#e0614c'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  const nr = z.toR !== undefined && z.toR < z.r - 0.5 ? z.toR : (z.stages && z.stage < z.stages && z.nextR) || 0;
  if (nr > 0) { g.setLineDash([6, 5]); g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, nr * view.k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
  g.restore();
}

export function drawFeatures(g, st, p, view) {
  const w = st.world, f = w.features || {}, I = view.icon || 1, near = (x, z, r) => !view.local || Math.hypot(x - p.x, z - p.z) < r;
  if (st.settlement) { const s = st.settlement, [x, y] = view.P(s.x, s.z); g.save(); g.setLineDash([3, 3]); g.strokeStyle = 'rgba(216,220,207,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, s.r * view.k, 0, 7); g.stroke(); g.restore(); glyph(g, '⌂', x, y, '#f0f0e0', 15 * I); }
  for (const n of f.nodes || []) { if (!isExplored(w, n.x, n.z)) continue; const [x, y] = view.P(n.x, n.z); diamond(g, x, y, (n.type === 'temple' ? 6 : 4) * I, n.type === 'mine' ? '#e0bb5c' : n.type === 'temple' ? '#c070ff' : '#9ad8d0'); }
  for (const c of f.camps || []) { if (!isExplored(w, c.x, c.z)) continue; const [x, y] = view.P(c.x, c.z); glyph(g, '☠', x, y, c.temple ? '#e0503c' : '#c08a40', 11 * I); }
  for (const s of f.shrines || []) { if (!isExplored(w, s.x, s.z)) continue; const [x, y] = view.P(s.x, s.z); glyph(g, '✝', x, y, '#9ad8ff', 12 * I); }
  if (f.boss && isExplored(w, f.boss.x, f.boss.z)) { const [x, y] = view.P(f.boss.x, f.boss.z); glyph(g, '♕', x, y, '#e0503c', 14 * I); }
  for (const c of st.containers || []) {
    if (c.removed || c.opened) continue;
    const crate = c.kind === 'crate';
    if (c.kind === 'corpse') continue;
    if (!crate && !isExplored(w, c.x, c.z)) continue;
    if (view.local && !crate && !near(c.x, c.z, 50)) continue;
    const [x, y] = view.P(c.x, c.z); if (crate) glyph(g, '✦', x, y, '#ff8aff', 15 * I); else { g.fillStyle = c.locked ? '#c0a060' : '#ffe070'; g.fillRect(x - 3 * I, y - 2.5 * I, 6 * I, 5 * I); g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(x - 3 * I, y - 2.5 * I, 6 * I, 5 * I); }
  }
  if (view.local) for (const gi of st.groundItems || []) { if (!near(gi.x, gi.z, 28)) continue; const [x, y] = view.P(gi.x, gi.z); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 2 * I, 0, 7); g.fill(); }
}

export function drawMarkers(g, st, p, view) {
  const I = view.icon || 1;
  const markers = call('Quests', 'markers', st, p.id);
  for (const m of Array.isArray(markers) ? markers : []) {
    if (!m || m.x === undefined) continue;
    let [x, y] = view.P(m.x, m.z), edge = false;
    if (view.clampTo) { const c = view.clampTo(x, y); edge = c.edge; x = c.x; y = c.y; }
    const gl = m.glyph || (m.type === 'give' ? '!' : m.type === 'turnin' ? '?' : '◆'), col = m.color || (m.type === 'objective' ? '#ffd966' : '#fff1a0');
    glyph(g, edge ? '●' : gl, x, y, col, (edge ? 10 : 18) * I);
  }
}

export function drawActors(g, st, p, view) {
  const I = view.icon || 1;
  if (view.local) {
    for (const a of st.actors) {
      if (a === p || !a.alive) continue;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (a.kind === 'npc') { if (d < 60) { const [x, y] = view.P(a.x, a.z); g.fillStyle = '#7ad0ff'; g.beginPath(); g.arc(x, y, 3 * I, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); } continue; }
      const lim = a.kind === 'rival' ? 35 : a.kind === 'monster' ? 30 : 0; if (!lim || d > lim) continue;
      const [x, y] = view.P(a.x, a.z); g.fillStyle = a.kind === 'rival' ? '#ff5040' : '#d89030'; g.beginPath(); g.arc(x, y, (a.kind === 'rival' ? 4 : 2.5) * I, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    }
  }
}

// player arrow pointing along heading (screen angle = ang)
export function drawPlayer(g, x, y, ang, I = 1) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(8 * I, 0); g.lineTo(-5.5 * I, 5 * I); g.lineTo(-2.5 * I, 0); g.lineTo(-5.5 * I, -5 * I); g.closePath();
  g.fillStyle = '#fff6c8'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#000'; g.stroke(); g.restore();
}
