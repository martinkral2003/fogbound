// World view: the world-only half of the Three.js presentation (terrain, water, props, mist, particles, sun/hemi light,
// day/night + biome fog, dread tint, camera shake). Used by render.js (warlord mode) and rpg/render.js (hero mode).
// No sim state in here: createWorldView(canvas, world, opts) then view.update(dt, focus, timeState) every frame.
import * as THREE from 'three';
import { WORLD, BIOME } from './data.js';
import * as MD from './models.js';
import { clamp, lerp, smoothstep, makeNoise, TAU } from './util.js';

const H = WORLD.half;
export const BIOME_COL = {
  [BIOME.MOOR]: 0x4e6445, [BIOME.HIGH]: 0x676c45, [BIOME.DEAD]: 0x5b5232, [BIOME.ABBEY]: 0x4e6060,
  [BIOME.TEMPLE]: 0x5a5f63, [BIOME.MIRE]: 0x2f5040, [BIOME.RIDGE]: 0x6e6048,
  [BIOME.ASH]: 0x4a4440, [BIOME.FROST]: 0x8a979c,
};

const LIGHT = {
  dawn:  { fog: 0x4c5963, hemiS: 0x7d8f9a, hemiG: 0x2c302e, hemiI: 1.0, dir: 0xffcfa0, dirI: 1.6 },
  day:   { fog: 0x62727a, hemiS: 0x94a8b2, hemiG: 0x3a3e3a, hemiI: 1.15, dir: 0xffe6c4, dirI: 2.1 },
  dusk:  { fog: 0x4a3f4e, hemiS: 0x7c6a86, hemiG: 0x2a2530, hemiI: 0.9, dir: 0xff9a62, dirI: 1.6 },
  night: { fog: 0x1d2b3a, hemiS: 0x5870a8, hemiG: 0x1a2030, hemiI: 1.55, dir: 0xa8bcf4, dirI: 1.4 },
};
const KEYS = [[0, 'dawn'], [0.07, 'day'], [0.46, 'day'], [0.56, 'dusk'], [0.66, 'night'], [0.86, 'night'], [0.95, 'dawn'], [1, 'dawn']];
const FOG_BIOME = { [BIOME.MIRE]: 2.1, [BIOME.MOOR]: 1.4, [BIOME.DEAD]: 1.25, [BIOME.ABBEY]: 1.3, [BIOME.HIGH]: 0.85, [BIOME.RIDGE]: 0.95, [BIOME.TEMPLE]: 1.5, [BIOME.ASH]: 1.35, [BIOME.FROST]: 1.15 };

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const keyPhase = (p) => {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [a, ka] = KEYS[i], [b, kb] = KEYS[i + 1];
    if (p >= a && p <= b) return [ka, kb, smoothstep(a, b, p)];
  }
  return ['day', 'day', 0];
};

