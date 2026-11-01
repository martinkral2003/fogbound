// FOGBOUND: DOMINION wall system (WALLS+SIEGE+NAV lane). Pieces are buildings with `wall` set; see wdata.js for types.
// Exports: command (buildline, wallUpgrade, gate), update, line/rect/ring (geometry), breaches, enclosed, initPiece, ensureDefs, wallBuff, damageBld, ignite
import * as Buildings from './buildings.js';
import * as Econ from './econ.js';
import * as Combat from './combat.js';
import * as Nav from './nav.js';
import * as Towers from './towers.js';
import { registerDefs } from './bdata.js';
import { emit, killBld } from './core.js';
import { ALL_DEFS, LOOK, TIERS, TIER_UP, TOWER_UP, TOWER_TIERS, TURRETS, TURRET_ALIAS } from './wdata.js';
import { tickFire, ignite as igniteFn } from './wall_fire.js';
export { line, rect, ring } from './wall_geo.js';

export const WALL_PIECES = ALL_DEFS;
export const ignite = igniteFn;
let registered = false;
export function ensureDefs() {
  if (registered) return;
  registered = true;
  registerDefs(ALL_DEFS);
  if (Buildings.BUILDINGS && !Buildings.BUILDINGS.wall) Object.assign(Buildings.BUILDINGS, ALL_DEFS); // stub fallback
}
const fkey = (st, team) => st.teams[team].faction.key;
const defOf = (type) => (Buildings.def ? Buildings.def(type) : null) || ALL_DEFS[type];
const wdef = (type) => ALL_DEFS[type] || null;
const operational = (b) => b.state === 'ready' || b.state === 'upgrading' || b.state === 'burning';

// finish a freshly created piece: wall record, tier-scaled hp, turret slot, faction look. Idempotent.
export function initPiece(st, b) {
  const d = wdef(b.type);
  if (!d || b._wi) return;
  b._wi = true;
  b.wall = Object.assign({}, d.wall, b.wall || {}, { look: LOOK[fkey(st, b.team)] });
  b.w = d.w; b.d = d.d; b.h = d.h;
  if (b.armor === undefined || b.armor === 0) b.armor = d.armor;
  b.towerTier = b.towerTier || 0;
  const mx = maxHpOf(st, b), ratio = b.maxHp > 0 && b.hp > 0 ? Math.min(1, b.hp / b.maxHp) : (operational(b) ? 1 : 0.5);
  b.maxHp = mx; b.hp = Math.max(1, Math.round(mx * (operational(b) ? 1 : ratio)));
  if (d.turret && d.turret !== 'none') b.turret = { kind: d.turret, cd: 0, target: 0, scan: 0 };
  else if (d.turret === 'none') b.turret = null;
}
export function maxHpOf(st, b) {
  const d = wdef(b.type);
  const base = d.hp / (d.turret ? 1 : TIERS[d.wall.tier].hp);
  let hp = d.turret ? d.hp * TOWER_TIERS[b.towerTier || 0].hp : base * TIERS[b.wall.tier == null ? d.wall.tier : b.wall.tier].hp;
  const fx = st.teams[b.team] && st.teams[b.team].fx;
  if (fx && fx.wallhp) hp *= 1 + fx.wallhp;
  return Math.round(hp);
}
export const tierOf = (b) => (b.wall ? b.wall.tier : 0);

// direct structure damage (bypasses unit-armour maths). mul: attacker multiplier; siege weapons use Siege.hit which calls this
export function damageBld(st, src, b, amt, o = {}) {
  if (!b || b.hp <= 0 || b.state === 'ruin') return 0;
  const t = b.wall ? TIERS[b.wall.tier] : null;
  let dmg = amt * (o.siege && t ? t.siegeRes : 1);
  b.hp -= dmg; b.hitT = st.t;
  emit(st, { type: 'hit', src: src ? src.id : 0, tgt: b.id, amt: dmg, dtype: o.fire ? 'fire' : o.siege ? 'siege' : 'physical', crit: false, x: b.x, z: b.z });
  if (b.hp <= 0) killBld(st, b, src);
  return dmg;
}

