// v3 scene module (HERO lane): the ground indicator for the skill being aimed. aiming.js (controls) fills AIM.cur every frame while a skill key is
// held; this draws it as translucent decals (circle / cone / line / dash path / wall) that ignore depth so they stay readable on slopes.
// Registered in v3view.js. Shape fields: see skillaim.js skillShape().
import { AIM } from './skillaim.js';

const SEG = 36, MAXC = 8;

export function createView(ctx) {
  const { THREE, scene, world } = ctx;
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const mats = new Map();
  let layerN = 0;
  const matFor = (L, kind, color, op) => { // one material per layer/kind/colour; opacity is set on every use
    const k = L.id + kind + color;
    let m = mats.get(k);
    if (!m) {
      m = kind === 'fill'
        ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
      mats.set(k, m);
    }
    m.opacity = op;
    return m;
  };
  const prep = (o) => { o.renderOrder = 30; o.frustumCulled = false; o.visible = false; return o; };

  // geometry shared by all layers
  const unitCircleFill = new THREE.CircleGeometry(1, 40); unitCircleFill.rotateX(-Math.PI / 2);
  const unitCirclePts = []; for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; unitCirclePts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))); }
  const unitCircleLine = new THREE.BufferGeometry().setFromPoints(unitCirclePts);
  const unitRectFill = new THREE.PlaneGeometry(1, 1); unitRectFill.rotateX(-Math.PI / 2);
  const unitRectLine = new THREE.BufferGeometry().setFromPoints([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]].map(([x, z]) => new THREE.Vector3(x, 0, z)));

  function makeLayer(fillOp, lineOp) {
    const g = new THREE.Group(); root.add(g);
    const L = { g, fillOp, lineOp, id: layerN++ };
    // sector (cone): positions rebuilt per frame
    const sp = new Float32Array((SEG + 2) * 3), sl = new Float32Array((SEG + 3) * 3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const idx = []; for (let i = 1; i <= SEG; i++) idx.push(0, i, i + 1); sg.setIndex(idx);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(sl, 3));
    L.secFill = prep(new THREE.Mesh(sg, matFor(L, 'fill', 0xffffff, fillOp))); L.secLine = prep(new THREE.Line(lg, matFor(L, 'line', 0xffffff, lineOp)));
    L.rectFill = prep(new THREE.Mesh(unitRectFill, matFor(L, 'fill', 0xffffff, fillOp))); L.rectLine = prep(new THREE.Line(unitRectLine, matFor(L, 'line', 0xffffff, lineOp)));
    L.circFill = []; L.circLine = [];
    for (let i = 0; i < MAXC; i++) { L.circFill.push(prep(new THREE.Mesh(unitCircleFill, matFor(L, 'fill', 0xffffff, fillOp)))); L.circLine.push(prep(new THREE.Line(unitCircleLine, matFor(L, 'line', 0xffffff, lineOp)))); }
    for (const o of [L.secFill, L.secLine, L.rectFill, L.rectLine, ...L.circFill, ...L.circLine]) g.add(o);
    L.sp = sp; L.sl = sl;
    return L;
  }
  const main = makeLayer(0.22, 0.95), maxL = makeLayer(0, 0.3), rangeL = makeLayer(0, 0.22);
  const layers = [main, maxL, rangeL];

  const hide = (L) => { for (const o of [L.secFill, L.secLine, L.rectFill, L.rectLine, ...L.circFill, ...L.circLine]) o.visible = false; };
  function circ(L, i, x, z, r, col, fill, lineOp) {
    const f = L.circFill[i], l = L.circLine[i], y = world.heightAt(x, z) + 0.5;
    f.position.set(x, y, z); l.position.set(x, y + 0.02, z); f.scale.set(r, 1, r); l.scale.set(r, 1, r);
    f.visible = fill && L.fillOp > 0; l.visible = true;
    l.material = matFor(L, 'line', col, lineOp); if (f.visible) f.material = matFor(L, 'fill', col, L.fillOp);
  }
  function rect(L, cx, cz, len, w, ang, col, lineOp) {
    const y = world.heightAt(cx, cz) + 0.5;
    for (const o of [L.rectFill, L.rectLine]) { o.position.set(cx, y, cz); o.rotation.y = -ang; o.scale.set(len, 1, w); }
    L.rectFill.visible = L.fillOp > 0; L.rectLine.visible = true;
    L.rectLine.material = matFor(L, 'line', col, lineOp); if (L.rectFill.visible) L.rectFill.material = matFor(L, 'fill', col, L.fillOp);
  }
  function sector(L, x, z, ang, len, arc, col, lineOp) {
    const p = L.sp, q = L.sl, y = world.heightAt(x, z) + 0.5;
    p[0] = p[1] = p[2] = 0; q[0] = q[1] = q[2] = 0;
    for (let i = 0; i <= SEG; i++) {
      const a = -arc / 2 + (arc * i) / SEG, px = Math.cos(a) * len, pz = Math.sin(a) * len;
      p[(i + 1) * 3] = px; p[(i + 1) * 3 + 1] = 0; p[(i + 1) * 3 + 2] = pz;
      q[(i + 1) * 3] = px; q[(i + 1) * 3 + 1] = 0; q[(i + 1) * 3 + 2] = pz;
    }
    q[(SEG + 2) * 3] = q[(SEG + 2) * 3 + 1] = q[(SEG + 2) * 3 + 2] = 0;
    L.secFill.geometry.attributes.position.needsUpdate = true; L.secLine.geometry.attributes.position.needsUpdate = true;
    for (const o of [L.secFill, L.secLine]) { o.position.set(x, y, z); o.rotation.y = -ang; }
    L.secFill.visible = L.fillOp > 0; L.secLine.visible = true;
    L.secLine.material = matFor(L, 'line', col, lineOp); if (L.secFill.visible) L.secFill.material = matFor(L, 'fill', col, L.fillOp);
  }
  // draw one shape into a layer
  function draw(L, sh, col, lineOp, withMarkers) {
    hide(L);
    switch (sh.kind) {
      case 'circle': circ(L, 0, sh.x, sh.z, Math.max(0.5, sh.r), col, true, lineOp); break;
      case 'cone': sector(L, sh.x, sh.z, sh.ang, sh.len, sh.arc, col, lineOp); break;
      case 'line': rect(L, sh.x + Math.cos(sh.ang) * sh.len / 2, sh.z + Math.sin(sh.ang) * sh.len / 2, sh.len, sh.w, sh.ang, col, lineOp); break;
      case 'dash': {
        rect(L, sh.x + Math.cos(sh.ang) * sh.len / 2, sh.z + Math.sin(sh.ang) * sh.len / 2, sh.len, sh.w, sh.ang, col, lineOp);
        circ(L, 0, sh.tx, sh.tz, sh.r > 0 ? sh.r : 0.9, col, true, lineOp);
        break;
      }
      case 'wall': {
        rect(L, sh.x, sh.z, sh.len, sh.w, sh.ang, col, lineOp);
        if (withMarkers) for (let k = 0; k < Math.min(MAXC, sh.n); k++) { const off = (k - (sh.n - 1) / 2) * sh.gap; circ(L, k, sh.x + Math.cos(sh.ang) * off, sh.z + Math.sin(sh.ang) * off, sh.w / 2, col, false, lineOp * 0.8); }
        break;
      }
    }
  }

  let t = 0;
  return {
    frame(st, alpha, dt) {
      t += dt;
      const sh = AIM.cur;
      if (!sh || sh.kind === 'none') { if (root.visible) { root.visible = false; for (const L of layers) hide(L); } return; }
      root.visible = true;
      const col = sh.ok ? sh.color : 0xff5040, pulse = 0.72 + 0.2 * Math.sin(t * 10);
      draw(main, sh, col, pulse, true);
      if (sh.max) draw(maxL, sh.max, col, 0.3 + 0.25 * (sh.hold >= 0 ? sh.hold : 0), false); else hide(maxL);
      // max cast range ring around the hero for ground-placed skills
      if (sh.range > 0 && (sh.kind === 'circle' || sh.kind === 'wall')) {
        const h = st.teams[ctx.localTeam].hero;
        hide(rangeL); circ(rangeL, 0, h.x, h.z, sh.range, col, false, 0.22);
      } else hide(rangeL);
    },
    dispose() { scene.remove(root); },
  };
}
