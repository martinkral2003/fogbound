// FOGBOUND: DOMINION placeholder renderer (CONTROLS lane). Flat-shaded terrain + boxes; used until/unless render.js is available.
// Camera convention: eye = target + (sin(yaw)cos(p), sin(p), cos(yaw)cos(p)) * dist, so yaw 0 looks toward -z (north up), screen right = +x.
import * as THREE from 'three';

const TEAM_COL = [0x4fe3c1, 0xe8742a, 0xd8402a, 0xc43bd6];

export function createRtsRenderer(canvas, st, localTeam) {
  const W = st.world;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a232b);
  scene.fog = new THREE.Fog(0x1a232b, 160, 420);
  scene.add(new THREE.HemisphereLight(0xaab8c8, 0x303830, 1.1));
  const sun = new THREE.DirectionalLight(0xffeedd, 1.4); sun.position.set(-60, 120, 40); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 900);
  // terrain
  const N = 160, geo = new THREE.PlaneGeometry(400, 400, N, N); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = W.heightAt(x, z); pos.setY(i, y);
    const c = terrainColor(y); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1d3a4a })); water.position.y = -0.3; scene.add(water);

  const boxG = new THREE.BoxGeometry(1, 1, 1), cylG = new THREE.CylinderGeometry(0.5, 0.5, 1, 10), ringG = new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2);
  const mats = new Map(), meshes = new Map();
  const mat = (c, o = {}) => { const k = c + '|' + (o.opacity || 1); if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, transparent: (o.opacity || 1) < 1, opacity: o.opacity || 1 })); return mats.get(k); };
  const group = new THREE.Group(); scene.add(group);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x7dff9a, side: THREE.DoubleSide, depthTest: false });
  const rings = [], ghostMeshes = [];

  function sync(list, alpha, make, upd) {
    for (const e of list) {
      let m = meshes.get(e.id);
      if (!e.alive && e.alive !== undefined && e.kind === 'unit') { if (m) { group.remove(m); meshes.delete(e.id); } continue; }
      if (e.state === 'ruin') { if (m) { group.remove(m); meshes.delete(e.id); } continue; }
      if (!m) { m = make(e); group.add(m); meshes.set(e.id, m); }
      upd(m, e, alpha);
    }
  }
  const mkUnit = (u) => { const m = new THREE.Mesh(u.general ? cylG : boxG, mat(TEAM_COL[u.team] ?? 0x888888)); return m; };
  const updUnit = (m, u, a) => {
    const x = u.ox !== undefined ? u.ox + (u.x - u.ox) * a : u.x, z = u.oz !== undefined ? u.oz + (u.z - u.oz) * a : u.z;
    const s = (u.r || 0.6) * 2 * (u.general ? 1.5 : 1.2), hgt = u.general ? 3 : 1.6;
    m.scale.set(s, hgt, s); m.position.set(x, W.heightAt(x, z) + hgt / 2, z); m.rotation.y = -(u.face || 0);
  };
  const mkBld = (b) => new THREE.Mesh(boxG, mat(b.wall ? 0x77716a : (TEAM_COL[b.team] ?? 0x888888)));
  const updBld = (m, b) => {
    const k = b.state === 'building' ? 0.3 + 0.7 * (b.progress || 0) : 1;
    m.scale.set(b.w, b.h * k, b.d); m.position.set(b.x, W.heightAt(b.x, b.z) + (b.h * k) / 2, b.z); m.rotation.y = -(b.rot || 0);
  };
  const mkNode = (n) => new THREE.Mesh(cylG, mat({ tree: 0x2f6b34, mine: 0xd8b84a, quarry: 0x8a8a90, farm: 0x8a3a3a }[n.rtype] || 0xaa77ff));
  const updNode = (m, n) => { const s = (n.r || 1.2) * 2; m.scale.set(s, n.rtype === 'tree' ? 5 : 2, s); m.position.set(n.x, W.heightAt(n.x, n.z) + (n.rtype === 'tree' ? 2.5 : 1), n.z); };

  const ray = new THREE.Raycaster(), v3 = new THREE.Vector3();
  const rect = () => canvas.getBoundingClientRect();
  function setCam(c) {
    const cp = Math.cos(c.pitch), ty = W.heightAt(c.x, c.z);
    camera.position.set(c.x + Math.sin(c.yaw) * cp * c.dist, ty + Math.sin(c.pitch) * c.dist, c.z + Math.cos(c.yaw) * cp * c.dist);
    camera.lookAt(c.x, ty, c.z); camera.updateMatrixWorld(true);
  }
  function screenToGround(mx, my) {
    const r = rect(); ray.setFromCamera(new THREE.Vector2(((mx - r.left) / r.width) * 2 - 1, -((my - r.top) / r.height) * 2 + 1), camera);
    const o = ray.ray.origin, d = ray.ray.direction; if (d.y > -1e-4) return null;
    let t = (0 - o.y) / d.y, x = 0, z = 0;
    for (let i = 0; i < 6; i++) { x = o.x + d.x * t; z = o.z + d.z * t; t += (W.heightAt(x, z) - (o.y + d.y * t)) / d.y; }
    x = o.x + d.x * t; z = o.z + d.z * t;
    return { x, z, y: W.heightAt(x, z) };
  }
  function worldToScreen(x, z, y) {
    const r = rect(); v3.set(x, y ?? W.heightAt(x, z), z).project(camera);
    return { x: r.left + ((v3.x + 1) / 2) * r.width, y: r.top + ((1 - v3.y) / 2) * r.height, behind: v3.z > 1 };
  }
  function pick(x0, y0, x1, y1) {
    const res = { units: [], blds: [], nodes: [], neutrals: [] };
    const lx = Math.min(x0, x1), hx = Math.max(x0, x1), ly = Math.min(y0, y1), hy = Math.max(y0, y1);
    const click = hx - lx < 6 && hy - ly < 6, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hit = (x, z, rad, y) => { const s = worldToScreen(x, z, y); if (s.behind) return false; if (click) { const px = Math.max(10, rad * 22 / Math.max(1, camDist / 50)); return Math.hypot(s.x - cx, s.y - cy) < px; } return s.x >= lx && s.x <= hx && s.y >= ly && s.y <= hy; };
    for (const u of st.ents) if (u.alive && hit(u.x, u.z, u.r || 0.6, u.y + 1)) res.units.push(u);
    for (const b of st.blds) if (b.state !== 'ruin' && hit(b.x, b.z, Math.max(b.w, b.d) / 2, b.y)) res.blds.push(b);
    for (const n of st.nodes) if ((n.amount ?? 1) > 0 && hit(n.x, n.z, n.r || 1.5)) res.nodes.push(n);
    for (const n of st.neutral || []) if (hit(n.x, n.z, n.r || 2)) res.neutrals.push(n);
    return res;
  }
  let camDist = 60, ghostMat = [mat(0x44ff66, { opacity: 0.5 }), mat(0xff4444, { opacity: 0.5 })];
  function frame(stt, alpha, dt, view) {
    const c = view.cam; camDist = c.dist; setCam(c);
    sync(stt.ents, alpha, mkUnit, updUnit); sync(stt.blds, alpha, mkBld, updBld); sync(stt.nodes, alpha, mkNode, updNode);
    const ids = [...(view.selection || [])]; while (rings.length < ids.length) { const r = new THREE.Mesh(ringG, ringMat); r.renderOrder = 5; scene.add(r); rings.push(r); }
    rings.forEach((r, i) => { const e = ids[i] !== undefined ? stt.byId.get(ids[i]) : null; r.visible = !!e; if (!e) return; const s = e.kind === 'bld' ? Math.max(e.w, e.d) * 0.75 : (e.r || 0.6) * 1.8 + 0.4; r.scale.set(s, 1, s); r.position.set(e.x, W.heightAt(e.x, e.z) + 0.3, e.z); });
    const gs = view.ghosts || []; while (ghostMeshes.length < gs.length) { const m = new THREE.Mesh(boxG, ghostMat[0]); scene.add(m); ghostMeshes.push(m); }
    ghostMeshes.forEach((m, i) => { const g = gs[i]; m.visible = !!g; if (!g) return; const d = g.def || {}; m.material = ghostMat[g.ok ? 0 : 1]; m.scale.set(g.w || d.w || 4, g.h || d.h || 3, g.d || d.d || 4); m.position.set(g.x, W.heightAt(g.x, g.z) + (m.scale.y) / 2, g.z); m.rotation.y = -(g.rot || 0); });
    renderer.render(scene, camera);
  }
  function resize() { const w = canvas.clientWidth || innerWidth, hh = canvas.clientHeight || innerHeight; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); }
  function minimapBase(size) {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), img = g.createImageData(size, size);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const col = terrainColor(W.heightAt((i / size - 0.5) * 400, (j / size - 0.5) * 400)); const k = (j * size + i) * 4; img.data[k] = col[0] * 255; img.data[k + 1] = col[1] * 255; img.data[k + 2] = col[2] * 255; img.data[k + 3] = 255; }
    g.putImageData(img, 0, 0); return c;
  }
  resize(); addEventListener('resize', resize);
  return { stub: true, renderer, camera, frame, screenToGround, worldToScreen, pick, resize, handleEvents() {}, minimapBase, dispose() { renderer.dispose(); removeEventListener('resize', resize); } };
}
function terrainColor(y) {
  if (y < 0.3) return [0.12, 0.2, 0.25];
  if (y < 2) return [0.22, 0.3, 0.2];
  if (y < 12) return [0.2 + y * 0.01, 0.34 - y * 0.006, 0.2];
  return [0.45, 0.42, 0.38];
}
