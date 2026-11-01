// FOGBOUND v0.5 SKILLS lane: the League-of-Legends style kit system (module name kept: sim.js and the lane hooks import it).
// State: team.kit = { cls, slots:[Q,W,E,R ids|null], lv:{skillId:1..3}, path:{skillId:branch 0..2}, offers:[[opt,opt,opt]...], ver, picks:[...], disc:{} }.
//   Option = { kind:'skill'|'level'|'path', skill, branch?, lvl?, name, icon, tag, text }. offers[0] is the card the player must pick next.
//   Command { t:'pickperk', idx } (alias 'pickskill') picks idx from offers[0]. Allied AI heroes pick through autoPick(st, teamId) (also done here after a short delay for every non-human team).
// Old perk / book / rank / loadout code is gone; `team.sk` and `team.perks` stay as READ-ONLY mirrors for UI code that has not moved yet (see syncCompat).
// Exports used elsewhere: grantXP, dangerAt, modSkill, heroXpNeed, xpGainFor, onHeroLevel, castRiders, summonKit, autoPick, autoIdx, offersOf, kitSkills, skillText (see V5.md).
import { SKILLS, CLASSES, KIT, MAX_HERO_LVL, UNITS, WORLD } from './data.js';
import { scaleDmg, MASTERY } from './kits.js';
import { simApi } from './sim.js';
import * as recruits from './recruits.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ deprecated v0.4 exports (kept so old imports still link)
export const PERKS = {};
export const RARITY_NAMES = ['Common', 'Rare', 'Epic'];
export const perkStats = () => null;
export const perkAgg = () => null;
export const choosePerk = () => 0;
export const applyRank = (o) => o;
export const rerollCard = () => false;
export const reroll = () => false;

// ------------------------------------------------------------------------------------------------ XP curve
// XP needed to go from level L to L+1 (index = L). Total 1 -> 10 = 2370. xpGainFor() steers a hero toward level 10 at about minute 14.
export const XP_NEED = [0, 50, 80, 120, 170, 230, 300, 380, 470, 570, 680, 800, 930, 1070, 1220]; // v0.5b: level cap 15 (XP to go from level L to L+1)
export const heroXpNeed = (l) => (l >= 1 && l < MAX_HERO_LVL ? XP_NEED[l] : 1e9);
const cumXp = (lvl) => { let s = 0; for (let l = 1; l < lvl; l++) s += XP_NEED[l]; return s; };
export const XP_TOTAL = cumXp(MAX_HERO_LVL);
export const XP_PACE = { maxLvlAt: 1080, exp: 1.15, lo: 0.08, hi: 1.0 }; // level 10 at 14 min; XP gain x0.55 when ahead of schedule .. x2.2 when behind
export const xpTarget = (t) => XP_TOTAL * Math.pow(clamp(t / XP_PACE.maxLvlAt, 0, 1.4), XP_PACE.exp);
// XP actually credited to hero `e` for a raw amount: gear bonus and the pace rubber band (so the tempo holds whatever the other lanes pay per kill)
export function xpGainFor(st, e, amt) {
  const have = cumXp(e.lvl) + e.xp, m = clamp(Math.pow((xpTarget(st.t) + 120) / (have + 120), 2.2), XP_PACE.lo, XP_PACE.hi);
  return amt * (1 + (e.xpBonus || 0) / 100) * m * ((st.diff && st.diff.xp) || 1);
}