// ---------------------------------------------------------------- commands
export function command(st, teamId, cmd) {
  ensureDefs();
  if (cmd.t === 'buildline') return buildLine(st, teamId, cmd);
  if (cmd.t === 'wallUpgrade') return upgradeCmd(st, teamId, cmd);
  if (cmd.t === 'gate') {
    for (const id of cmd.ids || []) {
      const b = st.byId.get(id);
      if (b && b.team === teamId && b.wall && b.wall.passable) { b.wall.locked = cmd.locked === undefined ? !b.wall.locked : !!cmd.locked; Nav.dirty(st); }
    }
    return true;
  }
  return false;
}
function buildLine(st, teamId, cmd) {
  const team = st.teams[teamId], placed = [], skipped = [];
  const pieces = (cmd.pieces || []).slice(0, 80);
  const workers = (cmd.workers || []).map((id) => st.byId.get(id)).filter((u) => u && u.team === teamId && u.alive);
  for (const p of pieces) {
    const d = defOf(p.type); if (!d) continue;
    const err = cmd.instant && st.cheats ? null : Buildings.canPlace(st, teamId, p.type, p.x, p.z, p.rot);
    if (err) { skipped.push({ ...p, why: err }); continue; }
    const c = d.cost || {};
    if (!Econ.canAfford(team, c)) { skipped.push({ ...p, why: 'cost' }); break; }
    Econ.spend(team, c);
    const b = Buildings.create(st, p.type, teamId, p.x, p.z, p.rot, { instant: !!(cmd.instant && st.cheats) });
    initPiece(st, b);
    placed.push(b);
  }
  if (workers.length) {
    placed.forEach((b, i) => {
      for (let k = 0; k < Math.min(2, workers.length); k++) { // two workers per piece so runs go up quickly
        const w = workers[(i + k) % workers.length];
        const o = { type: 'build', bld: b.id };
        if (!w.orders) w.orders = [];
        w.orders.push(o); if (!w.order) w.order = w.orders[0];
      }
    });
  }
  if (placed.length) Nav.dirty(st);
  if (skipped.length) emit(st, { type: 'msg', team: teamId, text: skipped.length + ' wall pieces could not be placed (' + skipped[0].why + ')', kind: 'warn' });
  return true;
}
function upgradeCmd(st, teamId, cmd) {
  const team = st.teams[teamId];
  for (const id of cmd.ids || []) {
    const b = st.byId.get(id);
    if (!b || b.team !== teamId || !b.wall || !operational(b) || b.wall.upT) continue;
    const isT = !!b.turret || (wdef(b.type) && wdef(b.type).turret);
    const lvl = isT ? b.towerTier || 0 : b.wall.tier;
    const maxLvl = isT ? TOWER_TIERS.length - 1 : cmd.tier != null ? Math.min(2, cmd.tier) : 2;
    if (lvl >= maxLvl) continue;
    if (b.wall.piece === 'ladder' || b.wall.piece === 'spikes' || b.wall.piece === 'moat') continue;
    const c = isT ? TOWER_UP[lvl] : TIER_UP[lvl];
    if (!Econ.canAfford(team, c)) { emit(st, { type: 'msg', team: teamId, text: 'Not enough resources to upgrade', kind: 'warn' }); break; }
    Econ.spend(team, c);
    b.wall.upT = 6 + lvl * 4; b.wall.upTo = lvl + 1; b.wall.upTower = isT;
  }
  return true;
}
function finishUpgrade(st, b) {
  const ratio = b.hp / b.maxHp;
  if (b.wall.upTower) b.towerTier = b.wall.upTo; else {
    b.wall.tier = b.wall.upTo;
    if (b.type === 'palisade') { b.type = 'wall'; b.w = 4; b.d = 1.3; b.h = 4.5; b.wall.piece = 'wall'; b.wall.walkable = true; b.wall.height = 4.5; b.armor = wdef('wall').armor; }
    b.armor = Math.max(b.armor, TIERS[b.wall.tier].armor);
  }
  b.wall.upT = 0; b.maxHp = maxHpOf(st, b); b.hp = Math.min(b.maxHp, Math.round(b.maxHp * Math.max(ratio, 0.5)));
  emit(st, { type: 'built', id: b.id, x: b.x, z: b.z, upgrade: true });
  Nav.dirty(st);
}

