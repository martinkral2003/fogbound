// FOGBOUND: DOMINION alerts: toasts, event -> alert mapping (under attack, built, trained, idle workers, enemy general), minimap + screen-edge pings, WebAudio beeps.
import { h, esc } from './dom.js';
import { bdef, udef, unitName, prettyId, visibleTo } from './adapt.js';

let actx = null;
export function beep(vol, freq = 440, dur = 0.12, type = 'sine', slide = 0) {
  if (!vol) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { /* audio unavailable */ }
}
const SND = { attack: () => [[220, 0.14, 'sawtooth', -60], [180, 0.18, 'sawtooth', -50]], built: () => [[520, 0.1, 'triangle'], [780, 0.14, 'triangle']], trained: () => [[600, 0.08, 'sine']], warn: () => [[160, 0.16, 'square']], info: () => [[500, 0.07, 'sine']], big: () => [[330, 0.2, 'triangle'], [440, 0.2, 'triangle'], [660, 0.3, 'triangle']] };

export function createAlerts(ui, root) {
  const box = h('div', 'rts-toasts', root), edge = h('div', 'rts-edge', root);
  let lastAtk = -99, lastIdle = 0, lastGen = {}, idleSeen = 0, tmr = 0, lastToast = '', lastToastT = 0;
  const log = [];
  const play = (k) => { let t = 0; for (const s of (SND[k] || SND.info)()) { setTimeout(() => beep(ui.settings.volume, s[0], s[1], s[2], s[3] || 0), t); t += 90; } };
  function toast(text, kind = 'info', pos) {
    const now = performance.now(); if (text === lastToast && now - lastToastT < 1200) return; lastToast = text; lastToastT = now;
    const d = h('div', 'toast ' + kind, box, text); log.push(text); if (log.length > 40) log.shift();
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => d.classList.add('out'), kind === 'big' ? 5200 : 3800); setTimeout(() => d.remove(), kind === 'big' ? 5900 : 4400);
    if (kind !== 'info' || pos) play(kind === 'warn' ? 'warn' : kind === 'big' ? 'big' : kind);
  }
  function ping(x, z, kind) { ui.mmPings.push({ x, z, kind, t: 0, life: 3 }); ui.edgePings.push({ x, z, kind, t: 0, life: 4 }); ui.ctl.lastAlert = { x, z }; }
  function handleEvents(evs) {
    const st = ui.st, me = ui.team.id;
    for (const e of evs) {
      switch (e.type) {
        case 'msg': if (e.team === undefined || e.team === me) toast(e.text, e.kind === 'warn' ? 'warn' : e.kind === 'world' ? 'big' : 'info'); break;
        case 'announce': toast(e.text, 'big'); break;
        case 'alert': if (e.team === me) { toast(prettyId(e.what || 'alert') + '!', 'warn'); ping(e.x, e.z, 'attack'); } break;
        case 'hit': {
          const t = st.byId.get(e.tgt); if (!t || t.team !== me || !(e.amt > 0)) break;
          if (st.t - lastAtk > 8) { lastAtk = st.t; const src = st.byId.get(e.src); if (!src || src.team !== me) { toast(t.kind === 'bld' ? 'Your buildings are under attack!' : 'Your units are under attack!', 'warn'); ping(t.x, t.z, 'attack'); } }
          break;
        }
        case 'death': if (e.team === me && e.kind === 'bld' && e.bld !== 'wall') { toast(bdef(e.bld, ui.team).name + ' destroyed!', 'warn'); ping(e.x, e.z, 'attack'); } else if (e.team === me && e.kind === 'unit') { const u = st.byId.get(e.id); if (u && u.general) toast(unitName(u) + ' has fallen!', 'warn'); } break;
        case 'built': { const b = st.byId.get(e.id); if (b && b.team === me && !b.wall) { toast(bdef(b.type, ui.team).name + ' complete', 'info', true); } break; }
        case 'trained': { const b = st.byId.get(e.bld); if (b && b.team === me) { const u = st.byId.get(e.unit); if (u) play('trained'); } break; }
        case 'researched': if (e.team === me) toast('Research complete: ' + (ui.techName ? ui.techName(e.id) : prettyId(e.id)), 'big'); break;
        case 'levelup': { const u = st.byId.get(e.unit); if (u && u.team === me && u.general) { toast(unitName(u) + ' reached level ' + e.lvl + '!', 'big'); ui.markGeneral && ui.markGeneral(); } break; }
        default: break;
      }
    }
  }
  function update(dt) {
    tmr -= dt;
    if (tmr <= 0) {
      tmr = 1;
      const st = ui.st, me = ui.team.id;
      const idle = ui.ctl.idleWorkers().length;
      if (idle > 0 && idle !== idleSeen && st.t - lastIdle > 25) { lastIdle = st.t; toast(idle + ' idle worker' + (idle > 1 ? 's' : '') + ' (press . to select)', 'info', true); }
      idleSeen = idle;
      for (const u of st.ents) if (u.alive && u.general && u.team !== me && u.team < 4 && ui.visibleEnt && ui.visibleEnt(u) && st.t - (lastGen[u.id] || -999) > 60) { lastGen[u.id] = st.t; toast('Enemy general spotted: ' + unitName(u), 'warn'); ping(u.x, u.z, 'attack'); }
    }
    // edge pings
    ui.edgePings = ui.edgePings.filter((p) => (p.t += dt) < p.life);
    while (edge.children.length < ui.edgePings.length) h('div', 'ep', edge, '➤');
    [...edge.children].forEach((c, i) => {
      const p = ui.edgePings[i]; if (!p) { c.style.display = 'none'; return; }
      const s = ui.game.renderer.worldToScreen(p.x, p.z, 0), sx = Array.isArray(s) ? s[0] : s.x, sy = Array.isArray(s) ? s[1] : s.y;
      const W = innerWidth, H = innerHeight, inside = sx > 30 && sx < W - 30 && sy > 60 && sy < H - 30 && !s.behind;
      if (inside) { c.style.display = 'none'; return; }
      const cx = W / 2, cy = H / 2; let dx = sx - cx, dy = sy - cy; if (s.behind) { dx = -dx; dy = -dy; }
      const k = Math.min((W / 2 - 34) / Math.abs(dx || 1e-3), (H / 2 - 40) / Math.abs(dy || 1e-3));
      c.style.display = 'block'; c.style.left = cx + dx * k + 'px'; c.style.top = cy + dy * k + 'px';
      c.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`; c.style.opacity = String(1 - p.t / p.life); c.className = 'ep ' + p.kind;
    });
  }
  return { toast, handleEvents, update, ping, log };
}
