// Conversation box (Gothic / Skyrim style) driven by st.dialogue = {npcId, name, title, lines[], choices[{text,disabled,reason}], trade?, trainer?}.
import { h } from './dom.js';

const PORTRAIT = { smith: '⚒', alchemist: '⚗', inn: '☕', fence: '❖', trainer: '⚔', elder: '☥', guard: '⛨' };
function portraitOf(d, npc) {
  const key = String((npc && (npc.role || npc.type)) || d.npcKey || '').toLowerCase(), title = String(d.title || '').toLowerCase();
  for (const k in PORTRAIT) if (key.includes(k) || title.includes(k)) return PORTRAIT[k];
  if (title.includes('elder')) return PORTRAIT.elder;
  if (title.includes('trainer') || title.includes('master')) return PORTRAIT.trainer;
  if (title.includes('smith')) return PORTRAIT.smith;
  return '☻';
}

export function createDialoguePanel(ctx) {
  const el = h('div', 'rpg-dlg rpg-modal rpg-hidden');
  const box = h('div', 'rpg-dlg-box rpg-gothic', el);
  const port = h('div', 'rpg-dlg-port', box), pg = h('span', '', port);
  const main = h('div', 'rpg-dlg-main', box);
  const who = h('div', 'rpg-dlg-who', main), nm = h('span', 'rpg-dlg-name', who), tt = h('span', 'rpg-dlg-title', who);
  const text = h('div', 'rpg-dlg-text', main);
  const more = h('div', 'rpg-dlg-more rpg-hidden', main, 'click or Space to continue');
  const list = h('div', 'rpg-dlg-choices', main);
  h('div', 'rpg-dlg-foot', main).innerHTML = '<span class="rpg-key">1</span>-<span class="rpg-key">9</span> choose · <span class="rpg-key">Space</span> skip text · <span class="rpg-key">Esc</span> leave';
  let open = false, sig = '', full = '', shown = 0, waiting = false, choices = [];

  function reveal() { shown = full.length; text.textContent = full; list.classList.remove('rpg-hidden'); more.classList.add('rpg-hidden'); }
  function choose(i) {
    const c = choices[i]; if (!c || c.disabled || waiting) return false;
    if (shown < full.length) { reveal(); return true; }
    waiting = true; ctx.cmd({ t: 'choose', idx: i }); return true;
  }
  box.addEventListener('click', (e) => { if (shown < full.length && !e.target.closest('.rpg-dlg-ch')) reveal(); });

  function build(d, npc) {
    nm.textContent = d.name || (npc && npc.name) || 'Stranger'; tt.textContent = d.title ? ' — ' + d.title : ''; pg.textContent = portraitOf(d, npc);
    full = (d.lines || []).join('\n\n'); shown = ctx.settings.typewriter === false ? full.length : 0; waiting = false;
    choices = d.choices || [];
    list.textContent = '';
    choices.forEach((c, i) => {
      const b = h('button', 'rpg-dlg-ch rpg-btn' + (c.disabled ? ' off' : ''), list);
      h('span', 'rpg-dlg-n', b, String(i + 1)); h('span', 'rpg-dlg-t', b, c.text || '...');
      if (c.disabled && c.reason) h('span', 'rpg-dlg-r', b, c.reason);
      b.onclick = () => choose(i);
    });
    if (!choices.length) { const b = h('button', 'rpg-dlg-ch rpg-btn', list); h('span', 'rpg-dlg-n', b, '✕'); h('span', 'rpg-dlg-t', b, 'Farewell.'); b.onclick = () => ctx.ui.close('dialogue'); }
  }

  return {
    el,
    open() { open = true; sig = ''; el.classList.remove('rpg-hidden'); },
    close() { open = false; el.classList.add('rpg-hidden'); sig = ''; },
    isOpen: () => open,
    update(dt) {
      const st = ctx.st(), d = st && st.dialogue;
      if (!d) return;
      const s = d.npcId + '|' + (d.nodeId || '') + '|' + (d.lines || []).join('|') + '|' + (d.choices || []).map((c) => c.text + c.disabled).join('|');
      if (s !== sig) { sig = s; build(d, st.byId && st.byId.get(d.npcId)); }
      el.classList.toggle('sub', !!(d.trade || d.trainer));
      if (shown < full.length) { shown = Math.min(full.length, shown + dt * 150); text.textContent = full.slice(0, Math.floor(shown)); }
      const done = shown >= full.length; list.classList.toggle('rpg-hidden', !done); more.classList.toggle('rpg-hidden', done);
    },
    keyHandler(e) {
      if (!open) return false;
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m) { choose(+m[1] - 1); return true; }
      if (e.code === 'Space' || e.code === 'Enter') { if (shown < full.length) reveal(); else if (choices.length === 1) choose(0); return true; }
      return false;
    },
  };
}
