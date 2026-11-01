// v0.5 DOM module "hud_ui" (UI lane): the whole in-game HUD. createUi(ctx) -> { update(dt), handleEvents(events), open }.
//   top centre  : OBJECTIVE banner (always) + edge pointer / marker to its (x,z), boss bar, target frame
//   top left    : clock + the three allied heroes (class icon, level, health)
//   bottom      : HP bar + level, XP bar, gold, potions 1 2 3, abilities Q W E R (level pips, branch, cooldown sweep, R locked until level 5), dodge
//   centre-bot  : level-up cards (3 big cards, shrink to a pulse after 8 s, auto-pick after 20 s)
//   overlays    : death (respawn timer + waystone), gear panel (I), pause settings + end screen (hud_screens.js)
// Contract: src/V5.md "UI lane API". ctx = { game, st, local, ui, renderer }.
import { SKILLS } from './data.js';
import { simApi } from './sim.js';
import * as PL from './plates.js';
import * as perksMod from './perks.js';
import { waystoneById, wsName } from './travel.js';
import { kitView, offerCards, objectiveOf, bearingAngle, allyList, heroDef, fmtT, esc, arr, xpNeedFor, maxLevel, POTION_KINDS, POTION_KEYS, ULT_LEVEL, BRANCH_LETTER, nearestTown } from './hud_state.js';
import { createPanels } from './hud_panels.js';
import { createScreens } from './hud_screens.js';

const POI_NAME = { altar: 'altar', library: 'library', graveyard: 'graveyard', well: 'well', witch: 'witch hut', cage: 'prisoner cage', hoard: 'hoard', bridge: 'bridge', cursed: 'cursed chest', watchtower: 'watchtower', shrine: 'shrine', caravan: 'caravan' };
const STATUS_CH = { stun: '✦', slow: '❄', burn: '♨', poison: '☣', buff: '▲', debuff: '▼', shield: '⛨', inv: '✧' };
const CARD_WAIT_MIN = 8, CARD_WAIT_AUTO = 20; // seconds: shrink to a pulse, then pick the first option for you
const q = (v, n = 1) => Math.round(v * n) / n;
const tryDo = (fn, d) => { try { const v = fn(); return v === undefined ? d : v; } catch (e) { return d; } };

