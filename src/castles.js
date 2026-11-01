// v0.6 castles: real, destructible, shooting structures (sim buildings via simApi.addBuilding).
//  * towns with a wall ring (towns / capital): invisible collision walls + towers that SHOOT demons, placed exactly where towns_view.js draws its walls and towers
//    (the visuals come from towns_view, the sim structures are model 'hidden'). Gaps at the gates stay open. When the capital falls its towers are CAPTURED (team -1: they shoot heroes);
//    a lesser town that falls loses its structures, and they are rebuilt if the town is reclaimed.
//  * the invaders' FORTRESS: an outer wall ring (two gates, 8+ towers) and an inner ring (one gate, 4 towers) around the Lord's plateau with the fortress heart (the horde 'gate' entity) in the middle.
// Sim only. Called from v3hooks (update every 1 s).
import { simApi } from './sim.js';
import * as towns from './towns.js';
import { CASTLE, STRUCTURES } from './data.js';

const TAU = Math.PI * 2;
let acc = 0;
const angDiff = (a, b) => Math.abs(((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI);

function put(st, type, team, x, z, rot, tag, o = {}) {
  if (st.world.walkable && !st.world.walkable(x, z)) return null;
  return simApi.addBuilding(st, type, team, x, z, rot, { tag, ...o });
}

// a ring of wall pieces + towers around (cx, cz). o: { r, seg, wall, tower, team, gates:[angle], gateHalf (radians), towerEvery, tag, flank }
function ring(st, cx, cz, o) {
  const n = Math.max(10, Math.round((TAU * o.r) / o.seg)), step = TAU / n, out = [];
  const nearGate = (a) => o.gates.some((g) => angDiff(a, g) < o.gateHalf);
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) * step;
    if (nearGate(a)) continue;
    const b = put(st, o.wall, o.team, cx + Math.cos(a) * o.r, cz + Math.sin(a) * o.r, a + Math.PI / 2, o.tag, { def: { ...STRUCTURES[o.wall], w: o.seg + 0.5 } });
    if (b) out.push(b);
  }
  const tw = (a) => { const b = put(st, o.tower, o.team, cx + Math.cos(a) * o.r, cz + Math.sin(a) * o.r, a + Math.PI / 2, o.tag); if (b) out.push(b); };
  for (let i = 0; i < n; i += o.towerEvery) { const a = i * step; if (!nearGate(a) && !nearGate(a + step)) tw(a); }
  if (o.flank !== false) for (const g of o.gates) for (const s of [-1, 1]) tw(g + s * (o.gateHalf + 0.012));
  return out;
}

// ---- towns ------------------------------------------------------------------------------------------------------
function buildTown(st, t) {
  const lay = t.lay || towns.layoutOf(st, t);
  if (!lay || !lay.wall) { t.castle = []; t.castleState = 'none'; return; }
  const cap = t.kind === 'capital', C = cap ? CASTLE.capital : CASTLE.town;
  t.castle = ring(st, t.x, t.z, { r: lay.wall.r, seg: 5, wall: C.wall, tower: C.tower, team: 4, gates: lay.wall.gates, gateHalf: lay.wall.gateHalf, towerEvery: 8, tag: 'town' + t.id }).map((b) => b.id);
  t.castleState = 'up';
}
function townTick(st) {
  for (const t of st.towns || []) {
    if (t.castleState === undefined) { buildTown(st, t); continue; }
    if (t.castleState === 'none') continue;
    const live = (t.castle || []).map((id) => st.byId.get(id)).filter((b) => b && b.alive);
    if (t.state === 'fallen' && t.castleState === 'up') {
      t.castleState = 'down';
      if (t.kind === 'capital') { for (const b of live) { b.team = -1; b.tgt = 0; } st.navDirty = true; st.events.push({ type: 'msg', text: 'The invaders have taken the towers of the city!', kind: 'warn' }); }
      else for (const b of live) simApi.kill(st, b, null);
    } else if (t.state !== 'fallen' && t.castleState === 'down' && t.kind !== 'capital') { t.castleState = undefined; } // reclaimed: rebuild next tick
  }
}

// ---- the fortress -----------------------------------------------------------------------------------------------
function buildFortress(st) {
  const S = st.world.sites, L = S && S.orc && S.orc.warlord ? S.orc.warlord : (S && S.demon && S.demon.lord);
  if (!L) return;
  const F = CASTLE.fortress, ids = [];
  const outer = ring(st, L.x, L.z, { r: F.outerR, seg: 4.4, wall: F.wall, tower: F.tower, team: -1, gates: [Math.PI / 2, Math.PI], gateHalf: 0.2, towerEvery: 4, tag: 'fort' });
  const inner = ring(st, L.x, L.z, { r: F.innerR, seg: 4.4, wall: F.wall, tower: F.tower, team: -1, gates: [Math.PI * 0.75], gateHalf: 0.3, towerEvery: 3, tag: 'fort', flank: true });
  for (const b of [...outer, ...inner]) ids.push(b.id);
  st.fortress = { x: L.x, z: L.z, ids, outer: outer.length, inner: inner.length };
}

export function init(st) { st.fortress = null; }
export function update(st, dt) {
  if (globalThis.__NOCASTLE) return; // debug switch for balance comparisons
  acc += dt; if (acc < 1) return; acc = 0;
  if (!st.fortress && st.horde && st.horde.ready) buildFortress(st);
  townTick(st);
}
/** the invaders' towers and walls still standing (UI / AI) */
export function fortressParts(st) { return st.fortress ? st.fortress.ids.map((id) => st.byId.get(id)).filter((b) => b && b.alive) : []; }
