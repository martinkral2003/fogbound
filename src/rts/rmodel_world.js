// FOGBOUND: DOMINION client: resource node + neutral-site prop models. nodeModel(rtype, name, r), propModel(t). Return {geo, emit, top}.
import { Rig } from './models_rts.js';

const ST = 0x5a5a5e, DK = 0x2a2a2e, WD = 0x4a3a28;
function rng(seed) { let k = seed | 0 || 1; return () => { k = (k * 1103515245 + 12345) & 0x7fffffff; return k / 0x7fffffff; }; }
function deadTree(r, x, z, s, col, cursed) {
  r.cyl(0.14 * s, 0.26 * s, 3.4 * s, x, 1.7 * s, z, col, 6, { rz: (x * 0.13) % 0.12 });
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + x, y = (1.6 + i * 0.5) * s; r.box(0.1 * s, 1.3 * s, 0.1 * s, x + Math.cos(a) * 0.5 * s, y + 0.5 * s, z + Math.sin(a) * 0.5 * s, col, { rx: Math.sin(a) * 0.9, rz: -Math.cos(a) * 0.9 }); }
  if (cursed) r.sph(0.2 * s, x, 3.2 * s, z, 0xb060ff, { team: 2, w: 5, h: 4 });
}
export function nodeModel(rtype, name, rad) {
  const r = new Rig(), rd = rng(Math.round(rad * 10) + rtype.length * 7), cursed = /cursed/i.test(name || '');
  switch (rtype) {
    case 'tree':
      for (let i = 0; i < 9; i++) { const a = rd() * 6.283, d = Math.sqrt(rd()) * rad * 0.8; deadTree(r, Math.cos(a) * d, Math.sin(a) * d, 0.8 + rd() * 0.7, cursed ? 0x3a2a44 : (i % 2 ? 0x4a4036 : 0x3a342c), cursed && i % 3 === 0); }
      for (let i = 0; i < 4; i++) r.box(1.4, 0.3, 0.3, (rd() - 0.5) * rad, 0.2, (rd() - 0.5) * rad, 0x3a2e22, { ry: rd() * 3 });
      if (cursed) r.em('soul', 0, 1, 0, 1, 0xb060ff);
      return { geo: r.build(), emit: r.emit, top: 4 };
    case 'mine': {
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283, d = rad * 0.55; r.cone(1.6 + rd(), 2.2 + rd() * 1.5, Math.cos(a) * d, 1.2, Math.sin(a) * d, i % 2 ? 0x55524e : 0x4a4844, 5, { ry: rd() * 3 }); }
      r.sph(rad * 0.7, 0, 0.7, 0, 0x4c4a46, { sy: 0.8, w: 7, h: 5 });
      r.box(0.3, 2.2, 0.3, rad * 0.45, 1.2, 1.2, WD); r.box(0.3, 2.2, 0.3, rad * 0.45, 1.2, -1.2, WD); r.box(0.3, 0.3, 3, rad * 0.45, 2.3, 0, WD); r.box(0.2, 1.8, 2.2, rad * 0.45 + 0.1, 1.0, 0, 0x0a0a0c);
      for (let i = 0; i < 6; i++) r.box(0.4, 0.4, 0.4, Math.cos(i * 1.1) * rad * 0.5, 0.9 + (i % 3) * 0.5, Math.sin(i * 1.1) * rad * 0.5, 0xe8c040, { team: 2, ry: i, rz: i * 0.5 });
      r.box(1.2, 0.5, 0.8, rad * 0.9, 0.5, -1.6, WD); r.box(0.8, 0.3, 0.6, rad * 0.9, 0.9, -1.6, 0xe8c040, { team: 2 }); r.em('glow', 0, 1.6, 0, 1.0, 0xe8c040);
      return { geo: r.build(), emit: r.emit, top: 4 };
    }
    case 'quarry': {
      for (let i = 0; i < 9; i++) { const a = rd() * 6.283, d = rd() * rad * 0.8, s = 0.8 + rd() * 1.4; r.box(s * 1.4, s * 0.9, s, Math.cos(a) * d, s * 0.45, Math.sin(a) * d, i % 3 ? 0x34343a : 0x44444c, { ry: rd() * 3 }); }
      r.box(rad * 1.6, 0.4, rad * 1.2, 0, 0.2, 0, 0x2a2a30); r.box(0.25, 3.6, 0.25, rad * 0.6, 1.8, 0, WD); r.box(0.25, 0.25, 3.2, rad * 0.6, 3.5, 0, WD); r.box(2.4, 0.2, 0.2, rad * 0.4, 3.5, 0, WD, { rz: 0.4 });
      return { geo: r.build(), emit: r.emit, top: 4 };
    }
    case 'bloodwell': case 'farm': {
      r.cyl(rad * 0.85, rad * 0.95, 0.8, 0, 0.4, 0, 0x4a4244, 10); r.cyl(rad * 0.68, rad * 0.68, 0.1, 0, 0.82, 0, 0x8a0c1c, 10, { team: 2, shade: 0.8 });
      for (let i = 0; i < 4; i++) { const a = i / 4 * 6.283 + 0.4; r.box(0.3, 2.2, 0.3, Math.cos(a) * rad * 0.9, 1.4, Math.sin(a) * rad * 0.9, 0x3a3436, { rx: Math.sin(a) * 0.1, rz: -Math.cos(a) * 0.1 }); r.cone(0.2, 0.5, Math.cos(a) * rad * 0.9, 2.6, Math.sin(a) * rad * 0.9, 0x8a0c1c, 4, { team: 2 }); }
      r.em('glow', 0, 1.0, 0, 1.6, 0xc01828); r.em('smoke', 0, 0.9, 0, 0.8, 0x7a2028);
      return { geo: r.build(), emit: r.emit, top: 3 };
    }
    case 'soulwell': {
      r.cyl(rad * 0.8, rad * 0.9, 0.5, 0, 0.25, 0, 0x2a3434, 10); r.cyl(rad * 0.62, rad * 0.62, 0.08, 0, 0.54, 0, 0x4fe3c1, 10, { team: 2, shade: 0.7 });
      for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; r.box(0.4, 3.0 + (i % 2), 0.4, Math.cos(a) * rad * 0.85, 1.7, Math.sin(a) * rad * 0.85, 0x2c3a3c, { rz: Math.cos(a) * 0.1, rx: -Math.sin(a) * 0.1 }); r.box(0.12, 0.8, 0.45, Math.cos(a) * rad * 0.85 + 0.1, 1.8, Math.sin(a) * rad * 0.85, 0x4fe3c1, { team: 2 }); }
      r.cyl(rad * 0.3, rad * 0.5, 0.1, 0, 3.4, 0, 0x4fe3c1, 8, { team: 2, part: 14, pv: [0, 0, 0] });
      r.em('glow', 0, 1.4, 0, 2.2, 0x4fe3c1); r.em('soul', 0, 0.7, 0, 1, 0x6fe8d0);
      return { geo: r.build(), emit: r.emit, top: 4 };
    }
    case 'herd': {
      r.box(2.2, 0.5, 1.2, 0, 0.3, 0, 0x5a3a32); for (let i = 0; i < 5; i++) r.box(0.08, 0.8, 1.0, -0.8 + i * 0.4, 0.8, 0, 0xe0d8c0, { rx: 0.3 }); r.sph(0.3, 1.3, 0.4, 0.2, 0x8a6a5a);
      return { geo: r.build(), emit: r.emit, top: 1.5 };
    }
    case 'graveyard': default: {
      for (let i = 0; i < 12; i++) { const a = rd() * 6.283, d = rd() * rad * 0.9; r.box(0.3, 0.9 + rd() * 0.5, 0.8, Math.cos(a) * d, 0.5, Math.sin(a) * d, ST, { ry: rd() * 3, rz: (rd() - 0.5) * 0.3 }); }
      r.em('soul', 0, 0.6, 0, 1, 0x6fe8d0);
      return { geo: r.build(), emit: r.emit, top: 2 };
    }
  }
}