// ---------------------------------------------------------------- per tick
export function update(st, dt) {
  ensureDefs();
  let sig = st.blds.length;
  const seenRuin = [];
  for (const b of st.blds) {
    if (!b._wi && wdef(b.type)) initPiece(st, b);
    sig = (sig * 31 + b.id + (b.state === 'ruin' ? 5 : operational(b) ? 11 : 3) + (b.wall && b.wall.locked ? 17 : 0) + ((b.wall && b.wall.tier) || 0) * 7) | 0;
    if (!b.wall) continue;
    if (b.state === 'ruin' && !b._rs) { b._rs = true; noteRuin(st, b); }
    if (b.wall.upT > 0 && operational(b)) { b.wall.upT -= dt; if (b.wall.upT <= 0) finishUpgrade(st, b); }
  }
  if (st.nav && st.nav.sig !== sig) { st.nav.sig = sig; Nav.dirty(st); }
  gateAnim(st, dt);
  tickFire(st, dt);
  wallWalkers(st, dt);
  hazards(st, dt);
  Towers.update(st, dt);
}

const ruinLists = (st, team) => (st.teams[team].breachList || (st.teams[team].breachList = []));
function noteRuin(st, b) {
  if (b.wall.piece === 'ladder' || b.wall.piece === 'spikes') return;
  ruinLists(st, b.team).push({ x: b.x, z: b.z, rot: b.rot, type: b.type, t: st.t, id: b.id, gate: !!b.wall.passable });
  emit(st, { type: 'collapse', id: b.id, x: b.x, z: b.z });
}

function gateAnim(st, dt) {
  for (const b of st.blds) {
    if (!b.wall || !b.wall.passable || !operational(b)) continue;
    let near = 0;
    if (!b.wall.locked) for (const u of st.ents) { if (u.alive && Nav.allied(st, u.team, b.team) && Math.abs(u.x - b.x) < 5 && Math.abs(u.z - b.z) < 5) { near = 1; break; } }
    const a = b.wall.anim || 0;
    b.wall.anim = near ? Math.min(1, a + dt * 2.5) : Math.max(0, a - dt * 1.5);
    b.wall.open = b.wall.anim > 0.5;
  }
}

// wall-top layer: heights, bonuses, falling when the piece beneath is destroyed
export function wallBuff(u) { return u.wallBuff || null; }
function wallWalkers(st, dt) {
  const nav = st.nav; if (!nav) return;
  let any = false;
  for (const u of st.ents) if (u.alive && u.layer === 'wall') { any = true; break; }
  if (!any) { return; }
  if (nav.dirty) Nav.rebuild(st);
  const W = nav.wall;
  for (const u of st.ents) {
    if (!u.alive || u.layer !== 'wall') { if (u.wallBuff) u.wallBuff = null; continue; }
    const y = heightOf(st, u);
    const k = u.wallNode !== undefined ? W.byId.get(u.wallNode) : undefined;
    const n = k !== undefined ? W.nodes[k] : null;
    if (!n || Math.hypot(n.x - u.x, n.z - u.z) > n.b.w * 0.5 + 2) { fall(st, u); continue; }
    u.y += (y - u.y) * Math.min(1, dt * 8);
    const ranged = u.role === 'ranged' || u.role === 'caster' || (u.atk && u.atk.range > 4);
    u.hgt = n.hgt;
    u.wallBuff = ranged ? { range: 1.25, dmg: 1.1, vision: 1.3, def: 1.15 } : { range: 1, dmg: 1.05, vision: 1.15, def: 1.25 };
  }
}
import { heightFor } from './nav_wall.js';
const heightOf = (st, u) => heightFor(st, u);
function fall(st, u) {
  u.layer = 'ground'; u.wallNode = undefined; u.wallBuff = null; u.hgt = 0; u.y = st.world.heightAt(u.x, u.z);
  Combat.damage(st, null, u, 18 + st.rng() * 10, { dtype: 'physical', fall: true });
}

