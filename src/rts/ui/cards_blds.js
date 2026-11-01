// FOGBOUND: DOMINION command card content for buildings (train / research / upgrades / rally / garrison / gates) and the worker build menu.
import { udef, bdef, roleGlyph, costHtml, costText, trainList, techList, unitUpgrades, upgradeInfo, buildList, bldCategory, CAT_ORDER, CAT_NAMES, CAT_GLYPH, bldGlyph, ageOf, AGE_NAMES } from './adapt.js';
import { slot } from './cards_units.js';

function unitTip(d, team) {
  const a = d.atk || {}, lines = [d.desc || ''];
  lines.push(`HP ${d.hp || '?'} · Armour ${d.armor || 0} · Speed ${d.speed || '?'}`);
  if (a.dmg) lines.push(`Damage ${a.dmg} (${a.dtype || 'physical'}) · Range ${a.range || 0} · every ${a.cd || 1}s`);
  if (d.popCost > 1) lines.push('Population ' + d.popCost);
  if (d.time) lines.push('Build time ' + d.time + 's');
  return { title: d.name, lines: lines.filter(Boolean), cost: costHtml(d.cost, team) };
}

export function buildingCard(ctx) {
  const { ctl, st, team, ui } = ctx;
  const sel = ctl.selBlds(), b0 = sel[0], slots = [];
  const same = sel.filter((b) => b.type === b0.type), d = bdef(b0.type, team);
  if (b0.state === 'building') {
    slots.push(slot({ id: 'cancelb', glyph: '✖', label: 'Cancel', pref: 'X', tip: { title: 'Cancel construction', lines: ['Refunds part of the cost.'] }, run: () => same.forEach((b) => ctl.queueCmd({ t: 'demolish', id: b.id })) }));
    return slots;
  }
  const ready = same.filter((b) => b.state === 'ready' || b.state === 'upgrading' || b.state === 'burning');
  if (ready.length) {
    const target = () => ready.slice().sort((a, b) => a.queue.length - b.queue.length)[0];
    for (const t of trainList(st, ready[0])) {
      const ud = udef(t.unit);
      slots.push(slot({ id: 'tr_' + t.unit, glyph: roleGlyph(ud.role), label: ud.name, pref: ud.name[0], cost: costHtml(ud.cost, team), enabled: !t.reason, reason: t.reason, tip: Object.assign(unitTip(ud, team), { req: t.reason }),
        run: (e) => ctl.queueCmd({ t: 'train', bld: target().id, unit: t.unit, n: e && e.shiftKey ? 5 : 1 }) }));
    }
    for (const t of techList(st, team.id)) {
      if (!t.at || !t.at.includes(b0.type) || t.done) continue;
      slots.push(slot({ id: 'rs_' + t.id, glyph: t.id.startsWith('age_') ? '♔' : '✎', label: t.name, pref: t.name[0], cost: costHtml(t.cost, team), enabled: t.available, tip: { title: t.name, lines: [t.desc, 'Research time ' + t.time + 's'], cost: costHtml(t.cost, team), req: t.reason }, reason: t.reason,
        run: () => ctl.queueCmd({ t: 'research', bld: target().id, tech: t.id }) }));
    }
    const U = unitUpgrades();
    for (const id in U) {
      const at = U[id].at || U[id].building; if (!at || ![].concat(at).includes(b0.type)) continue;
      const lvl = team.up[id] || 0, inf = upgradeInfo(id, lvl); if (!inf || inf.done) continue;
      slots.push(slot({ id: 'up_' + id, glyph: '⬆', label: (inf.name || id) + ' ' + (lvl + 1), pref: String(inf.name || id)[0], cost: costHtml(inf.cost, team), tip: { title: inf.name || id, lines: [U[id].desc || 'Unit upgrade line.'], cost: costHtml(inf.cost, team) },
        run: () => ctl.queueCmd({ t: 'upgrade', bld: target().id, upgrade: id }) }));
    }
  }
  const dd = bdef(b0.type, team);
  if (b0.wall && b0.wall.passable) slots.push(slot({ id: 'gate', glyph: b0.wall.locked ? '🔒' : '⛩', label: b0.wall.locked ? 'Unlock' : 'Lock', pref: 'L', tip: { title: 'Gate', lines: ['Locked gates stay shut even for your own units.'] }, run: () => ctl.queueCmd({ t: 'gate', ids: same.map((b) => b.id) }) }));
  if (b0.wall) slots.push(slot({ id: 'wup', glyph: '⬆', label: 'Upgrade', pref: 'U', tip: { title: 'Upgrade tier', lines: ['Timber -> stone -> black stone (costs stone).'] }, run: () => ctl.queueCmd({ t: 'wallUpgrade', ids: same.map((b) => b.id) }) }));
  if (dd.trains && dd.trains.length) slots.push(slot({ id: 'rally', glyph: '⚑', label: 'Rally', pref: 'R', active: ctl.mode && ctl.mode.kind === 'rally', tip: { title: 'Rally point', lines: ['Click ground (or right-click) to set where new units gather. Click a resource to auto-gather.'] }, run: () => ctl.setMode('rally') }));
  if (same.some((b) => b.garrison && b.garrison.length)) slots.push(slot({ id: 'unload', glyph: '⇱', label: 'Unload', pref: 'U', tip: { title: 'Unload', lines: ['Everyone leaves the building.'] }, run: () => same.forEach((b) => ctl.queueCmd({ t: 'ungarrison', bld: b.id })) }));
  if (b0.type !== 'keep') slots.push(slot({ id: 'demo', glyph: '⌫', label: 'Demolish', pref: 'V', tip: { title: 'Demolish', lines: ['Refunds 50% (V).'] }, run: () => same.forEach((b) => ctl.queueCmd({ t: 'demolish', id: b.id })) }));
  return slots;
}

