// v0.7 (two-faction war, phase 1): checks the two additive, backward-compatible pieces built so far.
//   1. the faction model + hostile() stay IDENTICAL to today's co-op when opts.factions is not passed, and a leftover
//      FACTION_OF from a previous createGame() in the same process never leaks into the next one.
//   2. opts.factions actually makes cross-faction heroes hostile (same-faction and vs-monsters unaffected).
//   3. levy.js's new offensive muster: a deep reserve sends an 'assault' squad at the open gate once the cooldown clears.
// node tools/v7-war-test.js
import { createGame, step, hostile } from '../src/sim.js';
import { createAI, aiInput } from '../src/ai.js';
import * as levy from '../src/levy.js';
import { SIM_DT, LEVY } from '../src/data.js';

let fail = 0;
const check = (name, cond) => { if (!cond) { console.error('FAIL', name); fail++; } else console.log('ok  ', name); };

// 1. default co-op game: hostile() behaves exactly as before, team.faction all 0, st.war false
{
  const st = createGame({ seed: 1, humans: [] });
  check('coop: war flag false', st.war === false);
  check('coop: all teams faction 0', st.teams.slice(0, 4).every((t) => t.faction === 0));
  check('coop: heroes not hostile to each other', !hostile(0, 1) && !hostile(2, 3));
  check('coop: monsters hostile to heroes', hostile(-1, 0) && hostile(0, -1));
  check('coop: monsters not hostile to each other', !hostile(-1, -1));
  check('coop: heroes not hostile to humanity', !hostile(0, 4) && !hostile(4, 1));
}

// 2. competitive game: factions split 0/0/1/1, cross-faction heroes hostile, same-faction/monster rules unchanged
{
  const st = createGame({ seed: 1, humans: [], factions: [0, 0, 1, 1] });
  check('war: war flag true', st.war === true);
  check('war: faction assignment', st.teams[0].faction === 0 && st.teams[1].faction === 0 && st.teams[2].faction === 1 && st.teams[3].faction === 1);
  check('war: same-faction heroes not hostile', !hostile(0, 1) && !hostile(2, 3));
  check('war: cross-faction heroes hostile', hostile(0, 2) && hostile(1, 3) && hostile(0, 3));
  check('war: monsters still hostile to all heroes', hostile(-1, 0) && hostile(-1, 2));
  check('war: humanity (no faction entry) stays non-hostile', !hostile(4, 0) && !hostile(4, 2));
}

// 3. no leak: a later plain co-op game in the same process is unaffected by the competitive game created just above
{
  const st = createGame({ seed: 2, humans: [] });
  check('no-leak: war flag resets to false', st.war === false);
  check('no-leak: hostile() back to co-op behaviour', !hostile(0, 2) && !hostile(1, 3));
}

// 4. offensive muster: run a short real match, then force a deep reserve and confirm an 'assault' squad is raised
{
  const st = createGame({ seed: 3, humans: [] });
  const ais = st.teams.filter((t) => t.id < 4).map((t) => createAI(st, t.id));
  const run = (seconds) => { for (let i = 0; i < seconds / SIM_DT; i++) { const inputs = st.teams.map((t) => (t.id < 4 ? aiInput(st, ais[t.id], SIM_DT) : {})); step(st, SIM_DT, inputs); st.events.length = 0; } };
  run(90); // let the horde/towns systems come up (st.horde.ready, st.towns populated)
  check('muster-setup: horde ready', !!(st.horde && st.horde.ready));
  check('muster-setup: towns exist', (st.towns || []).length > 0);
  st.levy.reserve = Math.min(LEVY.max, LEVY.assaultAt + 5);
  st.levy.lastAssaultT = -1e9; // clear the cooldown so the next tick can muster
  run(4);
  const assaulted = st.levy.squads.some((sq) => sq.mode === 'assault');
  check('muster: an assault squad was raised from a deep reserve', assaulted);
  check('muster: reserve was spent on it', st.levy.reserve < LEVY.assaultAt + 5);
}

// 5. does hostile() flowing into AI combat actually produce hero-vs-hero DAMAGE, not just a flag? Force two rival-faction
// heroes adjacent and let their existing AI (ai_combat.js already scans targets generically via hostile(), unchanged by
// this session) fight it out, same as it already does against monsters.
{
  const st = createGame({ seed: 4, humans: [], factions: [0, 0, 1, 1] });
  const ais = st.teams.filter((t) => t.id < 4).map((t) => createAI(st, t.id));
  const run = (seconds) => { for (let i = 0; i < seconds / SIM_DT; i++) { const inputs = st.teams.map((t) => (t.id < 4 ? aiInput(st, ais[t.id], SIM_DT) : {})); step(st, SIM_DT, inputs); st.events.length = 0; } };
  const h0 = st.teams[0].hero, h2 = st.teams[2].hero; // faction 0 vs faction 1
  const hp0 = h0.hp, hp2 = h2.hp;
  h2.x = h0.x + 1.5; h2.z = h0.z; // shove them into melee range of each other
  run(8);
  check('pvp: a cross-faction fight actually changed HP (not just flagged hostile)', h0.hp !== hp0 || h2.hp !== hp2 || !h0.alive || !h2.alive);
}

console.log(fail ? `\n${fail} check(s) FAILED` : '\nall checks passed');
process.exit(fail ? 1 : 0);
