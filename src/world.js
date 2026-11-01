// Deterministic island generator (MAP lane, v0.5). Pure data + functions; no Three.js.
// 300 x 300 m island for the co-op defence vs Demon Gates. The layout is authored ONCE in src/mapdata.js (design frame: demon gates NE, capital SW, start village W);
// the seed varies the noise, the ridge/lake outlines, small jitters of every site, the scatter of extra hills, and mirrors the whole design across the
// NE-SW diagonal (x,z) -> (-z,-x) for half of all seeds. Terrain = base relief + stamped ridges/lakes/plateaus (1 m tables), roads are A*-routed between the
// authored stops (front path first), sites are placed on suitable ground, then everything is baked into a 1 m height grid + walkability grid.
import { WORLD, BIOME, CAMP_TABLE } from './data.js';
import * as MD from './mapdata.js';
import { createNav, floodReach, cellOf } from './nav.js';
import { generateSites } from './sites.js';
import { makeNoise, mulberry32, smoothstep, clamp, lerp, TAU } from './util.js';

const T = MD.TERRAIN;
const H = WORLD.half, SZ = WORLD.size;
const GN = SZ + 1;              // fine grid, 1 m
const G2 = SZ / 2 + 1;          // base grid, 2 m
const DBG = typeof process !== 'undefined' && process.env && process.env.WORLDDBG;
const SEA = -3.2;
const START = (typeof process !== 'undefined' && process.env && +process.env.WORLDATTEMPT) || 0;
const FORCE = typeof process !== 'undefined' && process.env && !!process.env.WORLDFORCE;

const rad = (d) => d * Math.PI / 180;

export function generateWorld(seed = 1337) {
  let w = null;
  const ATT = 14;
  for (let attempt = START; attempt < ATT && !w; attempt++) w = buildWorld(seed, attempt, attempt === ATT - 1 || FORCE);
  w.sites = generateSites(w);
  return w;
}