export function createUi(ctx) {
  const { game, st, local } = ctx;
  const ui = ctx.ui || game.ui || {};
  const team = st.teams[local];
  if (!team || !team.hero) return null;
  const renderer = () => ctx.renderer || game.renderer;
  const hud = document.getElementById('hud') || document.body;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('./hud_ui.css', import.meta.url).href; document.head.appendChild(link);
  document.body.classList.add('h5');
  const $ = (id) => document.getElementById(id);
  const def = heroDef(team);
  const push = (c) => { if (game.controls && game.controls.input) game.controls.input.cmds.push(c); };

  // ------------------------------------------------------------------------------------------------ DOM
  const root = document.createElement('div'); root.id = 'h5';
  root.innerHTML = `
  <div id="h5TopC">
    <div id="h5Obj"><div class="arw"><i></i></div><div class="mid"><div class="t"></div><div class="bar hidden"><i></i></div></div><div class="ds"></div></div>
    <div id="h5Boss" class="hidden"><div class="bn"></div><div class="bb"><i></i><span></span></div></div>
    <div id="h5Tgt" class="glass hidden"><div class="lv"></div><div class="tb"><div class="tn"></div><div class="h5-bar"><i class="hp"></i><i class="sh"></i><span></span></div></div><div class="chips"></div></div>
  </div>
  <div id="h5Ptr" class="hidden"><div class="pt"><i></i></div><div class="pd"></div></div>
  <div id="h5Left">
    <div class="h5-pill"><span id="h5Clock">0:00</span><span id="h5Day">☀</span><span id="h5Levy" title="Soldiers of the free peoples (squads on the roads + reserve). Clear camps and save towns to raise it; lost towns and fallen heroes lower it.">⚔ 0</span></div>
    <div id="h5Allies" class="glass ui"></div>
  </div>
  <div id="h5Hint" class="hidden"></div>
  <div id="h5Bar">
    <div id="h5Buffs"></div>
    <div id="h5Stat">
      <div id="h5Lv" title="Hero level">1</div>
      <div id="h5HpW"><div id="h5Hp" title="Health"><i></i><i class="sh"></i><span></span></div><div id="h5Xp" title="Experience"><i></i><span></span></div></div>
      <div id="h5Gold" title="Gold: spend it on potions and hired servants in a town"><span class="coin"></span><b>0</b></div>
    </div>
    <div id="h5Row" class="ui"></div>
  </div>
  <div id="h5Cards" class="hidden"></div>
  <div id="h5Death" class="hidden"></div>`;
  hud.appendChild(root);
  const E = {
    obj: $('h5Obj'), objT: root.querySelector('#h5Obj .t'), objBar: root.querySelector('#h5Obj .bar'), objFill: root.querySelector('#h5Obj .bar i'), objArw: root.querySelector('#h5Obj .arw'), objArwI: root.querySelector('#h5Obj .arw i'), objDs: root.querySelector('#h5Obj .ds'),
    ptr: $('h5Ptr'), boss: $('h5Boss'), tgt: $('h5Tgt'), allies: $('h5Allies'), clock: $('h5Clock'), day: $('h5Day'), hint: $('h5Hint'), buffs: $('h5Buffs'),
    lv: $('h5Lv'), hp: $('h5Hp'), xp: $('h5Xp'), gold: $('h5Gold'), row: $('h5Row'), cards: $('h5Cards'), death: $('h5Death'),
  };

  // ------------------------------------------------------------------------------------------------ bottom row: potions | abilities | dodge
  const potHtml = POTION_KINDS.map((p, i) => `<div class="h5-slot sm pot" data-pot="${p.k}" title="${esc(p.name + ': ' + p.desc)} (key ${POTION_KEYS[i].slice(3)})"><span class="k">${POTION_KEYS[i].slice(3)}</span><span class="ic" style="color:${p.css}">${p.icon}</span><span class="cnt">0</span><div class="cd"></div></div>`).join('');
  let rowSig = '';
  const cache = { slot: [], goldShown: team.gold, gold: -1, maxCd: {}, potSig: '', dodgeKey: '', dodgeWas: 0 };
  function slotHtml(s) {
    if (s.locked) return `<div class="h5-slot lock" id="skA${s.i}" title="The ultimate unlocks at level ${ULT_LEVEL}"><span class="k">${s.key}</span><span class="ic">✦</span><span class="lk">Lv${ULT_LEVEL}</span></div>`;
    if (!s.skill) return `<div class="h5-slot empty${s.i === 3 ? ' ult' : ''}" id="skA${s.i}" title="${s.i === 3 ? 'Ultimate: pick one on a level-up' : 'Empty: pick a skill on your next level-up'}"><span class="k">${s.key}</span><span class="ic">·</span><span class="nm">${s.i === 3 ? 'ultimate' : 'empty'}</span></div>`;
    const k = s.skill, pips = [1, 2, 3, 4, 5].map((n) => `<i${s.lv >= n ? ' class="on"' : ''}></i>`).join('');
    const br = s.branch >= 0 ? `<span class="br" title="Upgrade path ${BRANCH_LETTER[s.branch] || ''}">${BRANCH_LETTER[s.branch] || ''}</span>` : '';
    return `<div class="h5-slot ab${s.i === 3 ? ' ult' : ''}" id="skA${s.i}" title="${esc(k.name + ': ' + (k.desc || '') + ' (cooldown ' + k.cd + ' s)')}"><span class="k">${s.key}</span><span class="pips">${pips}</span><span class="ic">${esc(k.icon || '✦')}</span>${br}<span class="nm">${esc(k.name)}</span><div class="cd"></div></div>`;
  }
  function renderRow(kv) {
    const sig = kv.slots.map((s) => s.id + ':' + s.lv + ':' + s.branch + ':' + s.locked).join('|');
    if (sig === rowSig) return;
    rowSig = sig;
    E.row.innerHTML = potHtml + '<div class="h5-sep"></div>' + kv.slots.map(slotHtml).join('') + '<div class="h5-sep"></div>'
      + `<div class="h5-slot sm dodge ready" id="h5Dodge" title="Dodge roll: a short invulnerable roll (Space)"><span class="k">Spc</span><span class="ic">↻</span><div class="cd"></div></div>`;
    E.row.querySelectorAll('.pot').forEach((el) => { el.onclick = () => push({ t: 'gear', op: 'potion', k: el.dataset.pot }); });
    $('h5Dodge').onclick = () => doDodge();
    cache.slot.length = 0; cache.potSig = ''; cache.dodgeKey = '';
  }

  // ------------------------------------------------------------------------------------------------ panels + screens
  const panels = createPanels({ game, st, local, team, ui, push, def });
  const screens = createScreens({ game, st, local, team, ui, push, def });

  // ------------------------------------------------------------------------------------------------ allies strip
  let allySig = '';
  E.allies.addEventListener('click', (e) => { // order buttons (keys C V B N do the same)
    const b = e.target.closest && e.target.closest('button[data-o]'); if (!b) return;
    const k = b.dataset.o, h = team.hero, c = game.controls;
    push({ t: 'order', kind: k, x: k === 'attack' && c && c.aim ? c.aim.x : h.x, z: k === 'attack' && c && c.aim ? c.aim.z : h.z });
    game.ui.toast({ attack: 'Allies: attack the cursor position', gather: 'Allies: gather on me', follow: 'Allies: follow me', free: 'Allies: act on your own' }[k], 'info');
  });
  function renderAllies() {
    const L = allyList(st, local);
    const sig = L.map((a) => a.id + ':' + a.lvl + ':' + a.dead).join(',');
    if (sig !== allySig) {
      allySig = sig; E.allies.classList.toggle('hidden', !L.length);
      E.allies.innerHTML = '<div class="hd">Allies</div><div class="h5-orders"><button data-o="attack" title="Attack where the cursor is (C)">⚔</button><button data-o="gather" title="Gather on me (V)">⚑</button><button data-o="follow" title="Follow me (B)">➜</button><button data-o="free" title="Act on your own (N)">✋</button></div>' + L.map((a) => `<div class="h5-ally" id="h5A${a.id}" style="--ac:${a.css}"><div class="ci">${a.glyph}<em>${a.lvl}</em></div><div><div class="nm"><span>${esc(a.name)}</span><small></small></div><div class="h5-bar good"><i></i></div></div></div>`).join('');
    }
    for (const a of L) {
      const el = $('h5A' + a.id); if (!el) continue;
      const p = a.dead ? 0 : Math.max(0, Math.min(1, a.hp / a.maxHp));
      el.querySelector('.h5-bar i').style.width = p * 100 + '%';
      el.classList.toggle('low', p > 0 && p < 0.3); el.classList.toggle('dead', a.dead);
      const sm = el.querySelector('small'), t = a.dead ? (a.respT > 0 ? Math.ceil(a.respT) + 's' : 'down') : '';
      if (sm.textContent !== t) sm.textContent = t;
    }
  }

  // ------------------------------------------------------------------------------------------------ target frame, boss bar, buffs
  const stBuf = [];
  const hostileTo = (e) => e && e.alive && !e.dead && e.team < 0 && (e.kind === 'mon' || e.kind === 'unit');
  const ent = { name: (e) => tryDo(() => PL.entTitle(e), e.name || e.type || 'Demon'), lvl: (e) => tryDo(() => PL.entLevel(e), e.lvl || 1), elite: (e) => tryDo(() => PL.eliteLevel(e), e.boss ? 2 : 0) };
  const chips = (e, max) => { const s = tryDo(() => PL.statusOf(e, st.t, stBuf), []); return arr(s).slice(0, max).map((x) => `<span class="h5-ic ${x.k}" title="${esc((PL.STATUS && PL.STATUS[x.k] && PL.STATUS[x.k].name) || x.k)}">${STATUS_CH[x.k] || '•'}</span>`).join(''); };
  let tgtSig = '';
  function updateTarget() {
    const r = renderer(), e = r && r.focusTarget;
    if (!hostileTo(e) || (E.boss && !E.boss.classList.contains('hidden') && st.byId.get(bossId) === e)) { E.tgt.classList.add('hidden'); tgtSig = ''; return; }
    E.tgt.classList.remove('hidden');
    const el = ent.elite(e), sig = e.id + ':' + el + ':' + ent.lvl(e);
    if (sig !== tgtSig) {
      tgtSig = sig; E.tgt.className = 'glass ' + (el > 1 ? 'boss' : el === 1 ? 'champ' : '');
      E.tgt.style.setProperty('--tc', el > 1 ? '#f3d98a' : el === 1 ? '#8fb8ff' : '#e8a090');
      E.tgt.querySelector('.lv').textContent = ent.lvl(e); E.tgt.querySelector('.tn').textContent = ent.name(e);
    }
    E.tgt.querySelector('i.hp').style.width = Math.max(0, Math.min(1, e.hp / e.maxHp)) * 100 + '%';
    E.tgt.querySelector('i.sh').style.width = Math.min(1, tryDo(() => PL.shieldOf(e, st.t), 0) / e.maxHp) * 100 + '%';
    E.tgt.querySelector('.h5-bar span').textContent = `${Math.ceil(Math.max(0, e.hp))}`;
    E.tgt.querySelector('.chips').innerHTML = chips(e, 4);
  }
  let bossT = 0, bossId = 0;
  function updateBoss(dt) {
    bossT -= dt;
    if (bossT <= 0) {
      bossT = 0.25; bossId = 0;
      const h = team.hero, r = renderer(), lordId = st.horde && st.horde.lord && st.horde.lord.id;
      let best = 1e9;
      for (const e of st.ents) {
        if (!e.alive || e.dead || e.team >= 0 || !(e.boss || e.id === lordId)) continue;
        const d = Math.hypot(e.x - h.x, e.z - h.z);
        if (d < 90 && d < best && (!r || r.visibleNow(e.x, e.z))) { best = d; bossId = e.id; }
      }
    }
    const e = bossId ? st.byId.get(bossId) : null;
    if (!e || !e.alive || e.dead) { E.boss.classList.add('hidden'); return; }
    E.boss.classList.remove('hidden');
    const nm = E.boss.querySelector('.bn'), t = ent.name(e); if (nm.textContent !== t) nm.textContent = t;
    E.boss.querySelector('i').style.width = Math.max(0, e.hp / e.maxHp) * 100 + '%';
    E.boss.querySelector('span').textContent = `${Math.ceil(Math.max(0, e.hp))} / ${Math.ceil(e.maxHp)}`;
  }
  let buffSig = '';
  function renderBuffs() { // at most 4 icons: stun / slow / burn / poison / buff / shield / untouchable
    const hero = team.hero, list = hero.alive ? tryDo(() => PL.statusOf(hero, st.t, stBuf), []).map((s) => ({ k: s.k, rem: s.rem })) : [];
    const sh = hero.alive ? tryDo(() => PL.shieldOf(hero, st.t), 0) : 0;
    if (sh > 0) list.unshift({ k: 'shield', rem: Math.max(0, hero.shield.until - st.t) });
    if (hero.alive && hero.inv > st.t + 0.05 && !hero.roll) list.push({ k: 'inv', rem: hero.inv - st.t });
    const top = list.slice(0, 4), sig = top.map((s) => s.k + Math.ceil(s.rem)).join(',');
    if (sig === buffSig) return;
    buffSig = sig;
    const nm = { shield: 'Shield', inv: 'Untouchable' };
    E.buffs.innerHTML = top.map((s) => `<span class="h5-ic ${s.k === 'inv' ? 'buff' : s.k}" title="${esc(nm[s.k] || (PL.STATUS && PL.STATUS[s.k] && PL.STATUS[s.k].name) || s.k)}">${STATUS_CH[s.k] || '•'}${s.rem > 0 && s.rem < 60 ? `<em>${Math.ceil(s.rem)}</em>` : ''}</span>`).join('');
  }

  // ------------------------------------------------------------------------------------------------ objective banner + pointer
  let objSig = '', pulseT = 0, objInfo = null;
  function updateObjective() {
    const hero = team.hero, o = objectiveOf(st, hero);
    objInfo = o;
    const sig = String(o.id) + '|' + o.text;
    if (sig !== objSig) {
      const first = !objSig; objSig = sig;
      for (const k of ['defend', 'lord', 'gate', 'event', 'waiting']) E.obj.classList.toggle(k, k === o.kind);
      if (!first) { E.obj.classList.remove('pulse'); void E.obj.offsetWidth; E.obj.classList.add('pulse'); }
    }
    const t = esc(o.text) + (o.need > 0 ? `<b>${o.n}/${o.need}</b>` : '');
    if (E.objT._h !== t) { E.objT._h = t; E.objT.innerHTML = t; }
    E.objBar.classList.toggle('hidden', !(o.need > 0)); if (o.need > 0) E.objFill.style.width = Math.min(100, (o.n / o.need) * 100) + '%';
    const here = o.has && o.dist >= 0 && o.dist < 10;
    E.objArw.classList.toggle('here', here); E.objArw.style.visibility = o.has ? 'visible' : 'hidden';
    E.objDs.textContent = o.has && !here && o.dist >= 0 ? Math.round(o.dist) + ' m' : '';
    if (o.has && game.controls) E.objArwI.style.transform = `rotate(${q(bearingAngle(hero.x, hero.z, o.x, o.z, game.controls.yaw), 100)}rad)`;
  }
  function updatePointer() { // marker over the objective when on screen, an arrow on the screen edge when not
    const o = objInfo, r = renderer();
    if (!o || !o.has || !r || !r.worldToScreen || o.dist < 14 || !team.hero.alive) { E.ptr.classList.add('hidden'); return; }
    const p = r.worldToScreen(o.x, o.z, 5), W = window.innerWidth, H = window.innerHeight;
    const mx0 = 40, mx1 = W - 40, my0 = 110, my1 = H - 190;
    const inside = !p.behind && p.x > mx0 && p.x < mx1 && p.y > my0 && p.y < my1;
    E.ptr.classList.remove('hidden'); E.ptr.classList.toggle('on', inside); E.ptr.classList.toggle('edge', !inside);
    let x = p.x, y = p.y, rot = 0;
    if (!inside) {
      const cx = W / 2, cy = (my0 + my1) / 2; let dx = p.x - cx, dy = p.y - cy; if (!dx && !dy) dy = -1;
      const k = Math.min((mx1 - cx) / Math.abs(dx || 1e-6), (my1 - cy) / Math.abs(dy || 1e-6), (cx - mx0) / Math.abs(dx || 1e-6), (cy - my0) / Math.abs(dy || 1e-6));
      x = cx + dx * k; y = cy + dy * k; rot = Math.atan2(dx, -dy);
    }
    E.ptr.style.transform = `translate(${q(x)}px, ${q(y)}px)`;
    E.ptr.querySelector('.pt').style.transform = inside ? '' : `rotate(${q(rot, 100)}rad)`;
    const pd = E.ptr.querySelector('.pd'), txt = Math.round(o.dist) + ' m'; if (pd.textContent !== txt) pd.textContent = txt;
  }

  // ------------------------------------------------------------------------------------------------ level-up cards (fallback renderer + shrink / auto-pick timers)
  const C = { sig: '', wait: 0, collapsed: false };
  function cardHtml(c) {
    return `<div class="pcard${c.kind === 'skill' ? ' skl' : ''}" data-i="${c.idx}"><kbd>${7 + c.idx}</kbd><span class="pic">${esc(c.icon)}</span><b>${esc(c.name)}</b><small>${esc(c.tag)}</small><p>${esc(c.text)}</p></div>`;
  }
  function updateCards(dt) {
    const { cards, pending } = offerCards(team, perksMod);
    const sig = cards.map((c) => c.name + c.tag).join('|') + '#' + pending;
    if (sig !== C.sig) { C.sig = sig; C.wait = 0; C.collapsed = false; C.html = ''; }
    const ext = $('perkPick'), extShown = !!(ext && !ext.classList.contains('hidden') && ext.querySelector('.pcard'));
    if (!cards.length) { E.cards.classList.add('hidden'); return; }
    if (!game.paused && team.hero.alive) C.wait += dt;
    if (!C.collapsed && C.wait > CARD_WAIT_MIN) C.collapsed = true;
    if (C.wait > CARD_WAIT_AUTO) { push({ t: 'pickperk', idx: 0 }); C.wait = 0; C.collapsed = false; return; }
    if (extShown) { E.cards.classList.add('hidden'); ext.classList.toggle('min', C.collapsed); return; }
    E.cards.classList.remove('hidden'); E.cards.classList.toggle('min', C.collapsed);
    const html = `<div class="hd"><b>Level up! Pick one</b><span>${pending > 1 ? pending + ' picks waiting · ' : ''}click or press 7 8 9</span><span class="mn">${C.collapsed ? '▴' : '▾'}</span></div><div class="cards">${cards.map(cardHtml).join('')}</div>`;
    if (C.html !== html + C.collapsed) {
      C.html = html + C.collapsed; E.cards.innerHTML = html;
      E.cards.querySelectorAll('.pcard').forEach((el) => { el.onclick = () => push({ t: 'pickperk', idx: +el.dataset.i }); });
    }
  }
  const expandCards = () => { if (C.collapsed) { C.collapsed = false; C.wait = CARD_WAIT_MIN - 4; C.html = ''; } };
  E.cards.addEventListener('click', (e) => { if (e.target.closest('.hd') && C.collapsed) expandCards(); });
  document.addEventListener('click', (e) => { const ext = $('perkPick'); if (ext && ext.classList.contains('min') && e.target.closest('#perkPick .hd')) { expandCards(); ext.classList.remove('min'); } }, true);
  const pickCard = (i) => { const { cards } = offerCards(team, perksMod); if (cards[i]) push({ t: 'pickperk', idx: i }); };

  // ------------------------------------------------------------------------------------------------ death overlay
  let deathSig = '', deathMax = 0;
  function respawnName() {
    const w = team.lastWs ? tryDo(() => waystoneById(st, team.lastWs), null) : null;
    if (w) return tryDo(() => wsName(st, w), '') || 'your waystone';
    const p = tryDo(() => simApi.respawnPoint(st, team), null), t = p && nearestTown(st, p.x, p.z, 90);
    return t ? t.name : 'the start village';
  }
  function updateDeath() {
    const hero = team.hero, dead = (hero.dead || !hero.alive) && team.alive !== false;
    if (!dead) { if (!E.death.classList.contains('hidden')) { E.death.classList.add('hidden'); deathSig = ''; deathMax = 0; } return; }
    E.death.classList.remove('hidden');
    deathMax = Math.max(deathMax, team.respT || 0);
    const left = Math.max(0, Math.ceil(team.respT || 0)), sig = String(left);
    if (sig === deathSig) return;
    deathSig = sig;
    E.death.innerHTML = `<div class="big">You have fallen</div><div class="ring" style="--r:${deathMax > 0 ? (1 - (team.respT || 0) / deathMax) * 100 : 0}"><div class="tm">${left}</div></div><div class="wh">Respawning at <b>${esc(respawnName())}</b></div>`;
  }

  // ------------------------------------------------------------------------------------------------ per-frame pieces
  function updateSlots(kv) {
    const hero = team.hero;
    for (const s of kv.slots) {
      const el = $('skA' + s.i); if (!el || !s.id) continue;
      const c = team.cd[s.id] || 0, mx = cache.maxCd[s.id] = Math.max(cache.maxCd[s.id] || 0, c, 0.5, (s.skill && s.skill.cd) || 0);
      const pct = c > 0 ? Math.min(100, (c / mx) * 100) : 0, key = Math.ceil(c * 2) + ':' + Math.round(pct), prev = cache.slot[s.i] || { c: 0 };
      if (key !== prev.key) {
        const cd = el.querySelector('.cd');
        if (cd) { cd.style.display = c > 0 ? 'flex' : 'none'; if (c > 0) { cd.style.setProperty('--cd', pct); cd.innerHTML = `<b>${c >= 10 ? Math.ceil(c) : c.toFixed(1)}</b>`; } }
        if (prev.c > 0 && c <= 0) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
        el.classList.toggle('ready', c <= 0);
        cache.slot[s.i] = { key, c };
      }
    }
    const pots = team.pots || {}, pc = team.potCd || 0, ps = POTION_KINDS.map((p) => pots[p.k] | 0).join(',') + ',' + Math.ceil(pc * 2);
    if (ps !== cache.potSig) {
      cache.potSig = ps;
      E.row.querySelectorAll('.pot').forEach((el) => {
        const n = pots[el.dataset.pot] | 0, cd = el.querySelector('.cd');
        el.querySelector('.cnt').textContent = n; el.classList.toggle('none', n <= 0);
        cd.style.display = pc > 0 && n > 0 ? 'flex' : 'none'; cd.style.setProperty('--cd', Math.min(100, (pc / 14) * 100)); cd.innerHTML = pc > 0 ? `<b>${Math.ceil(pc)}</b>` : '';
      });
    }
    const dd = $('h5Dodge');
    if (dd) {
      const c = team.dodgeCd || 0, mx = team.dodgeMax || 5.5, key = Math.ceil(c * 4);
      if (key !== cache.dodgeKey) {
        cache.dodgeKey = key; const cd = dd.querySelector('.cd');
        cd.style.display = c > 0 ? 'flex' : 'none'; cd.style.setProperty('--cd', Math.min(100, (c / mx) * 100)); cd.innerHTML = c > 0 ? `<b>${c.toFixed(1)}</b>` : '';
        if (c <= 0 && cache.dodgeWas > 0) { dd.classList.remove('flash'); void dd.offsetWidth; dd.classList.add('flash'); }
        dd.classList.toggle('ready', c <= 0); cache.dodgeWas = c;
      }
    }
    // highlight the slot being aimed
    const aim = game.controls && game.controls.aimState;
    for (const s of kv.slots) { const el = $('skA' + s.i); if (el) el.classList.toggle('aiming', !!aim && aim.slot === s.i); }
  }
  let tText = 0, prevLvl = team.hero.lvl;
  function updateText(dt) {
    const hero = team.hero;
    const g = team.gold; cache.goldShown += (g - cache.goldShown) * Math.min(1, dt * 10);
    if (Math.abs(g - cache.goldShown) < 0.6) cache.goldShown = g;
    const gs = Math.floor(cache.goldShown); if (gs !== cache.gold) { cache.gold = gs; E.gold.querySelector('b').textContent = gs; }
    tText -= dt;
    if (tText > 0) return;
    tText = 0.1;
    E.clock.textContent = fmtT(st.t);
    { const lv = st.levy, el = document.getElementById('h5Levy'); if (el && lv) { let n = 0; for (const q of lv.squads) n += q.ids.length; const tx = '⚔ ' + (n + Math.round(lv.reserve)) + ' (' + lv.squads.length + ' squads)'; if (el.textContent !== tx) el.textContent = tx; } }
    E.day.textContent = st.dread && st.t < st.dread.until ? '☾' : '';
    const hpp = hero.dead ? 0 : Math.max(0, Math.min(1, hero.hp / hero.maxHp)), shp = hero.dead ? 0 : Math.min(1, tryDo(() => PL.shieldOf(hero, st.t), 0) / hero.maxHp);
    E.hp.querySelector('i').style.width = q(hpp * 100, 10) + '%'; E.hp.querySelector('i.sh').style.width = q(shp * 100, 10) + '%';
    E.hp.classList.toggle('low', hpp > 0 && hpp < 0.25);
    E.hp.querySelector('span').textContent = hero.dead ? 'DEAD' : `${Math.ceil(hero.hp)} / ${Math.ceil(hero.maxHp)}`;
    E.lv.textContent = hero.lvl;
    const max = hero.lvl >= maxLevel(), need = xpNeedFor(perksMod.heroXpNeed || (simApi && simApi.xpNeed), hero.lvl);
    E.xp.querySelector('i').style.width = (max ? 100 : Math.min(100, (hero.xp / need) * 100)) + '%';
    const xt = max ? `LEVEL ${hero.lvl} · MAX` : `LEVEL ${hero.lvl}  ·  ${Math.floor(hero.xp)} / ${need} XP`, xs = E.xp.querySelector('span'); if (xs.textContent !== xt) xs.textContent = xt;
    if (hero.lvl !== prevLvl) { if (hero.lvl > prevLvl) levelFx(hero.lvl); prevLvl = hero.lvl; }
    renderBuffs(); renderAllies();
    // one contextual hint line above the bar
    let hint = '';
    const near = team.townNear && !team.poiNear;
    if (team.tele) hint = `Teleporting... <span class="pg"><i style="width:${Math.round((1 - team.tele.left / team.tele.total) * 100)}%"></i></span> &nbsp;stand still (<kbd>T</kbd> cancels)`;
    else if (team.poiNear && hero.alive) { const p = arr(st.pois).find((x) => x.id === team.poiNear); hint = `<kbd>F</kbd> Use ${esc(p ? POI_NAME[p.type] || p.type : 'this')}`; }
    else if (near && hero.alive) hint = `<kbd>F</kbd> Shop &amp; hire${(st.towns || []).find((t) => t.id === team.townNear.town && t.state === 'besieged') ? ' (town under attack!)' : ''}`;
    else if (hero.alive && st.t < 60 && !(team.kit && arr(team.kit.offers).length)) hint = '<kbd>WASD</kbd> move · <kbd>Left-click</kbd> attack · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> abilities · <kbd>Q</kbd> <kbd>E</kbd> <kbd>R</kbd> potions · <kbd>Space</kbd> dodge · <kbd>F1</kbd> help';
    if (hint !== cache.hint) { cache.hint = hint; E.hint.classList.toggle('hidden', !hint); E.hint.innerHTML = hint; }
  }
  function levelFx(lvl) {
    const d = document.createElement('div'); d.id = 'h5Lvl'; d.textContent = 'Level ' + lvl; root.appendChild(d); setTimeout(() => d.remove(), 2300);
    E.xp.classList.remove('flash'); void E.xp.offsetWidth; E.xp.classList.add('flash');
  }

  // ------------------------------------------------------------------------------------------------ keys (capture phase; controls.js owns movement, abilities, H, F)
  const held = new Set();
  const eat = (e) => { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); };
  const otherBusy = () => !!(ui.v3 && ui.v3.open);
  function dodgeDir() {
    const c = game.controls, yaw = c.yaw, dx = Math.cos(yaw), dz = Math.sin(yaw), rx = -dz, rz = dx;
    let mx = 0, mz = 0;
    if (held.has('KeyW') || held.has('ArrowUp')) { mx += dx; mz += dz; } if (held.has('KeyS') || held.has('ArrowDown')) { mx -= dx; mz -= dz; }
    if (held.has('KeyD') || held.has('ArrowRight')) { mx += rx; mz += rz; } if (held.has('KeyA') || held.has('ArrowLeft')) { mx -= rx; mz -= rz; }
    if (!mx && !mz && c.moveDir) { mx = c.moveDir.x; mz = c.moveDir.z; } // walking by mouse: roll the way you walk
    if (!mx && !mz && c.aim) { const h = team.hero; mx = c.aim.x - h.x; mz = c.aim.z - h.z; } // standing still: roll toward the cursor
    return { dx: mx, dz: mz };
  }
  function doDodge() { if (!team.hero.alive) return; const d = dodgeDir(); push({ t: 'dodge', dx: d.dx, dz: d.dz }); }
  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (!e.repeat) held.add(e.code);
    if (game.paused || st.over) return;
    const k = e.code, busy = otherBusy();
    if (e.ctrlKey || e.metaKey || e.altKey) { if ((k === 'ControlLeft' || k === 'ControlRight') && !e.repeat && !busy) doDodge(); return; }
    switch (k) {
      case 'KeyI': eat(e); if (!e.repeat) panels.toggle(); break;
      case 'Escape': if (panels.open) { eat(e); panels.close(); } break;
      case 'KeyQ': case 'KeyE': case 'KeyR': if (!e.repeat && !busy) { eat(e); push({ t: 'gear', op: 'potion', k: POTION_KINDS[POTION_KEYS.indexOf(k)].k }); } break; // heal / haste / shield
      case 'Digit7': case 'Digit8': case 'Digit9': if (!e.repeat) pickCard(+k.slice(5) - 7); break;
      case 'Space': if (team.hero.alive) { eat(e); if (!e.repeat && !busy) doDodge(); } break;
    }
  }, true);
  window.addEventListener('keyup', (e) => { held.delete(e.code); });
  window.addEventListener('blur', () => held.clear());

  // ------------------------------------------------------------------------------------------------ events
  function handleEvents(events) {
    for (const e of events) {
      if (e.type === 'gold' && e.team === local && e.amt > 0) { E.gold.classList.remove('bump'); void E.gold.offsetWidth; E.gold.classList.add('bump'); }
    }
    panels.handleEvents && panels.handleEvents(events);
    screens.handleEvents && screens.handleEvents(events);
  }

  // ------------------------------------------------------------------------------------------------ frame
  function update(dt) {
    const kv = kitView(team, team.hero.lvl);
    renderRow(kv); updateSlots(kv); updateText(dt);
    updateObjective(); updatePointer(); updateTarget(); updateBoss(dt); updateCards(dt); updateDeath();
    panels.update(dt); screens.update(dt);
  }
  ui.hud = { panels, screens, push, lockPos: () => null };
  return { update, handleEvents, get open() { return false; }, panels, screens, E, push, kitView: () => kitView(team, team.hero.lvl) };
}
