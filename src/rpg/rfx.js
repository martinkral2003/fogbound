// FOGBOUND: HERO effects: event -> sparks / rings / beams / floating numbers, projectile meshes with trails, screen vignette.
import * as THREE from 'three';
import { glowSpriteMat } from '../models.js';
import { RARITY_COL } from './chars_weapons.js';

const DT_COL = { physical: 0xffd8a8, fire: 0xff8a30, cold: 0x9fe0ff, lightning: 0xffee60, poison: 0x9be048 };
const DT_CSS = { physical: '#f4ece0', fire: '#ffa040', cold: '#90e0ff', lightning: '#fff060', poison: '#a8e050' };
const SPELL_COL = { firebolt: 0xff7a28, frostshard: 0x80d8ff, arc: 0xfff070, venom: 0x8be04a, nova: 0xff6a20, drain: 0x70e060, blink: 0xb8a0ff, mend: 0x80ffa0, stoneskin: 0xc8b890, bonewarden: 0xb8f0d8 };

export function createFx(wv, st, game) {
  const { scene } = wv, world = st.world, rnd = wv.rnd;
  const root = document.createElement('div'); root.id = 'rpgFloaters';
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:4';
  document.body.appendChild(root);
  const vig = document.createElement('div'); vig.id = 'rpgVignette';
  vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;transition:none';
  document.body.appendChild(vig);
  if (!document.getElementById('rpgFxCss')) {
    const s = document.createElement('style'); s.id = 'rpgFxCss';
    s.textContent = '.rfl{position:absolute;left:0;top:0;font:bold 17px Georgia,serif;color:#fff;text-shadow:0 1px 3px #000,0 0 6px #000;white-space:nowrap;will-change:transform}.rfl.crit{font-size:28px;letter-spacing:1px}.rfl.hurt{color:#ff6a5a!important}.rfl.blk{color:#c8d0d8!important;font-size:14px}.rfl.par{color:#fff!important;font-size:24px;letter-spacing:3px;text-shadow:0 0 12px #bfe8ff,0 1px 3px #000}.rfl.xp{color:#e8d070!important;font-size:15px}.rfl.lvl{color:#ffe08a!important;font-size:30px;letter-spacing:3px}';
    document.head.appendChild(s);
  }
  const floaters = [], v = new THREE.Vector3();
  function floater(x, y, z, text, cls, color, big) {
    if (floaters.length > 40) floaters.shift().el.remove();
    const el = document.createElement('div'); el.className = 'rfl ' + (cls || '') + (big ? ' crit' : ''); el.textContent = text; if (color) el.style.color = color;
    root.appendChild(el); floaters.push({ el, x, y, z, t: 0, dx: (Math.random() - 0.5) * 30 });
  }
  const spark = (x, y, z, n, sp, col, life = 0.35, size = 0.3, g = 8) => wv.burst(x, y, z, n, sp, col, life, size, g);
  const gore = (x, y, z, n = 3) => { for (let i = 0; i < n; i++) wv.spawn(wv.smokeP, x + rnd(0.2), y + rnd(0.2), z + rnd(0.2), rnd(1.2), 0.6 + Math.random() * 1.2, rnd(1.2), 0.9, 0.7, 0x2a0c0c, 2, 0.55); };
  const bodyY = (a) => (a ? a.y + (a.height || 1.8) * (a.scale || 1) * 0.62 : 1.2);
  const line = (pts, color, dur = 0.25, w = 0.07) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    wv.addFx(l, dur, (f, p) => { f.obj.material.opacity = 1 - p; });
    void w;
  };

  function handleEvents(events, focus) {
    const P = st.player;
    for (const e of events) {
      const near = e.x === undefined || Math.hypot(e.x - focus.x, e.z - focus.z) < 90;
      switch (e.type) {
        case 'hit': {
          if (!near) break;
          const t = st.byId.get(e.tgt), y = bodyY(t), mine = P && e.tgt === P.id, col = DT_COL[e.dtype] || 0xffd8a8;
          if (e.parried) { wv.ringFx(e.x, e.z, 2.0, 0xffffff, 0.35, y - (t ? t.y : 0)); spark(e.x, y, e.z, 18, 6, 0xffffff, 0.35, 0.35, 2); wv.addFlash(0.4, 0xdff4ff, e.x, y + 0.5, e.z); floater(e.x, y + 0.6, e.z, 'PARRY', 'par'); if (mine) wv.addShake(0.2); break; }
          if (e.blocked) { spark(e.x, y, e.z, 10, 5, 0xffe8b0, 0.25, 0.25, 3); floater(e.x, y + 0.4, e.z, Math.round(e.amt) > 0 ? String(Math.round(e.amt)) : 'Blocked', 'blk'); if (mine) wv.addShake(0.12); break; }
          if (e.amt <= 0) break;
          spark(e.x, y, e.z, e.crit ? 14 : 6, e.crit ? 6 : 4, col, 0.3, e.crit ? 0.45 : 0.3, 8);
          if (e.dtype === 'physical' || !e.dtype) gore(e.x, y, e.z, e.crit ? 4 : 2);
          floater(e.x, y + 0.8, e.z, String(Math.max(1, Math.round(e.amt))) + (e.crit ? '!' : ''), (mine ? 'hurt ' : '') + (e.crit ? 'crit' : ''), mine ? null : DT_CSS[e.dtype] || '#fff', e.crit);
          if (mine) wv.addShake(Math.min(0.5, 0.1 + e.amt / (P.maxHp || 100) * 2));
          else if (e.crit) wv.addShake(0.08);
          break;
        }
        case 'dodge': { const a = st.byId.get(e.actor); if (a && near) for (let i = 0; i < 6; i++) wv.spawn(wv.smokeP, a.x + rnd(0.4), a.y + 0.2, a.z + rnd(0.4), rnd(1.5), 0.5, rnd(1.5), 0.6, 0.8, 0x7a7060, 0, 0.45); break; }
        case 'shoot': if (near) spark(e.x, 1.4, e.z, 3, 2, 0xffffff, 0.2, 0.2, 0); break;
        case 'cast': castFx(e); break;
        case 'sfx': sfxFx(e, near); break;
        case 'levelup': { const a = st.byId.get(e.actor); if (a && near) { wv.ringFx(a.x, a.z, 3.4, 0xffd860, 0.9); spark(a.x, a.y + 0.5, a.z, 28, 3.5, 0xffd860, 1.1, 0.5, -2); wv.beamFx(a.x, a.z, 0xffe080, 1.2, 0.9, 12); if (P && a.id === P.id) floater(a.x, a.y + 2.4, a.z, 'LEVEL ' + e.lvl, 'lvl'); } break; }
        case 'pickup': { const a = st.byId.get(e.actor); if (a && near) spark(a.x, a.y + 1.0, a.z, 10, 2.5, RARITY_COL[e.rarity | 0] || 0xffffff, 0.7, 0.35, -1); break; }
        case 'open': { const c = st.containers.find((q) => q.id === e.container); if (c && near) spark(c.x, 0.9, c.z, 16, 3, 0xffd860, 0.8, 0.4, 3); break; }
        case 'death': {
          if (!near) break;
          const a = st.byId.get(e.actor), y = bodyY(a), skel = a && /skel/.test(a.model || '');
          spark(e.x, y, e.z, 12, 3, skel ? 0xd8d2bc : 0x5a1a1a, 0.8, 0.5, 6); gore(e.x, y, e.z, 5);
          for (let i = 0; i < 4; i++) wv.spawn(wv.smokeP, e.x + rnd(0.5), (a ? a.y : 0) + 0.5, e.z + rnd(0.5), rnd(0.6), 0.8, rnd(0.6), 1.6, 1.4, 0x34322e, -0.2, 0.5);
          if (P && e.actor === P.id) wv.addShake(0.6);
          break;
        }
        default: break;
      }
    }
  }
  function castFx(e) {
    const a = st.byId.get(e.actor), sp = String(e.spell || '');
    if (!a) return;
    const col = SPELL_COL[sp.split('-')[0]] || DT_COL[e.dtype] || 0xc8b0ff, hx = a.x + Math.cos(a.yaw) * 0.7, hz = a.z + Math.sin(a.yaw) * 0.7, hy = a.y + 1.35;
    if (sp === 'drain-beam') { const t = st.byId.get(e.tgt); if (t) { line([new THREE.Vector3(hx, hy, hz), new THREE.Vector3(t.x, bodyY(t), t.z)], 0x70e060, 0.35); spark(t.x, bodyY(t), t.z, 8, 2, 0x70e060, 0.5, 0.35, -2); } }
    else if (sp === 'arc-chain' && e.path) { const pts = [new THREE.Vector3(hx, hy, hz)]; for (const q of e.path) pts.push(new THREE.Vector3(q.x + rnd(0.15), world.heightAt(q.x, q.z) + 1.2, q.z + rnd(0.15))); line(pts, 0xfff070, 0.22); for (const q of e.path) spark(q.x, world.heightAt(q.x, q.z) + 1.2, q.z, 6, 3, 0xfff070, 0.25, 0.3, 0); wv.addFlash(0.5, 0xfff070, hx, hy, hz); }
    else if (sp === 'mend') { wv.ringFx(a.x, a.z, 1.8, 0x80ffa0, 0.8, 0.3); spark(a.x, a.y + 0.3, a.z, 16, 1.5, 0x80ffa0, 1.0, 0.4, -2); }
    else if (sp === 'stoneskin') { wv.ringFx(a.x, a.z, 1.6, 0xc8b890, 0.6, 0.3); spark(a.x, a.y + 1, a.z, 14, 2, 0xc8b890, 0.6, 0.4, 4); }
    else spark(hx, hy, hz, 8, 2, col, 0.4, 0.4, 0);
  }
  function sfxFx(e, near) {
    if (!near) return;
    switch (e.name) {
      case 'nova': wv.ringFx(e.x, e.z, e.r || 5, 0xff7a28, 0.6); spark(e.x, 1, e.z, 34, (e.r || 5) * 1.1, 0xff7a28, 0.7, 0.7, 2); wv.addFlash(0.9, 0xff8a40, e.x, 2, e.z); wv.addShake(0.3); break;
      case 'explode': wv.ringFx(e.x, e.z, e.r || 2, 0xff9a40, 0.45); spark(e.x, 1, e.z, 22, 5, 0xff9a40, 0.5, 0.6, 4); for (let i = 0; i < 3; i++) wv.spawn(wv.smokeP, e.x + rnd(1), 0.8, e.z + rnd(1), rnd(1), 1.5, rnd(1), 1.4, 1.5, 0x3a3836, -0.3, 0.5); wv.addFlash(0.7, 0xffa050, e.x, 2, e.z); break;
      case 'blink': for (const [x, z] of [[e.x, e.z], [e.tx, e.tz]]) { wv.ringFx(x, z, 1.5, 0xb8a0ff, 0.5); spark(x, 1.2, z, 18, 3, 0xb8a0ff, 0.6, 0.45, -2); } break;
      case 'summon': wv.ringFx(e.x, e.z, 2.2, 0xb8f0d8, 0.7); spark(e.x, 0.6, e.z, 16, 2.4, 0xb8f0d8, 0.8, 0.45, -2); break;
      case 'shrine': wv.ringFx(e.x, e.z, 5, 0xffe8a0, 1.0); wv.beamFx(e.x, e.z, 0xffe8a0, 1.4, 1.2, 14); spark(e.x, 1, e.z, 24, 3, 0xffe8a0, 1.0, 0.5, -1); break;
      case 'lore': wv.ringFx(e.x, e.z, 2, 0x9fd0ff, 0.9); spark(e.x, 1.2, e.z, 14, 1.5, 0x9fd0ff, 1, 0.4, -1); break;
      case 'heavyReady': { const a = st.byId.get(e.actor); if (a) { spark(a.x, a.y + 1.6, a.z, 10, 3, 0xffe0a0, 0.3, 0.4, 0); wv.ringFx(a.x, a.z, 1.4, 0xffe0a0, 0.3, 0.2, 0.6); } break; }
      default: break;
    }
  }

  // ------------------------------------------------------------ projectiles
  const pg = { arrow: new THREE.BoxGeometry(0.9, 0.035, 0.035), bolt: new THREE.BoxGeometry(0.6, 0.06, 0.06), orb: new THREE.SphereGeometry(0.2, 8, 6) };
  const pm = new Map(), pool = [];
  const mats = {};
  const basic = (c) => mats[c] || (mats[c] = new THREE.MeshBasicMaterial({ color: c }));
  function projMesh(p) {
    let o = pool.pop();
    if (!o) { o = { g: new THREE.Group(), body: new THREE.Mesh(pg.arrow, basic(0xe0e0d0)), glow: new THREE.Sprite(glowSpriteMat(0xffffff, 0.9)) }; o.g.add(o.body, o.glow); scene.add(o.g); }
    const spell = p.kind === 'spell', col = p.color || SPELL_COL[p.spell] || 0xffffff;
    o.body.geometry = spell ? pg.orb : p.kind === 'bolt' ? pg.bolt : pg.arrow; o.body.material = basic(spell ? 0xffffff : p.kind === 'bolt' && p.dtype === 'cold' ? 0xbfe4ff : col);
    o.glow.visible = spell || p.dtype !== 'physical'; o.glow.material = glowSpriteMat(spell ? (SPELL_COL[p.spell] || col) : col, 0.85); o.glow.scale.setScalar(spell ? 1.3 : 0.7);
    o.g.visible = true; return o;
  }
  const fwd = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  function updateProjs(dt, alpha) {
    const live = new Set();
    for (const p of st.projs) {
      live.add(p.id);
      let o = pm.get(p.id); if (!o) { o = projMesh(p); pm.set(p.id, o); }
      const k = 1 / 30, x = p.x - p.vx * (1 - 0) * 0, y = p.y, z = p.z; void k;
      o.g.position.set(x, y, z);
      fwd.set(p.vx, p.vy - 0, p.vz); if (fwd.lengthSq() > 1e-4) { fwd.normalize(); o.g.quaternion.setFromUnitVectors(X, fwd); }
      if (p.kind === 'spell') { const col = SPELL_COL[p.spell] || p.color || 0xffffff; if (Math.random() < 0.9) wv.spawn(wv.glowP, x + rnd(0.1), y + rnd(0.1), z + rnd(0.1), rnd(0.4), rnd(0.4) + (p.spell === 'firebolt' ? 0.5 : 0), rnd(0.4), 0.45, 0.5, col, 0, 0.9); }
      else if (p.dtype !== 'physical' && Math.random() < 0.5) wv.spawn(wv.glowP, x, y, z, rnd(0.2), rnd(0.2), rnd(0.2), 0.3, 0.3, p.color || 0xffffff, 0, 0.8);
      else if (Math.random() < 0.35) wv.spawn(wv.smokeP, x, y, z, 0, 0, 0, 0.3, 0.12, 0xd8d4c8, 0, 0.25);
    }
    for (const [id, o] of pm) if (!live.has(id)) { o.g.visible = false; pool.push(o); pm.delete(id); }
  }

  function update(dt, now, px, pz, camera) {
    updateProjs(dt);
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.t += dt;
      if (f.t > 1.2) { f.el.remove(); floaters.splice(i, 1); continue; }
      v.set(f.x, f.y + f.t * 1.4, f.z).project(camera);
      if (v.z > 1) { f.el.style.display = 'none'; continue; }
      f.el.style.display = 'block';
      f.el.style.transform = `translate(${(v.x + 1) / 2 * innerWidth + f.dx * f.t}px,${(1 - v.y) / 2 * innerHeight}px) translate(-50%,-50%)`;
      f.el.style.opacity = String(1 - Math.pow(f.t / 1.2, 3));
    }
  }
  let vkey = '';
  function setVignette(dmg, low, zone) {
    const lowA = Math.max(0, (low - 0.65) / 0.35) * (0.5 + 0.2 * Math.sin(performance.now() / 260)), a = Math.min(0.85, dmg * 0.6 + lowA * 0.7), z = Math.min(0.7, zone * 0.6);
    const key = a.toFixed(2) + z.toFixed(2); if (key === vkey) return; vkey = key;
    vig.style.background = `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(${z > a ? '90,10,14' : '150,8,8'},${Math.max(a, z)}) 100%)`;
  }
  return { update, handleEvents, setVignette, floater };
}
