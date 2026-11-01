// FOGBOUND: DOMINION client: particles + event fx (sparks, death puffs, built dust, cast rings, explosions, fire, soul wisps, level-up, emitters).
import * as THREE from 'three';

const SCHOOL = { necromancy: 0x4fe3c1, warmagic: 0xff9a30, infernal: 0xff3a22, blood: 0xc43bd6 };
const DT_COL = { fire: 0xff8a30, dark: 0xb060ff, cold: 0x9fe0ff, lightning: 0xbfd8ff, poison: 0x9be048, physical: 0xffe8b0, siege: 0xffc070 };
const rnd = Math.random;

function makeParticles(scene, cap, additive) {
  const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 3), size = new Float32Array(cap), alpha = new Float32Array(cap);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('pcolor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 600 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
    vertexShader: 'attribute float size; attribute vec3 pcolor; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale; void main(){ vC=pcolor; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(size*scale/(-mv.z), 240.0); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-0.5)*2.0; float a=smoothstep(1.0,0.0,r); a*=a*vA; if(a<0.004) discard; gl_FragColor=vec4(vC,a); }',
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
  return { cap, n: 0, pos, col, size, alpha, vel: new Float32Array(cap * 3), life: new Float32Array(cap), max: new Float32Array(cap), grav: new Float32Array(cap), s0: new Float32Array(cap), a0: new Float32Array(cap), grow: new Float32Array(cap), g, mat, pts };
}
const _c = new THREE.Color();
function spawn(P, x, y, z, vx, vy, vz, life, size, color, grav = 0, a0 = 1, grow = 0) {
  if (P.n >= P.cap) return;
  const i = P.n++;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z; P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
  P.life[i] = life; P.max[i] = life; P.grav[i] = grav; P.s0[i] = size; P.a0[i] = a0; P.grow[i] = grow; _c.setHex(color); P.col[i * 3] = _c.r; P.col[i * 3 + 1] = _c.g; P.col[i * 3 + 2] = _c.b; P.size[i] = size; P.alpha[i] = a0;
}
function stepP(P, dt) {
  for (let i = P.n - 1; i >= 0; i--) {
    P.life[i] -= dt;
    if (P.life[i] <= 0) {
      const l = --P.n;
      if (i !== l) { for (let k = 0; k < 3; k++) { P.pos[i * 3 + k] = P.pos[l * 3 + k]; P.vel[i * 3 + k] = P.vel[l * 3 + k]; P.col[i * 3 + k] = P.col[l * 3 + k]; } P.life[i] = P.life[l]; P.max[i] = P.max[l]; P.grav[i] = P.grav[l]; P.s0[i] = P.s0[l]; P.a0[i] = P.a0[l]; P.grow[i] = P.grow[l]; P.size[i] = P.size[l]; P.alpha[i] = P.alpha[l]; }
      continue;
    }
    P.vel[i * 3 + 1] -= P.grav[i] * dt;
    P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
    const t = P.life[i] / P.max[i];
    P.alpha[i] = P.a0[i] * Math.min(1, t * 2.4) * Math.min(1, (1 - t) * 8 + 0.15); P.size[i] = P.s0[i] * (0.55 + 0.45 * t + P.grow[i] * (1 - t));
  }
  P.g.setDrawRange(0, P.n);
  for (const a of ['position', 'pcolor', 'size', 'alpha']) P.g.attributes[a].needsUpdate = true;
}

