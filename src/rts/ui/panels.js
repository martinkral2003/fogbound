// FOGBOUND: DOMINION panels: General (F2: level, skills, gear, revive), Technologies (F3: ages + tree), Objectives (F4: temple ritual, Dread Moon, rivals).
import { h, esc, fmtTime, cssColor } from './dom.js';
import { udef, unitName, techList, abilityDef, prettyId, costHtml, costText, ageOf, AGE_NAMES, templeState, safe, roleGlyph } from './adapt.js';
import * as Units from '../units.js';
import { GEN_XP } from '../units_stats.js';
import * as Buildings from '../buildings.js';
import { RES_ICONS } from '../consts.js';

const GEN_SKILLS = () => Units.GEN_SKILLS || {};
const GEAR = () => Units.GEAR || {};

export function createPanels(ui, root) {
  const panels = {};
  const mk = (id, title, cls) => {
    const el = h('div', 'rts-panel panel ui hidden ' + (cls || ''), root); el.id = 'rp_' + id;
    const hd = h('div', 'ph', el); h('b', '', hd, title); const x = h('button', 'btn small', hd, '✕'); x.onclick = () => close(id);
    const body = h('div', 'pb', el); panels[id] = { el, body, open: false, sig: '' }; return panels[id];
  };
  mk('general', 'Generals', 'wide'); mk('tech', 'Technologies', 'wide'); mk('obj', 'Objectives', '');
  const badge = h('button', 'btn gold rts-genbadge hidden', root, '♛ Skill point available (F2)'); badge.onclick = () => toggle('general');
  function toggle(id) { const p = panels[id]; const was = p.open; closeAll(); p.open = !was; p.el.classList.toggle('hidden', !p.open); p.sig = ''; }
  function close(id) { panels[id].open = false; panels[id].el.classList.add('hidden'); }
  function closeAll() { for (const id in panels) close(id); }
  const anyOpen = () => Object.values(panels).some((p) => p.open);
  for (const id in panels) panels[id].body.addEventListener('click', (e) => onClick(id, e));

  function onClick(id, e) {
    const t = e.target.closest('[data-a]'); if (!t) return;
    const ctl = ui.ctl, a = t.dataset.a, st = ui.st;
    if (a === 'skill') ctl.queueCmd({ t: 'general', op: 'skill', gen: +t.dataset.g, skill: t.dataset.s });
    else if (a === 'revive') ctl.queueCmd({ t: 'general', op: 'revive', gen: +t.dataset.g });
    else if (a === 'equip') ctl.queueCmd({ t: 'general', op: 'equip', gen: +t.dataset.g, item: t.dataset.i });
    else if (a === 'unequip') ctl.queueCmd({ t: 'general', op: 'unequip', gen: +t.dataset.g });
    else if (a === 'goto') { const g = st.byId.get(+t.dataset.g); if (g) { ctl.centerOn(g.x, g.z); if (g.alive) ctl.select([g], false); } }
    else if (a === 'tech') {
      const tech = Buildings.TECHS[t.dataset.t], b = st.blds.filter((q) => q.team === ui.team.id && (q.state === 'ready') && tech.at.includes(q.type)).sort((x, y) => x.queue.length - y.queue.length)[0];
      if (!b) ui.toast('Needs a ' + tech.at.join(' / ') + ' first', 'warn'); else ctl.queueCmd({ t: 'research', bld: b.id, tech: t.dataset.t });
    }
    panels[id].sig = ''; ui.cardDirty = true;
  }

  function generalHtml() {
    const st = ui.st, t = ui.team, key = t.faction.key, skills = GEN_SKILLS()[key] || [];
    let html = '';
    for (const gid of t.generals) {
      const g = st.byId.get(gid); if (!g) continue;
      const need = GEN_XP ? GEN_XP[g.lvl] : 100, prev = GEN_XP && g.lvl > 1 ? GEN_XP[g.lvl - 1] : 0;
      const xpf = g.lvl >= 10 ? 1 : Math.max(0, Math.min(1, ((g.xp || 0) - prev) / ((need - prev) || 1)));
      html += `<div class="gen ${g.alive ? '' : 'dead'}"><div class="gh"><span class="por" style="--c:${cssColor(t.faction.color)}"><span>♛</span></span><div><b>${esc(g.name || unitName(g))}</b> <small>Level ${g.lvl}${g.points ? ` · <em>${g.points} point${g.points > 1 ? 's' : ''}</em>` : ''}</small>
        <div class="sbar xp"><i style="width:${xpf * 100}%;background:#b88cff"></i></div><div class="gd">${esc(udef(g.type).desc || '')}</div></div><button class="btn small" data-a="goto" data-g="${g.id}">Locate</button></div>`;
      if (!g.alive) {
        const rc = { gold: 100 + 60 * g.lvl, souls: g.lvl >= 4 ? 2 * g.lvl : 0 };
        html += `<div class="rv">Fallen — returns at the Keep in <b>${g.reviveT != null ? Math.ceil(g.reviveT) : '?'}s</b> <button class="btn small gold" data-a="revive" data-g="${g.id}">Revive now ${costHtml(rc, t)}</button></div>`;
      } else {
        html += '<div class="gsk">' + skills.map(([id, req, max]) => {
          const d = abilityDef(id) || {}, lv = (g.skills && g.skills[id]) | 0, can = g.points > 0 && g.lvl >= req && lv < max;
          return `<div class="skr ${lv ? 'on' : ''} ${g.lvl < req ? 'lock' : ''}"><span class="sn">${esc(d.name || prettyId(id))}</span><span class="pips">${'●'.repeat(lv)}${'○'.repeat(max - lv)}</span><small>${esc(d.desc || '')}${g.lvl < req ? ' (level ' + req + ')' : ''}</small>${can ? `<button class="btn small gold" data-a="skill" data-g="${g.id}" data-s="${id}">+</button>` : ''}</div>`;
        }).join('') + '</div>';
        const gear = g.gear ? `${esc(g.gear.name)} <small>(${esc(g.gear.slot)})</small> <button class="btn small" data-a="unequip" data-g="${g.id}">Remove</button>` : '<small>Nothing equipped. Pick up gear from ruins and monsters.</small>';
        const items = (t.items || []).map((i) => GEAR()[i]).filter(Boolean);
        html += `<div class="gear"><b>Gear:</b> ${gear}${items.length ? '<div class="gi">' + items.map((it) => `<button class="btn small" data-a="equip" data-g="${g.id}" data-i="${it.id}" title="${esc(JSON.stringify(it.mods))}">${esc(it.name)}</button>`).join('') + '</div>' : ''}</div>`;
      }
      html += '</div>';
    }
    return html || '<p>No generals.</p>';
  }
  function techHtml() {
    const st = ui.st, t = ui.team, ag = ageOf(t), list = techList(st, t.id);
    let html = `<div class="ages">${[1, 2, 3].map((a) => `<span class="${a <= ag ? 'on' : ''}">${AGE_NAMES[a]}</span>`).join('<i>›</i>')}</div>`;
    const researching = new Set(); for (const b of st.blds) if (b.team === t.id) for (const q of b.queue || []) if (q.kind === 'tech') researching.add(q.tech);
    const groups = {}; for (const e of list) (groups[e.at && e.at[0] || 'other'] = groups[e.at && e.at[0] || 'other'] || []).push(e);
    for (const g in groups) {
      html += `<h4>${esc(Buildings.def(g, t).name || g)}</h4><div class="tg">` + groups[g].map((e) => {
        const cls = e.done ? 'done' : researching.has(e.id) ? 'prog' : e.available ? 'ok' : 'lock';
        return `<button class="tk ${cls}" data-a="tech" data-t="${e.id}" ${e.available ? '' : 'disabled'} title="${esc((e.desc || '') + (e.reason ? ' — ' + e.reason : ''))}"><b>${esc(e.name)}</b><small>${e.done ? 'Researched' : researching.has(e.id) ? 'Researching…' : e.reason ? esc(e.reason) : esc(e.desc || '')}</small>${e.done ? '' : `<span>${costHtml(e.cost, t)}</span>`}</button>`;
      }).join('') + '</div>';
    }
    return html;
  }
  function objHtml() {
    const st = ui.st, T = templeState(st), e2 = st.events2;
    let html = '<p><b>Win</b>: destroy every rival keep, or hold the Sunken Temple until the ritual completes.</p>';
    if (T) html += `<p><b>Sunken Temple</b>: ${T.open ? `open — ritual ${Math.round(T.t)}/${T.need}s${T.holder >= 0 ? ' held by ' + esc(st.teams[T.holder].faction.name) : ' (no holder)'}${T.contested ? ' <em>contested</em>' : ''}` : T.beam ? 'beam lit — slay the guardian to open it' : 'sealed (beam appears later)'}</p>`;
    if (e2) { const nx = e2.sched && e2.sched.find((q) => q.type === 'dread' && q.at > st.t); html += `<p><b>Dread Moon</b>: ${e2.dread ? 'rising! ' + fmtTime(e2.dreadUntil - st.t) + ' left' : nx ? 'next in ' + fmtTime(nx.at - st.t) : 'none left'}</p>`; }
    html += '<h4>Lords</h4>' + st.teams.map((q) => `<p style="color:${cssColor(q.faction.color)}">${esc(q.faction.name)} — ${esc(q.name)} ${q.alive ? '' : '✝ fallen'}${q.id === ui.team.id ? ' (you)' : ''}</p>`).join('');
    return html;
  }
  let timer = 0;
  return {
    toggle, closeAll, anyOpen, markGeneral() { badge.classList.remove('hidden'); },
    keyHandler(e) {
      const map = { F2: 'general', F3: 'tech', F4: 'obj' }, id = map[e.code];
      if (id) { toggle(id); return true; }
      return false;
    },
    update(dt) {
      timer -= dt; if (timer > 0) return; timer = 0.3;
      const t = ui.team, st = ui.st;
      const pts = t.generals.some((i) => { const g = st.byId.get(i); return g && g.alive && g.points > 0; });
      badge.classList.toggle('hidden', !pts || panels.general.open);
      for (const id in panels) {
        const p = panels[id]; if (!p.open) continue;
        const html = id === 'general' ? generalHtml() : id === 'tech' ? techHtml() : objHtml();
        if (html !== p.sig) { p.sig = html; p.body.innerHTML = html; }
      }
    },
  };
}
