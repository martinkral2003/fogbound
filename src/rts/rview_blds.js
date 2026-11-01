// FOGBOUND: DOMINION client: building + wall layer. Instanced per model key (walls share geometry); animates gates, turrets, recoil, damage,
// construction (growing model + scaffold), ruins, remembered enemy buildings, and registers fx emitters (braziers, smoke, burning timber).
import * as THREE from 'three';
import { InstancedRig, rigMaterials } from './models_rts.js';
import { buildingModel } from './rmodel_blds.js';
import { scaffoldModel, ruinModel } from './rmodel_blds2.js';
import { wallModel } from './rmodel_walls.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const LOOK = { necro: 'bone', orc: 'orc', demon: 'hell', cult: 'blood' };
const r2 = (v) => Math.round(v * 20) / 20;
const wrap = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };
export const turretKind = (type, b) => (b && b.turret && b.turret.kind) || (/cannon/.test(type) ? 'cannon' : /magic/.test(type) ? 'magic' : /ballista/.test(type) ? 'ballista' : /watch/.test(type) ? 'none' : 'arrow');

export function createBldLayer(ctx) {
  const { scene, st, world } = ctx;
  const mats = rigMaterials(), rigs = new Map(), models = new Map(), recs = new Map();
  function rigFor(key, make) {
    let m = models.get(key);
    if (!m) { m = make(); m.rig = new InstancedRig(scene, m.geo, mats.bld, 8); models.set(key, m); rigs.set(key, m.rig); }
    return m;
  }
  function modelOf(b, f, isRuin, burnt) {
    const w = r2(b.w || 4), d = r2(b.d || 4), h = r2(b.h || 4);
    if (isRuin) return rigFor(`R|${f}|${w}|${d}|${h}`, () => ruinModel(w, d, h, f, !!burnt));
    if (b.wall && b.wall.piece) {
      const tk = turretKind(b.type, b), look = b.wall.look || LOOK[f] || 'bone', tier = b.wall.tier | 0;
      return rigFor(`W|${b.type}|${b.wall.piece}|${tier}|${look}|${w}|${d}|${h}|${tk}`, () => wallModel(b.wall.piece, tier, look, w, d, h, tk));
    }
    return rigFor(`B|${b.type}|${f}|${w}|${d}|${h}`, () => buildingModel(b.type, f, w, d, h));
  }
  const scaf = new Map();
  function scaffoldFor(w, d, h) {
    const key = `${r2(w)}|${r2(d)}|${r2(h)}`;
    let m = scaf.get(key);
    if (!m) { m = scaffoldModel(w, d, h); m.rig = new InstancedRig(scene, m.geo, mats.bld, 4); scaf.set(key, m); }
    return m;
  }
  function rec(b) {
    let r = recs.get(b.id);
    if (!r) {
      const gx = b.w / 2, gz = b.d / 2, c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
      let lo = world.heightAt(b.x, b.z);
      for (const [lx, lz] of [[gx, gz], [-gx, gz], [gx, -gz], [-gx, -gz]]) lo = Math.min(lo, world.heightAt(b.x + lx * c - lz * s, b.z + lx * s + lz * c));
      r = { baseY: Math.max(lo, 0.0) - (b.wall ? 0.05 : 0.12), open: 0, tyaw: 0, recoil: 0, flash: 0, seen: false, snap: null, hpf: 1, prog: 1, state: 'ready' };
      recs.set(b.id, r);
    }
    return r;
  }
  function onEvent(e) {
    if (e.type === 'hit' || e.type === 'siege') { const t = recs.get(e.tgt); if (t && e.amt > 0) t.flash = Math.max(t.flash, 0.7); }
    else if (e.type === 'shot') { const s = recs.get(e.src); if (s) s.recoil = 1; }
    else if (e.type === 'cast') { const s = recs.get(e.caster); if (s) s.recoil = 1; }
  }
  let emitBudget = 0;
  function update(dt, t, alpha, view) {
    for (const r of rigs.values()) r.begin();
    for (const m of scaf.values()) m.rig.begin();
    const local = ctx.local; emitBudget = 140; ctx.bldPos.clear();
    for (let i = 0; i < st.blds.length; i++) {
      const b = st.blds[i];
      const r = rec(b), mine = b.team === local, vis = mine || ctx.fog.visible(b.x, b.z);
      if (vis) {
        r.seen = true;
        r.state = b.state; r.hpf = b.maxHp > 0 ? Math.max(0, b.hp / b.maxHp) : 1; r.prog = b.state === 'building' ? (b.progress ?? 0) : 1;
        r.gopen = !!(b.wall && b.wall.open);
      } else if (!r.seen) continue;
      if (!ctx.inView(b.x, r.baseY + (b.h || 4) * 0.5, b.z, Math.max(b.w, b.d, b.h || 4) * 0.9 + 3)) continue;
      const f = ctx.fkey(b.team), mdl = modelOf(b, f, r.state === 'ruin', r.hpf <= 0);
      // animation state
      r.open += ((r.gopen ? 1 : 0) - r.open) * Math.min(1, dt * 3.5);
      r.recoil = Math.max(0, r.recoil - dt * 3); r.flash = Math.max(0, r.flash - dt * 3);
      if (b.turret && vis) {
        let want = r.tyaw;
        const tg = b.turret.target ? st.byId.get(b.turret.target) : null;
        if (tg && tg.x !== undefined && (tg.alive !== false)) want = Math.atan2(tg.z - b.z, tg.x - b.x) - (b.rot || 0);
        else if (b.turret.aim !== undefined) want = b.turret.aim - (b.rot || 0);
        else want = Math.sin(t * 0.35 + b.id) * 0.9;
        r.tyaw = wrap(r.tyaw + wrap(want - r.tyaw) * Math.min(1, dt * 7));
      }
      const building = r.state === 'building', ruin = r.state === 'ruin';
      const k = building ? 0.12 + 0.88 * r.prog : 1;
      _q.setFromAxisAngle(_up, -(b.rot || 0)); _p.set(b.x, r.baseY, b.z); _s.set(1, k, 1); _m.compose(_p, _q, _s);
      const col = ctx.teamCol[b.team] || ctx.neutralCol;
      const dmg = r.hpf < 0.75 && !ruin ? Math.min(1, (0.75 - r.hpf) / 0.7) : 0;
      const idx = mdl.rig.next();
      mdl.rig.set(idx, _m, r.open, r.tyaw, r.recoil, dmg, col.r, col.g, col.b, r.flash);
      ctx.bldPos.set(b.id, r);
      if (building) {
        const sm = scaffoldFor(b.w, b.d, b.h || 4); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
        const j = sm.rig.next(); sm.rig.set(j, _m, 0, 0, 0, 0, col.r, col.g, col.b, 0);
        if (vis && emitBudget > 0 && ctx.camDist < 120) ctx.fx.dust(b, dt, r.prog);
      }
      // emitters (fire, smoke, braziers) for nearby visible buildings
      if (vis && emitBudget > 0 && ctx.camDist < 110 && !building) {
        const em = mdl.emit;
        if (em && em.length && !ruin) {
          const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
          for (let q = 0; q < em.length && emitBudget > 0; q++, emitBudget--) { const e = em[q]; ctx.fx.emitter(e.kind, b.x + e.x * c - e.z * s, r.baseY + e.y * k, b.z + e.x * s + e.z * c, e.size, e.col, dt, b.id * 7 + q); }
        } else if (ruin && em && em.length) ctx.fx.emitter('smoke', b.x, r.baseY + 1, b.z, 1.6, 0x3a3a3a, dt, b.id);
        if (!ruin && (r.hpf < 0.45 || b.state === 'burning')) { emitBudget -= 2; ctx.fx.burn(b.x, r.baseY, b.z, b.w, b.d, b.h || 4, r.hpf < 0.45 ? 1 - r.hpf / 0.45 : 1, dt, b.id); }
      }
    }
    for (const r of rigs.values()) r.end();
    for (const m of scaf.values()) m.rig.end();
  }
  return { update, onEvent, recs, rigs, modelOf };
}
