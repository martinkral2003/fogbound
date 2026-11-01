// FOGBOUND: DOMINION command card content for selected units: orders, stances, abilities, spells, build/repair entry points.
import { udef, abilityDef, prettyId, roleGlyph, spellList, descSpell, costText } from './adapt.js';

export const slot = (o) => Object.assign({ enabled: true, tip: null }, o);
const ORD = [
  { id: 'move', g: '➤', label: 'Move', pref: 'M', mode: 'move', tip: 'Move to a point. Shift queues. (Right-click does this too.)' },
  { id: 'stop', g: '■', label: 'Stop', pref: 'S', tip: 'Stop and clear orders.' },
  { id: 'hold', g: '⛊', label: 'Hold', pref: 'H', tip: 'Hold position: attack only what comes in range.' },
  { id: 'amove', g: '⚔', label: 'Attack', pref: 'A', mode: 'amove', tip: 'Attack-move: fight everything on the way. Click an enemy to focus it.' },
  { id: 'patrol', g: '⇄', label: 'Patrol', pref: 'P', mode: 'patrol', tip: 'Patrol between here and the target point.' },
  { id: 'guard', g: '⛉', label: 'Guard', pref: 'G', mode: 'guard', tip: 'Guard a friendly unit or building (click it).' },
];
const STANCE_NEXT = { aggressive: 'defensive', defensive: 'hold', hold: 'aggressive' };

export function unitCard(ctx) {
  const { ctl, st, team, ui } = ctx;
  const all = ctl.selUnits(), at = ctl.activeType(), us = at ? all.filter((u) => u.type === at) : all;
  const slots = [];
  const workers = us.filter((u) => u.role === 'worker'), siege = us.filter((u) => u.role === 'siege');
  for (const o of ORD) {
    if (o.id === 'patrol' && !us.some((u) => u.role !== 'worker')) continue;
    slots.push(slot({ id: o.id, glyph: o.g, label: o.label, pref: o.pref, tip: { title: o.label, lines: [o.tip] }, active: ctl.mode && ctl.mode.kind === o.mode,
      run: () => { if (o.mode) ctl.setMode(o.mode); else if (o.id === 'stop') ctl.stop(); else if (o.id === 'hold') ctl.hold(); } }));
  }
  const st0 = us[0] && us[0].stance || 'aggressive';
  slots.push(slot({ id: 'stance', glyph: { aggressive: '⚔', defensive: '⛨', hold: '⛊' }[st0], label: st0[0].toUpperCase() + st0.slice(1), pref: 'N', badge: 'stance',
    tip: { title: 'Stance: ' + st0, lines: ['Aggressive chases foes; defensive stays near its post; hold never moves.', 'Click to cycle.'] }, run: () => ctl.stance(STANCE_NEXT[st0] || 'aggressive') }));
  if (workers.length) {
    slots.push(slot({ id: 'build', glyph: '⚒', label: 'Build', pref: 'B', tip: { title: 'Build', lines: ['Open the building menu: economy, military, defense, magic.'] }, run: () => ui.setPage('build') }));
    slots.push(slot({ id: 'repair', glyph: '✚', label: 'Repair', pref: 'R', active: ctl.mode && ctl.mode.kind === 'repair', tip: { title: 'Repair', lines: ['Click a damaged own building.'] }, run: () => ctl.setMode('repair') }));
  }
  if (siege.length) slots.push(slot({ id: 'atkground', glyph: '☄', label: 'Bombard', pref: 'K', active: ctl.mode && ctl.mode.kind === 'attackground', tip: { title: 'Attack ground', lines: ['Fire at a spot (Ctrl+right-click).'] }, run: () => ctl.setMode('attackground') }));
  // abilities (union over the selection)
  const seen = new Set();
  for (const u of us) for (const a of u.abilities || []) {
    const id = typeof a === 'string' ? a : a.id; if (seen.has(id)) continue; seen.add(id);
    const d = abilityDef(id) || {}, owners = us.filter((q) => (q.abilities || []).some((x) => (typeof x === 'string' ? x : x.id) === id));
    const cd = Math.max(0, ...owners.map((q) => { const x = (q.abilities || []).find((y) => y.id === id); return x && x.cd ? x.cd : 0; }));
    const cdLeft = Math.min(...owners.map((q) => { const x = (q.abilities || []).find((y) => y.id === id); return x ? Math.max(0, (x.cd || 0)) : 0; }));
    const auto = d.auto && d.tgt !== 'point' && d.tgt !== 'unit';
    slots.push(slot({ id: 'ab_' + id, glyph: '✦', label: d.name || prettyId(id), pref: (d.name || id)[0], cdText: cdLeft > 0.5 ? Math.ceil(cdLeft) : '', enabled: true, badge: d.auto ? 'auto' : '',
      tip: { title: d.name || prettyId(id), lines: [d.desc || '', d.cd ? 'Cooldown ' + d.cd + ' s' : '', d.range ? 'Range ' + d.range + ' m' : ''].filter(Boolean) },
      run: () => {
        const ids = owners.map((q) => q.id);
        if (d.tgt === 'point' || d.tgt === 'unit') ctl.setMode('ability', { id, ids });
        else ctl.queueCmd({ t: 'ability', ids, id, x: owners[0].x, z: owners[0].z });
      } }));
  }
  const casters = us.filter((u) => u.role === 'general' || u.role === 'caster');
  if (casters.length) slots.push(slot({ id: 'spells', glyph: '☾', label: 'Spells', pref: 'Y', tip: { title: 'Spells', lines: ['Cast from your school of magic (mana from Sanctums and ley lines).'] }, run: () => ui.setPage('spells') }));
  if (us.some((u) => u.general)) slots.push(slot({ id: 'general', glyph: '♛', label: 'General', pref: 'L', tip: { title: 'General panel', lines: ['Skills, level, gear, revive. (F2)'] }, run: () => ui.togglePanel('general') }));
  return slots;
}

export function spellCard(ctx) {
  const { ctl, st, team, ui } = ctx;
  const us = ctl.selUnits();
  const caster = us.find((u) => u.general) || us.find((u) => u.role === 'caster');
  if (!caster) return [];
  return spellList(st, team.id, caster.id).filter((s) => s.unlocked || s.spell.research).map((s) => {
    const sp = s.spell, ds = descSpell(sp), mana = sp.cost && sp.cost.mana;
    return slot({
      id: 'sp_' + sp.id, glyph: sp.icon || '✦', label: sp.name, pref: sp.name[0], enabled: !!(s.unlocked && s.ready && s.affordable), cdText: s.cdLeft > 0.5 ? Math.ceil(s.cdLeft) : '', badge: s.unlocked ? '' : 'locked',
      cost: mana ? `<span class="rc mana"><i class="ri">✺</i>${mana}</span>` : '',
      tip: { title: ds.title || sp.name, lines: ds.lines || [sp.desc], req: s.reason || (s.ready ? '' : 'Cooling down') },
      run: () => {
        if (!s.unlocked || !s.ready || !s.affordable) { ui.toast(s.reason || 'Not ready', 'warn'); return; }
        if (sp.target === 'self') ctl.queueCmd({ t: 'cast', caster: caster.id, spell: sp.id, x: caster.x, z: caster.z });
        else ctl.setMode('cast', { spell: sp.id, caster: caster.id });
      },
    });
  });
}
