// Small shared helpers (no DOM, no Three) so the sim runs in Node.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 2D value noise + fbm, both returning roughly 0..1
export function makeNoise(seed) {
  const sm = (t) => t * t * (3 - 2 * t);
  function n(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
    const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    const u = sm(fx), v = sm(fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 4) {
    let s = 0, a = 0.5, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); tot += a; f *= 2; a *= 0.5; }
    return s / tot;
  }
  return { n, fbm };
}

// 90-degree rotation about the map centre: NW -> NE -> SE -> SW
export function rot90(x, z, times) {
  for (let i = 0; i < times; i++) { const nx = -z, nz = x; x = nx; z = nz; }
  return [x, z];
}
