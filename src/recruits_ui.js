// v0.5 DOM module "recruits_ui" (SERVANTS lane): the servants strip (bottom-left): role portrait, HP bar, the servant's 1-2 spells with cooldown, stance buttons,
// dismiss, plus a small "Hire" list (3 offers with prices) while the hero stands in a city. Own DOM root #recruits, shared `.v3-panel` / `.v3-btn` look.
// Non-blocking (`open` is always false, only the buttons take clicks). Commands go through game.controls.input.cmds ({t:'recruit'|'stance'|'dismiss'|'follow'|'hold'|'amove'}).
import * as D from './data.js';
import * as RC from './recruits.js';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const roleCol = (role) => (D.ROLE_INFO[role] && D.ROLE_INFO[role].col) || '#ccc';

const CSS = `
#recruits { position: fixed; left: 14px; bottom: 14px; z-index: 5; width: 248px; padding: 7px 8px 8px; font-size: 12px; user-select: none; pointer-events: none; }
#recruits.empty { display: none; }
#recruits .rc-hd { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 5px; color: var(--gold); letter-spacing: 1.2px; text-transform: uppercase; font-size: 11px; }
#recruits .rc-hd .all { display: flex; gap: 3px; }
#recruits .rc-b { font: inherit; font-size: 10px; line-height: 1; min-width: 20px; height: 20px; padding: 0 5px; background: #1a2025; color: var(--ink); border: 1px solid #4a535a; border-radius: 3px; cursor: pointer; pointer-events: auto; }
#recruits .rc-b:hover { border-color: #8a959c; } #recruits .rc-b.on { border-color: var(--gold); color: #ffe6a0; background: #2e2812; } #recruits .rc-b:disabled { opacity: .45; cursor: default; }
#recruits .rc-b.x { color: #c88; } #recruits .rc-b.x.sure { background: #5a1a1a; color: #fff; border-color: #c44; }
#recruits .rc-row { position: relative; display: grid; grid-template-columns: 34px 1fr; gap: 7px; align-items: center; padding: 4px 3px; border-top: 1px solid rgba(255,255,255,0.06); }
#recruits .rc-row:first-of-type { border-top: 0; }
#recruits .rc-p { position: relative; width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--rc, #aaa); background: radial-gradient(circle at 35% 30%, #3a3f44, #12161a 75%); display: flex; align-items: center; justify-content: center; font-weight: bold; color: var(--rc, #ddd); font-size: 16px; box-shadow: 0 0 6px #000; }
#recruits .rc-nm { display: flex; justify-content: space-between; gap: 4px; line-height: 14px; white-space: nowrap; overflow: hidden; }
#recruits .rc-nm b { color: #ffe9a0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; } #recruits .rc-nm small { color: var(--dim); font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
#recruits .rc-bar { height: 6px; background: #0d1114; border: 1px solid #2c343a; border-radius: 2px; margin: 3px 0 4px; overflow: hidden; position: relative; }
#recruits .rc-bar i { display: block; height: 100%; width: 100%; background: linear-gradient(#6ad06a, #3a9a3a); transition: width .12s; }
#recruits .rc-bar u { position: absolute; left: 0; top: 0; height: 100%; width: 0; background: rgba(255,240,176,.65); text-decoration: none; }
#recruits .rc-bar.low i { background: linear-gradient(#e86a4a, #b03a2a); }
#recruits .rc-bt { display: flex; gap: 3px; align-items: center; } #recruits .rc-bt .sp { flex: 1; }
#recruits .rc-sp { position: relative; width: 22px; height: 22px; border: 1px solid #5a6a74; border-radius: 4px; background: #11171b; color: #e8eef2; font-size: 13px; line-height: 20px; text-align: center; overflow: hidden; pointer-events: auto; cursor: help; }
#recruits .rc-sp .cd { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: rgba(0,0,0,.72); }
#recruits .rc-sp em { position: absolute; inset: 0; font: normal 9px/22px sans-serif; color: #ffe6a0; text-shadow: 0 0 3px #000; }
#recruits .rc-sp.rdy { border-color: var(--rc, #9ac); box-shadow: 0 0 5px -1px var(--rc, #9ac); }
#recruits .rc-sp.fire { animation: rcFire .45s; } @keyframes rcFire { 0% { transform: scale(1.35); background: #fff3c0; } 100% { transform: none; } }
#recruits .rc-row.hurt .rc-p { animation: rcHurt .5s; } @keyframes rcHurt { 30% { box-shadow: 0 0 10px #f44; } }
#recruits .rc-hire { margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.12); }
#recruits .rc-hire .t { color: var(--gold); letter-spacing: 1px; text-transform: uppercase; font-size: 10px; margin-bottom: 3px; }
#recruits .rc-o { display: grid; grid-template-columns: 24px 1fr auto; gap: 6px; align-items: center; padding: 2px 0; pointer-events: auto; }
#recruits .rc-o .ic { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--rc, #aaa); color: var(--rc, #ddd); text-align: center; font-size: 13px; line-height: 19px; }
#recruits .rc-o .nm { line-height: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } #recruits .rc-o .nm small { display: block; color: var(--dim); font-size: 9px; }
#recruits .rc-o .rc-b { height: 22px; min-width: 62px; }
#recruits .rc-note { color: var(--dim); font-size: 10px; margin-top: 4px; line-height: 1.3; }
`;

