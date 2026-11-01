// Site layout for the v0.5 co-op defence of the compact 300 m island (MAP lane). Positions come from the world generator (world.spots / world.features), so
// everything is reachable and on suitable ground. Output format: see "MAP lane v5 API" in src/V5.md.
//   towns {id,name,key,x,z,r,kind:'village'|'town'|'capital',wsId,start?}  capital: townId  startTown: townId
//   demon {gates:[{id,key,x,z,tier,main?,pass:{x,z},ox,oz}], lord:{x,z}, lands:[x0,z0,x1,z1], landsPoly:[[x,z]..], ring:{x,z,r}, camps:[..], warcamp, warlord}
//   orc: DEPRECATED alias of `demon` (same object; camps = the gate pads + guard posts, warcamp = main gate, warlord = the Lord)
//   frontPath [[x,z],..] (main gate -> capital, ~14 m spacing), frontStops [{townId,i,dist,off}] (path index/distance where each town is passed, falling order)
//   gateRoutes {south:[[x,z]..], west:[..]} roads from the two side gates to the front path
//   lairs {id,x,z,tier,quadrant}  dungeons {id,x,z,tier,theme,name,quadrant}  pois {id,type,x,z,quadrant}  waystones {id,x,z,name,townId?,gate?}  heroSpawns [{x,z} x4]
//   regions: DEPRECATED compat list (one entry per town) so v0.3 readers do not crash until they are deleted.
const quadOf = (x, z) => (x < 0 ? (z < 0 ? 0 : 3) : (z < 0 ? 1 : 2)); // 0 NW, 1 NE, 2 SE, 3 SW

export function generateSites(world) {
  const sp = world.spots;
  const sites = { towns: [], capital: 0, startTown: 0, demon: null, orc: null, frontPath: [], frontStops: [], gateRoutes: {}, lairs: [], dungeons: [], pois: [], waystones: [], heroSpawns: [], regions: [], chokes: [] };
  let id = 1;
  const byKey = {};
  for (const t of sp.towns) {
    const town = { id: id++, key: t.key, name: t.name, x: t.x, z: t.z, r: t.r, kind: t.kind, wsId: 0 };
    if (t.start) town.start = true;
    sites.towns.push(town); byKey[t.key] = town;
    if (t.kind === 'capital') sites.capital = town.id;
    if (t.start) sites.startTown = town.id;
  }
  for (const w of sp.waystones) {
    const ws = { id: id++, x: w.x, z: w.z, name: w.name };
    if (w.town && byKey[w.town]) { ws.townId = byKey[w.town].id; byKey[w.town].wsId = ws.id; ws.regionId = ws.townId; }
    if (w.gate) ws.gate = w.gate;
    sites.waystones.push(ws);
  }
  const d = sp.demon;
  const poly = (world.demonPoly || []).slice();
  const gates = d.gates.map((g) => ({ id: id++, key: g.key, x: g.x, z: g.z, tier: g.tier, main: !!g.main, pass: { x: g.pass.x, z: g.pass.z }, ox: g.ox, oz: g.oz }));
  const main = gates.find((g) => g.main) || gates[0];
  sites.demon = {
    gates, lord: { x: d.lord.x, z: d.lord.z }, lands: [0, 0, 0, 0], landsPoly: poly, ring: d.ring,
    // deprecated orc-shaped data for old readers (hud_map, horde.js, ai_world): camps = gate pads (first = main gate, tier 4) + bowl guard posts
    camps: [{ id: main.id, x: main.x, z: main.z, tier: 4, kind: 'warcamp' }, ...gates.filter((g) => g !== main).map((g) => ({ id: g.id, x: g.x, z: g.z, tier: g.tier + 1, kind: 'fort' })), ...d.camps.map((c) => ({ id: id++, x: c.x, z: c.z, tier: c.tier, kind: c.kind }))],
    warcamp: { x: main.x, z: main.z }, warlord: { x: d.lord.x, z: d.lord.z },
  };
  if (poly.length) {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    sites.demon.lands = [x0, z0, x1, z1];
  }
  sites.orc = sites.demon;
  sites.frontPath = sp.front.map((p) => [p[0], p[1]]);
  for (const [k, line] of Object.entries(sp.gateRoutes || {})) sites.gateRoutes[k] = line.map((p) => [p[0], p[1]]);
  // where the front passes each town (nearest path vertex) and the cumulative distance there
  {
    const fp = sites.frontPath, cum = [0];
    for (let i = 1; i < fp.length; i++) cum.push(cum[i - 1] + Math.hypot(fp[i][0] - fp[i - 1][0], fp[i][1] - fp[i - 1][1]));
    sites.frontLen = cum[cum.length - 1] || 0;
    const stops = [];
    for (const t of sites.towns) {
      let bi = 0, bd = 1e9;
      fp.forEach((p, i) => { const dd = Math.hypot(p[0] - t.x, p[1] - t.z); if (dd < bd) { bd = dd; bi = i; } });
      stops.push({ townId: t.id, i: bi, dist: Math.round(cum[bi]), off: Math.round(bd) });
    }
    sites.frontStops = stops.sort((a, b) => a.i - b.i);
  }
  for (const l of sp.lairs) sites.lairs.push({ id: id++, x: l.x, z: l.z, tier: l.tier, quadrant: quadOf(l.x, l.z) });
  for (const dg of sp.dungeons) sites.dungeons.push({ id: id++, x: dg.x, z: dg.z, tier: dg.tier, theme: dg.theme, name: dg.name, quadrant: dg.centre ? -1 : quadOf(dg.x, dg.z) });
  for (const p of sp.pois) sites.pois.push({ id: id++, type: p.type, x: p.x, z: p.z, quadrant: quadOf(p.x, p.z) });
  sites.heroSpawns = sp.heroSpawns.map((h) => ({ x: h.x, z: h.z }));
  // deprecated: regions = towns (v0.3 readers)
  for (const t of sites.towns) sites.regions.push({ id: t.id, name: t.name, x: t.x, z: t.z, r: t.r, kind: 'free', home: -1, nodeIdx: -1, tier: 1, wsId: t.wsId });
  return sites;
}
