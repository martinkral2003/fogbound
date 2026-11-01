// UI lane v0.5: map layers shared by the minimap (ui.js via travel_ui.drawMinimap) and the full-screen map (travel_ui.drawMap).
// T = { x(wx)->px, y(wz)->px, k (px per metre), full (bool), now (s), hit?(kind,x,y,r,obj,tip), label?(txt,x,y,col,size) }
// draw(g, T, 'under')  before the fog mask: the front line (ground the demons hold + the route ahead)
// draw(g, T, 'over')   after it (always visible): Demon Gates (open red / closed grey), towns (safe green / besieged orange / fallen grey), capital star,
//                      assaults, allied heroes + servants, event icons (dungeons, points of interest, st.sideEvents), the current objective.
import { WORLD } from './data.js';
import { frontInfo, TOWN_COL, fmtT, arr, townsOf, isCapital, objectiveOf, allyList } from './hud_state.js';

const POI_NAME = { altar: 'Altar', library: 'Library', graveyard: 'Graveyard', well: 'Well', witch: 'Witch hut', cage: 'Prisoner cage', hoard: 'Hoard', bridge: 'Bridge', cursed: 'Cursed chest', watchtower: 'Watchtower', shrine: 'Shrine', caravan: 'Caravan' };

export function createMapLayers({ st, local, renderer }) {
  let info = null, infoT = -9;
  const H = () => { if (!info || st.t - infoT > 0.4) { info = frontInfo(st); infoT = st.t; } return info; };
  const expl = (x, z) => {
    const ex = renderer && renderer.explored; if (!ex) return true;
    const n = WORLD.infN, i = Math.floor((x + WORLD.half) / WORLD.infCell), j = Math.floor((z + WORLD.half) / WORLD.infCell);
    return i >= 0 && j >= 0 && i < n && j < n && ex[j * n + i] === 1;
  };
  function update() { /* no per-frame state: allies are always visible */ }

  function star(g, x, y, r, fill, stroke) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = stroke; g.lineWidth = 1.4; g.stroke();
  }

  function drawFront(g, T, hi) {
    const P = hi.path;
    if (P.length > 1) { // the route still to come: faint dashes
      g.save(); g.setLineDash([3, 6]); g.strokeStyle = 'rgba(220,90,60,0.28)'; g.lineWidth = T.full ? 2 : 1; g.beginPath();
      P.forEach((p, i) => (i ? g.lineTo(T.x(p[0]), T.y(p[1])) : g.moveTo(T.x(p[0]), T.y(p[1])))); g.stroke(); g.restore();
    }
    const C = hi.covered;
    if (C.length > 1) { // the ground the demons already hold: a red band
      g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); C.forEach((p, i) => (i ? g.lineTo(T.x(p[0]), T.y(p[1])) : g.moveTo(T.x(p[0]), T.y(p[1]))));
      g.strokeStyle = 'rgba(190,40,30,0.30)'; g.lineWidth = Math.max(T.full ? 10 : 6, 30 * T.k); g.stroke();
      g.setLineDash([7, 6]); g.lineDashOffset = -T.now * 14; g.strokeStyle = 'rgba(255,90,60,0.85)'; g.lineWidth = T.full ? 2.4 : 1.4; g.stroke(); g.restore();
    }
    const f = hi.front;
    if (f && C.length > 1) {
      const x = T.x(f.x), y = T.y(f.z), pulse = 0.5 + 0.5 * Math.sin(T.now * 4), r = T.full ? 8 : 4;
      g.beginPath(); g.arc(x, y, r + 3 + pulse * 3, 0, 7); g.strokeStyle = `rgba(255,70,50,${0.35 + 0.35 * pulse})`; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = '#c0281e'; g.fill(); g.strokeStyle = '#ffd0b0'; g.lineWidth = 1.3; g.stroke();
      if (T.full && T.hit) T.hit('front', x, y, 12, f, `The demons' front line (${Math.round(hi.frac * 100)}% of the way to the capital)`);
    }
  }

  function drawGates(g, T, hi) {
    for (const gt of hi.gates) {
      if (gt.x === undefined) continue;
      const x = T.x(gt.x), y = T.y(gt.z), r = T.full ? 11 : 6, p = 0.5 + 0.5 * Math.sin(T.now * 3 + (gt.id | 0));
      g.save();
      if (gt.closed) {
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = 'rgba(40,44,48,0.95)'; g.fill(); g.strokeStyle = '#8a9094'; g.lineWidth = 2; g.stroke();
        g.strokeStyle = '#c8ccc8'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - r * 0.45, y); g.lineTo(x - r * 0.1, y + r * 0.4); g.lineTo(x + r * 0.5, y - r * 0.4); g.stroke();
      } else {
        g.beginPath(); g.arc(x, y, r + 2 + p * 3, 0, 7); g.strokeStyle = `rgba(255,60,40,${0.3 + 0.4 * p})`; g.lineWidth = 2; g.stroke();
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = '#5a0e0a'; g.fill(); g.strokeStyle = '#ff5a40'; g.lineWidth = 2.2; g.stroke();
        g.beginPath(); g.arc(x, y, r * 0.5, 0, 7); g.fillStyle = `rgba(255,${120 + 80 * p | 0},60,0.95)`; g.fill();
      }
      g.restore();
      if (T.full) {
        if (T.label) T.label(gt.closed ? 'Gate (closed)' : 'Demon Gate', x, y + r + 11, gt.closed ? '#9a9fa2' : '#ff9a80', 12);
        if (T.hit) T.hit('gate', x, y, r + 4, gt, gt.closed ? 'Demon Gate: closed' : `Demon Gate: open${gt.maxHp ? ' (' + Math.round((gt.hp / gt.maxHp) * 100) + '% intact)' : ''}. Destroy it to close it.`);
      }
    }
    const lord = hi.lord, lp = st.world && st.world.sites && st.world.sites.demon && st.world.sites.demon.lord;
    if (T.full && lp && lord && lord.state !== 'dead' && (lord.state === 'fight' || lord.state === 'arrived' || lord.state === 'active')) { const x = T.x(lp.x), y = T.y(lp.z); g.font = '16px "Segoe UI Symbol", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffb090'; g.fillText('☠', x, y - 16); if (T.hit) T.hit('lord', x, y - 16, 10, lp, 'The Demon Lord'); }
  }

  function drawTowns(g, T) {
    for (const t of townsOf(st)) {
      const x = T.x(t.x), y = T.y(t.z), col = TOWN_COL[t.state] || TOWN_COL.safe, cap = isCapital(st, t);
      const rad = Math.max(T.full ? 10 : 5, (t.r || 20) * T.k * 0.9);
      g.save();
      g.beginPath(); g.arc(x, y, rad, 0, 7); g.fillStyle = col + (t.state === 'fallen' ? '18' : '26'); g.fill();
      g.setLineDash(t.state === 'besieged' ? [4, 3] : []); g.strokeStyle = col + 'cc'; g.lineWidth = t.state === 'besieged' ? 2 : 1.3; g.stroke(); g.setLineDash([]);
      if (t.state === 'besieged') { const p = 0.5 + 0.5 * Math.sin(T.now * 6); g.beginPath(); g.arc(x, y, rad + 2 + p * 4, 0, 7); g.strokeStyle = `rgba(255,120,40,${0.3 + 0.5 * p})`; g.lineWidth = 2.2; g.stroke(); }
      const r = cap ? (T.full ? 9 : 6) : T.full ? 6.5 : 4;
      if (cap) star(g, x, y, r + 1.5, t.state === 'fallen' ? '#3a3d3e' : '#f5e29a', col);
      else { g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = t.state === 'fallen' ? '#2c2f30' : '#10161a'; g.fill(); g.strokeStyle = col; g.lineWidth = 1.8; g.stroke(); g.beginPath(); g.moveTo(x - r * 0.6, y + r * 0.35); g.lineTo(x, y - r * 0.6); g.lineTo(x + r * 0.6, y + r * 0.35); g.closePath(); g.fillStyle = col; g.fill(); }
      if (t.state === 'fallen') { g.strokeStyle = '#d8d8d8'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke(); }
      g.restore();
      if (T.full) {
        if (T.label) T.label(t.name || 'Town', x, y + rad + 10, t.state === 'fallen' ? '#9a9fa2' : '#f4f1e2', cap ? 14 : 12);
        if (T.hit) T.hit('town', x, y, Math.max(12, rad), t, `${t.name} (${cap ? 'capital' : t.kind || 'town'}) - ${t.state === 'safe' ? 'safe' : t.state === 'besieged' ? 'under siege' : 'fallen'}`);
      }
    }
  }

  function drawAssaults(g, T, hi) {
    for (const a of hi.assaults) {
      const t = a.town; if (!t) continue;
      const x = T.x(t.x), y = T.y(t.z), p = 0.5 + 0.5 * Math.sin(T.now * 5);
      if (a.x !== undefined) { g.save(); g.setLineDash([8, 6]); g.lineDashOffset = -T.now * 18; g.strokeStyle = 'rgba(255,90,70,0.85)'; g.lineWidth = T.full ? 2 : 1.2; g.beginPath(); g.moveTo(T.x(a.x), T.y(a.z)); g.lineTo(x, y); g.stroke(); g.restore(); g.beginPath(); g.arc(T.x(a.x), T.y(a.z), T.full ? 5 : 2.8, 0, 7); g.fillStyle = '#e0382c'; g.fill(); }
      const rr = Math.max(T.full ? 14 : 8, (t.r || 20) * T.k) * (0.9 + 0.2 * p);
      g.beginPath(); g.arc(x, y, rr, 0, 7); g.strokeStyle = `rgba(255,70,50,${0.5 + 0.4 * p})`; g.lineWidth = 3; g.stroke();
      if (T.full) { if (T.label) T.label(a.eta != null && a.eta > 0 ? `Assault ${fmtT(a.eta)}` : 'Assault', x, y - rr - 8, '#ff9a80', 13); if (T.hit) T.hit('assault', x, y - rr, 14, a, `Demon assault on ${t.name}`); }
    }
  }

  function drawEvents(g, T) { // dungeons, points of interest and timed side events: ONE icon style (a gold "!" disc), tooltip says what it is
    const spots = [];
    for (const d of arr(st.dungeons).length ? arr(st.dungeons) : arr(st.world && st.world.sites && st.world.sites.dungeons)) {
      if (d.state === 'cleared' || !(d.disc ? d.disc[local] : expl(d.x, d.z))) continue;
      spots.push({ x: d.x, z: d.z, tip: 'Dungeon: clear it for loot', o: d, kind: 'dungeon' });
    }
    for (const p of arr(st.pois).length ? arr(st.pois) : arr(st.world && st.world.sites && st.world.sites.pois)) {
      if (p.used || !(p.disc ? p.disc[local] : expl(p.x, p.z))) continue;
      spots.push({ x: p.x, z: p.z, tip: POI_NAME[p.type] || p.type, o: p, kind: 'poi' });
    }
    for (const e of arr(st.sideEvents)) spots.push({ x: e.x, z: e.z, tip: e.text || 'Event', o: e, kind: 'event', big: true });
    for (const s of spots) {
      const x = T.x(s.x), y = T.y(s.z), r = (s.big ? 1.3 : 1) * (T.full ? 8 : 3.6);
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = s.big ? '#b8861a' : 'rgba(60,46,12,0.92)'; g.fill(); g.strokeStyle = '#ffd560'; g.lineWidth = s.big ? 2 : 1.3; g.stroke();
      if (T.full) { g.fillStyle = '#ffeaa0'; g.font = `bold ${Math.round(r * 1.5)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', x, y + 0.5); if (T.hit) T.hit(s.kind, x, y, r + 3, s.o, s.tip); }
    }
  }

  function drawActors(g, T) {
    const team = st.teams[local];
    for (const a of allyList(st, local)) { // allied heroes: always visible
      if (a.dead) continue;
      const x = T.x(a.x), y = T.y(a.z);
      g.beginPath(); g.arc(x, y, T.full ? 5.5 : 3.2, 0, 7); g.fillStyle = a.css; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
      if (T.full && T.hit) T.hit('ally', x, y, 9, a, `${a.name} (level ${a.lvl})`);
    }
    g.fillStyle = '#7fe0d0';
    for (const id of arr(team.followers)) { const e = st.byId && st.byId.get(id); if (!e || !e.alive) continue; g.beginPath(); g.arc(T.x(e.x), T.y(e.z), T.full ? 2.4 : 1.6, 0, 7); g.fill(); }
    const o = objectiveOf(st, team.hero); // the current objective
    if (o.has && T.full) {
      const x = T.x(o.x), y = T.y(o.z), p = 0.5 + 0.5 * Math.sin(T.now * 5);
      g.beginPath(); g.arc(x, y, 16 + p * 5, 0, 7); g.strokeStyle = `rgba(255,213,96,${0.5 + 0.5 * p})`; g.lineWidth = 3; g.stroke();
      if (T.label) T.label(o.text, x, y - 28, '#ffd560', 13);
      if (T.hit) T.hit('objective', x, y, 18, o, 'Your objective: ' + o.text);
    }
  }

  function draw(g, T, phase) {
    const hi = H();
    if (phase === 'under') drawFront(g, T, hi);
    else { drawGates(g, T, hi); drawTowns(g, T); drawAssaults(g, T, hi); drawEvents(g, T); drawActors(g, T); }
  }
  return { update, draw, info: H };
}
