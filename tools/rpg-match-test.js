// Full bots-only FOGBOUND: HERO match. node tools/rpg-match-test.js [seed] [maxMinutes] [difficulty] [rivals]
import { createRpg, stepRpg } from '../src/rpg/core.js';
import { SIM_DT } from '../src/rpg/consts.js';
import { safeZoneInfo } from '../src/rpg/flow.js';

const seed = +(process.argv[2] || 1337), maxMin = +(process.argv[3] || 24), diff = process.argv[4] || 'normal', rivals = +(process.argv[5] || 10);
const t0 = performance.now();
const st = createRpg({ seed, rivals, human: false, difficulty: diff });
st.flow.difficulty = diff; for (const a of st.actors) if (a.kind === 'rival') a.ai.difficulty = diff;
console.log(`seed ${seed} diff ${diff}: created in ${Math.round(performance.now() - t0)} ms; actors ${st.actors.length} (monsters ${st.actors.filter((a) => a.kind === 'monster').length}, rivals ${st.actors.filter((a) => a.kind === 'rival').length}), containers ${st.containers.length}, ground ${st.groundItems.length}`);
const mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const nameOf = (id) => { const a = st.byId.get(id); return a ? a.name : '?'; };
const causes = { monster: 0, zone: 0, hero: 0, other: 0 };
let lastStage = -1, lastState = '', total = 0, worst = 0, steps = 0, exceptions = 0, lastLog = 0;
const vlog = (...x) => { if (!process.env.QUIET) console.log(...x); };
const seenAnn = new Set();
while (st.t < maxMin * 60 && st.match.state !== 'over') {
  const t1 = performance.now();
  try { stepRpg(st, SIM_DT, {}); } catch (e) { exceptions++; if (exceptions < 2) console.log('EXCEPTION', e.stack); if (exceptions > 2000) break; }
  const ms = performance.now() - t1; total += ms; steps++; if (ms > worst) worst = ms;
  for (const e of st.events) {
    if (e.type === 'death' && (e.kind === 'rival' || e.kind === 'player')) {
      const v = st.byId.get(e.actor), k = e.killer ? st.byId.get(e.killer) : null;
      causes[v.deathCause || 'other']++;
      vlog(`${mm(st.t)}  DEATH ${v.name} (${v.archetype}, lvl ${v.lvl}) by ${v.killedBy}${k && k.kind === 'monster' ? ` [${k.type}]` : ''}  alive ${st.match.alive}`);
    } else if (e.type === 'announce' && /Offering|Fog/.test(e.text) && !seenAnn.has(e.text + Math.floor(st.t))) { seenAnn.add(e.text + Math.floor(st.t)); vlog(`${mm(st.t)}  ** ${e.text}`); }
    else if (e.type === 'zone') vlog(`${mm(st.t)}  zone stage ${e.stage} ${e.state} r=${Math.round(e.r)}`);
  }
  st.events.length = 0;
  if (st.t - lastLog >= 120) { lastLog = st.t; const z = safeZoneInfo(st); vlog(`${mm(st.t)}  [status] alive ${st.match.alive}, fog r=${Math.round(z.cur.r)} stage ${z.stage}, step avg ${(total / steps).toFixed(2)} ms`); }
}
const heroes = st.actors.filter((a) => a.kind === 'rival' || a.kind === 'player');
console.log(`\nmatch ${st.match.state} at ${mm(st.t)} winner: ${st.match.winner ? nameOf(st.match.winner) : 'none'}; exceptions ${exceptions}`);
console.log('placements:');
for (const h of heroes.sort((a, b) => (st.match.placements[a.id] || 99) - (st.match.placements[b.id] || 99))) console.log(`  #${st.match.placements[h.id] || '-'} ${h.name.padEnd(18)} ${(h.archetype || '').padEnd(8)} ${(h.ai.personality || '').padEnd(11)} lvl ${String(h.lvl).padStart(2)} kills ${h.kills} ${h.alive ? 'ALIVE' : 'by ' + h.killedBy}`);
console.log('death causes', JSON.stringify(causes), '| monsters alive', st.actors.filter((a) => a.kind === 'monster' && a.alive).length, '/', st.actors.filter((a) => a.kind === 'monster').length);
console.log(`avg step ${(total / steps).toFixed(2)} ms, worst ${worst.toFixed(1)} ms over ${steps} steps (${heroes.length} heroes)`);
const nd = causes.monster + causes.zone + causes.hero + causes.other, pc = (n) => Math.round((100 * n) / Math.max(1, nd)) + '%';
const win = st.match.winner ? st.byId.get(st.match.winner) : null;
const heroKills = st.match.kills.filter((k) => k.cause === 'hero').length;
console.log(`SUMMARY seed ${seed} ${diff.padEnd(6)} len ${mm(st.t)} winner ${win ? win.name + ' (' + win.archetype + ' L' + win.lvl + ' arm' + Math.round(win.d.armor) + ')' : 'none'} | deaths monster ${causes.monster} (${pc(causes.monster)}) hero ${causes.hero} (${pc(causes.hero)}) fog ${causes.zone} (${pc(causes.zone)}) | feed hero-kills ${heroKills} | avg ${(total / steps).toFixed(2)} ms | exc ${exceptions}`);