// ---------------------------------------------------------------- worker build menu
export function buildMenuCard(ctx, page) {
  const { ctl, st, team, ui } = ctx;
  const list = buildList(st, team.id).filter((e) => e.type !== 'keep');
  const cat = page.split(':')[1];
  if (!cat) {
    return CAT_ORDER.map((c) => { const n = list.filter((e) => bldCategory(bdef(e.type, team)) === c).length; return slot({ id: 'cat_' + c, glyph: CAT_GLYPH[c], label: CAT_NAMES[c], pref: CAT_NAMES[c][0], badge: String(n), tip: { title: CAT_NAMES[c], lines: [n + ' buildings'] }, run: () => ui.setPage('build:' + c) }); });
  }
  const out = [];
  const wallTools = cat === 'defense';
  for (const e of list) {
    const d = bdef(e.type, team); if (bldCategory(d) !== cat) continue;
    const afford = Object.keys(e.cost || {}).every((r) => (team.res[r] || 0) >= e.cost[r]);
    const lines = [d.desc || '', `HP ${d.hp} · build ${d.buildTime || '?'}s`, d.pop ? `Houses +${d.pop}` : '', d.garrison ? 'Garrison ' + d.garrison : ''].filter(Boolean);
    out.push(slot({ id: 'b_' + e.type, glyph: bldGlyph(e.type), label: e.name, pref: e.name[0], cost: costHtml(e.cost, team), enabled: !e.reason, reason: e.reason, tip: { title: e.name, lines, cost: costHtml(e.cost, team), req: e.reason || (!afford ? 'Not enough resources' : '') },
      run: () => { ctl.build.start(e.type); } }));
  }
  if (wallTools && list.some((e) => e.type === 'wall')) {
    const wd = bdef('wall', team);
    out.push(slot({ id: 'tool_rect', glyph: '▣', label: 'Fortress', pref: 'F', tip: { title: 'Wall rectangle', lines: ['Drag a rectangle of walls with corner bastions and one gate.', 'Drag-line walls: choose a wall, press and drag. Shift = ring, Ctrl = gate in the middle.'] }, run: () => ctl.build.start('wall', 'rect') }));
  }
  return out;
}
