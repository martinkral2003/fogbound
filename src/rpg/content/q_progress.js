// Quest runtime: start / progress / failure / turn-in / journal / markers. Called by quests.js (the facade) and the dialogue engine.
import { emit } from '../core.js';
import * as Items from '../items.js';
import * as Skills from '../skills.js';
import { QUESTS, QUEST_ORDER } from './quests.js';
import { rec, mkItem, countItems, takeItems, giveItem, npcById, nearest } from './qutil.js';

export const qstate = (st, a, id) => {
  const r = rec(st, a.id);
  if (r.active[id]) return r.active[id].state; // 'active' | 'ready'
  if (r.done[id]) return 'done';
  if (r.failed[id]) return 'failed';
  return 'none';
};

export function isAvailable(st, a, id) {
  const q = QUESTS[id], r = rec(st, a.id);
  if (!q || qstate(st, a, id) !== 'none') return false;
  if (a.lvl < q.level) return false;
  if (q.hidden && !r.flags['met_' + q.giver]) return false;
  if (q.needsRival && !st.actors.some((m) => m.kind === 'rival' && m.alive)) return false;
  return true;
}

const text = (st, qs, ob) => (typeof ob.text === 'function' ? ob.text(st, qs) : ob.text);

// current numeric progress of objective i
export function objProgress(st, a, qs, q, i) {
  const ob = q.objectives[i], r = rec(st, a.id), p = qs.p[i];
  switch (ob.kind) {
    case 'kill': case 'deliver': return Math.min(ob.goal, p || 0);
    case 'fetch': return Math.min(ob.goal, countItems(a, ob.item));
    case 'visit': return Math.min(ob.goal, (p || []).length);
    case 'lore': return Math.min(ob.goal, r.lore.length);
    case 'loot': { const c = (st.quests.sites[ob.site] || {}).cont; return (p || (c && c.opened)) ? 1 : 0; }
    default: return p ? 1 : 0; // boss, target, talk, reach
  }
}
export const objGoal = (ob) => (ob.kind === 'kill' || ob.kind === 'deliver' || ob.kind === 'fetch' || ob.kind === 'visit' || ob.kind === 'lore' ? ob.goal : 1);

export function startQuest(st, a, id) {
  if (!isAvailable(st, a, id)) return false;
  const q = QUESTS[id], r = rec(st, a.id);
  const qs = { state: 'active', p: q.objectives.map(() => 0), data: {}, t0: st.t };
  r.active[id] = qs;
  if (q.needsRival) {
    const rivals = st.actors.filter((m) => m.kind === 'rival' && m.alive);
    const tg = rivals.reduce((b, m) => (!b || m.lvl > b.lvl ? m : b), null);
    if (tg) { qs.data.targetId = tg.id; qs.data.targetName = tg.name; tg.marked = true; }
  }
  emit(st, { type: 'quest', actor: a.id, id, state: 'started' });
  emit(st, { type: 'msg', actor: a.id, text: 'Quest started: ' + q.title });
  evaluate(st, a);
  return true;
}

export function abandon(st, a, id) {
  const r = rec(st, a.id); if (!r.active[id]) return false;
  delete r.active[id]; emit(st, { type: 'quest', actor: a.id, id, state: 'abandoned' }); return true;
}

function fail(st, a, id, why) {
  const r = rec(st, a.id), qs = r.active[id]; if (!qs) return;
  delete r.active[id]; r.failed[id] = true;
  emit(st, { type: 'quest', actor: a.id, id, state: 'failed' });
  emit(st, { type: 'msg', actor: a.id, text: 'Quest failed: ' + QUESTS[id].title + (why ? ' (' + why + ')' : '') });
}