// ------------------------------------------------------------------------------------------------ skill levels, branches, effective skill
const MULT_TYPES = new Set(['line', 'bolt', 'strike', 'aoe', 'dash', 'fan', 'zone', 'drain', 'blink', 'martyr']); // types whose `dmg` / `dps` are damage
const SIZE_F = ['radius', 'len', 'range', 'dist'];
function scaleLevel(o, lv) { // skill level 2..3: +30% damage, -8% cooldown, +7% size per level (summons: +1 servant, tougher; buffs: stronger / longer)
  const f = lv - 1;
  if (f <= 0) return;
  const dm = 1 + KIT.lvDmg * f, sf = 1 + KIT.lvSize * f;
  o.cd *= 1 - KIT.lvCd * f;
  switch (o.type) {
    case 'buff':
      if (o.dmg > 1) o.dmg = 1 + (o.dmg - 1) * dm;
      if (o.atkSpd > 1) o.atkSpd = 1 + (o.atkSpd - 1) * dm;
      if (o.healPct) o.healPct *= dm;
      o.dur *= 1 + 0.1 * f; o.radius *= sf;
      break;
    case 'shield': o.amt *= dm; o.dur *= 1 + 0.08 * f; break;
    case 'summon': o.n += f; o.dur *= 1 + 0.12 * f; o.hpMul = (o.hpMul || 1) * (1 + 0.15 * f); o.dmgMul = (o.dmgMul || 1) * (1 + 0.15 * f); break;
    case 'debuff': o.take = 1 + (o.take - 1) * dm; o.radius *= sf; o.dur *= 1 + 0.1 * f; break;
    case 'smoke': o.radius *= sf; o.dur *= 1 + 0.1 * f; break;
    default:
      if (MULT_TYPES.has(o.type)) scaleDmg(o, dm);
      for (const k of SIZE_F) if (typeof o[k] === 'number') o[k] *= sf;
      if (o.land) o.land = { ...o.land, radius: o.land.radius * sf };
  }
}
const fxCache = new WeakMap(); // kit -> Map(key -> effective skill)
// The skill as the hero really casts it: level scaling + chosen branch + the global damage knob + gear (cooldown reduction, skill radius). `s` is the base SKILLS entry.
export function modSkill(team, s, h) {
  const kit = team && team.kit;
  if (!kit || !s) return s;
  const id = s.id, ult = !!s.ult;
  const lv = ult ? 1 : clamp(kit.lv[id] || 1, 1, KIT.maxSkillLv), pa = ult ? undefined : kit.path[id], p2 = ult || !kit.path2 ? undefined : kit.path2[id];
  const cdr = h ? clamp(h.cdr || 0, 0, 50) : 0, sr = h ? h.skRad || 0 : 0;
  const key = id + ':' + lv + ':' + (pa === undefined ? '-' : pa) + (p2 === undefined ? '' : 'm' + p2) + ':' + Math.round(cdr) + ':' + Math.round(sr);
  let m = fxCache.get(kit);
  if (!m) { m = new Map(); fxCache.set(kit, m); }
  let out = m.get(key);
  if (out) return out;
  out = { ...s };
  if (!ult) {
    scaleLevel(out, lv);
    if (pa !== undefined && s.br && s.br[pa]) s.br[pa].fn(out);
    if (p2 !== undefined && MASTERY[p2]) MASTERY[p2].fn(out); // second upgrade tier (skill level 4+)
    if (MULT_TYPES.has(out.type) || out.rider) scaleDmg(out, KIT.dmgMul); // the global damage knob (also riders such as Iron Guard's burst)
    out.lv = lv; out.branch = pa;
  }
  if (cdr > 0) out.cd *= 1 - cdr / 100;
  if (sr > 0) { const f = 1 + sr / 100; for (const k of SIZE_F) if (typeof out[k] === 'number') out[k] *= f; }
  m.set(key, out);
  return out;
}
export const kitSkills = (team) => (team.kit ? team.kit.slots.slice(0, 3).filter(Boolean) : []);

// short effect text of reaching skill level `lv` (1 line, for the level-up cards)
export function skillText(s, lv) {
  const pc = (x) => Math.round(x * 100), cd = `-${pc(KIT.lvCd)}% cooldown`;
  switch (s.type) {
    case 'buff': return `Level ${lv}: stronger buff (+${pc(KIT.lvDmg)}%), 10% longer and wider, ${cd}`;
    case 'shield': return `Level ${lv}: shield absorbs +${pc(KIT.lvDmg)}% more, ${cd}`;
    case 'summon': return `Level ${lv}: +1 servant, 15% tougher and stronger, ${cd}`;
    case 'debuff': return `Level ${lv}: stronger mark (+${pc(KIT.lvDmg)}%), ${pc(KIT.lvSize)}% bigger area, ${cd}`;
    case 'smoke': return `Level ${lv}: ${pc(KIT.lvSize)}% bigger and longer, ${cd}`;
    default: return `Level ${lv}: +${pc(KIT.lvDmg)}% damage, +${pc(KIT.lvSize)}% size, ${cd}`;
  }
}

