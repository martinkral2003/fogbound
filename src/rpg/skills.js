// FOGBOUND: HERO progression: XP/levels, attributes, skill trees (trainers + learning points), perk modifiers.
// Pure sim module (no DOM/Three). Data lives in skills/trees.js, trees2.js (SKILLS), skills/mods.js (mod keys), skills/xp.js, skills/build.js (AI).
//
// ===== LEVELLING =====  MAX_LVL 20. Per level-up: +3 attribute points, +1 learning point (+1 extra at levels 5/10/15).
// Milestone perks (LEVEL_PERKS) at 5/10/15/20 are recorded in a.perks.levels (names) and folded into perkMods.
// ===== ATTRIBUTES (base 10 each = 0 bonus). ATTR_FX is the single source of numbers; Items.derived(a) SHOULD use attrBonus(a):
//   STR: melee damage +2.5%/pt over 10, carry 40 + 3*str kg, gates two-hander / heavy armour (item reqStr; Heavy Armour perks lower it via heavyReqStr)
//   DEX: maxStamina 60 + 4*dex, bow damage +2.5%/pt, attack speed +1%/pt, crit +0.4 points/pt, dodge stamina cost -1.5%/pt
//   INT: maxMana 20 + 2*int, spell damage +3%/pt, mana regen +2%/pt
//   VIT: maxHp 50 + 5*vit, stamina regen +2%/pt, hp regen +0.03 hp/s per pt
//   Final formula expected from items: maxHp = (attr base + gear + hpflat) * (1 + hpPct/100); maxStamina *(1+staminaPct/100); maxMana *(1+manaPct/100).
// ===== PERK MODS (perkMods(a) -> object; every key present, default 0, sneakMul 1). Units are PERCENT POINTS (5 = +5%) unless noted.
//   Documented per key in skills/mods.js (MOD_KEYS). Resolved keys depend on equipment (cache invalidated when gear/skills/level change):
//   meleeDmgPct = One-Handed (sword/axe/mace/dagger/spear) or Two-Handed (twohand) skill value, 0 when no melee weapon; bowDmgPct = Archery when a bow/crossbow
//   is wielded; armorPct = (lightRaw*lightPieces + heavyRaw*heavyPieces)/5 over head/chest/legs/boots/hands (item.armorClass 'light'|'heavy', default heavy if weight>=4);
//   spellDmgPct always applies. Level milestone perks add dmgPct (global damage), hpPct, critPct, resAll...
//   resAll adds to every dtype; resPhysical/resFire/... add to one. fogResist = % less Dread Fog damage (combat/flow: dmg *= 1 - fogResist/100).
//   Signs: *CostPct keys are signed (-10 = 10% cheaper). sneakMul multiplies detection radius. lockpick = success chance 0..1 added, lockTier = highest chest tier pickable.
//   Signature thresholds: Block r3 widens parry window (+0.06 s), Block r5 counterDmgPct +30; Archery r5 moveWhileDraw 0.5; Two-Handed r5 cleave;
//   Destruction r5 nova; Restoration r5 bonewarden; Stealth r4 blink; Stealth r5 sneakCritPct.
// ===== COSTS =====  rank r costs LP [1,1,2,2,3] learning points (all 5 ranks = 9) and gold [40,100,220,400,700]*costMul. Min level per rank [1,3,6,10,14].
//   Trainers (npc.role): warrior, ranger, mage, rogue, general (limited ranks), trainer/master (everything). Trainer must be within TRAIN_RANGE m.
// ===== SPELLS =====  everyone knows mend. Destruction r1-5: firebolt, frostshard, arc, venom, nova. Restoration r1/r3/r5: stoneskin, drain, bonewarden. Stealth r4: blink.
import { MAX_LVL } from './consts.js';
import { emit, recompute } from './core.js';
import { MOD_KEYS, blankMods, fmtMod } from './skills/mods.js';
import { TREES_COMBAT } from './skills/trees.js';
import { TREES_UTIL } from './skills/trees2.js';
import { xpNeed, xpValue } from './skills/xp.js';
import { autoLevel as autoLevelImpl, startingSkills, startingAttrs } from './skills/build.js';
export { xpNeed, xpValue, MOD_KEYS, startingSkills, startingAttrs };