// recompute active/ready for every quest of a; emits once on transition to ready
export function evaluate(st, a) {
  const r = rec(st, a.id);
  for (const id of Object.keys(r.active)) {
    const q = QUESTS[id], qs = r.active[id];
    let all = true;
    for (let i = 0; i < q.objectives.length; i++) if (objProgress(st, a, qs, q, i) < objGoal(q.objectives[i])) { all = false; break; }
    if (all && qs.state !== 'ready') {
      qs.state = 'ready';
      emit(st, { type: 'quest', actor: a.id, id, state: 'ready' });
      emit(st, { type: 'msg', actor: a.id, text: 'Quest objectives complete: ' + q.title + '. Return to ' + (npcById(st, q.turnin || q.giver) || { name: 'the giver' }).name + '.' });
    } else if (!all && qs.state === 'ready') qs.state = 'active';
  }
}

export function onKill(st, killer, victim) {
  const p = st.player; if (!p || !st.quests) return;
  const r = rec(st, p.id);
  for (const id of Object.keys(r.active)) {
    const q = QUESTS[id], qs = r.active[id];
    q.objectives.forEach((ob, i) => {
      if (ob.kind === 'kill' && killer === p && victim.kind === 'monster' && ob.match(victim) && (qs.p[i] || 0) < ob.goal) qs.p[i] = (qs.p[i] || 0) + 1;
      else if (ob.kind === 'boss' && killer === p && victim.kind === 'monster' && (victim.type === 'king' || victim.boss || /drowned ?king/i.test(victim.name || ''))) qs.p[i] = 1;
      else if (ob.kind === 'boss' && killer !== p && victim.kind === 'monster' && (victim.type === 'king' || victim.boss)) qs.p[i] = 1; // somebody else slew the king: the realm is freed anyway
      else if (ob.kind === 'target' && victim.id === qs.data.targetId) {
        if (killer === p) { qs.p[i] = 1; giveItem(p, mkItem(st, 'rivalSignet', { quest: true, name: victim.name + "'s Signet" })); emit(st, { type: 'msg', actor: p.id, text: 'You take ' + victim.name + "'s signet." }); }
        else fail(st, p, id, victim.name + ' fell to another hand');
      }
    });
  }
  evaluate(st, p);
}

// proximity visits and container-opened flags; called a few times per second
export function poll(st, a) {
  const r = rec(st, a.id), sites = st.quests.sites || {};
  // lore stones
  for (const s of sites.lore || []) {
    const c = s.cont;
    if (c && c.opened && Math.hypot(c.x - a.x, c.z - a.z) < 6) {
      c.opened = false; if (a.openC === c.id) a.openC = 0;
      if (!r.lore.includes(c.id)) {
        r.lore.push(c.id);
        emit(st, { type: 'msg', actor: a.id, text: 'Lore stone (' + r.lore.length + '/3): ' + s.text });
        emit(st, { type: 'sfx', name: 'lore', x: c.x, z: c.z });
      } else emit(st, { type: 'msg', actor: a.id, text: s.text });
    }
  }
  const f = st.world.features;
  const spots = [...f.shrines.map((s, i) => ({ k: 's' + i, x: s.x, z: s.z })), ...f.nodes.filter((n) => n.type === 'obelisk').map((s, i) => ({ k: 'o' + i, x: s.x, z: s.z }))];
  for (const sp of spots) {
    if (Math.hypot(sp.x - a.x, sp.z - a.z) > 5) continue;
    if (!r.visited.includes(sp.k)) r.visited.push(sp.k);
    for (const id of Object.keys(r.active)) {
      const q = QUESTS[id], qs = r.active[id];
      q.objectives.forEach((ob, i) => {
        if (ob.kind === 'visit') { const arr = qs.p[i] || (qs.p[i] = []); if (!arr.includes(sp.k)) { arr.push(sp.k); emit(st, { type: 'msg', actor: a.id, text: q.title + ': ' + arr.length + '/' + ob.goal }); } }
      });
    }
  }
  // crypt chest / hammer crate refill so a rival cannot make a quest impossible
  for (const id of Object.keys(r.active)) {
    const q = QUESTS[id], qs = r.active[id];
    q.objectives.forEach((ob, i) => {
      if (ob.kind === 'loot') { const c = (sites[ob.site] || {}).cont; if (c && c.opened) qs.p[i] = 1; }
      if (ob.kind === 'fetch' && ob.item === 'smithsHammer' && countItems(a, ob.item) < 1) {
        const c = (sites.hammer || {}).cont;
        if (c && !c.items.some((it) => it.def === 'smithsHammer') && !st.groundItems.some((g) => g.item && g.item.def === 'smithsHammer')) c.items.push(mkItem(st, 'smithsHammer', { quest: true }));
      }
    });
  }
  evaluate(st, a);
}

