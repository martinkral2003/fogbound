// Headless AI-vs-AI RTS match. node tools/rts-match.js [seed=1] [minutes=15] [difficulty=normal] [humanAiTeam=-1] [quiet=0]
// All four lords are AI (humans: []); humanAiTeam >= 0 lets that team be AI-controlled but marked human (checks the 'ai plays your lord' path).
import { createRts, step } from '../src/rts/core.js';
import { SIM_DT } from '../src/rts/consts.js';
import * as AI from '../src/rts/ai.js';

export function runMatch(seed = 1, minutes = 15, difficulty = 'normal', opts = {}) {
  const st = createRts({ seed, humans: [], difficulty });
  const rows = [], errs = [], lane = new Map(); // lane = exceptions thrown by other lanes (counted, not fatal)
  const t0 = performance.now();
  let stepMs = 0, maxStep = 0;
  const nextRow = { v: 60 };
  const endT = minutes * 60;
  while (st.t < endT && !st.over) {
    const s0 = performance.now();
    try { step(st, SIM_DT, {}); } catch (e) {
      const stack = e.stack || String(e), k = stack.split('\n').slice(0, 2).join(' | ');
      lane.set(k, (lane.get(k) || 0) + 1);
      if (/\/ai[_.]/.test(stack) || lane.size > 20) throw e; // AI faults are fatal; other lanes' faults are counted and skipped
    }
    const dt = performance.now() - s0; stepMs += dt; if (dt > maxStep) maxStep = dt;
    st.events.length = 0;
    if (st.t >= nextRow.v) {
      nextRow.v += 60;
      rows.push(snapshot(st));
    }
  }
  for (const t of st.teams) if (t.ai && t.ai.err) errs.push({ team: t.id, n: t.ai.err, e: (t.ai.lastErr || '').split('\n').slice(0, 3).join(' | ') });
  return { st, rows, errs, lane, ms: performance.now() - t0, avgStep: stepMs / Math.max(1, st.tick), maxStep };
}
export function snapshot(st) {
  const m = Math.round(st.t / 60);
  return {
    m,
    teams: st.teams.map((t) => {
      const bl = st.blds.filter((b) => b.team === t.id && b.state !== 'ruin');
      const walls = bl.filter((b) => b.wall).length;
      const types = {};
      for (const b of bl) if (b.state === 'ready' && !b.wall) types[b.type] = (types[b.type] || 0) + 1;
      return {
        id: t.id, alive: t.alive, age: t.age || 1, persona: t.ai ? t.ai.persona : '-', res: { ...t.res }, pop: { ...t.pop }, popMax: t.popMax,
        blds: bl.length - walls, walls, types, gens: t.generals.filter((g) => (st.byId.get(g) || {}).alive).length, kills: t.stats.kills, lost: t.stats.lost,
        wave: t.ai ? t.ai.wave.state : '-', ms: t.ai ? t.ai.stats.ms / Math.max(1, t.ai.stats.rounds) : 0, cmds: t.ai ? t.ai.stats.cmds : 0,
      };
    }),
  };
}
const fmt = (r) => ['gold', 'timber', 'stone', 'blood', 'souls'].map((k) => String(Math.round(r[k])).padStart(4)).join(' ');
export function printTable(res, quiet) {
  if (!quiet) {
    for (const row of res.rows) {
      console.log('--- minute', row.m);
      for (const t of row.teams) console.log(` T${t.id} ${t.persona.padEnd(6)} ${t.alive ? 'alive' : 'DEAD '} age${t.age} res ${fmt(t.res)} | W${String(t.pop.work).padStart(2)} M${String(t.pop.mil).padStart(2)}/${t.popMax} G${t.gens} | bld ${String(t.blds).padStart(2)} wall ${String(t.walls).padStart(2)} | K${t.kills}/L${t.lost} | ${t.wave}`);
    }
  }
  const st = res.st;
  console.log('result:', st.over ? 'winner T' + st.over.winner + ' (' + st.over.reason + ') at ' + (st.t / 60).toFixed(1) + ' min' : 'no winner after ' + (st.t / 60).toFixed(1) + ' min',
    '| wall', Math.round(res.ms), 'ms | avg step', res.avgStep.toFixed(2), 'ms | max', res.maxStep.toFixed(1), 'ms | ai ms/round', st.teams.filter((t) => t.ai).map((t) => t.ai.stats.ms / Math.max(1, t.ai.stats.rounds)).map((x) => x.toFixed(2)).join('/'));
  for (const [k, n] of res.lane) console.log('LANE EXCEPTION x' + n, k);
  for (const e of res.errs) console.log('AI ERROR team', e.team, 'x' + e.n, e.e);
  for (const t of st.teams) if (t.ai && t.ai.log.length) console.log(' T' + t.id + ' log', JSON.stringify(t.ai.log.slice(0, 14)));
}
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const [seed = 1, minutes = 15, diff = 'normal', , quiet = 0] = process.argv.slice(2);
  const res = runMatch(+seed, +minutes, diff);
  printTable(res, +quiet);
}
export { AI };
