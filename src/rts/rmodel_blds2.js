// FOGBOUND: DOMINION client: magic / altar / portal / graveyard buildings, generic fallback, scaffolds and ruins.
import { Rig } from './models_rts.js';
import { gable, spire, brazier, door } from './rmodel_blds.js';

export function bldRig2(type, f, w, d, h, r, s) {
  const t = String(type);
  let top = h;
  if (/sanctum|library|temple|cathedral|great_totem|scriptorium|shrine|spire|wonder|pantheon|obelisk_tower/.test(t)) {
    const big = /cathedral|great|wonder/.test(t), R = Math.min(w, d) / 2;
    r.cyl(R + 0.5, R + 0.8, 0.7, 0, 0.35, 0, s.plinth, 8); r.cyl(R * 0.72, R * 0.8, h * 0.62, 0, 0.7 + h * 0.31, 0, s.stone, 8);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; r.box(0.35, h * 0.55, 0.35, Math.cos(a) * (R * 0.95), 0.7 + h * 0.275, Math.sin(a) * (R * 0.95), s.dark); }
    r.cyl(R * 0.85, R * 0.8, 0.35, 0, 0.7 + h * 0.62, 0, s.dark, 8);
    if (f === 'necro') { r.cone(R * 0.55, h * 0.5, 0, 0.7 + h * 0.62 + h * 0.25, 0, s.stone, 6); r.sph(0.7, 0, 0.7 + h * 1.0, 0, s.glow, { team: 2, w: 8, h: 6 }); r.cyl(R * 0.9, R * 0.9, 0.06, 0, 0.7 + h * 0.85, 0, s.glow, 16, { team: 2, part: 14, pv: [0, 0, 0] }); r.em('glow', 0, 0.7 + h * 1.0, 0, 3.4, s.glow); r.em('soul', 0, 0.7 + h * 1.0, 0, 1, s.glow); }
    else if (f === 'orc') { r.cone(R * 0.85, h * 0.45, 0, 0.7 + h * 0.62 + h * 0.22, 0, s.roof, 8); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; r.cone(0.12, 1.4, Math.cos(a) * R * 0.5, 0.7 + h * 0.62 + h * 0.45, Math.sin(a) * R * 0.5, s.trim, 4); } r.box(0.2, 2.2, 0.2, 0, 0.7 + h * 1.0, 0, s.wood); r.sph(0.45, 0, 0.7 + h * 1.0 + 1.3, 0, 0xe0d8b8, {}); r.sph(0.2, 0, 0.7 + h * 1.0 + 1.3, 0, s.glow, { team: 2 }); r.em('fire', 0, 0.7 + h * 1.0 + 1.6, 0, 1.5, s.glow); }
    else if (f === 'demon') { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; r.cone(0.35, h * 0.9, Math.cos(a) * R * 0.5, 0.7 + h * 0.62 + h * 0.4, Math.sin(a) * R * 0.5, s.dark, 4, { rz: Math.cos(a) * 0.28, rx: -Math.sin(a) * 0.28 }); } r.sph(0.8, 0, 0.7 + h * 0.9, 0, s.glow, { team: 2, w: 8, h: 6 }); r.em('fire', 0, 0.7 + h * 0.9, 0, 3, s.glow); r.cyl(R, R, 0.05, 0, 0.75, 0, s.glow, 16, { team: 2 }); }
    else { spire(r, R * 0.8, 0.7 + h * 0.62, h * 0.55, s.roof, 8); r.box(0.18, 1.7, 0.18, 0, 0.7 + h * 1.17 + 0.8, 0, s.trim, { team: 2 }); r.box(1.0, 0.18, 0.18, 0, 0.7 + h * 1.17 + 1.2, 0, s.trim, { team: 2 }); r.em('glow', 0, 0.7 + h * 1.17 + 1.2, 0, 2.5, s.glow); }
    door(r, R * 0.72, 0.7, 0, 1.6, 2.4, s.dark); r.box(0.1, 1.2, 1.4, R * 0.72 + 0.1, 3.0, 0, 0, { team: 1 });
    brazier(r, R + 0.7, 0.7, 1.5, 1.0, s.glow); brazier(r, R + 0.7, 0.7, -1.5, 1.0, s.glow);
    top = h * 1.4;
  } else if (/altar|cairn|totem|engine|forge_soul|sacrific|skull/.test(t)) {
    const R = Math.min(w, d) / 2;
    r.cyl(R, R + 0.3, 0.5, 0, 0.25, 0, s.plinth, 8); r.cyl(R * 0.6, R * 0.7, 0.6, 0, 0.8, 0, s.stone, 8);
    if (f === 'necro') { for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; r.box(0.3, h * 0.8, 0.3, Math.cos(a) * R * 0.5, 0.5 + h * 0.4, Math.sin(a) * R * 0.5, s.stone, { rz: Math.cos(a) * 0.15, rx: -Math.sin(a) * 0.15 }); } r.sph(0.5, 0, 0.9 + h * 0.5, 0, s.glow, { team: 2, w: 7, h: 5 }); r.em('soul', 0, 1.2, 0, 1, s.glow); r.em('glow', 0, 0.9 + h * 0.5, 0, 2.4, s.glow); }
    else if (f === 'orc') { r.box(0.3, h, 0.3, 0, 0.5 + h / 2, 0, s.wood); for (let i = 0; i < 3; i++) r.sph(0.28, 0, 1.2 + i * 0.9, 0.0, 0xe0d8b8, { sy: 0.9 }); r.sph(0.4, 0, 0.5 + h, 0, s.glow, { team: 2, w: 6, h: 4 }); r.em('fire', 0, 0.9 + h, 0, 1.4, s.glow); }
    else if (f === 'demon') { r.box(R * 1.5, 0.5, R * 1.0, 0, 1.3, 0, s.dark); r.box(R * 1.4, 0.06, R * 0.4, 0, 1.6, 0, s.glow, { team: 2 }); for (let i = 0; i < 4; i++) r.cone(0.2, h * 0.9, (i < 2 ? -1 : 1) * R * 0.7, 0.5 + h * 0.45, (i % 2 ? 1 : -1) * R * 0.5, s.dark, 4); r.em('fire', 0, 1.8, 0, 1.6, s.glow); }
    else { r.box(R * 1.4, 0.7, R * 0.8, 0, 1.3, 0, 0xcfc4b8); r.box(R * 1.1, 0.06, R * 0.6, 0, 1.68, 0, 0x8a0c1c, { team: 2 }); for (const z of [-1, 1]) { r.box(0.15, h, 0.15, R * 0.6, 0.5 + h / 2, z * R * 0.6, s.stone); brazier(r, R * 0.6, 0.5 + h, z * R * 0.6, 0.8, 0xff3050); } r.em('glow', 0, 1.8, 0, 2, 0xff3050); }
    top = h + 2;
  } else if (/graveyard|cemetery|crypt_yard|burial/.test(t)) {
    r.box(w, 0.2, d, 0, 0.1, 0, 0x2c3426);
    for (let i = 0; i < 9; i++) { const x = (i % 3 - 1) * w * 0.28, z = (Math.floor(i / 3) - 1) * d * 0.28; r.box(0.25, 0.9 + (i % 2) * 0.4, 0.7, x, 0.55, z, s.stone, { rz: (i % 3 - 1) * 0.08 }); r.cone(0.12, 0.3, x, 1.1 + (i % 2) * 0.4, z, s.stone, 4); }
    r.box(0.1, 3, 0.1, w * 0.42, 1.5, 0, s.wood); r.box(0.9, 0.1, 0.1, w * 0.42, 2.6, 0, s.wood); r.em('soul', 0, 0.8, 0, 1, s.glow); r.em('smoke', 0, 0.3, 0, 1.5, 0x9ab8b0);
  } else if (/hellgate|rift|portal|brimstone|gate_of/.test(t)) {
    const R = Math.min(w, d) / 2;
    r.cyl(R, R + 0.4, 0.6, 0, 0.3, 0, s.plinth, 8);
    for (const z of [-1, 1]) { r.box(1.0, h, 1.0, 0, 0.6 + h / 2, z * R * 0.8, s.dark); r.cone(0.5, 1.8, 0, 0.6 + h + 0.9, z * R * 0.8, s.dark, 4); }
    r.box(1.1, 1.0, R * 2.1, 0, 0.6 + h, 0, s.dark); r.box(0.1, h * 0.95, R * 1.3, 0, 0.6 + h * 0.5, 0, s.glow, { team: 2, shade: 0.9 }); r.em('fire', 0, 0.6 + h * 0.5, 0, 3, s.glow); r.em('ember', 0, 0.8, 0, 1, s.glow);
    r.cyl(R * 0.9, R * 0.9, 0.05, 0, 0.66, 0, s.glow, 16, { team: 2, part: 14, pv: [0, 0, 0] });
  } else { // generic fallback hall
    r.box(w + 0.4, 0.4, d + 0.4, 0, 0.2, 0, s.plinth); r.box(w, h * 0.6, d, 0, 0.4 + h * 0.3, 0, s.stone); gable(r, w, d, 0.4 + h * 0.6, h * 0.35, s.roof, 0.3);
    door(r, w / 2 + 0.02, 0.4, 0, 1.4, 2, s.dark); r.box(0.1, 0.8, 0.9, w / 2 + 0.06, h * 0.5, d * 0.28, 0, { team: 1 }); brazier(r, w / 2 + 0.7, 0.4, -d * 0.25, 0.7, s.glow);
  }
  return { geo: r.build(), emit: r.emit, top };
}

