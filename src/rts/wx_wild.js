// WORLD lane: monster camps (respawning), temple guardian, wildlife herds, roaming packs, the Great Behemoth, supply caravans.
import { emit } from './core.js';
import { CAMP_TABLE } from '../data.js';
import { spawnN, announce, dropLoot, killQuiet, wx } from './neutrals.js';
import { newSite, makeSiteNode, guardsFor } from './wx_sites.js';
import { rotK } from './wx_place.js';

const alive = (st, id) => { const u = st.byId.get(id); return !!(u && u.alive); };
const anyAlive = (st, ids) => ids.some((id) => alive(st, id));

export function populate(st, reach) {
  const w = st.world;
  for (const c of w.features.camps) {
    const s = newSite(st, 'camp', c.temple ? 'temple' : 'camp', c.x, c.z, { name: c.temple ? 'Temple Guard' : 'Monster Camp', tier: c.tier, r: 10, temple: !!c.temple, baseTier: c.tier });
    s.guards = spawnTypes(st, s, c.types);
  }
  const bs = w.features.boss;
  const t = newSite(st, 'temple', 'temple', 0, 0, { name: 'Sunken Temple', r: 16 });
  const king = spawnN(st, 'king', -1, bs.x, bs.z, { site: t.id });
  t.guardian = king ? king.id : 0; t.guards = king ? [king.id] : [];
  // dormant Great Behemoth in a lair at 38 m from the centre, on a diagonal-free axis
  const k0 = Math.floor(st.rng() * 4);
  let lair = null;
  for (let a = 0; a < 4 && !lair; a++) for (const r of [38, 46, 54, 30]) { const [x, z] = rotK(0, -r, (k0 + a) % 4); if (reach(x, z) && w.walkable(x, z) && w.slopeAt(x, z) < 0.5) { lair = { x, z }; break; } }
  if (lair) {
    const u = spawnN(st, 'behemoth', -1, lair.x, lair.z, { site: t.id, aggro: 0, after: { dormant: true } });
    wx(st).behemoth = u ? u.id : 0; t.lair = lair;
  }
  // caravans: hamlet of quadrant k <-> farmstead of quadrant k+1
  const ham = st.neutral.filter((s) => s.kind === 'village' && s.ti === 0), farm = st.neutral.filter((s) => s.kind === 'village' && s.ti === 1);
  for (let k = 0; k < 4; k++) {
    const a = ham.find((s) => s.quad === k), b = farm.find((s) => s.quad === (k + 1) % 4);
    if (!a || !b) continue;
    const c = newSite(st, 'caravan', 'caravan', a.x, a.z, { name: 'Supply Caravan', r: 4, route: [walkNear(st, a.x + 6, a.z + 6), walkNear(st, b.x - 6, b.z - 6)], leg: 1, wagon: 0, state: 'idle', respawnAt: 150 + k * 20 });
    c.a = a.id; c.b = b.id;
  }
}
function walkNear(st, x, z) {
  const w = st.world;
  for (let R = 0; R < 30; R += 2) for (let i = 0; i < 12; i++) { const a = i * 0.5236 + R, px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R; if (w.walkable(px, pz) && w.walkable(px + 2, pz) && w.walkable(px, pz + 2) && w.slopeAt(px, pz) < 0.45) return { x: px, z: pz }; }
  return { x, z };
}
function spawnTypes(st, s, types) {
  const out = [];
  types.forEach((k, i) => {
    const a = (i / types.length) * 6.283 + 0.5, px = s.x + Math.cos(a) * 3.5, pz = s.z + Math.sin(a) * 3.5;
    const p = st.world.walkable(px, pz) ? { x: px, z: pz } : { x: s.x, z: s.z };
    const u = spawnN(st, k, -1, p.x, p.z, { site: s.id }); if (u) out.push(u.id);
  });
  return out;
}