export function createFx(ctx) {
  const { scene, world, st, wv } = ctx;
  const glow = makeParticles(scene, 5000, true), smoke = makeParticles(scene, 2600, false);
  const fires = [], wisps = [], shots = [];
  const gy = (x, z) => world.heightAt(x, z);
  const lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xff9a40, 0, 26, 1.7); scene.add(l); return l; }), hot = [{ d: 1e9 }, { d: 1e9 }, { d: 1e9 }];
  function hotspot(x, y, z, col, s) { const c = ctx.camTarget, d = (x - c.x) ** 2 + (z - c.z) ** 2; for (let i = 0; i < 3; i++) if (d < hot[i].d) { for (let j = 2; j > i; j--) hot[j] = hot[j - 1]; hot[i] = { d, x, y, z, col, s }; break; } }

  function burst(x, y, z, n, speed, color, life = 0.6, size = 0.5, grav = 8) {
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, e = rnd() * 1.1, s = speed * (0.4 + rnd() * 0.8); spawn(glow, x, y, z, Math.cos(a) * s * Math.cos(e), Math.sin(e) * s + speed * 0.3, Math.sin(a) * s * Math.cos(e), life * (0.6 + rnd() * 0.6), size, color, grav); }
  }
  function puff(x, y, z, n, rad, color, size = 1.6, life = 1.4, up = 1.2) {
    for (let i = 0; i < n; i++) spawn(smoke, x + (rnd() - 0.5) * rad, y + rnd() * 0.4, z + (rnd() - 0.5) * rad, (rnd() - 0.5) * rad * 0.5, up * (0.5 + rnd()), (rnd() - 0.5) * rad * 0.5, life * (0.7 + rnd() * 0.6), size * (0.7 + rnd() * 0.6), color, -0.2, 0.5, 1.2);
  }
  function ring(x, z, r, color, dur = 0.6, thick = 1) { wv.ringFx(x, z, r, color, dur, 0.35, thick); }
  function emitter(kind, x, y, z, size, col, dt, seed) {
    const s = size || 1;
    if (kind === 'fire') {
      const c = col || 0xff8030, fl = 0.75 + 0.25 * Math.sin(ctx.time * 11 + seed * 1.7) + 0.1 * Math.sin(ctx.time * 23 + seed);
      spawn(glow, x, y + 0.1, z, 0, 0, 0, dt * 1.6 + 0.001, 2.6 * s * fl, c, 0, 0.3 * (0.75 + 0.9 * wv.night)); if (s >= 0.7) hotspot(x, y + 0.5, z, c, s * fl);
      if (rnd() < dt * 16 * s) spawn(glow, x + (rnd() - 0.5) * 0.2 * s, y, z + (rnd() - 0.5) * 0.2 * s, (rnd() - 0.5) * 0.3, 1.0 + rnd(), (rnd() - 0.5) * 0.3, 0.55, 0.5 * s, c, -0.5, 0.9);
      if (rnd() < dt * 2.5 * s) spawn(smoke, x, y + 0.6, z, (rnd() - 0.5) * 0.3, 1.0, (rnd() - 0.5) * 0.3, 1.6, 0.8 * s, 0x2a2a2a, -0.1, 0.35, 1.4);
    } else if (kind === 'smoke') { if (rnd() < dt * 3.5 * s) spawn(smoke, x + (rnd() - 0.5) * 0.4, y, z + (rnd() - 0.5) * 0.4, 0.3, 1.2 + rnd() * 0.6, 0.15, 2.8, 1.1 * s, col || 0x444444, -0.1, 0.45, 1.8); }
    else if (kind === 'glow') { spawn(glow, x, y, z, 0, 0, 0, dt * 1.6 + 0.001, 3.2 * s * (0.85 + 0.15 * Math.sin(ctx.time * 3 + seed)), col || 0x4fe3c1, 0, 0.32 * (0.75 + 0.9 * wv.night)); if (s >= 2) hotspot(x, y, z, col || 0x4fe3c1, 0.6); }
    else if (kind === 'soul') { if (rnd() < dt * 2.2) spawn(glow, x + (rnd() - 0.5) * 2, y, z + (rnd() - 0.5) * 2, (rnd() - 0.5) * 0.3, 0.9 + rnd() * 0.5, (rnd() - 0.5) * 0.3, 2.6, 0.45, col || 0x6fe8d0, -0.05, 0.8); }
    else if (kind === 'ember') { if (rnd() < dt * 4) spawn(glow, x + (rnd() - 0.5) * 3, y, z + (rnd() - 0.5) * 3, (rnd() - 0.5) * 0.6, 1.5 + rnd(), (rnd() - 0.5) * 0.6, 1.8, 0.25, col || 0xff6a20, -0.3, 0.9); }
  }
  function burn(x, y, z, w, d, h, k, dt, seed) { // burning / near-death building: flames + black smoke over the footprint
    const n = Math.ceil(dt * 22 * k * Math.min(3, 1 + w * d / 60));
    for (let i = 0; i < n; i++) {
      const px = x + (rnd() - 0.5) * w * 0.8, pz = z + (rnd() - 0.5) * d * 0.8, py = y + h * (0.35 + rnd() * 0.6);
      if (rnd() < 0.6) spawn(glow, px, py, pz, (rnd() - 0.5) * 0.4, 1.2 + rnd() * 1.4, (rnd() - 0.5) * 0.4, 0.7, 0.9 + rnd() * 0.8, rnd() < 0.5 ? 0xff7a20 : 0xffb040, -0.3, 0.85);
      else spawn(smoke, px, py + 0.5, pz, (rnd() - 0.5) * 0.3, 1.6 + rnd(), (rnd() - 0.5) * 0.3, 2.2, 1.2 + rnd(), 0x2a2a2a, -0.1, 0.32, 2);
    }
    if (rnd() < dt * 4) spawn(glow, x, y + h * 0.5, z, 0, 0, 0, dt * 1.6 + 0.001, Math.max(w, d) * 0.9, 0xff6a20, 0, 0.12 * k);
  }
  function dust(b, dt, prog) { if (rnd() < dt * 9) spawn(smoke, b.x + (rnd() - 0.5) * b.w, gy(b.x, b.z) + 0.2, b.z + (rnd() - 0.5) * b.d, (rnd() - 0.5) * 0.8, 0.5, (rnd() - 0.5) * 0.8, 1.2, 1.2, 0x8a7e6a, -0.1, 0.4, 1.5); if (rnd() < dt * 3) spawn(glow, b.x + (rnd() - 0.5) * b.w, gy(b.x, b.z) + 1 + rnd() * b.h * prog, b.z + (rnd() - 0.5) * b.d, 0, 0.6, 0, 0.4, 0.2, 0xffd890, 4, 0.8); }

  const seen = (x, z) => x === undefined || ctx.fog.visible(x, z);
  function handleEvents(events) {
    const n = events.length;
    for (let i = 0; i < n; i++) {
      const e = events[i];
      if ((e.type === 'hit' || e.type === 'heal' || e.type === 'death' || e.type === 'cast' || e.type === 'built' || e.type === 'collapse' || e.type === 'gather') && !seen(e.x, e.z)) continue;
      switch (e.type) {
        case 'hit': {
          if (!ctx.inView(e.x, gy(e.x, e.z), e.z, 8)) break;
          const tg = st.byId.get(e.tgt), isB = tg && tg.kind === 'bld', y = gy(e.x, e.z) + (isB ? Math.min(tg.h || 3, 3.5) * 0.6 : 1.1);
          const c = DT_COL[e.dtype] || 0xffe8b0, big = Math.min(2, Math.max(0.4, (e.amt || 10) / 40));
          burst(e.x + (rnd() - 0.5) * 0.4, y, e.z + (rnd() - 0.5) * 0.4, e.crit ? 9 : isB ? 6 : 4, 3 + big * 2, isB ? 0xd8c8a0 : c, 0.35, 0.28 * (e.crit ? 1.6 : 1));
          if (isB && (e.dtype === 'siege' || e.amt > 40)) { puff(e.x, y, e.z, 4, 1.4, 0x8a8070, 1.5, 1.2, 0.8); burst(e.x, y, e.z, 5, 5, 0x6a5a48, 0.8, 0.22, 14); }
          if (e.dtype === 'fire') burst(e.x, y, e.z, 3, 2, 0xff7a20, 0.5, 0.5, -1);
          if (e.dtype === 'dark') burst(e.x, y, e.z, 3, 2, 0x8a4aff, 0.5, 0.5, -1);
          break;
        }
        case 'death': {
          if (e.kind === 'bld') {
            const y = gy(e.x, e.z) + 1.5;
            puff(e.x, y, e.z, 26, 6, 0x6a6258, 3.4, 2.4, 2.2); puff(e.x, y + 2, e.z, 12, 4, 0x2a2826, 3, 3, 2.5); burst(e.x, y, e.z, 28, 11, 0xff9a40, 0.9, 0.7, 12); burst(e.x, y, e.z, 20, 9, 0x6a5a48, 1.4, 0.28, 18);
            wv.addShake(0.5); wv.addFlash(0.6, 0xff9a40, e.x, y + 3, e.z); ring(e.x, e.z, 9, 0xffc080, 0.7, 2);
            if (e.bld === 'keep') for (let k = 0; k < 4; k++) fires.push({ x: e.x + (rnd() - 0.5) * 8, z: e.z + (rnd() - 0.5) * 8, t: 14 });
          } else if (ctx.inView(e.x, gy(e.x, e.z), e.z, 6)) {
            const y = gy(e.x, e.z) + 0.8;
            puff(e.x, y, e.z, 5, 1.0, e.team === 2 ? 0x3a1a18 : 0x35352f, 1.5, 1.2, 0.9); burst(e.x, y, e.z, 4, 2.4, DT_COL.physical, 0.35, 0.2);
            if (wisps.length < 60) { let tx = 0, tz = 0, best = 3600; for (const b of st.blds) if (b.state === 'ready' && /soul|grave|cairn|altar|crypt/.test(b.type)) { const d = (b.x - e.x) ** 2 + (b.z - e.z) ** 2; if (d < best) { best = d; tx = b.x; tz = b.z; } } const L = 2.4 + rnd(), has = best < 3600; wisps.push({ x: e.x, y, z: e.z, t: 0, life: has ? 3.2 : L, col: ctx.teamHex[e.team] || 0x6fe8d0, vx: has ? (tx - e.x) / 3.2 : (rnd() - 0.5) * 0.6, vz: has ? (tz - e.z) / 3.2 : (rnd() - 0.5) * 0.6 }); }
          }
          break;
        }
        case 'built': { const b = st.byId.get(e.id); const w = b ? Math.max(b.w, b.d) : 5; puff(e.x, gy(e.x, e.z) + 0.5, e.z, 12, w, 0x9a8e78, 2.2, 1.6, 0.9); burst(e.x, gy(e.x, e.z) + 1, e.z, 12, 4, 0xffd890, 0.8, 0.3, 8); ring(e.x, e.z, w * 0.8, 0xffe0a0, 0.6); break; }
        case 'trained': { const u = st.byId.get(e.unit); if (u && ctx.fog.visible(u.x, u.z)) { ring(u.x, u.z, 1.8, ctx.teamHex[u.team] || 0xffffff, 0.5); burst(u.x, gy(u.x, u.z) + 0.5, u.z, 6, 2, ctx.teamHex[u.team] || 0xffffff, 0.5, 0.25, 0); } break; }
        case 'cast': {
          const c = st.byId.get(e.caster), tm = c ? st.teams[c.team] : null, col = (tm && SCHOOL[tm.faction.school]) || 0xc0a0ff;
          if (e.x !== undefined) { ring(e.x, e.z, 5, col, 0.8, 1.4); burst(e.x, gy(e.x, e.z) + 0.6, e.z, 12, 3.5, col, 0.9, 0.45, -1); }
          if (c) { ring(c.x, c.z, 2.2, col, 0.5); burst(c.x, gy(c.x, c.z) + 1.4, c.z, 8, 2, col, 0.6, 0.35, -2); }
          break;
        }
        case 'collapse': puff(e.x, gy(e.x, e.z) + 1.5, e.z, 18, 5, 0x7a7266, 3, 2.2, 1.6); burst(e.x, gy(e.x, e.z) + 2, e.z, 14, 6, 0x6a5a48, 1.1, 0.3, 14); wv.addShake(0.3); break;
        case 'heal': if (e.x !== undefined && ctx.inView(e.x, gy(e.x, e.z), e.z, 4)) for (let k = 0; k < 3; k++) spawn(glow, e.x + (rnd() - 0.5) * 0.8, gy(e.x, e.z) + 0.6, e.z + (rnd() - 0.5) * 0.8, 0, 1.4, 0, 0.8, 0.3, 0x70ff90, -0.2, 0.9); break;
        case 'fire': fires.push({ x: e.x, z: e.z, t: 6 + rnd() * 4 }); break;
        case 'levelup': { const u = st.byId.get(e.unit); if (u) { ring(u.x, u.z, 3, 0xffe070, 0.9, 1.6); wv.beamFx(u.x, u.z, 0xffe070, 1.0, 0.5, 9); burst(u.x, gy(u.x, u.z) + 1, u.z, 14, 3, 0xffe070, 1.0, 0.3, -1); } break; }
        case 'gather': { const u = st.byId.get(e.unit); if (u && ctx.inView(u.x, u.y || 0, u.z, 4)) burst(u.x, gy(u.x, u.z) + 0.9, u.z, 2, 1.6, e.res === 'gold' ? 0xffe070 : e.res === 'stone' ? 0xaaaaaa : e.res === 'timber' ? 0xb08a5a : e.res === 'souls' ? 0x6fe8d0 : 0xc02030, 0.35, 0.16); break; }
        default: break;
      }
    }
  }
  const fireT = { acc: 0 };
  function update(dt, t) {
    for (let i = fires.length - 1; i >= 0; i--) { const f = fires[i]; f.t -= dt; if (f.t <= 0) { fires.splice(i, 1); continue; } if (ctx.inView(f.x, gy(f.x, f.z), f.z, 6)) emitter('fire', f.x, gy(f.x, f.z) + 0.1, f.z, 1.6 * Math.min(1, f.t / 2), 0xff7a20, dt, i); }
    for (let i = wisps.length - 1; i >= 0; i--) {
      const w = wisps[i]; w.t += dt; if (w.t > w.life) { wisps.splice(i, 1); continue; }
      w.y += dt * (0.8 + w.t * 0.9); w.x += w.vx * dt + Math.sin(w.t * 3 + i) * dt * 0.5; w.z += w.vz * dt;
      spawn(glow, w.x, w.y, w.z, 0, 0, 0, 0.35, 0.5 * (1 - w.t / w.life * 0.5), w.col, 0, 0.7 * (1 - w.t / w.life));
    }
    stepP(glow, dt); stepP(smoke, dt);
    const nf = 0.3 + 1.2 * wv.night;
    for (let i = 0; i < 3; i++) { const h = hot[i], l = lights[i]; if (h.d < 1e8) { l.position.set(h.x, h.y + 0.6, h.z); l.color.setHex(h.col); l.intensity += ((1.4 * nf * Math.min(1.4, h.s) * 14) - l.intensity) * Math.min(1, dt * 8); } else l.intensity *= 0.8; hot[i] = { d: 1e9 }; }
  }
  function resize(scale) { glow.mat.uniforms.scale.value = scale; smoke.mat.uniforms.scale.value = scale; }
  return { update, handleEvents, emitter, burn, dust, burst, puff, ring, spawnGlow: (...a) => spawn(glow, ...a), spawnSmoke: (...a) => spawn(smoke, ...a), glow, smoke, resize, fires, wisps };
}
