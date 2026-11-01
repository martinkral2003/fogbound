// FOGBOUND: DOMINION client: siege machine rigs (units with role 'siege'). siegeRig(fkey, shortName) -> {rig, scale, top}.
import { Rig } from './models_rts.js';
import { pal } from './rmodel_body.js';

const WOOD = { necro: 0x3a3630, orc: 0x5a4028, demon: 0x241a1c, cult: 0x4a3224 };
function wheel(r, x, z, rad, f) {
  const pv = [x, rad, z];
  r.cyl(rad, rad, 0.12, x, rad, z, 0x2a2018, 10, { part: 6, pv, rx: 1.5708 });
  r.box(rad * 2, 0.08, 0.14, x, rad, z, 0x4a3828, { part: 6, pv }); r.box(0.08, rad * 2, 0.14, x, rad, z, 0x4a3828, { part: 6, pv });
}
function trims(r, f, p, y, len) { // faction-coloured flag/banner + ornaments
  r.box(0.04, 0.9, 0.04, -len * 0.45, y + 0.5, 0, 0x2a2018); r.box(0.03, 0.5, 0.4, -len * 0.45, y + 0.8, 0, 0, { team: 1, part: 5, pv: [-len * 0.45, y + 0.95, 0] });
  if (f === 'necro') r.sph(0.16, len * 0.4, y + 0.3, 0.5, p.bone, { sy: 1.1 });
  if (f === 'orc') for (let i = 0; i < 4; i++) r.cone(0.05, 0.4, len * 0.2 - i * 0.5, y + 0.1, 0.62, 0x9a9a98, 4, { rx: 1.5 });
  if (f === 'demon') r.box(len * 0.8, 0.05, 0.05, 0, y + 0.1, 0.62, p.glow, { team: 2 });
}

