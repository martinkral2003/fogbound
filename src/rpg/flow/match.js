// FLOW: match state machine, kill feed, placements, stats, shrine effects.
import * as Combat from '../combat.js';
import { emit, recompute } from '../core.js';

export const CALM = 45;
const isHero = (a) => a.kind === 'player' || a.kind === 'rival';

export function initMatch(st) {
  const m = st.match;
  m.state = 'calm'; m.alive = 0; m.total = 0; m.winner = 0; m.kills = []; m.placements = {}; m.calmUntil = CALM; m.stats = {}; m.offerings = m.offerings || []; m.over = false;
}

export function heroes(st) { return st.actors.filter(isHero); }

export function stepMatch(st, dt) {
  const m = st.match;
  if (!m.inited) { m.inited = true; m.total = heroes(st).length; }
  m.alive = 0; for (const a of st.actors) if (a.alive && isHero(a)) m.alive++;
  if (m.state === 'calm' && st.t >= m.calmUntil) { m.state = 'running'; emit(st, { type: 'announce', text: 'The calm is over. Blades are drawn.' }); }
  if (m.state !== 'over' && m.total >= 2 && m.alive <= 1) {
    const w = st.actors.find((a) => a.alive && isHero(a));
    m.state = 'over'; m.over = true; m.winner = w ? w.id : 0;
    if (w) { m.placements[w.id] = 1; m.stats[w.id] = statsOf(st, w, 1); emit(st, { type: 'announce', text: w.name + ' is the last hero standing' }); }
  }
  for (const c of st.containers) if (c.kind === 'shrine') shrine(st, c);
}

function statsOf(st, a, rank) { return { id: a.id, name: a.name, kills: a.kills, lvl: a.lvl, time: Math.round((a.diedAt ?? st.t)), placement: rank, killedBy: a.killedBy || null }; }

function shrine(st, c) {
  if (!c.opened) return;
  c.opened = false;
  const a = st.actors.find((q) => q.alive && q.openC === c.id) || st.actors.find((q) => q.alive && isHero(q) && Math.hypot(q.x - c.x, q.z - c.z) < 4);
  if (a) a.openC = 0;
  if (!a) return;
  if (st.t < (c.readyAt || 0)) { emit(st, { type: 'msg', actor: a.id, text: 'The shrine is silent. (' + Math.ceil(c.readyAt - st.t) + ' s)' }); return; }
  c.readyAt = st.t + 150;
  if (c.effect === 'heal') { a.hp = a.maxHp; a.stamina = a.maxStamina; a.mana = a.maxMana; emit(st, { type: 'msg', actor: a.id, text: 'The shrine mends your wounds.' }); }
  else if (c.effect === 'might') { Combat.addStatus(a, 'might', 90, 1.25); a.stamina = a.maxStamina; emit(st, { type: 'msg', actor: a.id, text: 'Might fills your arms (+25% damage, 90 s).' }); }
  else { Combat.addStatus(a, 'haste', 90, 1.2); a.stamina = a.maxStamina; a.mana = a.maxMana; emit(st, { type: 'msg', actor: a.id, text: 'The hunt quickens your step (90 s).' }); }
  emit(st, { type: 'sfx', name: 'shrine', x: c.x, z: c.z });
}

export function onDeath(st, a, killer) {
  const m = st.match;
  if (!isHero(a)) { if (a.ai && a.ai.camp !== undefined) a.ai.dead = true; return; }
  let alive = 0; for (const q of st.actors) if (q.alive && isHero(q)) alive++;
  const rank = alive + 1;
  const outside = st.zone && Math.hypot(a.x - st.zone.cx, a.z - st.zone.cz) > st.zone.r - 0.5;
  a.killedBy = killer ? (killer.name || killer.type) : outside ? 'the Dread Fog' : 'unknown causes';
  a.deathCause = killer ? (isHero(killer) ? 'hero' : 'monster') : outside ? 'zone' : 'other';
  m.placements[a.id] = rank; m.stats[a.id] = statsOf(st, a, rank);
  const w = killer && killer.equip && killer.equip.weapon ? killer.equip.weapon.name : killer ? killer.type || 'claws' : 'fog';
  m.kills.push({ killer: killer ? killer.id : 0, victim: a.id, t: st.t, weapon: w, killerName: a.killedBy, victimName: a.name, cause: a.deathCause });
  if (m.kills.length > 60) m.kills.splice(0, m.kills.length - 60);
  emit(st, { type: 'announce', text: a.name + ' was slain by ' + a.killedBy + ' (' + alive + ' remain)' });
}
