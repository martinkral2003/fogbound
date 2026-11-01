// FOGBOUND v0.5 client module "perks_ui" (SKILLS lane): the level-up card overlay for team.kit.offers[0] (3 big cards: icon, name, 1-line effect, level / branch tag).
// Markup and ids (#perkPick, .hd, .mn, .cards, .pcard) are the ones hud_ui.css styles; hud_ui.js owns the keys 7 / 8 / 9 (1 / 2 / 3 are potions), the shrink-to-pulse
// timer (adds / removes the class `min` on #perkPick after 8 s) and the click-to-expand. Picking = { t:'pickperk', idx } through controls.input.cmds (a card click).
// This module adds the SMART auto-pick: ignored for 19 s -> the class-priority choice (perks.autoIdx; hud_ui.js would pick card 0 at 20 s).
// It also decorates the skill bar buttons (#skA0..#skA3: title, data-lv / data-branch / data-aimed, .aiming), keeps F2 quick-cast and the "+XP" floaters.
import { SKILLS } from './data.js';
import { isAimed } from './skillaim.js';
import { modSkill, autoIdx } from './perks.js';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const PICK_AUTO = 19; // seconds unanswered before the auto-pick
const CARD_KEYS = [7, 8, 9];
const css = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const CSS = `
#perkPick .pcard small.sub { margin-top: 4px; color: #a8aea0; letter-spacing: 0.5px; text-transform: none; }
.sk[data-aimed]::after { content: '\\25ce'; position: absolute; left: 3px; bottom: 1px; font-size: 9px; color: var(--dim, #8a948c); }
.sk.aiming { border-color: #fff !important; box-shadow: 0 0 12px var(--gold, #e0bb5c); }
.xpFloat { position: fixed; z-index: 7; pointer-events: none; color: #ffd860; font-size: 13px; text-shadow: 0 1px 3px #000; animation: xpUp 1.8s ease-out forwards; }
@keyframes xpUp { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-34px); } }
`;

