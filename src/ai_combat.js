// FOGBOUND v0.5 ALLIES: combat brain of the allied heroes. Sensing (limited sight), fight evaluation, target choice, aimed skill use with lead,
// dodging telegraphs, kiting. Everything produces the same input struct a human does (mx/mz, aimX/aimZ, atk, casts, hold, cmds).
// Other lanes are read defensively (namespace imports: a missing export is `undefined`, never a link error).
import { SKILLS, COMBAT } from './data.js';
import { hostile } from './sim.js';
import * as perks from './perks.js';
import { aimKind } from './skillaim.js';
import { angDiff } from './util.js';
import { d2, jitterAim, clamp } from './ai_util.js';

const lvm = (h) => 1 + 0.1 * ((h.lvl || 1) - 1);

// ---- kit access: v0.5 `team.kit.slots` (SKILLS lane), v0.4 `team.sk.slots` as a fallback
export const slotsOf = (team) => (team.kit && team.kit.slots) || (team.sk && team.sk.slots) || [];
export function skillOf(team, id, h) {
  const s0 = SKILLS[id]; if (!s0) return null;
  try { const f = perks.modSkill || perks.skillFor || perks.effective; const s = f ? f(team, s0, h) : null; return s || s0; } catch (e) { return s0; }
}
const cdOf = (team, id) => (team.cd && team.cd[id]) || 0;
export const kitSummary = (team) => slotsOf(team).map((id, i) => (id ? id + ((team.kit && team.kit.lv && team.kit.lv[id]) ? team.kit.lv[id] : '') : '-')).join(',');

// ------------------------------------------------------------------------------------------------ sensing
// Only what a human could see: entities within the hero's sight radius. Allies = every friendly (own followers, other heroes, militia, their servants).
export function sense(st, ai, h) {
  const sight = ai.P.sight;
  const S = { t: st.t, foes: [], threats: [], allies: [], heroes: [], sites: [], sight, cx: 0, cz: 0, n: 0 };
  for (const e of st.ents) {
    if (!e.alive || e === h || e.dead) continue;
    const d = Math.hypot(e.x - h.x, e.z - h.z);
    if (d > sight + 10) continue;
    if (!hostile(h.team, e.team)) { if (e.kind === 'hero') S.heroes.push(e); else if (e.kind === 'unit') S.allies.push(e); continue; }
    if (e.hid > st.t && d > 5) continue;
    if (d > sight) continue;
    if (ai.ignore[e.id] > st.t && e.tgt !== h.id) continue;
    S.foes.push({ e, d });
  }
  S.foes.sort((a, b) => a.d - b.d);
  let cx = 0, cz = 0;
  for (const f of S.foes) {
    const e = f.e, reach = Math.min(e.aggro || 10, 16) + 4;
    const helps = e.tgt && (e.tgt === h.id || S.allies.some((a) => a.id === e.tgt) || S.heroes.some((a) => a.id === e.tgt));
    if (helps || f.d < reach) { f.threat = true; S.threats.push(f); cx += e.x; cz += e.z; }
  }
  if (S.threats.length) { S.cx = cx / S.threats.length; S.cz = cz / S.threats.length; S.n = S.threats.length; }
  for (const b of st.blds) { // demon structures (gates...) the hero can see
    if (!b.alive && b.hp <= 0) continue;
    if (!hostile(h.team, b.team)) continue;
    const d = Math.hypot(b.x - h.x, b.z - h.z);
    if (d < sight + 8) S.sites.push({ e: b, d });
  }
  return S;
}

