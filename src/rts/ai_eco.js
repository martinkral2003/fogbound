// AI lane: economy + tech build order (workers, houses, production buildings, research / age-up).
import { bdef, roster, affordable, costTotal } from './ai_info.js';
import { tryBuild, cnt, ready, canBuild, pay } from './ai_build.js';
import { trainUnit, unitById } from './ai_train.js';
import * as Tech from './tech.js';

const UNIQ = { necro: 'bone_crypt', orc: 'war_hall', demon: 'hellgate', cult: 'blood_altar' };
const ECOB = { necro: 'graveyard', orc: 'war_totem', demon: 'brimstone_pit', cult: 'flagellant_chapel' };

export function workerUnit(st, ai) {
  return unitById(st, ai, ai.s.team.faction.key + '_worker') || { id: ai.s.team.faction.key + '_worker', role: 'worker', cost: { blood: 50 } };
}
export function trainWorkers(st, ai, cmds) {
  const s = ai.s, want = Math.min(s.team.cap.work, Math.round(ai.P.workers * ai.D.workerMul));
  const have = s.team.pop.work + s.queued.work;
  if (have >= want || !s.keep || s.keep.queue.length >= 2) return;
  const n = Math.min(want - have, s.workers.length < 10 ? 2 : 1);
  trainUnit(st, ai, cmds, workerUnit(st, ai), n);
}
// desired building counts [type, count], in priority order
function plan(st, ai) {
  const s = ai.s, P = ai.P, fk = s.team.faction.key, m = s.t / 60, W = s.workers.length, mil = s.mil.length;
  const L = [];
  L.push(['barracks', W >= 7 ? 1 : 0]);
  L.push(['farm', W >= 10 && s.team.res.blood < 260 ? (s.team.res.blood < 120 ? 2 : 1) : 0]);
  L.push(['archery', W >= 10 && cnt(s, 'barracks') ? 1 : 0]);
  L.push(['forge', W >= 11 && m > 3 && cnt(s, 'barracks') ? 1 : 0]);
  L.push([ECOB[fk], m > 3 && W >= 12 ? (m > 8 ? 2 : 1) : 0]);
  L.push([UNIQ[fk], W >= 12 && m > 4 && cnt(s, 'barracks') ? 1 : 0]);
  L.push(['barracks', P.prod >= 2 && m > 5 ? 2 : 1]);
  L.push(['tithe_house', m > 2.5 && W >= 12 ? 1 : 0]);
  L.push(['library', m > 7 ? 1 : 0]);
  L.push(['sanctum', m > 7 && W >= 14 ? 1 : 0]);
  L.push(['soul_altar', m > 8 ? 1 : 0]);
  L.push(['stable', m > 7 && P.mix.cavalry >= 1 ? 1 : 0]);
  L.push(['siege_workshop', P.siege > 0 && m > 7 && cnt(s, 'forge') ? 1 : 0]);
  L.push(['market', m > 9 ? 1 : 0]);
  L.push(['archery', P.prod >= 3 && m > 9 ? 2 : 1]);
  L.push(['barracks', P.prod >= 3 && m > 10 ? 3 : 2]);
  L.push(['temple', m > 13 ? 1 : 0]);
  L.push(['sanctum', m > 14 ? 2 : 1]);
  L.push(['forge', m > 14 ? 2 : 1]);
  return L;
}
export function houses(st, ai, cmds) {
  const s = ai.s, pop = s.team.pop.mil + s.team.pop.work + s.queued.mil + s.queued.work;
  const need = s.popFree < 4 + Math.floor(pop / 12) && s.team.popMax < s.team.cap.mil + s.team.cap.work + 12;
  const under = (s.bl.house ? s.bl.house.build.length : 0);
  if (!need || under >= (pop > 35 ? 2 : 1)) return false;
  const h = s.home, out = Math.atan2(h.z, h.x);
  return tryBuild(st, ai, cmds, 'house', { at: { r0: 12, r1: 30, pref: out, spread: 1.7 }, n: 2 });
}
export function buildOrder(st, ai, cmds) {
  const s = ai.s, h = s.home, toC = Math.atan2(-h.z, -h.x);
  let n = 0;
  for (const [type, want] of plan(st, ai)) {
    if (!type || cnt(s, type) >= want) continue;
    if (st.t - (ai.noSpot[type] || -99) < 25) continue;
    const d = canBuild(st, ai, type);
    if (!d) continue;
    if (!affordable({ res: ai.bud }, d.cost || {})) { // save up for the highest-priority item we can build but not afford
      ai.save = { ...(d.cost || {}) }; ai.saveUntil = s.t + 20;
      break;
    }
    const mil = !!(d.trains && d.trains.length) || /forge|stable|siege/.test(type);
    const at = mil ? { r0: 14, r1: 30, pref: toC, spread: 1.3 } : { r0: 10, r1: 28, pref: Math.atan2(h.z, h.x), spread: 1.8 };
    if (tryBuild(st, ai, cmds, type, { at, n: 2 }) && ++n >= 2) break;
    break;
  }
  return n;
}
// idle builders resume unfinished buildings; keep scaffolds from stalling
export function resumeBuilds(st, ai, cmds) {
  const s = ai.s;
  for (const b of s.under) {
    const born = ai.born[b.id] ?? (ai.born[b.id] = st.t);
    if (st.t - born < 4 || (ai.crewed[b.id] || -99) > st.t - 6) continue;
    const idle = s.idleW.filter((u) => !ai.busy.has(u.id));
    if (!idle.length) break;
    idle.sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z));
    const ids = idle.slice(0, 2).map((u) => u.id);
    for (const id of ids) ai.busy.add(id);
    ai.crewed[b.id] = st.t;
    cmds.push({ t: 'order', ids, order: { type: 'build', bld: b.id } });
  }
}
const TPRIO = { age_iron: 100, age_cursed: 90, eco_gather1: 88, eco_carry1: 80, forge_blade1: 70, forge_armor1: 68, forge_ranged1: 60, magic_1: 58, forge_wall1: 50, eco_build1: 40, eco_gather2: 55, eco_carry2: 45, forge_blade2: 66, forge_armor2: 64, forge_ranged2: 52, magic_2: 54, mil_speed1: 30, holy_heal: 25, forge_blade3: 62, forge_armor3: 60, magic_3: 50, forge_wall2: 44, eco_farm1: 35, mil_vision1: 20 };
export function research(st, ai, cmds) {
  const s = ai.s, team = s.team, P = ai.P;
  const have = (type) => ready(s, type) > 0;
  const busy = new Set();
  for (const type in s.bl) for (const b of s.bl[type].ready) for (const e of b.queue || []) if (e.kind === 'tech') busy.add(e.tech);
  let best = null, bs = -1;
  for (const id in Tech.TECHS) {
    const t = Tech.TECHS[id];
    if (busy.has(id) || Tech.unavailable(st, team, id, have)) continue;
    let sc = TPRIO[id] ?? (id.startsWith('spell:') ? 47 : t.faction && t.faction !== 'all' ? 56 : 20);
    if (t.isAge === 2 && s.t < P.ageAt * ai.D.delay) continue;
    if (t.isAge === 3 && (s.t < P.ageAt * 2 || team.pop.mil < 18)) continue;
    if (/wall/.test(id) && P.wallAt > 400) sc -= 30;
    if (/ranged/.test(id) && !(s.byRole.ranged > 4)) sc -= 25;
    if (/^(forge|magic|mil|holy|necro|orc|demon|cult)/.test(id) && team.pop.mil < 8) sc -= 40;
    if (sc > bs) { bs = sc; best = t; }
  }
  if (!best || bs < 15) return;
  const host = (best.at || []).map((ty) => s.bl[ty] && s.bl[ty].ready.find((b) => (b.queue || []).length < 1)).find(Boolean);
  if (!host) return;
  if (!affordable({ res: ai.bud }, best.cost)) { if (costTotal(best.cost) < 1.8 * costTotal(team.res) + 200 && bs >= 55) { ai.save = { ...best.cost }; ai.saveUntil = s.t + 25; } return; }
  if (st.rng() < ai.D.skip * 0.5) return;
  pay(ai, best.cost);
  cmds.push({ t: 'research', bld: host.id, tech: best.id });
}
export { roster, bdef };