// scaffold around a building under construction (neutral, team-independent): corner poles, ledgers and planks. Sized w x d x h.
export function scaffoldModel(w, d, h) {
  const r = new Rig(), wood = 0x6a5238, hw = w / 2 + 0.3, hd = d / 2 + 0.3;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) r.box(0.14, h + 0.6, 0.14, sx * hw, (h + 0.6) / 2, sz * hd, wood);
  for (let y = 1.2; y < h; y += 1.6) { r.box(w + 0.6, 0.1, 0.1, 0, y, hd, wood); r.box(w + 0.6, 0.1, 0.1, 0, y, -hd, wood); r.box(0.1, 0.1, d + 0.6, hw, y, 0, wood); r.box(0.1, 0.1, d + 0.6, -hw, y, 0, wood); r.box(w * 0.7, 0.07, 0.5, 0, y + 0.05, hd + 0.2, 0x8a6a44); }
  r.box(0.07, h, 0.07, hw, h / 2, 0, wood, { rz: 0.5 });
  return { geo: r.build(), emit: [], top: h };
}
// ruin heap: rubble + broken wall stubs, sized w x d (deterministic from dims)
export function ruinModel(w, d, h, f, burnt) {
  const r = new Rig(), s = f ? { necro: 0x3c4648, orc: 0x5a4a38, demon: 0x2a2024, cult: 0x5e5654 }[f] : 0x55524e, dark = burnt ? 0x1a1614 : 0x2a2826;
  let k = 7 + Math.round(w + d);
  const rnd = () => { k = (k * 1103515245 + 12345) & 0x7fffffff; return k / 0x7fffffff; };
  r.box(w * 0.95, 0.3, d * 0.95, 0, 0.12, 0, dark);
  for (let i = 0; i < 12 + Math.round(w * d / 8); i++) { const sz = 0.3 + rnd() * 0.9; r.box(sz, sz * 0.7, sz * (0.6 + rnd() * 0.6), (rnd() - 0.5) * w * 0.85, sz * 0.3 + 0.2, (rnd() - 0.5) * d * 0.85, i % 3 ? s : dark, { ry: rnd() * 3, rz: (rnd() - 0.5) * 0.5, rx: (rnd() - 0.5) * 0.5 }); }
  for (let i = 0; i < 3; i++) r.box(0.5, Math.min(h * 0.5, 1.2 + rnd() * 1.5), 0.5, (rnd() - 0.5) * w * 0.7, 0.6, (rnd() - 0.5) * d * 0.7, s, { rz: (rnd() - 0.5) * 0.3 });
  for (let i = 0; i < 4; i++) r.box(0.12, 1.4 + rnd(), 0.12, (rnd() - 0.5) * w * 0.8, 0.7, (rnd() - 0.5) * d * 0.8, 0x2a2018, { rz: (rnd() - 0.5) * 0.9, rx: (rnd() - 0.5) * 0.7 });
  r.em('smoke', 0, 0.8, 0, 1.4, 0x3a3a3a);
  return { geo: r.build(), emit: r.emit, top: 1.5 };
}
