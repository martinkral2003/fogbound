// FLOW: rival gear management (equip upgrades, potions, attribute points) and loot target selection.
import * as Items from './items.js';
import { dist, hpFrac } from './ai_util.js';
import { groupPower, power } from './ai_fight.js';

const KIND_PREF = {
  warrior: { sword: 1.2, axe: 1.1, mace: 1.1, spear: 1.0, twohand: 1.1, dagger: 0.8, bow: 0.5, crossbow: 0.5, staff: 0.3 },
  brute:   { twohand: 1.4, axe: 1.2, mace: 1.2, sword: 1.0, spear: 0.9, dagger: 0.5, bow: 0.3, crossbow: 0.3, staff: 0.3 },
  ranger:  { bow: 1.6, crossbow: 1.3, dagger: 0.9, sword: 0.9, spear: 0.8, axe: 0.7, mace: 0.6, twohand: 0.6, staff: 0.3 },
  mage:    { staff: 1.8, dagger: 0.8, sword: 0.6, mace: 0.5, spear: 0.5, axe: 0.5, bow: 0.4, crossbow: 0.3, twohand: 0.4 },
  rogue:   { dagger: 1.5, sword: 1.0, bow: 0.9, crossbow: 0.8, axe: 0.7, mace: 0.6, spear: 0.7, twohand: 0.5, staff: 0.3 },
};
const ATTR_PREF = { warrior: ['str', 'vit', 'str', 'dex'], brute: ['str', 'vit', 'vit', 'str'], ranger: ['dex', 'vit', 'dex', 'str'], mage: ['int', 'vit', 'int', 'dex'], rogue: ['dex', 'vit', 'dex', 'str'] };

function weaponScore(a, it) {
  if (!it.dmg) return 0;
  const avg = (it.dmg[0] + it.dmg[1]) / 2, pref = (KIND_PREF[a.archetype] || {})[it.kind] ?? 0.8;
  return avg * (it.speed || 1) * pref * (1 + (it.rarity || 0) * 0.12);
}
function armorScore(it) { return (it.armor || 0) + ((it.res && Object.values(it.res).reduce((s, v) => s + v, 0)) || 0) * 0.1 + (it.rarity || 0) * 0.5 + ((it.bonus && it.bonus.hp) || 0) * 0.05; }

export function manageGear(st, a, inp) {
  let changed = false;
  for (const it of a.inv) {
    if (!it.slot) continue;
    if (it.slot === 'offhand' && a.equip.weapon && a.equip.weapon.kind === 'twohand') continue;
    const cur = a.equip[it.slot];
    let better = false;
    if (!cur) better = it.slot !== 'weapon' || weaponScore(a, it) > 0;
    else if (it.slot === 'weapon') better = weaponScore(a, it) > weaponScore(a, cur) * 1.08;
    else if (it.kind === 'shield' || it.slot === 'offhand') better = armorScore(it) > armorScore(cur) * 1.05 && !(a.equip.weapon && ['bow', 'crossbow', 'twohand', 'staff'].includes(a.equip.weapon.kind));
    else better = armorScore(it) > armorScore(cur) * 1.05;
    if (it.slot === 'weapon' && (it.kind === 'bow' || it.kind === 'crossbow') && !a.inv.some((q) => q.kind === (it.kind === 'bow' ? 'arrow' : 'bolt'))) better = false;
    if (better) { inp.cmds.push({ t: 'equip', uid: it.uid }); changed = true; break; } // one change per pass
  }
  for (const it of a.inv) if (it.kind === 'scroll' && it.spell && !a.ai.readScrolls?.[it.uid]) { (a.ai.readScrolls ||= {})[it.uid] = 1; inp.cmds.push({ t: 'use', uid: it.uid }); break; }
  const pts = a.points.attr;
  if (pts > 0) { const pref = ATTR_PREF[a.archetype] || ATTR_PREF.warrior; for (let i = 0; i < Math.min(pts, 3); i++) inp.cmds.push({ t: 'attr', attr: pref[(a.lvl + i) % pref.length] }); changed = true; }
  return changed;
}

