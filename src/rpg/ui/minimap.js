// Round minimap (top-right): terrain base, exploration fog, zone rings, quest markers, nearby actors. Rotates with the hero (N key toggles north-up).
import { h } from './dom.js';
import { baseImage, fogCanvas, explore, MAP } from './mapbase.js';
import { drawZone, drawFeatures, drawMarkers, drawActors, drawPlayer } from './layers.js';

const S = 196; // css px
export function createMinimap(ctx, root) {
  const el = h('div', 'rpg-mini rpg-click', root);
  const cv = h('canvas', '', el), g = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = cv.height = S * dpr; cv.style.width = cv.style.height = S + 'px';
  const north = h('div', 'rpg-mini-n', el, 'N');
  const info = h('div', 'rpg-mini-i', el);
  const hint = h('div', 'rpg-mini-h', el, 'M map · N rotate · wheel zoom');
  let range = 80, tick = 0;
  el.addEventListener('wheel', (e) => { e.preventDefault(); range = Math.max(45, Math.min(170, range * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });
  el.addEventListener('click', () => ctx.ui.toggle('map'));

  function update(dt) {
    const st = ctx.st(), p = ctx.player();
    const on = !!(st && p && st.world); el.classList.toggle('rpg-hidden', !on); if (!on) return;
    explore(st.world, p.x, p.z, 45);
    const k = (S / 2 - 6) / range, rot = ctx.settings.northUp ? 0 : -Math.PI / 2 - p.yaw, cr = Math.cos(rot), sr = Math.sin(rot);
    const base = baseImage(st.world, 320), fog = fogCanvas(st.world), W = MAP.SIZE * k;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 3, 0, 7); g.clip();
    g.fillStyle = '#05080a'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2); g.rotate(rot); g.translate(-p.x * k, -p.z * k);
    g.imageSmoothingEnabled = true; g.drawImage(base, -MAP.HALF * k, -MAP.HALF * k, W, W);
    g.drawImage(fog, -MAP.HALF * k, -MAP.HALF * k, W, W);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const view = {
      k, local: true, icon: 0.9, P: (x, z) => { const dx = (x - p.x) * k, dz = (z - p.z) * k; return [S / 2 + dx * cr - dz * sr, S / 2 + dx * sr + dz * cr]; },
      clampTo: (x, y) => { const dx = x - S / 2, dy = y - S / 2, d = Math.hypot(dx, dy), m = S / 2 - 14; return d > m ? { x: S / 2 + dx / d * m, y: S / 2 + dy / d * m, edge: true } : { x, y, edge: false }; },
    };
    drawZone(g, st, view); drawFeatures(g, st, p, view); drawActors(g, st, p, view); drawMarkers(g, st, p, view);
    drawPlayer(g, S / 2, S / 2, p.yaw + rot, 0.9);
    g.restore();
    // north marker orbits the rim
    const ang = -Math.PI / 2 + rot; const nx = S / 2 + Math.cos(ang) * (S / 2 - 12), ny = S / 2 + Math.sin(ang) * (S / 2 - 12);
    north.style.transform = 'translate(' + (nx - 9).toFixed(1) + 'px,' + (ny - 9).toFixed(1) + 'px)';
    tick -= dt; if (tick <= 0) { tick = 0.3; info.textContent = st.settlement && Math.hypot(p.x - st.settlement.x, p.z - st.settlement.z) < st.settlement.r ? st.settlement.name + ' (safe)' : Math.round(p.x) + ', ' + Math.round(p.z); }
  }
  return { el, update };
}
