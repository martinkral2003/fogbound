// FLOW: AI dispatcher. Monsters (ai_monster.js) and rival heroes (ai_rival.js) both produce the same input struct as the human.
import { monsterInput } from './ai_monster.js';
import { rivalInput } from './ai_rival.js';

export function updateAI(st, dt) {
  const out = new Map();
  const heroes = [];
  for (const a of st.actors) if (a.alive && (a.kind === 'player' || a.kind === 'rival')) heroes.push(a);
  if (st.flow) st.flow.pathBudget = 2;
  for (const a of st.actors.slice()) {
    if (!a.alive || !a.ai) continue;
    if (a.kind === 'monster') out.set(a.id, monsterInput(st, a, heroes, dt));
    else if (a.kind === 'rival') out.set(a.id, rivalInput(st, a, heroes, dt));
  }
  return out;
}

export { monsterInput, rivalInput };
