// FOGBOUND v0.5 ALLIES: the three allied AI heroes (teams 1-3; team 0 too with `auto=1`) that fight beside the human against the demons.
// They produce exactly the input struct a human does, so the sim cannot tell the difference.
//   createAI(st, teamId, skill) -> ai state   (skill: 'easy' | 'normal' | 'hard' | 0..2; default st.aiDiff or normal)
//   aiInput(st, ai, dt)         -> input struct { mx, mz, aimX, aimZ, atk, casts, hold, charge, cmds }
//   allyReport(st)              -> per-hero summary for tools (alias: rivalReport)      aiOf(st, teamId) -> ai state
// Layout: ai_util (difficulty, rng), ai_world (objective/gates/towns adapter), ai_combat (sense, targets, skills, dodge), ai_kit (cards, potions, shop, cage),
// ai_plan (what the group is doing: follow / defend / stage+assault / event / filler). Brain = think() every ~0.35 s (staggered); aiInput() only aims, moves and casts.
import { diffOf, makeRng } from './ai_util.js';
import { sense, chooseTarget, fightStep, fightRatio, pickSkill, dangerAt, slotsOf, kitSummary } from './ai_combat.js';
import { towns, nearestTown, nearestWaystone, waystones, humanTeam, leadTeam } from './ai_world.js';
import { pickCards, usePotions, shop } from './ai_kit.js';
import { chooseGoal, goalFoesOf } from './ai_plan.js';

const REG = new WeakMap(); // st -> { [teamId]: ai }
export function aiOf(st, teamId) { const r = REG.get(st); return r ? r[teamId] : null; }

export function createAI(st, teamId, skill) {
  const P = diffOf(skill ?? st.aiDiff ?? (st.opts && st.opts.aiDiff));
  const rng = makeRng(st, teamId);
  const ai = {
    team: teamId, P, rng, thinkT: rng() * P.think, cmds: [], goal: null, goalT: 0, tgt: null, mode: 'idle', S: null, castQ: null, holdSkill: null,
    danger: null, dodgeOk: false, dodgeAt: 0, dangerKey: '', dangerT: 0, ignore: {}, black: {}, pots: 0, ratio: 99, fleeTo: null, fleeT0: 0, pend: null,
    anchorId: -1, plan: {}, prog: { id: 0, hp: 0, t: 0 }, jig: 0,
    track: { x: 0, z: 0, t: 0, goalD: 1e9, goalT: 0, arriveT: 0 },
    stat: { thinks: 0, idleMax: 0, goals: {}, fights: 0, flees: 0, teles: 0, levelT: [], lastLvl: 1, deaths: 0, perks: 0, shop: 0, hires: 0, potions: 0, dodges: 0, errors: 0, assaults: 0, defends: 0, cages: 0 },
  };
  let r = REG.get(st); if (!r) REG.set(st, r = {});
  r[teamId] = ai;
  return ai;
}

const sleepInput = (h) => ({ mx: 0, mz: 0, aimX: h.x + Math.cos(h.face || 0), aimZ: h.z + Math.sin(h.face || 0), atk: false, casts: [], charge: false, tele: false, repair: false, cmds: [] });

