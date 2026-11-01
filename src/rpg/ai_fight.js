// FLOW: rival combat micro (spacing, block/parry/dodge reactions, heavy attacks on staggered targets, bow kiting, spells).
import * as Combat from './combat.js';
import * as Skills from './skills.js';
import { angDiff, clamp } from '../util.js';
import { dist, yawTo, cinfo, hpFrac } from './ai_util.js';

export const DIFF = {
  easy:   { react: 0.52, dodge: 0.35, block: 0.15, parry: false, skill: 0.5, aim: 0.55, heavy: 0.05 },
  normal: { react: 0.30, dodge: 0.55, block: 0.2, parry: false, skill: 0.8, aim: 0.85, heavy: 0.12 },
  hard:   { react: 0.17, dodge: 0.55, block: 0.3, parry: true, skill: 1.0, aim: 1.0, heavy: 0.2 },
};

// Lanchester-ish fighting power: effective hp x damage per second
export function power(a, vs) {
  const w = a.d && a.d.weapon, avg = w ? (w.dmg[0] + w.dmg[1]) / 2 : 3;
  let dps = avg * (a.d.dmgMul || 1) * (a.d.atkSpeed || 1) * 0.8 * (1 + (a.d.critChance || 0));
  let ehp = Math.max(1, a.hp) / (1 - Math.min(0.75, (a.d.armor || 0) / 100));
  if (vs && vs.d && vs.d.weapon) { const dt = vs.d.weapon.dtype || 'physical'; ehp /= Math.max(0.2, 1 - Math.min(80, a.res[dt] || 0) / 100); }
  if (vs && vs.d && vs.d.weapon && w) { const dt = w.dtype || 'physical'; dps *= Math.max(0.2, 1 - Math.min(80, vs.res[dt] || 0) / 100); }
  return { ehp, dps, p: ehp * dps };
}
// n-vs-1 power: monsters add up; vs = the hero they would fight (resistances against his weapon matter)
export function groupPower(list, vs) { let e = 0, d = 0; for (const m of list) { const q = power(m, vs); e += q.ehp; d += q.dps; } return { ehp: e, dps: d, p: e * d }; }

export function isRangedStyle(a) {
  const w = a.d && a.d.weapon; if (!w) return false;
  return !!w.ranged || w.kind === 'bow' || w.kind === 'crossbow' || w.kind === 'staff';
}
export function hasAmmo(a) {
  const w = a.d.weapon; if (!w.ranged && w.kind !== 'bow' && w.kind !== 'crossbow') return true;
  const k = w.kind === 'crossbow' ? 'bolt' : 'arrow';
  return a.inv.some((i) => i.kind === k && (i.qty || 1) > 0) || (a.equip.offhand && a.equip.offhand.kind === k);
}

function bindSpells(a, inp) {
  let ids = []; try { ids = Skills.knownSpells ? Skills.knownSpells(a) || [] : []; } catch (e) { ids = []; }
  if (!ids.length) return [];
  const slots = [];
  a.quick.forEach((q, i) => { if (typeof q === 'string' && q.startsWith('spell:')) slots.push({ i, id: q.slice(6) }); });
  for (const id of ids.slice(0, 4)) {
    if (slots.some((s) => s.id === id)) continue;
    let free = -1; for (let i = 7; i >= 4; i--) if (!a.quick[i] && !slots.some((s) => s.i === i)) { free = i; break; }
    if (free < 0) break;
    inp.cmds.push({ t: 'quick', slot: free, spell: 'spell:' + id }); slots.push({ i: free, id });
  }
  return slots;
}
const ATTACK_SPELLS = ['firebolt', 'frostshard', 'arc', 'venom', 'drain', 'nova'];
function castAt(st, a, inp, t, d, P) {
  const ai = a.ai; ai.spellCd = Math.max(0, (ai.spellCd || 0) - 1 / 30);
  if (ai.spellCd > 0 || a.cs.state !== 'idle' || st.rng() > P.skill * 0.3) return false;
  const slots = bindSpells(a, inp); if (!slots.length) return false;
  const S = Combat.SPELLS || {};
  const have = (id) => slots.find((s) => s.id === id);
  const cost = (id) => (S[id] && S[id].mana) || 14;
  const hp = hpFrac(a);
  let pick = null;
  if (hp < 0.5 && have('mend') && a.mana >= cost('mend')) pick = have('mend');
  else if (!a.status.some((s) => s.id === 'shield') && have('stoneskin') && a.mana >= cost('stoneskin') && d < 14) pick = have('stoneskin');
  else for (const id of ATTACK_SPELLS) { const s = have(id); if (!s || a.mana < cost(id) || d > 22) continue; if (id === 'nova' && d > 5) continue; pick = s; if (st.rng() < 0.6) break; }
  if (!pick) return false;
  inp.slot = pick.i; ai.spellCd = ((S[pick.id] && S[pick.id].cd) || 2) * 0.5 + 0.6;
  return true;
}

