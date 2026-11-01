// FOGBOUND: DOMINION client: fog of war. A coarse vision grid for the local team (units + buildings), a soft GPU mask texture that
// darkens terrain/props/buildings (see patchFog in models_rts.js), explored memory, and visibility queries used to hide enemies.
import * as THREE from 'three';
import { FOG_U } from './models_rts.js';

const N = 128, HALF = 200, CELL = (HALF * 2) / N;

export function createFog(ctx) {
  const st = ctx.st;
  const vis = new Uint8Array(N * N), seen = new Uint8Array(N * N), tgt = new Float32Array(N * N), disp = new Float32Array(N * N), data = new Uint8Array(N * N);
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  FOG_U.uFog.value = tex; FOG_U.uFogRect.value.set(-HALF, -HALF, 1 / (HALF * 2), 0);
  let on = true, acc = 1, tex_t = 0;
  const idx = (x, z) => { const i = Math.floor((x + HALF) / CELL), j = Math.floor((z + HALF) / CELL); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  function disc(x, z, rad) {
    const ci = (x + HALF) / CELL, cj = (z + HALF) / CELL, rc = rad / CELL + 1.5;
    const i0 = Math.max(0, Math.floor(ci - rc)), i1 = Math.min(N - 1, Math.ceil(ci + rc)), j0 = Math.max(0, Math.floor(cj - rc)), j1 = Math.min(N - 1, Math.ceil(cj + rc));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot((i + 0.5 - ci) * CELL, (j + 0.5 - cj) * CELL), v = Math.max(0, Math.min(1, (rad - d) / 5 + 0.0));
      if (v <= 0) continue;
      const k = j * N + i, q = Math.round(v * 255); if (q > vis[k]) vis[k] = q;
    }
  }
  function recompute() {
    vis.fill(0);
    const me = ctx.local;
    for (const u of st.ents) if (u.alive && u.team === me && !u.garrison) disc(u.x, u.z, u.vision || 20);
    for (const b of st.blds) if (b.team === me && b.state !== 'ruin' && b.state !== 'building') disc(b.x, b.z, Math.max(b.vision || 14, 8) + (b.h > 7 ? 4 : 0));
    // reveal sources contributed by the sim (watch-beacons etc.): team.reveal = [{x,z,r}]
    const t = st.teams[me]; if (t && Array.isArray(t.reveal)) for (const q of t.reveal) disc(q.x, q.z, q.r || 30);
    for (let i = 0; i < N * N; i++) { if (vis[i] > 140) seen[i] = 1; tgt[i] = vis[i] > 0 ? 0.55 + 0.45 * (vis[i] / 255) : seen[i] ? 0.5 : 0; }
  }
  function update(dt) {
    acc += dt;
    if (!on) return;
    if (acc >= 0.2) { acc = 0; recompute(); }
    tex_t += dt;
    if (tex_t >= 0.05) {
      const k = Math.min(1, tex_t * 9); tex_t = 0;
      for (let i = 0; i < N * N; i++) { disp[i] += (tgt[i] - disp[i]) * k; data[i] = Math.round(disp[i] * 255); }
      tex.needsUpdate = true;
    }
  }
  function setOn(v) {
    if (v === on) return; on = v;
    if (!on) { data.fill(255); disp.fill(1); tex.needsUpdate = true; } else { acc = 1; }
  }
  let mcv = null, mimg = null;
  function paintMinimap(g, size) { // draws the fog layer over a size x size minimap context (unexplored dark, explored dim)
    if (!on) return;
    if (!mcv) { mcv = document.createElement('canvas'); mcv.width = mcv.height = N; mimg = mcv.getContext('2d').createImageData(N, N); }
    const d = mimg.data;
    for (let i = 0; i < N * N; i++) { d[i * 4] = 6; d[i * 4 + 1] = 8; d[i * 4 + 2] = 12; d[i * 4 + 3] = Math.round((1 - disp[i]) * 235); }
    mcv.getContext('2d').putImageData(mimg, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(mcv, 0, 0, size, size);
  }
  return {
    update, setOn, paintMinimap, get on() { return on; }, tex,
    visible(x, z) { if (!on) return true; const i = idx(x, z); return i >= 0 && vis[i] > 110; },
    explored(x, z) { if (!on) return true; const i = idx(x, z); return i >= 0 && (seen[i] === 1 || vis[i] > 0); },
    vis, seen, N, HALF,
    forceUpdate() { if (!on) return; recompute(); disp.set(tgt); for (let i = 0; i < N * N; i++) data[i] = Math.round(disp[i] * 255); tex.needsUpdate = true; },
  };
}
