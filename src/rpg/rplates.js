// FOGBOUND: HERO nameplates: pooled DOM plates (src/plates.js + style.css .pl) over rivals, monsters and NPCs.
// Shown: rivals within 45 m, damaged / locked monsters, champions + bosses from afar, NPC names up close.
import * as THREE from 'three';
import * as PL from '../plates.js';
import { clamp } from '../util.js';

const SMAP = { burn: 'burn', poison: 'poison', slow: 'slow', root: 'slow', stun: 'stun', bleed: 'debuff', shield: 'buff', regen: 'buff' };
export function createPlates(wv, st, game, canvas) {
  let root = document.getElementById('plates');
  if (!root) { root = document.createElement('div'); root.id = 'plates'; document.body.appendChild(root); }
  if (!document.getElementById('rpgPlateCss')) {
    const s = document.createElement('style'); s.id = 'rpgPlateCss';
    s.textContent = '.pl.npc .pr{display:none}.pl.npc .pn{color:#e8d8a8;font-size:12px;letter-spacing:1.4px}.pl.rival .pn{color:#f0c0a0}';
    document.head.appendChild(s);
  }
  const pool = PL.createPlates(root), v = new THREE.Vector3(), buf = [], cand = [];
  const hitT = new Map();
  function update(dt, now, recs, focus, camera, lockId) {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    cand.length = 0;
    for (const [id, r] of recs) {
      const a = r.a; if (a === focus || !r.ch.obj.visible || !a.alive) continue;
      const dx = a.x - focus.x, dz = a.z - focus.z, d = Math.hypot(dx, dz), pct = clamp(a.hp / a.maxHp, 0, 1);
      const boss = !!a.boss, champ = !!a.champion, locked = lockId === a.id, recent = a.lastHitAt !== undefined && st.t - a.lastHitAt < 8;
      let pri = 9, show = false;
      if (a.kind === 'rival') { show = d < 45 || locked; pri = 1; }
      else if (a.kind === 'monster') { show = locked || (boss && d < 90) || (champ && d < 55) || (pct < 0.999 && d < 32); pri = boss ? 0 : champ ? 2 : 4; }
      else if (a.kind === 'npc') { show = d < 13; pri = 6; }
      if (locked) pri = -1;
      if (show) cand.push({ a, r, d, pct, pri, boss, champ, locked });
    }
    cand.sort((u, w) => u.pri - w.pri || u.d - w.d);
    pool.begin();
    for (const c of cand) {
      if (pool.count() >= 28) break;
      const a = c.a, top = c.r.ch.top * (a.scale || 1) * (a.kind === 'monster' ? 1 : 1);
      v.set(a.x, a.y + top + 0.35, a.z).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || v.y < -1.1 || v.y > 1.2) continue;
      const kind = a.kind, cls = (c.boss ? 'boss' : c.champ ? 'champ' : kind === 'rival' ? 'hero rival' : kind === 'npc' ? 'unit npc' : 'unit') + (kind === 'npc' ? ' neu' : ' foe');
      const tint = c.boss ? PL.css(PL.BOSS_TINT) : c.champ ? PL.css(PL.CHAMP_TINT) : kind === 'npc' ? '#e0c070' : kind === 'rival' ? '#e08a50' : '#b8503c';
      const name = kind === 'monster' && !c.champ && !c.boss && !c.locked ? '' : a.name;
      buf.length = 0;
      let mask = 0;
      for (const s of a.status || []) { const k = SMAP[s.id]; if (k) mask |= 1 << PL.STATUS_KEYS.indexOf(k); }
      pool.show({ x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, cls, tint, name, lvl: a.lvl || 1, pct: c.pct, shield: 0, segs: clamp(Math.round(a.maxHp / (c.boss ? 150 : 40)), 3, 20), mask, hit: a.cs && a.cs.state === 'stagger' });
    }
    pool.end();
  }
  return { update };
}