// spike lines hurt and slow hostile units; moats slow them (u.wslow is read by the movement code, 1 = no slow)
function hazards(st, dt) {
  let zones = null;
  for (const b of st.blds) if (b.wall && (b.wall.piece === 'spikes' || b.wall.piece === 'moat') && operational(b)) (zones || (zones = [])).push(b);
  if (!zones) return;
  for (const u of st.ents) {
    if (!u.alive || u.layer === 'wall') continue;
    u.wslow = 1;
    for (const b of zones) {
      if (u.team === b.team) continue;
      if (Math.abs(u.x - b.x) > b.w || Math.abs(u.z - b.z) > b.w) continue;
      const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0), dx = u.x - b.x, dz = u.z - b.z;
      if (Math.abs(dx * c + dz * s) > b.w / 2 + 0.3 || Math.abs(-dx * s + dz * c) > b.d / 2 + 0.3) continue;
      u.wslow = Math.min(u.wslow, b.wall.slow || 1);
      if (b.wall.dps) Combat.damage(st, b, u, b.wall.dps * dt, { dtype: 'physical' });
    }
  }
}

// ---------------------------------------------------------------- AI helpers
// breaches: gaps left by destroyed pieces that are still open, plus gates (weak points). -> [{x,z,kind:'gap'|'gate',id?,w}]
export function breaches(st, teamId) {
  for (const b of st.blds) if (b.wall && b.state === 'ruin' && !b._rs) { b._rs = true; noteRuin(st, b); }
  const out = [], lst = ruinLists(st, teamId);
  for (let i = lst.length - 1; i >= 0; i--) {
    const r = lst[i];
    if (Nav.blockerAt && alivePieceAt(st, teamId, r.x, r.z)) { lst.splice(i, 1); continue; } // rebuilt
    if (!out.some((o) => Math.hypot(o.x - r.x, o.z - r.z) < 6)) out.push({ x: r.x, z: r.z, kind: r.gate ? 'gate' : 'gap', w: 4, t: r.t });
  }
  for (const b of st.blds) if (b.team === teamId && b.wall && b.wall.passable && operational(b)) out.push({ x: b.x, z: b.z, kind: 'gate', id: b.id, w: b.w, hp: b.hp });
  return out;
}
function alivePieceAt(st, team, x, z) {
  for (const b of st.blds) if (b.team === team && b.wall && b.hp > 0 && b.state !== 'ruin' && Math.abs(b.x - x) < 1.6 && Math.abs(b.z - z) < 1.6) return true;
  return false;
}
// is the team's keep sealed off from the outside by its own buildings? (flood fill that treats own buildings as walls)
export function enclosed(st, teamId) {
  const nav = st.nav; if (!nav) return false;
  if (nav.dirty) Nav.rebuild(st);
  const keep = st.teams[teamId].keep; if (!keep) return false;
  const N = nav.N, seen = new Uint8Array(N * N);
  const start = Nav.cellOf(keep.x, keep.z);
  const stack = [start]; seen[start] = 1; let n = 0;
  while (stack.length) {
    const c = stack.pop(); n++;
    if (n > 2500) return false;
    const i = c % N, j = (c / N) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) return false;
      const k = nj * N + ni;
      if (seen[k] || nav.terr[k]) continue;
      if (nav.bkind[k] === 1 || nav.bkind[k] === 2) { if (nav.bteam[k] === teamId && nav.bld[k] !== keep.id) continue; }
      seen[k] = 1; stack.push(k);
    }
  }
  return true;
}