export function createWorldView(canvas, world, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x62727a, 0.0095);
  scene.background = new THREE.Color(0x62727a);
  const camera = new THREE.PerspectiveCamera(opts.fov || 46, 1, opts.near || 0.6, opts.far || 700);

  const hemi = new THREE.HemisphereLight(0x94a8b2, 0x3a3e3a, 1.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6c4, 1.1); sun.position.set(-60, 90, -40); scene.add(sun); scene.add(sun.target);
  const heroLight = new THREE.PointLight(0xffc080, 1.5, 30, 1.6); scene.add(heroLight);
  const fxLight = new THREE.PointLight(0xffffff, 0, 40, 1.5); scene.add(fxLight);

  // ------------------------------------------------------------ terrain
  const noise = makeNoise(77);
  const SEG = WORLD.size, CHN = Math.max(1, Math.round(SEG / 20)), CQ = SEG / CHN; // 1 m quads in 20 m chunks (300 m map: 90k quads, 15 x 15 chunks); the index buffer is rebuilt per frame from the chunks inside the view frustum
  const terrainGeo = new THREE.BufferGeometry();
  const chunks = []; let visIdx = null, fullIdx = null, visAttr = null;
  {
    const n = SEG + 1, pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
    const c = new THREE.Color(), tmp = new THREE.Color(), tmp2 = new THREE.Color();
    const BK = 32, BW = Math.ceil(WORLD.size / BK) + 1, flatBk = Array.from({ length: BW * BW }, () => null);
    for (const f of world.flats) { const i0 = Math.max(0, Math.floor((f.x - f.r + H) / BK)), i1 = Math.min(BW - 1, Math.floor((f.x + f.r + H) / BK)), j0 = Math.max(0, Math.floor((f.z - f.r + H) / BK)), j1 = Math.min(BW - 1, Math.floor((f.z + f.r + H) / BK)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (flatBk[j * BW + i] ||= []).push(f); }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = (i / SEG) * WORLD.size - H, z = (j / SEG) * WORLD.size - H, k = j * n + i;
        const h = world.heightAt(x, z);
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        uv[k * 2] = i / SEG; uv[k * 2 + 1] = j / SEG;
        const b = world.biomeAt(x, z), sl = world.slopeAt(x, z);
        c.setHex(BIOME_COL[b]);
        const mot = noise.fbm(x * 0.09, z * 0.09, 3), mot2 = noise.fbm(x * 0.4 + 11, z * 0.4, 2), mot3 = noise.fbm(x * 0.025 + 70, z * 0.025, 3);
        c.multiplyScalar(0.92 + mot * 0.7 + (mot2 - 0.5) * 0.34);
        // big colour patches: lush / dry / bare ground
        if (b !== BIOME.TEMPLE && b !== BIOME.ASH && b !== BIOME.FROST) {
          if (mot3 > 0.58) c.lerp(tmp.setHex(0x6f8a4a), clamp((mot3 - 0.58) * 3, 0, 0.55));
          else if (mot3 < 0.38) c.lerp(tmp.setHex(0x7a6a48), clamp((0.38 - mot3) * 3, 0, 0.5));
        }
        if (b === BIOME.MOOR && mot > 0.55) c.lerp(tmp.setHex(0x6a5a78), (mot - 0.55) * 2); // heather
        if (b === BIOME.DEAD) c.lerp(tmp.setHex(0x4a4430), mot2 * 0.55);
        if (b === BIOME.HIGH) c.lerp(tmp.setHex(0x66705a), clamp((mot3 - 0.4) * 1.5, 0, 0.45));
        if (b === BIOME.ABBEY) c.lerp(tmp.setHex(0x5c6a60), clamp(mot2 * 0.6, 0, 0.5));
        if (b === BIOME.MIRE) c.lerp(tmp.setHex(0x22302c), clamp((1.4 - h) * 0.9, 0, 0.9));
        if (b === BIOME.ASH) c.lerp(tmp.setHex(0x2a2220), clamp(mot2 * 0.8, 0, 0.6)); // scorched ash and soot
        if (b === BIOME.FROST) c.lerp(tmp.setHex(0xc4d0d4), clamp(0.25 + (mot3 - 0.4) * 1.2, 0, 0.7)); // frost and old snow
        // cliffs: dark and light strata bands
        if (sl > 0.4) {
          const band = 0.5 + 0.5 * Math.sin(h * 2.4 + mot * 5);
          tmp.setHex(0x625f5a).lerp(tmp2.setHex(0x3f3d3c), band * 0.7);
          c.lerp(tmp, clamp((sl - 0.4) * 2.4, 0, 0.9));
        }
        // ambient occlusion from curvature: dark in hollows, lighter on crests
        const lap = (world.heightAt(x + 3, z) + world.heightAt(x - 3, z) + world.heightAt(x, z + 3) + world.heightAt(x, z - 3)) / 4 - h;
        c.multiplyScalar(1 + clamp(-lap * 0.22, -0.4, 0.22));
        // shore: sand, wet sand and a pale foam line at the waterline
        if (h < 1.3) c.lerp(tmp.setHex(0x8a846c), clamp((1.3 - h) * 0.75, 0, 0.85));
        if (h < 0.45) c.lerp(tmp.setHex(0x4a4a40), clamp((0.45 - h) * 2, 0, 0.6));
        if (h > -0.05 && h < 0.18) c.lerp(tmp.setHex(0xcfd8d0), 0.5 * (1 - Math.abs(h - 0.06) / 0.12));
        if (h < 0.3) c.lerp(tmp.setHex(0x2a3a3c), clamp((0.3 - h) * 0.5, 0, 0.8));
        const rd = world.roadDist(x, z); // packed-earth road: darker, paler centre line, soft verge
        if (rd < 3.0) c.lerp(tmp.setHex(rd < 1.2 ? 0x9a8660 : 0x7a6a4c), clamp((3.0 - rd) / 1.3, 0, 1) * (0.82 + mot2 * 0.3));
        for (const hh of world.hearts || []) { const d = Math.hypot(x - hh.x, z - hh.z); if (d < 22) c.lerp(tmp.setHex(0x625848), (1 - d / 22) * 0.85); }
        const fb = flatBk[Math.min(BW - 1, Math.max(0, Math.floor((z + H) / BK))) * BW + Math.min(BW - 1, Math.max(0, Math.floor((x + H) / BK)))];
        if (fb) for (const f of fb) { const d = Math.hypot(x - f.x, z - f.z); if (d < f.r) c.lerp(tmp.setHex(f.fort ? 0x6b665a : 0x615645), (1 - d / f.r) * (f.fort ? 0.5 : 0.55)); }
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
    }
    const idx = new Uint32Array(SEG * SEG * 6);
    let q = 0;
    for (let cj = 0; cj < CHN; cj++) for (let ci = 0; ci < CHN; ci++) {
      const start = q;
      let y0 = 1e9, y1 = -1e9;
      for (let j = cj * CQ; j < (cj + 1) * CQ; j++) for (let i = ci * CQ; i < (ci + 1) * CQ; i++) {
        const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
        idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e;
      }
      for (let j = cj * CQ; j <= (cj + 1) * CQ; j++) for (let i = ci * CQ; i <= (ci + 1) * CQ; i++) { const yy = pos[(j * n + i) * 3 + 1]; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      chunks.push({ start, count: q - start, box: new THREE.Box3(new THREE.Vector3(ci * CQ * (WORLD.size / SEG) - H, y0 - 1, cj * CQ * (WORLD.size / SEG) - H), new THREE.Vector3((ci + 1) * CQ * (WORLD.size / SEG) - H, y1 + 1, (cj + 1) * CQ * (WORLD.size / SEG) - H)) });
    }
    visIdx = new Uint32Array(idx.length); visIdx.set(idx); fullIdx = idx;
    visAttr = new THREE.BufferAttribute(visIdx, 1).setUsage(THREE.DynamicDrawUsage);
    terrainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    terrainGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    terrainGeo.setIndex(visAttr);
    terrainGeo.computeVertexNormals();
  }
  // tileable detail textures: fine speckle for the ground, soft ripples for the water
  function tileNoise(x, y, L) {
    const hs = (ix, iy) => { let hh = Math.imul((ix % L + L) % L, 374761393) ^ Math.imul((iy % L + L) % L, 668265263); hh = Math.imul(hh ^ (hh >>> 13), 1274126177); return ((hh ^ (hh >>> 16)) >>> 0) / 4294967296; };
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hs(ix, iy), b = hs(ix + 1, iy), cc = hs(ix, iy + 1), d = hs(ix + 1, iy + 1);
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  }
  function makeNoiseTexture(size, fn) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const cx = cv.getContext('2d'), img = cx.createImageData(size, size);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const v = Math.max(0, Math.min(255, fn(i / size, j / size) * 255)); const p = (j * size + i) * 4;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v; img.data[p + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  }
  const detailTex = makeNoiseTexture(256, (u, v) => 0.72 + 0.16 * tileNoise(u * 8, v * 8, 8) + 0.14 * tileNoise(u * 32, v * 32, 32) + 0.18 * tileNoise(u * 96, v * 96, 96) - 0.1);
  detailTex.repeat.set(WORLD.size / 5.7, WORLD.size / 5.7);
  const lastP = [0, 0];
  const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTex }));
  scene.add(terrain);
  // draw only the terrain chunks that touch the view frustum (rebuilt only when the camera moves); the influence overlay shares this geometry
  {
    const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), last = new Float32Array(16);
    terrainGeo.setDrawRange(0, fullIdx.length);
    terrain.onBeforeRender = (r, sc, cam) => {
      const me = cam.matrixWorld.elements, pe = cam.projectionMatrix.elements;
      let same = true;
      for (let i = 0; i < 16; i++) if (Math.abs(me[i] - last[i]) > 1e-4) { same = false; break; }
      if (same && last[15] === 1 && Math.abs(pe[5] - lastP[0]) < 1e-6 && Math.abs(pe[0] - lastP[1]) < 1e-6) return;
      for (let i = 0; i < 16; i++) last[i] = me[i];
      lastP[0] = pe[5]; lastP[1] = pe[0];
      pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
      let o = 0;
      for (const c of chunks) if (fr.intersectsBox(c.box)) { visIdx.set(fullIdx.subarray(c.start, c.start + c.count), o); o += c.count; }
      terrainGeo.setDrawRange(0, o);
      visAttr.clearUpdateRanges(); visAttr.addUpdateRange(0, o); visAttr.needsUpdate = true;
    };
  }

  const rippleTex = makeNoiseTexture(256, (u, v) => 0.62 + 0.3 * tileNoise(u * 6 + 3, v * 12, 6) * tileNoise(u * 14, v * 5 + 7, 14) * 2.2 + 0.12 * tileNoise(u * 40, v * 40, 40));
  rippleTex.repeat.set(WORLD.size * 1.8 / 8.5, WORLD.size * 1.8 / 8.5);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size * 1.8, WORLD.size * 1.8), new THREE.MeshPhongMaterial({ color: 0x24444f, specular: 0x6a8aa0, shininess: 80, transparent: true, opacity: 0.92, map: rippleTex }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.02; scene.add(water);

  // ------------------------------------------------------------ props
  {
    const groups = {};
    for (const p of world.props) (groups[p.t] ||= []).push(p);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), tint = new THREE.Color();
    for (const [t, list] of Object.entries(groups)) {
      if (!MD.PROP_GEOS[t]) continue;
      const im = new THREE.InstancedMesh(MD.PROP_GEOS[t](), MD.lambert(0xffffff, { vc: true, flat: true }), list.length);
      list.forEach((p, i) => {
        e.set((p.t === 'rock' || p.t === 'grave') ? (Math.sin(p.r * 7) * 0.12) : 0, p.r, 0); q.setFromEuler(e);
        const s = p.s; sc.set(s, s * (p.t === 'reed' ? 1 + Math.sin(p.r) * 0.2 : 1), s);
        ps.set(p.x, world.heightAt(p.x, p.z) - 0.08, p.z);
        m.compose(ps, q, sc); im.setMatrixAt(i, m);
        // per-instance tint so a field of grass or a forest never looks stamped
        const k1 = Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233)) , k2 = Math.abs(Math.sin(p.z * 39.346 + p.x * 11.135));
        const br = (t === 'flower' ? 0.92 : 0.75) + k1 * (t === 'flower' ? 0.2 : 0.5);
        tint.setRGB(br * (0.92 + k2 * 0.16), br, br * (0.9 + (1 - k2) * 0.16)); im.setColorAt(i, tint);
      });
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; scene.add(im);
    }
  }

  // ------------------------------------------------------------ mist
  const mistTex = MD.softTexture();
  const mists = [];
  for (let i = 0; i < (opts.mist ?? 70); i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: mistTex, color: 0x8a9aa2, transparent: true, opacity: 0.16, depthWrite: false, fog: false }));
    m.rotation.x = -Math.PI / 2;
    const s = 28 + Math.random() * 40; m.scale.set(s, s, 1);
    m.userData = { ox: (Math.random() - 0.5) * 220, oz: (Math.random() - 0.5) * 220, sp: 0.4 + Math.random() * 0.8, hh: 1.0 + Math.random() * 1.8, ph: Math.random() * 6, base: 0.09 + Math.random() * 0.1 };
    m.renderOrder = 2; scene.add(m); mists.push(m);
  }

  // ------------------------------------------------------------ particles
  function makeParticles(cap, additive) {
    const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 3), size = new Float32Array(cap), alpha = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute float size; attribute vec3 pcolor; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale; void main(){ vC=pcolor; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/(-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-0.5)*2.0; float a=smoothstep(1.0,0.2,r)*vA; if(a<0.01) discard; gl_FragColor=vec4(vC,a); }',
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
    const p = { cap, n: 0, pos, col, size, alpha, vel: new Float32Array(cap * 3), life: new Float32Array(cap), max: new Float32Array(cap), grav: new Float32Array(cap), s0: new Float32Array(cap), a0: new Float32Array(cap), g, mat, pts };
    return p;
  }
  const glowP = makeParticles(450, true), smokeP = makeParticles(160, false);
  const _pc = new THREE.Color();
  function spawn(P, x, y, z, vx, vy, vz, life, size, color, grav = 0, a0 = 1) {
    if (P.n >= P.cap) return;
    const i = P.n++;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    P.life[i] = life; P.max[i] = life; P.grav[i] = grav; P.s0[i] = size; P.a0[i] = a0;
    _pc.setHex(color); P.col[i * 3] = _pc.r; P.col[i * 3 + 1] = _pc.g; P.col[i * 3 + 2] = _pc.b;
    P.size[i] = size; P.alpha[i] = a0;
  }
  function updateParticles(P, dt) {
    for (let i = P.n - 1; i >= 0; i--) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        const l = --P.n;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { P.pos[i * 3 + k] = P.pos[l * 3 + k]; P.vel[i * 3 + k] = P.vel[l * 3 + k]; P.col[i * 3 + k] = P.col[l * 3 + k]; }
          P.life[i] = P.life[l]; P.max[i] = P.max[l]; P.grav[i] = P.grav[l]; P.s0[i] = P.s0[l]; P.a0[i] = P.a0[l]; P.size[i] = P.size[l]; P.alpha[i] = P.alpha[l];
        }
        continue;
      }
      P.vel[i * 3 + 1] -= P.grav[i] * dt;
      P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
      const t = P.life[i] / P.max[i];
      P.alpha[i] = P.a0[i] * Math.min(1, t * 2.2); P.size[i] = P.s0[i] * (0.5 + 0.5 * t + (P === smokeP ? (1 - t) * 1.2 : 0));
    }
    P.g.setDrawRange(0, P.n);
    for (const a of ['position', 'pcolor', 'size', 'alpha']) P.g.attributes[a].needsUpdate = true;
  }
  const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;
  function burst(x, y, z, n, speed, color, life = 0.6, size = 0.5, grav = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, e = Math.random() * 1.2, s = speed * (0.4 + Math.random() * 0.8);
      spawn(glowP, x, y, z, Math.cos(a) * s * Math.cos(e), Math.sin(e) * s + speed * 0.2, Math.sin(a) * s * Math.cos(e), life * (0.6 + Math.random() * 0.6), size, color, grav);
    }
  }

  const fxList = [];
  const flatQuad = new THREE.PlaneGeometry(1, 1);
  function addFx(obj, dur, update) { scene.add(obj); fxList.push({ obj, t: 0, dur, update }); }
  function ringFx(x, z, r, color, dur = 0.55, y = 0.3, thick = 1) {
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - 0.12 * thick, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, world.heightAt(x, z) + y, z);
    addFx(m, dur, (f, p) => { const e = 1 - Math.pow(1 - p, 3); f.obj.scale.setScalar(Math.max(0.01, r * e)); f.obj.material.opacity = 0.9 * (1 - p); });
    const d = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    d.rotation.x = -Math.PI / 2; d.position.set(x, world.heightAt(x, z) + y - 0.05, z);
    addFx(d, dur * 0.8, (f, p) => { f.obj.scale.setScalar(Math.max(0.01, r * (1 - Math.pow(1 - p, 2)))); f.obj.material.opacity = 0.4 * (1 - p); });
  }
  function beamFx(x, z, color, dur = 0.9, r = 1.1, hgt = 22) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt, 14, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x, world.heightAt(x, z) + hgt / 2, z);
    addFx(m, dur, (f, p) => { f.obj.material.opacity = 0.7 * (1 - p); f.obj.scale.x = f.obj.scale.z = 1 - p * 0.6; });
  }

  // ------------------------------------------------------------ per-frame
  let shake = 0, flash = 0, flashColor = 0xffffff, fogMul = 1, dreadMix = 0, night = 0, tAcc = 0, zone = null;
  const _fog = new THREE.Color();
  function applyLighting(dt, focus, ts) {
    const [ka, kb, t] = keyPhase(ts.phase || 0);
    const A = LIGHT[ka], B = LIGHT[kb];
    _c1.setHex(A.fog).lerp(_c2.setHex(B.fog), t);
    scene.fog.color.copy(_c1); scene.background.copy(_c1);
    hemi.color.setHex(A.hemiS).lerp(_c2.setHex(B.hemiS), t); hemi.groundColor.setHex(A.hemiG).lerp(_c2.setHex(B.hemiG), t); hemi.intensity = lerp(A.hemiI, B.hemiI, t);
    sun.color.setHex(A.dir).lerp(_c2.setHex(B.dir), t); sun.intensity = lerp(A.dirI, B.dirI, t);
    dreadMix += ((ts.dread ? +ts.dread : 0) - dreadMix) * Math.min(1, dt * 0.6);
    if (dreadMix > 0.002) {
      _c1.lerp(_c2.setHex(0x3a1018), dreadMix * 0.8); scene.fog.color.copy(_c1); scene.background.copy(_c1);
      hemi.color.lerp(_c2.setHex(0x9a4a50), dreadMix * 0.55); sun.color.lerp(_c2.setHex(0xff5a3a), dreadMix * 0.6);
    }
    night = (kb === 'night' ? t : ka === 'night' ? 1 - t : 0);
    const wantMul = FOG_BIOME[world.biomeAt(focus.x, focus.z)] || 1;
    fogMul += (wantMul - fogMul) * Math.min(1, dt * 0.8);
    // optional extra tint/density (hero mode: the Dread Fog zone)
    let dens = 0.0092 * fogMul * (1 + night * 0.55 + dreadMix * 0.35);
    if (ts.fogTint && ts.fogTint.amt > 0.001) { _c1.lerp(_fog.setHex(ts.fogTint.color), ts.fogTint.amt); scene.fog.color.copy(_c1); scene.background.copy(_c1); }
    if (ts.fogDensityMul) dens *= ts.fogDensityMul;
    scene.fog.density = dens;
    for (const m of mists) m.material.color.copy(_c1).multiplyScalar(1.35).addScalar(0.03);
  }
  function update(dt, focus, ts = {}) {
    tAcc += dt;
    const now = tAcc;
    applyLighting(dt, focus, ts);
    rippleTex.offset.set(now * 0.003, now * 0.002);
    sun.position.set(focus.x - 60, 90, focus.z - 40); sun.target.position.set(focus.x, 0, focus.z);
    flash = Math.max(0, flash - dt * 3);
    fxLight.intensity = flash * 6; fxLight.color.setHex(flashColor);
    shake = Math.max(0, shake - dt * 1.6);
    for (const m of mists) {
      const u = m.userData;
      u.ox += u.sp * dt;
      if (u.ox > 120) u.ox -= 240;
      const x = focus.x + u.ox, z = focus.z + u.oz + Math.sin(now * 0.07 + u.ph) * 4;
      m.position.set(x, world.heightAt(x, z) + u.hh + Math.sin(now * 0.3 + u.ph) * 0.25, z);
      m.material.opacity = u.base * fogMul * (ts.mistMul ?? 1) * (Math.abs(u.ox) > 95 ? (120 - Math.abs(u.ox)) / 25 : 1) * (world.heightAt(x, z) < 0.3 ? 0.5 : 1);
    }
    for (let i = fxList.length - 1; i >= 0; i--) {
      const f = fxList[i]; f.t += dt;
      const p = f.t / f.dur;
      if (p >= 1) { scene.remove(f.obj); f.obj.geometry && f.obj.geometry !== flatQuad && f.obj.geometry.dispose(); fxList.splice(i, 1); continue; }
      f.update(f, p);
    }
    updateParticles(glowP, dt); updateParticles(smokeP, dt);
  }
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const sc = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    glowP.mat.uniforms.scale.value = sc; smokeP.mat.uniforms.scale.value = sc;
  }
  resize();
  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  return {
    renderer, scene, camera, hemi, sun, heroLight, fxLight, terrain, terrainGeo, water, mists, glowP, smokeP, spawn, burst, rnd, flatQuad,
    addFx, ringFx, beamFx, update, resize,
    addShake(v) { shake = Math.max(shake, v); },
    addFlash(v, color, x, y, z) { flash = Math.max(flash, v); if (color !== undefined) flashColor = color; if (x !== undefined) fxLight.position.set(x, y, z); },
    setZone(z) { zone = z; },
    get zone() { return zone; },
    get shake() { return shake; }, get night() { return night; }, get fogMul() { return fogMul; }, get dreadMix() { return dreadMix; }, get time() { return tAcc; },
    dispose() { window.removeEventListener('resize', onResize); renderer.dispose(); },
  };
}