function buildWorld(seed, attempt, final) {
  const N = makeNoise(seed);
  const T0 = performance.now(); const lap = (m) => { if (DBG) console.log('   t', m, (performance.now() - T0) | 0); };
  const rnd = mulberry32((seed ^ 0x9e3779b9) + attempt * 1013904223);
  const flip = mulberry32(seed * 2654435761 + 17)() < 0.5;   // handedness depends on the seed only, not on retries
  const Wp = flip ? (x, z) => [-z, -x] : (x, z) => [x, z];   // design frame <-> world frame (an involution)
  const WA = flip ? (a) => -90 - a : (a) => a;
  let bad = 0;
  const complain = (...a) => { bad++; if (DBG) console.log('  seed', seed, 'attempt', attempt, ...a); };
  const CR = T.crater, FT = T.fort;

  // ---- base relief on a 2 m table (zones are defined in the design frame) --------------------------------------------------------------------------
  const box = (x, z, x0, x1, z0, z1, s) => smoothstep(x0 - s, x0 + s, x) * smoothstep(x1 + s, x1 - s, x) * smoothstep(z0 - s, z0 + s, z) * smoothstep(z1 + s, z1 - s, z);
  function baseD(x, z) {
    const d = Math.pow(Math.pow(Math.abs(x) / H, 4) + Math.pow(Math.abs(z) / H, 4), 0.25);
    let h = 1.3 + 4.2 * N.fbm(x * 0.04, z * 0.04, 4);
    h += (N.fbm(x * 0.02 + 40, z * 0.02 + 40, 3) - 0.5) * 16 * smoothstep(0.08, 0.5, d);
    // demon lands: rough, broken ash country (the bowl inside the ring is calmed below)
    const wO = 1 - smoothstep(34, 100, Math.hypot(x - 104, z + 104));
    if (wO > 0.001) h += wO * (1.4 + 3.0 * (1 - Math.abs(N.fbm(x * 0.07 + 9, z * 0.07 + 9, 4) * 2 - 1)) + 1.4 * N.fbm(x * 0.11, z * 0.11, 3));
    // frozen north strip + east highlands: ridged noise
    const wF = box(x, z, -95, 40, -170, -98, 14);
    if (wF > 0.001) h += wF * (1.0 + 3.0 * (1 - Math.abs(N.fbm(x * 0.06 + 19, z * 0.06 + 9, 4) * 2 - 1)) + 1.5 * N.fbm(x * 0.09, z * 0.09, 3));
    const wE = box(x, z, 108, 170, -42, 40, 12);
    if (wE > 0.001) h += wE * (2.4 * (1 - Math.abs(N.fbm(x * 0.06 + 9, z * 0.06 + 29, 4) * 2 - 1)) + 1.4 * N.fbm(x * 0.09, z * 0.09, 3));
    // south strip: mire, low and wet
    const wM = box(x, z, -60, 50, 104, 170, 12);
    if (wM > 0.001) h = lerp(h, 1.0 + 0.7 * N.fbm(x * 0.12, z * 0.12, 3), wM);
    // abbey corner: gentle rolling
    const wA = 1 - smoothstep(30, 78, Math.hypot(x + 100, z + 100));
    if (wA > 0.001) h = lerp(h, 3.0 + 2.0 * N.fbm(x * 0.04 + 3, z * 0.04 + 3, 3), wA * 0.5);
    // heartland: gentle farmland, Oakvale's fields
    const wH = 1 - smoothstep(40, 100, Math.hypot(x + 80, z - 78));
    h = lerp(h, 2.7 + 1.2 * N.fbm(x * 0.05 + 5, z * 0.05 + 5, 3), wH * 0.9);
    const wV = 1 - smoothstep(24, 52, Math.hypot(x + 112, z + 8));
    h = lerp(h, 2.7 + 0.9 * N.fbm(x * 0.05 + 8, z * 0.05 + 8, 3), wV * 0.85);
    // every town sits on a calm patch of ground
    for (const t of MD.TOWNS) {
      const dd = Math.hypot(x - t.x, z - t.z);
      if (dd < t.r * 2.1) h = lerp(h, 2.9 + 0.7 * N.fbm(x * 0.05 + 21, z * 0.05 + 17, 2), (1 - smoothstep(t.r * 0.7, t.r * 2.1, dd)) * 0.92);
    }
    // fortress bowl: calm floor inside the Rampart ring (a little relief stays)
    for (const rp of T.ramparts) {
      const wB = 1 - smoothstep(rp.r - 40, rp.r - 6, Math.hypot(x - rp.x, z - rp.z));
      if (wB > 0.001) h = lerp(h, 2.6 + 1.1 * N.fbm(x * 0.05, z * 0.05, 3), wB * 0.85);
    }
    // centre: broad gentle plain
    const wC = 1 - smoothstep(24, 60, Math.hypot(x, z));
    h = lerp(h, 3.0 + 0.8 * N.fbm(x * 0.06, z * 0.06, 3), wC * 0.75);
    return h;
  }
  const baseG = new Float32Array(G2 * G2), warpG = new Float32Array(G2 * G2);
  for (let j = 0; j < G2; j++) {
    for (let i = 0; i < G2; i++) {
      const x = i * 2 - H, z = j * 2 - H, [dx, dz] = Wp(x, z), k = j * G2 + i;
      baseG[k] = baseD(dx, dz);
      warpG[k] = (N.fbm(dx * 0.026 + 50, dz * 0.026 + 50, 3) - 0.5) * 2 * T.edge.warp;
    }
  }
  function bil2(arr, x, z) {
    const fx = clamp((x + H) * 0.5, 0, G2 - 1.001), fz = clamp((z + H) * 0.5, 0, G2 - 1.001), i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, a = j * G2 + i;
    return arr[a] * (1 - tx) * (1 - tz) + arr[a + 1] * tx * (1 - tz) + arr[a + G2] * (1 - tx) * tz + arr[a + G2 + 1] * tx * tz;
  }
  function bil1(arr, x, z) {
    const fx = clamp(x + H, 0, GN - 1.001), fz = clamp(z + H, 0, GN - 1.001), i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, a = j * GN + i;
    return arr[a] * (1 - tx) * (1 - tz) + arr[a + 1] * tx * (1 - tz) + arr[a + GN] * (1 - tx) * tz + arr[a + GN + 1] * tx * tz;
  }
  const ridgeG = new Float32Array(GN * GN), lkW = new Float32Array(GN * GN), lkP = new Float32Array(GN * GN), fdW = new Float32Array(GN * GN), fdP = new Float32Array(GN * GN);
  lap('tables');

  // ---- designed ridges, rasterised into the ridge table -------------------------------------------------------------------------------------------
  const segDist = (px, pz, pts) => {
    let best = 1e9;
    for (let s = 0; s < pts.length - 1; s++) {
      const ax = pts[s][0], az = pts[s][1], dx = pts[s + 1][0] - ax, dz = pts[s + 1][1] - az;
      const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      const d = Math.hypot(px - ax - dx * t, pz - az - dz * t);
      if (d < best) best = d;
    }
    return best;
  };
  const ptsBox = (pts, m) => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return [Math.max(-H, Math.floor(x0 - m)), Math.min(H, Math.ceil(x1 + m)), Math.max(-H, Math.floor(z0 - m)), Math.min(H, Math.ceil(z1 + m))];
  };
  // kind: 'mesa' (plateau profile), 'mountain', 'dome'
  function stampRidge(pts, w, h, flat, kind = 'mesa') {
    const [x0, x1, z0, z1] = ptsBox(pts, w + 12);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const k = (z + H) * GN + (x + H);
        const d = segDist(x + (N.fbm(x * 0.05 + 11, z * 0.05 + 5, 2) - 0.5) * 8, z + (N.fbm(x * 0.05 + 31, z * 0.05 + 47, 2) - 0.5) * 8, pts);
        if (d >= w) continue;
        const t = d / w;
        let hh;
        if (kind === 'mountain') {
          const u = 1 - t * t, rg = 1 - Math.abs(N.fbm(x * 0.09 + 5, z * 0.09 + 9, 3) * 2 - 1);
          hh = h * u * u * (0.62 + 0.62 * rg);
        } else if (kind === 'dome') {
          const u = 1 - t * t;
          hh = h * u * u * (0.8 + 0.4 * N.fbm(x * 0.08, z * 0.08, 2));
        } else {
          hh = (1 - smoothstep(flat, 1, t)) * (h * (0.84 + 0.32 * N.fbm(x * 0.1 + 3, z * 0.1 + 8, 2)) + 1.0 * (N.fbm(x * 0.2, z * 0.2, 2) - 0.5));
        }
        if (hh > ridgeG[k]) ridgeG[k] = hh;
      }
    }
  }
  const offsetLine = (pts, off) => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] - dz / l * off, p[1] + dx / l * off];
  });
  const polyW = (pts) => pts.map(([x, z]) => Wp(x, z));
  // Rampart rings (orc fortress, capital): arcs with three passes
  const ramps = []; // {id, cx, cz (world), r, passes:[[x,z]], angles}
  for (const RP of T.ramparts) {
    const rampR = RP.r + (rnd() - 0.5) * 6;
    const passes = RP.passes.map((a) => a + (rnd() - 0.5) * 4);
    const arcAt = (a, r) => Wp(RP.x + Math.cos(rad(a)) * r, RP.z + Math.sin(rad(a)) * r);
    const wr = mulberry32(seed ^ 0x5bd1e995 ^ (RP.id === 'demon' ? 0 : 0x777));
    const woff = wr() * 100;
    const edges = [RP.from, ...passes.flatMap((p) => [p - RP.gap, p + RP.gap]), RP.to];
    for (let s = 0; s < edges.length; s += 2) {
      const a0 = edges[s], a1 = edges[s + 1], pts = [];
      const n = Math.max(2, Math.ceil((a1 - a0) / 2));
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n;
        pts.push(arcAt(a, rampR + (N.fbm(a * 0.06 + woff, 3.3, 2) - 0.5) * 2 * RP.wobble));
      }
      stampRidge(pts, RP.w, RP.h, RP.flat);
    }
    // the two ends run straight out into the sea so no shore strip leads round the back
    for (const a of [RP.from, RP.to]) stampRidge([arcAt(a, rampR), arcAt(a, rampR + 18), arcAt(a, rampR + 44)], RP.w, RP.h, 0.6);
    const [cx, cz] = Wp(RP.x, RP.z);
    ramps.push({ id: RP.id, cx, cz, r: rampR, passes: passes.map((a) => arcAt(a, rampR)), passAng: passes.map((a) => WA(a)) });
  }
  for (const c of T.canyons) {
    const mid = polyW(c.pts);
    stampRidge(offsetLine(mid, c.gap), c.w, c.h, 0.3);
    stampRidge(offsetLine(mid, -c.gap), c.w, c.h, 0.3);
  }
  for (const r of T.ridges) stampRidge(polyW(r.pts), r.w, r.h, r.flat);
  {  // crater ring around the centre (C4-symmetric formula)
    const gapRad = rad(CR.gapDeg), R = Math.ceil(CR.r + CR.w + 2);
    for (let z = -R; z <= R; z++) {
      for (let x = -R; x <= R; x++) {
        const r = Math.hypot(x, z), t = Math.abs(r - CR.r) / CR.w;
        if (t >= 1) continue;
        let g = 1e9;
        const ang = Math.atan2(z, x);
        for (let q = 0; q < 4; q++) { let da = ang - (-3 * Math.PI / 4 + q * Math.PI / 2); da = Math.atan2(Math.sin(da), Math.cos(da)); g = Math.min(g, Math.abs(da)); }
        const gap = 1 - smoothstep(gapRad * 0.7, gapRad * 1.35, g);
        const k = (z + H) * GN + (x + H);
        const hh = CR.h * (1 - smoothstep(0.3, 1, t)) * (0.85 + 0.3 * N.fbm(x * 0.06, z * 0.06, 2)) * (1 - gap);
        if (hh > ridgeG[k]) ridgeG[k] = hh;
      }
    }
  }

  // ---- stops of the road network + scatter keep-outs (all authored points, world frame) ----------------------------------------------------------
  const townsW = MD.TOWNS.map((t) => { const [x, z] = Wp(t.x, t.z); return { ...t, x, z }; });
  const townBy = {}; for (const t of townsW) townBy[t.key] = t;
  // Demon Gates: 6 m inside each ring pass (world frame); the Lord stands on the plateau
  const demonRing = ramps.find((r) => r.id === 'demon'), demonRP = T.ramparts.find((r) => r.id === 'demon');
  const gatesW = MD.DEMON.gates.map((g) => {
    const pi = Math.max(0, demonRP.passes.indexOf(g.ang)), p = demonRing.passes[pi];
    const dx = demonRing.cx - p[0], dz = demonRing.cz - p[1], l = Math.hypot(dx, dz) || 1;   // unit vector pass -> ring centre (into the bowl)
    return { key: g.key, tier: g.tier, main: g.key === 'main', x: p[0] + dx / l * MD.DEMON.inset, z: p[1] + dz / l * MD.DEMON.inset, pass: { x: p[0], z: p[1] }, ox: -dx / l, oz: -dz / l };
  });
  const gateBy = {}; for (const g of gatesW) gateBy[g.key] = g;
  const lordW = { pos: Wp(...MD.DEMON.lord) };
  const stopXY = (s) => {
    if (typeof s !== 'string') return Wp(s[0], s[1]);
    if (townBy[s]) return [townBy[s].x, townBy[s].z];
    if (s.startsWith('gate:')) return [gateBy[s.slice(5)].x, gateBy[s.slice(5)].z];
    return lordW.pos;
  };
  const arteries = [];   // straight stop-to-stop segments (world frame), kept clear of big landforms
  for (const chain of [MD.FRONT, ...MD.ROADS]) for (let i = 0; i < chain.length - 1; i++) arteries.push([stopXY(chain[i]), stopXY(chain[i + 1])]);
  {
    const mr = mulberry32((seed ^ 0x7a31c3) + attempt * 0x9e3779b1);
    const keepOut = []; // [x, z, r] world frame
    const ko = (x, z, r) => { const [wx, wz] = Wp(x, z); keepOut.push([wx, wz, r]); };
    for (const t of MD.TOWNS) ko(t.x, t.z, t.r + 12);
    for (const c of MD.CAMPS) ko(c[0], c[1], 12);
    for (const c of MD.DEMON.camps) ko(c.x, c.z, 14);
    for (const g of gatesW) keepOut.push([g.x, g.z, 22]);
    for (const c of MD.CHESTS) ko(c[0], c[1], 8);
    for (const c of MD.DUNGEONS) ko(c[0], c[1], 12);
    for (const c of MD.LAIRS) ko(c[0], c[1], 10);
    for (const c of MD.POIS) ko(c[1], c[2], 8);
    for (const c of MD.WAYSTONES) ko(c[0], c[1], 6);
    for (const c of MD.SHRINES) ko(c[0], c[1], 6);
    for (const lk of T.lakes) ko(lk.x, lk.z, Math.max(lk.rx, lk.rz) + 6);
    keepOut.push([...Wp(0, 0), 34]);
    for (const rp of T.ramparts) keepOut.push([...Wp(rp.x, rp.z), rp.r + 8]);
    const walls = T.canyons.map((c) => polyW(c.pts));
    const [hx, hz] = Wp(-80, 80);
    const mass = [];
    const ok = (m) => {
      const len = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]), n = Math.max(1, Math.ceil(len / 4));
      for (let i = 0; i <= n; i++) {
        const px = m.a[0] + (m.b[0] - m.a[0]) * i / n, pz = m.a[1] + (m.b[1] - m.a[1]) * i / n;
        if (Math.pow(Math.pow(Math.abs(px) / H, 4) + Math.pow(Math.abs(pz) / H, 4), 0.25) > 0.9 - m.w / 170) return false;
        for (const [x, z, r] of keepOut) if (Math.hypot(px - x, pz - z) < r + m.w * (m.type === 'mesa' ? 0.8 : 0.35)) return false;
        for (const [a, b] of arteries) if (segDist(px, pz, [a, b]) < (m.type === 'mesa' ? m.w * 0.9 + 7 : m.w * 0.3 + 5)) return false;
        for (const wl of walls) if (segDist(px, pz, wl) < 18 + m.w) return false;
        if (m.type !== 'dome' && Math.hypot(px - hx, pz - hz) < 70) return false;   // the heartland stays gentle (low domes only)
        for (const o of mass) if (segDist(px, pz, [o.a, o.b]) < (m.w + o.w) * (m.type === 'mountain' || o.type === 'mountain' ? 0.6 : 0.85)) return false;
      }
      return true;
    };
    const kinds = [
      { type: 'mountain', n: T.scatter.mountains, len: () => 4 + mr() * 8, w: () => 10 + mr() * 4, flat: () => 0, h: () => 8 + mr() * 3 },
      { type: 'mesa', n: T.scatter.mesas, len: () => 3 + mr() * 7, w: () => 6 + mr() * 2.5, flat: () => 0.3 + mr() * 0.2, h: () => 5 + mr() * 3 },
      { type: 'dome', n: T.scatter.domes, len: () => 3 + mr() * 6, w: () => 9 + mr() * 5, flat: () => 0.05, h: () => 3 + mr() * 2.5 },
    ];
    for (const kd of kinds) {
      let cnt = 0;
      for (let tries = 0; tries < 6000 && cnt < kd.n; tries++) {
        const cx = (mr() * 2 - 1) * H * 0.84, cz = (mr() * 2 - 1) * H * 0.84, ang = mr() * Math.PI, len = kd.len(), w = kd.w();
        const m = { type: kd.type, a: [cx - Math.cos(ang) * len / 2, cz - Math.sin(ang) * len / 2], b: [cx + Math.cos(ang) * len / 2, cz + Math.sin(ang) * len / 2], w, flat: kd.flat(), h: kd.h() };
        if (m.type === 'dome' && Math.hypot(cx - hx, cz - hz) < 70) m.h = 1.6 + mr() * 1.6;
        if (ok(m)) { mass.push(m); cnt++; }
      }
    }
    for (const m of mass) stampRidge([m.a, m.b], m.w, m.h, m.flat, m.type);
  }
  lap('ridges+scatter');

  // ---- lakes and fords ----------------------------------------------------------------------------------------------------------------------------------
  for (const lk of T.lakes) {
    const [cx, cz] = Wp(lk.x, lk.z), th = rad(WA(lk.ang)), co = Math.cos(th), si = Math.sin(th);
    const rx = lk.rx * (0.9 + rnd() * 0.25), rz = lk.rz * (0.9 + rnd() * 0.25), R = Math.max(rx, rz) * 1.4 + 6;
    const [x0, x1, z0, z1] = ptsBox([[cx - R, cz - R], [cx + R, cz + R]], 0);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const u = (x - cx) * co + (z - cz) * si, v = -(x - cx) * si + (z - cz) * co;
        const e = Math.hypot(u / rx, v / rz) * (1 + 0.16 * (N.fbm(x * 0.09 + 7, z * 0.09 + 7, 2) - 0.5) * 2);
        const w = 1 - smoothstep(0.78, 1.2, e), k = (z + H) * GN + (x + H);
        if (w > lkW[k]) { lkW[k] = w; lkP[k] = w * lk.d; }
      }
    }
    for (const fd of lk.fords || []) {
      const a = Wp(fd.a[0], fd.a[1]), b = Wp(fd.b[0], fd.b[1]), pts = [a, b];
      const [fx0, fx1, fz0, fz1] = ptsBox(pts, fd.w + 2);
      for (let z = fz0; z <= fz1; z++) {
        for (let x = fx0; x <= fx1; x++) {
          const k = (z + H) * GN + (x + H), w = 1 - smoothstep(fd.w * 0.5, fd.w, segDist(x, z, pts));
          if (w > fdW[k]) { fdW[k] = w; fdP[k] = w * fd.lv; }
        }
      }
    }
  }
  lap('lakes');

  // ---- terrain ------------------------------------------------------------------------------------------------------------------------------------------
  function terrainBase(x, z) {
    let h = bil2(baseG, x, z) + bil1(ridgeG, x, z);
    const lw = bil1(lkW, x, z);
    if (lw > 1e-4) h = h * (1 - lw) + bil1(lkP, x, z);
    const fw = bil1(fdW, x, z);
    if (fw > 1e-3) h = h * (1 - fw) + Math.max(h, bil1(fdP, x, z) / fw) * fw;
    const r2 = x * x + z * z;
    if (r2 < (CR.floorR + 10) * (CR.floorR + 10)) { const r = Math.sqrt(r2); h = lerp(h, CR.floor, 1 - smoothstep(CR.floorR - 6, CR.floorR + 8, r)); }
    return h;
  }
  const citCentres = T.citadels.map((c) => ({ ...c, wc: Wp(c.x, c.z) }));
  const landAt = (x, z) => {
    const q = Math.pow(x / H, 4) + Math.pow(z / H, 4);
    let ld = q < 0.45 ? 1 : smoothstep(T.edge.r + T.edge.soft, T.edge.r - T.edge.soft, Math.pow(q, 0.25) + bil2(warpG, x, z));
    if (ld < 1) for (const c of citCentres) ld = Math.max(ld, 1 - smoothstep(c.r + 4, c.r + 16, Math.hypot(x - c.wc[0], z - c.wc[1])));
    return ld;
  };
  // plateaus: flat top, cliff rim, graded ramps. The top stands `rise` above the surrounding ground.
  const hills = citCentres.map((c) => {
    const [cx, cz] = c.wc;
    let sum = 0, n = 0;
    for (const r of [c.r + c.skirt + 4, c.r + c.skirt + 12]) for (let k = 0; k < 12; k++) { sum += terrainBase(cx + Math.cos(k * 0.5236) * r, cz + Math.sin(k * 0.5236) * r); n++; }
    const top = sum / n + c.rise;
    const rampsL = c.ramps.map((deg) => {
      const a = rad(WA(deg)), dx = Math.cos(a), dz = Math.sin(a);
      let L = 10, foot = 2;
      for (let it = 0; it < 6; it++) { foot = terrainBase(cx + dx * (c.r + L), cz + dz * (c.r + L)); L = clamp((top - foot) / 0.42, 8, 26); }
      return { dx, dz, L, foot };
    });
    const far = c.r + c.skirt + Math.max(0, ...rampsL.map((r) => r.L)) + 12;
    return { id: c.id, cx, cz, r: c.r, skirt: c.skirt, rampW: c.rampW, top, ramps: rampsL, far2: far * far };
  });
  function terrainRaw(x, z) {
    let h = terrainBase(x, z);
    for (const c of hills) {
      const dx = x - c.cx, dz = z - c.cz, d2 = dx * dx + dz * dz;
      if (d2 > c.far2) continue;
      const d = Math.sqrt(d2);
      h = lerp(h, c.top, 1 - smoothstep(c.r, c.r + c.skirt, d));
      for (const r of c.ramps) {
        const s = dx * r.dx + dz * r.dz;
        if (s < 0 || s > c.r + r.L + 8) continue;
        const u = Math.abs(dz * r.dx - dx * r.dz), u0 = c.rampW * 0.6;
        if (u > u0 + 4.5) continue;
        const hr = lerp(c.top, r.foot, clamp((s - c.r) / r.L, 0, 1));
        h = lerp(h, hr, (1 - smoothstep(u0, u0 + 4.5, u)) * (1 - smoothstep(c.r + r.L, c.r + r.L + 8, s)) * smoothstep(0, 4, s));
      }
    }
    return h;
  }

  // ---- road grid ------------------------------------------------------------------------------------------------------------------------------------------
  const RW = 6;
  const roadD = new Float32Array(GN * GN).fill(RW + 2), roadHt = new Float32Array(GN * GN);
  const roadPolys = [];
  function spline(pts, step = 2) {
    const out = [], P = [pts[0], ...pts, pts[pts.length - 1]];
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
      const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function addRoad(pts, main) {
    const ds = 2, n = pts.length;
    let g = pts.map((p) => Math.max(1.5, terrainRaw(p[0], p[1])));
    for (let pass = 0; pass < 4; pass++) g = g.map((_, i) => { const a = (k) => g[clamp(i + k, 0, n - 1)]; return (a(-2) + 2 * a(-1) + 3 * a(0) + 2 * a(1) + a(2)) / 9; });
    const gm = 0.4 * ds;
    for (let i = 1; i < n; i++) g[i] = clamp(g[i], g[i - 1] - gm, g[i - 1] + gm);
    for (let i = n - 2; i >= 0; i--) g[i] = clamp(g[i], g[i + 1] - gm, g[i + 1] + gm);
    const pl = { pts, hts: g, main: !!main };
    roadPolys.push(pl);
    stampRoad(pl);
    return pl;
  }
  function stampRoad(pl) {
    for (let s = 0; s < pl.pts.length - 1; s++) {
      const [ax, az] = pl.pts[s], [bx, bz] = pl.pts[s + 1], ah = pl.hts[s], bh = pl.hts[s + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - RW + H)), i1 = Math.min(GN - 1, Math.ceil(Math.max(ax, bx) + RW + H));
      const j0 = Math.max(0, Math.floor(Math.min(az, bz) - RW + H)), j1 = Math.min(GN - 1, Math.ceil(Math.max(az, bz) + RW + H));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = i - H, pz = j - H, t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
        const d = Math.hypot(px - ax - dx * t, pz - az - dz * t), k = j * GN + i;
        if (d < roadD[k]) { roadD[k] = d; roadHt[k] = ah + (bh - ah) * t; }
      }
    }
  }
  const carveR = T.roadHalf + T.roadShoulder;
  function carve(x, z, h) {
    const i = Math.round(x + H), j = Math.round(z + H);
    if (i < 0 || j < 0 || i >= GN || j >= GN) return h;
    const d = roadD[j * GN + i];
    if (d >= carveR) return h;
    return lerp(h, roadHt[j * GN + i], 1 - smoothstep(T.roadHalf, carveR, d));
  }
  function roadDistAt(x, z) {
    const fx = clamp(x + H, 0, GN - 1.001), fz = clamp(z + H, 0, GN - 1.001), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = roadD[j * GN + i], b = roadD[j * GN + i + 1], c = roadD[(j + 1) * GN + i], d = roadD[(j + 1) * GN + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
  function nearestOnMain(x, z) {
    let best = null, bd = 1e9;
    for (const pl of roadPolys) { if (!pl.main) continue; for (const p of pl.pts) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; best = p; } } }
    return best ? { x: best[0], z: best[1], d: bd } : null;
  }
  const baseHeight = (x, z) => lerp(SEA, carve(x, z, terrainRaw(x, z)), landAt(x, z));

  // ---- coarse reachability of the bare terrain (2 m cells) -----------------------------------------------------------------------------------------
  const RC = 2, RCN = SZ / RC, W1 = RCN + 1;
  function grid2(fill) { const g = new Float32Array(W1 * W1); for (let j = 0; j < W1; j++) for (let i = 0; i < W1; i++) g[j * W1 + i] = fill(i * RC - H, j * RC - H); return g; }
  function flood(hh, fromX, fromZ, minH) {
    const seen = new Uint8Array(RCN * RCN), ok = new Uint8Array(RCN * RCN);
    for (let j = 1; j < RCN - 1; j++) for (let i = 1; i < RCN - 1; i++) ok[j * RCN + i] = hh[j * W1 + i] > minH && Math.hypot(hh[j * W1 + i + 1] - hh[j * W1 + i - 1], hh[(j + 1) * W1 + i] - hh[(j - 1) * W1 + i]) / (2 * RC) < 0.8 ? 1 : 0;
    const st = [Math.floor((fromZ + H) / RC) * RCN + Math.floor((fromX + H) / RC)];
    seen[st[0]] = 1;
    while (st.length) {
      const c = st.pop(), ci = c % RCN, cj = (c / RCN) | 0;
      for (let d = 0; d < 4; d++) {
        const ni = ci + (d === 0 ? 1 : d === 1 ? -1 : 0), nj = cj + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= RCN || nj >= RCN) continue;
        const nb = nj * RCN + ni;
        if (seen[nb] || !ok[nb]) continue;
        seen[nb] = 1; st.push(nb);
      }
    }
    return seen;
  }
  const rawGrid = grid2(baseHeight);
  lap('raw grid');

  // ---- sites: placement helpers ------------------------------------------------------------------------------------------------------------------------
  const taken = []; // [x, z, r]: exclusion radius of every placed site. A candidate of radius rc needs distance >= r + rc.
  const clear = (x, z, sep) => { for (const t of taken) { const lim = t[2] + sep; if (Math.abs(t[0] - x) < lim && Math.abs(t[1] - z) < lim && Math.hypot(t[0] - x, t[1] - z) < lim) return false; } return true; };
  const slopeBase = (x, z) => Math.hypot(baseHeight(x + 2, z) - baseHeight(x - 2, z), baseHeight(x, z + 2) - baseHeight(x, z - 2)) / 4;
  const ridgeAt = (x, z) => bil1(ridgeG, x, z);
  // flat ground suitable for a settlement of radius R: gentle ring heights, no water, no steep slopes, not on a ridge
  function townTest(R, tol, skip) {
    return (x, z) => {
      const h = baseHeight(x, z);
      if (h < 1.7 || h > 14 || landAt(x, z) < 0.999 || ridgeAt(x, z) > 1.2) return false;
      for (let k = 0; k < 16; k++) {
        const a = k * TAU / 16;
        for (const f of [0.55, 1.0]) {
          const px = x + Math.cos(a) * R * f, pz = z + Math.sin(a) * R * f;
          if (skip && skip(px, pz)) continue;
          const hh = baseHeight(px, pz);
          if (hh < 1.2 || Math.abs(hh - h) > tol || ridgeAt(px, pz) > 2.2 || slopeBase(px, pz) > 0.4) return false;
        }
      }
      return slopeBase(x, z) < 0.25;
    };
  }
  function nudgeTo(x, z, sep, test, maxR = 66, step = 3) {
    if (test(x, z) && clear(x, z, sep)) return [x, z];
    for (let rr = step; rr <= maxR; rr += step) {
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * TAU + rr * 0.37, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        if (test(px, pz) && clear(px, pz, sep)) return [px, pz];
      }
    }
    return null;
  }
  const jit = (x, z, amt) => [x + (rnd() - 0.5) * 2 * amt, z + (rnd() - 0.5) * 2 * amt];

  // ---- towns (flat ground), the capital first: its position seeds the reachability flood ---------------------------------------------------------
  const flats = []; // world frame {x, z, r, h, town?}
  const spots = { towns: [], demon: { camps: [] }, camps: [], chests: [], shrines: [], dungeons: [], lairs: [], pois: [], waystones: [], heroSpawns: [], centre: {} };
  const capCit = hills.find((h) => h.id === 'capital');
  const nearCit = (px, pz) => { for (const c of hills) if (Math.hypot(px - c.cx, pz - c.cz) < c.r + c.skirt + 6) return true; return false; };
  const townOrder = [...townsW].sort((a, b) => (b.kind === 'capital') - (a.kind === 'capital'));
  for (const t of townOrder) {
    const R = t.kind === 'capital' ? t.r - 2 : t.r, tol = t.kind === 'capital' ? 3.2 : t.kind === 'town' ? 2.6 : 2.4;
    const [jx, jz] = t.kind === 'capital' ? [t.x, t.z] : jit(t.x, t.z, 4);   // the capital sits exactly on its citadel plateau
    const p = nudgeTo(jx, jz, 8, townTest(R, tol, t.kind === 'capital' ? nearCit : null), 30, 3);
    if (!p) { complain('no flat site for town', t.key); continue; }
    t.x = p[0]; t.z = p[1];
    t.h = clamp(baseHeight(p[0], p[1]), 1.8, 14);
    taken.push([p[0], p[1], t.r + 6]);
    flats.push({ x: p[0], z: p[1], r: t.kind === 'capital' ? t.r - 2 : t.r * 0.9, h: t.h, town: true });
    spots.towns.push(t);
  }
  const capitalT = townBy.capital, startT = townBy[MD.START_TOWN];
  const reachA = flood(rawGrid, capitalT.x, capitalT.z, 0.6);
  const isReach = (x, z) => { const i = Math.floor((x + H) / RC), j = Math.floor((z + H) / RC); return i >= 0 && j >= 0 && i < RCN && j < RCN && reachA[j * RCN + i] === 1; };
  for (const t of townsW) if (!isReach(t.x, t.z)) complain('town cut off', t.key);
  const walkableBase = (x, z) => {
    const h = baseHeight(x, z);
    if (h < 0.9 || !isReach(x, z)) return false;
    const e = 1.5;
    if (Math.hypot((baseHeight(x + e, z) - baseHeight(x - e, z)) / (2 * e), (baseHeight(x, z + e) - baseHeight(x, z - e)) / (2 * e)) >= 0.35) return false;
    for (let k = 0; k < 8; k++) { const a = k * 0.785; if (Math.abs(baseHeight(x + Math.cos(a) * 7, z + Math.sin(a) * 7) - h) > 4.5) return false; }
    return true;
  };
  lap('towns');

  // ---- the Demon Lord's plateau + the gate pads (the three gates sit just inside the ring passes) ----------------------------------------------------
  const lordHill = hills.find((h) => h.id === 'demon');
  {
    taken.push([lordHill.cx, lordHill.cz, lordHill.r + 8]);
    taken.push([capCit.cx, capCit.cz, capCit.r + 6]);
    for (const g of gatesW) {
      const p = nudgeTo(g.x, g.z, 10, walkableBase, 8, 2);
      if (!p) complain('no site for gate', g.key); else { g.x = p[0]; g.z = p[1]; }
      taken.push([g.x, g.z, 14]);
      flats.push({ x: g.x, z: g.z, r: 9, h: clamp(baseHeight(g.x, g.z), 1.8, 12) });
    }
  }

  // ---- main roads: the front path first (A* over a 4 m cost grid), then the rest of the network ------------------------------------------------
  const C4 = 4, G4 = SZ / C4 + 1;
  const h4 = new Float32Array(G4 * G4), pass4 = new Uint8Array(G4 * G4), used4 = new Uint8Array(G4 * G4);
  for (let j = 0; j < G4; j++) for (let i = 0; i < G4; i++) h4[j * G4 + i] = baseHeight(i * C4 - H, j * C4 - H);
  let slopeLimit = 0.42;
  function buildPass() {
    for (let j = 1; j < G4 - 1; j++) for (let i = 1; i < G4 - 1; i++) {
      const k = j * G4 + i, h = h4[k];
      const gx = (h4[k + 1] - h4[k - 1]) / (2 * C4), gz = (h4[k + G4] - h4[k - G4]) / (2 * C4);
      pass4[k] = h > 0.55 && Math.hypot(gx, gz) < slopeLimit ? 1 : 0;
    }
  }
  buildPass();
  const cellI = (x, z) => clamp(Math.round((z + H) / C4), 0, G4 - 1) * G4 + clamp(Math.round((x + H) / C4), 0, G4 - 1);
  function snapPass(x, z) {
    let c = cellI(x, z);
    if (pass4[c]) return c;
    const ci = c % G4, cj = (c / G4) | 0;
    for (let r = 1; r < 14; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj;
      if (i < 1 || j < 1 || i >= G4 - 1 || j >= G4 - 1) continue;
      if (pass4[j * G4 + i]) return j * G4 + i;
    }
    return -1;
  }
  const gA = new Float32Array(G4 * G4), fromA = new Int32Array(G4 * G4), closedA = new Int32Array(G4 * G4), stampA = new Int32Array(G4 * G4);
  let genA = 0;
  const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [-1, 1, 1.4142], [1, -1, 1.4142], [-1, -1, 1.4142]];
  function routeCells(a, b) {
    const s = snapPass(a[0], a[1]), g = snapPass(b[0], b[1]);
    if (s < 0 || g < 0) return null;
    genA++;
    const hk = [], hv = [];
    const push = (kk, v) => { let i = hk.length; hk.push(kk); hv.push(v); while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= kk) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = kk; hv[i] = v; };
    const pop = () => {
      const top = hv[0], lk = hk.pop(), lv = hv.pop(), n = hk.length;
      if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hk[c + 1] < hk[c]) c++; if (hk[c] >= lk) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = lk; hv[i] = lv; }
      return top;
    };
    const gi = g % G4, gj = (g / G4) | 0;
    const hf = (idx) => { const dx = Math.abs((idx % G4) - gi), dz = Math.abs(((idx / G4) | 0) - gj); return (dx + dz) - 0.5858 * Math.min(dx, dz); };
    gA[s] = 0; stampA[s] = genA; fromA[s] = -1; push(hf(s), s);
    let found = false;
    while (hk.length) {
      const cur = pop();
      if (closedA[cur] === genA) continue;
      closedA[cur] = genA;
      if (cur === g) { found = true; break; }
      const ci = cur % G4, cj = (cur / G4) | 0, cg = gA[cur];
      for (let d = 0; d < 8; d++) {
        const ni = ci + DIRS8[d][0], nj = cj + DIRS8[d][1];
        if (ni < 1 || nj < 1 || ni >= G4 - 1 || nj >= G4 - 1) continue;
        const nb = nj * G4 + ni;
        if (!pass4[nb] || closedA[nb] === genA) continue;
        const dh = Math.abs(h4[nb] - h4[cur]) / (C4 * DIRS8[d][2]);
        const cost = DIRS8[d][2] * (1 + 9 * dh * dh + (h4[nb] < 1.1 ? 1.5 : 0)) * (used4[nb] ? 0.55 : 1);
        const ng = cg + cost;
        if (stampA[nb] !== genA || ng < gA[nb]) { stampA[nb] = genA; gA[nb] = ng; fromA[nb] = cur; push(ng + hf(nb) * 0.9, nb); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = g; c !== -1; c = fromA[c]) cells.push(c);
    cells.reverse();
    return cells;
  }
  const chaikin = (pts, n) => {
    for (let it = 0; it < n; it++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(pts[pts.length - 1]); pts = out;
    }
    return pts;
  };
  // route one stop-to-stop leg: returns a smooth centre line (world frame) from a to b
  let critRoute = true;
  function routeLeg(a, b) {
    let cells = routeCells(a, b);
    if (!cells && slopeLimit < 0.6) { slopeLimit = 0.6; buildPass(); cells = routeCells(a, b); }
    if (!cells) { if (critRoute) complain('no road route', a.map(Math.round), b.map(Math.round)); else if (DBG) console.log('   soft road fail', a.map(Math.round), b.map(Math.round)); return null; }
    for (const c of cells) used4[c] = 1;
    let pts = cells.map((c) => [(c % G4) * C4 - H, ((c / G4) | 0) * C4 - H]);
    // thin the staircase: keep every second point, always the ends
    const thin = [a];
    for (let i = 2; i < pts.length - 1; i += 2) thin.push(pts[i]);
    thin.push(b);
    return spline(chaikin(thin, 2));
  }
  const routeChain = (chain, main, critical) => {
    const stops = chain.map(stopXY);
    let whole = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const leg = routeLeg(stops[i], stops[i + 1]);
      if (!leg) continue;
      whole = whole.length ? whole.concat(leg.slice(1)) : leg;
    }
    if (whole.length > 3) addRoad(whole, main);
    return whole;
  };
  const frontLine = routeChain(MD.FRONT, true);
  critRoute = false;
  const gateRoutes = {};
  for (const chain of MD.ROADS) { const line = routeChain(chain, true); if (typeof chain[0] === 'string' && chain[0].startsWith('gate:') && line.length > 2) gateRoutes[chain[0].slice(5)] = line; }
  // front path as a sampled polyline + cumulative distance
  const frontPath = [];
  {
    let acc = 0, last = null;
    for (const p of frontLine) {
      if (last) acc += Math.hypot(p[0] - last[0], p[1] - last[1]);
      if (!last || acc >= 14 || p === frontLine[frontLine.length - 1]) { frontPath.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]); acc = 0; }
      last = p;
    }
  }
  const sampleLine = (line) => { const out = []; let acc = 0, last = null; for (const p of line) { if (last) acc += Math.hypot(p[0] - last[0], p[1] - last[1]); if (!last || acc >= 14 || p === line[line.length - 1]) { out.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]); acc = 0; } last = p; } return out; };
  lap('roads');
  // reachability seeds are also needed from the start village: the A* above already guarantees roads between towns, the layout check below does the rest

  // ---- remaining sites -----------------------------------------------------------------------------------------------------------------------------------
  const nearestXY = (x, z) => { const np = nearestOnMain(x, z); return np ? { p: [np.x, np.z], d: np.d } : { p: null, d: 1e9 }; };
  const knollOpenFn = (x, z) => {
    const hc = baseHeight(x, z);
    for (let k = 0; k < 8; k++) { const px = x + Math.cos(k * 0.785) * 8, pz = z + Math.sin(k * 0.785) * 8; if (!isReach(px, pz) || Math.abs(baseHeight(px, pz) - hc) > 4) return false; }
    return true;
  };
  const forts = [];   // world frame (plateau forts and knolls)
  const ringTop = (x, z) => { let top = baseHeight(x, z); for (let k = 0; k < 12; k++) for (const rr of [8, 11]) top = Math.max(top, baseHeight(x + Math.cos(k * 0.5236) * rr, z + Math.sin(k * 0.5236) * rr)); return top; };
  function planFort(x, z, tier, rampDeg) {
    const c0 = baseHeight(x, z), top = c0 + Math.min(2.5, Math.max(0, ringTop(x, z) - c0)) + FT.rise[Math.min(tier, 4)];
    let a;
    if (rampDeg != null) a = rad(rampDeg);
    else { const np = nearestXY(x, z).p; a = np ? Math.atan2(np[1] - z, np[0] - x) : 0; }
    const dx = Math.cos(a), dz = Math.sin(a);
    let L = 8, foot = 2;
    for (let it = 0; it < 6; it++) { foot = baseHeight(x + dx * (FT.R + L), z + dz * (FT.R + L)); L = clamp((top - foot) / FT.ramp, 6, 18); }
    const f = { x, z, R: FT.R, top, skirt: FT.skirt, dx, dz, L, foot, tier, rise: top - foot, fx: x + dx * (FT.R + L), fz: z + dz * (FT.R + L) };
    f.reach = FT.R + Math.max(FT.skirt + 3, L + 10);
    return f;
  }
  function makeKnoll(x, z) {
    let top = baseHeight(x, z), s = 0;
    for (let k = 0; k < 8; k++) s += baseHeight(x + Math.cos(k * 0.785) * 6, z + Math.sin(k * 0.785) * 6);
    top = Math.max(top, s / 8) + FT.knollRise;
    const f = { x, z, R: FT.knollR, top, skirt: FT.knollSkirt, dx: 0, dz: 0, L: 0, foot: top, tier: 0, rise: FT.knollRise, knoll: true };
    f.reach = f.R + f.skirt + 1;
    return f;
  }
  const occ = [];
  const occFort = (f) => occ.push({ x: f.x, z: f.z, rad: f.R + f.skirt + 3, dx: f.dx, dz: f.dz, L: f.L, R: f.R });
  const occKnoll = (x, z) => occ.push({ x, z, rad: 9, L: 0 });
  function rampClash(f) {
    for (const o of occ) {
      if (Math.abs(o.x - f.x) > 50 || Math.abs(o.z - f.z) > 50) continue;
      for (let t = 0; t <= f.R + f.L + 8; t += 4) if (Math.hypot(f.x + f.dx * t - o.x, f.z + f.dz * t - o.z) < o.rad + (t > f.R ? 2 : 0)) return true;
      if (o.L) {
        for (let t = 0; t <= o.R + o.L + 8; t += 4) if (Math.hypot(o.x + o.dx * t - f.x, o.z + o.dz * t - f.z) < f.R + f.skirt + 3) return true;
        for (let t = o.R; t <= o.R + o.L + 8; t += 4) for (let u = f.R; u <= f.R + f.L + 8; u += 4) if (Math.hypot(o.x + o.dx * t - f.x - f.dx * u, o.z + o.dz * t - f.z - f.dz * u) < 6) return true;
      }
    }
    return false;
  }
  function bestRamp(x, z, tier, pref) {
    let prefDeg = pref;
    if (prefDeg == null) { const np = nearestXY(x, z).p; prefDeg = np ? Math.atan2(np[1] - z, np[0] - x) * 180 / Math.PI : 0; }
    let best = null, bs = 1e9;
    for (let k = 0; k < 16; k++) {
      const deg = k * 22.5;
      const dd = Math.abs(((deg - prefDeg) % 360 + 540) % 360 - 180);
      if (pref != null && dd > 50) continue;
      const f = planFort(x, z, tier, deg);
      if (rampClash(f)) continue;
      if (!isReach(f.fx, f.fz) || !isReach(f.fx + f.dx * 6, f.fz + f.dz * 6) || !isReach(f.fx + f.dx * 14, f.fz + f.dz * 14)) continue;
      let dev = 0;
      for (let t = FT.R + 2; t < FT.R + f.L + 14; t += 4) dev += Math.abs(baseHeight(x + f.dx * t, z + f.dz * t) - (t < FT.R + f.L ? lerp(f.top, f.foot, (t - FT.R) / f.L) : f.foot));
      const sc = dd * 0.25 + dev * 0.9 + f.L * 0.4;
      if (sc < bs) { bs = sc; best = { deg, f }; }
    }
    return best;
  }
  function fortSite(sx, sz, tier, rampDeg, sep, okFn) {
    for (let rr = 0; rr <= 30; rr += 5) {
      for (let k = 0; k < (rr ? 12 : 1); k++) {
        const a = (k / 12) * TAU + rr * 0.7, x = sx + Math.cos(a) * rr, z = sz + Math.sin(a) * rr;
        if (!clear(x, z, sep) || (okFn && !okFn(x, z))) continue;
        const h = baseHeight(x, z);
        if (h < 1.0 || h > 11 || landAt(x, z) < 0.99 || !isReach(x, z)) continue;
        if (Math.hypot(baseHeight(x + 2, z) - baseHeight(x - 2, z), baseHeight(x, z + 2) - baseHeight(x, z - 2)) / 4 > 0.6) continue;
        let mn = 99, mx = -99;
        for (let q = 0; q < 8; q++) { const hh = baseHeight(x + Math.cos(q * 0.785) * 9, z + Math.sin(q * 0.785) * 9); mn = Math.min(mn, hh); mx = Math.max(mx, hh); }
        if (mx - mn > 8 || mx > 17) continue;
        if (nearestXY(x, z).d < FT.R + FT.skirt + 5) continue;
        const br = bestRamp(x, z, tier, rampDeg);
        if (br) return [x, z, br.deg];
      }
    }
    return null;
  }
  // wild monster camps keep away from towns (the start village most of all)
  const townKeepOut = (x, z) => { for (const t of townsW) if (Math.hypot(x - t.x, z - t.z) < t.r + (t.start ? 22 : 10)) return false; return true; };

  // demon guard posts in the bowl (flat clearings; the gates and the Lord are placed above)
  MD.DEMON.camps.forEach((c) => {
    const [px, pz] = Wp(c.x, c.z), [jx, jz] = jit(px, pz, 5);
    const p = nudgeTo(jx, jz, 10, (x, z) => walkableBase(x, z) && townKeepOut(x, z), 26, 3);
    if (!p) { complain('no demon camp site', c.x, c.z); return; }
    taken.push([p[0], p[1], 10]);
    flats.push({ x: p[0], z: p[1], r: 9, h: clamp(baseHeight(p[0], p[1]), 1.5, 16) });
    spots.demon.camps.push({ kind: c.kind, tier: c.tier, x: p[0], z: p[1] });
  });

  // dungeons, lairs
  {
    const [x, z, tier, theme] = MD.CENTER_DUNGEON;
    spots.dungeons.push({ x, z, tier, theme, name: 'Sunken Temple', centre: true }); taken.push([x, z, 20]);
  }
  MD.DUNGEONS.forEach(([x, z, tier, theme, name]) => {
    const [px, pz] = Wp(x, z), [jx, jz] = jit(px, pz, 5), p = nudgeTo(jx, jz, 12, (a, b) => walkableBase(a, b) && townKeepOut(a, b), 30, 3);
    if (!p) { complain('no dungeon site', name); return; }
    taken.push([p[0], p[1], 10]); spots.dungeons.push({ x: p[0], z: p[1], tier, theme, name });
    flats.push({ x: p[0], z: p[1], r: 8, h: clamp(baseHeight(p[0], p[1]), 1.5, 14) });
  });
  MD.LAIRS.forEach(([x, z, tier]) => {
    const [px, pz] = Wp(x, z), [jx, jz] = jit(px, pz, 6), p = nudgeTo(jx, jz, 8, (a, b) => walkableBase(a, b) && townKeepOut(a, b), 30, 3);
    if (!p) { return; }
    taken.push([p[0], p[1], 8]); spots.lairs.push({ x: p[0], z: p[1], tier });
    flats.push({ x: p[0], z: p[1], r: 8, h: clamp(baseHeight(p[0], p[1]), 1.5, 14) });
  });
  // wild camps (hill forts first)
  const placedCamps = []; // {x, z, tier, fort, knoll, centre, exact}
  let plainCamps = 0;
  for (const c of MD.CAMPS) {
    const [px, pz] = Wp(c[0], c[1]), [jx, jz] = jit(px, pz, c[4] === 'exact' ? 0 : 6), tier = c[2], wantFort = c[3] === 'fort', exact = c[3] === 'exact' || c[4] === 'exact';
    let site = null;
    if (wantFort) site = fortSite(jx, jz, tier, null, 9, townKeepOut);
    if (wantFort && !site) plainCamps++;
    if (site) { taken.push([site[0], site[1], 9]); const f = planFort(site[0], site[1], tier, site[2]); occFort(f); forts.push(f); placedCamps.push({ x: site[0], z: site[1], tier, fort: f }); continue; }
    const p = exact && walkableBase(jx, jz) ? [jx, jz] : nudgeTo(jx, jz, 6, (a, b) => walkableBase(a, b) && townKeepOut(a, b), 28, 3);
    if (!p) { continue; }
    taken.push([p[0], p[1], 6]);
    const pc = { x: p[0], z: p[1], tier };
    if (wantFort && knollOpenFn(p[0], p[1])) { const f = makeKnoll(p[0], p[1]); forts.push(f); occKnoll(p[0], p[1]); pc.fort = f; }
    placedCamps.push(pc);
  }
  for (const [x, z, tier] of MD.CENTER_CAMPS) { taken.push([x, z, 8]); placedCamps.push({ x, z, tier, centre: true }); }
  // chests and shrines (a chest beside a hill fort camp sits on its plateau)
  const placedChests = [], placedShrines = [];
  for (const c of MD.CHESTS) {
    const [px, pz] = Wp(c[0], c[1]), [jx, jz] = jit(px, pz, 4);
    let bf = null, bd = 16;
    for (const p of placedCamps) { if (!p.fort || p.fort.knoll || p.chest) continue; const d = Math.hypot(p.x - jx, p.z - jz); if (d < bd) { bd = d; bf = p; } }
    if (bf) { bf.chest = true; placedChests.push({ x: bf.fort.x - bf.fort.dx * 4.6, z: bf.fort.z - bf.fort.dz * 4.6, tier: c[2] }); continue; }
    let got = null;
    for (let rr = 0; rr <= 28 && !got; rr += 4) for (let k = 0; k < (rr ? 10 : 1) && !got; k++) {
      const a = k * 0.628, nx = jx + Math.cos(a) * rr, nz = jz + Math.sin(a) * rr;
      if (walkableBase(nx, nz) && clear(nx, nz, 5) && knollOpenFn(nx, nz)) got = [nx, nz];
    }
    if (!got) { continue; }
    taken.push([got[0], got[1], 5]); occKnoll(got[0], got[1]);
    const f = makeKnoll(got[0], got[1]); forts.push(f);
    placedChests.push({ x: got[0], z: got[1], tier: c[2] });
  }
  for (const [x, z, tier] of MD.CENTER_CHESTS) { taken.push([x, z, 7]); placedChests.push({ x, z, tier }); }
  for (const s of MD.SHRINES) {
    const [px, pz] = Wp(s[0], s[1]), [jx, jz] = jit(px, pz, 4);
    let got = null;
    for (let rr = 0; rr <= 28 && !got; rr += 4) for (let k = 0; k < (rr ? 10 : 1) && !got; k++) {
      const a = k * 0.628, nx = jx + Math.cos(a) * rr, nz = jz + Math.sin(a) * rr;
      if (walkableBase(nx, nz) && clear(nx, nz, 6) && knollOpenFn(nx, nz)) got = [nx, nz];
    }
    if (!got) { continue; }
    taken.push([got[0], got[1], 6]); occKnoll(got[0], got[1]);
    const f = makeKnoll(got[0], got[1]); forts.push(f);
    placedShrines.push({ x: got[0], z: got[1], kind: placedShrines.length < 4 ? 'heal' : ['heal', 'might', 'swift'][Math.floor(rnd() * 3)] });
  }
  // points of interest and waystones
  for (const [type, x, z] of MD.POIS) {
    const [px, pz] = Wp(x, z), [jx, jz] = jit(px, pz, 5), p = nudgeTo(jx, jz, 5, (a, b) => walkableBase(a, b), 24, 3);
    if (!p) { continue; }
    taken.push([p[0], p[1], 5]); spots.pois.push({ type, x: p[0], z: p[1] });
    flats.push({ x: p[0], z: p[1], r: 5, h: clamp(baseHeight(p[0], p[1]), 1.4, 14) });
  }
  // town waystones (beside the square on walkable ground), extra waystones
  for (const t of townsW) {
    const l = Math.hypot(t.x, t.z) || 1, ux = -t.x / l, uz = -t.z / l;
    let w = null;
    for (const [fw, sd] of [[7, 0], [0, 7], [0, -7], [-7, 0], [8, 8], [8, -8], [-8, 8], [-8, -8], [11, 0], [0, 11]]) {
      const px = t.x + ux * fw - uz * sd, pz = t.z + uz * fw + ux * sd;
      if (walkableBase(px, pz) && slopeBase(px, pz) < 0.25) { w = [px, pz]; break; }
    }
    if (!w) { w = [t.x + 7, t.z]; complain('town waystone fallback', t.key); }
    spots.waystones.push({ x: w[0], z: w[1], town: t.key, name: t.name + ' Waystone' });
  }
  for (const [x, z, name] of MD.WAYSTONES) {
    const [px, pz] = Wp(x, z), p = nudgeTo(px, pz, 5, (a, b) => walkableBase(a, b) && slopeBase(a, b) < 0.25, 24, 3);
    if (!p) { continue; }
    taken.push([p[0], p[1], 5]); spots.waystones.push({ x: p[0], z: p[1], name });
    flats.push({ x: p[0], z: p[1], r: 4, h: clamp(baseHeight(p[0], p[1]), 1.4, 14) });
  }
  // gate-approach waystones: 20 m outside each ring pass, on the island side
  for (const g of gatesW) {
    let p = null;
    for (const dd of [20, 14, 28, -10]) { p = nudgeTo(g.pass.x + g.ox * dd, g.pass.z + g.oz * dd, 5, (a, b) => walkableBase(a, b) && slopeBase(a, b) < 0.3, 16, 2); if (p) break; }
    if (!p) { complain('no gate waystone', g.key); continue; }
    taken.push([p[0], p[1], 5]); spots.waystones.push({ x: p[0], z: p[1], name: g.key[0].toUpperCase() + g.key.slice(1) + ' Gate Approach', gate: g.key });
    flats.push({ x: p[0], z: p[1], r: 4, h: clamp(baseHeight(p[0], p[1]), 1.4, 14) });
  }
  // hero spawns: four distinct flat spots on the start village green
  {
    const hs = [];
    const base = rnd() * TAU;
    for (let k = 0; k < 4; k++) {
      let got = null;
      for (let rr = 9 + (k > 0 ? 4 : 0); rr <= 26 && !got; rr += 3) for (let q = 0; q < 12 && !got; q++) {
        const a = base + (k + q / 12 * 0.5) * TAU / 4, px = startT.x + Math.cos(a) * rr, pz = startT.z + Math.sin(a) * rr;
        if (!walkableBase(px, pz) || slopeBase(px, pz) > 0.2) continue;
        if (hs.some((h) => Math.hypot(h[0] - px, h[1] - pz) < 6)) continue;
        got = [px, pz];
      }
      if (!got) { complain('no hero spawn', k); got = [startT.x + k * 3, startT.z]; }
      hs.push(got);
    }
    spots.heroSpawns = hs.map(([x, z]) => ({ x, z }));
  }
  if (plainCamps > 6) complain('fort camps without a hill site', plainCamps);
  lap('sites');

  // spur roads from forts, camps, dungeons, lairs and pois to the nearest main road
  {
    const spurOK = (pts) => { for (let i = 1; i < pts.length; i++) if (Math.abs(terrainRaw(pts[i][0], pts[i][1]) - terrainRaw(pts[i - 1][0], pts[i - 1][1])) > 1.0) return false; return true; };
    const bend = (a, b) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), o = (rnd() - 0.5) * l * 0.25;
      return spline([a, [a[0] + dx / 2 - dz / l * o, a[1] + dz / 2 + dx / l * o], b]);
    };
    const spur = (x, z, lo, hi) => { const np = nearestOnMain(x, z); if (!np || np.d < lo || np.d > hi) return; const pts = bend([x, z], [np.x, np.z]); if (spurOK(pts)) addRoad(pts); };
    for (const f of forts) if (!f.knoll) spur(f.fx, f.fz, 3, 40);
    for (const d of spots.dungeons) if (!d.centre) spur(d.x, d.z, 6, 50);
    for (const l of spots.lairs) spur(l.x, l.z, 6, 40);
    for (const c of spots.demon.camps) spur(c.x, c.z, 5, 40);
  }

  // ---- final height: base + flats + forts ------------------------------------------------------------------------------------------------------------
  for (const f of forts) flats.push({ x: f.x, z: f.z, r: f.R, h: f.top, fort: true });
  const BK = 32, BN2 = Math.ceil(SZ / BK) + 1;
  const bucket = (items, reachOf) => {
    const b = Array.from({ length: BN2 * BN2 }, () => null);
    for (const it of items) {
      const r = reachOf(it), i0 = clamp(Math.floor((it.x - r + H) / BK), 0, BN2 - 1), i1 = clamp(Math.floor((it.x + r + H) / BK), 0, BN2 - 1);
      const j0 = clamp(Math.floor((it.z - r + H) / BK), 0, BN2 - 1), j1 = clamp(Math.floor((it.z + r + H) / BK), 0, BN2 - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (b[j * BN2 + i] ||= []).push(it);
    }
    return b;
  };
  const flatB = bucket(flats.filter((f) => !f.fort), (f) => f.r * 1.4 + 1);
  const fortB = bucket(forts, (f) => f.reach);
  function finalHeight(x, z) {
    let h = baseHeight(x, z);
    const bi = clamp(Math.floor((x + H) / BK), 0, BN2 - 1), bj = clamp(Math.floor((z + H) / BK), 0, BN2 - 1), key = bj * BN2 + bi;
    const fl = flatB[key];
    if (fl) for (const f of fl) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d > f.r * 1.4) continue;
      h = lerp(h, f.h, 1 - smoothstep(f.r * 0.7, f.r * 1.3, d));
    }
    const fb = fortB[key];
    if (fb) for (const f of fb) {
      const dx = x - f.x, dz = z - f.z, d2 = dx * dx + dz * dz;
      if (d2 > f.reach * f.reach) continue;
      h = lerp(h, f.top, 1 - smoothstep(f.R, f.R + f.skirt, Math.sqrt(d2)));
      if (f.knoll) continue;
      const s = dx * f.dx + dz * f.dz;
      if (s > 0 && s < f.R + f.L + 8) {
        const u = Math.abs(dz * f.dx - dx * f.dz);
        if (u < 8.5) {
          const hr = lerp(f.top, f.foot, clamp((s - f.R) / f.L, 0, 1));
          h = lerp(h, hr, (1 - smoothstep(3.8, 8.5, u)) * (1 - smoothstep(f.R + f.L, f.R + f.L + 8, s)) * smoothstep(0, 3, s));
        }
      }
    }
    return h;
  }
  lap('buckets');
  const hgrid = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) hgrid[j * GN + i] = finalHeight(i - H, j - H);
  function heightAt(x, z) {
    const fx = clamp(x + H, 0, SZ - 0.001), fz = clamp(z + H, 0, SZ - 0.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const a = hgrid[iz * GN + ix], b = hgrid[iz * GN + ix + 1], c = hgrid[(iz + 1) * GN + ix], d = hgrid[(iz + 1) * GN + ix + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
  function slopeAt(x, z) {
    return Math.hypot((heightAt(x + 1, z) - heightAt(x - 1, z)) / 2, (heightAt(x, z + 1) - heightAt(x, z - 1)) / 2);
  }
  const walk = new Uint8Array(GN * GN);
  for (let j = 0; j < GN; j++) {
    for (let i = 0; i < GN; i++) {
      const h = hgrid[j * GN + i];
      const hx = hgrid[j * GN + Math.min(GN - 1, i + 1)] - hgrid[j * GN + Math.max(0, i - 1)];
      const hz = hgrid[Math.min(GN - 1, j + 1) * GN + i] - hgrid[Math.max(0, j - 1) * GN + i];
      walk[j * GN + i] = h > 0.4 && Math.hypot(hx, hz) / 2 < 1.0 ? 1 : 0;
    }
  }
  function walkable(x, z) {
    const ix = Math.round(x + H), iz = Math.round(z + H);
    if (ix < 0 || iz < 0 || ix >= GN || iz >= GN) return false;
    return walk[iz * GN + ix] === 1;
  }
  lap('hgrid+walk');

  // ---- features for sim.js (wild camps, chests, shrines; nodes were removed in v0.4) --------------------------------------------------------------
  const quadOf = (x, z) => (x < 0 ? (z < 0 ? 0 : 3) : (z < 0 ? 1 : 2)); // 0 NW, 1 NE, 2 SE, 3 SW
  const feats = { nodes: [], camps: [], chests: [], shrines: [], boss: { x: MD.BOSS.x, z: MD.BOSS.z } };
  for (const c of placedCamps) feats.camps.push({ x: c.x, z: c.z, tier: c.tier, temple: !!c.centre, fort: !!(c.fort && !c.fort.knoll), q: c.centre ? -1 : quadOf(c.x, c.z) });
  for (const c of placedChests) feats.chests.push({ x: c.x, z: c.z, tier: c.tier, q: quadOf(c.x, c.z) });
  for (const s of placedShrines) feats.shrines.push({ x: s.x, z: s.z, kind: s.kind, q: quadOf(s.x, s.z) });

  // ---- layout check on the nav grid the sim uses: required sites must be connected to the start village (else redraw), optional ones are dropped -------
  {
    const nv = createNav({ walkable, roadDist: roadDistAt }), rch = floodReach(nv, startT.x, startT.z);
    const okAt = (x, z) => { const c = cellOf(x, z); return !nv.terr[c] && rch[c] === 1; };
    const need = { town: townsW, dungeon: spots.dungeons, hero: spots.heroSpawns, ws: spots.waystones.filter((w) => w.town) };
    for (const [kind, arr] of Object.entries(need)) for (const p of arr) if (!okAt(p.x, p.z)) complain('nav:', kind, p.type || p.key || '', p.x | 0, p.z | 0);
    const soft = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (!okAt(arr[i].x, arr[i].z)) arr.splice(i, 1); };
    soft(feats.camps); soft(feats.chests); soft(feats.shrines); soft(spots.lairs); soft(spots.pois); soft(spots.demon.camps);
    for (let i = spots.waystones.length - 1; i >= 0; i--) if (!spots.waystones[i].town && !okAt(spots.waystones[i].x, spots.waystones[i].z)) spots.waystones.splice(i, 1);
    for (const p of [...gatesW.map((g) => [g.x, g.z]), lordW.pos, [MD.BOSS.x, MD.BOSS.z], [0, 0]]) if (!okAt(p[0], p[1])) complain('nav: core site cut off', p[0] | 0, p[1] | 0);
    for (let i = 0; i < frontPath.length; i += 3) if (!okAt(frontPath[i][0], frontPath[i][1])) { complain('nav: front path cut'); break; }
  }
  if (bad && !final) return null;
  lap('layout check');

  // ---- biomes ---------------------------------------------------------------------------------------------------------------------------------------------
  const anchors = MD.BIOME_ANCHORS.map((a) => { const [x, z] = Wp(a.x, a.z); return { b: BIOME[a.b], x, z, r: a.r }; });
  const BN = WORLD.navN;
  const biomeGrid = new Uint8Array(BN * BN);
  {
    const cs = SZ / BN;
    for (let j = 0; j < BN; j++) {
      for (let i = 0; i < BN; i++) {
        const x = i * cs - H + cs / 2, z = j * cs - H + cs / 2;
        const wob = 1 + (N.fbm(x * 0.011 + 71, z * 0.011 + 3, 2) - 0.5) * 0.5;
        let best = 1e9, bb = 0;
        for (const a of anchors) { const s = Math.hypot(x - a.x, z - a.z) / a.r * wob; if (s < best) { best = s; bb = a.b; } }
        biomeGrid[j * BN + i] = bb;
      }
    }
  }
  const biomeAt = (x, z) => biomeGrid[clamp(Math.floor((z + H) / (SZ / BN)), 0, BN - 1) * BN + clamp(Math.floor((x + H) / (SZ / BN)), 0, BN - 1)];
  for (const c of feats.camps) {
    c.biome = c.temple ? BIOME.TEMPLE : biomeAt(c.x, c.z);
    const tab = CAMP_TABLE[c.biome] || CAMP_TABLE[BIOME.MOOR];
    c.types = tab[Math.min(c.tier, tab.length) - 1].slice();
    c.id = 0;
  }

  // ---- compat: world.hearts (v0.3 readers until CORE removes them) = the four hero spawns ---------------------------------------------------------
  const hearts = [0, 1, 2, 3].map((k) => { const s = spots.heroSpawns[k]; return { team: k, x: s.x, z: s.z, rot: Math.atan2(-s.z, -s.x), top: 0 }; });
  const roads = [], roadLines = roadPolys.map((p) => p.pts);
  for (const pl of roadPolys) for (let i = 0; i < pl.pts.length - 1; i++) roads.push([pl.pts[i][0], pl.pts[i][1], pl.pts[i + 1][0], pl.pts[i + 1][1]]);
  spots.front = frontPath;
  spots.gateRoutes = Object.fromEntries(Object.entries(gateRoutes).map(([k, l]) => [k, sampleLine(l)]));
  Object.assign(spots.demon, {
    gates: gatesW.map((g) => ({ key: g.key, tier: g.tier, main: g.main, x: g.x, z: g.z, pass: g.pass, ox: g.ox, oz: g.oz })),
    lord: { x: lordHill.cx, z: lordHill.cz }, hill: { x: lordHill.cx, z: lordHill.cz, r: lordHill.r, top: lordHill.top },
    ring: { x: demonRing.cx, z: demonRing.cz, r: demonRing.r },
  });
  spots.orc = spots.demon;   // deprecated alias
  spots.capitalHill = { x: capCit.cx, z: capCit.cz, r: capCit.r, top: capCit.top };
  spots.rings = ramps.map((r) => ({ id: r.id, x: r.cx, z: r.cz, r: r.r, passes: r.passes.map(([x, z]) => ({ x, z })) }));
  spots.centre = { x: 0, z: 0, boss: { x: MD.BOSS.x, z: MD.BOSS.z } };
  spots.flip = flip;
  lap('biomes');

  // ---- props (render-only decoration, but deterministic) ---------------------------------------------------------------------------------------------
  const props = [];
  const featPts = [...feats.chests, ...feats.shrines, ...spots.pois, ...spots.dungeons, ...spots.lairs, ...spots.demon.camps, ...spots.waystones, ...gatesW];
  for (const c of feats.camps) featPts.push(c);
  const propRnd = mulberry32(seed ^ 0x51ed270b);
  const cell = 3.2;
  const onRamp = (px, pz, w) => {
    for (const f of forts) {
      if (f.knoll) continue;
      const dx = px - f.x, dz = pz - f.z;
      if (dx * dx + dz * dz > f.reach * f.reach) continue;
      const s = dx * f.dx + dz * f.dz;
      if (s > -2 && s < f.R + f.L + 4 && Math.abs(dz * f.dx - dx * f.dz) < w) return true;
    }
    return false;
  };
  const onPlateau = (px, pz, pad) => { for (const f of forts) if (Math.hypot(px - f.x, pz - f.z) < f.R + pad) return true; return false; };
  const clearings = [...townsW.map((t) => [t.x, t.z, t.kind === 'capital' ? t.r * 1.05 : t.r * 0.85]), [lordHill.cx, lordHill.cz, 24], [capCit.cx, capCit.cz, 32]];
  for (const g of gatesW) clearings.push([g.x, g.z, 9]);
  for (const c of spots.demon.camps) clearings.push([c.x, c.z, 10]);
  const inClearing = (px, pz, mul = 1) => { for (const [cx, cz, r] of clearings) if (Math.abs(px - cx) < r * mul && Math.abs(pz - cz) < r * mul && Math.hypot(px - cx, pz - cz) < r * mul) return true; return false; };
  for (let z = -H + 4; z < H - 4; z += cell) {
    for (let x = -H + 4; x < H - 4; x += cell) {
      const px = x + (propRnd() - 0.5) * cell, pz = z + (propRnd() - 0.5) * cell;
      const h = heightAt(px, pz);
      if (h < 0.55) {
        if (h > -0.2 && propRnd() < 0.18 && biomeAt(px, pz) === BIOME.MIRE) props.push({ t: 'reed', x: px, z: pz, s: 0.8 + propRnd() * 0.8, r: propRnd() * 6.28 });
        continue;
      }
      if (roadDistAt(px, pz) < 4.6 || onPlateau(px, pz, 1.5) || onRamp(px, pz, 6.5) || inClearing(px, pz)) continue;
      let near = false;
      for (const f of featPts) if (Math.abs(px - f.x) < 6 && Math.abs(pz - f.z) < 6 && Math.hypot(px - f.x, pz - f.z) < 6) { near = true; break; }
      if (near) continue;
      const b = biomeAt(px, pz), sl = slopeAt(px, pz), rr = propRnd(), nz = N.fbm(px * 0.05, pz * 0.05, 2);
      const add = (t, s) => props.push({ t, x: px, z: pz, s: s * (0.75 + propRnd() * 0.6), r: propRnd() * 6.28 });
      if (sl > 0.7) { if (rr < 0.07) add('crag', 1.1); else if (rr < 0.22) add('rock', 1.4); continue; }
      switch (b) {
        case BIOME.MOOR: if (rr < 0.04) add('grave', 1); else if (rr < 0.075 + nz * 0.05) add('rock', 1); else if (rr < 0.11 && nz > 0.55) add('deadtree', 1); break;
        case BIOME.HIGH: if (rr < 0.10 + nz * 0.1) add('pine', 1.3); else if (rr < 0.18) add('rock', 1.4); break;
        case BIOME.DEAD: if (rr < 0.16 + nz * 0.22) add('deadtree', 1.15); else if (rr < 0.2) add('stump', 1); break;
        case BIOME.ABBEY: if (rr < 0.05) add('grave', 1.1); else if (rr < 0.08) add('pillar', 1); else if (rr < 0.12) add('deadtree', 1); else if (rr < 0.15) add('rock', 1); break;
        case BIOME.MIRE: if (rr < 0.10) add('deadtree', 1); else if (rr < 0.33) add('reed', 1); break;
        case BIOME.RIDGE: if (rr < 0.14) add('rock', 1.7); else if (rr < 0.19) add('pine', 1.1); break;
        case BIOME.TEMPLE: if (rr < 0.04) add('pillar', 1.2); else if (rr < 0.07) add('bones', 1); break;
        case BIOME.ASH: if (rr < 0.08) add('crag', 1.3); else if (rr < 0.17) add('rock', 1.5); else if (rr < 0.2 + nz * 0.04) add('deadtree', 1.05); else if (rr < 0.215) add('bones', 1); else if (rr < 0.23) add('stump', 1); break;
        case BIOME.FROST: if (rr < 0.12 + nz * 0.08) add('pine', 1.2); else if (rr < 0.2) add('rock', 1.5); else if (rr < 0.22) add('crag', 1.1); break;
      }
    }
  }
  {
    const gr = mulberry32(seed ^ 0x2f6e2b1);
    const dens = { [BIOME.MOOR]: 0.46, [BIOME.HIGH]: 0.3, [BIOME.DEAD]: 0.2, [BIOME.ABBEY]: 0.32, [BIOME.MIRE]: 0.18, [BIOME.RIDGE]: 0.2, [BIOME.TEMPLE]: 0.05, [BIOME.ASH]: 0.07, [BIOME.FROST]: 0.16 };
    let count = 0;
    for (let z = -H + 6; z < H - 6 && count < 26000; z += 2.6) {
      for (let x = -H + 6; x < H - 6; x += 2.6) {
        const px = x + (gr() - 0.5) * 2.6, pz = z + (gr() - 0.5) * 2.6;
        if (heightAt(px, pz) < 0.7) continue;
        const b = biomeAt(px, pz);
        if (gr() > dens[b]) continue;
        if (slopeAt(px, pz) > 0.7 || roadDistAt(px, pz) < 2.4 || onRamp(px, pz, 5) || inClearing(px, pz, 0.6)) continue;
        let skip = false;
        for (const f of featPts) if (Math.abs(px - f.x) < 4.5 && Math.abs(pz - f.z) < 4.5 && Math.hypot(px - f.x, pz - f.z) < 4.5) { skip = true; break; }
        if (skip) continue;
        const r = gr(), nz = N.fbm(px * 0.07 + 5, pz * 0.07, 2);
        let t = 'grass', s = 0.8 + gr() * 0.7;
        if (b === BIOME.MIRE) t = r < 0.12 ? 'mushroom' : r < 0.45 ? 'fern' : 'grass';
        else if (b === BIOME.DEAD) t = r < 0.1 ? 'mushroom' : r < 0.22 ? 'log' : r < 0.45 ? 'fern' : 'grass';
        else if (b === BIOME.MOOR) t = r < 0.1 ? 'flower' : r < 0.15 ? 'bush' : 'grass';
        else if (b === BIOME.HIGH) t = r < 0.12 ? 'bush' : r < 0.2 ? 'fern' : 'grass';
        else if (b === BIOME.ABBEY) t = r < 0.1 ? 'rubble' : r < 0.18 ? 'bush' : r < 0.25 ? 'flower' : 'grass';
        else if (b === BIOME.RIDGE) t = r < 0.1 ? 'bush' : 'grass';
        else if (b === BIOME.TEMPLE) t = r < 0.4 ? 'rubble' : 'grass';
        else if (b === BIOME.ASH) t = r < 0.55 ? 'rubble' : r < 0.62 ? 'log' : 'grass';
        else if (b === BIOME.FROST) t = r < 0.25 ? 'fern' : r < 0.32 ? 'rubble' : 'grass';
        if (nz > 0.62 && t === 'grass') s *= 1.35;
        props.push({ t, x: px, z: pz, s, r: gr() * 6.28 }); count++;
      }
    }
  }
  // ring of broken pillars around the crater
  for (let k = 0; k < (CR.h > 0.5 ? 14 : 0); k++) { // (v0.6: no crater, no pillar ring)
    const a = (k / 14) * TAU + 0.1;
    if (Math.abs(Math.sin(2 * (a - Math.PI / 4))) < 0.3) continue;
    props.push({ t: 'pillar', x: Math.cos(a) * (CR.r + 6), z: Math.sin(a) * (CR.r + 6), s: 1.3, r: a });
  }
  lap('props');

  const wflats = flats.map((f) => ({ ...f }));
  return {
    seed, size: SZ, half: H, hgrid, heightAt, slopeAt, walkable, biomeAt, hearts, roads, roadLines, roadDist: roadDistAt, forts, massifs: [], reach0: reachA, props, features: feats, flats: wflats,
    GN, walk, spots, chokes: [], heroSpawns: spots.heroSpawns, demonPoly: MD.DEMON.poly.map(([x, z]) => Wp(x, z)), orcPoly: MD.DEMON.poly.map(([x, z]) => Wp(x, z)), info: { flip, attempt, size: SZ, rings: spots.rings },
  };
}
