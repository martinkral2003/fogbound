// FOGBOUND: DOMINION RTS renderer (CLIENT-RENDER lane). createRtsRenderer(canvas, st, localTeam) -> {frame, screenToGround, worldToScreen, pick, resize, handleEvents, minimapBase, ...}.
// Camera convention (shared with the controls lane): eye = target + (sin(yaw)cos(p), sin(p), cos(yaw)cos(p)) * dist, target on the terrain at (cam.x, cam.z);
// yaw 0 looks toward -z (north up on the minimap), screen right = +x at yaw 0. cam.pitch in radians (degrees are detected if > 1.6). Screen coords are page (client) px.
// view = {cam:{x,z,yaw,pitch,dist}, selection:Set<id>, hover:id|0, ghosts:[{type,x,z,rot,ok,tier?}], rallies:[{x,z}], pings:[{x,z,age|t,kind}], drag, showTerritory, fogOn}.
import * as THREE from 'three';
import { createWorldView } from '../worldview.js';
import { FACTIONS } from './consts.js';
import { patchFog, FOG_U } from './models_rts.js';
import { createFog } from './rview_fog.js';
import { createUnitLayer } from './rview_units.js';
import { createBldLayer } from './rview_blds.js';
import { createOverlays } from './rview_ui.js';
import { createFx } from './rfx_fx.js';
import { createWorldLayer } from './rview_world.js';
import { createSky } from './rview_sky.js';
import { createTerritoryView } from './rview_terr.js';
import { buildMinimapBase } from './rview_mini.js';

export const DEFAULT_CAM = { x: 0, z: 0, yaw: 0, pitch: 0.96, dist: 70 };
export const camForward = (c) => ({ x: -Math.sin(c.yaw), z: -Math.cos(c.yaw) });
export const camRight = (c) => ({ x: Math.cos(c.yaw), z: -Math.sin(c.yaw) });

