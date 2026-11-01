// AI lane: unit training helpers (which building trains what, cost/age checks, queue commands).
import { roster, popCost, affordable, bdef } from './ai_info.js';
import { pay } from './ai_build.js';
import * as BD from './bdata.js';

const ROLE_TOKENS = { worker: ['worker'], general: ['general'], infantry: ['melee', 'heavy'], ranged: ['ranged'], cavalry: ['cavalry', 'beast'], siege: ['siege'], caster: ['caster'], flyer: ['flyer'] };
const MAXQ = 4;

export function canTrainAt(b, u) {
  const d = bdef(b.type);
  if (!d) return false;
  const short = u.id.replace(/^(necro|orc|demon|cult)_/, '');
  if ((d.trains || []).includes(u.id) || (d.trains || []).includes(short)) return true;
  if (u.needs != null) return (Array.isArray(u.needs) ? u.needs : [u.needs]).includes(b.type);
  const roles = (d.trains || []).flatMap((tk) => ROLE_TOKENS[tk] || []);
  return roles.includes(u.role);
}
export function trainMul(b) { const d = bdef(b.type); return (d && d.trainMul) || { time: 1, cost: 1 }; }
export function unitCostAt(b, u) {
  const m = trainMul(b), c = {};
  for (const r in u.cost || {}) c[r] = r === 'souls' ? u.cost[r] : Math.round(u.cost[r] * (m.cost == null ? 1 : m.cost));
  return c;
}
// ready buildings (with room in the queue) that can train unit u; shortest queue first
export function trainers(st, ai, u) {
  const s = ai.s, out = [];
  for (const type in s.bl) for (const b of s.bl[type].ready) if (b.state !== 'building' && (b.queue || []).length < MAXQ && canTrainAt(b, u)) out.push(b);
  out.sort((a, b) => a.queue.length - b.queue.length);
  return out;
}
export function ageOk(team, u) { return (u.age || u.tier || 1) <= (team.age || 1) && (!u.needsTech || (team.tech && team.tech[u.needsTech])); }
export function availableUnits(st, ai) {
  const team = ai.s.team, key = 'avail';
  if (ai[key] && st.t - ai[key].t < 3) return ai[key].list;
  const list = roster(st, ai).filter((u) => u.role !== 'worker' && u.role !== 'general' && ageOk(team, u) && trainers(st, ai, u).length);
  ai[key] = { t: st.t, list };
  return list;
}
// queue n units of u; returns number queued (0 if impossible/unaffordable)
export function trainUnit(st, ai, cmds, u, n = 1) {
  const s = ai.s, team = s.team;
  if (!ageOk(team, u)) return 0;
  const tr = trainers(st, ai, u);
  if (!tr.length) return 0;
  const pc = popCost(u), isGen = u.role === 'general', isW = u.role === 'worker';
  let q = 0;
  for (let i = 0; i < n; i++) {
    if (!isGen && pc > 0 && s.popFree < pc) break;
    if (isGen && team.generals.length + s.queued.gen + i >= team.cap.gen) break;
    if (isW && team.pop.work + s.queued.work + i >= team.cap.work) break;
    if (!isW && !isGen && team.pop.mil + s.queued.mil + i + pc > team.cap.mil) break;
    const b = tr[i % tr.length], c = unitCostAt(b, u);
    if (!pay(ai, c, isW || isGen)) break;
    cmds.push({ t: 'train', bld: b.id, unit: u.id, n: 1 });
    if (!isGen) s.popFree -= pc;
    if (isW) s.queued.work++; else if (isGen) s.queued.gen++; else s.queued.mil++;
    q++;
  }
  return q;
}
export function unitById(st, ai, id) { return roster(st, ai).find((u) => u.id === id) || null; }
export { affordable, BD };
