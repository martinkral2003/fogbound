// v0.4 scene module "horde_view" (HORDE lane): the orc invasion as seen in the world. createView(ctx) -> { frame, handleEvents, dispose }.
//  - front line: red glow + banner row at the front, smoke columns on the overrun land behind it, fires on fallen towns
//  - war-camps: spiked palisade, totem with a banner and skulls, fire pit, tents; a charred ruin when destroyed; the Warlord's arena (spear ring, throne, rune circle)
//  - assaults: pulsing red ring on the target town, light column, marching band marker + torches, horn cue (vignette + banner text)
//  - telegraphs: red/orange ground circles for the Warlord's cleave/slam (event `telegraph`)
// Reads st.horde (and st.towns / horde.fb for fallen towns) only. Also exports the pure helpers below for tests/UI.
import { glowSpriteMat, softTexture } from './models.js';
import { frontPos, activeAssaults, hordeList } from './horde.js';

export { frontPos, activeAssaults, hordeList };

const TAU = Math.PI * 2;
const FAR = 430;          // camps further than this from the focus are hidden
const SMOKE_FAR = 300;
const MAX_COL = 14, MAX_TORCH = 48, MAX_TELE = 10;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('horde-css')) return;
  const s = document.createElement('style'); s.id = 'horde-css';
  s.textContent = `
@keyframes hordepulse{0%{opacity:0}18%{opacity:1}42%{opacity:.25}66%{opacity:1}100%{opacity:0}}
#horde-vignette{position:fixed;inset:0;pointer-events:none;z-index:55;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 42%,rgba(170,10,0,.55) 100%)}
#horde-vignette.on{animation:hordepulse 2.4s ease-out 1}
#horde-banner{position:fixed;top:128px;left:50%;transform:translateX(-50%);padding:7px 20px;background:rgba(36,0,0,.82);color:#ffd8c8;border:1px solid #a02a20;
font:700 15px Georgia,serif;letter-spacing:.09em;text-transform:uppercase;pointer-events:none;z-index:56;opacity:0;transition:opacity .5s;text-shadow:0 0 8px #f33;white-space:nowrap}
#horde-banner.on{opacity:1}`;
  document.head.appendChild(s);
}