export function createRtsRenderer(canvas, st, localTeam = 0) {
  const world = st.world;
  const wv = createWorldView(canvas, world, { fov: 50, near: 1, far: 900, mist: 26, maxDpr: 1.5 });
  const { scene, camera, renderer } = wv;
  wv.heroLight.intensity = 0; camera.fov = 50; camera.updateProjectionMatrix();
  scene.add(camera);
  // fog-of-war multiplier on terrain, water, props (worldview owns those materials)
  patchFog(wv.terrain.material); patchFog(wv.water.material);
  for (const m of wv.mists) patchFog(m.material);
  scene.traverse((o) => { if (o.isInstancedMesh && o.material && o.material.vertexColors && o.material.flatShading) patchFog(o.material); });

  const teamCol = FACTIONS.map((f) => new THREE.Color(f.color)), teamHex = FACTIONS.map((f) => f.color);
  const frustum = new THREE.Frustum(), _pv = new THREE.Matrix4();
  const ctx = {
    st, world, wv, scene, camera, renderer, local: localTeam, teamCol, teamHex, time: 0, camDist: 70, frameN: 0,
    neutralCol: new THREE.Color(0xb09a68), camTarget: { x: 0, z: 0 }, unitPos: new Map(), bldPos: new Map(), fog: null, fx: null,
    fkey: (t) => (st.teams[t] ? st.teams[t].faction.key : 'necro'),
    inView(x, y, z, r) { const pl = frustum.planes; for (let i = 0; i < 6; i++) { const p = pl[i]; if (p.normal.x * x + p.normal.y * y + p.normal.z * z + p.constant < -r) return false; } return true; },
  };
  ctx.fog = createFog(ctx);
  ctx.fx = createFx(ctx);
  const units = createUnitLayer(ctx), blds = createBldLayer(ctx), overlays = createOverlays(ctx), wlayer = createWorldLayer(ctx), sky = createSky(ctx), terr = createTerritoryView(ctx);
  const unitPos = ctx.unitPos, bldPos = ctx.bldPos;
  const cam = { ...DEFAULT_CAM };
  let tgtY = 0, shakeV = new THREE.Vector3(), lastView = null;

  function applyCam(c, dt) {
    const pitch = Math.abs(c.pitch) > 1.6 ? (c.pitch * Math.PI) / 180 : c.pitch, cp = Math.cos(pitch), h = world.heightAt(c.x, c.z);
    tgtY += (h - tgtY) * Math.min(1, dt * 8); if (Math.abs(h - tgtY) > 30) tgtY = h;
    camera.position.set(c.x + Math.sin(c.yaw) * cp * c.dist, tgtY + Math.sin(pitch) * c.dist, c.z + Math.cos(c.yaw) * cp * c.dist);
    camera.lookAt(c.x, tgtY, c.z);
    if (wv.shake > 0.001) { camera.position.x += (Math.random() - 0.5) * wv.shake * 0.8; camera.position.y += (Math.random() - 0.5) * wv.shake * 0.8; }
    camera.updateMatrixWorld(true);
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(_pv);
  }
  function phaseOf() {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    if (q && q.has('t')) return (Number(q.get('t')) / 24) % 1;
    if (typeof st.dayPhase === 'number') return st.dayPhase;
    if (st.weather && typeof st.weather.phase === 'number') return st.weather.phase;
    return (0.1 + st.t / (st.dayLen || 480)) % 1;
  }
  function frame(stt, alpha, dt, view) {
    dt = Math.min(dt || 0.016, 0.1); ctx.frameN++; ctx.time += dt; FOG_U.uTime.value = ctx.time; lastView = view;
    const c = view.cam || cam; Object.assign(cam, c); ctx.camTarget.x = c.x; ctx.camTarget.z = c.z; ctx.camDist = c.dist;
    if (view.fogOn !== undefined) ctx.fog.setOn(!!view.fogOn);
    applyCam(c, dt);
    const dread = st.events2 && st.events2.dread ? 1 : st.weather && st.weather.dread ? 1 : 0;
    wv.update(dt, { x: c.x, z: c.z }, { phase: phaseOf(), dread });
    sky.update(dt, c);   // weather + density after wv lighting
    ctx.fog.update(dt);
    units.update(dt, ctx.time, alpha, view);
    blds.update(dt, ctx.time, alpha, view);
    wlayer.update(dt, ctx.time, alpha, view);
    overlays.update(dt, ctx.time, view, camera);
    terr.update(dt, view);
    ctx.fx.update(dt, ctx.time);
    renderer.render(scene, camera);
  }

  // ------------------------------------------------------------ picking + projection
  const ray = new THREE.Raycaster(), _v2 = new THREE.Vector2(), _v3 = new THREE.Vector3();
  const rect = () => canvas.getBoundingClientRect();
  function screenToGround(mx, my) {
    const r = rect(); _v2.set(((mx - r.left) / r.width) * 2 - 1, -((my - r.top) / r.height) * 2 + 1); ray.setFromCamera(_v2, camera);
    const o = ray.ray.origin, d = ray.ray.direction; if (d.y > -1e-4) return null;
    let t = -o.y / d.y, x = 0, z = 0;
    for (let i = 0; i < 7; i++) { x = o.x + d.x * t; z = o.z + d.z * t; t += (world.heightAt(x, z) - (o.y + d.y * t)) / d.y; if (t < 0) t = 0; }
    x = o.x + d.x * t; z = o.z + d.z * t;
    return { x, z, y: world.heightAt(x, z) };
  }
  function worldToScreen(x, z, y) {
    const r = rect(); _v3.set(x, y ?? world.heightAt(x, z), z).project(camera);
    return { x: r.left + ((_v3.x + 1) / 2) * r.width, y: r.top + ((1 - _v3.y) / 2) * r.height, behind: _v3.z > 1 };
  }
  function pxPerM(x, y, z) { const d = Math.max(1, camera.position.distanceTo(_v3.set(x, y, z))); return (rect().height / (2 * Math.tan((camera.fov * Math.PI) / 360))) / d; }
  function pick(x0, y0, x1, y1) {
    const res = { units: [], blds: [], nodes: [], neutrals: [] };
    const lx = Math.min(x0, x1), hx = Math.max(x0, x1), ly = Math.min(y0, y1), hy = Math.max(y0, y1), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, click = hx - lx < 6 && hy - ly < 6;
    const cand = [];
    const test = (id, x, y, z, rad, bias) => {
      const s = worldToScreen(x, z, y); if (s.behind) return;
      if (click) { const pr = Math.max(9, rad * pxPerM(x, y, z)), d = Math.hypot(s.x - cx, s.y - cy); if (d < pr + (hx - lx) / 2) cand.push({ id, d: d + bias }); }
      else if (s.x >= lx && s.x <= hx && s.y >= ly && s.y <= hy) cand.push({ id, d: Math.hypot(s.x - cx, s.y - cy) + bias });
    };
    for (const [id, r] of unitPos) { const u = st.byId.get(id); if (!u || !u.alive || u.garrison) continue; const m = r.model && r.model.m, hh = m ? m.top * m.scale * 0.5 : 0.9; test(id, r.x, r.y + hh, r.z, (u.r || 0.6) * 1.5 + hh * 0.35, 0); }
    res.units = cand.sort((a, b) => a.d - b.d).map((q) => q.id); cand.length = 0;
    for (const [id, r] of bldPos) {
      const b = st.byId.get(id); if (!b || b.state === 'ruin') continue;
      const hh = (b.h || 4) * 0.5;
      if (click) { // footprint hit test via screen-space bounding box of the 8 corners
        let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, ok = true; const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
        for (let k = 0; k < 8; k++) { const lx2 = (k & 1 ? 0.5 : -0.5) * b.w, lz = (k & 2 ? 0.5 : -0.5) * b.d, yy = r.baseY + (k & 4 ? (b.h || 4) : 0), sc = worldToScreen(b.x + lx2 * c - lz * s, b.z + lx2 * s + lz * c, yy); if (sc.behind) { ok = false; break; } minx = Math.min(minx, sc.x); maxx = Math.max(maxx, sc.x); miny = Math.min(miny, sc.y); maxy = Math.max(maxy, sc.y); }
        if (ok && cx >= minx - 3 && cx <= maxx + 3 && cy >= miny - 3 && cy <= maxy + 3) cand.push({ id, d: Math.hypot((minx + maxx) / 2 - cx, (miny + maxy) / 2 - cy) });
      } else test(id, b.x, r.baseY + hh, b.z, 0, 0);
    }
    res.blds = cand.sort((a, b) => a.d - b.d).map((q) => q.id); cand.length = 0;
    for (const n of st.nodes) { if ((n.amount ?? 1) <= 0 || (!ctx.fog.explored(n.x, n.z))) continue; test(n.id, n.x, world.heightAt(n.x, n.z) + 1.2, n.z, (n.r || 1.5) * 1.2 + 0.8, 0); }
    res.nodes = cand.sort((a, b) => a.d - b.d).map((q) => q.id); cand.length = 0;
    for (const n of st.neutral || []) { if (!ctx.fog.explored(n.x, n.z)) continue; test(n.id, n.x, world.heightAt(n.x, n.z) + 1.5, n.z, (n.r || 2) * 1.2 + 1, 0); }
    res.neutrals = cand.sort((a, b) => a.d - b.d).map((q) => q.id);
    return res;
  }
  function resize() {
    wv.resize();
    const h = canvas.clientHeight || window.innerHeight, sc = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    ctx.fx.resize(sc);
  }
  resize();
  function handleEvents(events) { if (!events || !events.length) return; ctx.fx.handleEvents(events); for (const e of events) { units.onEvent(e); blds.onEvent(e); wlayer.onEvent && wlayer.onEvent(e); sky.onEvent && sky.onEvent(e); } }
  return {
    wv, scene, camera, renderer, ctx, units, blds, fx: ctx.fx, fog: ctx.fog, world: wlayer, sky,
    frame, screenToGround, worldToScreen, pick, resize, handleEvents,
    minimapBase: (size) => buildMinimapBase(world, size),
    minimapFog: (g, size) => ctx.fog.paintMinimap(g, size),
    // markers for a size x size minimap: [{x,y,kind:'unit'|'bld'|'node'|'neutral'|'temple',team,color,r,id}] (visible things only; array is reused)
    minimapMarkers(size, out = []) {
      out.length = 0; const k = size / 400, H = 200, fg = ctx.fog;
      for (const u of st.ents) if (u.alive && !u.garrison && (u.team === ctx.local || fg.visible(u.x, u.z))) out.push({ x: (u.x + H) * k, y: (u.z + H) * k, kind: 'unit', team: u.team, color: teamHex[u.team] ?? 0xcccccc, r: u.general ? 3 : u.role === 'siege' ? 2.2 : 1.4, id: u.id, general: !!u.general });
      for (const b of st.blds) if (b.state !== 'ruin' && (b.team === ctx.local || fg.explored(b.x, b.z))) out.push({ x: (b.x + H) * k, y: (b.z + H) * k, kind: 'bld', team: b.team, color: teamHex[b.team] ?? 0xcccccc, r: b.wall ? 1 : Math.max(2, Math.max(b.w, b.d) * k * 0.5), id: b.id, wall: !!b.wall });
      for (const n of st.nodes) if (fg.explored(n.x, n.z) && (n.amount ?? 1) > 0) out.push({ x: (n.x + H) * k, y: (n.z + H) * k, kind: 'node', team: -1, color: { tree: 0x3a6a30, mine: 0xe8c040, quarry: 0x9a9aa0, bloodwell: 0xc01828, soulwell: 0x6fe8d0, herd: 0xc07050, graveyard: 0x6fe8d0 }[n.rtype] || 0xaaaaaa, r: 1.6, id: n.id });
      for (const n of st.neutral || []) if (n.kind !== 'camp' && n.kind !== 'pickup' && fg.explored(n.x, n.z)) out.push({ x: (n.x + H) * k, y: (n.z + H) * k, kind: n.kind === 'temple' ? 'temple' : 'neutral', team: n.owner ?? -1, color: n.owner >= 0 ? teamHex[n.owner] : 0xe0d0a0, r: n.kind === 'temple' ? 4 : 2, id: n.id, site: n.kind });
      return out;
    },
    isVisible: (x, z) => ctx.fog.visible(x, z), isExplored: (x, z) => ctx.fog.explored(x, z),
    setSelection(set) { if (lastView) lastView.selection = set; },
    get info() { return renderer.info.render; },
    camForward, camRight, DEFAULT_CAM,
    setLocalTeam(t) { ctx.local = t; ctx.fog.forceUpdate(); },
    dispose() { scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); wv.dispose(); },
  };
}
