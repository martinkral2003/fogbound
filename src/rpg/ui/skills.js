// SKILLS panel (key K): skill trees by category, rank pips, detail + Learn (near a trainer), known spells with quick-slot assignment.
import * as Skills from '../skills.js';
import * as Combat from '../combat.js';
import { QUICK_SLOTS } from '../consts.js';
import { h, clear, num, createTip, DTYPE_INFO } from './itemui.js';

const GROUPS = [['combat', 'Combat'], ['magic', 'Magic'], ['rogue', 'Rogue'], ['utility', 'Utility']];
const rankOf = (a, id) => (a.skills && a.skills[id]) || 0;

export function createSkillsPanel(ctx) {
  const S = { open: false, sel: null, sig: '', npcId: 0, role: null, offerIds: null };
  const tip = createTip(ctx.root);
  const bannerEl = h('div', { class: 'rpg-sk-banner' }), treesEl = h('div', { class: 'rpg-sk-trees' }), detEl = h('div', { class: 'rpg-sk-det' }), spellEl = h('div', { class: 'rpg-sk-spells' });
  const ptsEl = h('b', { text: '0' }), goldEl = h('b', { class: 'rpg-gold', text: '0' });
  const el = h('div', { class: 'rpg-iw rpg-modal rpg-gothic rpg-sk rpg-hidden' },
    h('div', { class: 'rpg-iw-head' }, h('h2', { text: 'Skills' }), h('span', { class: 'rpg-iw-hint' }, 'Learning points ', ptsEl, '   ·   ', h('span', { class: 'rpg-coin' }), goldEl, ' gold'),
      h('button', { class: 'rpg-x', text: '×', title: 'Close (Esc)', on: { click: () => close() } })),
    bannerEl,
    h('div', { class: 'rpg-iw-body rpg-sk-body' }, h('div', { class: 'rpg-sk-main' }, treesEl, h('div', { class: 'rpg-sub', text: 'Known spells — click a quick slot to bind' }), spellEl), detEl));
  ctx.root.appendChild(el);
  const P = () => ctx.player(), st = () => ctx.st();

  // trainer in reach: the open dialogue's trainer, else the nearest NPC with a role within TRAIN_RANGE
  function findTrainer(a) {
    const s = st(), d = s.dialogue, range = Skills.TRAIN_RANGE || 6;
    const cand = d && d.npcId && s.byId && s.byId.get(d.npcId);
    const test = (n) => n && n.alive !== false && Skills.npcRole && Skills.npcRole(n) && Math.hypot(n.x - a.x, n.z - a.z) <= range;
    if (test(cand)) return cand;
    let best = null, bd = 1e9;
    for (const n of s.npcs || []) if (test(n)) { const dd = Math.hypot(n.x - a.x, n.z - a.z); if (dd < bd) { bd = dd; best = n; } }
    return best;
  }
  function learnState(a, id) {
    const c = Skills.canLearn ? Skills.canLearn(a, id, S.role ? { role: S.role } : {}) : { ok: false, reason: 'unavailable' };
    if (c.ok || !S.role) return { ...c, ok: c.ok && !!S.npcId, reason: c.ok && !S.npcId ? 'Find a trainer to learn this' : c.reason };
    return c;
  }
  function renderBanner(a) {
    clear(bannerEl); const n = S.npcId && st().byId.get(S.npcId);
    bannerEl.className = 'rpg-sk-banner' + (n ? ' rpg-on' : '');
    bannerEl.append(n ? '✦ Trainer: ' + n.name + ' (' + S.role + ') — skills they teach are highlighted' : 'No trainer in reach. Visit a trainer in Harrowmere to learn skills.');
  }
  function renderTrees(a) {
    clear(treesEl);
    for (const [g, label] of GROUPS) {
      const col = h('div', { class: 'rpg-sk-col' }, h('div', { class: 'rpg-sk-gh', text: label }));
      for (const id of Skills.SKILL_IDS || Object.keys(Skills.SKILLS)) {
        const sk = Skills.SKILLS[id]; if (sk.group !== g) continue;
        const r = rankOf(a, id), ls = learnState(a, id), teach = S.offerIds && S.offerIds.has(id);
        const pips = h('div', { class: 'rpg-pips' });
        for (let i = 1; i <= sk.maxRank; i++) pips.append(h('i', { class: i <= r ? 'rpg-full' : i === r + 1 && ls.ok ? 'rpg-next' : '' }));
        const card = h('div', { class: 'rpg-sk-card' + (S.sel === id ? ' rpg-sel' : '') + (r >= sk.maxRank ? ' rpg-max' : '') + (ls.ok ? ' rpg-can' : '') + (teach ? ' rpg-teach' : '') },
          h('div', { class: 'rpg-sk-n' }, h('span', { text: sk.name }), h('em', { text: r + '/' + sk.maxRank })), pips, h('small', { text: r ? sk.ranks[r - 1].name : 'Untrained' }));
        card.addEventListener('click', () => { S.sel = id; render(true); });
        col.append(card);
      }
      treesEl.append(col);
    }
  }
  function renderDetail(a) {
    clear(detEl);
    const id = S.sel, sk = id && Skills.SKILLS[id];
    if (!sk) { detEl.append(h('div', { class: 'rpg-empty', text: 'Select a skill to see its ranks.' })); return; }
    const r = rankOf(a, id), ls = learnState(a, id);
    const body = h('div', { class: 'rpg-sk-ranks' }); detEl.append(h('h3', { text: sk.name }), h('div', { class: 'rpg-dimtxt', text: sk.desc }), body);
    for (let i = 1; i <= sk.maxRank; i++) {
      const d = Skills.describeSkill ? Skills.describeSkill(id, i) : null, rk = sk.ranks[i - 1];
      const row = h('div', { class: 'rpg-sk-rank' + (i <= r ? ' rpg-got' : i === r + 1 ? ' rpg-nx' : '') },
        h('div', { class: 'rpg-sk-rh' }, h('b', { text: i + '. ' + rk.name }), h('span', { text: i <= r ? 'learned' : d ? d.cost.costPoints + ' pt · ' + num(d.cost.costGold) + ' g' : '' })));
      if (d) {
        for (const e of d.effects) row.append(h('div', { class: 'rpg-tl-mod', text: e }));
        for (const sp of d.spells) { const S2 = Combat.SPELLS && Combat.SPELLS[sp]; row.append(h('div', { class: 'rpg-tl-good', text: 'Teaches spell: ' + (S2 ? S2.name : sp) })); }
        if (d.note) row.append(h('div', { class: 'rpg-tl-dim', text: d.note }));
        if (i > r) row.append(h('div', { class: 'rpg-tl-dim', text: 'Requires ' + d.req.join(', ') }));
      }
      body.append(row);
    }
    const foot = h('div', { class: 'rpg-sk-foot' });
    if (r >= sk.maxRank) foot.append(h('span', { class: 'rpg-dimtxt', text: 'Mastered.' }));
    else {
      const b = h('button', { class: 'rpg-btn rpg-primary', text: 'Learn rank ' + (r + 1) + (ls.costGold != null ? '  (' + ls.costPoints + ' pt, ' + num(ls.costGold) + ' g)' : ''), disabled: ls.ok ? null : true,
        on: { click: () => { if (ls.ok) ctx.cmd({ t: 'learn', skill: id, npc: S.npcId }); } } });
      foot.append(b, h('span', { class: 'rpg-sk-why' + (ls.ok ? ' rpg-ok' : ''), text: ls.ok ? 'Ready to learn.' : ls.reason || '' }));
    }
    detEl.append(foot);
  }
  function renderSpells(a) {
    clear(spellEl);
    const known = Skills.knownSpells ? Skills.knownSpells(a) : [];
    if (!known.length) spellEl.append(h('div', { class: 'rpg-empty', text: 'No spells known.' }));
    for (const id of known) {
      const sp = (Combat.SPELLS && Combat.SPELLS[id]) || { name: id, icon: '✦' }, di = DTYPE_INFO[sp.dtype] || DTYPE_INFO.physical, key = 'spell:' + id;
      const bound = a.quick.map((q, i) => (q === key ? i + 1 : 0)).filter(Boolean);
      const slots = h('div', { class: 'rpg-sp-slots' });
      for (let i = 0; i < QUICK_SLOTS; i++) slots.append(h('button', { class: 'rpg-sp-s' + (a.quick[i] === key ? ' rpg-on' : ''), text: i + 1, title: 'Bind to quick slot ' + (i + 1), on: { click: () => ctx.cmd({ t: 'quick', slot: i, spell: a.quick[i] === key ? null : key }) } }));
      const c = h('div', { class: 'rpg-sp', draggable: 'true' }, h('span', { class: 'rpg-sp-i', text: sp.icon || '✦', style: 'color:' + di.color }),
        h('div', { class: 'rpg-sp-t' }, h('b', { text: sp.name }), h('small', { text: (sp.mana != null ? sp.mana + ' mana' : '') + (sp.cd != null ? '  ·  ' + sp.cd + ' s cooldown' : '') + (bound.length ? '  ·  slot ' + bound.join(',') : '') })), slots);
      c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', key); });
      c.addEventListener('mouseenter', (e) => tip.text(sp.name, [{ t: sp.desc || '', c: 'dim' }, { t: (di.name) + ' · ' + (sp.kind || ''), c: 'dim' }, sp.dmg ? { t: 'Base damage ' + sp.dmg } : sp.heal ? { t: 'Heals ' + sp.heal } : ''].filter(Boolean), e, di.color));
      c.addEventListener('mousemove', (e) => tip.move(e)); c.addEventListener('mouseleave', () => tip.hide());
      spellEl.append(c);
    }
  }
  function render(force) {
    const a = P(); if (!a) return;
    const tr = findTrainer(a), sig = [a.lvl, a.gold, JSON.stringify(a.skills), a.points && a.points.skill, a.quick.join(','), tr ? tr.id : 0, S.sel].join('|');
    if (!force && sig === S.sig) return;
    S.sig = sig; tip.hide();
    S.npcId = tr ? tr.id : 0; S.role = tr ? Skills.npcRole(tr) : null;
    S.offerIds = S.role && Skills.trainerOffers ? new Set(Skills.trainerOffers(S.role).map((o) => o.skill)) : null;
    ptsEl.textContent = num((a.points && a.points.skill) || 0); goldEl.textContent = num(a.gold || 0);
    if (!S.sel) S.sel = (Skills.SKILL_IDS || Object.keys(Skills.SKILLS))[0];
    renderBanner(a); renderTrees(a); renderDetail(a); renderSpells(a);
  }
  function open() { S.open = true; el.classList.remove('rpg-hidden'); render(true); }
  function close() { S.open = false; el.classList.add('rpg-hidden'); tip.hide(); }
  return { el, open, close, isOpen: () => S.open, update() { if (S.open) render(false); } };
}
