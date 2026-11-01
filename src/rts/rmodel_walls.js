// FOGBOUND: DOMINION client: wall / gate / tower models. wallModel(piece, tier, look, w, d, h, turret) -> {geo, emit, top}.
// look: 'bone' | 'orc' | 'hell' | 'blood'. tier: 0 timber, 1 stone, 2 black stone. w runs along local x. Gate door = part 11 (lift), turrets = part 12 (yaw) / 13 (recoil).
import { Rig } from './models_rts.js';

const TIER_COL = [0x6a4a2c, 0x6e6e70, 0x2e2e36];
const LOOKS = {
  bone: { acc: 0xd8d2bc, glow: 0x4fe3c1, dark: 0x1c2426, wood: 0x4a4038 }, orc: { acc: 0x9a9a98, glow: 0xe8742a, dark: 0x3a2818, wood: 0x5a3a22 },
  hell: { acc: 0x4a2a2e, glow: 0xff5a20, dark: 0x120a0e, wood: 0x2a1a18 }, blood: { acc: 0xd8b24a, glow: 0xc43bd6, dark: 0x3a2c30, wood: 0x4a3028 },
};
const tone = (c, k) => { const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k; return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b); };

function crenel(r, w, d, y, col, n = 4) { // merlons along the top of a segment (both faces)
  for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * (w / n); r.box(w / n * 0.55, 0.55, 0.28, x, y + 0.28, d / 2 - 0.14, col); r.box(w / n * 0.55, 0.55, 0.28, x, y + 0.28, -d / 2 + 0.14, col); }
}
function lookDeco(r, L, look, w, d, h, tier) { // faction decoration on the wall face
  if (look === 'bone') { for (let i = 0; i < 2; i++) { const x = (i - 0.5) * w * 0.5; r.sph(0.2, x, h * 0.62, d / 2 + 0.05, L.acc, { sz: 0.5, w: 6, h: 4 }); r.sph(0.2, x, h * 0.62, -d / 2 - 0.05, L.acc, { sz: 0.5, w: 6, h: 4 }); } r.box(w * 0.9, 0.08, 0.04, 0, h * 0.4, d / 2 + 0.03, L.glow, { team: 2, shade: 0.7 }); }
  else if (look === 'orc') { for (let i = 0; i < 3; i++) { const x = (i - 1) * w * 0.3; r.cone(0.1, 0.7, x, h * 0.55, d / 2 + 0.3, L.acc, 4, { rx: 1.2 }); r.cone(0.1, 0.7, x, h * 0.55, -d / 2 - 0.3, L.acc, 4, { rx: -1.2 }); } r.box(w * 0.5, 0.9, 0.05, 0, h * 0.5, d / 2 + 0.04, 0x7a5a3a); }
  else if (look === 'hell') { r.box(w * 0.85, 0.07, 0.04, 0, h * 0.35, d / 2 + 0.02, L.glow, { team: 2 }); r.box(0.07, h * 0.5, 0.04, w * 0.2, h * 0.5, d / 2 + 0.02, L.glow, { team: 2 }); r.cone(0.12, 0.6, -w * 0.35, h + 0.8, 0, L.dark, 4); r.cone(0.12, 0.6, w * 0.35, h + 0.8, 0, L.dark, 4); }
  else { r.box(0.04, h * 0.6, w * 0.25, 0, h * 0.5, 0, 0, {}); r.box(w * 0.28, h * 0.55, 0.05, 0, h * 0.55, d / 2 + 0.04, 0, { team: 1, part: 5, pv: [0, h * 0.85, d / 2] }); r.box(w * 0.28, h * 0.55, 0.05, 0, h * 0.55, -d / 2 - 0.04, 0, { team: 1, part: 5, pv: [0, h * 0.85, -d / 2] }); }
}
function turret(r, kind, L, y, rad) { // rotating weapon on top; faces +x at rest
  const pv = [0, y, 0], o = { part: 12, pv };
  if (kind === 'cannon') { r.cyl(0.3, 0.38, 1.8, 0.7, y + 0.5, 0, 0x3c3e42, 9, { ...o, rz: -1.5708 + 0.15, part: 12 }); r.cyl(0.5, 0.5, 0.35, 0, y + 0.25, 0, 0x2a2a2e, 8, o); r.sph(0.22, 1.55, y + 0.62, 0, L.glow, { ...o, team: 2, w: 5, h: 4 }); }
  else if (kind === 'magic') { r.cyl(0.18, 0.28, 1.2, 0, y + 0.6, 0, L.dark, 6, o); r.sph(0.5, 0, y + 1.6, 0, L.glow, { ...o, team: 2, w: 8, h: 6 }); r.cone(0.12, 0.5, 0.4, y + 1.2, 0, L.acc, 4, { ...o, rz: -0.7 }); }
  else if (kind === 'ballista') { r.box(1.4, 0.12, 0.14, 0.3, y + 0.8, 0, 0x4a3828, o); r.box(0.12, 0.1, 2.2, 0.7, y + 0.8, 0, 0x4a3828, o); r.cone(0.08, 0.5, 1.3, y + 0.8, 0, 0xaab0b4, 4, { ...o, rz: -1.5708 }); r.box(0.4, 0.8, 0.4, 0, y + 0.4, 0, 0x3a2c20, o); }
  else { r.box(0.7, 0.14, 0.5, 0.2, y + 0.8, 0, 0x4a3828, o); r.box(0.06, 0.06, 1.1, 0.5, y + 0.82, 0, 0x2a2018, o); r.box(0.5, 0.7, 0.5, 0, y + 0.35, 0, 0x3a2c20, o); r.cone(0.05, 0.4, 0.9, y + 0.82, 0, 0xaab0b4, 4, { ...o, rz: -1.5708 }); }
}

