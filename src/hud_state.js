// UI lane (v0.5): pure state helpers for the HUD, gear panel, town panel and map. No DOM, no Three: runs in Node (tools/v5-ui-test.js).
// Every read of another lane's state is defensive: those modules (kit, objective, gates, gear stat model, mercenaries) land at different times.
import { SKILLS, BACKGROUNDS, CLASSES, KIT, WORLD, MAX_HERO_LVL } from './data.js';

export const fmtT = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const arr = (a) => (Array.isArray(a) ? a : []);
export const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

export const ULT_LEVEL = (KIT && KIT.ultLevel) || 5; // R (the ultimate) unlocks at this hero level
export const ABILITY_KEYS = ['1', '2', '3', '4'];
export const POTION_KEYS = ['KeyQ', 'KeyE', 'KeyR']; // heal / haste / shield (WASD moves, 1-4 are abilities)
export const TOWN_COL = { safe: '#6fd08a', besieged: '#f0a030', fallen: '#7a8084', saved: '#6fd08a' };
export const CLASS_GLYPH = { soldier: '⚔', hunter: '➶', mage: '✺', outlaw: '✧' };
export const CLASS_NAME = { soldier: 'Soldier', hunter: 'Hunter', mage: 'Mage', outlaw: 'Outlaw' };
export const TIER_COL = ['#d8dccf', '#5aa8ff', '#e8c050']; // white / blue / gold (gear tier 0..2)
export const TIER_NAME = ['Plain', 'Fine', 'Master'];
export const POTION_KINDS = [
  { k: 'heal', icon: '✚', name: 'Heal', desc: 'Restores half your health', css: '#e0584a' },
  { k: 'speed', icon: '»', name: 'Haste', desc: 'Move and attack faster for a few seconds', css: '#f0cc58' },
  { k: 'shield', icon: '⛨', name: 'Shield', desc: 'Absorbs damage for a few seconds', css: '#8fc8ff' },
];
export const STAT_NAME = { dmg: 'damage', hp: 'health', spd: 'speed', cdr: 'cooldown' };
export const SLOT_NAME = { weapon: 'Weapon', helmet: 'Helmet', armor: 'Armour', amulet: 'Amulet' };
export const SLOT_GLYPH = { weapon: '⚔', helmet: '♛', armor: '⛨', amulet: '❂' };
export const SLOTS = ['weapon', 'helmet', 'armor', 'amulet'];

// ---------------------------------------------------------------- class / hero
export function heroDef(team) {
  const f = team.f || {};
  const bg = team.bg || f.key || '';
  return { name: f.title || f.name || team.name || 'Hero', css: f.css || '#e0bb5c', glyph: CLASS_GLYPH[bg] || '☠', bg, cls: CLASS_NAME[bg] || f.name || '' };
}
export const xpNeedFor = (xpNeed, lvl) => (typeof xpNeed === 'function' ? xpNeed(lvl) : Math.round(70 * Math.pow(lvl, 1.5)));
export const maxLevel = () => (typeof MAX_HERO_LVL === 'number' ? MAX_HERO_LVL : 10);

// ---------------------------------------------------------------- skill kit (Q W E R)
/** team.kit (v0.5 SKILLS lane) with a fallback to the old team.sk. Returns { slots:[4 x {id,skill,lv,branch,locked,empty}], offers, ver } */
export function kitView(team, heroLvl) {
  const K = team.kit || null, S = team.sk || null;
  const ids = K ? arr(K.slots) : S ? arr(S.slots) : [];
  const lvl = heroLvl !== undefined ? heroLvl : (team.hero && team.hero.lvl) || 1;
  const slots = [0, 1, 2, 3].map((i) => {
    const id = ids[i] || null, skill = id ? SKILLS[id] || null : null;
    const lv = id ? Math.max(1, Math.min(3, (K && K.lv && K.lv[id]) || (S && S.rank && S.rank[id]) || 1)) : 0;
    const br = id && K && K.path && K.path[id] !== undefined && K.path[id] !== null ? K.path[id] | 0 : -1;
    return { i, key: ABILITY_KEYS[i], id, skill, lv, branch: br, locked: i === 3 && !id && lvl < ULT_LEVEL, empty: !id };
  });
  const offers = K ? arr(K.offers) : S ? arr(S.offers) : [];
  return { slots, offers, ver: ((K && K.ver) || (S && S.ver) || 0) | 0, isKit: !!K };
}
export const BRANCH_LETTER = ['A', 'B', 'C'];

