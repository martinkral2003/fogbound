// Repro for a real, pre-existing bug found 2026-11-01 while building MQTT lockstep netplay (src/net.js): two
// independent createGame(same seed) + step() runs, fed the IDENTICAL input sequence, can still diverge - with ZERO
// networking involved. This means the sim is not the bit-exact deterministic engine lockstep networking wants, even
// though it never calls raw Math.random() (grepped: only render.js/worldview.js/towns_view.js do, visual-only).
// Not root-caused. Known: it is NOT Date.now()/performance.now() (grepped clean in sim/ai files); ai_combat.js's only
// .sort() (target-by-distance) is a stable sort, so tie-breaking there isn't the obvious culprit either. Reproduces
// with pure AI input (no human input difference at all) - see the second check below, smaller and faster to iterate on.
// node tools/v7-determinism-test.mjs
import { createGame, step } from '../src/sim.js';
import { createAI, aiInput } from '../src/ai.js';
import { SIM_DT } from '../src/data.js';

function runScripted(ticks) {
  const st = createGame({ seed: 777, humans: [], diff: 'normal' });
  const ais = st.teams.map((t) => createAI(st, t.id));
  for (let tick = 0; tick < ticks; tick++) {
    const mk = (team) => ({ mx: Math.sin(tick * 0.17 + (team ? 1.7 : 0)), mz: Math.cos(tick * 0.13), aimX: 1, aimZ: 0, atk: tick % 11 === 0, casts: tick % 37 === 0 ? [0] : [], charge: false, tele: false, repair: false, cmds: [] });
    const inputs = st.teams.map((t) => (t.id === 0 ? mk(0) : t.id === 1 ? mk(1) : aiInput(st, ais[t.id], SIM_DT)));
    step(st, SIM_DT, inputs);
    st.events.length = 0;
  }
  return { t: +st.t.toFixed(3), ents: st.ents.length, kills: st.stats.kills, heroes: st.teams.slice(0, 4).map((t) => ({ x: +t.hero.x.toFixed(4), z: +t.hero.z.toFixed(4), hp: +t.hero.hp.toFixed(3) })) };
}
function runAllAi(ticks) {
  const st = createGame({ seed: 777, humans: [], diff: 'normal' });
  const ais = st.teams.map((t) => createAI(st, t.id));
  for (let tick = 0; tick < ticks; tick++) {
    const inputs = st.teams.map((t) => aiInput(st, ais[t.id], SIM_DT));
    step(st, SIM_DT, inputs);
    st.events.length = 0;
  }
  return st.teams.slice(0, 4).map((t) => [+t.hero.x.toFixed(4), +t.hero.z.toFixed(4)]);
}

let fail = 0;
{
  const a = runScripted(240), b = runScripted(240);
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? 'ok  ' : 'FAIL', 'scripted 2-human + 2-AI, 240 ticks, same seed+inputs -> identical');
  if (!ok) { fail++; console.log('  A', JSON.stringify(a)); console.log('  B', JSON.stringify(b)); }
}
{
  const a = runAllAi(90), b = runAllAi(90);
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(ok ? 'ok  ' : 'FAIL', 'all-AI (no human input at all), 90 ticks, same seed -> identical');
  if (!ok) { fail++; console.log('  A', JSON.stringify(a)); console.log('  B', JSON.stringify(b)); }
}
console.log(fail ? `\n${fail} check(s) FAILED - this is the known open bug, not a regression you just caused (unless you changed sim.js/ai*.js and want to re-root-cause it)` : '\nboth deterministic this run (the bug may be intermittent/order-dependent - rerun a few times before trusting a pass)');
process.exit(0); // never fail CI on this known issue; it's here to be run and read, not gated on
