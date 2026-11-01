// WORLD lane: read-only API for other lanes / UI: mods, templeState, describe, rates, soulBonus, worldVision.
import { mods as m } from './weather.js';
import { templeState as ts } from './events.js';
import { wx } from './neutrals.js';
import { TIMES, MERC_OFFERS, RELICS } from './world_data.js';

// WorldX.mods(st, unit) -> {speed, dmg, vision, fire, ranged, armor, regen, stealth, work}. Multipliers (1 = none) except armor/regen (additive). Defensive: always returns an object.
export const mods = (st, u) => { try { return m(st, u); } catch (e) { return { speed: 1, dmg: 1, vision: 1, fire: 1, ranged: 1, armor: 0, regen: 0, stealth: false, work: 1 }; } };
export const templeState = ts;
export function worldVision(st, team) { const w = wx(st); return (w.vision && w.vision[team]) || []; }
// multiplier for souls from deaths at (x,z): haunted battlefields and the Dread Moon
export function soulBonus(st, x, z) {
  let k = 1;
  for (const s of st.neutral) if (s.kind === 'battlefield' && (s.x - x) ** 2 + (s.z - z) ** 2 < s.r * s.r) { k = 1.5; break; }
  if (st.events2 && st.events2.dread) k *= 2;
  return k;
}
export function rates(st, team) {
  const r = { gold: 0, blood: 0, souls: 0, mana: 0 }, key = st.teams[team].faction.key;
  for (const s of st.neutral) {
    if (s.owner !== team) continue;
    if (s.kind === 'village' && s.state !== 'burned') { const k = (s.allied ? 1.2 : 1) * s.prosperity; r.gold += TIMES.village.income.gold * k; r.blood += TIMES.village.income.blood * k; }
    else if (s.kind === 'graveyard') { r.souls += key === 'necro' ? 0.6 : 0.35; if (key === 'necro') r.mana += 0.6; }
    else if (s.kind === 'altar') r.blood += 0.35;
    else if (s.kind === 'leyline') r.mana += 1.2;
  }
  const t = st.teams[team], w = wx(st);
  for (const id of w.carriers) { const c = st.byId.get(id); if (c && c.alive && c.team === team && c.relics) for (const q of c.relics) { const d = RELICS[q]; if (d && d.mana) r.mana += d.mana; if (d && d.souls) r.souls += d.souls; } }
  return r;
}
export function describe(st, id) {
  const s = id && typeof id === 'object' ? id : st.byId.get(id);
  if (!s || !s.kind) return null;
  const o = { id: s.id, kind: s.kind, name: s.name, owner: s.owner, x: s.x, z: s.z, status: s.state, lines: [], actions: [] };
  const cap = s.cap && s.cap.p > 0 ? Math.round(s.cap.p * 100) : 0;
  switch (s.kind) {
    case 'village':
      o.lines.push(s.state === 'burned' ? 'Burned to the ground.' : `Income ${TIMES.village.income.gold} Tithe + ${TIMES.village.income.blood} Blood /s. Prosperity ${Math.round(s.prosperity * 100)}%.`);
      if (s.state !== 'burned') {
        if (s.owner === -1) o.actions.push({ t: 'allyVillage', site: s.id, label: 'Ally (200 Tithe)' });
        if (s.owner >= 0) o.actions.push({ t: 'levy', site: s.id, label: 'Levy 3 militia (50 Tithe)', ready: !!s.levyReady, in: Math.ceil(s.levyT) });
        o.actions.push({ t: 'raid', site: s.id, label: 'Raid / burn' });
      }
      break;
    case 'ruin': o.lines.push(s.state === 'guarded' ? 'Guarded. Clear the monsters to claim a relic.' : 'Plundered.'); if (s.relic) o.lines.push('Holds: ' + RELICS[s.relic].name); break;
    case 'graveyard': o.lines.push('Souls trickle for the holder; necromancers draw mana and raise skeletons at night.'); break;
    case 'altar': o.lines.push('Sacrifice up to 3 units for souls and a frenzy.'); o.actions.push({ t: 'altarRite', site: s.id, label: 'Sacrifice (selected)' }); break;
    case 'leyline': o.lines.push('+1.2 mana/s; magic towers within 24 m gain +25%.'); break;
    case 'beacon': o.lines.push('Lit beacon reveals the surroundings and warns of intruders.'); break;
    case 'mercs': case 'trader':
      for (const q of s.offers) o.actions.push({ t: s.kind === 'mercs' ? 'hireMerc' : 'buyUnit', site: s.id, unit: q.unit, label: `${q.unit} x${q.n}`, cost: q.cost, have: q.have });
      break;
    case 'shrine': o.lines.push(`Blessing: ${s.buff}. ${s.cd > 0 ? 'Recharging ' + Math.ceil(s.cd) + 's' : 'Stand close for 3s.'}`); break;
    case 'grove': o.lines.push('Rich timber - but chopping wakes the dead.'); break;
    case 'battlefield': o.lines.push('Deaths here yield 50% more souls.'); break;
    case 'vein': o.lines.push(s.revealed ? 'A rich gold vein.' : 'Something glints beneath the soil...'); break;
    case 'portal': o.lines.push('Armies standing in the ring are carried to the far gate.'); break;
    case 'temple': { const T = st.temple; o.lines.push(T.open ? `Ritual ${Math.round(T.t)}/${T.need}s` + (T.contested ? ' (contested)' : '') : 'Sealed by the guardian.'); break; }
    case 'throne': o.lines.push('A holder gains a relic every 6 minutes.'); break;
    default: break;
  }
  if (cap) o.lines.push(`Capturing ${cap}%`);
  return o;
}
void MERC_OFFERS;