export const SKILLS = {};
for (const [id, t] of Object.entries({ ...TREES_COMBAT, ...TREES_UTIL })) SKILLS[id] = { id, maxRank: t.ranks.length, ...t };
export const SKILL_IDS = Object.keys(SKILLS);

export const MIN_LVL = [1, 3, 6, 10, 14];
export const COST_POINTS = [1, 1, 2, 2, 3];
export const COST_GOLD = [40, 100, 220, 400, 700];
export const TRAIN_RANGE = 6;
export const MAX_ATTR = 40;
export const ATTR_FX = {
  str: { meleeDmgPct: 2.5, carryBase: 40, carryPer: 3 },
  dex: { staminaBase: 60, staminaPer: 4, bowDmgPct: 2.5, attackSpeedPct: 1, critPct: 0.4, dodgeCostPct: -1.5 },
  int: { manaBase: 20, manaPer: 2, spellDmgPct: 3, manaRegenPct: 2 },
  vit: { hpBase: 50, hpPer: 5, staminaRegenPct: 2, hpRegen: 0.03 },
};
// numbers Items.derived can add straight in (attribute part only; gear and perkMods come on top)
export function attrBonus(a) {
  const s = a.attrs.str - 10, d = a.attrs.dex - 10, i = a.attrs.int - 10, v = a.attrs.vit - 10, F = ATTR_FX;
  return {
    maxHp: F.vit.hpBase + F.vit.hpPer * a.attrs.vit, maxStamina: F.dex.staminaBase + F.dex.staminaPer * a.attrs.dex, maxMana: F.int.manaBase + F.int.manaPer * a.attrs.int,
    carry: F.str.carryBase + F.str.carryPer * a.attrs.str,
    meleeDmgPct: F.str.meleeDmgPct * s, bowDmgPct: F.dex.bowDmgPct * d, spellDmgPct: F.int.spellDmgPct * i,
    attackSpeedPct: F.dex.attackSpeedPct * d, critPct: F.dex.critPct * d, dodgeCostPct: F.dex.dodgeCostPct * d,
    manaRegenPct: F.int.manaRegenPct * i, staminaRegenPct: F.vit.staminaRegenPct * v, hpRegen: Math.max(0, 1 + F.vit.hpRegen * v),
  };
}

export const LEVEL_PERKS = {
  5: { name: 'Hardened', mods: { hpPct: 4, staminaPct: 4 } },
  10: { name: 'Veteran', mods: { dmgPct: 3, critPct: 2, resAll: 2 } },
  15: { name: 'Champion', mods: { dmgPct: 3, hpPct: 5, armorPct: 3 } },
  20: { name: 'Legend', mods: { dmgPct: 4, hpPct: 5, resAll: 3, staminaRegenPct: 10 } },
};
export const BONUS_SKILL_LEVELS = [5, 10, 15];

export const ROLES = {
  warrior: { onehand: 5, twohand: 5, block: 5, heavyArmor: 5, athletics: 3 },
  ranger: { archery: 5, lightArmor: 5, survival: 5, athletics: 5, stealth: 3 },
  mage: { destruction: 5, restoration: 5 },
  rogue: { stealth: 5, lockpicking: 5, trade: 5, onehand: 3, lightArmor: 3 },
  general: { athletics: 3, survival: 3, trade: 3, lockpicking: 2, block: 2, onehand: 2 },
};
ROLES.trainer = ROLES.master = Object.fromEntries(SKILL_IDS.map((k) => [k, 5]));

export const rankOf = (a, id) => (a.skills && a.skills[id]) || 0;
const costGold = (id, r) => Math.round(COST_GOLD[r - 1] * (SKILLS[id].costMul || 1));
export const costFor = (id, r) => ({ costGold: costGold(id, r), costPoints: COST_POINTS[r - 1] });

