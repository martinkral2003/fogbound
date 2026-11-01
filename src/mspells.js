// v0.6 enemy casters: monsters whose MONSTERS entry has `spells: [...]` cast telegraphed spells at heroes and their allies. Sim only (no DOM/Three).
// Ground spells use the horde's telegraph queue (st.horde.pend, resolved in horde.js pendTick: they cancel if the caster dies first, so killing the mage
// in time is the counter), instant ones (chain lightning, curse, heal, summon) happen at once. Every spell has a cooldown per caster and a cast time
// during which the caster cannot attack (e.atkT). Damage scales with the monster's own attack (e.atk already holds tier / time / difficulty scaling).
import { simApi } from './sim.js';
import { MONSTERS } from './data.js';

const hyp = Math.hypot;
const ev = (st, e) => st.events.push(e);

function tele(st, e, x, z, r, dur, dmg, color, o = {}) {
  if (!st.horde || !st.horde.pend) return;
  st.horde.pend.push({ at: st.t + dur, kind: o.kind || 'spell', x, z, r, inner: 0, dmg, stun: o.stun || 0, src: e.id, bld: 0.4 });
  ev(st, { type: 'telegraph', x, z, r, inner: 0, dur, kind: o.kind || 'spell', color, src: e.id });
}
const foes = (st, e, rad) => { // heroes and their servants / militia near e (hostile to a monster)
  const out = [];
  for (const o of st.ents) { if (!o.alive || o.dead || o.team < 0 || o.hid > st.t) continue; const d = hyp(o.x - e.x, o.z - e.z) - o.r; if (d <= rad) out.push({ o, d }); }
  return out.sort((a, b) => a.d - b.d);
};

// cd: seconds between casts; range: needs a target this close; dur: cast time; run(st, e, target, list) -> true when it actually cast
export const SPELLS = {
  fireblast: { cd: 7, range: 17, dur: 1.0, run(st, e, t) { tele(st, e, t.x, t.z, 3.2, 1.0, e.atk * 2.2, 0xff6a20, { kind: 'fire' }); return true; } },
  meteors: { cd: 12, range: 19, dur: 1.3, run(st, e, t) {
    for (let i = 0; i < 4; i++) { const a = st.rng() * 6.283, d = i === 0 ? 0 : 2.5 + st.rng() * 4.5; tele(st, e, t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, 3, 1.1 + i * 0.25, e.atk * 1.8, 0xff4a10, { kind: 'meteor' }); }
    return true;
  } },
  frostnova: { cd: 9, range: 7, dur: 0.8, run(st, e) { tele(st, e, e.x, e.z, 6.5, 0.9, e.atk * 1.5, 0x8fd8ff, { kind: 'nova', stun: 0.7 }); return true; } },
  chain: { cd: 6, range: 15, dur: 0.5, run(st, e, t, list) {
    let cur = t, hit = 0; const done = new Set();
    for (let i = 0; i < 4 && cur; i++) {
      done.add(cur.id); simApi.damage(st, e, cur, e.atk * 1.45 * Math.pow(0.8, i), { stun: 0.25, dtype: 'lightning', noFall: true });
      ev(st, { type: 'blast', x: cur.x, z: cur.z, r: 1.8, color: 0xffee60 }); hit++;
      let nx = null, nd = 9; for (const q of list) if (!done.has(q.o.id) && hyp(q.o.x - cur.x, q.o.z - cur.z) < nd) { nd = hyp(q.o.x - cur.x, q.o.z - cur.z); nx = q.o; }
      cur = nx;
    }
    return hit > 0;
  } },
  curse: { cd: 10, range: 15, dur: 0.6, hero: true, run(st, e, t) { // a hero only: weaker and easier to hit for 6 s, slowed for 3 s
    t.debuff = { until: st.t + 6, take: 1.25, deal: 0.78 }; t.slowUntil = Math.max(t.slowUntil || 0, st.t + 3); t.slowMul = Math.min(t.slowMul || 1, 0.6);
    ev(st, { type: 'blast', x: t.x, z: t.z, r: 2.6, color: 0xa060ff });
    return true;
  } },
  summon: { cd: 15, range: 22, dur: 1.0, run(st, e) {
    e.sumIds = (e.sumIds || []).filter((id) => { const q = st.byId.get(id); return q && q.alive; });
    if (e.sumIds.length >= 4 || !MONSTERS.imp) return false;
    const camp = st.camps[e.camp]; if (!camp) return false;
    for (let i = 0; i < 2; i++) {
      const a = st.rng() * 6.283, m = simApi.spawnMonster(st, 'imp', Math.max(1, e.tier || 1), e.x + Math.cos(a) * 2.2, e.z + Math.sin(a) * 2.2, camp);
      if (m) { e.sumIds.push(m.id); m.tgt = e.tgt; ev(st, { type: 'summon', x: m.x, z: m.z, color: 0xff5a20 }); }
    }
    return true;
  } },
  heal: { cd: 8, range: 26, dur: 0.7, run(st, e) {
    let n = 0;
    for (const o of st.ents) if (o.alive && o.kind === 'mon' && o !== e && o.hp < o.maxHp * 0.7 && hyp(o.x - e.x, o.z - e.z) < 13 && o.base && !o.boss) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.28); ev(st, { type: 'buff', x: o.x, z: o.z, r: 2, color: 0x80e060 }); if (++n >= 4) break; }
    return n > 0;
  } },
  shadowbolt: { cd: 5, range: 19, dur: 0.6, run(st, e, t) {
    const ang = Math.atan2(t.z - e.z, t.x - e.x);
    simApi.fireProjectile(st, e, e.x + Math.cos(ang), e.z + Math.sin(ang), ang, { spd: 20, dmg: e.atk * 1.7, color: 0xb060ff, life: 1.3, r: 0.95, dtype: 'physical', rider: { slow: 0.6, slowDur: 1.8 } });
    return true;
  } },
};

let acc = 0;
export function update(st, dt) {
  acc += dt; if (acc < 0.25) return; const step = acc; acc = 0; void step;
  for (const e of st.ents) {
    if (e.kind !== 'mon' || !e.alive || !e.base || !e.spells) continue;
    if (e.stun > 0 || (e.castT || 0) > st.t) continue;
    if (!e.spT) e.spT = {};
    // pick the first spell that is ready and has a valid target (the order in `spells` is the priority order)
    let list = null;
    for (const name of e.spells) {
      const S = SPELLS[name]; if (!S) continue;
      if ((e.spT[name] || 0) > st.t) continue;
      if (!list) { list = foes(st, e, 26); if (!list.length) break; }
      const c = list.filter((q) => q.d <= S.range && (!S.hero || q.o.kind === 'hero'));
      if (!c.length && name !== 'heal' && name !== 'summon') continue;
      if ((name === 'summon' || name === 'heal') && !list.some((q) => q.d <= S.range)) continue;
      const t = c.length ? c[0].o : list[0].o;
      e.face = Math.atan2(t.z - e.z, t.x - e.x);
      if (S.run(st, e, t, c.length ? c : list)) {
        e.spT[name] = st.t + S.cd * (0.85 + st.rng() * 0.3); e.castT = st.t + S.dur; e.atkT = Math.max(e.atkT, S.dur + 0.25);
        ev(st, { type: 'demonCast', kind: name, x: e.x, z: e.z, from: e.id });
        break;
      }
      e.spT[name] = st.t + 2; // failed (nothing to heal / summon cap): retry soon
    }
  }
}
