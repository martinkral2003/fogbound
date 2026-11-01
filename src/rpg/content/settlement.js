// Harrowmere layout. Built on the NW stronghold plateau (flat top ~8.4 m, ~28 m radius). Pure function of the hearts[0] position.
// Building convention (same as the core's static boxes): w is the extent along local x = (cos rot, sin rot), d along local z = (-sin rot, cos rot);
// the FRONT (door) of a building faces local +z = (-sin rot, cos rot). `door` is the world point just outside the entrance.
// Types: house hall tavern smithy hut stall palisade gate bonfire well board tower.   Gates and bonfire-like props are solid:false where walking through.
const WALL_R = 26.5;

export function layoutSettlement(world) {
  const heart = world.hearts[0];
  const cx = heart.x, cz = heart.z, phi = heart.rot; // phi = angle from the heart towards the island centre
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const W = (u, v) => ({ x: cx + u * cp - v * sp, z: cz + u * sp + v * cp });
  const buildings = [];
  const spots = {};
  const put = (type, u, v, w, d, h, o = {}) => {
    const p = W(u, v);
    let rot = o.rot ?? 0;
    if (o.look) { const t = W(o.look[0], o.look[1]); const fx = t.x - p.x, fz = t.z - p.z, n = Math.hypot(fx, fz) || 1; rot = Math.atan2(-fx / n, fz / n); }
    const b = { type, x: p.x, z: p.z, rot, w, d, h, solid: o.solid !== false, style: o.style || 'plain' };
    if (o.name) b.name = o.name;
    b.door = { x: p.x + -Math.sin(rot) * (d / 2 + 1.3), z: p.z + Math.cos(rot) * (d / 2 + 1.3) };
    buildings.push(b);
    return b;
  };
  const C = [0, 0];

  // the central bonfire, well, notice board
  put('bonfire', 0, 0, 1.8, 1.8, 1.2, { style: 'ring' });
  put('well', -6, 6, 2.2, 2.2, 1.4, { style: 'stone' });
  const board = put('board', 11, -3, 0.6, 2.0, 2.4, { look: [30, -3], style: 'notice', name: 'Notice Board' });
  // main buildings (all door-first towards the bonfire)
  const tavern = put('tavern', -10, -11, 11, 8, 6.5, { look: C, style: 'tavern', name: 'The Drowned Lantern' });
  const hall = put('hall', -17, 4, 9, 8, 7, { look: C, style: 'elder', name: "Elder's Hall" });
  const smithy = put('smithy', -1, 15, 8, 6, 5, { look: C, style: 'smith', name: "Brannoch's Forge" });
  const hut = put('hut', -12, 15, 5, 5, 4.5, { look: C, style: 'alchemist', name: "Vessa's Hut" });
  const yard = put('stall', 16, -7, 5, 3.5, 3, { look: C, style: 'yard', name: "Torvald's Yard" });
  const fence = put('stall', 16, 8, 4, 2.6, 2.8, { look: C, style: 'fence', name: "Pell's Stall" });
  put('house', 6, -20, 6, 5, 4.6, { look: C, style: 'plain' });
  put('house', -4, -21, 6, 5, 4.6, { look: C, style: 'plain' });

  // palisade ring with a main gate facing the island centre (local angle 0) and two posterns on the E / S roads (local -45 and +45 deg)
  const gates = [
    { a: -Math.PI / 4, half: 2.2, style: 'postern', name: 'East Postern' },
    { a: 0, half: 4.0, style: 'main', name: 'Harrow Gate' },
    { a: Math.PI / 4, half: 2.2, style: 'postern', name: 'South Postern' },
  ];
  const gateOut = [];
  for (const g of gates) {
    const th = g.a, u = Math.cos(th) * WALL_R, v = Math.sin(th) * WALL_R;
    const gb = put('gate', u, v, g.half * 2, 1.0, g.style === 'main' ? 5 : 3.6, { rot: phi + th + Math.PI / 2 - phi, solid: false, style: g.style, name: g.name });
    gb.rot = phi + th + Math.PI / 2; // front faces local -radial (inwards)... w runs along the tangent
    const out = W(Math.cos(th) * (WALL_R + 4), Math.sin(th) * (WALL_R + 4));
    gateOut.push({ ...g, x: gb.x, z: gb.z, outX: out.x, outZ: out.z });
    // flanking towers
    const tw = g.style === 'main' ? 3.2 : 2.2;
    for (const s of [-1, 1]) {
      const ta = th + s * (g.half + tw / 2 + 0.2) / WALL_R;
      put('tower', Math.cos(ta) * WALL_R, Math.sin(ta) * WALL_R, tw, tw, g.style === 'main' ? 8 : 6, { rot: phi + ta + Math.PI / 2, style: g.style === 'main' ? 'gatetower' : 'post' });
    }
  }
  for (let i = 0; i < gates.length; i++) {
    const g0 = gates[i], g1 = gates[(i + 1) % gates.length];
    const tw0 = g0.style === 'main' ? 3.2 : 2.2, tw1 = g1.style === 'main' ? 3.2 : 2.2;
    const a0 = g0.a + (g0.half + tw0 + 0.4) / WALL_R;
    let a1 = g1.a - (g1.half + tw1 + 0.4) / WALL_R;
    if (a1 <= a0) a1 += Math.PI * 2;
    const len = (a1 - a0) * WALL_R, n = Math.max(1, Math.ceil(len / 4.4)), step = (a1 - a0) / n;
    for (let k = 0; k < n; k++) {
      const th = a0 + step * (k + 0.5);
      put('palisade', Math.cos(th) * WALL_R, Math.sin(th) * WALL_R, step * WALL_R + 0.25, 0.7, 3.4, { rot: phi + th + Math.PI / 2, style: 'wood' });
    }
  }

  // NPC standing spots (world coordinates) and idle routines
  const near = (b, side = 0, ahead = 0.4) => ({ x: b.door.x + Math.cos(b.rot) * side - Math.sin(b.rot) * ahead, z: b.door.z + Math.sin(b.rot) * side + Math.cos(b.rot) * ahead });
  spots.maren = { ...near(hall, 0, 0.6), look: C };
  spots.brannoch = { ...near(smithy, 1.5, 0.2), look: C };
  spots.vessa = { ...near(hut, 0, 0.5), look: C };
  spots.torvald = { ...near(yard, 0, 0.9), look: C };
  spots.hedda = { ...near(tavern, 2.5, 0.5), look: C };
  spots.pell = { ...near(fence, 0, 0.7), look: C };
  const gp = W(WALL_R - 5, 4.5), gq = W(WALL_R - 5, -4.5);
  spots.roke = { x: gp.x, z: gp.z, loop: [{ x: gp.x, z: gp.z }, { x: gq.x, z: gq.z }], look: [WALL_R + 10, 0] };
  const lookW = (l) => (Array.isArray(l) ? W(l[0], l[1]) : l);
  for (const k of Object.keys(spots)) if (spots[k].look) spots[k].lookAt = lookW(spots[k].look);

  return { x: cx, z: cz, r: WALL_R + 3.5, wallR: WALL_R, phi, buildings, spots, gates: gateOut, W, board: { x: board.x, z: board.z }, bonfire: { x: cx, z: cz } };
}