function campStep(st, s) {
  if (anyAlive(st, s.guards)) { s.respawnAt = 0; return; }
  if (s.temple) return;
  if (!s.respawnAt) { s.respawnAt = st.t + 300; return; }
  if (st.t < s.respawnAt) return;
  const nearby = st.ents.some((e) => e.alive && e.team >= 0 && (e.x - s.x) ** 2 + (e.z - s.z) ** 2 < 30 * 30);
  if (nearby) return;
  s.tier = Math.min(3, s.baseTier + (st.t > 600 ? 1 : 0));
  const tbl = CAMP_TABLE[s.guardBiome ?? st.world.biomeAt(s.x, s.z)] || CAMP_TABLE[0];
  s.guards = spawnTypes(st, s, tbl[Math.min(tbl.length, s.tier) - 1]); s.respawnAt = 0;
}
function herdStep(st, s, dt) {
  s.t = (s.t || 0) + dt;
  const live = [];
  for (const id of s.animals) {
    const u = st.byId.get(id);
    if (u && u.alive) { live.push(id); continue; }
    if (u && !u.carcass) { u.carcass = true; makeSiteNode(st, 'herd', 'blood', u.x, u.z, 90, { name: 'Carcass', slots: 3, regrow: 0 }); }
  }
  s.animals = s.animals.filter((id) => st.byId.get(id) && st.byId.get(id).alive || false);
  if (s.t % 12 < dt) for (const id of live) { const u = st.byId.get(id); const px = s.x + (st.rng() - 0.5) * 22, pz = s.z + (st.rng() - 0.5) * 22; if (st.world.walkable(px, pz) && !(u.order && u.order.type === 'attack')) { u.orders = [{ type: 'move', x: px, z: pz }]; u.order = u.orders[0]; } }
  if (live.length < 3) { s.regrowT = (s.regrowT || 0) + dt; if (s.regrowT > 240) { s.regrowT = 0; const u = spawnN(st, s.type === 'deer' ? 'deer' : 'boar', -1, s.x, s.z, { site: s.id, aggro: 0, herd: true }); if (u) s.animals.push(u.id); } }
}
function roamStep(st, s, dt) {
  s.guards = s.guards.filter((id) => alive(st, id));
  s.t = (s.t || 0) + dt;
  if (!s.guards.length) { s.dead = (s.dead || 0) + dt; if (s.dead > 360) { s.dead = 0; const type = s.kind === 'bear' ? 'bear' : 'wolf'; for (let i = 0; i < (s.kind === 'bear' ? 1 : 4); i++) { const u = spawnN(st, type, -1, s.ox ?? s.x, s.oz ?? s.z, { site: s.id }); if (u) s.guards.push(u.id); } } return; }
  if (s.ox == null) { s.ox = s.x; s.oz = s.z; }
  if (s.t >= (s.next || 40)) {
    s.t = 0; s.next = 35 + st.rng() * 40;
    const a = st.rng() * 6.283, d = 12 + st.rng() * 24, px = s.ox + Math.cos(a) * d, pz = s.oz + Math.sin(a) * d;
    if (!st.world.walkable(px, pz)) return;
    for (const id of s.guards) { const u = st.byId.get(id); u.home = { x: px, z: pz }; if (!u.order) { u.orders = [{ type: 'amove', x: px, z: pz }]; u.order = u.orders[0]; } }
    s.x = px; s.z = pz;
  }
}
function caravanStep(st, s, dt) {
  const wg = s.wagon ? st.byId.get(s.wagon) : null;
  if (s.state === 'idle' || s.state === 'dead') {
    if (st.t < s.respawnAt) return;
    const p = s.route[0];
    const u = spawnN(st, 'wx_wagon', -1, p.x, p.z, { site: s.id, aggro: 0 });
    if (!u) return;
    s.wagon = u.id; s.state = 'moving'; s.leg = 1; s.guards = [];
    for (let i = 0; i < 3; i++) { const g = spawnN(st, 'wx_guard', -1, p.x + (i - 1) * 2, p.z - 2, { site: s.id }); if (g) s.guards.push(g.id); }
    s.cargo = { gold: 110, timber: 70, stone: 50, blood: 50 };
    u.orders = [{ type: 'move', x: s.route[1].x, z: s.route[1].z }]; u.order = u.orders[0];
    return;
  }
  if (!wg || !wg.alive) {
    if (wg) { dropLoot(st, wg.x, wg.z, { res: s.cargo }); announce(st, 'A supply caravan was destroyed - its cargo lies scattered.'); }
    s.state = 'dead'; s.wagon = 0; s.respawnAt = st.t + 240; return;
  }
  s.x = wg.x; s.z = wg.z;
  const dest = s.route[s.leg];
  if ((wg.x - dest.x) ** 2 + (wg.z - dest.z) ** 2 < 49) {
    const vil = st.byId.get(s.leg === 1 ? s.b : s.a);
    if (vil && vil.owner >= 0 && vil.state !== 'burned') { st.teams[vil.owner].res.gold += 35; st.teams[vil.owner].res.blood += 20; }
    s.leg = 1 - s.leg; dest.t = 0;
    const nd = s.route[s.leg]; wg.orders = [{ type: 'move', x: nd.x, z: nd.z }]; wg.order = wg.orders[0];
  } else if (!wg.order) { wg.orders = [{ type: 'move', x: dest.x, z: dest.z }]; wg.order = wg.orders[0]; }
  for (const id of s.guards) { const g = st.byId.get(id); if (g && g.alive) g.home = { x: wg.x, z: wg.z }; }
}
export function slow(st, dt) {
  const w = wx(st);
  for (const s of st.neutral) {
    if (s.kind === 'camp') campStep(st, s);
    else if (s.kind === 'herd') herdStep(st, s, dt);
    else if (s.kind === 'wolfpack' || s.kind === 'bear') roamStep(st, s, dt);
    else if (s.kind === 'caravan') caravanStep(st, s, dt);
  }
  // Great Behemoth: wakes with events, then rampages between sites
  const b = w.behemoth ? st.byId.get(w.behemoth) : null;
  if (b && b.alive && !b.dormant) {
    b.rampT = (b.rampT || 0) - dt;
    if (b.rampT <= 0 && !b.order) {
      b.rampT = 30;
      const c = st.neutral.filter((s) => s.owner >= 0 && s.kind !== 'pickup');
      const pick = c.length ? c[Math.floor(st.rng() * c.length)] : null;
      if (pick) { b.orders = [{ type: 'amove', x: pick.x, z: pick.z }]; b.order = b.orders[0]; b.home = { x: pick.x, z: pick.z }; }
    }
  }
}
export function fast(st, dt) {}