// ------------------------------------------------------------------------------------------------ riders and summons (called by sim.js castSkill)
const ev = (st, e) => st.events.push(e);
const blastTimer = (st, h, s, x, z, r, dmg, delay, o = {}) => st.timers.push({ type: 'blast', t: st.t + delay, x, z, r, dmg, bldMul: s.bldMul || 0.5, stun: o.stun || 0, burn: o.burn || 0, team: h.team, src: h.id, dtype: s.dtype, color: s.color, born: st.t, delay });
// Extra effects of a cast skill (s.rider). (x, z) = where the skill landed, dm = the damage multiplier castSkill used.
export function castRiders(st, team, h, s, x, z, dm) {
  const r = s.rider;
  if (!r) return;
  const A = simApi;
  if (r.ring) {
    const cx = r.ring.at === 'impact' ? x : h.x, cz = r.ring.at === 'impact' ? z : h.z;
    A.areaDamage(st, h, cx, cz, r.ring.r, r.ring.dmg * dm, { stun: r.ring.stun, dtype: s.dtype, bldMul: 0.5 });
    ev(st, { type: 'blast', x: cx, z: cz, r: r.ring.r, color: s.color || team.f.color });
  }
  if (r.scatter) {
    const c = r.scatter;
    for (let i = 0; i < c.n; i++) {
      const a = (i / c.n) * TAU + st.rng() * 0.8, d = c.spread * (0.55 + 0.45 * st.rng());
      blastTimer(st, h, s, x + Math.cos(a) * d, z + Math.sin(a) * d, c.r, c.dmg * dm, c.delay || 0.35, { burn: s.burn });
    }
  }
  if (r.echo) blastTimer(st, h, s, s.self ? h.x : x, s.self ? h.z : z, s.radius, (s.dmg || 0) * dm * r.echo.mul, r.echo.delay, { stun: (s.stun || 0) * 0.5, burn: s.burn });
  if (r.zone) {
    const c = r.zone;
    st.zones.push({ x, z, r: c.r, dps: c.dps * dm, until: st.t + c.dur, team: h.team, color: c.color || s.color, t0: st.t, slow: c.slow, dtype: c.dtype || s.dtype });
  }
  if (r.haste) h.buff = { until: st.t + r.haste.dur, dmg: 1, atkSpd: 1, spd: r.haste.m };
  if (r.allyHeal) {
    for (const e of st.ents) if (e.alive && e.team === h.team && (e.kind === 'unit' || e.kind === 'hero') && Math.hypot(e.x - h.x, e.z - h.z) <= r.allyHeal.r) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * r.allyHeal.frac);
    ev(st, { type: 'buff', x: h.x, z: h.z, r: r.allyHeal.r * 0.5, color: 0x80e090 });
  }
  if (r.slow) {
    for (const e of st.ents) {
      if (!e.alive || e.team >= 0 || Math.hypot(e.x - x, e.z - z) > r.slow.r + e.r) continue; // demons and wild monsters only
      e.slowUntil = st.t + r.slow.dur; e.slowMul = Math.min(e.slowMul && e.slowUntil > st.t ? e.slowMul : 1, r.slow.m);
    }
  }
}

// The summon skill type: servants come from the SERVANTS lane (recruits.summonServants(st, teamId, type, n, dur, opts)), with a plain-unit fallback.
//   opts = { x, z, ang, hpMul, dmgMul, color, skill, caster } (the 6th argument is optional for the callee). Returns the number of servants created.
export function summonKit(st, team, h, s, ang) {
  const n = Math.max(1, Math.round(s.n)), opts = { x: h.x, z: h.z, ang, hpMul: s.hpMul || 1, dmgMul: s.dmgMul || 1, color: s.color || team.f.color, skill: s.id, caster: h.id };
  try {
    if (typeof recruits.summonServants === 'function') {
      const made = recruits.summonServants(st, team.id, s.unit, n, s.dur, opts);
      const k = Array.isArray(made) ? made.length : typeof made === 'number' ? made : made ? 1 : 0;
      if (k > 0) return k;
    }
  } catch (e) { /* fall back to plain units */ }
  const key = UNITS[s.unit] ? s.unit : ['skeleton', 'guard', 'knight'].find((k) => UNITS[k]);
  if (!key) return 0;
  let made = 0;
  for (let k = 0; k < n; k++) {
    const a2 = ang + (k - (n - 1) / 2) * (n > 3 ? 0.6 : 0.9);
    let ux = h.x + Math.cos(a2) * 3, uz = h.z + Math.sin(a2) * 3;
    if (st.world.walkable && !st.world.walkable(ux, uz)) { ux = h.x; uz = h.z; }
    const u = simApi.spawnUnit(st, key, team.id, ux, uz, { temp: true, life: s.dur });
    if (!u) continue;
    u.lvl = Math.max(1, Math.floor(h.lvl / 2)); simApi.recalc(u);
    if (s.hpMul > 1) u.maxHp *= s.hpMul;
    if (s.dmgMul > 1) u.atk *= s.dmgMul;
    u.hp = u.maxHp;
    ev(st, { type: 'summon', x: u.x, z: u.z, color: s.color || team.f.color });
    made++;
  }
  return made;
}

