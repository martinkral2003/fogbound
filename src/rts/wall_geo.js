// Wall placement geometry (WALLS lane): returns piece lists [{type,x,z,rot}] for the {t:'buildline'} command. Pure functions.
export const SEG = 4, CORNER = 3;
const TAU = Math.PI * 2;

// straight run from (x0,z0) to (x1,z1): pieces of 4 m, centred on the line. opts: type ('wall'|'palisade'), gateAt (index | 'mid'), gate ('gate'|'gatehouse')
export function line(x0, z0, x1, z1, opts = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const type = opts.type || 'wall';
  if (L < 0.5) return [{ type, x: x0, z: z0, rot: opts.rot || 0 }];
  const n = Math.max(1, Math.round(L / SEG)), th = Math.atan2(z1 - z0, x1 - x0);
  const ux = (x1 - x0) / L, uz = (z1 - z0) / L, off = (L - n * SEG) / 2 + SEG / 2;
  const gi = opts.gateAt === 'mid' ? Math.floor(n / 2) : opts.gateAt;
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = off + i * SEG;
    out.push({ type: i === gi ? (opts.gate || 'gate') : type, x: x0 + ux * s, z: z0 + uz * s, rot: th });
  }
  return out;
}

// rectangle centred at (cx,cz), nu x nv wall pieces per side (corner bastions at the four corners), rotation th.
// opts: type, corner ('corner'|'tower'|'arrow_tower'|null), gate (false|'gate'|'gatehouse'), gateDir [dx,dz] (side facing it gets the gate; default map centre), stairs (bool: a stair behind each side's first piece)
export function rect(cx, cz, nu, nv, th = 0, opts = {}) {
  nu = Math.max(1, Math.round(nu)); nv = Math.max(1, Math.round(nv));
  const type = opts.type || 'wall', corner = opts.corner === undefined ? 'corner' : opts.corner;
  const W = nu * SEG + CORNER, D = nv * SEG + CORNER;
  const eu = [Math.cos(th), Math.sin(th)], ev = [-Math.sin(th), Math.cos(th)];
  const at = (U, V) => [cx + eu[0] * U + ev[0] * V, cz + eu[1] * U + ev[1] * V];
  const out = [];
  if (corner) for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [x, z] = at(su * W / 2, sv * D / 2); out.push({ type: corner, x, z, rot: th }); }
  const sides = [
    { n: nu, nrm: [0, -1], ax: 0, at: (i) => at(-W / 2 + CORNER / 2 + SEG / 2 + i * SEG, -D / 2) },
    { n: nv, nrm: [1, 0], ax: 1, at: (i) => at(W / 2, -D / 2 + CORNER / 2 + SEG / 2 + i * SEG) },
    { n: nu, nrm: [0, 1], ax: 0, at: (i) => at(-W / 2 + CORNER / 2 + SEG / 2 + i * SEG, D / 2) },
    { n: nv, nrm: [-1, 0], ax: 1, at: (i) => at(-W / 2, -D / 2 + CORNER / 2 + SEG / 2 + i * SEG) },
  ];
  let gs = -1;
  if (opts.gate !== false) {
    const want = opts.gateDir || [-cx, -cz];
    let best = -1e9;
    sides.forEach((s, k) => {
      const wx = s.nrm[0] * eu[0] + s.nrm[1] * ev[0], wz = s.nrm[0] * eu[1] + s.nrm[1] * ev[1];
      const dot = wx * want[0] + wz * want[1];
      if (dot > best + 1e-9) { best = dot; gs = k; }
      s.w = [wx, wz];
    });
  }
  sides.forEach((s, k) => {
    const gi = k === gs ? Math.floor(s.n / 2) : -1;
    for (let i = 0; i < s.n; i++) {
      const [x, z] = s.at(i);
      out.push({ type: i === gi ? (opts.gate || 'gate') : type, x, z, rot: th + (s.ax ? Math.PI / 2 : 0) });
      if (opts.stairs && i === 0) {
        const w = s.w || [s.nrm[0] * eu[0] + s.nrm[1] * ev[0], s.nrm[0] * eu[1] + s.nrm[1] * ev[1]];
        // stairs sit inside, perpendicular to the wall; top end touches the wall, base points into the courtyard
        out.push({ type: 'stairs', x: x - w[0] * 3.6, z: z - w[1] * 3.6, rot: Math.atan2(w[1], w[0]) });
      }
    }
  });
  return out;
}

// circular ring of radius r around (cx,cz). opts: type, towerEvery (n: a 'corner' piece replaces every nth piece), gate, gateDir, stairs
export function ring(cx, cz, r, opts = {}) {
  const type = opts.type || 'wall';
  const n = Math.max(6, Math.round(TAU * r / 3.9));
  const want = opts.gateDir || [-cx, -cz];
  const wa = Math.atan2(want[1], want[0]);
  const out = [];
  let gi = 0, bd = 1e9;
  for (let i = 0; i < n; i++) { const a = wa + (i / n) * TAU; const dd = Math.abs(Math.atan2(Math.sin(a - wa), Math.cos(a - wa))); if (dd < bd) { bd = dd; gi = i; } }
  for (let i = 0; i < n; i++) {
    const a = wa + (i / n) * TAU, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, rot = a + Math.PI / 2;
    let t = type;
    if (opts.gate !== false && i === gi) t = opts.gate || 'gate';
    else if (opts.towerEvery && i % opts.towerEvery === Math.floor(opts.towerEvery / 2)) t = opts.tower || 'tower';
    out.push({ type: t, x, z, rot });
    if (opts.stairs && opts.stairsEvery && i % opts.stairsEvery === 1) out.push({ type: 'stairs', x: cx + Math.cos(a) * (r - 3.6), z: cz + Math.sin(a) * (r - 3.6), rot: a });
  }
  return out;
}

export function cost(pieces, defOf) {
  const c = {};
  for (const p of pieces) { const d = defOf(p.type); for (const k in d.cost || {}) c[k] = (c[k] || 0) + d.cost[k]; }
  return c;
}