export function siegeRig(f, name) {
  const p = pal(f), r = new Rig(), wd = WOOD[f] || WOOD.necro, wd2 = f === 'necro' ? 0x6a665a : f === 'orc' ? 0x7a5a38 : f === 'demon' ? 0x3a2a2e : 0x6a4a34;
  if (/ram/.test(name)) {
    // covered ram on wheels: beam slides (part 7)
    r.box(3.6, 0.2, 1.7, 0, 0.7, 0, wd); r.box(0.2, 1.3, 1.7, 1.5, 1.35, 0, wd2, { rz: -0.1 }); r.box(0.2, 1.3, 1.7, -1.5, 1.35, 0, wd2, { rz: 0.1 });
    r.box(3.4, 0.14, 1.9, 0, 2.15, 0, wd2, { rz: 0 }); r.box(3.2, 0.1, 2.1, 0, 2.28, 0, wd, {}); r.box(3.0, 0.06, 0.2, 0, 2.38, 0, 0, { team: 1 });
    r.box(3.6, 0.28, 0.28, 0.3, 1.35, 0, 0x2a2018, { part: 7, pv: [1.1, 0, 0] }); r.cone(0.26, 0.5, 2.3, 1.35, 0, f === 'demon' ? p.glow : 0x6a6a70, 6, { part: 7, pv: [1.1, 0, 0], rz: -1.5708, team: f === 'demon' ? 2 : 0 });
    if (f === 'orc') r.cone(0.34, 0.55, 2.4, 1.35, 0, 0xb0a890, 6, { part: 7, pv: [1.1, 0, 0], rz: -1.5708 });
    wheel(r, 1.1, 0.95, 0.45, f); wheel(r, 1.1, -0.95, 0.45, f); wheel(r, -1.1, 0.95, 0.45, f); wheel(r, -1.1, -0.95, 0.45, f);
    return { rig: r, scale: 1, top: 3 };
  }
  if (/catapult|trebuchet|mangonel|mortar/.test(name)) {
    const big = /trebuchet/.test(name);
    r.box(3.0, 0.22, 1.4, 0, 0.75, 0, wd); r.box(0.18, 1.0, 1.5, 0.2, 1.3, 0, wd2); r.box(0.18, 1.0, 1.5, -0.4, 1.3, 0, wd2);
    r.box(0.4, 0.3, 1.6, 0.2, 1.85, 0, wd);
    // throwing arm pivoting around the axle
    const pv = [0.2, 1.85, 0];
    r.box(2.8, 0.16, 0.2, -1.1, 1.85, 0.0, 0x6a5238, { part: 8, pv, rz: 0.55 });
    r.cyl(0.38, 0.28, 0.3, -2.3, 2.5, 0, f === 'necro' ? p.bone : wd, 8, { part: 8, pv });
    r.sph(0.3, -2.3, 2.7, 0, f === 'demon' ? p.glow : 0x4a4a4e, { part: 8, pv, team: f === 'demon' ? 2 : 0, w: 6, h: 4 });
    wheel(r, 0.9, 0.85, 0.4, f); wheel(r, -0.9, 0.85, 0.4, f); wheel(r, 0.9, -0.85, 0.4, f); wheel(r, -0.9, -0.85, 0.4, f);
    trims(r, f, p, 1.0, 3.0);
    return { rig: r, scale: big ? 1.3 : 1, top: 3.6 };
  }
  if (/ballista/.test(name)) {
    r.box(1.6, 0.18, 0.9, 0, 0.6, 0, wd); r.box(0.4, 0.7, 0.4, 0, 0.95, 0, wd2);
    r.box(1.8, 0.1, 0.12, 0.2, 1.4, 0, 0x4a3828, { part: 7, pv: [-0.5, 0, 0] }); r.box(0.1, 0.1, 2.0, 0.45, 1.42, 0, 0x3a2c20); r.box(0.02, 0.02, 2.0, 0.28, 1.42, 0, 0xd8d0b0);
    r.cone(0.07, 0.4, 1.3, 1.4, 0, 0xaab0b4, 4, { rz: -1.5708, part: 7, pv: [-0.5, 0, 0] });
    wheel(r, 0, 0.55, 0.32, f); wheel(r, 0, -0.55, 0.32, f); r.box(0.06, 0.5, 0.06, -0.3, 1.7, 0, 0, { team: 1 });
    return { rig: r, scale: 1, top: 2.2 };
  }
  if (/tower/.test(name)) {
    r.box(2.4, 0.3, 2.4, 0, 0.7, 0, wd); r.box(2.0, 3.6, 2.0, 0, 2.6, 0, wd2); r.box(2.4, 0.4, 2.4, 0, 4.6, 0, wd);
    for (let i = 0; i < 4; i++) r.box(0.3, 0.5, 0.3, i % 2 ? 1.05 : -1.05, 5.0, i < 2 ? 1.05 : -1.05, wd2);
    r.box(2.1, 0.12, 1.2, 0.9, 1.5, 0, 0x2a2018, { rz: -0.3 }); r.box(0.06, 1.2, 1.2, 1.05, 3.4, 0, 0, { team: 1 });
    wheel(r, 0.8, 1.2, 0.5, f); wheel(r, 0.8, -1.2, 0.5, f); wheel(r, -0.8, 1.2, 0.5, f); wheel(r, -0.8, -1.2, 0.5, f);
    return { rig: r, scale: 1, top: 6 };
  }
  if (/flame|firethrower/.test(name)) {
    r.box(3.0, 0.22, 1.5, 0, 0.7, 0, wd); r.box(1.6, 1.1, 1.3, -0.5, 1.3, 0, wd2); r.cyl(0.5, 0.5, 1.2, -0.5, 2.2, 0, 0x3a2a2a, 8, { rx: 1.5708 }); r.cyl(0.52, 0.52, 0.12, -0.5, 2.2, 0.62, p.glow, 8, { rx: 1.5708, team: 2 });
    r.cyl(0.12, 0.2, 2.0, 0.9, 1.6, 0, 0x2e2a30, 7, { rz: -1.45 }); r.sph(0.2, 1.9, 1.7, 0, p.glow, { team: 2, w: 6, h: 4 }); r.em('fire', 1.9, 1.7, 0, 0.9, p.glow);
    wheel(r, 0.9, 0.85, 0.4, f); wheel(r, -0.9, 0.85, 0.4, f); wheel(r, 0.9, -0.85, 0.4, f); wheel(r, -0.9, -0.85, 0.4, f); trims(r, f, p, 1.1, 3.0);
    return { rig: r, scale: 1, top: 3 };
  }
  // cannon / hellfire / war-wagon default
  r.box(3.0, 0.22, 1.5, 0, 0.7, 0, wd); r.box(2.6, 0.45, 1.3, -0.2, 1.0, 0, wd2);
  const bar = f === 'demon' ? 0x2e2a30 : 0x44464a;
  r.cyl(0.26, 0.3, 2.0, 0.6, 1.5, 0, bar, 9, { part: 7, pv: [-0.7, 0, 0], rz: -1.35 }); r.cyl(0.34, 0.34, 0.12, 1.45, 1.6, 0, f === 'demon' ? p.glow : 0x8a8a8e, 9, { part: 7, pv: [-0.7, 0, 0], rz: -1.35, team: f === 'demon' ? 2 : 0 });
  wheel(r, 0.9, 0.85, 0.42, f); wheel(r, -0.9, 0.85, 0.42, f); wheel(r, 0.9, -0.85, 0.42, f); wheel(r, -0.9, -0.85, 0.42, f);
  trims(r, f, p, 1.1, 3.0);
  return { rig: r, scale: 1, top: 2.8 };
}
