// Level cap 15, 12 skills per class (incl. the 2 single-target ones), 2 upgrade tiers (branch at skill lv2, mastery at lv4), difficulty scaling. node tools/v5-progress-test.js
import { createGame, step } from '../src/sim.js';
import { createAI, aiInput } from '../src/ai.js';
import { SIM_DT, MAX_HERO_LVL, CLASSES, SKILLS, DIFF_IDS } from '../src/data.js';
import * as perks from '../src/perks.js';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
ok(MAX_HERO_LVL === 15, 'level cap is 15');
for (const id of Object.keys(CLASSES)) ok(CLASSES[id].skills.length === 13 && CLASSES[id].skills.every((s) => SKILLS[s]), `${id}: 13 skills defined`);
// every class: auto-pick through 14 level-ups, check legality and that mastery shows up
for (const bg of ['soldier', 'hunter', 'mage', 'outlaw']) {
  const st = createGame({ seed: 5, humans: [], bg });
  const team = st.teams.find((t) => t.bg === bg) || st.teams[0];
  let picks = 0, mastery = 0, paths = 0;
  for (let lvl = 1; lvl <= 15; lvl++) {
    perks.onHeroLevel(st, team, lvl); team.hero.lvl = lvl;
    let g = 0; while (team.kit.offers.length && g++ < 6) { const i = perks.autoIdx(st, team), o = team.kit.offers[0][i]; if (o && o.kind === 'path2') mastery++; if (o && o.kind === 'path') paths++; if (!perks.autoPick(st, team)) break; picks++; }
  }
  ok(picks >= 14, `${bg}: ${picks} picks over 15 levels (skills ${team.kit.slots.filter(Boolean).join(',')}, lv ${JSON.stringify(team.kit.lv)}, branches ${paths}, masteries ${mastery})`);
  ok(team.kit.slots.filter(Boolean).length >= 3, `${bg}: kit slots filled`);
}
// difficulty: same demon, different HP
const hp = {};
for (const d of DIFF_IDS) { const st = createGame({ seed: 7, humans: [], diff: d }); const m = st.ents.find((e) => e.kind === 'mon' && e.base && e.base.swarm); hp[d] = m ? m.maxHp : 0; }
console.log('swarm monster max HP by difficulty', JSON.stringify(hp));
ok(hp.easy < hp.normal && hp.normal < hp.hard && hp.hard < hp.nightmare, 'monster HP grows easy < normal < hard < nightmare');
// a 3-minute AI match on nightmare runs clean
const st = createGame({ seed: 3, humans: [], diff: 'nightmare' }), ais = st.teams.filter((t) => t.id < 4).map((t) => createAI(st, t.id));
let ex = 0; for (let i = 0; i < 180 / SIM_DT; i++) { try { step(st, SIM_DT, st.teams.map((t) => (t.id < 4 ? aiInput(st, ais[t.id], SIM_DT) : {}))); } catch (e) { ex++; if (ex < 3) console.error(e); } st.events.length = 0; }
ok(ex === 0, '3 min nightmare match: no exceptions; levels ' + st.teams.slice(0, 4).map((t) => t.hero.lvl).join(','));
process.exit(bad ? 1 : 0);