// one step of fighting target t. Returns nothing; fills inp.
export function fight(st, a, inp, t, P) {
  const ai = a.ai, d = dist(a, t), w = a.d.weapon, ci = cinfo(a), ti = cinfo(t);
  const ranged = isRangedStyle(a) && hasAmmo(a);
  const toT = yawTo(a, t.x, t.z);
  inp.yaw = toT; inp.lockId = t.id;
  const treach = ti.reach || 2;
  // --- defence: react to a telegraphed attack aimed at us
  const aimedAtMe = Math.abs(angDiff(t.yaw, Math.atan2(a.z - t.z, a.x - t.x))) < 1.0;
  if (ti.attacking && d < treach + 2.4 && aimedAtMe) {
    if (!ai.threatAt) { ai.threatAt = st.t; ai.reactAt = st.t + P.react * (0.7 + st.rng() * 0.6); ai.reacted = false; }
    if (!ai.reacted && st.t >= ai.reactAt && st.t >= (ai.defCd || 0)) {
      ai.defCd = st.t + 0.9;
      ai.reacted = true; const r = st.rng();
      if (a.stamina > 24 && r < P.dodge) {
        inp.dodge = true; const side = (a.id & 1 ? 1 : -1) * (st.rng() < 0.3 ? -1 : 1);
        inp.mx = Math.cos(toT + 1.57 * side) * 0.8 - Math.cos(toT) * 0.3; inp.mz = Math.sin(toT + 1.57 * side) * 0.8 - Math.sin(toT) * 0.3;
      } else if (r < P.dodge + P.block && ci.canBlock && a.stamina > 45 && a.equip.offhand) {
        ai.blockFrom = st.t + (P.parry ? Math.max(0, (ti.windupLeft || 0.3) - 0.17) : 0); ai.blockUntil = ai.blockFrom + 0.55;
      }
    }
  } else if (!ti.attacking) { ai.threatAt = 0; }
  const blocking = ai.blockUntil > st.t && ai.blockFrom <= st.t;
  inp.block = blocking;
  const tired = a.stamina < 22 || (ai.exhausted = ai.exhausted ? a.stamina < 45 : a.stamina < 14);
  // --- ranged style: keep distance, draw & release
  if (ranged) {
    const range = (w.ranged && w.ranged.range) || 20, want = clamp(range * 0.55, 8, 15);
    let spell = false;
    if (w.kind === 'staff' || a.archetype === 'mage') spell = castAt(st, a, inp, t, d, P);
    if (d < want * 0.6) { inp.mx = -Math.cos(toT); inp.mz = -Math.sin(toT); inp.sprint = d < 4 && a.stamina > 20; }
    else if (d > want * 1.25) { inp.mx = Math.cos(toT) * 0.8; inp.mz = Math.sin(toT) * 0.8; }
    else { ai.strafeT = (ai.strafeT || 0) - 1 / 30; if (ai.strafeT <= 0) { ai.strafeT = 1.2 + st.rng() * 1.5; ai.strafeDir = st.rng() < 0.5 ? 1 : -1; } inp.mx = Math.cos(toT + 1.57) * 0.45 * ai.strafeDir; inp.mz = Math.sin(toT + 1.57) * 0.45 * ai.strafeDir; }
    if (d < 3.2 && ti.attacking === false && ci.canBlock && st.rng() < 0.02) inp.dodge = a.stamina > 25;
    if (w.kind === 'bow' || w.kind === 'crossbow' || w.ranged) {
      const ps = (w.ranged && w.ranged.projSpeed) || 30, ft = d / ps, lead = P.aim;
      const px = t.x + (t.vx || 0) * ft * lead, pz = t.z + (t.vz || 0) * ft * lead;
      inp.yaw = yawTo(a, px, pz);
      inp.pitch = Math.atan2((t.y + 1.2) - (a.y + 1.5) + 0.5 * 12 * ft * ft, d);
      if (ai.drawing) { ai.drawT += 1 / 30; inp.attack = true; if (ai.drawT >= ai.drawFor) { ai.drawing = false; inp.attack = false; ai.drawCd = 0.25 + st.rng() * 0.3; } }
      else { ai.drawCd = Math.max(0, (ai.drawCd || 0) - 1 / 30); if (ai.drawCd <= 0 && ci.canBlock && a.cs.state === 'idle' && d < range * 0.95 && !blocking && !spell) { ai.drawing = true; ai.drawT = 0; ai.drawFor = (w.ranged && w.ranged.draw ? w.ranged.draw : 0.9) + 0.1 + st.rng() * 0.2; inp.attack = true; inp.attackPressed = true; } }
    } else if (!spell && d < 2.5 && a.cs.state === 'idle') { inp.attackPressed = true; inp.attack = true; }
    return;
  }
  // --- melee: close in, strike, strafe while waiting
  const reach = (w.reach || 1.6) + t.radius * 0.6, want = reach * 0.85;
  if (blocking) { inp.mx = Math.cos(toT) * 0.1; inp.mz = Math.sin(toT) * 0.1; return; }
  if (tired) { inp.mx = -Math.cos(toT) * 0.6; inp.mz = -Math.sin(toT) * 0.6; if (ti.attacking && a.stamina > 8 && st.rng() < 0.03) inp.dodge = true; return; }
  if (d > want) { let ax = t.x, az = t.z; if (a.archetype === 'rogue' && d > 3) { ax = t.x - Math.cos(t.yaw) * 1.4; az = t.z - Math.sin(t.yaw) * 1.4; } inp.mx = Math.cos(yawTo(a, ax, az)); inp.mz = Math.sin(yawTo(a, ax, az)); inp.sprint = d > 7 && a.stamina > 30; }
  else { ai.strafeT = (ai.strafeT || 0) - 1 / 30; if (ai.strafeT <= 0) { ai.strafeT = 1 + st.rng() * 2; ai.strafeDir = st.rng() < 0.5 ? 1 : -1; } inp.mx = Math.cos(toT + 1.57) * 0.3 * ai.strafeDir; inp.mz = Math.sin(toT + 1.57) * 0.3 * ai.strafeDir; }
  ai.atkCd = Math.max(0, (ai.atkCd || 0) - 1 / 30);
  const inReach = d < reach + 0.35 && Math.abs(angDiff(a.yaw, toT)) < 0.5;
  if (inReach && ai.atkCd <= 0 && a.cs.state === 'idle' && a.stamina > (w.stam || 10) + 4 && (!ti.attacking || st.rng() < 0.35)) {
    inp.attackPressed = true; inp.attack = true;
    if ((ti.staggered && a.stamina > 30) || st.rng() < P.heavy * 0.1) inp.heavy = true;
    ai.atkCd = 0.15 + st.rng() * 0.45;
  }
}
