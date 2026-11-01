// derived(a): all stats computed from attributes + level + equipment + Skills (attrBonus, perkModsFrac). See the formulas in items.js header.
// Perk units: Skills.perkMods are PERCENT POINTS; we read Skills.perkModsFrac(a) (fractions) when present, else divide perkMods by 100.
// NOT folded in here (combat applies them itself from perkMods, to avoid double counting): meleeDmgPct, bowDmgPct, staminaRegenPct (perk part).
import { SLOTS, DTYPES } from '../consts.js';
import * as Skills from '../skills.js';

export const BASE_WALK = 3.6;
const FRAC_KEYS = /Pct$|^lifesteal$|^blockEfficiency$|^resAll$/;
let busy = false;
// raw perkMods (percent points); {} when unavailable
export function perkModsSafe(a) {
  if (busy) return {};
  busy = true;
  try { return (Skills.perkMods && Skills.perkMods(a)) || {}; } catch (e) { return {}; } finally { busy = false; }
}
// perk mods as fractions (0.05 = +5%); signed cost keys stay negative for cheaper
export function fracMods(a) {
  if (busy) return {};
  busy = true;
  try {
    if (Skills.perkModsFrac) return Skills.perkModsFrac(a) || {};
    const m = (Skills.perkMods && Skills.perkMods(a)) || {}, f = { ...m };
    for (const k in f) if (FRAC_KEYS.test(k) && typeof f[k] === 'number') f[k] = f[k] / 100;
    return f;
  } catch (e) { return {}; } finally { busy = false; }
}
export const pct = (v) => +v || 0; // legacy helper, expects an already-fractional value

export function weightOf(a) {
  let w = 0;
  for (const it of a.inv) w += (it.weight || 0) * (it.qty || 1);
  for (const s of SLOTS) if (a.equip[s]) w += a.equip[s].weight || 0;
  return w;
}
const HEAVY = (it) => it.armorClass === 'heavy';

// attribute deficit of an actor for an item (sum over unmet requirements) + list. strAdj lowers the STR need of heavy armour (Skills heavyReqStr, signed).
export function deficitOf(a, item, attrs, strAdj = 0) {
  let n = 0; const miss = [];
  const at = attrs || a.attrs;
  for (const [k, v0] of Object.entries(item.req || {})) {
    const v = k === 'str' && HEAVY(item) ? Math.max(0, v0 + strAdj) : v0;
    const d = v - (at[k] || 0); if (d > 0) { n += d; miss.push({ attr: k, need: v, have: at[k] || 0 }); }
  }
  return { deficit: n, miss };
}

const BLOCK = { twohand: 0.6, sword: 0.5, axe: 0.45, mace: 0.5, spear: 0.45, dagger: 0.3, staff: 0.4, bow: 0.2, crossbow: 0.2, fist: 0.25 };
// attribute-only numbers from Skills.attrBonus (Skills formulas are the single source); fallback = same formulas locally
function attrPart(A) {
  if (Skills.attrBonus) { try { return Skills.attrBonus({ attrs: A }); } catch (e) { /* fall through */ } }
  return { maxHp: 50 + 5 * A.vit, maxStamina: 60 + 4 * A.dex, maxMana: 20 + 2 * A.int, carry: 40 + 3 * A.str, meleeDmgPct: 2.5 * (A.str - 10), bowDmgPct: 2.5 * (A.dex - 10),
    spellDmgPct: 3 * (A.int - 10), attackSpeedPct: A.dex - 10, critPct: 0.4 * (A.dex - 10), manaRegenPct: 2 * (A.int - 10), staminaRegenPct: 2 * (A.vit - 10), hpRegen: Math.max(0, 1 + 0.03 * (A.vit - 10)) };
}

