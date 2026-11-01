// v0.5 servant spells: the sim AI that auto-casts SERVANT_SPELLS (units_data.js) with cooldowns, plus the lingering effects (frost fields, snare traps,
// delayed volleys) in st.sv. Sim-side only (no DOM/Three), deterministic (st.rng). A servant evaluates its spells every ~0.25 s and casts at most one.
// Visuals use the existing events (blast / buff / line / heal / dash) plus 'svcast' {id, team, spell, name, x, z, r, color} (floating spell name + ring).
import * as D from './data.js';
import { simApi, hostile, damage, obbDist } from './sim.js';

const SP = D.SERVANT_SPELLS;
const ev = (st, e) => st.events.push(e);
const live = (o) => !!o && o.alive && !o.dead && o.hp > 0;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const jitter = (st, v) => v * (0.92 + st.rng() * 0.16);

export function svState(st) { return st.sv || (st.sv = { zones: [], pend: [] }); }

// ---------------------------------------------------------------------------------------------------- helpers
function scan(st, u, R) {
  const foes = [], friends = [];
  for (const o of st.ents) {
    if (o === u || !live(o) || o.kind === 'bld') continue;
    const dx = o.x - u.x, dz = o.z - u.z;
    if (dx > R || dx < -R || dz > R || dz < -R) continue;
    const d = Math.hypot(dx, dz);
    if (d > R) continue;
    if (hostile(u.team, o.team)) { if (o.hid > st.t && d > 5) continue; foes.push({ o, d }); }
    else if (o.kind === 'unit' || o.kind === 'hero') friends.push({ o, d });
  }
  foes.sort((a, b) => a.d - b.d);
  return { foes, friends };
}
function addShield(t, amt, dur, st) {
  const cur = t.shield && st.t < t.shield.until && t.shield.amt > 0 ? t.shield.amt : 0;
  t.shield = { amt: Math.min(t.maxHp * 0.8, cur + amt), max: amt, until: st.t + dur };
}
function slow(st, t, mul, dur) {
  if (!t.alive) return;
  if (t.boss) mul = Math.max(mul, 0.85);
  if (!(t.slowUntil > st.t && t.slowMul < mul)) { t.slowUntil = st.t + dur; t.slowMul = mul; }
}
// damage every hostile thing within r of (x, z); o: { stun, slowMul, slowT, dtype, bldMul }
function hitArea(st, u, x, z, r, dmg, o = {}) {
  let n = 0;
  const dopt = { noCrit: true, dtype: o.dtype || 'physical', stun: o.stun || 0, bldMul: o.bldMul || 0.5 };
  for (const e of st.ents) {
    if (!live(e) || e.kind === 'bld' || !hostile(u.team, e.team)) continue;
    if (e.hid > st.t && Math.hypot(e.x - x, e.z - z) > 5) continue;
    if (Math.hypot(e.x - x, e.z - z) > r + e.r * 0.7) continue;
    damage(st, u, e, dmg, dopt); n++;
    if (o.slowMul && live(e)) slow(st, e, o.slowMul, o.slowT || 2);
  }
  for (const b of st.blds) {
    if (b.hp <= 0 || !hostile(u.team, b.team) || b.trap || obbDist(x, z, b) > r) continue;
    damage(st, u, b, dmg, dopt); n++;
  }
  return n;
}
function announce(st, u, s, d, x = u.x, z = u.z, r = 2.5) {
  u.swing = 0.45;
  ev(st, { type: 'svcast', id: u.id, team: u.team, spell: s.id, name: d.name, x, z, r, color: d.color });
}
const nearestFoe = (C) => (C.foes.length ? C.foes[0] : null);
// the foe with the most enemies within r of it (inside `range` of u), or null
function bestCluster(C, r, range) {
  let best = null, bs = 0;
  for (const f of C.foes) {
    if (f.d > range) break;
    let n = 0;
    for (const g of C.foes) if (Math.hypot(g.o.x - f.o.x, g.o.z - f.o.z) <= r) n++;
    const sc = n + (f.o.kind === 'hero' ? 0 : 0) - f.d * 0.01;
    if (sc > bs) { bs = sc; best = f; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------- cast handlers: (st, u, s, d, C) -> true when cast
const CAST = {
  taunt(st, u, s, d, C) {
    const near = C.foes.filter((f) => f.d <= d.r + f.o.r);
    if (!near.length) return false;
    const onOthers = near.some((f) => f.o.tgt && f.o.tgt !== u.id);
    if (!onOthers && near.length < 2) return false;
    for (const f of near) if (f.o.kind === 'mon' || f.o.kind === 'unit') { f.o.tgt = u.id; f.o.path = null; }
    addShield(u, u.maxHp * d.shield, d.dur, st);
    ev(st, { type: 'buff', x: u.x, z: u.z, r: d.r, color: d.color });
    announce(st, u, s, d, u.x, u.z, d.r * 0.6);
    return true;
  },
  dash(st, u, s, d, C) {
    const near = nearestFoe(C);
    if (!near || near.d < d.min * 0.6) return false;
    let pick = null;
    for (const f of C.foes) {
      if (f.d < d.min || f.d > d.max) continue;
      if (!pick) pick = f;
      if (f.o.tgt && f.o.tgt !== u.id) { pick = f; break; } // rescue whoever is being chased
    }
    if (!pick) return false;
    const o = pick.o, back = u.r + o.r + 0.5, k = Math.max(0, pick.d - back) / pick.d;
    const tx = u.x + (o.x - u.x) * k, tz = u.z + (o.z - u.z) * k, len = Math.hypot(tx - u.x, tz - u.z);
    u.sv.busy = { kind: 'dash', t: 0, T: Math.max(0.2, Math.min(0.42, len / 34)), sx: u.x, sz: u.z, tx, tz, sp: s.id, tgt: o.id };
    u.face = Math.atan2(o.z - u.z, o.x - u.x);
    ev(st, { type: 'dash', x: u.x, z: u.z });
    announce(st, u, s, d, u.x, u.z, 2);
    return true;
  },
  nova(st, u, s, d, C) {
    const near = C.foes.filter((f) => f.d <= d.r + f.o.r * 0.7);
    if (!near.length) return false;
    if (near.length < 2 && u.hp > u.maxHp * 0.7 && u.role !== 'tank' && near[0].d > d.r * 0.6) return false; // a lone far enemy is not worth it
    hitArea(st, u, u.x, u.z, d.r, d.dmg, { stun: d.stun, slowMul: d.slow, slowT: d.slowT, dtype: u.dtype === 'fire' ? 'fire' : 'physical' });
    ev(st, { type: 'blast', x: u.x, z: u.z, r: d.r, color: d.color });
    announce(st, u, s, d, u.x, u.z, d.r * 0.5);
    return true;
  },
  heal(st, u, s, d, C) {
    const group = [{ o: u, d: 0 }, ...C.friends.filter((f) => f.d <= d.r)];
    let missing = 0, hurt = 0, worst = 1;
    for (const f of group) {
      const fr = f.o.hp / f.o.maxHp;
      if (fr < d.below) { hurt++; missing += f.o.maxHp - f.o.hp; }
      worst = Math.min(worst, fr);
    }
    if (!hurt || (missing < d.amt * 0.5 && worst > 0.5)) return false;
    for (const f of group) {
      const o = f.o;
      if (o.hp >= o.maxHp) continue;
      const amt = Math.min(d.amt, o.maxHp - o.hp);
      o.hp += amt;
      ev(st, { type: 'heal', x: o.x, z: o.z, amt, team: u.team, from: u.id });
    }
    ev(st, { type: 'buff', x: u.x, z: u.z, r: d.r, color: d.color });
    announce(st, u, s, d, u.x, u.z, d.r * 0.5);
    return true;
  },
  ward(st, u, s, d, C) {
    let best = null, bs = 9;
    for (const f of [{ o: u, d: 0 }, ...C.friends]) {
      const o = f.o;
      if (f.d > d.range || (o.shield && st.t < o.shield.until && o.shield.amt > o.maxHp * 0.15)) continue;
      const fr = o.hp / o.maxHp, pressed = st.t - o.lastHit < 2.5;
      if (fr > 0.8 && !pressed) continue;
      const sc = fr - (pressed ? 0.3 : 0) - (o.kind === 'hero' ? 0.1 : 0);
      if (sc < bs) { bs = sc; best = o; }
    }
    if (!best) return false;
    addShield(best, d.amt, d.dur, st);
    ev(st, { type: 'buff', x: best.x, z: best.z, r: 2.2, color: d.color });
    ev(st, { type: 'line', x: u.x, z: u.z, ang: Math.atan2(best.z - u.z, best.x - u.x), len: Math.max(1, dist(u, best)), w: 0.5, color: d.color });
    announce(st, u, s, d, best.x, best.z, 2);
    return true;
  },
  haste(st, u, s, d, C) {
    if (!C.foes.length || C.foes[0].d > 16) return false;
    const group = [u, ...C.friends.filter((f) => f.d <= d.r).map((f) => f.o)];
    if (group.length < 2) return false;
    for (const o of group) {
      if (o.buff && st.t < o.buff.until && (o.buff.atkSpd || 1) >= d.mul) continue;
      o.buff = { until: st.t + d.dur, dmg: 1.1, atkSpd: d.mul, spd: d.mul };
    }
    ev(st, { type: 'buff', x: u.x, z: u.z, r: d.r, color: d.color });
    announce(st, u, s, d, u.x, u.z, d.r * 0.5);
    return true;
  },
  volley(st, u, s, d, C) {
    const f = bestCluster(C, d.r, d.range);
    if (!f) return false;
    const o = f.o;
    svState(st).pend.push({ kind: 'blast', t: st.t + d.delay, x: o.x, z: o.z, r: d.r, dmg: d.dmg, team: u.team, src: u.id, color: d.color });
    ev(st, { type: 'line', x: u.x, z: u.z, ang: Math.atan2(o.z - u.z, o.x - u.x), len: f.d, w: 0.4, color: d.color });
    ev(st, { type: 'buff', x: o.x, z: o.z, r: d.r, color: d.color });
    u.face = Math.atan2(o.z - u.z, o.x - u.x);
    announce(st, u, s, d, o.x, o.z, d.r * 0.5);
    return true;
  },
  field(st, u, s, d, C) {
    const f = bestCluster(C, d.r, d.range);
    if (!f) return false;
    svState(st).zones.push({ kind: 'field', x: f.o.x, z: f.o.z, r: d.r, until: st.t + d.dur + 0.1, next: st.t + 0.15, every: d.dur / d.pulses, dmg: d.dmg, slow: d.slow, team: u.team, src: u.id, color: d.color });
    ev(st, { type: 'buff', x: f.o.x, z: f.o.z, r: d.r, color: d.color });
    announce(st, u, s, d, f.o.x, f.o.z, d.r * 0.6);
    return true;
  },
  trap(st, u, s, d, C) {
    const f = nearestFoe(C);
    if (!f || f.d > d.range || f.d < 4.5) return false;
    const o = f.o, k = Math.min(1, 3 / f.d);
    const x = o.x + (u.x - o.x) * k, z = o.z + (u.z - o.z) * k;
    const zs = svState(st).zones;
    if (zs.filter((q) => q.kind === 'trap' && q.src === u.id).length >= 2) zs.splice(zs.findIndex((q) => q.kind === 'trap' && q.src === u.id), 1);
    zs.push({ kind: 'trap', x, z, r: d.r, until: st.t + d.life, glow: st.t + 1.2, dmg: d.dmg, slow: d.slow, slowT: d.slowT, team: u.team, src: u.id, color: d.color });
    ev(st, { type: 'buff', x, z, r: d.r, color: d.color });
    announce(st, u, s, d, x, z, d.r);
    return true;
  },
  skin(st, u, s, d, C) {
    const near = C.foes.filter((f) => f.d <= 8);
    if (!near.length || (near.length < 2 && u.hp > u.maxHp * 0.85)) return false;
    addShield(u, u.maxHp * d.shield, d.dur, st);
    ev(st, { type: 'buff', x: u.x, z: u.z, r: 2.6, color: d.color });
    announce(st, u, s, d, u.x, u.z, 2.4);
    return true;
  },
  raise(st, u, s, d, C) {
    const f = nearestFoe(C);
    if (!f || f.d > 20) return false;
    let mine = 0;
    for (const o of st.ents) if (o.alive && o.owner === u.id && o.summoned) mine++;
    if (mine > d.max - d.n) return false;
    const a0 = Math.atan2(f.o.z - u.z, f.o.x - u.x);
    for (let i = 0; i < d.n; i++) {
      const a = a0 + (i - (d.n - 1) / 2) * 0.8;
      const m = simApi.spawnUnit(st, d.unit, u.team, u.x + Math.cos(a) * 2.2, u.z + Math.sin(a) * 2.2, { temp: true, life: d.dur });
      if (!m) continue;
      m.owner = u.id; m.summoned = true; m.mode = 'amove'; m.dest = { x: f.o.x, z: f.o.z }; m.tgt = f.o.id;
      ev(st, { type: 'summon', x: m.x, z: m.z, color: d.color });
    }
    announce(st, u, s, d, u.x, u.z, 2.6);
    return true;
  },
  whirl(st, u, s, d, C) {
    const near = C.foes.filter((f) => f.d <= d.r * 1.15 + f.o.r * 0.5);
    if (!near.length) return false;
    u.sv.busy = { kind: 'whirl', t: 0, T: d.dur, n: 0, sp: s.id, face0: u.face };
    announce(st, u, s, d, u.x, u.z, d.r * 0.5);
    return true;
  },
};

// ---------------------------------------------------------------------------------------------------- busy states (dash, whirl)
function busyTick(st, u, dt) {
  const b = u.sv.busy, s = SP[b.sp];
  b.t += dt;
  if (b.kind === 'dash') {
    const k0 = Math.min(1, (b.t - dt) / b.T), k1 = Math.min(1, b.t / b.T);
    const x0 = b.sx + (b.tx - b.sx) * k0, z0 = b.sz + (b.tz - b.sz) * k0, x1 = b.sx + (b.tx - b.sx) * k1, z1 = b.sz + (b.tz - b.sz) * k1;
    simApi.moveBy(st, u, x1 - x0, z1 - z0);
    u.moving = true; u.walkPh += 40 * dt;
    if (b.t >= b.T) {
      u.sv.busy = null;
      hitArea(st, u, u.x, u.z, s.r, s.dmg, { stun: s.stun });
      ev(st, { type: 'blast', x: u.x, z: u.z, r: s.r, color: s.color });
      const o = st.byId.get(b.tgt);
      if (o && live(o)) u.tgt = o.id;
    }
  } else if (b.kind === 'whirl') {
    u.face += dt * 16; u.swing = 0.3;
    const want = Math.floor((b.t / b.T) * s.pulses + 0.0001);
    while (b.n < Math.min(want + 1, s.pulses) && b.t >= (b.n / s.pulses) * b.T) {
      b.n++;
      hitArea(st, u, u.x, u.z, s.r, s.dmg);
      ev(st, { type: 'blast', x: u.x, z: u.z, r: s.r * 0.8, color: s.color });
    }
    // drift toward the nearest enemy while spinning
    let bd = 1e9, bo = null;
    for (const o of st.ents) { if (!live(o) || o.kind === 'bld' || !hostile(u.team, o.team)) continue; const d = dist(u, o); if (d < bd && d < 12) { bd = d; bo = o; } }
    if (bo && bd > 1.8) { const sp = u.spd * 0.55 * dt; simApi.moveBy(st, u, ((bo.x - u.x) / bd) * sp, ((bo.z - u.z) / bd) * sp); u.moving = true; u.walkPh += 12 * dt; }
    if (b.t >= b.T) { u.sv.busy = null; u.face = b.face0; }
  }
}

// ---------------------------------------------------------------------------------------------------- per-unit tick (called from servants.tick)
export function tick(st, u, dt) {
  const sv = u.sv;
  if (!sv.spells || !sv.spells.length) return false;
  if (sv.busy) { busyTick(st, u, dt); return true; }
  for (const s of sv.spells) if (s.cd > 0) s.cd -= dt;
  sv.gcd -= dt; sv.spT -= dt;
  if (sv.spT > 0 || sv.gcd > 0 || u.stun > 0) return false;
  sv.spT = 0.22 + st.rng() * 0.08;
  let ready = false;
  for (const s of sv.spells) if (s.cd <= 0) { ready = true; break; }
  if (!ready) return false;
  const C = scan(st, u, 20);
  if (!C.foes.length && !C.friends.length && u.hp >= u.maxHp) return false;
  for (const s of sv.spells) {
    if (s.cd > 0) continue;
    const d = SP[s.id];
    if (!d || !CAST[d.kind]) continue;
    if (CAST[d.kind](st, u, s, d, C)) { s.cd = jitter(st, d.cd); sv.gcd = 0.9; return !!sv.busy; }
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------- lingering effects (called once per step from recruits.update)
export function update(st, dt) {
  const S = st.sv;
  if (!S) return;
  for (let i = S.pend.length - 1; i >= 0; i--) {
    const p = S.pend[i];
    if (st.t < p.t) continue;
    S.pend.splice(i, 1);
    const src = st.byId.get(p.src) || { team: p.team, id: p.src, kind: 'timer' };
    hitArea(st, src, p.x, p.z, p.r, p.dmg);
    ev(st, { type: 'blast', x: p.x, z: p.z, r: p.r, color: p.color });
  }
  for (let i = S.zones.length - 1; i >= 0; i--) {
    const z = S.zones[i];
    if (st.t >= z.until) { S.zones.splice(i, 1); continue; }
    const src = st.byId.get(z.src) || { team: z.team, id: z.src, kind: 'timer' };
    if (z.kind === 'field') {
      if (st.t >= z.next) {
        z.next += z.every;
        hitArea(st, src, z.x, z.z, z.r, z.dmg, { slowMul: z.slow, slowT: 1.2, dtype: 'physical' });
        ev(st, { type: 'buff', x: z.x, z: z.z, r: z.r * 0.8, color: z.color });
      }
    } else if (z.kind === 'trap') {
      if (st.t >= z.glow) { z.glow = st.t + 2.2; ev(st, { type: 'buff', x: z.x, z: z.z, r: 1.0, color: z.color }); }
      let hit = false;
      for (const e of st.ents) {
        if (!live(e) || e.kind === 'bld' || !hostile(z.team, e.team) || e.hid > st.t) continue;
        if (Math.hypot(e.x - z.x, e.z - z.z) <= z.r + e.r * 0.5) { hit = true; break; }
      }
      if (hit) {
        S.zones.splice(i, 1);
        hitArea(st, src, z.x, z.z, z.r + 0.6, z.dmg, { slowMul: z.slow, slowT: z.slowT });
        ev(st, { type: 'blast', x: z.x, z: z.z, r: z.r, color: z.color });
      }
    }
  }
}
