// AI lane: army production (composition vs enemy mix), unit upgrades, generals (train / revive / abilities / spells), then ai_war (squads + waves).
import { roster, upgradeList, affordable, has, safe, costTotal } from './ai_info.js';
import { pay, ready } from './ai_build.js';
import { availableUnits, trainUnit, unitById, ageOk } from './ai_train.js';
import * as War from './ai_war.js';
import * as Magic from './magic.js';

const ROLE_ORDER = ['melee', 'ranged', 'heavy', 'cavalry', 'siege', 'caster', 'flyer', 'beast'];
const roleOf = (st, ai, id) => { const u = unitById(st, ai, id); return u ? u.role : 'melee'; };

function queuedRoles(st, ai) {
  const q = {};
  for (const type in ai.s.bl) for (const b of ai.s.bl[type].ready) for (const e of b.queue || []) if (e.kind === 'unit') { const r = roleOf(st, ai, e.unit); q[r] = (q[r] || 0) + 1; }
  return q;
}
export function mixWeights(st, ai) {
  const s = ai.s, P = ai.P, w = { ...P.mix, beast: P.mix.cavalry * 0.5 };
  const er = s.eRoles, tot = Object.values(er).reduce((a, b) => a + b, 0) || 0;
  if (tot > 6) {
    if ((er.cavalry || 0) + (er.beast || 0) > tot * 0.3) { w.melee *= 1.5; w.ranged *= 1.2; w.cavalry *= 0.6; }
    if ((er.ranged || 0) > tot * 0.35) { w.cavalry *= 1.7; w.flyer *= 1.4; w.heavy *= 1.3; }
    if ((er.melee || 0) + (er.heavy || 0) > tot * 0.6) { w.ranged *= 1.5; w.caster *= 1.3; }
    if ((er.flyer || 0) > 3) w.ranged *= 1.4;
  }
  if (s.enemyBlds.filter((b) => b.wall).length > 12) w.siege *= 1.8;
  if (!s.bl.siege_workshop || !s.bl.siege_workshop.ready.length) w.siege = 0;
  if (s.byRole.siege >= 6) w.siege = 0;
  if (ai.D.micro === 0) w.caster *= 0.6;
  return w;
}
export function produce(st, ai, cmds) {
  const s = ai.s, team = s.team, P = ai.P;
  if (team.res.blood < 25 && team.pop.mil > 6) return; // starvation guard: upkeep is paid in blood
  const wTarget = Math.round(P.workers * ai.D.workerMul);
  if (s.workers.length < Math.min(10, wTarget * 0.6) && P.aggr < 0.7) return; // economy first
  const avail = availableUnits(st, ai);
  if (!avail.length) return;
  const w = mixWeights(st, ai), q = queuedRoles(st, ai);
  const roles = ROLE_ORDER.filter((r) => w[r] > 0 && avail.some((u) => u.role === r));
  for (let k = 0; k < 3; k++) {
    let best = null, bs = -1;
    for (const r of roles) { const sc = w[r] / ((s.byRole[r] || 0) + (q[r] || 0) + 1.5); if (sc > bs) { bs = sc; best = r; } }
    if (!best) return;
    const opts = avail.filter((u) => u.role === best).sort((a, b) => (b.tier || 1) - (a.tier || 1) || costTotal(b.cost || {}) - costTotal(a.cost || {}));
    let did = 0;
    for (const u of opts) { if (affordable({ res: ai.bud }, u.cost || {}) && (did = trainUnit(st, ai, cmds, u, best === 'siege' ? 1 : 2))) { q[best] = (q[best] || 0) + did; break; } }
    if (!did) { const pri = opts[0]; if (pri && k === 0 && s.t < 240) { ai.save = { ...(pri.cost || {}) }; ai.saveUntil = s.t + 6; } w[best] *= 0.3; }
  }
}
export function upgrades(st, ai, cmds) {
  const s = ai.s, team = s.team, fk = team.faction.key;
  if (st.t - (ai.lastUp || 0) < 6 || !ready(s, 'forge') || s.mil.length < 6 || st.rng() > ai.D.upgrades) return;
  ai.lastUp = st.t;
  const lines = upgradeList().filter((l) => !l.faction || l.faction === fk || l.faction === 'all');
  const groups = {};
  for (const u of s.mil) { const d = unitById(st, ai, u.type); if (d && d.group) groups[d.group] = (groups[d.group] || 0) + 1; }
  const host = (s.bl.forge || { ready: [] }).ready.find((b) => (b.queue || []).length < 1);
  if (!host) return;
  const busy = new Set();
  for (const type in s.bl) for (const b of s.bl[type].ready) for (const e of b.queue || []) if (e.kind === 'upgrade') busy.add(e.upgrade);
  let best = null, bs = 0;
  for (const l of lines) {
    const lvl = team.up[l.id] | 0, t = l.tiers && l.tiers[lvl];
    if (!t || busy.has(l.id) || (l.at && !l.at.includes('forge'))) continue;
    const n = groups[l.group] || 0;
    if (n < 3) continue;
    const sc = n * (l.kind === 'weapon' ? 1.1 : 1) / (1 + lvl * 0.8) - costTotal(t.cost) / 400;
    if (sc > bs && affordable({ res: ai.bud }, t.cost)) { bs = sc; best = { l, t }; }
  }
  if (best && pay(ai, best.t.cost, false)) cmds.push({ t: 'upgrade', bld: host.id, upgrade: best.l.id });
}
// ---------------------------------------------------------------- generals
export function generals(st, ai, cmds) {
  const s = ai.s, team = s.team, m = s.t / 60;
  // revive
  for (const g of s.deadGens) if (st.t - (ai.reviveT?.[g.id] || -99) > 8) { (ai.reviveT || (ai.reviveT = {}))[g.id] = st.t; cmds.push({ t: 'general', op: 'revive', id: g.id, ids: [g.id] }); }
  // train more generals as the game goes on (and gold allows)
  const want = m > 12 ? 3 : m > 6 ? 2 : 1;
  const have = team.generals.length + s.queued.gen;
  if (have < want && team.res.gold > 450 && s.keep && s.keep.queue.length < 2 && st.t - (ai.lastGen || 0) > 20) {
    const owned = new Set(team.generals.map((id) => (st.byId.get(id) || {}).type));
    const cand = roster(st, ai).filter((u) => u.role === 'general' && !owned.has(u.id) && ageOk(team, u));
    if (cand.length) { ai.lastGen = st.t; trainUnit(st, ai, cmds, cand[0], 1); }
  }
  // skill points (generals lane publishes the skill format; try the obvious command shape, ignore failures)
  for (const g of s.gens) if (g.points > 0 && st.t - (g.aiSkillT || 0) > 5) { ai.skillT = ai.skillT || {}; if (st.t - (ai.skillT[g.id] || 0) > 5) { ai.skillT[g.id] = st.t; cmds.push({ t: 'general', op: 'skill', id: g.id, ids: [g.id] }); } }
}
// abilities and spells for generals + casters when enemies are close
export function casting(st, ai, cmds) {
  const s = ai.s;
  if (!s.enemy.length || st.t - (ai.lastCast || 0) < 0.9) return;
  ai.lastCast = st.t;
  const casters = s.gens.concat(s.mil.filter((u) => u.role === 'caster'));
  let n = 0;
  for (const c of casters) {
    if (n >= 4) break;
    let foe = null, fd = 40;
    for (const e of s.enemy) { const d = Math.hypot(e.x - c.x, e.z - c.z); if (d < fd) { fd = d; foe = e; } }
    if (!foe) continue;
    n++;
    if (has(Magic, 'suggest')) {
      const sg = safe(() => Magic.suggest(st, ai.team, c), null);
      if (sg && sg.spell) { cmds.push({ t: 'cast', caster: c.id, spell: sg.spell, x: sg.x, z: sg.z, target: sg.target }); continue; }
    }
    if (fd < 16 && c.abilities && c.abilities.length) {
      for (const a of c.abilities) {
        const id = typeof a === 'string' ? a : a.id;
        const key = c.id + id;
        if ((typeof a === 'object' && a.cd > 0) || st.t - (ai.abT?.[key] || -99) < 8) continue;
        (ai.abT || (ai.abT = {}))[key] = st.t;
        cmds.push({ t: 'ability', ids: [c.id], id, x: foe.x, z: foe.z, target: foe.id });
        break;
      }
    }
  }
}
export function update(st, ai, cmds) {
  produce(st, ai, cmds);
  upgrades(st, ai, cmds);
  generals(st, ai, cmds);
  casting(st, ai, cmds);
  War.update(st, ai, cmds);
}