/** the pending level-up offer as cards: [{idx, icon, name, tag, text, kind, skill}] (works with kit offers, old perk offers and old skill offers) */
export function offerCards(team, perksMod) {
  let first = null;
  if (team.kit && arr(team.kit.offers).length) first = team.kit.offers[0];
  else if (team.perks && arr(team.perks.offers).length) first = team.perks.offers[0];
  else if (team.sk && arr(team.sk.offers).length) first = team.sk.offers[0];
  if (!first) return { cards: [], pending: 0 };
  const pending = team.kit ? arr(team.kit.offers).length : team.perks && arr(team.perks.offers).length ? team.perks.offers.length : arr(team.sk && team.sk.offers).length;
  const cards = arr(first).map((o, idx) => {
    if (o && typeof o === 'object') {
      const sk = SKILLS[o.skill] || null, kind = o.kind || 'skill';
      const lv = sk && team.kit && team.kit.lv ? team.kit.lv[o.skill] || 0 : 0;
      const tag = o.tag || (kind === 'skill' ? 'New skill' : kind === 'level' ? `Level ${lv + 1}` : 'Upgrade');
      return { idx, kind, skill: o.skill, branch: o.branch, icon: o.icon || (sk && sk.icon) || '✦', name: o.name || (sk && sk.name) || String(o.skill || 'Choice'), tag, text: o.text || (sk && sk.desc) || '' };
    }
    const id = String(o), sk = SKILLS[id], pk = perksMod && perksMod.PERKS && perksMod.PERKS[id];
    if (sk) return { idx, kind: 'skill', skill: id, icon: sk.icon || '✦', name: sk.name, tag: 'New skill', text: sk.desc || '' };
    if (pk) return { idx, kind: 'perk', icon: pk.icon || '✦', name: pk.name, tag: 'Upgrade', text: pk.desc || '' };
    return { idx, kind: 'perk', icon: '✦', name: id, tag: 'Choice', text: '' };
  });
  return { cards, pending };
}

// ---------------------------------------------------------------- towns
export const townsOf = (st) => (Array.isArray(st.towns) && st.towns.length ? st.towns : arr(st.world && st.world.sites && st.world.sites.towns).map((t) => ({ ...t, state: 'safe', def: 1 })));
export const townById = (st, id) => townsOf(st).find((t) => t.id === id) || null;
export const townName = (st, id) => { const t = townById(st, id); return t ? t.name : 'a town'; };
export const isCapital = (st, t) => !!t && (t.kind === 'capital' || (st.world && st.world.sites && st.world.sites.capital === t.id));
export const nearestTown = (st, x, z, maxD = 1e9) => { let b = null, bd = maxD; for (const t of townsOf(st)) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; b = t; } } return b; };

// ---------------------------------------------------------------- the demons: gates, front line, assaults (all reads defensive; `st.horde` is kept by the DEMONS lane)
function pathLen(path) { let L = 0; for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); return L; }
/** the part of the path (polyline [[x,z]...]) the front has already covered */
export function coveredPath(path, dist) {
  const out = [];
  if (!path.length) return out;
  out.push(path[0]);
  let left = dist;
  for (let i = 1; i < path.length && left > 0; i++) {
    const a = path[i - 1], b = path[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= left) { out.push(b); left -= d; } else { const k = left / d; out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); left = 0; }
  }
  return out;
}
export function gatesOf(st) {
  const H = st.horde || {}, site = arr(st.world && st.world.sites && st.world.sites.demon && st.world.sites.demon.gates);
  const live = arr(H.gates);
  const src = live.length ? live : site;
  return src.map((g) => ({ id: g.id, x: g.x, z: g.z, tier: g.tier | 0, closed: !!(g.closed || (g.hp !== undefined && g.maxHp && g.hp <= 0)), hp: g.hp, maxHp: g.maxHp }));
}
export function frontInfo(st) {
  const H = st.horde || null, sites = (st.world && st.world.sites) || {};
  const path = arr((H && H.path) || sites.frontPath);
  const dist = H && +H.dist > 0 ? +H.dist : 0, total = pathLen(path);
  const covered = coveredPath(path, dist);
  const last = covered.length ? covered[covered.length - 1] : null;
  const front = H && H.front && H.front.x !== undefined ? H.front : last ? { x: last[0], z: last[1] } : null;
  const assaults = arr(H && H.assaults).filter((a) => a && a.state !== 'done' && a.state !== 'over').map((a) => {
    const tid = a.townId !== undefined ? a.townId : a.town;
    return { id: a.id, townId: tid, town: townById(st, tid), state: a.state || 'march', eta: a.eta !== undefined ? a.eta : a.arriveT !== undefined ? a.arriveT - st.t : null, x: a.x, z: a.z };
  });
  const cap = (H && H.capital) || { state: 'pending' };
  return { has: !!H, path, covered, front, total, dist, frac: total > 0 ? Math.min(1, dist / total) : 0, gates: gatesOf(st), assaults, capital: cap, lord: (H && H.lord) || null };
}

