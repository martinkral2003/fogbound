// Skill aiming geometry shared by the sim (hold scaling), controls (what the cursor means) and aim_view.js (ground indicator).
// Pure functions, no DOM / Three / sim imports. A "shape" is what the player sees while a skill key is held:
//   { kind:'circle'|'cone'|'line'|'dash'|'wall'|'none', x, z (origin or centre), ang, r, len, w, arc, tx, tz (end point), range, n, gap, ok, color }
export const AIM = { cur: null }; // set every frame by controls (aiming.js), read by aim_view.js. null = nothing to draw.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// default aim kind per skill type when the skill does not set `aim` itself
export function aimKind(s) {
  if (s.aim) return s.aim;
  switch (s.type) {
    case 'line': case 'bolt': return 'line';
    case 'drain': case 'fan': case 'strike': return 'cone';
    case 'zone': case 'debuff': case 'smoke': return 'ground';
    case 'aoe': return s.self ? 'self' : 'ground';
    case 'summon': return s.at === 'cursor' ? 'ground' : 'self';
    case 'dash': return 'dash';
    case 'blink': return 'ground';
    default: return 'self';
  }
}
// a skill needs the key held / confirmed (i.e. is "aimed") unless it simply happens around you
export const isAimed = (s) => { const k = aimKind(s); return k !== 'self' || !!s.hold; };

// charge-and-release: scale the fields listed in s.hold.scale up to their factor at s.hold.max seconds held
export function holdFactor(s, hold) { return s.hold ? clamp((hold || 0) / s.hold.max, 0, 1) : 0; }
export function holdScaled(s, hold) {
  if (!s.hold || !(hold > 0)) return s;
  const f = holdFactor(s, hold), out = { ...s };
  for (const k in s.hold.scale) {
    const m = 1 + (s.hold.scale[k] - 1) * f;
    if (typeof out[k] === 'number') out[k] = out[k] * m;
    if (k === 'dmg' && out.land) out.land = { ...out.land, dmg: out.land.dmg * m };
  }
  return out;
}

export function aimClampPoint(hx, hz, ax, az, range) {
  const d = Math.hypot(ax - hx, az - hz);
  if (!range || d <= range) return [ax, az, d];
  const k = range / d;
  return [hx + (ax - hx) * k, hz + (az - hz) * k, d];
}

// The shape to draw / the geometry the sim will use for skill `s` (already perk-modified and hold-scaled) cast by hero `h` towards (ax, az).
export function skillShape(s, h, ax, az) {
  const kind = aimKind(s), ang = Math.atan2(az - h.z, ax - h.x);
  const out = { kind: 'none', x: h.x, z: h.z, ang, r: 0, len: 0, w: 0, arc: 0, tx: h.x, tz: h.z, range: 0, n: 0, gap: 0, ok: true, color: s.color || 0xffffff, id: s.id };
  switch (kind) {
    case 'ground': {
      const [px, pz] = aimClampPoint(h.x, h.z, ax, az, s.range);
      out.kind = 'circle'; out.x = px; out.z = pz; out.r = s.radius || 3; out.range = s.range || 0;
      break;
    }
    case 'cone':
      out.kind = 'cone'; out.len = s.len || s.range || 8; out.arc = s.arc || 1.2;
      break;
    case 'line':
      out.kind = 'line'; out.len = s.len || s.range || 12; out.w = s.w || (s.type === 'bolt' ? 2 : 2.4);
      break;
    case 'dash': {
      const d = Math.hypot(ax - h.x, az - h.z), dist = s.toPoint ? clamp(d, 2.5, s.dist) : s.dist;
      out.kind = 'dash'; out.len = dist; out.w = 1.4; out.tx = h.x + Math.cos(ang) * dist; out.tz = h.z + Math.sin(ang) * dist;
      out.r = s.land ? s.land.radius : 0;
      break;
    }
    case 'wall': {
      const [px, pz] = aimClampPoint(h.x, h.z, ax, az, s.range);
      const n = s.wall ? s.wall.n : 4, gap = s.wall ? s.wall.gap : 3;
      out.kind = 'wall'; out.x = px; out.z = pz; out.ang = ang + Math.PI / 2; out.len = n * gap; out.w = (s.radius || 2) * 2; out.n = n; out.gap = gap; out.range = s.range || 0;
      break;
    }
    default:
      if (s.hold || s.self) { out.kind = 'circle'; out.r = s.radius || 4; }
  }
  return out;
}
