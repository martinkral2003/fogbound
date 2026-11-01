// FOGBOUND: DOMINION command card: picks the card for the current selection/page, paginates into a 5x3 grid, assigns unique hotkeys.
import { unitCard, spellCard, slot } from './cards_units.js';
import { buildingCard, buildMenuCard } from './cards_blds.js';

const RESERVED = new Set(['Q', 'E']);
const COLS = 5, ROWS = 3, N = COLS * ROWS;

export function computeCard(ctx) {
  const { ctl, ui } = ctx;
  let title = '', items = [], page = ui.page;
  if (ctl.build && ctl.build.active) {
    title = 'Placing';
    items = [slot({ id: 'cancel', glyph: '✖', label: 'Cancel', pref: 'C', hk: 'Esc', tip: { title: 'Cancel placement', lines: ['Right-click or Esc.'] }, run: () => ctl.cancelMode() }),
      slot({ id: 'rotl', glyph: '↺', label: 'Rotate', pref: 'Z', tip: { title: 'Rotate left', lines: ['Z, or Shift+wheel.'] }, run: () => ctl.build.rotate(-1) }),
      slot({ id: 'rotr', glyph: '↻', label: 'Rotate', pref: 'X', tip: { title: 'Rotate right', lines: ['X, or Shift+wheel.'] }, run: () => ctl.build.rotate(1) })];
    return layout(items, null, 0, ui);
  }
  if (ctl.mode) {
    items = [slot({ id: 'cancel', glyph: '✖', label: 'Cancel', pref: 'C', hk: 'Esc', tip: { title: 'Cancel', lines: ['Right-click or Esc.'] }, run: () => ctl.cancelMode() })];
    return layout(items, null, 0, ui);
  }
  const units = ctl.selUnits(), blds = ctl.selBlds();
  if (units.length) {
    if (page === 'spells') { title = 'Spells'; items = spellCard(ctx); }
    else if (page && page.startsWith('build') && units.some((u) => u.role === 'worker')) { title = page === 'build' ? 'Build' : 'Build: ' + page.split(':')[1]; items = buildMenuCard(ctx, page); }
    else { page = null; title = 'Orders'; items = unitCard(ctx); }
  } else if (blds.length) { page = null; title = 'Building'; items = buildingCard(ctx); }
  else page = null;
  if (ui.page !== page) ui.page = page;
  return layout(items, page, ui.sub || 0, ui);
}

function layout(items, page, sub, ui) {
  const slots = new Array(N).fill(null);
  const base = page ? N - 1 : N;
  let size = base;
  const paged = items.length > base;
  if (paged) size = base - 1;
  const pages = Math.max(1, Math.ceil(items.length / size)); sub = Math.min(sub, pages - 1); ui.sub = sub;
  const chunk = items.slice(sub * size, sub * size + size);
  chunk.forEach((s, i) => { slots[i] = s; });
  if (paged) slots[N - 2] = slot({ id: 'next', glyph: '»', label: 'More', pref: 'Tab', hk: ',', tip: { title: 'More', lines: ['Page ' + (sub + 1) + ' of ' + pages + ' (hotkey ,)'] }, run: () => { ui.sub = (sub + 1) % pages; ui.cardDirty = true; } });
  if (page) slots[N - 1] = slot({ id: 'back', glyph: '↩', label: 'Back', hk: 'Esc', tip: { title: 'Back', lines: ['Esc'] }, run: () => ui.setPage(page.includes(':') ? page.split(':')[0] : null) });
  assignHotkeys(slots);
  return { slots, page, pages };
}

function assignHotkeys(slots) {
  const used = new Set(RESERVED), map = {};
  const take = (s, k) => { s.hk = k; used.add(k); };
  // pass 1: explicit/preferred letters in order
  for (const s of slots) { if (!s || s.hk) continue; const p = (s.pref || '').toUpperCase(); if (/^[A-Z]$/.test(p) && !used.has(p)) take(s, p); }
  // pass 2: first free letter of the label, then any free letter
  for (const s of slots) {
    if (!s || s.hk) continue;
    const letters = (String(s.label || '').toUpperCase().match(/[A-Z]/g) || []).concat('QWERTYUIOPASDFGHJKLZXCVBNM'.split(''));
    const k = letters.find((c) => !used.has(c)); if (k) take(s, k);
  }
  return map;
}
