// Top-of-screen HUD: compass strip, target frame, quest tracker, match + zone panels. Feeds (toasts, kill feed, banner) come from feed.js.
import { h, setText, setW, setShow, setCls, setHtml, clamp, fmtTime, esc, statusInfo } from './dom.js';
import { call } from './sim.js';
import { createFeed } from './feed.js';

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const CW = 600, CH = 44, SPAN = Math.PI * 0.9; // compass canvas size, visible angle span

export function createHudTop(ctx, root) {
  const el = h('div', 'rpg-top', root);
  const feed = createFeed(ctx, el);
  // compass
  const cwrap = h('div', 'rpg-compass', el), cv = h('canvas', '', cwrap), g = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = CW * dpr; cv.height = CH * dpr; cv.style.width = CW + 'px'; cv.style.height = CH + 'px';
  const pings = []; // heard rivals: {x,z,t}
  // target frame
  const tf = h('div', 'rpg-target rpg-hidden', el), tName = h('div', 'rpg-target-n', tf), tLvl = h('span', 'rpg-target-l', tName), tTxt = h('span', '', tName);
  const tBar = h('div', 'rpg-bar tgt', tf); const tTrail = h('div', 'rpg-bar-trail', tBar), tFill = h('div', 'rpg-bar-fill', tBar), tHp = h('div', 'rpg-bar-txt', tBar);
  const tSt = h('div', 'rpg-target-st', tf); let tShown = 1, tId = 0;
  // quest tracker
  const trk = h('div', 'rpg-tracker rpg-hidden', el);
  // match + zone
  const mp = h('div', 'rpg-match', el);
  const mRow = h('div', 'rpg-match-row', mp);
  const mAlive = h('span', '', mRow), mKills = h('span', '', mRow), mTime = h('span', '', mRow);
  const calm = h('div', 'rpg-calm rpg-hidden', mp);
  const zp = h('div', 'rpg-zone', mp), zHead = h('div', 'rpg-zone-h', zp), zSub = h('div', 'rpg-zone-s', zp);
  const zWarn = h('div', 'rpg-fogwarn rpg-hidden', el);
  let trkSig = '', trkT = 0;

  function target(st, p) {
    let t = p.cs && p.cs.lock ? st.byId.get(p.cs.lock) : null;
    if (t && (!t.alive || t === p)) t = null;
    if (!t) {
      let bd = 22;
      for (const a of st.actors) {
        if (a === p || !a.alive || a.kind === 'npc') continue;
        const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz);
        if (d < bd && Math.abs(angDiff(p.yaw, Math.atan2(dz, dx))) < 0.5) { bd = d; t = a; }
      }
    }
    return t;
  }

  function drawCompass(st, p) {
    const cam = p.yaw;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, CW, CH);
    const px = (th) => CW / 2 + (angDiff(cam, th) / SPAN) * CW;
    const grad = g.createLinearGradient(0, 0, CW, 0); grad.addColorStop(0, 'rgba(9,12,15,0)'); grad.addColorStop(0.15, 'rgba(9,12,15,.78)'); grad.addColorStop(0.85, 'rgba(9,12,15,.78)'); grad.addColorStop(1, 'rgba(9,12,15,0)');
    g.fillStyle = grad; g.fillRect(0, 8, CW, 26);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 15) {
      const th = deg * Math.PI / 180 - Math.PI / 2, x = px(th); // deg 0 = north (-z)
      if (x < 6 || x > CW - 6) continue;
      const card = deg % 90 === 0;
      const a = 1 - Math.abs(x - CW / 2) / (CW / 2);
      if (card) { g.font = 'bold 19px Georgia, serif'; g.fillStyle = deg === 0 ? '#e0614c' : '#e0bb5c'; g.globalAlpha = Math.min(1, a * 2.2); g.fillText('NESW'[deg / 90], x, 21); }
      else { g.globalAlpha = Math.min(1, a * 1.6) * 0.8; g.fillStyle = '#9aa297'; g.fillRect(x - 0.5, deg % 45 === 0 ? 15 : 17, 1, deg % 45 === 0 ? 11 : 7); }
    }
    g.globalAlpha = 1;
    const mark = (x, z, glyph, col, size = 16, clampEdge = false) => {
      const th = Math.atan2(z - p.z, x - p.x); let sx = px(th);
      if (sx < 16 || sx > CW - 16) { if (!clampEdge) return; sx = clamp(sx, 16, CW - 16); g.globalAlpha = 0.55; }
      g.font = size + 'px Georgia, serif'; g.fillStyle = '#000'; g.fillText(glyph, sx + 1, 22); g.fillStyle = col; g.fillText(glyph, sx, 21); g.globalAlpha = 1;
    };
    if (st.settlement) mark(st.settlement.x, st.settlement.z, '⌂', '#d8dccf', 18);
    const markers = call('Quests', 'markers', st, p.id) || [];
    for (const m of Array.isArray(markers) ? markers : []) if (m && m.x !== undefined) mark(m.x, m.z, m.glyph || (m.type === 'give' ? '!' : m.type === 'turnin' ? '?' : '◆'), m.color || '#ffd966', 16, true);
    if (st.zone) mark(st.zone.cx, st.zone.cz, '☸', '#e0614c', 14);
    for (let i = pings.length - 1; i >= 0; i--) { const q = pings[i]; if (st.t - q.t > 4) { pings.splice(i, 1); continue; } mark(q.x, q.z, '⚔', '#e0614c', 14); }
    g.fillStyle = '#e0bb5c'; g.beginPath(); g.moveTo(CW / 2 - 6, 3); g.lineTo(CW / 2 + 6, 3); g.lineTo(CW / 2, 11); g.closePath(); g.fill();
  }

  function updateTarget(st, p, dt) {
    const t = target(st, p);
    setShow(tf, !!t); if (!t) { tId = 0; return; }
    if (t.id !== tId) { tId = t.id; tShown = t.hp / t.maxHp; }
    const f = clamp(t.hp / Math.max(1, t.maxHp), 0, 1); tShown = f >= tShown ? f : Math.max(f, tShown - dt * 0.4);
    const diff = (t.lvl || 1) - p.lvl;
    tLvl.style.color = diff >= 4 ? '#e0503c' : diff >= 2 ? '#e0a040' : diff <= -4 ? '#8e978f' : '#d8dccf';
    setText(tLvl, 'Lv ' + (t.lvl || 1)); setText(tTxt, ' ' + t.name);
    setCls(tf, 'rival', t.kind === 'rival'); setCls(tf, 'elite', !!t.elite || !!t.boss);
    setW(tFill, f); setW(tTrail, tShown); setText(tHp, Math.ceil(t.hp) + ' / ' + Math.round(t.maxHp));
    const sig = (t.status || []).map((s) => s.id).join();
    if (tSt._sig !== sig) { tSt._sig = sig; tSt.innerHTML = (t.status || []).map((s) => { const [gl, col, n] = statusInfo(s.id); return '<b style="color:' + col + '" title="' + esc(n) + '">' + gl + '</b>'; }).join(''); }
  }

  function updateTracker(st, p, dt) {
    trkT -= dt; if (trkT > 0) return; trkT = 0.25;
    const j = call('Quests', 'journal', st, p.id);
    const act = (j && j.active) || [];
    const q = act.find((x) => x.id === ctx.tracked) || act.find((x) => x.tracked) || act[0];
    if (!q) { setShow(trk, false); return; }
    const html = '<div class="rpg-trk-h">◆ ' + esc(q.title) + '</div>' + (q.objectives || []).map((o) => '<div class="rpg-trk-o' + (o.done ? ' done' : '') + '">' + (o.done ? '✓ ' : '• ') + esc(o.text) + (o.goal > 1 ? ' <i>' + (o.progress | 0) + '/' + o.goal + '</i>' : '') + '</div>').join('');
    setShow(trk, true); setHtml(trk, html);
  }

  function updateMatch(st, p) {
    const m = st.match || {};
    setText(mAlive, '♕ ' + (m.alive || 0) + '/' + (m.total || 0)); setText(mKills, '⚔ ' + (p.kills | 0)); setText(mTime, '⧖ ' + fmtTime(st.t));
    const calmLeft = m.calmUntil ? m.calmUntil - st.t : 0;
    setShow(calm, calmLeft > 0 && m.state !== 'over'); setText(calm, 'The Calm: no heroes may strike for ' + Math.ceil(calmLeft) + ' s');
    const z = st.zone;
    setShow(zp, !!z); if (!z) { setShow(zWarn, false); return; }
    const zi = call('Flow', 'safeZoneInfo', st, p) || {};
    const d = Math.hypot(p.x - z.cx, p.z - z.cz), r = zi.r ?? z.r;
    const inFog = zi.inside !== undefined ? !zi.inside : d > r;
    let left = zi.countdown ?? zi.timeLeft ?? (z.nextAt !== undefined ? z.nextAt - st.t : 0);
    const state = zi.state || z.state, stage = zi.stage ?? z.stage, stages = z.stages || 5;
    const label = state === 'shrinking' ? 'The Fog closes in' : state === 'holding' ? 'Fog holds' : 'Fog gathers';
    setHtml(zHead, '<b>' + esc(label) + '</b><span>Stage ' + (stage || 1) + '/' + stages + '</span>');
    setText(zSub, state === 'shrinking' ? 'Shrinking to ' + Math.round(z.toR ?? r) + ' m' : (left > 0 ? 'Next shrink in ' + fmtTime(left) : 'Shrinking soon') + ' · safe radius ' + Math.round(r) + ' m');
    setCls(zp, 'danger', inFog);
    setShow(zWarn, inFog && p.alive);
    if (inFog) setText(zWarn, '☠ You are in the Dread Fog: ' + ((zi.dps ?? z.dps) || 0) + '% health per second. Run for the light!');
  }

  function update(dt) {
    const st = ctx.st(), p = ctx.player();
    const on = !!(st && p); setShow(el, on); if (!on) return;
    feed.update(dt);
    drawCompass(st, p); updateTarget(st, p, dt); updateTracker(st, p, dt); updateMatch(st, p);
  }
  function handleEvent(e, st, p) {
    feed.handleEvent(e, st, p);
    if (p && ['swing', 'shoot', 'cast'].includes(e.type) && e.actor !== p.id) {
      const a = st.byId.get(e.actor), x = e.x ?? (a && a.x), z = e.z ?? (a && a.z);
      if (a && (a.kind === 'rival') && x !== undefined) { const d = Math.hypot(x - p.x, z - p.z); if (d > 12 && d < 90) pings.push({ x, z, t: st.t }); }
    }
  }
  return { el, update, handleEvent, toast: (t, k, c) => feed.toast(t, k, c), announce: feed.announce };
}