// ------------------------------------------------------------------------------------------------ kit state and offers
export function syncCompat(team) { // READ-ONLY mirrors for UI code that still reads team.sk / team.perks
  const k = team.kit;
  if (!k) return;
  const sk = team.sk && team.sk.slots === k.slots ? team.sk : (team.sk = { known: [], slots: k.slots, ult: null, ults: [], rank: {}, offers: [], ver: 0 });
  sk.known = k.slots.filter(Boolean); sk.ult = k.slots[3] || null; sk.ults = sk.ult ? [sk.ult] : []; sk.ver = k.ver;
  const p = team.perks || (team.perks = { offers: [], picks: [], ver: 0, disc: {} });
  p.ver = k.ver; p.disc = k.disc;
}
export function initKit(team) {
  const cls = CLASSES[team.bg] || CLASSES[team.f && team.f.key] || CLASSES.soldier;
  team.kit = { cls: cls.id, slots: [null, null, null, null], lv: {}, path: {}, path2: {}, offers: [], ver: 0, sv: 0, picks: [], disc: {} };
  syncCompat(team);
  return team.kit;
}
const slotFree = (kit) => { for (let i = 0; i < 3; i++) if (!kit.slots[i]) return i; return -1; };
const known = (kit, id) => !!kit.lv[id];

