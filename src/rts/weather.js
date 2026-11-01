// WORLD lane: weather, day/night and the gameplay modifiers read by Units/Combat (WorldX.mods).
import { emit } from './core.js';
import * as Combat from './combat.js';
import { DAY_LEN, WEATHER, RELICS } from './world_data.js';
import { wx } from './neutrals.js';
import { buffOf } from './wx_kinds2.js';

export const phaseOf = (t) => (0.1 + t / DAY_LEN) % 1; // same convention as the renderer (src/rts/render.js phaseOf): starts at 0.1 = morning
export const isNight = (st) => !!(st.time && st.time.night);
function setTime(st) {
  const p = phaseOf(st.t), forced = !!(st.time && st.time.forced);
  st.time = { phase: p, night: forced || (p > 0.6 && p < 0.92), forced, day: Math.floor((st.t + 48) / DAY_LEN), dusk: p > 0.5 && p <= 0.6, dawn: p >= 0.92 };
  st.dayPhase = p; if (st.weather) { st.weather.phase = p; st.weather.dread = !!(st.events2 && st.events2.dread); }
}
function pickKind(st, prev) {
  let tot = 0; const ks = Object.keys(WEATHER).filter((k) => k !== prev || k === 'clear').filter((k) => st.t > 150 || k === 'clear' || k === 'fog' || k === 'rain');
  for (const k of ks) tot += WEATHER[k].w;
  let r = st.rng() * tot;
  for (const k of ks) { r -= WEATHER[k].w; if (r <= 0) return k; }
  return 'clear';
}
export function init(st) {
  st.time = { forced: false }; setTime(st);
  st.weather = { kind: 'clear', t: 0, dur: 100, intensity: 0, strength: 0, nextAt: 90 + st.rng() * 60, lightT: 6 };
  const w = wx(st); w.base = []; w.fire = []; w.baseT = -9;
}
function transition(st) {
  const w = st.weather, k = pickKind(st, w.kind), d = WEATHER[k].dur;
  w.kind = k; w.t = 0; w.dur = d[0] + st.rng() * (d[1] - d[0]); w.strength = k === 'clear' ? 0 : 0.55 + st.rng() * 0.45; w.nextAt = st.t + w.dur; w.lightT = 5;
  emit(st, { type: 'weather', kind: k, intensity: w.strength });
  if (k === 'storm' || k === 'blizzard') emit(st, { type: 'announce', text: k === 'storm' ? 'A thunderstorm rolls over the island.' : 'A blizzard howls over the highlands.' });
}
export function update(st, dt) {
  setTime(st);
  const w = st.weather;
  if (st.t >= w.nextAt) transition(st);
  w.t += dt;
  w.intensity = w.strength * Math.max(0, Math.min(1, w.t / 10, (w.dur - w.t) / 10));
  if (w.kind === 'storm' && w.intensity > 0.2) { w.lightT -= dt; if (w.lightT <= 0) { w.lightT = (4 + st.rng() * 4) / w.intensity; strike(st); } }
}
function strike(st) {
  const c = [];
  for (const u of st.ents) {
    if (!u.alive || u.garrison) continue;
    const wgt = (u.layer === 'wall' ? 4 : 1) * (u.y > 5 ? 2 : 1) * (u.role === 'heavy' || u.role === 'siege' ? 1.5 : 1);
    c.push([u, wgt]);
  }
  if (!c.length) return;
  let tot = 0; for (const p of c) tot += p[1];
  let r = st.rng() * tot, tgt = c[0][0];
  for (const p of c) { r -= p[1]; if (r <= 0) { tgt = p[0]; break; } }
  emit(st, { type: 'weather', kind: 'lightning', x: tgt.x, z: tgt.z, tgt: tgt.id });
  try { Combat.damage(st, { id: 0, team: -1, x: tgt.x, z: tgt.z }, tgt, 70 + st.rng() * 30, { dtype: 'lightning' }); } catch (e) { tgt.hp -= 80; }
}
// 2 Hz: cache team-level modifiers and fire spots
export function slow(st) {
  const w = wx(st), b = w.base, wk = st.weather.kind, I = st.weather.intensity, night = isNight(st), dread = !!(st.events2 && st.events2.dread);
  w.fire.length = 0;
  for (const bd of st.blds) if (bd.state === 'burning' && w.fire.length < 40) w.fire.push({ x: bd.x, z: bd.z });
  w.fogs = [];
  for (const s of st.neutral) { if (s.kind === 'portal' && w.fire.length < 60) w.fire.push({ x: s.x, z: s.z }); else if (s.kind === 'fogbank') w.fogs.push(s); }
  for (const s of st.zones || []) if (s.fire && w.fire.length < 80) w.fire.push({ x: s.x, z: s.z });
  for (let ti = 0; ti < 5; ti++) {
    const key = ti < 4 ? st.teams[ti].faction.key : '';
    const m = { speed: 1, dmg: 1, vision: 1, fire: 1, ranged: 1, armor: 0, regen: 0, stealth: false, work: 1 };
    if (wk === 'rain') { m.fire = 1 - 0.45 * I; m.ranged = 1 - 0.1 * I; m.speed = 1 - 0.03 * I; }
    else if (wk === 'storm') { m.fire = 1 - 0.6 * I; m.ranged = 1 - 0.18 * I; m.vision = 1 - 0.15 * I; m.speed = 1 - 0.06 * I; }
    else if (wk === 'fog') m.vision = 1 - 0.4 * I;
    if (night) m.vision *= key === 'necro' || key === 'cult' ? 0.95 : 0.85;
    if (key === 'necro' && night) m.dmg *= dread ? 1.2 : 1.15;
    if (key === 'orc' && (wk === 'rain' || wk === 'storm')) m.dmg *= 1 - 0.12 * I;
    if (key === 'demon' && (wk === 'rain' || wk === 'storm')) m.dmg *= 1 - 0.08 * I;
    if (key === 'cult' && (night || wk === 'fog' || wk === 'storm')) m.dmg *= 1.12;
    if (ti === 4 && dread) m.dmg *= 1.25;
    if (ti < 4) {
      if (buffOf(st, ti, 'frenzy')) m.dmg *= 1.15;
      if (buffOf(st, ti, 'might')) m.dmg *= 1.2;
      if (buffOf(st, ti, 'haste')) m.speed *= 1.2;
      if (buffOf(st, ti, 'ward')) m.armor += 8;
      if (buffOf(st, ti, 'heal')) m.regen += 1.5;
    }
    b[ti] = m;
  }
}
const UNDEAD = /skeleton|ghoul|wraith|zombie|crypt|bound|undead|bone|lich|revenant|king/;
const undeadCache = new Map();
const isUndead = (t) => { let v = undeadCache.get(t); if (v === undefined) { v = UNDEAD.test(t); undeadCache.set(t, v); } return v; };
const ONE = { speed: 1, dmg: 1, vision: 1, fire: 1, ranged: 1, armor: 0, regen: 0, stealth: false, work: 1 };
// Per-unit modifiers (multipliers except armor/regen additive). Safe to call every frame; returns a fresh object.
export function mods(st, u) {
  const w = st.wx; if (!w || !w.base || !w.base.length || !u) return { ...ONE };
  const base = w.base[u.team >= 0 && u.team < 4 ? u.team : 4] || ONE, m = { ...base };
  const key = u.team >= 0 && st.teams[u.team] ? st.teams[u.team].faction.key : '';
  if (isNight(st) && u.team !== 0 && isUndead(u.type || '')) m.dmg *= 1.1;
  if (key === 'demon') for (const f of w.fire) if ((f.x - u.x) ** 2 + (f.z - u.z) ** 2 < 144) { m.dmg *= 1.15; break; }
  if (st.weather.kind === 'blizzard' && st.weather.intensity > 0) { const b = st.world.biomeAt(u.x, u.z); if (b === 1 || b === 6) { m.speed *= 1 - 0.15 * st.weather.intensity; m.vision *= 1 - 0.25 * st.weather.intensity; } }
  for (const id of w.carriers) {
    const c = st.byId.get(id);
    if (!c || !c.alive || c.team !== u.team || !c.relics) continue;
    for (const r of c.relics) { const d = RELICS[r]; if (d && d.kind === 'aura' && (c.x - u.x) ** 2 + (c.z - u.z) ** 2 < d.radius * d.radius) { m.dmg *= d.dmg; if (d.vision) m.vision *= d.vision; } }
  }
  if (u.relics) for (const r of u.relics) { const d = RELICS[r]; if (d && d.kind === 'gear') m.regen += d.regen; }
  const ev = st.events2;
  if (ev && ev.plagues) for (const p of ev.plagues) if (p.until > st.t && (p.x - u.x) ** 2 + (p.z - u.z) ** 2 < p.r * p.r && u.role === 'worker') { m.speed *= 0.7; m.work *= 0.6; }
  for (const s of w.fogs || []) if ((s.x - u.x) ** 2 + (s.z - u.z) ** 2 < s.r * s.r) { m.stealth = true; m.vision *= 0.7; break; }
  return m;
}
