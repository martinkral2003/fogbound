// FOGBOUND: DOMINION client: building models. buildingModel(type, fkey, w, d, h) -> {geo, emit[], top}. Local +x = front, w along x, d along z. Dark-fantasy per faction.
import { Rig } from './models_rts.js';
import { bldRig2 } from './rmodel_blds2.js';

export const STYLE = {
  necro: { stone: 0x3c4648, dark: 0x1e2628, roof: 0x242e30, trim: 0xd8d2bc, glow: 0x4fe3c1, wood: 0x4a4038, plinth: 0x2c3436 },
  orc: { stone: 0x6e4e32, dark: 0x3a2818, roof: 0x7a5a3a, trim: 0x9a9a98, glow: 0xe8742a, wood: 0x5a3a22, plinth: 0x4a3a2c },
  demon: { stone: 0x2a1c20, dark: 0x120a0e, roof: 0x1a1014, trim: 0x5a3030, glow: 0xff5a20, wood: 0x2a1a18, plinth: 0x1c1216 },
  cult: { stone: 0x6e6460, dark: 0x3a2c30, roof: 0x8a1c34, trim: 0xd8b24a, glow: 0xc43bd6, wood: 0x4a3028, plinth: 0x4a4244 },
};
export const sty = (f) => STYLE[f] || STYLE.necro;

// gable roof along x: ridge height rh above y0, spanning depth d
export function gable(r, w, d, y0, rh, col, over = 0.3, thick = 0.14) {
  const half = d / 2 + over, len = Math.hypot(half, rh), a = Math.atan2(rh, half);
  r.box(w + over * 2, thick, len, 0, y0 + rh / 2, half / 2, col, { rx: -a }); r.box(w + over * 2, thick, len, 0, y0 + rh / 2, -half / 2, col, { rx: a });
}
// pyramid / spire roof
export function spire(r, rad, y0, hh, col, seg = 4, o = {}) { r.cone(rad, hh, 0, y0 + hh / 2, 0, col, seg, { ry: seg === 4 ? Math.PI / 4 : 0, ...o }); }
export function brazier(r, x, y, z, s, col, em = true) {
  r.cyl(0.18 * s, 0.1 * s, 0.5 * s, x, y + 0.25 * s, z, 0x2a2a2c, 6); r.cyl(0.24 * s, 0.18 * s, 0.14 * s, x, y + 0.55 * s, z, 0x3a3a3e, 7); r.sph(0.14 * s, x, y + 0.66 * s, z, col, { team: 2, w: 5, h: 4 });
  if (em) r.em('fire', x, y + 0.75 * s, z, s, col);
}
export function door(r, x, y, z, w, hh, col, rot = 0) { r.box(0.12, hh, w, x, y + hh / 2, z, col); r.box(0.14, 0.12, w + 0.3, x, y + hh + 0.06, z, 0x1a1a1c); }
function flagPole(r, x, y, z, hh, f, s) { r.box(0.08, hh, 0.08, x, y + hh / 2, z, s.wood); r.box(0.05, hh * 0.35, hh * 0.28, x, y + hh * 0.8, z + hh * 0.15, 0, { team: 1, part: 5, pv: [x, y + hh * 0.95, z] }); }
// faction roofs for a rectangular hall body (w x d, walls to height wh)
function roofFor(r, f, s, w, d, wh, rh) {
  if (f === 'necro') { r.box(w + 0.4, 0.25, d + 0.4, 0, wh + 0.12, 0, s.dark); for (let i = 0; i < 5; i++) r.cone(0.12, 0.8, -w / 2 + 0.3 + i * (w - 0.6) / 4, wh + 0.6, d / 2 + 0.1, s.trim, 4); r.box(w * 0.9, 0.12, 0.14, 0, wh + 0.3, d * 0.3, s.glow, { team: 2, shade: 0.7 }); r.box(w * 0.9, 0.12, 0.14, 0, wh + 0.3, -d * 0.3, s.glow, { team: 2, shade: 0.7 }); }
  else if (f === 'orc') { gable(r, w, d, wh, rh, s.roof, 0.5); for (let i = 0; i < 2; i++) { r.box(0.12, rh * 1.4, 0.12, (i ? 1 : -1) * (w / 2 + 0.4), wh + rh * 0.9, 0, s.wood, { rz: 0 }); r.cone(0.12, 0.4, (i ? 1 : -1) * (w / 2 + 0.4), wh + rh * 1.65, 0, s.trim, 4); } r.sph(0.16, w / 2 + 0.3, wh + 0.8, 0, 0xe0d8b8, { sy: 1.1 }); }
  else if (f === 'demon') { gable(r, w, d, wh, rh * 0.8, s.roof, 0.35); for (let i = 0; i < 4; i++) r.cone(0.14, 1.0, -w / 2 + 0.5 + i * (w - 1) / 3, wh + rh * 0.9, 0, s.dark, 4, { rz: 0.08 }); r.box(w * 0.9, 0.08, 0.12, 0, wh + rh * 0.8 + 0.04, 0, s.glow, { team: 2 }); }
  else { gable(r, w, d, wh, rh, s.roof, 0.4); spire(r, 0.35, wh + rh * 0.9, 1.3, s.trim, 6, { team: 2 }); r.em('glow', 0, wh + rh + 1.4, 0, 1.2, s.glow); }
}
function hall(r, f, s, w, d, h, o = {}) {
  const wh = Math.max(2.2, h * 0.62);
  r.box(w + 0.5, 0.45, d + 0.5, 0, 0.22, 0, s.plinth); r.box(w, wh, d, 0, 0.45 + wh / 2 - 0.2, 0, s.stone);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) r.box(0.45, wh + 0.1, 0.45, sx * (w / 2 - 0.1), wh / 2 + 0.25, sz * (d / 2 - 0.1), s.dark);
  door(r, w / 2 + 0.02, 0.2, 0, Math.min(2.2, d * 0.4), Math.min(2.2, wh * 0.7), s.dark);
  r.box(0.1, 0.55, 0.5, w / 2 + 0.02, wh * 0.75, d * 0.3, s.glow, { team: 2 }); r.box(0.1, 0.55, 0.5, w / 2 + 0.02, wh * 0.75, -d * 0.3, s.glow, { team: 2 });
  roofFor(r, f, s, w, d, wh + 0.25, Math.max(1.3, h - wh - 0.4));
  r.box(0.1, 0.9, Math.min(w * 0.35, 2.5), w / 2 + 0.07, wh * 0.95, 0, 0, { team: 1 }); // faction banner over the door
  brazier(r, w / 2 + 0.8, 0.2, d * 0.28, 0.8, s.glow); brazier(r, w / 2 + 0.8, 0.2, -d * 0.28, 0.8, s.glow);
  return wh;
}