// ---------------------------------------------------------------- XP / levels
export function grantXp(st, a, amt) {
  if (!a || !(amt > 0) || a.lvl >= MAX_LVL || a.alive === false) return;
  a.xp += amt; a.xpTotal = (a.xpTotal || 0) + amt;
  let up = 0;
  while (a.lvl < MAX_LVL && a.xp >= xpNeed(a.lvl)) {
    a.xp -= xpNeed(a.lvl); a.lvl++; up++;
    a.points.attr += 3; a.points.skill += 1 + (BONUS_SKILL_LEVELS.includes(a.lvl) ? 1 : 0);
    const lp = LEVEL_PERKS[a.lvl];
    if (lp) { (a.perks.levels = a.perks.levels || []).push(lp.name); emit(st, { type: 'msg', actor: a.id, text: 'Milestone: ' + lp.name }); }
    emit(st, { type: 'levelup', actor: a.id, lvl: a.lvl });
  }
  if (a.lvl >= MAX_LVL) a.xp = 0;
  if (up) {
    if (a.kind !== 'player' && a.build) autoLevel(a, a.build);
    if (a.d) { try { recompute(st, a); } catch (e) { /* tolerate partial actors in tests */ } }
  }
}

export function spendAttr(a, attr) {
  if (!a || !a.points || a.points.attr <= 0 || a.attrs[attr] === undefined || a.attrs[attr] >= MAX_ATTR) return false;
  a.points.attr--; a.attrs[attr]++; invalidate(a); return true;
}

// ---------------------------------------------------------------- learning
// Checks the requirements of rank (current+1). opts.ignoreGold for AI, opts.role to additionally check what a trainer role can teach.
export function canLearn(a, skillId, opts = {}) {
  const sk = SKILLS[skillId];
  if (!sk) return { ok: false, reason: 'Unknown skill', costGold: 0, costPoints: 0 };
  const cur = rankOf(a, skillId), r = cur + 1;
  if (cur >= sk.maxRank) return { ok: false, reason: 'Already mastered', costGold: 0, costPoints: 0, rank: cur };
  const c = costFor(skillId, r), res = (reason) => ({ ok: false, reason, rank: r, ...c });
  const need = MIN_LVL[r - 1];
  if (a.lvl < need) return res('Requires level ' + need);
  const req = sk.ranks[r - 1].req;
  if (req) {
    for (const k in req.attrs || {}) if (a.attrs[k] < req.attrs[k]) return res('Requires ' + k.toUpperCase() + ' ' + req.attrs[k]);
    for (const [s, rk] of req.all || []) if (rankOf(a, s) < rk) return res('Requires ' + SKILLS[s].name + ' ' + rk);
    if (req.any && !req.any.some(([s, rk]) => rankOf(a, s) >= rk)) return res('Requires ' + req.any.map(([s, rk]) => SKILLS[s].name + ' ' + rk).join(' or '));
  }
  if (opts.role) { const cap = (ROLES[opts.role] || {})[skillId] || 0; if (cap < r) return res(cap ? 'This trainer cannot teach rank ' + r : 'This trainer does not teach ' + sk.name); }
  if (a.points.skill < c.costPoints) return res('Needs ' + c.costPoints + ' learning point' + (c.costPoints > 1 ? 's' : ''));
  if (!opts.ignoreGold && a.gold < c.costGold) return res('Needs ' + c.costGold + ' gold');
  return { ok: true, reason: '', rank: r, ...c };
}

export const npcRole = (n) => (n && (ROLES[n.role] ? n.role : ROLES[n.trainerRole] ? n.trainerRole : (n.trainer || n.role === 'trainer') ? 'master' : null)) || null;