export function usePotion(st, a, inp) {
  const ai = a.ai; if (st.t < (ai.potionCd || 0)) return false;
  const frac = hpFrac(a), combat = ai.mode === 'fight' || ai.mode === 'flee' || ai.mode === 'hunt';
  const heals = a.inv.filter((i) => (i.kind === 'potion' || i.kind === 'food') && (i.heal || 0) > 0).sort((p, q) => q.heal - p.heal);
  if (combat && frac < 0.45 && heals.length) { inp.cmds.push({ t: 'use', uid: (frac < 0.25 ? heals[0] : heals[heals.length - 1]).uid }); ai.potionCd = st.t + 2.5; return true; }
  if (!combat && frac < 0.7) { // patch up between fights: food and bandages first
    const hot = a.inv.find((i) => (i.kind === 'food' || i.kind === 'potion') && i.hot && !(i.heal > 20)) || a.inv.find((i) => i.kind === 'food' && i.heal);
    if (hot && !a.status.some((s) => s.id === 'regen')) { inp.cmds.push({ t: 'use', uid: hot.uid }); ai.potionCd = st.t + 6; return true; }
    if (frac < 0.5 && heals.length) { inp.cmds.push({ t: 'use', uid: heals[heals.length - 1].uid }); ai.potionCd = st.t + 3; return true; }
  }
  if (a.archetype === 'mage' && a.mana < a.maxMana * 0.2) { const m = a.inv.find((i) => i.kind === 'potion' && (i.mana || 0) > 0); if (m) { inp.cmds.push({ t: 'use', uid: m.uid }); ai.potionCd = st.t + 3; return true; } }
  return false;
}
export const potionCount = (a) => a.inv.filter((i) => (i.kind === 'potion' || i.kind === 'food') && (i.heal || 0) > 15).reduce((s, i) => s + (i.qty || 1), 0);

// ------------------------------------------------------------------ loot choice
const PERS_LOOT = { looter: 1.5, cautious: 1.15, aggressive: 0.8, opportunist: 1.0 };
export function safeLimit(st) { const z = st.zone; if (!z) return 1e9; return (z.state === 'shrinking' ? z.toR : z.r) - 10; }

export function campDanger(st, x, z, vs) {
  const camps = st.flow.camps; let worst = null;
  for (const c of camps) {
    const d = Math.hypot(c.x - x, c.z - z); if (d > 30) continue;
    const ms = []; for (const id of c.mons) { const m = st.byId.get(id); if (m && m.alive) ms.push(m); }
    if (!ms.length) continue; const gp = groupPower(ms, vs); if (!worst || gp.p > worst.p) worst = gp;
  }
  return worst;
}

export function templeOpen(st, a) { return (st.zone && st.zone.stage >= 3) || a.lvl >= 6; }
export function findLoot(st, a, radius) {
  const ai = a.ai, z = st.zone, lim = safeLimit(st) + (ai.personality === 'looter' ? 32 : ai.personality === 'aggressive' ? 18 : ai.personality === 'opportunist' ? 10 : 0); // the greedy step into the fog
  const hasPick = a.inv.some((i) => i.kind === 'lockpick');
  const cand = [];
  const mul = PERS_LOOT[ai.personality] || 1;
  const consider = (type, tgt, value) => {
    const crate = tgt.kind === 'crate';
    const d = Math.hypot(tgt.x - a.x, tgt.z - a.z); if (d > (crate ? 230 : radius)) return;
    if (z && Math.hypot(tgt.x - z.cx, tgt.z - z.cz) > lim) return;
    if ((ai.ignore[tgt.id] || 0) > st.t) return;
    if (!crate && Math.hypot(tgt.x, tgt.z) < 48 && !templeOpen(st, a)) return; // the Drowned King's court is deadly early
    cand.push({ type, target: tgt, x: tgt.x, z: tgt.z, d, score: value * mul - d / 14 });
  };
  for (const c of st.containers) {
    if (c.removed) continue;
    if (c.kind === 'shrine') { if (st.t >= (c.readyAt || 0) && (hpFrac(a) < 0.8 || c.effect !== 'heal')) consider('container', c, 3.5); continue; }
    if (c.opened && !c.items.length) continue;
    if (!c.items.length) continue;
    if (c.locked) { const key = c.keyId && a.inv.some((i) => i.keyId === c.keyId); if (!key && !hasPick) continue; }
    let v = c.kind === 'corpse' ? 1.5 + c.items.length * 0.7 : c.kind === 'crate' ? (ai.personality === 'cautious' && (a.id & 1) ? 6 : 40) : 3 + c.tier * 2;
    if (c.kind === 'corpse' && c.name && c.name !== 'Skeleton' && c.items.length > 3) v += 3;
    consider('container', c, v);
  }
  for (const g of st.groundItems) { const it = g.item; let v = 1.6; if (it.slot === 'weapon') v = weaponScore(a, it) > (a.equip.weapon ? weaponScore(a, a.equip.weapon) : 0) ? 4 : 0.8; else if (it.slot) v = !a.equip[it.slot] ? 3.5 : 1.2; if (it.kind === 'potion') v = 3; consider('item', g, v); }
  if (!cand.length) return null;
  cand.sort((p, q) => q.score - p.score);
  const me = power(a);
  for (let i = 0; i < Math.min(5, cand.length); i++) {
    const c = cand[i], dg = c.target.kind === 'crate' ? null : campDanger(st, c.x, c.z, a);
    if (dg && dg.p > me.p * (ai.personality === 'aggressive' ? 0.9 : 0.55)) continue;
    return c;
  }
  return null;
}
export { dist };