export function propModel(t) {
  const r = new Rig();
  switch (t) {
    case 'hut': r.cyl(1.5, 1.7, 1.7, 0, 0.85, 0, 0x6a5a48, 8); r.cone(2.1, 1.7, 0, 2.5, 0, 0x7a6a3a, 8); r.box(0.1, 1.2, 0.8, 1.55, 0.7, 0, DK); r.box(0.06, 0.4, 0.4, 1.6, 1.2, 0.7, 0xffb050, { team: 2 }); r.em('smoke', 0, 3.4, 0, 0.8, 0x6a6a6a); break;
    case 'tent': r.cone(2.0, 2.4, 0, 1.2, 0, 0x8a7a5a, 4, { ry: 0.78 }); r.box(0.06, 1.2, 0.9, 1.3, 0.6, 0, DK, { rz: 0.4 }); r.box(0.06, 0.9, 0.04, 0, 2.7, 0, WD); r.box(0.04, 0.5, 0.5, 0, 3.0, 0.25, 0, { team: 1 }); break;
    case 'banner': r.box(0.1, 4.4, 0.1, 0, 2.2, 0, WD); r.box(0.05, 2.2, 1.2, 0, 3.3, 0.65, 0, { team: 1, part: 5, pv: [0, 4.4, 0] }); r.cone(0.15, 0.4, 0, 4.6, 0, 0xd8b24a, 4); break;
    case 'burnt': r.box(2.6, 0.35, 2.6, 0, 0.15, 0, 0x1c1814); for (let i = 0; i < 6; i++) r.box(0.14, 1.2 + (i % 3) * 0.5, 0.14, Math.cos(i * 1.05) * 1.2, 0.7, Math.sin(i * 1.05) * 1.2, 0x15110e, { rz: (i % 3 - 1) * 0.3, rx: (i % 2 - 0.5) * 0.4 }); r.em('smoke', 0, 1, 0, 1.4, 0x2a2a2a); r.em('ember', 0, 0.4, 0, 1, 0xff6a20); break;
    case 'pillar': r.cyl(0.55, 0.65, 3.4, 0, 1.7, 0, 0x6a6a6e, 8); r.cyl(0.7, 0.7, 0.3, 0, 0.15, 0, 0x5a5a5e, 8); r.box(0.9, 0.3, 0.9, 0, 3.55, 0, 0x5a5a5e, { rz: 0.12 }); break;
    case 'rubble': for (let i = 0; i < 8; i++) { const s = 0.3 + (i % 3) * 0.25; r.box(s * 1.3, s, s, Math.cos(i * 0.8) * 1.0, s * 0.4, Math.sin(i * 0.8) * 1.0, i % 2 ? 0x56565a : 0x46464a, { ry: i, rz: i * 0.2 }); } break;
    case 'grave': r.box(0.3, 1.0, 0.8, 0, 0.5, 0, ST, { rz: 0.06 }); r.cone(0.4, 0.3, 0, 1.1, 0, ST, 4); r.box(1.2, 0.12, 0.6, 0.8, 0.06, 0, 0x2e3228); break;
    case 'altar': r.cyl(1.7, 1.9, 0.5, 0, 0.25, 0, 0x4a4a50, 8); r.box(2.4, 1.0, 1.3, 0, 1.0, 0, 0x56565c); r.box(1.6, 0.06, 0.5, 0, 1.52, 0, 0xa01020, { team: 2 }); r.em('glow', 0, 1.8, 0, 1.6, 0xc01828); break;
    case 'leystone': r.box(0.9, 4.6, 0.9, 0, 2.3, 0, 0x4a4e5a, { rz: 0.05 }); r.cone(0.7, 0.9, 0, 5.0, 0, 0x4a4e5a, 4); r.box(0.06, 2.6, 0.4, 0.46, 2.6, 0, 0x6fa8ff, { team: 2 }); r.box(0.4, 2.0, 0.06, 0, 2.2, 0.46, 0x6fa8ff, { team: 2 }); r.cyl(1.1, 1.3, 0.3, 0, 0.15, 0, 0x3a3e48, 6); r.em('glow', 0, 3.0, 0, 2.2, 0x6fa8ff); r.em('ember', 0, 1.5, 0, 1, 0x6fa8ff); break;
    case 'brazier': r.cyl(0.4, 0.2, 1.1, 0, 0.55, 0, 0x2a2a2c, 6); r.cyl(0.6, 0.4, 0.3, 0, 1.2, 0, 0x3a3a3e, 7); r.sph(0.3, 0, 1.4, 0, 0xff9030, { team: 2, w: 5, h: 4 }); r.em('fire', 0, 1.5, 0, 1.4, 0xff8030); break;
    case 'beacon': r.box(2.4, 0.5, 2.4, 0, 0.25, 0, 0x4a4a50); r.box(1.6, 3.4, 1.6, 0, 2.2, 0, 0x5a5a62); r.box(2.4, 0.4, 2.4, 0, 4.1, 0, 0x3a3a42); r.cyl(0.7, 0.4, 0.5, 0, 4.5, 0, 0x2a2a2c, 7); r.sph(0.3, 0, 4.8, 0, 0xff9030, { team: 2, w: 5, h: 4 }); break;
    case 'shrine': r.box(2.0, 0.4, 2.0, 0, 0.2, 0, 0x5a5a5e); r.box(1.2, 1.4, 1.0, 0, 1.1, 0, 0x6a6a70); r.cone(1.1, 0.9, 0, 2.3, 0, 0x4a3a5a, 4, { ry: 0.78 }); r.sph(0.2, 0, 1.4, 0.55, 0xffe090, { team: 2, w: 5, h: 4 }); r.em('glow', 0, 1.5, 0.5, 1.2, 0xffe090); break;
    case 'throne': r.box(3.2, 0.5, 3.0, 0, 0.25, 0, 0x2a2a30); r.box(1.6, 1.0, 1.6, 0, 1.0, 0, 0x34343c); r.box(0.4, 3.8, 1.8, -0.7, 2.4, 0, 0x2e2e36); for (let i = 0; i < 5; i++) r.cone(0.15, 0.8, -0.7, 4.5, (i - 2) * 0.4, 0xd8d2bc, 4); r.box(0.1, 1.4, 0.5, -0.45, 2.6, 0, 0xc01828, { team: 2 }); r.em('glow', 0, 3.0, 0, 2.5, 0xc01828); break;
    case 'hellgate': r.box(1.0, 5, 1.0, 0, 2.5, 2.2, 0x1c1214); r.box(1.0, 5, 1.0, 0, 2.5, -2.2, 0x1c1214); r.box(1.2, 1.0, 5.6, 0, 5.3, 0, 0x1c1214); r.box(0.1, 4.6, 3.4, 0, 2.4, 0, 0xff5a20, { team: 2, shade: 0.8 }); r.cone(0.4, 1.4, 0, 6.2, 2.2, 0x1c1214, 4); r.cone(0.4, 1.4, 0, 6.2, -2.2, 0x1c1214, 4); r.em('fire', 0, 2.4, 0, 3, 0xff5a20); r.em('ember', 0, 0.6, 0, 1, 0xff5a20); break;
    case 'wagon': r.box(3.6, 0.3, 1.8, 0, 1.0, 0, 0x4a3a28); r.box(3.0, 1.2, 1.7, 0, 1.8, 0, 0x7a6a50); r.cone(1.1, 1.4, 0, 2.9, 0, 0x8a7a5a, 4, { ry: 0.78, sx: 1.9 }); for (const x of [-1.2, 1.2]) for (const z of [-1, 1]) r.cyl(0.55, 0.55, 0.12, x, 0.55, z, 0x2a2018, 8, { rx: 1.5708 }); r.box(0.1, 0.9, 0.5, 1.9, 1.8, 0, 0, { team: 1 }); break;
    case 'bones': r.sph(0.4, 0, 0.3, 0, 0xd8d2bc, { sy: 0.6 }); for (let i = 0; i < 6; i++) r.box(0.08, 0.08, 0.9, Math.cos(i) * 0.7, 0.25, Math.sin(i) * 0.7, 0xd8d2bc, { ry: i * 1.1, rx: 0.2 }); r.box(0.5, 0.4, 0.4, 0.9, 0.2, 0.3, 0xd8d2bc); break;
    case 'deadtree': deadTree(r, 0, 0, 1.3, 0x3a342c, false); break;
    case 'crater': r.cyl(2.8, 2.4, 0.2, 0, 0.06, 0, 0x1a1816, 12); r.cyl(1.6, 1.4, 0.1, 0, 0.14, 0, 0x2a1a10, 10); r.em('ember', 0, 0.4, 0, 1, 0xff6a20); break;
    case 'signpost': r.box(0.15, 2.2, 0.15, 0, 1.1, 0, WD); r.box(1.2, 0.35, 0.08, 0.4, 1.9, 0, 0x6a5a40, { rz: 0.05 }); r.box(1.0, 0.3, 0.08, -0.3, 1.45, 0, 0x6a5a40, { rz: -0.08 }); break;
    case 'cairn': for (let i = 0; i < 5; i++) r.box(1.4 - i * 0.22, 0.38, 1.2 - i * 0.2, 0, 0.2 + i * 0.36, 0, i % 2 ? 0x56565a : 0x484850, { ry: i * 0.6 }); break;
    case 'loot': r.box(0.9, 0.5, 0.6, 0, 0.3, 0, 0x6a4a2c); r.box(0.95, 0.12, 0.65, 0, 0.58, 0, 0x4a3420); r.box(0.2, 0.12, 0.05, 0.45, 0.4, 0, 0xe8c040, { team: 2 }); r.em('glow', 0, 0.6, 0, 1.0, 0xffd060); break;
    case 'relic': r.cone(0.35, 0.7, 0, 1.3, 0, 0xffe090, 4, { team: 2, part: 15, pv: [0, 0, 0] }); r.cone(0.35, 0.7, 0, 0.7, 0, 0xffe090, 4, { team: 2, part: 15, pv: [0, 0, 0], rx: 3.1416 }); r.cyl(0.6, 0.7, 0.2, 0, 0.1, 0, 0x4a4a50, 6); r.em('glow', 0, 1.2, 0, 2.6, 0xffe090); r.em('soul', 0, 1.0, 0, 1, 0xffe090); break;
    case 'temple': { // the Sunken Temple centrepiece: stepped ziggurat, pillar ring, glowing sunken gate
      r.cyl(15, 16, 0.8, 0, 0.4, 0, 0x2e2e34, 12); r.cyl(11, 12.5, 1.6, 0, 1.6, 0, 0x34343c, 12); r.cyl(7.5, 8.6, 1.6, 0, 3.2, 0, 0x3c3c46, 12); r.cyl(4, 5, 1.4, 0, 4.7, 0, 0x44444e, 12);
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; r.cyl(0.8, 0.95, 6.5, Math.cos(a) * 13.5, 3.6, Math.sin(a) * 13.5, 0x4a4a54, 7); r.box(2.0, 0.5, 2.0, Math.cos(a) * 13.5, 7.0, Math.sin(a) * 13.5, 0x3a3a44); }
      r.cyl(2.2, 2.2, 0.15, 0, 5.45, 0, 0x6fe8d0, 14, { team: 2, shade: 0.8, part: 14, pv: [0, 0, 0] });
      for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.785; r.box(1.2, 4, 1.2, Math.cos(a) * 6, 2.0, Math.sin(a) * 6, 0x2e2e36); r.box(0.3, 2.4, 0.3, Math.cos(a) * 6 + 0.5, 2.2, Math.sin(a) * 6, 0xc01828, { team: 2 }); }
      r.em('glow', 0, 6, 0, 8, 0x6fe8d0); r.em('soul', 0, 5.5, 0, 1, 0x6fe8d0);
      return { geo: r.build(), emit: r.emit, top: 12 };
    }
    default: r.box(1, 1, 1, 0, 0.5, 0, 0x777777);
  }
  return { geo: r.build(), emit: r.emit, top: 4 };
}
