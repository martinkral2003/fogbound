// FOGBOUND: DOMINION client: territory border lines + faint ownership tint (view.showTerritory). Reads st.terr {N, C, H, owner:Int8Array, ver} from territory.js.
import * as THREE from 'three';

export function createTerritoryView(ctx) {
  const { scene, st, world } = ctx;
  const MAXS = 9000;
  const pos = new Float32Array(MAXS * 6), col = new Float32Array(MAXS * 6);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
  lines.frustumCulled = false; lines.renderOrder = 4; lines.visible = false; scene.add(lines);
  // tint: low-res texture on a terrain-shaped overlay is overkill; use a dim second line offset inward for a glow effect
  const g2 = new THREE.BufferGeometry(); const pos2 = new Float32Array(MAXS * 6), col2 = new Float32Array(MAXS * 6);
  g2.setAttribute('position', new THREE.BufferAttribute(pos2, 3).setUsage(THREE.DynamicDrawUsage)); g2.setAttribute('color', new THREE.BufferAttribute(col2, 3).setUsage(THREE.DynamicDrawUsage));
  const lines2 = new THREE.LineSegments(g2, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  lines2.frustumCulled = false; lines2.renderOrder = 4; lines2.visible = false; scene.add(lines2);
  let ver = -2, n = 0, lastLocal = -1;
  function rebuild() {
    const T = st.terr; if (!T) { n = 0; return; }
    const N = T.N, C = T.C, H = T.H, own = T.owner; n = 0;
    const seg = (x0, z0, x1, z1, tm, ix, iz) => {
      if (n >= MAXS) return;
      const c = ctx.teamCol[tm] || ctx.teamCol[0], o = n * 6, y0 = world.heightAt(x0, z0) + 0.4, y1 = world.heightAt(x1, z1) + 0.4;
      pos[o] = x0; pos[o + 1] = y0; pos[o + 2] = z0; pos[o + 3] = x1; pos[o + 4] = y1; pos[o + 5] = z1;
      for (let k = 0; k < 2; k++) { col[o + k * 3] = c.r; col[o + k * 3 + 1] = c.g; col[o + k * 3 + 2] = c.b; }
      pos2[o] = x0 + ix; pos2[o + 1] = y0 + 0.05; pos2[o + 2] = z0 + iz; pos2[o + 3] = x1 + ix; pos2[o + 4] = y1 + 0.05; pos2[o + 5] = z1 + iz;
      for (let k = 0; k < 2; k++) { col2[o + k * 3] = c.r; col2[o + k * 3 + 1] = c.g; col2[o + k * 3 + 2] = c.b; }
      n++;
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = own[j * N + i]; if (o < 0) continue;
      const x = i * C - H, z = j * C - H, ins = 0.8;
      if (i === 0 || own[j * N + i - 1] !== o) seg(x, z, x, z + C, o, ins, 0);
      if (i === N - 1 || own[j * N + i + 1] !== o) seg(x + C, z, x + C, z + C, o, -ins, 0);
      if (j === 0 || own[(j - 1) * N + i] !== o) seg(x, z, x + C, z, o, 0, ins);
      if (j === N - 1 || own[(j + 1) * N + i] !== o) seg(x, z + C, x + C, z + C, o, 0, -ins);
    }
    g.setDrawRange(0, n * 2); g2.setDrawRange(0, n * 2);
    for (const a of [g.attributes.position, g.attributes.color, g2.attributes.position, g2.attributes.color]) a.needsUpdate = true;
  }
  let acc = 9;
  function update(dt, view) {
    const on = !!view.showTerritory; lines.visible = lines2.visible = on;
    if (!on) return;
    acc += dt; const T = st.terr;
    if (T && (acc > 0.5) && (T.ver !== ver)) { acc = 0; ver = T.ver; rebuild(); }
  }
  return { update };
}
