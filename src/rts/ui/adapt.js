// FOGBOUND: DOMINION UI data adapter: defensive access to the sim lanes (feature-detected, never throws) + shared formatting.
import * as Units from '../units.js';
import * as Buildings from '../buildings.js';
import * as Magic from '../magic.js';
import * as Econ from '../econ.js';
import * as WorldX from '../world_x.js';
import { ABIL } from '../combat_abil_data.js';
import { RES, RES_ICONS, RES_NAMES } from '../consts.js';

export const ROLE_GLYPH = { worker: '⚒', melee: '⚔', ranged: '➶', cavalry: '♞', heavy: '⛨', siege: '⚙', caster: '✦', flyer: '☣', general: '♛', beast: '🐺' };
export const SLOT_KEYS = ['Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'];
export const safe = (fn, d) => { try { const v = fn(); return v === undefined ? d : v; } catch (e) { return d; } };

export const udef = (type) => safe(() => Units.def(type), null) || { type, name: String(type), role: 'melee', cost: {} };
export const bdef = (type, team) => safe(() => Buildings.def(type, team), null) || { id: type, name: String(type), cost: {}, w: 4, d: 4, h: 4, trains: [], research: [] };
export const unitName = (u) => (u.general && u.name) || udef(u.type).name || u.type;
export const roleGlyph = (role) => ROLE_GLYPH[role] || '•';
export const ageOf = (team) => (team && team.age) || 1;
export const AGE_NAMES = ['', 'Dark Age', 'Iron Age', 'Cursed Age'];
export const abilityDef = (id) => ABIL[id] || safe(() => Magic.SPELLS && Magic.SPELLS[id], null);
export const prettyId = (id) => String(id).replace(/^(necro|orc|demon|cult)_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function canAfford(team, cost) { return safe(() => Econ.canAfford(team, cost), true); }
export function costHtml(cost, team) {
  if (!cost) return '';
  return RES.filter((r) => cost[r]).map((r) => `<span class="rc ${team && (team.res[r] || 0) < cost[r] ? 'lack' : ''}" title="${RES_NAMES[r]}"><i class="ri r-${r}">${RES_ICONS[r]}</i>${cost[r]}</span>`).join(' ');
}
export function costText(cost) { return RES.filter((r) => cost && cost[r]).map((r) => cost[r] + ' ' + RES_NAMES[r]).join(', '); }

export function rates(st, teamId) { return safe(() => Econ.rates(st, teamId), null) || {}; }
export function trainList(st, b) { return safe(() => Buildings.trainList(st, b), []) || []; }
export function techList(st, teamId) { return safe(() => Buildings.techAvailable(st, teamId), []) || []; }
export function buildList(st, teamId) { return safe(() => Buildings.buildList(st, teamId), []) || []; }
export function spellList(st, teamId, caster) { return safe(() => Magic.spellsFor(st, teamId, caster), []) || []; }
export function descSpell(s) { return safe(() => Magic.descSpell(s), { title: s && s.name, lines: [s && s.desc] }); }
export function templeState(st) { return safe(() => WorldX.templeState(st), null); }
export function worldDescribe(st, ent) { return safe(() => WorldX.describe(st, ent), null); }
export function manaInfo(st, teamId) { return safe(() => Magic.manaInfo(st, teamId), null); }
export function upgradeInfo(id, lvl) { return safe(() => Buildings.production.upgradeInfo(id, lvl), null); }
export function unitUpgrades() { return safe(() => Units.UNIT_UPGRADES, {}) || {}; }
export function canTrainReason(st, b, unit) { return safe(() => Buildings.canTrain(st, b, unit), null); }

// building category for the worker build menu
export function bldCategory(d) {
  if (d.wall) return 'defense';
  if (d.trains && d.trains.length && !d.trains.every((t) => t === 'worker' || t === 'general')) return 'military';
  if (d.provides && (d.provides.mana || d.provides.wonder) || d.wonder || (d.research && d.research.some((r) => /magic|spell/.test(r)))) return 'magic';
  if (d.id === 'forge' || d.id === 'siege_workshop') return 'military';
  return 'economy';
}
export const CAT_ORDER = ['economy', 'military', 'defense', 'magic'];
export const CAT_NAMES = { economy: 'Economy', military: 'Military', defense: 'Defense', magic: 'Magic' };
export const CAT_GLYPH = { economy: '⌂', military: '⚔', defense: '▦', magic: '✦' };
export const BLD_GLYPH = { keep: '♜', house: '⌂', storehouse: '▤', granary: '❦', tithe_house: '◈', farm: '❀', soul_altar: '☠', barracks: '⚔', archery: '➶', stable: '♞', forge: '⚒', siege_workshop: '⚙', sanctum: '✦', library: '❖', market: '⚖', temple: '✚', wall: '▦', gate: '⛩', tower: '♖', palisade: '‖', corner: '◙' };
export const bldGlyph = (type) => BLD_GLYPH[type] || (type.includes('tower') ? '♖' : type.includes('totem') ? '⚑' : '■');

// is this entity (unit/bld) visible to the local player? (fog is optional in the contract)
export function visibleTo(st, teamId, e) {
  const t = st.teams[teamId];
  if (!e || e.team === teamId) return true;
  const f = t && t.fog;
  if (f && typeof f.visible === 'function') return !!f.visible(e.x, e.z);
  if (typeof e.seenBy === 'object' && e.seenBy) return !!e.seenBy[teamId];
  return true;
}
