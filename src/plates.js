// Shared unit-presentation helpers (names, levels, status flags, rarity colours) + the pooled DOM nameplate overlay.
// No sim imports beyond data; everything about extra fields (elite/title/affixes/res/dtype/rarity) is read defensively.
import { FACTIONS, TEAM_COLORS, MONSTERS, UNITS, ROLE_INFO } from './data.js';

export const RARITY_HEX = [0xe6e6e6, 0xf2d84a, 0x58d058, 0x5a9bff, 0xb070ff];
export const RARITY_CSS = ['#e6e6e6', '#f2d84a', '#58d058', '#5a9bff', '#b070ff'];
export const RARITY_NAME = ['Common', 'Magic', 'Uncommon', 'Rare', 'Epic'];
export const NEUTRAL_CSS = '#e0a030';
export const BOSS_CSS = '#e8c050';
export const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

// damage-type normalisation for floaters / resistance chips
const DT_ALIAS = { physical: 'physical', phys: 'physical', slash: 'physical', fire: 'fire', burn: 'fire', flame: 'fire', cold: 'cold', ice: 'cold', frost: 'cold', lightning: 'lightning', shock: 'lightning', elec: 'lightning', electric: 'lightning', poison: 'poison', toxic: 'poison', acid: 'poison', plague: 'poison' };
export const dtypeOf = (d) => DT_ALIAS[String(d || '').toLowerCase()] || null;
export const DT_GLYPH = { physical: '✕', fire: '♨', cold: '❄︎', lightning: 'ϟ', poison: '☣︎' };
export const DT_NAME = { physical: 'Physical', fire: 'Fire', cold: 'Cold', lightning: 'Lightning', poison: 'Poison' };

// affix tint: "fiery", "frost", ... -> colour. Falls back to the champion blue.
const AFFIX_TINT = [[/fier|fire|flame|burn|inferno|molten/i, 0xff7a30], [/cold|ice|frost|freez|chill/i, 0x7fd0ff], [/light|shock|elec|storm|thunder/i, 0xffe650], [/poison|venom|toxic|plague|acid/i, 0x8fe040], [/vamp|blood|leech/i, 0xd03040], [/shadow|dark|curs|necro|soul/i, 0xa070ff]];
export const CHAMP_TINT = 0x6aa4ff, BOSS_TINT = 0xe8c050;
export function eliteLevel(e) { return e.elite !== undefined ? (e.elite | 0) : e.boss ? 2 : 0; }
export function eliteTint(e) {
  const el = eliteLevel(e);
  if (el >= 2) return BOSS_TINT;
  if (Array.isArray(e.affixes)) {
    for (const a of e.affixes) { const s = typeof a === 'string' ? a : (a && (a.id || a.name || a.key)) || ''; for (const [re, c] of AFFIX_TINT) if (re.test(s)) return c; }
  }
  return CHAMP_TINT;
}

export function baseName(e) {
  if (e.kind === 'hero') return e.heroName || FACTIONS[e.faction ?? e.team]?.title || 'Hero';
  if (e.recruit && e.name) return e.name; // servant: its type name
  const d = (e.kind === 'unit' ? UNITS : MONSTERS)[e.type];
  return (d && d.name) || e.type || '?';
}
export function entTitle(e) { return (e.title && String(e.title)) || baseName(e); }
// v0.5: servants (units) have no level: their plate shows the role icon instead of a number
export const unitIcon = (e) => (UNITS[e.type] && UNITS[e.type].icon) || (ROLE_INFO[e.role] && ROLE_INFO[e.role].icon) || '•';
// monsters have no level of their own: approximate from tier and the match-time growth multiplier
export function entLevel(e) {
  if (e.kind === 'unit') return unitIcon(e);
  if (e.kind === 'mon') {
    if (e.mlvl) return e.mlvl | 0;
    if (e.lvl > 1) return e.lvl | 0;
    return Math.max(1, (e.tier || 0) * 2 + 1 + Math.round(((e.timeMul || 1) - 1) * 5) + (e.boss ? 3 : 0));
  }
  return e.lvl | 0 || 1;
}
export function entRole(e) {
  const el = eliteLevel(e);
  if (e.kind === 'hero') return 'Hero';
  if (el >= 2) return 'Boss';
  if (el === 1) return 'Champion';
  if (e.recruit) return 'Servant';
  if (e.kind === 'unit') return e.summoned ? 'Summoned' : e.team === 4 ? 'Militia' : 'Servant';
  return 'Monster';
}
export const relation = (e, local) => (e.team === local || e.team === 4 ? 'own' : e.team < 0 ? 'neu' : 'foe'); // team 4 = humanity: friendly with the heroes
export const teamCss = (e) => (e.team >= 0 && TEAM_COLORS[e.team] ? TEAM_COLORS[e.team].css : NEUTRAL_CSS);

// active timed statuses: [{k, rem}] (rem in seconds, may be 0 for open-ended)
export const STATUS = {
  stun: { ch: '✦', name: 'Stunned' }, slow: { ch: '❄︎', name: 'Slowed' }, burn: { ch: '♨', name: 'Burning' },
  buff: { ch: '▲', name: 'Empowered' }, debuff: { ch: '▼', name: 'Weakened' }, poison: { ch: '☣︎', name: 'Poisoned' },
};
export const STATUS_KEYS = Object.keys(STATUS);
export function statusOf(e, t, out = []) {
  out.length = 0;
  if (e.stun > 0) out.push({ k: 'stun', rem: e.stun });
  if (e.slowUntil > t && e.slowMul < 0.999) out.push({ k: 'slow', rem: e.slowUntil - t });
  if (e.burnUntil > t) out.push({ k: 'burn', rem: e.burnUntil - t });
  if (e.poisonUntil > t || (e.poison && e.poison.until > t)) out.push({ k: 'poison', rem: (e.poisonUntil || e.poison.until) - t });
  if (e.buff && t < e.buff.until) out.push({ k: 'buff', rem: e.buff.until - t });
  if (e.debuff && t < e.debuff.until) out.push({ k: 'debuff', rem: e.debuff.until - t });
  return out;
}
export const shieldOf = (e, t) => (e.shield && t < e.shield.until && e.shield.amt > 0 ? e.shield.amt : 0);

