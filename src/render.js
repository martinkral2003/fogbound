// Three.js presentation layer. Reads sim state, never mutates it.
import * as THREE from 'three';
import { WORLD, BIOME, TEAM_COLORS, STRUCTURES, NODES, UNITS, MONSTERS } from './data.js';
import * as MD from './models.js';
import { clamp, lerp, smoothstep, makeNoise, angDiff, TAU } from './util.js';
import { dayPhase, isNight, waypointsOf } from './sim.js';
import * as PL from './plates.js';
import { createWorldView, BIOME_COL } from './worldview.js';
import { createViewsV3 } from './v3view.js';
import { ultOf } from './ults.js';

const H = WORLD.half;
const INF_N = WORLD.infN;



const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const DT_BURST = { physical: 0xffd0a0, fire: 0xff8a30, cold: 0x9fe0ff, lightning: 0xffee60, poison: 0x9be048 };

export function createRenderer(canvas, st, localTeam, opts = {}) {
  const world = st.world;
const wv = createWorldView(canvas, world, opts);
const { renderer, scene, camera, hemi, sun, heroLight, fxLight, terrainGeo, glowP, smokeP, spawn, burst, rnd, flatQuad, addFx, ringFx, beamFx } = wv;
const resize = wv.resize;


  // ------------------------------------------------------------ helpers: bars, rings, shadows
  const barGeo = new THREE.PlaneGeometry(1, 1);
  const barBg = new THREE.MeshBasicMaterial({ color: 0x0b0c0e, transparent: true, opacity: 0.75, depthWrite: false, depthTest: false });
  const barMats = {};
  function barMat(c) { return barMats[c] ||= new THREE.MeshBasicMaterial({ color: c, depthWrite: false, depthTest: false, transparent: true }); }
  function makeBar(w) {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(barGeo, barBg); bg.scale.set(w + 0.12, 0.24, 1); bg.renderOrder = 20;
    const fg = new THREE.Mesh(barGeo, barMat(0x58c060)); fg.scale.set(w, 0.15, 1); fg.renderOrder = 21; fg.position.z = 0.01;
    g.add(bg, fg); g.userData = { w, fg };
    g.visible = false;
    return { g, w, fg, bg };
  }
  function setBar(bar, pct, color) {
    bar.fg.material = barMat(color);
    bar.fg.scale.x = Math.max(0.001, bar.w * pct); bar.fg.position.x = -(bar.w * (1 - pct)) / 2;
    bar.g.quaternion.copy(camera.quaternion);
  }
  const ringGeo = new THREE.RingGeometry(0.88, 1, 28);
  const shadowGeo = new THREE.CircleGeometry(1, 14);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.33, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const ringMats = {};
  const ringMat = (c) => ringMats[c] ||= new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });

  // ------------------------------------------------------------ world objects (nodes, chests, shrines)
  const nodeRecs = new Map(), chestRecs = new Map(), shrineRecs = new Map(), itemRecs = new Map();
  for (const n of st.nodes) {
    const g = MD.makeNodeModel(n.type);
    g.position.set(n.x, world.heightAt(n.x, n.z) - 0.05, n.z);
    g.userData.ring.scale.setScalar(n.r); g.userData.ring.material = g.userData.ring.material.clone();
    scene.add(g); nodeRecs.set(n.id, { obj: g, n });
    const bar = makeBar(3.4); bar.g.position.set(n.x, world.heightAt(n.x, n.z) + 8.6, n.z); scene.add(bar.g); nodeRecs.get(n.id).bar = bar;
  }
  for (const c of st.chests) { const g = MD.makeChestModel(); g.position.set(c.x, world.heightAt(c.x, c.z), c.z); g.rotation.y = c.x; scene.add(g); chestRecs.set(c.id, { obj: g }); }
  for (const s of st.shrines) { const g = MD.makeShrineModel(s.kind); g.position.set(s.x, world.heightAt(s.x, s.z), s.z); scene.add(g); shrineRecs.set(s.id, { obj: g, s }); }

  // ------------------------------------------------------------ entities
  const entRecs = new Map(), bldRecs = new Map();
  const teamCol = (t) => (t >= 0 ? TEAM_COLORS[t].color : 0x9a8a60);

  function createEntRec(e) {
    const accent = e.team >= 0 ? TEAM_COLORS[e.team].color : 0xaaaaaa;
    const pivot = new THREE.Group();
    const lk = MD.lookOf(e), model = MD.makeUnitModel(e.model, accent, lk);
    pivot.add(model);
    // characters read small from the RTS camera: heroes ~1.5x, everything else ~1.35x (the builders' own scale used to be overwritten)
    const ds = model.userData.designScale || 1;
    const base = e.kind === 'hero' ? 1.5 * ds / 1.25 : 1.35 * (1 + (ds - 1) * 0.6);
    model.scale.setScalar(base);
    const gs = Math.pow(base, 0.8); // footprint (shadow, rings) grows a little slower than the body
    const shadow = new THREE.Mesh(shadowGeo, shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.scale.setScalar(e.r * 1.5 * gs); shadow.position.y = 0.06; pivot.add(shadow);
    let ring = null;
    if (e.team >= 0) { ring = new THREE.Mesh(ringGeo, ringMat(accent)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.09; ring.scale.setScalar(e.r * (e.kind === 'hero' ? 1.7 : 1.25) * gs); pivot.add(ring); }
    const rec = { look: lk, accent, obj: pivot, model, ring, kind: e.kind, yaw: -e.face, amp: 0, bar: makeBar(1), baseScale: base, mul: 1, gs, top: ((model.userData.top || 2.4) / ds) * base, dying: 0, last: { x: e.x, z: e.z, face: e.face }, elRing: null, hpSeen: e.hp };
    scene.add(pivot); scene.add(rec.bar.g);
    return rec;
  }

  // servant level band / evolution changed: rebuild the model (visible armour / weapon tiers)
  function swapLook(rec, e, lk) {
    const old = rec.model, ds = old.userData.designScale || 1;
    rec.obj.remove(old);
    if (old.userData.body && old.userData.body.geometry) old.userData.body.geometry.dispose();
    const model = MD.makeUnitModel(e.model, rec.accent, lk);
    rec.obj.add(model);
    const nds = model.userData.designScale || 1;
    rec.baseScale = (rec.base0 || (rec.base0 = rec.baseScale)) * (lk >= 10 ? 1.08 : 1);
    rec.model = model; rec.look = lk; rec.top = ((model.userData.top || 2.4) / nds) * rec.baseScale;
    ringFx(e.x, e.z, 3, lk >= 10 ? 0xffe9a0 : 0xffd860, 0.7);
  }

  function createBldRec(b) {
    const def = { ...(STRUCTURES[b.type] || {}), w: b.w, d: b.d, model: b.model || b.type };
    const accent = b.team >= 0 && TEAM_COLORS[b.team] ? TEAM_COLORS[b.team].color : 0x9a8a60;
    const obj = new THREE.Group();
    const model = MD.makeBuildingModel(b.type, def, accent);
    obj.add(model);
    // base y = lowest terrain under footprint
    let miny = 99;
    for (const [px, pz] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lx = px * def.w / 2, lz = pz * def.d / 2;
      miny = Math.min(miny, world.heightAt(b.x + lx * b.c - lz * b.s, b.z + lx * b.s + lz * b.c));
    }
    obj.position.set(b.x, miny, b.z); obj.rotation.y = -b.rot;
    const fire = new THREE.Sprite(MD.glowSpriteMat(0xff6a20, 0.9)); fire.scale.set(4, 4, 1); fire.position.y = (model.userData.top || 3) * 0.8; fire.visible = false; obj.add(fire);
    scene.add(obj);
    const bar = makeBar(Math.max(2.4, Math.min(6, def.w)));
    scene.add(bar.g);
    return { obj, model, bar, fire, top: model.userData.top || 3, born: b.born, nextSmoke: 0 };
  }

  const focus = { x: 0, z: 0 };

  // floaters (damage numbers)
  const floatRoot = document.getElementById('floaters');
  const floaters = [];
  function floater(x, y, z, text, cls, big) {
    if (!floatRoot) return;
    if (floaters.length > 44) { const o = floaters.shift(); o.el.remove(); }
    const el = document.createElement('div'); el.className = 'fl ' + cls + (big ? ' big' : '');
    const sp = document.createElement('span'); sp.textContent = text; el.appendChild(sp); floatRoot.appendChild(el);
    floaters.push({ el, x, y, z, t: 0, dx: rnd(0.6) * (cls.includes('crit') ? 1.6 : 1) });
  }
  // nameplates: a pooled DOM overlay under the floaters
  const plateRoot = document.createElement('div'); plateRoot.id = 'plates';
  if (floatRoot && floatRoot.parentNode) floatRoot.parentNode.insertBefore(plateRoot, floatRoot); else document.body.appendChild(plateRoot);
  const plates = PL.createPlates(plateRoot);
  const stBuf = [];
  let tgtSticky = { id: 0, t: -9 };
  const plateCand = [];

  const _v = new THREE.Vector3();
  function visibleNow(x, z) { return vis[Math.max(0, Math.min(INF_N - 1, Math.floor((z + H) / WORLD.infCell))) * INF_N + Math.max(0, Math.min(INF_N - 1, Math.floor((x + H) / WORLD.infCell)))] === 1; }

  function handleEvents(events) {
    const hx = focus.x, hz = focus.z;
    for (const e of events) {
      const near = e.x !== undefined && Math.hypot(e.x - hx, e.z - hz) < 110;
      const seen = e.x !== undefined && visibleNow(e.x, e.z);
      switch (e.type) {
        case 'dmg': {
          if (!seen && e.team !== localTeam) break;
          if (!near) break;
          const mine = e.team === localTeam;
          const dt = PL.dtypeOf(e.dtype), crit = !!e.crit, isB = e.kind === 'bld';
          const cls = (mine ? 'hurt' : (isB ? 'bld' : 'hit')) + (dt && !mine && !isB ? ' dt-' + dt : '') + (crit ? ' crit' : '');
          floater(e.x, isB ? 2.4 : 3.3, e.z, String(Math.max(1, Math.round(e.amt))) + (crit ? '!' : ''), cls, crit || e.amt > 60);
          if (e.kind !== 'bld') burst(e.x, 1.6, e.z, crit ? 6 : 3, crit ? 4.5 : 3, mine ? 0xff4030 : (dt ? DT_BURST[dt] : 0xffd0a0), 0.3, crit ? 0.5 : 0.35, 8);
          else burst(e.x, 1.5, e.z, 2, 3, 0xb0a890, 0.4, 0.45, 8);
          break;
        }
        case 'blast': {
          if (!near) break;
          ringFx(e.x, e.z, e.r, e.color, e.big ? 0.7 : 0.5);
          burst(e.x, 0.8, e.z, e.big ? 36 : 16, e.r * 1.1, e.color, 0.7, 0.8, 6);
          for (let i = 0; i < (e.big ? 10 : 4); i++) spawn(smokeP, e.x + rnd(e.r * 0.5), 0.6, e.z + rnd(e.r * 0.5), rnd(1), 1.5 + Math.random() * 2, rnd(1), 1.6, 1.6, 0x3a3a3a, -0.4, 0.55);
          wv.addFlash(e.big ? 1 : 0.5, e.color, e.x, 4, e.z);
          const d = Math.hypot(e.x - hx, e.z - hz);
          if (d < 60) wv.addShake((e.big ? 0.9 : 0.35) * (1 - d / 60));
          break;
        }
        case 'slash': {
          const g = new THREE.Mesh(new THREE.RingGeometry(0.6, e.reach, 14, 1, -e.ang - e.arc / 2, e.arc), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[e.team].color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
          g.rotation.x = -Math.PI / 2; g.position.set(e.x, world.heightAt(e.x, e.z) + 0.8, e.z);
          addFx(g, 0.16, (f, p) => { f.obj.material.opacity = 0.55 * (1 - p); });
          break;
        }
        case 'line': {
          const m = new THREE.Mesh(flatQuad, new THREE.MeshBasicMaterial({ color: e.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
          m.rotation.order = 'YXZ'; m.rotation.x = -Math.PI / 2; m.rotation.y = -e.ang;
          m.scale.set(e.len, e.w, 1);
          m.position.set(e.x + Math.cos(e.ang) * e.len / 2, world.heightAt(e.x, e.z) + 0.6, e.z + Math.sin(e.ang) * e.len / 2);
          addFx(m, 0.35, (f, p) => { f.obj.material.opacity = 0.8 * (1 - p); f.obj.scale.y = e.w * (1 - p * 0.5); });
          for (let i = 0; i < 12; i++) { const t = Math.random() * e.len; burst(e.x + Math.cos(e.ang) * t, 0.6, e.z + Math.sin(e.ang) * t, 1, 3, e.color, 0.4, 0.5, 4); }
          break;
        }
        case 'tele': {
          // own teleports show within 110 m; ENEMY teleport beams are visible within 70 m of the local hero even through fog
          const foe = e.team !== localTeam, dh = Math.hypot(e.x - hx, e.z - hz);
          if (foe ? dh > 70 : !near) break;
          ringFx(e.x, e.z, foe ? 4.5 : 3.5, e.color, 0.8); beamFx(e.x, e.z, e.color, e.arrive ? 1.4 : 0.9, foe ? 1.5 : 1.1, foe ? 40 : 22);
          burst(e.x, 0.6, e.z, 26, 4, e.color, 1.0, 0.6, -3);
          if (e.arrive) ringFx(e.x, e.z, 2.2, 0xffffff, 0.5, 0.35, 0.6);
          break;
        }
        case 'summon': ringFx(e.x, e.z, 2.2, e.color, 0.5); burst(e.x, 0.5, e.z, 10, 2.5, e.color, 0.7, 0.5, -2); break;
        case 'buff': ringFx(e.x, e.z, e.r, e.color, 0.7, 0.4, 0.6); break;
        case 'heal': if (near && e.team === localTeam) floater(e.x, 2.4, e.z, '+' + Math.round(e.amt), 'heal'); break;
        case 'svcast': if (near) { ringFx(e.x, e.z, Math.max(1.6, e.r || 2), e.color, 0.45, 0.3, 0.5); burst(e.x, 1.0, e.z, 8, 2.2, e.color, 0.5, 0.45, 2); if (e.team === localTeam || e.team === 4) floater(e.x, 3.9, e.z, e.name, 'lvl', false); } break; // v0.5 servant spell
        case 'evolve': ringFx(e.x, e.z, 4, 0xffe9a0, 1.0); burst(e.x, 0.5, e.z, 30, 4.5, 0xffe9a0, 1.2, 0.7, -2); if (e.team === localTeam) floater(e.x, 3.6, e.z, e.name, 'lvl', true); break;
        case 'dash': burst(e.x, 1.0, e.z, 16, 3, 0x9aa8c8, 0.6, 0.6, 2); break;
        case 'level': ringFx(e.x, e.z, 3.5, 0xffd860, 0.9); burst(e.x, 0.5, e.z, 22, 3.5, 0xffd860, 1.1, 0.6, -2); if (e.hero && e.x !== undefined) floater(e.x, 3.4, e.z, 'LEVEL ' + e.lvl, 'lvl', true); break;
        case 'chest': burst(e.x, 1.0, e.z, 20, 4, 0xffd860, 0.9, 0.5, 6); if (e.team === localTeam) floater(e.x, 2.2, e.z, '+' + e.amt + ' gold', 'gold', true); break;
        case 'gold': if (e.team === localTeam && near) floater(e.x, 2.8, e.z, '+' + e.amt, 'gold'); break;
        case 'item': {
          const rar = e.rarity !== undefined ? clamp(e.rarity | 0, 0, 4) : -1;
          floater(e.x, 2.4, e.z, e.name, 'item' + (rar >= 0 ? ' r' + rar : ''), true);
          burst(e.x, 1.0, e.z, 14, 3, rar >= 0 ? PL.RARITY_HEX[rar] : 0xb8a0ff, 0.8, 0.5, 3);
          break;
        }
        case 'node': ringFx(e.x, e.z, NODES[e.ntype].radius * 1.6, e.team >= 0 ? TEAM_COLORS[e.team].color : 0xaaaaaa, 0.9); break;
        case 'build': burst(e.x, 0.5, e.z, 12, 3, 0xb8b0a0, 0.6, 0.7, 5); break;
        case 'built': if (near) { burst(e.x, 0.6, e.z, 10, 2.5, 0xd8d0b8, 0.5, 0.6, 3); ringFx(e.x, e.z, 2.6, 0xd8b24a, 0.5, 0.3, 0.6); } break;
        case 'repair': burst(e.x + rnd(1), 1.5 + Math.random() * 2, e.z + rnd(1), 3, 2, 0xffd860, 0.5, 0.35, 2); break;
        case 'trap': {
          if (!near) break;
          const col = e.kind === 'fire' ? 0xff7a2a : e.kind === 'snare' ? 0xc8b078 : e.kind === 'alarm' ? 0xffffff : 0xc8ccd0;
          burst(e.x, 0.5, e.z, e.kind === 'spikes' ? 22 : 16, e.kind === 'spikes' ? 6 : 3.5, col, 0.6, 0.5, e.kind === 'fire' ? -1 : 8);
          ringFx(e.x, e.z, e.kind === 'alarm' ? 6 : 3.2, col, 0.6, 0.3, 0.7);
          if (e.kind === 'alarm') floater(e.x, 2.8, e.z, '!', 'lvl', true);
          break;
        }
        case 'shrine': ringFx(e.x, e.z, 14, 0xffffff, 0.8, 0.4, 0.5); break;
        case 'death': {
          if (!near || (!seen && e.team !== localTeam)) break;
          if (e.kind === 'bld') {
            const n = e.big ? 40 : 18;
            burst(e.x, 1.2, e.z, n, e.big ? 9 : 6, 0xa89c88, 1.0, 0.9, 10);
            for (let i = 0; i < (e.big ? 14 : 6); i++) spawn(smokeP, e.x + rnd(2), 1.5, e.z + rnd(2), rnd(1.5), 2 + Math.random() * 3, rnd(1.5), 2.4, 2.8, 0x4a4a48, -0.3, 0.6);
            if (e.big) { wv.addShake(0.8); wv.addFlash(0.6, 0xffa060, e.x, 5, e.z); }
          } else {
            burst(e.x, 0.9, e.z, 10, 2.5, e.model && /skel/.test(e.model) ? 0xd8d2bc : 0x7a2a2a, 0.7, 0.5, 8);
          }
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ camera
  const cam = { yaw: -Math.PI / 2, pitch: 0.92, dist: 34, tx: 0, ty: 0, tz: 0, init: false };
  function screenToGround(mx, my) {
    const nx = (mx / canvas.clientWidth) * 2 - 1, ny = -(my / canvas.clientHeight) * 2 + 1;
    _v.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    const o = camera.position;
    let t = 0, prev = 0;
    for (let i = 0; i < 260; i++) {
      t += 1.6;
      const x = o.x + _v.x * t, y = o.y + _v.y * t, z = o.z + _v.z * t;
      if (y <= world.heightAt(x, z)) {
        let a = prev, b = t;
        for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (o.y + _v.y * m <= world.heightAt(o.x + _v.x * m, o.z + _v.z * m)) b = m; else a = m; }
        return { x: o.x + _v.x * b, z: o.z + _v.z * b };
      }
      prev = t;
    }
    return { x: o.x + _v.x * 80, z: o.z + _v.z * 80 };
  }
  // ------------------------------------------------------------ vision / fog of war
  const vis = new Uint8Array(INF_N * INF_N), explored = new Uint8Array(INF_N * INF_N);
  let visT = 0;
  const srcs = [];
  function markVision(x, z, r) {
    const C = WORLD.infCell, i0 = Math.max(0, Math.floor((x - r + H) / C)), i1 = Math.min(INF_N - 1, Math.floor((x + r + H) / C));
    const j0 = Math.max(0, Math.floor((z - r + H) / C)), j1 = Math.min(INF_N - 1, Math.floor((z + r + H) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (Math.hypot(i * C - H + C / 2 - x, j * C - H + C / 2 - z) <= r) { vis[j * INF_N + i] = 1; explored[j * INF_N + i] = 1; }
    }
  }
  function updateVision() {
    vis.fill(0); srcs.length = 0;
    for (const e of st.ents) {
      if (e.team !== localTeam || !e.alive) continue;
      const r = e.kind === 'hero' ? 36 : e.vision ? e.vision : e.temp ? 20 : 27; srcs.push([e.x, e.z, r]); markVision(e.x, e.z, r);
    }
    for (const b of st.blds) {
      if (b.team !== localTeam && b.team !== 4) continue; // 4 = humanity: town towers share their sight with the heroes
      const r = b.vision; if (r > 0 && !b.building) { srcs.push([b.x, b.z, r]); markVision(b.x, b.z, r); }
    }
    for (const n of st.nodes) if (n.team === localTeam) { const r = NODES[n.type].vision; srcs.push([n.x, n.z, r]); markVision(n.x, n.z, r); }
    for (const p of st.pois || []) if (p.owner === localTeam && p.vision) { srcs.push([p.x, p.z, p.vision]); markVision(p.x, p.z, p.vision); } // claimed watchtower POIs (src/pois.js)
  }
  const seenB = new Set();

  // ------------------------------------------------------------ ghost / reticles
  const cursor = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); cursor.rotation.x = -Math.PI / 2; cursor.renderOrder = 15; scene.add(cursor);
  const chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 56), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); chargeRing.rotation.x = -Math.PI / 2; chargeRing.visible = false; chargeRing.renderOrder = 15; scene.add(chargeRing);
  const chargeDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false, depthTest: false })); chargeDisc.rotation.x = -Math.PI / 2; chargeDisc.visible = false; chargeDisc.renderOrder = 14; scene.add(chargeDisc);
  const teleRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); teleRing.rotation.x = -Math.PI / 2; teleRing.visible = false; scene.add(teleRing);

  // ---- teleport waypoints: own markers (ring + faint beam, selected brighter), a name tag, and enemy channel beams
  const WP_R = { home: 5.2, ws: 3.4, heart: 5.2, node: 3.4, stone: 2.5 };
  const wpGeoRing = new THREE.RingGeometry(0.9, 1, 48), wpGeoArc = new THREE.RingGeometry(0.66, 0.74, 40, 1, 0, Math.PI * 1.5), wpGeoBeam = new THREE.CylinderGeometry(0.4, 0.4, 1, 10, 1, true);
  const wpMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const wpMarks = new Map();
  let wpList = [], wpListT = 0;
  const wpTag = document.createElement('div'); wpTag.id = 'wpTag'; wpTag.style.display = 'none'; plateRoot.appendChild(wpTag);
  const enemyChan = [];
  function wpMark(w) {
    let m = wpMarks.get(w.id);
    if (!m) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(wpGeoRing, wpMat(0xffffff, 0.3)), arc = new THREE.Mesh(wpGeoArc, wpMat(0xffffff, 0.5)), beam = new THREE.Mesh(wpGeoBeam, wpMat(0xffffff, 0.1));
      ring.rotation.x = arc.rotation.x = -Math.PI / 2; ring.position.y = arc.position.y = 0.45;
      g.add(ring, arc, beam); scene.add(g);
      m = { g, ring, arc, beam }; wpMarks.set(w.id, m);
    }
    return m;
  }
  function updateWaypoints(now, dt, hx, hz, hero, team) {
    wpListT -= dt;
    if (wpListT <= 0) { wpListT = 0.25; wpList = waypointsOf(st, localTeam); for (const [id, m] of wpMarks) if (!wpList.some((w) => w.id === id)) { scene.remove(m.g); wpMarks.delete(id); } }
    const sel = team.tele ? wpList.find((w) => w.id === team.tele.ws) : null; // v3: the waystone being channelled to (travel.js)
    const chan = hero.alive && hero.tele > 0 ? clamp(hero.tele / 3.5, 0, 1) : 0, col = team.f.color;
    for (const w of wpList) {
      const m = wpMark(w), isSel = sel && w.id === sel.id, R = WP_R[w.kind], y = world.heightAt(w.x, w.z);
      const pulse = 0.5 + 0.5 * Math.sin(now * (isSel ? 3 + chan * 7 : 1.6) + w.id);
      m.g.position.set(w.x, y, w.z);
      m.ring.material.color.setHex(col); m.arc.material.color.setHex(col); m.beam.material.color.setHex(isSel ? 0xffffff : col);
      m.ring.scale.setScalar(R * (isSel ? 1 + 0.06 * pulse : 1));
      m.ring.material.opacity = isSel ? 0.55 + 0.3 * pulse + chan * 0.15 : 0.22;
      m.arc.visible = !!isSel; m.arc.scale.setScalar(R * 0.8); m.arc.rotation.z = now * (1 + chan * 5); m.arc.material.opacity = 0.5 + 0.4 * chan;
      const bh = isSel ? 22 : 11;
      const bw = (isSel ? 0.9 : 0.55) + (isSel ? chan * 0.9 : 0); // beam width (cylinder radius 0.4 x this)
      m.beam.scale.set(bw, bh, bw); m.beam.position.y = bh / 2;
      m.beam.material.opacity = isSel ? 0.08 + 0.06 * pulse + chan * 0.25 : 0.035;
      m.g.visible = true;
      if (isSel && chan > 0 && Math.random() < 0.9) { const a = Math.random() * TAU; spawn(glowP, w.x + Math.cos(a) * R * 0.9, y + 0.4, w.z + Math.sin(a) * R * 0.9, -Math.cos(a) * 1.5, 2.5 + chan * 3, -Math.sin(a) * 1.5, 0.8, 0.6, col, 0); }
    }
    // destination name tag over the selected waypoint (always when channelling, otherwise when close)
    let show = false;
    if (sel && hero.alive) {
      const d = Math.hypot(sel.x - hx, sel.z - hz);
      if (chan > 0 || d < 80) {
        _v.set(sel.x, world.heightAt(sel.x, sel.z) + 4.5, sel.z).project(camera);
        if (_v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05) {
          wpTag.style.display = 'block';
          wpTag.style.transform = `translate(${(_v.x * 0.5 + 0.5) * canvas.clientWidth}px, ${(-_v.y * 0.5 + 0.5) * canvas.clientHeight}px) translate(-50%, -100%)`;
          const txt = (chan > 0 ? 'Teleporting to ' : 'Teleport target: ') + sel.name + (chan > 0 ? ' ' + Math.round(chan * 100) + '%' : '');
          if (wpTag.textContent !== txt) wpTag.textContent = txt;
          wpTag.classList.toggle('chan', chan > 0);
          show = true;
        }
      }
    }
    if (!show) wpTag.style.display = 'none';
    // enemy heroes channelling a teleport within 70 m show a beam even through the fog
    let k = 0;
    for (const t of st.teams) {
      const eh = t.hero;
      if (t.id === localTeam || !t.alive || !eh || !eh.alive || !(eh.tele > 0) || Math.hypot(eh.x - hx, eh.z - hz) > 70) continue;
      let c = enemyChan[k];
      if (!c) { c = enemyChan[k] = { g: new THREE.Group(), ring: new THREE.Mesh(wpGeoRing, wpMat(0xffffff, 0.6)), beam: new THREE.Mesh(wpGeoBeam, wpMat(0xffffff, 0.3)) }; c.ring.rotation.x = -Math.PI / 2; c.ring.position.y = 0.4; c.g.add(c.ring, c.beam); scene.add(c.g); }
      const p = clamp(eh.tele / 3.5, 0, 1);
      c.g.visible = true; c.g.position.set(eh.x, world.heightAt(eh.x, eh.z), eh.z);
      c.ring.material.color.setHex(t.f.color); c.beam.material.color.setHex(t.f.color);
      c.ring.scale.setScalar(3.4 - p * 2.2); c.ring.material.opacity = 0.35 + p * 0.45;
      c.beam.scale.set(0.5 + p * 1.4, 26, 0.5 + p * 1.4); c.beam.position.y = 13; c.beam.material.opacity = 0.12 + p * 0.3;
      k++;
    }
    for (let i = k; i < enemyChan.length; i++) enemyChan[i].g.visible = false;
  }
  const timerObjs = new Map(), zoneObjs = new Map();
  function syncTracked(map, list) { const set = new Set(list); for (const [k, o] of map) if (!set.has(k)) { scene.remove(o); map.delete(k); } }
  const projPool = [], projActive = new Map();
  const projGeos = { bolt: new THREE.SphereGeometry(0.32, 6, 5), arrow: new THREE.BoxGeometry(1.0, 0.07, 0.07), knife: new THREE.BoxGeometry(0.5, 0.05, 0.14), bolt2: new THREE.BoxGeometry(1.7, 0.12, 0.12), rock: new THREE.SphereGeometry(0.55, 6, 5) };
  const projMats = {};
  const projMat = (c) => projMats[c] ||= new THREE.MeshBasicMaterial({ color: c });

  // ------------------------------------------------------------ main frame
  let tAcc = 0;
  function frame(st2, alpha, dt, view) {
    tAcc += dt;
    const now = tAcc;
    const team = st.teams[localTeam];
    const hero = team.hero;
    // vision
    visT -= dt;
    if (visT <= 0) { visT = 0.2; updateVision(); }

    // camera
    const hx = lerp(hero.ox, hero.x, alpha), hz = lerp(hero.oz, hero.z, alpha);
    focus.x = hx; focus.z = hz;
    if (view) {
      cam.yaw = view.yaw; cam.dist = view.dist;
    }
    const hy = world.heightAt(hx, hz);
    if (!cam.init) { cam.tx = hx; cam.ty = hy; cam.tz = hz; cam.init = true; }
    const k = 1 - Math.pow(0.0005, dt);
    cam.tx += (hx - cam.tx) * k; cam.ty += (hy - cam.ty) * k; cam.tz += (hz - cam.tz) * k;
    const dx = Math.cos(cam.yaw), dz = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    camera.position.set(cam.tx - dx * cp * cam.dist + rnd(wv.shake) * 0.9, cam.ty + sp * cam.dist + 2 + rnd(wv.shake) * 0.9, cam.tz - dz * cp * cam.dist + rnd(wv.shake) * 0.9);
    camera.lookAt(cam.tx, cam.ty + 1.2, cam.tz);
    camera.updateMatrixWorld();

    heroLight.position.set(hx, hy + 4, hz);

    // ---- nodes
    for (const [id, r] of nodeRecs) {
      const n = r.n;
      const c = n.team >= 0 ? TEAM_COLORS[n.team].color : 0x8a8a8a;
      r.obj.userData.ring.material.color.setHex(c);
      r.obj.userData.ring.material.opacity = n.team >= 0 ? 0.65 : 0.25;
      if (r.obj.userData.orb) { r.obj.userData.orb.rotation.y = now * 1.2; r.obj.userData.orb.position.y = 7.6 + Math.sin(now * 2 + id) * 0.15; }
      const show = (n.cap > 0.01 && n.team < 0) || (n.team >= 0 && n.prog < 0.995);
      r.bar.g.visible = show && Math.hypot(n.x - hx, n.z - hz) < 90;
      if (r.bar.g.visible) { const pct = n.team >= 0 ? n.prog : n.cap; setBar(r.bar, pct, (n.team >= 0 ? TEAM_COLORS[n.team].color : n.capTeam >= 0 ? TEAM_COLORS[n.capTeam].color : 0xcccccc)); }
    }
    for (const c of st.chests) { const r = chestRecs.get(c.id); if (r) r.obj.visible = !c.opened; }
    for (const [id, r] of shrineRecs) { r.obj.userData.orb.rotation.y = now * 1.5; r.obj.userData.orb.position.y = 2.5 + Math.sin(now * 2 + id) * 0.2; r.obj.userData.orb.visible = r.s.cd <= 0; }
    // items
    const liveItems = new Set();
    for (const it of st.items) {
      liveItems.add(it.id);
      let r = itemRecs.get(it.id);
      if (!r) { const g = MD.makeItemModel(it.slot, it.tier); scene.add(g); r = { obj: g, beam: makeItemBeam(it) }; itemRecs.set(it.id, r); }
      const gy = world.heightAt(it.x, it.z);
      r.obj.position.set(it.x, gy + 0.5 + Math.sin(now * 2.5 + it.id) * 0.18, it.z); r.obj.rotation.y = now * 1.5;
      const vis = visibleNow(it.x, it.z) || explored[Math.floor((it.z + H) / WORLD.infCell) * INF_N + Math.floor((it.x + H) / WORLD.infCell)] === 1;
      r.obj.visible = vis;
      if (r.beam) {
        const b = r.beam, pulse = 0.5 + 0.5 * Math.sin(now * 2.2 + it.id * 1.7);
        b.g.visible = vis; b.g.position.set(it.x, gy + 0.05, it.z);
        b.beam.scale.set(b.w * (0.9 + 0.2 * pulse), b.h * (0.95 + 0.08 * pulse), b.w * (0.9 + 0.2 * pulse));
        b.disc.scale.setScalar(b.dr * (0.92 + 0.16 * pulse));
        if (vis && b.rar >= 2 && Math.random() < dt * (b.rar - 1) * 2.2) spawn(glowP, it.x + rnd(0.5), gy + 0.3, it.z + rnd(0.5), rnd(0.2), 1.2 + Math.random() * 1.5, rnd(0.2), 1.1, 0.3, PL.RARITY_HEX[b.rar], 0, 0.9);
      }
    }
    for (const [id, r] of itemRecs) if (!liveItems.has(id)) { scene.remove(r.obj); if (r.beam) scene.remove(r.beam.g); itemRecs.delete(id); }

    // ---- buildings
    const liveB = new Set();
    for (const b of st.blds) {
      liveB.add(b.id);
      let r = bldRecs.get(b.id);
      const isTrap = !!b.trap;
      let visible;
      if (b.team === localTeam) visible = true;
      else if (isTrap) visible = b.revealT > st.t || st.ents.some((e) => e.team === localTeam && e.alive && Math.hypot(e.x - b.x, e.z - b.z) < 6); // enemy traps stay hidden
      else visible = seenB.has(b.id) || visibleNow(b.x, b.z) || srcs.some((s) => Math.hypot(s[0] - b.x, s[1] - b.z) < s[2] + b.r);
      if (visible && !isTrap) seenB.add(b.id);
      if (!r) { if (!visible) continue; r = createBldRec(b); bldRecs.set(b.id, r); }
      r.obj.visible = visible; if (!visible) { r.bar.g.visible = false; continue; }
      const prog = b.building ? clamp(1 - b.bt / b.bt0, 0, 1) : 1;
      r.model.scale.set(1, b.building ? 0.15 + 0.85 * (1 - Math.pow(1 - prog, 2)) : 1, 1);
      const pct = b.hp / b.maxHp;
      if (b.type === 'heart' && r.model.userData.crystal) { const cr = r.model.userData.crystal; cr.rotation.y = now * 0.9; cr.position.y = 4.7 + Math.sin(now * 1.6) * 0.18; }
      if (b.type === 'ballista' && b.aim !== undefined && r.model.userData.turret) r.model.userData.turret.rotation.y = lerp(r.model.userData.turret.rotation.y, -b.aim + b.rot, 0.2);
      if (b.type === 'waypoint' && r.model.userData.crystal) { const cr = r.model.userData.crystal; cr.rotation.y = now * 1.4; cr.position.y = 1.5 + Math.sin(now * 2 + b.id) * 0.12; r.model.userData.ring.material.opacity = 0.6 + 0.25 * Math.sin(now * 2.4); }
      if (b.type === 'banner' && r.model.userData.cloth)r.model.userData.cloth.rotation.y = Math.sin(now * 2.2 + b.id) * 0.35;
      r.fire.visible = pct < 0.4;
      if (pct < 0.4 && now > r.nextSmoke) {
        r.nextSmoke = now + 0.25;
        if (Math.hypot(b.x - hx, b.z - hz) < 80) { spawn(smokeP, b.x + rnd(1), r.top * 0.8, b.z + rnd(1), rnd(0.5), 2, rnd(0.5), 2.2, 1.6, 0x3c3c3c, -0.2, 0.5); spawn(glowP, b.x + rnd(1), r.top * 0.75, b.z + rnd(1), rnd(0.4), 1.5, rnd(0.4), 0.7, 0.9, 0xff7020, -1); }
      }
      const showBar = pct < 0.999 || b.type === 'heart' || b.building;
      r.bar.g.visible = showBar && Math.hypot(b.x - hx, b.z - hz) < 110;
      if (r.bar.g.visible) {
        r.bar.g.position.set(b.x, r.obj.position.y + r.top + 1.2, b.z);
        setBar(r.bar, b.building ? prog : pct, b.building ? 0xd8b24a : (b.team === localTeam ? 0x58c060 : 0xd8503c));
      }
    }
    for (const [id, r] of bldRecs) if (!liveB.has(id)) { scene.remove(r.obj); scene.remove(r.bar.g); bldRecs.delete(id); }

    // ---- entities
    const alive = new Set();
    const aim = view && view.aim;
    plateCand.length = 0;
    let tgtBest = null, tgtD = 4;
    for (const e of st.ents) {
      alive.add(e.id);
      let rec = entRecs.get(e.id);
      if (e.dead) { if (rec) { rec.obj.visible = false; rec.bar.g.visible = false; } continue; }
      if (!e.alive) continue;
      let visible = e.team === localTeam || visibleNow(e.x, e.z);
      if (visible && e.team !== localTeam && e.hid > st.t) visible = srcs.some((s) => Math.hypot(s[0] - e.x, s[1] - e.z) < 6);
      if (!rec) { if (!visible) continue; rec = createEntRec(e); entRecs.set(e.id, rec); }
      rec.obj.visible = visible;
      if (!visible) { rec.bar.g.visible = false; continue; }
      const x = lerp(e.ox, e.x, alpha), z = lerp(e.oz, e.z, alpha), y = world.heightAt(x, z);
      rec.obj.position.set(x, y, z);
      const want = -e.face;
      rec.yaw += angDiff(rec.yaw, want) * Math.min(1, dt * 14); rec.obj.rotation.y = rec.yaw;
      rec.last.x = x; rec.last.z = z;
      if (e.kind === 'unit') { const lk = MD.lookOf(e); if (lk !== rec.look) swapLook(rec, e, lk); }
      animate(rec, e, now, dt);
      rec.bar.g.visible = false; // the old 3D bar is replaced by the DOM nameplates below
      const pct = clamp(e.hp / e.maxHp, 0, 1);
      const el = PL.eliteLevel(e);
      rec.mul = el === 1 ? 1.15 : 1;
      if (el > 0) eliteFx(rec, e, el, x, y, z, now, dt);
      const dHero = Math.hypot(x - hx, z - hz);
      const isHero = e.kind === 'hero', mineHero = isHero && e.team === localTeam;
      if (dHero < 90 || mineHero) {
        const hover = !!aim && Math.hypot(x - aim.x, z - aim.z) - e.r * rec.baseScale < 3;
        const shAmt = PL.shieldOf(e, st.t);
        const recent = st.t - e.lastHit < 10;
        const hurt = pct < 0.999 && (e.team === localTeam ? (pct < 0.8 || recent) : recent || pct < 0.5);
        if (aim && e.team !== localTeam) { const dd = Math.hypot(x - aim.x, z - aim.z) - e.r * rec.baseScale; if (dd < tgtD) { tgtD = dd; tgtBest = e; } }
        const sv = e.kind === 'unit' && !e.temp && (e.team === localTeam ? dHero < 70 : dHero < 38);
        if (isHero || el > 0 || hurt || shAmt > 0 || hover || sv || tgtSticky.id === e.id) plateCand.push({ e, rec, x, y, z, pct, shAmt, hover, el, d: dHero, pri: mineHero ? 0 : isHero ? 1 : el > 1 ? 2 : el === 1 ? 3 : hover ? 4 : e.team === localTeam ? 5 : 6 });
      }
      if (e.stun > 0) rec.model.rotation.z = Math.sin(now * 20) * 0.08;
      else rec.model.rotation.z = 0;
    }
    updatePlates(tgtBest, now);
    // dying
    for (const [id, rec] of entRecs) {
      if (alive.has(id)) continue;
      if (rec.kind === 'hero') continue;
      rec.dying += dt; rec.bar.g.visible = false;
      const p = clamp(rec.dying / 1.3, 0, 1);
      rec.model.rotation.x = p * 1.45; rec.model.position.y = -p * 0.35;
      if (rec.ring) rec.ring.visible = false;
      if (rec.elRing) rec.elRing.visible = false;
      if (p >= 1) { scene.remove(rec.obj); scene.remove(rec.bar.g); if (rec.elRing) rec.elRing.material.dispose(); entRecs.delete(id); }
    }

    // ---- projectiles
    const liveP = new Set();
    for (const p of st.projs) {
      liveP.add(p.id);
      let m = projActive.get(p.id);
      if (!m) {
        m = projPool.pop();
        const g = projGeos[p.kind] || projGeos.bolt;
        if (!m) { m = new THREE.Mesh(g, projMat(p.color)); scene.add(m); }
        m.geometry = g; m.material = projMat(p.color); m.visible = true; projActive.set(p.id, m);
      }
      const x = p.x - p.vx * (1 - alpha) * (1 / 30), z = p.z - p.vz * (1 - alpha) * (1 / 30);
      const y = world.heightAt(x, z) + (p.kind === 'arrow' || p.kind === 'bolt2' || p.kind === 'rock' ? 2.2 : 1.5);
      m.position.set(x, y, z); m.rotation.y = -p.ang;
      m.visible = visibleNow(x, z) || p.team === localTeam;
      if (p.kind === 'bolt' && m.visible && Math.random() < 0.7) spawn(glowP, x, y, z, rnd(0.3), rnd(0.3), rnd(0.3), 0.3, 0.45, p.color, 0);
    }
    for (const [id, m] of projActive) if (!liveP.has(id)) { m.visible = false; projPool.push(m); projActive.delete(id); }

    // ---- timers (kegs / pillars) and zones
    for (const tm of st.timers) {
      let o = timerObjs.get(tm);
      if (!o) {
        o = new THREE.Group();
        if (tm.vis === 'keg') o.add(MD.makeKegModel());
        const warn = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: tm.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        warn.rotation.x = -Math.PI / 2; warn.position.y = 0.3; warn.scale.setScalar(tm.r); o.add(warn);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: tm.color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
        disc.rotation.x = -Math.PI / 2; disc.position.y = 0.28; disc.scale.setScalar(tm.r); o.add(disc);
        if (tm.vis === 'judge') { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 10, 1, true), new THREE.MeshBasicMaterial({ color: tm.color, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); col.position.y = 15; o.add(col); o.userData.col = col; }
        o.userData.disc = disc; o.userData.warn = warn;
        scene.add(o); timerObjs.set(tm, o);
      }
      const p = clamp((st.t - tm.born) / Math.max(0.01, tm.delay), 0, 1);
      o.position.set(tm.x, world.heightAt(tm.x, tm.z), tm.z);
      o.userData.disc.material.opacity = 0.12 + p * 0.35; o.userData.warn.material.opacity = 0.5 + Math.sin(now * 22) * 0.3;
      if (o.userData.col) { o.userData.col.scale.x = o.userData.col.scale.z = 0.5 + p * 3.2; o.userData.col.material.opacity = 0.2 + p * 0.6; }
      o.userData.alive = now;
      o.visible = true;
    }
    for (const z of st.zones) {
      let o = zoneObjs.get(z);
      if (!o) {
        o = new THREE.Mesh(new THREE.CircleGeometry(1, 36), new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
        o.rotation.x = -Math.PI / 2; o.scale.setScalar(z.r); scene.add(o); zoneObjs.set(z, o);
      }
      o.position.set(z.x, world.heightAt(z.x, z.z) + 0.3, z.z); o.material.opacity = 0.22 + Math.sin(now * 9) * 0.08;
      o.userData.alive = now;
      if (Math.random() < 0.9) { const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * z.r; spawn(glowP, z.x + Math.cos(a) * rr, 0.4, z.z + Math.sin(a) * rr, rnd(0.3), 2 + Math.random() * 2, rnd(0.3), 0.8, 0.8, z.color, -1); }
    }
    syncTracked(timerObjs, st.timers); syncTracked(zoneObjs, st.zones);

    // ---- reticles
    if (view) {
      cursor.visible = !!view.aim;
      if (view.aim) { cursor.position.set(view.aim.x, world.heightAt(view.aim.x, view.aim.z) + 0.35, view.aim.z); cursor.scale.setScalar(0.7); }
      const f = team.f, ch = ultOf(team) || f.charge; // ECON lane: the equipped ultimate
      chargeRing.visible = chargeDisc.visible = !!(hero.alive && hero.charging && view.aim);
      if (chargeRing.visible) {
        const ratio = clamp(hero.chargeT / ch.maxCharge, 0, 1), r = lerp(ch.minR, ch.maxR, ratio);
        const d = Math.hypot(view.aim.x - hx, view.aim.z - hz), k2 = d > ch.range ? ch.range / d : 1;
        const px = hx + (view.aim.x - hx) * k2, pz = hz + (view.aim.z - hz) * k2;
        chargeRing.position.set(px, world.heightAt(px, pz) + 0.4, pz); chargeDisc.position.set(px, world.heightAt(px, pz) + 0.38, pz);
        chargeRing.scale.setScalar(r); chargeDisc.scale.setScalar(r);
        chargeRing.material.color.setHex(ch.color); chargeDisc.material.color.setHex(ch.color); chargeDisc.material.opacity = 0.1 + ratio * 0.3;
        if (Math.random() < 0.8) { const a = Math.random() * TAU; spawn(glowP, hx + Math.cos(a) * 1.4, 0.4, hz + Math.sin(a) * 1.4, -Math.cos(a) * 2, 2.5, -Math.sin(a) * 2, 0.5, 0.5, ch.color, 0); }
      }
      teleRing.visible = hero.alive && hero.tele > 0;
      if (teleRing.visible) {
        const p = hero.tele / 3.5; teleRing.position.set(hx, hy + 0.35, hz); teleRing.scale.setScalar(3.4 - p * 2.4); teleRing.material.color.setHex(f.color); teleRing.material.opacity = 0.4 + p * 0.5;
        spawn(glowP, hx + rnd(1.2), 0.3, hz + rnd(1.2), 0, 3 + p * 3, 0, 0.8, 0.6, f.color, 0);
      }
      updateWaypoints(now, dt, hx, hz, hero, team);
    }

    // ---- world view: lighting, mist, fx list, particles
    wv.update(dt, { x: cam.tx, z: cam.tz }, { phase: dayPhase(st), dread: st.dread && st.t < st.dread.until ? 1 : 0 });
    heroLight.intensity = 1.0 + wv.night * 2.2;
    // ambient embers around braziers/fires near the camera
    if (Math.random() < 0.5) { const a = Math.random() * TAU, rr = Math.random() * 30; spawn(glowP, hx + Math.cos(a) * rr, 1 + Math.random() * 5, hz + Math.sin(a) * rr, rnd(0.4), 0.3, rnd(0.4), 3.5, 0.3, 0x9fb8c0, 0, 0.35); }

    // floaters
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.t += dt;
      if (f.t > 1.1) { f.el.remove(); floaters.splice(i, 1); continue; }
      _v.set(f.x, world.heightAt(f.x, f.z) + f.y + f.t * 1.8, f.z).project(camera);
      if (_v.z > 1) { f.el.style.display = 'none'; continue; }
      f.el.style.display = 'block';
      f.el.style.transform = `translate(${((_v.x + 1) / 2) * canvas.clientWidth + f.dx * 20}px, ${((1 - _v.y) / 2) * canvas.clientHeight}px) translate(-50%,-50%)`;
      f.el.style.opacity = String(1 - Math.pow(f.t / 1.1, 2));
    }

    renderer.render(scene, camera);
  }


  // ---- ground loot: a coloured light beam + glow pool per rarity (it.rarity 0..4; falls back to a tier-based guess)
  let beamTex = null;
  function beamTexture() {
    if (beamTex) return beamTex;
    const c = document.createElement('canvas'); c.width = 32; c.height = 128;
    const x = c.getContext('2d');
    let g = x.createLinearGradient(0, 0, 32, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 128);
    x.globalCompositeOperation = 'destination-in';
    g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 128);
    beamTex = new THREE.CanvasTexture(c);
    return beamTex;
  }
  const BEAM_H = [3.2, 5, 6.5, 8.5, 11.5], BEAM_W = [0.7, 0.8, 0.9, 1.0, 1.2], BEAM_OP = [0.3, 0.5, 0.6, 0.72, 0.9];
  const beamGeo = new THREE.PlaneGeometry(1, 1); beamGeo.translate(0, 0.5, 0);
  const discGeo = new THREE.PlaneGeometry(1, 1); discGeo.rotateX(-Math.PI / 2);
  const beamMats = [], discMats = [];
  function makeItemBeam(it) {
    try {
      const rar = it.rarity !== undefined ? clamp(it.rarity | 0, 0, 4) : clamp((it.tier | 0) - 1, 0, 4);
      const col = PL.RARITY_HEX[rar];
      const bm = beamMats[rar] ||= new THREE.MeshBasicMaterial({ map: beamTexture(), color: col, transparent: true, opacity: BEAM_OP[rar], blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const dm = discMats[rar] ||= new THREE.MeshBasicMaterial({ map: MD.softTexture(), color: col, transparent: true, opacity: 0.55 + rar * 0.08, blending: THREE.AdditiveBlending, depthWrite: false });
      const g = new THREE.Group(), beam = new THREE.Group();
      const a = new THREE.Mesh(beamGeo, bm), b = new THREE.Mesh(beamGeo, bm); b.rotation.y = Math.PI / 2;
      beam.add(a, b);
      const disc = new THREE.Mesh(discGeo, dm);
      g.add(beam, disc); scene.add(g);
      return { g, beam, disc, rar, w: BEAM_W[rar], h: BEAM_H[rar], dr: 2.2 + rar * 0.45 };
    } catch (err) { return null; }
  }

  // ---- elites: pulsing coloured ground ring + sparks (champions and bosses)
  const eliteRingGeo = new THREE.RingGeometry(0.8, 1, 40);
  function eliteFx(rec, e, el, x, y, z, now, dt) {
    const tint = PL.eliteTint(e);
    if (!rec.elRing) {
      const m = new THREE.Mesh(eliteRingGeo, new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.12; rec.obj.add(m); rec.elRing = m; rec.elTint = tint;
    }
    if (rec.elTint !== tint) { rec.elTint = tint; rec.elRing.material.color.setHex(tint); }
    const p = 0.5 + 0.5 * Math.sin(now * 3 + e.id);
    rec.elRing.scale.setScalar((e.r * 1.35 * rec.gs * rec.mul + (el > 1 ? 1.3 : 0.55)) * (1 + 0.07 * p));
    rec.elRing.material.opacity = 0.3 + 0.4 * p;
    if (Math.random() < dt * (el > 1 ? 26 : 10)) {
      const a = Math.random() * TAU, rr = e.r * (0.6 + Math.random() * 0.8);
      spawn(glowP, x + Math.cos(a) * rr, y + 0.2 + Math.random() * rec.top * 0.5, z + Math.sin(a) * rr, rnd(0.3), 0.9 + Math.random() * 1.4, rnd(0.3), 0.9, el > 1 ? 0.5 : 0.35, tint, 0, 0.9);
    }
  }

  // ---- nameplates: collect -> sort -> project -> pooled DOM
  let focusTarget = null;
  function updatePlates(tgtBest, now) {
    // cursor target, sticky for a moment so the target frame does not flicker while you fight
    if (tgtBest) { tgtSticky.id = tgtBest.id; tgtSticky.t = now; focusTarget = tgtBest; }
    else {
      const s = tgtSticky.id ? st.byId.get(tgtSticky.id) : null;
      focusTarget = s && s.alive && !s.dead && now - tgtSticky.t < 2.5 && (s.team === localTeam || visibleNow(s.x, s.z)) ? s : null;
      if (!focusTarget) tgtSticky.id = 0;
    }
    plateCand.sort((a, b) => a.pri - b.pri || a.d - b.d);
    plates.begin();
    const W = canvas.clientWidth, Hh = canvas.clientHeight;
    for (const c of plateCand) {
      if (plates.count() >= 60) break;
      const { e, rec } = c;
      _v.set(c.x, c.y + rec.top * rec.mul + 0.45, c.z).project(camera);
      if (_v.z > 1 || _v.x < -1.1 || _v.x > 1.1 || _v.y < -1.1 || _v.y > 1.15) continue;
      const hero = e.kind === 'hero', boss = c.el > 1, champ = c.el === 1;
      const rel = PL.relation(e, localTeam);
      const cls = (hero ? 'hero' : boss ? 'boss' : champ ? 'champ' : 'unit') + ' ' + rel + (hero && e.team === localTeam ? ' me' : '');
      const tint = boss ? PL.css(PL.BOSS_TINT) : champ ? PL.css(PL.eliteTint(e)) : PL.teamCss(e);
      const name = hero || c.el > 0 ? PL.entTitle(e) : (tgtSticky.id === e.id || (e.recruit && e.team === localTeam)) ? PL.baseName(e) : '';
      const step = hero ? 60 : boss ? 150 : champ ? 100 : 40;
      const segs = clamp(Math.round(e.maxHp / step), 3, 20);
      plates.show({
        x: ((_v.x + 1) / 2) * W, y: ((1 - _v.y) / 2) * Hh, cls, tint, name, lvl: PL.entLevel(e), pct: c.pct, shield: c.shAmt / e.maxHp,
        segs, mask: PL.statusMask(PL.statusOf(e, st.t, stBuf)), hit: e.hitT > 0,
      });
    }
    plates.end();
  }

  function animate(rec, e, now, dt) {
    const m = rec.model, u = m.userData;
    const target = e.moving ? 1 : 0;
    rec.amp += (target - rec.amp) * Math.min(1, dt * 10);
    const ph = e.walkPh || 0, a = rec.amp;
    if (u.kind === 'humanoid') {
      const s = Math.sin(ph);
      u.legL.rotation.z = s * 0.85 * a; u.legR.rotation.z = -s * 0.85 * a;
      u.armL.rotation.z = -s * 0.6 * a; u.armR.rotation.z = u.hasBow ? 0 : s * 0.6 * a;
      m.position.y = Math.abs(s) * 0.07 * a;
      if (e.swing > 0) {
        const p = 1 - e.swing / 0.28;
        if (u.hasBow) { u.armR.rotation.z = 1.45; u.armL.rotation.z = 1.3; } else u.armR.rotation.z = lerp(-2.1, 1.0, p * p);
      } else if (u.hasBow && !u.staff) { u.armR.rotation.z = 0.5; }
      if (e.kind === 'hero') {
        if (e.charging) { u.armL.rotation.z = u.armR.rotation.z = -2.6; m.position.y += Math.sin(now * 30) * 0.03; }
        else if (e.cast > 0) { u.armR.rotation.z = lerp(-2.4, 1.2, 1 - e.cast / 0.45); }
        if (e.tele > 0) { u.armL.rotation.z = u.armR.rotation.z = -2.6; }
      }
      if (u.staff && e.swing > 0) u.armR.rotation.z = 1.2;
      if (e.kind === 'hero' && e.repairing) u.armR.rotation.z = -0.6 + Math.sin(now * 16) * 0.9; // hammering
    } else if (u.kind === 'quad') {
      const s = Math.sin(ph * 1.3) * 0.9 * a;
      u.legs[0].rotation.z = s; u.legs[3].rotation.z = s; u.legs[1].rotation.z = -s; u.legs[2].rotation.z = -s;
      m.position.y = Math.abs(Math.sin(ph * 1.3)) * 0.08 * a;
      if (e.swing > 0) m.rotation.z = -0.35 * (e.swing / 0.28);
    } else if (u.kind === 'machine') {
      if (u.wheels) for (const w of u.wheels) w.rotation.z = -ph * 0.55;
      m.position.y = Math.abs(Math.sin(ph * 1.6)) * 0.04 * a;
      if (u.arm) u.arm.rotation.z = e.swing > 0 ? lerp(u.armFire, u.armRest, 1 - e.swing / 0.28) : u.armRest;
      if (u.log) u.log.position.x = e.swing > 0 ? Math.sin((1 - e.swing / 0.28) * Math.PI) * 1.3 : 0;
      if (u.fuse) u.fuse.scale.setScalar(1.1 + Math.sin(now * 25) * 0.25);
    } else if (u.kind === 'wisp') {
      m.position.y = 0.3 + Math.sin(now * 3 + e.id) * 0.2;
    } else if (u.kind === 'wraith') {
      m.position.y = 0.5 + Math.sin(now * 2.2 + e.id) * 0.25;
      u.cloak.rotation.z = Math.sin(now * 3 + e.id) * 0.06;
      if (e.swing > 0) u.armR.rotation.z = 0.5;
    }
    const sc = (e.hitT > 0 ? 1.07 : 1) * rec.baseScale * rec.mul;
    rec.model.scale.setScalar(sc);
    // invulnerable (dodge skills): flicker
    rec.model.visible = !(e.inv > st.t) || (Math.floor(st.t * 24) & 1) === 0;
    if (e.kind === 'hero' && rec.ring) rec.ring.material = ringMat(TEAM_COLORS[e.team].color);
  }

  function minimapBase(size = 200) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), img = x.createImageData(size, size), t = new THREE.Color();
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const wx = (i / size) * WORLD.size - H, wz = (j / size) * WORLD.size - H, h = world.heightAt(wx, wz), p = (j * size + i) * 4;
      if (h < 0.3) { img.data[p] = 18; img.data[p + 1] = 36; img.data[p + 2] = 46; img.data[p + 3] = 255; continue; }
      t.setHex(BIOME_COL[world.biomeAt(wx, wz)]);
      // hillshade from the top-left, brighter with altitude, bare rock on cliffs, packed-earth roads
      const sh = clamp(0.82 + (world.heightAt(wx - 3, wz - 3) - world.heightAt(wx + 3, wz + 3)) * 0.13, 0.4, 1.6) * (0.9 + clamp(h, 0, 24) * 0.012);
      let r = t.r * 255 * 1.5, g = t.g * 255 * 1.5, b = t.b * 255 * 1.5;
      const sl = world.slopeAt(wx, wz);
      if (sl > 0.9) { const k = clamp((sl - 0.9) * 1.5, 0, 0.7); r += (120 - r) * k; g += (112 - g) * k; b += (108 - b) * k; }
      if (world.roadDist(wx, wz) < 2.2) { r = r * 0.35 + 190 * 0.65; g = g * 0.35 + 150 * 0.65; b = b * 0.35 + 95 * 0.65; }
      img.data[p] = Math.min(255, r * sh); img.data[p + 1] = Math.min(255, g * sh); img.data[p + 2] = Math.min(255, b * sh); img.data[p + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  // v3 world views (regions, raids, dungeons...): scene objects owned by the lane modules, driven from here
  const v3 = createViewsV3({ THREE, scene, camera, st, world, localTeam, wv, makeBar, setBar, ringMat, ringFx, spawn, burst, addFx, focus, visibleNow, vis });
  const frameAll = (st2, alpha, dt, view) => { frame(st2, alpha, dt, view); v3.frame(st, alpha, dt); };
  const handleEventsAll = (events) => { handleEvents(events); v3.handleEvents(events); };
  return {
    renderer, scene, camera, frame: frameAll, resize, screenToGround, handleEvents: handleEventsAll, minimapBase, ringFx, explored, vis, cam, focus,
    visibleNow, dispose() { wv.dispose(); }, worldView: wv,
    get focusTarget() { return focusTarget; },
    // screen position of a world point (x flipped through the centre when the point is behind the camera)
    worldToScreen(x, z, yOff = 6) {
      _v.set(x, world.heightAt(x, z) + yOff, z).project(camera);
      const behind = _v.z > 1, sx = behind ? -_v.x : _v.x, sy = behind ? -_v.y : _v.y;
      return { x: ((sx + 1) / 2) * canvas.clientWidth, y: ((1 - sy) / 2) * canvas.clientHeight, behind };
    },
  };
}