// ------------------------------------------------------------------------------------------------ brain tick (every P.think seconds)
function think(st, ai) {
  const team = st.teams[ai.team], h = team.hero, P = ai.P;
  if (!team.alive || !h) return;
  ai.stat.thinks++;
  pickCards(st, ai, team);
  const tr = ai.track;
  if (h.dead || !h.alive) { tr.t = st.t; tr.x = h.x; tr.z = h.z; onDead(ai); return; }
  if (h.lvl > ai.stat.lastLvl) { for (let l = ai.stat.lastLvl; l < h.lvl; l++) ai.stat.levelT[l] = Math.round(st.t); ai.stat.lastLvl = h.lvl; }
  const S = ai.S = sense(st, ai, h);
  // idle tracking: no real displacement for a long time while not busy
  if (Math.hypot(h.x - tr.x, h.z - tr.z) > 3) { tr.x = h.x; tr.z = h.z; tr.t = st.t; }
  if (ai.mode === 'fight' || ai.mode === 'chan' || ai.mode === 'dead') tr.t = st.t;
  ai.stat.idleMax = Math.max(ai.stat.idleMax, st.t - tr.t);

  const hpPct = h.hp / h.maxHp;
  if (team.tele) { ai.mode = 'chan'; ai.pend = null; return; }
  if (ai.pend && st.t - ai.pend.t > 1.3) { if (Math.hypot(h.x - ai.pend.x, h.z - ai.pend.z) < 6) ai.black['ws' + ai.pend.ws] = st.t + 120; ai.pend = null; } // the jump was refused
  if (ai.mode === 'chan') ai.mode = 'idle';

  const thr = S.threats;
  ai.ratio = thr.length ? fightRatio(st, ai, team, h, thr, S) : 99;
  const wasFleeing = ai.mode === 'flee';
  usePotions(st, ai, team, h, S, hpPct, wasFleeing);
  if (!thr.length) shop(st, ai, team, h);

  // ---- flee / regroup: near death, or a hopeless fight; a faster pursuer is fought instead
  let flee = false;
  if (thr.length) {
    flee = ai.ratio < 0.55 / Math.sqrt(P.aggr) || (hpPct < P.flee && ai.ratio < 4);
    if (flee && hpPct > 0.12) { for (const f of thr) if (f.d < 6 && (f.e.spd || 0) > h.spd * 1.15 * (h.mspd || 1)) { flee = false; break; } }
  } else if (hpPct < 0.3 && st.t - h.lastHit < 2.5) flee = true;   // something unseen (ranged, damage over time) is hurting us
  if (wasFleeing && !flee && hpPct < 0.55 && (thr.length || st.t - h.lastHit < 4)) flee = true; // keep running until the pursuit is gone
  if (flee) {
    if (!wasFleeing) ai.fleeT0 = st.t;
    if (st.t - ai.fleeT0 > 16 && hpPct > P.flee + 0.08) { for (const f of thr) ai.ignore[f.e.id] = st.t + 40; ai.fleeTo = null; ai.mode = 'idle'; ai.cmds.push({ t: 'stop' }); return; } // watchdog: threats that never hurt us
    startFlee(st, ai, team, h, S, wasFleeing); return;
  }
  if (wasFleeing) { ai.mode = 'idle'; ai.fleeTo = null; ai.goal = null; }

  // ---- goal (what the group does), then fight what is in the way
  const goal = ai.goal = chooseGoal(st, ai, team, h, S, ai.goal);
  const ctx = { leash: goal && goal.leash || null, focus: goal && goalFoesOf(goal) || null, sites: !!(goal && goal.sites), siteOk: goal && goal.siteOk || null };
  const tgt = chooseTarget(st, ai, h, S, ctx);
  if (tgt) {
    if (ai.mode !== 'fight') ai.stat.fights++;
    const pg = ai.prog;
    if (pg.id !== tgt.id) { pg.id = tgt.id; pg.hp = tgt.hp; pg.t = st.t; }
    else if (tgt.hp < pg.hp - 1) { pg.hp = tgt.hp; pg.t = st.t; }
    else if (st.t - pg.t > 12) { ai.ignore[tgt.id] = st.t + 45; ai.tgt = null; pg.id = 0; ai.cmds.push({ t: 'stop' }); return; } // we cannot hurt it: give up on it
    ai.mode = 'fight'; ai.tgt = tgt;
    const sk = pickSkill(st, ai, team, h, tgt, S, P.think, { fightOk: true, ratio: ai.ratio, fleeing: false });
    if (sk) ai.castQ = sk;
    return;
  }
  ai.tgt = null; ai.castQ = null;
  if (ai.mode === 'fight') { ai.mode = 'idle'; ai.cmds.push({ t: 'stop' }); }
  // support skills with no target (heal / buff when hurt)
  runGoal(st, ai, team, h, S, goal);
}

function onDead(ai) {
  if (ai.mode !== 'dead') { ai.mode = 'dead'; ai.stat.deaths++; ai.tgt = null; ai.castQ = null; ai.holdSkill = null; ai.goal = null; ai.fleeTo = null; ai.cmds.length = 0; ai.plan = {}; }
}

// ------------------------------------------------------------------------------------------------ movement
function sendTele(st, ai, h, ws) { ai.cmds.push({ t: 'stop' }, { t: 'tele', ws }); ai.stat.teles++; ai.pend = { ws, t: st.t, x: h.x, z: h.z }; }
// use a waystone when it saves a lot of walking (cooldown ready, nobody hitting us)
function tryTeleToward(st, ai, team, h, x, z, dNow) {
  if ((team.teleCd || 0) > 0 || team.tele || st.t - h.lastHit < 2.5 || h.stun > 0) return false;
  const w = nearestWaystone(st, team.id, x, z, (q) => (ai.black['ws' + q.id] || 0) > st.t);
  if (!w || dNow - w.d < 85) return false;
  sendTele(st, ai, h, w.w.id); ai.mode = 'chan'; return true;
}