export function wallModel(piece, tier, look, w, d, h, tkind) {
  const r = new Rig(), L = LOOKS[look] || LOOKS.bone, tc = TIER_COL[Math.max(0, Math.min(2, tier | 0))];
  const P = String(piece);
  const stone = look === 'hell' && tier >= 1 ? tone(tc, 0.7) : look === 'blood' && tier === 1 ? 0x7a706c : look === 'bone' && tier >= 1 ? tone(tc, 0.85) : tc;
  if (P === 'palisade') {
    const n = Math.max(3, Math.round(w / 0.55));
    for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * w / n, hh = h * (0.85 + ((i * 7) % 5) * 0.045); r.box(w / n * 0.95, hh, d * 0.8, x, hh / 2, ((i % 2) - 0.5) * 0.12, tone(L.wood, 0.85 + (i % 3) * 0.1)); r.cone(w / n * 0.5, 0.45, x, hh + 0.2, ((i % 2) - 0.5) * 0.12, tone(L.wood, 0.7), 4); }
    r.box(w, 0.1, d * 0.5, 0, h * 0.35, 0, 0x2a2018); if (look === 'bone') r.sph(0.2, 0, h * 0.8, d * 0.5, L.acc, { sz: 0.6, w: 6, h: 4 });
  } else if (P === 'wall') {
    r.box(w + 0.05, h, d, 0, h / 2, 0, stone); r.box(w + 0.05, 0.3, d + 0.3, 0, h - 0.05, 0, tone(stone, 0.8)); r.box(w + 0.05, 0.25, d + 0.2, 0, 0.12, 0, tone(stone, 0.7));
    if (tier === 0) { r.box(w, h * 0.4, d + 0.1, 0, h * 0.7, 0, 0x5a3a22); for (let i = 0; i < 6; i++) r.box(0.12, h, d + 0.12, -w / 2 + (i + 0.5) * w / 6, h / 2, 0, 0x7a5a3a); }
    crenel(r, w, d, h + 0.1, tone(stone, 0.9)); lookDeco(r, L, look, w, d, h, tier);
  } else if (P === 'corner') {
    const rad = w / 2;
    r.cyl(rad * 0.95, rad * 1.1, h, 0, h / 2, 0, stone, 9); r.cyl(rad * 1.2, rad * 1.1, 0.5, 0, h - 0.1, 0, tone(stone, 0.8), 9); r.cyl(rad * 1.05, rad * 1.05, 0.2, 0, h + 0.2, 0, tone(stone, 0.7), 9);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; r.box(0.42, 0.6, 0.3, Math.cos(a) * rad * 1.1, h + 0.55, Math.sin(a) * rad * 1.1, tone(stone, 0.9), { ry: -a }); }
    r.box(0.06, 0.5, 0.2, rad * 0.98, h * 0.7, 0, L.glow, { team: 2 });
    if (look === 'hell') for (let i = 0; i < 3; i++) r.cone(0.16, 1.2, Math.cos(i * 2.1) * rad * 0.5, h + 1.0, Math.sin(i * 2.1) * rad * 0.5, L.dark, 4);
    if (look === 'bone') r.sph(0.4, 0, h + 0.9, 0, L.acc, { sy: 1.1 });
    if (look === 'orc') { r.box(0.1, 1.8, 0.1, 0, h + 1.1, 0, L.wood); r.box(0.05, 0.7, 0.5, 0, h + 1.5, 0.3, 0, { team: 1, part: 5, pv: [0, h + 1.9, 0] }); }
    if (look === 'blood') { r.cone(rad * 0.9, 2.0, 0, h + 1.5, 0, 0x8a1c34, 8); r.em('glow', 0, h + 2.8, 0, 1.2, L.glow); }
    r.em('fire', rad * 0.5, h + 0.8, rad * 0.5, 0.6, L.glow);
  } else if (P === 'gate' || P === 'gatehouse') {
    const big = P === 'gatehouse', pw = big ? 1.8 : 0.9, ow = w - pw * 2;
    for (const sx of [-1, 1]) r.box(pw, h, d, sx * (w / 2 - pw / 2), h / 2, 0, stone);
    r.box(w, big ? 1.4 : 0.9, d + 0.2, 0, h - 0.4, 0, tone(stone, 0.85));
    const dp = { part: 11, pv: [h - 1.0, 0, 0] };
    r.box(ow, h - 1.1, 0.3, 0, (h - 1.1) / 2, 0, L.wood, dp); for (let i = 0; i < 3; i++) r.box(ow + 0.05, 0.14, 0.35, 0, 0.8 + i * (h - 2.2) / 2, 0, 0x2a2a2e, dp);
    r.box(ow * 0.6, h - 1.4, 0.06, 0, (h - 1.1) / 2, 0.18, 0, { ...dp, team: 1, shade: 0.9 });
    crenel(r, w, d, h + 0.3, tone(stone, 0.9), big ? 6 : 4);
    if (big) { r.box(w * 0.7, 2.6, d * 0.7, 0, h + 1.6, 0, tone(stone, 0.8)); crenel(r, w * 0.7, d * 0.7, h + 2.9, stone, 3); turret(r, tkind || 'arrow', L, h + 3.0, 1); r.box(2.0, 2.0, 0.1, 0, h - 0.2, d / 2 + 0.1, 0, { team: 1 }); }
    if (look === 'bone') r.sph(0.35, 0, h + 0.4, d / 2 + 0.1, L.acc, { sz: 0.6, w: 6, h: 4 });
    if (look === 'hell') for (const sx of [-1, 1]) r.cone(0.2, 1.5, sx * (w / 2 - 0.5), h + 0.8, 0, L.dark, 4);
    brz(r, w / 2 - 0.3, 0, d / 2 + 0.5, L); brz(r, -w / 2 + 0.3, 0, d / 2 + 0.5, L);
  } else if (P === 'stairs') {
    const n = 7; for (let i = 0; i < n; i++) { const st = h / n; r.box(w / n * 1.3, st * (i + 1), d, -w / 2 + (i + 0.6) * w / n * 0.95, st * (i + 1) / 2, 0, stone); }
    r.box(w, 0.1, 0.12, 0, h * 0.5 + 0.9, d / 2, L.wood, { rz: -Math.atan2(h, w) });
  } else if (P === 'ladder') {
    r.box(0.08, h, 0.08, 0, h / 2, 0.3, L.wood, { rz: -0.15 }); r.box(0.08, h, 0.08, 0, h / 2, -0.3, L.wood, { rz: -0.15 }); for (let i = 1; i < 9; i++) r.box(0.08, 0.06, 0.6, -0.02 * i * 0 + (i / 9) * 0.0, h * i / 9, 0, L.wood, { rz: 0 });
  } else if (P === 'spikes') {
    const n = Math.max(4, Math.round(w / 0.5)); for (let i = 0; i < n; i++) { for (const z of [-0.4, 0.4]) r.cone(0.12, h * 1.3, -w / 2 + (i + 0.5) * w / n, h * 0.6, z + (i % 2) * 0.1, L.wood, 4, { rz: (i % 2 ? 0.35 : -0.35) }); } r.box(w, 0.1, 0.1, 0, 0.3, 0, L.wood);
  } else if (P === 'moat') {
    r.box(w, 0.05, d, 0, 0.0, 0, 0x14282c, { team: 0 });
  } else { // towers
    const T = String(tkind || 'arrow'), sq = /watch/.test(String(piece)) || false;
    void sq; r.box(w * 1.12, 0.6, d * 1.12, 0, 0.3, 0, tone(stone, 0.75)); r.box(w * 0.86, h - 1.6, d * 0.86, 0, 0.6 + (h - 1.6) / 2, 0, stone);
    r.box(w * 1.2, 1.0, d * 1.2, 0, h - 1.0, 0, tone(stone, 0.85)); r.box(w * 0.9, 0.3, d * 0.9, 0, h - 0.35, 0, tone(stone, 0.7));
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283, c = Math.cos(a) * w * 0.55, s2 = Math.sin(a) * d * 0.55; r.box(0.55, 0.7, 0.4, c, h + 0.25, s2, tone(stone, 0.9), { ry: -a }); }
    for (const z of [-1, 1]) r.box(0.08, 0.6, 0.25, w * 0.44, h * 0.6, z * d * 0.2, 0, { team: 2, shade: 0.4 });
    r.box(0.08, 1.2, 1.2, w * 0.44, h * 0.35, 0, 0, { team: 1 });
    if (/watch/.test(piece) || /watch/.test(String(look))) { /* timber platform handled by tier-0 recolour */ }
    if (look === 'bone') { r.sph(0.3, 0, h - 0.5, d * 0.55, L.acc, { sy: 1.1, sz: 0.6 }); }
    if (look === 'hell') for (let i = 0; i < 4; i++) r.cone(0.2, 1.4, (i < 2 ? -1 : 1) * w * 0.5, h + 0.9, (i % 2 ? 1 : -1) * d * 0.5, L.dark, 4);
    if (look === 'blood') r.box(w * 0.9, 0.2, d * 0.9, 0, h + 0.7, 0, 0x8a1c34);
    if (look === 'orc') for (let i = 0; i < 4; i++) r.cone(0.1, 0.9, w * 0.6, h * 0.5 + i * 0.8, (i - 1.5) * 0.8, L.acc, 4, { rz: -1.2 });
    if (T !== 'none') turret(r, T, L, h + 0.3, 1);
    r.em('fire', -w * 0.5, h + 0.5, d * 0.5, 0.6, L.glow);
  }
  return { geo: r.build(), emit: r.emit, top: h + 1 };
}
function brz(r, x, y, z, L) { r.cyl(0.14, 0.08, 0.5, x, 0.25, z, 0x2a2a2c, 6); r.sph(0.12, x, 0.62, z, L.glow, { team: 2, w: 5, h: 4 }); r.em('fire', x, 0.7, z, 0.6, L.glow); }