export function learnSkill(st, a, skillId, npcId) {
  const say = (t) => { if (a.kind === 'player') emit(st, { type: 'msg', actor: a.id, text: t }); return false; };
  const npc = st.byId.get(npcId);
  const role = npc && npc.alive !== false ? npcRole(npc) : null;
  if (!role) return say('No trainer here.');
  if (Math.hypot(npc.x - a.x, npc.z - a.z) > TRAIN_RANGE) return say('Step closer to the trainer.');
  const c = canLearn(a, skillId, { role });
  if (!c.ok) return say(c.reason);
  a.points.skill -= c.costPoints; a.gold -= c.costGold; npc.gold = (npc.gold || 0) + c.costGold;
  const before = knownSpells(a);
  a.skills[skillId] = c.rank; invalidate(a);
  const sk = SKILLS[skillId];
  if (a.kind === 'player') {
    emit(st, { type: 'msg', actor: a.id, text: 'Learned ' + sk.name + ' rank ' + c.rank + ': ' + sk.ranks[c.rank - 1].name });
    for (const sp of knownSpells(a)) if (!before.includes(sp)) emit(st, { type: 'msg', actor: a.id, text: 'New spell: ' + sp });
  }
  return true;
}

// what a trainer role can teach: one entry per (skill, rank). With an actor a, only the next rank of each skill with ok/reason.
export function trainerOffers(role, a) {
  const caps = ROLES[role] || {}, out = [];
  for (const id of Object.keys(caps)) {
    const lo = a ? rankOf(a, id) + 1 : 1, hi = a ? lo : caps[id];
    for (let r = lo; r <= Math.min(hi, caps[id]); r++) {
      const e = { skill: id, rank: r, name: SKILLS[id].ranks[r - 1].name, ...costFor(id, r) };
      if (a) { const c = canLearn(a, id, { role }); e.ok = c.ok; e.reason = c.reason; }
      out.push(e);
    }
  }
  return out;
}

// ---------------------------------------------------------------- perk mods
const ONE = new Set(['sword', 'axe', 'mace', 'dagger', 'spear']), RANGED = new Set(['bow', 'crossbow']);
const ARMOR_SLOTS = ['head', 'chest', 'legs', 'boots', 'hands'], GEAR = ['weapon', 'offhand', ...ARMOR_SLOTS];
const hashSkills = (a) => { let h = 0; for (let i = 0; i < SKILL_IDS.length; i++) h = h * 7 + (rankOf(a, SKILL_IDS[i]) + 1) * (i + 3); return h; };

export function invalidate(a) { if (a.perks) a.perks._pm = null; }

// Sum of one tree's rank mods up to `rank` into m.
function addTree(m, id, rank) {
  const sk = SKILLS[id];
  for (let r = 0; r < Math.min(rank, sk.maxRank); r++) addMods(m, sk.ranks[r].mods);
}
function addMods(m, mods) {
  for (const k in mods) {
    const meta = MOD_KEYS[k], kind = meta && meta.kind;
    if (kind === 'mul') m[k] *= mods[k]; else if (kind === 'max') m[k] = Math.max(m[k], mods[k]); else m[k] += mods[k];
  }
}
const heavyPiece = (it) => it.armorClass ? it.armorClass === 'heavy' : (it.weight || 0) >= 4;

export function perkMods(a) {
  if (!a || !a.skills) return blankMods();
  const pm = a.perks && a.perks._pm, h = hashSkills(a), lvl = a.lvl;
  const eq = a.equip || {};
  if (pm && pm.h === h && pm.lvl === lvl && GEAR.every((s, i) => pm.eq[i] === eq[s])) return pm.mods;
  const m = blankMods();
  for (const id of SKILL_IDS) { const r = rankOf(a, id); if (r > 0) addTree(m, id, r); }
  for (const L in LEVEL_PERKS) if (lvl >= +L) addMods(m, LEVEL_PERKS[L].mods);
  // weapon-aware resolution
  const wk = eq.weapon && eq.weapon.kind;
  m.meleeDmgPct = ONE.has(wk) ? m.oneHandDmgPct : wk === 'twohand' ? m.twoHandDmgPct : 0;
  m.bowDmgPct = RANGED.has(wk) ? m.bowSkillDmgPct : 0;
  if (wk !== 'twohand') m.cleave = 0;
  if (!RANGED.has(wk)) m.moveWhileDraw = 0;
  // armour: pieces / 5 scaling of light and heavy raw bonuses; global armorPct (milestones) stays as is
  let light = 0, heavy = 0;
  for (const s of ARMOR_SLOTS) { const it = eq[s]; if (it) (heavyPiece(it) ? heavy++ : light++); }
  m.armorPct += (m.armorPctLight * light + m.armorPctHeavy * heavy) / 5;
  if (!heavy) { m.heavyMovePenaltyPct = 0; m.heavyReqStr = 0; }
  m.potionPct = m.foodPct; m.carryBonus = m.carryPct * 0.6;
  m.lockpick = Math.min(0.85, m.lockpick); m.sneakMul = Math.max(0.4, m.sneakMul);
  m.fogResist = Math.min(60, m.fogResist); m.tradePct = Math.min(40, m.tradePct);
  if (a.perks) a.perks._pm = { h, lvl, eq: GEAR.map((s) => eq[s]), mods: m };
  return m;
}