// ------------------------------------------------------------------------------------------------ fight evaluation (Lanchester-ish)
export function skillDmgEst(s, h) {
  if (!s) return 0;
  let d = s.dmg || 0;
  if (s.dps) d = s.dps * Math.min(s.dur || 4, 5);
  if (s.land) d += s.land.dmg;
  if (s.type === 'fan') d = (s.dmg || 20) * (s.n || 5) * 0.5;
  if (s.type === 'summon') d = 22 * (s.n || 2) * Math.min(1, (s.dur || 20) / (s.cd || 20));
  if (s.type === 'buff' && s.dmg > 1) d = 25 * (s.dmg - 1) * 3;
  return d * lvm(h) * (COMBAT.skillDmg || 1);
}
export function heroDps(st, team, h) {
  const hit = h.atk * (1 + (h.crit || 0) * ((COMBAT.critMul || 2) - 1));
  let dps = hit / Math.max(0.3, (h.cd || 1) / (h.aspd || 1)), sk = 0;
  for (const id of slotsOf(team)) { const s = id && SKILLS[id]; if (s) sk += skillDmgEst(s, h) / Math.max(3, s.cd || 8); }
  return dps + sk * 0.6 * (1 + (h.skDmg || 0) / 100);
}
export const heroEhp = (h, potions = 0) => {
  const abs = clamp((h.armor || 0) / 100, 0, 0.75);
  return (h.hp + potions * h.maxHp * 0.4) / (1 - abs * 0.7);
};
export const foeDps = (e) => (e.atk || 5) / Math.max(0.4, e.cd || 1) * (e.elite ? 1.15 : 1);

// Ratio > 1: the group is expected to win with that much margin (time-to-die / time-to-kill). Counts allied heroes and servants within 25 m.
export function fightRatio(st, ai, team, h, foes, S) {
  let fHp = 0, fDps = 0;
  for (const f of foes) { const e = f.e || f; fHp += e.hp * (e.shield ? 1.3 : 1); fDps += foeDps(e); }
  if (fHp <= 0) return 99;
  let myDps = heroDps(st, team, h), myHp = heroEhp(h, ai.pots || 0);
  if (S) {
    for (const a of S.allies) if (d2(a, h) < 25) { myDps += (a.atk || 4) / Math.max(0.4, a.cd || 1) * 0.7; myHp += a.hp * 0.5; }
    for (const a of S.heroes) if (d2(a, h) < 25) { const t = st.teams[a.team]; myDps += t ? heroDps(st, t, a) * 0.8 : 10; myHp += a.hp * 0.8; }
  }
  const ttk = fHp / Math.max(1, myDps), ttd = myHp / Math.max(1, fDps * 0.8);
  return ttd / ttk;
}