export function buildingModel(type, f, w, d, h) {
  const r = new Rig(), s = sty(f);
  const t = String(type);
  let top = h;
  if (t === 'keep') {
    r.box(w + 1.2, 0.8, d + 1.2, 0, 0.4, 0, s.plinth); r.box(w * 0.78, h * 0.6, d * 0.78, 0, 0.8 + h * 0.3, 0, s.stone);
    const cw = w * 0.34, ch = h * 1.0;
    r.box(cw, ch, cw, 0, 0.8 + ch / 2, 0, s.stone); r.box(cw + 0.8, 0.5, cw + 0.8, 0, 0.8 + ch, 0, s.dark);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = sx * w * 0.44, z = sz * d * 0.44; r.cyl(1.35, 1.6, h * 0.85, x, 0.8 + h * 0.425, z, s.stone, 8); r.cyl(1.8, 1.45, 0.5, x, 0.8 + h * 0.85, z, s.dark, 8); spire(r, 1.4, 0.8 + h * 0.85 + 0.25, 2.0, f === 'cult' ? s.roof : s.dark, 8); r.em('fire', x, 0.9 + h * 0.85, z, 0.8, s.glow); }
    if (f === 'necro') { r.sph(1.1, 0, 0.8 + ch + 1.3, 0, s.glow, { team: 2 }); r.em('glow', 0, 0.8 + ch + 1.3, 0, 3, s.glow); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; r.cone(0.2, 2.0, Math.cos(a) * cw * 0.55, 0.8 + ch + 0.9, Math.sin(a) * cw * 0.55, s.trim, 4); } }
    else if (f === 'orc') { gable(r, cw, cw, 0.8 + ch + 0.25, 2.6, s.roof, 0.6); r.box(0.2, 3, 0.2, 0, 0.8 + ch + 3, 0, s.wood); r.sph(0.4, 0.2, 0.8 + ch + 4.2, 0, 0xe0d8b8, {}); r.box(0.1, 1.2, 1.8, 0, 0.8 + ch + 3.4, 0.2, 0, { team: 1 }); for (let i = 0; i < 6; i++) r.cone(0.13, 1.4, w * 0.5 + 0.2, 1.4 + i * 1.0, (i % 2 - 0.5) * 4, s.trim, 4, { rz: -1.2 }); }
    else if (f === 'demon') { for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; r.cone(0.4, 3.4, Math.cos(a) * cw * 0.45, 0.8 + ch + 1.5, Math.sin(a) * cw * 0.45, s.dark, 4, { rz: Math.cos(a) * 0.2, rx: -Math.sin(a) * 0.2 }); } r.sph(0.9, 0, 0.8 + ch + 1.1, 0, s.glow, { team: 2 }); r.em('fire', 0, 0.8 + ch + 2.2, 0, 3, s.glow); r.box(w * 0.5, 0.2, 0.3, w * 0.4 + 0.3, 2.4, 0, s.glow, { team: 2 }); }
    else { spire(r, cw * 0.62, 0.8 + ch + 0.25, 4.2, s.roof, 8); r.box(0.2, 1.6, 0.2, 0, 0.8 + ch + 5, 0, s.trim, { team: 2 }); r.box(1.0, 0.2, 0.2, 0, 0.8 + ch + 5.3, 0, s.trim, { team: 2 }); r.em('glow', 0, 0.8 + ch + 5.2, 0, 2.5, s.glow); }
    door(r, w * 0.39 + 0.02, 0.8, 0, 3.2, 3.4, s.dark); r.box(0.15, 2.0, 3.6, w * 0.39 + 0.1, h * 0.5 + 0.8, 0, 0, { team: 1 });
    brazier(r, w * 0.5 + 0.6, 0.8, 2.5, 1.2, s.glow); brazier(r, w * 0.5 + 0.6, 0.8, -2.5, 1.2, s.glow);
    top = h + 7;
  } else if (/^house$|hovel|hut|burrow|cell/.test(t)) {
    r.box(w + 0.3, 0.3, d + 0.3, 0, 0.15, 0, s.plinth); r.box(w, h * 0.55, d, 0, 0.3 + h * 0.275, 0, s.stone);
    roofFor(r, f, s, w, d, 0.3 + h * 0.55, h * 0.5); door(r, w / 2 + 0.02, 0.3, 0, 0.9, 1.6, s.dark); r.box(0.08, 0.35, 0.35, w / 2 + 0.02, h * 0.45, d * 0.28, s.glow, { team: 2 });
    r.box(0.08, 0.7, 0.6, w / 2 + 0.06, h * 0.5, -d * 0.2, 0, { team: 1 });
  } else if (/storehouse|granary|tithe|depot|store|barn/.test(t)) {
    hall(r, f, s, w, d, h);
    for (let i = 0; i < 4; i++) r.cyl(0.3, 0.3, 0.6, w / 2 + 0.7, 0.3, -d * 0.3 + i * 0.5 - 0.3, 0x5a4028, 7, {});
    r.box(0.7, 0.5, 0.7, w / 2 + 0.7, 0.25, d * 0.3, 0x6a5a3a); r.box(0.5, 0.4, 0.5, w / 2 + 0.7, 0.7, d * 0.3, 0x7a6a44);
  } else if (/barracks|war_hall|bone_crypt|chapel|hall|lodge|legion|pit|den|archery|range/.test(t) && !/rift|hellgate|brimstone/.test(t)) {
    const wh = hall(r, f, s, w, d, h);
    if (/archery|range/.test(t)) { for (let i = 0; i < 3; i++) { const z = (i - 1) * d * 0.28; r.cyl(0.42, 0.42, 0.08, w / 2 + 3.2, 1.0, z, 0xd8c8a0, 10, { rz: 1.5708 }); r.box(0.06, 1.0, 0.06, w / 2 + 3.2, 0.5, z, s.wood); r.cyl(0.14, 0.14, 0.09, w / 2 + 3.24, 1.0, z, 0xaa2020, 8, { rz: 1.5708 }); } }
    else { for (let i = 0; i < 2; i++) { r.box(0.08, 1.7, 0.1, w / 2 + 1.4, 1.0, (i ? 1 : -1) * 1.1, 0x5a4028, { rx: i ? 0.12 : -0.12 }); r.box(0.18, 0.5, 0.18, w / 2 + 1.4, 1.9, (i ? 1 : -1) * 1.1, 0x8a8a8e); } }
  } else if (/stable|kennel|mount|stalls?/.test(t)) {
    hall(r, f, s, w, d, h); for (let i = 0; i < 3; i++) r.box(0.1, 1.0, 0.1, w / 2 + 1.6, 0.5, -d * 0.3 + i * d * 0.3, s.wood); r.box(0.1, 0.1, d * 0.62, w / 2 + 1.6, 1.0, 0, s.wood);
  } else if (/forge/.test(t)) {
    hall(r, f, s, w, d, h); r.box(1.6, h + 1.5, 1.6, -w * 0.25, (h + 1.5) / 2, -d * 0.25, s.dark); r.box(2.0, 0.4, 2.0, -w * 0.25, h + 1.5, -d * 0.25, s.dark); r.em('smoke', -w * 0.25, h + 1.9, -d * 0.25, 1.5); r.em('fire', -w * 0.25, h + 1.6, -d * 0.25, 1.2, 0xff8030);
    r.box(1.0, 0.7, 0.6, w / 2 + 1.0, 0.6, d * 0.1, 0x2a2a2e); r.box(1.2, 0.18, 0.7, w / 2 + 1.0, 1.0, d * 0.1, 0x55575c); r.sph(0.3, w / 2 + 1.0, 0.9, -d * 0.2, 0xff7020, { team: 2, w: 5, h: 4 });
  } else if (/workshop|works|foundry|yard/.test(t)) {
    hall(r, f, s, w, d, h); r.box(0.2, 3.2, d * 0.6, w / 2 + 0.05, 1.8, 0, s.dark); r.cyl(0.35, 0.35, d * 0.6, w / 2 + 0.2, 3.3, 0, s.wood, 8, { rx: 1.5708 }); r.box(3, 0.2, 0.7, w / 2 + 1.6, 0.4, 0, s.wood); r.cyl(0.4, 0.4, 0.1, w / 2 + 1.0, 0.45, 1.8, 0x2a2018, 8, { rx: 1.5708 });
  } else if (/market|bazaar|trade/.test(t)) {
    r.box(w + 0.4, 0.2, d + 0.4, 0, 0.1, 0, s.plinth);
    for (let i = 0; i < 3; i++) { const z = (i - 1) * d * 0.32, c = [s.roof, s.trim, s.glow][i]; for (const sx of [-1, 1]) r.box(0.12, 2.4, 0.12, sx * w * 0.38, 1.3, z - 0.9, s.wood); r.box(w * 0.85, 0.12, 2.1, 0, 2.5, z, c, { rz: 0.1 }); r.box(w * 0.7, 0.6, 0.9, 0, 0.5, z, s.wood); r.box(0.6, 0.35, 0.5, -w * 0.15, 1.0, z, 0xd8b24a); r.box(0.45, 0.3, 0.45, w * 0.1, 1.0, z, 0xb04a30); }
  } else if (/farm|pen|pit_f|cellar/.test(t)) {
    r.box(w, 0.3, d, 0, 0.15, 0, s.plinth); r.box(w - 1.0, 0.1, d - 1.0, 0, 0.32, 0, f === 'necro' ? 0x3a4a30 : 0x5a1418, { team: 0 }); r.sph(Math.min(w, d) * 0.28, 0, 0.36, 0, 0x7a1018, { sy: 0.08, team: 2, w: 8, h: 3 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; r.box(0.12, 1.1, 0.12, Math.cos(a) * (w * 0.46), 0.7, Math.sin(a) * (d * 0.46), s.wood); }
  } else return bldRig2(type, f, w, d, h, r, s);
  const g = r.build();
  return { geo: g, emit: r.emit, top };
}
export { flagPole };