export function createView(ctx) {
  const { THREE, scene, st, world, focus } = ctx;
  if (!st.horde || !THREE) return null;
  injectCss();
  const hasDom = typeof document !== 'undefined';
  const H = (x, z) => world.heightAt(x, z);
  const root = new THREE.Group(); root.name = 'horde'; scene.add(root);
  const lam = (c, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, extra));
  const mats = {
    wood: lam(0x3a2a1c), wood2: lam(0x2a1e14), bone: lam(0xcfc6a8), iron: lam(0x2a2a2e), cloth: lam(0x7a1410, { side: THREE.DoubleSide }), cloth2: lam(0x1a1210, { side: THREE.DoubleSide }),
    hide: lam(0x5a4a34), stone: lam(0x4a4a4c), char: lam(0x1a1614), ash: new THREE.MeshBasicMaterial({ color: 0x120e0c }), rune: new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    eye: new THREE.MeshBasicMaterial({ color: 0xff3a20 }),
  };
  const G = {
    stake: new THREE.ConeGeometry(0.36, 4.4, 5), pole: new THREE.CylinderGeometry(0.2, 0.28, 7.5, 6), cross: new THREE.BoxGeometry(0.3, 0.3, 3.4), skull: new THREE.SphereGeometry(0.5, 7, 5),
    horn: new THREE.ConeGeometry(0.2, 1.6, 5), flag: new THREE.PlaneGeometry(2.2, 3.0, 4, 1), tent: new THREE.ConeGeometry(2.3, 2.6, 6), stone: new THREE.DodecahedronGeometry(0.6, 0),
    spear: new THREE.CylinderGeometry(0.05, 0.05, 6, 4), spearTip: new THREE.ConeGeometry(0.16, 0.7, 4), disc: new THREE.CircleGeometry(1, 28), ring: new THREE.RingGeometry(0.92, 1, 56),
    throneSeat: new THREE.BoxGeometry(2.2, 0.8, 2.2), throneBack: new THREE.BoxGeometry(0.5, 4.2, 2.6), throneSpike: new THREE.ConeGeometry(0.22, 1.4, 4),
    col: new THREE.CylinderGeometry(1, 1, 70, 14, 1, true),
  };
  G.col.translate(0, 35, 0);
  G.flag.translate(1.1, 0, 0);
  let now = 0;
  const campsOf = () => (st.horde.camps || []);
  const dummy = new THREE.Object3D();
  const add = (parent, geom, mat, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => { const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.setScalar(s); parent.add(m); return m; };

  // ------------------------------------------------------------ war-camps
  const camps = new Map();
  function buildCamp(c) {
    const big = c.kind === 'warcamp', fort = c.kind === 'fort';
    const R = big ? 17 : fort ? 12.5 : 9, k = big ? 1.7 : fort ? 1.25 : 1;
    const g = new THREE.Group(); g.position.set(c.x, H(c.x, c.z), c.z);
    const live = new THREE.Group(), dead = new THREE.Group(); g.add(live, dead);
    // palisade: instanced stakes in a ring with two gaps, leaning outward
    const n = Math.ceil((TAU * R) / 1.9), pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.2;
      if (Math.abs(Math.sin(a * 1)) < 0.08 || Math.abs(Math.cos(a)) < 0.06 && big) continue;
      pts.push(a);
    }
    const inst = new THREE.InstancedMesh(G.stake, mats.wood, pts.length);
    pts.forEach((a, i) => {
      const rr = R + (hash(c.id * 31 + i) - 0.5) * 0.8, y = H(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr) - H(c.x, c.z);
      dummy.position.set(Math.cos(a) * rr, y + 2.0, Math.sin(a) * rr);
      dummy.rotation.set(Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14);
      dummy.scale.set(1, 0.85 + hash(c.id * 17 + i) * 0.5, 1); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
    });
    live.add(inst);
    // totem
    const tot = new THREE.Group(); tot.scale.setScalar(k); live.add(tot);
    add(tot, G.pole, mats.wood2, 0, 3.7, 0);
    add(tot, G.cross, mats.wood, 0, 6.2, 0);
    for (let i = 0; i < 3; i++) add(tot, G.skull, mats.bone, 0.3, 1.6 + i * 1.4, 0).scale.setScalar(0.8 + 0.1 * i);
    add(tot, G.skull, mats.bone, 0, 7.7, 0, 0, 0, 0, 1.15);
    add(tot, G.horn, mats.bone, 0.5, 8.1, 0, 0, 0, -0.6); add(tot, G.horn, mats.bone, -0.5, 8.1, 0, 0, 0, 0.6);
    add(tot, new THREE.SphereGeometry(0.16, 6, 5), mats.eye, 0.42, 7.8, 0.25); add(tot, new THREE.SphereGeometry(0.16, 6, 5), mats.eye, 0.42, 7.8, -0.25);
    const flag = add(tot, G.flag, mats.cloth, 0.15, 5.6, 0); flag.rotation.y = Math.PI / 2;
    add(flag, new THREE.CircleGeometry(0.5, 12), mats.cloth2, 1.1, 0.1, 0.02);
    const glow = new THREE.Sprite(glowSpriteMat(0xff3018, 0.8)); glow.position.set(0, 7.8, 0); glow.scale.set(6, 6, 1); tot.add(glow);
    // fire pit
    const fireG = new THREE.Group(); fireG.position.set(3.2 * k, 0, 2.2 * k); live.add(fireG);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; add(fireG, G.stone, mats.stone, Math.cos(a) * 1.3, 0.3, Math.sin(a) * 1.3, i, i * 2, 0, 0.9); }
    const fire = new THREE.Sprite(glowSpriteMat(0xff8a28, 0.95)); fire.position.y = 1.4; fire.scale.set(4, 4, 1); fireG.add(fire);
    const fire2 = new THREE.Sprite(glowSpriteMat(0xff4a10, 0.6)); fire2.position.y = 0.9; fire2.scale.set(7, 5, 1); fireG.add(fire2);
    // tents and bones
    const nt = big ? 5 : fort ? 3 : 2;
    for (let i = 0; i < nt; i++) { const a = (i / nt) * TAU + 1.0, rr = R * 0.55; add(live, G.tent, mats.hide, Math.cos(a) * rr, 1.3, Math.sin(a) * rr, 0, a, 0, 0.8 + (i % 2) * 0.25); }
    for (let i = 0; i < 6 + 4 * (big ? 1 : 0); i++) { const a = hash(c.id * 7 + i) * TAU, rr = 2 + hash(c.id * 13 + i) * R * 0.7; add(live, G.horn, mats.bone, Math.cos(a) * rr, 0.4, Math.sin(a) * rr, 1.3, a, 0, 0.7); }
    // corner watch banners on fort/warcamp
    const corners = [];
    if (fort || big) for (let i = 0; i < (big ? 4 : 2); i++) {
      const a = (i / (big ? 4 : 2)) * TAU + 0.8, cx = Math.cos(a) * (R + 0.8), cz = Math.sin(a) * (R + 0.8);
      const p = add(live, G.pole, mats.wood2, cx, 3.2, cz, 0, 0, 0, 0.8); const f = add(live, G.flag, mats.cloth, cx, 5.6, cz); f.rotation.y = a; corners.push(f);
      add(live, G.skull, mats.bone, cx, 7.2, cz, 0, 0, 0, 0.8);
    }
    // warlord arena: spear ring, throne, rune circle (only the main war-camp)
    let rune = null;
    if (big) {
      const w = st.horde.warlord, ox = w.x - c.x, oz = w.z - c.z;
      rune = add(live, G.ring, mats.rune, ox, 0.2, oz, -Math.PI / 2, 0, 0, 14);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, sx = ox + Math.cos(a) * 13.5, sz = oz + Math.sin(a) * 13.5; add(live, G.spear, mats.wood, sx, 2.6, sz, Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18); add(live, G.spearTip, mats.iron, sx + Math.cos(a) * -0.4, 5.6, sz + Math.sin(a) * -0.4); }
      const th = new THREE.Group(); th.position.set(ox - 4, 0, oz - 4); th.rotation.y = 0.8; live.add(th);
      add(th, G.throneSeat, mats.stone, 0, 0.5, 0); add(th, G.throneBack, mats.iron, -1, 2.4, 0);
      for (let i = -1; i <= 1; i++) add(th, G.throneSpike, mats.bone, -1, 4.6, i * 0.9);
    }
    // ruin
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, rr = 1.5 + (i % 4) * 2.2; add(dead, G.stone, mats.char, Math.cos(a) * rr, 0.25, Math.sin(a) * rr, i, i * 0.7, 0, 0.6 + hash(c.id + i) * 0.9); }
    add(dead, G.disc, mats.ash, 0, 0.06, 0, -Math.PI / 2, 0, 0, R * 0.55);
    for (let i = 0; i < 5; i++) add(dead, G.stake, mats.char, Math.cos(i * 1.7) * (R * 0.6), 0.4, Math.sin(i * 1.7) * (R * 0.6), 1.4, i, 0.4, 0.8);
    const ember = new THREE.Sprite(glowSpriteMat(0xff5a20, 0.45)); ember.position.y = 0.9; ember.scale.set(3.2, 2.4, 1); dead.add(ember);
    const puffs = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.SpriteMaterial({ map: softTexture(), color: 0x2a2630, transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(m); s.visible = false; g.add(s); puffs.push({ s, m, ph: i / 4 + hash(c.id) });
    }
    root.add(g);
    const rec = { g, live, dead, tot, flag, glow, fire, fire2, fireG, corners, rune, ember, puffs, was: c.alive, deadAt: -99, k, R };
    live.visible = c.alive; dead.visible = !c.alive;
    camps.set(c.id, rec);
    return rec;
  }
  function campFrame(c, rec, dt) {
    if (c.alive !== rec.was) { rec.was = c.alive; rec.deadAt = now; if (c.alive) { rec.live.visible = true; rec.live.scale.set(1, 1, 1); } else rec.dead.visible = true; }
    if (c.alive) {
      rec.live.visible = true; rec.dead.visible = false; rec.live.scale.set(1, 1, 1);
      const hurt = c.maxHp ? 1 - c.hp / c.maxHp : 0, f = 5 + Math.sin(now * 3 + c.id) * 0.3;
      rec.flag.rotation.y = Math.PI / 2 + Math.sin(now * 1.7 + c.id) * 0.18;
      for (const f2 of rec.corners) f2.rotation.z = Math.sin(now * 1.4 + c.id) * 0.1;
      const gs = 6 + hurt * 4 + Math.sin(now * 5 + c.id) * 0.6; rec.glow.scale.set(gs, gs, 1);
      const fl = 3.6 + Math.sin(now * 9 + c.id) * 0.5; rec.fire.scale.set(fl, fl + Math.sin(now * 11) * 0.4, 1);
      rec.fire2.scale.set(6.4 + Math.sin(now * 6) * 0.5, 4.6, 1);
      if (rec.rune) rec.rune.material.opacity = 0.35 + 0.2 * Math.sin(now * 2);
    } else {
      const t = (now - rec.deadAt) / 1.6;
      if (t < 1 && rec.live.visible) { rec.live.scale.set(1, Math.max(0.03, 1 - t), 1); rec.live.rotation.z = t * 0.12; } else { rec.live.visible = false; rec.live.rotation.z = 0; }
      rec.dead.visible = true; rec.ember.scale.set(3.2 + Math.sin(now * 3 + c.id) * 0.4, 2.4, 1);
    }
    const top = c.alive ? 9 : 1.2, str = c.alive ? 0.32 : 0.16;
    for (const p of rec.puffs) {
      const u = (now * 0.08 + p.ph) % 1;
      p.s.visible = true; p.s.position.set(Math.sin(u * 5 + p.ph * 9) * 1.4 + (c.alive ? 3.2 * rec.k : 0), top + u * (c.alive ? 18 : 10), Math.cos(u * 4 + p.ph * 7) * 1.4 + (c.alive ? 2.2 * rec.k : 0));
      const sc = (c.alive ? 4 : 2.4) + u * (c.alive ? 10 : 6); p.s.scale.set(sc, sc, 1);
      p.m.opacity = str * (1 - u) * Math.min(1, u * 8);
    }
  }

  // ------------------------------------------------------------ front line
  const cols = [];
  for (let i = 0; i < MAX_COL; i++) {
    const g = new THREE.Group(); g.visible = false; root.add(g);
    const puffs = [];
    for (let j = 0; j < 3; j++) {
      const m = new THREE.SpriteMaterial({ map: softTexture(), color: 0x2a2220, transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(m); g.add(s); puffs.push({ s, m, ph: j / 3 });
    }
    const base = new THREE.Sprite(glowSpriteMat(0xff4a18, 0.7)); base.position.y = 1.2; base.scale.set(7, 4, 1); g.add(base);
    cols.push({ g, puffs, base });
  }
  const fl = { poles: [], flags: [], glow: new THREE.Sprite(glowSpriteMat(0xff2a10, 0.55)) };
  fl.glow.scale.set(60, 26, 1); root.add(fl.glow);
  for (let i = 0; i < 7; i++) {
    const p = new THREE.Mesh(G.pole, mats.wood2); p.scale.set(0.7, 0.9, 0.7); root.add(p); fl.poles.push(p);
    const f = new THREE.Mesh(G.flag, mats.cloth); root.add(f); fl.flags.push(f);
  }
  const putCol = (col, x, z, k, up) => {
    col.g.visible = true; col.g.position.set(x, H(x, z), z);
    for (const p of col.puffs) {
      const u = (now * 0.1 + p.ph + k * 0.37) % 1;
      p.s.position.set(Math.sin(u * 5 + k) * 1.8, 4 + u * up, Math.cos(u * 4 + k) * 1.8);
      const sc = 5 + u * 14; p.s.scale.set(sc, sc, 1); p.m.opacity = 0.42 * (1 - u) * Math.min(1, u * 7);
    }
    const f = 6 + Math.sin(now * 8 + k * 3) * 1.2; col.base.scale.set(f, f * 0.6, 1);
  };
  function frontFrame() {
    const h = st.horde, fx = focus.x, fz = focus.z;
    const fp = frontPos(st);
    let ci = 0;
    if (fp) {
      // glow and banner row along the perpendicular
      const near = Math.hypot(fp.x - fx, fp.z - fz) < 330;
      fl.glow.visible = near; fl.poles.forEach((p) => { p.visible = near; }); fl.flags.forEach((f) => { f.visible = near; });
      if (near) {
        fl.glow.position.set(fp.x, H(fp.x, fp.z) + 6, fp.z);
        fl.glow.scale.set(60 + 6 * Math.sin(now * 2), 26, 1);
        const px = -fp.dz, pz = fp.dx;
        fl.poles.forEach((p, i) => {
          const o = (i - 3) * 6.5 + (hash(i * 5) - 0.5) * 3, x = fp.x + px * o + fp.dx * (hash(i) * 6 - 3), z = fp.z + pz * o + fp.dz * (hash(i) * 6 - 3), y = H(x, z);
          p.position.set(x, y + 3.4, z); p.rotation.set(0, 0, (hash(i * 3) - 0.5) * 0.12);
          const f = fl.flags[i]; f.position.set(x, y + 6.2, z); f.rotation.y = Math.atan2(-fp.dz, fp.dx) + Math.sin(now * 1.6 + i) * 0.2;
        });
      }
      // smoke columns on the overrun land behind the front (denser near it)
      for (let s = fp.dist; s > Math.max(0, fp.dist - 900) && ci < MAX_COL - 3; s -= (fp.dist - s < 120 ? 26 : 52)) {
        const p = ctxPos(h, s), k = Math.floor(s / 26), off = (hash(k) - 0.5) * 70;
        const x = p.x - p.dz * off, z = p.z + p.dx * off;
        if (Math.hypot(x - fx, z - fz) > SMOKE_FAR) continue;
        putCol(cols[ci++], x, z, k, 22 + hash(k * 3) * 12);
      }
    }
    // fallen towns burn
    const towns = st.towns && st.towns.length ? st.towns : h.fb || [];
    for (const t of towns) {
      if (t.state !== 'fallen' || ci >= MAX_COL) continue;
      if (Math.hypot(t.x - fx, t.z - fz) > SMOKE_FAR + 60) continue;
      const nn = Math.min(3, MAX_COL - ci);
      for (let j = 0; j < nn; j++) { const a = (j / nn) * TAU + t.id, rr = (t.r || 26) * 0.35; putCol(cols[ci++], t.x + Math.cos(a) * rr, t.z + Math.sin(a) * rr, t.id * 7 + j, 26); }
    }
    for (let i = ci; i < MAX_COL; i++) cols[i].g.visible = false;
  }
  function ctxPos(h, d) { // path position without importing helper internals
    d = Math.max(0, Math.min(h.len, d));
    let i = 1; while (i < h.cum.length - 1 && h.cum[i] < d) i++;
    const a = h.path[i - 1], b = h.path[i], seg = Math.max(1e-6, h.cum[i] - h.cum[i - 1]), u = (d - h.cum[i - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, dx: (b[0] - a[0]) / seg, dz: (b[1] - a[1]) / seg };
  }

  // ------------------------------------------------------------ assault markers
  const recs = new Map();
  const torchPool = [];
  for (let i = 0; i < MAX_TORCH; i++) { const s = new THREE.Sprite(glowSpriteMat(i % 3 ? 0xff9a3a : 0xffc060, 0.9)); s.visible = false; s.scale.set(2.4, 2.4, 1); root.add(s); torchPool.push(s); }
  function makeRec() {
    const ring = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color: 0xff2a20, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 9; root.add(ring);
    const col = new THREE.Mesh(G.col, new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    root.add(col);
    const band = new THREE.Sprite(glowSpriteMat(0xff2a18, 0.8)); band.scale.set(14, 14, 1); root.add(band);
    return { ring, col, band };
  }
  function disposeRec(r) { for (const o of [r.ring, r.col]) { root.remove(o); o.material.dispose(); } root.remove(r.band); }
  function assaultFrame(alpha) {
    const fx = focus.x, fz = focus.z, seen = new Set();
    let ti = 0;
    const vis = ctx.visibleNow || (() => true);
    for (const a of st.horde.assaults) {
      if (a.state === 'done') continue;
      seen.add(a.id);
      let rec = recs.get(a.id); if (!rec) { rec = makeRec(); recs.set(a.id, rec); }
      const R = a.hunt >= 0 ? 12 : (townR(a.townId) || 26);
      const fast = a.arrived >= 0 ? 9 : a.state === 'marching' ? 5 : 3;
      rec.ring.visible = rec.col.visible = true;
      rec.ring.position.set(a.tx, H(a.tx, a.tz) + 0.9, a.tz); rec.ring.scale.setScalar(R * (1 + 0.025 * Math.sin(now * fast)));
      rec.ring.material.opacity = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(now * fast));
      rec.col.position.set(a.tx, H(a.tx, a.tz), a.tz); rec.col.scale.set(R * 0.18, 1, R * 0.18); rec.col.material.opacity = 0.09 + 0.09 * (0.5 + 0.5 * Math.sin(now * fast));
      const showBand = a.state !== 'warning' && (a.hunt === ctx.localTeam || vis(a.x, a.z) || Math.hypot(a.x - fx, a.z - fz) < 140);
      rec.band.visible = showBand;
      if (showBand) { rec.band.position.set(a.x, H(a.x, a.z) + 14, a.z); rec.band.scale.setScalar(12 + 3 * Math.sin(now * 6)); }
      if (a.state !== 'warning') {
        for (const id of a.ids) {
          if (ti >= MAX_TORCH) break;
          const m = st.byId.get(id);
          if (!m || !m.alive || Math.hypot(m.x - fx, m.z - fz) > 130 || !vis(m.x, m.z)) continue;
          const x = m.ox + (m.x - m.ox) * alpha, z = m.oz + (m.z - m.oz) * alpha, s = torchPool[ti++];
          s.visible = true; s.position.set(x, H(x, z) + 2.7 + 0.12 * Math.sin(now * 11 + id), z);
          const f = 2.3 + 0.5 * Math.sin(now * 13 + id * 1.7); s.scale.set(f, f, 1);
        }
      }
    }
    for (let i = ti; i < MAX_TORCH; i++) torchPool[i].visible = false;
    for (const [id, rec] of recs) if (!seen.has(id)) { disposeRec(rec); recs.delete(id); }
  }
  const townR = (id) => { const l = st.towns && st.towns.length ? st.towns : st.horde.fb; for (const t of l) if (t.id === id) return t.r; return 0; };

  // ------------------------------------------------------------ telegraphs (Warlord)
  const tele = [];
  function addTele(e) {
    if (tele.length >= MAX_TELE) { const o = tele.shift(); root.remove(o.m); root.remove(o.fill); o.m.material.dispose(); o.fill.material.dispose(); }
    const col = e.color || 0xff3a1a;
    const m = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    const fill = new THREE.Mesh(G.disc, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    for (const o of [m, fill]) { o.rotation.x = -Math.PI / 2; o.position.set(e.x, H(e.x, e.z) + 0.5, e.z); o.scale.setScalar(e.r); o.renderOrder = 10; root.add(o); }
    fill.scale.setScalar(0.01);
    tele.push({ m, fill, r: e.r, t: 0, dur: Math.max(0.3, e.dur || 1) });
  }
  function teleFrame(dt) {
    for (let i = tele.length - 1; i >= 0; i--) {
      const o = tele[i]; o.t += dt;
      const u = Math.min(1, o.t / o.dur);
      o.fill.scale.setScalar(Math.max(0.01, o.r * u)); o.fill.material.opacity = 0.16 + 0.3 * u;
      o.m.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(o.t * 14));
      if (o.t >= o.dur + 0.12) { root.remove(o.m); root.remove(o.fill); o.m.material.dispose(); o.fill.material.dispose(); tele.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------ horn cue (DOM)
  let vig = null, banner = null, bannerT = 0;
  function horn(text, big) {
    if (!hasDom) return;
    if (!vig) { vig = document.createElement('div'); vig.id = 'horde-vignette'; document.body.appendChild(vig); banner = document.createElement('div'); banner.id = 'horde-banner'; document.body.appendChild(banner); }
    if (big !== false) { vig.classList.remove('on'); void vig.offsetWidth; vig.classList.add('on'); }
    banner.textContent = text; banner.classList.add('on'); bannerT = 7;
  }

  function frame(st2, alpha, dt) {
    now += dt;
    if (!st2.horde || !st2.horde.ready) return;
    const fx = focus.x, fz = focus.z;
    for (const c of campsOf()) {
      let rec = camps.get(c.id);
      const near = Math.hypot(c.x - fx, c.z - fz) < FAR;
      if (!rec) { if (!near) continue; rec = buildCamp(c); }
      rec.g.visible = near;
      if (near) campFrame(c, rec, dt);
    }
    frontFrame();
    assaultFrame(alpha);
    teleFrame(dt);
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0 && banner) banner.classList.remove('on'); }
  }

  function handleEvents(events) {
    const fx = (fn) => { try { fn(); } catch (e) { /* cosmetic only */ } };
    for (const e of events) {
      switch (e.type) {
        case 'hordeHunt':
        case 'townAttacked':
          horn(e.hunt >= 0 ? (e.hunt === ctx.localTeam ? 'The Dread Moon hunts you!' : 'An elite war-band hunts a hero') : `Orcs march on ${e.name}: ${e.size || '?'} warriors, ${Math.max(1, Math.round(e.eta))} s`);
          fx(() => { ctx.ringFx(e.x, e.z, 16, 0xff2a20, 1.4); ctx.ringFx(e.x, e.z, 30, 0xff4a30, 1.8); if (ctx.wv && ctx.wv.beamFx) ctx.wv.beamFx(e.x, e.z, 0xff3a22, 2.2, 1.6, 55); });
          break;
        case 'townHit': fx(() => { ctx.burst(e.x, 1.2, e.z, 8, 3, 0xff5030, 0.8, 0.5, -2); if (e.razing) ctx.ringFx(e.x, e.z, 14, 0xff2a20, 0.8); }); break;
        case 'townFallen': horn(`${e.name || 'A town'} has fallen!`); fx(() => { ctx.burst(e.x, 3, e.z, 50, 7, 0x6a5a48, 1.6, 1.0, 3); ctx.burst(e.x, 4, e.z, 30, 5, 0xff6a30, 1.2, 0.7, -2); }); break;
        case 'townSaved': horn('Town saved!', false); fx(() => ctx.ringFx(e.x, e.z, 22, 0xffd860, 1.4)); break;
        case 'capitalSiege': horn('The capital is under siege!'); break;
        case 'capitalFallen': horn('THE CAPITAL HAS FALLEN - retake it!'); break;
        case 'capitalHeld': horn('The siege is broken!', false); break;
        case 'capitalReclaimed': horn('The capital is reclaimed!', false); break;
        case 'hordeVanish': fx(() => ctx.burst(e.x, 1.0, e.z, 10, 2.5, 0x3a3640, 0.9, 0.7, -1)); break;
        case 'campDestroyed': fx(() => { ctx.ringFx(e.x, e.z, 14, 0xffd860, 1.2); ctx.burst(e.x, 3, e.z, 40, 6, 0x6a5a48, 1.4, 0.9, 4); ctx.burst(e.x, 4, e.z, 24, 4, 0xff6a30, 1.0, 0.6, -2); }); horn('Orc camp destroyed - the horde slows', false); break;
        case 'telegraph': addTele(e); break;
        case 'warlordPhase': fx(() => { ctx.ringFx(e.x, e.z, 16, 0xff5a20, 1.2); ctx.burst(e.x, 2, e.z, 30, 6, 0xff6a30, 1.0, 0.7, -1); }); break;
        case 'warlordFight': horn('The Orc Warlord awakes!', false); break;
        case 'warlordSlain': horn('The Orc Warlord is slain!'); fx(() => { ctx.ringFx(e.x, e.z, 30, 0xffd860, 2.2); ctx.burst(e.x, 4, e.z, 80, 9, 0xffd060, 2.0, 1.0, 1); }); break;
        default:
      }
    }
  }

  function dispose() {
    scene.remove(root);
    for (const rec of recs.values()) disposeRec(rec);
    for (const c of cols) for (const p of c.puffs) p.m.dispose();
    for (const rec of camps.values()) for (const p of rec.puffs) p.m.dispose();
    for (const k in G) G[k].dispose();
    for (const k in mats) mats[k].dispose();
    if (vig) vig.remove(); if (banner) banner.remove();
  }
  return { frame, handleEvents, dispose };
}
export function createUi() { return null; }