export function createUi(ctx) {
  if (typeof document === 'undefined') return null;
  if (!document.getElementById('recruitsCss')) { const s = document.createElement('style'); s.id = 'recruitsCss'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.id = 'recruits'; root.className = 'v3-panel ui empty';
  document.body.appendChild(root);
  const game = ctx.game;
  const st0 = () => game.st || ctx.st, local = () => (game.local !== undefined ? game.local : ctx.local);
  const send = (c) => { const inp = game.controls && game.controls.input; if (inp) inp.cmds.push(c); };
  const spec = (id) => D.UNITS[id] || {};

  root.innerHTML = '<div class="rc-hd"><span id="rcCount">Servants</span><span class="all"><button class="rc-b" data-all="follow" title="All follow you (H)">F</button><button class="rc-b" data-all="hold" title="All hold position (G)">H</button><button class="rc-b" data-all="amove" title="All attack-move ahead (R)">A</button></span></div><div id="rcRows"></div><div class="rc-hire" id="rcHire" style="display:none"></div><div class="rc-note" id="rcNote"></div>';
  const rowsEl = root.querySelector('#rcRows'), countEl = root.querySelector('#rcCount'), noteEl = root.querySelector('#rcNote'), hireEl = root.querySelector('#rcHire');
  const rows = new Map(); // follower id -> row refs
  let sureId = 0, sureT = 0, acc = 0, hireSig = '';
  const lastHp = new Map();

  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    ev.stopPropagation();
    const st = st0(), team = st.teams[local()], h = team && team.hero;
    if (b.dataset.all) {
      if (b.dataset.all === 'amove' && h) { const a = h.face || 0; send({ t: 'amove', x: h.x + Math.cos(a) * 14, z: h.z + Math.sin(a) * 14 }); }
      else send({ t: b.dataset.all });
      return;
    }
    if (b.dataset.hire) { send({ t: 'recruit', town: +b.dataset.town, type: b.dataset.hire }); acc = 1; return; }
    const id = +b.dataset.id;
    if (b.dataset.st) {
      if (b.dataset.st === 'amove' && h) { const a = h.face || 0; send({ t: 'stance', id, mode: 'amove', x: h.x + Math.cos(a) * 14, z: h.z + Math.sin(a) * 14 }); }
      else send({ t: 'stance', id, mode: b.dataset.st });
    } else if (b.dataset.dis) {
      if (sureId === id && sureT > 0) { send({ t: 'dismiss', id }); sureId = 0; } else { sureId = id; sureT = 2.5; }
    }
  });

  function makeRow(e) {
    const el = document.createElement('div'); el.className = 'rc-row';
    const sp = (spec(e.type).spells || []).map((id, i) => { const s = D.SERVANT_SPELLS[id] || {}; return `<span class="rc-sp" data-i="${i}" title="${esc(s.name || id)}: ${esc(s.desc || '')} (auto-cast, ${s.cd || 0} s)"><span>${esc(s.icon || '*')}</span><span class="cd"></span><em></em></span>`; }).join('');
    el.innerHTML = '<div class="rc-p"><span class="ic"></span></div><div><div class="rc-nm"><b></b><small></small></div><div class="rc-bar"><i></i><u></u></div><div class="rc-bt">' + sp +
      `<span class="sp"></span><button class="rc-b" data-st="follow" data-id="${e.id}" title="Follow">F</button><button class="rc-b" data-st="hold" data-id="${e.id}" title="Hold position">H</button><button class="rc-b" data-st="amove" data-id="${e.id}" title="Attack-move ahead">A</button><button class="rc-b x" data-dis="1" data-id="${e.id}" title="Dismiss (click twice)">&times;</button></div></div>`;
    return {
      el, ic: el.querySelector('.ic'), nm: el.querySelector('.rc-nm b'), rl: el.querySelector('.rc-nm small'), bar: el.querySelector('.rc-bar'), hp: el.querySelector('.rc-bar i'), sh: el.querySelector('.rc-bar u'),
      p: el.querySelector('.rc-p'), btn: [...el.querySelectorAll('[data-st]')], x: el.querySelector('[data-dis]'), sps: [...el.querySelectorAll('.rc-sp')], cds: new Map(),
    };
  }
  function paintRow(r, e) {
    const d = spec(e.type), col = roleCol(e.role);
    if (r.nm.textContent !== (d.name || e.type)) { r.nm.textContent = d.name || e.type; r.el.title = d.blurb || ''; }
    const lab = (D.ROLE_INFO[e.role] || {}).label || ''; if (r.rl.textContent !== lab) r.rl.textContent = lab;
    if (r.p.style.getPropertyValue('--rc') !== col) { r.p.style.setProperty('--rc', col); for (const s of r.sps) s.style.setProperty('--rc', col); }
    const ic = d.icon || '?'; if (r.ic.textContent !== ic) r.ic.textContent = ic;
    const pct = Math.max(0, Math.min(1, e.hp / (e.maxHp || 1))), sh = e.shield && e.shield.until > st0().t && e.shield.amt > 0 ? Math.min(1, e.shield.amt / (e.maxHp || 1)) : 0;
    r.hp.style.width = (pct * 100).toFixed(1) + '%'; r.bar.classList.toggle('low', pct < 0.3); r.sh.style.width = (sh * 100).toFixed(1) + '%';
    const prev = lastHp.get(e.id); if (prev !== undefined && pct < prev - 0.04) { r.el.classList.remove('hurt'); void r.el.offsetWidth; r.el.classList.add('hurt'); } lastHp.set(e.id, pct);
    for (const b of r.btn) b.classList.toggle('on', b.dataset.st === e.mode);
    r.x.classList.toggle('sure', sureId === e.id && sureT > 0); r.x.innerHTML = sureId === e.id && sureT > 0 ? 'Sure?' : '&times;';
    const sv = e.sv && e.sv.spells ? e.sv.spells : [];
    r.sps.forEach((el, i) => {
      const s = sv[i], def = s && D.SERVANT_SPELLS[s.id]; if (!def) return;
      const rem = Math.max(0, s.cd), f = Math.min(1, rem / def.cd), was = r.cds.get(i);
      el.querySelector('.cd').style.height = (f * 100).toFixed(0) + '%';
      const t = rem > 0.05 ? String(Math.ceil(rem)) : ''; const em = el.querySelector('em'); if (em.textContent !== t) em.textContent = t;
      el.classList.toggle('rdy', rem <= 0.05);
      if (was !== undefined && rem > was + 0.5) { el.classList.remove('fire'); void el.offsetWidth; el.classList.add('fire'); } // just cast
      r.cds.set(i, rem);
    });
  }

  function paintHire(st, team, list) {
    const h = team.hero, town = h && h.alive ? RC.townAt(st, h.x, h.z, D.FOLLOWER_TUNE.hireRange) : null;
    if (!town) { if (hireEl.style.display !== 'none') hireEl.style.display = 'none'; hireSig = ''; return null; }
    const offers = RC.mercenaryOffers(st, town.id), room = RC.roomFor(st, team);
    const sig = town.id + '|' + offers.map((o) => o.type + o.cost + (team.gold >= o.cost ? 1 : 0)).join(',') + room;
    if (sig !== hireSig) {
      hireSig = sig;
      hireEl.innerHTML = `<div class="t">Hire in ${esc(town.name || 'the city')}</div>` + offers.map((o) => {
        const ok = room && team.gold >= o.cost;
        const sp = o.spells.map((id) => (D.SERVANT_SPELLS[id] || {}).name || id).join(', ');
        return `<div class="rc-o" style="--rc:${roleCol(o.role)}" title="${esc(o.blurb)}"><span class="ic">${esc(o.icon)}</span><span class="nm">${esc(o.label)}<small>${esc(sp)} - ${o.hp} HP</small></span><button class="rc-b" data-hire="${o.type}" data-town="${town.id}" ${ok ? '' : 'disabled'}>${o.cost} gold</button></div>`;
      }).join('');
      hireEl.style.display = '';
    }
    return town;
  }

  function refresh() {
    const st = st0(), team = st.teams[local()];
    if (!team || !team.followers) { root.classList.add('empty'); return; }
    const list = RC.followersOf(st, team.id), seen = new Set();
    for (const e of list) {
      let r = rows.get(e.id);
      if (!r) { r = makeRow(e); rows.set(e.id, r); rowsEl.appendChild(r.el); }
      paintRow(r, e); seen.add(e.id);
    }
    for (const [id, r] of rows) if (!seen.has(id)) { r.el.remove(); rows.delete(id); lastHp.delete(id); }
    const town = paintHire(st, team, list);
    root.classList.toggle('empty', !list.length && !town);
    countEl.textContent = `Servants ${list.length}/${RC.followerCap(team)}`;
    noteEl.textContent = !list.length && !town ? '' : (list.length ? '' : 'Hire servants here, free prisoners from cages.');
  }

  return {
    open: false,
    update(dt) {
      if (sureT > 0) { sureT -= dt; if (sureT <= 0) sureId = 0; }
      acc += dt; if (acc < 0.1) return; acc = 0;
      try { refresh(); } catch (err) { /* the panel must never break the game loop */ }
    },
    handleEvents(events) {
      for (const e of events) if (e.type === 'recruited' || e.type === 'followerDied' || e.type === 'followerDismissed') acc = 1;
    },
    dispose() { root.remove(); },
  };
}