function runGoal(st, ai, team, h, S, g) {
  if (!g) { ai.mode = 'idle'; return; }
  const tr = ai.track, d = Math.hypot(h.x - g.x, h.z - g.z), arrive = g.r || 6;
  ai.mode = 'travel';
  if (d <= arrive) { // there: stand, or pace a little (idle heroes look dead and a still hero never gets anywhere)
    if (h.dest) ai.cmds.push({ t: 'stop' });
    ai.mode = 'hold'; tr.goalD = 1e9; tr.goalT = st.t;
    if (g.on) g.on(st, ai, team, h, S);
    if (!tr.arriveT) tr.arriveT = st.t;
    if (st.t - tr.arriveT > 9 && !S.threats.length && !g.still) { // fidget
      tr.arriveT = st.t;
      const a = ai.rng() * 6.283, r = 4 + ai.rng() * 7, px = g.x + Math.cos(a) * r, pz = g.z + Math.sin(a) * r;
      if (!st.world.walkable || st.world.walkable(px, pz)) ai.cmds.push({ t: 'goto', x: px, z: pz, r: 1.5 });
    }
    return;
  }
  tr.arriveT = 0;
  if (d > 110 && !S.threats.length && tryTeleToward(st, ai, team, h, g.x, g.z, d)) return;
  if (!h.dest || Math.hypot(h.dest.x - g.x, h.dest.z - g.z) > 3 || g.moving) ai.cmds.push({ t: 'goto', x: g.x, z: g.z, r: Math.max(1.5, arrive * 0.7) });
  // stuck while walking: drop the goal for a while
  if (d < tr.goalD - 2) { tr.goalD = d; tr.goalT = st.t; }
  else if (st.t - tr.goalT > 10 && !team.tele) { ai.black[g.key] = st.t + 40; ai.goal = null; tr.goalD = 1e9; ai.cmds.push({ t: 'stop' }); }
}

// run to the nearest standing town (militia) or waystone away from the threats; jump when it is far
function startFlee(st, ai, team, h, S, was) {
  ai.mode = 'flee';
  if (!was) { ai.stat.flees++; ai.goal = null; ai.tgt = null; ai.castQ = null; ai.holdSkill = null; }
  let cx = h.x, cz = h.z;
  if (S.threats.length) { cx = S.cx; cz = S.cz; }
  const bad = (p) => S.threats.length > 0 && Math.hypot(p.x - cx, p.z - cz) < 30;
  if (!ai.fleeTo || !was || bad(ai.fleeTo)) {
    const opts = [];
    for (const t of towns(st)) opts.push({ x: t.x, z: t.z, d: Math.hypot(h.x - t.x, h.z - t.z), ws: 0 });
    for (const w of waystones(st, team.id, (q) => (ai.black['ws' + q.id] || 0) > st.t)) opts.push({ x: w.x, z: w.z, d: Math.hypot(h.x - w.x, h.z - w.z), ws: w.id });
    opts.sort((p, q) => p.d - q.d);
    let to = opts.find((o) => !bad(o));
    if (!to) { // nowhere safe known: run directly away from the threats
      const dx = h.x - cx, dz = h.z - cz, l = Math.hypot(dx, dz) || 1;
      to = { x: h.x + dx / l * 50, z: h.z + dz / l * 50, ws: 0, d: 50 };
      if (st.world.walkable && !st.world.walkable(to.x, to.z)) { to.x = h.x - dz / l * 50; to.z = h.z + dx / l * 50; }
    }
    ai.fleeTo = { x: to.x, z: to.z }; ai.fleeAlt = opts.find((o) => o.ws && !bad(o)) || null;
  }
  const to = ai.fleeTo, d = Math.hypot(h.x - to.x, h.z - to.z);
  if (S.threats.some((f) => f.d < 6) && (team.dodgeCd || 0) <= 0 && ai.rng() < ai.P.dodge) { const dx = to.x - h.x, dz = to.z - h.z, l = Math.hypot(dx, dz) || 1; ai.cmds.push({ t: 'dodge', dx: dx / l, dz: dz / l }); ai.stat.dodges++; }
  const jump = ai.fleeAlt;
  if (jump && (team.teleCd || 0) <= 0 && !team.tele && st.t - h.lastHit > 1.5 && jump.d > 70) { sendTele(st, ai, h, jump.ws); return; }
  if (d > 6 && (!h.dest || Math.hypot(h.dest.x - to.x, h.dest.z - to.z) > 4)) ai.cmds.push({ t: 'goto', x: to.x, z: to.z, r: 5 });
  if (d <= 6 && h.dest) ai.cmds.push({ t: 'stop' });
}

