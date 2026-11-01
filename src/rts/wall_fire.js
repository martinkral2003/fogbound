// Fire on structures (WALLS lane): timber burns, stone barely, black stone never. Burning spreads to adjacent flammable buildings.
// State: b.fire = { t: seconds left, dps }. Renderer: draw flames on any building with b.fire. Event {type:'fire',x,z} on ignition.
import { emit, killBld } from './core.js';
import { TIERS } from './wdata.js';

const flammable = (b) => b.hp > 0 && b.state !== 'ruin' && b.burns !== false && (b.wall ? TIERS[b.wall.tier].fire > 0 && (b.wall.tier === 0 || b.type === 'gate') : b.burns !== false);

export function ignite(st, b, dur = 8, dps = 14) {
  if (!b || b.hp <= 0 || b.state === 'ruin') return false;
  const f = b.wall ? TIERS[b.wall.tier].fire : (b.burns === false ? 0 : 0.6);
  if (f <= 0) return false;
  if (st.weather && st.weather.kind === 'rain' && st.rng() < 0.5) return false;
  if (b.fire) { b.fire.t = Math.max(b.fire.t, dur); return true; }
  b.fire = { t: dur * (0.6 + f * 0.4), dps: dps * f + 2, f };
  emit(st, { type: 'fire', x: b.x, z: b.z, id: b.id });
  return true;
}

let acc = 0;
export function tickFire(st, dt) {
  acc += dt;
  if (acc < 0.5) return;
  const step = acc; acc = 0;
  const rain = st.weather && (st.weather.kind === 'rain' || st.weather.kind === 'storm');
  for (const b of st.blds) {
    if (!b.fire) continue;
    if (b.hp <= 0 || b.state === 'ruin') { b.fire = null; continue; }
    b.fire.t -= step * (rain ? 2 : 1);
    if (b.fire.t <= 0) { b.fire = null; continue; }
    b.hp -= b.fire.dps * step;
    if (b.hp <= 0) { killBld(st, b, null); b.fire = null; continue; }
    // spread
    for (const o of st.blds) {
      if (o === b || o.fire || !flammable(o)) continue;
      const dx = o.x - b.x, dz = o.z - b.z;
      if (dx * dx + dz * dz > 36) continue;
      if (st.rng() < 0.5 * step * (rain ? 0.4 : 1)) ignite(st, o, 6, 12);
    }
  }
}