// Same object as perkMods but every percent-point key ("*Pct", blockEfficiency, lifesteal, resAll...) divided by 100 (fractions: 0.05 = +5%).
// Signed keys (staminaCostPct, dodgeCostPct, attackCostPct, spellCostPct, sprintCostPct...) stay NEGATIVE for cheaper: cost mul = 1 + frac.staminaCostPct.
// Seconds (parryWindow, dodgeInv), lockpick (already a fraction), sneakMul, moveWhileDraw, cleave, lockTier, carryBonus (kg) are unchanged.
const FRAC_NUM = new Set(['resAll', 'resPhysical', 'resFire', 'resCold', 'resLightning', 'resPoison']);
export function perkModsFrac(a) {
  const m = perkMods(a), c = a && a.perks && a.perks._pm;
  if (c && c.frac) return c.frac;
  const f = { ...m };
  for (const k in f) { const meta = MOD_KEYS[k]; if (meta && (meta.fmt === 'pct' || meta.fmt === 'neg' || FRAC_NUM.has(k)) && !meta.abs) f[k] = m[k] / 100; }
  if (c) c.frac = f;
  return f;
}

// spells the actor may cast from the spell list (scrolls are separate and always readable once)
export function knownSpells(a) {
  const out = ['mend'];
  for (const id of SKILL_IDS) {
    const r = rankOf(a, id), sk = SKILLS[id];
    for (let i = 0; i < Math.min(r, sk.maxRank); i++) for (const sp of sk.ranks[i].spells || []) if (!out.includes(sp)) out.push(sp);
  }
  return out;
}

// tooltip data for the UI: rank = rank to describe (1..5). Returns {id,name,desc,group,rank,maxRank,rankName,effects[],spells[],note,req[],cost,total[]}
export function describeSkill(id, rank = 1) {
  const sk = SKILLS[id]; if (!sk) return null;
  const r = Math.max(1, Math.min(sk.maxRank, rank | 0 || 1)), rk = sk.ranks[r - 1], req = rk.req || {};
  const reqs = ['Level ' + MIN_LVL[r - 1]];
  for (const k in req.attrs || {}) reqs.push(k.toUpperCase() + ' ' + req.attrs[k]);
  for (const [s, n] of req.all || []) reqs.push(SKILLS[s].name + ' ' + n);
  if (req.any) reqs.push(req.any.map(([s, n]) => SKILLS[s].name + ' ' + n).join(' or '));
  const total = {}; addTree(total0(total), id, r);
  return {
    id, name: sk.name, desc: sk.desc, group: sk.group, rank: r, maxRank: sk.maxRank, rankName: rk.name,
    effects: Object.keys(rk.mods).map((k) => fmtMod(k, rk.mods[k])), spells: rk.spells || [], note: rk.note || '', req: reqs,
    cost: { ...costFor(id, r) }, total: Object.keys(total).filter((k) => total[k] !== (MOD_KEYS[k].base ?? 0)).map((k) => fmtMod(k, k === 'sneakMul' ? total[k] : total[k])),
  };
}
const total0 = (o) => { Object.assign(o, blankMods()); return o; };

export function autoLevel(a, build) { return autoLevelImpl(a, build, { SKILLS, canLearn, spendAttr, rankOf, invalidate }); }