// ------------------------------------------------------------------------------------------------ per-step input
export function aiInput(st, ai, dt) {
  const team = st.teams[ai.team], h = team && team.hero;
  if (!team || !team.alive || !h) return { mx: 0, mz: 0, aimX: 0, aimZ: 0, atk: false, casts: [], charge: false, tele: false, repair: false, cmds: [] };
  const inp = sleepInput(h);
  ai.thinkT -= dt;
  if (ai.thinkT <= 0) { ai.thinkT = ai.P.think * (0.85 + ai.rng() * 0.3); try { think(st, ai); } catch (e) { ai.stat.errors++; if (ai.stat.errors < 4) console.error('ally AI', ai.team, e); } }
  if (!h.alive || h.dead) { inp.cmds = ai.cmds; ai.cmds = []; return inp; }
  if (team.tele) { inp.cmds = ai.cmds; ai.cmds = []; return inp; } // channelling a teleport: stand still

  // telegraphs / projectiles: roll once per new danger whether we notice it in time (difficulty); scan a few times a second
  if (st.t >= ai.dangerT) {
    ai.dangerT = st.t + 0.1;
    const dg = dangerAt(st, h);
    if (dg) {
      if (dg.key !== ai.dangerKey) { ai.dangerKey = dg.key; ai.dodgeOk = ai.rng() < ai.P.dodge; ai.dodgeAt = st.t + ai.P.react; }
      ai.danger = dg;
    } else { ai.danger = null; ai.dangerKey = ''; ai.dodgeOk = false; }
  }
  const evade = ai.danger && ai.dodgeOk && st.t >= ai.dodgeAt;
  if (ai.mode === 'fight' && ai.tgt) {
    ai.dodgeOk = evade;
    fightStep(st, ai, team, h, inp, dt);
    if (ai.castQ) { const q = ai.castQ; ai.castQ = null; if (!inp.casts.includes(q.slot)) { inp.casts.push(q.slot); inp.aimX = q.ax; inp.aimZ = q.az; } }
  } else if (evade) {
    const dg = ai.danger, dx = h.x - dg.x, dz = h.z - dg.z, l = Math.hypot(dx, dz) || 1;
    if (dg.kind === 'proj') { const sp = Math.hypot(dg.vx, dg.vz) || 1, nx = -dg.vz / sp, nz = dg.vx / sp, sd = dx * nx + dz * nz; inp.mx = sd >= 0 ? nx : -nx; inp.mz = sd >= 0 ? nz : -nz; }
    else { inp.mx = dx / l; inp.mz = dz / l; }
  }
  inp.cmds = ai.cmds; ai.cmds = [];
  return inp;
}

// ------------------------------------------------------------------------------------------------ reports for tools
export function allyReport(st) {
  const out = [];
  for (const t of st.teams) {
    if (!t || t.id > 3 || !t.hero) continue;
    const ai = aiOf(st, t.id), h = t.hero, slots = slotsOf(t);
    out.push({
      team: t.id, bg: t.bg || (t.f && t.f.key) || '?', lvl: h.lvl, xp: Math.round(h.xp), hp: Math.round(h.hp), maxHp: Math.round(h.maxHp), alive: !!h.alive && !h.dead,
      gold: Math.round(t.gold), followers: (t.followers && t.followers.length) || 0, kills: (t.run && t.run.kills) | 0, deaths: t.heroDeaths | 0,
      kit: kitSummary(t), skills: slots.filter(Boolean).length, mode: ai ? ai.mode : '-', goal: ai && ai.goal ? ai.goal.kind : '-', x: Math.round(h.x), z: Math.round(h.z),
      levelT: ai ? ai.stat.levelT.filter(Boolean) : [], idleMax: ai ? Math.round(ai.stat.idleMax) : 0, stat: ai ? ai.stat : null,
    });
  }
  return out;
}
export const rivalReport = allyReport; // alias kept for old callers
export { humanTeam, leadTeam, nearestTown };