// deliver items at an NPC (dialogue effect); returns number of items handed over
export function deliver(st, a, npcKey) {
  const r = rec(st, a.id); let total = 0;
  for (const id of Object.keys(r.active)) {
    const q = QUESTS[id], qs = r.active[id];
    q.objectives.forEach((ob, i) => {
      if (ob.kind !== 'deliver' || ob.to !== npcKey) return;
      const need = ob.goal - (qs.p[i] || 0); if (need <= 0) return;
      const n = takeItems(a, ob.item, need);
      if (n > 0) { qs.p[i] = (qs.p[i] || 0) + n; total += n; }
    });
  }
  if (total) emit(st, { type: 'msg', actor: a.id, text: 'Handed over ' + total + ' item' + (total > 1 ? 's' : '') + '.' });
  evaluate(st, a);
  return total;
}
export function canDeliver(st, a, npcKey) {
  const r = rec(st, a.id);
  for (const id of Object.keys(r.active)) {
    const q = QUESTS[id], qs = r.active[id];
    for (let i = 0; i < q.objectives.length; i++) {
      const ob = q.objectives[i];
      if (ob.kind === 'deliver' && ob.to === npcKey && (qs.p[i] || 0) < ob.goal && countItems(a, ob.item) > 0) return true;
    }
  }
  return false;
}

export function turnIn(st, a, id) {
  const r = rec(st, a.id), qs = r.active[id], q = QUESTS[id];
  if (!qs) return false;
  evaluate(st, a);
  if (qs.state !== 'ready') return false;
  for (const ob of q.objectives) if (ob.kind === 'fetch' && ob.consume) takeItems(a, ob.item, ob.goal);
  delete r.active[id]; r.done[id] = true;
  const rw = q.reward || {};
  if (rw.xp) Skills.grantXp(st, a, rw.xp);
  if (rw.gold) a.gold += rw.gold;
  if (rw.rep) r.rep += rw.rep;
  const items = typeof rw.items === 'function' ? rw.items(st, a) : (rw.items || []).flatMap((s) => {
    if (s.loot) { try { return Items.rollLoot(s.loot, st.rng, s.tier || 1) || []; } catch (e) { return []; } }
    return [mkItem(st, s.def, { qty: s.qty || 1, rarity: s.rarity })];
  });
  for (const it of items) { giveItem(a, it); emit(st, { type: 'pickup', actor: a.id, name: it.name, rarity: it.rarity }); }
  if (rw.free === 'upgrade' && a.equip.weapon && typeof Items.upgradeItem === 'function') { try { Items.upgradeItem(a.equip.weapon); emit(st, { type: 'msg', actor: a.id, text: 'Brannoch reinforces your ' + a.equip.weapon.name + ' for free.' }); } catch (e) { /* ignore */ } }
  emit(st, { type: 'quest', actor: a.id, id, state: 'done' });
  emit(st, { type: 'msg', actor: a.id, text: 'Quest complete: ' + q.title + ' (+' + (rw.xp || 0) + ' XP' + (rw.gold ? ', +' + rw.gold + ' gold' : '') + ')' });
  return true;
}

export function rewardText(q) {
  const rw = q.reward || {}, parts = [];
  if (rw.xp) parts.push(rw.xp + ' XP'); if (rw.gold) parts.push(rw.gold + ' gold');
  if (typeof rw.items === 'function') parts.push('a unique relic'); else if (rw.items && rw.items.length) parts.push('items');
  if (rw.free === 'upgrade') parts.push('a free weapon upgrade');
  return parts.join(', ');
}