// ---------------------------------------------------------------- objective banner
/** { id, text, n, need, x, z, kind, dist, has } : st.objective (set by horde.js setObjective) or a fallback derived from the towns */
export function objectiveOf(st, hero) {
  let o = st.objective && st.objective.text ? st.objective : null;
  if (!o) {
    const t = townsOf(st).find((q) => q.state === 'besieged');
    if (t) o = { id: 'fb:' + t.id, text: 'Defend ' + t.name, kind: 'defend', x: t.x, z: t.z };
    else {
      const g = gatesOf(st).find((q) => !q.closed);
      if (g) o = { id: 'fb:gate' + g.id, text: 'Close the Gate', kind: 'gate', x: g.x, z: g.z };
      else o = { id: 'fb:wait', text: 'Hold the line', kind: 'waiting' };
    }
  }
  const has = o.x !== undefined && o.z !== undefined && isFinite(o.x) && isFinite(o.z);
  const dist = has && hero ? Math.hypot(o.x - hero.x, o.z - hero.z) : -1;
  const need = num(o.need, 0), n = need > 0 ? Math.max(0, Math.min(need, num(o.n, 0))) : 0;
  return { id: o.id !== undefined ? o.id : o.text, text: String(o.text), n, need, x: o.x, z: o.z, kind: o.kind || 'event', dist, has, t: o.t };
}
/** arrow angle (radians, clockwise from screen-up) toward world (x,z) for a camera with yaw `yaw` (forward = (cos yaw, sin yaw)) */
export function bearingAngle(hx, hz, x, z, yaw) {
  const vx = x - hx, vz = z - hz, fx = Math.cos(yaw), fz = Math.sin(yaw), rx = -fz, rz = fx;
  return Math.atan2(vx * rx + vz * rz, vx * fx + vz * fz);
}

// ---------------------------------------------------------------- gear (4 slots, ONE stat each)
export function itemStat(it) {
  if (!it) return null;
  if (it.stat && it.val !== undefined) return { stat: it.stat, val: it.val };
  return null;
}
/** "+8 damage" / "+12% speed" / "-10% cooldown": flat when the value is >= 1, a percentage when it is a fraction */
export function statText(stat, val) {
  const nm = STAT_NAME[stat] || stat;
  if (val === undefined || val === null) return nm;
  const pct = Math.abs(val) < 1, v = pct ? Math.round(val * 1000) / 10 : Math.round(val * 10) / 10;
  return `${stat === 'cdr' ? '-' : '+'}${Math.abs(v)}${pct ? '%' : ''} ${nm}`;
}
export function itemLine(it) {
  const s = itemStat(it);
  if (s) return statText(s.stat, s.val);
  if (!it) return '';
  return it.tier !== undefined ? 'Tier ' + ((it.tier | 0) + 1) : '';
}
export function tierColor(it) { return TIER_COL[Math.max(0, Math.min(2, (it && it.tier) | 0))]; }
export function gearView(team) {
  const eq = (team.hero && team.hero.eq) || {};
  return SLOTS.map((slot) => { const it = eq[slot] || null; return { slot, label: SLOT_NAME[slot], glyph: SLOT_GLYPH[slot], item: it, name: it ? it.name || SLOT_NAME[slot] : '', line: it ? itemLine(it) : 'empty', color: it ? tierColor(it) : '#5a6068' }; });
}
/** toast / log text for a freshly equipped item */
export function equipText(it, slot) {
  const name = (it && it.name) || SLOT_NAME[slot] || 'item';
  const line = itemLine(it);
  return line ? `Equipped ${name} (${line})` : `Equipped ${name}`;
}

// ---------------------------------------------------------------- allies, stats
export function allyList(st, local) {
  return st.teams.filter((t) => t.id !== local && t.id >= 0 && t.id < 4 && !t.humanity && t.hero).map((t) => {
    const h = t.hero, d = heroDef(t);
    return { id: t.id, name: d.cls || d.name, css: d.css, glyph: d.glyph, lvl: h.lvl | 0, hp: h.hp, maxHp: h.maxHp, dead: !!(h.dead || !h.alive), respT: t.respT || 0, x: h.x, z: h.z };
  });
}
/** the four numbers on the end screen */
export function runStats(st, team, tally) {
  const run = team.run || {}, T = tally || {};
  const demons = Math.max(num(run.demons), num(run.orcs), num(run.kills), num(st.stats && st.stats.demons));
  const gates = Math.max(num(T.gates), gatesOf(st).filter((g) => g.closed).length);
  const saved = Math.max(num(T.saved), townsOf(st).reduce((n, t) => n + (t.state === 'safe' && (t.saved | 0) > 0 ? 1 : 0), 0));
  return { demons, gates, saved, time: st.t };
}

// ---------------------------------------------------------------- mercenary offers (SERVANTS lane exports recruits.mercenaryOffers)
export function hireOffers(rec, st, townId) {
  let list = [];
  try { if (rec && typeof rec.mercenaryOffers === 'function') list = rec.mercenaryOffers(st, townId) || []; } catch (e) { list = []; }
  return arr(list);
}

// ---------------------------------------------------------------- class cards for the menu
export function classCards() {
  return BACKGROUNDS.map((b) => ({
    id: b.id, name: b.name, title: b.title, css: b.css, emblem: b.emblem,
    line: b.line || b.kit || b.blurb || '',
    start: (CLASSES && CLASSES[b.key] && SKILLS[CLASSES[b.key].start]) || null,
    skills: arr(b.skills || b.pool).slice(0, 4).map((id) => SKILLS[id]).filter(Boolean),
  }));
}
export const worldSize = () => WORLD.size;
