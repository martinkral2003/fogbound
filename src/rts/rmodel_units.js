// FOGBOUND: DOMINION client: unit model registry. unitModel(type, role, fkey, def) -> {geo, scale, top, fly?, kind}. Unknown types fall back by keyword then role.
import { Rig } from './models_rts.js';
import { humanoid, quad, flyer, pal } from './rmodel_body.js';
import { siegeRig } from './rmodel_siege.js';

// archetype recipes per faction; each returns a Rig (humanoid etc.)
const RECIPES = {
  necro: {
    melee: (f) => humanoid(f, { head: 'skull', skeleton: true, weapon: 'rust', off: 'shield', cloth: 0x3a3a34 }),
    ranged: (f) => humanoid(f, { head: 'skull', skeleton: true, weapon: 'none', off: 'bow', cloth: 0x34342e }),
    ghoul: (f) => humanoid(f, { head: 'plain', skin: 0x7d8a76, cloth: 0x4a5244, weapon: 'none', bulk: 0.9, hunch: true, skeleton: false }),
    caster: (f) => humanoid(f, { head: 'hood', robe: true, weapon: 'staff', cloth: 0x1c2a2c, cape: 0x0f1c1d }),
    heavy: (f) => humanoid(f, { head: 'skull', skeleton: true, bulk: 1.8, h: 1.15, weapon: 'club', armor: 1, shoulder: 0x8a9a96, cloth: 0x3a403c, pauldronTeam: true }),
    worker: (f) => humanoid(f, { head: 'plain', skin: 0x9aa890, cloth: 0x3a3a34, weapon: 'tool', hunch: true, tabard: false, backpack: true }),
  },
  orc: {
    melee: (f) => humanoid(f, { head: 'orc', bulk: 1.25, weapon: 'axe', off: 'round', cloth: 0x6a4a32, shoulder: 0x4a3a2a, pauldronTeam: true }),
    ranged: (f) => humanoid(f, { head: 'orc', bulk: 1.1, weapon: 'none', off: 'bow', cloth: 0x5a4030 }),
    heavy: (f) => humanoid(f, { head: 'orc', bulk: 1.9, h: 1.2, weapon: 'club', cloth: 0x5a4030, skin: 0x6e7660, shoulder: 0x77777a, pauldronTeam: true }),
    caster: (f) => humanoid(f, { head: 'orc', robe: true, bulk: 1.0, weapon: 'staff', cloth: 0x4a3a2a, cape: 0x2a5a30, horns: true }),
    worker: (f) => humanoid(f, { head: 'orc', bulk: 1.1, weapon: 'tool', tabard: false, backpack: true, cloth: 0x5a4a32 }),
  },
  demon: {
    melee: (f) => humanoid(f, { head: 'demon', bulk: 1.2, weapon: 'greatsword', cloth: 0x2a1c20, armor: 1, metal: 0x2e2a30, pauldronTeam: true, skin: 0x8a2c24 }),
    ranged: (f) => humanoid(f, { head: 'demon', weapon: 'none', off: 'bow', cloth: 0x2a1c20, skin: 0x8a2c24 }),
    caster: (f) => humanoid(f, { head: 'demon', robe: true, weapon: 'staff', cloth: 0x3a1018, cape: 0x1c0a10, skin: 0x8a2c24 }),
    heavy: (f) => humanoid(f, { head: 'demon', bulk: 1.9, h: 1.2, weapon: 'club', cloth: 0x1c1418, skin: 0x7a2a22, armor: 1, metal: 0x2e2a30, shoulder: 0x2e2a30, pauldronTeam: true, horns: true }),
    worker: (f) => humanoid(f, { head: 'demon', skin: 0x7a3a2a, bulk: 0.9, h: 0.9, weapon: 'tool', tabard: false, hunch: true, cloth: 0x2a1c20 }),
  },
  cult: {
    melee: (f) => humanoid(f, { head: 'hood', weapon: 'mace', off: 'shield', cloth: 0x8a1c34, metal: 0x8a8a90 }),
    ranged: (f) => humanoid(f, { head: 'hood', weapon: 'crossbow', cloth: 0x6a1a2c }),
    caster: (f) => humanoid(f, { head: 'hood', robe: true, weapon: 'censer', cloth: 0x8a1c34, cape: 0x5a1226 }),
    heavy: (f) => humanoid(f, { head: 'helm', bulk: 1.6, h: 1.1, weapon: 'greatsword', cloth: 0x6a1a2c, armor: 1, shoulder: 0xd8b24a, pauldronTeam: true }),
    worker: (f) => humanoid(f, { head: 'plain', cloth: 0x9a8a78, weapon: 'tool', tabard: false, hunch: true, backpack: true }),
  },
};
const KEYS = [ // keyword -> [archetype, scale, top, overrides]
  [/rider|raider|cavalry|knight|horse|mount|charger|outrider/, 'rider'], [/wolf|warg|hound|hellhound|dog|boar|beast/, 'hound'], [/imp|gargoyle|bat|harpy|flyer/, 'imp'], [/wraith|banshee|spirit|specter|ghost/, 'ghost'],
  [/ghoul|crawler/, 'ghoul'], [/flagellant|bomber|bomb|sapper|suicide/, 'bomber'], [/priest|healer|cleric|acolyte|inquisitor|zealot/, 'priest'],
  [/shaman|warlock|summoner|witch|lich|mage|sorcer|caster/, 'caster'], [/troll|ogre|golem|giant|brute|behemoth|colossus|hulk|abomin/, 'giant'],
  [/rider|raider|cavalry|knight|horse|mount|boar/, 'rider'], [/worker|thrall|peon|slave|imp_work|serf|pilgrim|acolyte_w/, 'worker'],
  [/ram|catapult|trebuchet|ballista|cannon|wagon|wain|tower|mortar|engine|siege/, 'siege'],
  [/archer|bow|hunter|crossbow|skirm|javelin|spear_?th|reaver|slinger/, 'ranged'], [/general|champion|warchief/, 'general'],
];
const cache = new Map();
const gen = {
  necro: [{ head: 'hood', robe: true, weapon: 'staff', cloth: 0x1c2a2c, cape: 0x0f1c1d, banner: true, scale: 1.5 }, { head: 'helm', armor: 1, bulk: 1.5, weapon: 'greatsword', cloth: 0x20262a, cape: 0x151a22, shoulder: 0x4a525a, banner: true, scale: 1.45 }, { head: 'mask', robe: true, weapon: 'scythe', cloth: 0x3a4a5a, cape: 0x2a3550, banner: true, scale: 1.45 }],
  orc: [{ head: 'horned', bulk: 1.7, weapon: 'axe', off: 'round', cloth: 0x5a4030, skin: 0x5f8a45, cape: 0x6a2a1a, shoulder: 0x77777a, banner: true, scale: 1.55 }, { head: 'orc', bulk: 1.9, weapon: 'greatsword', skin: 0x4a7a3a, armor: 1, banner: true, scale: 1.55 }, { head: 'orc', robe: true, weapon: 'staff', cloth: 0x4a3a2a, cape: 0x2a5a30, horns: true, banner: true, scale: 1.5 }],
  demon: [{ head: 'demon', bulk: 1.5, weapon: 'greatsword', armor: 1, metal: 0x2e2a30, cape: 0x4a0c10, horns: true, banner: true, scale: 1.6 }, { head: 'demon', robe: true, weapon: 'staff', cloth: 0x3a1018, cape: 0x1c0a10, banner: true, scale: 1.5 }, { head: 'demon', bulk: 1.7, weapon: 'axe', armor: 1, metal: 0x3a3238, cape: 0x2a0a0a, banner: true, scale: 1.55 }],
  cult: [{ head: 'crown', robe: true, weapon: 'censer', cloth: 0x8a1c34, cape: 0x5a1226, shoulder: 0xd8b24a, banner: true, scale: 1.5 }, { head: 'helm', armor: 1, bulk: 1.5, weapon: 'greatsword', cloth: 0x6a1a2c, shoulder: 0xd8b24a, cape: 0x5a1226, banner: true, scale: 1.5 }, { head: 'mask', robe: true, weapon: 'whip', cloth: 0x7a1830, cape: 0x4a1020, banner: true, scale: 1.45 }],
};