export function journal(st, actorId) {
  const a = st.byId.get(actorId); const out = { active: [], done: [], failed: [] };
  if (!a || !st.quests) return out;
  const r = rec(st, actorId);
  for (const id of QUEST_ORDER) {
    const q = QUESTS[id], qs = r.active[id];
    if (qs) {
      out.active.push({
        id, title: q.title, desc: q.desc, state: qs.state, giver: (npcById(st, q.giver) || {}).name, reward: rewardText(q),
        objectives: q.objectives.map((ob, i) => { const pr = objProgress(st, a, qs, q, i), g = objGoal(ob); return { text: text(st, qs, ob), done: pr >= g, progress: pr, goal: g }; }),
      });
    } else if (r.done[id]) out.done.push({ id, title: q.title, desc: q.desc, reward: rewardText(q) });
    else if (r.failed[id]) out.failed.push({ id, title: q.title, desc: q.desc });
  }
  return out;
}

function whereList(st, a, q, qs, ob) {
  const w = ob.where || '', sites = st.quests.sites || {}, r = rec(st, a.id), f = st.world.features;
  if (w.startsWith('site:')) { const s = sites[w.slice(5)]; return s ? [{ x: s.x, z: s.z }] : []; }
  if (w.startsWith('npc:')) { const n = npcById(st, w.slice(4)); return n ? [{ x: n.x, z: n.z }] : []; }
  if (w.startsWith('monster:')) { const m = nearest(st, a.x, a.z, st.actors.filter((x) => x.kind === 'monster' && x.alive && ob.match(x))); return m ? [{ x: m.x, z: m.z }] : []; }
  if (w === 'boss') return [{ x: f.boss.x, z: f.boss.z }];
  if (w === 'target') { const t = st.byId.get(qs.data.targetId); return t && t.alive ? [{ x: t.x, z: t.z }] : []; }
  if (w === 'lore') return (sites.lore || []).filter((s) => !r.lore.includes(s.cont.id)).map((s) => ({ x: s.x, z: s.z }));
  if (w === 'visit') {
    const seen = qs.p[q.objectives.indexOf(ob)] || [];
    return [...f.shrines.map((s, i) => ({ k: 's' + i, x: s.x, z: s.z })), ...f.nodes.filter((n) => n.type === 'obelisk').map((s, i) => ({ k: 'o' + i, x: s.x, z: s.z }))].filter((s) => !seen.includes(s.k));
  }
  return [];
}

export function markers(st, actorId) {
  const a = st.byId.get(actorId), out = [];
  if (!a || !st.quests) return out;
  const r = rec(st, actorId);
  for (const id of QUEST_ORDER) {
    const q = QUESTS[id], qs = r.active[id];
    if (!qs) {
      if (isAvailable(st, a, id)) { const n = npcById(st, q.giver); if (n && n.alive) out.push({ x: n.x, z: n.z, type: 'give', label: q.title, quest: id }); }
      continue;
    }
    if (qs.state === 'ready') { const n = npcById(st, q.turnin || q.giver); if (n) out.push({ x: n.x, z: n.z, type: 'turnin', label: q.title, quest: id }); continue; }
    q.objectives.forEach((ob, i) => {
      if (objProgress(st, a, qs, q, i) >= objGoal(ob)) return;
      if (ob.kind === 'deliver') { const n = npcById(st, ob.to); if (n) out.push({ x: n.x, z: n.z, type: 'objective', label: text(st, qs, ob), quest: id }); return; }
      for (const p of whereList(st, a, q, qs, ob).slice(0, 6)) out.push({ x: p.x, z: p.z, type: 'objective', label: text(st, qs, ob), quest: id });
    });
  }
  return out;
}

// a quest failed because its giver's request cannot be met any more
export function failQuest(st, a, id, why) { fail(st, a, id, why); }