function option(team, kind, id, branch) {
  const s = SKILLS[id], kit = team.kit, o = { kind, skill: id, name: s.name, icon: s.icon, cls: s.cls, color: s.color };
  if (kind === 'skill') {
    o.lvl = 1; o.tag = s.ult ? 'ULTIMATE' : 'NEW SKILL';
    o.text = s.desc; o.cd = s.cd;
  } else if (kind === 'level') {
    o.lvl = (kit.lv[id] || 1) + 1; o.tag = 'LEVEL ' + o.lvl;
    o.text = skillText(s, o.lvl);
  } else if (kind === 'path2') {
    const b = MASTERY[branch];
    o.branch = branch; o.lvl = kit.lv[id] || 1; o.tag = 'MASTERY'; o.name = b.name; o.skillName = s.name; o.text = b.desc;
  } else {
    const b = s.br[branch];
    o.branch = branch; o.lvl = kit.lv[id] || 1; o.tag = 'UPGRADE'; o.name = b.name; o.skillName = s.name; o.text = b.desc;
  }
  return o;
}
export function legal(team, o) {
  const kit = team.kit, s = SKILLS[o.skill], h = team.hero;
  if (!s) return false;
  const cls = CLASSES[kit.cls];
  switch (o.kind) {
    case 'skill':
      if (s.ult) return !kit.slots[3] && cls.ults.includes(o.skill) && (!h || h.lvl >= KIT.ultLevel);
      return !known(kit, o.skill) && slotFree(kit) >= 0 && cls.skills.includes(o.skill);
    case 'level': return known(kit, o.skill) && !s.ult && kit.lv[o.skill] < KIT.maxSkillLv;
    case 'path2': return known(kit, o.skill) && !s.ult && kit.lv[o.skill] >= 4 && !!kit.path2 && kit.path2[o.skill] === undefined && !!MASTERY[o.branch];
    case 'path': return known(kit, o.skill) && !s.ult && kit.lv[o.skill] >= 2 && kit.path[o.skill] === undefined && !!(s.br && s.br[o.branch]);
  }
  return false;
}
const shuffle = (rng, a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// which kind of offer hero level `lvl` gets right now: 'skill' (new Q/W/E skill), 'ult' (R at level 5), else 'mix' (level-ups and branches)
function kindFor(team, lvl) {
  const kit = team.kit;
  if (lvl >= KIT.ultLevel && !kit.slots[3] && !kit.offers.some((o) => o.meta && o.meta.kind === 'ult')) return 'ult';
  if (lvl <= 3 && slotFree(kit) >= 0) return 'skill';
  return 'mix';
}
export function buildOffer(st, team, kind) {
  const kit = team.kit, cls = CLASSES[kit.cls], out = [];
  if (kind === 'ult') {
    for (const id of cls.ults) out.push(option(team, 'skill', id));
  } else if (kind === 'skill') {
    const pool = shuffle(st.rng, cls.skills.filter((id) => !known(kit, id) && !SKILLS[id].ult));
    for (const id of pool.slice(0, 3)) out.push(option(team, 'skill', id));
  } else {
    const lv = [], pa = [];
    for (let i = 0; i < 3; i++) {
      const id = kit.slots[i];
      if (!id) continue;
      if (kit.lv[id] < KIT.maxSkillLv) lv.push(option(team, 'level', id));
      if (kit.lv[id] >= 2 && kit.path[id] === undefined) for (let b = 0; b < 3; b++) pa.push(option(team, 'path', id, b));
      if (kit.lv[id] >= 4 && kit.path2 && kit.path2[id] === undefined) for (const b of shuffle(st.rng, MASTERY.map((m, k) => k)).slice(0, 3)) pa.push(option(team, 'path2', id, b));
    }
    shuffle(st.rng, lv); shuffle(st.rng, pa);
    const count = {}, take = (o) => { if (out.length >= 3 || (count[o.skill] || 0) >= 2) return false; out.push(o); count[o.skill] = (count[o.skill] || 0) + 1; return true; };
    if (lv.length) take(lv.shift()); // always at least one level-up while any skill can still level
    const rest = shuffle(st.rng, [...lv, ...pa]);
    for (const o of rest) { if (out.length >= 3) break; take(o); }
    for (const o of rest) { if (out.length >= 3) break; if (!out.includes(o)) out.push(o); } // short of options: relax the two-per-skill rule
  }
  out.meta = { kind, sv: kit.sv };
  return out;
}
// make sure offers[0] only holds legal options; rebuild it (or drop it) when the kit changed since it was queued
export function normalize(st, team) {
  const kit = team.kit;
  if (!kit) return;
  for (let guard = 0; guard < 12 && kit.offers.length; guard++) {
    const head = kit.offers[0];
    const stale = head.meta && head.meta.kind === 'mix' && head.meta.sv !== kit.sv; // a level-up / branch list built before the last pick: refresh it
    if (head.length && !stale && head.every((o) => legal(team, o))) return;
    let kind = head.meta ? head.meta.kind : 'mix';
    if (kind === 'skill' && slotFree(kit) < 0) kind = 'mix';
    if (kind === 'ult' && kit.slots[3]) kind = 'mix';
    const neu = buildOffer(st, team, kind);
    if (neu.length) { neu.meta = { ...(head.meta || {}), kind, sv: kit.sv }; kit.offers[0] = neu; kit.ver++; return; }
    kit.offers.shift(); kit.ver++;
  }
}
export const offersOf = (team) => (team.kit ? team.kit.offers : []);

// every hero level (and once at the start, level 1) queues one offer
export function onHeroLevel(st, team, lvl) {
  const kit = team.kit;
  if (!kit) return;
  const kind = kindFor(team, lvl), offer = buildOffer(st, team, kind);
  if (!offer.length) return;
  offer.meta = { kind, lvl, sv: kit.sv };
  kit.offers.push(offer);
  kit.ver++; syncCompat(team);
  if (kit.offers.length === 1) normalize(st, team);
  if (team.human) ev(st, { type: 'msg', text: lvl >= 2 ? `Level ${lvl}: choose an upgrade (1 / 2 / 3)` : 'Choose your first skill (1 / 2 / 3)', kind: 'big', team: team.id });
}
function pickOffer(st, team, idx) {
  const kit = team.kit;
  if (!kit) return false;
  normalize(st, team);
  const head = kit.offers[0], o = head && head[idx];
  if (!o || !legal(team, o)) return false;
  const s = SKILLS[o.skill], h = team.hero;
  if (o.kind === 'skill') {
    const slot = s.ult ? 3 : slotFree(kit);
    kit.slots[slot] = o.skill; kit.lv[o.skill] = 1;
  } else if (o.kind === 'level') kit.lv[o.skill]++;
  else if (o.kind === 'path2') kit.path2[o.skill] = o.branch;
  else kit.path[o.skill] = o.branch;
  kit.offers.shift(); kit.ver++; kit.sv++;
  kit.picks.push({ kind: o.kind, skill: o.skill, branch: o.branch, lvl: h ? h.lvl : 1, t: st.t });
  syncCompat(team);
  normalize(st, team);
  ev(st, { type: 'kitpick', team: team.id, kind: o.kind, skill: o.skill, branch: o.branch, x: h ? h.x : 0, z: h ? h.z : 0 });
  if (team.human) ev(st, { type: 'msg', text: o.kind === 'path' || o.kind === 'path2' ? `${s.name}: ${o.name}` : o.kind === 'level' ? `${s.name} level ${o.lvl}` : `${s.name} learned`, kind: 'info', team: team.id });
  return true;
}

// AI: index of the best option of offers[0] by class priority (new skills in `prio` order, ultimate first listed, level-ups of lower-level skills, branches by class taste)
export function autoIdx(st, team) {
  const kit = team.kit;
  if (!kit) return -1;
  normalize(st, team);
  const head = kit.offers[0];
  if (!head || !head.length) return -1;
  const cls = CLASSES[kit.cls], rng = st && st.rng ? st.rng : Math.random;
  let best = -1, bs = -1e9;
  head.forEach((o, i) => {
    let sc = rng() * 4;
    if (o.kind === 'skill') {
      if (SKILLS[o.skill].ult) sc += 100 - cls.ults.indexOf(o.skill) * 6;
      else { const p = cls.prio.indexOf(o.skill); sc += 100 - (p < 0 ? 12 : p) * 7; }
    } else if (o.kind === 'level') sc += 62 - (kit.lv[o.skill] - 1) * 8 - Math.max(0, kit.slots.indexOf(o.skill)) * 2;
    else sc += 50 + (SKILLS[o.skill].type === 'summon' ? -10 : 0) - o.branch * 1.5;
    if (sc > bs) { bs = sc; best = i; }
  });
  return best;
}
export function autoPick(st, teamId) {
  const team = typeof teamId === 'object' ? teamId : st.teams[teamId];
  if (!team || !team.kit) return false;
  const i = autoIdx(st, team);
  return i >= 0 ? pickOffer(st, team, i) : false;
}

// ------------------------------------------------------------------------------------------------ XP sources
// Give XP to a team's hero (and nearby servants when x/z are given). Other lanes call this for events, gates, towns, POIs...
export function grantXP(st, teamId, amt, reason = 'misc', x, z) {
  const team = st.teams[teamId];
  amt = Math.round(amt);
  if (!team || !team.alive || !(amt > 0)) return 0;
  const h = team.hero;
  if (x === undefined) { if (h && h.alive) simApi.addXP(st, h, amt); }
  else simApi.giveXP(st, teamId, x, z, amt);
  ev(st, { type: 'xp', team: teamId, amt, reason, x: x !== undefined ? x : h ? h.x : 0, z: z !== undefined ? z : h ? h.z : 0 });
  return amt;
}
// how dangerous a place is: ~0.1 in a safe town .. ~1 far from the capital / near the Demon Gates (loot tiers, discovery XP)
export function dangerAt(st, x, z) {
  const S = st.world && st.world.sites;
  if (S && S.towns && S.towns.length) {
    const cap = S.towns.find((t) => t.id === S.capital) || S.towns[0];
    const gates = (S.demon && S.demon.gates) || (S.orc && S.orc.warcamp ? [S.orc.warcamp] : []);
    let near = 1e9;
    for (const t of S.towns) near = Math.min(near, Math.hypot(t.x - x, t.z - z) - (t.r || 0));
    const dc = Math.hypot(cap.x - x, cap.z - z) / (WORLD.size * 0.9);
    let gc = 0;
    for (const g of gates) gc = Math.max(gc, clamp(1 - Math.hypot(g.x - x, g.z - z) / (WORLD.size * 0.7), 0, 1));
    return clamp((0.1 + 0.7 * dc + 0.45 * gc) * (near < 30 ? 0.3 : 1), 0, 1.3);
  }
  return 0.5;
}

const DISC_R = 22, DISC_XP = { poi: 14, dungeon: 30 };
const seenEv = new WeakSet();
function discover(st, team) {
  const h = team.hero, sites = st.world && st.world.sites;
  if (!h || !h.alive || !sites || !team.kit) return;
  const D = team.kit.disc;
  const scan = (list, kind, tag) => {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const s = list[i], key = tag + (s.id !== undefined ? s.id : i);
      if (D[key]) continue;
      if (Math.abs(s.x - h.x) > DISC_R || Math.abs(s.z - h.z) > DISC_R || Math.hypot(s.x - h.x, s.z - h.z) > DISC_R) continue;
      D[key] = 1;
      const tier = s.tier || 1, xp = DISC_XP[kind] * (1 + 0.25 * (tier - 1)) * (1 + 0.5 * dangerAt(st, s.x, s.z));
      grantXP(st, team.id, xp, 'discover', s.x, s.z);
      if (team.human) ev(st, { type: 'msg', text: `Discovered: ${kind === 'poi' ? s.type : (s.theme || 'dungeon') + ' dungeon'} (+${Math.round(xp)} XP)`, kind: 'info', team: team.id });
    }
  };
  scan(sites.pois, 'poi', 'p'); scan(sites.dungeons, 'dungeon', 'd');
}

