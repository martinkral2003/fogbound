// FOGBOUND v0.5 SKILLS lane: the R ultimate (team.kit.slots[3], unlocked at hero level 5). The sim's castCharge handles `blast` ultimates itself,
// the `rain` and `storm` kinds are cast here. Charge-and-release: hold R (input.charge), release at the cursor. See kits.js for the ultimates.
import { SKILLS } from './data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const ev = (st, e) => st.events.push(e);

// the ultimate the hero charges with R, or null while R is still locked
export function ultOf(team) {
  const id = team && team.kit && team.kit.slots[3];
  const s = id && SKILLS[id];
  return s && s.ult ? s : null;
}

// Non-blast ultimates (rain, storm): called from sim.js castCharge.
export function castUlt(st, team, h, c, ax, az) {
  const ratio = clamp(h.chargeT / c.maxCharge, 0, 1);
  const d = Math.hypot(ax - h.x, az - h.z), k = d > c.range ? c.range / d : 1;
  const x = h.x + (ax - h.x) * k, z = h.z + (az - h.z) * k;
  team.chCd = c.cd * (1 - clamp(h.cdr || 0, 0, 50) / 100); h.cast = 0.6;
  h.face = Math.atan2(z - h.z, x - h.x);
  const lv = (1 + 0.05 * (h.lvl - 1)) * (h.buff && st.t < h.buff.until ? h.buff.dmg || 1 : 1) * (1 + (h.skDmg || 0) / 100);
  const R = lerp(c.minR || 4, c.maxR || 8, ratio) * (1 + (h.skRad || 0) / 100);
  const dmg = lerp(c.minDmg || 40, c.maxDmg || 100, ratio) * lv;
  const blast = (t0, bx, bz, r, dm, delay) => st.timers.push({ type: 'blast', t: t0 + delay, x: bx, z: bz, r, dmg: dm, bldMul: c.bldMul, stun: c.stun || 0, burn: c.burn || 0, team: h.team, src: h.id, dtype: c.dtype, color: c.color, born: t0, delay });
  if (c.kind === 'rain') {
    const n = Math.max(1, Math.round(c.n * (0.7 + 0.5 * ratio)));
    for (let i = 0; i < n; i++) {
      const a = st.rng() * TAU, rr = Math.sqrt(st.rng()) * R;
      blast(st.t + (i / n) * c.dur, x + Math.cos(a) * rr, z + Math.sin(a) * rr, c.hitR, dmg, c.delay || 0.8);
    }
  } else if (c.kind === 'storm') {
    const p = Math.max(1, c.pulses | 0);
    for (let i = 0; i < p; i++) blast(st.t + 0.3 + (i / p) * c.dur, x, z, R, dmg, 0.25);
  }
  ev(st, { type: 'blast', x, z, r: R, color: c.color, big: true, vis: c.id });
  team.lastCast = { id: c.id, t: st.t };
  return true;
}
