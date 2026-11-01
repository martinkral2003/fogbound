// WORLD lane: site creation (populate). Every site is a st.neutral entry {id, kind, type, x, z, owner:-1, quad, ...}.
import { CAMP_TABLE } from '../data.js';
import { TEMPLATES, SITE_R, RELIC_ORDER, MERC_OFFERS, TRADER_OFFERS } from './world_data.js';
import { spawnN } from './neutrals.js';
import { rotK } from './wx_place.js';

const NAMES = {
  village: ['Ashford', 'Hollowmere', 'Cinder Row', 'Gallows End', 'Pyre Hamlet', 'Rookhaven', 'Mournfield', 'Black Ferry', 'Thornwick', 'Grimstead', 'Wyrmrest', 'Saltcairn'],
  ruin: ['Ruined Chapel', 'Broken Watchtower', 'Sunken Crypt', 'Shattered Hall', 'Old Barrow', 'Drowned Abbey'],
  graveyard: ['Pauper\'s Rest', 'Hollow Barrow', 'Bone Orchard', 'Mourners\' Field'], altar: ['Blood Altar', 'Red Stone', 'Flayed Obelisk', 'Sacrifice Rock'],
  leyline: ['Ley Node', 'Ley Confluence', 'Wyrd Stone', 'Ley Spring'], beacon: ['Watch-Beacon', 'Ember Tower', 'Far Light', 'Hilltop Brazier'],
  mercs: ['Sellsword Camp', 'Iron Compact', 'Ravens\' Lodge', 'Free Company'], shrine: ['Hermit Shrine', 'Moss Hut', 'Seer\'s Cairn', 'Hag\'s Hearth'],
  grove: ['Cursed Grove', 'Whisperwood', 'Hanged Trees', 'Rot Thicket'], battlefield: ['Haunted Battlefield', 'Field of Crows', 'Bone Plain', 'Lost Muster'],
  vein: ['Hidden Vein', 'Buried Seam', 'Lost Lode', 'Dwarf Cache'], trader: ['Soul Trader', 'Pale Merchant', 'Bone Broker', 'Wight Fair'],
  throne: ['Cursed Throne', 'Hollow Seat', 'Crown of Ash', 'Weeping Throne'], fogbank: ['Haunted Fog', 'Grey Shroud', 'Mourning Mist', 'Wraith Veil'],
  portal: ['Gate of Hell', 'Hell Gate', 'Maw Gate', 'Cinder Gate'], herd: ['Deer Meadow', 'Boar Wallow'], wolfpack: ['Wolf Den'], bear: ['Bear Cave'],
};
const INFL = { village: 24, beacon: 16, leyline: 14, graveyard: 16, altar: 12, throne: 12, mercs: 0 };
const pick = (kind, i) => { const a = NAMES[kind] || [kind]; return a[i % a.length]; };

function ringPts(st, x, z, r, n, tol = 3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < 6; t++) {
      const a = (i / n) * 6.283 + t * 0.4, rr = r * (0.7 + 0.1 * t), px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      if (st.world.walkable(px, pz) && st.world.walkable(px + tol, pz)) { out.push({ x: px, z: pz }); break; }
    }
  }
  return out;
}
export const guardsFor = (st, s, tier, scale = 1) => {
  const w = st.world, tbl = CAMP_TABLE[w.biomeAt(s.x, s.z)] || CAMP_TABLE[0];
  const types = tbl[Math.max(0, Math.min(tbl.length - 1, tier - 1))];
  const pts = ringPts(st, s.x, s.z, 5, types.length);
  const out = [];
  types.forEach((k, i) => { const p = pts[i] || { x: s.x + i, z: s.z }; const u = spawnN(st, k, -1, p.x, p.z, { site: s.id }); if (u) out.push(u.id); });
  return out;
};
export function newSite(st, kind, type, x, z, extra = {}) {
  const s = { id: st.nextId++, kind, type, x, z, y: st.world.heightAt(x, z), r: SITE_R[kind] || 6, isNeutral: true, influence: INFL[kind] || 0, owner: -1, quad: 0, cap: { team: -1, p: 0 }, guards: [], state: 'idle', name: kind, ...extra };
  st.neutral.push(s); st.byId.set(s.id, s);
  return s;
}
export function makeSiteNode(st, rtype, res, x, z, amount, extra = {}) {
  const n = { id: st.nextId++, kind: 'node', rtype, res, name: extra.name || rtype, amount, max: amount, x, z, y: st.world.heightAt(x, z), r: 4, regrow: 0, slots: 5, workers: 0, owner: -1, infinite: false, ...extra };
  st.nodes.push(n); st.byId.set(n.id, n);
  return n;
}