// ------------------------------------------------------------------------------------------------ lane hooks
export function init(st) {
  for (const t of st.teams) {
    if (!t.hero || t.id >= 4) continue;
    if (!t.kit) initKit(t);
    if (!t.kit.offers.length && !t.kit.picks.length && t.hero.lvl <= 1) onHeroLevel(st, t, 1); // the first extra skill is offered at the start
  }
}
const AI_DELAY = 1.0;
export function update(st, dt) {
  if (st.stepN % 15 === 0) for (const team of st.teams) if (team.alive && team.hero && team.kit) discover(st, team);
  // allied AI heroes (and a human's auto mode) pick their cards a moment after the offer appears
  for (const team of st.teams) {
    if (!team.kit || team.id >= 4 || !team.kit.offers.length) { if (team.kitT) team.kitT = 0; continue; }
    if (team.human && !team.auto) continue;
    if (!team.kitT) team.kitT = st.t + AI_DELAY + st.rng() * 0.8;
    else if (st.t >= team.kitT) { team.kitT = 0; autoPick(st, team); }
  }
  // XP for shrines and chests (events of this step)
  for (const e of st.events) {
    if (seenEv.has(e)) continue;
    if (e.type !== 'shrine' && e.type !== 'chest') continue;
    seenEv.add(e);
    if (e.team === undefined || e.team < 0 || e.team >= 4) continue;
    if (e.type === 'shrine') grantXP(st, e.team, 30 + 20 * dangerAt(st, e.x, e.z), 'shrine', e.x, e.z);
    else grantXP(st, e.team, 8 + 10 * dangerAt(st, e.x, e.z), 'chest', e.x, e.z);
  }
}
export function command(st, team, c) {
  if (c.t !== 'pickperk' && c.t !== 'pickskill') return false;
  pickOffer(st, team, c.idx | 0);
  return true;
}
// bounty XP for elites and bosses (every allied hero near the body gets it)
export function onKill(st, t, src) {
  if (!src || src.team === undefined || src.team < 0 || src.team === t.team || t.kind !== 'mon') return;
  const xp = t.boss ? 260 : t.elite === 1 ? 28 * (t.tier || 1) * (1 + 0.15 * (t.affixes ? t.affixes.length : 0)) : 0;
  if (xp > 0) for (let k = 0; k < 4; k++) grantXP(st, k, xp, 'bounty', t.x, t.z);
}