export function createUi(ctx) {
  const { game, st, local, ui } = ctx;
  const team = st.teams[local];
  if (!team || !team.kit) return null;
  const hud = document.getElementById('hud') || document.body;
  if (!document.getElementById('kitCss')) { const s = document.createElement('style'); s.id = 'kitCss'; s.textContent = CSS; document.head.appendChild(s); }
  const pick = document.createElement('div'); pick.id = 'perkPick'; pick.className = 'panel ui hidden'; hud.appendChild(pick);
  let sig = '', age = 0, lastOffer = null, autoSent = 0;

  const send = (idx) => { if (game.controls && game.controls.input) game.controls.input.cmds.push({ t: 'pickperk', idx }); };
  const cardHtml = (o, i) => {
    const s = SKILLS[o.skill] || {}, col = css(s.color || 0xe0bb5c);
    const tag = o.kind === 'path2' ? 'Mastery · ' + esc(o.skillName || s.name) : o.kind === 'path' ? 'Upgrade · ' + esc(o.skillName || s.name) : o.kind === 'level' ? `Level ${o.lvl - 1} → ${o.lvl}` : o.tag === 'ULTIMATE' ? 'Ultimate (R)' : 'New skill' + (isAimed(s) && !s.ult ? ' · aimed' : '') + (s.dodge ? ' · dodge' : '');
    const sub = o.kind === 'skill' ? `<small class="sub">Cooldown ${s.cd}s</small>` : o.kind === 'path' || o.kind === 'path2' ? '<small class="sub">Permanent upgrade</small>' : '';
    return `<div class="pcard${o.kind === 'skill' ? ' skl' : ''}" data-i="${i}" data-kind="${o.kind}" style="border-color:${col}"><kbd>${CARD_KEYS[i]}</kbd><span class="pic" style="color:${col}">${esc(o.icon || s.icon || '*')}</span><b>${esc(o.name)}</b><small style="color:${col}">${tag}</small><p>${esc(o.text)}</p>${sub}</div>`;
  };
  function render() {
    const offers = team.kit.offers, offer = offers[0];
    if (!offer) { if (sig) { sig = ''; pick.classList.add('hidden'); } lastOffer = null; return; }
    if (offer !== lastOffer) { lastOffer = offer; age = 0; autoSent = 0; sig = ''; } // a new card: restart the timer
    const s = offer.map((o) => o.kind + o.skill + o.branch).join(',') + '|' + offers.length + '|' + (team.hero ? team.hero.lvl : 1);
    if (s === sig) return;
    sig = s;
    pick.classList.remove('hidden');
    const first = offer[0], title = first.kind === 'skill' ? (first.tag === 'ULTIMATE' ? 'Choose your ultimate' : 'Learn a skill') : 'Level up';
    pick.innerHTML = `<div class="hd"><b>${title}</b><span>${offers.length > 1 ? offers.length + ' picks waiting · ' : ''}click a card or press ${CARD_KEYS.join(' ')}</span><span class="mn">▾</span></div><div class="cards">${offer.map(cardHtml).join('')}</div>`;
    pick.querySelectorAll('.pcard').forEach((c) => { c.onclick = (e) => { e.stopPropagation(); send(+c.dataset.i); }; });
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.code !== 'F2' || !game.controls || (e.target && /input|textarea/i.test(e.target.tagName))) return;
    e.preventDefault(); game.controls.quickCast = !game.controls.quickCast; // quick-cast: skills fire instantly at the cursor instead of aiming
    if (ui && ui.toast) ui.toast(game.controls.quickCast ? 'Quick-cast ON: skills fire instantly at the cursor' : 'Quick-cast OFF: hold a skill key to aim, release to fire', 'info');
  });

  // skill bar: aimed marker + tooltip with level and branch, highlight of the slot being aimed
  function decorateSkills() {
    const aim = game.controls && game.controls.aimState;
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById('skA' + i), id = team.kit.slots[i], base = id && SKILLS[id];
      if (!el || !base) continue;
      const s = modSkill(team, base, team.hero) || base, aimed = isAimed(s);
      if (aimed !== (el.dataset.aimed === '1')) { if (aimed) el.dataset.aimed = '1'; else delete el.dataset.aimed; }
      el.dataset.lv = base.ult ? '' : String(team.kit.lv[id] || 1);
      el.dataset.branch = team.kit.path[id] === undefined ? '' : String(team.kit.path[id]);
      el.classList.toggle('aiming', !!aim && aim.slot === i);
      const br = !base.ult && team.kit.path[id] !== undefined && base.br ? base.br[team.kit.path[id]] : null;
      const tip = base.name + (base.ult ? ' (ultimate)' : ' · level ' + (team.kit.lv[id] || 1)) + (br ? ' · ' + br.name : '') + ': ' + (br ? br.desc + ' ' : '') + base.desc + ' (cooldown ' + (+s.cd.toFixed(1)) + 's)'
        + (base.ult ? ' - hold the key, release at the cursor' : aimed ? ' - hold the key to aim, release or click to fire, RMB / Esc cancels' : '');
      if (el.title !== tip) el.title = tip;
    }
  }
  const floatXP = (text) => { // small "+XP" text above the hero (falls back to the screen centre)
    const d = document.createElement('div'); d.className = 'xpFloat'; d.textContent = text;
    d.style.left = '50%'; d.style.top = '38%'; d.style.transform = 'translateX(-50%)';
    document.body.appendChild(d); setTimeout(() => d.remove(), 1900);
  };
  return {
    open: false,
    update(dt) {
      render();
      const offer = team.kit.offers[0];
      if (offer && lastOffer === offer && !game.paused && team.hero && team.hero.alive) {
        age += typeof dt === 'number' && dt > 0 && dt < 1 ? dt : 1 / 60;
        if (age >= PICK_AUTO && !autoSent) { autoSent = 1; send(Math.max(0, autoIdx(st, team))); } // ignored: the class-priority choice
      }
      decorateSkills();
    },
    handleEvents(events) {
      for (const e of events) {
        if (e.type === 'xp' && e.team === local && e.reason !== 'kill' && e.reason !== 'chest') floatXP(`+${e.amt} XP · ${e.reason === 'discover' ? 'discovery' : e.reason}`);
      }
    },
  };
}
export function createView() { return null; }
