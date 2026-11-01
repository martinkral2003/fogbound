// Scene objects + interaction prompt for st.pois (WORLD CONTENT lane). Used by dungeons_view.js. Models are small merged meshes, built once per POI.
import { lambert, glowSpriteMat, mergeColored } from './models.js';
import { POI } from './data.js';
import { POI_INFO } from './pois.js';

const TAU = Math.PI * 2;
const GLOW = { altar: 0xff3030, library: 0xffd070, graveyard: 0x70ff9a, well: 0x70c8ff, witch: 0x9aff50, cage: 0xffffff, hoard: 0xffd040, bridge: 0xffffff, cursed: 0xb060ff, watchtower: 0xff9a40, shrine: 0x80ffe8, caravan: 0xffd8a0 };
const SHOW_DIST = 240;

export function createPoisView(ctx) {
  const { THREE, scene, camera, st, world } = ctx;
  if (!st.pois || !st.pois.length) return null;
  const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const G = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 8), cone: new THREE.ConeGeometry(1, 1, 6), pyr: new THREE.ConeGeometry(1, 1, 4), sph: new THREE.SphereGeometry(1, 7, 5) };
  const solid = lambert(0xffffff, { vc: true, flat: true });
  const root = new THREE.Group(); scene.add(root);
  const geoCache = {};

  // part builders in model-local space (origin on the ground)
  const parts = [];
  const box = (x, y, z, w, h, d, c, ry = 0) => parts.push({ geo: G.box, color: c, m: M(x, y + h / 2, z, 0, ry, 0, w, h, d) });
  const cyl = (x, y, z, r, h, c, rx = 0) => parts.push({ geo: G.cyl, color: c, m: M(x, y + h / 2, z, rx, 0, 0, r, h, r) });
  const cone = (x, y, z, r, h, c) => parts.push({ geo: G.cone, color: c, m: M(x, y + h / 2, z, 0, 0, 0, r, h, r) });
  const pyr = (x, y, z, r, h, c, ry = Math.PI / 4) => parts.push({ geo: G.pyr, color: c, m: M(x, y + h / 2, z, 0, ry, 0, r, h, r) });
  const sph = (x, y, z, r, c, sy = 1) => parts.push({ geo: G.sph, color: c, m: M(x, y + r * sy, z, 0, 0, 0, r, r * sy, r) });

  const MODELS = {
    altar() { box(0, 0, 0, 3, 0.5, 2, 0x3c3a3c); box(0, 0.5, 0, 2.2, 0.8, 1.2, 0x4a4648); for (const [x, z] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) { cyl(x, 0, z, 0.18, 1.6, 0x2a2628); sph(x, 1.6, z, 0.2, 0xff5030, 1.3); } sph(0, 1.3, 0, 0.35, 0x7a1010, 0.8); },
    library() { box(-2.5, 0, 0, 0.8, 3.4, 5, 0x6d675d); box(0, 0, -2.6, 5, 2.2, 0.8, 0x6d675d); box(2.6, 0, 1, 0.8, 1.6, 3, 0x6d675d); for (let i = 0; i < 6; i++) box(-0.6 + (i % 3) * 0.9, 0, 0.6 + Math.floor(i / 3) * 0.7, 0.7, 0.18 + (i % 2) * 0.12, 0.5, [0x7a2a2a, 0x2a4a7a, 0x6a5a2a][i % 3], i); },
    graveyard() { for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 1.5 + (i % 3) * 1.6; box(Math.cos(a) * r, 0, Math.sin(a) * r, 0.8, 0.9 + (i % 2) * 0.5, 0.25, 0x8a8d88, a * 0.3); } cyl(3.4, 0, -2, 0.18, 3.6, 0x2a2420); box(3.4, 2.6, -2, 0.1, 0.1, 2, 0x2a2420); pyr(-3.5, 0, 2, 0.8, 1.1, 0x4a4a46); },
    well() { cyl(0, 0, 0, 1.5, 1.1, 0x6d6e70); cyl(0, 0.8, 0, 1.15, 0.35, 0x20384a); for (const s of [-1, 1]) cyl(s * 1.3, 0, 0, 0.12, 2.8, 0x4a3a2a); box(0, 2.8, 0, 3.1, 0.15, 0.3, 0x4a3a2a); pyr(0, 2.95, 0, 1.9, 0.9, 0x5a3a2a, Math.PI / 4); },
    witch() { box(0, 0, 0, 3.6, 2.2, 3.2, 0x4a3828); pyr(0, 2.2, 0, 3.2, 2.2, 0x2a3a2a); box(1.0, 0, 1.64, 0.9, 1.5, 0.12, 0x2a1a10); cyl(-1.2, 2.6, -0.6, 0.3, 1.4, 0x3a3836); sph(3.0, 0, 0.6, 0.6, 0x24282a, 0.9); cyl(3.0, 0.7, 0.6, 0.45, 0.12, 0x5ac040); for (let i = 0; i < 3; i++) cyl(-2.6 + i * 0.4, 0, 1.8, 0.1, 0.8, 0x8a8a70); },
    cage() { for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(x, 0, z, 0.1, 2.4, 0x3c3c40); box(0, 2.4, 0, 2.4, 0.14, 2.4, 0x3c3c40); box(0, 0, 0, 2.4, 0.12, 2.4, 0x2c2c30); for (let i = 0; i < 3; i++) { box(-0.5 + i * 0.5, 0.1, -1, 0.06, 2.3, 0.06, 0x4c4c50); box(-0.5 + i * 0.5, 0.1, 1, 0.06, 2.3, 0.06, 0x4c4c50); box(-1, 0.1, -0.5 + i * 0.5, 0.06, 2.3, 0.06, 0x4c4c50); box(1, 0.1, -0.5 + i * 0.5, 0.06, 2.3, 0.06, 0x4c4c50); } },
    hoard() { for (let i = 0; i < 18; i++) { const a = i * 1.9, r = (i % 6) * 0.45; sph(Math.cos(a) * r, 0, Math.sin(a) * r, 0.7 - (i % 6) * 0.07, 0xe0b030, 0.55); } box(3.2, 0, 1, 2.6, 1.0, 1.4, 0xd8d2bc); cone(3.9, 0.9, 0.6, 0.18, 0.8, 0xe8e2cc); cone(3.9, 0.9, 1.4, 0.18, 0.8, 0xe8e2cc); for (let i = 0; i < 4; i++) cone(-3 + i * 0.7, 0, 3, 0.2, 1.4 + (i % 2) * 0.5, 0xd8d2bc); },
    bridge() { box(0, 0.6, 0, 12, 0.35, 3.2, 0x5a4630); for (let i = -2; i <= 2; i++) { cyl(i * 2.6, 0, 1.55, 0.14, 1.9, 0x3a2c1c); cyl(i * 2.6, 0, -1.55, 0.14, 1.9, 0x3a2c1c); } box(0, 1.7, 1.55, 12, 0.1, 0.1, 0x3a2c1c); box(0, 1.7, -1.55, 12, 0.1, 0.1, 0x3a2c1c); box(7.4, 0, -2, 2.4, 1.6, 2, 0x4a3a2a); pyr(7.4, 1.6, -2, 2.0, 1.1, 0x3a2a1a); },
    cursed() { box(0, 0, 0, 1.8, 0.95, 1.1, 0x3a2848); parts.push({ geo: G.cyl, color: 0x3a2848, m: M(0, 1.0, 0, 0, 0, Math.PI / 2, 0.55, 1.8, 0.55) }); box(0, 0.5, 0.56, 0.3, 0.3, 0.1, 0xb060ff); cyl(-1.8, 0, 0, 0.1, 1.4, 0x2a2028); cyl(1.8, 0, 0, 0.1, 1.2, 0x2a2028); },
    watchtower() { cyl(0, 0, 0, 1.7, 0.6, 0x5a5b5e); cyl(0, 0.6, 0, 1.2, 8, 0x6d6f72); cyl(0, 8.6, 0, 1.7, 0.5, 0x56585b); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; box(Math.cos(a) * 1.5, 9.1, Math.sin(a) * 1.5, 0.7, 0.9, 0.7, 0x56585b); } cyl(0, 9.1, 0, 0.5, 0.5, 0x2e2a28); },
    shrine() { box(-1.3, 0, 0, 0.6, 2.8, 0.7, 0x5a5e60); box(1.3, 0, 0, 0.6, 2.8, 0.7, 0x5a5e60); box(0, 2.8, 0, 3.2, 0.6, 0.8, 0x666a6c); cone(0, 0.2, 0, 0.5, 1.4, 0x60e8d0); cyl(0, 0, 0, 0.9, 0.2, 0x4a4e50); },
    caravan() { box(0, 0.7, 0, 3.4, 0.35, 1.7, 0x6a4a2a); box(0, 1.05, 0, 3.0, 1.1, 1.5, 0x8a6a3a); pyr(0, 2.0, 0, 2.2, 1.1, 0xc8b890, 0); for (const sx of [-1.1, 1.1]) for (const sz of [-0.95, 0.95]) parts.push({ geo: G.cyl, color: 0x3a2a1a, m: M(sx, 0.6, sz, Math.PI / 2, 0, 0, 0.6, 0.18, 0.6) }); box(2.4, 0.8, 0, 1.5, 0.12, 0.2, 0x3a2a1a); sph(3.6, 0, 0, 0.7, 0x5a4a3a, 1.2); },
  };

  function modelFor(type) {
    if (geoCache[type]) return geoCache[type];
    parts.length = 0; MODELS[type]();
    return (geoCache[type] = mergeColored(parts));
  }

  const recs = [];
  const info = (p) => POI_INFO[p.type];
  for (const p of st.pois) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(modelFor(p.type), solid); g.add(mesh);
    const sp = new THREE.Sprite(glowSpriteMat(GLOW[p.type] || 0xffffff, 0.8));
    const gy = { altar: 1.7, library: 1.5, graveyard: 1.2, well: 1.6, witch: 1.2, cage: 1.2, hoard: 1.0, bridge: 2.4, cursed: 1.4, watchtower: 9.6, shrine: 1.4, caravan: 2.6 }[p.type] || 1.5;
    sp.position.y = gy; sp.scale.set(3.4, 3.4, 1); g.add(sp);
    // pickup ring so POIs read from afar
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 32), new THREE.MeshBasicMaterial({ color: GLOW[p.type] || 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; ring.scale.setScalar(POI.reach); g.add(ring);
    g.rotation.y = ((p.id * 2654435761) % 628) / 100;
    root.add(g);
    recs.push({ p, g, sp, ring, gy, baseY: world.heightAt(p.x, p.z) });
    g.position.set(p.x, recs[recs.length - 1].baseY, p.z);
  }

  // interaction prompt (DOM): "[E] verb" with a hint of the cost
  let hint = null;
  try {
    hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;left:50%;bottom:22%;transform:translateX(-50%);padding:6px 14px;background:rgba(12,10,8,.78);border:1px solid #6a5a3a;color:#f0e2b8;font:600 15px system-ui,sans-serif;border-radius:4px;pointer-events:none;display:none;z-index:20;text-shadow:0 1px 2px #000';
    document.body.appendChild(hint);
  } catch (e) { hint = null; }

  function hintText(p, team) {
    const [name, verb] = info(p), A = POI;
    let extra = '';
    switch (p.type) {
      case 'altar': extra = p.cd > 0 ? ` (${Math.ceil(p.cd)} s)` : ` (-${Math.round(A.altar.hpFrac * 100)}% HP, XP)`; break;
      case 'library': extra = p.used ? ' (empty)' : ` (+${A.library.points} research)`; break;
      case 'graveyard': extra = p.cd > 0 ? ` (${Math.ceil(p.cd)} s)` : ` (${A.graveyard.cost} gold)`; break;
      case 'well': extra = p.left > 0 ? ` (${A.well.cost} gold, ${p.left} left)` : ' (dry)'; break;
      case 'witch': { const q = p.q && p.q[team.id]; extra = !q || q.s === 'none' ? ' (bounty)' : q.s === 'done' ? ' (claim reward)' : ` (${q.n}/${A.witch.kills} slain, brew ${A.witch.brewCost} gold)`; break; }
      case 'cage': extra = p.used ? ' (empty)' : (st.camps[p.camp] && st.camps[p.camp].mons > 0 ? ' (guarded)' : ''); break;
      case 'hoard': extra = p.used ? ' (empty)' : (st.camps[p.camp] && st.camps[p.camp].mons > 0 ? ' (guarded)' : ''); break;
      case 'bridge': extra = p.used ? ' (free)' : ` (${A.bridge.toll} gold, or fight)`; break;
      case 'cursed': extra = p.used ? ' (empty)' : ' (risky)'; break;
      case 'watchtower': extra = p.owner === team.id ? ' (yours)' : ''; break;
      case 'shrine': extra = p.cd > 0 ? ` (${Math.ceil(p.cd)} s)` : ''; break;
      case 'caravan': extra = p.state === 'moving' ? (p.team === team.id ? ' (escorting)' : ' (escorted)') : p.state === 'done' ? ' (gone)' : ` (${A.caravan.gold} gold)`; break;
    }
    return `${name}: [E] ${verb}${extra}`;
  }

  const burstCol = (kind) => GLOW[kind] || 0xffe9a0;
  const tmpV = new THREE.Vector3();
  return {
    frame(st2, alpha, dt) {
      const t = performance.now() / 1000, cx = camera.position.x, cz = camera.position.z, local = st.teams[ctx.localTeam];
      for (const r of recs) {
        const p = r.p, near = Math.hypot(p.x - cx, p.z - cz) < SHOW_DIST;
        let vis = near;
        if (vis && p.type === 'shrine') vis = !!p.disc[ctx.localTeam] || Math.hypot(p.x - local.hero.x, p.z - local.hero.z) < 30; // hidden shrines only show when found / close
        r.g.visible = vis;
        if (!vis) continue;
        if (p.type === 'caravan') { // moves; face the destination
          r.baseY = world.heightAt(p.x, p.z); r.g.position.set(p.x, r.baseY, p.z);
          r.g.rotation.y = -Math.atan2(p.dz - p.z, p.dx - p.x);
        }
        const dead = p.used || (p.type === 'well' && p.left <= 0) || (p.type === 'caravan' && p.state === 'done') || (p.cd > 0 && (p.type === 'altar' || p.type === 'graveyard' || p.type === 'shrine'));
        const lit = p.type === 'watchtower' ? p.owner >= 0 : !dead;
        r.sp.visible = lit;
        if (lit) { const k = 0.85 + 0.15 * Math.sin(t * 2.3 + p.id); r.sp.scale.set(3.4 * k, 3.4 * k, 1); }
        r.ring.visible = !dead;
        if (p.type === 'watchtower' && p.owner >= 0) { r.sp.material.color.setHex(st.teams[p.owner].f.color); }
      }
      if (hint) {
        const id = local && local.poiNear, p = id ? st.pois.find((q) => q.id === id) : null;
        if (p && local.hero.alive) { hint.textContent = hintText(p, local); hint.style.display = 'block'; } else hint.style.display = 'none';
      }
    },
    handleEvents(events) {
      for (const e of events) {
        if (e.type === 'poiUse') {
          const col = e.ok === false ? 0xc03030 : burstCol(e.kind), y = world.heightAt(e.x, e.z);
          if (ctx.burst) ctx.burst(e.x, y + 1.2, e.z, 22, 1.8, col, 0.8, 0.9, 5);
          if (ctx.ringFx) ctx.ringFx(e.x, e.z, 4.5, col, 0.9);
        }
      }
    },
    dispose() { scene.remove(root); if (hint && hint.parentNode) hint.parentNode.removeChild(hint); },
  };
}
