// FLOW: the closing Dread Fog (zone) and the supply offerings.
import * as Items from '../items.js';
import * as Combat from '../combat.js';
import { emit } from '../core.js';
import { TAU, lerp, smoothstep } from '../../util.js';
import { landPoint, addContainer, mk } from './containers.js';
import { getNav } from './nav.js';

export const ZONE = {
  startR: 300, firstAt: 240, tick: 0.5,
  // radius reached, shrink duration, hold duration, damage (% max HP / s) outside during that stage
  stages: [{ r: 230, shrink: 85, hold: 115, dps: 4 }, { r: 170, shrink: 90, hold: 115, dps: 7 }, { r: 115, shrink: 90, hold: 115, dps: 12 }, { r: 65, shrink: 90, hold: 115, dps: 20 }, { r: 25, shrink: 90, hold: 120, dps: 28 }],
  collapse: { r: 6, shrink: 70 },
  offerings: [360, 600, 840],
};

export function initZone(st) {
  const t = st.world.features.boss || { x: 0, z: 0 };
  let cx = 0, cz = 0;
  for (let i = 0; i < 40; i++) {
    const a = st.rng() * TAU, r = Math.sqrt(st.rng()) * 60;
    cx = (t.x || 0) + Math.cos(a) * r; cz = (t.z || 0) + Math.sin(a) * r;
    if (st.world.walkable(cx, cz)) break;
  }
  st.zone = { cx, cz, r: ZONE.startR, fromR: ZONE.startR, toR: ZONE.startR, stage: 0, stages: ZONE.stages.length, state: 'waiting', t: 0, nextAt: ZONE.firstAt, dps: 0, dmgT: 0, final: false };
  st.match.offerings = [];
}

function beginShrink(st, toR, dur, stageNo, dps) {
  const z = st.zone;
  z.state = 'shrinking'; z.t = 0; z.fromR = z.r; z.toR = toR; z.dur = dur; z.stage = stageNo; z.dps = dps; z.nextAt = st.t + dur;
  emit(st, { type: 'zone', stage: z.stage, state: z.state, r: toR });
  emit(st, { type: 'announce', text: z.final ? 'The Fog closes for the last time' : 'The Fog tightens' });
}
function beginHold(st, dur) {
  const z = st.zone;
  z.state = 'holding'; z.t = 0; z.r = z.toR; z.dur = dur; z.nextAt = st.t + dur;
  emit(st, { type: 'zone', stage: z.stage, state: z.state, r: z.r });
}

export function updateZone(st, dt) {
  const z = st.zone; if (!z) return;
  if (st.match.state === 'over') { z.dps = 0; return; }
  z.t += dt;
  if (z.state === 'waiting') {
    if (st.t >= ZONE.firstAt) beginShrink(st, ZONE.stages[0].r, ZONE.stages[0].shrink, 1, ZONE.stages[0].dps);
  } else if (z.state === 'shrinking') {
    const u = Math.min(1, z.t / z.dur);
    z.r = lerp(z.fromR, z.toR, smoothstep(0, 1, u));
    if (u >= 1) beginHold(st, z.final ? 1e9 : ZONE.stages[z.stage - 1].hold);
  } else if (z.state === 'holding') {
    if (z.t >= z.dur) {
      if (z.stage < ZONE.stages.length) { const s = ZONE.stages[z.stage]; beginShrink(st, s.r, s.shrink, z.stage + 1, s.dps); }
      else if (!z.final) { z.final = true; beginShrink(st, ZONE.collapse.r, ZONE.collapse.shrink, z.stage, ZONE.stages[z.stage - 1].dps); }
    }
  }
  // offerings
  const k = st.match.offerings.length;
  if (k < ZONE.offerings.length && st.t >= ZONE.offerings[k]) spawnOffering(st, k);
  // damage outside the circle
  z.dmgT += dt;
  if (z.dmgT >= ZONE.tick) {
    const step = z.dmgT; z.dmgT = 0;
    if (z.dps <= 0) return;
    for (const a of st.actors) {
      if (!a.alive || (a.kind !== 'player' && a.kind !== 'rival')) continue;
      if (Math.hypot(a.x - z.cx, a.z - z.cz) <= z.r) { a.inFog = false; continue; }
      a.inFog = true;
      Combat.applyDamage(st, null, a, a.maxHp * (z.dps / 100) * step, { dtype: 'physical', source: 'zone', ignoreBlock: true });
    }
  }
}

function spawnOffering(st, k) {
  const z = st.zone, info = safeZoneInfo(st), nextR = info && info.next ? info.next.r : 40;
  // somewhere inside the NEXT circle, on walkable ground
  let p = null;
  for (let t = 0; t < 60 && !p; t++) {
    const a = st.rng() * TAU, r = Math.sqrt(st.rng()) * nextR * 0.85, x = z.cx + Math.cos(a) * r, z2 = z.cz + Math.sin(a) * r;
    const nav = getNav(st), i = Math.floor((x + 200) / 4), j = Math.floor((z2 + 200) / 4);
    if (i >= 0 && j >= 0 && i < 100 && j < 100 && nav.open[j * 100 + i] && nav.comp[j * 100 + i] === nav.main) p = { x, z: z2 };
  }
  if (!p) p = landPoint(st, 0, 60) || { x: z.cx, z: z.cz };
  let items = [];
  try { items = Items.rollLoot('offering', st.rng, 4) || []; } catch (e) { items = []; }
  const extra = mk(st, 'healthPotion', { qty: 2 }); if (extra) items.push(extra);
  const c = addContainer(st, { x: p.x, z: p.z, kind: 'crate', tier: 4, name: 'Offering of the Fog', items, locked: false });
  st.match.offerings.push({ id: c.id, container: c.id, x: p.x, z: p.z, born: st.t, active: true, k });
  emit(st, { type: 'announce', text: 'Offering of the Fog', x: p.x, z: p.z, offering: c.id });
}

export function refreshOfferings(st) {
  for (const o of st.match.offerings) if (o.active) { const c = st.containers.find((q) => q.id === o.container); if (!c || c.removed || (c.opened && !c.items.length)) o.active = false; }
}

export function safeZoneInfo(st) {
  const z = st.zone; if (!z) return null;
  const cur = { cx: z.cx, cz: z.cz, r: z.r };
  let next = null;
  if (z.state === 'shrinking') next = { cx: z.cx, cz: z.cz, r: z.toR };
  else if (z.state === 'holding' || z.state === 'waiting') { const s = ZONE.stages[z.state === 'waiting' ? 0 : Math.min(z.stage, ZONE.stages.length - 1)]; next = z.final ? null : { cx: z.cx, cz: z.cz, r: z.state === 'holding' && z.stage >= ZONE.stages.length ? ZONE.collapse.r : s.r }; }
  return { cur, next, stage: z.stage, stages: z.stages, state: z.state, timeLeft: Math.max(0, z.nextAt - st.t), dps: z.dps };
}