// create one site per placed point
export function buildSite(st, p, idx) {
  const t = TEMPLATES[p.ti], k = p.kind, nm = pick(k, p.ti + p.k);
  const s = newSite(st, k, t.type, p.x, p.z, { quad: p.k, ti: p.ti, name: nm });
  if (k === 'village') {
    Object.assign(s, { stock: { gold: 140, blood: 90 }, prosperity: 1, levyT: 60, burn: 0, huts: 4 + (p.ti % 3), allied: false });
    for (const q of ringPts(st, p.x, p.z, 6, t.guards || 3)) { const u = spawnN(st, 'wx_militia', -1, q.x, q.z, { site: s.id, aggro: 9 }); if (u) s.guards.push(u.id); }
  } else if (k === 'ruin') {
    s.relic = RELIC_ORDER[(p.ti * 5) % RELIC_ORDER.length]; s.tier = t.tier || 2; s.state = 'guarded'; s.guards = guardsFor(st, s, s.tier);
  } else if (k === 'graveyard') {
    s.skel = []; for (const q of ringPts(st, p.x, p.z, 5, 2)) { const u = spawnN(st, 'wx_zombie', -1, q.x, q.z, { site: s.id }); if (u) s.guards.push(u.id); }
  } else if (k === 'mercs') {
    s.offers = MERC_OFFERS.map((o) => ({ ...o, have: o.stock }));
  } else if (k === 'trader') {
    s.offers = TRADER_OFFERS.map((o) => ({ ...o, have: o.stock }));
  } else if (k === 'shrine') {
    s.buff = ['haste', 'might', 'ward', 'heal'][p.ti % 4]; s.cd = 0; s.act = 0;
  } else if (k === 'grove') {
    s.node = makeSiteNode(st, 'tree', 'timber', p.x, p.z, 1500, { name: 'Cursed Grove', cursed: true, wild: true }); s.ambushT = 0; s.cd = 0;
  } else if (k === 'vein') {
    s.revealed = false; s.pending = { rtype: 'mine', res: 'gold', amount: 1800, name: 'Hidden Vein', x: p.x, z: p.z };
  } else if (k === 'herd') {
    s.animals = []; const type = t.type === 'deer' ? 'deer' : 'boar';
    for (const q of ringPts(st, p.x, p.z, 5, 5)) { const u = spawnN(st, type, -1, q.x, q.z, { site: s.id, aggro: 0, herd: true }); if (u) s.animals.push(u.id); }
  } else if (k === 'wolfpack' || k === 'bear') {
    const type = k === 'bear' ? 'bear' : 'wolf', n = k === 'bear' ? 1 : 4;
    for (const q of ringPts(st, p.x, p.z, 4, n)) { const u = spawnN(st, type, -1, q.x, q.z, { site: s.id }); if (u) s.guards.push(u.id); }
    s.roam = true;
  } else if (k === 'throne') { s.heldT = 0; s.relicT = 0;
  } else if (k === 'fogbank') { s.drift = { a: (p.ti * 1.7 + p.k) % 6.28, x0: p.x, z0: p.z };
  } else if (k === 'altar') { s.rite = 0;
  } else if (k === 'portal') { s.partner = -1; s.cd = 0; s.charge = {}; }
  return s;
}
export function linkPortals(st) {
  const ps = st.neutral.filter((s) => s.kind === 'portal');
  for (const s of ps) { const q = ps.find((o) => o.quad === (s.quad + 2) % 4); if (q) s.partner = q.id; }
}
export { rotK };
