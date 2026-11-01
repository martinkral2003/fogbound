// Core HUD: vitals bars, level/XP, quick slots, interaction prompt, crosshair, buffs, vignette. (Top-of-screen widgets live in hudtop.js.)
import { sim, call } from './sim.js';
import { h, setText, setW, setShow, setCls, setStyle, clamp, rarityColor, itemGlyph, spellGlyph, statusInfo } from './dom.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];

function makeBar(parent, cls, label) {
  const b = h('div', 'rpg-bar ' + cls, parent);
  const trail = h('div', 'rpg-bar-trail', b), fill = h('div', 'rpg-bar-fill', b), txt = h('div', 'rpg-bar-txt', b);
  h('span', 'rpg-bar-lab', b, label);
  return { b, trail, fill, txt, shown: 1, trailV: 1 };
}

export function createHud(ctx, root) {
  const el = h('div', 'rpg-hud', root);
  const vig = h('div', 'rpg-vignette', el), low = h('div', 'rpg-lowhp', el);
  const dirs = h('div', 'rpg-dirs', el); // damage direction wedges
  const cross = h('div', 'rpg-cross', el); h('i', '', cross);
  const prompt = h('div', 'rpg-prompt rpg-hidden', el);
  const pk = h('span', 'rpg-key', prompt, 'E'), pt = h('span', 'rpg-prompt-t', prompt);

  // vitals (bottom-left)
  const vit = h('div', 'rpg-vitals', el);
  const head = h('div', 'rpg-vit-head', vit);
  const lvl = h('div', 'rpg-lvl', head), name = h('div', 'rpg-vit-name', head), gold = h('div', 'rpg-gold', head);
  const bars = { hp: makeBar(vit, 'hp', '♥'), st: makeBar(vit, 'st', '❈'), mp: makeBar(vit, 'mp', '✦') };
  const xpb = h('div', 'rpg-xp', vit), xpf = h('div', 'rpg-xp-fill', xpb), xpt = h('div', 'rpg-xp-txt', xpb);
  const pts = h('div', 'rpg-pts rpg-hidden', vit);

  // buffs (above vitals)
  const buffs = h('div', 'rpg-buffs', el);
  const buffEls = new Map();

  // quick slots (bottom-centre)
  const qs = h('div', 'rpg-quick', el);
  const slots = KEYS.map((k, i) => {
    const s = h('div', 'rpg-slot', qs), g = h('div', 'rpg-slot-g', s), cnt = h('div', 'rpg-slot-n', s), cd = h('div', 'rpg-slot-cd', s), cdt = h('div', 'rpg-slot-cdt', s);
    h('div', 'rpg-slot-k', s, k);
    return { s, g, cnt, cd, cdt, i, last: '' };
  });
  const flash = new Array(8).fill(0);

  let hurt = 0, prevHp = null, lastUse = -1;
  const hitDirs = [];

  function findItem(p, uid) {
    for (const it of p.inv || []) if (it.uid === uid) return it;
    for (const k in p.equip || {}) if (p.equip[k] && p.equip[k].uid === uid) return p.equip[k];
    return null;
  }
  function cdOf(p, st, key, max) {
    const tabs = [p.cd, p.cooldowns, p.spellCd, p.cs && p.cs.cd];
    for (const t of tabs) {
      if (!t || t[key] === undefined) continue;
      let v = +t[key]; if (!(v > 0)) continue;
      if (max && v > max * 3 && v > st.t - 1) v -= st.t; // absolute ready-time
      if (v > 0) return { left: v, max: max || v };
    }
    return null;
  }
  function slotView(p, st, v) {
    if (!v) return null;
    if (typeof v === 'string' && v.startsWith('spell:')) {
      const id = v.slice(6), d = (sim.Combat && sim.Combat.SPELLS && sim.Combat.SPELLS[id]) || {};
      let known = true; const ks = call('Skills', 'knownSpells', p); if (Array.isArray(ks)) known = ks.includes(id);
      const c = cdOf(p, st, id, d.cd);
      return { glyph: spellGlyph(id), color: '#8fb4ff', count: 0, cd: c, dim: !known || p.mana < (d.mana || 0), name: d.name || id };
    }
    const it = findItem(p, v); if (!it) return null;
    const c = cdOf(p, st, 'item:' + it.uid, 0) || cdOf(p, st, it.def, 0);
    const n = it.stack || it.qty > 1 ? it.qty : 0;
    return { glyph: itemGlyph(it), color: rarityColor(it.rarity), count: n, cd: c, dim: false, name: it.name, equipped: Object.values(p.equip || {}).includes(it) };
  }

  function update(dt) {
    const st = ctx.st(), p = ctx.player();
    const on = !!(p && st);
    setShow(el, on); if (!on) return;
    // vitals
    setText(lvl, p.lvl); setText(name, p.name || 'Hero'); setText(gold, '● ' + (p.gold | 0));
    for (const [k, cur, max] of [['hp', p.hp, p.maxHp], ['st', p.stamina, p.maxStamina], ['mp', p.mana, p.maxMana]]) {
      const b = bars[k], f = clamp(cur / Math.max(1, max), 0, 1);
      setW(b.fill, f);
      b.trailV = f >= b.trailV ? f : Math.max(f, b.trailV - dt * 0.35);
      setW(b.trail, b.trailV);
      setText(b.txt, Math.ceil(cur) + ' / ' + Math.round(max));
    }
    setCls(bars.hp.b, 'low', p.hp / p.maxHp < 0.25 && p.alive);
    setCls(bars.st.b, 'empty', p.stamina < 8);
    const need = call('Skills', 'xpNeed', p.lvl) || 100;
    setW(xpf, p.xp / Math.max(1, need)); setText(xpt, 'XP ' + Math.floor(p.xp) + ' / ' + need);
    const ap = (p.points && p.points.attr) || 0, sp = (p.points && p.points.skill) || 0;
    setShow(pts, ap + sp > 0); setText(pts, '★ ' + (ap ? ap + ' attribute (U)' : '') + (ap && sp ? ' · ' : '') + (sp ? sp + ' skill (K)' : ''));
    // hurt vignette
    if (prevHp !== null && p.hp < prevHp - 0.5) hurt = Math.min(1, hurt + (prevHp - p.hp) / Math.max(20, p.maxHp * 0.25));
    prevHp = p.hp; hurt = Math.max(0, hurt - dt * 1.2);
    setStyle(vig, 'opacity', hurt.toFixed(2));
    setStyle(low, 'opacity', p.alive && p.hp / p.maxHp < 0.3 ? (0.35 + 0.25 * Math.sin(performance.now() / 260)).toFixed(2) : '0');
    for (let i = hitDirs.length - 1; i >= 0; i--) {
      const d = hitDirs[i]; d.t -= dt;
      if (d.t <= 0) { d.el.remove(); hitDirs.splice(i, 1); continue; }
      const cam = p.yaw;
      d.el.style.transform = 'rotate(' + ((d.ang - cam) * 180 / Math.PI + 90).toFixed(0) + 'deg)'; d.el.style.opacity = clamp(d.t, 0, 1).toFixed(2);
    }
    // quick slots
    for (const s of slots) {
      const v = slotView(p, st, p.quick && p.quick[s.i]);
      const sig = v ? v.glyph + v.count + v.name : '';
      if (sig !== s.last) { s.last = sig; s.g.textContent = v ? v.glyph : ''; s.g.style.color = v ? v.color : ''; s.s.title = v ? v.name : 'Empty slot'; setText(s.cnt, v && v.count > 1 ? v.count : ''); }
      setCls(s.s, 'empty', !v); setCls(s.s, 'dim', !!(v && v.dim)); setCls(s.s, 'equipped', !!(v && v.equipped));
      const c = v && v.cd; setShow(s.cd, !!c); setShow(s.cdt, !!c);
      if (c) { setStyle(s.cd, 'height', (clamp(c.left / c.max, 0, 1) * 100).toFixed(0) + '%'); setText(s.cdt, c.left.toFixed(c.left < 10 ? 1 : 0)); }
      flash[s.i] = Math.max(0, flash[s.i] - dt); setCls(s.s, 'used', flash[s.i] > 0);
    }
    // interaction prompt
    let hit = null; if (p.alive && !ctx.ui.isModalOpen()) hit = call('Core', 'nearestInteractable', st, p) || null;
    setShow(prompt, !!hit); setCls(cross, 'use', !!hit);
    if (hit) setText(pt, promptText(hit));
    const wk = p.equip && p.equip.weapon && p.equip.weapon.ranged || (p.d && p.d.weapon && p.d.weapon.ranged);
    setCls(cross, 'bow', !!wk); setCls(cross, 'draw', !!wk && p.cs && p.cs.state === 'draw');
    setShow(cross, p.alive && !ctx.ui.isModalOpen());
    // buffs
    const seen = new Set();
    for (const s of p.status || []) {
      seen.add(s.id);
      let b = buffEls.get(s.id);
      if (!b) { const [g, col, nm, bad] = statusInfo(s.id); const e = h('div', 'rpg-buff' + (bad ? ' bad' : ''), buffs); e.style.setProperty('--bc', col); e.title = nm; h('b', '', e, g); b = { e, t: h('span', '', e) }; buffEls.set(s.id, b); }
      setText(b.t, s.t > 99 ? '' : Math.ceil(s.t)); setCls(b.e, 'ending', s.t < 3);
    }
    for (const [id, b] of buffEls) if (!seen.has(id)) { b.e.remove(); buffEls.delete(id); }
  }

  function promptText(hit) {
    const t = hit.target;
    if (hit.type === 'npc') return 'Talk to ' + (t.name || 'stranger');
    if (hit.type === 'item') return 'Pick up ' + ((t.item && t.item.name) || 'item');
    if (t.kind === 'corpse') return 'Search ' + (t.name || 'corpse');
    return (t.locked ? 'Unlock ' : 'Open ') + (t.name || (t.kind === 'crate' ? 'supply crate' : 'chest'));
  }

  function handleEvent(e, st, p) {
    if (e.type === 'hit' && p && e.tgt === p.id && e.src) {
      const s = st.byId.get(e.src);
      if (s && !e.blocked) { const d = document.createElement('div'); d.className = 'rpg-dir'; dirs.appendChild(d); hitDirs.push({ el: d, t: 1.2, ang: Math.atan2(s.z - p.z, s.x - p.x) }); if (hitDirs.length > 6) hitDirs.shift().el.remove(); }
    }
    if (e.type === 'hit' && p && e.tgt === p.id) hurt = Math.min(1, hurt + 0.15);
    if (p && e.actor === p.id && e.type === 'pickup') flash.fill(0);
  }
  function flashSlot(i) { if (i >= 0 && i < 8) flash[i] = 0.25; lastUse = i; }
  return { el, update, handleEvent, flashSlot };
}