export function derived(a) {
  const mods = fracMods(a), raw = perkModsSafe(a), M = (k) => +mods[k] || 0;
  const bon = {}; const res = Object.fromEntries(DTYPES.map((k) => [k, 0]));
  const equipped = [];
  for (const s of SLOTS) { const it = a.equip[s]; if (!it) continue; equipped.push(it); for (const [k, v] of Object.entries(it.bonus || {})) bon[k] = (bon[k] || 0) + (+v || 0); for (const [k, v] of Object.entries(it.res || {})) res[k] = (res[k] || 0) + v; }
  const B = (k) => bon[k] || 0;
  const A = { str: a.attrs.str + B('str'), dex: a.attrs.dex + B('dex'), int: a.attrs.int + B('int'), vit: a.attrs.vit + B('vit') };
  const AB = attrPart(A), lvl = a.lvl || 1, strAdj = +raw.heavyReqStr || 0;
  const maxHp = Math.round((AB.maxHp + lvl * 8 + B('hp')) * (1 + M('hpPct')));
  const maxStamina = Math.round((AB.maxStamina + lvl * 2 + B('stamina')) * (1 + M('staminaPct')));
  const maxMana = Math.round((AB.maxMana + lvl * 3 + B('mana')) * (1 + M('manaPct')));
  // armor + penalties
  let armor = 0, movePen = 0, stamPen = 0; const penalties = {};
  for (const it of equipped) {
    if (it.armor) {
      const df = deficitOf(a, it, A, strAdj); if (df.deficit) penalties[it.slot] = df;
      armor += it.armor * (1 - Math.min(0.5, 0.05 * df.deficit));
    }
    movePen += it.movePen || 0; stamPen += it.stamPen || 0;
  }
  movePen = Math.max(0, movePen * (1 + (+mods.heavyMovePenaltyPct || 0)));
  armor = Math.max(0, Math.min(75, (armor + B('armor')) * (1 + M('armorPct'))));
  const resAllPts = B('resAll') + M('resAll') * 100;
  for (const k of DTYPES) res[k] = Math.max(-100, Math.min(80, (res[k] || 0) + (k === 'physical' ? 0 : resAllPts) + (+raw['res' + k[0].toUpperCase() + k.slice(1)] || 0)));
  // weight / movement
  const W = weightOf(a), carry = Math.round(AB.carry + B('carry') + (+raw.carryBonus || 0)), hardCap = Math.round(carry * 1.5);
  const weightMul = W <= carry ? 1 : Math.max(0.4, 1 - 0.6 * (W - carry) / (0.5 * carry));
  const moveSpeed = BASE_WALK * (1 + B('moveSpeed') + M('moveSpeedPct')) * (1 - Math.min(0.3, movePen)) * weightMul;
  // weapon
  const w = a.equip.weapon, kind = w ? w.kind : 'fist';
  const wdf = w ? deficitOf(a, w, A) : { deficit: 0, miss: [] }; if (wdf.deficit) penalties.weapon = wdf;
  const ranged = kind === 'bow' || kind === 'crossbow';
  const drawMul = 1 + M('drawSpeedPct');
  // attribute part of the damage bonus (STR for melee, DEX for bows, INT for staves as melee: none); perk melee/bow skill % is applied by combat
  const attrDmg = (ranged ? AB.bowDmgPct : kind === 'staff' ? 0 : AB.meleeDmgPct) / 100;
  const dmgMul = Math.max(0.3, (1 + attrDmg) * (1 + B('dmgPct') + M('dmgPct'))) * Math.max(0.4, 1 - 0.04 * wdf.deficit);
  const spellMul = Math.max(0.3, 1 + AB.spellDmgPct / 100 + B('spellDmgPct') + M('spellDmgPct'));
  const atkSpeed = (1 + AB.attackSpeedPct / 100 + B('atkSpeed') + M('attackSpeedPct')) * Math.max(0.6, 1 - 0.02 * wdf.deficit);
  const weapon = w
    ? { uid: w.uid, name: w.name, dmg: [w.dmg[0], w.dmg[1]], speed: w.speed, reach: w.reach, stam: w.stam, dtype: w.dtype || 'physical', kind: w.kind, twoHanded: !!w.twoHanded, poise: w.poise || 1, backstab: w.backstab || 1.5, cleave: w.cleave || 1, slayer: w.slayer || null, ammoKind: w.ammoKind || null }
    : { uid: null, name: 'Fists', dmg: [2, 4], speed: 1.1, reach: 1.3, stam: 6, dtype: 'physical', kind: 'fist', twoHanded: false, poise: 1, backstab: 1.5, cleave: 1, slayer: null, ammoKind: null };
  if (w && w.ranged) weapon.ranged = { ...w.ranged, draw: w.ranged.draw / Math.max(0.3, drawMul) };
  // block
  const sh = a.equip.offhand && a.equip.offhand.kind === 'shield' ? a.equip.offhand : null;
  const shDef = sh ? deficitOf(a, sh, A).deficit : 0;
  const blockAbsorb = Math.min(0.95, (sh ? sh.block * Math.max(0.5, 1 - 0.05 * shDef) : (BLOCK[kind] || 0.4)) + M('blockEfficiency'));
  const light = 2 + (a.equip.offhand && a.equip.offhand.light ? a.equip.offhand.light : 0) + B('light');
  const stCost = Math.max(0.3, 1 + M('staminaCostPct'));
  return {
    maxHp, maxStamina, maxMana, armor, res, moveSpeed, carry, hardCap, weight: W, weightMul, overweight: W > carry,
    dmgMul, spellMul, atkSpeed, critChance: Math.min(0.6, 0.05 + AB.critPct / 100 + B('critPct') + M('critPct')), critMul: 1.5 + M('critDmgPct'),
    // perk staminaRegenPct is applied by combat/status.js; here only the VIT part + gear + armour penalty
    staminaRegen: 14 * (1 + AB.staminaRegenPct / 100) * (1 - Math.min(0.5, stamPen)) + B('staminaRegen'),
    manaRegen: 2 * (1 + AB.manaRegenPct / 100 + M('manaRegenPct')) + B('manaRegen'),
    hpRegen: AB.hpRegen * 0.6 * (1 + M('hpRegenPct')) + B('hpRegen'), lifesteal: Math.min(0.5, B('lifesteal') + M('lifesteal')),
    staminaCostMul: stCost, light, sneak: B('sneak'), attrs: A, penalties,
    block: { absorb: blockAbsorb, stamMul: (sh ? 0.8 : 1.25) * stCost, shield: !!sh, parryWindow: 0.2 + (+raw.parryWindow || 0) },
    weapon,
  };
}
