// WORLD lane: neutral helpers (spawning team -1 units, grants, loot piles, relic pickup/carry/drop).
import * as Units from './units.js';
import * as Magic from './magic.js';
import { emit } from './core.js';
import { NEUTRAL_UNITS, RELICS } from './world_data.js';

export function registerAll() { try { if (Units.registerUnits) Units.registerUnits(NEUTRAL_UNITS); } catch (e) { /* UNITS lane may not have it yet */ } }
export const wx = (st) => st.wx || (st.wx = { carriers: new Set(), seq: 0 });
export const growth = (st) => 1 + 0.04 * Math.min(30, st.t / 60);

// spawn a unit (engine ids or the wx_* defs registered by registerAll); neutrals scale with time like the warlord monsters
export function spawnN(st, type, team, x, z, opts = {}) {
  const { after, ...o } = opts;
  const g = growth(st);
  const base = team < 0 ? { neutral: true, home: { x, z }, ...(g > 1.12 && !o.herd ? { scale: 1 + (g - 1) * 0.5 } : {}) } : {};
  const u = Units.spawn(st, type, team, x, z, { ...base, ...o });
  if (!u) return null;
  Object.assign(u, after || {});
  return u;
}
export function killQuiet(st, u) {
  if (!u.alive) return;
  u.alive = false; u.hp = 0;
  if (u.team >= 0 && Units.onDeath) { try { Units.onDeath(st, u); } catch (e) { /* ignore */ } }
}
export function grant(st, team, res, amt) {
  const t = st.teams[team];
  if (!t || !amt) return;
  t.res[res] = (t.res[res] || 0) + amt;
  if (t.stats && t.stats.gathered) t.stats.gathered[res] = (t.stats.gathered[res] || 0) + Math.max(0, amt);
}
export function grantAll(st, team, cost, mul = 1) { for (const r of Object.keys(cost)) grant(st, team, r, cost[r] * mul); }
export function canPay(st, team, cost) { const t = st.teams[team]; return !!t && Object.keys(cost).every((r) => (t.res[r] || 0) >= cost[r]); }
export function pay(st, team, cost) { const t = st.teams[team]; for (const r of Object.keys(cost)) t.res[r] -= cost[r]; }
export function announce(st, text, team) { emit(st, { type: 'announce', text }); if (team != null) emit(st, { type: 'msg', team, text, kind: 'world' }); }

export function nearestUnit(st, x, z, r, filter) {
  let best = null, bd = r * r;
  for (const e of st.ents) { if (!e.alive || e.team < 0) continue; const d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d <= bd && (!filter || filter(e))) { bd = d; best = e; } }
  return best;
}
export function unitsNear(st, x, z, r, filter) {
  const out = [], r2 = r * r;
  for (const e of st.ents) if (e.alive && (e.x - x) ** 2 + (e.z - z) ** 2 <= r2 && (!filter || filter(e))) out.push(e);
  return out;
}

// ---- loot piles (res and/or relic), picked up by the first team unit that walks over them
export function dropLoot(st, x, z, o) {
  const p = { id: st.nextId++, kind: 'pickup', type: o.relic ? 'relic' : 'loot', x, z, y: st.world.heightAt(x, z), owner: -1, res: o.res || null, relic: o.relic || null, ttl: o.ttl ?? 600, r: 2.6 };
  st.neutral.push(p); st.byId.set(p.id, p);
  emit(st, { type: 'neutral', what: 'loot', id: p.id, x, z });
  return p;
}
export function updatePickups(st) {
  for (let i = st.neutral.length - 1; i >= 0; i--) {
    const p = st.neutral[i];
    if (p.kind !== 'pickup') continue;
    p.ttl -= 0.5;
    if (p.ttl <= 0) { st.neutral.splice(i, 1); st.byId.delete(p.id); continue; }
    const u = nearestUnit(st, p.x, p.z, p.r, (e) => !e.garrison);
    if (!u) continue;
    if (p.res) { grantAll(st, u.team, p.res); announce(st, `${st.teams[u.team].faction.name} seized ${Object.entries(p.res).map(([k, v]) => Math.round(v) + ' ' + k).join(', ')}.`, u.team); }
    if (p.relic) takeRelic(st, u, p.relic);
    st.neutral.splice(i, 1); st.byId.delete(p.id);
  }
}
export function takeRelic(st, u, relicId) {
  const def = RELICS[relicId], t = st.teams[u.team];
  if (!def) return;
  if (def.kind === 'scroll') {
    const pool = Object.keys(Magic.SPELLS || {}).filter((k) => !t.spells[k]);
    if (pool.length) { const id = pool[Math.floor(st.rng() * pool.length)]; t.spells[id] = true; announce(st, `${t.faction.name} learned ${id} from a forbidden scroll.`, u.team); }
    else { t.scrolls = (t.scrolls || 0) + 1; announce(st, `${t.faction.name} found a spell scroll.`, u.team); }
    return;
  }
  (u.relics || (u.relics = [])).push(relicId); wx(st).carriers.add(u.id);
  if (def.kind === 'gear') { u.maxHp = Math.round(u.maxHp * def.hp); u.hp = Math.min(u.maxHp, u.hp + 60); u.armor = (u.armor || 0) + def.armor; }
  announce(st, `${u.name || u.type} bears the ${def.name}.`, u.team);
}

// carriers that died drop their relics
export function updateCarriers(st) {
  const c = wx(st).carriers;
  for (const id of [...c]) {
    const u = st.byId.get(id);
    if (u && u.alive) continue;
    c.delete(id);
    if (!u || !u.relics) continue;
    for (const r of u.relics) { const def = RELICS[r]; if (def && def.kind === 'gear') { u.maxHp = Math.round(u.maxHp / def.hp); u.armor -= def.armor; } dropLoot(st, u.x, u.z, { relic: r }); }
    u.relics = [];
  }
}