// resist chips from e.res ({fire: 0.5, ...} fraction of reduction, negative = vulnerable). Returns [{k, v, txt}]
export function resistChips(e) {
  const out = [];
  if (!e.res || typeof e.res !== 'object') return out;
  for (const [k0, v] of Object.entries(e.res)) {
    const k = dtypeOf(k0) || k0;
    if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) < 0.005) continue;
    const pct = Math.round(v); // sim.js e.res is in percent points (-100..75)
    out.push({ k, v, txt: (pct > 0 ? '+' : '') + pct + '%' });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- DOM plate pool
const MAXP = 64;
function makePlate(root) {
  const el = document.createElement('div');
  el.className = 'pl';
  el.innerHTML = '<div class="pn"></div><div class="pr"><div class="pv"></div><div class="pb"><i class="pg"></i><i class="ph"></i><i class="ps"></i><u class="px"></u></div></div><div class="pi"></div>';
  root.appendChild(el);
  const p = { el, pn: el.children[0], pv: el.children[1].children[0], ph: el.querySelector('.ph'), pg: el.querySelector('.pg'), ps: el.querySelector('.ps'), px: el.querySelector('.px'), pi: el.children[2], shown: false, c: {} };
  p.icons = STATUS_KEYS.map((k) => { const s = document.createElement('span'); s.className = 'si ' + k; s.textContent = STATUS[k].ch; p.pi.appendChild(s); return s; });
  return p;
}
const q1 = (v) => Math.round(v * 200) / 2; // percent quantised to 0.5

// servant plates: "(level) [health bar]" in team colour, small and always readable (v0.3)
const UNIT_CSS = `.pl.unit { --w: 46px; } .pl.unit .pb { height: 6px; border-width: 1px; }
.pl.unit .pv { width: 17px; height: 17px; margin-right: -6px; font-size: 10px; line-height: 13px; box-shadow: 0 0 0 1px #000, 0 0 5px var(--tc), inset 0 0 4px #000; }
.pl.unit.own .pb { border-color: var(--tc); } .pl.unit.own .pn { color: #ffe9a0; font-size: 10px; text-shadow: 0 1px 2px #000, 0 0 6px #ffcc50; }
.pl.unit.foe .pv { border-color: #d8503c; } .pl.unit .pn { font-size: 10px; }`;
function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('plateUnitCss')) return;
  const s = document.createElement('style'); s.id = 'plateUnitCss'; s.textContent = UNIT_CSS; document.head.appendChild(s);
}

export function createPlates(root) {
  injectCss();
  const pool = []; let used = 0;
  return {
    begin() { used = 0; },
    // d: { x, y (screen px), cls, name, lvl, pct, shield (0..1 of maxHp), tint (css), segs, mask, hit }
    show(d) {
      if (used >= MAXP) return;
      let p = pool[used];
      if (!p) { p = makePlate(root); pool.push(p); }
      used++;
      const c = p.c;
      if (!p.shown) { p.el.style.display = ''; p.shown = true; }
      const tx = Math.round(d.x), ty = Math.round(d.y);
      if (c.tx !== tx || c.ty !== ty) { c.tx = tx; c.ty = ty; p.el.style.transform = `translate3d(${tx}px,${ty}px,0) translate(-50%,-100%)`; }
      if (c.cls !== d.cls) { c.cls = d.cls; p.el.className = 'pl ' + d.cls; }
      if (c.tint !== d.tint) { c.tint = d.tint; p.el.style.setProperty('--tc', d.tint); }
      const nm = d.name || '';
      if (c.name !== nm) { c.name = nm; p.pn.textContent = nm; p.pn.style.display = nm ? '' : 'none'; }
      if (c.lvl !== d.lvl) { c.lvl = d.lvl; p.pv.textContent = d.lvl; }
      const hp = q1(d.pct);
      if (c.hp !== hp) { c.hp = hp; p.ph.style.width = hp + '%'; p.pg.style.width = hp + '%'; }
      const sh = q1(Math.min(1, d.shield || 0));
      if (c.sh !== sh) { c.sh = sh; p.ps.style.width = sh + '%'; p.ps.style.opacity = sh > 0 ? '1' : '0'; }
      if (c.segs !== d.segs) { c.segs = d.segs; p.px.style.setProperty('--sg', (100 / d.segs) + '%'); }
      if (c.mask !== d.mask) { c.mask = d.mask; for (let i = 0; i < STATUS_KEYS.length; i++) p.icons[i].style.display = d.mask & (1 << i) ? '' : 'none'; p.pi.style.display = d.mask ? '' : 'none'; }
      const hit = d.hit ? 1 : 0;
      if (c.hit !== hit) { c.hit = hit; p.el.classList.toggle('hit', !!hit); }
    },
    end() { for (let i = used; i < pool.length; i++) { const p = pool[i]; if (p.shown) { p.el.style.display = 'none'; p.shown = false; } } },
    count: () => used,
  };
}
export function statusMask(list) { let m = 0; for (const s of list) m |= 1 << STATUS_KEYS.indexOf(s.k); return m; }