// ------------------------------------------------------------------------------------------------ targeting
// ctx: { leash:{x,z,r}|null (stay near the anchor), focus:(e)=>bool|null (the goal's foes: engaged at any distance), sites: bool (gates are fair game) }
export function chooseTarget(st, ai, h, S, ctx) {
  let best = null, bs = 1e9;
  const cur = ai.tgt;
  const L = ctx.leash;
  for (const f of S.foes) {
    const e = f.e;
    if (!f.threat && !(ctx.focus && ctx.focus(e))) continue;
    if (L && !(ctx.focus && ctx.focus(e)) && Math.hypot(e.x - L.x, e.z - L.z) > L.r) continue;
    let s = f.d;
    if (e.ranged) s -= 3;
    if (e.tgt === h.id) s -= 4;
    if (e.hp < e.maxHp * 0.25) s -= 3;
    if (e.heals) s -= 4;
    if (e.boss) s += 2;
    if (cur && e.id === cur.id) s -= 4; // sticky
    if (s < bs) { bs = s; best = e; }
  }
  if (!best && ctx.sites) {
    for (const f of S.sites) { if (f.d < bs && (ctx.siteOk ? ctx.siteOk(f.e) : true)) { bs = f.d; best = f.e; } }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ danger (telegraphs, projectiles, ground)
// Returns { x, z, urgency, kind, left, key } of the thing to get away from, or null. Reads only what a player sees (ground rings, projectiles).
export function dangerAt(st, h) {
  let best = null;
  for (const tm of st.timers) {
    if (tm.type !== 'blast' || !hostile(h.team, tm.team) || !(tm.dmg > 0)) continue;
    const left = tm.t - st.t;
    if (left > 1.4 || left < 0.12) continue;
    const d = Math.hypot(h.x - tm.x, h.z - tm.z);
    if (d < tm.r + 1.2 + h.r) { const u = tm.dmg / h.maxHp + (1.4 - left); if (!best || u > best.urgency) best = { x: tm.x, z: tm.z, r: tm.r + 2.5, urgency: u, kind: 'blast', left, key: 'b' + tm.src + ':' + tm.t }; }
  }
  for (const z of st.zones) {
    if (!hostile(h.team, z.team) || !(z.dps > 0) || st.t >= z.until) continue;
    const d = Math.hypot(h.x - z.x, h.z - z.z);
    if (d < z.r + h.r + 0.5) { const u = 0.35 + z.dps / h.maxHp; if (!best || u > best.urgency) best = { x: z.x, z: z.z, r: z.r + 2, urgency: u, kind: 'zone', left: 9, key: 'z' + Math.round(z.x) + ':' + Math.round(z.z) }; }
  }
  for (const p of st.projs) {
    if (!hostile(h.team, p.team) || !(p.dmg > 0) || p.tgt) continue; // homing shots cannot be sidestepped
    const dx = h.x - p.x, dz = h.z - p.z, sp = Math.hypot(p.vx, p.vz) || 1;
    const along = (dx * p.vx + dz * p.vz) / sp;
    if (along < 0 || along > sp * 0.6) continue;
    const side = Math.abs(-dx * p.vz + dz * p.vx) / sp;
    if (side < p.r + h.r + 0.4 && p.dmg > h.maxHp * 0.06) { const u = p.dmg / h.maxHp; if (!best || u > best.urgency) best = { x: p.x, z: p.z, urgency: u, kind: 'proj', vx: p.vx, vz: p.vz, left: along / sp, key: 'p' + p.id }; }
  }
  return best;
}
// unit movement vector that gets out of a danger: sideways from projectiles, radially out of rings
export function evadeVec(h, dg) {
  if (dg.kind === 'proj') {
    const sp = Math.hypot(dg.vx, dg.vz) || 1, nx = -dg.vz / sp, nz = dg.vx / sp;
    return ((h.x - dg.x) * nx + (h.z - dg.z) * nz) >= 0 ? [nx, nz] : [-nx, -nz];
  }
  let dx = h.x - dg.x, dz = h.z - dg.z, l = Math.hypot(dx, dz);
  if (l < 0.1) { dx = Math.cos(h.face || 0); dz = Math.sin(h.face || 0); l = 1; }
  return [dx / l, dz / l];
}

// ------------------------------------------------------------------------------------------------ skills
const countIn = (S, x, z, r) => { let n = 0; for (const f of S.foes) if (Math.hypot(f.e.x - x, f.e.z - z) < r + f.e.r) n++; return n; };
export function leadPoint(e, from, projSpd, dt, extra = 0) {
  const vx = (e.x - (e.ox ?? e.x)) / dt, vz = (e.z - (e.oz ?? e.z)) / dt;
  const d = Math.hypot(e.x - from.x, e.z - from.z), t = (projSpd ? d / projSpd : 0) + extra;
  return [e.x + vx * t, e.z + vz * t];
}
const isBig = (e) => e.boss || e.elite || e.maxHp > 700;

// Choose one skill slot to cast now. Returns { slot, ax, az, hold, id } or null. Called at think time (every ~0.35 s).
export function pickSkill(st, ai, team, h, tgt, S, dt, ctx) {
  if (!tgt || h.cast > 0.1) return null;
  const P = ai.P, hpPct = h.hp / h.maxHp, foes = S.foes, slots = slotsOf(team);
  const n12 = countIn(S, h.x, h.z, 12);
  const dist = Math.hypot(tgt.x - h.x, tgt.z - h.z), big = isBig(tgt), site = tgt.kind === 'bld';
  const order = [3, 0, 1, 2];
  for (const slot of order) {
    const id = slots[slot];
    if (!id || cdOf(team, id) > 0 || !SKILLS[id]) continue;
    const s = skillOf(team, id, h);
    const kind = aimKind(s), ult = slot === 3;
    const hold = s.hold ? s.hold.max * (big ? 0.85 : 0.5) : 0;
    const projSpd = s.spd || 0, cdLong = (s.cd || 8) >= 12;
    const need = ult ? (big || site ? 1 : 3) : cdLong && !big ? 2 : 1;
    let aim = null;
    switch (s.type) {
      case 'line': case 'bolt': {
        const len = s.len || s.range || 12;
        if (dist < len - 1.5 && dist > 1 && (ult ? countIn(S, tgt.x, tgt.z, 4) >= need || big || site : true)) aim = leadPoint(tgt, h, projSpd, dt);
        break;
      }
      case 'drain': case 'fan': case 'strike': {
        const len = s.type === 'fan' ? (s.range || 10) - 1 : s.len || s.range || 8;
        if (dist < len - 0.8 && (!ult || countIn(S, h.x, h.z, len) >= need || big || site)) aim = [tgt.x, tgt.z];
        break;
      }
      case 'aoe': {
        if (s.self || kind === 'self') {
          const r = (s.radius || 5) * (hold ? 1 + ((s.hold.scale && s.hold.scale.radius || 1) - 1) * 0.5 : 1);
          const c = countIn(S, h.x, h.z, r - 0.6);
          if ((c >= need || site && dist < r) && !(s.lowHp && hpPct > 0.6)) aim = [tgt.x, tgt.z];
        } else if (dist < (s.range || 14) + (s.radius || 3) * 0.5) {
          let bc = null, bn = 0;
          for (const f of foes) {
            if (f.d > (s.range || 14) + 1) continue;
            const p = leadPoint(f.e, h, 0, dt, s.delay || 0), c = countIn(S, p[0], p[1], s.radius || 4);
            if (c > bn) { bn = c; bc = p; }
          }
          if (bc && bn >= need) aim = bc; else if (site && dist < (s.range || 14)) aim = [tgt.x, tgt.z];
        }
        break;
      }
      case 'zone': {
        if (dist < (s.range || 12) + 1 && (countIn(S, tgt.x, tgt.z, s.radius || 4) >= 2 || big || dist < 6 || !cdLong)) aim = leadPoint(tgt, h, 0, dt, 0.4);
        break;
      }
      case 'debuff': { if (dist < (s.range || 14) && (big || n12 >= 3)) aim = [tgt.x, tgt.z]; break; }
      case 'summon': {
        if (s.at === 'cursor' || s.aim === 'ground') { if (dist < (s.range || 12) + 6 && dist > 3) aim = [tgt.x, tgt.z]; }
        else if (dist < 16) aim = [tgt.x, tgt.z];
        break;
      }
      case 'buff': {
        if (s.healPct && !(s.dmg > 1)) { if (hpPct < 0.65 && S.threats.length) aim = [h.x, h.z]; break; }
        if (ctx.fightOk && dist < 14 && (big || foes.length >= 2 || ctx.ratio < 2.5)) aim = [h.x, h.z];
        break;
      }
      case 'shield': case 'veil': case 'smoke': case 'martyr': {
        if (hpPct < 0.5 && S.threats.length && dist < 12 && !(s.dodge && !ctx.fleeing && hpPct > 0.35)) aim = s.type === 'smoke' ? [h.x + (h.x - tgt.x) * 0.3, h.z + (h.z - tgt.z) * 0.3] : [tgt.x, tgt.z];
        else if (s.type === 'shield' && big && ctx.fightOk && dist < 12 && ctx.ratio < 2.2) aim = [tgt.x, tgt.z];
        break;
      }
      case 'poison': { if (ctx.fightOk && dist < 9) aim = [tgt.x, tgt.z]; break; }
      case 'dash': {
        if (s.dodge && !(s.dmg || s.land)) break; // pure dodges are used by the evade logic
        if (ctx.fightOk && dist > 6.5 && dist < (s.dist || 10) + 3 && ctx.ratio > 1.3) aim = [tgt.x, tgt.z];
        break;
      }
      case 'blink': { if (ctx.fightOk && dist > 3.5 && dist < (s.range || 12) - 0.5) aim = [tgt.x, tgt.z]; break; }
      default: { // unknown skill kind (SKILLS lane added a type): cast it at the target when in range
        const r = s.range || s.len || (s.radius ? s.radius + 3 : 10);
        if (dist < r - 0.5 && !s.dodge) aim = kind === 'self' ? [h.x, h.z] : [tgt.x, tgt.z];
      }
    }
    if (!aim) continue;
    const [ax, az] = jitterAim(ai.rng, h, aim[0], aim[1], P.aimErr);
    return { slot, ax, az, hold, id };
  }
  return null;
}

// a ready skill flagged as a dodge (veil / charge / flicker), slot or -1
export function dodgeSlot(team) {
  const slots = slotsOf(team);
  for (let slot = 0; slot < slots.length; slot++) { const id = slots[slot]; if (id && SKILLS[id] && SKILLS[id].dodge && cdOf(team, id) <= 0) return slot; }
  return -1;
}

// ------------------------------------------------------------------------------------------------ per-step fight controller
// Writes into `inp` the aim, the attack, the approach/kite movement and a pending skill cast chosen at think time. Returns true when it handled the target.
export function fightStep(st, ai, team, h, inp, dt) {
  const S = ai.S, tgt = ai.tgt;
  if (!tgt || tgt.dead || tgt.alive === false || !(tgt.hp > 0)) { ai.tgt = null; return false; }
  const P = ai.P;
  const dist = Math.hypot(tgt.x - h.x, tgt.z - h.z), g = dist - h.r - (tgt.r || 1);
  const reach = h.range, ranged = h.ranged;
  const lead = tgt.kind === 'bld' ? [tgt.x, tgt.z] : leadPoint(tgt, h, ranged && h.proj ? h.proj.spd : 0, dt);
  let [ax, az] = jitterAim(ai.rng, h, lead[0], lead[1], P.aimErr);
  let mx = 0, mz = 0, moving = false;

  // holding a charge-and-release skill: stand still, fire when the hold is long enough (human-like)
  const hs = ai.holdSkill;
  if (hs) {
    hs.t += dt;
    if (h.stun > 0 || h.hp < hs.hp0 - h.maxHp * 0.2) ai.holdSkill = null;
    else if (hs.t >= hs.need) { inp.casts.push(hs.slot); (inp.hold || (inp.hold = {}))[hs.slot] = hs.need; inp.aimX = hs.ax; inp.aimZ = hs.az; ai.holdSkill = null; return true; }
    else { inp.aimX = hs.ax; inp.aimZ = hs.az; return true; }
  }

  // kiting for ranged heroes: keep away from the nearest melee threat
  let near = null;
  for (const f of S.threats) if (!near || f.d < near.d) near = f;
  if (ranged && near && near.d < Math.max(4.5, reach * 0.4) && !(near.e.ranged && near.d > 6) && h.spd >= (near.e.spd || 5) * 0.95 && !ai.noKite) {
    const dx = h.x - near.e.x, dz = h.z - near.e.z, l = Math.hypot(dx, dz) || 1;
    mx = dx / l; mz = dz / l; moving = true;
    if (st.world.walkable && !st.world.walkable(h.x + mx * 3, h.z + mz * 3)) { mx = -dz / l; mz = dx / l; }
  } else if (g > reach * (ranged ? 0.95 : 0.85)) {
    if (!h.dest || Math.hypot(h.dest.x - tgt.x, h.dest.z - tgt.z) > 3) ai.cmds.push({ t: 'goto', x: tgt.x, z: tgt.z, r: Math.max(1, reach * 0.6) });
  } else if (h.dest) ai.cmds.push({ t: 'stop' });

  // evade telegraphs / projectiles / ground fire
  const dg = ai.danger;
  if (dg && ai.dodgeOk) {
    const [ex, ez] = evadeVec(h, dg);
    mx = ex; mz = ez; moving = true;
    if (dg.left < 0.9 && (dg.urgency > 0.18 || dg.kind === 'proj')) {
      if ((team.dodgeCd || 0) <= 0) { ai.cmds.push({ t: 'dodge', dx: ex, dz: ez }); ai.stat.dodges++; }
      else { const ds = dodgeSlot(team); if (ds >= 0) { inp.casts.push(ds); inp.aimX = h.x + ex * 8; inp.aimZ = h.z + ez * 8; inp.atk = false; return true; } }
    }
  }
  if (moving) { inp.mx = mx; inp.mz = mz; }
  inp.aimX = ax; inp.aimZ = az;
  inp.atk = g <= reach + 0.6;

  // the skill picked at think time
  const q = ai.castQ;
  if (q) {
    ai.castQ = null;
    if (q.hold > 0.25) { ai.holdSkill = { slot: q.slot, need: q.hold * (0.8 + ai.rng() * 0.2), t: 0, ax: q.ax, az: q.az, hp0: h.hp }; inp.mx = 0; inp.mz = 0; inp.atk = false; }
    else {
      inp.casts.push(q.slot); inp.aimX = q.ax; inp.aimZ = q.az;
      if (Math.abs(angDiff(Math.atan2(az - h.z, ax - h.x), Math.atan2(q.az - h.z, q.ax - h.x))) > 0.5) inp.atk = false;
    }
  }
  return true;
}