function shortName(type, fkey) { return String(type).replace(new RegExp('^' + fkey + '_'), '').replace(/^(orc|necro|demon|cult)_/, ''); }

// neutral / wild creatures (team -1): animals, undead camps, trolls, bosses
function wildModel(type, role) {
  const s = String(type).toLowerCase().replace(/^wild_|^wx_/, '');
  const hum = (f, o, scale = 1, top = 2) => ({ rig: humanoid(f, o), scale, top });
  if (/deer/.test(s)) { const r = quad('orc', { color: 0x8a6a48, muzzle: 0x6a4a32, glow: 0x302010, saddle: false, size: 1.05 }); r.cone(0.05, 0.5, 0.55, 1.45, 0.12, 0xd8c8a0, 4, { rx: 0.3 }); r.cone(0.05, 0.5, 0.55, 1.45, -0.12, 0xd8c8a0, 4, { rx: -0.3 }); return { rig: r, scale: 1, top: 1.8 }; }
  if (/boar/.test(s)) return { rig: quad('orc', { color: 0x3a2e28, muzzle: 0x2a201c, glow: 0xff4020, saddle: false, size: 0.95 }), scale: 1, top: 1.5 };
  if (/bear/.test(s)) return { rig: quad('orc', { color: 0x4a3a2c, muzzle: 0x3a2c20, glow: 0xff6030, saddle: false, size: 1.5 }), scale: 1, top: 2.4 };
  if (/wolf|hound|dog/.test(s)) return { rig: quad('necro', { color: 0x5a5650, glow: 0xff4020, saddle: false }), scale: 1, top: 1.6 };
  if (/behemoth/.test(s)) { const r = humanoid('demon', { head: 'horned', bulk: 2.4, h: 1.25, weapon: 'club', skin: 0x4a3a34, cloth: 0x3a2c28, shoulder: 0x2e2a30, horns: true, tabard: false }); return { rig: r, scale: 2.6, top: 4.2 }; }
  if (/king/.test(s)) return hum('necro', { head: 'crown', bulk: 1.8, weapon: 'spear', skin: 0x7a9a96, cloth: 0x203840, cape: 0x14262c, shoulder: 0x3a6a70, tabard: false }, 2.1, 3.4);
  if (/bogbeast|bog/.test(s)) return hum('orc', { head: 'orc', bulk: 2.2, h: 0.9, hunch: true, weapon: 'none', skin: 0x3d4a2c, cloth: 0x3d4a2c, tabard: false }, 1.5, 3);
  if (/troll/.test(s)) return hum('orc', { head: 'orc', bulk: 2.0, h: 1.15, weapon: 'club', skin: 0x6e7660, cloth: 0x5a4a3a, shoulder: 0x555a50, tabard: false }, 1.5, 3.2);
  if (/wraith|ghost|spirit/.test(s)) return { rig: ghostRig('necro'), scale: 1.1, top: 2.8, fly: true };
  if (/ghoul|zombie/.test(s)) return hum('necro', { head: 'plain', skin: 0x7d8a76, cloth: 0x4a5244, weapon: 'none', bulk: 0.95, hunch: true, tabard: false });
  if (/skelarcher|archer/.test(s)) return hum('necro', { head: 'skull', skeleton: true, weapon: 'none', off: 'bow', cloth: 0x34342e, tabard: false });
  if (/skeleton/.test(s)) return hum('necro', { head: 'skull', skeleton: true, weapon: 'rust', off: 'shield', cloth: 0x3a3a34, tabard: false });
  if (/crypt|knight/.test(s)) return hum('necro', { head: 'helm', armor: 1, bulk: 1.3, weapon: 'sword', cloth: 0x2c3036, cape: 0x151a22, shoulder: 0x4a525a, tabard: false }, 1.25, 2.6);
  if (/orcraider|orc/.test(s)) return hum('orc', { head: 'orc', bulk: 1.2, weapon: 'axe', off: 'round', tabard: false });
  if (/militia|villager|peasant/.test(s)) return hum('cult', { head: 'plain', weapon: 'tool', cloth: 0x7a6a50, pants: 0x4a4030, tabard: false });
  if (role === 'heavy') return hum('orc', { head: 'orc', bulk: 1.9, weapon: 'club', tabard: false }, 1.4, 3);
  if (role === 'ranged' || role === 'caster') return hum('necro', { head: 'hood', robe: true, weapon: 'staff', tabard: false });
  if (role === 'beast') return { rig: quad('orc', { color: 0x5a4a3a, saddle: false }), scale: 1, top: 1.6 };
  return hum('orc', { head: 'plain', weapon: 'sword', cloth: 0x5a4a3a, tabard: false });
}
export function unitModel(type, role, fkey, def) {
  const key = type + '|' + role + '|' + fkey;
  let m = cache.get(key);
  if (m) return m;
  if (fkey === 'wild') {
    const w = wildModel(type, role);
    m = { geo: w.rig.build(), scale: w.scale || 1, top: w.top || 2, fly: !!w.fly, kind: 'unit', arch: 'wild' };
    cache.set(key, m); return m;
  }
  const f = fkey || 'necro', short = shortName(type, f), hint = (def && def.model ? String(def.model) : short).toLowerCase();
  const R = RECIPES[f] || RECIPES.necro;
  let arch = null;
  for (const [re, a] of KEYS) if (re.test(hint) || re.test(short)) { arch = a; break; }
  if (!arch) arch = role === 'ranged' ? 'ranged' : role === 'worker' ? 'worker' : role === 'caster' ? 'caster' : role === 'heavy' ? 'giant' : role === 'cavalry' ? 'rider' : role === 'flyer' ? 'imp' : role === 'beast' ? 'hound' : role === 'siege' ? 'siege' : role === 'general' ? 'general' : 'melee';
  if (role === 'general') arch = 'general';
  if (role === 'worker') arch = 'worker';
  let rig, scale = 1, top = 2.0, fly = false, kind = 'unit';
  const p = pal(f);
  switch (arch) {
    case 'melee': rig = (R.melee)(f); top = 2.0; break;
    case 'ranged': rig = (R.ranged)(f); break;
    case 'worker': rig = (R.worker)(f); scale = 0.92; break;
    case 'caster': rig = (R.caster)(f); top = 2.2; break;
    case 'priest': if (/inquisitor/.test(short)) { rig = humanoid(f, { head: 'hat', weapon: 'mace', off: 'book', cloth: 0x1c1418, cape: 0x1c1418, armor: 1, metal: 0x3a3a40, pauldronTeam: true }); top = 2.2; break; } rig = f === 'cult' ? humanoid(f, { head: 'hood', robe: true, weapon: 'censer', cloth: /priest|healer/.test(short) ? 0xe8e0d0 : 0x8a1c34, cape: 0x5a1226, shoulder: 0xd8b24a }) : (R.caster)(f); top = 2.2; break;
    case 'giant': rig = (R.heavy)(f); scale = 1.3; top = 3.4; break;
    case 'ghoul': rig = (R.ghoul || R.melee)(f); scale = 1.0; break;
    case 'bomber': rig = humanoid(f, { head: 'mask', weapon: 'keg', cloth: 0xb8a890, pants: 0x8a7a64, bulk: 0.95, tabard: true, hunch: true }); break;
    case 'hound': rig = quad(f, { color: f === 'demon' ? 0x3a1818 : f === 'necro' ? 0x8a8a7a : f === 'orc' ? 0x5a4a3a : 0x6a4a50, glow: f === 'necro' ? 0x4fe3c1 : 0xff4020, ribs: f === 'necro', horns: f === 'demon', size: /warg|boar/.test(short) ? 1.25 : 1 }); scale = 1.0; top = 1.7; break;
    case 'rider': rig = quad(f, { color: f === 'necro' ? 0xb8b4a0 : f === 'orc' ? 0x5a4a3a : f === 'demon' ? 0x2a1618 : 0x4a3a34, size: 1.3, ribs: f === 'necro', horns: f === 'demon', glow: f === 'cult' ? 0xc43bd6 : 0xff4020, rider: { head: f === 'orc' ? 'orc' : f === 'demon' ? 'demon' : f === 'necro' ? 'skull' : 'hood', weapon: 'spear', skeleton: f === 'necro', cloth: p.cloth } }); scale = 1.1; top = 2.9; break;
    case 'imp': rig = flyer(f, {}); fly = true; scale = 0.85; top = 2.2; break;
    case 'ghost': rig = ghostRig(f); fly = true; scale = 1.1; top = 2.8; break;
    case 'siege': { const s = siegeRig(f, short); rig = s.rig; scale = s.scale || 1; top = s.top || 3; kind = 'siege'; break; }
    case 'general': { const idx = def && def.idx != null ? def.idx : (parseInt((short.match(/general_(\d)/) || [])[1], 10) || 0); const o = (gen[f] || gen.necro)[idx % 3]; rig = humanoid(f, o); scale = o.scale; top = 3.4; kind = 'general'; break; }
    default: rig = (R.melee)(f);
  }
  m = { geo: rig.build(), scale, top, fly, kind, arch };
  cache.set(key, m);
  return m;
}
function ghostRig(f) {
  const p = pal(f), r = new Rig();
  r.cone(0.55, 1.8, 0, 1.2, 0, f === 'necro' ? 0x3a5a66 : p.cloth, 9); r.sph(0.2, 0.05, 2.15, 0, p.dark); r.box(0.05, 0.06, 0.2, 0.22, 2.17, 0, p.glow, { team: 2 });
  r.cone(0.1, 0.9, 0.35, 1.7, 0.4, f === 'necro' ? 0x4a6a76 : p.cloth, 5, { rz: -1.4, part: 3, pv: [0, 1.9, 0.3] });
  r.cone(0.4, 1.0, 0, 0.5, 0, p.glow, 8, { team: 2, shade: 0.5 });
  return r;
}
