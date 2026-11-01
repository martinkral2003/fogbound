// Shared dialogue helpers. Node format (see dialogue.js header):
//   node = { lines:[string|fn(c)], choices:[choice]|fn(c)->[choice], enter?:effect, trade?:true, trainer?:true }
//   choice = { text|fn(c), next:'nodeId'|'end'|'stay' (default 'hub'), cond?:cond (hidden if false), req?:cond + reason (shown disabled), effect? }
import { QUESTS, QUEST_ORDER } from './quests.js';
import { isAvailable, canDeliver } from './q_progress.js';

export const bye = (text = 'Farewell.') => ({ text, next: 'end' });

// choices for every quest this NPC gives or receives
export function questChoices(c, key) {
  const out = [];
  if (canDeliver(c.st, c.a, key)) out.push({ text: 'I have supplies for you.', effect: { deliver: true }, next: 'delivered' });
  for (const id of QUEST_ORDER) {
    const q = QUESTS[id], s = c.q(id);
    if (q.giver === key && isAvailable(c.st, c.a, id)) out.push({ text: '[Quest] ' + q.title, next: 'q_offer_' + id });
    else if ((q.turnin || q.giver) === key && s === 'ready') out.push({ text: '[Report] ' + q.title, effect: { turnin: id }, next: 'q_done_' + id });
    else if (q.giver === key && s === 'active') out.push({ text: '[Quest] ' + q.title + ' (in progress)', next: 'q_active_' + id });
  }
  return out;
}

// quest conversation nodes from {id:{offer:[..], accept:'..', active:[..], done:[..]}}
export function questNodes(qtext) {
  const n = {};
  for (const id of Object.keys(qtext)) {
    const t = qtext[id], title = QUESTS[id].title;
    n['q_offer_' + id] = { lines: t.offer, choices: [{ text: t.yes || 'I will see it done.', effect: { start: id }, next: 'q_accept_' + id }, { text: t.no || 'Not now.', next: 'hub' }] };
    n['q_accept_' + id] = { lines: Array.isArray(t.accept) ? t.accept : [t.accept], choices: [{ text: 'Understood.', next: 'hub' }, bye()] };
    n['q_active_' + id] = { lines: t.active, choices: [{ text: 'I am still on it.', next: 'hub' }, { text: 'I give up on this task.', effect: { abandon: id }, next: 'hub' }] };
    n['q_done_' + id] = { lines: Array.isArray(t.done) ? t.done : [t.done], choices: [{ text: 'Until next time.', next: 'hub' }, bye()] };
    n['_title_' + id] = { lines: [title] };
  }
  return n;
}

// rumours that change as the match progresses: zone stage, heroes alive, time
export function rumour(c) {
  const st = c.st, z = st.zone || {}, stage = z.stage || 0, alive = st.match ? st.match.alive : 0, tot = st.match ? st.match.total : 0;
  const pool = [];
  if (!stage || z.state === 'waiting') pool.push('The fog sits still for now, like a dog waiting to be told to bite. It will not stay still long.', 'They say the fog closes in a ring around the old temple. Stand outside it and it eats you slowly. Slowly is a courtesy.');
  if (stage >= 1) pool.push('The fog has begun to close. Anyone outside the ring is already dying, they just have not noticed.', 'Stage ' + stage + ' of the fog, and the circle smaller than anyone dared guess. Stay inside it, hero.');
  if (stage >= 3) pool.push('Look at the horizon: red where there should be grey. The fog is almost on the walls of Harrowmere.', 'Nobody sells anything outside the circle anymore. Nobody sells anything, full stop.');
  if (alive > 0 && tot > 0) {
    if (alive <= 3) pool.push('Only ' + alive + ' of you left out there, by the count on the Captain\'s wall. Pray you are not the fewer.');
    else if (alive <= 6) pool.push(alive + ' heroes still breathing, by the Captain\'s tally. Half the island is already a graveyard.');
    else pool.push(alive + ' heroes alive, give or take. Ten went in. Not many of you come out.');
  }
  if (st.t < 120) pool.push('A strange season for heroes. They wash up on the coast with rusty swords and big opinions.');
  pool.push('Wolves in the moor, skeletons in the camps, something in the temple that is wet and does not forgive.', 'Chests sit on the old forts. Locked, mostly. The locks are the least of what guards them.', 'A beam falls on some crate within the fog every few minutes. Offerings, they call it. Men die for those crates.');
  return pool[Math.floor(st.t / 45) % pool.length];
}
export const hostileLine = (c) => (c.hostile ? '"Put that blade away before you speak to me."' : null);
